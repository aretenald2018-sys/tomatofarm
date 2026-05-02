// ================================================================
// workout/render.js — UI 렌더링 (상태 표시, 칼로리 트래커, 식단)
// ================================================================

import { S }                        from './state.js';
import { _autoSaveDiet }            from './save.js';
import { DAYS }                     from '../config.js';
import { isFuture, TODAY,
         getDietPlan, calcDietMetrics,
         getBodyCheckins,
         calcExerciseCalorieCredit } from '../data.js';
import { confirmAction } from '../utils/confirm-modal.js';

// ── 날짜 라벨 ────────────────────────────────────────────────────
export function _renderDateLabel() {
  if (!S.shared.date) return;
  const { y, m, d } = S.shared.date;
  const dow = new Date(y, m, d).getDay();
  const dateText = `${y}년 ${m+1}월 ${d}일 (${DAYS[dow]})`;
  const isFutureDay = isFuture(y, m, d);
  const isToday  = y === TODAY.getFullYear() && m === TODAY.getMonth() && d === TODAY.getDate();

  // TDS: "TODAY" 배지를 오늘 날짜일 때 inline 표시 (사용자가 자신 위치를 즉각 인식)
  const todayTag = isToday ? '<span class="wt-today-tag">TODAY</span>' : '';
  ['wt-date-label', 'wt-date-label-diet'].forEach(id => {
    const label = document.getElementById(id);
    if (label) {
      label.innerHTML = `${todayTag}<span>${dateText}</span>`;
      label.style.color = isFutureDay ? 'var(--muted)' : 'var(--text)';
    }
  });
  ['wt-today-btn', 'wt-today-btn-diet'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = isToday ? 'none' : 'inline-block';
  });
}

// ── 상태 버튼 렌더 (레거시 — 랜딩 제거 후 no-op, import 호환용) ─
export function _renderGymStatusBtns() { /* noop */ }
export function _renderCFStatusBtns()  { /* noop */ }

export function _renderStretchingToggle() {
  document.getElementById('wt-stretching-toggle')?.classList.toggle('on', S.workout.stretching);
}

export function _renderWineFreeToggle() {
  document.getElementById('wt-wine-free-toggle')?.classList.toggle('on', S.workout.wineFree);
}

export function _renderMealSkippedToggles() {
  document.getElementById('wt-breakfast-skipped')?.classList.toggle('active', S.diet.breakfastSkipped);
  document.getElementById('wt-lunch-skipped')?.classList.toggle('active', S.diet.lunchSkipped);
  document.getElementById('wt-dinner-skipped')?.classList.toggle('active', S.diet.dinnerSkipped);
}

// ── 스파크라인 (볼륨 히스토리) ───────────────────────────────────
import { getVolumeHistory }          from '../data.js';

let _sparklineSeq = 0;

