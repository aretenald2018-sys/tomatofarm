// ================================================================
// data-social-guild.js — 길드 시스템
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
} from './data-core.js';
import { _socialId, _isMySocialId } from './data-social-friends.js';

export async function getAllGuilds() {
  try {
    const snap = await getDocs(collection(db, '_guilds'));
    const guilds = [];
    snap.forEach(d => guilds.push(d.data()));
    return guilds;
  } catch { return []; }
}

export async function createGuild(name, createdBy) {
  const guild = {
    id: name, name, createdBy, leader: createdBy,
    createdAt: Date.now(), memberCount: 1,
  };
  await setDoc(doc(db, '_guilds', name), guild);
  return guild;
}

export async function updateGuildMemberCount(guildId, delta) {
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return;
    const guild = snap.data();
    guild.memberCount = Math.max(0, (guild.memberCount || 0) + delta);
    await setDoc(doc(db, '_guilds', guildId), guild);
  } catch(e) { console.warn('[guild] updateMemberCount:', e); }
}

export async function updateGuildIcon(guildId, icon) {
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return;
    const guild = snap.data();
    guild.icon = icon;
    await setDoc(doc(db, '_guilds', guildId), guild);
  } catch(e) { console.warn('[guild] updateIcon:', e); }
}

export async function createGuildJoinRequest(guildId, guildName, userId, userName) {
  const { sendNotification } = await import('./data-social-interact.js');
  const { getAccountList } = await import('./data-account.js');
  const requestId = `${guildId}_${userId}_${Date.now()}`;
  const request = {
    id: requestId, guildId, guildName, userId, userName,
    status: 'pending', createdAt: Date.now(),
    approvedBy: null, approvedAt: null,
  };
  await setDoc(doc(db, '_guild_requests', requestId), request);
  const pendingNotifId = `guild_pending_${guildId}_${userId}`;
  await setDoc(doc(db, '_notifications', pendingNotifId), {
    id: pendingNotifId, to: userId, read: false, createdAt: Date.now(),
    type: 'guild_join_pending', from: userId,
    guildId, guildName, requestId,
    message: `${guildName} 길드 가입이 진행 중입니다.`,
  });
  const accounts = await getAccountList();
  for (const acc of accounts) {
    const memberGuilds = acc.guilds || [];
    if (memberGuilds.includes(guildId) && acc.id !== userId) {
      await sendNotification(acc.id, {
        type: 'guild_join_request', from: userId,
        guildId, guildName, requestId, userName,
        message: `${userName}님이 ${guildName}의 길드원임을 확인받고 싶어합니다.`,
      });
    }
  }
  return request;
}

export async function approveGuildJoinRequest(requestId) {
  const { sendNotification } = await import('./data-social-interact.js');
  const { getAccountList, saveAccount } = await import('./data-account.js');
  try {
    const snap = await getDoc(doc(db, '_guild_requests', requestId));
    if (!snap.exists()) return;
    const request = snap.data();
    if (request.status !== 'pending') return;
    request.status = 'approved';
    request.approvedBy = _socialId();
    request.approvedAt = Date.now();
    await setDoc(doc(db, '_guild_requests', requestId), request);
    const accounts = await getAccountList();
    const requester = accounts.find(a => a.id === request.userId);
    if (requester) {
      const guilds = requester.guilds || [];
      const pending = requester.pendingGuilds || [];
      if (!guilds.includes(request.guildId)) guilds.push(request.guildId);
      const newPending = pending.filter(g => g !== request.guildId);
      requester.guilds = guilds;
      requester.pendingGuilds = newPending;
      if (!requester.primaryGuild && guilds.length > 0) requester.primaryGuild = guilds[0];
      await saveAccount(requester);
    }
    await updateGuildMemberCount(request.guildId, 1);
    const pendingNotifId = `guild_pending_${request.guildId}_${request.userId}`;
    try { await deleteDoc(doc(db, '_notifications', pendingNotifId)); } catch {}
    await sendNotification(request.userId, {
      type: 'guild_join_approved', from: _socialId(),
      guildId: request.guildId, guildName: request.guildName,
      message: `${request.guildName} 길드 가입이 승인되었어요!`,
    });
    for (const acc of accounts) {
      const memberGuilds = acc.guilds || [];
      if (memberGuilds.includes(request.guildId) && acc.id !== request.userId && acc.id !== _socialId()) {
        await sendNotification(acc.id, {
          type: 'guild_member_joined', from: request.userId,
          guildId: request.guildId, guildName: request.guildName,
          message: `${request.userName}님이 ${request.guildName}에 합류했어요!`,
        });
      }
    }
  } catch(e) { console.warn('[guild] approve:', e); }
}

export async function getGuildJoinRequests(guildId) {
  try {
    const snap = await getDocs(collection(db, '_guild_requests'));
    const requests = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.guildId === guildId && data.status === 'pending') requests.push(data);
    });
    return requests;
  } catch { return []; }
}

export async function getMyPendingGuildRequests(userId) {
  try {
    const snap = await getDocs(collection(db, '_guild_requests'));
    const requests = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.userId === userId && data.status === 'pending') requests.push(data);
    });
    return requests;
  } catch { return []; }
}

export async function getGlobalGuildWeeklyRanking() {
  try {
    const snap = await getDoc(doc(db, '_weekly_guild_ranking', 'current'));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function getGuildLeader(guildId) {
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return null;
    return snap.data().leader || snap.data().createdBy || null;
  } catch { return null; }
}

export async function transferGuildLeadership(guildId, newLeaderId) {
  const { sendNotification } = await import('./data-social-interact.js');
  const { getAccountList } = await import('./data-account.js');
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return false;
    const guild = snap.data();
    const oldLeader = guild.leader || guild.createdBy;
    if (!_isMySocialId(oldLeader)) return false;
    guild.leader = newLeaderId;
    await setDoc(doc(db, '_guilds', guildId), guild);
    const accounts = await getAccountList();
    const oldLeaderAcc = accounts.find(a => a.id === oldLeader);
    const oldName = oldLeaderAcc ? (oldLeaderAcc.nickname || oldLeaderAcc.lastName + oldLeaderAcc.firstName) : '이전 길드장';
    await sendNotification(newLeaderId, {
      type: 'guild_leader_transfer', from: oldLeader,
      guildId, guildName: guild.name,
      message: `${oldName}님이 ${guild.name}의 길드장을 위임했어요. 이제 당신이 길드장이에요!`,
    });
    return true;
  } catch(e) { console.warn('[guild] transferLeadership:', e); return false; }
}

export async function kickGuildMember(guildId, targetUserId) {
  const { getAccountList, saveAccount } = await import('./data-account.js');
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return false;
    const guild = snap.data();
    const leader = guild.leader || guild.createdBy;
    if (!_isMySocialId(leader)) return false;
    const accounts = await getAccountList();
    const target = accounts.find(a => a.id === targetUserId);
    if (!target) return false;
    target.guilds = (target.guilds || []).filter(g => g !== guildId);
    target.pendingGuilds = (target.pendingGuilds || []).filter(g => g !== guildId);
    if (target.primaryGuild === guildId) {
      target.primaryGuild = target.guilds.length > 0 ? target.guilds[0] : null;
    }
    await saveAccount(target);
    await updateGuildMemberCount(guildId, -1);
    return true;
  } catch(e) { console.warn('[guild] kickMember:', e); return false; }
}
