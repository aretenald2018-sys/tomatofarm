// ================================================================
// home/cheers-card.js — "함께 축하해요!" 공용 축하 카드
// ================================================================
//
// 정책: 전체 활성 앱 사용자 공용 피드 (친구 필터 없음)
//
// 캐시 전략 (per-uid 분리):
//   - sessionStorage key: `${PREFIX}${viewerUid}:${todayKey}:${signature}:${targetUid}`
//   - 값: { at, name, avatar, results }  (1h TTL)
//   - 활성 풀은 매 렌더 현재 accounts 기준으로 재계산되어 per-uid lookup
//     → 신규 로그인 즉시 반영, 24h 이탈자도 즉시 제외 (pool stale 해결)
//
// Fresh signals (lastCycle + selfCheer): 매 렌더 fresh, top-K 후보에 한정
//   → 50명 활성 시 15명 노출해도 read 비용은 top-K(30) 로 제한
//
// 2토마토 pair 보호:
//   `_composeUserItems`에서 2토마토 사용자의 exercise/diet pick을 protected:true 로 태그
//   `_capPerUid`가 protected 우선 유지하여 운동 1 + 식단 1 계약을 깨지 않음
//
// detector 계약 (calc.js): 모든 자동 감지기는 아래 ctx를 공통 입력으로 받는다.
//   { name, today, yesterday, dayBefore, weekAgo,
//     latestWeight, priorWeight, daysBetween }

import {
  TODAY, dateKey, getCurrentUser, getAccountList,
  getFriendWorkout, getFriendData,
  getCheersConfig, getCustomCheers,
  getMySelfCheer, getMySelfCheerRaw, saveMySelfCheer, deleteMySelfCheer,
  getFriendSelfCheer, getFriendLatestTomatoCycle,
  getExList, getAllMuscles,
} from '../data.js';
import { CELEBRATION_DETECTORS } from '../calc.js';
import { resolveNickname, showToast } from './utils.js';

const CARD_ID = 'card-celebrations';
const CACHE_PREFIX = '__cheersCache_v4:';
const AUTO_TTL_MS = 60 * 60 * 1000;            // 자동 감지 결과 per-uid 1h
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_INITIAL = 5;
const MAX_TOTAL = 15;
const MAX_PER_UID = 3;                          // uid당 라인 상한 (self-cheer + 2토마토 pair 또는 custom+top auto)
const FRESH_CANDIDATE_TOP_K = MAX_TOTAL * 2;    // top-K = 30, 이들에게만 fresh signal fetch

let _expanded = false;
let _inFlight = null;

// ── 캐시 키 / 조회 ─────────────────────────────────────────────

function _viewerUid() {
  return getCurrentUser()?.id || 'anon';
}

function _todayStr() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

function _cacheKeyFor(viewerUid, signature, targetUid) {
  return `${CACHE_PREFIX}${viewerUid}:${_todayStr()}:${signature}:${targetUid}`;
}

