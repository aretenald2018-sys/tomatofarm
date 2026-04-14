// ================================================================
// calc.js — 순수 비즈니스 로직 (사이드이펙트 없음, 테스트 가능)
// ================================================================

const DEFAULT_DIET_PLAN = {
  height: 0, weight: 0, bodyFatPct: 0, age: 0,
  targetWeight: 0, targetBodyFatPct: 0,
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,
  refeedDays: [0, 6],
  startDate: null,
  // 고급 모드
  advancedMode: false,
  deficitProteinPct: 41, deficitCarbPct: 50, deficitFatPct: 9,
  refeedProteinPct: 29, refeedCarbPct: 60, refeedFatPct: 11,
  dietTolerance: 50,
  exerciseCalorieCredit: false,
  exerciseKcalGym: 250, exerciseKcalCF: 300,
  exerciseKcalSwimming: 200, exerciseKcalRunning: 250,
};

/**
 * BMR 계산 — 체지방률이 있으면 Katch-McArdle, 없으면 Mifflin-St Jeor
 */
function _calcBMR(weight, height, age, bodyFatPct) {
  if (bodyFatPct > 0) {
    // Katch-McArdle: 체지방률 알 때 가장 정확
    const lbm = weight * (1 - bodyFatPct / 100);
    return Math.round(370 + 21.6 * lbm);
  }
  // Mifflin-St Jeor (1990, 현대 표준, 남성)
  return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
}

/**
 * 감량 시 지방 비율 — 현재 체지방률에 따라 동적 계산
 * 고체지방(25%+) → 지방 80%+, 저체지방(10%-) → 지방 60%
 */
function _fatFraction(bodyFatPct) {
  if (bodyFatPct >= 25) return 0.82;
  if (bodyFatPct >= 20) return 0.78;
  if (bodyFatPct >= 15) return 0.75;
  if (bodyFatPct >= 10) return 0.68;
  return 0.60; // 10% 미만: 근손실 비율 높음
}

/**
 * 다이어트 플랜 기반 메트릭스 계산
 * BMR: Katch-McArdle (BF% 있을 때) / Mifflin-St Jeor (없을 때)
 * 감량비율: 체지방률 연동 동적 계산
 */
