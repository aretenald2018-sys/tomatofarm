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
  const hasGym = (dayData.exercises || []).length > 0;
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
  if ((w.bKcal || 0) > 0 || (w.lKcal || 0) > 0 || (w.dKcal || 0) > 0 || (w.sKcal || 0) > 0) return true;
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
    (ex.sets || []).some(s =>
      s && (s.done === true || ((s.kg || 0) > 0 && (s.reps || 0) > 0))
    )
  );
  if (hasCompletedSet) return true;
  if (w.cf || w.swimming || w.running || w.stretching) return true;
  if ((w.runDistance || 0) > 0 || (w.runDurationMin || 0) > 0 || (w.runDurationSec || 0) > 0) return true;
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
  const totalKcal = (r.bKcal || 0) + (r.lKcal || 0) + (r.dKcal || 0) + (r.sKcal || 0);
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
 * @param {Array<{date:string, intake:number, target:number, dayData:object}>} dayResults
 * @param {object|null} [plan] - getDietPlan() 반환값. tolerance 적용에 사용.
 * @returns {{ dietAllSuccess: boolean, exerciseAllSuccess: boolean, tomatoesAwarded: number, dietSuccesses: boolean[], exerciseSuccesses: boolean[] }}
 */
export function evaluateCycleResult(dayResults, plan) {
  const tolerance = resolveDietTolerance(plan || null);
  const dietSuccesses = dayResults.map(d => {
    const dayData = d.dayData || {};
    // canonical 판정: food-chip/skip/sKcal 포함 전체 기록 기반
    const totalKcal = (dayData.bKcal || 0) + (dayData.lKcal || 0) +
                      (dayData.dKcal || 0) + (dayData.sKcal || 0);
    const hasRecord = !!(dayData.breakfast || dayData.lunch || dayData.dinner ||
      (dayData.bFoods?.length) || (dayData.lFoods?.length) ||
      (dayData.dFoods?.length) || (dayData.sFoods?.length) ||
      dayData.breakfast_skipped || dayData.lunch_skipped || dayData.dinner_skipped);
    if (!hasRecord && totalKcal <= 0) return false;
    return isDietDaySuccess(totalKcal, d.target, tolerance);
  });
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

export function normalizeWorkoutTrack(track) {
  const t = String(track || '').trim().toUpperCase();
  if (t === 'H' || t === 'HEAVY' || t === 'INTENSITY' || t === 'STRENGTH') return 'H';
  if (t === 'M' || t === 'V' || t === 'VOLUME' || t === 'MEDIUM' || t === 'HYPERTROPHY') return 'M';
  return '';
}

function _trackWorkSets(sets) {
  return (sets || []).filter(s => {
    if (!s || s.setType === 'warmup') return false;
    if (s.done === false) return false;
    return (Number(s.kg) || 0) > 0 && (Number(s.reps) || 0) > 0;
  });
}

export function inferWorkoutTrack(entry = {}, ex = null) {
  const explicit = normalizeWorkoutTrack(
    entry?.recommendationMeta?.track ||
    entry?.maxPrescription?.benchmarkTrack ||
    entry?.maxPrescription?.track ||
    entry?.maxTrackPreference
  );
  if (explicit) return { track: explicit, source: 'record' };

  const workSets = _trackWorkSets(entry?.sets);
  if (!workSets.length) return { track: '', source: 'empty' };

  const bestSet = workSets.reduce((best, set) => {
    const score = estimate1RM(set.kg, set.reps) || Number(set.kg) || 0;
    const bestScore = estimate1RM(best.kg, best.reps) || Number(best.kg) || 0;
    return score > bestScore ? set : best;
  }, workSets[0]);
  const reps = Number(bestSet?.reps) || 0;

  if (reps >= 10) return { track: 'M', source: 'reps' };
  if (reps > 0 && reps <= 8) return { track: 'H', source: 'reps' };

  const exerciseMeta = normalizeWorkoutTrack(ex?.maxTrackPreference);
  if (exerciseMeta) return { track: exerciseMeta, source: 'exercise-meta' };
  return { track: '', source: 'ambiguous-reps' };
}

export function calcTrackSessionMetric(entry = {}, track = '') {
  const t = normalizeWorkoutTrack(track) || inferWorkoutTrack(entry).track;
  const workSets = _trackWorkSets(entry?.sets);
  if (!t || !workSets.length) return 0;
  if (t === 'H') {
    return Math.max(...workSets.map(s => estimate1RM(s.kg, s.reps) || Number(s.kg) || 0));
  }
  return workSets.reduce((sum, s) => sum + (Number(s.kg) || 0) * (Number(s.reps) || 0), 0);
}

export function getTrackMetricHistory(cache, exList, exerciseId) {
  if (!cache || !exerciseId) return { M: [], H: [], unclassified: 0, total: 0 };
  const exById = new Map((exList || []).map(ex => [ex.id, ex]));
  const byDate = {};
  let unclassified = 0;
  let total = 0;

  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entries = (day.exercises || []).filter(e => e?.exerciseId === exerciseId);
    for (const entry of entries) {
      if (!_trackWorkSets(entry?.sets).length) continue;
      total += 1;
      const ex = exById.get(entry.exerciseId) || null;
      const inferred = inferWorkoutTrack(entry, ex);
      if (!inferred.track) {
        unclassified += 1;
        continue;
      }
      const value = calcTrackSessionMetric(entry, inferred.track);
      if (value <= 0) continue;
      if (!byDate[key]) byDate[key] = { date: key, M: 0, H: 0 };
      byDate[key][inferred.track] += value;
    }
  }

  const rows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  return {
    M: rows.filter(r => r.M > 0).map(r => ({ date: r.date, value: r.M })),
    H: rows.filter(r => r.H > 0).map(r => ({ date: r.date, value: r.H })),
    unclassified,
    total,
  };
}

