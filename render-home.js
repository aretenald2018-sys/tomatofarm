// ================================================================
// render-home.js
// ================================================================

import { MUSCLES, DAYS }                             from './config.js';
import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         getExercises, getExList,
         calcStreaks, getGoals,
         getQuests, dateKey, getMiniMemoItems,
         getSectionTitle, getQuestOrder, saveQuestOrder,
         getDietPlan, calcDietMetrics, getBodyCheckins,
         getHomeStreakDays, saveHomeStreakDays,
         getGymSkip, getGymHealth, getCFHealth,
         getBreakfastSkipped, getLunchSkipped, getDinnerSkipped,
         isFuture, isToday,
         getUnitGoalStart, saveUnitGoalStart,
         getDayTargetKcal,
         getMyFriends, getPendingRequests, getMyNotifications,
         getFriendWorkout, getAccountList, getCurrentUser,
         sendFriendRequest, acceptFriendRequest, removeFriend,
         toggleLike, getLikes, markNotificationRead,
         shouldShow, isAdmin,
         getTomatoState, saveTomatoState, saveTomatoCycle,
         getTomatoCycles, sendTomatoGift,
         getFarmState, saveFarmState, getFarmShopItems, buyFarmItem,
         placeFarmItem, removeFarmItem, moveFarmCharacter,
         getGuestbook, writeGuestbook, deleteGuestbookEntry,
         introduceFriend, getDisplayName }  from './data.js';
import { calcTomatoCycle, evaluateCycleResult, getQuarterKey,
         isDietDaySuccess, getDayTargetKcal as calcDayTarget }  from './calc.js';
import { renderFarm, canvasClickToGrid }  from './farm-canvas.js';
import { openSheet }                                 from './sheet.js';

export function renderHome() {
  try {
    _applyCardVisibility();
    if (!isAdmin()) {
      try { _settleTomatoCycleIfNeeded(); } catch(e) { console.warn('[tomato] settle error:', e); }
      try { _renderTomatoCard(); } catch(e) { console.warn('[tomato] card error:', e); _renderHero(); }
    } else {
      _renderHero();
    }
    // 게스트는 통합 카드에 목표달성이 포함됨 → 별도 렌더 불필요
    if (isAdmin() && shouldShow('homeCards', 'unit_goal'))  _renderUnitGoal();
    if (shouldShow('homeCards', 'mini_memo'))  _renderMiniMemo();
    _applyAllSectionTitles();
    if (shouldShow('homeCards', 'goals'))      _renderGoals();
    if (shouldShow('homeCards', 'quests'))     { _renderQuests(); _initQuestDragDrop(); }
    if (shouldShow('homeCards', 'diet_goal'))  _renderDietGoalCard();
    _renderFriendFeed();
  } catch(e) {
    console.error('[renderHome] 렌더링 오류:', e);
  }
}

function _applyCardVisibility() {
  const map = {
    unit_goal: 'card-unit-goal',
    mini_memo: 'card-mini-memo',
    goals:     'card-goals',
    quests:    'card-quests',
    diet_goal: 'card-diet-goal',
    tomato_basket: 'card-tomato-basket',
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.style.display = shouldShow('homeCards', key) ? '' : 'none';
  }
}

// ── 히어로 카드 (토스 스타일 핵심 메시지) ─────────────────────────
function _renderHero() {
  const el = document.getElementById('hero-content');
  if (!el) return;

  if (!isAdmin()) {
    _renderTomatoHero(el);
    return;
  }

  const { workout, diet } = calcStreaks();
  const mainStreak = Math.max(workout, diet);
  const streakLabel = workout >= diet ? '운동' : '식단';
  const streakEmoji = mainStreak >= 7 ? '🔥' : mainStreak >= 3 ? '💪' : '👋';

  // 오늘 날짜
  const m = TODAY.getMonth() + 1;
  const d = TODAY.getDate();
  const dow = ['일','월','화','수','목','금','토'][TODAY.getDay()];

  let message = '';
  if (mainStreak >= 7) message = `대단해요! ${streakLabel} ${mainStreak}일 연속`;
  else if (mainStreak >= 3) message = `좋은 흐름이에요. ${streakLabel} ${mainStreak}일째`;
  else if (mainStreak >= 1) message = `${streakLabel} ${mainStreak}일째, 이어가 볼까요?`;
  else message = '오늘부터 시작해볼까요?';

  el.innerHTML = `
    <div class="hero-date">${m}월 ${d}일 ${dow}요일</div>
    <div class="hero-streak">${streakEmoji} ${mainStreak}<span class="hero-streak-unit">일</span></div>
    <div class="hero-message">${message}</div>
    <div class="hero-sub-streaks">
      <span class="hero-sub">🏋️ 운동 ${workout}일</span>
      <span class="hero-sub-dot">·</span>
      <span class="hero-sub">🥗 식단 ${diet}일</span>
    </div>
  `;
}

// ── 스트릭 대시보드 ──────────────────────────────────────────────
function _renderDashboard() {
  const { workout, diet, stretching, wineFree } = calcStreaks();
  const cfStreak = _calcCFStreak();

  _setText('dash-workout-streak',  workout);
  _setText('dash-diet-streak',     diet);
  _setText('dash-cf-streak',       cfStreak);
  _setText('dash-stretch-streak',  stretching);
  _setText('dash-wine-free-streak',wineFree);
}

function _calcCFStreak() {
  let streak = 0;
  const cur  = new Date(TODAY);
  while (true) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!getCF(y, m, d)) break;
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

// ── 주간 스트릭 미니 캘린더 ───────────────────────────────────────
function _renderWeeklyStreak() {
  const container = document.getElementById('weekly-streak-grid');
  const label     = document.getElementById('home-streak-days-label');
  if (!container) return;

  const n = getHomeStreakDays(); // 0~6
  window._homeStreakDays = n;
  const totalDays = n + 1;

  // 스테퍼 라벨 업데이트
  if (label) label.textContent = `${totalDays}일`;

  // 이번 주 월요일 구하기
  const monday = _getMonday(TODAY);
  const dates = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  // 헤더 행
  let html = '<table class="weekly-streak-table"><thead><tr><th></th>';
  dates.forEach(d => {
    const dow = d.getDay();
    const col = dow === 0 ? '#f87171' : dow === 6 ? '#60a5fa' : 'var(--muted2)';
    const today = isToday(d.getFullYear(), d.getMonth(), d.getDate());
    html += `<th class="${today ? 'ws-today-col' : ''}"><span style="color:${col};font-size:9px;display:block">${DAYS[dow]}</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${col}">${d.getDate()}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  // 행 데이터: 헬스, 크핏, 식단
  const rows = [
    { label: '🏋️', key: 'gym' },
    { label: '🔥', key: 'cf' },
    { label: '🥗', key: 'diet' },
  ];

  rows.forEach(r => {
    html += `<tr><td class="ws-row-label">${r.label}</td>`;
    dates.forEach(d => {
      const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
      const future = isFuture(y, m, dd);
      const today  = isToday(y, m, dd);
      let cls = 'ws-cell';
      let icon = '';

      if (future) {
        cls += ' ws-future';
      } else if (r.key === 'gym') {
        const muscles   = getMuscles(y, m, dd);
        const gymHealth = getGymHealth(y, m, dd);
        const gymSkip   = getGymSkip(y, m, dd);
        if (gymHealth) {
          cls += ' health-issue'; icon = '✚';
        } else if (muscles.length) {
          cls += ' gym-on'; icon = '✓';
        } else if (gymSkip) {
          cls += ' skip-disabled'; icon = '❌';
        }
      } else if (r.key === 'cf') {
        const cfHealth = getCFHealth(y, m, dd);
        if (cfHealth) {
          cls += ' health-issue'; icon = '✚';
        } else if (getCF(y, m, dd)) {
          cls += ' cf-on'; icon = '✓';
        }
      } else if (r.key === 'diet') {
        const dok = dietDayOk(y, m, dd);
        const bS = getBreakfastSkipped(y, m, dd);
        const lS = getLunchSkipped(y, m, dd);
        const dS = getDinnerSkipped(y, m, dd);
        if (dok === true) {
          cls += ' diet-ok'; icon = '✓';
        } else if (bS || lS || dS) {
          cls += ' diet-skipped'; icon = '✚';
        } else if (dok === false) {
          cls += ' diet-bad'; icon = '❌';
        }
      }

      if (today) cls += ' ws-today';

      html += `<td><div class="${cls}" onclick="window.openSheet(${y},${m},${dd})">${icon}</div></td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

window.changeHomeStreakDays = async function(n) {
  const clamped = Math.max(0, Math.min(6, n));
  await saveHomeStreakDays(clamped);
  _renderWeeklyStreak();
};

// ── 단위 목표달성 정보 (4일 사이클) ──────────────────────────────
function _renderUnitGoal() {
  const container = document.getElementById('unit-goal-content');
  if (!container) return;

  const plan = getDietPlan();
  const metrics = calcDietMetrics(plan);

  // 시작일 결정: 저장된 값 → 없으면 오늘
  let startStr = getUnitGoalStart();
  if (!startStr) {
    startStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    saveUnitGoalStart(startStr);
  }

  // 4일 사이클 자동 진행: 현재 사이클의 시작일 계산
  const startDate = new Date(startStr + 'T00:00:00');
  const todayMs   = new Date(dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) + 'T00:00:00').getTime();
  const diffDays  = Math.floor((todayMs - startDate.getTime()) / 86400000);

  let cycleStart;
  if (diffDays < 0) {
    // 미래 시작일 → 그대로 사용
    cycleStart = startDate;
  } else {
    // 4일 단위로 자동 진행
    const cycleOffset = Math.floor(diffDays / 4) * 4;
    cycleStart = new Date(startDate);
    cycleStart.setDate(cycleStart.getDate() + cycleOffset);
  }

  // 4일 날짜 배열
  const days = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(cycleStart);
    d.setDate(cycleStart.getDate() + i);
    days.push(d);
  }

  // 각 날의 데이터 수집 (칼로리 + 매크로)
  const dayData = days.map(d => {
    const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
    const future = isFuture(y, m, dd);
    const diet = getDiet(y, m, dd);
    const intake = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = getDayTargetKcal(plan, y, m, dd);

    // 매크로 실제 섭취량: 끼니별로 foods 배열 우선, 없으면 직접 필드(AI 분석 결과) 사용
    const mealMacro = (prefix, prop) => {
      const foods = diet[`${prefix}Foods`] || [];
      if (foods.length > 0) return foods.reduce((s, f) => s + (f[prop] || 0), 0);
      const fieldMap = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
      return diet[`${prefix}${fieldMap[prop]}`] || 0;
    };
    const prefixes = ['b','l','d','s'];
    const actProtein = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'protein'), 0) * 10) / 10;
    const actCarbs   = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'carbs'), 0) * 10) / 10;
    const actFat     = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'fat'), 0) * 10) / 10;

    // 매크로 목표 (리피드/데피싯 판별)
    const dow = new Date(y, m, dd).getDay();
    const isRefeed = (plan.refeedDays || []).includes(dow);
    const macroTarget = isRefeed ? metrics.refeed : metrics.deficit;

    return {
      date: d, y, m, dd, intake, target, future,
      actProtein, actCarbs, actFat,
      tgtProtein: macroTarget.proteinG, tgtCarbs: macroTarget.carbG, tgtFat: macroTarget.fatG,
    };
  });

  // 합계 계산
  const recordedDays = dayData.filter(d => !d.future && d.intake > 0);
  const totalIntake  = dayData.reduce((s, d) => s + d.intake, 0);
  const totalTarget  = dayData.reduce((s, d) => s + d.target, 0);

  // 달성률 계산: intake ≤ target → 100%, 초과 → (target / intake) × 100
  const calcSuccess = (intake, target) => {
    if (intake <= 0) return null; // 기록 없음
    if (intake <= target) return 100;
    return Math.round((target / intake) * 100);
  };

  // 날짜 범위 문자열
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  const DOW = ['일','월','화','수','목','금','토'];
  const rangeStr = `${fmt(days[0])}(${DOW[days[0].getDay()]}) ~ ${fmt(days[3])}(${DOW[days[3].getDay()]})`;

  // 전체 달성률
  const totalSuccess = recordedDays.length > 0 ? calcSuccess(totalIntake, totalTarget) : null;

  // HTML 렌더
  let html = `<div class="unit-goal-range">${rangeStr}</div>`;
  html += `<table class="unit-goal-table"><thead><tr><th></th>`;

  // 헤더: D1~D4 + 합계
  days.forEach((d, i) => {
    const today = isToday(d.getFullYear(), d.getMonth(), d.getDate());
    html += `<th class="${today ? 'ug-today' : ''}"><span class="ug-day-label">D${i+1}</span><span class="ug-date-label">${fmt(d)}</span></th>`;
  });
  html += `<th class="ug-total-col"><span class="ug-day-label">합계</span></th></tr></thead><tbody>`;

  // 행 1: 섭취 칼로리
  html += `<tr class="ug-row-intake"><td class="ug-row-label">섭취</td>`;
  dayData.forEach(d => {
    if (d.future) {
      html += `<td class="ug-cell"><span class="ug-val muted">—</span></td>`;
    } else if (d.intake <= 0) {
      html += `<td class="ug-cell"><span class="ug-val muted">—</span></td>`;
    } else {
      const over = d.intake > d.target;
      html += `<td class="ug-cell"><span class="ug-val ${over ? 'over' : 'ok'}">${d.intake.toLocaleString()}</span><span class="ug-sub">/ ${d.target.toLocaleString()}</span></td>`;
    }
  });
  // 합계 열
  if (recordedDays.length > 0) {
    const over = totalIntake > totalTarget;
    html += `<td class="ug-cell ug-total-col"><span class="ug-val ${over ? 'over' : 'ok'}">${totalIntake.toLocaleString()}</span><span class="ug-sub">/ ${totalTarget.toLocaleString()}</span></td>`;
  } else {
    html += `<td class="ug-cell ug-total-col"><span class="ug-val muted">—</span></td>`;
  }
  html += `</tr>`;

  // 행 2: 달성률
  html += `<tr class="ug-row-pct"><td class="ug-row-label">달성</td>`;
  dayData.forEach(d => {
    const pct = d.future ? null : calcSuccess(d.intake, d.target);
    if (pct === null) {
      html += `<td class="ug-cell"><span class="ug-pct muted">—</span></td>`;
    } else {
      const cls = pct >= 100 ? 'perfect' : pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad';
      const icon = pct >= 100 ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : pct >= 90 ? '⚠️' : '❌';
      html += `<td class="ug-cell"><span class="ug-pct ${cls}">${pct}%</span><span class="ug-icon">${icon}</span></td>`;
    }
  });
  // 합계 달성률
  if (totalSuccess !== null) {
    const cls = totalSuccess >= 100 ? 'perfect' : totalSuccess >= 90 ? 'good' : totalSuccess >= 70 ? 'warn' : 'bad';
    const icon = totalSuccess >= 100 ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : totalSuccess >= 90 ? '⚠️' : '❌';
    html += `<td class="ug-cell ug-total-col"><span class="ug-pct ${cls}">${totalSuccess}%</span><span class="ug-icon">${icon}</span></td>`;
  } else {
    html += `<td class="ug-cell ug-total-col"><span class="ug-pct muted">—</span></td>`;
  }
  html += `</tr>`;

  // ── 매크로 행 (탄/단/지) ──
  const macroRows = [
    { label: '단', act: 'actProtein', tgt: 'tgtProtein', lessIsGood: false },
    { label: '탄', act: 'actCarbs',   tgt: 'tgtCarbs',   lessIsGood: true },
    { label: '지', act: 'actFat',     tgt: 'tgtFat',     lessIsGood: true },
  ];
  const fmtDelta = (actual, target, lessIsGood) => {
    if (actual <= 0) return { text: '—', cls: 'muted' };
    const diff = Math.round(actual - target);
    const pct  = target > 0 ? Math.round(((actual - target) / target) * 100) : 0;
    const sign = diff > 0 ? '+' : '';
    const cls  = diff > 0 ? 'macro-over' : diff < 0 ? (lessIsGood ? 'macro-ok' : 'macro-under') : 'macro-ok';
    const text = diff === 0 ? '±0g' : `${sign}${diff}g<span class="ug-macro-pct">${sign}${pct}%</span>`;
    return { text, cls };
  };

  macroRows.forEach(mr => {
    html += `<tr class="ug-row-macro"><td class="ug-row-label ug-macro-label">${mr.label}</td>`;
    let totAct = 0, totTgt = 0;
    dayData.forEach(d => {
      totTgt += d[mr.tgt];         // 칼로리와 동일하게 전체 4일 목표 합산 (미래일 포함)
      if (d.future) {
        html += `<td class="ug-cell"><span class="ug-macro muted">—</span></td>`;
      } else {
        const actual = d[mr.act], target = d[mr.tgt];
        const hasData = d.intake > 0;
        if (!hasData) {
          html += `<td class="ug-cell"><span class="ug-macro muted">—</span></td>`;
        } else {
          const delta = fmtDelta(actual, target, mr.lessIsGood);
          html += `<td class="ug-cell"><span class="ug-macro ${delta.cls}">${delta.text}</span></td>`;
          totAct += actual;
        }
      }
    });
    // 합계 매크로 (전체 4일 목표 대비 실제 섭취량)
    if (recordedDays.length > 0) {
      const delta = fmtDelta(totAct, totTgt, mr.lessIsGood);
      html += `<td class="ug-cell ug-total-col"><span class="ug-macro ${delta.cls}">${delta.text}</span></td>`;
    } else {
      html += `<td class="ug-cell ug-total-col"><span class="ug-macro muted">—</span></td>`;
    }
    html += `</tr>`;
  });

  html += `</tbody></table>`;

  // 목표 칼로리 미설정 시 안내
  if (!plan.weight || !plan.targetBodyFatPct) {
    html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">⚙️ 다이어트 플랜을 설정하면 목표 칼로리가 반영됩니다.</div>`;
  }

  container.innerHTML = html;
}

