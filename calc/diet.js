// calc/diet.js — 식단 목표, 성공 판정, 일일 점수 및 영양 환산 순수 함수

import { NUTRITION_FIELDS } from '../diet/nutrition-fields.js';
import { hasPositiveDayNutrient, sumDayNutrient } from '../diet/day-nutrition.js';

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
  exerciseKcalSwimming: 200, exerciseKcalRunning: null,
};

const RUNNING_CALORIE_METHOD = 'acsm-speed-grade-v1';

function _isTrustedRunningCalories(summary = {}) {
  const calories = Number(summary?.calories);
  if (!Number.isFinite(calories) || calories <= 0) return false;
  const source = String(summary?.calorieSource || '').trim();
  if (['wear', 'device', 'health-connect'].includes(source)) return true;
  const weight = Number(summary?.calorieWeightKg);
  return source === 'estimated'
    && summary?.calorieMethod === RUNNING_CALORIE_METHOD
    && Number.isFinite(weight)
    && weight >= 25
    && weight <= 300;
}

function _recordedRunningCalories(day = {}) {
  const sessions = Array.isArray(day?.workoutSessions) && day.workoutSessions.length
    ? day.workoutSessions
    : [day];
  return Math.round(sessions.reduce((total, session) => {
    const summary = session?.runRouteSummary;
    return total + (_isTrustedRunningCalories(summary) ? Number(summary.calories) || 0 : 0);
  }, 0));
}

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
  const hasGym = (dayData.exercises || []).some(ex =>
    (ex.sets || []).some(s => s && (s.done === true || ((s.kg || 0) > 0 && (s.reps || 0) > 0)))
  );
  if (hasGym)          credit += (plan.exerciseKcalGym      || 250);
  if (dayData.cf)      credit += (plan.exerciseKcalCF       || 300);
  if (dayData.swimming) credit += (plan.exerciseKcalSwimming || 200);
  // 러닝은 설정된 임의 숫자가 아니라 저장된 워치 값 또는 체중 기반 추정값만 반영한다.
  credit += _recordedRunningCalories(dayData);
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
 * 다이어트 플랜에서 tolerance(초과 허용 kcal) 해석
 * advanced mode가 켜진 경우 plan.dietTolerance를 사용, 그렇지 않으면 50 고정.
 * @param {object|null} plan - getDietPlan()이 반환하는 플랜 객체
 * @returns {number}
 */
export function resolveDietTolerance(plan) {
  if (!plan) return 50;
  return plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
}

/**
 * 식단 기록 존재 여부 (canonical, pure) — 텍스트(snack 포함)/food-chip/kcal-only/skip/photo
 * data.js hasDietRecord와 calc.js dietDayOk 내부 hasRecord가 이 함수를 공유해야 불일치가 사라짐.
 * @param {object} w - workout/day 데이터 객체
 * @returns {boolean}
 */
export function hasDietRecordData(w) {
  if (!w) return false;
  if (w.breakfast || w.lunch || w.dinner || w.snack) return true;
  if ((w.bFoods?.length) || (w.lFoods?.length) || (w.dFoods?.length) || (w.sFoods?.length)) return true;
  if (hasPositiveDayNutrient(w, 'kcal')) return true;
  if (w.breakfast_skipped || w.lunch_skipped || w.dinner_skipped) return true;
  if (w.bPhoto || w.lPhoto || w.dPhoto || w.sPhoto) return true;
  return false;
}

/**
 * 하루 운동 성공 여부
 * 스트릭/토마토 집계 기준:
 *   - 완료된 세트: set.done === true OR (set.kg > 0 && set.reps > 0) — AI 루틴 로드만(kg=0,reps=10,done=false)은 제외
 *   - 활동 플래그: cf / swimming / running / stretching === true
 *   - 활동 상세: runDistance/runDuration, swimDistance/Duration/Stroke, cfDuration/cfWod,
 *               stretchDuration — 플래그 토글 누락해도 기록이 있으면 인정 (leaderboard와 기준 일치)
 * @param {object} dayData - getDay()로 가져온 해당 날짜 데이터
 * @returns {boolean}
 */