/**
 * subPattern별 작업세트 합계 — Scene 13 balance-block 데이터 소스.
 * weekRange = { fromKey, toKey } inclusive. 생략 시 전체 기간.
 * 작업세트 = 워밍업 아닌 것 + (done===true OR done 필드 없고 kg·reps>0).
 * 반환: { back_width: 5, back_thickness: 14, ... }
 */
export function calcBalanceByPattern(cache, exList, movements, weekRange) {
  if (!cache || !exList?.length) return {};
  const movById   = new Map((movements || []).map(m => [m.id, m]));
  const exByExId  = new Map(exList.map(e => [e.id, e]));
  const { fromKey, toKey } = weekRange || {};
  const out = {};
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (fromKey && key < fromKey) continue;
    if (toKey   && key > toKey)   continue;
    for (const entry of (day.exercises || [])) {
      const ex = exByExId.get(entry.exerciseId);
      // 2026-04-19: 자극 부위 결정 우선순위 — muscleIds[0] (주동근) > movement.subPattern.
      // 유저가 칩 에디터에서 직접 편집한 muscleIds 값을 존중. 없으면 movementId 폴백.
      // 2026-04-20: exList에서 사라진 종목(삭제됨)이나 커스텀 종목도 포함되도록
      //             entry 자체의 스냅샷 필드(muscleIds/movementId)를 fallback으로 사용.
      //             저장 시 _cleanExercises가 스냅샷을 찍어둠. (Codex 지적 #3)
      const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
        ? ex.muscleIds
        : (Array.isArray(entry.muscleIds) ? entry.muscleIds : []);
      const movementId = ex?.movementId || entry.movementId || null;
      let subPattern = null;
      if (muscleIds.length > 0) {
        subPattern = muscleIds[0];
      } else if (movementId) {
        const mov = movById.get(movementId);
        if (mov?.subPattern) subPattern = mov.subPattern;
      }
      if (!subPattern) continue;
      const workSets = (entry.sets || []).filter(s => {
        if (s.setType === 'warmup') return false;
        if (s.done === true) return true;
        if (s.done === false) return false;
        return (s.kg || 0) > 0 && (s.reps || 0) > 0;
      }).length;
      if (workSets > 0) {
        out[subPattern] = (out[subPattern] || 0) + workSets;
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
// Muscle-comparison helpers (인사이트 모달 / 루틴 추천용)
//   "오늘 가슴이면 직전 가슴·직직전 가슴과 subPattern 균형까지 비교한다"
//   - getSessionMajorMuscles: 하루치 세션의 대분류 부위 집합
//   - summarizeMuscleSession: 지정 대분류로 필터링한 세트/볼륨/subBalance
//   - findRecentSameMuscleSessions: beforeKey 이전에서 같은 대분류 세션 N개
//   - buildMuscleComparison: 오늘 + 직전 N개 메트릭 + 델타 + 불균형 경고
// ================================================================

/**
 * subPattern(세부 부위) → major muscle(대분류) 역매핑.
 * MUSCLES/MOVEMENTS와 1:1 정렬. glute는 lower와 분리된 독립 타겟 (workout 탭 칩 기준).
 * 과거엔 expert.js 내부 상수였으나 calc 레이어에서도 필요해 승격.
 */
export const SUBPATTERN_TO_MAJOR = {
  chest_all: 'chest', chest_upper: 'chest', chest_mid: 'chest', chest_lower: 'chest',
  back_all: 'back', back_width: 'back', back_thickness: 'back',
  posterior: 'back',           // 후면사슬(데드/RDL) — 등 두께+햄/둔근 혼합, 등으로 분류
  shoulder_front: 'shoulder', shoulder_side: 'shoulder',
  rear_delt: 'shoulder', traps: 'shoulder',
  quad: 'lower', hamstring: 'lower', calf: 'lower',
  glute: 'glute',              // 독립 타겟
  bicep: 'bicep',
  tricep: 'tricep',
  core: 'abs',
};

function _isWorkSet(s) {
  if (!s) return false;
  if (s.setType === 'warmup') return false;
  if (s.done === true) return true;
  if (s.done === false) return false;
  return (s.kg || 0) > 0 && (s.reps || 0) > 0;
}

/**
 * entry(운동 1건)의 subPattern 결정.
 * 우선순위: ex.muscleIds[0] > entry.muscleIds[0] > movement.subPattern.
 * calcBalanceByPattern과 동일 규칙.
 */
function _resolveSubPattern(entry, ex, movById) {
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) return muscleIds[0];
  const movementId = ex?.movementId || entry?.movementId || null;
  if (movementId && movById) {
    const mov = movById.get(movementId);
    if (mov?.subPattern) return mov.subPattern;
  }
  return null;
}

/**
 * entry의 **세션 major** — 주동근(primary) 1개만 반환.
 * 2026-04-20 재설계: 이전 구현은 muscleIds 전체를 역매핑해 "벤치 = 가슴+어깨+삼두 세션"
 *   처럼 보조근까지 부위로 인정했다. 이건 MOVEMENT_MUSCLES_MAP 주석("배열[0]=주동근,
 *   배열[1..]=협응/보조근") 및 calcBalanceByPattern(muscleIds[0] 기준) 과 모순되며, 리뷰
 *   지적 #2/#3 의 혼합 버그 원인이었다. 이제 주동근만 반영 — 보조근은 세션 major 에서 제외.
 *
 * 우선순위: muscleIds[0] → movement.primary → entry.muscleId(major 또는 subPattern) → null.
 * 반환: major 문자열(chest/back/shoulder/lower/glute/bicep/tricep/abs) 또는 null.
 */
function _resolvePrimaryMajor(entry, ex, movById) {
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) {
    const sp = muscleIds[0];
    const major = SUBPATTERN_TO_MAJOR[sp];
    if (major) return major;
    // muscleIds[0] 가 이미 major(subPattern 아닌 경우 — 레거시 저장 경로) 면 그대로 반환.
    return sp || null;
  }
  const movementId = ex?.movementId || entry?.movementId || null;
  if (movementId && movById) {
    const mov = movById.get(movementId);
    if (mov?.primary) return mov.primary;
    if (mov?.subPattern && SUBPATTERN_TO_MAJOR[mov.subPattern]) return SUBPATTERN_TO_MAJOR[mov.subPattern];
  }
  // 최후: entry.muscleId — major 일 수도, subPattern 일 수도 있음.
  const leg = entry?.muscleId;
  if (leg) return SUBPATTERN_TO_MAJOR[leg] || leg;
  return null;
}

/**
 * 세션(하루) day 도큐먼트에서 "작업세트 1회 이상"한 대분류 부위 집합.
 *   2026-04-20: 주동근(primary) 기준만. 벤치를 한 날은 {'chest'} (shoulder/tricep 제외).
 *   보조근까지 포함하면 세션 major 가 과대평가되어 루틴 추천/이력 비교가 오염됨.
 * exercises 배열이 비어있거나 모두 워밍업이면 빈 Set.
 * @returns {Set<string>} 예) {'chest'} 또는 {'back','bicep'}
 */
export function getSessionMajorMuscles(day, exList, movements) {
  const out = new Set();
  if (!day?.exercises?.length) return out;
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  for (const entry of day.exercises) {
    const workSets = (entry.sets || []).filter(_isWorkSet).length;
    if (workSets === 0) continue;
    const ex = exByExId.get(entry.exerciseId);
    const major = _resolvePrimaryMajor(entry, ex, movById);
    if (major) out.add(major);
  }
  return out;
}

/**
 * 하루치 세션을 "지정 대분류(majors)에 속한 종목만" 집계.
 *   - workSets    : 작업세트 합
 *   - totalVolume : kg*reps 합 (작업세트만)
 *   - topKg       : 해당 부위 종목들 중 단일 세트 최대 무게
 *   - subBalance  : { subPattern: workSets } — chest_upper/mid/lower 등
 *   - exercises   : [{ exerciseId, name, subPattern, workSets, topKg, volume, sets:[{kg,reps,rpe,setType,done}] }]
 * @param {string[]|Set<string>|null} majors null이면 전체 부위 집계.
 */
export function summarizeMuscleSession(day, exList, movements, majors) {
  const out = { workSets: 0, totalVolume: 0, topKg: 0, subBalance: {}, exercises: [] };
  if (!day?.exercises?.length) return out;
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  const majorSet = majors == null
    ? null
    : (majors instanceof Set ? majors : new Set(majors));
  for (const entry of day.exercises) {
    const ex = exByExId.get(entry.exerciseId);
    // 2026-04-20: 주동근 기준만 매칭. 벤치(주동근 chest) 는 majors=['shoulder'] 필터에 안 잡힘.
    const primary = _resolvePrimaryMajor(entry, ex, movById);
    if (majorSet && (!primary || !majorSet.has(primary))) continue;
    const subPattern = _resolveSubPattern(entry, ex, movById);
    const workSets = (entry.sets || []).filter(_isWorkSet);
    if (workSets.length === 0) continue;
    const topKg = workSets.reduce((a, s) => Math.max(a, Number(s.kg) || 0), 0);
    const volume = workSets.reduce((a, s) => a + (Number(s.kg) || 0) * (Number(s.reps) || 0), 0);
    out.workSets += workSets.length;
    out.totalVolume += volume;
    if (topKg > out.topKg) out.topKg = topKg;
    if (subPattern) out.subBalance[subPattern] = (out.subBalance[subPattern] || 0) + workSets.length;
    out.exercises.push({
      exerciseId: entry.exerciseId,
      name: ex?.name || entry.name || entry.exerciseId,
      movementId: ex?.movementId || entry.movementId || null,
      subPattern,
      primaryMajor: primary,
      workSets: workSets.length,
      topKg,
      volume: Math.round(volume),
      sets: workSets.map((s, i) => ({
        setNo: i + 1,
        kg: Number(s.kg) || 0,
        reps: Number(s.reps) || 0,
        rpe: s.rpe ?? null,
        setType: s.setType || 'main',
        done: s.done !== false,
      })),
    });
  }
  out.totalVolume = Math.round(out.totalVolume);
  return out;
}

/**
 * beforeKey (YYYY-MM-DD) 이전 날짜 중, majors 에 속한 부위를 운동한 세션의 dateKey를
 * 최신 → 과거 순으로 limit 개 반환. beforeKey 당일은 포함하지 않음.
 *   majors: string[] 또는 Set<string>. 빈값이면 []를 반환.
 * 정렬: 문자열 비교 (YYYY-MM-DD 사전순 == 시간순 역순 가능).
 */
export function findRecentSameMuscleSessions(cache, exList, movements, beforeKey, majors, limit = 2) {
  if (!cache || !beforeKey || !/^\d{4}-\d{2}-\d{2}$/.test(beforeKey)) return [];
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (majorSet.size === 0) return [];
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  const hits = [];
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (key >= beforeKey) continue;
    if (!day?.exercises?.length) continue;
    // 2026-04-20: 주동근 기준만 매칭. arm_pulldown-only 세션은 majors=['tricep'] 에 매칭되면 안됨.
    let match = false;
    for (const entry of day.exercises) {
      const workSets = (entry.sets || []).filter(_isWorkSet).length;
      if (workSets === 0) continue;
      const ex = exByExId.get(entry.exerciseId);
      const primary = _resolvePrimaryMajor(entry, ex, movById);
      if (primary && majorSet.has(primary)) { match = true; break; }
    }
    if (match) hits.push(key);
  }
  hits.sort((a, b) => b.localeCompare(a));     // 최신 first
  return hits.slice(0, Math.max(1, limit));
}

