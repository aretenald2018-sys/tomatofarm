# 운동/식단탭 ↔ Streak탭 아키텍처

## 📊 데이터 흐름

```
운동/식단 탭 (render-workout.js)
    ↓ saveDay() 호출
    ↓ Firebase 저장
    ↓
데이터층 (data.js)
    ↓ _cache 업데이트
    ↓ calcStreaks() 호출
    ↓
Streak 탭 (render-calendar.js)
    ↓ renderCalendar()
    ↓
UI 렌더링 (style.css)
```

---

## 🔄 핵심 데이터 구조

### 워크아웃 데이터 (Firebase: `workouts` 컬렉션)
```javascript
{
  // 키: dateKey(y,m,d) = "2026-03-28"

  // ── 운동 데이터 ──
  exercises: [
    { muscleId, exerciseId, sets: [{kg, reps, setType, done}] }
  ],
  cf: boolean,              // 크로스핏 완료
  cf_skip: boolean,         // 크로스핏 의도적 미실시
  cf_health: boolean,       // 크로스핏 건강 이슈
  gym_skip: boolean,        // 헬스 의도적 미실시
  gym_health: boolean,      // 헬스 건강 이슈
  stretching: boolean,      // 스트레칭
  wine_free: boolean,       // 와인프리데이

  // ── 식단 데이터 ──
  breakfast: string,        // 메모 (선택)
  lunch: string,           // 메모 (선택)
  dinner: string,          // 메모 (선택)
  snack: string,           // 메모 (선택)

  bKcal: number,           // 아침 칼로리 (음식 DB 합계)
  lKcal: number,           // 점심 칼로리
  dKcal: number,           // 저녁 칼로리
  sKcal: number,           // 간식 칼로리

  bFoods: Array,           // 아침 음식 [{name, grams, kcal, protein, carbs, fat}]
  lFoods: Array,           // 점심 음식
  dFoods: Array,           // 저녁 음식
  sFoods: Array,           // 간식 음식

  breakfast_skipped: boolean,  // 아침 굶었음
  lunch_skipped: boolean,      // 점심 굶었음
  dinner_skipped: boolean,     // 저녁 굶었음

  memo: string,            // 운동 메모
}
```

---

## 📝 데이터층 함수 (data.js)

### 저장 함수
| 함수 | 역할 | 호출처 |
|------|------|--------|
| `saveDay(key, data)` | 운동/식단 데이터 저장 → Firebase + _cache 업데이트 | render-workout.js |
| `dateKey(y,m,d)` | "2026-03-28" 형식 키 생성 | render-workout.js, render-calendar.js |

### 조회 함수 (Streak탭 사용)
| 함수 | 반환값 | Streak 표시 |
|------|--------|----------|
| `getMuscles(y,m,d)` | muscle ID 배열 | 헬스 row: 배열.length > 0 → 🏋️ |
| `getCF(y,m,d)` | boolean | 크로스핏 row: true → 🔥 |
| `getGymSkip(y,m,d)` | boolean | 헬스 row: true → ✗ |
| `getGymHealth(y,m,d)` | boolean | 헬스 row: true → ✚ (health-issue) |
| `getCFSkip(y,m,d)` | boolean | 크로스핏 row: true → ✗ |
| `getCFHealth(y,m,d)` | boolean | 크로스핏 row: true → 🏥 |
| `getBreakfastSkipped(y,m,d)` | boolean | 식단 row 판정 참고 |
| `getLunchSkipped(y,m,d)` | boolean | 식단 row 판정 참고 |
| `getDinnerSkipped(y,m,d)` | boolean | 식단 row 판정 참고 |
| `getDiet(y,m,d)` | {breakfast, lunch, dinner, snack, bKcal, lKcal, dKcal, sKcal, ...} | (내부 사용) |

### 핵심: dietDayOk 함수
```javascript
export const dietDayOk = (y,m,d) => {
  const dt = getDiet(y,m,d);
  const bSkip = getBreakfastSkipped(y,m,d);
  const lSkip = getLunchSkipped(y,m,d);
  const dSkip = getDinnerSkipped(y,m,d);

  // 아무 식사 기록 없으면 null (표시 안함)
  if (!dt.breakfast && !dt.lunch && !dt.dinner && !bSkip && !lSkip && !dSkip)
    return null;

  // 칼로리 충족 또는 굶었음으로 판정
  const bOk = bSkip || dt.bKcal > 0;    // 아침: 굶었음 OR kcal > 0
  const lOk = lSkip || dt.lKcal > 0;    // 점심: 굶었음 OR kcal > 0
  const dOk = dSkip || dt.dKcal > 0;    // 저녁: 굶었음 OR kcal > 0

  return bOk && lOk && dOk;  // 3끼 모두 OK면 true
};
```

