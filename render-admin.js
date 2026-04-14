import {
  isAdmin, isAdminInstance, getAnalytics, dateKey, TODAY,
} from './data.js';
import {
  db, collection, getDocs, query, where, documentId,
} from './data/data-core.js';
import { nameResolver } from './admin/admin-utils.js';
import { withCache, invalidateCache, DEFAULT_TTL_MS } from './admin/admin-cache.js';

let _adminData = null;
let _currentSection = 'home';
let _outreachPrefillUid = '';
let _outreachPrefillMessage = '';
let _outreachPrefillChannel = '';
let _sectionPromise = null;
let _segmentationPromise = null;

const SECTIONS = [
  { id: 'home', label: '홈' },
  { id: 'members', label: '인간&행동' },
  { id: 'community', label: '커뮤니티' },
  { id: 'outreach', label: '아웃리치' },
  { id: 'settings', label: '설정' },
];

const _moduleCache = {};
async function _loadSection(id) {
  if (_moduleCache[id]) return _moduleCache[id];
  let mod;
  switch (id) {
    case 'home':     mod = await import('./admin/admin-overview.js'); break;
    case 'members':  mod = await import('./admin/admin-users.js'); break;
    case 'community':mod = await import('./admin/admin-social.js'); break;
    case 'outreach': mod = await import('./admin/admin-outreach.js'); break;
    case 'settings': mod = await import('./admin/admin-actions.js'); break;
    default:         mod = await import('./admin/admin-overview.js'); break;
  }
  _moduleCache[id] = mod;
  return mod;
}

async function _loadExport() {
  if (_moduleCache.export) return _moduleCache.export;
  _moduleCache.export = await import('./admin/admin-export.js');
  return _moduleCache.export;
}

async function _loadSegmentation() {
  if (_moduleCache.segmentation) return _moduleCache.segmentation;
  _moduleCache.segmentation = await import('./admin/admin-segmentation.js');
  return _moduleCache.segmentation;
}