function _smoothSparkPath(coords) {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  return coords.reduce((path, point, i) => {
    if (i === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const prev = coords[i - 1];
    const cx = (prev.x + point.x) / 2;
    return `${path} C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, '');
}

function _compactVolumeDelta(value) {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}${Math.round(abs)}`;
}

export function _buildSparkline(exerciseId, color) {
  const history = getVolumeHistory(exerciseId);
  if (history.length < 2) return '';
  const recentHistory = history.slice(-6);
  const vals = recentHistory.map(h => h.volume);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const W = 112, H = 30, pad = 3;
  const coords = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));
  const lastPt = coords[coords.length - 1];
  const firstPt = coords[0];
  const splitAt = vals.length >= 6 ? vals.length - 3 : Math.ceil(vals.length / 2);
  const prevVals = vals.slice(0, splitAt);
  const recentVals = vals.slice(splitAt);
  const avg = arr => arr.reduce((sum, v) => sum + v, 0) / Math.max(1, arr.length);
  const prevAvg = avg(prevVals);
  const recentAvg = avg(recentVals);
  const avgDiff = recentAvg - prevAvg;
  const signalThreshold = Math.max(150, prevAvg * 0.03);
  const trend = avgDiff > signalThreshold ? 'up' : avgDiff < -signalThreshold ? 'down' : 'flat';
  const trendLabel = trend === 'up' ? '상승' : trend === 'down' ? '하락' : '유지';
  const bestVal = Math.max(...vals);
  const lastVal = vals[vals.length - 1];
  const peakLabel = bestVal > 0 && lastVal >= bestVal * 0.95 ? '고점권' : '';
  const lineColor = color || 'var(--accent)';
  const safeId = String(exerciseId).replace(/[^a-z0-9]/gi,'');
  const fillId = `spark-fill-${safeId}-${vals.length}-${Math.round(lastVal)}-${_sparklineSeq++}`;
  const linePath = _smoothSparkPath(coords);
  const fillPath = `${linePath} L ${lastPt.x.toFixed(1)} ${H} L ${firstPt.x.toFixed(1)} ${H} Z`;
  const trendText = trend === 'flat' ? trendLabel : `${trendLabel} ${_compactVolumeDelta(avgDiff)}`;
  const detailText = `${vals.length}회 추세${peakLabel ? ` · ${peakLabel}` : ''}`;
  const title = `최근 ${recentVals.length}회 평균과 이전 ${prevVals.length}회 평균의 볼륨 차이`;
  return `<div class="ex-sparkline-wrap" title="${title}">
    <svg width="${W}" height="${H}" class="ex-sparkline">
      <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${fillPath}" fill="url(#${fillId})"/>
      <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="2.3" fill="${lineColor}"/>
    </svg>
    <span class="ex-sparkline-meta">
      <span class="ex-sparkline-state ${trend}">${trendText}</span>
      <span class="ex-sparkline-window">${detailText}</span>
    </span>
  </div>`;
}

// ── 식단 결과 배지 ──────────────────────────────────────────────
export function _renderDietResults() {
  const cfg = [
    { meal:'breakfast', okKey:'bOk', kcalKey:'bKcal', reasonKey:'bReason' },
    { meal:'lunch',     okKey:'lOk', kcalKey:'lKcal', reasonKey:'lReason' },
    { meal:'dinner',    okKey:'dOk', kcalKey:'dKcal', reasonKey:'dReason' },
    { meal:'snack',     okKey:'sOk', kcalKey:'sKcal', reasonKey:'sReason' },
  ];
  cfg.forEach(({ meal, okKey, kcalKey, reasonKey }) => {
    const el     = document.getElementById('wt-result-' + meal);
    if (!el) return;
    const ok     = S.diet[okKey];
    const kcal   = S.diet[kcalKey];
    const reason = S.diet[reasonKey] || '';
    if (ok === null) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text-tertiary);">음식을 추가해주세요</span>';
    } else if (ok) {
      el.innerHTML = `<span class="diet-badge ok">달성</span><span class="diet-kcal">${kcal}kcal</span>${reason?`<span class="diet-reason">${reason}</span>`:''}`;
    } else {
      el.innerHTML = `<span class="diet-badge bad">초과</span><span class="diet-kcal">${kcal}kcal</span>${reason?`<span class="diet-reason bad">${reason}</span>`:''}`;
    }
    const headerKcal = document.getElementById(`diet-toss-kcal-${meal}`);
    if (headerKcal) {
      headerKcal.textContent = kcal > 0 ? `${kcal.toLocaleString()}kcal` : '';
      headerKcal.className = 'diet-toss-kcal' + (ok === false ? ' diet-toss-over' : ok === true ? ' diet-toss-ok' : '');
    }
  });
  _renderCalorieTracker();
}

// ── 칼로리 트래커 ───────────────────────────────────────────────
export function renderCalorieTracker() { _renderCalorieTracker(); }