/**
 * 오늘 세션(todayKey)과 "같은 대분류의 직전 세션들" 비교 요약.
 *   majors: 명시하지 않으면 오늘 세션에서 자동 감지.
 *   limit : 비교 대상 과거 세션 수 (기본 2 — 직전/직직전).
 *   반환:
 *     {
 *       majors: ['chest'],
 *       today:    { dateKey, ...metrics },
 *       previous: [{ dateKey, ...metrics }, ...]   // 최신 → 과거
 *       deltas:   [{ vs: 'prev', workSetsDelta, volumeDelta, topKgDelta }, ...]
 *       imbalance: { weakest, strongest, weakSubPatterns:[...], note } | null
 *     }
 *   오늘 세션이 없거나 해당 부위 이력이 없으면 majors=[] 또는 previous=[] 로 반환.
 *   imbalance: 최근 3세션(today+previous) 합산 기준, 전체 대비 15% 미만 subPattern을 weak로.
 */
export function buildMuscleComparison(cache, exList, movements, todayKey, majors, limit = 2) {
  const empty = { majors: [], today: null, previous: [], deltas: [], imbalance: null };
  if (!cache || !todayKey || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return empty;
  const day = cache[todayKey];
  if (!day) return empty;
  // majors 자동 감지
  let majorSet;
  if (majors && (Array.isArray(majors) ? majors.length : majors.size)) {
    majorSet = majors instanceof Set ? new Set(majors) : new Set(majors);
  } else {
    majorSet = getSessionMajorMuscles(day, exList, movements);
  }
  if (majorSet.size === 0) return empty;

  const todaySum = summarizeMuscleSession(day, exList, movements, majorSet);
  const prevKeys = findRecentSameMuscleSessions(cache, exList, movements, todayKey, majorSet, limit);
  const previous = prevKeys.map(k => ({
    dateKey: k,
    ...summarizeMuscleSession(cache[k], exList, movements, majorSet),
  }));

  const deltas = previous.map((p, i) => ({
    vs: i === 0 ? 'prev' : (i === 1 ? 'prevPrev' : `prev${i}`),
    dateKey: p.dateKey,
    workSetsDelta: todaySum.workSets - p.workSets,
    volumeDelta: todaySum.totalVolume - p.totalVolume,
    topKgDelta: +(todaySum.topKg - p.topKg).toFixed(2),
  }));

  // 불균형 판단: today + previous 합산 subBalance 에서
  //   (a) 전체 대비 비중 <15% 인 subPattern + (b) 아예 0세트인 subPattern 을 weak 로.
  //   2026-04-20 수정: 이전에는 `combinedEntries.length >= 2` 인 경우에만 0세트 탐지를
  //   수행해서 "세션 내내 chest_mid 만" 같은 가장 심한 불균형 케이스를 놓쳤다. possibleSubs
  //   (이 대분류에 속한 정의된 subPattern 전체) 가 2개 이상이면 분석을 실행한다.
  const combined = { ...todaySum.subBalance };
  for (const p of previous) {
    for (const [sp, v] of Object.entries(p.subBalance || {})) {
      combined[sp] = (combined[sp] || 0) + v;
    }
  }
  const combinedEntries = Object.entries(combined).sort((a, b) => b[1] - a[1]);
  const possibleSubs = new Set();
  for (const [sp, mj] of Object.entries(SUBPATTERN_TO_MAJOR)) {
    if (majorSet.has(mj)) possibleSubs.add(sp);
  }
  let imbalance = null;
  if (possibleSubs.size >= 2) {
    const totalSets = combinedEntries.reduce((a, [, v]) => a + v, 0);
    const weakSet = new Set();
    // (a) 관측됐지만 비중이 낮은 경우
    if (totalSets > 0) {
      for (const [sp, v] of combinedEntries) {
        if (v / totalSets < 0.15) weakSet.add(sp);
      }
    }
    // (b) possibleSubs 중 한 번도 관측되지 않은 경우 — 가장 명확한 불균형
    for (const sp of possibleSubs) {
      if (!(sp in combined)) weakSet.add(sp);
    }
    const weak = [...weakSet];
    const strongest = combinedEntries[0]?.[0] || null;
    if (weak.length > 0) {
      imbalance = {
        weakSubPatterns: weak,
        strongest,
        note: `${weak.join(', ')} 비중이 낮음 — 다음 세션에 보완 권장`,
      };
    }
  }

  return {
    majors: [...majorSet],
    today: { dateKey: todayKey, ...todaySum },
    previous,
    deltas,
    imbalance,
  };
}

// ================================================================
// Max-mode Boost Suggester
//   "직전·직직전 같은 부위 세션을 보고, 부족한 subPattern을 보강하는
//    바벨/덤벨 위주 종목을 제안한다. 강제 X — 후보 목록만."
//   입력은 buildMuscleComparison() 결과 + MOVEMENTS 카탈로그 + 사용자
//   exList(이미 등록된 종목 매핑) + takenExerciseIds(오늘 이미 추가됨).
// ================================================================

/**
 * Max 모드 보강 추천. 순수 함수 — DOM/Firebase 접근 X.
 * @param {Object} args
 * @param {Object} args.comparison - buildMuscleComparison() 결과
 * @param {Array}  args.exList     - 사용자 등록 종목 [{id, movementId, name, ...}]
 * @param {Array}  args.movements  - MOVEMENTS 카탈로그
 * @param {Array}  [args.preferredCategories=['barbell','dumbbell']] - 가산 카테고리
 * @param {Array}  [args.takenExerciseIds=[]] - 오늘 이미 추가된 exerciseId 목록
 * @param {Number} [args.limit=3]  - 전체 반환 동작 수 상한
 * @returns {Array<{subPattern, subPatternLabel, exercises: Array}>}
 *   exercises[i]: { movementId, nameKo, equipment_category, sizeClass, primary, isPreferred, exerciseId|null, score }
 *   subPattern마다 상위 2개씩 골라 카테고리 다양성 확보.
 */
export function suggestMaxBoosts({
  comparison,
  exList = [],
  movements = [],
  preferredCategories = ['barbell', 'dumbbell'],
  takenExerciseIds = [],
  limit = 3,
} = {}) {
  const weakSubs = comparison?.imbalance?.weakSubPatterns;
  if (!Array.isArray(weakSubs) || weakSubs.length === 0) return [];

  const preferredSet = new Set(preferredCategories || []);
  const takenSet = new Set(takenExerciseIds || []);

  // exList 매핑: movementId -> exerciseId (사용자가 이미 등록한 종목 우대)
  const movToExId = new Map();
  for (const e of exList) {
    if (e?.movementId) movToExId.set(e.movementId, e.id);
  }

  // takenSet -> takenMovIds 역매핑 (오늘 이미 추가된 movementId 추적)
  const takenMovIds = new Set();
  for (const e of exList) {
    if (e?.id && takenSet.has(e.id) && e.movementId) takenMovIds.add(e.movementId);
  }

  const subLabel = (sp) => ({
    chest_all:'가슴 전체', chest_upper:'가슴 상부', chest_mid:'가슴 중부', chest_lower:'가슴 하부',
    back_all:'등 전체', back_width:'등 넓이', back_thickness:'등 두께', posterior:'후면사슬',
    shoulder_front:'어깨 전면', shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
    traps:'승모', quad:'대퇴사두', hamstring:'햄스트링', glute:'둔근', calf:'종아리',
    bicep:'이두', tricep:'삼두', core:'코어',
  }[sp] || sp);

  const result = [];
  let totalPicked = 0;

  for (const sp of weakSubs) {
    // 후보: subPattern == sp 인 모든 MOVEMENTS
    const candidates = movements
      .filter(m => m.subPattern === sp)
      .map(m => {
        let score = 0;
        const isPreferred = preferredSet.has(m.equipment_category);
        if (isPreferred) score += 5;                          // 바벨/덤벨 가산
        if (movToExId.has(m.id)) score += 3;                  // 사용자 등록 종목 +3
        if (takenMovIds.has(m.id)) score -= 100;              // 오늘 이미 추가됨 → 사실상 제외
        if (m.sizeClass === 'large') score += 1;              // 복합관절 미세 가산
        return {
          movementId: m.id,
          nameKo: m.nameKo,
          equipment_category: m.equipment_category,
          sizeClass: m.sizeClass,
          primary: m.primary,
          isPreferred,
          exerciseId: movToExId.get(m.id) || null,
          score,
        };
      })
      .filter(c => c.score > -50);  // taken 항목 제외

    if (candidates.length === 0) continue;

    // 정렬: score 내림차순 → 카테고리 다양성 적용
    candidates.sort((a, b) => b.score - a.score);

    // 카테고리 다양성: 동일 카테고리 2개째부터 -2 패널티
    const catCount = {};
    const ranked = candidates.map(c => {
      const used = catCount[c.equipment_category] || 0;
      catCount[c.equipment_category] = used + 1;
      const adjusted = used >= 1 ? c.score - 2 : c.score;
      return { ...c, score: adjusted };
    });
    ranked.sort((a, b) => b.score - a.score);

    // subPattern당 상위 2개
    const picked = ranked.slice(0, 2);
    if (picked.length === 0) continue;

    result.push({
      subPattern: sp,
      subPatternLabel: subLabel(sp),
      exercises: picked,
    });
    totalPicked += picked.length;
  }

  // limit 적용 — 마지막 group에서 초과분 잘라냄
  if (totalPicked > limit) {
    const fair = [];
    let remaining = Math.max(0, limit);
    for (const group of result) {
      if (remaining <= 0) break;
      fair.push({ ...group, exercises: group.exercises.slice(0, 1) });
      remaining -= 1;
    }
    let cursor = 0;
    while (remaining > 0 && fair.some((g, i) => g.exercises.length < (result[i]?.exercises.length || 0))) {
      const source = result[cursor];
      const target = fair[cursor];
      if (target && source && target.exercises.length < source.exercises.length) {
        target.exercises.push(source.exercises[target.exercises.length]);
        remaining -= 1;
      }
      cursor = (cursor + 1) % fair.length;
    }
    result.length = 0;
    result.push(...fair.filter(g => g.exercises.length));
  }

  return result;
}

function _workSetsOnly(sets = []) {
  return (sets || []).filter(_isWorkSet);
}

function _setE1RM(set) {
  const kg = Number(set?.kg) || 0;
  const reps = Number(set?.reps) || 0;
  const rpe = Number(set?.rpe) || 0;
  if (kg <= 0 || reps <= 0) return 0;
  if (rpe >= 6) {
    const pct = rpeRepsToPct(rpe, reps);
    return pct > 0 ? kg / pct : estimate1RM(kg, reps);
  }
  return estimate1RM(kg, reps);
}

function _bestRecentSet(sets = []) {
  return _workSetsOnly(sets)
    .map(s => ({ ...s, e1rm: _setE1RM(s) }))
    .filter(s => s.e1rm > 0)
    .sort((a, b) => b.e1rm - a.e1rm)[0] || null;
}

function _defaultMaxPrescription(movement, sessionType = 'high_volume', weakTarget = false) {
  const isHeavy = sessionType === 'heavy_volume';
  const isCore = movement?.subPattern === 'core' || movement?.primary === 'abs';
  const isLarge = movement?.sizeClass === 'large';
  if (isCore) {
    return { targetSets: weakTarget ? 5 : 4, repsLow: 10, repsHigh: 15, targetRpe: isHeavy ? 9 : 8, action: weakTarget ? 'volume' : 'hold' };
  }
  if (isHeavy) {
    return isLarge
      ? { targetSets: weakTarget ? 5 : 4, repsLow: 6, repsHigh: 10, targetRpe: 9, action: 'load' }
      : { targetSets: weakTarget ? 5 : 4, repsLow: 8, repsHigh: 12, targetRpe: 9, action: 'load' };
  }
  return isLarge
    ? { targetSets: weakTarget ? 5 : 4, repsLow: 8, repsHigh: 12, targetRpe: 8, action: weakTarget ? 'volume' : 'hold' }
    : { targetSets: weakTarget ? 5 : 4, repsLow: 12, repsHigh: 18, targetRpe: 8, action: 'volume' };
}

function _movementExerciseIds(exList = [], movementId) {
  return (exList || []).filter(e => e?.movementId === movementId).map(e => e.id).filter(Boolean);
}

function _findMovementSessions(cache, exList, movementId, beforeKey = null) {
  const ids = new Set(_movementExerciseIds(exList, movementId));
  if (!ids.size) return [];
  return Object.entries(cache || {})
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!beforeKey || key !== beforeKey))
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([dateKey, day]) => (day?.exercises || [])
      .filter(e => ids.has(e.exerciseId))
      .map(entry => ({ dateKey, entry })));
}

