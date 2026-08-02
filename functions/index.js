const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { validateGeminiRequest, validateOcrRequest } = require("./lib/validation");
const { deliverNotification } = require("./services/notification-service");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("crypto");
const {
  queueDashboardRefresh,
  refreshAllLinkedDashboards,
  verifyInternalRequest,
} = require("./dashboard/service");
const {
  createMirrorHandler,
  isExpiredSyncEvent,
  isSyncOnlyMutation,
} = require("./sync/firestore-mirror");
const { resolveTomatoDataOwnerId } = require("./dashboard/owner");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Groq API 키 — Gemini quota 초과/transient 에러 시 fallback provider.
// 설정: firebase functions:secrets:set GROQ_API_KEY
// 미설정 시 fallback 비활성 (기존 Gemini-only 동작 유지).
const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
const BUDGET_FIREBASE_SERVICE_ACCOUNT = defineSecret("BUDGET_FIREBASE_SERVICE_ACCOUNT");
const DASHBOARD_INTERNAL_HMAC = defineSecret("DASHBOARD_INTERNAL_HMAC");
const TOMATO_SYNC_PEER_SERVICE_ACCOUNT = defineSecret("TOMATO_SYNC_PEER_SERVICE_ACCOUNT");
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Groq vision-capable model (Llama 4 Scout) — 이미지 입력 포함 요청 시 사용.
// 텍스트 전용 요청은 기존 GROQ_MODEL 유지.
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const OCR_MONTHLY_LIMIT = 990;

/**
 * _notifications 컬렉션에 문서가 생성될 때 FCM 푸시 발송
 * 모든 알림 타입(댓글, 좋아요, 방명록, 공지 등)을 하나의 트리거로 처리
 */
exports.sendPushOnNotification = onDocumentCreated(
  "_notifications/{notifId}",
  async (event) => {
    const data = event.data?.data();
    return deliverNotification({ db: getFirestore(), messaging: getMessaging(), data });
  }
);

function currentFirebaseProjectId() {
  const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").trim();
  if (projectId) return projectId;
  try {
    const configured = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
    if (configured.projectId) return String(configured.projectId);
  } catch {}
  throw new Error("Firebase runtime project id is unavailable for Tomato peer sync");
}

const TOMATO_SYNC_TRIGGER_OPTIONS = {
  region: "asia-northeast3",
  retry: true,
  secrets: [TOMATO_SYNC_PEER_SERVICE_ACCOUNT],
};

// Retry stays on for the mirror (dropping a first failure silently diverges
// the two projects and nothing reconciles them later), but each event gets a
// bounded window instead of Eventarc's full 24h: past it the event is acked
// with an error log so a sustained peer-project quota exhaustion cannot turn
// every write in the database into a day-long redelivery storm.
const TOMATO_SYNC_MAX_EVENT_AGE_MS = 6 * 60 * 60 * 1000;

function mirrorTomatoDocument(event) {
  if (isExpiredSyncEvent(event.time, Date.now(), TOMATO_SYNC_MAX_EVENT_AGE_MS)) {
    console.error("[tomatoSync] abandoning redelivery past max event age", {
      eventTime: event.time,
      path: event.data?.after?.ref?.path || event.data?.before?.ref?.path || null,
    });
    return { state: "abandoned-expired-retry" };
  }
  return createMirrorHandler({
    sourceDb: getFirestore(),
    sourceProjectId: currentFirebaseProjectId(),
    peerServiceAccountValue: () => TOMATO_SYNC_PEER_SERVICE_ACCOUNT.value(),
  })(event);
}

// Keep the paths explicit: Firestore event patterns must end at a document and
// do not observe subcollections automatically. The handler itself rejects
// operational collections such as FCM tokens and notifications.
exports.syncTomatoUserDocument = onDocumentWritten(
  { ...TOMATO_SYNC_TRIGGER_OPTIONS, document: "users/{ownerId}/{collectionId}/{documentId}" },
  mirrorTomatoDocument,
);
exports.syncTomatoNestedDocument = onDocumentWritten(
  { ...TOMATO_SYNC_TRIGGER_OPTIONS, document: "users/{ownerId}/{collectionId}/{documentId}/{nestedCollectionId}/{nestedDocumentId}" },
  mirrorTomatoDocument,
);
exports.syncTomatoSharedDocument = onDocumentWritten(
  { ...TOMATO_SYNC_TRIGGER_OPTIONS, document: "{collectionId}/{documentId}" },
  mirrorTomatoDocument,
);

