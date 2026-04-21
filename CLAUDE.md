# 토마토팜 (dashboard3) - AI 컨텍스트 가이드

## 프로젝트 개요
건강/생산성 추적 PWA. Vanilla JS(ES6), Firebase, Vercel. 빌드 스텝 없는 단일 index.html.
- **참조 문서:** @ARCHITECTURE.md (구조 레퍼런스), @prd.md (제품 요구사항), @plan.md (작업 진행)
- **코덱스 규칙:** @AGENTS.md (Codex/CLI 에이전트 공통 규칙 — 중복 방지를 위해 여기서 재기술하지 않음)

## ⚠️ 절대 규칙 (위반 시 버그/장애)
1. **Firebase 직접 호출 금지** — 모든 CRUD는 `data.js` 배럴이 노출하는 getter/setter만 사용. 뷰/feature-*.js에서 Firestore API 절대 금지.
2. **setDoc은 전체 덮어쓰기** — 필드 하나라도 빠뜨리면 기존 데이터 삭제됨. 사진(`bPhoto`, `lPhoto`, `dPhoto`, `sPhoto`, `workoutPhoto`) 누락하면 사진 날아감.
3. **배포는 유저의 명시적 지시가 있을 때만** — 평소에는 push/배포 자동 실행 금지. 단, 유저가 명시적으로 "배포해", "푸시해", "배포까지 해" 등으로 지시한 경우에는 항상 `tomatofarm` 리모트에 push 가능. localhost 확인은 유저가 완료했다고 간주.
4. **순수 로직은 calc.js** — BMR, 칼로리, 스트릭, 토마토 사이클 계산 등 사이드이펙트 없는 함수만. DOM 접근·Firebase 호출 금지.
5. **SW 캐시 버전 범프** — `sw.js`의 `STATIC_ASSETS`에 등록된 파일을 수정했으면 `CACHE_VERSION`을 반드시 범프 + `sw.js` 함께 커밋.
6. **소스 트루스는 루트** — `www/`는 `scripts/copy-www.js` 의 Capacitor 빌드 산출물이다. **`www/` 직접 수정 금지**. 수정은 항상 루트 파일(`index.html`, `app.js`, `style.css`, `workout/*.js` 등)에만. `bash scripts/dev-start.sh` 는 루트를 서빙함.

## 🖥️ Dev Server (MANDATORY)

코드 변경 후 서버가 필요하면 `bash scripts/dev-start.sh` 사용.
- 이 스크립트는 **idempotent**함: 이미 헬시한 Python 서버가 떠 있으면 재실행해도 기존 서버를 **재사용**(kill 안 함).
- Python은 `nohup + subshell` 조합으로 **완전 detach** 실행됨 → Claude 백그라운드 태스크가 종료돼도 서버는 살아있음.
- 포트 충돌 자동 해결: 다른 프로그램이 점유하면 5501, 5502... 순서로 빈 포트 자동 탐색. 이전 세션의 stale Python만 선택적으로 kill.
- **🚫 절대 금지 (과거 로그인 다운 원인)**:
  - `python -m http.server`를 직접 실행하지 말 것 — 반드시 스크립트 사용
  - 수동 `taskkill`/포트 kill 금지 — 스크립트가 처리함
  - **이미 5500에 서버가 떠 있으면 `dev-start.sh`를 재실행하지 말 것.** `curl -s -o /dev/null -w "%{http_code}" http://localhost:5500/` 로 확인만. (과거: 무심코 재실행 → 스크립트가 "기존 Python kill 후 새로 띄움" 로직을 돌려 브라우저 세션 끊김 → SW 캐시 버전 불일치로 로그인 실패 루프)
- 스크립트 출력에서 **실제 사용 포트를 확인**하고 사용자에게 알려줄 것
- 다른 프로젝트(biz 등) 프로세스는 건드리지 않음

