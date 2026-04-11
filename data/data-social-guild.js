// ================================================================
// data-social-guild.js — 길드 시스템
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
  ADMIN_ID, ADMIN_GUEST_ID,
} from './data-core.js';
import { _socialId, _isMySocialId, getFriendWorkout } from './data-social-friends.js';
import { getAccountList } from './data-account.js';
import { getGlobalWeeklyRanking } from './data-social-friends.js';

export async function getAllGuilds() {
  try {
    const snap = await getDocs(collection(db, '_guilds'));
    const guilds = [];
    snap.forEach(d => guilds.push(d.data()));
    return guilds;
  } catch { return []; }
}

function _normalizeGuildKey(value) {
  return String(value || '').trim();
}

function _getAccountDisplayName(account) {
  if (!account) return '';
  return account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id || '';
}

function _sortMembers(members) {
  return [...members].sort((a, b) => {
    const diff = (b.activeDays || 0) - (a.activeDays || 0);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function _buildWeekKeys(baseDate = new Date()) {
  const now = new Date(baseDate);
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);

  const weekKeys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekKeys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }
  return weekKeys;
}

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
  if ((w.cfWod || '').toString().trim()) return true;
  if ((w.stretchDuration || 0) > 0) return true;
  if ((w.swimDistance || 0) > 0) return true;
  if ((w.swimDurationMin || 0) > 0) return true;
  if ((w.swimDurationSec || 0) > 0) return true;
  if ((w.swimStroke || '').toString().trim()) return true;
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

function _candidateWorkoutOwnerIds(accountId) {
  const raw = String(accountId || '').trim();
  const stripped = raw.replace(/\(guest\)$/, '').trim();
  const compact = stripped.replace(/\s+/g, '').trim();
  const ids = [raw];
  if (stripped) ids.push(stripped);
  if (compact) ids.push(compact);
  if (stripped) ids.push(`${stripped}(guest)`);
  if (compact) ids.push(`${compact}(guest)`);
  if (raw === ADMIN_ID) ids.push(ADMIN_GUEST_ID);
  if (raw === ADMIN_GUEST_ID) ids.push(ADMIN_ID);
  return [...new Set(ids.filter(Boolean))];
}

async function _resolveActiveDaysFromWorkouts(accountId, weekKeys) {
  const ownerIds = _candidateWorkoutOwnerIds(accountId);
  let best = 0;

  for (const ownerId of ownerIds) {
    const results = await Promise.allSettled(weekKeys.map((dk) => getFriendWorkout(ownerId, dk)));
    let activeDays = 0;
    for (const result of results) {
      if (result.status === 'fulfilled' && _isActiveDay(result.value)) {
        activeDays++;
      }
    }
    best = Math.max(best, activeDays);
  }

  return best;
}

export async function computeGuildStats({ myLocalDays = 0, filterGuild } = {}) {
  try {
    const [guildDocs, accounts, guildRanking, individualRanking] = await Promise.all([
      getAllGuilds().catch(() => []),
      getAccountList().catch(() => []),
      getGlobalGuildWeeklyRanking().catch(() => null),
      getGlobalWeeklyRanking().catch(() => null),
    ]);

    const uniqueAccounts = accounts.filter((acc) => !/\(guest\)$/.test(acc.id || ''));
    const rankMap = new Map();
    for (const item of individualRanking?.rankings || []) {
      rankMap.set(item.userId, item.activeDays || 0);
    }
    const weekKeys = _buildWeekKeys();

    const aliasMap = new Map();
    const registerAlias = (value, canonicalKey) => {
      const alias = _normalizeGuildKey(value);
      if (!alias || !canonicalKey) return;
      if (!aliasMap.has(alias)) aliasMap.set(alias, canonicalKey);
    };
    const resolveGuildKey = (value) => aliasMap.get(_normalizeGuildKey(value)) || _normalizeGuildKey(value);

    const guildMetaMap = new Map();
    for (const guild of guildDocs || []) {
      const key = _normalizeGuildKey(guild?.id || guild?.name);
      if (!key) continue;
      guildMetaMap.set(key, guild);
      registerAlias(guild?.id, key);
      registerAlias(guild?.name, key);
    }

    const rankingMap = new Map();
    for (const item of guildRanking?.rankings || []) {
      const key = resolveGuildKey(item?.guildId || item?.guildName);
      if (!key) continue;
      rankingMap.set(key, item);
      registerAlias(item?.guildId, key);
      registerAlias(item?.guildName, key);
    }

    const liveMembersMap = new Map();
    const addedGuildMembers = new Set();
    for (const acc of accounts) {
      const canonicalId = String(acc.id || '').replace(/\(guest\)$/, '').trim();
      const rankDays = rankMap.get(canonicalId) ?? rankMap.get(acc.id);
      const activeDays = _isMySocialId(acc.id) || _isMySocialId(canonicalId)
        ? myLocalDays
        : (typeof rankDays === 'number' && rankDays > 0
          ? rankDays
          : await _resolveActiveDaysFromWorkouts(acc.id, weekKeys));
      const memberName = _getAccountDisplayName(acc);
      for (const guildName of (acc.guilds || [])) {
        const key = resolveGuildKey(guildName);
        if (!key) continue;
        const memberKey = `${canonicalId}::${key}`;
        if (addedGuildMembers.has(memberKey)) continue;
        addedGuildMembers.add(memberKey);
        if (!liveMembersMap.has(key)) liveMembersMap.set(key, []);
        liveMembersMap.get(key).push({
          userId: acc.id,
          name: memberName || acc.id,
          activeDays,
        });
      }
    }

    const guildKeys = new Set([
      ...guildMetaMap.keys(),
      ...liveMembersMap.keys(),
      ...rankingMap.keys(),
    ]);

    const guilds = [...guildKeys].map((guildKey) => {
      const guild = guildMetaMap.get(guildKey) || {};
      const ranked = rankingMap.get(guildKey) || {};
      const liveMembers = liveMembersMap.get(guildKey) || [];
      const rankedMembers = Array.isArray(ranked.members) ? ranked.members : [];
      const members = liveMembers.length
        ? liveMembers
        : rankedMembers.map((member) => ({
          userId: member.userId || member.id || '',
          name: member.name || member.nickname || member.userId || member.id || '',
          activeDays: member.activeDays || 0,
        }));

      if (!members.length) return null;

      const normalizedMembers = _sortMembers(members);
      const memberCount = normalizedMembers.length;
      const totalActiveDays = normalizedMembers.reduce((sum, member) => sum + (member.activeDays || 0), 0);
      const avgActiveDays = memberCount ? +(totalActiveDays / memberCount).toFixed(1) : 0;
      const weekStreak = normalizedMembers.reduce((min, member) => Math.min(min, member.activeDays || 0), 7);

      return {
        _key: guildKey,
        guildId: guild.id || ranked.guildId || guild.name || ranked.guildName || guildKey,
        guildName: guild.name || ranked.guildName || guild.id || ranked.guildId || guildKey,
        guildIcon: guild.icon || ranked.icon || '🏠',
        description: guild.description || ranked.description || '',
        leaderId: guild.leader || guild.createdBy || ranked.leaderId || null,
        memberCount,
        totalActiveDays,
        avgActiveDays,
        weekStreak,
        members: normalizedMembers,
      };
    }).filter(Boolean);

    guilds.sort((a, b) => {
      const diff = (b.avgActiveDays || 0) - (a.avgActiveDays || 0);
      if (diff !== 0) return diff;
      return String(a.guildName || '').localeCompare(String(b.guildName || ''));
    });

    guilds.forEach((guild, index) => {
      guild.rank = index + 1;
    });

    const filterKey = filterGuild ? resolveGuildKey(filterGuild) : '';
    const filtered = filterKey
      ? guilds.filter((guild) => guild._key === filterKey)
      : guilds;

    return {
      guilds: filtered.map(({ _key, ...guild }) => guild),
      updatedAt: guildRanking?.updatedAt || individualRanking?.updatedAt || null,
    };
  } catch (e) {
    console.warn('[guild] computeGuildStats:', e);
    return { guilds: [], updatedAt: null };
  }
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

export async function updateGuildLeader(guildId, newLeaderId) {
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return false;
    const guild = snap.data();
    guild.leader = newLeaderId;
    await setDoc(doc(db, '_guilds', guildId), guild);
    return true;
  } catch (e) {
    console.warn('[guild] updateLeader:', e);
    return false;
  }
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

export async function updateGuild(guildId, updates) {
  try {
    const snap = await getDoc(doc(db, '_guilds', guildId));
    if (!snap.exists()) return false;
    const guild = snap.data();
    await setDoc(doc(db, '_guilds', guildId), { ...guild, ...updates });
    return true;
  } catch (e) {
    console.warn('[guild] update:', e);
    return false;
  }
}

export async function inviteUserToGuild(guildId, targetUserId, inviterName = '') {
  const { sendNotification } = await import('./data-social-interact.js');
  try {
    await sendNotification(targetUserId, {
      type: 'guild_invite',
      from: _socialId(),
      guildId,
      guildName: guildId,
      inviterName: inviterName || _socialId(),
      message: `${inviterName || '길드장'}님이 ${guildId} 길드에 초대했어요!`,
    });
    return { ok: true };
  } catch (e) {
    console.warn('[guild] invite:', e);
    return { error: e?.message || '길드 초대에 실패했어요.' };
  }
}

export async function adminAddGuildMember(guildId, userId) {
  const { getAccountList, saveAccount } = await import('./data-account.js');
  try {
    const accounts = await getAccountList();
    const target = accounts.find((a) => a.id === userId);
    if (!target) return false;
    target.guilds = target.guilds || [];
    target.pendingGuilds = (target.pendingGuilds || []).filter((g) => g !== guildId);
    if (!target.guilds.includes(guildId)) {
      target.guilds.push(guildId);
      await updateGuildMemberCount(guildId, 1);
    }
    if (!target.primaryGuild) target.primaryGuild = guildId;
    await saveAccount(target);
    return true;
  } catch (e) {
    console.warn('[guild] adminAddMember:', e);
    return false;
  }
}

export async function adminRemoveGuildMember(guildId, userId) {
  const { getAccountList, saveAccount } = await import('./data-account.js');
  try {
    const accounts = await getAccountList();
    const target = accounts.find((a) => a.id === userId);
    if (!target) return false;
    const before = (target.guilds || []).length;
    target.guilds = (target.guilds || []).filter((g) => g !== guildId);
    target.pendingGuilds = (target.pendingGuilds || []).filter((g) => g !== guildId);
    if (target.primaryGuild === guildId) {
      target.primaryGuild = target.guilds[0] || null;
    }
    await saveAccount(target);
    if (before !== target.guilds.length) await updateGuildMemberCount(guildId, -1);
    return true;
  } catch (e) {
    console.warn('[guild] adminRemoveMember:', e);
    return false;
  }
}

export async function deleteGuild(guildId) {
  const { getAccountList, saveAccount } = await import('./data-account.js');
  try {
    const accounts = await getAccountList();
    for (const acc of accounts) {
      const nextGuilds = (acc.guilds || []).filter((g) => g !== guildId);
      const nextPending = (acc.pendingGuilds || []).filter((g) => g !== guildId);
      if (nextGuilds.length !== (acc.guilds || []).length || nextPending.length !== (acc.pendingGuilds || []).length) {
        acc.guilds = nextGuilds;
        acc.pendingGuilds = nextPending;
        if (acc.primaryGuild === guildId) acc.primaryGuild = nextGuilds[0] || null;
        await saveAccount(acc);
      }
    }

    const reqSnap = await getDocs(collection(db, '_guild_requests'));
    const notifSnap = await getDocs(collection(db, '_notifications'));

    await Promise.all(reqSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.guildId === guildId || data.guildName === guildId;
      })
      .map((d) => deleteDoc(doc(db, '_guild_requests', d.id))));

    await Promise.all(notifSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.guildId === guildId || data.guildName === guildId;
      })
      .map((d) => deleteDoc(doc(db, '_notifications', d.id))));

    await deleteDoc(doc(db, '_guilds', guildId));
    return true;
  } catch (e) {
    console.warn('[guild] delete:', e);
    return false;
  }
}