// retry stays off: a 2026-07 Firestore quota exhaustion on the budget project
// turned every dashboard-trigger failure into an Eventarc retry storm (82k
// invocations / ~19,146원 CPU billing over two weeks) because each retry hit
// the same exhausted quota and failed again. A dropped refresh here is safe —
// the next real write bumps requestedRevision and reprocesses it, and
// dashboardDailyRefresh reconciles every linked owner within 24h regardless.
const DASHBOARD_TRIGGER_OPTIONS = {
  region: "asia-northeast3",
  retry: false,
  secrets: [BUDGET_FIREBASE_SERVICE_ACCOUNT],
};

function _queueDashboardSourceChange(event, reason) {
  // The peer mirror stamps __tomatoSync back onto every source document it
  // forwards, which re-fires these triggers with an unchanged payload. Without
  // this guard every real write costs two full dashboard rebuilds (and two
  // budget-project job transactions), which is what pushed the budget project
  // into the 2026-07 quota exhaustion in the first place.
  const before = event.data?.before;
  const after = event.data?.after;
  if (before?.exists && after?.exists && isSyncOnlyMutation(before.data(), after.data())) {
    return { state: "ignored-sync-marker" };
  }
  return queueDashboardRefresh({
    tomatoDb: getFirestore(),
    serviceAccountValue: BUDGET_FIREBASE_SERVICE_ACCOUNT.value(),
    ownerId: event.params.ownerId,
    reason,
  });
}

exports.dashboardOnWorkoutWritten = onDocumentWritten(
  { ...DASHBOARD_TRIGGER_OPTIONS, document: "users/{ownerId}/workouts/{dateKey}" },
  (event) => _queueDashboardSourceChange(event, "tomato-workout"),
);

exports.dashboardOnSettingWritten = onDocumentWritten(
  { ...DASHBOARD_TRIGGER_OPTIONS, document: "users/{ownerId}/settings/{settingId}" },
  (event) => _queueDashboardSourceChange(event, "tomato-setting"),
);

exports.dashboardOnBodyCheckinWritten = onDocumentWritten(
  { ...DASHBOARD_TRIGGER_OPTIONS, document: "users/{ownerId}/body_checkins/{checkinId}" },
  (event) => _queueDashboardSourceChange(event, "tomato-body-checkin"),
);

exports.dashboardOnExerciseWritten = onDocumentWritten(
  { ...DASHBOARD_TRIGGER_OPTIONS, document: "users/{ownerId}/exercises/{exerciseId}" },
  (event) => _queueDashboardSourceChange(event, "tomato-exercise"),
);

exports.dashboardRefresh = onRequest(
  {
    region: "asia-northeast3",
    cors: false,
    secrets: [BUDGET_FIREBASE_SERVICE_ACCOUNT, DASHBOARD_INTERNAL_HMAC],
  },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
    if (!verifyInternalRequest(req, DASHBOARD_INTERNAL_HMAC.value())) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const ownerId = String(req.body?.ownerId || "").trim();
    const budgetUid = String(req.body?.budgetUid || "").trim() || null;
    if (!ownerId) return res.status(400).json({ ok: false, error: "ownerId is required" });
    try {
      const result = await queueDashboardRefresh({
        tomatoDb: getFirestore(),
        serviceAccountValue: BUDGET_FIREBASE_SERVICE_ACCOUNT.value(),
        ownerId,
        budgetUid,
        reason: String(req.body?.reason || "remote-refresh").slice(0, 80),
      });
      return res.json({ ok: true, result });
    } catch (error) {
      console.error("[dashboardRefresh]", error);
      return res.status(500).json({ ok: false, error: "dashboard-refresh-failed" });
    }
  },
);