## Communication Protocol
- 작업 시작 전 `/docs/COMMUNICATION_RULES.md`의 Active Rules를 따른다.
- 구현 전 이해한 요구사항을 한 줄로 요약해 확인받는다.
- 세션 종료 시 사용자가 요청하면 `/docs/COMMUNICATION_LOG.md`에 Part B를 채우고, `communication-insight.md` 지시대로 인사이트를 작성한다.
- 커뮤니케이션 상세 규칙은 COMMUNICATION_RULES.md에서 단일 관리. 이 문서에 중복하지 않음.

## 🔥 과거에 터졌던 것들 (반드시 확인)
- `saveWorkoutDay()`와 `_autoSaveDiet()`는 공통 헬퍼 `_buildSavePayload()`를 호출해 저장 객체를 생성함(`workout/save.js`). **새 필드 추가 시 `_buildSavePayload()` 한 곳만 수정**하면 양쪽 저장 경로에 반영됨.
- `window.*`에 함수를 노출하지 않으면 HTML의 `onclick="함수명()"`이 작동 안 함. `workout/index.js` 하단의 `window.xxx = xxx` 블록 확인.
- `render-workout.js`(shim)는 `workout/index.js`를 re-export. app.js에서 호출할 새 함수를 추가하면 **shim의 export 목록에도 반드시 추가**.
- 사진 필드(`bPhoto`, `lPhoto`, `dPhoto`, `sPhoto`, `workoutPhoto`)를 저장 객체에 빠뜨리면 setDoc 전체 덮어쓰기로 사진 삭제됨.
- **레이지 로드 모듈의 함수를 동기 코드에서 직접 호출하면 `ReferenceError`** — `render-cooking.js` 등 `_lazy()`로 로드되는 모듈의 export 함수는 **호출부를 async로 바꿔 `await _lazy()`로 가져올 것**.
- **이벤트 위임(`document.addEventListener`)과 HTML `onclick`이 같은 버튼에 동시 등록되면 핸들러가 2번 실행됨** — 토글 함수가 2번 불리면 원복되어 "안 눌리는" 증상. 하나의 버튼에는 **이벤트 위임 또는 onclick 중 하나만** 사용.
- **SW 캐시 버전 안 올리면 코드 변경이 배포에 반영 안 됨** — 현재 `CACHE_VERSION = 'tomatofarm-v20260417z3-ai-food-profile'`. `STATIC_ASSETS` 파일을 하나라도 수정했으면 범프 필수.
- **커밋 시 의존 파일 누락 → 배포 사이트 런타임 에러** — 예: `home/tomato.js`가 `calc.js`의 `isExerciseDaySuccess`를 import하는데 `calc.js`를 커밋 안 하면 `SyntaxError: does not provide an export named`. **파일 A를 커밋할 때, A가 import하는 다른 파일의 미커밋 변경을 반드시 확인.** 특히 `calc.js ↔ home/tomato.js`, `data/* ↔ home/*.js`, `workout/* ↔ render-workout.js` 간 export/import 의존성.
- **`localStorage`는 기기 단위, 유저별 아님** — 멀티 유저에서 마이그레이션 플래그 등을 `localStorage`에 저장하면 다른 유저에게도 적용됨. 유저별 상태는 **Firestore `_settings`(tomato_state 등)에 저장**. `localStorage`는 UI 상태/캐시/단말별 API 키 전용.
- **`unit_goal_start` 같은 설정은 모든 사용자 경로에서 자동설정 필요** — `renderUnitGoal()`이 admin 전용이라 비관리자는 `unit_goal_start`가 영원히 null이었음. 특정 사용자 유형에서만 호출되는 함수에 초기화 로직 넣지 말 것. `settleTomatoCycleIfNeeded()` 같은 공통 경로에서 처리.
- **사용자 액션에 피드백 토스트 필수** — CRUD 작업(저장, 삭제, 전송, 선물 등) 완료 시 반드시 `showToast(msg, duration, type)` 호출. `alert()` 사용 금지 — TDS Toast로 통일. 타입: success/error/warning/info. 예외: 좋아요 토글 등 UI 자체가 즉각 변하는 마이크로 인터랙션은 토스트 불필요.