function _dk(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function _daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

function _chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function _getRecentWorkouts(userId, dateKeys) {
  const workouts = [];
  const batches = _chunk(dateKeys, 30);
  for (const batch of batches) {
    if (!batch.length) continue;
    const snap = await getDocs(query(
      collection(db, 'users', userId, 'workouts'),
      where(documentId(), 'in', batch),
    ));
    snap.forEach((docSnap) => workouts.push({ dk: docSnap.id, w: docSnap.data() }));
  }
  return workouts;
}

function _hasActivity(w) {
  if (!w) return false;
  return !!(w.exercises?.length || w.cf || w.swimming || w.running ||
    w.bFoods?.length || w.lFoods?.length || w.dFoods?.length || w.sFoods?.length);
}

function _hasExercise(w) {
  if (!w) return false;
  return !!(w.exercises?.length || w.cf || w.swimming || w.running);
}

function _hasDiet(w) {
  if (!w) return false;
  return !!(w.bFoods?.length || w.lFoods?.length || w.dFoods?.length || w.sFoods?.length);
}

async function _fetchBase() {
  const [accSnap, analytics] = await Promise.all([
    getDocs(collection(db, '_accounts')),
    getAnalytics(30),
  ]);
  const accs = []; accSnap.forEach((d) => accs.push(d.data()));
  const realAccs = accs.filter((a) => (
    a.id && !a.id.includes('(guest)') && !isAdminInstance(a.id)
  ));
  return { accs, realAccs, analytics };
}

async function _fetchSocial() {
  const [frSnap, gbSnap, lkSnap, ltSnap, pnSnap] = await Promise.all([
    getDocs(collection(db, '_friend_requests')),
    getDocs(collection(db, '_guestbook')),
    getDocs(collection(db, '_likes')),
    getDocs(collection(db, '_letters')),
    getDocs(collection(db, '_patchnotes')),
  ]);
  const frs = []; frSnap.forEach((d) => frs.push(d.data()));
  const gbs = []; gbSnap.forEach((d) => gbs.push(d.data()));
  const lks = []; lkSnap.forEach((d) => lks.push(d.data()));
  const letters = []; ltSnap.forEach((d) => letters.push(d.data()));
  const patchnotes = []; pnSnap.forEach((d) => patchnotes.push(d.data()));
  letters.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  patchnotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { frs, gbs, lks, letters, patchnotes };
}

async function _fetchWorkouts(realAccs, dateKeys30) {
  const workoutMap = Object.fromEntries(dateKeys30.map((key) => [key, {}]));
  const workoutResults = await Promise.all(
    realAccs.map(async (acc) => ({
      uid: acc.id,
      workouts: await _getRecentWorkouts(acc.id, dateKeys30),
    })),
  );
  workoutResults.forEach(({ uid, workouts }) => {
    workouts.forEach(({ dk, w }) => {
      workoutMap[dk][uid] = {
        exercise: _hasExercise(w),
        diet: _hasDiet(w),
        any: _hasActivity(w),
      };
    });
  });
  return workoutMap;
}

async function _loadCoreData() {
  // NOTE: persist: true 를 붙이지 않는 이유 — 반환값에 resolveName(function)이 포함되어
  // JSON 직렬화가 불가능하고, 데이터 부피(수백 KB)도 sessionStorage 쓰기 비용이 크다.
  // 메모리 TTL 캐시만으로 탭 재진입 케이스는 충분히 커버된다.
  return withCache('admin:core', DEFAULT_TTL_MS, async () => {
    const dateKeys30 = [];
    for (let i = 0; i < 30; i++) dateKeys30.push(_dk(_daysAgo(i)));

    const [base, social] = await Promise.all([_fetchBase(), _fetchSocial()]);
    const workoutMap = await _fetchWorkouts(base.realAccs, dateKeys30);

    const resolveName = nameResolver(base.accs);
    return {
      ...base,
      ...social,
      unreadLetters: social.letters.filter((l) => !l.read).length,
      workoutMap,
      dateKeys30,
      resolveName,
    };
  });
}

async function _ensureSegmentation(data) {
  if (data.segmentSummary && data.userSegments) return data;
  if (_segmentationPromise) return _segmentationPromise;
  _segmentationPromise = (async () => {
    const { buildSegmentSummary } = await _loadSegmentation();
    const segmentSummary = buildSegmentSummary(
      data.realAccs, data.workoutMap, data.dateKeys30, data.analytics,
      { likes: data.lks, guestbook: data.gbs },
    );
    const userSegments = Object.fromEntries(
      segmentSummary.actionQueue.map((item) => [item.uid, item]),
    );
    data.segmentSummary = segmentSummary;
    data.userSegments = userSegments;
    return data;
  })();
  try {
    return await _segmentationPromise;
  } finally {
    _segmentationPromise = null;
  }
}

async function _renderCurrentSection() {
  const container = document.getElementById('admin-section-container');
  if (!container || !_adminData) return;

  container.innerHTML = '<div style="padding:24px;color:var(--hig-gray1);">섹션 로드 중...</div>';

  const thisLoad = _sectionPromise = (async () => {
    const sectionId = _currentSection;
    const needsSegmentation = sectionId === 'home' || sectionId === 'members' || sectionId === 'outreach';
    const [mod] = await Promise.all([
      _loadSection(sectionId),
      needsSegmentation ? _ensureSegmentation(_adminData) : Promise.resolve(),
    ]);
    if (thisLoad !== _sectionPromise) return;

    switch (sectionId) {
      case 'home':
        mod.renderDashboardSection(container, _adminData, {
          openCompose: (uid, message = '') => window._adminOpenComposeForUser(uid, message),
        });
        break;
      case 'members':
        mod.renderPeopleSection(container, _adminData, {
          openCompose: (uid) => window._adminOpenComposeForUser(uid, ''),
        });
        break;
      case 'community':
        mod.renderSocialSection(container, _adminData);
        break;
      case 'outreach':
        mod.renderOutreachSection(container, _adminData, {
          prefillUid: _outreachPrefillUid,
          prefillMessage: _outreachPrefillMessage,
          prefillChannel: _outreachPrefillChannel,
        });
        _outreachPrefillUid = '';
        _outreachPrefillMessage = '';
        _outreachPrefillChannel = '';
        break;
      case 'settings':
        mod.renderSettingsSection(container, _adminData, renderAdmin);
        break;
      default:
        mod.renderDashboardSection(container, _adminData, {
          openCompose: (uid, message = '') => window._adminOpenComposeForUser(uid, message),
        });
        break;
    }
  })();

  try {
    await thisLoad;
  } catch (error) {
    console.error('[admin] section render error:', error);
    if (thisLoad === _sectionPromise) {
      container.innerHTML = `<div style="padding:24px;color:var(--primary);">섹션 로드 실패: ${error.message}</div>`;
    }
  }
}

function _switchSection(sectionId) {
  _currentSection = sectionId;
  document.querySelectorAll('.admin-seg-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.section === sectionId);
  });
  _renderCurrentSection();
}

