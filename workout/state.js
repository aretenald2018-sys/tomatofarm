// ================================================================
// workout/state.js — 운동탭 공유 상태 (도메인 분할)
// ----------------------------------------------------------------
// 2026-04-21 리팩토링: 단일 flat `S` 객체를 3개 네임스페이스로 분할.
//   S.workout.* — 운동 도메인 (exercises, cf, running, runData, timers, expert...)
//   S.diet.*    — 식단 도메인 (breakfast/lunch/dinner/snack, bFoods, bKcal, 사진, EstimateMeta)
//                 + breakfastSkipped/lunchSkipped/dinnerSkipped 도 이쪽에 포함
//   S.shared.*  — 양쪽이 공유하는 전역 (date)
//
// 배경:
//   과거엔 운동·식단·공유 상태가 한 flat 객체에 섞여 있어 save 경로/파생 함수에서
//   도메인 경계를 실수로 넘나드는 회귀가 반복 발생. setDoc merge 분할(save-schema.js)과
//   함께 state 자체를 분할해 "운동은 식단을 모른다" 를 컴파일러 힌트로 강제.
//
// 호환성:
//   호출부는 **모두 S.workout.xxx / S.diet.xxx / S.shared.xxx 로 직접 접근** (flat shim 없음).
//   이 PR 에서 workout/*.js 전체를 새 경로로 migrate. 새 코드도 네임스페이스 경로 필수.
// ================================================================

export function emptyDiet() {
  return {
    // 끼니 텍스트 + skip 플래그 (과거엔 top-level S.breakfastSkipped 였으나 도메인 정리상 이곳으로)
    breakfast:'', lunch:'', dinner:'', snack:'',
    breakfastSkipped: false, lunchSkipped: false, dinnerSkipped: false,
    // per-meal 성공/칼로리/매크로/사유
    bOk:null, lOk:null, dOk:null, sOk:null,
    bKcal:0,  lKcal:0,  dKcal:0,  sKcal:0,
    bReason:'', lReason:'', dReason:'', sReason:'',
    bProtein:0, bCarbs:0, bFat:0,
    lProtein:0, lCarbs:0, lFat:0,
    dProtein:0, dCarbs:0, dFat:0,
    sProtein:0, sCarbs:0, sFat:0,
    bFoods:[], lFoods:[], dFoods:[], sFoods:[],
    // AI 추정 메타
    bEstimateMeta:null, lEstimateMeta:null, dEstimateMeta:null, sEstimateMeta:null,
  };
}

function emptyWorkout() {
  return {
    exercises: [],
    hiddenExercises: [],
    cf: false,
    stretching: false,
    swimming: false,
    running: false,
    runData:    { distance: 0, durationMin: 0, durationSec: 0, memo: '' },
    cfData:     { wod: '', durationMin: 0, durationSec: 0, memo: '' },
    stretchData:{ duration: 0, memo: '' },
    swimData:   { distance: 0, durationMin: 0, durationSec: 0, stroke: '', memo: '' },
    wineFree:   false,
    workoutStartTime: null,
    workoutDuration:  0,
    workoutTimerInterval: null,
    // 타이머가 소속된 날짜 — 시작 시점에 캡처. 날짜 네비게이션 시에도 유지, 끝내기/리셋 시만 null.
    workoutTimerDate: null,              // { y, m, d } | null
    restTimer:  { interval: null, remaining: 0, total: 90, running: false, startedAt: null },
    // 전문가 모드
    currentGymId: null,                  // 오늘 세션의 헬스장
    pickerGymFilter: null,               // 오늘 종목 추가 모달의 헬스장 필터 유지
    routineMeta:  null,                  // {source, candidateKey, rationale}
    maxMeta:      null,                  // max 전용: 세션 타입, 약점 부위, 약점 블록 타이머
  };
}

function emptyShared() {
  return {
    date: null,   // { y, m, d }
  };
}

// ── 도메인 네임스페이스 (공개) ──────────────────────────────────
// workout 과 shared 는 const 로 한 번 생성 — 호출부는 동일 참조를 계속 봄.
// diet 는 load.js 가 통째 재할당하는 경로가 있어 setter 에서 in-place mutate.
export const S = {
  workout: emptyWorkout(),
  shared:  emptyShared(),
};

// S.diet 는 getter/setter 로 in-place mutate 를 강제해, diet 내부 레퍼런스가 유지되도록.
//   배경: load.js 의 `S.diet = { ... }` 경로가 통째 할당을 기대함. 참조가 바뀌어버리면
//         외부에서 캐시한 _diet 포인터(S.diet 를 잡아둔 변수)가 stale 이 됨.
const _diet = emptyDiet();
Object.defineProperty(S, 'diet', {
  get() { return _diet; },
  set(v) {
    if (!v || typeof v !== 'object') return;
    for (const k of Object.keys(_diet)) if (!(k in v)) delete _diet[k];
    Object.assign(_diet, v);
  },
  enumerable: true,
  configurable: false,
});
