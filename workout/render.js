import { escapeHtml as _escapeHtml } from '../utils/escape-html.js';
import { sumDayNutrient } from '../diet/day-nutrition.js';
import { showToast } from '../ui/toast.js';
// ================================================================
// workout/render.js — UI 렌더링 (상태 표시, 칼로리 트래커, 식단)
// ================================================================

import { S }                        from './state.js';
import { DAYS }                     from '../config.js';
import { isFuture, TODAY, dateKey, getCache,
         getDietPlan, calcDietMetrics,
         getBodyCheckins,
         calcExerciseCalorieCredit } from '../data.js';
import { confirmAction } from '../utils/confirm-modal.js';
import {
  cloneFoodItem as _cloneFoodItem,
  foodAmountLabel as _foodAmountLabel,
  foodGroupKey as _foodGroupKey,
  mealConfig,
  syncMealMacros,
} from '../diet/meal-model.js';
import { addMealFood, removeMealFood, restoreMealFood } from '../diet/feature.js';
import { getDietPhoto } from '../diet/photo-store.js';
import { removeMealPhoto } from '../diet/photo-actions.js';
import { openPhotoLightbox } from '../utils/photo-lightbox.js';
import { openNutritionItemEditor, switchNutritionTab } from '../modals/nutrition-item-modal.js';
import { ensureModal } from '../modal-manager.js';
import { closeModal } from '../app/overlay-stack.js';
import { openNutritionSearch } from '../feature-nutrition.js';
import { DIET_FOOD_HANDLED_FLAG } from '../utils/action-router.js';

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

const _FREQUENT_MEAL_CFG = {
  breakfast: { foodsKey: 'bFoods', skipKey: 'breakfastSkipped' },
  lunch:     { foodsKey: 'lFoods', skipKey: 'lunchSkipped' },
  dinner:    { foodsKey: 'dFoods', skipKey: 'dinnerSkipped' },
};
const _FREQUENT_LOOKBACK_DAYS = 90;
const _FREQUENT_SUGGESTION_LIMIT = 10;
const _RECENT_SUGGESTION_LIMIT = 10;
const _frequentFoodSuggestions = new Map();

function _selectedDateKey() {
  const date = S.shared.date;
  if (!date || typeof date.y !== 'number') return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  return dateKey(date.y, date.m, date.d);
}