export function recommendMaxProgressionAction({
  lastSet,
  prescription,
  sessionType = 'high_volume',
  stepKg = 2.5,
} = {}) {
  const reps = Number(lastSet?.reps) || 0;
  const rpe = Number(lastSet?.rpe) || 0;
  const repsLow = Number(prescription?.repsLow) || 8;
  const repsHigh = Number(prescription?.repsHigh) || 12;
  const safeStep = Number(stepKg) > 0 ? Number(stepKg) : 2.5;
  if (reps <= 0) {
    return { action: prescription?.action || 'hold', deltaKg: 0, reason: '이전 유효 세트가 부족해 기본 처방으로 시작합니다.' };
  }
  if (reps >= repsHigh + 3 && (!rpe || rpe <= 8)) {
    return { action: 'load', deltaKg: safeStep, reason: `상한보다 ${reps - repsHigh}회 더 가능해 다음 세트는 증량 후보입니다.` };
  }
  if (reps < Math.max(1, repsLow - 2) || rpe >= 9.5) {
    return { action: 'hold', deltaKg: 0, reason: '목표 반복 하한보다 낮아 오늘은 무게를 고정하고 품질을 맞춥니다.' };
  }
  if (sessionType === 'heavy_volume' && reps >= repsHigh) {
    return { action: 'load', deltaKg: safeStep, reason: '중상볼륨 Day에서 목표 상한을 채워 소폭 증량이 적절합니다.' };
  }
  if (sessionType === 'high_volume' && reps >= repsHigh) {
    return { action: 'volume', deltaKg: 0, reason: '고볼륨 Day에서는 같은 무게로 유효 세트 누적을 우선합니다.' };
  }
  return { action: prescription?.action || 'hold', deltaKg: 0, reason: '목표 반복 범위 안이므로 오늘 처방을 그대로 진행합니다.' };
}