### Streak 계산
```javascript
export function calcStreaks() {
  // 운동: getMuscles() || getCF() 연속 날짜 카운트
  // 식단: dietDayOk() === true 연속 날짜 카운트
  // 스트레칭: getStretching() 연속 날짜 카운트
  // 와인프리: getWineFree() 연속 날짜 카운트
  return { workout, diet, stretching, wineFree };
}
```

---

## 🎨 CSS 클래스 매핑

### 헬스 row (운동 데이터)
```css
.cell                    /* 기본 셀 */
.cell.gym-on            /* getMuscles().length > 0 → 🏋️ 아이콘 표시 */
.cell.skipped           /* getGymSkip() === true → ✗ 표시 */
.cell.health-issue      /* getGymHealth() === true → ✚ 표시 */
.cell.today-cell        /* 오늘 셀 (점선 테두리) */
.cell.future            /* 미래 날짜 (투명도 0.2) */
```

### 크로스핏 row (운동 데이터)
```css
.cell.cf-on             /* getCF() === true → 🔥 아이콘 표시 */
.cell.skipped           /* getCFSkip() === true → ✗ 표시 */
.cell.health-issue      /* getCFHealth() === true → 🏥 표시 */
```

### 식단 row (식단 데이터)
```css
.cell.diet-ok           /* dietDayOk() === true (3끼 모두 OK) → ✅ */
.cell.diet-bad          /* dietDayOk() === false (3끼 중 하나라도 미충족) → ❌ */
.cell.diet-skipped      /* 굶었음 플래그만 있음 → 🚫 */
```

### 버튼 스타일 (운동/식단 탭)
```css
.act-btn                /* 기본 버튼 */
.act-btn#wt-gym-btn-done.active       /* 헬스 완료 선택 */
.act-btn#wt-gym-btn-skip.active       /* 헬스 미실시 선택 */
.act-btn#wt-gym-btn-health.active     /* 헬스 건강이슈 선택 */
.act-btn#wt-cf-btn-done.active        /* 크로스핏 완료 선택 */
.act-btn#wt-cf-btn-skip.active        /* 크로스핏 미실시 선택 */
.act-btn#wt-cf-btn-health.active      /* 크로스핏 건강이슈 선택 */

.diet-skip-btn.active   /* 굶었음 버튼 선택 */
```

### 셀 아이콘
```css
.cell-icon              /* 기본 아이콘 (display: none) */
.cell.gym-on .cell-icon       /* display: block 해서 🏋️ 표시 */
.cell.cf-on .cell-icon        /* display: block 해서 🔥 표시 */
.cell.diet-ok .cell-icon      /* display: block 해서 ✅ 표시 */
.cell.diet-bad .cell-icon     /* display: block 해서 ❌ 표시 */
.cell.diet-skipped .cell-icon /* display: block 해서 🚫 표시 */
.cell.skipped .cell-icon      /* display: block 해서 ✗ 표시 */
.cell.health-issue .cell-icon /* display: block 해서 ✚/🏥 표시 */
```

---

## 🔌 운동/식단 탭 주요 함수 (render-workout.js)

### 상태 관리
```javascript
let _date = {y, m, d};              // 현재 선택 날짜
let _exercises = [];                // 운동 종목
let _gymStatus = 'done'|'skip'|'health'|'none';  // 헬스 상태
let _cfStatus = 'done'|'skip'|'health'|'none';   // 크로스핏 상태
let _stretching = boolean;          // 스트레칭
let _wineFree = boolean;            // 와인프리
let _breakfastSkipped = boolean;    // 아침 굶었음
let _lunchSkipped = boolean;        // 점심 굶었음
let _dinnerSkipped = boolean;       // 저녁 굶었음
let _diet = { bKcal, lKcal, dKcal, sKcal, bFoods, lFoods, dFoods, sFoods, ... };
```