## 🗺️ 디렉토리 간단 맵 (자세한 구조는 ARCHITECTURE.md)
```
루트:
  app.js / data.js / calc.js / config.js / ai.js / sheet.js / sw.js / index.html / style.css
  render-home.js / render-workout.js / render-stats.js / render-admin.js / render-cooking.js  ← 탭 엔트리/shim
  feature-*.js  ← checkin, diet-plan, fatsecret, misc, nutrition, tutorial
  workout-ui.js / farm-canvas.js / modal-manager.js / navigation.js / pwa-fcm.js
  app-modal-goals.js / app-modal-quests.js

서브디렉토리:
  data/      17개 — data-core.js(공유 상태), data-auth.js, data-account.js, data-analytics.js,
                    data-date.js, data-external.js, data-helpers.js, data-image.js,
                    data-social.js(barrel) + data-social-{friends,guild,interact,log}.js,
                    data-workout-equipment.js, ai-food-profile.js, korean-food-normalize.js,
                    raw-ingredients.js(식약처 원재료 DB)
  workout/   11개 — index.js(orchestrator+window.*), state.js, load.js, save.js, status.js,
                    render.js, exercises.js, timers.js, activity-forms.js, ai-estimate.js, expert.js
  home/      19개 — index.js, tomato.js, farm.js, unit-goal.js, hero.js, today-summary.js,
                    goals-quests.js, friend-feed.js, friend-profile.js, guild-card.js,
                    notifications.js, cheers-card.js, cheer-card.js, personalize.js,
                    streak-warning.js, weekly-streak.js, welcome-back.js,
                    admin-onboarding.js, utils.js
  modals/    29개 — *-modal.js 템플릿(HTML 문자열 export). modal-manager.js의 MODALS 배열에 등록
  admin/     13개 — 관리자 탭 서브모듈 (admin-users, admin-charts, admin-export, admin-segmentation 등)
  utils/     9개  — dom.js($, setText, openModal), format.js, haptics.js, form-guard.js,
                    nutrition-text-parser.js, ux-polish.js, confirm-modal.js, index.js,
                    action-router.js(전역 data-action 이벤트 위임)
  tests/     1개  — calc.expert.test.js (node:test 기반, Vitest 미도입)
  scripts/        — dev-start.sh, copy-www.js, verify-cheers.mjs
  api/, functions/, tools/, android/, public/, www/, mockups/, docs/
```
**삭제된 탭:** finance, wine, movie, dev (경량화 2026-04). `render-*.js` 없음. Firestore 컬렉션(`wines`, `stocks`, `movies`)은 데이터 보존.
**부활된 탭:** calendar (2026-04-17 재도입, `render-calendar.js` + `calc.js calcDayScore`). 하단 탭바에 노출, 통계는 더보기 메뉴로.

## 🎯 등록된 탭 (app.js `switchTab()`)
1. `home` — 즉시 로드 (renderHome)
2. `workout` — 즉시 로드 (loadWorkoutDate + wtRecoverTimers + renderExpertTopArea)
3. `diet` — 즉시 로드 (loadWorkoutDate와 공유. workouts 컬렉션 한 도큐먼트에 식단 포함)
4. `calendar` — 레이지 (`_lazyRenderCalendar`) — 하단 탭바에 노출
5. `stats` — 레이지 (`_lazyRenderStats`) — 더보기 메뉴
6. `cooking` — 레이지 (`_lazyRenderCooking`)
7. `admin` — 레이지, admin 유저면 다른 탭을 admin으로 강제

## 📋 레시피: 운동 종류 추가 (예: swimming, running)

새 운동 유형을 추가할 때 건드려야 하는 파일과 위치:

### 1. `workout/` 디렉토리 (render-workout.js는 shim)
- [ ] `workout/state.js` — 상태 변수 추가 (예: `S.newType = false`, `S.newTypeData = {}`)
- [ ] `workout/load.js` — `loadWorkoutDate()`에서 `day.newType` 상태 복원
- [ ] `workout/status.js` — `wtToggleNewType()` 함수 생성 + export
- [ ] `workout/save.js` — `_buildSavePayload()`에 새 필드 추가 (한 곳만 수정하면 양쪽 저장 경로 반영)
- [ ] `workout/activity-forms.js` — 상세 입력 폼 이벤트/힌트가 있다면 여기 추가 (`_initTypeFormEvents`/`_initRunningEvents` 패턴)
- [ ] `workout/index.js` — 새 함수 re-export + `window.wtToggleNewType = wtToggleNewType;` 추가