export function buildMaxPrescription({
  cache = {},
  exList = [],
  movement = null,
  exerciseId = null,
  todayKey = null,
  sessionType = 'high_volume',
  weakTarget = false,
} = {}) {
  if (!movement?.id) return null;
  const base = _defaultMaxPrescription(movement, sessionType, weakTarget);
  const stepKg = Number(movement.stepKg) > 0 ? Number(movement.stepKg) : 2.5;
  const sessions = exerciseId
    ? (() => {
        const last = getLastSession(cache, exerciseId, todayKey);
        return last ? [{ dateKey: last.date, entry: { sets: last.sets || [] } }] : [];
      })()
    : _findMovementSessions(cache, exList, movement.id, todayKey);
  const bestSession = sessions.find(s => _bestRecentSet(s.entry?.sets));
  const lastSet = bestSession ? _bestRecentSet(bestSession.entry?.sets) : null;
  const targetReps = sessionType === 'heavy_volume' ? base.repsLow : base.repsHigh;
  const e1rm = lastSet ? _setE1RM(lastSet) : 0;
  const rawTarget = e1rm > 0 ? targetWeightKg(e1rm, base.targetRpe, targetReps) : 0;
  const startKg = rawTarget > 0 ? roundToIncrement(rawTarget, stepKg) : 0;
  const progression = recommendMaxProgressionAction({ lastSet, prescription: base, sessionType, stepKg });
  const kgForSets = progression.action === 'load' && startKg > 0
    ? roundToIncrement(startKg + progression.deltaKg, stepKg)
    : startKg;
  const repsForSets = sessionType === 'heavy_volume' ? base.repsLow : base.repsHigh;
  const sets = Array.from({ length: base.targetSets }, () => ({
    kg: kgForSets || 0,
    reps: repsForSets,
    setType: 'main',
    done: false,
    rpe: base.targetRpe,
  }));
  const actionLabel = progression.action === 'load' ? '증량' : (progression.action === 'volume' ? '볼륨' : '유지');
  return {
    label: `${base.targetSets}세트 x ${base.repsLow}-${base.repsHigh}회 · RPE ${base.targetRpe}`,
    targetSets: base.targetSets,
    repsLow: base.repsLow,
    repsHigh: base.repsHigh,
    targetRpe: base.targetRpe,
    startKg: kgForSets || 0,
    action: progression.action,
    actionLabel,
    deltaKg: progression.deltaKg,
    reason: progression.reason,
    lastDateKey: bestSession?.dateKey || null,
    lastSet: lastSet ? { kg: Number(lastSet.kg) || 0, reps: Number(lastSet.reps) || 0, rpe: Number(lastSet.rpe) || null } : null,
    weakTarget: !!weakTarget,
    sets,
  };
}

