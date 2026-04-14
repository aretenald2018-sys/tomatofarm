const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
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
    if (!data || !data.to) return;

    const db = getFirestore();

    // 대상 유저의 FCM 토큰 조회
    const tokensSnap = await db.collection("_fcm_tokens")
      .where("userId", "==", data.to)
      .get();

    if (tokensSnap.empty) return;

    const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

    // 푸시 페이로드
    const title = _buildTitle(data);
    const body = data.message || "";

    const message = {
      tokens,
      notification: { title, body },
      data: {
        notifId: data.id || "",
        type: data.type || "",
        section: data.section || "",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "tomatofarm_default",
          icon: "ic_launcher",
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          icon: "/tomatofarm/icon-192.png",
          badge: "/tomatofarm/icon-192.png",
        },
      },
    };

    const result = await getMessaging().sendEachForMulticast(message);

    // 만료된 토큰 자동 정리
    const failedTokens = [];
    result.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/registration-token-not-registered" ||
         resp.error?.code === "messaging/invalid-registration-token")
      ) {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      const batch = db.batch();
      tokensSnap.docs.forEach(d => {
        if (failedTokens.includes(d.data().token)) batch.delete(d.ref);
      });
      await batch.commit();
    }

    console.log(
      `[FCM] to=${data.to} type=${data.type} sent=${result.successCount} fail=${result.failureCount}`
    );
  }
);

function _buildTitle(data) {
  switch (data.type) {
    case "friend_request":  return "🤝 새 이웃 요청";
    case "friend_accepted": return "🤝 이웃이 되었어요";
    case "guestbook":       return "📝 새 방명록";
    case "guestbook_reply": return "💬 방명록 답글";
    case "like":            return "❤️ 새 리액션";
    case "reaction":        return "❤️ 새 리액션";
    case "comment":         return "💬 새 댓글";
    case "comment_reply":   return "💬 새 답글";
    case "tomato_gift":     return "🍅 토마토 선물";
    case "patchnote":       return "📋 새 패치노트";
    case "announcement":    return "📢 운영자 공지";
    case "direct_message":  return data.title || "📬 개별 메시지";
    case "introduce":       return "👋 이웃 소개";
    case "letter":              return "✉️ 새 편지";
    case "guild_join_request":  return "🏠 길드원 확인 요청";
    case "guild_join_approved":   return "🏠 길드 가입 승인";
    case "guild_member_joined":   return "🏠 새 길드원";
    case "guild_invite":          return "🏠 길드 초대";
    default:                    return "🍅 토마토팜 알림";
  }
}

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

function _candidateWorkoutOwnerIds(account) {
  const ids = [
    account?.ownerId,
    account?.dataOwnerId,
    account?.socialId,
    account?.dataId,
    account?.id,
    String(account?.id || "").replace(/\(guest\)$/, "").trim(),
    String(account?.id || "").replace(/\(guest\)$/, "").trim()
      ? `${String(account?.id || "").replace(/\(guest\)$/, "").trim()}(guest)`
      : "",
    String(account?.id || "").replace(/\s+/g, "").trim(),
    String(account?.id || "").replace(/\s+/g, "").trim()
      ? `${String(account?.id || "").replace(/\s+/g, "").trim()}(guest)`
      : "",
    `${account?.lastName || ""}_${account?.firstName || ""}`.toLowerCase().replace(/\s/g, ""),
  ];
  return [...new Set(ids.filter(Boolean))];
}

async function _resolveActiveDaysForAccount(db, account, weekKeys) {
  const ownerIds = _candidateWorkoutOwnerIds(account);
  for (const ownerId of ownerIds) {
    const dayResults = await Promise.allSettled(
      weekKeys.map((dk) => db.doc(`users/${ownerId}/workouts/${dk}`).get())
    );
    let activeDays = 0;
    for (const r of dayResults) {
      if (r.status === "fulfilled" && r.value.exists) {
        if (_isActiveDay(r.value.data())) activeDays++;
      }
    }
    if (activeDays > 0) return activeDays;
  }
  return 0;
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

// 수동 새로고침 엔드포인트
exports.refreshWeeklyRanking = onRequest({ cors: true }, async (req, res) => {
  const result = await _computeRanking();
  res.json({ ok: true, ...result });
});

exports.geminiProxy = onCall(
  {
    secrets: [GEMINI_API_KEY],
    enforceAppCheck: true,
    region: "asia-northeast3",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { parts, maxTokens = 2000, responseMimeType } = request.data || {};
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new HttpsError("invalid-argument", "parts 배열이 필요합니다.");
    }

    const requestSize = Buffer.byteLength(JSON.stringify(parts), "utf8");
    if (requestSize > 8 * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "요청 크기가 너무 큽니다.");
    }

    const parsedMaxTokens = Number(maxTokens);
    const generationConfig = {
      maxOutputTokens: Number.isFinite(parsedMaxTokens)
        ? Math.max(1, Math.min(Math.trunc(parsedMaxTokens), 8192))
        : 2000,
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (typeof responseMimeType === "string" && responseMimeType.trim()) {
      generationConfig.responseMimeType = responseMimeType.trim();
    }

    const _fnStart = Date.now();

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
      throw new HttpsError("internal", "Gemini 호출에 실패했습니다.");
    }

    if (!data) {
      throw new HttpsError("internal", "Gemini 응답을 해석할 수 없습니다.");
    }

    if (!res.ok || data?.error) {
      console.error("[geminiProxy] Gemini API error:", {
        status: res.status,
        error: data?.error || null,
      });
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

    const wantJSON = generationConfig.responseMimeType === "application/json";
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

    return { text };
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

exports.ocrProxy = onCall(
  {
    enforceAppCheck: true,
    region: "asia-northeast3",
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (request) => {
    const { imageBase64 } = request.data || {};
    if (typeof imageBase64 !== "string" || imageBase64.length < 100) {
      throw new HttpsError("invalid-argument", "imageBase64가 필요합니다.");
    }
    if (imageBase64.length > 10 * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "이미지가 너무 큽니다.");
    }

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

    return {
      text,
      month: monthKey,
      usedAfter: reservedCount,
      limit: OCR_MONTHLY_LIMIT,
    };
  }
);
