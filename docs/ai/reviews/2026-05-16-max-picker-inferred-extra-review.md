# 테스트모드 피커 실데이터 회귀 보강 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-05-16-max-picker-pwa-update-regression.md`
- 슬라이스: `Slice 2: 테스트모드 피커 실데이터 회귀 보강`
- 변경 파일: `workout/expert/max-benchmark-picker.js`, `workout/exercises.js`, `workout/index.js`, `render-workout.js`, `app.js`, `index.html`, `sw.js`, `tests/calc.max.test.js`

## Findings

- 발견된 차단 이슈 없음.

## 확인한 사항

- `movementId`가 없거나 `unknown`인 등록 종목도 이름 기반 movement 추론을 통해 `high_row`, `lat_pulldown` 같은 같은 부위 후보로 복원된다.
- 피커용 정규화는 실제 매칭된 대분류 부위를 우선해, 기존 `muscleId`가 비어 있거나 커스텀 값이어도 선택 부위 그룹에 안정적으로 들어간다.
- 벤치마크 후보는 기존처럼 `buildMaxBenchmarkPickerEntry()` 경로를 타서 계획 kg/reps를 유지한다.
- 벤치마크가 아닌 같은 부위 후보는 `buildMaxPickerExerciseEntry()`에서 일반 수동 종목으로 추가되어 특정 벤치마크 처방을 강제하지 않는다.
- 변경된 정적 자산에 맞춰 import query와 `sw.js` `CACHE_VERSION`이 갱신됐다.

## 검증

- `node --check workout/expert/max-benchmark-picker.js workout/exercises.js workout/index.js render-workout.js app.js sw.js` 통과.
- `node --test tests/calc.max.test.js` 통과: 46 tests.
- `git diff --check` 통과.
- 실제 모바일/PWA UI 플로우는 dev server를 샌드박스에서 장기 실행하지 않는 프로젝트 규칙 때문에 아직 `not verified yet`이다.