exports.dashboardDailyRefresh = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: [BUDGET_FIREBASE_SERVICE_ACCOUNT],
  },
  () => refreshAllLinkedDashboards({
    tomatoDb: getFirestore(),
    serviceAccountValue: BUDGET_FIREBASE_SERVICE_ACCOUNT.value(),
  }),
);

// ── 주간 랭킹 공통 로직 ─────────────────────────────────────────────

function _isActiveDay(workoutData) {
  if (!workoutData) return false;
  const w = workoutData;
  if ((w.exercises || []).length > 0) return true;
  if (w.cf || w.swimming || w.running || w.stretching) return true;
  if ((w.muscles || []).length > 0) return true;
  if ((w.workoutDuration || 0) > 0) return true;
  if ((w.runDistance || 0) > 0) return true;
  if ((w.runDurationMin || 0) > 0) return true;
  if ((w.runDurationSec || 0) > 0) return true;
  if ((w.cfDurationMin || 0) > 0) return true;
  if ((w.cfDurationSec || 0) > 0) return true;
  if ((w.cfWod || "").toString().trim()) return true;
  if ((w.stretchDuration || 0) > 0) return true;
  if ((w.swimDistance || 0) > 0) return true;
  if ((w.swimDurationMin || 0) > 0) return true;
  if ((w.swimDurationSec || 0) > 0) return true;
  if ((w.swimStroke || "").toString().trim()) return true;
  if (w.bKcal || w.lKcal || w.dKcal) return true;
  if (w.sKcal) return true;
  if ((w.bFoods || []).length || (w.lFoods || []).length || (w.dFoods || []).length) return true;
  if ((w.sFoods || []).length) return true;
  if (w.breakfast || w.lunch || w.dinner) return true;
  if (w.snack) return true;
  if (w.bPhoto || w.lPhoto || w.dPhoto || w.sPhoto || w.workoutPhoto) return true;
  if (w.workoutPhoto) return true;
  return false;
}

async function _resolveActiveDaysForAccount(db, account, weekKeys) {
  const ownerId = await resolveTomatoDataOwnerId(db, account?.id);
  if (!ownerId) return 0;
  const dayResults = await Promise.allSettled(
    weekKeys.map((dk) => db.doc(`users/${ownerId}/workouts/${dk}`).get())
  );
  let activeDays = 0;
  for (const r of dayResults) {
    if (r.status === "fulfilled" && r.value.exists) {
      if (_isActiveDay(r.value.data())) activeDays++;
    }
  }
  return activeDays;
}

function _normalizeGuildId(value) {
  return String(value || "").trim();
}

