// ================================================================
// render-home.js
// ================================================================

import { MUSCLES }                                   from './config.js';
import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         getExercises, getExList,
         calcStreaks, getGoals,
         getQuests, dateKey, getMiniMemoItems,
         getSectionTitle, getQuestOrder, saveQuestOrder,
         getDietPlan, calcDietMetrics, getBodyCheckins } from './data.js';
import { openSheet }                                 from './sheet.js';

export function renderHome() {
  _renderDashboard();
  _renderMiniMemo();
  _applyAllSectionTitles();
  _renderGoals();
  _renderQuests();
  _renderDietGoalCard();
  _renderTodayDiet();
  _renderTodayWorkout();
  _initQuestDragDrop();
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
  const keys = ['mini_memo','goals','quests','stocks','today_diet','today_workout'];
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
  if (!plan.weight || !plan.targetBodyFatPct) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">
      <div style="margin-bottom:8px">⚙️ 다이어트 플랜을 설정하면<br>목표와 진행률을 확인할 수 있어요</div>
      <button class="quest-add-btn" onclick="openDietPlanModal()" style="padding:6px 20px">설정하기</button>
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

// ── 유틸 ──────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

