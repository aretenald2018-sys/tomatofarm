// ================================================================
// workout/w863-original.js — 8/6/3 원본 7주 레퍼런스/스케일링 엔진
// DOM/Firebase 접근 금지. Max V4와 Growth v2가 함께 사용한다.
// ================================================================

export const W863_ORIGINAL_VERSION = 'w863-original-v1';

const _set = (kg, reps, role, extra = {}) => ({ kg, reps, role, ...extra });
const _amrap = (kg, reps) => _set(kg, reps, 'main', { amrap: true });
const _single = kg => _set(kg, 1, 'heavy_single');
const _backoff = (kg, reps) => Array.from({ length: 5 }, () => _set(kg, reps, 'backoff'));
const _week = (warmup, main, singles, backoff) => [
  ...warmup.map(([kg, reps]) => _set(kg, reps, 'warmup')),
  ...main,
  ...singles.map(_single),
  ...backoff,
];
const _deload = rows => rows.map(([kg, reps]) => _set(kg, reps, 'deload'));

const SQUAT_WARMUP = [[40, 5], [50, 5], [60, 3]];
const OHP_WARMUP = [[20, 5], [25, 5], [30, 3]];
const DEADLIFT_WARMUP = [[45, 5], [55, 5], [65, 3]];
const BENCH_WARMUP = [[35, 5], [45, 5], [50, 3]];

export const W863_ORIGINAL_PROFILES = Object.freeze({
  squat: {
    id: 'squat', label: '스쿼트', reference1RmKg: 110, defaultIncrementKg: 5,
    weeks: [
      _week(SQUAT_WARMUP, [_set(65, 8, 'main'), _set(75, 8, 'main'), _amrap(80, 8)], [85, 95, 100], _backoff(75, 4)),
      _week(SQUAT_WARMUP, [_set(70, 6, 'main'), _set(80, 6, 'main'), _amrap(85, 6)], [90, 100, 105], _backoff(80, 4)),
      _week(SQUAT_WARMUP, [_set(75, 8, 'main'), _set(85, 6, 'main'), _amrap(90, 3)], [95, 105, 110], _backoff(85, 4)),
      _week(SQUAT_WARMUP, [_set(65, 8, 'main'), _set(75, 8, 'main'), _amrap(80, 8)], [90, 95, 120], _backoff(75, 4)),
      _week(SQUAT_WARMUP, [_set(70, 6, 'main'), _set(80, 6, 'main'), _amrap(85, 6)], [95, 100, 110], _backoff(80, 4)),
      _week(SQUAT_WARMUP, [_set(75, 8, 'main'), _set(85, 6, 'main'), _amrap(90, 3)], [100, 105, 115], _backoff(85, 4)),
      _deload([[45, 5], [55, 5], [65, 5]]),
    ],
  },
  ohp: {
    id: 'ohp', label: 'OHP', reference1RmKg: 55, defaultIncrementKg: 2.5,
    weeks: [
      _week(OHP_WARMUP, [_set(30, 8, 'main'), _set(35, 8, 'main'), _amrap(40, 8)], [45, 45, 50], _backoff(35, 8)),
      _week(OHP_WARMUP, [_set(35, 6, 'main'), _set(40, 6, 'main'), _amrap(40, 6)], [45, 50, 55], _backoff(40, 8)),
      _week(OHP_WARMUP, [_set(35, 8, 'main'), _set(40, 6, 'main'), _amrap(45, 3)], [50, 50, 55], _backoff(40, 8)),
      _week(OHP_WARMUP, [_set(30, 8, 'main'), _set(40, 6, 'main'), _amrap(40, 8)], [45, 50, 60], _backoff(40, 8)),
      _week(OHP_WARMUP, [_set(35, 6, 'main'), _set(40, 6, 'main'), _amrap(45, 6)], [45, 50, 55], _backoff(40, 8)),
      _week(OHP_WARMUP, [_set(40, 8, 'main'), _set(45, 6, 'main'), _amrap(45, 3)], [50, 55, 55], _backoff(45, 8)),
      _deload([[20, 5], [30, 5], [35, 5]]),
    ],
  },
  deadlift: {
    id: 'deadlift', label: '데드리프트', reference1RmKg: 120, defaultIncrementKg: 5,
    weeks: [
      _week(DEADLIFT_WARMUP, [_set(70, 8, 'main'), _set(80, 8, 'main'), _amrap(85, 8)], [95, 100, 110], _backoff(80, 4)),
      _week(DEADLIFT_WARMUP, [_set(75, 6, 'main'), _set(85, 6, 'main'), _amrap(90, 6)], [100, 110, 115], _backoff(85, 4)),
      _week(DEADLIFT_WARMUP, [_set(80, 8, 'main'), _set(90, 6, 'main'), _amrap(95, 3)], [105, 115, 120], _backoff(90, 4)),
      _week(DEADLIFT_WARMUP, [_set(70, 8, 'main'), _set(85, 6, 'main'), _amrap(90, 8)], [95, 105, 130], _backoff(85, 4)),
      _week(DEADLIFT_WARMUP, [_set(75, 6, 'main'), _set(90, 6, 'main'), _amrap(95, 6)], [100, 110, 120], _backoff(90, 4)),
      _week(DEADLIFT_WARMUP, [_set(85, 8, 'main'), _set(95, 6, 'main'), _amrap(100, 3)], [105, 115, 125], _backoff(95, 4)),
      _deload([[50, 5], [60, 5], [70, 5]]),
    ],
  },
  bench: {
    id: 'bench', label: '벤치프레스', reference1RmKg: 95, defaultIncrementKg: 2.5,
    weeks: [
      _week(BENCH_WARMUP, [_set(55, 8, 'main'), _set(65, 8, 'main'), _amrap(70, 8)], [75, 80, 85], _backoff(65, 8)),
      _week(BENCH_WARMUP, [_set(60, 6, 'main'), _set(70, 6, 'main'), _amrap(70, 6)], [80, 85, 90], _backoff(70, 8)),
      _week(BENCH_WARMUP, [_set(65, 8, 'main'), _set(70, 6, 'main'), _amrap(75, 3)], [85, 90, 95], _backoff(70, 8)),
      _week([[25, 5], [45, 5], [50, 3]], [_set(55, 8, 'main'), _set(65, 6, 'main'), _amrap(70, 8)], [75, 85, 105], _backoff(65, 8)),
      _week(BENCH_WARMUP, [_set(60, 6, 'main'), _set(70, 6, 'main'), _amrap(75, 6)], [80, 85, 95], _backoff(70, 8)),
      _week(BENCH_WARMUP, [_set(65, 8, 'main'), _set(75, 6, 'main'), _amrap(80, 3)], [85, 90, 100], _backoff(75, 8)),
      _deload([[35, 5], [45, 5], [50, 3]]),
    ],
  },
});