### 데이터 로드/저장
| 함수 | 역할 |
|------|------|
| `loadWorkoutDate(y, m, d)` | 날짜의 데이터 로드 → 메모리 변수 채우기 → UI 렌더링 |
| `saveWorkoutDay()` | 메모리 변수 → Firebase 저장 → `sheet:saved` 이벤트 발동 |
| `wtRunAnalyzeDiet()` | ~~Claude AI 분석~~ (삭제됨) |

### 상태 변경 (→ 자동 저장)
| 함수 | 역할 |
|------|------|
| `wtSetGymStatus(status)` | 헬스 상태 변경 → saveWorkoutDay() |
| `wtSetCFStatus(status)` | 크로스핏 상태 변경 → saveWorkoutDay() |
| `wtToggleMealSkipped(meal)` | 굶었음 토글 → kcal=0 리셋 → saveWorkoutDay() |
| `wtToggleStretching()` | 스트레칭 토글 |
| `wtToggleWineFree()` | 와인프리 토글 |
| `wtAddFoodItem(meal, item)` | 음식 DB 추가 → 칼로리 자동 계산 → _autoSaveDiet() |
| `wtRemoveFoodItem(meal, idx)` | 음식 제거 → 칼로리 재계산 → _autoSaveDiet() |

### 렌더링
| 함수 | CSS 적용 |
|------|---------|
| `_renderGymStatusBtns()` | #wt-gym-btn-done/.active, #wt-gym-btn-skip/.active, #wt-gym-btn-health/.active |
| `_renderCFStatusBtns()` | #wt-cf-btn-done/.active, #wt-cf-btn-skip/.active, #wt-cf-btn-health/.active |
| `_renderMealSkippedToggles()` | .diet-skip-btn/.active |
| `_renderDietResults()` | (식단 분석 결과 표시 - 현재는 음식 DB 칼로리만) |
| `_renderCalorieTracker()` | 오늘의 칼로리 트래커 UI |

---

## 🔗 이벤트 흐름

### 사이클 1: 운동/식단 데이터 입력
```
사용자: 헬스장 상태 버튼 클릭 (완료/미실시/건강이슈)
  ↓
wtSetGymStatus() 호출
  ↓ 메모리: _gymStatus 변경
  ↓ 렌더링: _renderGymStatusBtns() → CSS .active 적용
  ↓ 저장: saveWorkoutDay() → Firebase 저장 + _cache 업데이트
  ↓ 이벤트: 'sheet:saved' 발동
  ↓
render-home.js: renderAll() 재실행
  ↓ calcStreaks() → 홈 Streak 대시보드 갱신
  ↓
render-calendar.js: renderCalendar() 재실행 (탭이 활성이면)
  ↓ getMuscles(y,m,d) 호출 → .cell.gym-on 적용
  ↓
UI: Streak 탭 헬스 row 업데이트 ✅
```

### 사이클 2: 음식 DB 추가
```
사용자: 🔍 음식 검색 버튼 클릭
  ↓
openNutritionSearch('breakfast') 호출
  ↓ 모달 오픈: 음식 DB 검색
  ↓ 사용자: 음식 선택
  ↓
wtAddFoodItem('breakfast', {name, grams, kcal, protein, ...})
  ↓ 메모리: _diet.bFoods.push() + _diet.bKcal 자동 계산
  ↓ 렌더링: _renderMealFoodItems() → 음식 칩 표시
  ↓ 렌더링: _renderDietResults() → (현재 미분석 상태)
  ↓ 저장: _autoSaveDiet() → Firebase 저장 + _cache 업데이트
  ↓ 이벤트: 'sheet:saved' 발동
  ↓
render-calendar.js: renderCalendar() 재실행
  ↓ getDiet(y,m,d).bKcal 조회 → 0 → kcal > 0이므로...
  ↓ dietDayOk(y,m,d) → bOk = true (bKcal > 0)
  ↓ 다른 끼도 같으면 dietDayOk() === true
  ↓
UI: Streak 탭 식단 row .cell.diet-ok 적용 + ✅ 아이콘 표시 ✅
```