// ── 단위 목표 시작일 설정 ─────────────────────────────────────────
window.openUnitGoalDatePicker = function() {
  const current = getUnitGoalStart() || dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const [cy, cm, cd] = current.split('-').map(Number);
  let viewY = cy, viewM = cm - 1; // 0-indexed month

  function render() {
    const firstDay = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    let grid = '';
    // 빈 칸
    for (let i = 0; i < firstDay; i++) grid += '<div class="sdp-cell sdp-empty"></div>';
    // 날짜
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewY}-${String(viewM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isSelected = key === current;
      const isToday = viewY === TODAY.getFullYear() && viewM === TODAY.getMonth() && d === TODAY.getDate();
      let cls = 'sdp-cell sdp-day';
      if (isSelected) cls += ' sdp-selected';
      if (isToday) cls += ' sdp-today';
      grid += `<div class="${cls}" data-date="${key}">${d}</div>`;
    }

    const el = document.getElementById('seed-datepicker-body');
    if (!el) return;
    document.getElementById('sdp-month-label').textContent = `${viewY}년 ${monthNames[viewM]}`;
    el.innerHTML = grid;
  }

  // 모달 생성
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.id = 'seed-datepicker-modal';
  modal.style.zIndex = '1002';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal-sheet" style="max-width:360px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title">시작일 선택</div>
      <div class="sdp-nav">
        <button class="sdp-nav-btn" id="sdp-prev">&lt;</button>
        <span class="sdp-month-label" id="sdp-month-label"></span>
        <button class="sdp-nav-btn" id="sdp-next">&gt;</button>
      </div>
      <div class="sdp-header">
        <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
      </div>
      <div class="sdp-grid" id="seed-datepicker-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  // 이벤트
  modal.querySelector('#sdp-prev').onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); };
  modal.querySelector('#sdp-next').onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); };
  modal.querySelector('#seed-datepicker-body').addEventListener('click', async (e) => {
    const cell = e.target.closest('.sdp-day');
    if (!cell) return;
    const val = cell.dataset.date;
    await saveUnitGoalStart(val);
    _renderUnitGoal();
    renderHome();
    modal.remove();
  });

  render();
};

// ── 미니 메모 (체크리스트) ────────────────────────────────────────
function _renderMiniMemo() {
  const container = document.getElementById('mini-memo-list');
  if (!container) return;
  const items = getMiniMemoItems();
  if (!items.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0">항목을 추가해보세요</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="mini-memo-item ${item.checked ? 'checked' : ''}">
      <label class="mini-memo-check-label">
        <input type="checkbox" class="mini-memo-checkbox"
          ${item.checked ? 'checked' : ''}
          onchange="toggleMiniMemoItem('${item.id}')">
        <span class="mini-memo-text">${item.text}</span>
      </label>
      <button class="mini-memo-del-btn" onclick="deleteMiniMemoItem('${item.id}')">✕</button>
    </div>`).join('');
}

// ── 구역 제목 일괄 적용 ───────────────────────────────────────────
function _applyAllSectionTitles() {
  const keys = ['mini_memo','goals','quests','stocks'];
  keys.forEach(k => {
    const el = document.getElementById(`title-${k}`);
    if (el) el.textContent = getSectionTitle(k);
  });
}

// ── 목표 ─────────────────────────────────────────────────────────
function _renderGoals() {
  const container = document.getElementById('goals-section');
  if (!container) return;
  const goals = getGoals();
  if (!goals.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px">
      목표를 추가해보세요 <button class="quest-add-btn" onclick="openGoalModal()" style="margin-left:8px">+</button></div>`;
    return;
  }

  const todayStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  container.innerHTML = goals.map(g => {
    // D-day
    let ddayStr = '';
    if (g.dday) {
      const diff = Math.ceil((new Date(g.dday) - new Date(todayStr)) / 86400000);
      ddayStr = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : `D+${Math.abs(diff)}`;
    }

    // AI 분석 결과
    let aiHtml = '';
    if (g.aiAnalysis) {
      const { feasibility, realisticDate, summary } = g.aiAnalysis;
      const color = feasibility >= 70 ? 'var(--diet-ok)' : feasibility >= 40 ? 'var(--accent)' : 'var(--diet-bad)';
      aiHtml = `<div class="goal-ai-block" style="margin-top:8px;padding:8px;background:var(--surface2);border-radius:8px;font-size:11px;color:var(--muted)">
        <span style="color:${color};font-weight:700">${feasibility}% 달성 가능</span>
        ${realisticDate ? ` · 예상: ${realisticDate}` : ''}
        ${summary ? `<div style="margin-top:4px">${summary}</div>` : ''}
      </div>`;
    }

    return `<div class="goal-item">
      <div class="goal-item-header">
        <span class="goal-label">${g.label}</span>
        <div class="goal-item-actions">
          ${ddayStr ? `<span class="goal-dday">${ddayStr}</span>` : ''}
          <button class="goal-ai-btn" onclick="analyzeGoalFeasibility('${g.id}')" title="AI 분석">🤖</button>
          <button class="goal-del-btn" onclick="deleteGoalItem('${g.id}')">✕</button>
        </div>
      </div>
      ${aiHtml}
    </div>`;
  }).join('');

  container.innerHTML += `<div style="text-align:center;margin-top:10px">
    <button class="quest-add-btn" onclick="openGoalModal()" style="padding:4px 16px">+ 목표 추가</button>
  </div>`;
}

// ── 퀘스트 보드 ──────────────────────────────────────────────────
function _renderQuests() {
  const quests = getQuests();
  const order  = getQuestOrder();
  const now    = TODAY;
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // 각 타입별 컨테이너 렌더
  ['quarterly','monthly','weekly','daily'].forEach(type => {
    const container = document.getElementById(`${type}-quests`);
    if (!container) return;

    const list = order.includes(type) || true
      ? quests.filter(q => q.type === type)
      : [];

    if (!list.length) {
      container.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0;text-align:center">없음</div>';
      return;
    }

    container.innerHTML = list.map(q => {
      const { done, current, target } = _questProgress(q, now, todayKey);
      const pct = target > 1 ? Math.min(Math.round(current / target * 100), 100) : (done ? 100 : 0);
      const isAuto = q.auto;

      let ddayStr = '';
      if (q.dday) {
        const diff = Math.ceil((new Date(q.dday) - new Date(todayKey)) / 86400000);
        ddayStr = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '';
      }

      return `<div class="quest-item ${done ? 'done' : ''}">
        <div class="quest-item-main">
          ${!isAuto && type === 'daily'
            ? `<input type="checkbox" class="quest-check" ${done ? 'checked' : ''} onchange="toggleQuestCheck('${q.id}')">`
            : ''}
          <span class="quest-item-title">${q.title}${ddayStr ? ` <span class="goal-dday" style="font-size:9px">${ddayStr}</span>` : ''}</span>
          <button class="quest-item-edit" onclick="openQuestEditModal('${q.id}')">✏️</button>
          <button class="goal-del-btn" onclick="deleteQuestItem('${q.id}')">✕</button>
        </div>
        ${target > 1 ? `
          <div class="quest-progress-row">
            <div class="quest-prog-bar"><div class="quest-prog-fill" style="width:${pct}%"></div></div>
            <span class="quest-prog-label">${current}/${target}</span>
          </div>` : ''}
      </div>`;
    }).join('');
  });
}

function _questProgress(q, now, todayKey) {
  const checks = q.checks || {};
  const type   = q.type;

  if (type === 'daily') {
    if (q.auto) {
      const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
      const hasDone = q.autoType === 'workout'
        ? (getMuscles(y,m,d).length > 0 || getCF(y,m,d))
        : dietDayOk(y,m,d) === true;
      return { done: hasDone, current: hasDone ? 1 : 0, target: 1 };
    }
    const done = !!checks[todayKey];
    return { done, current: done ? 1 : 0, target: 1 };
  }

  // weekly / monthly / quarterly
  const keys   = Object.keys(checks).filter(k => checks[k]);
  let filtered = [];
  if (type === 'weekly') {
    const mon = _getMonday(now);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const monStr = dateKey(mon.getFullYear(), mon.getMonth(), mon.getDate());
    const sunStr = dateKey(sun.getFullYear(), sun.getMonth(), sun.getDate());
    filtered = keys.filter(k => k >= monStr && k <= sunStr);
  } else if (type === 'monthly') {
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    filtered = keys.filter(k => k.startsWith(prefix));
  } else {
    const qStart = _quarterStart(now);
    const qEnd   = _quarterEnd(now);
    filtered = keys.filter(k => k >= qStart && k <= qEnd);
  }

  if (q.auto) {
    // auto: count workout or diet days in period
    filtered = _autoCountInPeriod(q.autoType, type, now);
  }

  const current = filtered.length;
  const target  = q.target || 1;
  return { done: current >= target, current, target };
}

function _autoCountInPeriod(autoType, periodType, now) {
  let dates = [];
  if (periodType === 'weekly') {
    const mon = _getMonday(now);
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      dates.push([d.getFullYear(), d.getMonth(), d.getDate()]);
    }
  } else if (periodType === 'monthly') {
    const y = now.getFullYear(), m = now.getMonth();
    for (let d = 1; d <= new Date(y, m+1, 0).getDate(); d++) dates.push([y, m, d]);
  }
  return dates.filter(([y,m,d]) => {
    return autoType === 'workout'
      ? (getMuscles(y,m,d).length > 0 || getCF(y,m,d))
      : dietDayOk(y,m,d) === true;
  });
}

