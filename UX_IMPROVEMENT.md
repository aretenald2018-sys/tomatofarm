# UX 개선 계획 — 토마토팜 (dashboard3)

> 작성일: 2026-04-17
> 범위: 핵심 탭 (홈, 운동, 식단) + 범용 모달/인터랙션
> 관점: 정보 구조·흐름 / 컴포넌트 일관성 / 피드백·마이크로 인터랙션 / 접근성·가독성
> 참고: `CLAUDE.md`, `ARCHITECTURE.md`, `prd.md`, TDS Mobile (https://tossmini-docs.toss.im/tds-mobile/)

---

## 0. 요약 — 한눈에 보는 개선 우선순위

| 우선순위 | 카테고리 | 대표 이슈 | 영향 |
|---|---|---|---|
| P0 (Critical) | 데이터 안전 | 종목/세트/음식 삭제에 확인 없음, 폼 미저장 이탈 경고 없음 | 데이터 유실 |
| P0 | 피드백 | 저장/상태 변경 후 토스트 누락, `alert()` 39곳 잔존 | 사용자 불안, 중복 탭 |
| P1 (High) | 정보 구조 | 관리자 모드에서 핵심 탭 무음 숨김, 날짜 네비 "오늘" 배지 부재 | 방향 상실 |
| P1 | 가독성 | 터치 타깃 44px 미만(타이머/칩/네비), 뮤티드 텍스트 대비 | 탭 실수, 접근성 |
| P2 (Medium) | 마이크로 인터랙션 | 탭 레이지 로딩 시 스켈레톤 부재, 이미지 업로드 단계 피드백 부재 | 체감 속도 |
| P2 | 컴포넌트 일관성 | 동일 의미 버튼이 카드마다 다른 스타일 (CTA/칩/텍스트 버튼) | 학습 비용 증가 |
| P3 (Low) | 가독성 | 숫자/날짜 로케일 포맷 불일치, 라벨-인풋 `<label for>` 연결 누락 | 접근성 소폭 개선 |

**전체 33개 UX 이슈** 중 **P0: 5개 / P1: 10개 / P2: 15개 / P3: 3개**.

---

## 1. 정보 구조·흐름 (IA & Flow)

### 1.1 [P0] 관리자 모드가 핵심 탭을 무음으로 숨김
- **위치**: `app.js` `_syncNavigationForCurrentRole()`, `navigation.js`
- **증상**: `isAdmin()` 이 true가 되면 home / workout / stats 탭이 `display: none` 처리되며 사용자는 admin 탭으로 강제 이동. 설명 배너 없음.
- **영향**: "앱이 고장났나?" 혼란. Admin 계정을 공유하는 관리자-게스트 구조에서 특히 심각.
- **개선안**:
  1. 로그인 직후 TDS Banner 패턴으로 `관리자 모드로 로그인되었습니다. 일반 탭은 숨겨집니다` 1회성 안내.
  2. 네비게이션 상단에 현재 모드 칩 `[관리자]` 노출 + 모드 전환 버튼.
  3. `localStorage`가 아니라 `_settings.ui_mode_ack`에 "안내 봤음" 저장 (CLAUDE.md 멀티유저 규칙 준수).

### 1.2 [P1] 날짜 네비게이션에 "오늘" 시각 앵커 부재
- **위치**: `workout/render.js` (`_renderDateLabel`), `home/today-summary.js`
- **증상**: 과거/미래 날짜 이동 시 오늘을 한눈에 찾을 수 없음. 텍스트 컬러만 미묘하게 변함.
- **영향**: 잘못된 날짜에 기록 입력 → 데이터 오염. 특히 자정 전후 세션에서 흔함.
- **개선안**:
  1. 날짜 라벨 옆에 항상 `[오늘]` TDS Badge(sm, 9px r8) 노출.
  2. "오늘로 이동" 버튼을 sticky 헤더에 항시 표시 (현재 `.wt-today-btn`은 과거 날짜일 때만 존재).
  3. 미래 날짜는 색상 외에 `⚠ 미래 날짜` 인라인 헬퍼 텍스트.

### 1.3 [P1] 폼 미저장 이탈 경고 없음
- **위치**: `modals/nutrition-item-modal.js`, `modals/diet-plan-modal.js`, `modals/goal-modal.js`, `sheet.js`
- **증상**: 긴 입력 폼 작성 중 뒤로가기/모달 바깥 탭 / 날짜 전환하면 입력 사일런트 소실.
- **영향**: 신뢰도 하락. 사용자가 복잡한 폼을 회피.
- **개선안**:
  1. 폼 마운트 시 초기 스냅샷 저장 → close 시 diff 있으면 확인 모달 "저장하지 않은 변경이 있어요" (Discard / Save).
  2. `beforeunload` 리스너로 페이지 이탈 시도 감지 (PWA 한정).
  3. 공통 헬퍼 `utils/form-guard.js`를 만들어 모달들이 `registerFormGuard(modalEl)` 한 줄로 적용되게.

### 1.4 [P2] 탭 전환 시 레이지 로드 지연(100~300ms) 무피드백
- **위치**: `app.js` `_lazy()`, `switchTab()` — stats/cooking/admin 탭
- **증상**: 스켈레톤/로더 없이 빈 화면.
- **영향**: 체감 속도 저하, "먹통" 오해.
- **개선안**:
  1. TDS Loader(1.8s rotation, fade-in 0.3s delay 0.7s)를 기본 탭 컨테이너에 즉시 삽입.
  2. Stats/Admin 탭은 placeholder 스켈레톤 카드 2장 노출 후 실제 렌더 덮어쓰기.
  3. `switchTab()` 시작 시 `showTabLoader(tabId)` 공통 함수 도입.

### 1.5 [P2] 홈 카드 순서가 개인화 불가 + 비어있는 카드 감추지 않음
- **위치**: `home/index.js` `renderHome()` 카드 순서 고정
- **증상**: 목표/퀘스트가 비어 있어도 빈 카드가 자리를 차지. 사용자 컨텍스트(체중 감량 중 vs 유지 중)에 따라 우선순위 바꿀 수 없음.
- **영향**: 첫 스크롤에서 가치 낮은 카드를 먼저 보게 됨.
- **개선안**:
  1. 비어있는 카드(목표 0개, 퀘스트 0개)는 "목표를 추가해보세요" 엠프티 CTA 카드 하나로 축소.
  2. 카드 순서를 `_settings.home_card_order`에 저장. 편집 모드에서 드래그 정렬 (navigation.js 드래그 패턴 재사용).

### 1.6 [P2] 운동 탭 상태 머신의 뒤로가기 모호함
- **위치**: `workout-ui.js` `wtSelectStatus()`, `wtToggleType()`
- **증상**: "운동했어요" → 칩 선택 → 상세 섹션 열림. 상세 섹션에서 칩을 다시 눌러 닫으려 하면 상태가 어떻게 변하는지 불명확(데이터는 유지? 초기화?).
- **영향**: 이미 입력한 데이터가 사라질까 두려워 상태를 못 바꿈.
- **개선안**:
  1. 상세 섹션 우상단에 "접기" X 버튼 명시.
  2. 칩 해제 시 입력된 데이터가 있으면 inline confirm: "기록을 유지한 채 접을까요?"
  3. 상태 전환 애니메이션 0.3s ease (TDS slow) 통일.

### 1.7 [P1] 식단 카드 CTA 가시성 약함
- **위치**: `home/today-summary.js:17-21, 100-105`
- **증상**: "기록이 없어요 · 기록하기" — 일반 텍스트 + 작은 밑줄 버튼. 다른 CTA(예: goals-quests의 primary 버튼)와 위계 역전.
- **영향**: 신규 사용자가 식단 기록 진입점을 놓침 (핵심 기능인데).
- **개선안**:
  1. 엠프티 상태를 TDS Mobile FilledButton md(padding 12px 20px, r12, weight 600)로 승격.
  2. 이모지 + 명확한 동사: `🍽️ 오늘 식단 기록하기`
  3. CTA 옆에 "어제 식단 복사" secondary 액션 추가 (반복 입력 감소).

---

## 2. 컴포넌트 일관성 (Component Consistency)

### 2.1 [P1] 동일 의미 "삭제" 버튼이 위치마다 다른 형태
- **위치**: `modals/ex-editor-modal.js` (🗑️ 종목 삭제 텍스트 버튼), `workout/index.js` (세트 × 아이콘), `feature-nutrition.js` (음식 제거 텍스트 링크)
- **증상**: 3가지 스타일(이모지 버튼 / X 아이콘 / 텍스트 링크)로 파편화. 위험도 시각 신호도 제각각.
- **개선안**:
  1. TDS Mobile에 준하는 "Destructive Action" 컴포넌트 정의: `.tds-btn-destructive` 클래스 (border 없음 + text `var(--diet-bad)` + icon 🗑️).
  2. 인라인 삭제(세트, 음식 제거)는 Swipe-to-delete 또는 Undo Toast 패턴으로 통일.
  3. 3초 내 실행 취소 가능한 경우에만 confirm 생략 허용.

### 2.2 [P2] 식단 3끼 스킵 토글 vs. 운동 "쉬었어요" 토글 패턴 불일치
- **위치**: `workout/render.js` `_renderMealSkippedToggles()`, `workout-ui.js` wtSelectStatus
- **증상**: 식단은 작은 체크박스, 운동은 세그먼티드 컨트롤 형태의 버튼.
- **영향**: 같은 "스킵" 개념이 두 컴포넌트로 갈림.
- **개선안**:
  1. 둘 다 TDS SegmentedControl(container r14, item r12, indicator r10)로 통일:
     - 식단 끼니별: `[먹음] [안먹음]` 2-segment
     - 운동: `[운동했어요] [쉬었어요] [건강이슈]` 3-segment
  2. 활성 표시는 TDS 기본 indicator 애니메이션(0.3s ease) 재사용.

### 2.3 [P2] "복사" / "재사용" 버튼 스타일 난립
- **위치**: `workout/activity-forms.js:20-36` (직전 기록 복사), `feature-diet-plan.js` (어제 식단), `home/hero.js` (메시지)
- **증상**: 어떤 건 `<a>`, 어떤 건 `<button>` 작은 회색, 어떤 건 primary pill.
- **개선안**:
  - 모두 TDS TextButton(`.tds-text-btn`, font-weight 500, r8)로 통일.
  - 이모지 prefix 규칙: `↻` (복사/재사용), `+` (추가), `✎` (편집).

### 2.4 [P3] 히어로 카드/농장 카드/위클리 스트릭 카드 간 카드 스펙 불일치
- **위치**: `home/hero.js`, `home/farm.js`, `home/weekly-streak.js`, `home/cheers-card.js`
- **증상**: 일부 카드는 border+shadow, 일부는 shadow only, 일부는 border only. padding 도 16/20/24 혼재.
- **개선안**:
  - TDS Card 표준(r12, padding 16px, border 1px + shadow 없음)을 `.tds-card`로 이미 정의되어 있음 → 홈 카드를 모두 마이그레이션.
  - 강조 카드(수확 완료 등 축하)는 `.tds-card.primary-bg` 변형 만들어 1-level 위계 추가.

---

## 3. 피드백 & 마이크로 인터랙션

### 3.1 [P0] `alert()` 잔존 39곳 → `showToast()` 일괄 전환
- **위치**: 13개 파일에 39개 발생. 특히 `admin/admin-cheers.js`(6곳), `modals/nutrition-item-modal.js`(15곳)
- **근거**: CLAUDE.md 42행 "사용자 액션에 피드백 토스트 필수, alert() 사용 금지".
- **영향**: 모달 UX 단절. Chrome/iOS에서 alert 디자인 달라 브랜드 훼손.
- **개선안**:
  1. **일괄 치환**: `alert(msg)` → `showToast(msg, 2000, 'info' | 'success' | 'error')`.
  2. 확인이 필요한 경우(`confirm()`은 모두 커스텀 confirm 모달로 대체 (`utils/confirm-modal.js` 신규).
  3. 치환 스크립트: `scripts/migrate-alerts.mjs` 로 정규식 대응 + 수동 검수 (타입 판단은 사람이).

### 3.2 [P0] 운동 상태 선택 후 저장 피드백 부재
- **위치**: `workout-ui.js:27-61` `wtSelectStatus()`, `workout/save.js`
- **증상**: "운동했어요" 탭 → UI는 바뀌지만 저장 완료 토스트 없음. Firebase 쓰기 실패 시에도 무음.
- **개선안**:
  1. `saveWorkoutDay()` 성공 분기에서 `showToast('상태 저장됨', 1500, 'success')` 호출.
  2. 실패 시 `showToast('저장 실패. 다시 시도하세요', 3000, 'error')`.
  3. 저장 중 버튼에 `disabled + 스피너 아이콘` 100ms 이상 지속 시에만 표시(짧으면 깜빡임).

### 3.3 [P0] 종목 삭제 / 음식 삭제 확인 없음 + 실행 취소 없음
- **위치**: `modals/ex-editor-modal.js`(종목 삭제), `workout/index.js`(wtRemoveFoodItem, wtRemoveSet 추정)
- **증상**: 누르면 즉시 삭제. 과거 기록까지 날아가는 종목 삭제는 특히 파괴적.
- **개선안**:
  1. **치명적 삭제(종목, 계정)**: 커스텀 확인 모달 + "삭제" 버튼은 `var(--diet-bad)` + 2초 딜레이 누르기(long-press).
  2. **경미한 삭제(세트 1개, 음식 1개)**: 즉시 삭제 + 3초 Undo Toast(`showToast('삭제됨', 3000, 'info', { action: '실행 취소', onAction: restore })`).
  3. Toast에 action 버튼 기능을 `showToast` 시그니처에 추가 필요.

### 3.4 [P1] 사진 업로드 진행 단계 피드백 부재
- **위치**: `modals/nutrition-item-modal.js:44-75`, `data-image.js`
- **증상**: 갤러리/카메라 선택 → 파일 선택 후 앱이 멈춘 듯 보임. 큰 이미지 base64 변환이 UI 스레드 블록.
- **영향**: 사용자가 업로드 버튼 연타 → 중복 요청.
- **개선안**:
  1. 3단계 toast/progress: `업로드 중 → OCR 분석 중 → 완료`.
  2. 이미지 변환을 `requestIdleCallback` 또는 `Worker`로 이동 (경량화 대상).
  3. 업로드 버튼 누르는 순간 TDS Loader 삽입 + 버튼 disabled.

### 3.5 [P1] 스트릭 끊김 경고 없음
- **위치**: `home/hero.js`, `calc.js` `calcStreaks`
- **증상**: 23:59에 아무것도 안 남긴 채로 지나면 다음 날 스트릭이 0으로 초기화. 사용자 기대 배신.
- **개선안**:
  1. 오후 9시 이후 홈 상단 배너: `⏰ 오늘 기록이 없어요. 자정 전에 입력하면 스트릭이 유지돼요` (TDS Banner).
  2. FCM 알림 옵션: `streak_warning` on/off 스위치 (settings-modal).
  3. 실패 다음 날에는 "만회 모드" 안내 배너 — 부활 메커니즘 검토.

### 3.6 [P2] 탭 순서 변경 / 설정 저장 토스트 부재
- **위치**: `navigation.js:35-48` drop handler
- **증상**: 드래그로 탭 순서 바꾸면 저장은 되지만 토스트 없음.
- **개선안**: `showToast('탭 순서 저장됨', 1500, 'info')` 호출.

### 3.7 [P2] 오프라인 상태 명확한 배너 없음
- **위치**: `index.html` `.sync-bar`, `sw.js`
- **증상**: "동기화 연결 중..." 메시지만 스몰 텍스트로 노출. 오프라인에서도 로컬 저장 가능한지 불명확.
- **개선안**:
  1. `navigator.onLine` 변화 감지 → 오프라인이면 상단 배너: `🔌 오프라인. 입력은 자동 저장되고 연결 시 동기화됩니다`.
  2. 온라인 복귀 시 `✓ 동기화 완료` 1.5초 토스트.

### 3.8 [P2] 운동/식단 자동 저장과 명시 저장 혼재로 사용자 혼선
- **위치**: `workout/save.js` `saveWorkoutDay()` vs `_autoSaveDiet()`
- **근거**: ARCHITECTURE.md 3.3행 "역사적 이유로 분리".
- **영향**: 어떤 변경이 즉시 저장되는지 사용자는 모름.
- **개선안**:
  1. 모든 변경은 "조용한 자동 저장" + 마지막 저장 시각 표시(`마지막 저장 1분 전`, 홈 카드 헤더 또는 탭 상단).
  2. 수동 저장 버튼은 제거하고 대신 "저장됨 ✓" 상태 인디케이터만 유지.
  3. 자동 저장 실패 시에만 빨간 badge + 재시도 버튼 노출.

### 3.9 [P3] 햅틱 피드백 부재(Capacitor Android)
- **위치**: 앱 전역
- **증상**: 스트릭 증가/목표 달성 같은 축하 순간에 촉각 피드백 없음.
- **개선안**: Capacitor `@capacitor/haptics` 도입. 이벤트:
  - `light` — 탭 일반
  - `medium` — 저장 성공
  - `heavy` — 수확/레벨업
  - 설정에서 on/off.

---

## 4. 접근성·가독성 (Accessibility & Readability)

### 4.1 [P1] 터치 타깃 44px 미만 다수
- **위치**:
  - `index.html:470-472` 휴식 타이머 `-15 / +15 / 스킵` 버튼
  - `style.css:1826-1828` `.wt-today-btn` padding 5px 12px → 실효 높이 ~28px
  - `style.css` `.wt-type-chip` (운동 유형 칩) 추정 ~36px
- **기준**: Apple HIG 44px, WCAG AA 44x44 권장, TDS Mobile ListRow min-height 44px.
- **개선안**:
  1. 모든 인터랙티브 요소에 `min-height: 44px; min-width: 44px;` 전역 규칙 추가.
  2. 칩은 최소 `padding: 10px 14px` + border-radius 보존.
  3. 실제 디바이스에서 DevTools "Show tap targets" 오버레이로 재검증.

### 4.2 [P1] 뮤티드 텍스트 컬러 대비 미달 의심
- **위치**: `style.css` `--text-tertiary`, `--muted` 사용처 (힌트/보조 텍스트)
- **증상**: "직전(MM/DD) 기록 불러오기"급 보조 텍스트가 배경 대비 3:1 미만 가능성.
- **개선안**:
  1. 컬러 토큰 점검: `--text-tertiary`를 배경 `--surface` 기준 4.5:1 보장하도록 상향.
  2. 다크모드에서도 별도 검증(토마토팜은 기본 다크 사용).
  3. Axe DevTools 실행 → 모든 위반 수집 → 이 문서에 추가.

### 4.3 [P2] 타이포그래피 스케일 부분적 준수
- **위치**: `.sheet-title 17px`, `.modal-title 17px`, `.section-category-title 15px` 등
- **증상**: TDS t1(30)→t7(13) 7단 스케일에 들어가지 않는 임의 값(17px 등) 혼재.
- **영향**: 시각 위계 혼란, 디자인 시스템 이탈.
- **개선안**: TDS_AUDIT.md 1장 "Typography" 참조. 여기서는 UX 관점만: 모달 제목은 t4(20/29), 섹션 타이틀은 t6(15/22.5) 고정.

### 4.4 [P2] 숫자/날짜 로케일 포맷 누락
- **위치**: 열량·매크로(정수 표시는 통일됐으나 천 단위 구분자 없음), 날짜(`MM/DD` vs `M월 D일` 혼재)
- **개선안**:
  1. 공통 포맷 유틸 `utils/format.js`: `fmtKcal(n)`, `fmtDate(d, style)`, `fmtWeight(kg)`.
  2. 전체 렌더 코드를 이 유틸로 마이그레이션 (grep으로 `toFixed`, `Math.round` 호출 지점 찾아 치환).

### 4.5 [P2] 폼 라벨-인풋 연결 누락
- **위치**: `modals/nutrition-item-modal.js:27-40`, `index.html` CF/러닝 폼
- **증상**: `<div>라벨</div><input>` 구조. 스크린 리더가 필드 의미를 읽지 못함.
- **개선안**:
  1. 모든 입력에 `<label for="id">` + `<input id="id">` 페어.
  2. 아이콘 전용 버튼에 `aria-label` 추가 (예: 🗑️ → `aria-label="삭제"`).
  3. 모달 제목에 `role="dialog"` + `aria-labelledby="modal-title-id"`.

### 4.6 [P3] 다이얼로그 초점 관리 부재
- **위치**: `modal-manager.js`, `app.js` `_openModal`
- **증상**: 모달 열릴 때 첫 번째 포커스 가능 요소로 포커스 이동하지 않음. ESC로 닫혀도 이전 트리거로 포커스 복귀 안 함.
- **개선안**: `openModal(modal, trigger)` 시그니처로 확장. 열 때 `modal.querySelector('[autofocus], input, button').focus()`, 닫을 때 `trigger.focus()`.

### 4.7 [P3] 이모지가 정보 전달의 전부인 지점
- **위치**: 운동 유형 칩(🏋️ 헬스, 🏃 러닝, 🧘 스트레칭 등)
- **증상**: 이모지가 플랫폼별로 다르게 렌더. 색맹/시력 낮은 사용자에게 식별 어려움.
- **개선안**: 이모지 + 텍스트 라벨 쌍을 의무화 (대부분 이미 텍스트 포함. 아이콘 전용 지점만 감사).

---

## 5. 오류 상태 & 엠프티 상태

### 5.1 [P1] 검색 결과 없음 메시지 부재
- **위치**: `modals/ex-picker-modal.js`, `modals/nutrition-search-modal.js`
- **증상**: 검색어에 맞는 항목 없으면 결과 영역이 그냥 비어있음.
- **개선안**:
  - `<div class="empty-state">🔍 검색 결과가 없어요<br/><button>새 항목 추가</button></div>`
  - 검색어 길이 ≤ 1일 때는 "2글자 이상 입력하세요" 힌트.

### 5.2 [P2] 네트워크 실패 UI 부재
- **위치**: `fatsecret-api.js`, `data-external.js`, Gemini/Claude API 호출 지점
- **개선안**:
  1. 실패 시 TDS Banner: `연결 상태를 확인하세요 · 재시도`.
  2. 자동 재시도 지수 백오프 1회(2s, 5s) 후 UI에 노출.

### 5.3 [P2] Firebase 읽기 제한 초과 시 UX
- **위치**: `data/*.js`
- **개선안**: 쿼터 초과 에러 코드 감지 → "오늘 사용량이 많아요. 잠시 후 다시 시도" 친절 메시지.

---

## 6. 구현 로드맵

### Phase A — 데이터 안전망 & 피드백 정비 (1~2주, P0)
**목표**: 데이터 유실·무음 실패를 0건으로.

- [ ] `utils/confirm-modal.js` 신규 — 모든 파괴적 액션은 이 헬퍼로
- [ ] `utils/form-guard.js` 신규 — 모달 폼 이탈 감지
- [ ] `showToast`에 `action` 버튼 지원 추가 (실행 취소 UX)
- [ ] `alert()` 39곳 → `showToast()` 일괄 치환 (파일 13개)
- [ ] `confirm()` 사용처 → 커스텀 confirm modal
- [ ] 운동 상태/식단 저장 완료 토스트 삽입
- [ ] 세트/음식 삭제에 Undo Toast 3초 창 적용
- [ ] 종목 삭제는 확인 모달 + long-press 2초

### Phase B — 정보 구조 & 네비게이션 (1주, P1)
**목표**: "내가 어디에 있나" 1초 내 파악.

- [ ] 관리자 모드 진입 시 onboarding 배너
- [ ] 날짜 네비 "오늘" 배지 상시 노출
- [ ] sticky "오늘로" 버튼
- [ ] 식단/운동 엠프티 CTA를 primary 버튼으로 승격
- [ ] 홈 카드 개인화(빈 카드 축소, 순서 저장)

### Phase C — 컴포넌트 일관성 & TDS 정합 (2주, P1~P2)
**목표**: TDS_AUDIT.md와 동시 진행. 중복 방지를 위해 세부는 TDS_AUDIT.md에.

- [ ] 모든 "삭제" 버튼 `.tds-btn-destructive` 로 통일
- [ ] 식단 스킵 / 운동 상태를 TDS SegmentedControl로 통일
- [ ] 홈 카드 `.tds-card` 마이그레이션
- [ ] "복사/재사용" 버튼 TDS TextButton 치환

### Phase D — 피드백·마이크로 인터랙션 (1주, P2)
- [ ] 레이지 탭 전환 시 스켈레톤/로더 기본 적용
- [ ] 사진 업로드 3단계 progress toast
- [ ] 오프라인 배너
- [ ] 스트릭 경고 배너(저녁 9시 이후)
- [ ] 자동 저장 상태 인디케이터 ("저장됨 ✓ · 방금")

### Phase E — 접근성·가독성 (1~2주, P1~P3)
- [ ] 터치 타깃 44px 전역 감사 + 수정
- [ ] 뮤티드 텍스트 컨트라스트 검증 + 토큰 조정
- [ ] `<label for>` 라벨 연결 + `aria-label` 추가
- [ ] 모달 포커스 트랩 & 복귀
- [ ] 로케일 포맷 유틸 도입

### Phase F — 햅틱 & 폴리시 (0.5주, P3)
- [ ] Capacitor Haptics 도입
- [ ] 축하 모먼트에 heavy haptic + 토마토 셰이크
- [ ] 탭/저장에 light haptic

---

## 7. 측정 지표 (KPI)

| 지표 | 현재(추정) | 목표 | 측정 방법 |
|---|---|---|---|
| 일일 운동 기록율 | - | +15% | `workouts` 쓰기 이벤트 일별 집계 |
| 식단 3끼 완입력율 | - | +20% | `dietDayOk()` true 비율 |
| 모달 이탈 후 복귀율 | - | 80%+ | form-guard 무시 횟수 |
| 삭제 후 undo 사용률 | - | ≥15% | Undo toast 액션 이벤트 |
| 스트릭 중단 → 재시작율 | - | +25% | `currentStreak == 1 && prevStreak > 3` 케이스 추적 |
| 터치 오류율 (mis-tap) | - | -30% | 50ms 이내 reverse 탭 감지 |

계측 추가는 `data-social-log.js`의 액션 로그에 이벤트 타입을 신설해 기록.

---

## 8. 리스크 & 의존성

| 리스크 | 영향 | 완화 |
|---|---|---|
| 일괄 alert→toast 치환 중 회귀 | 중 | 치환 후 주요 플로우 수동 시나리오 테스트 |
| 모달 form-guard 도입으로 기존 "X로 닫기" UX 저해 | 중 | diff 없으면 guard 건너뛰기 |
| 터치 타깃 44px 강제로 레이아웃 깨짐 | 하 | 각 컴포넌트별 스모크 테스트, 특히 칩 가로스크롤 |
| Haptic 남용으로 사용자 거부감 | 하 | 기본 light만, 나머지 옵트인 |
| 스트릭 경고 배너 반복 노출 피로 | 중 | 1일 1회 + 사용자가 이미 기록한 경우 미노출 |

---

## 9. 참고 교차 문서

- 디자인 시스템 정합성: **TDS_AUDIT.md**
- 구현 순서/체크박스: **plan.md** — "Phase 현재: 기능 개발" 아래에 본 문서의 Phase A~F를 복사 권장
- 커뮤니케이션/검증 규칙: `docs/COMMUNICATION_RULES.md`
- 과거 사고 레슨: CLAUDE.md "🔥 과거에 터졌던 것들" — Phase A 실행 시 반드시 함께 읽기