export function calcDietMetrics(plan) {
  const p = { ...DEFAULT_DIET_PLAN, ...plan };
  const bmr      = _calcBMR(p.weight, p.height, p.age, p.bodyFatPct);
  const tdeeCalc = Math.round(bmr * p.activityFactor);
  const tdee     = Math.ceil(tdeeCalc / 100) * 100;
  const lbm      = p.weight - (p.weight * p.bodyFatPct / 100);
  const fatMass  = p.weight * p.bodyFatPct / 100;
  const fatToLose = (p.weight * (p.bodyFatPct - p.targetBodyFatPct)) / 100;
  const fatRatio  = _fatFraction(p.bodyFatPct);
  const bfBasedLoss = fatToLose > 0 ? fatToLose / fatRatio : 0;
  const weightBasedLoss = p.targetWeight > 0 ? Math.max(p.weight - p.targetWeight, 0) : 0;
  // 체중 목표와 체지방 목표 중 더 큰 감량을 기준으로 산정
  const totalWeightLoss = Math.max(bfBasedLoss, weightBasedLoss);
  const weeklyLossKg = p.weight * p.lossRatePerWeek;
  const calPerKgPerDay = 7700 / 7 / p.activityFactor;
  const dailyDeficit = weeklyLossKg * calPerKgPerDay;
  const dailyIntake  = tdee - dailyDeficit;
  const weeksNeeded  = weeklyLossKg > 0 ? totalWeightLoss / weeklyLossKg : 0;
  const weeklyKcal   = Math.round(dailyIntake * 7);
  const refeedTotal  = p.refeedKcal;
  const refeedDayCount = (p.refeedDays || []).length || 2;
  const deficitDayCount = 7 - refeedDayCount;
  const deficitDayKcal = deficitDayCount > 0 ? Math.round((weeklyKcal - refeedTotal) / deficitDayCount) : Math.round(weeklyKcal / 7);
  const refeedDayKcal  = refeedDayCount > 0 ? Math.round(refeedTotal / refeedDayCount) : 0;
  // 탄단지 — 데피싯 데이 (고급 모드: 사용자 설정 비율 / 기본: 41-50-9)
  const dPP = (p.deficitProteinPct || 41) / 100;
  const dCP = (p.deficitCarbPct    || 50) / 100;
  const dFP = (p.deficitFatPct     || 9)  / 100;
  const dProteinKcal = Math.round(deficitDayKcal * dPP);
  const dCarbKcal    = Math.round(deficitDayKcal * dCP);
  const dFatKcal     = Math.round(deficitDayKcal * dFP);
  // 탄단지 — 리피드 데이 (고급 모드: 사용자 설정 비율 / 기본: 29-60-11)
  const rPP = (p.refeedProteinPct || 29) / 100;
  const rCP = (p.refeedCarbPct    || 60) / 100;
  const rFP = (p.refeedFatPct     || 11) / 100;
  const rProteinKcal = Math.round(refeedDayKcal * rPP);
  const rCarbKcal    = Math.round(refeedDayKcal * rCP);
  const rFatKcal     = Math.round(refeedDayKcal * rFP);
  return {
    bmr, tdee, lbm, fatMass, fatToLose, totalWeightLoss, fatRatio,
    weeklyLossKg, weeklyLossG: Math.round(weeklyLossKg * 1000),
    dailyDeficit: Math.round(dailyDeficit), dailyIntake: Math.round(dailyIntake),
    weeksNeeded,
    deficit: {
      kcal: deficitDayKcal,
      proteinKcal: dProteinKcal, proteinG: Math.round(dProteinKcal / 4),
      carbKcal: dCarbKcal,       carbG:    Math.round(dCarbKcal / 4),
      fatKcal: dFatKcal,         fatG:     Math.round(dFatKcal / 9),
    },
    refeed: {
      kcal: refeedDayKcal,
      proteinKcal: rProteinKcal, proteinG: Math.round(rProteinKcal / 4),
      carbKcal: rCarbKcal,       carbG:    Math.round(rCarbKcal / 4),
      fatKcal: rFatKcal,         fatG:     Math.round(rFatKcal / 9),
    },
  };
}

/**
 * 운동 칼로리 크레딧 계산
 * @param {object} plan - 다이어트 플랜
 * @param {object} dayData - 해당 날짜 데이터
 * @returns {number} 운동으로 소모한 추가 허용 칼로리
 */
export function calcExerciseCalorieCredit(plan, dayData) {
  if (!plan.advancedMode || !plan.exerciseCalorieCredit || !dayData) return 0;
  let credit = 0;
  const hasGym = (dayData.exercises || []).length > 0 && !dayData.gym_skip;
  if (hasGym)          credit += (plan.exerciseKcalGym      || 250);
  if (dayData.cf)      credit += (plan.exerciseKcalCF       || 300);
  if (dayData.swimming) credit += (plan.exerciseKcalSwimming || 200);
  if (dayData.running)  credit += (plan.exerciseKcalRunning  || 250);
  return credit;
}

/**
 * 해당 날짜의 목표 칼로리 산출
 * @param {object} plan - 다이어트 플랜
 * @param {number} y - 연도
 * @param {number} m - 월 (0-indexed)
 * @param {number} d - 일
 * @param {object} [dayData] - 해당 날짜 데이터 (운동 칼로리 크레딧용)
 * @returns {number} 목표 칼로리
 */
export function getDayTargetKcal(plan, y, m, d, dayData) {
  const metrics = calcDietMetrics(plan);
  const dow = new Date(y, m, d).getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const base = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;
  const exerciseCredit = calcExerciseCalorieCredit(plan, dayData);
  return base + exerciseCredit;
}

/**
 * 식단 성공 여부 판정 (단일 소스 — P0-2)
 * render-workout.js의 saveWorkoutDay와 data.js의 dietDayOk 양쪽에서 사용
 * @param {number} totalKcal - 실제 섭취 칼로리
 * @param {number} limitKcal - 목표 칼로리
 * @returns {boolean}
 */
export function isDietDaySuccess(totalKcal, limitKcal, tolerance = 50) {
  return (totalKcal > 0) && (totalKcal <= limitKcal + tolerance);
}