function _getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function _quarterStart(date) {
  const q = Math.floor(date.getMonth() / 3);
  return dateKey(date.getFullYear(), q * 3, 1);
}

function _quarterEnd(date) {
  const q = Math.floor(date.getMonth() / 3);
  const endMonth = q * 3 + 2;
  const endDay   = new Date(date.getFullYear(), endMonth + 1, 0).getDate();
  return dateKey(date.getFullYear(), endMonth, endDay);
}

// ── 다이어트 목표 카드 ────────────────────────────────────────────
function _renderDietGoalCard() {
  const container = document.getElementById('diet-goal-content');
  if (!container) return;

  const plan = getDietPlan();
  if (!plan._userSet || !plan.weight || !plan.targetBodyFatPct) {
    container.innerHTML = `<div style="text-align:center;padding:20px;">
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;">체중과 목표를 설정해주세요</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">신체 정보를 입력하면 맞춤 목표와<br>진행률을 확인할 수 있어요.</div>
      <button onclick="openDietPlanModal()" style="background:var(--primary);color:#fff;border:none;border-radius:var(--radius-md);padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;">설정하기</button>
    </div>`;
    return;
  }

  const metrics = calcDietMetrics(plan);
  const checkins = getBodyCheckins();
  const latest   = checkins.length ? checkins[checkins.length - 1] : null;

  // 현재 체중/체지방률 (최신 체크인 or 설정값)
  const curWeight = latest?.weight     ?? plan.weight;
  const curBF     = latest?.bodyFatPct ?? plan.bodyFatPct;

  // 체중 진행률
  const wStart    = plan.weight;
  const wTarget   = plan.targetWeight ?? (plan.weight - metrics.totalWeightLoss);
  const wProgress = wStart > wTarget
    ? Math.min(Math.round((wStart - curWeight) / (wStart - wTarget) * 100), 100)
    : 0;

  // 체지방률 진행률
  const bfStart   = plan.bodyFatPct;
  const bfTarget  = plan.targetBodyFatPct;
  const bfProgress= bfStart > bfTarget
    ? Math.min(Math.round((bfStart - curBF) / (bfStart - bfTarget) * 100), 100)
    : 0;

  // 예상 완료일
  const weeksLeft = metrics.weeksNeeded;
  const doneDate  = plan.startDate
    ? (() => {
        const d = new Date(plan.startDate);
        d.setDate(d.getDate() + Math.round(weeksLeft * 7));
        return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      })()
    : `약 ${Math.round(weeksLeft)}주 후`;

  // 오늘 데이 타입
  const dow      = TODAY.getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const dayTarget = isRefeed ? metrics.refeed : metrics.deficit;

  container.innerHTML = `
    <div class="diet-goal-grid">
      <div class="diet-goal-stat">
        <div class="diet-goal-stat-val">${curWeight.toFixed(1)}<span class="diet-goal-unit">kg</span></div>
        <div class="diet-goal-stat-lbl">현재 체중</div>
        <div class="diet-goal-prog-wrap">
          <div class="diet-goal-prog-bar">
            <div class="diet-goal-prog-fill" style="width:${wProgress}%;background:var(--gym)"></div>
          </div>
          <div class="diet-goal-prog-info">목표 ${wTarget}kg · ${wProgress}%</div>
        </div>
      </div>
      <div class="diet-goal-stat">
        <div class="diet-goal-stat-val">${curBF.toFixed(1)}<span class="diet-goal-unit">%</span></div>
        <div class="diet-goal-stat-lbl">체지방률</div>
        <div class="diet-goal-prog-wrap">
          <div class="diet-goal-prog-bar">
            <div class="diet-goal-prog-fill" style="width:${bfProgress}%;background:var(--diet-ok)"></div>
          </div>
          <div class="diet-goal-prog-info">목표 ${bfTarget}% · ${bfProgress}%</div>
        </div>
      </div>
    </div>
    <div class="diet-goal-meta">
      <span class="diet-goal-meta-item">📅 예상 완료: <strong>${doneDate}</strong></span>
      <span class="diet-goal-meta-item">오늘: <strong style="color:${isRefeed?'var(--cf)':'var(--gym)'}">${isRefeed?'🔄 리피드':'🔥 데피싯'}</strong> ${dayTarget.kcal.toLocaleString()}kcal</span>
    </div>
    <div class="diet-goal-checkin-row">
      <button class="diet-checkin-btn" onclick="openCheckinModal()">+ 주간 체크인</button>
      ${latest ? `<span style="font-size:11px;color:var(--muted)">${latest.date.replace(/-/g,'/')} 기준</span>` : ''}
    </div>
  `;
}

// ── 오늘 식단 ────────────────────────────────────────────────────
function _renderTodayDiet() {
  const container = document.getElementById('today-diet-summary');
  if (!container) return;
  const y = TODAY.getFullYear(), m = TODAY.getMonth(), d = TODAY.getDate();
  const diet = getDiet(y, m, d);
  const ok   = dietDayOk(y, m, d);

  if (!diet.breakfast && !diet.lunch && !diet.dinner) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:4px 0">
      아직 기록이 없어요.
      <button class="quest-add-btn" onclick="switchTab('workout')" style="margin-left:8px">기록하기</button>
    </div>`;
    return;
  }

  const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0);
  const badge = ok === true
    ? '<span class="diet-badge ok" style="font-size:11px">✓ OK</span>'
    : ok === false
      ? '<span class="diet-badge bad" style="font-size:11px">✗ NG</span>'
      : '';

  const rows = [
    { label:'☀️', text: diet.breakfast, ok: diet.bOk, kcal: diet.bKcal },
    { label:'🌤', text: diet.lunch,     ok: diet.lOk, kcal: diet.lKcal },
    { label:'🌙', text: diet.dinner,    ok: diet.dOk, kcal: diet.dKcal },
  ].filter(r => r.text);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:11px;color:var(--muted)">${totalKcal ? totalKcal.toLocaleString() + ' kcal' : ''}</span>
      ${badge}
    </div>
    ${rows.map(r => `
      <div style="display:flex;gap:6px;align-items:baseline;font-size:12px;padding:2px 0">
        <span>${r.label}</span>
        <span style="color:var(--text);flex:1">${r.text}</span>
        ${r.kcal ? `<span style="color:var(--muted);font-size:10px">${r.kcal}kcal</span>` : ''}
        ${r.ok === true ? `<span style="color:var(--diet-ok);font-size:10px">✓</span>` : r.ok === false ? `<span style="color:var(--diet-bad);font-size:10px">✗</span>` : ''}
      </div>`).join('')}
  `;
}

// ── 오늘 운동 ────────────────────────────────────────────────────
function _renderTodayWorkout() {
  const container = document.getElementById('today-workout-summary');
  if (!container) return;
  const y = TODAY.getFullYear(), m = TODAY.getMonth(), d = TODAY.getDate();
  const exercises = getExercises(y, m, d);
  const hasCF     = getCF(y, m, d);
  const muscles   = getMuscles(y, m, d);

  if (!exercises.length && !hasCF) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:4px 0">
      아직 기록이 없어요.
      <button class="quest-add-btn" onclick="switchTab('workout')" style="margin-left:8px">기록하기</button>
    </div>`;
    return;
  }

  const exList = getExList();
  const muscleColors = Object.fromEntries(MUSCLES.map(m => [m.id, m.color]));
  const muscleNames  = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));

  const muscleDots = muscles.map(mid =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${muscleColors[mid]||'#888'};margin-right:2px" title="${muscleNames[mid]||mid}"></span>`
  ).join('');

  const exRows = exercises.slice(0, 4).map(e => {
    const ex      = exList.find(x => x.id === e.exerciseId);
    const setsDone = (e.sets || []).filter(s => s.done !== false && (s.kg > 0 || s.reps > 0));
    return `<div style="font-size:12px;color:var(--text);padding:1px 0">
      ${ex?.name || e.exerciseId}
      <span style="color:var(--muted);font-size:10px">${setsDone.length}세트</span>
    </div>`;
  }).join('');

  const more = exercises.length > 4 ? `<div style="font-size:11px;color:var(--muted)">+${exercises.length - 4}개 더</div>` : '';

  container.innerHTML = `
    <div style="margin-bottom:6px">${muscleDots}</div>
    ${hasCF ? '<div style="font-size:12px;color:var(--cf);margin-bottom:4px">🔥 클핏 완료</div>' : ''}
    ${exRows}${more}
  `;
}

// ── 퀘스트 드래그앤드롭 ──────────────────────────────────────────
function _initQuestDragDrop() {
  const board = document.getElementById('quest-board');
  if (!board) return;

  let dragging = null;

  board.querySelectorAll('.quest-cell').forEach(cell => {
    cell.addEventListener('dragstart', e => {
      dragging = cell;
      cell.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    cell.addEventListener('dragend', () => {
      cell.classList.remove('dragging');
      dragging = null;
      const newOrder = [...board.querySelectorAll('.quest-cell')].map(c => c.dataset.type);
      saveQuestOrder(newOrder);
    });
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === cell) return;
      const cells   = [...board.querySelectorAll('.quest-cell')];
      const fromIdx = cells.indexOf(dragging);
      const toIdx   = cells.indexOf(cell);
      if (fromIdx < toIdx) board.insertBefore(dragging, cell.nextSibling);
      else                 board.insertBefore(dragging, cell);
    });
  });
}

// ── 토마토 히어로 (게스트 전용) ──────────────────────────────────
const TOMATO_STAGES = [
  { icon: '🌱', label: '씨앗을 심었어요' },
  { icon: '🌿', label: '줄기가 자라고 있어요' },
  { icon: '🌸', label: '꽃이 피었어요! 내일이면 수확해요' },
  { icon: '🍅', label: '오늘만 지키면 토마토를 수확해요!' },
];

function _renderTomatoHero(el) {
  const startStr = getUnitGoalStart();
  if (!startStr) {
    el.innerHTML = '<div class="tomato-hero"><div class="tomato-stage">🌱</div><div class="tomato-message">목표 달성 카드에서 시작일을 설정해주세요</div></div>';
    return;
  }

  const cycle = calcTomatoCycle(startStr, TODAY);
  if (!cycle.cycleStart) return;

  const plan = getDietPlan();
  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const totalCount = state.totalTomatoes + state.giftedReceived - state.giftedSent;

  // 각 날의 칼로리 상태 확인
  const dayStatuses = cycle.days.map((dayKey, i) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    const isFutureDay = dayDate > TODAY;
    if (isFutureDay) return 'future';
    const diet = getDiet(y, m - 1, d);
    const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = calcDayTarget(plan, y, m - 1, d);
    if (totalKcal <= 0) return i < cycle.dayIndex ? 'fail' : 'pending';
    return isDietDaySuccess(totalKcal, target) ? 'success' : 'fail';
  });

  // 오늘 칼로리
  const todayDiet = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayKcal = (todayDiet.bKcal || 0) + (todayDiet.lKcal || 0) + (todayDiet.dKcal || 0) + (todayDiet.sKcal || 0);
  const todayTarget = calcDayTarget(plan, TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  // 이전 날에 실패가 있는지
  const hasPriorFail = dayStatuses.slice(0, cycle.dayIndex).some(s => s === 'fail');

  // 스테이지 & 메시지
  const stage = TOMATO_STAGES[cycle.dayIndex];
  let stageIcon = stage.icon;
  let message = stage.label;

  if (cycle.dayIndex === 3 && hasPriorFail) {
    stageIcon = '🌸';
    message = '이번 사이클은 아쉽지만, 내일 새로운 시작이에요';
  } else if (hasPriorFail && cycle.dayIndex < 3) {
    message = '아직 포기하지 마세요! 좋은 습관을 만들어가요';
  }

  // 날짜 포맷
  const dayNames = ['일','월','화','수','목','금','토'];
  const dateStr = `${TODAY.getMonth()+1}월 ${TODAY.getDate()}일 ${dayNames[TODAY.getDay()]}요일`;

  // 진행 점
  const dots = dayStatuses.map((s, i) => {
    let cls = 'tomato-dot';
    if (s === 'success') cls += ' success';
    else if (s === 'fail') cls += ' fail';
    if (i === cycle.dayIndex) cls += ' current';
    return `<div class="${cls}"></div>`;
  }).join('');

  // 칼로리 상태
  const kcalOk = todayKcal > 0 && todayKcal <= todayTarget + 50;
  const kcalIcon = todayKcal <= 0 ? '' : kcalOk ? ' ✓' : ' ✗';
  const kcalCls = todayKcal <= 0 ? '' : kcalOk ? 'tomato-kcal-ok' : 'tomato-kcal-over';

  el.innerHTML = `
    <div class="tomato-hero">
      <div style="font-size:12px;color:var(--text-tertiary);font-weight:500;margin-bottom:8px;">${dateStr}</div>
      <div class="tomato-stage">${stageIcon}</div>
      <div class="tomato-day-label">D${cycle.dayIndex + 1} <span style="font-weight:400;color:var(--text-tertiary);font-size:14px;">/ 4</span></div>
      <div class="tomato-progress">${dots}</div>
      <div class="tomato-message">${message}</div>
      <div class="tomato-kcal-status ${kcalCls}">
        ${todayKcal > 0 ? `${todayKcal.toLocaleString()} / ${todayTarget.toLocaleString()} kcal${kcalIcon}` : '아직 식단 기록이 없어요'}
      </div>
      <div class="tomato-quarter-summary">
        <span>🍅 이번 분기: ${qCount}개</span>
        <span style="color:var(--border);">·</span>
        <span>누적: ${totalCount}개</span>
      </div>
    </div>
  `;
}

