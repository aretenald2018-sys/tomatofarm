# Project Plan

## 작업 진행 방법

### "go" 명령 시
1. plan.md에서 다음 미완료 체크박스 찾기
2. 해당 작업 구현 (CLAUDE.md 규칙/레시피 준수)
3. localhost에서 동작 확인 (`bash scripts/dev-start.sh`)
4. COMMIT: 커밋 (feat:/fix:/refactor:/style:/docs:)
5. plan.md 체크박스 업데이트

### 작업 완료 시
1. 모든 변경사항 커밋 완료 확인
2. localhost에서 최종 테스트
3. plan.md 체크박스 [x] 업데이트
4. 다음 미완료 작업으로 이동

---

## Phase 1: 개발 기반 정비 ✅
**목표**: AI 코딩 효율화를 위한 문서 체계 구축

- [x] CLAUDE.md 생성 — 프로젝트 규칙, 컨벤션, 워크플로우 정의
- [x] ARCHITECTURE.md 보강 — 전체 시스템 아키텍처 추가
- [x] plan.md 생성 — 마일스톤, 체크리스트, "go" 워크플로우
- [x] prd.md 생성 — 제품 요구사항 문서
- [x] 커밋 메시지 규칙 통일 — feat:/fix:/refactor: 접두사
- [x] `.claude/agents/` 5개 전문 에이전트 세팅 (feature-dev, data-guardian, tds-reviewer, test-writer, refactor-architect)
- [x] 문서 최신화 (2026-04-17) — data/ 16개 파일, workout/ 11개 파일, home/ 19개 파일 반영

## Phase 2: 코드 품질 개선
**목표**: 핵심 로직에 테스트 안전망 확보

- [x] API 키 하드코딩 제거 — Anthropic/AlphaVantage 키 localStorage로 이동 (`config.js` getter)
- [x] 테스트 인프라 초기 세팅 — `tests/calc.expert.test.js` (`node:test` 프레임워크)
- [ ] Vitest 도입 여부 결정 — 현재는 `node --test tests/` 수동 실행. Vitest로 마이그레이션하거나 현 구조 공식화
- [ ] calc.js 테스트 확충 — calcDietMetrics, dietDayOk, calcStreaks, calcTomatoCycle, evaluateCycleResult
- [ ] data.js 순수 유틸 테스트 — `data/data-date.js`의 dateKey, `data/data-helpers.js` 정렬/분기 키
- [ ] package.json `scripts.test` 정의 — `node --test tests/**/*.test.js`
- [ ] Gemini/식품안전처 키 보안 — `config.js` 하드코딩을 localStorage 또는 서버 프록시로 이동

## Phase 3: 구조 리팩토링
**목표**: 대형 파일 분할로 유지보수성 향상 (테스트 확보 후 진행)

- [ ] `app.js` 분할 검토 (app-init, app-tabs, app-events)
- [ ] `data.js` 배럴 유지하되 내부 의존성 간소화 (현재 `data/` 16파일로 이미 분할 완료)
- [ ] `style.css` 분할 검토 — 탭별/컴포넌트별 CSS 모듈
- [ ] Git 브랜치 전략 도입 (main → dev → feature)

## Phase 현재: 기능 개발

### 2026-04-18 영양정보 파이프라인 리팩토링 🛠
설계: `@NUTRITION_REFACTOR_PLAN.md`

**Phase A — 데이터 정규화 + 순수 로직 (테스트 용이)** ✅
- [x] `calc.js` `convertNutrition(base, toGrams)` 순수 함수 추가 (+ `validateNutritionConsistency`, `pickDefaultServing`)
- [x] `data/nutrition-normalize.js` 신규 — CSV/공공API/raw/로컬DB/레시피/OCR → canonical NutritionItem 변환기 (`serializeForStorage` 포함)
- [x] `tests/calc.nutrition.test.js` 35개 케이스 — per_100g/per_serving/ml 환산, 라운딩, 레거시 재환산, integration (전부 PASS)

**Phase B — 영양성분표 파싱 개선** ✅
- [x] `ai.js` `_NUTRITION_RULES_KO` 재작성: STEP 2에 컬럼 disambiguate 규칙 6단계 명시. `%영양성분기준치`/`%DV` 값 금지 경고. `totalAmount`/`per100` 필드 추가. STEP 6 자체 검증(kcal≈4C+4P+9F ±25%)
- [x] `utils/nutrition-text-parser.js`: `_extractField` 가 `%`/`％` 단위 숫자를 스킵하도록 재작성. `_extractServingInfo` 신규 — "1회 제공량 N (g|ml)", "총 내용량 N (g|ml)", "100ml당/100g당" 감지. 동적 servingSize/servingUnit 반환. kcal-매크로 불일치 감지 시 confidence 0.55로 하향
- [x] `tests/calc.nutrition.test.js` 에 parseNutritionRegex 케이스 6개 추가 (1회 제공량/100g당/100ml당/%DV 혼합/kcal 불일치/표 감지)