export const W863_ORIGINAL_PROFILE_IDS = Object.freeze(Object.keys(W863_ORIGINAL_PROFILES));

const _round1 = value => Math.round((Number(value) || 0) * 10) / 10;

export function roundW863Weight(kg, step = 5) {
  const s = Number(step) > 0 ? Number(step) : 5;
  return _round1(Math.round((Number(kg) || 0) / s) * s);
}

export function inferW863Profile(context = {}) {
  if (W863_ORIGINAL_PROFILES[context.profileId]) return context.profileId;
  const raw = [context.movementId, context.exerciseId, context.label, context.name]
    .filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
  if (/ohp|overhead|over_head|오버헤드|밀리터리|숄더프레스/.test(raw)) return 'ohp';
  if (/bench|벤치/.test(raw)) return 'bench';
  if (/dead|sumo|데드|스모/.test(raw)) return 'deadlift';
  if (/squat|스쿼트/.test(raw)) return 'squat';
  if (context.primaryMajor === 'chest') return 'bench';
  if (context.primaryMajor === 'shoulder') return 'ohp';
  if (context.primaryMajor === 'back') return 'deadlift';
  return 'squat';
}

export function normalizeW863OriginalConfig(wendler = {}, context = {}) {
  const profileId = inferW863Profile({ ...context, profileId: wendler.profileId });
  const profile = W863_ORIGINAL_PROFILES[profileId];
  const roundKg = Number(wendler.roundKg) > 0 ? Number(wendler.roundKg) : 5;
  const tmFallback = Number(wendler.tmKg) > 0 ? Number(wendler.tmKg) / 0.9 : 0;
  const oneRmKg = _round1(Number(wendler.oneRmKg) > 0
    ? Number(wendler.oneRmKg)
    : (tmFallback > 0 ? tmFallback : profile.reference1RmKg));
  const incrementKg = Number(wendler.incrementKg) > 0
    ? Number(wendler.incrementKg)
    : profile.defaultIncrementKg;
  const cycleNo = Math.max(1, Math.min(99, Math.round(Number(wendler.cycleNo) || 1)));
  const startWeek = Math.max(1, Math.min(7, Math.round(Number(wendler.startWeek) || 1)));
  return {
    ...wendler,
    scheme: 'w863',
    templateVersion: W863_ORIGINAL_VERSION,
    profileId,
    oneRmKg,
    tmKg: _round1(oneRmKg * 0.9),
    incrementKg,
    roundKg,
    cycleNo,
    startWeek,
    weeks: 7,
    // 야들러 원본의 마무리 볼륨 선택지. SSL(본세트2 무게)이 기존 표 그대로의 기본값,
    // FSL(본세트1 무게)은 한 단계 약한 버전이다. 반복수(하체 4회/상체 8회)는 공통.
    backoffMode: wendler.backoffMode === 'fsl' ? 'fsl' : 'ssl',
    supplemental: { kind: 'none', pct: 50, sets: 5, reps: 10, timing: 'after-main' },
  };
}

