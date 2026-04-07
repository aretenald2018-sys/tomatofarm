# 📊 식단 설정 → 입력 → Streak 연결 전체 로직 분석

**작성일**: 2026-03-29
**범위**: 리피드데이/체지방률 설정 + 식단 입력 + Streak 연결
**대상 파일**: app.js, render-workout.js, data.js, render-calendar.js

---

## 📋 목차

1. [1단계: 리피드데이/체지방률 설정](#1단계-리피드데이체지방률-설정)
2. [2단계: 운동/식단탭 식단 입력](#2단계-운동식단탭-식단-입력)
3. [3단계: Streak탭 렌더링 및 판정](#3단계-streak탭-렌더링-및-판정)
4. [전체 데이터 흐름도](#전체-데이터-흐름도)

---

# 1단계: 리피드데이/체지방률 설정

## 1-1) 설정 모달 열기

**파일**: `app.js` (432-465줄)

### 함수: `openDietPlanModal()`
```javascript
function openDietPlanModal() {
  // 1. 현재 설정값 로드
  const plan = getDietPlan();  // data.js에서 가져옴

  // 2. 모달의 입력 필드에 기존값 채우기
  document.getElementById('dp-height').value = plan.height || '';
  document.getElementById('dp-age').value = plan.age || '';
  document.getElementById('dp-weight').value = plan.weight || '';
  document.getElementById('dp-bodyfat').value = plan.bodyFatPct || '';
  document.getElementById('dp-target-weight').value = plan.targetWeight || '';
  document.getElementById('dp-target-bf').value = plan.targetBodyFatPct || '';  // ⭐ 목표 체지방률
  document.getElementById('dp-start-date').value = plan.startDate || '';
  document.getElementById('dp-loss-rate').value = plan.lossRatePerWeek || 0.009;
  document.getElementById('dp-activity').value = plan.activityFactor || 1.3;
  document.getElementById('dp-refeed-kcal').value = plan.refeedKcal || 5000;

  // 3. 리피드 요일 버튼 초기화 ⭐ (핵심)
  const refeedDays = plan.refeedDays || [0, 6];  // 기본값: 일요일(0), 토요일(6)
  document.querySelectorAll('.refeed-day-btn').forEach(btn => {
    btn.classList.toggle('active', refeedDays.includes(parseInt(btn.dataset.dow)));
    btn.onclick = () => {
      btn.classList.toggle('active');
      _updateDietCalcPreview();  // 실시간 미리보기 업데이트
    };
  });

  _updateDietCalcPreview();  // 초기 미리보기 렌더링

  // 4. 입력값 변경 시 실시간 미리보기 갱신
  ['dp-height','dp-age','dp-weight','dp-bodyfat','dp-target-weight','dp-target-bf',
   'dp-loss-rate','dp-refeed-kcal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = _updateDietCalcPreview;
  });

  // 5. 모달 표시
  document.getElementById('diet-plan-modal').classList.add('open');
}
```

**주요 매개변수**:
| 필드 | 의미 | 기본값 |
|------|------|--------|
| `height` | 키(cm) | 175 |
| `weight` | 현재 체중(kg) | 75 |
| `bodyFatPct` | 현재 체지방률(%) | 17 |
| `age` | 나이 | 32 |
| `targetWeight` | 목표 체중(kg) | 68 |
| `targetBodyFatPct` | **목표 체지방률(%)** | 8 |
| `refeedKcal` | 리피드 이틀 합계(kcal) | 5000 |
| `refeedDays` | **리피드 요일** | `[0, 6]` (일,토) |
| `lossRatePerWeek` | 주당 감량 비율 | 0.009 (0.9%) |
| `activityFactor` | 활동 계수 | 1.3 |

---

### 함수: `_updateDietCalcPreview()`
```javascript
function _updateDietCalcPreview() {
  const preview = document.getElementById('dp-calc-preview');
  if (!preview) return;

  // 1. 입력 필드에서 값 수집
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value) || 0,
    age:              parseFloat(document.getElementById('dp-age').value) || 0,
    weight:           parseFloat(document.getElementById('dp-weight').value) || 0,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value) || 0,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value) || 0,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value) || 0,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value) || 0.009,
    activityFactor:   1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value) || 5000,
  };

  // 2. 필수값 검증
  if (!plan.weight || !plan.height || !plan.age) {
    preview.innerHTML = '';
    return;
  }

  // 3. calcDietMetrics()로 칼로리 계산 (상세 아래 참조)
  const metrics = calcDietMetrics(plan);

  // 4. HTML로 미리보기 렌더링
  preview.innerHTML = `
    <div>유지대사량: ${metrics.bmr}kcal</div>
    <div>TDEE: ${metrics.tdee}kcal</div>
    <div><strong>데피싯데이: ${metrics.deficit.kcal}kcal</strong></div>
    <div><strong>리피드데이: ${metrics.refeed.kcal}kcal</strong></div>
    ...
  `;
}
```

---

## 1-2) 설정값 저장

**파일**: `app.js` (501-521줄)

### 함수: `saveDietPlanFromModal()`
```javascript
async function saveDietPlanFromModal() {
  // 1. 리피드 요일 수집 ⭐
  const refeedDays = [...document.querySelectorAll('.refeed-day-btn.active')]
    .map(b => parseInt(b.dataset.dow));  // 활성화된 버튼만 수집
  // 결과 예시: [0, 6] 또는 [] 또는 [1, 3, 5]

  // 2. 모든 설정값 수집
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value) || null,
    age:              parseFloat(document.getElementById('dp-age').value) || null,
    weight:           parseFloat(document.getElementById('dp-weight').value) || null,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value) || null,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value) || null,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value) || null,  // ⭐
    startDate:        document.getElementById('dp-start-date').value || null,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value) || 0.009,
    activityFactor:   1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value) || 5000,
    refeedDays,  // ⭐ 리피드 요일 배열
  };

  // 3. 필수값 검증
  if (!plan.weight || !plan.height) {
    alert('키와 체중을 입력해주세요.');
    return;
  }

  // 4. Firebase에 저장 (data.js의 saveDietPlan 호출)
  await saveDietPlan(plan);  // ⭐ 여기서 저장됨

  // 5. 모달 닫기
  document.getElementById('diet-plan-modal').classList.remove('open');

  // 6. 전체 화면 다시 렌더링 (Streak 포함)
  renderAll();  // ⭐ app.js의 함수
}
```

---

## 1-3) 설정값 저장 (데이터계층)

**파일**: `data.js` (399-403줄)

### 함수: `saveDietPlan()`
```javascript
export const saveDietPlan = async (plan) => {
  // 1. 새 설정과 기존 설정 병합
  const merged = { ...(getDietPlan()), ...plan };

  // 2. 메모리의 _dietPlan 즉시 업데이트
  Object.assign(_dietPlan, merged);

  // 3. Firebase settings 컬렉션에 저장
  return _saveSetting('diet_plan', merged);
};
```

**저장 경로**: Firestore → `settings` 컬렉션 → `diet_plan` 문서

---

## 1-4) 설정값 로드 및 계산

**파일**: `data.js` (398줄, 406-450줄)

### 함수: `getDietPlan()`
```javascript
export const getDietPlan = () => ({
  ...DEFAULT_DIET_PLAN,       // 기본값
  ..._settings.diet_plan      // ⭐ 저장된 사용자 설정으로 덮어쓰기
});
```

**기본값** (DEFAULT_DIET_PLAN):
```javascript
const DEFAULT_DIET_PLAN = {
  height: 175,
  weight: 75,
  bodyFatPct: 17,
  age: 32,
  targetWeight: 68,
  targetBodyFatPct: 8,  // ⭐ 목표 체지방률
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,     // ⭐ 리피드 이틀 칼로리
  refeedDays: [0, 6],   // ⭐ 리피드 요일 (일, 토)
  startDate: null,
};
```

---

### 함수: `calcDietMetrics(plan)`
**파일**: `data.js` (406-450줄)

```javascript
export function calcDietMetrics(plan) {
  const p = { ...DEFAULT_DIET_PLAN, ...plan };

  // 1. 기초대사량(BMR) 계산 (Mifflin-St Jeor 공식)
  const bmr = Math.round(13.7 * p.weight + 5 * p.height - 6.8 * p.age + 66);

  // 2. 일일 소비 칼로리(TDEE) 계산
  const tdeeCalc = Math.round(bmr * p.activityFactor);
  const tdee = Math.ceil(tdeeCalc / 100) * 100;  // 100단위 올림

  // 3. 체성분 계산
  const lbm = p.weight - (p.weight * p.bodyFatPct / 100);      // 제지방체중
  const fatMass = p.weight * p.bodyFatPct / 100;               // 지방량
  const fatToLose = (p.weight * (p.bodyFatPct - p.targetBodyFatPct)) / 100;  // ⭐ 감량할 지방

  // 4. 감량 기간 계산
  const totalWeightLoss = fatToLose / 0.713;
  const weeklyLossKg = p.weight * p.lossRatePerWeek;
  const weeksNeeded = totalWeightLoss / weeklyLossKg;

  // 5. 일일 칼로리 적자 계산
  const calPerKgPerDay = 7700 / 7 / p.activityFactor;
  const dailyDeficit = weeklyLossKg * calPerKgPerDay;
  const dailyIntake = tdee - dailyDeficit;

  // 6. 주간 칼로리 계산
  const weeklyKcal = Math.round(dailyIntake * 7);

  // 7. 데피싯데이 vs 리피드데이 분배 ⭐
  const refeedTotal = p.refeedKcal;           // 리피드 이틀 합계
  const deficitDayKcal = Math.round((weeklyKcal - refeedTotal) / 5);  // 5일 데피싯
  const refeedDayKcal = Math.round(refeedTotal / 2);                   // 2일 리피드

  // 8. 탄단지 비율 계산 (데피싯데이)
  const dProteinKcal = Math.round(deficitDayKcal * 0.41);
  const dCarbKcal = Math.round(deficitDayKcal * 0.50);
  const dFatKcal = Math.round(deficitDayKcal * 0.09);

  // 9. 탄단지 비율 계산 (리피드데이)
  const rProteinKcal = Math.round(refeedDayKcal * 0.29);
  const rCarbKcal = Math.round(refeedDayKcal * 0.60);
  const rFatKcal = Math.round(refeedDayKcal * 0.11);

  // 10. 반환값 (아주 중요!)
  return {
    bmr, tdee, lbm, fatMass, fatToLose, totalWeightLoss,
    weeklyLossKg, weeklyLossG: Math.round(weeklyLossKg * 1000),
    dailyDeficit: Math.round(dailyDeficit),
    dailyIntake: Math.round(dailyIntake),
    weeksNeeded,
    deficit: {
      kcal: deficitDayKcal,        // ⭐ 데피싯데이 칼로리 제한
      proteinKcal: dProteinKcal,
      proteinG: Math.round(dProteinKcal / 4),
      carbKcal: dCarbKcal,
      carbG: Math.round((deficitDayKcal - dProteinKcal - dFatKcal) / 4),
      fatKcal: dFatKcal,
      fatG: Math.round(dFatKcal / 9),
    },
    refeed: {
      kcal: refeedDayKcal,         // ⭐ 리피드데이 칼로리 제한
      proteinKcal: rProteinKcal,
      proteinG: Math.round(rProteinKcal / 4),
      carbKcal: rCarbKcal,
      carbG: Math.round(rCarbKcal / 4),
      fatKcal: rFatKcal,
      fatG: Math.round(rFatKcal / 9),
    },
  };
}
```

**출력 예시** (설정값: 체중 75kg, 체지방 17%, 목표 8%):
```
deficit.kcal: 1420        // 월~금: 1420 kcal 제한
refeed.kcal: 2500         // 토~일: 2500 kcal 제한 (리피드)
```

---

# 2단계: 운동/식단탭 식단 입력

## 2-1) 날짜 로드 및 UI 초기화

**파일**: `render-workout.js` (39-104줄)

### 함수: `loadWorkoutDate(y, m, d)`
```javascript
export function loadWorkoutDate(y, m, d) {
  // 1. 날짜 저장
  _date = { y, m, d };

  // 2. Firebase에서 해당 날짜의 데이터 로드
  const day = getDay(y, m, d);  // data.js의 함수
  _exercises = JSON.parse(JSON.stringify(day.exercises || []));

  // 3. 운동 상태 로드
  if (day.gym_health) _gymStatus = 'health';
  else if (day.gym_skip) _gymStatus = 'skip';
  else if ((day.exercises||[]).length > 0) _gymStatus = 'done';
  else _gymStatus = 'none';

  // ... (CF, 스트레칭, 와인프리 상태도 동일)

  // 4. 식단 데이터 로드 ⭐
  _diet = {
    breakfast: day.breakfast || '',
    lunch: day.lunch || '',
    dinner: day.dinner || '',
    snack: day.snack || '',
    bOk: day.bOk ?? null,
    lOk: day.lOk ?? null,
    dOk: day.dOk ?? null,
    sOk: day.sOk ?? null,
    bKcal: day.bKcal || 0,
    lKcal: day.lKcal || 0,
    dKcal: day.dKcal || 0,
    sKcal: day.sKcal || 0,
    // ... 기타 필드
    bFoods: day.bFoods || [],   // ⭐ 음식 items 배열
    lFoods: day.lFoods || [],
    dFoods: day.dFoods || [],
    sFoods: day.sFoods || [],
  };

  // 5. UI 렌더링
  _renderDateLabel();
  _renderGymStatusBtns();
  _renderMealFoodItems('breakfast');  // ⭐ 음식 목록 렌더링
  _renderMealFoodItems('lunch');
  _renderMealFoodItems('dinner');
  _renderMealFoodItems('snack');
  _renderDietResults();

  // 6. textarea에 값 채우기
  if (bEl) bEl.value = _diet.breakfast;
  if (lEl) lEl.value = _diet.lunch;
  if (dEl) dEl.value = _diet.dinner;
  if (sEl) sEl.value = _diet.snack;
}
```

---

## 2-2) 음식 추가

**파일**: `render-workout.js` (703-710줄)

### 함수: `wtAddFoodItem(meal, item)`
```javascript
export function wtAddFoodItem(meal, item) {
  // 1. 해당 끼니의 음식 배열에 추가
  const key = _mealKey(meal);  // 'bFoods', 'lFoods', 'dFoods', 'sFoods'
  _diet[key] = [...(_diet[key] || []), item];
  // item 구조: { name, kcal, protein, carbs, fat }

  // 2. 해당 끼니의 매크로 재계산 ⭐
  _recalcMealMacros(meal);

  // 3. UI 업데이트
  _renderMealFoodItems(meal);
  _renderDietResults();

  // 4. 자동 저장 (Firestore + 실시간 반영)
  _autoSaveDiet();
}
```

---

## 2-3) 매크로 재계산 (핵심)

**파일**: `render-workout.js` (689-701줄)

### 함수: `_recalcMealMacros(meal)`
```javascript
function _recalcMealMacros(meal) {
  const key = _mealKey(meal);  // 'bFoods', 'lFoods' 등
  const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
  const foods = _diet[key] || [];
  if (!foods.length) return;

  // 1. 칼로리 합계 계산 ⭐
  _diet[`${prefix}Kcal`] = Math.round(foods.reduce((s, f) => s + f.kcal, 0));

  // 예시: bFoods = [닭가슴살(118kcal), 바나나(188kcal), 계란(10kcal)]
  //      → bKcal = 316

  // 2. 단백질 합계
  _diet[`${prefix}Protein`] = Math.round(foods.reduce((s, f) => s + f.protein, 0) * 10) / 10;

  // 3. 탄수화물 합계
  _diet[`${prefix}Carbs`] = Math.round(foods.reduce((s, f) => s + f.carbs, 0) * 10) / 10;

  // 4. 지방 합계
  _diet[`${prefix}Fat`] = Math.round(foods.reduce((s, f) => s + f.fat, 0) * 10) / 10;

  // 5. 성공 여부 (DB-backed meals은 항상 true로 간주)
  _diet[`${prefix}Ok`] = true;

  // 6. 분석 결과 텍스트
  _diet[`${prefix}Reason`] = `DB: ${_diet[`${prefix}Kcal`]}kcal (단${_diet[`${prefix}Protein`]}g 탄${_diet[`${prefix}Carbs`]}g 지${_diet[`${prefix}Fat`]}g)`;
}
```

---

## 2-4) 자동 저장 (중요!)

**파일**: `render-workout.js` (733-820줄)

### 함수: `_autoSaveDiet()`
```javascript
async function _autoSaveDiet() {
  if (!_date) {
    console.warn('[render-workout] 날짜 정보 없음');
    return;
  }
  const { y, m, d } = _date;

  // 1. textarea의 최신값 _diet에 반영
  _diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || _diet.breakfast;
  _diet.lunch = document.getElementById('wt-meal-lunch')?.value.trim() || _diet.lunch;
  _diet.dinner = document.getElementById('wt-meal-dinner')?.value.trim() || _diet.dinner;
  _diet.snack = document.getElementById('wt-meal-snack')?.value.trim() || _diet.snack;

  // 2. 설정 로드
  const plan = getDietPlan();  // ⭐ 설정된 칼로리 제한 가져오기
  const metrics = calcDietMetrics(plan);

  // 3. 오늘이 리피드데이인지 확인 ⭐
  const dow = new Date(y, m, d).getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const dayTarget = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;

  // 4. 오늘 섭취 총 칼로리
  const totalKcal = (_diet.bKcal || 0) + (_diet.lKcal || 0) + (_diet.dKcal || 0) + (_diet.sKcal || 0);

  // 5. 칼로리 초과 여부 판단 ⭐ (핵심 로직)
  const isDietSuccess = (totalKcal > 0) && (totalKcal <= dayTarget + 50);

  // 예시 (리피드데이 미적용시):
  // dayTarget = 1420 kcal
  // totalKcal = 1815 kcal
  // isDietSuccess = (1815 > 0) && (1815 <= 1420+50) = false  ❌

  // 6. 각 끼니의 bOk/lOk/dOk를 isDietSuccess로 설정
  // ⭐ 이것이 Streak 탭의 판정에 영향을 줌!
  const saveData = {
    exercises: cleanEx,
    breakfast: _diet.breakfast,
    lunch: _diet.lunch,
    dinner: _diet.dinner,
    snack: _diet.snack,
    bOk: isDietSuccess,   // ⭐
    lOk: isDietSuccess,   // ⭐
    dOk: isDietSuccess,   // ⭐
    sOk: isDietSuccess,   // ⭐
    bKcal: _diet.bKcal,
    lKcal: _diet.lKcal,
    dKcal: _diet.dKcal,
    sKcal: _diet.sKcal,
    bFoods: _diet.bFoods || [],
    lFoods: _diet.lFoods || [],
    dFoods: _diet.dFoods || [],
    sFoods: _diet.sFoods || [],
    // ... 기타
  };

  // 7. Firebase에 저장
  await saveDay(dateKey(y, m, d), saveData);

  // 8. sheet:saved 이벤트 발생 (Streak 탭 업데이트 트리거)
  document.dispatchEvent(new CustomEvent('sheet:saved'));
}
```

---

## 2-5) 메인 저장 (사용자 클릭)

**파일**: `render-workout.js` (300-357줄)

### 함수: `saveWorkoutDay()`
```javascript
export async function saveWorkoutDay() {
  if (!_date) return;
  const { y, m, d } = _date;

  // 1. textarea 값 읽기
  _diet.breakfast = document.getElementById('wt-meal-breakfast').value.trim();
  _diet.lunch = document.getElementById('wt-meal-lunch').value.trim();
  _diet.dinner = document.getElementById('wt-meal-dinner').value.trim();
  _diet.snack = document.getElementById('wt-meal-snack').value.trim();

  // 2. 설정 로드 및 칼로리 계산
  const plan = getDietPlan();
  const metrics = calcDietMetrics(plan);
  const dow = new Date(y, m, d).getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const dayTarget = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;

  // 3. 총 칼로리 계산
  const totalKcal = (_diet.bKcal || 0) + (_diet.lKcal || 0) + (_diet.dKcal || 0) + (_diet.sKcal || 0);

  // 4. 칼로리 성공 여부 판정 ⭐
  const isDietSuccess = (totalKcal > 0) && (totalKcal <= dayTarget + 50);

  // 5. Firebase 저장
  await saveDay(dateKey(y, m, d), {
    exercises: cleanEx,
    bOk: isDietSuccess,
    lOk: isDietSuccess,
    dOk: isDietSuccess,
    sOk: isDietSuccess,
    breakfast: _diet.breakfast,
    lunch: _diet.lunch,
    dinner: _diet.dinner,
    snack: _diet.snack,
    bKcal: _diet.bKcal,
    lKcal: _diet.lKcal,
    dKcal: _diet.dKcal,
    sKcal: _diet.sKcal,
    bFoods: _diet.bFoods || [],
    lFoods: _diet.lFoods || [],
    dFoods: _diet.dFoods || [],
    sFoods: _diet.sFoods || [],
  });

  // 6. UI 피드백
  if (btn) { btn.disabled = false; btn.textContent = '✓ 저장됨'; }

  // 7. Streak 탭 업데이트 트리거
  document.dispatchEvent(new CustomEvent('sheet:saved'));
}
```

---

# 3단계: Streak탭 렌더링 및 판정

## 3-1) 이벤트 연결

**파일**: `app.js` (107-108줄)

```javascript
document.addEventListener('sheet:saved', renderAll);
document.addEventListener('cooking:saved', renderAll);
```

---

## 3-2) 전체 렌더링

**파일**: `app.js` (99-105줄)

### 함수: `renderAll()`
```javascript
function renderAll() {
  renderHome();
  renderCalendar();  // ⭐ 항상 Streak 탭 업데이트 (현재 탭과 무관)
  if (_currentTab === 'stats') renderStats();
  if (_currentTab === 'cooking') renderCooking();
  if (_currentTab === 'movie') renderMovie();
}
```

---

## 3-3) Streak 탭 렌더링

**파일**: `render-calendar.js` (20-56줄)

### 함수: `renderCalendar()`
```javascript
export function renderCalendar() {
  document.getElementById('year-label').textContent = _currentYear + '년';
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const days = daysInMonth(_currentYear, m);

    if (isBeforeStart(_currentYear, m, days)) continue;

    const sec = document.createElement('div');
    sec.className = 'month-section';
    const hdr = document.createElement('div');
    hdr.className = 'month-header';
    hdr.textContent = _currentYear + '년 ' + MONTHS[m];
    sec.appendChild(hdr);

    const wrap = document.createElement('div');
    wrap.className = 'grid-wrap';
    const table = document.createElement('table');
    table.className = 'grid-table';
    table.appendChild(_makeHead(_currentYear, m, days));

    const tbody = document.createElement('tbody');
    tbody.appendChild(_gymRow(_currentYear, m, days));
    tbody.appendChild(_cfRow(_currentYear, m, days));
    tbody.appendChild(_dietRow(_currentYear, m, days));  // ⭐ 식단 행 생성
    tbody.appendChild(_scheduleRow(_currentYear, m, days));
    table.appendChild(tbody);

    wrap.appendChild(table);
    sec.appendChild(wrap);
    cal.appendChild(sec);
  }
  _applyStreakSettings();
}
```

---

## 3-4) 식단 행 렌더링 (핵심)

**파일**: `render-calendar.js` (149-198줄)

### 함수: `_dietRow(year, m, days)`
```javascript
function _dietRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td');
  lbl.className = 'row-label';
  lbl.textContent = '🥗 식단';
  row.appendChild(lbl);

  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) {
      td.style.display = 'none';
      row.appendChild(td);
      continue;
    }

    // ⭐ 핵심: dietDayOk() 호출로 해당 날짜의 식단 성공/실패 판정
    const dok = dietDayOk(year, m, d);
    const cell = _makeCell(year, m, d);

    // 굶었음 상태 확인
    const bSkipped = getBreakfastSkipped(year, m, d);
    const lSkipped = getLunchSkipped(year, m, d);
    const dSkipped = getDinnerSkipped(year, m, d);
    const anySkipped = bSkipped || lSkipped || dSkipped;

    // 표시 로직 (우선순위: 성공 -> 굶었음 -> 실패)
    if (dok === true) {
      cell.classList.add('diet-ok');
      const ic = document.createElement('span');
      ic.className = 'cell-icon';
      ic.textContent = '🔥';  // ✅ 성공
      cell.appendChild(ic);
    } else if (anySkipped) {
      cell.classList.add('diet-skipped');
      const ic = document.createElement('span');
      ic.className = 'cell-icon';
      ic.textContent = '✚';   // 건너뜀
      cell.appendChild(ic);
    } else if (dok === false) {
      cell.classList.add('diet-bad');
      const ic = document.createElement('span');
      ic.className = 'cell-icon';
      ic.textContent = '❌';   // ❌ 실패
      cell.appendChild(ic);
    }
    // else: dok === null (기록 없음, 표시 안함)

    td.appendChild(cell);
    row.appendChild(td);
  }
  return row;
}
```

---

## 3-5) 식단 성공/실패 판정 (가장 중요!)

**파일**: `data.js` (485-528줄)

### 함수: `dietDayOk(y, m, d)`
```javascript
export const dietDayOk = (y, m, d) => {
  // 1. 날짜의 식단 데이터 로드
  const dt = getDiet(y, m, d);

  // 2. 사용자 설정 로드 ⭐
  const plan = getDietPlan();
  const metrics = calcDietMetrics(plan);

  // 3. 오늘이 리피드데이인지 판정 ⭐
  const dayOfWeek = new Date(y, m - 1, d).getDay();  // 0=일, 6=토
  const isRefeed = plan.refeedDays.includes(dayOfWeek);
  const limitKcal = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;

  // 4. 오늘 섭취 총 칼로리 계산 ⭐
  const totalKcal = (dt.bKcal || 0) + (dt.lKcal || 0) + (dt.dKcal || 0) + (dt.sKcal || 0);

  // 5. Skip 여부 확인
  const bSkip = getBreakfastSkipped(y, m, d);
  const lSkip = getLunchSkipped(y, m, d);
  const dSkip = getDinnerSkipped(y, m, d);

  // 6. 기록 유무 확인 (음식 또는 메모가 있는 경우)
  const hasRecord = dt.breakfast || dt.lunch || dt.dinner ||
                    (dt.bFoods?.length > 0) || (dt.lFoods?.length > 0) ||
                    (dt.dFoods?.length > 0) || (dt.sFoods?.length > 0);

  // 아무 기록도 없고 스킵도 안 했다면 null (빈 칸)
  if (!hasRecord && !bSkip && !lSkip && !dSkip) return null;

  // 7. 핵심: 칼로리 제한 비교 ⭐⭐⭐
  const calorieSuccess = totalKcal <= limitKcal;

  // 예시 시나리오:
  // 28일(토) - refeedDays: [] 설정한 경우
  // ├─ dayOfWeek = 6
  // ├─ isRefeed = [].includes(6) = false
  // ├─ limitKcal = metrics.deficit.kcal = 1420
  // ├─ totalKcal = 1815
  // └─ calorieSuccess = 1815 <= 1420 = false ❌

  // 8. 각 끼니별 성공 여부
  const bOk = bSkip || (dt.bOk ?? false);
  const lOk = lSkip || (dt.lOk ?? false);
  const dOk = dSkip || (dt.dOk ?? false);

  // 9. 최종 결과 반환 ⭐
  // (모든 끼니가 기록/스킵됨) AND (총 칼로리가 제한선 이하)
  return bOk && lOk && dOk && calorieSuccess;
};
```

---

# 전체 데이터 흐름도

```
┌─────────────────────────────────────────────────────────────┐
│                   1. 설정 단계                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [설정 모달 열기]                                           │
│  openDietPlanModal()                                        │
│       ↓                                                      │
│  [입력 필드 초기화]                                         │
│  · 키, 체중, 체지방률, 목표체지방률                        │
│  · 리피드데이 버튼 활성화 (기본: [0,6])                    │
│  · 리피드 칼로리 (기본: 5000)                               │
│       ↓                                                      │
│  [실시간 미리보기]                                          │
│  _updateDietCalcPreview()                                   │
│  → calcDietMetrics() 호출                                   │
│  → deficit.kcal, refeed.kcal 계산                          │
│       ↓                                                      │
│  [저장]                                                      │
│  saveDietPlanFromModal()                                    │
│  → saveDietPlan(plan)  [data.js]                           │
│  → Firebase: settings.diet_plan 저장                        │
│  → renderAll() 호출 (Streak 업데이트)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                2. 식단 입력 단계                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [날짜 로드]                                                │
│  loadWorkoutDate(y, m, d)                                   │
│  → Firebase에서 해당 날짜 데이터 로드                        │
│  → _diet 객체에 {bFoods, lFoods, dFoods, sFoods} 초기화    │
│       ↓                                                      │
│  [음식 추가]                                                │
│  wtAddFoodItem('breakfast', {name, kcal, ...})             │
│  → _diet.bFoods 배열에 추가                                 │
│       ↓                                                      │
│  [매크로 재계산] ⭐                                          │
│  _recalcMealMacros('breakfast')                             │
│  → _diet.bKcal = 음식들의 kcal 합계                        │
│  → _diet.bProtein, bCarbs, bFat 계산                       │
│       ↓                                                      │
│  [UI 업데이트 + 자동 저장]                                  │
│  _renderMealFoodItems()                                     │
│  _autoSaveDiet()                                            │
│       ↓                                                      │
│  [설정값 로드]                                              │
│  plan = getDietPlan()  [사용자가 설정한 refeedDays 포함]    │
│  metrics = calcDietMetrics(plan)                            │
│       ↓                                                      │
│  [칼로리 판정] ⭐⭐⭐                                         │
│  dayTarget = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal
│  totalKcal = bKcal + lKcal + dKcal + sKcal                  │
│  isDietSuccess = (totalKcal > 0) && (totalKcal <= dayTarget + 50)
│       ↓                                                      │
│  [Firebase 저장]                                            │
│  saveDay(dateKey, {                                         │
│    bOk: isDietSuccess,  ← 이 값이 Streak 판정에 사용됨     │
│    lOk: isDietSuccess,                                      │
│    dOk: isDietSuccess,                                      │
│    sOk: isDietSuccess,                                      │
│    bKcal, lKcal, dKcal, sKcal,                             │
│    bFoods, lFoods, dFoods, sFoods,                         │
│  })                                                         │
│       ↓                                                      │
│  [Streak 업데이트 트리거]                                   │
│  document.dispatchEvent(new CustomEvent('sheet:saved'))    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              3. Streak 연결 단계 ⭐                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [이벤트 수신]                                              │
│  document.addEventListener('sheet:saved', renderAll)       │
│       ↓                                                      │
│  [전체 렌더링]                                              │
│  renderAll()                                                │
│  → renderCalendar() [항상 실행]                            │
│       ↓                                                      │
│  [Streak 캘린더 생성]                                       │
│  renderCalendar()                                           │
│  → for each month:                                          │
│     → _dietRow(year, m, days)  [식단 행 생성]             │
│       ↓                                                      │
│  [각 날짜별 식단 판정] ⭐                                    │
│  dietDayOk(year, m, d)                                      │
│  ├─ getDiet(year, m, d)         [날짜 데이터 로드]         │
│  ├─ getDietPlan()               [사용자 설정 로드]         │
│  ├─ calcDietMetrics(plan)       [칼로리 기준 계산]         │
│  ├─ dayOfWeek = new Date().getDay()  [요일 확인]          │
│  ├─ isRefeed = plan.refeedDays.includes(dayOfWeek)         │
│  ├─ limitKcal = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal
│  ├─ totalKcal = dt.bKcal + dt.lKcal + dt.dKcal + dt.sKcal │
│  └─ return (bOk && lOk && dOk && totalKcal <= limitKcal)   │
│       ↓                                                      │
│  [아이콘 표시]                                              │
│  if (dok === true)                                          │
│    → 🔥 (성공)                                              │
│  else if (dok === false)                                    │
│    → ❌ (실패)                                              │
│  else if (anySkipped)                                       │
│    → ✚ (건너뜀)                                             │
│  else (dok === null)                                        │
│    → (표시 없음)                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 데이터 구조 정리

## getDiet() 반환값

**파일**: `data.js` (475-484줄)

```javascript
{
  breakfast: string,        // 아침 메모 텍스트
  lunch: string,           // 점심 메모 텍스트
  dinner: string,          // 저녁 메모 텍스트
  bOk: boolean | null,     // 아침 성공 여부 (저장된 isDietSuccess 값)
  lOk: boolean | null,     // 점심 성공 여부
  dOk: boolean | null,     // 저녁 성공 여부
  bKcal: number,          // 아침 칼로리 ⭐
  lKcal: number,          // 점심 칼로리 ⭐
  dKcal: number,          // 저녁 칼로리 ⭐
  sKcal: number,          // 간식 칼로리 ⭐
  bReason: string,        // 아침 분석 결과
  lReason: string,        // 점심 분석 결과
  dReason: string,        // 저녁 분석 결과
  bFoods: Array,          // 아침 음식 items ⭐
  lFoods: Array,          // 점심 음식 items ⭐
  dFoods: Array,          // 저녁 음식 items ⭐
  sFoods: Array,          // 간식 음식 items ⭐
}
```

## calcDietMetrics() 반환값

```javascript
{
  bmr: number,                        // 기초대사량
  tdee: number,                       // 일일 소비 칼로리
  lbm: number,                        // 제지방체중
  fatMass: number,                    // 지방량
  fatToLose: number,                  // 감량해야 할 지방
  totalWeightLoss: number,            // 감량 목표 체중
  weeklyLossKg: number,               // 주당 감량 kg
  dailyDeficit: number,               // 일일 칼로리 적자
  dailyIntake: number,                // 일일 섭취 칼로리
  weeksNeeded: number,                // 필요 주수
  deficit: {
    kcal: number,                     // ⭐ 데피싯데이 칼로리 제한
    proteinKcal: number,
    proteinG: number,
    carbKcal: number,
    carbG: number,
    fatKcal: number,
    fatG: number,
  },
  refeed: {
    kcal: number,                     // ⭐ 리피드데이 칼로리 제한
    proteinKcal: number,
    proteinG: number,
    carbKcal: number,
    carbG: number,
    fatKcal: number,
    fatG: number,
  }
}
```

---

# 문제 해결: 왜 'X'가 표시되지 않았나?

## 근본 원인

1. **로직 공백**: `_recalcMealMacros()`에서 무조건 `_diet.bOk = true`로 설정
2. **판정 부재**: `dietDayOk()`가 **저장된 bOk 값만 맹목적으로 믿음**
3. **비교 로직 없음**: **실제 칼로리 제한선과 비교하는 로직이 없음**

## 해결 방법

새로운 `dietDayOk()`:
```javascript
const calorieSuccess = totalKcal <= limitKcal;
return bOk && lOk && dOk && calorieSuccess;  // ⭐ 칼로리 비교 추가
```

이제 `calorieSuccess = false`이면 Streak 탭에 ❌ 표시됨!

---

**끝.**
