// ================================================================
// calc.js — 순수 비즈니스 로직 (사이드이펙트 없음, 테스트 가능)
// ================================================================

const DEFAULT_DIET_PLAN = {
  height: 175, weight: 75, bodyFatPct: 17, age: 32,
  targetWeight: 68, targetBodyFatPct: 8,
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,
  refeedDays: [0, 6],
  startDate: null,
};

/**
 * 다이어트 플랜 기반 메트릭스 계산 (BMR, TDEE, 데피싯/리피드 칼로리 등)
 */
export function calcDietMetrics(plan) {
  const p = { ...DEFAULT_DIET_PLAN, ...plan };
  const bmr      = Math.round(13.7 * p.weight + 5 * p.height - 6.8 * p.age + 66);
  const tdeeCalc = Math.round(bmr * p.activityFactor);
  const tdee     = Math.ceil(tdeeCalc / 100) * 100;
  const lbm      = p.weight - (p.weight * p.bodyFatPct / 100);
  const fatMass  = p.weight * p.bodyFatPct / 100;
  const fatToLose = (p.weight * (p.bodyFatPct - p.targetBodyFatPct)) / 100;
  const totalWeightLoss = fatToLose / 0.713;
  const weeklyLossKg = p.weight * p.lossRatePerWeek;
  const calPerKgPerDay = 7700 / 7 / p.activityFactor;
  const dailyDeficit = weeklyLossKg * calPerKgPerDay;
  const dailyIntake  = tdee - dailyDeficit;
  const weeksNeeded  = totalWeightLoss / weeklyLossKg;
  const weeklyKcal   = Math.round(dailyIntake * 7);
  const refeedTotal  = p.refeedKcal;
  const deficitDayKcal = Math.round((weeklyKcal - refeedTotal) / 5);
  const refeedDayKcal  = Math.round(refeedTotal / 2);
  // 탄단지 — 데피싯 데이
  const dProteinKcal = Math.round(deficitDayKcal * 0.41);
  const dCarbKcal    = Math.round(deficitDayKcal * 0.50);
  const dFatKcal     = Math.round(deficitDayKcal * 0.09);
  // 탄단지 — 리피드 데이
  const rProteinKcal = Math.round(refeedDayKcal * 0.29);
  const rCarbKcal    = Math.round(refeedDayKcal * 0.60);
  const rFatKcal     = Math.round(refeedDayKcal * 0.11);
  return {
    bmr, tdee, lbm, fatMass, fatToLose, totalWeightLoss,
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
 * 해당 날짜의 목표 칼로리 산출
 * @param {object} plan - 다이어트 플랜
 * @param {number} y - 연도
 * @param {number} m - 월 (0-indexed)
 * @param {number} d - 일
 * @returns {number} 목표 칼로리
 */
export function getDayTargetKcal(plan, y, m, d) {
  const metrics = calcDietMetrics(plan);
  const dow = new Date(y, m, d).getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  return isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;
}

/**
 * 식단 성공 여부 판정 (단일 소스 — P0-2)
 * render-workout.js의 saveWorkoutDay와 data.js의 dietDayOk 양쪽에서 사용
 * @param {number} totalKcal - 실제 섭취 칼로리
 * @param {number} limitKcal - 목표 칼로리
 * @returns {boolean}
 */
export function isDietDaySuccess(totalKcal, limitKcal) {
  return (totalKcal > 0) && (totalKcal <= limitKcal + 50);
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

  const limitKcal = getDayTargetKcal(plan, y, m, d);
  const totalKcal = (dt.bKcal || 0) + (dt.lKcal || 0) + (dt.dKcal || 0) + (dt.sKcal || 0);

  const bSkip = !!r.breakfast_skipped;
  const lSkip = !!r.lunch_skipped;
  const dSkip = !!r.dinner_skipped;

  const hasRecord = dt.breakfast || dt.lunch || dt.dinner ||
                    (dt.bFoods?.length > 0) || (dt.lFoods?.length > 0) ||
                    (dt.dFoods?.length > 0) || (dt.sFoods?.length > 0);

  if (!hasRecord && !bSkip && !lSkip && !dSkip) return null;

  const calorieSuccess = isDietDaySuccess(totalKcal, limitKcal);

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
  const getMuscles = (y, m, d) => [...new Set((getDay(y, m, d).exercises || []).map(e => e.muscleId))];
  const getCF = (y, m, d) => !!getDay(y, m, d).cf;

  // 운동 스트릭
  let cur = new Date(today);
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!getMuscles(y, m, d).length && !getCF(y, m, d)) break;
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