**Phase C — 검색 UX + 단위 드롭다운** ✅
- [x] `modals/nutrition-weight-modal.js` 전면 재작성:
  - `_toCanonical(item)` 헬퍼 — CSV/레거시/공공API 아무 shape이든 canonical NutritionItem로 변환
  - 단위 `<select>` 드롭다운 (`servings[]` + `직접 입력…` 옵션)
  - 수량 ½/1/2/3 프리셋 버튼 + 자유 배수 입력
  - `calc.js convertNutrition()` 기반 실시간 환산 (g ↔ ml 자동 라벨)
  - 저장 시 `servingRef` 메타(servingId/label/multiplier/baseGrams/unit) + `serializeForStorage`로 canonical + 레거시 필드 병존 저장
- [x] `modals/nutrition-item-modal.js` `saveNutritionItemFromModal` — unit 문자열에서 숫자+단위(g|ml) 재추출, 실패 시 파서 servingSize/servingUnit 신뢰, 최종 fallback만 100g. (과거: 숫자 없으면 조용히 100g 덮어쓰기)
- 비고: `feature-nutrition.js _renderNutritionRow` 의 isCSV 분기는 호환성 유지 목적으로 유지. 실제 아이템 소비(모달 진입)는 `_toCanonical`이 일괄 정규화하므로 신호 오염 없음.

**Phase D — 검증 & 회귀 방지** ✅
- [x] `sw.js` `CACHE_VERSION` → `tomatofarm-v20260418z4-nutrition-refactor` + `STATIC_ASSETS`에 `./data/nutrition-normalize.js` 추가
- [x] 전 8개 변경파일(calc/ai/텍스트파서/정규화/모달×2/feature/sw) `node --check` 구문 통과
- [x] `node --test tests/*.test.js` — 총 126개 (expert 27 / score 58 / nutrition 41) 전원 PASS
- [ ] 로컬 수동 테스트 (유저 수행): 가공식품 라벨 사진/텍스트, 원재료 검색, 1인분 음식 검색, ml 음료, 기존 저장 아이템 재로드

### 2026-04-17 캘린더 탭 신설 ✅
하단 탭 `통계`를 `캘린더`로 교체하고, 통계는 `더보기` 메뉴로 이동. 일자별 100점 만점 점수 + (섭취/소모/체중) 3지표 텍스트로 표시. 셀 클릭 시 항목별 점수 breakdown 모달.
- [x] `index.html` 하단 탭바 `stats` 버튼 제거 → `calendar` 버튼(📅) 신설, 더보기 메뉴에 `📊 통계` 추가
- [x] `index.html` `#tab-calendar` 패널 추가 (`#calendar-root` 마운트)
- [x] `data/data-core.js` `DEFAULT_TAB_ORDER`=['home','diet','workout','calendar','cooking','stats']`, `DEFAULT_VISIBLE_TABS`에 calendar 추가
- [x] `data.js` `_LIVE_TABS`에 `calendar` 허용
- [x] `app.js` `_lazyRenderCalendar()` 추가 + `switchTab`/`renderAll` 케이스 추가
- [x] `calc.js` `calcBurnedKcal(day, weightKg)` 순수함수 — MET 기반 운동 소모칼로리 (부위별 MET 매핑: chest 6.0 / back 6.5 / lower 7.0 / glute 6.5 / shoulder 5.0 / abs 4.0 / bicep 3.5 / tricep 3.5, 세트당 2분 가정. 런닝 속도별(6~11 MET), 수영 6.0, CF 8.0)
- [x] `calc.js` `calcDayScore(ctx)` 순수함수 — 100점 만점, **최저 70점 하한**. 배점: 칼로리 12 / 탄단지 5 / 운동 8 / 체중 3 / 완결 2 (합 max 30). 대부분의 날이 90점 이상 유지. band: great(95+)/good(90+)/soso(80+)/bad(<80 = 70~79)/none
- [x] `tests/calc.score.test.js` 57개 테스트 전원 통과 (재배점 반영)
- [x] `render-calendar.js` 재설계 — 게이지바 제거, 셀에 점수+섭취/소모/체중 텍스트, 월 평균 점수 카드, 좌우 화살표
- [x] `modals/calendar-day-modal.js` + `render-calendar.js._openDay` — 점수 breakdown 5항목 표시
- [x] `style.css` TDS Mobile 스펙 (t6/t7 타이포, 세그먼트 r10/r12/r14, border 띠로 점수 밴드)
- [x] `sw.js` `CACHE_VERSION` → `tomatofarm-v20260417z9-calendar-score` + STATIC_ASSETS에 2개 파일 추가

### 2026-04-17 레거시 기능 클린업 (플래시 버그 제거) ✅
로그인 시 구 레거시 UI가 잠깐 렌더링된 뒤 홈탭이 오버라이드하는 플래시 현상 수정.
- [x] 플래시 원인 진단: `DEFAULT_TAB_ORDER`에 존재하지 않는 'monthly' 탭이 포함되어, 저장된 `tab_order`가 비어있지 않은 유저는 있지도 않은 `#tab-monthly` 패널을 잠깐 타겟팅
- [x] `data/data-core.js` `DEFAULT_TAB_ORDER`에서 'monthly' 제거 → `['home','workout','cooking','stats']`
- [x] `data/data-core.js` `_settings` 기본값에서 `streak_settings: {fontSizeMode, cellWidthMode}` 제거 (삭제된 캘린더 탭 잔재)
- [x] `data.js` `_sanitizeTabList` 헬퍼 추가: 저장된 tab_order에서 계열 탭(monthly/calendar/finance/wine/movie/dev) 필터링
- [x] `data.js` `_defaultTitles`에서 `stocks: '📈 주가 · RSI'` 제거 (재무 탭 잔재)
- [x] `data.js` `getStreakSettings`/`saveStreakSettings` export + window 노출 제거
- [x] `index.html` 중복된 `streak-settings-modal` HTML 블록 + `openStreakSettingsModal`/`closeStreakSettingsModal`/`saveStreakSettingsAndClose` 인라인 스크립트 삭제 (존재하지 않는 `window.renderCalendar` 호출)
- [x] 고아 모듈 삭제: `modals/streak-settings-modal.js`, `modals/loa-add-modal.js`, `www/render-loa.js`
- [x] `home/hero.js` `renderDashboard()`/`calcCFStreak()` 제거 (존재하지 않는 `dash-*` DOM 대상)
- [x] `style.css` Dashboard Board 섹션(`.dash-*`) + 라이트 모드 변형 + `@media` 변형 제거 (46줄)
- [x] `navigation.js` touchstart 필터에서 `.dash-board`, `.stock-panel` 제거
- [x] `home/goals-quests.js` `applyAllSectionTitles()` keys에서 'stocks' 제거
- [x] `scripts/copy-www.js` targets에서 `'wine-data.js'` 제거
- [x] `sw.js` `CACHE_VERSION` 범프 → `tomatofarm-v20260417z5-legacy-cleanup`
- 보존: Firebase 컬렉션(wines, cal_events, finance_*, movies) — 데이터는 삭제하지 않음
- 검증: `node --check`로 전 파일 syntax 통과, grep으로 레거시 참조 0건 확인

