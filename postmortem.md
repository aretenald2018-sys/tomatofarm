# Postmortem — 세션별 실수 회고

배포 후 해당 세션에서 발생한 실수를 기록하여 재발을 방지한다.

---

## 2026-04-09 — 알림 네비게이션 버그 + 비이웃 좋아요 허용

### 실수: Firebase 기존 문서에 새 필드 추가 시 구 데이터 미고려

**상황:** 댓글/답글 알림 클릭 시 본인 프로필로 이동하는 버그. 알림 데이터에 `targetUserId`(댓글이 달린 프로필 주인)가 없는 게 원인.

**첫 번째 시도 (실패):**
- `data.js`에서 새 알림 생성 시 `targetUserId` 필드 추가
- `notifications.js`에서 `n.targetUserId || user.id`로 fallback
- 문제: **이미 Firebase에 저장된 구 알림**에는 `targetUserId`가 없어서 항상 `user.id`(본인)로 fallback → 버그 그대로

**두 번째 시도 (성공):**
- `data.js`에 `findCommentProfileOwner(fromId, dateKey, section)` 함수 추가 — `_comments` 컬렉션에서 댓글 작성자의 댓글을 찾아 프로필 주인(`to`) 반환
- `notifications.js`에 `openCommentNotif` async 함수 추가:
  1. `n.targetUserId` 있으면 사용 (새 알림)
  2. 없으면 DB에서 조회 (구 알림)
  3. 둘 다 실패 시 본인 프로필 fallback

### 교훈
- **Firebase/DB에 새 필드를 추가할 때, 기존 문서에는 해당 필드가 없다.** 단순 fallback(`|| defaultValue`)이 충분한지, 아니면 능동적 조회/마이그레이션이 필요한지 반드시 판단할 것.
- "새 데이터는 잘 되겠지"는 착각. 유저가 보고 있는 건 **이미 저장된 구 데이터**.
