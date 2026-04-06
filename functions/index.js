const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
    case "letter":          return "✉️ 새 편지";
    default:                return "🍅 토마토팜 알림";
  }
}
