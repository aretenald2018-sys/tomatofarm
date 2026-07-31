// ================================================================
// workout/wear-strength-context.js — 폰→워치 헬스 카탈로그+지난기록 컨텍스트
//   워치는 Firebase가 없으므로, 전체 종목 카탈로그(부위별 그룹)와 종목별 지난
//   기록을 폰이 미리 계산해 고정 DataItem(/tomato/workout/strength/context)으로
//   내려보낸다. buildWearStrengthContext 는 의존성 주입된 순수 빌더.
//
//   `program`(종목에 등록된 웬들러/트랙 처방)도 여기서 미리 계산해 실어 보낸다.
//   워치엔 성장보드(board-v2)도 TM 계산도 없으므로, 폰이 "이번 주에 수행할 세트"를
//   그대로 내려주지 않으면 워치는 빈 세트 한 줄밖에 만들 수 없다.
// ================================================================
const DEFAULT_STEP_KG = 2.5;
const MAX_LAST_SESSION_SETS = 12;
const MAX_PROGRAM_SETS = 24;

// 폰 세트 모델(workout/set-presentation.js VALID_WORKOUT_SET_TYPES)과 동일 집합.
const PROGRAM_SET_TYPES = new Set(['main', 'warmup', 'drop', 'failure']);
// 폰 카드의 wendlerRole(workout/set-presentation.js workoutSetTypeLabel)과 동일 집합.
const PROGRAM_ROLES = new Set([
  'warmup', 'main', 'supplemental', 'heavy_single', 'backoff', 'deload', 'pr_attempt',
]);

function _normalizeLastSessionSet(set = {}) {
  const romPct = Number(set?.romPct);
  const rir = Number(set?.rir);
  return {
    kg: Number(set?.kg) || 0,
    reps: Number(set?.reps) || 0,
    romPct: Number.isFinite(romPct) ? romPct : 100,
    rir: Number.isFinite(rir) ? Math.round(rir) : null,
    setType: set?.setType || 'main',
    done: set?.done === true,
  };
}

function _normalizeLastSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dateKey = String(raw.dateKey || '');
  if (!dateKey) return null;
  const sets = Array.isArray(raw.sets) ? raw.sets : [];
  return {
    dateKey,
    sets: sets.slice(0, MAX_LAST_SESSION_SETS).map(_normalizeLastSessionSet),
  };
}

// 폰 카드 세트 한 줄 → 워치가 그대로 체크리스트 행으로 깔 수 있는 최소 형태.
// rpe/rirTarget 는 의도적으로 버린다: 워치의 rir 은 "사용자가 실제로 남긴 값"이라
// 목표치를 미리 채우면 수행하지도 않은 RIR 이 기록으로 넘어간다.
function _normalizeProgramSet(set = {}) {
  const kg = Number(set?.kg);
  const reps = Number(set?.reps);
  if (!Number.isFinite(kg) || kg < 0) return null;
  if (!Number.isFinite(reps) || reps <= 0) return null;
  const romPct = Number(set?.romPct);
  const setType = String(set?.setType || '').trim();
  const role = String(set?.wendlerRole || '').trim();
  const normalized = {
    kg: Math.round(kg * 10) / 10,
    reps: Math.round(reps),
    romPct: Number.isFinite(romPct) ? Math.round(romPct) : 100,
    setType: PROGRAM_SET_TYPES.has(setType) ? setType : 'main',
    role: PROGRAM_ROLES.has(role) ? role : null,
    amrap: set?.amrap === true,
  };
  if (set?.supplementalKind) normalized.supplementalKind = String(set.supplementalKind);
  return normalized;
}

function _normalizeProgram(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sets = (Array.isArray(raw.sets) ? raw.sets : [])
    .slice(0, MAX_PROGRAM_SETS)
    .map(_normalizeProgramSet)
    .filter(Boolean);
  if (!sets.length) return null;
  return {
    kind: String(raw.kind || 'program'),
    label: String(raw.label || ''),
    shortLabel: String(raw.shortLabel || ''),
    weekLabel: String(raw.weekLabel || ''),
    sets,
  };
}

function _resolveStepKg(exercise, movements) {
  const movement = movements && typeof movements === 'object' ? movements[exercise?.movementId] : null;
  const movementStep = Number(movement?.stepKg);
  if (movementStep > 0) return movementStep;
  const incrementKg = Number(exercise?.incrementKg);
  if (incrementKg > 0) return incrementKg;
  return DEFAULT_STEP_KG;
}