export function detectMaxFixedMovements({
  cache = {},
  exList = [],
  movements = [],
  todayKey = null,
  majors = [],
  lookbackSessions = 4,
  minHits = 2,
} = {}) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (!majorSet.size) return [];
  const keys = findRecentSameMuscleSessions(cache, exList, movements, todayKey, majorSet, lookbackSessions);
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const counts = new Map();
  for (const key of keys) {
    const seen = new Set();
    for (const entry of cache?.[key]?.exercises || []) {
      const ex = exById.get(entry.exerciseId);
      const movId = entry.movementId || ex?.movementId;
      const mov = movById.get(movId);
      if (!mov || !majorSet.has(mov.primary)) continue;
      if (_workSetsOnly(entry.sets).length === 0) continue;
      seen.add(mov.id);
    }
    for (const movId of seen) counts.set(movId, (counts.get(movId) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minHits)
    .map(([movementId, count]) => ({ ...movById.get(movementId), movementId, count, lookback: keys.length }))
    .filter(x => x.id)
    .sort((a, b) => b.count - a.count || (a.nameKo || '').localeCompare(b.nameKo || ''));
}

// ════════════════════════════════════════════════════════════════
// 테스트모드 v2 — 6주 듀얼 트랙 성장판 순수 함수
// ════════════════════════════════════════════════════════════════

function _dateFromKeyForCycle(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function _keyFromDateForCycle(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _roundCycleKg(kg, step = 2.5) {
  const k = Number(kg) || 0;
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.round((Math.round(k / s) * s) * 10) / 10;
}

export function getMaxCycleWeekIndex(cycle, todayKey) {
  const start = _dateFromKeyForCycle(cycle?.startDate);
  const today = _dateFromKeyForCycle(todayKey);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  if (!start || !today) return 1;
  const diff = Math.floor((today - start) / 604800000);
  return Math.max(1, Math.min(weeks, diff + 1));
}

export function getMaxCycleTrack(cycle, todayKey) {
  const week = getMaxCycleWeekIndex(cycle, todayKey);
  const forced = cycle?.todayTrack;
  if (forced === 'M' || forced === 'H') return forced;
  return week % 2 === 0 ? 'H' : 'M';
}

export function predictBenchmarkProgression(benchmark, cycle, todayKey) {
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const week = getMaxCycleWeekIndex(cycle, todayKey);
  const startKg = Number(benchmark?.startKg) || 0;
  const targetKg = Number(benchmark?.targetKg) || startKg;
  const step = Number(benchmark?.incrementKg) > 0 ? Number(benchmark.incrementKg) : 2.5;
  const perWeek = weeks > 1 ? (targetKg - startKg) / (weeks - 1) : 0;
  const plannedKg = _roundCycleKg(startKg + perWeek * (week - 1), step);
  return {
    week,
    weeks,
    startKg,
    targetKg: _roundCycleKg(targetKg, step),
    plannedKg,
    deltaKg: Math.round((plannedKg - startKg) * 10) / 10,
    remainingKg: Math.round((targetKg - plannedKg) * 10) / 10,
    percent: targetKg > startKg ? Math.max(0, Math.min(100, Math.round(((plannedKg - startKg) / (targetKg - startKg)) * 100))) : 100,
  };
}

export function buildMaxCycleSchedule(cycle) {
  const start = _dateFromKeyForCycle(cycle?.startDate);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const benchmarks = Array.isArray(cycle?.benchmarks) ? cycle.benchmarks : [];
  if (!start || benchmarks.length === 0) return [];
  const rows = [];
  for (let w = 1; w <= weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + (w - 1) * 7);
    const key = _keyFromDateForCycle(d);
    const rowCycle = { ...cycle, weeks, startDate: cycle.startDate };
    rows.push({
      week: w,
      dateKey: key,
      track: w % 2 === 0 ? 'H' : 'M',
      cells: benchmarks.map(b => ({
        benchmarkId: b.id,
        movementId: b.movementId,
        label: b.label,
        major: b.primaryMajor,
        track: w % 2 === 0 ? 'H' : 'M',
        planned: predictBenchmarkProgression(b, rowCycle, key),
      })),
    });
  }
  return rows;
}

export function findBenchmarkActuals(cache = {}, exList = [], movementId, todayKey = null) {
  const ids = new Set((exList || []).filter(e => e?.movementId === movementId).map(e => e.id));
  const points = [];
  for (const [date, day] of Object.entries(cache || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (todayKey && date > todayKey) continue;
    for (const entry of day?.exercises || []) {
      const entryMovementId = entry.movementId || (ids.has(entry.exerciseId) ? movementId : null);
      if (entryMovementId !== movementId && !ids.has(entry.exerciseId)) continue;
      let best = null;
      for (const set of entry.sets || []) {
        if (set?.setType === 'warmup') continue;
        if (!set?.done && set?.done !== undefined) continue;
        const kg = Number(set?.kg) || 0;
        const reps = Number(set?.reps) || 0;
        if (kg <= 0 || reps <= 0) continue;
        const e1rm = estimate1RM(kg, reps);
        if (!best || e1rm > best.e1rm) best = { kg, reps, e1rm: Math.round(e1rm * 10) / 10 };
      }
      if (best) points.push({ dateKey: date, ...best });
    }
  }
  return points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildMaxCycleSnapshot({
  cycle = null,
  cache = {},
  exList = [],
  todayKey = null,
} = {}) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return null;
  const weekIndex = getMaxCycleWeekIndex(cycle, todayKey);
  const track = getMaxCycleTrack(cycle, todayKey);
  const weeks = Math.max(1, Number(cycle.weeks) || 6);
  const schedule = buildMaxCycleSchedule(cycle);
  const benchmarks = cycle.benchmarks.map(b => {
    const planned = predictBenchmarkProgression(b, cycle, todayKey);
    const actuals = findBenchmarkActuals(cache, exList, b.movementId, todayKey);
    const latest = actuals[actuals.length - 1] || null;
    const delta = latest ? Math.round((latest.kg - planned.plannedKg) * 10) / 10 : null;
    return {
      ...b,
      planned,
      actuals,
      latest,
      delta,
      onPlan: delta === null ? null : delta >= 0,
    };
  });
  const completed = benchmarks.filter(b => b.latest && b.latest.kg >= b.planned.plannedKg).length;
  return {
    id: cycle.id,
    status: cycle.status || 'active',
    framework: cycle.framework || 'dual_track_progression_v2',
    startDate: cycle.startDate,
    weeks,
    weekIndex,
    progressPct: Math.round((weekIndex / weeks) * 100),
    track,
    benchmarks,
    schedule,
    completed,
    total: benchmarks.length,
  };
}

export function detectPlateau(points = [], { weeks = 2 } = {}) {
  const recent = (points || []).slice(-Math.max(2, weeks));
  if (recent.length < Math.max(2, weeks)) return { plateau: false, reason: '데이터 부족' };
  const best = Math.max(...recent.map(p => Number(p.e1rm) || 0));
  const first = Number(recent[0]?.e1rm) || 0;
  const last = Number(recent[recent.length - 1]?.e1rm) || 0;
  const plateau = best > 0 && last <= first * 1.005;
  return {
    plateau,
    reason: plateau ? `${recent.length}회 기록에서 e1RM 증가가 거의 없습니다.` : '최근 e1RM은 유지 또는 상승 중입니다.',
    first,
    last,
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
  if (Array.isArray(d.exercises)) {
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
  if (d.cf) {
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
  const protG = (day.bProtein||0) + (day.lProtein||0) + (day.dProtein||0) + (day.sProtein||0);
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

  const actualKcal = (day.bKcal||0) + (day.lKcal||0) + (day.dKcal||0) + (day.sKcal||0);
  const hasAnyLog = actualKcal > 0
    || (Array.isArray(day.exercises) && day.exercises.length > 0)
    || day.cf || day.running || day.swimming;

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

const _NUTRITION_FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];

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
  for (const f of _NUTRITION_FIELDS) {
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