function _scaledSet(profile, cfg, source, order) {
  const kg = roundW863Weight(source.kg * cfg.oneRmKg / profile.reference1RmKg, cfg.roundKg);
  const prescribedPct = _round1(source.kg / profile.reference1RmKg * 100);
  const isPrAttempt = source.role === 'heavy_single' && source.kg > profile.reference1RmKg;
  return {
    ...source,
    kg,
    referenceKg: source.kg,
    pct: prescribedPct,
    prescribedPct,
    order,
    role: isPrAttempt ? 'pr_attempt' : source.role,
    ...(isPrAttempt ? { optional: true, requiresConfirmation: true } : {}),
  };
}

export function w863OriginalWeekPrescription(wendler = {}, weekIndex = 1, context = {}) {
  const cfg = normalizeW863OriginalConfig(wendler, context);
  const profile = W863_ORIGINAL_PROFILES[cfg.profileId];
  const week = Math.max(1, Math.min(7, Math.round(Number(weekIndex) || 1)));
  const scaled = profile.weeks[week - 1].map((set, idx) => _scaledSet(profile, cfg, set, idx));
  const byRole = role => scaled.filter(set => set.role === role);
  const warmupSets = byRole('warmup');
  const mainSets = byRole('main');
  const heavySingles = byRole('heavy_single');
  const optionalSets = byRole('pr_attempt');
  // 원본 표의 백오프는 본세트2 무게(SSL). FSL을 고르면 본세트1 무게로 낮춘다.
  const backoffSource = cfg.backoffMode === 'fsl' ? mainSets[0] : (mainSets[1] || mainSets[0]);
  const backoff = byRole('backoff').map(set => ({
    ...set,
    ...(backoffSource ? {
      kg: backoffSource.kg,
      referenceKg: backoffSource.referenceKg,
      pct: backoffSource.pct,
      prescribedPct: backoffSource.prescribedPct,
    } : {}),
    supplementalKind: cfg.backoffMode,
  }));
  const deload = byRole('deload');
  const topSet = mainSets.at(-1) || deload.at(-1) || null;
  return {
    week,
    boardWeek: week,
    weeks: 7,
    templateVersion: W863_ORIGINAL_VERSION,
    profileId: cfg.profileId,
    profileLabel: profile.label,
    oneRmKg: cfg.oneRmKg,
    tmKg: cfg.tmKg,
    roundKg: cfg.roundKg,
    backoffMode: cfg.backoffMode,
    warmup: { enabled: warmupSets.length > 0, sets: warmupSets },
    sets: mainSets,
    heavySingles,
    optionalSets,
    backoff,
    deload,
    topSet,
    supplemental: null,
    requiredSets: [...warmupSets, ...mainSets, ...heavySingles, ...backoff, ...deload],
  };
}

export function w863OriginalCycleOverview(wendler = {}, context = {}) {
  return Array.from({ length: 7 }, (_, idx) => {
    const rx = w863OriginalWeekPrescription(wendler, idx + 1, context);
    const focus = rx.sets.length ? rx.sets : rx.deload;
    return {
      week: idx + 1,
      sets: focus,
      topSet: rx.topSet,
      pctLabel: focus.map(set => Number.isInteger(set.pct) ? set.pct : set.pct.toFixed(1)).join('·'),
      repsLabel: focus.map(set => `${set.reps}${set.amrap ? '+' : ''}`).join('/'),
      optionalSets: rx.optionalSets,
      deload: idx === 6,
    };
  });
}
