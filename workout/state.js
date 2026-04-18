// ================================================================
// workout/state.js — 운동탭 공유 상태
// ================================================================

export function emptyDiet() {
  return {
    breakfast:'', lunch:'', dinner:'', snack:'',
    bOk:null, lOk:null, dOk:null, sOk:null,
    bKcal:0,  lKcal:0,  dKcal:0,  sKcal:0,
    bReason:'', lReason:'', dReason:'', sReason:'',
    bProtein:0, bCarbs:0, bFat:0,
    lProtein:0, lCarbs:0, lFat:0,
    dProtein:0, dCarbs:0, dFat:0,
    sProtein:0, sCarbs:0, sFat:0,
    bFoods:[], lFoods:[], dFoods:[], sFoods:[],
  };
}

export const S = {
  date:       null,   // { y, m, d }
  exercises:  [],
  hiddenExercises: [],
  cf:         false,
  stretching: false,
  swimming:   false,
  running:    false,
  runData:    { distance: 0, durationMin: 0, durationSec: 0, memo: '' },
  cfData:     { wod: '', durationMin: 0, durationSec: 0, memo: '' },
  stretchData:{ duration: 0, memo: '' },
  swimData:   { distance: 0, durationMin: 0, durationSec: 0, stroke: '', memo: '' },
  wineFree:   false,
  workoutStartTime: null,
  workoutDuration:  0,
  workoutTimerInterval: null,
  breakfastSkipped: false,
  lunchSkipped: false,
  dinnerSkipped: false,
  diet:       emptyDiet(),
  restTimer:  { interval: null, remaining: 0, total: 90, running: false, startedAt: null },
  // 전문가 모드
  currentGymId: null,                  // 오늘 세션의 헬스장
  routineMeta:  null,                  // {source, candidateKey, rationale}
};