// ── 토마토 사이클 정산 ──────────────────────────────────────────
function _settleTomatoCycleIfNeeded() {
  const startStr = getUnitGoalStart();
  if (!startStr) return;

  const cycle = calcTomatoCycle(startStr, TODAY);
  if (!cycle.cycleStart) return;

  const state = getTomatoState();
  const plan = getDietPlan();
  const existingCycles = getTomatoCycles();
  const existingIds = new Set(existingCycles.map(c => c.id));

  // 지난 사이클들 중 정산 안 된 것 찾기 (최대 10개까지)
  const start = new Date(startStr + 'T00:00:00');
  const todayMs = new Date(dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - start.getTime()) / 86400000);
  if (diffDays < 4) return; // 아직 첫 사이클도 끝나지 않음

  const totalCycles = Math.floor(diffDays / 4);
  const startCycle = Math.max(0, totalCycles - 10); // 최근 10개 사이클만

  for (let ci = startCycle; ci < totalCycles; ci++) {
    const csDate = new Date(start);
    csDate.setDate(csDate.getDate() + ci * 4);
    const csKey = `${csDate.getFullYear()}-${String(csDate.getMonth()+1).padStart(2,'0')}-${String(csDate.getDate()).padStart(2,'0')}`;
    const cycleId = `cycle_${csKey}`;

    if (existingIds.has(cycleId)) continue; // 이미 정산됨

    // 이 사이클의 4일 평가
    const dayResults = [];
    for (let di = 0; di < 4; di++) {
      const dd = new Date(csDate);
      dd.setDate(dd.getDate() + di);
      const y = dd.getFullYear(), m = dd.getMonth(), d = dd.getDate();
      const diet = getDiet(y, m, d);
      const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
      const target = calcDayTarget(plan, y, m, d);
      dayResults.push({ date: dateKey(y, m, d), intake: totalKcal, target });
    }

    const result = evaluateCycleResult(dayResults);
    const ceDate = new Date(csDate);
    ceDate.setDate(ceDate.getDate() + 3);
    const ceKey = `${ceDate.getFullYear()}-${String(ceDate.getMonth()+1).padStart(2,'0')}-${String(ceDate.getDate()).padStart(2,'0')}`;
    const qKey = getQuarterKey(ceDate);

    const cycleResult = {
      id: cycleId,
      cycleStart: csKey,
      cycleEnd: ceKey,
      days: dayResults.map((dr, i) => ({ ...dr, success: result.daySuccesses[i] })),
      allSuccess: result.allSuccess,
      quarter: qKey,
      settledAt: Date.now(),
    };

    saveTomatoCycle(cycleResult);
    existingIds.add(cycleId);

    if (result.allSuccess) {
      state.quarterlyTomatoes[qKey] = (state.quarterlyTomatoes[qKey] || 0) + 1;
      state.totalTomatoes++;
    }
  }

  saveTomatoState(state);
}