window._adminSwitchSection = _switchSection;

window._adminOpenComposeForUser = (uid, suggestedMessage = '') => {
  _outreachPrefillUid = uid || '';
  _outreachPrefillMessage = suggestedMessage || '';
  _outreachPrefillChannel = (suggestedMessage || '').includes('복귀') ? 'comeback' : 'push';
  _switchSection('outreach');
};

window._adminToggleExportMenu = function() {
  const menu = document.getElementById('admin-export-menu');
  if (!menu || !_adminData) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) {
    menu.style.display = 'none';
    return;
  }

  const buttonStyle = 'display:flex;align-items:center;justify-content:space-between;width:100%;background:transparent;border:none;color:var(--hig-text);padding:10px 12px;border-radius:8px;cursor:pointer;';
  menu.innerHTML = `
    <button style="${buttonStyle}" onclick="window._adminExport('ai_json')">AI JSON <span>↓</span></button>
    <button style="${buttonStyle}" onclick="window._adminExport('all_csv')">All CSV <span>↓</span></button>
    <button style="${buttonStyle}" onclick="window._adminExport('users')">Users CSV <span>↓</span></button>
    <button style="${buttonStyle}" onclick="window._adminExport('daily')">Daily CSV <span>↓</span></button>
    <button style="${buttonStyle}" onclick="window._adminExport('social')">Social CSV <span>↓</span></button>
    <button style="${buttonStyle}" onclick="window._adminExport('letters')">Letters CSV <span>↓</span></button>
  `;
  menu.style.display = 'block';

  const close = (event) => {
    if (!menu.contains(event.target) && event.target.id !== 'admin-export-button') {
      menu.style.display = 'none';
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
};

window._adminExport = async function(type) {
  if (!_adminData) return;
  const menu = document.getElementById('admin-export-menu');
  if (menu) menu.style.display = 'none';

  await _ensureSegmentation(_adminData);
  const xp = await _loadExport();
  switch (type) {
    case 'users': xp.exportUsersReport(_adminData); break;
    case 'daily': xp.exportDailyActivity(_adminData); break;
    case 'social': xp.exportSocialInteractions(_adminData); break;
    case 'letters': xp.exportLettersAndPatchnotes(_adminData); break;
    case 'all_csv': xp.exportAll(_adminData); break;
    case 'ai_json': xp.exportAIJson(_adminData); break;
    default: break;
  }
};

window._adminRefreshCache = function() {
  invalidateCache('admin:core');
  _adminData = null;
  renderAdmin();
};

export async function renderAdmin() {
  const root = document.getElementById('admin-container');
  if (!root) return;
  if (!isAdmin()) {
    root.innerHTML = '<div style="padding:40px;text-align:center;color:#8E8E93;">관리자 전용 페이지입니다.</div>';
    return;
  }

  root.innerHTML = '<div style="padding:32px;color:#8E8E93;">로딩 중...</div>';

  try {
    _adminData = await _loadCoreData();
    window.__adminDataCache = _adminData;

    root.innerHTML = `
      <div style="padding:16px 16px 110px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:18px;">🍅</div>
          <div style="flex:1;">
            <div class="hig-headline">Admin Console</div>
            <div class="hig-caption1" style="color:var(--hig-gray1);">TDS Mobile Segmentation + Outreach</div>
          </div>
          <div style="position:relative;">
            <button id="admin-export-button" class="hig-btn-secondary" onclick="window._adminToggleExportMenu()">내보내기</button>
            <div id="admin-export-menu" style="display:none;position:absolute;right:0;top:42px;z-index:10;min-width:220px;border:1px solid var(--hig-separator);border-radius:10px;background:var(--hig-surface-elevated);padding:6px;"></div>
          </div>
        </div>

        <div class="hig-segmented-control" style="margin-bottom:14px;overflow:auto;">
          ${SECTIONS.map((section) => `
            <button class="admin-seg-btn ${section.id === _currentSection ? 'is-active' : ''}" data-section="${section.id}" onclick="window._adminSwitchSection('${section.id}')">
              ${section.label}${section.id === 'outreach' && _adminData.unreadLetters > 0 ? ` (${_adminData.unreadLetters})` : ''}
            </button>
          `).join('')}
        </div>

        <div id="admin-section-container"></div>
      </div>
    `;

    _renderCurrentSection();
  } catch (error) {
    console.error('[admin] render error:', error);
    root.innerHTML = `<div style="padding:40px;color:var(--primary);">Admin 로드 실패: ${error.message}</div>`;
  }
}
