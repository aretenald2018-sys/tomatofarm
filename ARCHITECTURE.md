# 토마토팜 (dashboard3) 기술 아키텍처

## 1. 시스템 개요

건강/생산성 추적 PWA. 빌드 스텝 없는 Vanilla JS + Firebase 아키텍처.

```
index.html (단일 SPA)
  ├── app.js              — 오케스트레이터: 탭 전환, 이벤트 바인딩, window.* 함수 등록
  ├── render-*.js         — 탭별 UI 모듈
  ├── modals/*-modal.js   — 모달 HTML 템플릿
  ├── data.js             — 배럴: re-export + loadAll/saveDay (데이터 접근점)
  │   └── data/
  │       ├── data-core.js           — Firebase init, 공유 상태, _col/_doc/_fbOp
  │       ├── data-auth.js           — 인증, 역할 체크, 비밀번호
  │       ├── data-account.js        — 계정 CRUD, 복구, 삭제
  │       ├── data-social.js         — 소셜 배럴 (하위 4개 모듈 re-export)
  │       │   ├── data-social-friends.js  — 친구, 소개, 랭킹
  │       │   ├── data-social-guild.js    — 길드 시스템
  │       │   ├── data-social-interact.js — 방명록, 댓글, 알림, 좋아요, FCM
  │       │   └── data-social-log.js      — 로그인/액션 로그, 튜토리얼
  │       ├── data-date.js           — 날짜 유틸 (dateKey, TODAY)
  │       ├── data-image.js          — 이미지 base64 변환
  │       ├── data-external.js       — 환율, Fear & Greed API
  │       └── data-helpers.js        — 정렬, 분기 키 유틸
  ├── calc.js             — 순수 비즈니스 로직 (사이드이펙트 없음)
  └── 외부: Firebase, Claude API, Gemini, 식품안전처
```

## 2. 기술 스택

| 구분 | 기술 |
|------|------|
| 언어 | JavaScript ES6 modules (빌드 없음) |
| DB | Firebase Firestore |
| 호스팅 | Vercel + GitHub Pages |
| 모바일 | Capacitor 8.x (Android) |
| 디자인 | **TDS Mobile** (tossmini-docs.toss.im/tds-mobile) — 컬러 스케일만 커스텀(토마토 레드) |

## 3. 핵심 아키텍처 결정 (코드에서 읽기 어려운 것들)

### 왜 빌드 스텝이 없는가
1인 개발 + 빠른 배포가 우선. ES6 modules로 직접 import. 번들러 도입 시 Capacitor 빌드 파이프라인과 충돌 가능성.

### 왜 data.js(data/ 디렉토리)를 통해서만 데이터 접근하는가
- `_cache` 인메모리 캐시와 Firebase가 항상 동기화되어야 함
- 직접 Firestore 호출하면 캐시가 stale 됨 → 다른 탭에서 구 데이터 표시
- `saveDay()`는 저장 후 `_cache`를 업데이트하고 이벤트를 발생시킴 → 이 체인이 끊기면 UI 갱신이 안 됨
- **data.js는 배럴 모듈**: 12개 하위 모듈(data/*.js)을 re-export. 기존 `import { ... } from './data.js'` 호환 유지
- **data-core.js가 공유 상태 소유자**: db, _cache, _settings, _currentUser 등 모든 공유 상태는 data-core.js에서 관리. 의존 방향은 항상 core → 나머지 (순환 없음)

### 왜 saveWorkoutDay()와 _autoSaveDiet()가 분리되어 있는가
- `saveWorkoutDay()`: 명시적 저장 (운동 상태 변경, 세트 체크 등)
- `_autoSaveDiet()`: 음식 추가/삭제 시 자동 저장
- **둘 다 전체 day 데이터를 setDoc으로 저장** → 새 필드 추가 시 양쪽 다 수정 필수
- 역사적 이유로 분리되었고, 통합하면 좋지만 영향 범위가 넓어 리스크 있음

### window.* 노출 패턴
- HTML에서 `onclick="함수명()"` 사용 → 함수가 window에 있어야 함
- ES6 module은 자동으로 window에 노출 안 됨
- render-workout.js 하단에 `window.xxx = xxx;` 블록으로 수동 노출
- **새 export 함수를 HTML onclick에서 쓰려면 반드시 window에도 등록**

### 탭 로딩 전략
- **즉시 로드**: home, workout (import 문으로 직접)
- **레이지 로드**: stats, cooking, admin (app.js `_lazy()` 함수로 동적 import)
- **삭제됨**: calendar, finance, wine, movie, dev (경량화 2026-04)
- 코어 탭은 앱 시작 시 무조건 필요하므로 즉시 로드

## 4. Firebase 컬렉션

| 컬렉션 | 키 | 비고 |
|--------|-----|------|
| `workouts` | dateKey "2026-04-07" | **setDoc 전체 덮어쓰기** — 필드 누락 = 데이터 삭제 |
| `users` | userId | 프로필, 설정, 식단 플랜 |
| `goals` | goalId | 목표 정의 |
| `quests` | questId | 일일 퀘스트 |
| `stocks` | 심볼 | 주식 포트폴리오 (UI 삭제, 데이터 보존) |
| `wines` | wineId | 와인 기록 (UI 삭제, 데이터 보존) |
| `movies` | 월별 키 | 영화 목록 (UI 삭제, 데이터 보존) |

## 5. 워크아웃 데이터 구조 (workouts 컬렉션)

```javascript
{
  // 운동
  exercises: [{ muscleId, exerciseId, sets: [{kg, reps, setType, done}] }],
  cf: boolean, cf_skip: boolean, cf_health: boolean,
  gym_skip: boolean, gym_health: boolean,
  stretching: boolean, swimming: boolean, running: boolean,
  runDistance: number, runDurationMin: number, runDurationSec: number, runMemo: string,
  workoutDuration: number,  // 운동 총 시간 (초)
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

## 6. 데이터 흐름

```
사용자 입력
  → render-*.js (상태 변수 변경)
  → data.js saveDay() (Firebase + _cache)
  → document.dispatchEvent('sheet:saved')
  → app.js renderAll() (홈/캘린더/통계 갱신)
```

## 7. Streak 판정 로직

- **운동**: `getMuscles().length > 0 || getCF()` → 연속일 카운트
- **식단**: `dietDayOk()` = 3끼 모두 (굶었음 OR kcal > 0)
- **스트레칭/와인프리**: 각각 boolean 연속일 카운트
- 오늘부터 역순으로 조건 만족할 때까지 카운트

## 8. 모달 시스템

1. `modals/*-modal.js` → `export const MODAL_HTML` (HTML 문자열)
2. `modal-manager.js` → 앱 초기화 시 모든 모달 DOM 주입
3. `app.js` `_openModalStack[]` → ESC키로 최상위 닫기
4. 새 모달 추가: modal-manager.js의 MODALS 배열에 등록