async function _computeRanking() {
  const db = getFirestore();

  // 1. 모든 계정 조회
  const accountsSnap = await db.collection("_accounts").get();
  const accounts = [];
  accountsSnap.forEach((d) => {
    accounts.push({ id: d.id, ...d.data() });
  });
  const uniqueAccounts = accounts.filter((account) => !/\(guest\)$/.test(account.id));

  // 2. 이번 주 월~일 dateKey 계산 (KST = UTC+9)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = nowKST.getUTCDay() || 7; // 월=1 ... 일=7
  const monday = new Date(nowKST);
  monday.setUTCDate(nowKST.getUTCDate() - dayOfWeek + 1);

  const weekKeys = [];
  const pad = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    weekKeys.push(
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    );
  }
  const weekStart = weekKeys[0]; // monday ISO

  // 3. 유저별 활동일 수 계산 (10명씩 배치)
  const batchSize = 10;
  const rankings = [];

  for (let b = 0; b < uniqueAccounts.length; b += batchSize) {
    const batch = uniqueAccounts.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (account) => {
        const activeDays = await _resolveActiveDaysForAccount(db, account, weekKeys);
        const name =
          account.nickname || account.firstName || account.id;
        return { userId: account.id, name, activeDays };
      })
    );
    rankings.push(...batchResults);
  }

  // 4. 활동일 > 0 필터, 내림차순 정렬
  const filtered = rankings
    .filter((r) => r.activeDays > 0)
    .sort((a, b) => b.activeDays - a.activeDays);

  // 5. Firestore에 기록
  await db.doc("_weekly_ranking/current").set({
    updatedAt: Date.now(),
    weekStart,
    rankings: filtered,
  });

  // 6. 길드 랭킹 계산
  try {
    const guildsSnap = await db.collection("_guilds").get();
    const guildMap = {};
    guildsSnap.forEach((d) => {
      const normalizedId = _normalizeGuildId(d.id);
      guildMap[normalizedId] = { ...d.data(), members: [] };
    });

    // accounts 전체(guest 포함)로 길드 멤버 매핑 — 중복 방지
    const addedGuildMembers = new Set();
    for (const account of accounts) {
      const canonicalId = String(account.id || "").replace(/\(guest\)$/, "").trim();
      const userGuilds = (account.guilds || []).map(_normalizeGuildId).filter(Boolean);
      const userRank = rankings.find((r) => r.userId === canonicalId || r.userId === account.id);
      const activeDays = userRank ? userRank.activeDays : 0;
      for (const guildId of userGuilds) {
        const memberKey = `${canonicalId}::${guildId}`;
        if (guildMap[guildId] && !addedGuildMembers.has(memberKey)) {
          addedGuildMembers.add(memberKey);
          guildMap[guildId].members.push({
            userId: account.id,
            name:
              userRank?.name || account.nickname || account.firstName || account.id,
            activeDays,
          });
        } else if (guildId && !guildMap[guildId]) {
          console.log(`[GuildRanking] unmatched guild mapping account=${account.id} guild="${guildId}"`);
        }
      }
    }

    const guildRankings = Object.entries(guildMap)
      .filter(([, g]) => g.members.length > 0)
      .map(([guildId, g]) => ({
        guildId,
        guildName: g.name,
        memberCount: g.members.length,
        totalActiveDays: g.members.reduce((s, m) => s + m.activeDays, 0),
        avgActiveDays: +(
          g.members.reduce((s, m) => s + m.activeDays, 0) / g.members.length
        ).toFixed(1),
        members: g.members.sort((a, b) => b.activeDays - a.activeDays),
      }))
      .sort((a, b) => b.avgActiveDays - a.avgActiveDays);

    await db.doc("_weekly_guild_ranking/current").set({
      updatedAt: Date.now(),
      weekStart,
      rankings: guildRankings,
    });

    console.log(
      `[GuildRanking] ${guildRankings.length} guilds ranked`
    );
  } catch (guildErr) {
    console.warn("[GuildRanking] error:", guildErr);
  }

  console.log(
    `[WeeklyRanking] ${filtered.length} ranked users, weekStart=${weekStart}`
  );
  return { ranked: filtered.length, weekStart };
}

// 매시간 자동 실행
exports.computeWeeklyRanking = onSchedule("every 1 hours", async () => {
  await _computeRanking();
});

// refreshWeeklyRanking(무인증 공개 HTTP 수동 새로고침)은 제거됨: 저장소 어디에도
// 호출자가 없고(클라이언트는 _weekly_ranking/current 문서를 직접 읽음), 호출당
// 전체 계정 × 7일치 문서를 읽는 무인증 엔드포인트라 외부 반복 호출만으로 읽기
// 쿼터를 소진시킬 수 있는 비용 노출면이었다. 갱신은 위 스케줄러가 담당한다.