function _dateKeyToUtc(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function _ageDaysFromKey(currentKey, historyKey) {
  const current = _dateKeyToUtc(currentKey);
  const history = _dateKeyToUtc(historyKey);
  if (current == null || history == null) return null;
  return Math.round((current - history) / 86400000);
}

function _normalizeFoodName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function _macroCompleteness(food) {
  return ['kcal', 'protein', 'carbs', 'fat'].reduce((score, key) => {
    const value = Number(food?.[key]);
    return score + (Number.isFinite(value) && value > 0 ? 1 : 0);
  }, 0);
}

function _suggestionKey(meal, groupKey, lastDateKey) {
  let hash = 0;
  const raw = `${meal}|${groupKey}|${lastDateKey}`;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `${meal}-${Math.abs(hash).toString(36)}`;
}

function _collectFrequentFoodSuggestions(meal) {
  const cfg = _FREQUENT_MEAL_CFG[meal];
  if (!cfg) return [];
  const cache = getCache?.() || {};
  const currentKey = _selectedDateKey();
  const groups = new Map();

  for (const [historyKey, day] of Object.entries(cache)) {
    if (historyKey === currentKey) continue;
    const ageDays = _ageDaysFromKey(currentKey, historyKey);
    if (ageDays == null || ageDays < 1 || ageDays > _FREQUENT_LOOKBACK_DAYS) continue;
    const foods = Array.isArray(day?.[cfg.foodsKey]) ? day[cfg.foodsKey] : [];
    for (const food of foods) {
      const name = _normalizeFoodName(food?.name);
      const kcal = Number(food?.kcal);
      if (!name || !Number.isFinite(kcal) || kcal <= 0) continue;
      const groupKey = _foodGroupKey(food);
      const macroScore = _macroCompleteness(food);
      const recencyScore = (_FREQUENT_LOOKBACK_DAYS - ageDays) / _FREQUENT_LOOKBACK_DAYS;
      const prev = groups.get(groupKey);
      if (!prev) {
        groups.set(groupKey, {
          groupKey,
          count: 1,
          lastDateKey: historyKey,
          item: food,
          macroScore,
          recencyScore,
        });
        continue;
      }
      prev.count += 1;
      prev.recencyScore = Math.max(prev.recencyScore, recencyScore);
      if (historyKey > prev.lastDateKey || (historyKey === prev.lastDateKey && macroScore > prev.macroScore)) {
        prev.lastDateKey = historyKey;
        prev.item = food;
        prev.macroScore = macroScore;
      }
    }
  }

  return [...groups.values()]
    .filter(entry => entry.count >= 2)
    .map(entry => ({
      ...entry,
      score: entry.count * 12 + entry.recencyScore * 4 + entry.macroScore,
    }))
    .sort((a, b) => b.score - a.score || b.lastDateKey.localeCompare(a.lastDateKey))
    .slice(0, _FREQUENT_SUGGESTION_LIMIT)
    .map(entry => {
      const key = _suggestionKey(meal, entry.groupKey, entry.lastDateKey);
      const item = _cloneFoodItem(entry.item);
      _frequentFoodSuggestions.set(key, { meal, item });
      return { key, item, count: entry.count, groupKey: entry.groupKey };
    });
}

function _collectRecentFoodSuggestions(meal, excludedGroupKeys = new Set()) {
  const cfg = _FREQUENT_MEAL_CFG[meal];
  if (!cfg) return [];
  const cache = getCache?.() || {};
  const currentKey = _selectedDateKey();
  const seen = new Set();
  const suggestions = [];

  const historyEntries = Object.entries(cache)
    .map(([historyKey, day]) => ({
      historyKey,
      day,
      ageDays: _ageDaysFromKey(currentKey, historyKey),
    }))
    .filter(entry => entry.historyKey !== currentKey && entry.ageDays != null && entry.ageDays >= 1 && entry.ageDays <= _FREQUENT_LOOKBACK_DAYS)
    .sort((a, b) => b.historyKey.localeCompare(a.historyKey));

  for (const { historyKey, day } of historyEntries) {
    const foods = Array.isArray(day?.[cfg.foodsKey]) ? day[cfg.foodsKey] : [];
    for (const food of foods) {
      const name = _normalizeFoodName(food?.name);
      const kcal = Number(food?.kcal);
      if (!name || !Number.isFinite(kcal) || kcal <= 0) continue;
      const groupKey = _foodGroupKey(food);
      if (excludedGroupKeys.has(groupKey) || seen.has(groupKey)) continue;
      seen.add(groupKey);
      suggestions.push({ groupKey, item: food, lastDateKey: historyKey });
    }
  }

  return suggestions.slice(0, _RECENT_SUGGESTION_LIMIT).map(entry => {
    const key = _suggestionKey(meal, `recent|${entry.groupKey}`, entry.lastDateKey);
    const item = _cloneFoodItem(entry.item);
    _frequentFoodSuggestions.set(key, { meal, item });
    return { key, item, groupKey: entry.groupKey };
  });
}

function _renderFoodSuggestionOptions(meal, suggestions) {
  return suggestions.map(({ key, item, count }) => {
    const name = _escapeHtml(item.name || '음식');
    const amount = _escapeHtml(_foodAmountLabel(item));
    const kcal = Math.round(Number(item.kcal) || 0);
    const title = _escapeHtml(`${item.name || '음식'} ${amount ? amount + ' ' : ''}${kcal}kcal 추가`);
    const countHtml = count ? `<span class="diet-frequent-food-count">${count}회</span>` : '';
    return `<button type="button" class="diet-frequent-food-option" data-action="diet:add-frequent-food" data-meal="${meal}" data-suggestion-key="${_escapeHtml(key)}" title="${title}">
      <span class="diet-frequent-food-name">${name}</span>
      <span class="diet-frequent-food-meta">${amount}</span>
      ${countHtml}
      <span class="diet-frequent-food-add" aria-hidden="true">+</span>
    </button>`;
  }).join('');
}

function _renderFoodSuggestionSection(meal, label, suggestions) {
  if (!suggestions.length) return '';
  return `<div class="diet-frequent-food-section">
    <div class="diet-frequent-food-label">${label}</div>
    <div class="diet-frequent-food-options diet-frequent-food-carousel" role="list" data-swipe-nav-lock>${_renderFoodSuggestionOptions(meal, suggestions)}</div>
  </div>`;
}

function _renderFrequentFoodSuggestions(meal) {
  const container = document.getElementById(`wt-frequent-${meal}`);
  if (!container) return;
  const frequentSuggestions = _collectFrequentFoodSuggestions(meal);
  const frequentGroups = new Set(frequentSuggestions.map(suggestion => suggestion.groupKey));
  const recentSuggestions = _collectRecentFoodSuggestions(meal, frequentGroups);
  const sections = [
    _renderFoodSuggestionSection(meal, '이때 자주 먹었던 것', frequentSuggestions),
    _renderFoodSuggestionSection(meal, '최근에 먹은 것', recentSuggestions),
  ].filter(Boolean);
  if (!sections.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = `<div class="diet-frequent-food-card">${sections.join('')}</div>`;
  bindDietFoodActions();
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
  const pct = prevAvg > 0 ? Math.round((avgDiff / prevAvg) * 100) : 0;
  const suspicious = prevAvg > 0 && Math.abs(pct) >= 80 && recentHistory.length < 6;
  const trendText = suspicious
    ? '기록 점검'
    : (trend === 'flat' ? '최근 평균 유지' : `최근 평균 ${pct > 0 ? '+' : ''}${pct}%`);
  const detailText = suspicious
    ? '표본이 작거나 조건이 달랐을 수 있음'
    : `${prevVals.length}회 평균 대비${peakLabel ? ` · ${peakLabel}` : ''}`;
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
    _renderFrequentFoodSuggestions(meal);
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
    runRouteSummary: S.workout.runData?.routeSummary || null,
  };
  const exerciseCredit = calcExerciseCalorieCredit(plan, dayData);
  const adjustedGoalKcal = dayTarget.kcal + exerciseCredit;

  const currentKcal = sumDayNutrient(S.diet, 'kcal');
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
  const curProtein = sumDayNutrient(S.diet, 'protein');
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
  return mealConfig(meal).key;
}

export function _renderMealFoodItems(meal) {
  const container = document.getElementById(`wt-foods-${meal}`);
  if (!container) return;
  if (!container.dataset.foodRemoveBound) {
    container.dataset.foodRemoveBound = '1';
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-food-index]');
      if (!button || !container.contains(button)) return;
      wtRemoveFoodItem(button.dataset.meal, Number(button.dataset.removeFoodIndex));
    });
  }
  const foods = S.diet[_mealKey(meal)] || [];
  if (!foods.length) { container.innerHTML = ''; return; }

  container.innerHTML = foods.map((f, idx) => `
    <div class="meal-food-chip"${f.source === 'ai' ? ' data-source="ai"' : ''}>
      <span class="meal-food-chip-name">${f.recipeId ? '🍳 ' : ''}${f.name} <span style="color:var(--muted);font-size:10px">${f.grams}g</span></span>
      <span class="meal-food-chip-kcal">${Math.round(f.kcal)}kcal</span>
      <button type="button" class="meal-food-chip-del" data-meal="${meal}" data-remove-food-index="${idx}" aria-label="${f.name} 삭제">✕</button>
    </div>`).join('');
}

