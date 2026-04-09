// ================================================================
// data-social.js — 소셜 모듈 배럴
// ================================================================

export {
  _socialId, _isMySocialId,
  sendFriendRequest, acceptFriendRequest, removeFriend,
  getMyFriends, getPendingRequests,
  getFriendData, getFriendWorkout, getFriendTomatoState,
  getDisplayName, getGlobalWeeklyRanking,
  introduceFriend,
} from './data-social-friends.js';

export {
  getAllGuilds, createGuild,
  updateGuildMemberCount, updateGuildIcon,
  createGuildJoinRequest, approveGuildJoinRequest,
  getGuildJoinRequests, getMyPendingGuildRequests,
  getGlobalGuildWeeklyRanking,
  getGuildLeader, transferGuildLeadership, kickGuildMember,
} from './data-social-guild.js';

export {
  sendNotification, getMyNotifications, markNotificationRead, sendAnnouncement,
  getGuestbook, writeGuestbook, deleteGuestbookEntry,
  findCommentProfileOwner, getComments, writeComment, editComment, deleteComment,
  toggleLike, getCheerStatus, getLikes,
  saveFcmToken, removeFcmToken,
} from './data-social-interact.js';

export {
  recordLogin, recordTutorialDone, markPatchnoteRead, recordAction,
} from './data-social-log.js';