// PURE / 의존성 주입 빌더 — data.js/Capacitor 의존 없음(node:test 로 직접 검증 가능).
export function buildWearStrengthContext(options = {}) {
  const {
    exercises = [],
    muscles = [],
    lastSessionFor = () => null,
    programFor = () => null,
    movements = {},
    recentLimit = 20,
    exerciseLimit = 300,
    now = Date.now(),
  } = options || {};

  const exList = Array.isArray(exercises) ? exercises : [];
  const byMuscle = new Map();
  for (const exercise of exList) {
    const muscleId = exercise?.muscleId;
    const exerciseId = exercise?.id;
    if (!muscleId || !exerciseId) continue;
    if (!byMuscle.has(muscleId)) byMuscle.set(muscleId, []);
    byMuscle.get(muscleId).push(exercise);
  }

  const catalog = [];
  const recentCandidates = [];
  let exerciseCount = 0;

  const muscleList = Array.isArray(muscles) ? muscles : [];
  for (const muscle of muscleList) {
    if (exerciseCount >= exerciseLimit) break;
    const muscleId = muscle?.id;
    if (!muscleId) continue;
    const list = byMuscle.get(muscleId) || [];
    if (!list.length) continue;

    const exerciseEntries = [];
    for (const exercise of list) {
      if (exerciseCount >= exerciseLimit) break;
      const exerciseId = exercise.id;
      const stepKg = _resolveStepKg(exercise, movements);
      const rawLastSession = typeof lastSessionFor === 'function' ? lastSessionFor(exerciseId) : null;
      const lastSession = _normalizeLastSession(rawLastSession);
      if (lastSession) recentCandidates.push({ exerciseId, dateKey: lastSession.dateKey });
      const program = _normalizeProgram(typeof programFor === 'function' ? programFor(exercise) : null);
      exerciseEntries.push({
        exerciseId,
        name: String(exercise?.name || ''),
        // 워치가 완료 페이로드에 그대로 되돌려 보내는 값. 빠뜨리면 워치→폰 엔트리의
        // muscleId 가 항상 null 이 되어 부위별 집계에서 빠진다.
        muscleId,
        movementId: exercise?.movementId || null,
        stepKg,
        lastSession,
        program,
      });
      exerciseCount += 1;
    }

    if (exerciseEntries.length) {
      catalog.push({
        muscleId,
        muscleName: String(muscle?.name || muscleId),
        exercises: exerciseEntries,
      });
    }
  }

  const seenRecent = new Set();
  const recentExerciseIds = recentCandidates
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .map(item => item.exerciseId)
    .filter(exerciseId => {
      if (seenRecent.has(exerciseId)) return false;
      seenRecent.add(exerciseId);
      return true;
    })
    .slice(0, recentLimit);

  return {
    payloadVersion: 1,
    type: 'strength-context',
    generatedAt: Number(now) || Date.now(),
    catalog,
    recentExerciseIds,
  };
}

function _movementsById(movementList) {
  const byId = {};
  for (const movement of Array.isArray(movementList) ? movementList : []) {
    if (movement?.id) byId[movement.id] = movement;
  }
  return byId;
}