// ── Groq fallback helper (OpenAI-호환 chat completions) ──────────────
// Gemini가 quota/5xx로 실패했을 때 호출.
// 텍스트 요청 → llama-3.3-70b-versatile, 이미지 포함 요청 → llama-4-scout (vision).
// Gemini parts 형식({text} / {inlineData:{mimeType,data}})을
// OpenAI content 배열({type:"text"|"image_url"})로 변환한다.
async function _callGroqFallback(parts, maxOutputTokens, wantJSON) {
  const key = GROQ_API_KEY.value();
  if (!key) {
    const err = new Error("GROQ_API_KEY secret 미설정");
    err.code = "GROQ_NO_KEY";
    throw err;
  }
  const hasImage = Array.isArray(parts) && parts.some((p) => p?.inlineData);
  const model = hasImage ? GROQ_VISION_MODEL : GROQ_MODEL;

  // messages[0].content 구성
  // - 텍스트 전용: 기존대로 flatten 문자열
  // - 이미지 포함: OpenAI vision 스펙에 맞춰 content 배열로 변환
  let content;
  if (hasImage) {
    content = [];
    for (const p of parts || []) {
      if (p?.text) {
        content.push({ type: "text", text: p.text });
      } else if (p?.inlineData?.data) {
        const mime = p.inlineData.mimeType || "image/jpeg";
        const dataUrl = `data:${mime};base64,${p.inlineData.data}`;
        content.push({
          type: "image_url",
          image_url: { url: dataUrl },
        });
      }
    }
    if (content.length === 0) {
      const err = new Error("Groq vision: 유효한 parts 없음");
      err.code = "GROQ_EMPTY_PARTS";
      throw err;
    }
  } else {
    content = (parts || [])
      .map((p) => p?.text || "")
      .filter(Boolean)
      .join("\n\n");
  }

  const body = {
    model,
    messages: [{ role: "user", content }],
    max_tokens: Math.min(maxOutputTokens || 2000, 8000),
    temperature: 0.6,
  };
  if (wantJSON) body.response_format = { type: "json_object" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = data?.error?.message || `Groq HTTP ${r.status}`;
    const err = new Error(msg);
    err.code = r.status === 429 ? "GROQ_QUOTA" : "GROQ_HTTP";
    err.status = r.status;
    err.model = model;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const err = new Error("Groq 응답 empty");
    err.code = "GROQ_EMPTY";
    err.model = model;
    throw err;
  }
  console.log(`[Groq] success model=${model} hasImage=${hasImage} len=${text.length}`);
  return text;
}

// Gemini 응답이 quota/rate-limit 계열인지 판정 (fallback trigger).
function _isGeminiQuotaOrTransient(res, data) {
  if (res && (res.status === 429 || res.status === 503 || res.status === 500)) return true;
  const msg = (data?.error?.message || "").toLowerCase();
  if (/quota|rate.?limit|exceeded|resource_exhausted|try again later/.test(msg)) return true;
  const status = (data?.error?.status || "").toUpperCase();
  if (status === "RESOURCE_EXHAUSTED" || status === "UNAVAILABLE" || status === "DEADLINE_EXCEEDED") return true;
  return false;
}

