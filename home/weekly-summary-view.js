// 홈 주간 요약 — 순수 뷰(마크업) 레이어.
// data.js/Firebase/DOM 없이 model 하나로 마크업을 만든다(뷰 테스트·프리뷰에서 재사용).

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value, digits = 0) {
  return (Number(value) || 0).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pace(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return value ? `${Math.floor(value / 60)}'${String(value % 60).padStart(2, '0')}"` : '—';
}

function percent(actual, target) {
  return Number(target) > 0 ? Math.max(0, Math.round((Number(actual) || 0) / Number(target) * 100)) : null;
}

function shortDateMD(key) {
  const [, month, day] = String(key).split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : '';
}

function emptyState(message, actionLabel, tab) {
  return `<div class="summary-empty">
    <strong>${escapeHtml(message)}</strong>
    <span>실제 기록이 생기면 이곳에 집계됩니다.</span>
    ${tab ? `<button type="button" class="tds-btn tonal summary-empty-action" data-action="home:switch-tab" data-tab="${escapeHtml(tab)}">${escapeHtml(actionLabel)}</button>` : ''}
  </div>`;
}

// ── 오늘 식단 ─────────────────────────────────────────────────────
function renderMacroRow(label, actual, target, tone) {
  const hasActual = actual > 0;
  const actualText = hasActual ? number(actual, actual % 1 ? 1 : 0) : '미입력';
  const targetText = target > 0 ? ` / ${number(target)}g` : (hasActual ? 'g' : '');
  const progress = percent(actual, target);
  return `<div class="summary-macro-row">
    <div class="summary-macro-head"><span>${label}</span><b>${progress == null ? '—' : `${progress}%`}</b><strong>${actualText}${targetText}</strong></div>
    ${progress == null ? '<div class="summary-macro-no-target">목표 미설정</div>' : `<div class="summary-progress"><i class="${tone}" style="width:${Math.min(progress, 100)}%"></i></div>`}
  </div>`;
}

function renderDiet(model) {
  const view = model.today.diet;
  const target = view.target;
  const kcalProgress = percent(view.kcal, target?.kcal);
  const calorieText = view.kcal > 0 ? number(view.kcal) : '0';
  const body = view.recorded
    ? `<div class="summary-diet-body">
        <div class="summary-calorie-ring${kcalProgress == null ? ' no-target' : ''}" style="--summary-ring-progress:${Math.min(kcalProgress || 0, 100)}%" role="img" aria-label="오늘 섭취 칼로리 ${calorieText}킬로칼로리">
          <div class="summary-calorie-ring-center"><span class="summary-calorie-label">섭취 칼로리</span><strong>${calorieText}</strong><span>${target ? `/ ${number(target.kcal)} kcal` : 'kcal · 목표 미설정'}</span><b>${kcalProgress == null ? '—' : `${kcalProgress}%`}</b></div>
        </div>
        <div class="summary-macro-list">
          ${renderMacroRow('탄수화물', view.carbG, target?.carbG, 'carb')}
          ${renderMacroRow('단백질', view.proteinG, target?.proteinG, 'protein')}
          ${renderMacroRow('지방', view.fatG, target?.fatG, 'fat')}
        </div>
      </div>`
    : emptyState('오늘 식단 기록이 없습니다', '식단 기록하기', 'diet');
  return `<article class="home-card summary-card summary-diet-card${view.recorded ? '' : ' is-empty'}" id="card-today-diet-summary">
    <div class="home-card-header"><span class="home-card-title">오늘 식단</span><span class="summary-pill">기록된 식사 ${view.mealCount}회</span></div>
    ${body}
  </article>`;
}

// ── 이번 주 근력 목표 ──────────────────────────────────────────────
function renderStrengthGoals(model) {
  const view = model.strengthGoals;
  const body = view.configured
    ? `<ul class="summary-goal-list">${view.goals.map((goal) => `<li class="summary-goal-row${goal.done ? ' is-done' : ''}">
        <span class="summary-goal-check" aria-hidden="true"></span>
        <span class="summary-goal-body"><span class="summary-goal-name">${escapeHtml(goal.label)}</span><span class="summary-goal-target">${number(goal.kg, goal.kg % 1 ? 1 : 0)}kg ${goal.reps}${goal.amrap ? '+' : ''}회</span></span>
      </li>`).join('')}</ul>`
    : emptyState('이번 주 근력 목표가 없습니다', '시즌 목표 설정', 'workout');
  return `<article class="home-card compact summary-card summary-split-card summary-goal-card${view.configured ? '' : ' is-empty'}" id="card-weekly-strength-goal">
    <div class="home-card-header"><span class="home-card-title"><span class="summary-title-icon" aria-hidden="true">💪</span>이번 주 근력 목표</span></div>
    ${view.configured ? `<div class="summary-goal-progress"><strong>${view.doneCount}</strong> / ${view.total} 목표 달성</div>` : ''}
    ${body}
  </article>`;
}

// ── 최근 러닝 ─────────────────────────────────────────────────────
function renderRunsBars(runs) {
  const max = Math.max(...runs.map((run) => Number(run.distanceKm) || 0), 0);
  let bestIndex = -1;
  let bestDistance = -1;
  runs.forEach((run, index) => {
    if ((Number(run.distanceKm) || 0) > bestDistance) { bestDistance = Number(run.distanceKm) || 0; bestIndex = index; }
  });
  return `<div class="summary-run-chart" role="img" aria-label="최근 러닝 거리">
    ${runs.map((run, index) => {
      const distanceKm = Number(run.distanceKm) || 0;
      const height = max > 0 && distanceKm > 0 ? Math.max(18, Math.round((distanceKm / max) * 100)) : 8;
      const best = index === bestIndex;
      return `<div class="summary-run-bar-col">
        <div class="summary-run-bar-track"><i class="has-run${best ? ' is-best' : ''}" style="height:${height}%"></i></div>
        <span class="${best ? 'is-best' : ''}">${shortDateMD(run.dateKey)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderRunning(model) {
  const run = model.recentRunning;
  const delta = run.paceDeltaSec; // 음수 = 페이스 단축(개선)
  const body = run.hasData
    ? `<div class="summary-run-top">
        <span class="summary-run-kicker">최근 최고</span>
        <div class="summary-pace"><strong>${pace(run.bestPaceSecPerKm)}</strong><b>/km</b></div>
      </div>
      ${delta == null ? '' : `<div class="summary-run-improve"><span>페이스 개선</span><strong class="summary-run-delta${delta < 0 ? ' is-positive' : delta > 0 ? ' is-negative' : ''}">${delta === 0 ? '±0초' : `${delta < 0 ? '-' : '+'}${Math.abs(delta)}초`}</strong></div>`}
      ${run.bestPriorPaceSecPerKm > 0 ? `<div class="summary-run-prev">이전 최고 ${pace(run.bestPriorPaceSecPerKm)}/km</div>` : `<div class="summary-run-prev">최근 ${run.count}회 · ${number(run.totalDistanceKm, run.totalDistanceKm % 1 ? 1 : 0)}km</div>`}
      ${renderRunsBars(run.runs)}`
    : emptyState('최근 러닝 기록이 없습니다', '러닝 기록하기', 'workout');
  return `<article class="home-card compact summary-card summary-split-card summary-running-card${run.hasData ? '' : ' is-empty'}" id="card-recent-running">
    <div class="home-card-header"><span class="home-card-title"><span class="summary-title-icon" aria-hidden="true">🏃</span>최근 러닝</span></div>
    ${body}
  </article>`;
}

// ── 이번 주 변화 ──────────────────────────────────────────────────
function weekOverWeekPercent(actual, previous, { improveOnDecrease = false } = {}) {
  const cur = Number(actual) || 0;
  const prev = Number(previous) || 0;
  if (cur <= 0 || prev <= 0) return null;
  const raw = ((cur - prev) / prev) * 100;
  const value = improveOnDecrease ? -raw : raw;
  const rounded = Math.round(value * 10) / 10;
  return { value: rounded, positive: rounded >= 0 };
}

function trendIcon(change) {
  if (!change) return '·';
  return change.positive ? '▲' : '▼';
}
function trendTone(change) {
  if (!change) return 'is-muted';
  return change.positive ? 'is-positive' : 'is-negative';
}

function changeMetric(icon, label, valueHtml, description, tone) {
  return `<div class="summary-change-metric">
    <span class="summary-change-label"><span class="summary-change-icon ${tone}" aria-hidden="true">${icon}</span>${escapeHtml(label)}</span>
    <strong class="${tone}">${valueHtml}</strong>
    <small>${escapeHtml(description)}</small>
  </div>`;
}

function renderChange(model) {
  const protein = weekOverWeekPercent(model.current.diet.proteinG, model.previous.diet.proteinG);
  const proteinHtml = protein
    ? `${protein.positive ? '+' : ''}${number(protein.value, protein.value % 1 ? 1 : 0)}%`
    : '기록 없음';

  const target = model.workoutTargetDays;
  const curSessions = model.current.workout.workoutDays;
  const prevSessions = model.previous.workout.workoutDays;
  const sessionHtml = target ? `${curSessions}/${target}` : `${curSessions}회`;
  const sessionDesc = target ? `지난주 ${prevSessions}/${target} 대비` : '지난주 대비';

  const recentRun = model.recentRunning;
  const paceChange = recentRun && recentRun.paceImprovePct != null
    ? { value: recentRun.paceImprovePct, positive: recentRun.paceImprovePct >= 0 }
    : null;
  const paceHtml = paceChange
    ? `${paceChange.positive ? '+' : ''}${number(paceChange.value, paceChange.value % 1 ? 1 : 0)}%`
    : '기록 없음';

  return `<article class="home-card compact summary-card" id="card-weekly-change">
    <div class="home-card-header"><span class="home-card-title"><span class="summary-title-icon" aria-hidden="true">📊</span>이번 주 변화</span></div>
    <div class="summary-change-grid">
      ${changeMetric(trendIcon(protein), '단백질 목표 충족', proteinHtml, '지난주 대비', trendTone(protein))}
      ${changeMetric('✓', '완료한 운동 세션', sessionHtml, sessionDesc, 'is-strength')}
      ${changeMetric(trendIcon(paceChange), '최근 페이스', paceHtml, '이전 대비', trendTone(paceChange))}
    </div>
  </article>`;
}

// 순수 렌더러 — model 하나로 마크업을 만든다(테스트/프리뷰에서 재사용).
export function renderSummaryMarkup(model) {
  return `${renderDiet(model)}
    <div class="summary-split-grid">${renderStrengthGoals(model)}${renderRunning(model)}</div>
    ${renderChange(model)}`;
}