// ── 토마토 바구니 카드 ──────────────────────────────────────────
function _renderTomatoBasket() {
  const el = document.getElementById('tomato-basket-content');
  if (!el) return;

  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCycles = getTomatoCycles(qKey);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const giftCount = state.giftedReceived || 0;
  const totalAvailable = state.totalTomatoes + state.giftedReceived - state.giftedSent;

  // 분기 최대 사이클 수 계산 (약 90일 / 4 = 22~23)
  const qStart = new Date(TODAY.getFullYear(), Math.floor(TODAY.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const maxCycles = Math.floor((qEnd.getTime() - qStart.getTime()) / 86400000 / 4);

  // 바구니 그리드
  let gridHtml = '';
  for (let i = 0; i < maxCycles; i++) {
    if (i < qCount) {
      gridHtml += '<div class="tomato-basket-cell earned">🍅</div>';
    } else {
      gridHtml += '<div class="tomato-basket-cell"></div>';
    }
  }

  // 히트맵
  let heatmapHtml = '';
  const startDate = new Date(qStart);
  while (startDate <= qEnd && startDate <= TODAY) {
    const y = startDate.getFullYear(), m = startDate.getMonth(), d = startDate.getDate();
    const diet = getDiet(y, m, d);
    const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = calcDayTarget(getDietPlan(), y, m, d);
    let cls = 'tomato-heatmap-cell';
    if (totalKcal > 0) {
      cls += isDietDaySuccess(totalKcal, target) ? ' ok' : ' fail';
    } else {
      cls += ' empty';
    }
    heatmapHtml += `<div class="${cls}" title="${m+1}/${d}"></div>`;
    startDate.setDate(startDate.getDate() + 1);
  }

  const qLabel = qKey.replace('-', ' ');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:14px;font-weight:700;color:var(--text);">🍅 ${qLabel} 토마토 바구니</span>
      <button class="section-title-edit-btn" onclick="document.getElementById('tomato-basket-detail').classList.toggle('tomato-expanded')">펼치기</button>
    </div>
    <div class="tomato-basket-summary">
      <span>🍅 수확 ${qCount}개</span>
      ${giftCount > 0 ? `<span>🎁 선물 ${giftCount}개</span>` : ''}
      <span style="margin-left:auto;font-weight:700;color:var(--primary);">총 ${totalAvailable}개</span>
    </div>
    <div id="tomato-basket-detail">
      <div class="tomato-basket-grid">${gridHtml}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:12px 0 6px;">일별 기록</div>
      <div class="tomato-heatmap">${heatmapHtml}</div>
      <div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text-tertiary);">
        <span><span class="tomato-heatmap-cell ok" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 성공</span>
        <span><span class="tomato-heatmap-cell fail" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 실패</span>
        <span><span class="tomato-heatmap-cell empty" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 미기록</span>
      </div>
    </div>
  `;
}

// ── 매크로 라인 헬퍼 ─────────────────────────────────────────────
function _buildMacroLine(label, dayData, actKey, tgtKey, lessIsGood) {
  let cells = '';
  dayData.forEach(d => {
    const act = d[actKey], tgt = d[tgtKey];
    if (d.future || act <= 0) {
      cells += '<span class="tf-macro-cell muted">—</span>';
    } else {
      const diff = Math.round(act - tgt);
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'tf-over' : (diff < 0 ? (lessIsGood ? 'tf-ok' : 'tf-over') : 'tf-ok');
      cells += `<span class="tf-macro-cell ${cls}">${sign}${diff}g</span>`;
    }
  });
  return `<div class="tf-macro-line">
    <span class="tf-macro-label">${label}</span>
    <div class="tf-macro-cells">${cells}</div>
  </div>`;
}

// ── 토마토 통합 카드 (토스 스타일) ────────────────────────────────
function _renderTomatoCard() {
  const heroEl = document.getElementById('hero-content');
  const unitEl = document.getElementById('unit-goal-content');
  if (!heroEl) return;

  const plan = getDietPlan();
  const metrics = calcDietMetrics(plan);
  const tomatoState = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = tomatoState.quarterlyTomatoes[qKey] || 0;
  const totalCount = tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0);

  // 사이클 계산
  let startStr = getUnitGoalStart();
  if (!startStr) {
    startStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    saveUnitGoalStart(startStr);
  }
  const cycle = calcTomatoCycle(startStr, TODAY);
  const dayIndex = cycle.dayIndex;
  const stages = ['🌱','🌿','🌸','🍅'];
  const stageLabels = ['씨앗 심기','새싹 돌보기','꽃 피우기','수확하기'];

  // D1-D4 데이터 수집
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  const DOW = ['일','월','화','수','목','금','토'];
  const days = cycle.days.map(dk => {
    const [y,m,d] = dk.split('-').map(Number);
    return new Date(y, m-1, d);
  });

  const dayData = days.map(d => {
    const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
    const future = isFuture(y, m, dd);
    const diet = getDiet(y, m, dd);
    const intake = (diet.bKcal||0) + (diet.lKcal||0) + (diet.dKcal||0) + (diet.sKcal||0);
    const target = getDayTargetKcal(plan, y, m, dd);
    // 매크로
    const mealMacro = (prefix, prop) => {
      const foods = diet[`${prefix}Foods`] || [];
      if (foods.length > 0) return foods.reduce((s, f) => s + (f[prop] || 0), 0);
      const fm = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
      return diet[`${prefix}${fm[prop]}`] || 0;
    };
    const pxs = ['b','l','d','s'];
    const actP = Math.round(pxs.reduce((s, p) => s + mealMacro(p, 'protein'), 0)*10)/10;
    const actC = Math.round(pxs.reduce((s, p) => s + mealMacro(p, 'carbs'), 0)*10)/10;
    const actF = Math.round(pxs.reduce((s, p) => s + mealMacro(p, 'fat'), 0)*10)/10;
    const dow = new Date(y, m, dd).getDay();
    const isRefeed = (plan.refeedDays || []).includes(dow);
    const mt = isRefeed ? metrics.refeed : metrics.deficit;
    return { date: d, y, m, dd, intake, target, future,
             actP, actC, actF, tgtP: mt.proteinG, tgtC: mt.carbG, tgtF: mt.fatG };
  });

  // 오늘 칼로리
  const todayData = dayData.find(d => isToday(d.y, d.m, d.dd));
  const todayKcal = todayData ? todayData.intake : 0;
  const todayTarget = todayData ? todayData.target : 0;
  const kcalOk = todayKcal > 0 && todayKcal <= todayTarget + 50;

  // 진행 단계 dots
  const dots = [0,1,2,3].map(i => {
    const d = dayData[i];
    let status = 'pending';
    if (!d.future && d.intake > 0) {
      status = d.intake <= d.target + 50 ? 'done' : 'fail';
    } else if (i < dayIndex && !d.future) {
      status = 'fail';
    }
    let cls = 'tf-step';
    if (status === 'done') cls += ' tf-done';
    else if (status === 'fail') cls += ' tf-fail';
    if (i === dayIndex) cls += ' tf-current';
    const stageNote = (i === dayIndex) ? `<span class="tf-step-stage">${stageLabels[i]}</span>` : '';
    return `<div class="${cls}">
      <span class="tf-step-icon">${stages[i]}</span>
      <span class="tf-step-label">${fmt(days[i])}(${DOW[days[i].getDay()]})</span>
      ${stageNote}
    </div>`;
  }).join('<div class="tf-step-line"></div>');

  // 칼로리 섭취 행
  let kcalRow = '';
  dayData.forEach((d, i) => {
    const today = isToday(d.y, d.m, d.dd);
    const clickable = !d.future && d.intake > 0;
    const tapAttr = clickable ? `onclick="showMacroDetail(${i})"` : '';
    if (d.future || d.intake <= 0) {
      kcalRow += `<div class="tf-kcal-cell ${today?'tf-kcal-today':''}"><span class="tf-kcal-val muted">—</span></div>`;
    } else {
      const over = d.intake > d.target;
      kcalRow += `<div class="tf-kcal-cell ${today?'tf-kcal-today':''} tf-kcal-tappable" ${tapAttr}>
        <span class="tf-kcal-val ${over?'tf-over':'tf-ok'}">${d.intake.toLocaleString()}</span>
        <span class="tf-kcal-target">/ ${d.target.toLocaleString()}</span>
      </div>`;
    }
  });

  // 오늘 칼로리 메시지
  let kcalMsg = '';
  if (todayKcal <= 0) {
    kcalMsg = '아직 오늘 식단 기록이 없어요';
  } else if (kcalOk) {
    kcalMsg = `오늘 ${todayKcal.toLocaleString()} / ${todayTarget.toLocaleString()} kcal ✓`;
  } else {
    kcalMsg = `오늘 ${todayKcal.toLocaleString()} / ${todayTarget.toLocaleString()} kcal 초과`;
  }

  heroEl.innerHTML = `
    <div class="tf-card">
      <div class="tf-hero">
        <div class="tf-hero-left">
          <div class="tf-hero-label">내 토마토</div>
          <div class="tf-hero-count">${totalCount}<span class="tf-hero-unit">개</span></div>
          <div class="tf-hero-sub">이번 분기 <b>${qCount}개</b> 수확</div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${stages[dayIndex]}</div>
        </div>
      </div>

      <div class="tf-progress">
        <div class="tf-progress-header">
          <button class="tf-settings-btn" onclick="openUnitGoalDatePicker()">시작일 설정</button>
        </div>
        <div class="tf-steps">${dots}</div>
      </div>

      <div class="tf-kcal-section">
        <div class="tf-kcal-header">
          <span class="tf-kcal-label">칼로리 현황 <span style="font-size:10px;font-weight:400;color:var(--text-tertiary);">눌러서 탄단지 보기 →</span></span>
          <span class="tf-kcal-msg ${kcalOk ? 'tf-ok' : todayKcal > 0 ? 'tf-over' : ''}">${kcalMsg}</span>
        </div>
        <div class="tf-kcal-row">
          <div class="tf-kcal-labels">
            <div class="tf-kcal-day-label">D1</div>
            <div class="tf-kcal-day-label">D2</div>
            <div class="tf-kcal-day-label">D3</div>
            <div class="tf-kcal-day-label">D4</div>
          </div>
          <div class="tf-kcal-grid">${kcalRow}</div>
        </div>
        <div class="tf-macro-detail" id="tf-macro-detail" style="display:none"></div>
      </div>

    </div>
  `;

  // 게스트는 unit-goal 카드를 숨김 (통합되었으므로)
  const unitCard = document.getElementById('card-unit-goal');
  if (unitCard) unitCard.style.display = 'none';

  // 매크로 상세 팝오버
  window._tfDayData = dayData;
  window.showMacroDetail = function(idx) {
    const detail = document.getElementById('tf-macro-detail');
    if (!detail) return;
    const d = window._tfDayData[idx];
    if (!d) return;

    // 이미 열려있으면 토글
    if (detail.style.display !== 'none' && detail.dataset.idx === String(idx)) {
      detail.style.display = 'none';
      return;
    }
    detail.dataset.idx = idx;

    const fmtD = (act, tgt, lessIsGood) => {
      if (act <= 0) return { text: '—', cls: '' };
      const diff = Math.round(act - tgt);
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'tf-over' : (diff < 0 ? (lessIsGood ? 'tf-ok' : 'tf-over') : 'tf-ok');
      return { text: `${Math.round(act)}g (${sign}${diff})`, cls };
    };
    const p = fmtD(d.actP, d.tgtP, false);
    const c = fmtD(d.actC, d.tgtC, true);
    const f = fmtD(d.actF, d.tgtF, true);
    const dayLabel = `D${idx+1} · ${d.m+1}/${d.dd}`;

    detail.innerHTML = `
      <div class="tf-detail-header">
        <span class="tf-detail-title">${dayLabel} 영양소</span>
        <button class="tf-detail-close" onclick="document.getElementById('tf-macro-detail').style.display='none'">✕</button>
      </div>
      <div class="tf-detail-grid">
        <div class="tf-detail-item">
          <span class="tf-detail-label">단백질</span>
          <span class="tf-detail-val ${p.cls}">${p.text}</span>
          <span class="tf-detail-tgt">목표 ${d.tgtP}g</span>
        </div>
        <div class="tf-detail-item">
          <span class="tf-detail-label">탄수화물</span>
          <span class="tf-detail-val ${c.cls}">${c.text}</span>
          <span class="tf-detail-tgt">목표 ${d.tgtC}g</span>
        </div>
        <div class="tf-detail-item">
          <span class="tf-detail-label">지방</span>
          <span class="tf-detail-val ${f.cls}">${f.text}</span>
          <span class="tf-detail-tgt">목표 ${d.tgtF}g</span>
        </div>
      </div>
    `;
    detail.style.display = 'block';
  };
}

// ── 내 농장 ─────────────────────────────────────────────────────
let _farmEditMode = false;
let _farmSelectedItem = null;

function _renderFarmDuolingo() {
  const el = document.getElementById('farm-duolingo-content');
  if (!el) return;

  const farm = getFarmState();
  const tomatoState = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = tomatoState.quarterlyTomatoes[qKey] || 0;
  const totalCount = tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0);
  const shopItems = getFarmShopItems();
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = shopItems.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = totalCount - spent;

  const startStr = getUnitGoalStart();
  const cycle = startStr ? calcTomatoCycle(startStr, TODAY) : null;
  const dayIndex = cycle ? cycle.dayIndex : 0;
  const stages = ['🌱','🌿','🌸','🍅'];
  const stageLabels = ['씨앗 심기','새싹 돌보기','꽃 피우기','수확하기'];
  const stageColors = ['#8b95a1','#5cb85c','#ff9ebc','#e53935'];

  const user = getCurrentUser();
  const userName = user ? user.lastName + user.firstName : '';

  // 밭에 심은 아이템들 (최대 9칸)
  const farmTiles = (farm.tiles || []).slice(0, 24);
  let gardenItems = '';
  const gardenSlots = [7,8,9,13,14,15,19,20,21]; // 3x3 중앙 밭
  gardenSlots.forEach((idx, i) => {
    const tile = farmTiles[idx];
    const item = tile ? shopItems.find(s => s.id === tile.itemId) : null;
    if (item) {
      gardenItems += `<div class="tf-plot tf-filled" onclick="farmTileClick(${idx})">${item.emoji}</div>`;
    } else {
      gardenItems += `<div class="tf-plot tf-growing">${stages[dayIndex]}</div>`;
    }
  });

  // 농장 데코 아이템 (밭 밖에 배치된 것들)
  const decoIdxs = [0,1,2,3,4,5,6,10,11,12,16,17,18,22,23];
  let decoItems = '';
  decoIdxs.forEach(idx => {
    const tile = farmTiles[idx];
    const item = tile ? shopItems.find(s => s.id === tile.itemId) : null;
    if (item) decoItems += `<span class="tf-deco-item" onclick="farmTileClick(${idx})">${item.emoji}</span>`;
  });

  // 진행 단계 dots
  const dots = [0,1,2,3].map(i => {
    let cls = 'tf-step';
    if (i < dayIndex) cls += ' tf-done';
    else if (i === dayIndex) cls += ' tf-current';
    return `<div class="${cls}"><span class="tf-step-icon">${stages[i]}</span><span class="tf-step-label">${['D1','D2','D3','D4'][i]}</span></div>`;
  }).join('<div class="tf-step-line"></div>');

  el.innerHTML = `
    <div class="tf-card">
      <div class="tf-hero">
        <div class="tf-hero-left">
          <div class="tf-hero-label">내 토마토</div>
          <div class="tf-hero-count">${totalCount}<span class="tf-hero-unit">개</span></div>
          <div class="tf-hero-sub">이번 분기 <b>${qCount}개</b> 수확</div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${stages[dayIndex]}</div>
        </div>
      </div>

      <div class="tf-progress">
        <div class="tf-progress-title">${stageLabels[dayIndex]}</div>
        <div class="tf-steps">${dots}</div>
      </div>

      <div class="tf-garden">
        <div class="tf-garden-header">
          <span class="tf-garden-title">내 텃밭</span>
          <div class="tf-garden-actions">
            <span class="tf-balance">🍅 ${balance}</span>
            <button class="tf-action-btn" onclick="farmToggleEdit()">${_farmEditMode ? '✓ 완료' : '꾸미기'}</button>
            <button class="tf-action-btn" onclick="openFarmShop()">상점</button>
          </div>
        </div>
        <div class="tf-garden-scene">
          <div class="tf-garden-bg">
            ${decoItems ? `<div class="tf-deco-row">${decoItems}</div>` : ''}
          </div>
          <div class="tf-plots">${gardenItems}</div>
        </div>
      </div>

      <div class="tf-footer">
        <div class="tf-footer-item">
          <span class="tf-footer-val">${qCount}</span>
          <span class="tf-footer-lbl">수확</span>
        </div>
        <div class="tf-footer-divider"></div>
        <div class="tf-footer-item">
          <span class="tf-footer-val">${tomatoState.giftedReceived || 0}</span>
          <span class="tf-footer-lbl">선물 받음</span>
        </div>
        <div class="tf-footer-divider"></div>
        <div class="tf-footer-item">
          <span class="tf-footer-val">${balance}</span>
          <span class="tf-footer-lbl">잔액</span>
        </div>
      </div>

      ${_farmEditMode ? `
        <div class="tf-toolbar">
          <div class="tf-toolbar-label">아이템 배치</div>
          <div class="tf-toolbar-items" id="farm-toolbar-items"></div>
        </div>
      ` : ''}
    </div>
  `;

  if (_farmEditMode) _renderFarmToolbar(farm, shopItems);
}

function _renderFarmToolbar(farm, shopItems) {
  const toolbar = document.getElementById('farm-toolbar-items');
  if (!toolbar) return;
  const owned = farm.ownedItems || [];
  if (!owned.length) {
    toolbar.innerHTML = '<div style="font-size:12px;color:var(--seed-fg-subtle);padding:8px;">상점에서 아이템을 구매하세요!</div>';
    return;
  }
  toolbar.innerHTML = owned.map(o => {
    const item = shopItems.find(s => s.id === o.itemId);
    if (!item) return '';
    const placedCount = farm.tiles.filter(t => t?.itemId === o.itemId).length;
    const remaining = o.quantity - placedCount;
    const isSelected = _farmSelectedItem === o.itemId;
    return `<button class="farm-inv-item ${isSelected ? 'selected' : ''} ${remaining <= 0 ? 'depleted' : ''}"
      onclick="farmSelectItem('${o.itemId}')">${item.emoji}<span class="farm-inv-count">${remaining}</span></button>`;
  }).join('');
}

// 씬 클릭 → 캐릭터 이동 (가장 가까운 슬롯으로)
window.farmSceneClick = async function(e) {
  const scene = e.currentTarget;
  const rect = scene.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
  const SLOT_POSITIONS = [
    {x:12,y:18},{x:32,y:16},{x:55,y:18},{x:78,y:16},{x:92,y:18},{x:5,y:20},
    {x:18,y:34},{x:40,y:32},{x:60,y:36},{x:82,y:33},{x:10,y:36},{x:90,y:35},
    {x:15,y:52},{x:35,y:50},{x:55,y:54},{x:75,y:51},{x:92,y:53},{x:5,y:50},
    {x:20,y:70},{x:42,y:68},{x:62,y:72},{x:80,y:69},{x:8,y:71},{x:93,y:70},
  ];
  let closest = 0, minDist = Infinity;
  SLOT_POSITIONS.forEach((p, i) => {
    const d = Math.sqrt((p.x - xPct)**2 + (p.y - yPct)**2);
    if (d < minDist) { minDist = d; closest = i; }
  });
  await moveFarmCharacter(closest);
  _renderFarmDuolingo();
};

// window 함수들
window.farmToggleEdit = function() {
  _farmEditMode = !_farmEditMode;
  _farmSelectedItem = null;
  _renderFarmDuolingo();
};

window.farmSelectItem = function(itemId) {
  _farmSelectedItem = _farmSelectedItem === itemId ? null : itemId;
  const farm = getFarmState();
  _renderFarmToolbar(farm, getFarmShopItems());
};

window.farmTileClick = async function(idx) {
  const farm = getFarmState();
  if (farm.tiles[idx]) {
    // 이미 아이템 있으면 제거
    await removeFarmItem(idx);
  } else if (_farmSelectedItem) {
    // 선택된 아이템 배치
    await placeFarmItem(idx, _farmSelectedItem);
  }
  _renderFarmDuolingo();
};

window.farmMoveChar = async function(idx) {
  await moveFarmCharacter(idx);
  _renderFarmDuolingo();
};

window.openFarmShop = function() {
  const shopItems = getFarmShopItems();
  const tomatoState = getTomatoState();
  const farm = getFarmState();
  const totalCount = tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0);
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = shopItems.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = totalCount - spent;

  const categories = { nature: '🌿 자연', building: '🏡 건물', animal: '🐾 동물', special: '✨ 특별' };
  let html = '';
  for (const [cat, label] of Object.entries(categories)) {
    const items = shopItems.filter(i => i.category === cat);
    html += `<div class="farm-shop-cat">${label}</div>`;
    html += items.map(i => `
      <button class="farm-shop-item" onclick="farmBuyItem('${i.id}')">
        <span class="farm-shop-emoji">${i.emoji}</span>
        <span class="farm-shop-name">${i.name}</span>
        <span class="farm-shop-price">${i.price}🍅</span>
      </button>
    `).join('');
  }

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop open" style="z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title">🛒 농장 상점</div>
      <div style="text-align:center;font-size:14px;font-weight:700;color:var(--primary);margin-bottom:16px;">보유: ${balance} 🍅</div>
      <div id="farm-shop-list">${html}</div>
    </div>
  </div>`;
};

window.farmBuyItem = async function(itemId) {
  const result = await buyFarmItem(itemId);
  if (result.error) { _showToast(result.error); return; }
  _showToast('구매 완료!');
  _renderFarmDuolingo();
  window.openFarmShop(); // 상점 새로고침
};

// ── 싸이월드 (삭제됨) ─────────────────────────────────────────────
function _renderFarmCyworld() {
  const el = document.getElementById('farm-cyworld-content');
  if (!el) return;

  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const totalCount = state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0);
  const startStr = getUnitGoalStart();
  const cycle = startStr ? calcTomatoCycle(startStr, TODAY) : null;
  const dayIndex = cycle ? cycle.dayIndex : 0;

  const stages = ['🌱','🌿','🌸','🍅'];

  // 미니룸 스타일 농장 그리드 (4x3)
  const farmSlots = [];
  for (let i = 0; i < 12; i++) {
    if (i < qCount) {
      farmSlots.push('<div class="cy-slot cy-has">🍅</div>');
    } else if (i === qCount && cycle) {
      farmSlots.push(`<div class="cy-slot cy-growing">${stages[dayIndex]}</div>`);
    } else {
      farmSlots.push('<div class="cy-slot cy-dirt"></div>');
    }
  }

  const user = getCurrentUser();
  const userName = user ? user.lastName + user.firstName : '';
  const initial = user ? user.lastName.charAt(0) : '?';

  el.innerHTML = `
    <div class="cy-farm">
      <div class="cy-farm-header">
        <div class="cy-avatar">${initial}</div>
        <div class="cy-header-info">
          <div class="cy-farm-name">${userName}의 미니농장</div>
          <div class="cy-farm-sub">옵션 B: 싸이월드</div>
        </div>
        <div class="cy-weather">🌤️</div>
      </div>
      <div class="cy-farm-scene">
        <div class="cy-fence-top"></div>
        <div class="cy-garden-grid">${farmSlots.join('')}</div>
        <div class="cy-fence-bottom"></div>
      </div>
      <div class="cy-info-bar">
        <div class="cy-info-item">
          <span class="cy-info-icon">🍅</span>
          <span class="cy-info-val">${qCount}</span>
          <span class="cy-info-lbl">수확</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">🌱</span>
          <span class="cy-info-val">D${dayIndex+1}</span>
          <span class="cy-info-lbl">성장중</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">💰</span>
          <span class="cy-info-val">${totalCount}</span>
          <span class="cy-info-lbl">누적</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">🎁</span>
          <span class="cy-info-val">${state.giftedReceived || 0}</span>
          <span class="cy-info-lbl">선물</span>
        </div>
      </div>
      <div class="cy-bgm-bar">
        <span class="cy-bgm-note">♪</span>
        <span class="cy-bgm-text">나의 농장에 오신 걸 환영합니다~</span>
        <span class="cy-bgm-note">♪</span>
      </div>
    </div>
  `;
}