function _readAutoCache(viewerUid, signature, targetUid) {
  try {
    const raw = sessionStorage.getItem(_cacheKeyFor(viewerUid, signature, targetUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if ((Date.now() - parsed.at) >= AUTO_TTL_MS) return null;
    return parsed;
  } catch (_) { return null; }
}

function _writeAutoCache(viewerUid, signature, targetUid, row) {
  try {
    sessionStorage.setItem(
      _cacheKeyFor(viewerUid, signature, targetUid),
      JSON.stringify({ at: Date.now(), ...row }),
    );
  } catch (_) { /* ignore */ }
}

function _pruneStaleCaches(viewerUid, signature, activeUidSet) {
  try {
    const wantedPrefix = `${CACHE_PREFIX}${viewerUid}:${_todayStr()}:${signature}:`;
    const removals = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      // 다른 viewer/signature/날짜의 구버전 키 정리
      if (!k.startsWith(wantedPrefix)) { removals.push(k); continue; }
      const targetUid = k.slice(wantedPrefix.length);
      if (!activeUidSet.has(targetUid)) removals.push(k);
    }
    removals.forEach((k) => sessionStorage.removeItem(k));
  } catch (_) { /* ignore */ }
}

// ── 날짜 유틸 ─────────────────────────────────────────────────

function _daysAgoKey(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── 표시 유틸 ─────────────────────────────────────────────────

function _initials(name) {
  if (!name) return '?';
  const trimmed = String(name).trim();
  return trimmed ? trimmed.charAt(0) : '?';
}

function _escapeText(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 운동명 해석: exerciseId → 사용자 친화 한글명
// 1순위: getExList에서 id 매칭 (예: back_1 → 랫풀다운, custom_abc → 사용자 정의명)
// 2순위: id 프리픽스로 근육 부위 한글화 — 기본 MUSCLES + 커스텀 근육군 (과거 종목이
//        현재 목록에서 삭제/로드 지연된 경우에도 커스텀 근육군 힌트 유지)
// 3순위: "운동"
function _resolveExerciseName(exerciseId, fallbackName) {
  const isRawId = !fallbackName || /^[a-z0-9]+_[a-z0-9_-]+$/i.test(String(fallbackName));
  if (!isRawId && fallbackName) return fallbackName;
  if (exerciseId) {
    try {
      const hit = getExList().find((e) => e.id === exerciseId);
      if (hit?.name) return hit.name;
    } catch (_) { /* ignore */ }
    const prefix = String(exerciseId).split('_')[0];
    try {
      const muscle = getAllMuscles().find((m) => m.id === prefix);
      if (muscle?.name) return `${muscle.name} 운동`;
    } catch (_) { /* ignore */ }
  }
  return '운동';
}

// 문구 템플릿 (structured 입력 → escape + 합성, XSS 방지)
function _renderTemplate(c) {
  const p = c.params || {};
  const name = `<strong>${_escapeText(p.name)}</strong>`;
  const ex = _escapeText(_resolveExerciseName(p.exerciseId, p.exercise));
  switch (c.template) {
    case 'weight_loss':
      return `${name}님이 최근 ${_escapeText(p.days)}일간 체중이 ${_escapeText(p.kg)}kg 줄었어요!`;
    case 'weight_gain':
      return `${name}님이 꾸준히 체중을 관리하고 있어요.`;
    case 'streak_revival':
      return `${name}님이 다시 운동과 식단을 기록하기 시작했어요!`;
    case 'kcal_reduction':
      return `${name}님이 어제는 그저께보다 조금 가볍게 드셨어요.`;
    case 'volume_pr':
      return `${name}님이 ${ex} 볼륨을 직전 대비 ${_escapeText(p.pct)}% 끌어올렸어요!`;
    case 'weight_pr':
      return `${name}님이 ${ex} 최고 중량을 직전 대비 ${_escapeText(p.pct)}% 경신했어요!`;
    case 'frequency_up':
      return `${name}님이 ${ex}을(를) 오늘부터 루틴에 다시 추가했어요!`;
    case 'full_diet_day':
      return `${name}님이 오늘 3끼를 모두 목표 내로 기록했어요!`;
    case 'streak_milestone':
      return `${name}님이 운동 ${_escapeText(p.days)}일 연속 기록을 달성했어요!`;
    case 'protein_goal':
      return `${name}님이 단백질 목표 ${_escapeText(p.grams)}g을 넘겼어요!`;
    case 'custom':
      return `${name}님 ${_escapeText(p.text || '')}`.trim();
    case 'self_cheer':
      return `${name}님 ${_escapeText(p.text || '')}`.trim();
    default:
      return `${name}님이 작은 성공을 거두었어요!`;
  }
}

// ── 감지기 설정 ─────────────────────────────────────────────────

const DETECTOR_KEY_MAP = {
  detectWeightDelta: 'weight',
  detectRevival: 'revival',
  detectKcalDrop: 'kcal',
  detectVolumePR: 'volume_pr',
  detectLiftPR: 'weight_pr',
  detectFrequencyUp: 'frequency_up',
  detectFullDietDay: 'full_diet_day',
  detectStreakMilestone: 'streak_milestone',
  detectProteinGoal: 'protein_goal',
};

function _resolveEnabledSet(config) {
  const defaults = {
    weight: true, revival: true, kcal: true,
    volume_pr: true, weight_pr: true,
    frequency_up: true, full_diet_day: true,
  };
  const merged = { ...defaults, ...((config && config.modules) || {}) };
  const set = new Set();
  for (const [k, v] of Object.entries(merged)) if (v) set.add(k);
  return set;
}

function _signatureFor(enabledSet) {
  return [...enabledSet].sort().join(',');
}

// ── 체중 체크인 페어 ─────────────────────────────────────────────

function _pickCheckinPair(checkins, minDaysApart = 5) {
  if (!checkins || !checkins.length) return null;
  const sorted = [...checkins].filter((c) => c?.date && typeof c.weight === 'number')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const latestDate = new Date(latest.date + 'T00:00:00');
  for (let i = sorted.length - 2; i >= 0; i--) {
    const prev = sorted[i];
    const prevDate = new Date(prev.date + 'T00:00:00');
    const days = Math.round((latestDate - prevDate) / 86400000);
    if (days >= minDaysApart) return { latest, prior: prev, days };
  }
  return null;
}

// ── 카테고리 분류 선택 (2토마토 전용) ────────────────────────────

function _pickTopByCategory(results) {
  const sorted = [...results].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const exercise = sorted.find((r) => r.category === 'exercise');
  const diet = sorted.find((r) => r.category === 'diet');
  const both = sorted.find((r) => r.category === 'both');
  const picks = [];
  if (exercise) picks.push(exercise);
  else if (both) picks.push(both);
  if (diet && diet !== picks[0]) picks.push(diet);
  else if (both && both !== picks[0]) picks.push(both);
  return picks;
}

// ── Auto 감지 계산 (per-uid 캐시) ────────────────────────────────

async function _computeAutoForUid(uid, acc, name, enabledSet) {
  const todayKey = _daysAgoKey(0);
  const yesterdayKey = _daysAgoKey(1);
  const dayBeforeKey = _daysAgoKey(2);
  const weekAgoKey = _daysAgoKey(7);

  const [today, yesterday, dayBefore, weekAgo, checkins] = await Promise.all([
    getFriendWorkout(uid, todayKey),
    getFriendWorkout(uid, yesterdayKey),
    getFriendWorkout(uid, dayBeforeKey),
    getFriendWorkout(uid, weekAgoKey),
    getFriendData(uid, 'body_checkins').catch(() => []),
  ]);
  const weightPair = _pickCheckinPair(checkins, 5);
  const ctx = {
    name,
    today, yesterday, dayBefore, weekAgo,
    latestWeight: weightPair?.latest?.weight,
    priorWeight: weightPair?.prior?.weight,
    daysBetween: weightPair?.days,
  };
  const results = [];
  for (const fn of CELEBRATION_DETECTORS) {
    const key = DETECTOR_KEY_MAP[fn.name] || fn.name;
    if (!enabledSet.has(key)) continue;
    try {
      const r = fn(ctx);
      if (r) results.push(r);
    } catch (_) { /* ignore */ }
  }
  results.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return { uid, name, avatar: acc?.avatar || null, results };
}

// 활성 사용자 풀 계산 — 항상 current accounts 기반 (stale pool 방지)
function _computeActivePool(accounts, myUid) {
  const now = Date.now();
  const active = (accounts || []).filter((acc) => {
    if (!acc?.id) return false;
    if (acc.id.includes('(guest)')) return false;
    const last = acc.lastLoginAt || 0;
    return (now - last) <= ACTIVE_WINDOW_MS;
  });
  if (myUid && !active.find((a) => a.id === myUid)) {
    const meAcc = (accounts || []).find((a) => a.id === myUid);
    if (meAcc) active.push(meAcc);
  }
  return active;
}

// per-uid 캐시 lookup + miss fetch → autoRows 반환
async function _buildAutoRows(activeUsers, accounts, enabledSet, viewerUid, signature, myUid) {
  const results = await Promise.all(activeUsers.map(async (acc) => {
    const uid = acc.id;
    const name = resolveNickname(acc, accounts) || uid.replace(/_/g, '');
    const cached = _readAutoCache(viewerUid, signature, uid);
    if (cached) {
      return { uid, name: cached.name || name, avatar: cached.avatar ?? (acc?.avatar || null), results: cached.results || [], isSelf: uid === myUid };
    }
    try {
      const row = await _computeAutoForUid(uid, acc, name, enabledSet);
      _writeAutoCache(viewerUid, signature, uid, row);
      return { ...row, isSelf: uid === myUid };
    } catch (_) {
      // rule fallback: 빈 results 반환 (다른 사용자도 빌드 진행)
      return { uid, name, avatar: acc?.avatar || null, results: [], isSelf: uid === myUid };
    }
  }));
  return results;
}

// ── Fresh 신호 fetch (top-K 후보만) ──────────────────────────────

async function _fetchFreshSignals(candidateUids, myUid) {
  if (!candidateUids || !candidateUids.length) return {};
  const entries = await Promise.all(candidateUids.map(async (uid) => {
    const isSelf = uid === myUid;
    const [lastCycle, selfCheer] = await Promise.all([
      getFriendLatestTomatoCycle(uid).catch(() => null),
      isSelf
        ? getMySelfCheer().catch(() => null)
        : getFriendSelfCheer(uid).catch(() => null),
    ]);
    return [uid, { lastCycle, selfCheer }];
  }));
  return Object.fromEntries(entries);
}

// 후보 선별: customList의 uid + self uid + autoRows 상위 K
function _selectCandidateUids(autoRows, customList, myUid, k) {
  const set = new Set();
  if (myUid) set.add(myUid);
  for (const c of (customList || [])) {
    if (c?.targetUid) set.add(c.targetUid);
  }
  const sortedByMaxPriority = [...autoRows].sort((a, b) => {
    const pa = a.results?.[0]?.priority || 0;
    const pb = b.results?.[0]?.priority || 0;
    return pb - pa;
  });
  for (const row of sortedByMaxPriority) {
    if (set.size >= k) break;
    set.add(row.uid);
  }
  return [...set];
}

// ── Items compose (2토마토 pair = protected) ────────────────────

function _composeUserItems(autoRows, freshByUid) {
  const all = [];
  for (const row of autoRows) {
    const fresh = freshByUid[row.uid] || {};
    if (fresh.selfCheer?.text) {
      all.push({
        uid: row.uid, name: row.name, avatar: row.avatar, isSelf: row.isSelf,
        type: 'self_cheer', priority: 110, protected: false,
        template: 'self_cheer',
        params: { name: row.name, text: fresh.selfCheer.text },
      });
    }

    if (!row.results.length) continue;

    const lastCycle = fresh.lastCycle;
    const twoTomatoes = lastCycle?.tomatoesAwarded === 2 &&
                        lastCycle?.dietAllSuccess &&
                        lastCycle?.exerciseAllSuccess;
    const picks = twoTomatoes ? _pickTopByCategory(row.results) : [row.results[0]];
    for (const pick of picks) {
      all.push({
        uid: row.uid, name: row.name, avatar: row.avatar, isSelf: row.isSelf,
        type: pick.type, priority: pick.priority,
        protected: !!twoTomatoes,        // 2토마토 pair는 보호
        template: pick.template,
        params: pick.params,
        category: pick.category,
      });
    }
  }
  return all;
}

// protected-aware per-uid cap: protected 항목 우선 유지 후 priority 순
function _capPerUid(items, maxPerUid) {
  const byUid = new Map();
  for (const item of items) {
    const uid = item.uid || '__noid__';
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(item);
  }
  const out = [];
  for (const [, list] of byUid) {
    list.sort((a, b) => {
      const pa = a.protected ? 0 : 1;
      const pb = b.protected ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.priority || 0) - (a.priority || 0);
    });
    out.push(...list.slice(0, maxPerUid));
  }
  return out;
}

function _mapCustomCheers(customList, accounts) {
  const now = Date.now();
  return (customList || [])
    .filter((c) => c && c.text && (!c.expiresAt || c.expiresAt > now))
    .map((c) => {
      const acc = accounts.find((a) => a.id === c.targetUid);
      const name = acc ? resolveNickname(acc, accounts) : (c.targetName || c.targetUid || '누군가');
      return {
        uid: c.targetUid || '',
        name, avatar: acc?.avatar || null,
        type: 'custom', priority: 120, protected: false,
        template: 'custom',
        params: { name, text: c.text },
      };
    });
}

// ── 동일 uid의 복수 메시지 그룹핑 (1행 로테이션) ─────────────────
// 우선순위 정렬된 items 입력 → 최초 등장 순서를 유지하면서 같은 uid의 후속 항목을
// 첫 항목의 messages[]에 합쳐서 한 행으로 렌더한다.
function _groupByUidForDisplay(items) {
  const out = [];
  const seen = new Map(); // uid -> out index
  for (const item of items) {
    const key = item.uid || `__anon_${out.length}`;
    if (!seen.has(key)) {
      seen.set(key, out.length);
      out.push({ ...item, messages: [item] });
    } else {
      out[seen.get(key)].messages.push(item);
    }
  }
  return out;
}

// ── 렌더 ─────────────────────────────────────────────────────────

function _renderRowText(row) {
  const selfBadge = row.isSelf ? '<span class="cheers-self-badge">나</span>' : '';
  const msgs = row.messages || [row];
  if (msgs.length <= 1) {
    return `${selfBadge}${_renderTemplate(msgs[0])}`;
  }
  const n = Math.min(msgs.length, 3); // CSS 애니메이션은 N=2,3 지원
  const lines = msgs.slice(0, n).map((m) => `<span class="cheers-rot-line">${_renderTemplate(m)}</span>`).join('');
  return `${selfBadge}<span class="cheers-text-rotator" data-n="${n}">${lines}</span>`;
}

function _renderItems(rows, limit) {
  const shown = rows.slice(0, limit);
  return shown.map((row) => {
    const avatar = row.avatar
      ? `<img src="${_escapeText(row.avatar)}" alt="">`
      : _escapeText(_initials(row.name));
    const selfClass = row.isSelf ? ' cheers-item-self' : '';
    return `
      <div class="cheers-item${selfClass}" data-uid="${_escapeText(row.uid)}" onclick="window._cheersOpenFriend(this.dataset.uid)">
        <div class="cheers-avatar">${avatar}</div>
        <div class="cheers-text">${_renderRowText(row)}</div>
        <div class="cheers-item-icon">›</div>
      </div>
    `;
  }).join('');
}

function _paint(el, rows, totalEvents, mySelfCheer) {
  const hasAny = rows && rows.length;
  const todayEndRemainingText = (() => {
    if (!mySelfCheer?.text || !mySelfCheer.expiresAt) return '';
    const hrs = Math.max(0, Math.round((mySelfCheer.expiresAt - Date.now()) / 3600000));
    return hrs > 0 ? ` · 오늘 ${hrs}시간 남음` : ' · 오늘까지';
  })();
  const myCheerLine = mySelfCheer?.text
    ? `<div class="cheers-self-preview">내 축하: <strong>${_escapeText(mySelfCheer.text)}</strong>${todayEndRemainingText}</div>`
    : '';
  const editorRow = `
    <div class="cheers-self-row">
      ${myCheerLine}
      <button class="cheers-self-btn" onclick="window.openSelfCheerModal()">
        ${mySelfCheer?.text ? '✏️ 축하 문구 수정' : '✏️ 오늘 축하받고 싶은 일 설정'}
      </button>
    </div>
  `;

  el.style.display = '';
  const initialShown = _expanded ? rows.length : Math.min(MAX_INITIAL, rows.length);
  const hasMore = rows.length > MAX_INITIAL;
  el.innerHTML = `
    <div class="cheers-card-header">
      <span class="cheers-card-emoji">🎉</span>
      <span class="cheers-card-title">함께 축하해요!</span>
      ${hasAny ? `<span class="cheers-card-sub">${totalEvents}건</span>` : ''}
    </div>
    ${hasAny ? `<div class="cheers-list">${_renderItems(rows, initialShown)}</div>` : `
      <div class="cheers-empty">아직 오늘 축하할 소식이 없어요. 내 축하받고 싶은 일을 먼저 알려볼까요?</div>
    `}
    ${hasMore ? `
      <button class="cheers-more-btn" onclick="window._cheersToggleExpand()">
        ${_expanded ? '접기' : `더보기 (+${rows.length - MAX_INITIAL})`}
      </button>
    ` : ''}
    ${editorRow}
  `;
}

// ── 메인 진입 ────────────────────────────────────────────────────

export async function renderCheersCard() {
  const el = document.getElementById(CARD_ID);
  if (!el) return;

  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const mySelfCheer = await getMySelfCheer().catch(() => null);

      const [config, customList, accounts] = await Promise.all([
        getCheersConfig(),
        getCustomCheers(),
        getAccountList(),
      ]);
      const me = getCurrentUser();
      const myUid = me?.id || null;
      const viewerUid = myUid || 'anon';
      const enabledSet = _resolveEnabledSet(config);
      const signature = _signatureFor(enabledSet);

      // 활성 풀 — current accounts 기반, 항상 fresh
      const activeUsers = _computeActivePool(accounts, myUid);
      const activeUidSet = new Set(activeUsers.map((a) => a.id));

      // 오래된/이탈자 per-uid 캐시 정리
      _pruneStaleCaches(viewerUid, signature, activeUidSet);

      // per-uid 캐시 lookup + miss fetch
      const autoRows = await _buildAutoRows(activeUsers, accounts, enabledSet, viewerUid, signature, myUid);

      // top-K 후보 선정 (customList uid + self + auto 상위 priority)
      const candidateUids = _selectCandidateUids(autoRows, customList, myUid, FRESH_CANDIDATE_TOP_K);
      const candidateSet = new Set(candidateUids);

      // top-K만 fresh signal fetch
      const freshByUid = await _fetchFreshSignals(candidateUids, myUid);

      // 후보 uid의 autoRows만 compose 대상으로 좁힘
      const candidateRows = autoRows.filter((r) => candidateSet.has(r.uid));
      const userItems = _composeUserItems(candidateRows, freshByUid);

      const customItems = _mapCustomCheers(customList, accounts);

      // protected-aware per-uid cap → 전체 sort → slice
      const capped = _capPerUid([...customItems, ...userItems], MAX_PER_UID);
      const merged = capped
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, MAX_TOTAL);
      // 동일 uid 복수 메시지는 한 행으로 묶어 로테이션 렌더
      const rows = _groupByUidForDisplay(merged);
      _paint(el, rows, merged.length, mySelfCheer);
    } catch (err) {
      console.warn('[cheers-card] render error', err);
      el.style.display = 'none';
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

// ── Self-cheer 모달 핸들러 ───────────────────────────────────────

window.openSelfCheerModal = async () => {
  const modal = document.getElementById('self-cheer-modal');
  if (!modal) { console.warn('[self-cheer] modal not loaded'); return; }
  modal.style.display = 'flex';

  const textEl = document.getElementById('self-cheer-text');
  const previewEl = document.getElementById('self-cheer-preview');
  const currentEl = document.getElementById('self-cheer-current');
  if (!textEl) return;

  let current = null;
  try { current = await getMySelfCheerRaw(); } catch (_) { /* ignore */ }
  const active = !!(current?.text && current.expiresAt && current.expiresAt > Date.now());
  if (active) {
    textEl.value = current.text;
    const hrs = Math.round((current.expiresAt - Date.now()) / 3600000);
    if (currentEl) currentEl.innerHTML = `현재 설정: <strong>${_escapeText(current.text)}</strong> (오늘 ${hrs}시간 남음)`;
  } else if (current?.text) {
    textEl.value = '';
    if (currentEl) currentEl.innerHTML = `<span style="opacity:0.6;">어제 문구: <em>${_escapeText(current.text)}</em> (만료됨 — 오늘 다시 적어주세요)</span>`;
  } else {
    textEl.value = '';
    if (currentEl) currentEl.innerHTML = '';
  }

  const me = getCurrentUser();
  const myName = me?.nickname || `${me?.lastName || ''}${me?.firstName || ''}` || '나';
  const updatePreview = () => {
    if (!previewEl) return;
    const raw = (textEl.value || '').trim();
    const normalized = raw.replace(/^님[\s,]*/, '').trim();
    if (!normalized) {
      previewEl.innerHTML = '미리보기: (입력 시 표시)';
      return;
    }
    previewEl.innerHTML = `미리보기: <strong>${_escapeText(myName)}</strong>님 ${_escapeText(normalized)}`;
  };
  textEl.oninput = updatePreview;
  updatePreview();
  setTimeout(() => textEl.focus(), 80);
};

window.closeSelfCheerModal = (event) => {
  const modal = document.getElementById('self-cheer-modal');
  if (!modal) return;
  if (event && event.target !== modal) return;
  modal.style.display = 'none';
};

window.saveSelfCheerFromModal = async () => {
  const textEl = document.getElementById('self-cheer-text');
  if (!textEl) return;
  const text = (textEl.value || '').trim();
  if (!text) { showToast('내용을 입력하세요', 1600, 'warning'); return; }
  try {
    await saveMySelfCheer({ text });
    showToast('오늘 축하 문구 저장 완료', 1800, 'success');
    const modal = document.getElementById('self-cheer-modal');
    if (modal) modal.style.display = 'none';
    window._cheersRefresh?.();
  } catch (e) {
    showToast('저장 실패: ' + (e.message || e), 2000, 'error');
  }
};

window.clearSelfCheerFromModal = async () => {
  if (!confirm('오늘 축하 문구를 지울까요?')) return;
  try {
    await deleteMySelfCheer();
    showToast('축하 문구 삭제', 1600, 'success');
    const modal = document.getElementById('self-cheer-modal');
    if (modal) modal.style.display = 'none';
    window._cheersRefresh?.();
  } catch (e) {
    showToast('삭제 실패: ' + (e.message || e), 2000, 'error');
  }
};

window._cheersToggleExpand = () => {
  _expanded = !_expanded;
  renderCheersCard();
};

window._cheersOpenFriend = (uid) => {
  if (!uid) return;
  if (window.openFriendProfile) window.openFriendProfile(uid);
};

window._cheersRefresh = () => {
  try {
    const removals = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) removals.push(k);
    }
    removals.forEach((k) => sessionStorage.removeItem(k));
  } catch (_) { /* ignore */ }
  renderCheersCard();
};

// ── 테스트 훅 (런타임 단위 검증용) ───────────────────────────────
// production에서도 export 되지만 일반 사용자는 호출할 일 없음.
export const __test__ = {
  _capPerUid,
  _pickTopByCategory,
  _composeUserItems,
  _computeActivePool,
  _selectCandidateUids,
  _resolveEnabledSet,
  _signatureFor,
  _groupByUidForDisplay,
  _resolveExerciseName,
  constants: { MAX_PER_UID, MAX_TOTAL, ACTIVE_WINDOW_MS, FRESH_CANDIDATE_TOP_K, CACHE_PREFIX, AUTO_TTL_MS },
};
