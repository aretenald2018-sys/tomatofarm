// ================================================================
// render-admin.js — 토마토어드민 오케스트레이터 (세그먼티드 컨트롤 + 섹션 전환)
// ================================================================

import {
  isAdmin, getAnalytics, dateKey, TODAY,
} from './data.js';
import {
  db, doc, getDoc, collection, getDocs,
} from './data/data-core.js';
import { renderOverviewSection } from './admin/admin-overview.js';
import { renderUsersSection } from './admin/admin-users.js';
import { renderEngagementSection } from './admin/admin-engagement.js';
import { renderSocialSection } from './admin/admin-social.js';
import { renderActionsSection, setRerender } from './admin/admin-actions.js';
import {
  exportUsersReport, exportDailyActivity,
  exportSocialInteractions, exportLettersAndPatchnotes,
  exportAll, exportAIJson,
} from './admin/admin-export.js';

// ── 세션 캐시 ────────────────────────────────────────────────────
let _adminData = null;
let _currentSection = 'overview';

const SECTIONS = [
  { id: 'overview',   label: '오버뷰' },
  { id: 'users',      label: '유저' },
  { id: 'engagement', label: '인게이지먼트' },
  { id: 'social',     label: '소셜' },
  { id: 'actions',    label: '관리도구' },
];