// ── 친구 피드 ────────────────────────────────────────────────────
async function _renderFriendFeed() {
  const feedEl = document.getElementById('friend-feed');
  if (!feedEl) return;
  const user = getCurrentUser();
  if (!user) { feedEl.innerHTML = ''; return; }

  // 알림
  const notifEl = document.getElementById('friend-notifications');
  try {
    const pending = await getPendingRequests();
    const notifs = await getMyNotifications();
    const unread = notifs.filter(n => !n.read);
    if (pending.length > 0 || unread.length > 0) {
      notifEl.style.display = 'block';
      const accounts = await getAccountList();
      let nh = '';
      for (const req of pending) {
        const a = accounts.find(x => x.id === req.from);
        const nm = a ? a.lastName + a.firstName : req.from;
        nh += '<div class="friend-notif-row"><span>' + nm + '님이 이웃 요청을 보냈어요</span><div style="display:flex;gap:6px;"><button onclick="acceptFriendReq(\'' + req.id + '\')" style="background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">수락</button><button onclick="rejectFriendReq(\'' + req.id + '\')" style="background:var(--surface3);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;cursor:pointer;">거절</button></div></div>';
      }
      for (const n of unread.slice(0, 3)) {
        if (n.type === 'friend_request') continue;
        const a = accounts.find(x => x.id === n.from);
        const nm = a ? a.lastName + a.firstName : (n.from || '');
        const ic = n.type === 'like' ? '❤️' : n.type === 'friend_accepted' ? '🤝' : '💬';
        nh += '<div class="friend-notif-row" onclick="markNotifRead(\'' + n.id + '\')">' + ic + ' ' + nm + '님이 ' + n.message + '</div>';
      }
      notifEl.innerHTML = nh;
    } else if (notifEl) { notifEl.style.display = 'none'; }
  } catch(e) { console.warn('[friends] notif:', e); }

  // 피드
  try {
    const friends = await getMyFriends();
    const accounts = await getAccountList();
    if (!friends.length) {
      // 이웃 없어도 추천은 보여줌
      let emptyMsg = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px;line-height:1.6;">이웃을 추가하고 함께 토마토를 키워보세요.<br>서로 응원하며 더 건강해질 수 있어요.</div>';
      // 추천 이웃 생성
      const user = getCurrentUser();
      const { isAdminGuest: isAG2 } = await import('./data.js');
      const myId2 = isAG2() ? '김_태우' : user?.id;
      const excludeIds = new Set([myId2, '김_태우(guest)']);
      if (isAG2()) excludeIds.add('김_태우');
      const sug = accounts.filter(a => !excludeIds.has(a.id) && !a.id.includes('(guest)'));
      if (sug.length) {
        emptyMsg += `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);text-align:left;">
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:10px;">알 수도 있는 이웃</div>
          ${sug.slice(0,5).map(a => {
            const nick = a.nickname || a.lastName + '**';
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
              <div style="width:36px;height:36px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;cursor:pointer;" onclick="openFriendProfile('${a.id}','${nick}')">🍅</div>
              <div style="flex:1;font-size:14px;font-weight:500;color:var(--text);cursor:pointer;" onclick="openFriendProfile('${a.id}','${nick}')">${nick}</div>
              <button onclick="quickAddNeighbor('${a.id}')" style="padding:6px 14px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">이웃 추가</button>
            </div>`;
          }).join('')}
        </div>`;
      }
      feedEl.innerHTML = emptyMsg;
      return;
    }
    const tk = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    let html = '';
    let activeCount = 0;
    for (const f of friends) {
      const acc = accounts.find(a => a.id === f.friendId);
      const nick = acc?.nickname || (acc ? acc.lastName + acc.firstName : f.friendId);
      const fullName = acc ? acc.lastName + acc.firstName : f.friendId;
      const name = nick; // 피드에는 별명만
      const ini = nick.charAt(0);
      const w = await getFriendWorkout(f.friendId, tk);
      let items = '';
      if (w) {
        if ((w.muscles || []).length > 0) {
          items += '<div class="friend-feed-item"><span>🏋️ ' + (w.muscles || []).slice(0, 3).join(', ') + '</span></div>';
        }
        const diet = w.diet || {};
        ['breakfast','lunch','dinner','snack'].forEach(meal => {
          const md = diet[meal];
          if (md && (md.foods?.length || md.memo)) {
            const foods = (md.foods || []).map(x => x.name).join(', ').slice(0, 30);
            const kcal = (md.foods || []).reduce((s, x) => s + (x.kcal || 0), 0);
            const lb = {breakfast:'🌅',lunch:'☀️',dinner:'🌙',snack:'🥤'}[meal];
            items += '<div class="friend-feed-item"><span>' + lb + ' ' + (foods || md.memo || '') + (kcal ? ' (' + kcal + 'kcal)' : '') + '</span></div>';
          }
        });
      }
      if (!items) items = '<div class="friend-feed-item" style="color:var(--text-tertiary);">오늘 아직 기록이 없어요</div>';
      else activeCount++;
      html += `<div class="friend-card"><div class="friend-card-header"><span class="friend-avatar" style="font-size:18px;">🍅</span><span class="friend-name" data-fid="${f.friendId}" data-fname="${fullName.replace(/"/g,'&quot;')}" style="cursor:pointer">${name}</span><button class="friend-gift-btn" data-gift-fid="${f.friendId}" data-gift-name="${fullName.replace(/"/g,'&quot;')}" title="토마토 선물">🍅</button></div>${items}</div>`;
    }
    // 활동 요약 배너
    const banner = activeCount > 0
      ? `<div style="padding:10px 12px;background:var(--primary-bg);border-radius:10px;font-size:12px;font-weight:500;color:var(--primary);margin-bottom:10px;text-align:center;">오늘 ${activeCount}명의 이웃이 기록했어요</div>`
      : '';

    // 추천 이웃
    let suggestHtml = '';
    try {
      const user = getCurrentUser();
      const { isAdminGuest: isAG } = await import('./data.js');
      const myId = isAG() ? '김_태우' : user?.id;
      const friendIds = new Set(friends.map(f => f.friendId));
      friendIds.add(myId);
      if (isAG()) { friendIds.add('김_태우(guest)'); friendIds.add('김_태우'); }
      const suggestions = accounts.filter(a => !friendIds.has(a.id) && !a.id.includes('(guest)'));
      if (suggestions.length > 0) {
        suggestHtml = `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:10px;">알 수도 있는 이웃</div>
          ${suggestions.slice(0, 5).map(a => {
            const nick = a.nickname || a.lastName + '**';
            const ini2 = nick.charAt(0);
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
              <div style="width:36px;height:36px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;cursor:pointer;" onclick="openFriendProfile('${a.id}','${nick}')">🍅</div>
              <div style="flex:1;min-width:0;" onclick="openFriendProfile('${a.id}','${nick}')" style="cursor:pointer;">
                <div style="font-size:14px;font-weight:500;color:var(--text);cursor:pointer;">${nick}</div>
              </div>
              <button onclick="quickAddNeighbor('${a.id}')" style="padding:6px 14px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">이웃 추가</button>
            </div>`;
          }).join('')}
        </div>`;
      }
    } catch(e) { console.warn('[suggest]', e); }

    feedEl.innerHTML = banner + html + suggestHtml;
    // 이벤트 위임: 이름 클릭→프로필, 선물 클릭→선물
    feedEl.onclick = (e) => {
      const nameEl = e.target.closest('.friend-name[data-fid]');
      if (nameEl) { openFriendProfile(nameEl.dataset.fid, nameEl.dataset.fname); return; }
      const giftEl = e.target.closest('.friend-gift-btn[data-gift-fid]');
      if (giftEl) { openTomatoGiftModal(giftEl.dataset.giftFid, giftEl.dataset.giftName); return; }
    };
  } catch(e) { console.warn('[friends] feed:', e); feedEl.innerHTML = ''; }
}

// 친구 관리 모달
window.openFriendManager = async function() {
  const friends = await getMyFriends();
  const accounts = await getAccountList();
  let fl = '';
  if (!friends.length) fl = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px;">아직 등록된 이웃이 없어요</div>';
  else fl = friends.map(f => {
    const a = accounts.find(x => x.id === f.friendId);
    const nick = a?.nickname || (a ? a.lastName + a.firstName : f.friendId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-fid="${f.friendId}" data-fname="${nick.replace(/"/g,'&quot;')}" class="friend-manager-row">
      <span class="friend-avatar">${nick.charAt(0)}</span>
      <span style="flex:1;font-size:14px;font-weight:500;">${nick}</span>
      <button onclick="event.stopPropagation();deleteFriend('${f.reqId}')" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;">삭제</button>
    </div>`;
  }).join('');

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">이웃 관리</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">이웃 추가</div>
        <div style="display:flex;gap:6px;">
          <input class="login-input" id="friend-add-last" placeholder="성" style="flex:1;height:40px;font-size:13px;">
          <input class="login-input" id="friend-add-first" placeholder="이름" style="flex:2;height:40px;font-size:13px;">
          <button onclick="sendFriendReq()" style="background:var(--primary);color:#fff;border:none;border-radius:999px;padding:0 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">요청</button>
        </div>
        <div id="friend-add-status" style="font-size:12px;margin-top:6px;min-height:16px;"></div>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">내 이웃</div>
      <div id="friend-manager-list">${fl}</div>
      <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:12px;">닫기</button>
    </div>
  </div>`;
  // 이웃 클릭 → 프로필 열기 (이벤트 위임)
  modal.addEventListener('click', e => {
    const row = e.target.closest('.friend-manager-row');
    if (!row || e.target.closest('button')) return;
    const fid = row.dataset.fid;
    const fname = row.dataset.fname;
    document.getElementById('dynamic-modal')?.remove();
    openFriendProfile(fid, fname);
  });
};

window.sendFriendReq = async function() {
  const ln = document.getElementById('friend-add-last')?.value.trim();
  const fn = document.getElementById('friend-add-first')?.value.trim();
  const st = document.getElementById('friend-add-status');
  if (!ln || !fn) { st.innerHTML = '<span style="color:var(--text-tertiary);">성과 이름을 입력해주세요.</span>'; return; }
  const tid = (ln + '_' + fn).toLowerCase().replace(/\s/g, '');
  const user = getCurrentUser();
  if (!user) return;
  // AdminGuest는 Admin ID로 요청
  const { isAdminGuest: isAG } = await import('./data.js');
  const myId = isAG() ? '김_태우' : user.id;
  if (tid === myId || tid === user.id) { st.innerHTML = '<span style="color:var(--text-tertiary);">본인에게는 요청할 수 없어요.</span>'; return; }
  const accs = await getAccountList();
  if (!accs.find(a => a.id === tid)) { st.innerHTML = '<span style="color:#ef4444;">해당 이름의 계정이 없어요.</span>'; return; }
  const r = await sendFriendRequest(myId, tid);
  st.innerHTML = r.error ? '<span style="color:var(--text-tertiary);">' + r.error + '</span>' : '<span style="color:var(--primary);">이웃 요청을 보냈어요!</span>';
  if (!r.error) { document.getElementById('friend-add-last').value = ''; document.getElementById('friend-add-first').value = ''; }
};

window.acceptFriendReq = async function(id) {
  await acceptFriendRequest(id);
  _showToast('🤝 이제 이웃 이웃가 되었어요!');
  renderHome();
};
window.rejectFriendReq = async function(id) { await removeFriend(id); renderHome(); };
window.deleteFriend = async function(id) { if(!confirm('이웃을 삭제할까요?')) return; await removeFriend(id); window.openFriendManager(); };

window.quickAddNeighbor = async function(targetId) {
  const user = getCurrentUser();
  if (!user) return;
  const { isAdminGuest: isAG } = await import('./data.js');
  const myId = isAG() ? '김_태우' : user.id;
  const r = await sendFriendRequest(myId, targetId);
  if (r.error) { _showToast(r.error); }
  else { _showToast('이웃 요청을 보냈어요!'); }
  _renderFriendFeed();
};
// 리액션 시스템 (인스타 스토리 패턴)
const REACTIONS = [
  { emoji: '👏', label: '대단해' },
  { emoji: '🔥', label: '불타오르네' },
  { emoji: '💪', label: '파이팅' },
  { emoji: '😍', label: '맛있겠다' },
  { emoji: '🍅', label: '토마토' },
];

window.friendLike = async function(tid, dk, field) { await toggleLike(tid, dk, field); _renderFriendFeed(); };

window.showReactionPicker = function(btn, tid, dk, field) {
  // 기존 피커 제거
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTIONS.map(r =>
    `<button class="reaction-opt" onclick="sendReaction('${tid}','${dk}','${field}','${r.emoji}');event.stopPropagation();">${r.emoji}</button>`
  ).join('');
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(picker);
  requestAnimationFrame(() => picker.classList.add('show'));
  // 외부 클릭 시 닫기
  setTimeout(() => {
    const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 10);
};

// 친구 프로필 상세
window.openFriendProfile = async function(friendId, friendName) {
  const { getFriendWorkout, dateKey: dk2, getAccountList, getMyFriends, getTomatoState: getTS, isAdmin: isA, isAdminGuest: isAG, getDataOwnerId: getOwnId } = await import('./data.js');
  const user = getCurrentUser();
  const myDataId = getOwnId();
  const isMyProfile = friendId === user?.id || friendId === myDataId;
  const myFriends = await getMyFriends();
  const isFriend = isMyProfile || myFriends.some(f => f.friendId === friendId);
  const DOW = ['일','월','화','수','목','금','토'];
  // 계정 데이터에서 별명/이름 결정
  const allAccounts = await getAccountList();
  const friendAcc = allAccounts.find(a => a.id === friendId);
  const nickname = friendAcc?.nickname || friendName;
  const realName = friendAcc ? friendAcc.lastName + friendAcc.firstName : friendName;
  const maskedName = realName.charAt(0) + '***';
  const ini = nickname.charAt(0);
  const tk = dk2(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  // 오늘 데이터 (자기 프로필이면 자기 데이터 경로로)
  const lookupId = isMyProfile ? myDataId : friendId;
  const todayW = await getFriendWorkout(lookupId, tk);

  // 1. 오늘 식단 상세 (음식 이름)
  let todayDietHtml = '';
  const meals = [
    { key: 'bFoods', label: '아침', memo: 'breakfast' },
    { key: 'lFoods', label: '점심', memo: 'lunch' },
    { key: 'dFoods', label: '저녁', memo: 'dinner' },
    { key: 'sFoods', label: '간식', memo: 'snack' },
  ];
  const allLikes = (todayW && isFriend) ? await getLikes(friendId, tk) : [];
  const getReactionCount = (field) => allLikes.filter(l => l.field === field).length;
  const getReactionEmojis = (field) => {
    const emojis = allLikes.filter(l => l.field === field && l.emoji).map(l => l.emoji);
    return [...new Set(emojis)];
  };
  if (todayW) {

    const photoKeys = { breakfast: 'bPhoto', lunch: 'lPhoto', dinner: 'dPhoto', snack: 'sPhoto' };
    meals.forEach(m => {
      const foods = todayW[m.key] || [];
      const memoText = todayW[m.memo] || '';
      const photo = todayW[photoKeys[m.memo]];
      if (foods.length || memoText || photo) {
        const foodNames = foods.map(f => f.name).join(', ') || memoText;
        const kcal = foods.reduce((s, f) => s + (f.kcal || 0), 0);
        const photoHtml = photo ? `<img src="${photo}" style="width:100%;max-height:200px;object-fit:contain;border-radius:8px;margin-top:4px;">` : '';
        const mealField = 'meal_' + m.memo;
        const mealReactCount = getReactionCount(mealField);
        const mealEmojis = getReactionEmojis(mealField);
        const emojiDisplay = mealEmojis.length > 0 ? mealEmojis.join('') : '';
        const reactBadge = mealReactCount > 0 ? `<span style="font-size:12px;margin-right:2px;">${emojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);margin-right:2px;">${mealReactCount}</span>` : '';
        const reactionBtn = (isFriend && !isMyProfile) ? `${reactBadge}<button class="friend-like-btn" onclick="showReactionPicker(this,'${friendId}','${tk}','${mealField}')" style="flex-shrink:0;font-size:16px;background:none;border:none;cursor:pointer;padding:2px;">🤍</button>` : (mealReactCount > 0 ? `<span style="font-size:12px;">${emojiDisplay}</span> <span style="font-size:10px;font-weight:600;color:var(--primary);">${mealReactCount}</span>` : '');
        todayDietHtml += `<div style="padding:6px 0;font-size:12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="color:var(--text-secondary);flex-shrink:0;">${m.label}</span>
            <span style="color:var(--text);flex:1;text-align:right;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${foodNames}${kcal ? ` <span style="color:var(--text-tertiary);">${kcal}kcal</span>` : ''}</span>
            ${reactionBtn}
          </div>
          ${photoHtml}
        </div>`;
      }
    });
  }
  if (!todayDietHtml) todayDietHtml = '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:6px 0;">아직 기록이 없어요</div>';

  // 2. 운동 볼륨 성장 (오늘 vs 직전 운동일)
  let volumeGrowth = '';
  if (todayW?.exercises?.length) {
    const todayVol = (todayW.exercises || []).reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.kg||0)*(set.reps||0), 0), 0);
    // 직전 운동일 찾기 (최대 7일 전까지)
    let prevVol = 0;
    for (let di = 1; di <= 7; di++) {
      const pd = new Date(TODAY); pd.setDate(pd.getDate() - di);
      const pw = await getFriendWorkout(lookupId, dk2(pd.getFullYear(), pd.getMonth(), pd.getDate()));
      if (pw?.exercises?.length) {
        prevVol = pw.exercises.reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.kg||0)*(set.reps||0), 0), 0);
        break;
      }
    }
    if (prevVol > 0 && todayVol > 0) {
      const diff = Math.round(((todayVol - prevVol) / prevVol) * 100);
      const sign = diff > 0 ? '+' : '';
      const color = diff > 0 ? 'var(--primary)' : diff < 0 ? '#e53935' : 'var(--text-tertiary)';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      volumeGrowth = `<span style="font-size:12px;font-weight:700;color:${color};margin-left:6px;">${arrow} ${sign}${diff}%</span>`;
    } else if (todayVol > 0) {
      volumeGrowth = `<span style="font-size:11px;color:var(--text-tertiary);margin-left:6px;">첫 기록</span>`;
    }
  }

  // 3. 주간 운동일수 + 스트릭 (연속 기록)
  let workoutDays = 0, streak = 0, streakCounting = true;
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate() - i);
    const w = await getFriendWorkout(lookupId, dk2(d.getFullYear(), d.getMonth(), d.getDate()));
    const has = (w?.muscles?.length || w?.exercises?.length) ? true : false;
    if (has) workoutDays++;
    if (streakCounting && has) streak++;
    else if (streakCounting && i > 0) streakCounting = false;
  }

  // 4. 토마토 수 & 레벨
  let tomatoCount = '—';
  let tomatoLevel = 1;
  if (isMyProfile) {
    const ts = getTS();
    tomatoCount = ts.totalTomatoes + (ts.giftedReceived || 0) - (ts.giftedSent || 0);
  }
  if (typeof tomatoCount === 'number') {
    if (tomatoCount >= 100) tomatoLevel = 10;
    else if (tomatoCount >= 70) tomatoLevel = 9;
    else if (tomatoCount >= 50) tomatoLevel = 8;
    else if (tomatoCount >= 35) tomatoLevel = 7;
    else if (tomatoCount >= 24) tomatoLevel = 6;
    else if (tomatoCount >= 16) tomatoLevel = 5;
    else if (tomatoCount >= 10) tomatoLevel = 4;
    else if (tomatoCount >= 5) tomatoLevel = 3;
    else if (tomatoCount >= 2) tomatoLevel = 2;
    else tomatoLevel = 1;
  }

  // 5. 목표 달성률 (구체 수치 비공개, %만)
  let goalPct = '—';

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="text-align:center;padding:16px 0 8px;">
        <div style="width:56px;height:56px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 6px;">🍅</div>
        ${typeof tomatoCount === 'number' ? `<div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:6px;">Lv.${tomatoLevel}</div>` : ''}
        ${isFriend || isMyProfile
          ? `<div style="font-size:18px;font-weight:700;color:var(--text);">${nickname}</div>
             ${nickname !== realName ? `<div style="font-size:13px;color:var(--text-tertiary);margin-top:2px;">${realName}</div>` : ''}`
          : `<div style="font-size:18px;font-weight:700;color:var(--text);">${nickname}</div>
             <div style="font-size:12px;color:var(--text-tertiary);margin-top:3px;">${maskedName}</div>
             <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">이웃이 되면 이름을 볼 수 있어요</div>`
        }
      </div>

      <!-- 핵심 지표 -->
      <div style="display:flex;justify-content:space-around;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:8px 0;">
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--text);">${workoutDays}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">/7</span></div>
          <div style="font-size:10px;color:var(--text-tertiary);">이번 주</div>
        </div>
        <div style="width:1px;background:var(--border);"></div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--primary);">${streak}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">일</span></div>
          <div style="font-size:10px;color:var(--text-tertiary);">연속 기록</div>
        </div>
        <div style="width:1px;background:var(--border);"></div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--text);">${goalPct}</div>
          <div style="font-size:10px;color:var(--text-tertiary);">목표 달성</div>
        </div>
      </div>

      <!-- 오늘의 운동 -->
      <div style="padding:10px 4px 6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:500;color:var(--text-tertiary);">오늘의 운동 ${volumeGrowth}</span>
          ${(() => {
            const wReactCount = isFriend ? getReactionCount('workout') : 0;
            const wEmojis = getReactionEmojis('workout');
            const wEmojiDisplay = wEmojis.length > 0 ? wEmojis.join('') : '';
            const wBadge = wReactCount > 0 ? `<span style="font-size:12px;margin-right:2px;">${wEmojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);margin-right:2px;">${wReactCount}</span>` : '';
            if (isFriend && !isMyProfile && todayW?.exercises?.length) return `${wBadge}<button class="friend-like-btn" onclick="showReactionPicker(this,'${friendId}','${tk}','workout')" style="font-size:16px;background:none;border:none;cursor:pointer;padding:2px;">🤍</button>`;
            if (wReactCount > 0) return `<span style="font-size:12px;">${wEmojiDisplay}</span> <span style="font-size:10px;font-weight:600;color:var(--primary);">${wReactCount}</span>`;
            return '';
          })()}
        </div>
        ${todayW?.exercises?.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${(todayW.muscles || []).map(m => `<span style="font-size:11px;padding:3px 8px;background:var(--primary-bg);color:var(--primary);border-radius:999px;font-weight:600;">${m}</span>`).join('')}
          </div>
          ${todayW?.workoutPhoto ? `<img src="${todayW.workoutPhoto}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;margin-top:8px;">` : ''}
        ` : '<div style="font-size:12px;color:var(--text-tertiary);">아직 기록이 없어요</div>'}
      </div>

      <!-- 오늘의 식단 -->
      <div style="padding:8px 4px;border-top:1px solid var(--border);margin-top:6px;">
        <div style="font-size:12px;font-weight:500;color:var(--text-tertiary);margin-bottom:6px;">오늘의 식단</div>
        ${todayDietHtml}
      </div>
      <!-- 수확 토마토 -->
      <div style="padding:10px 4px;border-top:1px solid var(--border);margin-top:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:500;color:var(--text-tertiary);">수확한 토마토</span>
          <span style="font-size:18px;font-weight:800;color:var(--text);">${tomatoCount}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);"> 개</span></span>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;">
          ${typeof tomatoCount === 'number' ? Array.from({length:Math.max(tomatoCount,1)},(_,i)=> i < tomatoCount
            ? '<span style="font-size:16px;">🍅</span>'
            : '<span style="font-size:16px;opacity:0.2;">🍅</span>'
          ).join('') : '<span style="font-size:12px;color:var(--text-tertiary);">비공개</span>'}
        </div>
      </div>

      <!-- 방명록 -->
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:13px;font-weight:500;color:var(--text-secondary);">방명록</span>
        </div>
        <div id="guestbook-list" style="max-height:160px;overflow-y:auto;margin-bottom:10px;">
          <div style="text-align:center;padding:12px;font-size:12px;color:var(--text-tertiary);">불러오는 중...</div>
        </div>
        <div style="display:flex;gap:6px;">
          <input id="guestbook-input" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:999px;font-size:13px;color:var(--text);background:var(--surface2);outline:none;font-family:var(--font-sans);transition:border-color 0.15s;" placeholder="응원 한마디 남기기" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')submitGuestbook('${friendId}')">
          <button onclick="submitGuestbook('${friendId}')" style="padding:8px 14px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;">남기기</button>
        </div>
      </div>

      ${isFriend || isMyProfile ? `
        <div style="display:flex;gap:6px;padding:14px 0 8px;">
          <button onclick="openTomatoGiftModal('${friendId}','${friendName}')" style="flex:1;padding:9px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">🍅 선물</button>
          <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;">닫기</button>
        </div>
        ${!isMyProfile ? `<button onclick="openIntroduceFriend('${friendId}','${friendName}')" style="width:100%;padding:8px;border:none;background:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;margin-bottom:4px;">이 이웃을 다른 이웃에게 소개하기 →</button>` : ''}
      ` : `
        <div style="display:flex;gap:6px;padding:14px 0 8px;">
          <button onclick="quickAddNeighbor('${friendId}')" style="flex:1;padding:9px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">이웃 추가하기</button>
          <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;">닫기</button>
        </div>
      `}
    </div>
  </div>`;

  // 방명록 로드
  _loadGuestbook(friendId);
};

