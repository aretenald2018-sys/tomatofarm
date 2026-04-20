// ================================================================
// ai/muscles.js — muscleIds 파생 헬퍼
// ================================================================
// 2026-04-19: 기구 → 부위(subPattern) 1:N 매핑 리팩토링.
// 유저 요구: "스미스머신" 단독이면 범용 부위(가슴/등/하체 등) 모두 태깅,
// "스미스머신 스쿼트"면 하체 부위만, "벤치프레스"면 가슴 중부(주동근)+상부/하부+삼두+어깨전면.
// AI 프롬프트가 이미 movementId를 narrow vs broad 판정하는 역할을 하므로
// 여기서는 결과 movementId + 원본 이름을 조합해 muscleIds 배열을 파생.
// 배열[0] = 주동근 (자극 균형 차트에서 1세트=1부위로 카운트되는 기준).
// ================================================================

import { MOVEMENT_MUSCLES_MAP, BROAD_EQUIPMENT_MUSCLES_MAP } from '../config.js';

function _isBroadEquipmentName(name) {
  const s = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  for (const entry of BROAD_EQUIPMENT_MUSCLES_MAP) {
    for (const p of entry.patterns) {
      const pp = String(p).toLowerCase().replace(/\s+/g, '');
      // 입력 이름이 범용 기구명 자체인지 검사 (exact match 또는 매우 짧은 접미사만)
      // "스미스머신 스쿼트" 같은 조합은 별도 keyword로 걸러져서 specific로 처리.
      if (s === pp) return entry;
    }
  }
  return null;
}

function _hasSpecificMovementKeyword(name) {
  // 기구명에 구체 운동 키워드가 포함되면 broad 매핑을 쓰지 않음.
  const s = String(name || '').toLowerCase();
  if (!s) return false;
  const keywords = [
    '벤치프레스', '벤치 프레스', 'bench press',
    '스쿼트', 'squat',
    '데드리프트', 'deadlift',
    '로우', 'row',
    '풀다운', 'pulldown',
    '풀업', 'pullup', 'pull up',
    '숄더프레스', '숄더 프레스', 'shoulder press', 'ohp',
    '레터럴 레이즈', '사레레', 'lateral raise',
    '프론트 레이즈', 'front raise',
    '리어 델트', 'rear delt', '페이스풀', 'face pull',
    '슈러그', 'shrug',
    '레그프레스', '레그 프레스', 'leg press',
    '레그 익스텐션', '레그익스텐션', 'leg extension',
    '레그 컬', '레그컬', 'leg curl',
    '힙 쓰러스트', '힙쓰러스트', 'hip thrust',
    '카프', 'calf',
    '컬', 'curl',
    '푸쉬다운', 'pushdown', 'push down',
    '딥스', 'dips',
    '플라이', 'fly',
    '크로스오버', 'crossover',
    '런지', 'lunge',
    '크런치', 'crunch', '플랭크', 'plank',
  ];
  return keywords.some(k => s.includes(k));
}

// deriveMuscleIds — parsed item (name, movementId) 기반으로 세부 부위 배열 도출.
//   입력이 범용 기구명("스미스머신" 단독) → BROAD_EQUIPMENT_MUSCLES_MAP 적용 (넓게)
//   입력에 구체 운동명 포함 ("스미스머신 스쿼트") or 기구명 자체가 specific ("벤치프레스")
//     → MOVEMENT_MUSCLES_MAP[movementId] 적용 (좁게)
//   둘 다 실패 → movement.subPattern 단일 원소 (최소 fallback)
export function deriveMuscleIdsForItem(item, movements) {
  const name = String(item?.name || '').trim();
  const movementId = String(item?.movementId || '').trim();
  // 1) 구체 운동 키워드가 없고, 이름이 범용 기구명과 exact match → broad 매핑 우선.
  if (!_hasSpecificMovementKeyword(name)) {
    const broad = _isBroadEquipmentName(name);
    if (broad) return [...broad.muscleIds];
  }
  // 2) movementId 기반 MOVEMENT_MUSCLES_MAP lookup.
  if (movementId && movementId !== 'unknown' && MOVEMENT_MUSCLES_MAP[movementId]) {
    return [...MOVEMENT_MUSCLES_MAP[movementId]];
  }
  // 3) Fallback: movement.subPattern 단일 원소.
  if (movementId && movementId !== 'unknown') {
    const mv = (movements || []).find(m => m.id === movementId);
    if (mv?.subPattern) return [mv.subPattern];
  }
  return [];
}
