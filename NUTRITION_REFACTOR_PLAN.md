# 영양정보 파이프라인 리팩토링 설계서

작성일: 2026-04-18
상태: 📐 설계 완료 → 🛠 구현 시작

## 1. 진단 (요약)

### 1.1 보고된 증상
- 영양성분표 뒷면 사진을 찍어도 파싱이 엉망 (가공식품 라벨)
- 텍스트(복붙) 파싱도 똑같이 문제
- 같은 아이템인데 `100g당`/`단위섭취량당`/`100ml당`/`1인분`이 뒤섞여 있음
- 검색 결과에 표시되는 단위가 일관되지 않음

### 1.2 근본 원인 (코드 리드 기반)

| # | 원인 | 위치 | 영향 |
|---|------|------|------|
| A | 영양성분표 사진/텍스트에서 "100g당 vs 1회 제공량당 vs 100ml당" 컬럼을 구분 못함 | `ai.js:175` (`_NUTRITION_RULES_KO`) — 1회제공량/총내용량/액상ml 구분 지시가 없음 | Gemini가 아무 컬럼 숫자나 잡음. `% 영양성분기준치`를 실제값으로 쓰기도 함 |
| B | 정규식 텍스트 파서가 servingSize=100으로 강제 | `utils/nutrition-text-parser.js:164` | "1회 제공량 30g"인 과자 라벨이 30g=100kcal인데도 100g당=100kcal로 저장됨 |
| C | `unit` 필드가 자유 텍스트, parseFloat로 숫자만 뽑음 | `modals/nutrition-item-modal.js:524` | "1공기"처럼 숫자 없으면 조용히 100g fallback |
| D | 각 검색 소스(CSV/공공API/raw/local DB)가 서로 다른 필드명 (`energy` vs `kcal`, `nutrition.kcal` vs flat) | `feature-nutrition.js:63` (`isCSV` 분기) | 소비 쪽 코드가 조건부로 분기해야 함. 추가 소스 넣기 어려움 |
| E | 사용자 저장 시 `servingSize = 사용자 입력 중량` 으로 덮어씀 | `modals/nutrition-weight-modal.js:156` | 최초 저장이 "쌀밥 300g=495kcal" 라면, 이후 같은 아이템의 servingSize는 300g. 자체는 self-consistent지만 의미가 "1인분=300g인 쌀밥"으로 오염 |
| F | 검색 모달 표기 — 어떨 땐 "1인분 300g · 495kcal", 어떨 땐 "100g · 165kcal", 어떨 땐 "1공기 165kcal" — 신호 혼란 | `feature-nutrition.js:78` | 사용자가 어느 단위 기준인지 알 수 없음 |
| G | 단위 전환(100g↔1인분↔ml) UI가 없음. 중량 입력만 있음 | `modals/nutrition-weight-modal.js:21-24` | FatSecret처럼 드롭다운으로 단위 바꾸는 UX 부재 |
| H | 영양성분표 `%영양성분기준치` 값을 실제 g/mg 값으로 오인 | Gemini 프롬프트에 명시 경고 없음 | kcal이 터무니없이 작거나(ex 30) 크게 잡힘 |

## 2. 목표 (North Star)

**FatSecret의 Serving size UX를 경량 차용:**
1. 검색 결과는 "해당 제품의 **대표 1회 제공량**" 기준으로 kcal 표시 (가공식품/메뉴). 원재료는 100g 기준.
2. 선택 후 모달에서 **단위 드롭다운**으로 `100g / 1회 제공량 XXg / 1인분 XXg / ml 기반 액체`로 전환.
3. **수량**(×0.5, ×1, ×2 등)을 배수로 입력할 수 있게.
4. 저장 시 항상 **canonical base**(`per_100g` or `per_serving`) + 환산된 실사용 grams + 최종 kcal/매크로를 foods에 push.
5. 영양성분표 파싱은 항상 **두 컬럼 다 인식** → UI에서 어느 쪽을 쓸지 사용자가 1탭으로 결정.

## 3. 새 데이터 모델 (canonical NutritionItem)

기존 스키마는 그대로 두고, **신규 저장 + 검색 결과 정규화 레이어**에만 새 shape을 사용.

```js
// canonical NutritionItem — 모든 검색 결과를 이 shape으로 정규화
{
  id: string,
  name: string,
  brand?: string,
  source: 'raw' | 'csv' | 'gov_raw' | 'gov_meal' | 'gov_proc' | 'local' | 'recipe' | 'ocr' | 'text',
  _grp?: '원재료성' | '음식' | '가공식품',

  // === 영양 베이스라인 (canonical) ===
  // nutrition 필드는 반드시 `base` 기준 값
  base: {
    type: 'per_100g' | 'per_100ml' | 'per_serving',
    grams: number,   // per_serving일 때 실제 1회 제공량 g. per_100g/ml이면 100.
    ml?: number,     // per_100ml 전용
    label?: string,  // UI 표기용 "1회 제공량 30g", "100g", "1개 200g" 등
  },
  nutrition: {
    kcal, protein, carbs, fat,
    fiber?, sugar?, sodium?  // sodium=mg, 나머지=g
  },

  // === UI hint ===
  servings: Array<{            // 사용자가 전환 가능한 단위들. 첫 항목이 기본.
    id: string,                // 'per_100g' | 'per_serving' | 'custom:XXXg' 등
    label: string,             // "100g 기준", "1회 제공량 30g", "1인분 300g"
    grams: number,             // 해당 단위의 실중량
  }>,
  defaultServingId: string,    // servings[].id 중 하나 (가공식품 = per_serving, 원재료 = per_100g)
}
```

