// ================================================================
// workout/wear-strength-context.js — 폰→워치 헬스 카탈로그+지난기록 컨텍스트
//   워치는 Firebase가 없으므로, 전체 종목 카탈로그(부위별 그룹)와 종목별 지난
//   기록을 폰이 미리 계산해 고정 DataItem(/tomato/workout/strength/context)으로
//   내려보낸다. buildWearStrengthContext 는 의존성 주입된 순수 빌더.
// ================================================================
const DEFAULT_STEP_KG = 2.5;
const MAX_LAST_SESSION_SETS = 12;

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
      exerciseEntries.push({
        exerciseId,
        name: String(exercise?.name || ''),
        movementId: exercise?.movementId || null,
        stepKg,
        lastSession,
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

// data.js 파사드 경유로 실제 카탈로그/지난기록을 모아 Capacitor 플러그인으로 전달.
// 안드로이드 Wear 브리지가 없는 환경(웹/데스크톱)에서는 조용히 no-op.
export async function pushWearStrengthContext() {
  try {
    const [{ getExList, getMuscleParts, getLastSession }, { MOVEMENTS }] = await Promise.all([
      import('../data.js'),
      import('../config.js'),
    ]);
    const context = buildWearStrengthContext({
      exercises: getExList(),
      muscles: getMuscleParts(),
      movements: _movementsById(MOVEMENTS),
      lastSessionFor(exerciseId) {
        const last = getLastSession(exerciseId);
        if (!last || !last.date) return null;
        return { dateKey: last.date, sets: Array.isArray(last.sets) ? last.sets : [] };
      },
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