function _renderCalorieTracker() {
  const tracker = document.getElementById('wt-calorie-tracker');
  if (!tracker) return;

  const plan    = getDietPlan();
  const _chkW = getBodyCheckins();
  const _lwW = _chkW.length ? _chkW[_chkW.length - 1].weight : null;
  const metrics = calcDietMetrics(_lwW ? { ...plan, weight: _lwW } : plan);
  if (!plan._userSet || !plan.weight) {
    tracker.style.display = 'none';
    const setup = document.getElementById('wt-diet-setup');
    if (setup) { setup.style.display = ''; setup.style.opacity = '1'; setup.style.transform = 'scale(1)'; }
    return;
  }
  const setupEl = document.getElementById('wt-diet-setup');
  if (setupEl) setupEl.style.display = 'none';

  const dow = S.shared.date ? new Date(S.shared.date.y, S.shared.date.m, S.shared.date.d).getDay() : new Date().getDay();
  const isRefeed    = (plan.refeedDays || []).includes(dow);
  const dayTarget   = isRefeed ? metrics.refeed : metrics.deficit;
  const macroTarget = dayTarget;

  const dayData = {
    exercises: S.workout.exercises,
    cf: S.workout.cf,
    swimming: S.workout.swimming,
    running: S.workout.running,
  };
  const exerciseCredit = calcExerciseCalorieCredit(plan, dayData);
  const adjustedGoalKcal = dayTarget.kcal + exerciseCredit;

  const currentKcal = (S.diet.bKcal || 0) + (S.diet.lKcal || 0) + (S.diet.dKcal || 0) + (S.diet.sKcal || 0);
  const hasAnalysis = currentKcal > 0;

  tracker.style.display = 'block';

  const badge = document.getElementById('wt-day-type-badge');
  if (badge) {
    badge.textContent  = isRefeed ? '🔄 리피드 데이' : '🔥 데피싯 데이';
    badge.className    = 'cal-day-type ' + (isRefeed ? 'refeed' : 'deficit');
  }

  const goalEl   = document.getElementById('wt-cal-goal');
  const curEl    = document.getElementById('wt-cal-current');
  const remainEl = document.getElementById('wt-cal-remain');
  const barEl    = document.getElementById('wt-cal-bar');

  if (goalEl)   goalEl.textContent   = adjustedGoalKcal.toLocaleString();
  if (curEl)    curEl.textContent    = currentKcal.toLocaleString();

  const creditEl = document.getElementById('wt-exercise-credit-badge');
  if (creditEl) {
    if (exerciseCredit > 0) {
      creditEl.innerHTML = `<span class="cal-exercise-credit">+${exerciseCredit} kcal 운동</span>`;
      creditEl.style.display = '';
    } else {
      creditEl.style.display = 'none';
    }
  }

  const pct     = Math.min(currentKcal / adjustedGoalKcal * 100, 100);
  const over    = currentKcal > adjustedGoalKcal;
  const remain  = adjustedGoalKcal - currentKcal;

  if (remainEl) {
    remainEl.textContent  = over
      ? `${Math.abs(remain).toLocaleString()} kcal 초과`
      : `${remain.toLocaleString()} kcal 남음`;
    remainEl.style.color  = over ? 'var(--diet-bad)' : 'var(--muted)';
  }
  if (barEl) {
    barEl.style.width     = pct + '%';
    barEl.style.background = over ? 'var(--diet-bad)' : 'linear-gradient(90deg, #fa342c, #fc6a66)';
  }

  const macroEl = document.getElementById('wt-macro-bars');
  if (!macroEl) return;
  const curProtein = (S.diet.bProtein||0) + (S.diet.lProtein||0) + (S.diet.dProtein||0) + (S.diet.sProtein||0);
  const curCarbs   = (S.diet.bCarbs  ||0) + (S.diet.lCarbs  ||0) + (S.diet.dCarbs  ||0) + (S.diet.sCarbs||0);
  const curFat     = (S.diet.bFat    ||0) + (S.diet.lFat    ||0) + (S.diet.dFat    ||0) + (S.diet.sFat||0);
  const macroScale = exerciseCredit > 0 && dayTarget.kcal > 0 ? adjustedGoalKcal / dayTarget.kcal : 1;
  const macros = [
    { label:'단', cur: curProtein, goal: Math.round(macroTarget.proteinG * macroScale), color:'#fa342c' },
    { label:'탄', cur: curCarbs,   goal: Math.round(macroTarget.carbG * macroScale),    color:'#fc6a66' },
    { label:'지', cur: curFat,     goal: Math.round(macroTarget.fatG * macroScale),     color:'#fed4d2' },
  ];
  macroEl.innerHTML = macros.map(({ label, cur, goal, color }) => {
    const pct  = goal > 0 ? Math.min(cur / goal * 100, 100) : 0;
    const over = cur > goal && goal > 0;
    const info = hasAnalysis ? `${Math.round(cur)}/${goal}g` : `목표 ${goal}g`;
    return `
    <div class="macro-bar-row">
      <span class="macro-bar-label">${label}</span>
      <div class="macro-bar-track">
        <div class="macro-bar-fill" style="background:${over?'var(--diet-bad)':color};width:${pct}%"></div>
      </div>
      <span class="macro-bar-info" style="color:${over?'var(--diet-bad)':color}">${info}</span>
    </div>`;
  }).join('');
}

// ── 식사별 음식 아이템 ──────────────────────────────────────────
export function _mealKey(meal) {
  return meal === 'breakfast' ? 'bFoods' : meal === 'lunch' ? 'lFoods' : meal === 'dinner' ? 'dFoods' : 'sFoods';
}

export function _renderMealFoodItems(meal) {
  const container = document.getElementById(`wt-foods-${meal}`);
  if (!container) return;
  const foods = S.diet[_mealKey(meal)] || [];
  if (!foods.length) { container.innerHTML = ''; return; }

  container.innerHTML = foods.map((f, idx) => `
    <div class="meal-food-chip"${f.source === 'ai' ? ' data-source="ai"' : ''}>
      <span class="meal-food-chip-name">${f.recipeId ? '🍳 ' : ''}${f.name} <span style="color:var(--muted);font-size:10px">${f.grams}g</span></span>
      <span class="meal-food-chip-kcal">${Math.round(f.kcal)}kcal</span>
      <button class="meal-food-chip-del" onclick="wtRemoveFoodItem('${meal}',${idx})">✕</button>
    </div>`).join('');
}