exports.geminiProxy = onCall(
  {
    secrets: [GEMINI_API_KEY, GROQ_API_KEY],
    enforceAppCheck: true,
    region: "asia-northeast3",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    let validated;
    try {
      validated = validateGeminiRequest(request.data);
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }
    const { parts, generationConfig, wantJSON } = validated;

    const _fnStart = Date.now();

    // Gemini → Groq 공통 fallback 래퍼 — 사유 메시지와 함께 호출.
    const _fallbackToGroq = async (reason) => {
      try {
        console.warn(`[geminiProxy] Gemini 실패 (${reason}) → Groq fallback 시도`);
        const groqText = await _callGroqFallback(parts, generationConfig.maxOutputTokens, wantJSON);
        _bumpApiUsage("gemini_proxy_groq_fallback");
        console.log("[geminiProxy] Groq fallback 성공", { length: groqText.length });
        return { text: groqText, provider: "groq" };
      } catch (groqErr) {
        console.error("[geminiProxy] Groq fallback 실패:", groqErr?.code, groqErr?.message);
        // 둘 다 실패 → 명시적 quota 에러로 클라이언트에 전달
        throw new HttpsError(
          "resource-exhausted",
          `AI 제공자 모두 실패: gemini(${reason}) + groq(${groqErr?.code || groqErr?.message})`
        );
      }
    };

    const _callOnce = async () => {
      const t0 = Date.now();
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig,
          }),
        }
      );
      const d = await r.json().catch(() => null);
      return { r, d, ms: Date.now() - t0 };
    };

    let res, data, firstMs = 0;
    try {
      const first = await _callOnce();
      res = first.r;
      data = first.d;
      firstMs = first.ms;
    } catch (err) {
      console.error("[geminiProxy] fetch failed:", err);
      // 네트워크 레벨 실패도 transient로 간주 → Groq 시도
      return await _fallbackToGroq(`network: ${err?.message || err}`);
    }

    if (!data) {
      // 응답 파싱 불가 → transient로 간주
      return await _fallbackToGroq(`empty-response status=${res?.status}`);
    }

    if (!res.ok || data?.error) {
      console.error("[geminiProxy] Gemini API error:", {
        status: res.status,
        error: data?.error || null,
      });
      // quota/rate-limit/5xx만 fallback (400 Bad Request 등 클라 에러는 그대로 전파)
      if (_isGeminiQuotaOrTransient(res, data)) {
        return await _fallbackToGroq(
          `${res.status}:${data?.error?.status || ""}:${(data?.error?.message || "").slice(0, 80)}`
        );
      }
      throw new HttpsError("internal", data?.error?.message || "Gemini 호출에 실패했습니다.");
    }

    const _extractText = (d) =>
      (d?.candidates?.[0]?.content?.parts || [])
        .map((part) => part?.text || "")
        .join("")
        .trim();

    let text = _extractText(data);

    const _looksLikeJSON = (s) => {
      const t = s.replace(/^```(?:json)?\s*/i, "").trim();
      return t.startsWith("{") || t.startsWith("[");
    };

    // wantJSON은 상단에서 이미 선언됨 (Groq fallback에서도 사용).
    if (wantJSON && text && !_looksLikeJSON(text)) {
      console.warn("[geminiProxy] non-JSON response, retrying once:", {
        head: text.substring(0, 120),
        finishReason: data?.candidates?.[0]?.finishReason || null,
      });
      const retryParts = [
        ...parts,
        { text: "\n\nReturn ONLY a valid JSON object. No prose, no markdown, no code fences." },
      ];
      try {
        const retry = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: retryParts }],
              generationConfig,
            }),
          }
        );
        const retryData = await retry.json().catch(() => null);
        if (retry.ok && retryData) {
          const retryText = _extractText(retryData);
          if (retryText && _looksLikeJSON(retryText)) {
            text = retryText;
            data = retryData;
          }
        }
      } catch (err) {
        console.warn("[geminiProxy] retry failed:", err?.message || err);
      }
    }

    if (!text) {
      console.error("[geminiProxy] empty response:", JSON.stringify(data));
      throw new HttpsError("internal", "Gemini 응답이 비어 있습니다.");
    }

    const candidate = data?.candidates?.[0] || {};
    console.log("[geminiProxy] response preview:", {
      responseMimeType: generationConfig.responseMimeType || null,
      maxOutputTokens: generationConfig.maxOutputTokens,
      length: text.length,
      head: text.substring(0, 200),
      finishReason: candidate.finishReason || null,
      usageMetadata: data?.usageMetadata || null,
      timings: { firstFetchMs: firstMs, totalMs: Date.now() - _fnStart },
    });

    _bumpApiUsage("gemini_proxy");
    return { text, provider: "gemini" };
  }
);

// ── Cloud Vision OCR 프록시 ─────────────────────────────────────
// 월 무료 1000장의 soft cap을 990으로 설정. 초과분은 클라가 Gemini 이미지 fallback.
// Auth 체크 없음 — 이 앱은 Firebase Auth 미사용 (accounts 컬렉션 커스텀 계정). App Check만으로 익명 차단.
let _visionClient = null;
const _getVisionClient = () => {
  if (_visionClient) return _visionClient;
  const { ImageAnnotatorClient } = require("@google-cloud/vision");
  _visionClient = new ImageAnnotatorClient();
  return _visionClient;
};

const _ocrQuotaKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// 일별 API 사용량 집계 (어드민 대시보드용) — 블로킹하지 않는 fire-and-forget
// KST 기준 일자 키 (UTC+9). 어드민이 "오늘 사용량"을 직관적으로 읽을 수 있게 함.
const _apiUsageKey = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const _bumpApiUsage = (field) => {
  try {
    const db = getFirestore();
    db.collection("_apiUsage")
      .doc(_apiUsageKey())
      .set(
        { [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      )
      .catch((err) => console.warn("[apiUsage] bump failed:", field, err?.message || err));
  } catch (err) {
    console.warn("[apiUsage] bump exception:", field, err?.message || err);
  }
};

exports.ocrProxy = onCall(
  {
    enforceAppCheck: true,
    region: "asia-northeast3",
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (request) => {
    let validated;
    try {
      validated = validateOcrRequest(request.data);
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }
    const { imageBase64 } = validated;

    const db = getFirestore();
    const monthKey = _ocrQuotaKey();
    const quotaRef = db.collection("_ocrQuota").doc(monthKey);

    // 트랜잭션으로 pre-increment: Vision 호출 전에 슬롯을 확보 (race-safe).
    // 990 도달 시 즉시 resource-exhausted. 슬롯 확보 실패 시 여기서 차단.
    let reservedCount;
    try {
      reservedCount = await db.runTransaction(async (tx) => {
        const snap = await tx.get(quotaRef);
        const used = snap.exists ? (snap.data().count || 0) : 0;
        if (used >= OCR_MONTHLY_LIMIT) {
          throw new HttpsError(
            "resource-exhausted",
            "monthly-ocr-quota-exhausted",
            { month: monthKey, used, limit: OCR_MONTHLY_LIMIT }
          );
        }
        tx.set(
          quotaRef,
          { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        return used + 1;
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("[ocrProxy] quota reserve failed:", err?.message || err);
      throw new HttpsError("internal", "쿼터 확인 실패");
    }

    const t0 = Date.now();
    let result;
    try {
      const client = _getVisionClient();
      [result] = await client.documentTextDetection({
        image: { content: imageBase64 },
      });
    } catch (err) {
      // Vision 호출 실패 → 예약했던 슬롯 환불 (best-effort)
      try {
        await quotaRef.set({ count: FieldValue.increment(-1) }, { merge: true });
      } catch (_) { /* 환불 실패해도 조용히 — 다음 달 리셋 */ }
      console.error("[ocrProxy] Vision error:", err?.message || err);
      throw new HttpsError("internal", "Vision 호출 실패: " + (err?.message || "unknown"));
    }

    const text = result?.fullTextAnnotation?.text || "";
    const fetchMs = Date.now() - t0;

    console.log("[ocrProxy] ok", {
      month: monthKey,
      reservedCount,
      textLength: text.length,
      fetchMs,
    });

    _bumpApiUsage("ocr_proxy");
    return {
      text,
      month: monthKey,
      usedAfter: reservedCount,
      limit: OCR_MONTHLY_LIMIT,
    };
  }
);

const RENEWD_AUTH_USER = "joonsoo";
const RENEWD_AUTH_SALT = "renewd-local-gate-v1";
const RENEWD_AUTH_HASH = "73172ab99dd1c2d57380bd78e77c85c113418e1dc64797fdb29f2902be6f1eb4";
const RENEWD_DATABASE_ID = "renewd-clinic";
const RENEWD_INSTANCE_ID = "clinic-main";
const RENEWD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RENEWD_READ_COLLECTIONS = [
  "patients",
  "visits",
  "bodyCompositions",
  "reports",
  "payments",
  "photos",
  "appointments",
  "messages",
  "careTasks",
  "actionTemplates",
  "sourceRecords",
  "patientAliases",
  "dataQualityIssues",
  "imports",
];
const RENEWD_WRITE_COLLECTIONS = [
  "patients",
  "visits",
  "bodyCompositions",
  "reports",
  "payments",
  "photos",
  "appointments",
  "messages",
  "careTasks",
  "actionTemplates",
];

function _renewdHash(loginId, password) {
  return crypto
    .createHash("sha256")
    .update(`${RENEWD_AUTH_SALT}:${String(loginId || "").trim()}:${String(password || "")}`)
    .digest("hex");
}

function _renewdSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function _renewdCreateSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    u: RENEWD_AUTH_USER,
    e: Date.now() + RENEWD_SESSION_TTL_MS,
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", RENEWD_AUTH_HASH)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function _renewdVerifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return false;
  const expected = crypto
    .createHmac("sha256", RENEWD_AUTH_HASH)
    .update(payload)
    .digest("base64url");
  if (!_renewdSafeEqual(signature, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.u === RENEWD_AUTH_USER && Number(parsed.e) > Date.now();
  } catch (err) {
    return false;
  }
}

function _renewdAuthorize(body) {
  if (_renewdVerifySessionToken(body?.sessionToken)) {
    return { ok: true, sessionToken: body.sessionToken };
  }
  const loginId = String(body?.loginId || "").trim();
  const password = String(body?.password || "");
  const hash = _renewdHash(loginId, password);
  if (loginId === RENEWD_AUTH_USER && _renewdSafeEqual(hash, RENEWD_AUTH_HASH)) {
    return { ok: true, sessionToken: _renewdCreateSessionToken() };
  }
  return { ok: false, sessionToken: "" };
}

function _renewdPlainValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(_renewdPlainValue).filter((item) => item !== undefined);
  if (typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      const plain = _renewdPlainValue(item);
      if (plain !== undefined) out[key] = plain;
    });
    return out;
  }
  return value;
}

function _renewdCleanRecord(record) {
  const plain = _renewdPlainValue(record);
  if (!plain || typeof plain !== "object" || Array.isArray(plain)) return null;
  const id = String(plain.id || "").trim();
  if (!id) return null;
  return { ...plain, id };
}

function _renewdCollectionRef(db, name) {
  return db.collection("_instances").doc(RENEWD_INSTANCE_ID).collection(name);
}

async function _renewdReadCollections() {
  const db = getFirestore(RENEWD_DATABASE_ID);
  const entries = await Promise.all(RENEWD_READ_COLLECTIONS.map(async (name) => {
    const snap = await _renewdCollectionRef(db, name).get();
    const rows = snap.docs.map((doc) => _renewdPlainValue({ id: doc.id, ...doc.data() }));
    return [name, rows];
  }));
  return Object.fromEntries(entries);
}

async function _renewdReplaceCollections(collections) {
  const db = getFirestore(RENEWD_DATABASE_ID);
  const counts = {};
  for (const name of RENEWD_WRITE_COLLECTIONS) {
    const incoming = Array.isArray(collections?.[name]) ? collections[name].map(_renewdCleanRecord).filter(Boolean) : null;
    if (!incoming) continue;
    const ref = _renewdCollectionRef(db, name);
    const existing = await ref.get();
    const incomingIds = new Set(incoming.map((record) => record.id));
    const writes = [];
    existing.docs.forEach((doc) => {
      if (!incomingIds.has(doc.id)) writes.push({ type: "delete", ref: doc.ref });
    });
    incoming.forEach((record) => {
      writes.push({
        type: "set",
        ref: ref.doc(record.id),
        data: { ...record, updatedAt: FieldValue.serverTimestamp() },
      });
    });
    for (let i = 0; i < writes.length; i += 450) {
      const batch = db.batch();
      writes.slice(i, i + 450).forEach((write) => {
        if (write.type === "delete") batch.delete(write.ref);
        else batch.set(write.ref, write.data);
      });
      await batch.commit();
    }
    counts[name] = incoming.length;
  }
  return counts;
}

function _renewdCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Cache-Control", "no-store");
}

exports.renewdLoadClinicData = onRequest(
  { cors: true, region: "asia-northeast3", timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    _renewdCors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

    const auth = _renewdAuthorize(req.body || {});
    if (!auth.ok) return res.status(401).json({ error: "unauthorized" });

    try {
      const collections = await _renewdReadCollections();
      const counts = Object.fromEntries(Object.entries(collections).map(([key, rows]) => [key, rows.length]));
      return res.json({
        instanceId: RENEWD_INSTANCE_ID,
        sessionToken: auth.sessionToken,
        collections,
        counts,
      });
    } catch (err) {
      console.error("[renewdLoadClinicData] failed:", err?.message || err);
      return res.status(500).json({ error: "firestore-read-failed" });
    }
  }
);

exports.renewdSaveClinicData = onRequest(
  { cors: true, region: "asia-northeast3", timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    _renewdCors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

    const auth = _renewdAuthorize(req.body || {});
    if (!auth.ok) return res.status(401).json({ error: "unauthorized" });

    try {
      const counts = await _renewdReplaceCollections(req.body?.collections || {});
      return res.json({
        instanceId: RENEWD_INSTANCE_ID,
        sessionToken: auth.sessionToken,
        counts,
      });
    } catch (err) {
      console.error("[renewdSaveClinicData] failed:", err?.message || err);
      return res.status(500).json({ error: "firestore-write-failed" });
    }
  }
);
