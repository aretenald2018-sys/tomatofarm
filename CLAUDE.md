# 토마토팜 (dashboard3) - AI 컨텍스트 가이드

## 프로젝트 개요
건강/생산성 추적 PWA. Vanilla JS(ES6), Firebase, Vercel. 빌드 스텝 없는 단일 index.html.
- **참조 문서:** @ARCHITECTURE.md (구조 레퍼런스), @prd.md (제품 요구사항), @plan.md (작업 진행)

## ⚠️ 절대 규칙 (위반 시 버그/장애)
1. **Firebase 직접 호출 금지** — 모든 CRUD는 `data.js`의 getter/setter만 사용. 뷰에서 Firestore API 절대 금지.
2. **setDoc은 전체 덮어쓰기** — 필드 하나라도 빠뜨리면 기존 데이터 삭제됨. 사진(`bPhoto`, `lPhoto` 등) 누락하면 사진 날아감.
3. **배포 금지** — 코드 변경 중 push/배포 절대 금지. localhost 확인 후 유저가 직접 `tomatofarm` 리모트에만 push.
4. **순수 로직은 calc.js** — BMR, 칼로리, 스트릭 계산 등 사이드이펙트 없는 함수만.

## 🔥 과거에 터졌던 것들 (반드시 확인)
- `saveWorkoutDay()`와 `_autoSaveDiet()` 두 곳에서 **동일한 필드를 저장**함. 새 필드 추가 시 **반드시 양쪽 다** 수정해야 함. 한쪽만 수정하면 다른 경로로 저장될 때 필드가 누락됨.
- `window.*`에 함수를 노출하지 않으면 HTML의 `onclick="함수명()"` 이 작동 안 함. render-workout.js 하단의 `window.xxx = xxx` 블록 확인.
- `app.js`에서 `import { ... } from './render-workout.js'`에 새 함수를 추가하지 않으면 다른 모듈에서 호출 불가.
- 사진 필드(`bPhoto`, `lPhoto`, `dPhoto`, `sPhoto`, `workoutPhoto`)를 저장 객체에 빠뜨리면 setDoc 전체 덮어쓰기로 인해 사진이 삭제됨.

## 📋 레시피: 운동 종류 추가 (예: swimming, running)

새 운동 유형을 추가할 때 건드려야 하는 파일과 위치:

### 1. `render-workout.js`
- [ ] 상단에 상태 변수 추가: `let _newType = false;`
- [ ] `loadWorkoutDate()`: `day.newType`에서 상태 복원
- [ ] `wtToggleNewType()` export 함수 생성
- [ ] `saveWorkoutDay()`: 저장 객체에 `newType: _newType` 추가
- [ ] `_autoSaveDiet()`: **동일하게** 저장 객체에 추가 (이거 빠뜨리면 버그)
- [ ] `_restoreFlowState()`: 기존 데이터 있을 때 칩/섹션 자동 복원
- [ ] 하단 `window.wtToggleNewType = wtToggleNewType;` 추가

### 2. `app.js`
- [ ] import 문에 `wtToggleNewType` 추가
- [ ] `wtToggleType()` 함수에 `if (type === 'newType') wtToggleNewType();` 추가
- [ ] `wtResetStatus()`에 칩 ID 추가: `'wt-chip-newType'`
- [ ] 상세 섹션이 있다면 `wt-newType-section` 토글 로직 추가

### 3. `index.html`
- [ ] `wt-type-chips`에 칩 버튼 추가: `<button class="wt-type-chip" id="wt-chip-newType" onclick="wtToggleType('newType')">🏊 수영</button>`
- [ ] 상세 입력이 필요하면 `wt-detail-section` 블록 추가

### 4. `style.css`
- [ ] 상세 섹션 스타일은 Seed Design 토큰 사용 (ex-block 패턴 참고)

### 5. `data.js` (Streak 연동이 필요한 경우만)
- [ ] getMuscles() 등에서 새 타입 인식하도록 추가

## 📋 레시피: 운동탭에 새 데이터 필드 추가

예: 런닝에 심박수 필드 추가

- [ ] `render-workout.js` 상태 변수에 추가 (예: `_runData.heartRate`)
- [ ] `loadWorkoutDate()`에서 `day.runHeartRate`로 복원
- [ ] `saveWorkoutDay()` 저장 객체에 `runHeartRate: _runData.heartRate` 추가
- [ ] **`_autoSaveDiet()`에도 동일하게 추가** ← 이거 빠뜨리면 음식 추가 시 필드 날아감
- [ ] `index.html`에 입력 UI 추가
- [ ] 이벤트 바인딩 (`change` → saveWorkoutDay)

## 🏗️ 운동탭 Flow UI 상태 머신

```
[초기: wt-ask 표시]
  ↓ "운동 기록하기" 클릭
[wt-chosen + wt-show-type]  ← 칩 선택 영역 노출
  ↓ 칩 클릭 (gym, cf, running...)
[해당 wt-detail-section.wt-open]  ← 상세 섹션 노출
  ↓ 날짜 변경 시
[_restoreFlowState()]  ← 저장된 데이터 기반으로 위 상태 자동 복원
```

CSS 클래스 의미:
- `wt-chosen`: "운동 기록하기/쉬었어요/건강이슈" 중 하나를 선택한 상태
- `wt-show-type`: 운동 유형 칩 영역이 보이는 상태
- `wt-open`: 개별 상세 섹션(헬스 종목, 런닝 폼, 메모 등)이 열린 상태

## 🎨 디자인 시스템: TDS Mobile (tossmini-docs.toss.im/tds-mobile)
- **기준:** TDS Mobile (Toss Design System Mobile) — 컬러 스케일 제외 모든 요소 적용
- **컬러만 커스텀:** 토마토 레드 `#fa342c` Primary, `#fdf0f0` BG, `#fed4d2` Light, `#fc6a66` Sub
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
- **새 UI 작성 시:** TDS Mobile 스펙 기준 필수. 임의 값 금지.

## 📁 파일 패턴
- 새 탭: `render-*.js`
- 새 모달: `modals/*-modal.js`
- 탭 오케스트레이터: `app.js`에서 import + `switchTab()`에 등록
- 모달 등록: `modal-manager.js`의 MODALS 배열

## 데이터 흐름
```
사용자 입력 → render-*.js → data.js (saveDay) → Firebase + _cache
  → document.dispatchEvent('sheet:saved') → app.js renderAll() → UI 갱신
```

## "go" 워크플로우
1. `@plan.md`에서 다음 미완료 체크박스 확인
2. 기존 파일 패턴과 위 규칙에 맞춰 구현
3. localhost에서 동작 확인
4. Conventional Commits (feat/fix/refactor) 형식 커밋
5. `@plan.md` 진행 상태 업데이트