export function _recalcMealMacros(meal) {
  return syncMealMacros(S.diet, meal);
}

// ── 음식 추가/삭제 ──────────────────────────────────────────────
export function wtAddFoodItem(meal, item) {
  return addMealFood(meal, item);
}

export function wtAddFrequentFoodSuggestion(meal, suggestionKey) {
  const suggestion = _frequentFoodSuggestions.get(suggestionKey);
  if (!suggestion || suggestion.meal !== meal) {
    showToast('추천 음식을 찾지 못했어요. 새로고침 후 다시 시도해주세요.', 2200, 'error');
    return;
  }
  const cfg = _FREQUENT_MEAL_CFG[meal];
  if (cfg?.skipKey && S.diet[cfg.skipKey]) {
    S.diet[cfg.skipKey] = false;
    _renderMealSkippedToggles();
  }
  wtAddFoodItem(meal, _cloneFoodItem(suggestion.item));
}

// PWA/Android WebView may block the global delegated click before it reaches document.
// Keep the core food-add actions on the diet panel itself so they always reach auto-save.
export function bindDietFoodActions() {
  const panel = document.getElementById('tab-diet');
  if (!panel) return;

  panel.querySelectorAll('[data-action="diet:add-food"], [data-action="diet:add-frequent-food"]').forEach((control) => {
    if (control.dataset.dietFoodActionBound === '1') return;
    control.dataset.dietFoodActionBound = '1';
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // 전역 라우터가 같은 click 을 한 번 더 처리하지 않도록 표시한다.
      // stopPropagation 이 통하지 않는 WebView 에서도 중복 실행을 막는다.
      event[DIET_FOOD_HANDLED_FLAG] = true;
      if (control.dataset.action === 'diet:add-food') {
        void openNutritionSearch(control.dataset.meal).catch((error) => {
          console.error('[diet] nutrition search open failed:', error);
          showToast('음식 추가 화면을 열지 못했어요. 다시 시도해주세요.', 2600, 'error');
        });
        return;
      }
      wtAddFrequentFoodSuggestion(control.dataset.meal, control.dataset.suggestionKey);
    });
  });
}

