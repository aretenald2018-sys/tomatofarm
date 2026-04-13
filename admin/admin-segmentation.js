function _toDateFromKey(dk) {
  const [y, m, d] = String(dk || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function _resolveDateKeys(workoutMap, fallbackKeys = []) {
  if (Array.isArray(fallbackKeys) && fallbackKeys.length) return [...fallbackKeys];
  return Object.keys(workoutMap || {}).sort((a, b) => (a > b ? -1 : 1));
}

function _analyticsMap(analytics = []) {
  return Object.fromEntries((analytics || []).map((item) => [item.dk, item]));
}

function _activeOnDay(uid, day, analyticsByDate) {
  const workoutActive = !!day?.[uid]?.any;
  const sessions = analyticsByDate?.users?.[uid]?.sessions || 0;
  return workoutActive || sessions > 0;
}

function _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, start = 0, end = 7) {
  let count = 0;
  for (let i = start; i < Math.min(end, dateKeys.length); i++) {
    const key = dateKeys[i];
    const day = workoutMap[key] || {};
    if (_activeOnDay(uid, day, analyticsByKey[key])) count++;
  }
  return count;
}

function _calcStreak(uid, workoutMap, dateKeys, field) {
  let streak = 0;
  for (let i = 0; i < Math.min(14, dateKeys.length); i++) {
    const day = workoutMap[dateKeys[i]] || {};
    if (day?.[uid]?.[field]) streak++;
    else break;
  }
  return streak;
}

function _featureCount(uid, analytics, dateKeys, days = 7) {
  const set = new Set();
  for (let i = 0; i < Math.min(days, dateKeys.length); i++) {
    const doc = analytics.find((item) => item.dk === dateKeys[i]);
    const features = doc?.users?.[uid]?.featuresUsed || [];
    features.forEach((f) => set.add(f));
  }
  return set.size;
}

function _lastLoginScore(lastLoginAt, nowTs) {
  if (!lastLoginAt) return 0;
  const diffDays = Math.max(0, (nowTs - lastLoginAt) / 86400000);
  return Math.max(0, Math.round((1 - Math.min(14, diffDays) / 14) * 30));
}

export function classifyLifecycleStage(account, workoutMap, analytics30d, dateKeysArg = []) {
  const dateKeys = _resolveDateKeys(workoutMap, dateKeysArg);
  const analyticsByKey = _analyticsMap(analytics30d);
  const uid = account?.id;
  if (!uid) return 'dormant';

  const now = new Date();
  const createdAt = account?.createdAt ? new Date(account.createdAt) : null;
  const accountAgeDays = createdAt ? Math.floor((now.getTime() - createdAt.getTime()) / 86400000) : 99;
  if (accountAgeDays <= 7) return 'new';

  const last7 = _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, 0, 7);
  const prev7 = _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, 7, 14);
  if (last7 === 0) return 'dormant';

  const workoutStreak = _calcStreak(uid, workoutMap, dateKeys, 'exercise');
  const dietStreak = _calcStreak(uid, workoutMap, dateKeys, 'diet');
  if (workoutStreak >= 7 || dietStreak >= 7) return 'engaged';

  const dropped = prev7 > 0 && last7 / prev7 <= 0.5;
  const brokenStreak = (prev7 >= 5 && (workoutStreak === 0 || dietStreak === 0));
  if (dropped || brokenStreak) return 'at-risk';

  const tutorialDone = !!account?.tutorialDoneAt;
  if (tutorialDone && last7 >= 3) return 'activated';

  return 'activated';
}

export function classifyEngagementTier(uid, workoutMap, analytics7d = [], dateKeysArg = []) {
  const dateKeys = _resolveDateKeys(workoutMap, dateKeysArg).slice(0, 7);
  const analyticsByKey = _analyticsMap(analytics7d);
  const activeDays = _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, 0, 7);
  const features = _featureCount(uid, analytics7d, dateKeys, 7);

  if (activeDays >= 6 && features >= 3) return 'power';
  if (activeDays >= 3) return 'regular';
  if (activeDays >= 1) return 'casual';
  return 'inactive';
}