export function isExerciseDaySuccess(dayData) {
  if (!dayData) return false;
  const w = dayData;
  const hasCompletedSet = (w.exercises || []).some(ex =>
    (ex.sets || []).some(s => {
      if (!s || s.setType === 'warmup') return false;
      if (s.done === true) return true;
      if (s.done === false) return false;
      return (Number(s.kg) || 0) > 0 && (Number(s.reps) || 0) > 0;
    })
  );
  if (hasCompletedSet) return true;
  if (w.cf || w.swimming || w.running || w.stretching) return true;
  if ((w.runDistance || 0) > 0 || (w.runDurationMin || 0) > 0 || (w.runDurationSec || 0) > 0) return true;
  if ((w.runRoute || []).length > 0 || (w.runRouteSummary?.pointCount || 0) > 0) return true;
  if ((w.swimDistance || 0) > 0 || (w.swimDurationMin || 0) > 0 || (w.swimDurationSec || 0) > 0) return true;
  if ((w.swimStroke || '').toString().trim()) return true;
  if ((w.cfDurationMin || 0) > 0 || (w.cfDurationSec || 0) > 0) return true;
  if ((w.cfWod || '').toString().trim()) return true;
  if ((w.stretchDuration || 0) > 0) return true;
  return false;
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
  const limitKcal = getDayTargetKcal(plan, y, m, d, dayData);
  const totalKcal = sumDayNutrient(r, 'kcal');
  const tolerance = resolveDietTolerance(plan);

  // canonical hasRecord — hasDietRecordData로 일원화 (data.js hasDietRecord와 동일 계약)
  if (!hasDietRecordData(r)) return null;

  // 판정 기준 = isDietDaySuccess(kcal 범위) 단일.
  // 과거엔 bOk && lOk && dOk 체크박스까지 요구해 끼니별 "OK" 토글이 없으면 스트릭이 깨졌음.
  // evaluateCycleResult(토마토 정산)와 기준 일치 — kcal이 범위 내면 그 날은 성공.
  return isDietDaySuccess(totalKcal, limitKcal, tolerance);
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
  let workout = 0, diet = 0, stretching = 0, wineFree = 0, combined = 0;

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

  // 통합 스트릭 (홈 히어로 기본) — 그 날 성공 = 운동 기록 OR 식단 기록+칼로리 성공.
  // isExerciseDaySuccess(=운동 기록 존재) OR dietDayOk===true 이면 success.
  // 둘 다 기록 없는 과거일 → break. 둘 다 기록 없는 오늘 → skip (카운트 X, break X).
  cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    const day = getDay(y, m, d);
    const exOk = isExerciseDaySuccess(day);
    const dok = dietDayOk(day, plan, y, m, d);
    if (exOk || dok === true) {
      combined++;
    } else if (dok === false) {
      break; // 식단 기록 있으나 칼로리 초과 — 운동도 없으면 실패
    } else if (dok === null && cur < today) {
      break; // 운동·식단 둘 다 기록 없는 과거일 — 스트릭 끊김
    }
    cur.setDate(cur.getDate() - 1);
  }

  return { workout, diet, stretching, wineFree, combined };
}

/**
 * Streak(일수) → 히어로 캐릭터 표정 매핑.
 * 순수 함수. DOM/Firebase 접근 없음.
 *
 * 구간:
 *   0     → 'seed'   (잠든 듯 평온한 눈, 작은 중립 입)
 *   1-2   → 'smile'  (기본 웃는 얼굴 — 현재 tomato-red.svg 표정과 동일)
 *   3-6   → 'happy'  (환한 미소 + 볼 홍조)
 *   7-13  → 'fire'   (신난 눈매 + 활짝 웃는 입)
 *   14+   → 'legend' (별 눈 + 크게 웃는 입)
 *
 * 히어로카드 우측 토마토 캐릭터 표정 결정에 사용. 숫자가 아니거나 NaN이면 'seed'.
 *
 * @param {number} streakDays - combined 스트릭 일수 (calcStreaks().combined 권장)
 * @returns {'seed'|'smile'|'happy'|'fire'|'legend'}
 */