export function _recalcMealMacros(meal) {
  const key    = _mealKey(meal);
  const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
  const foods  = S.diet[key] || [];
  if (!foods.length) return;

  S.diet[`${prefix}Kcal`]    = Math.round(foods.reduce((s, f) => s + f.kcal,    0));
  S.diet[`${prefix}Protein`] = Math.round(foods.reduce((s, f) => s + f.protein, 0) * 10) / 10;
  S.diet[`${prefix}Carbs`]   = Math.round(foods.reduce((s, f) => s + f.carbs,   0) * 10) / 10;
  S.diet[`${prefix}Fat`]     = Math.round(foods.reduce((s, f) => s + f.fat,     0) * 10) / 10;
  S.diet[`${prefix}Ok`]      = true;
  // 2026-04-21: Reason 은 UI 표시 문자열 — 저장은 소수 유지하되 여기선 정수로 표현.
  S.diet[`${prefix}Reason`]  = `DB: ${S.diet[`${prefix}Kcal`]}kcal (단${Math.round(S.diet[`${prefix}Protein`])}g 탄${Math.round(S.diet[`${prefix}Carbs`])}g 지${Math.round(S.diet[`${prefix}Fat`])}g)`;
}

// ── 음식 추가/삭제 ──────────────────────────────────────────────
export function wtAddFoodItem(meal, item) {
  const key = _mealKey(meal);
  S.diet[key] = [...(S.diet[key] || []), item];
  _recalcMealMacros(meal);
  _renderMealFoodItems(meal);
  _renderDietResults();
  _autoSaveDiet();
}

export function wtRemoveFoodItem(meal, idx) {
  const key = _mealKey(meal);
  const arr = S.diet[key] || [];
  const removed = arr[idx];
  S.diet[key] = arr.filter((_, i) => i !== idx);
  if ((S.diet[key] || []).length > 0) {
    _recalcMealMacros(meal);
  } else {
    const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
    S.diet[`${prefix}Kcal`]    = 0;
    S.diet[`${prefix}Protein`] = 0;
    S.diet[`${prefix}Carbs`]   = 0;
    S.diet[`${prefix}Fat`]     = 0;
    S.diet[`${prefix}Ok`]      = null;
    S.diet[`${prefix}Reason`]  = '';
  }
  _renderMealFoodItems(meal);
  _renderDietResults();
  _autoSaveDiet();
  if (!removed) return;
  // Undo Toast 3초 — 원래 위치에 복원
  window.showToast?.(`'${removed.name || '음식'}' 삭제됨`, 3000, 'info', {
    action: '실행 취소',
    onAction: () => {
      const curr = S.diet[key] || [];
      curr.splice(Math.min(idx, curr.length), 0, removed);
      S.diet[key] = curr;
      _recalcMealMacros(meal);
      _renderMealFoodItems(meal);
      _renderDietResults();
      _autoSaveDiet();
    },
  });
}

// ── 사진 표시 ───────────────────────────────────────────────────
export function _renderMealPhotos() {
  const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (const meal of meals) {
    const row = document.getElementById(`wt-meal-content-${meal}`);
    if (!row) continue;
    row.querySelector('.meal-side-thumb')?.remove();
    const photo = window._mealPhotos?.[meal];
    if (photo) {
      const thumb = document.createElement('div');
      thumb.className = 'meal-side-thumb';
      thumb.innerHTML = `<img src="${photo}"><button class="meal-side-thumb-delete" type="button" aria-label="사진 삭제">×</button>`;
      thumb.onclick = () => openMealPhotoLightbox(photo);
      thumb.querySelector('.meal-side-thumb-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMealPhoto(meal);
      });
      let pressTimer;
      thumb.onpointerdown = () => { pressTimer = setTimeout(async () => {
        const ok = await confirmAction({ title: '사진 삭제', message: '사진을 삭제할까요?', destructive: true });
        if (ok) removeMealPhoto(meal);
      }, 600); };
      thumb.onpointerup = () => clearTimeout(pressTimer);
      thumb.onpointerleave = () => clearTimeout(pressTimer);
      row.prepend(thumb);
    }
  }
  const wrapW = document.getElementById('wt-photo-workout');
  if (wrapW) {
    const photo = window._mealPhotos?.workout;
    if (photo) {
      wrapW.innerHTML = `<div class="meal-photo-frame" onclick="openMealPhotoLightbox(this.querySelector('img').src)">
        <img src="${photo}">
        <button class="meal-photo-delete" onclick="event.stopPropagation();removeMealPhoto('workout')">✕</button>
      </div>`;
    } else { wrapW.innerHTML = ''; }
  }
}

// ── 영양정보 사진 업로드 ────────────────────────────────────────
export function openNutritionPhotoUpload() {
  if (window.openNutritionItemEditor) {
    window.openNutritionItemEditor(null);
    setTimeout(() => {
      if (window.switchNutritionTab) {
        window.switchNutritionTab('photo');
      }
    }, 100);
  }
}
