const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

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
