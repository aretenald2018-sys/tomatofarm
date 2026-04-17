# 토마토팜 (dashboard3) 기술 아키텍처

## 1. 시스템 개요

건강/생산성 추적 PWA. 빌드 스텝 없는 Vanilla JS + Firebase 아키텍처. 단일 `index.html` SPA.

```
index.html (단일 SPA)
  ├── app.js              — 오케스트레이터: switchTab, 이벤트 바인딩, window.* 함수 등록, init()
  ├── render-*.js         — 탭 엔트리 shim (workout/admin/stats/cooking)
  ├── render-home.js      — 홈 탭 엔트리 (home/index.js 호출)
  ├── workout/            — 운동+식단 탭 실제 로직
  ├── home/               — 홈 탭 실제 로직
  ├── admin/              — 관리자 탭 실제 로직
  ├── modals/*-modal.js   — 모달 HTML 템플릿 (문자열 export)
  ├── data.js             — 배럴: re-export + loadAll/saveDay (데이터 접근점)
  │   └── data/
  │       ├── data-core.js               — Firebase init, 공유 상태, _col/_doc/_fbOp
  │       ├── data-auth.js               — 인증, 역할 체크, 비밀번호
  │       ├── data-account.js            — 계정 CRUD, 복구, 삭제
  │       ├── data-analytics.js          — 이벤트 집계 (`_analytics/{dateKey}`)
  │       ├── data-social.js             — 소셜 배럴 (하위 4개 모듈 re-export)
  │       │   ├── data-social-friends.js     — 친구, 소개, 랭킹
  │       │   ├── data-social-guild.js       — 길드 시스템
  │       │   ├── data-social-interact.js    — 방명록, 댓글, 알림, 좋아요, FCM
  │       │   └── data-social-log.js         — 로그인/액션 로그, 튜토리얼
  │       ├── data-workout-equipment.js  — Expert mode gym/routine_templates CRUD
  │       ├── ai-food-profile.js         — 유저 식단 prior (Phase 1: 메모리)
  │       ├── korean-food-normalize.js   — 음식명 정규화 + kcal prior 매핑
  │       ├── raw-ingredients.js         — 한국 상용 원재료 영양 DB (per 100g)
  │       ├── data-date.js               — 날짜 유틸 (dateKey, TODAY)
  │       ├── data-image.js              — 이미지 base64 변환
  │       ├── data-external.js           — 환율, Fear & Greed API
  │       └── data-helpers.js            — 정렬, 분기 키 유틸
  ├── calc.js             — 순수 비즈니스 로직 (사이드이펙트 없음)
  ├── feature-*.js        — checkin, diet-plan, fatsecret, misc, nutrition, tutorial
  ├── workout-ui.js       — 운동탭 상태 머신 (wtSelectStatus, wtToggleType)
  ├── farm-canvas.js      — 토마토 농장 캔버스 렌더링
  ├── modal-manager.js    — 29개 모달 동적 주입
  ├── navigation.js       — 탭 드래그 정렬, 스와이프
  ├── sheet.js            — 과거 날짜 편집 시트
  ├── ai.js               — Claude/Gemini 호출 래퍼
  ├── pwa-fcm.js          — FCM 푸시 구독
  ├── sw.js               — Service Worker (CACHE_VERSION 관리)
  └── 외부: Firebase, Claude API, Gemini, 식품안전처
```

## 2. 기술 스택

| 구분 | 기술 |
|------|------|
| 언어 | JavaScript ES6 modules (빌드 없음) |
| DB | Firebase Firestore |
| 호스팅 | Vercel + GitHub Pages |
| 모바일 | Capacitor 8.x (Android) |
| 함수 | Firebase Cloud Functions (`functions/`) |
| API 서버 | Node/Express (`tools/api-server.js`) — FatSecret, 식품DB 프록시 |
| 테스트 | `node:test` 기반, `tests/calc.expert.test.js` 1개 (Vitest 미도입) |
| 디자인 | **TDS Mobile** (tossmini-docs.toss.im/tds-mobile) — 컬러 스케일만 커스텀 |

## 3. 핵심 아키텍처 결정 (코드에서 읽기 어려운 것들)

### 왜 빌드 스텝이 없는가
1인 개발 + 빠른 배포가 우선. ES6 modules로 직접 import. 번들러 도입 시 Capacitor 빌드 파이프라인과 충돌 가능성. `scripts/copy-www.js`가 빌드 아닌 "정적 파일 복사" 역할.