### 2. `render-workout.js` (shim)
- [ ] `./workout/index.js`에서 가져오는 export 목록에 새 함수 추가

### 3. `workout-ui.js`
- [ ] `wtToggleType()` 함수에 `if (type === 'newType') wtToggleNewType();` 추가
- [ ] `wtResetStatus()`에 칩 ID 추가: `'wt-chip-newType'`
- [ ] 상세 섹션이 있다면 `wt-newType-section` 토글 로직 추가

### 4. `app.js`
- [ ] import 문에 `wtToggleNewType` 추가 (render-workout.js에서 re-export 필요)

### 5. `index.html`
- [ ] `wt-type-chips`에 칩 버튼 추가: `<button class="wt-type-chip" id="wt-chip-newType" onclick="wtToggleType('newType')">🏊 수영</button>`
- [ ] 상세 입력이 필요하면 `wt-detail-section` 블록 추가

### 6. `style.css`
- [ ] 상세 섹션 스타일은 TDS Mobile 토큰/Seed 토큰 사용 (ex-block 패턴 참고)

### 7. `calc.js` / `data.js` (Streak 연동이 필요한 경우만)
- [ ] `calc.js`의 `calcStreaks`/`isExerciseDaySuccess`에서 새 타입 인식
- [ ] `data.js`에서 관련 getter 추가

## 📋 레시피: 운동탭에 새 데이터 필드 추가

예: 런닝에 심박수 필드 추가

- [ ] `workout/state.js` — 상태 변수 (예: `S.runData.heartRate`)
- [ ] `workout/load.js` — `loadWorkoutDate()`에서 `day.runHeartRate`로 복원
- [ ] `workout/save.js` — `_buildSavePayload()`에 `runHeartRate: S.runData.heartRate` 추가 (한 곳만 수정)
- [ ] `workout/render.js` — 필요하면 렌더링 업데이트
- [ ] `index.html`에 입력 UI 추가
- [ ] 이벤트 바인딩 (`activity-forms.js`나 `exercises.js`의 `change` 핸들러 → `saveWorkoutDay`)

## 🏗️ 운동탭 Flow UI 상태 머신

상태 머신 로직은 `workout-ui.js`가 소유 (`wtSelectStatus`, `wtToggleType`).

```
[초기: wt-ask 표시]
  ↓ "운동 기록하기" 클릭 → workout-ui.js wtSelectStatus()
[wt-chosen + wt-show-type]         ← 칩 선택 영역 노출
  ↓ 칩 클릭 (gym, cf, running...) → workout-ui.js wtToggleType()
[해당 wt-detail-section.wt-open]   ← 상세 섹션 노출
  ↓ 날짜 변경 시
[_restoreFlowState()]              ← 저장된 데이터 기반 자동 복원
```

CSS 클래스:
- `wt-chosen` — "운동 기록/쉬었어요/건강이슈" 중 하나 선택된 상태
- `wt-show-type` — 운동 유형 칩 영역 노출
- `wt-open` — 개별 상세 섹션(헬스 종목, 런닝 폼, 메모 등) 열림

## 🧠 Expert Mode (`workout/expert.js` + `expert-mode.css`)
고급 사용자용 8-scene 위자드. 체육관/장비 등록, RPE/목표 근육 설정, 루틴 템플릿.
- 상태: `_settings.expert_preset` (Firestore)에 `goal, daysPerWeek, sessionMinutes, preferMuscles, avoidMuscles, forbiddenMovements, preferredRpe, draftGymId`
- CRUD: `data/data-workout-equipment.js` — `users/{uid}/gyms/{gymId}`, `users/{uid}/routine_templates/{id}`
- 모달: `modals/expert-onboarding-modal.js`, `gym-equipment-modal.js`, `routine-suggest-modal.js`, `routine-candidates-modal.js`, `insights-modal.js`
- workout 탭 진입 시 `window.renderExpertTopArea()` 호출로 배너 갱신