/**
 * 하루 운동 성공 여부 (운동 기록이 하나라도 있으면 성공)
 * @param {object} dayData - getDay()로 가져온 해당 날짜 데이터
 * @returns {boolean}
 */
export function isExerciseDaySuccess(dayData) {
  return (dayData.exercises || []).length > 0
      || !!dayData.cf
      || !!dayData.swimming
      || !!dayData.running
      || !!dayData.stretching;
}

/**
 * 하루 식단 성공/실패/미기록 판정
 * @param {object} dayData - getDay()로 가져온 해당 날짜 데이터
 * @param {object} plan - 다이어트 플랜
 * @param {number} y - 연도
 * @param {number} m - 월 (0-indexed)
 * @param {number} d - 일
 * @returns {boolean|null} true=성공, false=실패, null=미기록
 */
export function dietDayOk(dayData, plan, y, m, d) {
  const r = dayData || {};
  const dt = {
    breakfast: r.breakfast || '', lunch: r.lunch || '', dinner: r.dinner || '',
    bOk: r.bOk ?? null, lOk: r.lOk ?? null, dOk: r.dOk ?? null,
    bKcal: r.bKcal || 0, lKcal: r.lKcal || 0, dKcal: r.dKcal || 0, sKcal: r.sKcal || 0,
    bFoods: r.bFoods || [], lFoods: r.lFoods || [], dFoods: r.dFoods || [], sFoods: r.sFoods || [],
  };

  const limitKcal = getDayTargetKcal(plan, y, m, d, dayData);
  const totalKcal = (dt.bKcal || 0) + (dt.lKcal || 0) + (dt.dKcal || 0) + (dt.sKcal || 0);
  const tolerance = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;

  const bSkip = !!r.breakfast_skipped;
  const lSkip = !!r.lunch_skipped;
  const dSkip = !!r.dinner_skipped;

  const hasRecord = dt.breakfast || dt.lunch || dt.dinner ||
                    (dt.bFoods?.length > 0) || (dt.lFoods?.length > 0) ||
                    (dt.dFoods?.length > 0) || (dt.sFoods?.length > 0);

  if (!hasRecord && !bSkip && !lSkip && !dSkip) return null;

  const calorieSuccess = isDietDaySuccess(totalKcal, limitKcal, tolerance);

  const bOk = bSkip || (dt.bOk ?? false);
  const lOk = lSkip || (dt.lOk ?? false);
  const dOk = dSkip || (dt.dOk ?? false);

  return bOk && lOk && dOk && calorieSuccess;
}

/**
 * 스트릭 계산 (운동/식단/스트레칭/와인프리)
 * @param {object} cache - 전체 캐시 데이터 (_cache)
 * @param {Date} today - 오늘 날짜
 * @param {object} plan - 다이어트 플랜
 * @param {function} dateKeyFn - dateKey 함수
 * @returns {{workout:number, diet:number, stretching:number, wineFree:number}}
 */
export function calcStreaks(cache, today, plan, dateKeyFn) {
  const MAX_LOOKBACK = 365;
  let workout = 0, diet = 0, stretching = 0, wineFree = 0;

  const getDay = (y, m, d) => cache[dateKeyFn(y, m, d)] || {};
  const hasWorkout = (y, m, d) => isExerciseDaySuccess(getDay(y, m, d));

  // 운동 스트릭
  let cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!hasWorkout(y, m, d)) break;
    workout++;
    cur.setDate(cur.getDate() - 1);
  }

  // 식단 스트릭
  cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    const dok = dietDayOk(getDay(y, m, d), plan, y, m, d);
    if (dok === false) break;
    if (dok === true) diet++;
    if (dok === null && cur < today) break;
    cur.setDate(cur.getDate() - 1);
  }

  // 스트레칭 스트릭
  cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!getDay(y, m, d).stretching) break;
    stretching++;
    cur.setDate(cur.getDate() - 1);
  }

  // 와인프리 스트릭
  cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!getDay(y, m, d).wine_free) break;
    wineFree++;
    cur.setDate(cur.getDate() - 1);
  }

  return { workout, diet, stretching, wineFree };
}

// ── 토마토 키우기 시스템 ──────────────────────────────────────────

/**
 * 현재 토마토 사이클 상태 계산
 * @param {string} unitGoalStart - dateKey "YYYY-MM-DD"
 * @param {Date} today
 * @returns {{ cycleStart: string, dayIndex: number, days: string[] }}
 */
