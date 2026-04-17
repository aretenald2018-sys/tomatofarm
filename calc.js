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
 * 하루 운동 성공 여부
 * 스트릭/토마토 집계 기준: 실제 수행된 세트가 있어야 함.
 *   - 완료 기준: set.done === true  (명시적 완료 체크)
 *              OR (set.kg > 0 && set.reps > 0)  (레거시 데이터 호환)
 *   - AI 루틴 로드만 한 상태(kg:0, reps:10, done:false)는 성공 아님.
 * cf/swimming/running/stretching은 boolean 플래그이므로 true면 기록으로 인정.
 * @param {object} dayData - getDay()로 가져온 해당 날짜 데이터
 * @returns {boolean}
 */
export function isExerciseDaySuccess(dayData) {
  const hasCompletedSet = (dayData.exercises || []).some(ex =>
    (ex.sets || []).some(s =>
      s && (s.done === true || ((s.kg || 0) > 0 && (s.reps || 0) > 0))
    )
  );
  return hasCompletedSet
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
export function getLastSession(cache, exerciseId, excludeDateKey = null) {
  const entries = Object.entries(cache)
    .filter(([key, day]) => key !== excludeDateKey && (day.exercises || []).some(e => e.exerciseId === exerciseId))
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

// ════════════════════════════════════════════════════════════════
// 전문가 모드 — RPE / 1RM / 추천 무게 (순수함수, 사이드이펙트 0)
// ────────────────────────────────────────────────────────────────
// 가이드:
//  - 저장 단위는 항상 kg. 입력 단위가 lb인 기구는 UI 층에서 kgToLb/lbToKg로 변환.
//  - estimate1RM: Epley 공식(단순·보수적). 고반복에서 과대추정 경향 → RPE 룩업으로 보정.
//  - targetWeightKg: e1RM × RPE%1RM 룩업표. 표는 RTS(Reactive Training Systems) 통용값.
//  - weightRange: sizeClass별 ±스텝을 적용해 보수/추천/공격 3구간 제시.
// ════════════════════════════════════════════════════════════════

/** Epley 1RM 추정. kg·reps 중 하나라도 0이면 0 반환. */
export function estimate1RM(kg, reps) {
  const k = Number(kg) || 0;
  const r = Number(reps) || 0;
  if (k <= 0 || r <= 0) return 0;
  if (r === 1) return k;
  return k * (1 + r / 30);
}

/**
 * RPE·reps → %1RM 룩업. RTS 권장표 기반 (6~10 RPE × 1~12 reps).
 * 테이블 밖(예: RPE 5, reps 15)은 가장 가까운 값으로 클램프.
 */
const _RPE_PCT_TABLE = {
  // reps:  1     2     3     4     5     6     7     8     9     10    11    12
  10:    [1.00, 0.96, 0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68],
  9.5:   [0.98, 0.94, 0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67],
  9:     [0.96, 0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66],
  8.5:   [0.94, 0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65],
  8:     [0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63],
  7.5:   [0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65, 0.62],
  7:     [0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63, 0.61],
  6.5:   [0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65, 0.62, 0.60],
  6:     [0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63, 0.61, 0.58],
};
export function rpeRepsToPct(rpe, reps) {
  const r = Math.max(6, Math.min(10, Number(rpe) || 8));
  const rep = Math.max(1, Math.min(12, Math.round(Number(reps) || 10)));
  const rpeKey = Math.round(r * 2) / 2;
  const row = _RPE_PCT_TABLE[rpeKey] || _RPE_PCT_TABLE[8];
  return row[rep - 1];
}

/** 목표 무게(kg) = e1RM × RPE/rep 테이블. 반올림 전 raw값. */
export function targetWeightKg(e1RM, rpe, reps) {
  const one = Number(e1RM) || 0;
  if (one <= 0) return 0;
  return one * rpeRepsToPct(rpe, reps);
}

/** 증량 단위로 반올림(가장 가까운 step 배수). step<=0이면 그대로. */
export function roundToIncrement(kg, step) {
  const s = Number(step);
  const k = Number(kg) || 0;
  if (!(s > 0)) return k;
  return Math.round(k / s) * s;
}

/**
 * 보수/추천/공격 3구간 무게. 추천은 roundToIncrement(target).
 * 소근육(small): ±1 step, 대근육(large): ±2 step. step 기본값 2.5.
 */
export function weightRange(target, sizeClass, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  const spread = sizeClass === 'large' ? 2 : 1;
  const recommended = roundToIncrement(target, s);
  const conservative = Math.max(0, roundToIncrement(recommended - spread * s, s));
  const aggressive   = roundToIncrement(recommended + spread * s, s);
  return { conservative, recommended, aggressive };
}

/** kg ↔ lb 변환 (IUPAC 1959 정의: 1 lb = 0.45359237 kg). */
const _KG_PER_LB = 0.45359237;
export function kgToLb(kg) { return (Number(kg) || 0) / _KG_PER_LB; }
export function lbToKg(lb) { return (Number(lb) || 0) * _KG_PER_LB; }

/**
 * movementId 기준 볼륨 히스토리. exList에서 movementId 매칭되는
 * exerciseId들을 모아 날짜별 볼륨 합산 → [{ date, volume }].
 */
export function getVolumeHistoryByMovement(cache, exList, movementId) {
  if (!cache || !movementId) return [];
  const ids = (exList || [])
    .filter(e => e && e.movementId === movementId)
    .map(e => e.id);
  if (ids.length === 0) return [];
  return getVolumeHistoryMulti(cache, ids);
}

/**
 * 여러 exerciseId를 한 번에 합산한 날짜별 볼륨 히스토리.
 * calcVolume 재사용 — 워밍업 제외, done 판정은 calcVolume 규칙과 동일.
 */
export function getVolumeHistoryMulti(cache, exerciseIds) {
  if (!cache || !exerciseIds?.length) return [];
  const idSet = new Set(exerciseIds);
  const byDate = {};
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entries = (day.exercises || []).filter(e => idSet.has(e.exerciseId));
    if (!entries.length) continue;
    const vol = entries.reduce((sum, e) => sum + calcVolume(e.sets), 0);
    if (vol > 0) byDate[key] = (byDate[key] || 0) + vol;
  }
  return Object.entries(byDate)
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * subPattern별 작업세트 합계 — Scene 13 balance-block 데이터 소스.
 * weekRange = { fromKey, toKey } inclusive. 생략 시 전체 기간.
 * 작업세트 = 워밍업 아닌 것 + (done===true OR done 필드 없고 kg·reps>0).
 * 반환: { back_width: 5, back_thickness: 14, ... }
 */
export function calcBalanceByPattern(cache, exList, movements, weekRange) {
  if (!cache || !exList?.length || !movements?.length) return {};
  const movById   = new Map(movements.map(m => [m.id, m]));
  const exByExId  = new Map(exList.map(e => [e.id, e]));
  const { fromKey, toKey } = weekRange || {};
  const out = {};
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (fromKey && key < fromKey) continue;
    if (toKey   && key > toKey)   continue;
    for (const entry of (day.exercises || [])) {
      const ex = exByExId.get(entry.exerciseId);
      if (!ex?.movementId) continue;
      const mov = movById.get(ex.movementId);
      if (!mov?.subPattern) continue;
      const workSets = (entry.sets || []).filter(s => {
        if (s.setType === 'warmup') return false;
        if (s.done === true) return true;
        if (s.done === false) return false;
        return (s.kg || 0) > 0 && (s.reps || 0) > 0;
      }).length;
      if (workSets > 0) {
        out[mov.subPattern] = (out[mov.subPattern] || 0) + workSets;
      }
    }
  }
  return out;
}

/**
 * 특정 exerciseId의 PR(개인 신기록) 추적.
 *   prKg / prReps / prDate : 역사상 최고 무게 세트
 *   lastKg / lastDate      : 마지막 세션의 최고 작업 무게
 *   progressKg             : 마지막 세션 최고 무게 - 그 이전 세션 최고 무게
 * 기록 부족 시 0/null로 채워 반환.
 */
export function detectPRs(cache, exerciseId) {
  const empty = { prKg:0, prReps:0, prDate:null, lastKg:0, lastDate:null, progressKg:0 };
  if (!cache || !exerciseId) return empty;
  const sessions = [];
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entry = (day.exercises || []).find(e => e.exerciseId === exerciseId);
    if (!entry) continue;
    const workSets = (entry.sets || []).filter(s => {
      if (s.setType === 'warmup') return false;
      if (s.done === false) return false;
      return (s.kg || 0) > 0 && (s.reps || 0) > 0;
    });
    if (!workSets.length) continue;
    const maxKg = Math.max(...workSets.map(s => s.kg || 0));
    const prSet = workSets.find(s => (s.kg || 0) === maxKg) || workSets[0];
    sessions.push({ date: key, maxKg, reps: prSet.reps || 0 });
  }
  if (!sessions.length) return empty;
  sessions.sort((a, b) => a.date.localeCompare(b.date));

  let prKg = 0, prReps = 0, prDate = null;
  for (const s of sessions) {
    if (s.maxKg > prKg) { prKg = s.maxKg; prReps = s.reps; prDate = s.date; }
  }
  const last = sessions[sessions.length - 1];
  const prev = sessions.length >= 2 ? sessions[sessions.length - 2] : null;
  return {
    prKg, prReps, prDate,
    lastKg: last.maxKg, lastDate: last.date,
    progressKg: prev ? +(last.maxKg - prev.maxKg).toFixed(2) : 0,
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

// ═════════════════════════════════════════════════════════════
// 캘린더 탭: 운동 소모칼로리 (MET 기반, Ainsworth 2011 Compendium)
// kcal = MET × weight(kg) × time(h)
// ═════════════════════════════════════════════════════════════

// 부위별 MET. 근력 세트 단위 (세트당 ~2분 가정: 수행 30-45초 + 휴식 75-90초)
const MUSCLE_MET = {
  chest: 6.0, back: 6.5, lower: 7.0, glute: 6.5,
  shoulder: 5.0, abs: 4.0, bicep: 3.5, tricep: 3.5,
};
const SET_DURATION_H = 2 / 60; // 2분 → 시간

// 런닝 속도별 MET (Ainsworth 2011 Compendium)
// 6 mph(9.7 km/h) = 9.8 MET, 7 mph(11.3 km/h) = 11 MET → 10 km/h는 9.8쪽이 정확
function _runMET(speedKmh) {
  if (!isFinite(speedKmh) || speedKmh <= 0) return 8.0; // 기본
  if (speedKmh < 6)     return 6.0;
  if (speedKmh < 8)     return 8.0;
  if (speedKmh <= 10.5) return 9.8;
  return 11.0;
}

/**
 * 하루 운동 소모칼로리 계산 (MET 기반)
 * @param {object} day - workouts/{dateKey} 도큐먼트
 * @param {number} weightKg - 체중(kg). 없으면 70 기본
 * @returns {{total:number, gym:number, running:number, swimming:number, cf:number}}
 */
export function calcBurnedKcal(day, weightKg) {
  const w = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const d = day || {};

  // 근력: 완료 세트(done) × 부위별 MET
  let gym = 0;
  if (!d.gym_skip && Array.isArray(d.exercises)) {
    for (const ex of d.exercises) {
      const mid = ex?.muscleId;
      const met = MUSCLE_MET[mid];
      if (!met) continue;
      const doneSets = Array.isArray(ex?.sets)
        ? ex.sets.filter(s => s?.done).length
        : 0;
      gym += met * w * SET_DURATION_H * doneSets;
    }
  }

  // 런닝: 시간 + 속도 기반
  let running = 0;
  if (d.running && !d.running_skip) {
    const min = (Number(d.runDurationMin) || 0) + (Number(d.runDurationSec) || 0) / 60;
    const km  = Number(d.runDistance) || 0;
    if (min > 0) {
      const speed = km > 0 ? (km / (min / 60)) : 0;
      running = _runMET(speed) * w * (min / 60);
    } else {
      running = 8.0 * w * 0.5; // 시간 미기록: 기본 30분
    }
  }

  // 수영: 기본 30분 (workoutDuration 있으면 우선)
  let swimming = 0;
  if (d.swimming && !d.swimming_skip) {
    const durH = Number(d.workoutDuration) > 0 ? Number(d.workoutDuration) / 3600 : 0.5;
    swimming = 6.0 * w * durH;
  }

  // CF: 기본 30분 (workoutDuration 있으면 우선)
  let cf = 0;
  if (d.cf && !d.cf_skip) {
    const durH = Number(d.workoutDuration) > 0 ? Number(d.workoutDuration) / 3600 : 0.5;
    cf = 8.0 * w * durH;
  }

  const total = Math.round(gym + running + swimming + cf);
  return {
    total,
    gym:      Math.round(gym),
    running:  Math.round(running),
    swimming: Math.round(swimming),
    cf:       Math.round(cf),
  };
}

// ═════════════════════════════════════════════════════════════
// 캘린더 탭: 일일 점수 (100점 만점, baseline 90)
// ═════════════════════════════════════════════════════════════

/**
 * 칼로리 이탈률 기반 감점 (최대 12)
 *   ±10% 이내 0 / 10~20% 3 / 20~40% 7 / 그 이상 12
 */
function _kcalPenalty(actual, target) {
  if (!target || target <= 0) return 0;
  const dev = Math.abs(actual - target) / target;
  if (dev <= 0.10) return 0;
  if (dev <= 0.20) return 3;
  if (dev <= 0.40) return 7;
  return 12;
}

/**
 * 단일 매크로 감점 (범위 기반)
 *   허용 범위 내: 0 / 약한 이탈: 1 / 극단 이탈: 2
 *   극단 경계: 범위 밖으로 허용폭과 같은 폭만큼 더 벗어난 지점
 */
function _macroItemPenalty(actual, target, lowRatio, highRatio) {
  if (!target || target <= 0) return 0;
  const ratio = actual / target;
  if (ratio >= lowRatio && ratio <= highRatio) return 0;
  const lowEdge  = lowRatio  - (1 - lowRatio);  // 예: 0.80 → 0.60
  const highEdge = highRatio + (highRatio - 1); // 예: 1.30 → 1.60
  if (ratio < lowEdge || ratio > highEdge) return 2;
  return 1;
}

/**
 * 탄단지 감점 (최대 5)
 *   각 매크로 허용 범위 내 = 0감점 (만점)
 *     단백질: 80~130% / 탄수: 70~130% / 지방: 70~130%
 *   단백질은 중요도 +1 가중 (이탈 시 2 또는 3)
 *   최종 합 clamp 5
 */
function _macroPenalty(day, macroTarget) {
  if (!macroTarget) return 0;
  const protG = (day.bProtein||0) + (day.lProtein||0) + (day.dProtein||0) + (day.sProtein||0);
  const carbG = (day.bCarbs||0)   + (day.lCarbs||0)   + (day.dCarbs||0)   + (day.sCarbs||0);
  const fatG  = (day.bFat||0)     + (day.lFat||0)     + (day.dFat||0)     + (day.sFat||0);

  const pProtRaw = _macroItemPenalty(protG, macroTarget.proteinG, 0.80, 1.30);
  const pProt    = pProtRaw > 0 ? pProtRaw + 1 : 0; // 단백질 가중
  const pCarb    = _macroItemPenalty(carbG, macroTarget.carbG, 0.70, 1.30);
  const pFat     = _macroItemPenalty(fatG,  macroTarget.fatG,  0.70, 1.30);

  return Math.min(5, pProt + pCarb + pFat);
}

/**
 * 운동 감점 (최대 8)
 */
function _workoutPenalty(burnedKcal, day) {
  const skipped = !!(day.gym_skip || day.cf_skip || day.running_skip || day.swimming_skip);
  const anyLogged = burnedKcal > 0;
  if (!anyLogged && skipped) return 2;  // 의도적 휴식
  if (!anyLogged)            return 8;  // 기록 전무
  if (burnedKcal >= 300) return 0;
  if (burnedKcal >= 150) return 2;
  if (burnedKcal >= 50)  return 5;
  return 6;
}

/**
 * 기록 완결성 감점 (최대 2) — 식사 1건 누락당 1점, 최대 2
 */
function _completenessPenalty(day) {
  let miss = 0;
  const mealLogged = (k, skipKey) => {
    if (day[skipKey]) return true; // 굶었음
    const kcal = Number(day[k]) || 0;
    return kcal > 0;
  };
  if (!mealLogged('bKcal', 'breakfast_skipped')) miss++;
  if (!mealLogged('lKcal', 'lunch_skipped'))     miss++;
  if (!mealLogged('dKcal', 'dinner_skipped'))    miss++;
  return Math.min(2, miss);
}

/**
 * 체중 방향성 감점 (최대 3)
 *   - 목표 방향 일치 or 유지(±0.3kg) = 0
 *   - 반대 방향 = 3
 *   - 7일 내 체중 없음 = 1
 */
function _weightPenalty(dirSign, weightDeltaKg) {
  if (weightDeltaKg == null) return 1;
  if (dirSign === 0) {
    return Math.abs(weightDeltaKg) <= 0.5 ? 0 : 2; // 유지 목표
  }
  if (Math.abs(weightDeltaKg) <= 0.3) return 0; // 사실상 유지
  const sameDir = Math.sign(weightDeltaKg) === Math.sign(dirSign);
  return sameDir ? 0 : 3;
}

/**
 * 일일 점수 (100점 만점)
 * @param {object} ctx
 *   - day: workouts 도큐먼트
 *   - targetKcal: 해당 일자 목표 칼로리
 *   - macroTarget: { proteinG, carbG, fatG }
 *   - burnedKcal: calcBurnedKcal().total
 *   - weightKg: 해당 일자 체중(stepwise)
 *   - weightDeltaKg: 7일전 대비 체중 변화(+ 증량, - 감량)
 *   - weightDirSign: 목표 방향 (-1 감량, 0 유지, +1 증량)
 * @returns {{score:number, band:'great'|'good'|'soso'|'bad'|'none', breakdown:object, hasData:boolean}}
 */
export function calcDayScore(ctx) {
  const { day = {}, targetKcal, macroTarget, burnedKcal = 0,
          weightDeltaKg, weightDirSign = -1 } = ctx || {};

  const actualKcal = (day.bKcal||0) + (day.lKcal||0) + (day.dKcal||0) + (day.sKcal||0);
  const hasAnyLog = actualKcal > 0
    || (Array.isArray(day.exercises) && day.exercises.length > 0)
    || day.cf || day.running || day.swimming;

  if (!hasAnyLog) {
    return { score: null, band: 'none', hasData: false, breakdown: null };
  }

  const pKcal    = _kcalPenalty(actualKcal, targetKcal);
  const pMacro   = _macroPenalty(day, macroTarget);
  const pWorkout = _workoutPenalty(burnedKcal, day);
  const pWeight  = _weightPenalty(weightDirSign, weightDeltaKg);
  const pDone    = _completenessPenalty(day);

  // 최저 70점 하한 (총 감점 max = 12+5+8+3+2 = 30)
  const score = Math.max(70, Math.min(100, 100 - pKcal - pMacro - pWorkout - pWeight - pDone));
  const band =
    score >= 95 ? 'great' :
    score >= 90 ? 'good'  :
    score >= 80 ? 'soso'  : 'bad';

  return {
    score, band, hasData: true,
    breakdown: {
      kcal:     { penalty: pKcal,    max: 12 },
      macro:    { penalty: pMacro,   max: 5  },
      workout:  { penalty: pWorkout, max: 8  },
      weight:   { penalty: pWeight,  max: 3  },
      complete: { penalty: pDone,    max: 2  },
    },
  };
}