## 🍽️ AI 식단 파이프라인
- `workout/ai-estimate.js` — 사진 1-pass 추정 + Bayesian prior 보정
- `data/ai-food-profile.js` — 유저 식단 히스토리 prior (Phase 1: 메모리 전용)
- `data/korean-food-normalize.js` — 한국어 음식명 정규화 + kcal/100g prior 매핑 (Gemini 출력 표준화)
- `modals/nutrition-search-modal.js`, `nutrition-item-modal.js`, `nutrition-weight-modal.js`, `ai-estimate-banner-modal.js`

## 🎨 디자인 시스템: TDS Mobile (tossmini-docs.toss.im/tds-mobile)
- **기준:** TDS Mobile — 컬러 스케일 제외 모든 요소 적용
- **컬러만 커스텀:** 토마토 레드 `#fa342c` Primary, `#fdf0f0` BG, `#fed4d2` Light, `#fc6a66` Sub, `#ca1d13` Dark, `#921708` Deepest
- **Typography:** t1(30/40) → t7(13/19.5), st10(16/24) → st13(11/16.5), font-weight 700/600/500/400
- **Font Family:** `'Toss Product Sans', 'Tossface', 'SF Pro KR', ...` (TDS Mobile 풀 스택)
- **Transition:** `0.1s ease-in-out` (표준), `0.3s ease` (슬로우/탭)
- **Button:** sm(12px) / md(14px) / lg(17px) / xl(20px), font-weight 600
- **Badge:** sm(9px r8) / md(10px r9), font-weight bold
- **Tab:** min-width 64px, indicator 2px / 1px radius, font 13px, transition 0.3s ease
- **Switch:** 50x30px, r15, disabled opacity 0.3
- **TextField:** padding 14px 16px, r14, font 16px, line-height 1.5
- **ListRow:** min-height 44px, padding 12px 0, gap 16px, line-height 1.35
- **Modal:** content padding 32px 20px 20px 20px, title t4(20px/29px bold)
- **SearchField:** min-height 44px, r12, padding 8px 10px, font 16px
- **SegmentedControl:** container r14, item r12 padding 7px 12px, indicator r10
- **Loader:** 1.8s rotation, fade-in 0.3s delay 0.7s
- **Skeleton:** card r18, title r11, subtitle r9
- **ProgressBar:** 0.5s ease-in-out transform
- **Toast:** 3000ms auto-close, 0.1s ease-in-out
- **Seed 토큰도 유지:** 기존 ex-block 등 Seed 패턴은 호환 유지
  - 배경: `var(--seed-bg-layer)`, 테두리: `1px solid var(--seed-stroke-neutral)`
  - 라운딩: `var(--seed-r3)`, 패딩: `var(--seed-x4)`, 그림자: `var(--seed-s1)`
  - 입력: `var(--seed-bg-fill)`, `var(--seed-stroke-weak)`, `var(--seed-r2)`
  - 포커스: `border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-bg)`
- **새 UI 작성 시:** TDS Mobile 스펙 기준 필수. 임의 값 금지. 검증은 `tds-reviewer` 에이전트 호출.

## 📋 레시피: 토마토 사이클 정산 수정 시 주의

토마토 정산(`settleTomatoCycleIfNeeded`)은 여러 파일에 걸쳐 있음. 수정 시 전체 동기화:

- [ ] `calc.js` — `calcTomatoCycle()`, `evaluateCycleResult()`, `isExerciseDaySuccess()` (사이클 일수, 평가 로직)
- [ ] `home/tomato.js` — `settleTomatoCycleIfNeeded()` (정산 루프, 마이그레이션, 수확 모달)
- [ ] `home/farm.js` — `renderFarmDuolingo()`, `renderFarmCyworld()` (사이클 단계 표시, stages 배열)
- [ ] `home/unit-goal.js` — `renderUnitGoal()` (사이클 일수, 날짜 범위 표시)
- [ ] `home/index.js` — `renderHome()` (정산 호출 위치 — admin/non-admin 공통 실행 필수)

