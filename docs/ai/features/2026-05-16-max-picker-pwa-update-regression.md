# 테스트모드 피커/PWA 업데이트 회귀 수정

## 문제

- 사용자는 테스트모드 종목 선택에서 여전히 벤치마크에 있는 운동만 추가할 수 있다고 보고했다.
- 동시에 새 버전 업데이트를 위한 새로고침 안내가 여러 번 떠서, 사용자가 최신 번들로 안정적으로 넘어가지 못할 가능성이 있다.

## 진단 가설

1. `pwa-register.js`의 `registration.waiting` 및 `updatefound -> installed` 경로가 같은 waiting worker에 대해 중복으로 업데이트 안내를 호출한다.
2. 업데이트 안내 상태가 `utils/build-info.js` 모듈 메모리에만 있어, 중복 로드/재등록/탭 재진입 시 같은 worker 안내를 다시 만들 수 있다.
3. 테스트모드 피커 resolver는 테스트상 통과하지만, 실데이터에 `primaryMajor`, `muscleId`, `muscleIds`, `movementId` 중 일부가 비어 있는 등록 종목이 있으면 같은 부위 extras가 빠질 수 있다.
4. PWA 업데이트 루프 때문에 사용자가 `workout/expert/max-benchmark-picker.js?v=20260515v14`와 `workout/exercises.js` 변경이 포함된 최신 앱을 보지 못할 수 있다.

## 목표

- 새 버전 새로고침 안내는 동일 service worker 업데이트당 한 번만 표시한다.
- 새로고침 버튼을 눌렀을 때 `SKIP_WAITING`/reload가 중복 실행되지 않는다.
- 테스트모드 피커는 벤치마크 운동을 우선 표시하되, 실데이터 형태가 조금 불완전해도 같은 부위 등록 운동을 함께 표시한다.
- 정적 자산 수정 시 `sw.js` `CACHE_VERSION`과 필요한 query version을 함께 올린다.

## 실행 슬라이스

### Slice 1: PWA 업데이트 안내 중복 차단

- `pwa-register.js`에서 동일 waiting/installing worker에 대한 업데이트 안내를 한 번만 요청하도록 key 기반 가드를 둔다.
- `utils/build-info.js`에서 배너 표시/새로고침 클릭을 idempotent하게 만들어 중복 DOM/중복 reload를 막는다.
- `pwa-register.js`, `utils/build-info.js`, `index.html`, `sw.js` 변경에 맞춰 query/cache version을 갱신한다.

검증:

- `node --check pwa-register.js utils/build-info.js sw.js app.js`
- `git diff --check`
- 로컬 UI 검증은 사용자 일반 터미널에서 `npm.cmd run dev` 실행 후 배포 환경 또는 SW가 활성화된 환경에서 새 버전 안내가 1개만 보이는지 확인한다. localhost는 SW를 해제하므로 PWA 업데이트 안내 자체는 `not verified yet`일 수 있다.

### Slice 2: 테스트모드 피커 실데이터 회귀 보강

- `resolveMaxBenchmarkPickerItems()`의 같은 부위 판정이 벤치마크 `primaryMajor`뿐 아니라 선택 부위, movement catalog, 등록 운동의 가능한 부위 필드를 안정적으로 사용하는지 보강한다.
- 벤치마크가 있는 부위에서 벤치마크가 아닌 등록 종목을 클릭하면 일반 수동 종목으로 추가되는 경로를 테스트로 고정한다.
- 필요한 경우 `workout/exercises.js`의 피커 풀/클릭 경로를 보강한다.

검증:

- `node --check workout/expert/max-benchmark-picker.js workout/exercises.js render-workout.js app.js sw.js`
- `node --test tests/calc.max.test.js`
- `git diff --check`
- 사용자 플로우: `npm.cmd run dev` 후 운동 탭 → 테스트모드 → 종목 선택 → 벤치마크가 아닌 같은 부위 종목 클릭 → 오늘 운동 목록에 새 종목이 추가되는지 확인한다.

## 비범위

- 계획 조정 모달의 벤치마크 편집 UX 변경은 제외한다.
- Firestore 데이터 마이그레이션이나 배포/push는 명시 지시 없이는 하지 않는다.

## 다음 실행 시작점

Slice 1부터 진행한다. PWA 업데이트 중복 안내를 먼저 막아 최신 코드 반영 문제를 줄인 뒤, Slice 2에서 피커 자체 회귀를 고정한다.

## 실행 결과

- Slice 1 완료: `pwa-register.js`에서 동일 app service worker update key를 한 번만 알리도록 가드했다.
- Slice 1 완료: `utils/build-info.js`의 새로고침 버튼은 중복 클릭/중복 reload를 막고, waiting worker가 있으면 `controllerchange` 또는 fallback timeout에서 한 번만 reload한다.
- Slice 1 완료: `app.js` build-info import query, `index.html` app/pwa-register query, `sw.js` `CACHE_VERSION`을 갱신했다.
- Slice 1 검증: `node --check pwa-register.js utils/build-info.js sw.js app.js` 통과.
- Slice 1 검증: `git diff --check` 통과.
- Slice 2 완료: `movementId`가 비어 있거나 `unknown`인 등록 종목도 이름 기반 movement 추론으로 같은 부위 후보에 포함한다.
- Slice 2 완료: 벤치마크가 아닌 피커 후보는 `buildMaxPickerExerciseEntry()`를 통해 일반 수동 종목 entry로 추가되도록 고정했다.
- Slice 2 완료: `workout/exercises.js`, `workout/index.js`, `render-workout.js`, `app.js`, `index.html`, `sw.js` query/cache version을 갱신했다.
- Slice 2 검증: `node --check workout/expert/max-benchmark-picker.js workout/exercises.js workout/index.js render-workout.js app.js sw.js` 통과.
- Slice 2 검증: `node --test tests/calc.max.test.js` 통과: 46 tests.
- Slice 2 검증: `git diff --check` 통과.