export function calcTomatoCycle(unitGoalStart, today) {
  if (!unitGoalStart) return { cycleStart: null, dayIndex: 0, days: [] };
  const start = new Date(unitGoalStart + 'T00:00:00');
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayMs = new Date(todayKey + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - start.getTime()) / 86400000);

  let cycleStartDate;
  if (diffDays < 0) {
    cycleStartDate = start;
  } else {
    const offset = Math.floor(diffDays / 3) * 3;
    cycleStartDate = new Date(start);
    cycleStartDate.setDate(cycleStartDate.getDate() + offset);
  }

  const dayIndex = Math.max(0, Math.min(2, Math.floor((todayMs - cycleStartDate.getTime()) / 86400000)));
  const days = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(cycleStartDate);
    d.setDate(d.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }

  return {
    cycleStart: days[0],
    dayIndex,
    days,
  };
}

/**
 * 완료된 3일 사이클 결과 평가 (식단 + 운동 듀얼 트랙)
 * @param {Array<{intake:number, target:number, dayData:object}>} dayResults
 * @returns {{ dietAllSuccess: boolean, exerciseAllSuccess: boolean, tomatoesAwarded: number, dietSuccesses: boolean[], exerciseSuccesses: boolean[] }}
 */
export function evaluateCycleResult(dayResults) {
  const dietSuccesses = dayResults.map(d => isDietDaySuccess(d.intake, d.target));
  const exerciseSuccesses = dayResults.map(d => isExerciseDaySuccess(d.dayData || {}));
  const dietAllSuccess = dietSuccesses.every(s => s);
  const exerciseAllSuccess = exerciseSuccesses.every(s => s);
  const tomatoesAwarded = (dietAllSuccess ? 1 : 0) + (exerciseAllSuccess ? 1 : 0);
  return { dietSuccesses, exerciseSuccesses, dietAllSuccess, exerciseAllSuccess, tomatoesAwarded };
}

/**
 * 날짜로부터 분기 키 반환
 * @param {Date|string} date
 * @returns {string} e.g. "2026-Q2"
 */