핵심 규칙:
- **사이클 일수 변경**(예: 4일→3일) 시 위 5개 파일 전부 수정
- **`evaluateCycleResult` 반환값 변경** 시 이를 소비하는 `home/tomato.js` 반드시 동기화
- **유저별 상태/플래그**는 `localStorage` 금지 → Firestore `tomato_state`에 저장
- **`unit_goal_start` 자동설정**은 admin 전용 경로(`renderUnitGoal`)가 아닌 `settleTomatoCycleIfNeeded` 공통 경로에서 처리

## 📋 레시피: 배포 커밋 체크리스트

배포용 커밋 전 반드시 확인:

- [ ] **SW 캐시 버전 범프** — `sw.js`의 `CACHE_VERSION` 날짜/버전 올렸는가? STATIC_ASSETS에 등록된 파일을 하나라도 수정했으면 필수.
- [ ] **import 의존성 파일 포함** — 커밋 대상 파일이 import하는 다른 파일에 미커밋 변경이 있는가? 있으면 같이 커밋.
  - `workout/*.js` → `data.js`, `workout/state.js` (상태/저장 변경 시 연쇄)
  - `render-workout.js` (shim) → `workout/index.js` (export 목록 동기화)
  - `home/tomato.js` → `calc.js`, `data.js` (export 추가/변경 시 같이 커밋)
  - `home/index.js` → `home/tomato.js` (함수 시그니처 변경 시)
  - `calc.js` 사이클 로직 변경 → `home/farm.js`, `home/unit-goal.js` 동기화
  - `data/*.js` 변경 → `data.js` 배럴의 re-export 동기화 확인
- [ ] **`sw.js` 자체도 커밋에 포함** — 버전만 올리고 커밋에서 빠뜨리면 의미 없음.
- [ ] **`git diff --stat`으로 미커밋 파일 확인** — 관련 변경이 남아있지 않은지 체크.
- [ ] **사진 필드 보존 확인** — `_buildSavePayload()`에 `bPhoto`, `lPhoto`, `dPhoto`, `sPhoto`, `workoutPhoto` 모두 포함되는지.

### 📋 레시피: 파일 위치 이동 (디렉토리 깊이 변화) 시 체크리스트

`workout/expert.js` → `workout/expert/onboarding.js` 같이 파일을 새 디렉토리로 옮기면 깊이 변화 때문에 상대 경로가 깨진다. 정적 import는 IDE/`node --check`가 잡지만 **동적 `await import()` 는 런타임에야 발견됨**. 회귀 사례: R3b 분리 후 "AI 로 정리하기" 5초만에 실패 (`await import('../data/data-core.js')` → 새 위치는 `'../../data/data-core.js'` 였어야).

분리/이동 직후 아래를 grep:
- [ ] **동적 import 전수**: `grep -nE "await import\(['\"][./]" <new-file>` — 모든 `'./'`/`'../'` 가 새 위치 기준으로 맞는지 확인.
- [ ] **fetch / new URL / SW register**: `grep -nE "(fetch|new URL|register)\(['\"][./]" <new-file>` — 같은 이유로 회귀 가능.
- [ ] **문자열 안의 경로**: `grep -nE "['\"]\.\./|['\"]\./" <new-file>` — DOM `<img src='./...'>` 같은 케이스.
- [ ] **호출부 import 경로**: 다른 파일이 옮겨진 모듈을 import 할 때 경로도 같이 바꿨는지 (`import { X } from './expert.js'` → `from './expert/onboarding.js'`).
- [ ] **브라우저에서 해당 기능 1회 실행** — `node --check` / `node --test` / `curl 200` 만으로는 동적 경로 검증 불가. 분리/이동 후 사용자 흐름(로그인, 모달 열기, 저장 등)을 한 번 직접 실행하는 게 유일한 신뢰 가능한 검증.

