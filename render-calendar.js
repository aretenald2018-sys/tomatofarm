// ================================================================
// render-calendar.js — 캘린더 탭
// 월별 그리드로 일자별 100점 만점 점수 + (섭취kcal/소모kcal/체중) 표시
// ================================================================

import {
  getCache,
  getBodyCheckins,
  getDietPlan,
  getLatestCheckinWeight,
} from './data.js';
import {
  calcDietMetrics,
  getDayTargetKcal,
  calcBurnedKcal,
  calcDayScore,
} from './calc.js';
import { dateKey, TODAY, isFuture, isBeforeStart } from './data/data-date.js';
import { openModal, closeModal } from './utils/dom.js';

// ═════════════════════════════════════════════════════════════
// 뷰 상태
// ═════════════════════════════════════════════════════════════
let _viewYear  = TODAY.getFullYear();
let _viewMonth = TODAY.getMonth();

// ═════════════════════════════════════════════════════════════
// 체중 시계열 유틸
// ═════════════════════════════════════════════════════════════
function _sortedCheckins() {
  return (getBodyCheckins() || [])
    .filter(c => c?.date && typeof c.weight === 'number' && isFinite(c.weight))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function _weightAt(sortedCheckins, key) {
  for (let i = sortedCheckins.length - 1; i >= 0; i--) {
    if (sortedCheckins[i].date <= key) return sortedCheckins[i].weight;
  }
  return null;
}

function _shiftDateKey(key, days) {
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// ═════════════════════════════════════════════════════════════
// 한 날짜의 전체 메트릭 계산
// ═════════════════════════════════════════════════════════════
function _dayMetrics(key, day, plan, metrics, checkins) {
  // 체중 (stepwise)
  const weight = _weightAt(checkins, key);
  const bodyWeight = weight != null
    ? weight
    : (getLatestCheckinWeight() ?? plan?.weight ?? 70);

  // 섭취 칼로리
  const kcalIn = (day.bKcal||0) + (day.lKcal||0) + (day.dKcal||0) + (day.sKcal||0);

  // 소모 칼로리 (MET 기반)
  const burned = calcBurnedKcal(day, bodyWeight);

  // 목표 칼로리 & 탄단지
  let targetKcal = 0;
  let macroTarget = null;
  if (plan && plan.weight && plan.height) {
    const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
    try {
      targetKcal = getDayTargetKcal(plan, yy, mm - 1, dd, day);
      const dow = new Date(yy, mm - 1, dd).getDay();
      const isRefeed = (plan.refeedDays || []).includes(dow);
      const macro = isRefeed ? metrics.refeed : metrics.deficit;
      macroTarget = { proteinG: macro.proteinG, carbG: macro.carbG, fatG: macro.fatG };
    } catch (_) { /* plan 불완전 */ }
  }

  // 체중 방향성 (7일전 대비)
  let weightDeltaKg = null;
  let weightDirSign = -1; // 기본: 감량
  if (plan && plan.targetWeight && plan.weight) {
    weightDirSign = plan.targetWeight < plan.weight ? -1
                  : plan.targetWeight > plan.weight ? +1 : 0;
  }
  if (weight != null) {
    const prevKey = _shiftDateKey(key, -7);
    const prevW = _weightAt(checkins, prevKey);
    if (prevW != null) weightDeltaKg = weight - prevW;
  }

  // 점수
  const scoreResult = calcDayScore({
    day, targetKcal, macroTarget, burnedKcal: burned.total,
    weightDeltaKg, weightDirSign,
  });

  return {
    key, day,
    kcalIn, kcalBurned: burned.total, burnedBreakdown: burned,
    weight,
    targetKcal, macroTarget,
    weightDeltaKg, weightDirSign,
    score: scoreResult.score,
    band: scoreResult.band,
    breakdown: scoreResult.breakdown,
  };
}

// ═════════════════════════════════════════════════════════════
// 월 이동
// ═════════════════════════════════════════════════════════════
function _shiftMonth(delta) {
  const d = new Date(_viewYear, _viewMonth + delta, 1);
  _viewYear  = d.getFullYear();
  _viewMonth = d.getMonth();
  renderCalendar();
}

function _goToday() {
  _viewYear  = TODAY.getFullYear();
  _viewMonth = TODAY.getMonth();
  renderCalendar();
}

// ═════════════════════════════════════════════════════════════
// 렌더
// ═════════════════════════════════════════════════════════════
export function renderCalendar() {
  const root = document.getElementById('calendar-root');
  if (!root) return;

  const cache = getCache() || {};
  const plan = getDietPlan() || null;
  const metrics = (plan && plan.weight && plan.height) ? calcDietMetrics(plan) : null;
  const checkins = _sortedCheckins();

  const y = _viewYear, m = _viewMonth;
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const daysCount = new Date(y, m + 1, 0).getDate();

  // 월내 집계 (상단 요약용)
  let monthSum = { scored: 0, count: 0, kcalIn: 0, kcalBurn: 0 };
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(`<div class="cal-cell cal-cell-empty"></div>`);

  for (let d = 1; d <= daysCount; d++) {
    const k = dateKey(y, m, d);
    const day = cache[k] || {};
    const future = isFuture(y, m, d);
    const before = isBeforeStart(y, m, d);
    const today  = k === dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const disabled = future || before;

    const mx = _dayMetrics(k, day, plan, metrics, checkins);

    if (mx.score != null) {
      monthSum.scored += mx.score;
      monthSum.count  += 1;
      monthSum.kcalIn += mx.kcalIn;
      monthSum.kcalBurn += mx.kcalBurned;
    }

    const classes = [
      'cal-cell',
      today ? 'cal-cell-today' : '',
      disabled ? 'cal-cell-disabled' : '',
      mx.band ? `cal-cell-band-${mx.band}` : '',
    ].filter(Boolean).join(' ');

    const onclick = disabled ? '' : `onclick="window._calOpenDay('${k}')"`;
    const scoreHtml = mx.score != null
      ? `<div class="cal-score">${mx.score}<span>점</span></div>`
      : `<div class="cal-score cal-score-empty">—</div>`;

    const kcalInTxt   = mx.kcalIn     > 0 ? `${mx.kcalIn.toLocaleString()}` : '—';
    const kcalBurnTxt = mx.kcalBurned > 0 ? `${mx.kcalBurned.toLocaleString()}` : '—';
    const weightTxt   = mx.weight != null ? `${mx.weight.toFixed(1)}` : '—';

    const stampHtml = (mx.score != null && mx.score >= 90)
      ? `<img class="cal-stamp" src="./favicon.svg" alt="" aria-hidden="true">`
      : '';

    cells.push(`
      <div class="${classes}" ${onclick}>
        ${stampHtml}
        <div class="cal-cell-head">
          <span class="cal-cell-date">${d}</span>
          ${scoreHtml}
        </div>
        <div class="cal-cell-metrics">
          <div class="cal-metric"><span class="cal-metric-label">섭</span><span class="cal-metric-val">${kcalInTxt}</span></div>
          <div class="cal-metric"><span class="cal-metric-label">소</span><span class="cal-metric-val">${kcalBurnTxt}</span></div>
          <div class="cal-metric"><span class="cal-metric-label">체</span><span class="cal-metric-val">${weightTxt}</span></div>
        </div>
      </div>
    `);
  }

  const monthLabel = `${y}년 ${m + 1}월`;
  const avgScore = monthSum.count > 0 ? Math.round(monthSum.scored / monthSum.count) : null;
  const weekdays = ['일','월','화','수','목','금','토'];

  root.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav-btn" onclick="window._calShiftMonth(-1)" aria-label="이전 달">‹</button>
      <div class="cal-title">
        <span>${monthLabel}</span>
        <button class="cal-today-btn" onclick="window._calGoToday()">오늘</button>
      </div>
      <button class="cal-nav-btn" onclick="window._calShiftMonth(1)" aria-label="다음 달">›</button>
    </div>

    ${avgScore != null ? `
    <div class="cal-month-summary">
      <div class="cal-month-avg">
        <span class="cal-month-avg-label">이번 달 평균</span>
        <span class="cal-month-avg-score">${avgScore}<span>점</span></span>
      </div>
      <div class="cal-month-side">
        <div><span>기록일</span><strong>${monthSum.count}일</strong></div>
        <div><span>총 섭취</span><strong>${monthSum.kcalIn.toLocaleString()} kcal</strong></div>
        <div><span>총 소모</span><strong>${monthSum.kcalBurn.toLocaleString()} kcal</strong></div>
      </div>
    </div>` : `
    <div class="cal-month-summary cal-month-empty">
      <span>이번 달 기록이 아직 없어요</span>
    </div>`}

    <div class="cal-weekdays">
      ${weekdays.map((w, i) => `<div class="cal-wd ${i === 0 ? 'cal-wd-sun' : ''} ${i === 6 ? 'cal-wd-sat' : ''}">${w}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells.join('')}</div>

    <div class="cal-footnote">
      점수 산정 (100점 만점, 최저 70점): 칼로리(12) · 탄단지(5) · 운동 소모(8) · 체중 방향(3) · 기록 완결(2)
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════
// 일자 상세 요약 모달
// ═════════════════════════════════════════════════════════════
function _openDay(key) {
  const cache = getCache() || {};
  const day = cache[key] || {};
  const plan = getDietPlan() || null;
  const metrics = (plan && plan.weight && plan.height) ? calcDietMetrics(plan) : null;
  const checkins = _sortedCheckins();

  const mx = _dayMetrics(key, day, plan, metrics, checkins);

  const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
  const d = new Date(yy, mm - 1, dd);
  const dowLabel = ['일','월','화','수','목','금','토'][d.getDay()];
  const title = `${yy}.${String(mm).padStart(2,'0')}.${String(dd).padStart(2,'0')} (${dowLabel})`;

  const titleEl = document.getElementById('calendar-day-title');
  const body = document.getElementById('calendar-day-body');
  if (!titleEl || !body) return;
  titleEl.textContent = title;

  // 점수 카드
  // 토마토 팔레트 농도 그라데이션
  const scoreColor =
    mx.band === 'great' ? '#ca1d13' :  // Dark
    mx.band === 'good'  ? '#fa342c' :  // Primary
    mx.band === 'soso'  ? '#fc6a66' :  // Sub
    mx.band === 'bad'   ? '#e89591' :  // Light 중간 (가독성)
    'var(--muted)';
  const scoreText = mx.score != null ? `${mx.score}` : '—';
  const bandLabel = mx.band === 'great' ? '완벽' :
                    mx.band === 'good'  ? '잘한 날' :
                    mx.band === 'soso'  ? '아쉬운 날' :
                    mx.band === 'bad'   ? '개선 필요' : '기록 없음';

  // breakdown
  const bd = mx.breakdown || {};
  const row = (label, item, desc) => {
    if (!item) return '';
    const gained = item.max - item.penalty;
    return `<div class="cal-bd-row">
      <div class="cal-bd-main">
        <span class="cal-bd-label">${label}</span>
        <span class="cal-bd-score">${gained}<small>/${item.max}</small></span>
      </div>
      <div class="cal-bd-desc">${desc}</div>
    </div>`;
  };

  const kcalDesc = mx.targetKcal > 0
    ? `목표 ${Math.round(mx.targetKcal).toLocaleString()} kcal · 실제 ${mx.kcalIn.toLocaleString()} kcal`
    : (mx.kcalIn > 0 ? `실제 ${mx.kcalIn.toLocaleString()} kcal (목표 미설정)` : '기록 없음');

  const macroDesc = mx.macroTarget
    ? (() => {
        const p = (day.bProtein||0)+(day.lProtein||0)+(day.dProtein||0)+(day.sProtein||0);
        const c = (day.bCarbs||0)+(day.lCarbs||0)+(day.dCarbs||0)+(day.sCarbs||0);
        const f = (day.bFat||0)+(day.lFat||0)+(day.dFat||0)+(day.sFat||0);
        return `단백 ${Math.round(p)}/${mx.macroTarget.proteinG}g · 탄수 ${Math.round(c)}/${mx.macroTarget.carbG}g · 지방 ${Math.round(f)}/${mx.macroTarget.fatG}g`;
      })()
    : '식단 플랜 미설정';

  const b = mx.burnedBreakdown;
  const workoutParts = [];
  if (b.gym > 0)      workoutParts.push(`헬스 ${b.gym}`);
  if (b.running > 0)  workoutParts.push(`런닝 ${b.running}`);
  if (b.swimming > 0) workoutParts.push(`수영 ${b.swimming}`);
  if (b.cf > 0)       workoutParts.push(`CF ${b.cf}`);
  const workoutDesc = workoutParts.length
    ? `총 ${b.total} kcal (${workoutParts.join(' · ')})`
    : '운동 기록 없음';

  const weightDesc = mx.weight != null
    ? (mx.weightDeltaKg != null
        ? `${mx.weight.toFixed(1)}kg (7일전 대비 ${mx.weightDeltaKg >= 0 ? '+' : ''}${mx.weightDeltaKg.toFixed(1)}kg)`
        : `${mx.weight.toFixed(1)}kg`)
    : '7일 내 체중 기록 없음';

  const meals = [
    { label: '아침', v: day.bKcal || 0, skipped: day.breakfast_skipped },
    { label: '점심', v: day.lKcal || 0, skipped: day.lunch_skipped },
    { label: '저녁', v: day.dKcal || 0, skipped: day.dinner_skipped },
    { label: '간식', v: day.sKcal || 0, skipped: false },
  ];
  const loggedMeals = meals.filter(m => m.v > 0 || m.skipped).length;
  const completeDesc = `식사 기록 ${loggedMeals}/4 (${meals.filter(m => m.skipped).length > 0 ? '굶음 포함' : '기록 중심'})`;

  body.innerHTML = `
    <div class="cal-score-card" style="border-color:${scoreColor}22;background:${scoreColor}0d;">
      <div class="cal-score-big" style="color:${scoreColor};">
        ${scoreText}<span>${mx.score != null ? '점' : ''}</span>
      </div>
      <div class="cal-score-band" style="color:${scoreColor};">${bandLabel}</div>
    </div>

    <div class="cal-bd-list">
      ${row('섭취 칼로리', bd.kcal, kcalDesc)}
      ${row('탄단지 균형', bd.macro, macroDesc)}
      ${row('운동 소모',   bd.workout, workoutDesc)}
      ${row('체중 방향',   bd.weight, weightDesc)}
      ${row('기록 완결',   bd.complete, completeDesc)}
    </div>
  `;

  openModal('calendar-day-modal');
}

function _closeDay(e) {
  if (e && e.target && e.target.id !== 'calendar-day-modal' && !e.target.classList.contains('cal-day-close')) return;
  closeModal('calendar-day-modal');
}

// ═════════════════════════════════════════════════════════════
// window.* 노출
// ═════════════════════════════════════════════════════════════
window._calShiftMonth   = _shiftMonth;
window._calGoToday      = _goToday;
window._calOpenDay      = _openDay;
window._calCloseDay     = _closeDay;
window.renderCalendar   = renderCalendar;
