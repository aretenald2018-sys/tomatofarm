// ================================================================
// workout/save-schema.js
//   운동/식단 저장 페이로드의 도메인 파티션 정의 (순수 데이터).
//   실제 빌더(save.js _buildWorkoutPayload / _buildDietPayload)가 생산하는 키와
//   1:1 일치해야 함. 이 모듈은 DOM/Firebase 의존 없음 → node:test 로 불변식 검증 가능.
//
// 2026-04-20: 운동/식단 저장 분할 배경
//   과거엔 _buildSavePayload 가 40+ 필드를 한번에 생성해 setDoc 전체 덮어쓰기 했음 →
//   한쪽 경로에서 필드 빠뜨리면 반대쪽 데이터 소실. 이제 setDoc({merge:true}) 로
//   부분 업데이트만 하고, 키 파티션을 고정해서 회귀 방지.
// ================================================================

// 운동 경로가 쓰는 필드. 이 외 필드는 운동 저장에서 Firestore 로 가지 않음 → 식단 데이터 보호.
export const WORKOUT_PAYLOAD_KEYS = Object.freeze([
  'exercises', 'cf', 'stretching', 'swimming', 'running',
  'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
  'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo',
  'stretchDuration', 'stretchMemo',
  'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo',
  'workoutDuration', 'wine_free', 'memo', 'workoutPhoto',
  'gymId', 'routineMeta', 'maxMeta',
  // 공유 — 운동 변경이 dayTarget 을 바꾸므로 운동 경로도 bOk/lOk 재계산.
  'bOk', 'lOk', 'dOk', 'sOk',
]);

// 식단 경로가 쓰는 필드. 이 외 필드는 식단 저장에서 Firestore 로 가지 않음 → 운동 데이터 보호.
export const DIET_PAYLOAD_KEYS = Object.freeze([
  'breakfast_skipped', 'lunch_skipped', 'dinner_skipped',
  'breakfast', 'lunch', 'dinner', 'snack',
  'bKcal', 'lKcal', 'dKcal', 'sKcal',
  'bReason', 'lReason', 'dReason', 'sReason',
  'bProtein', 'bCarbs', 'bFat',
  'lProtein', 'lCarbs', 'lFat',
  'dProtein', 'dCarbs', 'dFat',
  'sProtein', 'sCarbs', 'sFat',
  'bFoods', 'lFoods', 'dFoods', 'sFoods',
  'bPhoto', 'lPhoto', 'dPhoto', 'sPhoto',
  'bEstimateMeta', 'lEstimateMeta', 'dEstimateMeta', 'sEstimateMeta',
  // 공유 (위와 동일).
  'bOk', 'lOk', 'dOk', 'sOk',
]);

// 공유 필드 — 양쪽 payload 에 의도적으로 포함. 값은 동일한 _computeMealOk 계산 결과.
export const SHARED_PAYLOAD_KEYS = Object.freeze(['bOk', 'lOk', 'dOk', 'sOk']);