export function getQuarterKey(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

/**
 * 운동 볼륨 계산 (워밍업 제외)
 */
export function calcVolume(sets) {
  return (sets || []).reduce((sum, s) => {
    if (s.setType === 'warmup') return sum;
    if (!s.done && s.done !== undefined) return sum;
    return sum + (s.kg || 0) * (s.reps || 0);
  }, 0);
}

/**
 * 운동 볼륨 계산 (워밍업 포함)
 */
export function calcVolumeAll(sets) {
  return (sets || []).reduce((sum, s) => sum + (s.kg || 0) * (s.reps || 0), 0);
}

/**
 * 특정 운동의 볼륨 히스토리
 * @param {object} cache - 전체 캐시 데이터
 * @param {string} exerciseId - 운동 ID
 */
export function getVolumeHistory(cache, exerciseId) {
  return Object.entries(cache)
    .filter(([, day]) => (day.exercises || []).some(e => e.exerciseId === exerciseId))
    .map(([key, day]) => {
      const entry = day.exercises.find(e => e.exerciseId === exerciseId);
      return { date: key, volume: calcVolume(entry.sets) };
    })
    .filter(h => h.volume > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 특정 운동의 마지막 세션
 * @param {object} cache - 전체 캐시 데이터
 * @param {string} exerciseId - 운동 ID
 */
export function getLastSession(cache, exerciseId) {
  const entries = Object.entries(cache)
    .filter(([, day]) => (day.exercises || []).some(e => e.exerciseId === exerciseId))
    .sort(([a], [b]) => b.localeCompare(a));
  if (!entries.length) return null;
  const [date, day] = entries[0];
  const entry = day.exercises.find(e => e.exerciseId === exerciseId);
  return { date, sets: entry.sets };
}

/**
 * 특정 activity 타입의 마지막 세션
 * @param {object} cache - 전체 캐시 데이터
 * @param {'cf'|'running'|'swimming'|'stretching'} type
 * @param {string|null} excludeDateKey - 제외할 날짜 key
 */
export function getLastActivitySession(cache, type, excludeDateKey = null) {
  const matchers = {
    cf: (day) => !!day.cf,
    running: (day) => !!day.running,
    swimming: (day) => !!day.swimming,
    stretching: (day) => !!day.stretching,
  };
  const isMatch = matchers[type];
  if (!isMatch) return null;

  const entries = Object.entries(cache)
    .filter(([key, day]) => key !== excludeDateKey && isMatch(day))
    .sort(([a], [b]) => b.localeCompare(a));

  if (!entries.length) return null;

  const [date, day] = entries[0];
  if (type === 'cf') {
    return {
      date,
      wod: day.cfWod || '',
      durationMin: day.cfDurationMin || 0,
      durationSec: day.cfDurationSec || 0,
      memo: day.cfMemo || '',
    };
  }
  if (type === 'running') {
    return {
      date,
      distance: day.runDistance || 0,
      durationMin: day.runDurationMin || 0,
      durationSec: day.runDurationSec || 0,
      memo: day.runMemo || '',
    };
  }
  if (type === 'swimming') {
    return {
      date,
      distance: day.swimDistance || 0,
      durationMin: day.swimDurationMin || 0,
      durationSec: day.swimDurationSec || 0,
      stroke: day.swimStroke || '',
      memo: day.swimMemo || '',
    };
  }
  return {
    date,
    duration: day.stretchDuration || 0,
    memo: day.stretchMemo || '',
  };
}

// ================================================================
// Celebration Detectors (home/cheers-card 용 순수 함수들)
// 입력: 친구 워크아웃 문서들(today/yesterday/weekAgo) + 메타
// 출력: { type, priority, template, params } 또는 null
//   - template: 렌더 템플릿 id (cheers-card에서 문구로 변환)
//   - params: { name, exercise, value, ... } 모든 값은 원본(렌더링 단계에서 escape)
// calc.js는 판정만 수행하며 HTML/innerHTML 문자열을 생성하지 않는다 (XSS 방지).
// ================================================================

function _safeNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

function _totalKcal(w) {
  if (!w) return 0;
  return _safeNum(w.bKcal) + _safeNum(w.lKcal) + _safeNum(w.dKcal) + _safeNum(w.sKcal);
}

function _hasExerciseActivity(w) {
  if (!w) return false;
  return !!((w.exercises||[]).length || w.cf || w.swimming || w.running);
}

function _hasDietActivity(w) {
  if (!w) return false;
  return !!((w.bFoods||[]).length || (w.lFoods||[]).length || (w.dFoods||[]).length || (w.sFoods||[]).length)
    || !!(w.bKcal || w.lKcal || w.dKcal || w.sKcal);
}

function _isActiveDay(w) {
  return _hasExerciseActivity(w) || _hasDietActivity(w);
}

function _exerciseVolume(w) {
  if (!w || !Array.isArray(w.exercises)) return {};
  const out = {};
  for (const ex of w.exercises) {
    const id = ex.exerciseId || ex.id || ex.name || 'unknown';
    const name = ex.name || ex.exerciseName || id;
    let volume = 0;
    let topWeight = 0;
    for (const s of (ex.sets || [])) {
      const kg = _safeNum(s.kg);
      const reps = _safeNum(s.reps);
      if (kg > 0 && reps > 0) {
        volume += kg * reps;
        if (kg > topWeight) topWeight = kg;
      }
    }
    if (volume > 0 || topWeight > 0) {
      if (!out[id] || (out[id].volume < volume)) {
        out[id] = { id, name, volume, topWeight };
      }
    }
  }
  return out;
}

// weight 감지: body_checkins 기반 (호출부가 { latest:{date,weight}, weekAgo:{date,weight} } 전달)
// 두 체크인이 5일 이상 떨어져 있어야 의미있는 비교로 간주.
// category: 'diet' (체중은 식단/건강 축)
export function detectWeightDelta({ name, latestWeight, priorWeight, daysBetween }) {
  if (typeof latestWeight !== 'number' || !isFinite(latestWeight)) return null;
  if (typeof priorWeight !== 'number' || !isFinite(priorWeight)) return null;
  if (!daysBetween || daysBetween < 5) return null;
  const delta = Math.round((latestWeight - priorWeight) * 10) / 10;
  if (Math.abs(delta) < 0.3) return null;
  if (delta < 0) {
    return {
      type: 'weight_loss', priority: 95, category: 'diet',
      template: 'weight_loss',
      params: { name, kg: Math.abs(delta), days: daysBetween },
    };
  }
  return {
    type: 'weight_gain', priority: 40, category: 'diet',
    template: 'weight_gain',
    params: { name, kg: delta, days: daysBetween },
  };
}

// category: 'both' — 운동/식단 양쪽에서 활용 가능 (둘 다 복귀 시그널)
export function detectRevival({ name, today, yesterday, weekAgo }) {
  const activeToday = _isActiveDay(today);
  if (!activeToday) return null;
  const wasInactive = !_isActiveDay(yesterday) && !_isActiveDay(weekAgo);
  if (!wasInactive) return null;
  return {
    type: 'streak_revival', priority: 90, category: 'both',
    template: 'streak_revival',
    params: { name },
  };
}

// 한 끼가 기록되었는지: 텍스트 OR kcal OR foods OR skip OR diet-success 플래그
// dietDayOk()와 동일한 "기록 신호"를 사용해 텍스트 전용 기록도 인식한다.
function _mealHasRecord(textField, kcal, foods, skipped, ok) {
  return !!(
    (typeof textField === 'string' && textField.trim()) ||
    (typeof kcal === 'number' && kcal > 0) ||
    (Array.isArray(foods) && foods.length > 0) ||
    skipped || ok
  );
}

// 3끼 모두 "기록 있음(또는 skip)"인 완결된 다이어트 데이 판정 (공용 predicate)
// kcal cheers가 대상으로 삼는 "완결된 날" 정의. dietDayOk()와 계약을 공유.
export function dietDayHasAllMeals(w) {
  if (!w) return false;
  const b = _mealHasRecord(w.breakfast, w.bKcal, w.bFoods, w.breakfast_skipped, w.bOk);
  const l = _mealHasRecord(w.lunch,     w.lKcal, w.lFoods, w.lunch_skipped,     w.lOk);
  const d = _mealHasRecord(w.dinner,    w.dKcal, w.dFoods, w.dinner_skipped,    w.dOk);
  return b && l && d;
}

export function detectKcalDrop({ name, yesterday, dayBefore }) {
  // 오늘은 의도적으로 제외 — 아침/점심까지만 입력된 시점에 "덜 먹었다"로 오판정하는 문제 방지
  if (!dietDayHasAllMeals(yesterday) || !dietDayHasAllMeals(dayBefore)) return null;
  const yk = _totalKcal(yesterday);
  const dk = _totalKcal(dayBefore);
  if (yk <= 0 || dk <= 0) return null;
  const drop = dk - yk;
  if (drop < 200) return null; // 감지 임계값 상향(150→200)으로 노이즈 억제
  return {
    type: 'kcal_reduction', priority: 55, category: 'diet',
    template: 'kcal_reduction',
    params: { name, kcal: drop },
  };
}

// 노이즈 억제: pct와 abs 양쪽 하한선을 모두 넘어야 PR 인정.
// 선정은 '체감 의미'가 더 큰 abs 증가량 우선 → 메인 운동의 작은 % 개선이
// 보조 운동의 큰 %(ex. 5kg→6kg)보다 우선 노출되도록.
const VOLUME_PR_MIN_PCT  = 10;   // 기존 트리거 임계값 유지
const VOLUME_PR_MIN_ABS  = 200;  // kg·rep 하한 (보조운동 노이즈 컷)
const LIFT_PR_MIN_PCT    = 5;    // 1kg/20kg(=5%)처럼 과장되는 케이스 컷
const LIFT_PR_MIN_ABS_KG = 2.5;  // 원판 최소 증량분 기준

export function detectVolumePR({ name, today, yesterday, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const yVol = _exerciseVolume(yesterday);
  const wVol = _exerciseVolume(weekAgo);
  let best = null;
  for (const id of Object.keys(tVol)) {
    const t = tVol[id];
    const prev = Math.max(yVol[id]?.volume || 0, wVol[id]?.volume || 0);
    if (prev <= 0) continue;
    const absDelta = t.volume - prev;
    const pct = Math.round((absDelta / prev) * 100);
    if (pct < VOLUME_PR_MIN_PCT) continue;
    if (absDelta < VOLUME_PR_MIN_ABS) continue;
    if (!best || absDelta > best._absDelta) {
      best = {
        type: 'volume_pr', priority: 75, category: 'exercise',
        template: 'volume_pr',
        params: { name, exerciseId: id, exercise: t.name, pct },
        _absDelta: absDelta,
      };
    }
  }
  if (best) delete best._absDelta;
  return best;
}

export function detectLiftPR({ name, today, yesterday, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const yVol = _exerciseVolume(yesterday);
  const wVol = _exerciseVolume(weekAgo);
  let best = null;
  for (const id of Object.keys(tVol)) {
    const t = tVol[id];
    if (t.topWeight <= 0) continue;
    const prev = Math.max(yVol[id]?.topWeight || 0, wVol[id]?.topWeight || 0);
    if (prev <= 0) continue;
    const absDelta = t.topWeight - prev;
    const pct = Math.round((absDelta / prev) * 100);
    if (pct < LIFT_PR_MIN_PCT) continue;
    if (absDelta < LIFT_PR_MIN_ABS_KG) continue;
    if (!best || absDelta > best._absDelta) {
      best = {
        type: 'weight_pr', priority: 85, category: 'exercise',
        template: 'weight_pr',
        params: { name, exerciseId: id, exercise: t.name, pct },
        _absDelta: absDelta,
      };
    }
  }
  if (best) delete best._absDelta;
  return best;
}

export function detectFrequencyUp({ name, today, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const wVol = _exerciseVolume(weekAgo);
  const newlyAdded = Object.values(tVol).filter((t) => !wVol[t.id]);
  if (!newlyAdded.length) return null;
  const pick = newlyAdded[0];
  return {
    type: 'frequency_up', priority: 50, category: 'exercise',
    template: 'frequency_up',
    params: { name, exerciseId: pick.id, exercise: pick.name },
  };
}

export function detectFullDietDay({ name, today }) {
  if (!today) return null;
  const full = !!(today.bOk && today.lOk && today.dOk);
  if (!full) return null;
  return {
    type: 'full_diet_day', priority: 45, category: 'diet',
    template: 'full_diet_day',
    params: { name },
  };
}

// NOTE: detectStreakMilestone, detectProteinGoal 은 별도 입력(streakDays, 친구 자신의 plan)이
// 호출부에서 안정적으로 확보되지 않는 한 자동 배열에 포함하지 않는다.
// 현재 cheers-card 컨텍스트에서는 정확한 판정이 불가능하므로 export만 하고 기본 배열에서 제외.
export function detectStreakMilestone({ name, streakDays }) {
  if (!streakDays) return null;
  const milestones = [3, 7, 14, 21, 30, 50, 100];
  if (!milestones.includes(streakDays)) return null;
  return {
    type: 'streak_milestone', priority: 80, category: 'both',
    template: 'streak_milestone',
    params: { name, days: streakDays },
  };
}

export function detectProteinGoal({ name, today, friendPlan }) {
  if (!today || !friendPlan) return null;
  const protein = _safeNum(today.bProtein) + _safeNum(today.lProtein)
    + _safeNum(today.dProtein) + _safeNum(today.sProtein);
  const targetG = _safeNum(friendPlan.weight) * 1.6;
  if (targetG <= 0) return null;
  if (protein < targetG) return null;
  return {
    type: 'protein_goal', priority: 55, category: 'diet',
    template: 'protein_goal',
    params: { name, grams: Math.round(targetG) },
  };
}

// 기본 자동 실행 감지기 — 친구의 workouts 문서만으로 판정 가능한 것만 포함
// (streakDays / friendPlan 등 추가 입력이 필요한 감지기는 호출부에서 개별 실행)
export const CELEBRATION_DETECTORS = [
  detectWeightDelta,
  detectRevival,
  detectKcalDrop,
  detectVolumePR,
  detectLiftPR,
  detectFrequencyUp,
  detectFullDietDay,
];

export function runAllCelebrations(ctx) {
  const out = [];
  for (const fn of CELEBRATION_DETECTORS) {
    try {
      const r = fn(ctx);
      if (r) out.push(r);
    } catch (_) { /* ignore single detector failure */ }
  }
  return out;
}