// ── 메인 렌더 ────────────────────────────────────────────────────
export async function renderAdmin() {
  const el = document.getElementById('admin-container');
  if (!el) return;
  if (!isAdmin()) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);">관리자 전용입니다.</div>';
    return;
  }

  el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary);">
    <div style="font-size:24px;margin-bottom:8px;">🍅</div>불러오는 중...
  </div>`;

  try {
    // 데이터 로드 (최초 1회 또는 리렌더)
    _adminData = await _loadData();
    setRerender(renderAdmin);

    // 레이아웃
    el.innerHTML = `
    <div style="padding:16px 16px 100px;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button onclick="window.switchTab('home')" style="width:36px;height:36px;border:none;border-radius:10px;background:var(--surface2,#F2F4F6);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;flex-shrink:0;" title="홈으로 나가기">←</button>
        <div style="width:40px;height:40px;border-radius:12px;background:#fa342c;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:800;">🍅</div>
        <div style="flex:1;">
          <div style="font-size:17px;font-weight:700;color:var(--text);">토마토어드민</div>
          <div style="font-size:12px;color:var(--text-tertiary);">데이터 분석 대시보드</div>
        </div>
        <div style="position:relative;flex-shrink:0;">
          <button id="admin-export-btn" onclick="window._adminToggleExportMenu()" style="width:36px;height:36px;border:none;border-radius:10px;background:var(--surface2,#F2F4F6);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;" title="데이터 내보내기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <div id="admin-export-menu" style="display:none;position:absolute;right:0;top:42px;z-index:100;min-width:220px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:6px;"></div>
        </div>
      </div>

      <!-- 세그먼티드 컨트롤 -->
      <div id="admin-seg-ctrl" style="display:flex;gap:2px;background:var(--surface2,#F2F4F6);border-radius:14px;padding:4px 5px;margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
        ${SECTIONS.map(s => `
          <button class="admin-seg-btn" data-section="${s.id}" onclick="window._adminSwitchSection('${s.id}')"
            style="flex:1;min-width:0;padding:7px 8px;border:none;border-radius:12px;font-size:11px;font-weight:${s.id === _currentSection ? '600' : '500'};color:${s.id === _currentSection ? 'var(--text)' : 'var(--text-tertiary)'};background:${s.id === _currentSection ? 'var(--surface)' : 'transparent'};${s.id === _currentSection ? 'box-shadow:0 1px 2px 0 rgba(0,0,0,0.09);' : ''}cursor:pointer;transition:color 0.2s ease;white-space:nowrap;">
            ${s.label}${s.id === 'actions' && _adminData.unreadLetters > 0 ? ` <span style="font-size:9px;background:#ef4444;color:#fff;border-radius:999px;padding:1px 5px;font-weight:700;">${_adminData.unreadLetters}</span>` : ''}
          </button>
        `).join('')}
      </div>

      <!-- 섹션 컨테이너 -->
      <div id="admin-section-container"></div>
    </div>`;

    // 현재 섹션 렌더
    _renderSection(_currentSection);

  } catch (e) {
    console.error('[admin] render error:', e);
    el.innerHTML = `<div style="padding:40px;text-align:center;">
      <div style="color:#ef4444;font-size:14px;font-weight:600;">로드 실패</div>
      <div style="color:var(--text-tertiary);font-size:12px;margin-top:8px;">${e.message}</div>
    </div>`;
  }
}

// ── 섹션 전환 ────────────────────────────────────────────────────
window._adminSwitchSection = function(sectionId) {
  _currentSection = sectionId;

  // 세그먼티드 컨트롤 시각 업데이트
  document.querySelectorAll('.admin-seg-btn').forEach(btn => {
    const active = btn.dataset.section === sectionId;
    btn.style.fontWeight = active ? '600' : '500';
    btn.style.color = active ? 'var(--text)' : 'var(--text-tertiary)';
    btn.style.background = active ? 'var(--surface)' : 'transparent';
    btn.style.boxShadow = active ? '0 1px 2px 0 rgba(0,0,0,0.09)' : 'none';
  });

  _renderSection(sectionId);
};

// ── 내보내기 메뉴 ────────────────────────────────────────────────
window._adminToggleExportMenu = function() {
  const menu = document.getElementById('admin-export-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) { menu.style.display = 'none'; return; }

  const MENU_STYLE = 'display:flex;align-items:center;gap:10px;padding:10px 14px;border:none;width:100%;background:transparent;border-radius:10px;font-size:12px;font-weight:500;color:var(--text);cursor:pointer;text-align:left;';
  const HOVER = 'onmouseover="this.style.background=\'var(--surface2,#F2F4F6)\'" onmouseout="this.style.background=\'transparent\'"';
  const SEP = '<div style="height:1px;background:var(--border);margin:2px 8px;"></div>';

  menu.innerHTML = `
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('ai_json')">
      <span style="font-size:16px;">🤖</span> AI 분석용 종합 (JSON)
    </button>
    ${SEP}
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('all_csv')">
      <span style="font-size:16px;">📦</span> 전체 CSV 다운로드 (4개)
    </button>
    ${SEP}
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('users')">
      <span style="font-size:16px;">👥</span> 유저 리포트 CSV
    </button>
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('daily')">
      <span style="font-size:16px;">📊</span> 일별 활동 CSV
    </button>
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('social')">
      <span style="font-size:16px;">💬</span> 소셜 인터랙션 CSV
    </button>
    <button style="${MENU_STYLE}" ${HOVER} onclick="window._adminExport('letters')">
      <span style="font-size:16px;">💌</span> 편지/패치노트 CSV
    </button>
  `;
  menu.style.display = 'block';

  // 바깥 클릭 시 닫기
  const _close = (e) => {
    if (!menu.contains(e.target) && e.target.id !== 'admin-export-btn') {
      menu.style.display = 'none';
      document.removeEventListener('click', _close);
    }
  };
  setTimeout(() => document.addEventListener('click', _close), 0);
};

window._adminExport = function(type) {
  const menu = document.getElementById('admin-export-menu');
  if (menu) menu.style.display = 'none';
  if (!_adminData) return;

  switch (type) {
    case 'users':    exportUsersReport(_adminData); break;
    case 'daily':    exportDailyActivity(_adminData); break;
    case 'social':   exportSocialInteractions(_adminData); break;
    case 'letters':  exportLettersAndPatchnotes(_adminData); break;
    case 'all_csv':  exportAll(_adminData); break;
    case 'ai_json':  exportAIJson(_adminData); break;
  }
};

function _renderSection(sectionId) {
  const container = document.getElementById('admin-section-container');
  if (!container || !_adminData) return;

  switch (sectionId) {
    case 'overview':
      renderOverviewSection(container, _adminData);
      break;
    case 'users':
      renderUsersSection(container, _adminData);
      break;
    case 'engagement':
      renderEngagementSection(container, _adminData);
      break;
    case 'social':
      renderSocialSection(container, _adminData);
      break;
    case 'actions':
      renderActionsSection(container, _adminData, renderAdmin);
      break;
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────
function _dk(d) { return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }
function _daysAgo(n) { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; }

async function _getWorkout(userId, dk) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'workouts', dk));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
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

// ── 데이터 로딩 ──────────────────────────────────────────────────
async function _loadData() {
  // 1단계: 글로벌 컬렉션 + analytics 병렬 로드
  const [accSnap, frSnap, gbSnap, lkSnap, ltSnap, pnSnap, analytics] = await Promise.all([
    getDocs(collection(db, '_accounts')),
    getDocs(collection(db, '_friend_requests')),
    getDocs(collection(db, '_guestbook')),
    getDocs(collection(db, '_likes')),
    getDocs(collection(db, '_letters')),
    getDocs(collection(db, '_patchnotes')),
    getAnalytics(30),
  ]);

  const accs = []; accSnap.forEach(d => accs.push(d.data()));
  const frs = [];  frSnap.forEach(d => frs.push(d.data()));
  const gbs = [];  gbSnap.forEach(d => gbs.push(d.data()));
  const lks = [];  lkSnap.forEach(d => lks.push(d.data()));
  const letters = []; ltSnap.forEach(d => letters.push(d.data()));
  const patchnotes = []; pnSnap.forEach(d => patchnotes.push(d.data()));

  letters.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  patchnotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const realAccs = accs.filter(a => a.id && !a.id.includes('(guest)'));
  const unreadLetters = letters.filter(l => !l.read).length;

  // 2단계: 최근 30일 워크아웃 데이터 병렬 로드
  // workoutMap[dateKey][userId] = { exercise: bool, diet: bool, any: bool, raw: workoutData }
  const workoutMap = {};
  const dateKeys30 = [];
  for (let i = 0; i < 30; i++) {
    const d = _daysAgo(i);
    dateKeys30.push(_dk(d));
  }

  // 유저 × 날짜 전부 병렬 로드
  const workoutPromises = [];
  for (const dk of dateKeys30) {
    for (const acc of realAccs) {
      workoutPromises.push(
        _getWorkout(acc.id, dk).then(w => ({ dk, uid: acc.id, w }))
      );
    }
  }

  const workoutResults = await Promise.all(workoutPromises);
  for (const { dk, uid, w } of workoutResults) {
    if (!workoutMap[dk]) workoutMap[dk] = {};
    workoutMap[dk][uid] = {
      exercise: _hasExercise(w),
      diet: _hasDiet(w),
      any: _hasActivity(w),
      raw: w,
    };
  }

  return {
    accs, realAccs, frs, gbs, lks,
    letters, patchnotes,
    analytics, unreadLetters,
    workoutMap, dateKeys30,
  };
}