### 왜 data.js(data/ 디렉토리)를 통해서만 데이터 접근하는가
- `_cache` 인메모리 캐시와 Firebase가 항상 동기화되어야 함
- 직접 Firestore 호출하면 캐시가 stale → 다른 탭에서 구 데이터 표시
- `saveDay()`는 저장 후 `_cache`를 업데이트하고 `sheet:saved` 이벤트 발생 → 이 체인이 끊기면 UI 갱신 안 됨
- **data.js는 배럴 모듈**: 16개 하위 모듈(data/*.js)을 re-export. 기존 `import { ... } from './data.js'` 호환 유지
- **data-core.js가 공유 상태 소유자**: db, _cache, _settings, _currentUser 등 모든 공유 상태는 data-core.js에서 관리. 의존 방향은 항상 core → 나머지 (순환 없음)

### 왜 saveWorkoutDay()와 _autoSaveDiet()가 분리되어 있는가
- `saveWorkoutDay()` — 명시적 저장 (운동 상태 변경, 세트 체크 등)
- `_autoSaveDiet()` — 음식 추가/삭제 시 자동 저장
- **둘 다 `_buildSavePayload()` 공통 헬퍼를 호출해 전체 day 객체를 setDoc** → 새 필드 추가 시 `_buildSavePayload()` 한 곳만 수정하면 양쪽 반영
- 역사적 이유로 분리되었고, 통합하면 좋지만 영향 범위가 넓어 리스크 있음

### window.* 노출 패턴
- HTML `onclick="함수명()"` 사용 → 함수가 window에 있어야 함
- ES6 module은 자동으로 window에 노출 안 됨
- `workout/index.js` 하단 `window.xxx = xxx;` 블록으로 수동 노출
- **새 export 함수를 HTML onclick에서 쓰려면 반드시 window에도 등록**

### 탭 로딩 전략 (app.js `switchTab`)
- **즉시 로드**: `home`, `workout`, `diet` (import 문으로 직접; workout과 diet는 같은 `workouts` 도큐먼트를 공유 → `loadWorkoutDate` 동일 호출)
- **레이지 로드**: `stats`, `cooking`, `admin` (app.js `_lazy*()` 함수로 동적 import)
- **Admin 강제**: admin 유저면 `switchTab('home')` 같은 호출도 `admin`으로 강제 치환됨
- **삭제된 탭**: calendar, finance, wine, movie, dev (경량화 2026-04) — `render-*.js` 없음. 컬렉션 데이터만 보존

### 왜 shim 패턴인가 (render-workout.js)
- `render-workout.js`는 `workout/index.js`를 re-export하는 얇은 shim
- 히스토리: 모놀리식 `render-workout.js`(>2000 줄)를 `workout/*.js` 11개로 분할. 기존 `import { ... } from './render-workout.js'`를 깨지 않기 위해 shim 유지
- shim에 새 함수를 추가하지 않으면 app.js에서 import 불가 → **새 공개 함수는 workout/index.js export + render-workout.js re-export 둘 다 해야 함**

## 4. 등록된 탭

| 탭 | 로딩 | 진입 동작 |
|----|------|-----------|
| `home` | 즉시 | `renderHome()` (home/index.js) |
| `workout` | 즉시 | `loadWorkoutDate(today)` + `wtRecoverTimers()` + `renderExpertTopArea()` |
| `diet` | 즉시 | `loadWorkoutDate(today)` (workout과 동일 도큐먼트) |
| `stats` | 레이지 | `_lazyRenderStats()` → render-stats.js |
| `cooking` | 레이지 | `_lazyRenderCooking()` → render-cooking.js |
| `admin` | 레이지 | `_lazyRenderAdmin()` → render-admin.js (admin 유저면 타 탭 → 강제 치환) |

## 5. Firebase 컬렉션

| 컬렉션 | 키 | 비고 |
|--------|-----|------|
| `workouts` | dateKey "2026-04-17" | **setDoc 전체 덮어쓰기** — 필드 누락 = 데이터 삭제. 운동+식단 통합 도큐먼트 |
| `users` | userId | 프로필, 설정, 식단 플랜, 권한 |
| `goals` | goalId | 목표 정의 |
| `quests` | questId | 일일 퀘스트 |
| `_settings` | 설정 키 (tomato_state, expert_preset 등) | 유저별 상태/플래그 |
| `_analytics` | dateKey | 이벤트 일별 집계 (`data-analytics.js`) |
| `users/{uid}/gyms` | gymId | Expert mode 체육관 등록 |
| `users/{uid}/routine_templates` | id | Expert mode 루틴 템플릿 |
| `stocks` | 심볼 | 주식 포트폴리오 (UI 삭제, 데이터 보존) |
| `wines` | wineId | 와인 기록 (UI 삭제, 데이터 보존) |
| `movies` | 월별 키 | 영화 목록 (UI 삭제, 데이터 보존) |

## 6. 워크아웃 데이터 구조 (workouts 컬렉션)

```javascript
{
  // 운동
  exercises: [{ muscleId, exerciseId, sets: [{kg, reps, setType, done}] }],
  cf: boolean, cf_skip: boolean, cf_health: boolean,
  gym_skip: boolean, gym_health: boolean,
  stretching: boolean, swimming: boolean, running: boolean,
  runDistance: number, runDurationMin: number, runDurationSec: number, runMemo: string,
  workoutDuration: number,       // 운동 총 시간 (초)
  wine_free: boolean,
  memo: string,

  // 식단
  breakfast: string, lunch: string, dinner: string, snack: string,
  bKcal: number, lKcal: number, dKcal: number, sKcal: number,
  bFoods: Array, lFoods: Array, dFoods: Array, sFoods: Array,
  bProtein/bCarbs/bFat: number, (l/d/s 동일)
  bOk/lOk/dOk/sOk: boolean,
  breakfast_skipped: boolean, lunch_skipped: boolean, dinner_skipped: boolean,

  // 사진 (base64) — 누락하면 setDoc 덮어쓰기로 삭제됨!
  bPhoto: string, lPhoto: string, dPhoto: string, sPhoto: string, workoutPhoto: string,
}
```

## 7. workout/ 모듈 구조 (11개 파일)

| 파일 | 역할 |
|------|------|
| `index.js` | 오케스트레이터: 서브모듈 re-export + `window.*` 등록 |
| `state.js` | 공유 상태 객체 `S` (운동/식단 모든 필드) |
| `load.js` | `loadWorkoutDate()` — Firestore → `S` 복원 + UI 갱신 |
| `save.js` | `saveWorkoutDay()`, `_autoSaveDiet()`, 공통 `_buildSavePayload()` |
| `status.js` | 운동/식단 토글 상태 (cf, gym, swimming, running, meal_skip, wine_free) |
| `render.js` | 칼로리 트래커, 식사 사진, 식단 UI 렌더링 |
| `exercises.js` | 세트 CRUD, 종목 피커/에디터, 운동 리스트 렌더링 |
| `timers.js` | 운동 타이머 + 세트 간 휴식 타이머 (프리셋 시트 포함) |
| `activity-forms.js` | 런닝/크로스핏/스트레칭/수영 상세 폼 이벤트 |
| `ai-estimate.js` | 사진 1-pass AI 음식 추정 (Bayesian prior 보정) |
| `expert.js` | Expert mode 8-scene 위자드 (gym/equipment/루틴) |

## 8. home/ 모듈 구조 (19개 파일)

| 파일 | 역할 |
|------|------|
| `index.js` | `renderHome()` 오케스트레이터 |
| `tomato.js` | 토마토 사이클 정산, 수확 모달 (`settleTomatoCycleIfNeeded`) |
| `farm.js` | 토마토 농장 단계별 시각화 (Duolingo/Cyworld 스타일) |
| `unit-goal.js` | 사이클 일수/날짜 범위 카드 |
| `hero.js` | 히어로 카드, 스트릭 대시보드, 리더보드, 마일스톤 |
| `today-summary.js` | 오늘 식단/운동 요약, 식단 목표 카드 |
| `goals-quests.js` | 목표/퀘스트, 미니 메모 체크리스트 |
| `friend-feed.js` | 친구 피드, 반응 토글 |
| `friend-profile.js` | 친구 프로필, 방명록, 댓글, 선물 |
| `guild-card.js` | 길드 리더보드 (페이지네이션 7/page) |
| `notifications.js` | 통합 알림 센터 (친구/길드/댓글) |
| `cheers-card.js` | 공개 응원 카드 (세션 캐시, 2-토마토 보호) |
| `cheer-card.js` | 미확인 응원 카드 렌더링, dedup |
| `personalize.js` | 홈 카드 순서/숨김 (`window.homeCardPersonalize`) |
| `streak-warning.js` | 스트릭 경고 배너 (저녁 9시 이후, 미확인 시) |
| `weekly-streak.js` | 주간 스트릭 미니 캘린더 (7일) |
| `welcome-back.js` | 복귀 환영 메시지 (로그인 간격/미확인/길드 순위 기반) |
| `admin-onboarding.js` | 관리자 모드 원타임 온보딩 배너 |
| `utils.js` | 홈 공통 유틸 (날짜, 월요일, 분기 경계) |

## 9. 데이터 흐름

```
사용자 입력
  → workout/*.js 또는 home/*.js (상태 변수 변경)
  → data.js 배럴 → data/data-core.js (Firestore + _cache)
  → document.dispatchEvent('sheet:saved')
  → app.js renderAll() (홈/통계/쿠킹 갱신)
```
- `sheet.js`(과거 날짜 편집) → `sheet:saved`
- `render-cooking.js` 저장 → `cooking:saved`
- 이벤트 트래킹: `data/data-analytics.js` → `_analytics/{dateKey}` 일별 집계

## 10. Streak 판정 로직

- **운동**: `getMuscles().length > 0 || getCF() || running || swimming` → 연속일 카운트
- **식단**: `dietDayOk()` = 3끼 모두 (굶었음 OR kcal > 0)
- **스트레칭/와인프리**: 각각 boolean 연속일 카운트
- 오늘부터 역순으로 조건 만족할 때까지 카운트 (`calc.js calcStreaks`)

## 11. 토마토 사이클 (게임화)

- `calc.js calcTomatoCycle()` — 사이클 일수/진행도 계산
- `calc.js evaluateCycleResult()` — 성공/실패 판정
- `home/tomato.js settleTomatoCycleIfNeeded()` — 정산 루프, 마이그레이션, 수확 모달
- 상태는 Firestore `_settings/tomato_state`에 저장 (localStorage 금지 — 기기 단위라 멀티 유저 안 됨)
- 정산 호출 위치는 `home/index.js renderHome()` — admin/비관리자 공통 경로에서 실행

## 12. Expert Mode

- 엔트리: `workout/expert.js` — 8-scene 위자드
- 상태: `_settings/expert_preset` — `{goal, daysPerWeek, sessionMinutes, preferMuscles, avoidMuscles, forbiddenMovements, preferredRpe, draftGymId}`
- 저장소: `data/data-workout-equipment.js` — `users/{uid}/gyms`, `users/{uid}/routine_templates`
- 모달: expert-onboarding, gym-equipment, routine-suggest, routine-candidates, insights
- 스타일: `expert-mode.css`

## 13. AI 식단 파이프라인

- 입력: 사진 → `workout/ai-estimate.js` (Gemini Vision 1-pass)
- 정규화: `data/korean-food-normalize.js` — 한국어 음식명 + kcal/100g prior
- 개인화: `data/ai-food-profile.js` — 유저 히스토리 기반 Bayesian prior (Phase 1: 메모리 전용, Firestore 미영속)
- 모달: `nutrition-search-modal.js`, `nutrition-item-modal.js`, `nutrition-weight-modal.js`, `ai-estimate-banner-modal.js`

## 14. 모달 시스템 (29개)

1. `modals/*-modal.js` → `export const MODAL_HTML` (HTML 문자열)
2. `modal-manager.js` → 앱 초기화 시 MODALS 배열을 순회해 모든 모달 DOM 주입 (cache key 관리)
3. `app.js _openModalStack[]` → ESC키로 최상위 닫기
4. 새 모달 추가: `modal-manager.js`의 MODALS 배열에 등록 + `modals/` 파일 생성

## 15. Service Worker

- `sw.js` `CACHE_VERSION` 변수 범프 → 신규 자산 페치
- `STATIC_ASSETS` 목록의 파일 수정 시 필수 범프
- `firebase-messaging-sw.js`는 FCM 푸시 전용 (별도 SW)
- 현재: `CACHE_VERSION = 'tomatofarm-v20260417z3-ai-food-profile'`

## 16. 에이전트 (`.claude/agents/`)

5개 전문 에이전트. 메인 세션이 코디네이터로 병렬 실행.

| 에이전트 | 모델 | 권한 | 용도 |
|----------|------|------|------|
| `feature-dev` | sonnet | 전체 | "go" 워크플로우, 기능 구현 |
| `data-guardian` | sonnet | read | setDoc 감사, dual-save desync |
| `tds-reviewer` | haiku | read | TDS Mobile 스펙 준수 |
| `test-writer` | sonnet | 전체 | calc.js 단위 테스트 |
| `refactor-architect` | opus | 전체 | 대형 파일 분할 설계 |