export function wtRemoveFoodItem(meal, idx) {
  const result = removeMealFood(meal, idx);
  const removed = result.removed;
  if (!removed) return;
  // Undo Toast 3초 — 원래 위치에 복원
  showToast(`'${removed.name || '음식'}' 삭제됨`, 3000, 'info', {
    action: '실행 취소',
    onAction: () => {
      restoreMealFood(meal, idx, removed);
    },
  });
}

if (typeof document !== 'undefined' && document.documentElement?.dataset.dietRenderBridge !== '1') {
  document.documentElement.dataset.dietRenderBridge = '1';
  document.addEventListener('diet:meal-changed', (event) => {
    const meal = event?.detail?.meal;
    if (!meal) return;
    _renderMealFoodItems(meal);
    _renderMealSkippedToggles();
    _renderDietResults();
    renderCalorieTracker();
  });
}

// ── 사진 표시 ───────────────────────────────────────────────────
export function _renderMealPhotos() {
  const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (const meal of meals) {
    const row = document.getElementById(`wt-meal-content-${meal}`);
    if (!row) continue;
    row.querySelector('.meal-side-thumb')?.remove();
    const photo = getDietPhoto(meal);
    if (photo) {
      const thumb = document.createElement('div');
      thumb.className = 'meal-side-thumb';
      thumb.innerHTML = `<img src="${photo}"><button class="meal-side-thumb-delete" type="button" aria-label="사진 삭제">×</button>`;
      thumb.onclick = () => openPhotoLightbox(photo);
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
    const photo = getDietPhoto('workout');
    if (photo) {
      wrapW.innerHTML = `<div class="meal-photo-frame" data-open-workout-photo>
        <img src="${photo}">
        <button type="button" class="meal-photo-delete" aria-label="운동 사진 삭제">✕</button>
      </div>`;
      const frame = wrapW.querySelector('[data-open-workout-photo]');
      frame?.addEventListener('click', () => openPhotoLightbox(photo));
      frame?.querySelector('.meal-photo-delete')?.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeMealPhoto('workout');
      });
    } else { wrapW.innerHTML = ''; }
  }
}

// ── 영양정보 사진 업로드 ────────────────────────────────────────
export async function openNutritionPhotoUpload() {
  await ensureModal('nutrition-item-modal');
  closeModal('nutrition-search-modal');
  await openNutritionItemEditor(null);
  switchNutritionTab('photo');
}
