# Workout data lineage

## Stable identifiers

| Field | Meaning | Owner |
| --- | --- | --- |
| `exerciseId` | 실제로 추가·기록한 운동 종목 | `users/{owner}/exercises` catalog |
| `movementId` | 여러 종목을 묶는 움직임 taxonomy | `config.js` `MOVEMENTS` |
| `gymId` / `gymIds` / `gymTags` | 운동 종목의 체육관 노출 범위 | equipment/exercise repositories |
| `recommendationMeta.track` | 볼륨(M), 강도(H), 프로그램 기록 분류 | workout recommendation model |
| `romPct` | 세트별 ROM 보정률 | workout set model |
| `rpe` / `rir` | 세트 강도 입력 | workout set model |

## Calculation owners

| Concern | Single source |
| --- | --- |
| 세트 볼륨 | `calc/volume.js` `calcSetVolume` |
| 세트 e1RM | `calc.js` `estimateSet1RM` |
| 트랙별 세션 지표 | `calc.js` `calcTrackSessionMetric` |
| movement의 실제 종목 | `resolveMovementExercises` |
| benchmark 대상 종목 | `resolveBenchmarkExercise` |
| benchmark 실적 | `buildBenchmarkActuals` |

## Required invariants

1. `exerciseId`가 있는 기록은 같은 `movementId`의 다른 종목과 합치지 않습니다.
2. legacy `movementId` benchmark는 현재 체육관에서 실제 선택 가능한 종목으로만 해석합니다.
3. ROM 보정은 볼륨과 강도 계산에 동일하게 반영합니다.
4. 과거 workout document는 실행 당시의 스냅샷이며 현재 exercise catalog를 덮어쓰지 않습니다.
5. 저장은 workout payload builder를 거치며 사진, route/ref, session metadata를 round trip에서 보존합니다.

Fixture 검증은 `node scripts/verify-workout-fixture.mjs`로 실행합니다.