// 토마토 상자 비주얼
function _buildCrateTomatoes(count) {
  const max = 12;
  const n = Math.min(count, max);
  let html = '';
  for (let i = 0; i < max; i++) {
    if (i < n) {
      // 약간의 랜덤 위치로 자연스러움
      const offsetX = (i % 4) * 22 + (Math.random() * 4 - 2);
      const offsetY = Math.floor(i / 4) * 18 + (Math.random() * 3 - 1);
      html += `<span class="crate-tomato" style="left:${offsetX + 8}px;bottom:${offsetY + 4}px;">🍅</span>`;
    }
  }
  if (n === 0) html = '<span style="font-size:11px;color:var(--text-tertiary);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);">아직 비어있어요</span>';
  return html;
}

// 방명록
async function _loadGuestbook(targetId) {
  const list = document.getElementById('guestbook-list');
  if (!list) return;
  try {
    const entries = await getGuestbook(targetId);
    const user = getCurrentUser();
    const myId = user?.id;
    if (!entries.length) {
      list.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text-tertiary);">아직 방명록이 없어요.<br>첫 번째 응원을 남겨보세요!</div>';
      return;
    }
    list.innerHTML = entries.slice(0, 20).map(e => {
      const isMe = e.from === myId || (e.from === '김_태우' && myId === '김_태우(guest)') || (e.from === '김_태우(guest)' && myId === '김_태우');
      const timeAgo = _formatTimeAgo(e.createdAt);
      const delBtn = isMe ? `<button onclick="deleteGb('${e.id}','${targetId}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">삭제</button>` : '';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${isMe?'var(--primary)':'var(--surface3)'};color:${isMe?'#fff':'var(--text-secondary)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${(e.fromName||'?').charAt(0)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;font-weight:600;color:var(--text);">${e.fromName || '익명'}</span>
            <span style="font-size:10px;color:var(--text-tertiary);">${timeAgo}</span>
            ${delBtn}
          </div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;line-height:1.4;word-break:break-word;">${e.message}</div>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    list.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-tertiary);">불러올 수 없어요</div>';
  }
}

// 친구 소개하기
window.openIntroduceFriend = async function(friendId, friendName) {
  const friends = await getMyFriends();
  const accounts = await getAccountList();
  // 소개 대상: 내 친구 중 friendId가 아닌 사람
  const others = friends.filter(f => f.friendId !== friendId);
  if (!others.length) {
    _showToast('소개할 다른 이웃이 없어요');
    return;
  }
  let listHtml = others.map(f => {
    const acc = accounts.find(a => a.id === f.friendId);
    const nm = acc ? acc.lastName + acc.firstName : f.friendId;
    const ini = (acc?.lastName || '?').charAt(0);
    return `<button onclick="confirmIntroduce('${friendId}','${f.friendId}','${friendName}','${nm}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;margin-bottom:6px;text-align:left;transition:all 0.15s;">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${ini}</div>
      <span style="font-size:14px;font-weight:500;color:var(--text);">${nm}</span>
    </button>`;
  }).join('');

  // 두 번째 모달 (기존 프로필 위에)
  const intro = document.createElement('div'); intro.id = 'introduce-modal'; document.body.appendChild(intro);
  intro.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1100;" onclick="if(event.target===this){document.getElementById('introduce-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:360px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">이웃 소개하기</div>
      <div style="text-align:center;font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        <b>${friendName}</b>님에게 소개해줄 이웃을 선택하세요
      </div>
      <div style="max-height:240px;overflow-y:auto;">${listHtml}</div>
      <button onclick="document.getElementById('introduce-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;">취소</button>
    </div>
  </div>`;
};

window.sendFriendFromIntro = async function(targetId, notifId) {
  const user = getCurrentUser();
  if (!user) return;
  const { isAdminGuest: isAG } = await import('./data.js');
  const myId = isAG() ? '김_태우' : user.id;
  const r = await sendFriendRequest(myId, targetId);
  if (r.error) { _showToast(r.error); }
  else { _showToast('이웃 요청을 보냈어요!'); }
  await markNotificationRead(notifId);
  refreshNotifCenter();
};

window.confirmIntroduce = async function(idA, idB, nameA, nameB) {
  document.getElementById('introduce-modal')?.remove();
  const result = await introduceFriend(idA, idB, nameA, nameB);
  if (result.error) { _showToast(result.error); return; }
  _showToast(`${nameA}님과 ${nameB}님을 소개했어요! 👋`);
};

// 내 방명록 보기
window.openMyGuestbook = async function() {
  const user = getCurrentUser();
  if (!user) return;
  const { isAdminGuest: isAG } = await import('./data.js');
  const myId = isAG() ? '김_태우' : user.id;
  const entries = await getGuestbook(myId);
  const myName = user.lastName + user.firstName;

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);

  let listHtml = '';
  if (!entries.length) {
    listHtml = '<div style="text-align:center;padding:24px;font-size:13px;color:var(--text-tertiary);">아직 방명록이 없어요.<br>이웃들이 응원을 남기면 여기에 표시돼요.</div>';
  } else {
    listHtml = entries.slice(0, 30).map(e => {
      const timeAgo = _formatTimeAgo(e.createdAt);
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${(e.fromName||'?').charAt(0)}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:13px;font-weight:600;color:var(--text);">${e.fromName||'익명'}</span><span style="font-size:10px;color:var(--text-tertiary);">${timeAgo}</span></div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;line-height:1.4;">${e.message}</div>
        </div>
      </div>`;
    }).join('');
  }

  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10001;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">📝 내 방명록</div>
      <div style="max-height:400px;overflow-y:auto;padding:0 4px;">${listHtml}</div>
      <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:12px;">닫기</button>
    </div>
  </div>`;
};

window.submitGuestbook = async function(targetId) {
  const input = document.getElementById('guestbook-input');
  if (!input || !input.value.trim()) return;
  const result = await writeGuestbook(targetId, input.value);
  if (result.error) { _showToast(result.error); return; }
  input.value = '';
  _showToast('방명록을 남겼어요 📝');
  _loadGuestbook(targetId);
};

window.deleteGb = async function(entryId, targetId) {
  await deleteGuestbookEntry(entryId);
  _loadGuestbook(targetId);
  _showToast('삭제했어요');
};

window.sendReaction = async function(tid, dk, field, emoji) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const user = getCurrentUser();
  if (!user) return;
  // 리액션을 _likes에 저장 (이모지 포함)
  await toggleLike(tid, dk, field, emoji);
  _showToast(`${emoji} 리액션을 보냈어요!`);
  // 프로필 모달이 열려있으면 갱신
  if (document.getElementById('dynamic-modal')) {
    const accounts = await getAccountList();
    const acc = accounts.find(a => a.id === tid);
    const name = acc ? acc.lastName + acc.firstName : tid;
    document.getElementById('dynamic-modal').remove();
    window.openFriendProfile(tid, name);
  }
  _renderFriendFeed();
};
window.markNotifRead = async function(id) { await markNotificationRead(id); _renderFriendFeed(); refreshNotifCenter(); };

// 토마토 선물
window.openTomatoGiftModal = function(friendId, friendName) {
  const state = getTomatoState();
  const available = state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0);
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">토마토 선물하기</div>
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:15px;font-weight:500;color:var(--text);margin-bottom:12px;"><b>${friendName}</b>님에게 토마토를 선물할까요?</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px;">남은 토마토: <b style="color:var(--primary);">${available}개</b></div>
        ${available <= 0
          ? `<div style="font-size:13px;color:var(--text-tertiary);padding:12px;background:var(--surface2);border-radius:12px;margin-bottom:12px;">선물할 토마토가 없어요. 목표를 달성해서 토마토를 수확하세요!</div>
             <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>`
          : `<input class="login-input" id="tomato-gift-msg" placeholder="응원 메시지 (선택)" style="margin-bottom:16px;text-align:center;">
             <div style="display:flex;gap:8px;">
               <button style="flex:1;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;" onclick="document.getElementById('dynamic-modal')?.remove()">취소</button>
               <button style="flex:2;padding:10px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;" onclick="sendTomatoGiftFromModal('${friendId}')">선물하기</button>
             </div>`
        }
      </div>
    </div>
  </div>`;
};

window.sendTomatoGiftFromModal = async function(friendId) {
  const msg = document.getElementById('tomato-gift-msg')?.value || '';
  const result = await sendTomatoGift(friendId, msg);
  if (result.error) { alert(result.error); return; }
  document.getElementById('modals-container').innerHTML = '';
  renderHome();
  refreshNotifCenter();
};

// ── 통합 알림센터 ────────────────────────────────────────────────
let _notifCenterOpen = false;

function _formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  const d = Math.floor(h / 24);
  if (d < 30) return d + '일 전';
  return Math.floor(d / 30) + '달 전';
}

