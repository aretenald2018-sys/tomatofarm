// ================================================================
// home/today-summary.js — 다이어트 목표, 오늘 식단/운동 요약
// ================================================================

import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         getExercises, getExList,
         getDietPlan, calcDietMetrics, getBodyCheckins,
         getDayTargetKcal, getAllMuscles }  from '../data.js';

// ── 다이어트 목표 카드 ────────────────────────────────────────────
export function renderDietGoalCard() {
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

  const checkins = getBodyCheckins();
  const latest   = checkins.length ? checkins[checkins.length - 1] : null;

  const curWeight = latest?.weight     ?? plan.weight;
  const curBF     = latest?.bodyFatPct ?? plan.bodyFatPct;

  const metrics = calcDietMetrics({ ...plan, weight: curWeight });

  const wStart    = plan.weight;
  const wTarget   = plan.targetWeight ?? (plan.weight - metrics.totalWeightLoss);
  const wProgress = wStart > wTarget
    ? Math.min(Math.round((wStart - curWeight) / (wStart - wTarget) * 100), 100)
    : 0;

  const bfStart   = plan.bodyFatPct;
  const bfTarget  = plan.targetBodyFatPct;
  const bfProgress= bfStart > bfTarget
    ? Math.min(Math.round((bfStart - curBF) / (bfStart - bfTarget) * 100), 100)
    : 0;

  const weeksLeft = metrics.weeksNeeded;
  const doneDate  = plan.startDate
    ? (() => {
        const d = new Date(plan.startDate);
        d.setDate(d.getDate() + Math.round(weeksLeft * 7));
        return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      })()
    : `약 ${Math.round(weeksLeft)}주 후`;

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
export function renderTodayDiet() {
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
export function renderTodayWorkout() {
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
  const allMuscles = getAllMuscles();
  const muscleColors = Object.fromEntries(allMuscles.map(m => [m.id, m.color]));
  const muscleNames  = Object.fromEntries(allMuscles.map(m => [m.id, m.name]));

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