export function calcTrajectory(uid, workoutMap, dateKeysArg = [], analytics30d = []) {
  const dateKeys = _resolveDateKeys(workoutMap, dateKeysArg);
  const analyticsByKey = _analyticsMap(analytics30d);
  const recent7 = _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, 0, 7);
  const prev7 = _countActiveDays(uid, workoutMap, dateKeys, analyticsByKey, 7, 14);
  const ratio = prev7 <= 0 ? (recent7 > 0 ? 2 : 1) : recent7 / prev7;
  if (ratio > 1.2) return 'improving';
  if (ratio < 0.8) return 'declining';
  return 'stable';
}

export function calcHealthScore(uid, account, workoutMap, analytics = [], socialData = {}, dateKeysArg = []) {
  const dateKeys = _resolveDateKeys(workoutMap, dateKeysArg);
  const nowTs = Date.now();
  const lastLoginPart = _lastLoginScore(account?.lastLoginAt, nowTs);

  const workoutStreak = _calcStreak(uid, workoutMap, dateKeys, 'exercise');
  const dietStreak = _calcStreak(uid, workoutMap, dateKeys, 'diet');
  const streakPart = Math.round((Math.max(workoutStreak, dietStreak) / 14) * 25);

  const features7d = _featureCount(uid, analytics, dateKeys.slice(0, 7), 7);
  const allFeatures = ['exercise', 'diet', 'photo_upload', 'ai_diet_rec', 'ai_workout_rec', 'ai_goal_analysis', 'streak_freeze'];
  const featurePart = Math.round((Math.min(allFeatures.length, features7d) / allFeatures.length) * 20);

  const likes14 = (socialData?.likes || []).filter((item) => item.from === uid || item.to === uid).length;
  const guest14 = (socialData?.guestbook || []).filter((item) => item.from === uid || item.to === uid).length;
  const socialPart = Math.min(15, Math.round(((likes14 + guest14) / 20) * 15));

  let bothLoggedDays = 0;
  for (let i = 0; i < Math.min(7, dateKeys.length); i++) {
    const day = workoutMap[dateKeys[i]]?.[uid];
    if (day?.exercise && day?.diet) bothLoggedDays++;
  }
  const contentPart = Math.round((bothLoggedDays / 7) * 10);

  return Math.max(0, Math.min(100, lastLoginPart + streakPart + featurePart + socialPart + contentPart));
}

export function getRecommendedActions(uid, stage, tier, score, trajectory, account = {}) {
  const actions = [];
  if (stage === 'dormant') {
    actions.push('환영 복귀 푸시 전송', '히어로 메시지 설정');
  }
  if (stage === 'at-risk' && trajectory === 'declining') {
    actions.push('격려 메시지 전송', '1:1 체크인');
  }
  if (stage === 'new' && !account?.tutorialDoneAt) {
    actions.push('튜토리얼 리마인더 푸시');
  }
  if (tier === 'power') {
    actions.push('소셜 피드 활동 하이라이트');
  }
  if (score < 40) {
    actions.push('개인 맞춤 코칭 메시지');
  }
  return [...new Set(actions)].slice(0, 4);
}

export function buildSegmentSummary(accounts, workoutMap, dateKeys, analytics = [], social = {}) {
  const byLifecycle = { new: [], activated: [], engaged: [], atRisk: [], dormant: [] };
  const byTier = { power: [], regular: [], casual: [], inactive: [] };
  const actionQueue = [];

  for (const account of accounts || []) {
    const uid = account?.id;
    if (!uid) continue;

    const stage = classifyLifecycleStage(account, workoutMap, analytics, dateKeys);
    const tier = classifyEngagementTier(uid, workoutMap, analytics.slice(0, 7), dateKeys);
    const score = calcHealthScore(uid, account, workoutMap, analytics, social, dateKeys);
    const trajectory = calcTrajectory(uid, workoutMap, dateKeys, analytics);
    const actions = getRecommendedActions(uid, stage, tier, score, trajectory, account);

    if (stage === 'at-risk') byLifecycle.atRisk.push(uid);
    else byLifecycle[stage].push(uid);
    byTier[tier].push(uid);

    actionQueue.push({
      uid,
      name: account.nickname || `${account.lastName || ''}${account.firstName || ''}` || uid,
      score,
      stage,
      tier,
      trajectory,
      actions,
    });
  }

  actionQueue.sort((a, b) => a.score - b.score);
  return { byLifecycle, byTier, actionQueue };
}