## 📁 파일 패턴
- 새 탭 엔트리: `render-*.js` (shim) + 실제 로직은 하위 디렉토리 (예: `workout/`, `home/`, `admin/`)
- 새 기능 모듈: `feature-*.js` (checkin, diet-plan, fatsecret, misc, nutrition, tutorial)
- 새 모달: `modals/*-modal.js` → `modal-manager.js`의 MODALS 배열에 등록
- 운동 탭 UX 상태 머신: `workout-ui.js` (wtSelectStatus, wtToggleType 등)
- 탭 네비게이션: `navigation.js` (드래그 정렬, 스와이프)
- DOM 유틸: `utils/dom.js` (`$`, `setText`, `openModal` 등)
- 탭 오케스트레이터: `app.js`에서 import + `switchTab()`에 등록

## 데이터 흐름
```
사용자 입력
  → workout/*.js (state 변경) 또는 home/*.js, render-*.js
  → data.js 배럴 (saveDay 등)
  → data/data-core.js (_cache 동기화 + Firestore setDoc)
  → document.dispatchEvent('sheet:saved') 또는 'cooking:saved'
  → app.js renderAll() → UI 갱신
```
- `sheet.js`(과거 날짜 편집 시트)도 `sheet:saved` 이벤트를 발생시킴
- 이벤트 트래킹은 `data/data-analytics.js`가 `_analytics/{dateKey}`로 일별 집계

## "go" 워크플로우
1. `@plan.md`에서 다음 미완료 체크박스 확인
2. 기존 파일 패턴과 위 규칙에 맞춰 구현
3. localhost에서 동작 확인 (`bash scripts/dev-start.sh`)
4. Conventional Commits (feat/fix/refactor/style/docs) 형식 커밋
5. `@plan.md` 진행 상태 업데이트

## 🤖 에이전트 코디네이션

`.claude/agents/`에 5개 전문 에이전트가 있다. "go" 또는 작업 지시 시 메인 세션이 코디네이터로서 적절한 에이전트를 **병렬 실행**한다.

### 에이전트 목록
| 에이전트 | 역할 | 모델 | 권한 |
|----------|------|------|------|
| `feature-dev` | 기능 구현, 버그 수정 ("go" 워크플로우) | sonnet | 전체 |
| `data-guardian` | setDoc 필드 감사, dual-save 경로 desync 탐지 | sonnet | read only |
| `tds-reviewer` | TDS Mobile 스펙 검사 (타이포, 컴포넌트, 토큰) | haiku | read only |
| `test-writer` | calc.js 순수 함수 단위 테스트 작성 | sonnet | 전체 |
| `refactor-architect` | 대형 파일 안전 분할 설계 (app.js/data.js/style.css) | opus | 전체 |

### Explore 에이전트 규칙 (플랜 모드)
- **최대 2개**만 사용. **파일 경계로 분리** (주제별 X):
  - 에이전트1: `calc.js`, `data.js`, `data/` — 순수 로직/데이터 모델
  - 에이전트2: `home/`, `workout/` — UI/렌더링/상태 머신
- 겹치는 파일 읽지 마. 파일 경계로 분리하면 중복이 거의 없음.
- "주제별"로 나누면 결국 같은 파일을 다 읽게 되므로 금지.

### Plan 에이전트 규칙
- Plan 에이전트가 **실패하면 직접 계획을 써**. 에이전트 재시도하지 마.

### 코디네이션 규칙
1. **기능 개발/버그 수정**: feature-dev(포그라운드) → 완료 후 data-guardian + tds-reviewer(백그라운드 병렬)
2. **테스트 보강**: test-writer (calc.js 순수 함수 우선)
3. **리팩토링**: data-guardian(베이스라인) → refactor-architect → data-guardian(검증) + `node --test tests/`

### 자동 트리거
- `workout/*.js`, `render-workout.js`, `data.js`, `data/*.js` 변경 → **data-guardian 필수 실행**
- `style.css` 또는 `index.html` 변경 → **tds-reviewer 필수 실행**
- `calc.js` 변경 → test-writer에게 관련 테스트 업데이트 요청
