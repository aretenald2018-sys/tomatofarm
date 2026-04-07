// ================================================================
// home/tomato.js — 토마토 사이클, 히어로, 바스켓, 통합 카드
// ================================================================

import { TODAY, getDiet, getDietPlan, calcDietMetrics, getBodyCheckins,
         getExercises, calcStreaks,
         getUnitGoalStart, saveUnitGoalStart, getDayTargetKcal,
         getTomatoState, saveTomatoState, saveTomatoCycle,
         getTomatoCycles, dateKey }  from '../data.js';
import { calcTomatoCycle, evaluateCycleResult, getQuarterKey,
         isDietDaySuccess, getDayTargetKcal as calcDayTarget }  from '../calc.js';
import { renderStreakFreeze, checkStreakMilestone } from './hero.js';

const TOMATO_STAGES = [
  { icon: '🌱', label: '씨앗을 심었어요' },
  { icon: '🌿', label: '줄기가 자라고 있어요' },
  { icon: '🌸', label: '꽃이 피었어요! 내일이면 수확해요' },
  { icon: '🍅', label: '오늘만 지키면 토마토를 수확해요!' },
];

// ── 토마토 히어로 (게스트 전용, _renderHero에서 호출) ────────────
export function renderTomatoHero(el) {
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

  const todayDiet = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayKcal = (todayDiet.bKcal || 0) + (todayDiet.lKcal || 0) + (todayDiet.dKcal || 0) + (todayDiet.sKcal || 0);
  const todayTarget = calcDayTarget(plan, TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  const hasPriorFail = dayStatuses.slice(0, cycle.dayIndex).some(s => s === 'fail');

  const stage = TOMATO_STAGES[cycle.dayIndex];
  let stageIcon = stage.icon;
  let message = stage.label;

  if (cycle.dayIndex === 3 && hasPriorFail) {
    stageIcon = '🌸';
    message = '이번 사이클은 아쉽지만, 내일 새로운 시작이에요';
  } else if (hasPriorFail && cycle.dayIndex < 3) {
    message = '아직 포기하지 마세요! 좋은 습관을 만들어가요';
  }

  const dayNames = ['일','월','화','수','목','금','토'];
  const dateStr = `${TODAY.getMonth()+1}월 ${TODAY.getDate()}일 ${dayNames[TODAY.getDay()]}요일`;

  const dots = dayStatuses.map((s, i) => {
    let cls = 'tomato-dot';
    if (s === 'success') cls += ' success';
    else if (s === 'fail') cls += ' fail';
    if (i === cycle.dayIndex) cls += ' current';
    return `<div class="${cls}"></div>`;
  }).join('');

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
      <div class="streak-freeze-row" id="streak-freeze-row"></div>
      <div class="hero-social-proof" id="hero-social-proof" style="display:none;"></div>
    </div>
  `;
  renderStreakFreeze();
}

// ── 토마토 사이클 정산 ──────────────────────────────────────────
export function settleTomatoCycleIfNeeded() {
  const startStr = getUnitGoalStart();
  if (!startStr) return;

  const cycle = calcTomatoCycle(startStr, TODAY);
  if (!cycle.cycleStart) return;

  const state = getTomatoState();
  const plan = getDietPlan();
  const existingCycles = getTomatoCycles();
  const existingIds = new Set(existingCycles.map(c => c.id));

  const start = new Date(startStr + 'T00:00:00');
  const todayMs = new Date(dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - start.getTime()) / 86400000);
  if (diffDays < 4) return;

  const totalCycles = Math.floor(diffDays / 4);
  const startCycle = Math.max(0, totalCycles - 10);

  for (let ci = startCycle; ci < totalCycles; ci++) {
    const csDate = new Date(start);
    csDate.setDate(csDate.getDate() + ci * 4);
    const csKey = `${csDate.getFullYear()}-${String(csDate.getMonth()+1).padStart(2,'0')}-${String(csDate.getDate()).padStart(2,'0')}`;
    const cycleId = `cycle_${csKey}`;

    if (existingIds.has(cycleId)) continue;

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
export function renderTomatoBasket() {
  const el = document.getElementById('tomato-basket-content');
  if (!el) return;

  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCycles = getTomatoCycles(qKey);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const giftCount = state.giftedReceived || 0;
  const totalAvailable = state.totalTomatoes + state.giftedReceived - state.giftedSent;

  const qStart = new Date(TODAY.getFullYear(), Math.floor(TODAY.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const maxCycles = Math.floor((qEnd.getTime() - qStart.getTime()) / 86400000 / 4);

  let gridHtml = '';
  for (let i = 0; i < maxCycles; i++) {
    if (i < qCount) {
      gridHtml += '<div class="tomato-basket-cell earned">🍅</div>';
    } else {
      gridHtml += '<div class="tomato-basket-cell"></div>';
    }
  }

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
function buildMacroLine(label, dayData, actKey, tgtKey, lessIsGood) {
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

// ── 다이어트 현황 HTML 빌드 ──────────────────────────────────────
function buildDietStatusHtml(plan, metrics) {
  if (!plan._userSet || !plan.weight) return '';

  const checkins = getBodyCheckins();
  const latest = checkins.length ? checkins[checkins.length - 1] : null;
  const curWeight = latest?.weight ?? plan.weight;
  const wTarget = plan.targetWeight || (plan.weight - (metrics.totalWeightLoss || 0));
  const wStart = plan.weight;
  const lost = Math.max(wStart - curWeight, 0);
  const remain = Math.max(curWeight - wTarget, 0);
  const wProgress = wStart > wTarget ? Math.min(Math.round((wStart - curWeight) / (wStart - wTarget) * 100), 100) : 0;

  const weeksLeft = metrics.weeksNeeded;
  const doneText = plan.startDate
    ? (() => { const d = new Date(plan.startDate); d.setDate(d.getDate() + Math.round(weeksLeft * 7)); return `${d.getMonth()+1}/${d.getDate()}`; })()
    : `${Math.round(weeksLeft)}주 후`;

  const dow = TODAY.getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);

  return `
    <div class="tf-diet-section">
      <div class="tf-kcal-header">
        <span class="tf-kcal-label">다이어트 현황</span>
        <button onclick="openCheckinModal()" style="font-size:11px;color:#fa342c;font-weight:600;background:none;border:none;cursor:pointer;padding:0;">몸무게 입력 →</button>
      </div>
      <div class="tf-diet-body">
        <div class="tf-diet-stats">
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">현재</span>
            <span class="tf-diet-stat-value">${curWeight.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
          <div class="tf-diet-stat-arrow">→</div>
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">목표</span>
            <span class="tf-diet-stat-value">${wTarget.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
          <div class="tf-diet-stat-divider"></div>
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">감량</span>
            <span class="tf-diet-stat-value tf-diet-highlight">${lost > 0 ? '-' : ''}${lost.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
        </div>
        <div class="tf-diet-progress-wrap">
          <div class="tf-diet-progress-bar">
            <div class="tf-diet-progress-fill" style="width:${wProgress}%"></div>
          </div>
          <div class="tf-diet-progress-info">
            <div class="tf-diet-tags">
              <span class="tf-diet-tag ${isRefeed ? 'tf-diet-tag-blue' : 'tf-diet-tag-orange'}">${isRefeed ? '리피드' : '데피싯'}</span>
              ${remain > 0 ? `<span class="tf-diet-tag tf-diet-tag-gray">${remain.toFixed(1)}kg 남음</span>` : '<span class="tf-diet-tag tf-diet-tag-green">달성!</span>'}
            </div>
            <span class="tf-diet-eta">📅 ${doneText} 예상</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ── 토마토 통합 카드 (게스트용 메인 카드) ────────────────────────
export function renderTomatoCard() {
  const heroEl = document.getElementById('hero-content');
  const unitEl = document.getElementById('unit-goal-content');
  if (!heroEl) return;

  const plan = getDietPlan();
  const _chk = getBodyCheckins();
  const _latestW = _chk.length ? _chk[_chk.length - 1].weight : null;
  const metrics = calcDietMetrics(_latestW ? { ...plan, weight: _latestW } : plan);
  const tomatoState = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = tomatoState.quarterlyTomatoes[qKey] || 0;
  const totalCount = tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0);

  let startStr = getUnitGoalStart();
  if (!startStr) {
    startStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    saveUnitGoalStart(startStr);
  }
  const cycle = calcTomatoCycle(startStr, TODAY);
  const dayIndex = cycle.dayIndex;
  const stages = ['🌱','🌿','🌸','🍅'];
  const stageLabels = ['씨앗 심기','새싹 돌보기','꽃 피우기','수확하기'];

  const streaks = calcStreaks();
  const bestStreak = Math.max(streaks.workout, streaks.diet);
  const streakType = streaks.workout >= streaks.diet ? '운동' : '식단';
  const todayDk = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayDiet = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayExercises = getExercises(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const hasRecordedToday = (todayExercises && todayExercises.length > 0) ||
    (todayDiet && ((todayDiet.bKcal||0) + (todayDiet.lKcal||0) + (todayDiet.dKcal||0) > 0));
  const now = new Date();
  const hoursLeft = 23 - now.getHours();
  const isEvening = now.getHours() >= 18;

  const todayDietForKcal = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayKcal = (todayDietForKcal.bKcal||0) + (todayDietForKcal.lKcal||0) + (todayDietForKcal.dKcal||0) + (todayDietForKcal.sKcal||0);
  const dow = TODAY.getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const dayTarget = isRefeed ? metrics.refeed : metrics.deficit;
  const todayTarget = dayTarget.kcal || 0;

  let heroLabel, heroCount, heroSub, heroEmoji;

  if (bestStreak >= 14 && hasRecordedToday) {
    heroLabel = '멈출 수 없는 기세!';
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 7 && hasRecordedToday) {
    heroLabel = '대단해요, 일주일 넘었어요!';
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 3 && hasRecordedToday) {
    heroLabel = '좋은 흐름이에요!';
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 2 && !hasRecordedToday && isEvening) {
    heroLabel = '연속 기록이 위험해요!';
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `<span style="color:#FF3B30;font-weight:600;">오늘 기록하면 ${bestStreak + 1}일째 · ${hoursLeft}시간 남음</span>`;
    heroEmoji = '⚠️';
  } else if (bestStreak >= 2 && !hasRecordedToday) {
    heroLabel = '오늘도 이어가볼까요?';
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `<span style="color:var(--primary);font-weight:600;">기록하면 ${bestStreak + 1}일 연속!</span>`;
    heroEmoji = '💪';
  } else if (hasRecordedToday) {
    heroLabel = '오늘도 기록 완료!';
    heroCount = `${totalCount}<span class="tf-hero-unit">개</span>`;
    heroSub = `이번 분기 <b>${qCount}개</b> 수확`;
    heroEmoji = stages[dayIndex];
  } else {
    heroLabel = '오늘 첫 기록을 남겨보세요';
    heroCount = `${totalCount}<span class="tf-hero-unit">개</span>`;
    heroSub = `이번 분기 <b>${qCount}개</b> 수확`;
    heroEmoji = stages[dayIndex];
  }

  heroEl.innerHTML = `
    <div class="tf-card">
      <div class="tf-hero tf-hero--gradient">
        <div class="tf-hero-left">
          <div class="tf-hero-label">${heroLabel}</div>
          <div class="tf-hero-count">${heroCount}</div>
          <div class="tf-hero-sub">${heroSub}</div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${heroEmoji}</div>
        </div>
      </div>
      <div class="streak-freeze-row" id="streak-freeze-row" style="padding:0 16px;"></div>
      <div class="hero-social-proof" id="hero-social-proof" style="display:none;padding:0 16px 12px;"></div>
    </div>
  `;
  renderStreakFreeze();

  checkStreakMilestone('workout', streaks.workout);
  checkStreakMilestone('diet', streaks.diet);

  const unitCard = document.getElementById('card-unit-goal');
  if (unitCard) unitCard.style.display = 'none';

  document.getElementById('tf-meal-card')?.remove();
  document.getElementById('tf-weight-card')?.remove();

  const homeHero = document.getElementById('home-hero');
  const todayDietData = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const totalIntake = (todayDietData.bKcal||0) + (todayDietData.lKcal||0) + (todayDietData.dKcal||0) + (todayDietData.sKcal||0);
  const kcalPct = todayTarget > 0 ? Math.min(Math.round(totalIntake / todayTarget * 100), 100) : 0;
  const kcalState = totalIntake <= 0 ? '' : totalIntake <= todayTarget + 50 ? 'ok' : 'over';
  const remaining = Math.max(todayTarget - totalIntake, 0);

  const mealCard = document.createElement('div');
  mealCard.id = 'tf-meal-card';
  mealCard.className = 'home-card tf-summary-card';
  mealCard.onclick = () => switchTab('diet');
  mealCard.innerHTML = `
    <div class="tf-sum-row">
      <div class="tf-sum-left">
        <span class="tf-sum-title">오늘의 칼로리</span>
        <div class="tf-sum-nums">
          <span class="tf-sum-big ${kcalState === 'over' ? 'tf-over' : ''}">${totalIntake > 0 ? totalIntake.toLocaleString() : '—'}</span>
          <span class="tf-sum-sep">/</span>
          <span class="tf-sum-target">${todayTarget.toLocaleString()}<span class="tf-sum-unit">kcal</span></span>
        </div>
        ${totalIntake > 0 && todayTarget > 0 ? `<span class="tf-sum-remaining ${kcalState}">${kcalState === 'over' ? `${(totalIntake - todayTarget).toLocaleString()}kcal 초과` : `${remaining.toLocaleString()}kcal 남음`}</span>` : '<span class="tf-sum-remaining">아직 기록이 없어요</span>'}
      </div>
      <div class="tf-sum-ring-wrap">
        <svg class="tf-sum-ring" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--surface2)" stroke-width="5"/>
          <circle cx="24" cy="24" r="20" fill="none"
            stroke="${kcalState === 'over' ? '#e53935' : 'var(--primary)'}"
            stroke-width="5" stroke-linecap="round"
            stroke-dasharray="${Math.round(125.66 * Math.min(kcalPct, 100) / 100)} 125.66"
            transform="rotate(-90 24 24)"
            style="transition:stroke-dasharray 0.5s ease;"/>
        </svg>
        <span class="tf-sum-ring-text">${kcalPct}%</span>
      </div>
    </div>
    <div class="tf-sum-footer">
      <span class="tf-sum-hint">식단 탭에서 상세 보기</span>
      <span class="tf-sum-arrow">›</span>
    </div>
  `;
  homeHero.after(mealCard);

  if (plan._userSet && plan.weight) {
    const checkins = getBodyCheckins();
    const latest = checkins.length ? checkins[checkins.length - 1] : null;
    const curWeight = latest?.weight ?? plan.weight;
    const wTarget = plan.targetWeight || (plan.weight - (metrics.totalWeightLoss || 0));
    const wStart = plan.weight;
    const lost = Math.max(wStart - curWeight, 0);
    const wRange = wStart - wTarget;
    const wProgress = wRange > 0 ? Math.min(Math.round(Math.max(wStart - curWeight, 0) / wRange * 100), 100) : 0;
    const wProgressVisual = (wStart - curWeight) > 0 ? Math.max(wProgress, 8) : 0;

    const weightCard = document.createElement('div');
    weightCard.id = 'tf-weight-card';
    weightCard.className = 'home-card tf-summary-card';
    weightCard.onclick = () => openCheckinModal();
    weightCard.innerHTML = `
      <div class="tf-sum-row">
        <div class="tf-sum-left">
          <span class="tf-sum-title">체중</span>
          <div class="tf-sum-nums">
            <span class="tf-sum-big">${curWeight.toFixed(1)}</span>
            <span class="tf-sum-unit-lg">kg</span>
            ${lost > 0 ? `<span class="tf-wt-delta">-${lost.toFixed(1)}</span>` : ''}
          </div>
        </div>
        <div class="tf-sum-right-text">
          <span class="tf-sum-hint">몸무게 입력 ›</span>
        </div>
      </div>
      <div class="tf-wt-journey">
        <div class="tf-wt-journey-bar">
          <div class="tf-wt-journey-fill tf-wt-animate" data-width="${wProgressVisual}"></div>
          <div class="tf-wt-journey-marker tf-wt-animate-marker" data-left="${wProgressVisual}"></div>
        </div>
      </div>
    `;
    mealCard.after(weightCard);

    setTimeout(() => {
      const fill = weightCard.querySelector('.tf-wt-animate');
      const marker = weightCard.querySelector('.tf-wt-animate-marker');
      if (fill) { fill.style.width = fill.dataset.width + '%'; }
      if (marker) { marker.style.left = marker.dataset.left + '%'; }
    }, 50);
  }
}