function _todayDateKey(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 종목별 처방 빌더 — 폰 픽커(`workout/exercises.js` `_buildProgramPickerExerciseEntry`)와
 * 같은 입력으로 같은 처방을 만든다. 행 전개 규칙도 폰과 동일하게 맞춘다:
 *   - 웬들러: 워밍업/메인/보조까지 처방된 전 세트를 그대로 깐다.
 *   - 트랙(계단): 폰의 `_firstTestModePrescriptionSet` 과 동일하게 첫 세트 한 줄만.
 * 어느 쪽도 없으면 null → 워치는 기존대로 빈 세트 한 줄을 만든다.
 */
export function makeWearProgramResolver(deps = {}) {
  const {
    board = null,
    findExerciseProgramBenchmark,
    buildExerciseProgramWorkoutPrescription,
    orderWendlerPrescriptionSets = (sets) => sets,
    todayKey = _todayDateKey(),
  } = deps || {};
  if (!board || typeof findExerciseProgramBenchmark !== 'function' || typeof buildExerciseProgramWorkoutPrescription !== 'function') {
    return () => null;
  }
  return function programFor(exercise) {
    if (!exercise?.id) return null;
    let benchmark = null;
    try {
      benchmark = findExerciseProgramBenchmark(board, exercise);
    } catch {
      return null;
    }
    if (!benchmark || benchmark.status === 'archived') return null;
    const isWendler = benchmark.program === 'wendler';
    const tracks = Array.isArray(benchmark.tracks) && benchmark.tracks.length ? benchmark.tracks : ['volume'];
    const track = isWendler ? 'volume' : (tracks.includes('volume') ? 'volume' : tracks[0]);
    let built = null;
    try {
      built = buildExerciseProgramWorkoutPrescription(board, benchmark, { track, todayKey, includeAlternatives: false });
    } catch {
      return null;
    }
    const prescription = built?.prescription;
    if (!prescription || prescription.applySets !== true) return null;
    const rawSets = Array.isArray(prescription.sets) ? prescription.sets : [];
    if (!rawSets.length) return null;
    const isWendlerPrescription = prescription.program === 'wendler';
    const sets = isWendlerPrescription ? orderWendlerPrescriptionSets(rawSets) : rawSets.slice(0, 1);
    const week = Number(built?.plan?.week);
    const label = String(prescription.label || '');
    return {
      kind: isWendlerPrescription ? 'wendler' : 'stair',
      label,
      // 워치 카드 헤더용. 폰 라벨은 "웬들러 5/3/1 · 142.5kg x 1+ · BBB 75kg 5x10" 처럼 길어서
      // 워치 한 줄에 넣으면 "웬들러 5/3/1 · 142…" 로 잘린다. 무게는 어차피 아래 각 행에 있으니
      // 첫 구간(스킴 이름)만 쓴다. ' · ' 는 _programRxLabel 이 직접 넣는 구분자다.
      shortLabel: label.split(' · ')[0] || label,
      weekLabel: Number.isFinite(week) && week > 0 ? `${week}주차` : '',
      sets,
    };
  };
}

// data.js 파사드 경유로 실제 카탈로그/지난기록/처방을 모아 Capacitor 플러그인으로 전달.
// 안드로이드 Wear 브리지가 없는 환경(웹/데스크톱)에서는 조용히 no-op.
export async function pushWearStrengthContext() {
  try {
    const [dataApi, { MOVEMENTS }, boardCore] = await Promise.all([
      import('../data.js'),
      import('../config.js'),
      import('./test-v2/board-core.js'),
    ]);
    const { getExList, getMuscleParts, getLastSession, getTestBoardV2 } = dataApi;
    let board = null;
    try {
      board = typeof getTestBoardV2 === 'function' ? getTestBoardV2() : null;
    } catch (error) {
      console.warn('[wear-strength-context] board unavailable, sending catalog without programs:', error);
    }
    const context = buildWearStrengthContext({
      exercises: getExList(),
      muscles: getMuscleParts(),
      movements: _movementsById(MOVEMENTS),
      lastSessionFor(exerciseId) {
        const last = getLastSession(exerciseId);
        if (!last || !last.date) return null;
        return { dateKey: last.date, sets: Array.isArray(last.sets) ? last.sets : [] };
      },
      programFor: makeWearProgramResolver({
        board,
        findExerciseProgramBenchmark: boardCore.findExerciseProgramBenchmark,
        buildExerciseProgramWorkoutPrescription: boardCore.buildExerciseProgramWorkoutPrescription,
        orderWendlerPrescriptionSets: boardCore.orderWendlerPrescriptionSets,
      }),
      now: Date.now(),
    });
    const payload = JSON.stringify(context);
    if (typeof window === 'undefined') return;
    await window.Capacitor?.Plugins?.TomatoWearStrengthContext?.pushStrengthContext({ payload });
  } catch (error) {
    console.warn('[wear-strength-context] push failed:', error);
  }
}

let _pushDebounceTimer = null;

function _schedulePush(delayMs = 3000) {
  if (_pushDebounceTimer) clearTimeout(_pushDebounceTimer);
  _pushDebounceTimer = setTimeout(() => {
    _pushDebounceTimer = null;
    void pushWearStrengthContext();
  }, delayMs);
}

// tomato-app-ready(부팅) / sheet:saved(운동·식단 저장) 시 ~3초 디바운스로 컨텍스트 재전송.
export function initWearStrengthContextSync() {
  if (typeof window === 'undefined') return;
  window.addEventListener?.('tomato-app-ready', () => _schedulePush());
  if (typeof document !== 'undefined') {
    document.addEventListener?.('sheet:saved', () => _schedulePush());
  }
}