### 사이클 3: 굶었음 체크
```
사용자: 🚫 굶었음 버튼 클릭
  ↓
wtToggleMealSkipped('breakfast')
  ↓ 메모리: _breakfastSkipped = true
  ↓ 메모리: _diet.bKcal = 0 (리셋)
  ↓ 렌더링: _renderMealSkippedToggles() → .diet-skip-btn/.active
  ↓ 렌더링: _renderDietResults()
  ↓ 저장: saveWorkoutDay() → Firebase 저장 + _cache 업데이트
  ↓ 이벤트: 'sheet:saved' 발동
  ↓
render-calendar.js: renderCalendar() 재실행
  ↓ getDiet(y,m,d).bKcal → 0
  ↓ getBreakfastSkipped(y,m,d) → true
  ↓ dietDayOk(y,m,d) → bOk = true (bSkip = true)
  ↓ 다른 끼도 같으면 dietDayOk() === true
  ↓
UI: Streak 탭 식단 row .cell.diet-ok 적용 + ✅ 아이콘 (또는 🚫) 표시 ✅
```

---

## 📱 UI 요소 요약

### 운동/식단 탭 (tab-workout)
```html
<!-- 헬스장 상태 버튼 -->
<button id="wt-gym-btn-done" class="act-btn">완료</button>
<button id="wt-gym-btn-skip" class="act-btn">미실시</button>
<button id="wt-gym-btn-health" class="act-btn">건강이슈</button>

<!-- 크로스핏 상태 버튼 -->
<button id="wt-cf-btn-done" class="act-btn">완료</button>
<button id="wt-cf-btn-skip" class="act-btn">미실시</button>
<button id="wt-cf-btn-health" class="act-btn">건강이슈</button>

<!-- 아침/점심/저녁 메모 입력 -->
<input id="wt-meal-breakfast" placeholder="메모 (선택)">
<button onclick="openNutritionSearch('breakfast')">🔍 음식 검색</button>

<!-- 음식 표시 -->
<div id="wt-foods-breakfast">
  <div class="meal-food-chip">
    <span>계란 2개</span>
    <span>150kcal</span>
  </div>
</div>

<!-- 굶었음 버튼 -->
<button id="wt-breakfast-skipped" class="diet-skip-btn" onclick="wtToggleMealSkipped('breakfast')">🚫</button>

<!-- 저장 버튼 -->
<button id="wt-save-btn" onclick="saveWorkoutDay()">💾 저장</button>
```

### Streak 탭 (tab-calendar)
```html
<div class="grid-wrap">
  <table class="grid-table">
    <!-- 헬스 row -->
    <tr>
      <td class="row-label">🏋️ 헬스</td>
      <td><div class="cell gym-on"><span class="cell-icon">🏋️</span></div></td>
      <td><div class="cell skipped"><span class="cell-icon">✗</span></div></td>
      <td><div class="cell health-issue"><span class="cell-icon">✚</span></div></td>
    </tr>

    <!-- 크로스핏 row -->
    <tr>
      <td class="row-label">🔥 클핏</td>
      <td><div class="cell cf-on"><span class="cell-icon">🔥</span></div></td>
      ...
    </tr>

    <!-- 식단 row -->
    <tr>
      <td class="row-label">🥗 식단</td>
      <td><div class="cell diet-ok"><span class="cell-icon">✅</span></div></td>
      <td><div class="cell diet-bad"><span class="cell-icon">❌</span></div></td>
      <td><div class="cell diet-skipped"><span class="cell-icon">🚫</span></div></td>
    </tr>
  </table>
</div>
```

---

## 🔑 핵심 정리

| 항목 | 내용 |
|------|------|
| **데이터 동기화** | saveWorkoutDay() → Firebase → _cache → sheet:saved 이벤트 → renderCalendar() |
| **식단 판정 기준** | dietDayOk() = (breakfast_skipped OR bKcal > 0) AND (lunch_skipped OR lKcal > 0) AND (dinner_skipped OR dKcal > 0) |
| **Streak 카운트** | calcStreaks() = 오늘부터 역순으로 조건 만족할 때까지 카운트 |
| **칼로리 출처** | 음식 DB 추가 시만 자동 계산 (텍스트 입력은 메모만) |
| **굶었음 처리** | breakfast_skipped=true 설정 + bKcal=0 → dietDayOk()에서 OK로 판정 |
| **Claude AI 의존성** | 완전 제거됨 (bOk/lOk/dOk는 저장되지만 사용 안함) |