### 2026-04-17 AI Food Profile Phase 1 ✅
- [x] `data/ai-food-profile.js` — 유저 식단 히스토리 prior (메모리 전용)
- [x] `data/korean-food-normalize.js` — 한국어 음식명 정규화 + kcal/100g prior
- [x] `workout/ai-estimate.js` — 1-pass Bayesian 추정
- [x] `sw.js` CACHE_VERSION 범프 → `tomatofarm-v20260417z3-ai-food-profile`

### 2026-04 Expert Mode ✅
- [x] `workout/expert.js` — 8-scene 위자드
- [x] `data/data-workout-equipment.js` — gym/routine_templates CRUD
- [x] 모달 5종 (expert-onboarding, gym-equipment, routine-suggest, routine-candidates, insights)
- [x] `expert-mode.css`

### 2026-04-08 UI 개선 3건 ✅
- [x] 프로필 댓글 "등록"/"남기기" 버튼 Tonal 스타일로 변경 (friend-profile.js)
- [x] 칼로리 카드 단/탄/지 매크로 정수 표시 (render-workout.js)
- [x] 히어로카드 듀오링고 스타일 이웃 통합 문구 (hero.js)
  - **구현 중 발견한 버그**: `updateHeroSocialProof()`가 `renderFriendFeed()`에서만 호출되어, 오늘 활동한 이웃이 없으면 메시지가 업데이트되지 않았음. `renderLeaderboard()`에서도 주간 리더보드 이웃 데이터로 호출하도록 추가 수정.
  - social-proof 영역 왼쪽 정렬 + 이웃 이름/핵심어 `<strong>` 강조 + 말투 활발하게 변경

---

## 리스크 관리

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 테스트 없이 리팩토링 | 회귀 버그 | Phase 2 테스트 확충 후 Phase 3 진행 |
| Gemini/식품DB 키 노출 | 보안 위험 | Phase 2에서 localStorage/서버 프록시 이동 |
| 대형 파일 복잡도 | 유지보수 어려움 | Phase 3에서 단계적 분할. `data.js`는 이미 완료, `app.js`/`style.css`가 남음 |
| setDoc 전체 덮어쓰기 | 필드 누락 시 데이터 손실 | `data-guardian` 에이전트 필수 실행 (workout/data 변경 시) |
| SW 캐시 미갱신 | 배포 후 구버전 파일 서빙 | `STATIC_ASSETS` 변경 시 `CACHE_VERSION` 범프 체크리스트 |