async function refreshNotifCenter() {
  const user = getCurrentUser();
  if (!user) return;

  const [pending, notifs, accounts] = await Promise.all([
    getPendingRequests(),
    getMyNotifications(),
    getAccountList()
  ]);
  const unread = notifs.filter(n => !n.read);

  // 배지 업데이트
  const badge = document.getElementById('notif-badge');
  const total = pending.length + unread.length;
  if (badge) {
    badge.style.display = total > 0 ? '' : 'none';
    badge.textContent = total > 99 ? '99+' : total;
  }

  // 리스트 렌더링
  const list = document.getElementById('notif-center-list');
  if (!list) return;

  if (pending.length === 0 && notifs.length === 0) {
    list.innerHTML = '<div class="notif-empty">알림이 없어요</div>';
    return;
  }

  let html = '';

  // 친구 요청 (최상단)
  for (const req of pending) {
    const a = accounts.find(x => x.id === req.from);
    const nm = a ? a.lastName + a.firstName : req.from;
    html += `<div class="notif-item unread">
      <div class="notif-icon friend-req">👋</div>
      <div class="notif-body">
        <div class="notif-message"><b style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();closeNotifCenter();openFriendProfile('${req.from}','${nm}')">${nm}</b>님이 이웃 요청을 보냈어요</div>
        <div class="notif-time">${_formatTimeAgo(req.createdAt)}</div>
        <div class="notif-actions">
          <button class="notif-accept-btn" onclick="event.stopPropagation();acceptFriendFromNotif('${req.id}')">수락</button>
          <button class="notif-reject-btn" onclick="event.stopPropagation();rejectFriendFromNotif('${req.id}')">거절</button>
        </div>
      </div>
    </div>`;
  }

  // 일반 알림 (읽은 것은 최근 5개만)
  let readShown = 0;
  for (const n of notifs) {
    if (n.read && readShown >= 5) continue;
    if (n.read) readShown++;
    if (n.type === 'friend_request' && pending.some(p => p.from === n.from)) continue;
    const a = accounts.find(x => x.id === n.from);
    const nm = a ? a.lastName + a.firstName : (n.from || '');
    let icon, iconClass;
    if (n.type === 'like')            { icon = '❤️'; iconClass = 'like'; }
    else if (n.type === 'friend_accepted') { icon = '🤝'; iconClass = 'friend-ok'; }
    else if (n.type === 'friend_request')  { icon = '👋'; iconClass = 'friend-req'; }
    else if (n.type === 'tomato_gift')     { icon = '🍅'; iconClass = 'default'; }
    else if (n.type === 'reaction')        { icon = n.message?.match(/[👏🔥💪😍🍅]/)?.[0] || '💬'; iconClass = 'like'; }
    else if (n.type === 'guestbook')       { icon = '📝'; iconClass = 'default'; }
    else if (n.type === 'introduce')      { icon = '👋'; iconClass = 'friend-req'; }
    else                                   { icon = '💬'; iconClass = 'default'; }
    const unreadCls = n.read ? '' : ' unread';
    const introAction = (n.type === 'introduce' && n.introducedId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button class="notif-accept-btn" onclick="event.stopPropagation();sendFriendFromIntro('${n.introducedId}','${n.id}')">이웃 추가하기</button>
        </div>` : '';
    const clickAction = n.type === 'guestbook'
      ? `markNotifFromCenter('${n.id}',this);closeNotifCenter();openMyGuestbook()`
      : `markNotifFromCenter('${n.id}',this)`;
    html += `<div class="notif-item${unreadCls}" onclick="${clickAction}">
      <div class="notif-icon ${iconClass}">${icon}</div>
      <div class="notif-body">
        <div class="notif-message"><b>${nm}</b>님이 ${n.message || ''}</div>
        <div class="notif-time">${_formatTimeAgo(n.createdAt)}</div>
        ${introAction}
      </div>
    </div>`;
  }

  list.innerHTML = html || '<div class="notif-empty">알림이 없어요</div>';
}

window.toggleNotifCenter = function() {
  _notifCenterOpen = !_notifCenterOpen;
  document.getElementById('notif-center').classList.toggle('open', _notifCenterOpen);
  document.getElementById('notif-center-backdrop').classList.toggle('open', _notifCenterOpen);
  if (_notifCenterOpen) refreshNotifCenter();
};

window.closeNotifCenter = function() {
  _notifCenterOpen = false;
  document.getElementById('notif-center').classList.remove('open');
  document.getElementById('notif-center-backdrop').classList.remove('open');
};

window.markAllNotifsRead = async function() {
  const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const { getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const db = getFirestore();
  const notifs = await getMyNotifications();
  // 모든 알림 삭제 (Firebase에서 완전 제거)
  await Promise.all(notifs.map(n => deleteDoc(doc(db, '_notifications', n.id)).catch(() => {})));
  refreshNotifCenter();
  _renderFriendFeed();
  _showToast('알림을 모두 지웠어요');
};

window.acceptFriendFromNotif = async function(id) {
  await acceptFriendRequest(id);
  _showToast('🤝 이제 이웃 이웃가 되었어요!');
  refreshNotifCenter();
  _renderFriendFeed();
};

window.rejectFriendFromNotif = async function(id) {
  await removeFriend(id);
  refreshNotifCenter();
  _renderFriendFeed();
};

window.markNotifFromCenter = async function(id, el) {
  if (el) el.classList.remove('unread');
  await markNotificationRead(id);
  // 배지만 갱신
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const cnt = parseInt(badge.textContent) - 1;
    if (cnt <= 0) { badge.style.display = 'none'; }
    else { badge.textContent = cnt; }
  }
  _renderFriendFeed();
};

// 앱 init 시 호출 가능하게 export
export { refreshNotifCenter };

// ── TDS 토스트 알림 ──────────────────────────────────────────────
function _showToast(message, duration = 2500) {
  const existing = document.getElementById('tds-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'tds-toast';
  toast.className = 'tds-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── 유틸 ──────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