export function streakToCharacterMood(streakDays) {
  const n = Number(streakDays);
  if (!Number.isFinite(n) || n <= 0) return 'seed';
  if (n >= 14) return 'legend';
  if (n >= 7)  return 'fire';
  if (n >= 3)  return 'happy';
  if (n >= 1)  return 'smile';
  return 'seed';
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
 * @param {number} weightKg - 체중(kg). 근력/수영/CF MET 추정에 사용
 * @returns {{total:number, gym:number, cardio:number, running:number, swimming:number, cf:number}}
 */
export function calcBurnedKcal(day, weightKg) {
  const w = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const d = day || {};

  // 근력: 완료 세트(done) × 부위별 MET
  let gym = 0;
  let cardio = 0;
  if (Array.isArray(d.exercises)) {
    for (const ex of d.exercises) {
      const manualCardioKcal = Number(ex?.cardio?.kcal);
      if (Number.isFinite(manualCardioKcal) && manualCardioKcal > 0) {
        cardio += manualCardioKcal;
      }
      const mid = ex?.muscleId;
      const met = MUSCLE_MET[mid];
      if (!met) continue;
      const doneSets = Array.isArray(ex?.sets)
        ? ex.sets.filter(s => s?.done).length
        : 0;
      gym += met * w * SET_DURATION_H * doneSets;
    }
  }

  // 러닝: 기록된 실제 워치 kcal 또는 체중·속도·경사 추정값만 사용한다.
  // 시간/체중이 빠진 기록에 임의 체중·30분을 대입하지 않는다.
  const running = d.running_skip ? 0 : _recordedRunningCalories(d);

  // 수영: 기본 30분 (workoutDuration 있으면 우선)
  let swimming = 0;
  if (d.swimming && !d.swimming_skip) {
    const durH = Number(d.workoutDuration) > 0 ? Number(d.workoutDuration) / 3600 : 0.5;
    swimming = 6.0 * w * durH;
  }

  // CF: 기본 30분 (workoutDuration 있으면 우선)
  let cf = 0;
  if (d.cf) {
    const durH = Number(d.workoutDuration) > 0 ? Number(d.workoutDuration) / 3600 : 0.5;
    cf = 8.0 * w * durH;
  }

  const total = Math.round(gym + cardio + running + swimming + cf);
  return {
    total,
    gym:      Math.round(gym),
    cardio:   Math.round(cardio),
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
 *   - 목표 이하(실제 ≤ 목표): 0감점 — 감량/절제 친화적
 *   - 초과 시 단계: 0~10% 0 / 10~20% 3 / 20~40% 7 / 그 이상 12
 *   (극단적 단식 리스크는 단백질 달성률 감점에서 별도 커버)
 */
function _kcalPenalty(actual, target) {
  if (!target || target <= 0) return 0;
  if (actual <= target) return 0; // 목표 이하 = 만점
  const dev = (actual - target) / target;
  if (dev <= 0.10) return 0;
  if (dev <= 0.20) return 3;
  if (dev <= 0.40) return 7;
  return 12;
}

/**
 * 단일 매크로 감점 (상한 초과만 감점 — 목표 이하는 만점)
 *   허용 ratio 이하: 0 / 약한 초과: 1 / 극단 초과: 2
 *   극단 경계: 상한 밖으로 허용폭과 같은 폭만큼 더 벗어난 지점 (예 1.30→1.60)
 */
function _macroItemPenalty(actual, target, highRatio) {
  if (!target || target <= 0) return 0;
  const ratio = actual / target;
  if (ratio <= highRatio) return 0; // 목표 이하 / 범위 내 = 만점
  const highEdge = highRatio + (highRatio - 1); // 예: 1.30 → 1.60
  if (ratio > highEdge) return 2;
  return 1;
}

/**
 * 탄단지 감점 (최대 5) — 목표 초과만 감점
 *   각 매크로 목표 130% 이하 = 0감점 (만점)
 *   단백질은 중요도 +1 가중 (이탈 시 2 또는 3)
 *   최종 합 clamp 5
 *   부족은 감점 없음 (감량/절제 친화적) — 극단적 영양 결핍은 칼로리 산식 외 범위
 */
function _macroPenalty(day, macroTarget) {
  if (!macroTarget) return 0;
  const protG = sumDayNutrient(day, 'protein');
  const carbG = (day.bCarbs||0)   + (day.lCarbs||0)   + (day.dCarbs||0)   + (day.sCarbs||0);
  const fatG  = (day.bFat||0)     + (day.lFat||0)     + (day.dFat||0)     + (day.sFat||0);

  const pProtRaw = _macroItemPenalty(protG, macroTarget.proteinG, 1.30);
  const pProt    = pProtRaw > 0 ? pProtRaw + 1 : 0; // 단백질 가중
  const pCarb    = _macroItemPenalty(carbG, macroTarget.carbG, 1.30);
  const pFat     = _macroItemPenalty(fatG,  macroTarget.fatG,  1.30);

  return Math.min(5, pProt + pCarb + pFat);
}

/**
 * 운동 감점 (최대 8)
 * 랜딩 '쉬었어요/건강이슈' 제거 후 — 기록 없는 날은 전부 감점 대상.
 */
function _workoutPenalty(burnedKcal) {
  if (burnedKcal <= 0)   return 8;  // 기록 전무
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

  const actualKcal = sumDayNutrient(day, 'kcal');
  const hasAnyLog = actualKcal > 0
    || isExerciseDaySuccess(day);

  if (!hasAnyLog) {
    return { score: null, band: 'none', hasData: false, breakdown: null };
  }

  const pKcal    = _kcalPenalty(actualKcal, targetKcal);
  const pMacro   = _macroPenalty(day, macroTarget);
  const pWorkout = _workoutPenalty(burnedKcal);
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

// ═════════════════════════════════════════════════════════════════
// 영양 단위 환산 (pure) — 2026-04-18 NUTRITION_REFACTOR
// ─────────────────────────────────────────────────────────────────
// 모든 canonical NutritionItem의 base는 아래 중 하나:
//   - { type: 'per_100g', grams: 100 }
//   - { type: 'per_100ml', ml: 100 }            (액상 음료)
//   - { type: 'per_serving', grams: 30 }        (가공식품 1회 제공량)
//
// convertNutrition(nutritionPerBase, base, toGrams) → 해당 중량의 환산값
// ─────────────────────────────────────────────────────────────────

/**
 * base 단위의 영양값을 toGrams(또는 toMl)에 맞춰 환산.
 * @param {object} nutritionPerBase  {kcal, protein, carbs, fat, ...} — base 기준 값
 * @param {object} base              {type:'per_100g'|'per_100ml'|'per_serving', grams?, ml?}
 * @param {number} toGrams           환산할 실 중량(g) 또는 부피(ml)
 * @returns {object}                 환산된 영양 객체 (kcal 정수, 매크로 소수1자리)
 */
export function convertNutrition(nutritionPerBase, base, toGrams) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  if (!nutritionPerBase || !base) return out;

  const amount = Number(toGrams) || 0;
  // base의 기준 중량/부피 (per_100g/per_100ml은 100, per_serving은 명시 grams)
  let baseAmount = 100;
  if (base.type === 'per_serving') baseAmount = Number(base.grams) || 100;
  else if (base.type === 'per_100ml') baseAmount = Number(base.ml) || 100;
  else if (base.type === 'per_100g')  baseAmount = Number(base.grams) || 100;
  if (baseAmount <= 0) baseAmount = 100;

  const ratio = amount / baseAmount;
  for (const f of NUTRITION_FIELDS) {
    const v = Number(nutritionPerBase[f]) || 0;
    const scaled = v * ratio;
    if (f === 'kcal' || f === 'sodium') {
      out[f] = Math.round(scaled);
    } else {
      out[f] = Math.round(scaled * 10) / 10;
    }
  }
  return out;
}

/**
 * 매크로 총합이 kcal 공식(4C + 4P + 9F)과 일치하는지 ±tolerance 범위 검증.
 * 라벨 OCR/Gemini 결과가 엉뚱한 컬럼을 잡았을 때 감지하는 안전장치.
 * @returns {{ok:boolean, derivedKcal:number, diffPct:number}}
 */
export function validateNutritionConsistency(n, tolerancePct = 20) {
  const kcal = Number(n?.kcal) || 0;
  const p = Number(n?.protein) || 0;
  const c = Number(n?.carbs) || 0;
  const f = Number(n?.fat) || 0;
  const derivedKcal = 4 * c + 4 * p + 9 * f;
  if (kcal <= 0 || derivedKcal <= 0) return { ok: false, derivedKcal, diffPct: Infinity };
  const diff = Math.abs(kcal - derivedKcal);
  const diffPct = (diff / kcal) * 100;
  return { ok: diffPct <= tolerancePct, derivedKcal: Math.round(derivedKcal), diffPct };
}

/**
 * servings 배열에서 기본 단위(가공식품=per_serving, 원재료=per_100g) 자동 선택.
 */
export function pickDefaultServing(servings, groupHint) {
  if (!Array.isArray(servings) || !servings.length) return null;
  const byId = (id) => servings.find(s => s.id === id);
  // 원재료: per_100g 우선
  if (groupHint === '원재료성' || groupHint === 'raw') {
    return byId('per_100g') || servings[0];
  }
  // 가공식품: per_serving 우선
  if (groupHint === '가공식품' || groupHint === 'processed') {
    return byId('per_serving') || byId('per_100g') || servings[0];
  }
  // 음식/기타: 1인분(per_serving) 있으면 그걸로, 없으면 per_100g
  return byId('per_serving') || byId('per_100g') || servings[0];
}