### 식단에 추가된 음식 객체 (S.diet.bFoods[i])

```js
{
  id, name,
  grams: number,          // 사용자가 실제 섭취한 실중량
  kcal, protein, carbs, fat,  // grams에 대한 환산값

  // 신규 필드 (레거시는 없어도 무해)
  servingRef?: {
    servingId: string,    // 'per_100g' | 'per_serving' | ...
    multiplier: number,   // 1회 제공량 × 1.5 = 45g 인 경우 1.5
    baseGrams: number,    // servings[servingId].grams 시점 값 (history 용)
  },
  source?: 'manual' | 'ai' | 'recipe',
}
```

**마이그레이션**: 기존 bFoods 아이템은 `grams + kcal + macros`만 있어도 계속 작동. `servingRef`는 optional — 로드 시 없으면 그냥 표시만.

## 4. 구현 항목 (우선순위 순)

### Phase A: 데이터 정규화 + 순수 로직 (테스트 용이)
- [ ] `calc.js`에 `convertNutrition(base, toGrams)` 순수 함수 추가
- [ ] `data/nutrition-normalize.js` 신규 — 각 소스별 → canonical NutritionItem 변환기
  - `normalizeFromCsv`, `normalizeFromGov`, `normalizeFromRaw`, `normalizeFromLocalDB`, `normalizeFromRecipe`
- [ ] `tests/calc.nutrition.test.js` 신규 — per_100g/per_serving/ml 환산 + 라운딩 케이스

### Phase B: 영양성분표 파싱 개선
- [ ] `ai.js` `_NUTRITION_RULES_KO` 프롬프트 재작성:
  - 100g당 / 100ml당 / 1회 제공량당 3컬럼 중 어느 것이 있는지 명시적으로 체크
  - `% 영양성분기준치` / `Daily Value` 는 **무시**하라고 명시
  - 가공식품 라벨: `servingSize`, `servingUnit`(g|ml), `totalAmount`(총 내용량) 정확히 추출
  - 두 컬럼이 다 있으면 `perServing` + `per100` 모두 리턴 → 앱에서 사용자에게 선택권
- [ ] `utils/nutrition-text-parser.js`:
  - "1회 제공량 30g" 정규식 추가 → `servingSize` 동적 추출
  - "총 내용량 200g", "내용량 200ml" 패턴
  - "100ml당" / "per 100ml" 감지 → `servingUnit='ml'`
  - `%` + 숫자 줄은 값 추출에서 제외

### Phase C: 검색 UX + 단위 드롭다운
- [ ] `feature-nutrition.js`:
  - 모든 소스 결과를 `normalizeFrom*`으로 캐논화 후 한 배열로 합침
  - 렌더 헬퍼 `_renderNutritionRow` → 캐논 shape만 다루도록 단순화 (isCSV 분기 제거)
  - 가공식품/음식은 "1회 제공량 XXg · YYYkcal" 기본 표시, 원재료는 "100g · YYYkcal"
- [ ] `modals/nutrition-weight-modal.js`:
  - 단위 드롭다운(`<select>`) 추가: `servings[]` 배열 기반
  - 수량 stepper(÷2, ×1, ×2, ×3) 또는 배수 숫자 입력
  - 중량(g) 입력은 "직접 입력" 모드에서만 표시
  - 실시간 kcal/매크로 재계산
  - 저장 시 `servingRef` 메타 같이 push

### Phase D: 검증 & 회귀 방지
- [ ] `tests/calc.nutrition.test.js` 확장 — 라벨 파서 정합성 (kcal ≈ 4C+4P+9F ± 10%)
- [ ] `data-guardian` 에이전트로 `_buildSavePayload()` 필드 누락 재감사
- [ ] `sw.js` `CACHE_VERSION` 범프 + `STATIC_ASSETS` 목록 업데이트

## 5. 마이그레이션 전략

| 영역 | 처리 |
|------|------|
| 기존 `nutrition_db` 도큐먼트 | 건드리지 않음. 읽을 때 `normalizeFromLocalDB()`가 레거시 필드를 canonical로 변환 |
| 기존 `workouts/{date}.bFoods` | 건드리지 않음. `servingRef`가 없어도 렌더/저장 모두 작동 |
| 신규 저장 | 항상 canonical shape + `servingRef` 포함 |
| 기존 데이터 표기 차이 | 로드 시 변환만, 저장 시 덮어쓰지 않음 |

## 6. 리스크

- **Gemini 응답이 새 JSON shape을 못 지킬 수 있음** → `_normalizeNutritionParse`에서 legacy shape도 계속 받되 base를 추론해 채워주기
- **FatSecret 스타일 UX는 모달 재구성이 큼** → Phase C를 두 패스로 분할: C-1 단위 토글만 추가, C-2 배수/stepper 추가
- **SW 캐시 갱신 누락** → `sw.js` `CACHE_VERSION` + `STATIC_ASSETS` 체크리스트 엄수

## 7. 체크리스트 (plan.md로 이관)

다음 섹션은 plan.md의 "Phase 현재" 내부에 추가될 항목들. 파일 수정은 이 문서가 아닌 plan.md로.
