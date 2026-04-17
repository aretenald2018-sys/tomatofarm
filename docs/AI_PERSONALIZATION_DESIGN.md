# AI 음식 사진 분석 개인화 설계안

> 작성일: 2026-04-17
> 상태: **설계 제안 (미구현)**
> 목표: 사용자의 과거 식단 기록을 활용해 AI 사진 분석 결과를 **개인화된 추정값**으로 교정

---

## 1. 문제 정의

### 현재 파이프라인의 한계
```
사진 → Gemini(one-pass 분류+추정) → sanityCheckKcal(전역 prior) → 최종
```

- **모든 사용자에게 동일한 prior 적용.** 예: 라면 100kcal/100g, 김치찌개 60kcal/100g 고정.
- 사용자가 **자주 먹는 음식의 실제 그램 수·조리법·칼로리 패턴**을 전혀 반영 못 함.
- 예시:
  - A 유저는 집에서 만든 김치찌개를 평균 400g/320kcal로 기록
  - B 유저는 외식 설렁탕을 600g/500kcal로 기록
  - 동일 사진이어도 A와 B의 실제 섭취량/칼로리는 다름
- 사용자가 AI 결과를 수정하더라도, 그 피드백이 **다음 추정에 재투입되지 않음** (학습 없음).

### 설계 목표
1. 과거 `bFoods/lFoods/dFoods/sFoods`에 축적된 **유저별 음식 프로파일**을 구축.
2. AI가 `김치찌개`를 감지했을 때, 유저 프로파일에 `김치찌개` 샘플이 충분하면
   → 전역 prior 대신 **유저 개인 prior**로 교정.
3. 샘플이 부족하거나 신규 유저는 → 전역 prior로 graceful fallback.
4. UI에서 "내 기록 기반" 배지로 교정 여부를 **투명하게 공개**.

---

## 2. 데이터 소스

### 2.1 수집 대상
워크아웃 도큐먼트(`workouts/{dateKey}`)의 4개 배열:
- `bFoods`, `lFoods`, `dFoods`, `sFoods`

### 2.2 항목 스키마 (기존)
```js
{
  id?: string,         // nutrition DB 레퍼런스가 있으면 포함
  name: string,        // 예: "김치찌개", "아메리카노"
  grams: number,       // 실제 섭취량 (g)
  kcal: number,        // 칼로리
  protein: number,     // 단백질(g)
  carbs: number,       // 탄수화물(g)
  fat: number,         // 지방(g)
  source?: 'ai' | 'manual' | 'db' | 'favorite',   // 신규 필드 제안
  edited?: boolean,    // 사용자가 수정했는지
}
```

### 2.3 유효 샘플 기준
- `grams > 0 && kcal > 0` (0값 누락 방지)
- `kcal/grams` 비율이 `[0.2, 10]` 사이 (극단값 컷)
- `source === 'ai' && !edited` 항목은 **제외** (AI 자기참조 방지 — 노이즈 순환 방지)

---

## 3. 프로파일 집계

### 3.1 정규화 키
기존 `data/korean-food-normalize.js`의 `normalizeFood(name)` 재사용.
- `"카페라떼"`, `"Cafe Latte"`, `"바닐라라떼"` → 모두 `"라떼"` 하나의 캐노니컬로 통합.
- alias 테이블에 없는 음식은 원문 `name`을 키로 사용 (fallback).

### 3.2 프로파일 구조
```js
// Firestore: users/{uid}/ai_food_profile  (단일 도큐먼트)
{
  canonicals: {
    "김치찌개": {
      count: 12,
      kcalPerGram: { median: 0.82, p25: 0.74, p75: 0.91 },
      proteinRatio: 0.055,   // 단백질(g) / 총 그램
      carbsRatio:   0.042,
      fatRatio:     0.028,
      avgGrams: 380,          // 유저의 평소 1회 섭취량
      lastSeen: "2026-04-15",
      freshness: 0.95,        // 최근성 가중치 (30일 내=1.0, 90일 이상 감쇠)
    },
    "라떼": { ... },
    ...
  },
  updatedAt: timestamp,
  totalSamples: 143,
}
```

### 3.3 집계 전략
- **roll-up 타이밍**: 식단 저장 완료 시 (sheet:saved 이벤트) 증분 업데이트 OR 주 1회 배치.
- **증분 업데이트가 단순**: 신규 항목 1개만 반영. `median/p25/p75`는 최근 N=30개 샘플 버퍼 기반으로 재계산.
- **버퍼 크기**: canonical당 최근 30개 샘플 유지. 오래된 것은 drop (식습관 변화 반영).

---

## 4. 매핑 전략 (핵심)

### 4.1 플로우
```
Gemini one-pass 결과
  ├─ detectedItems: [ { name: "김치찌개", grams: 400, kcal: ?, ... }, ... ]
  │
  ↓ [신규 단계: personalizeEstimate(items, userProfile)]
  │   각 item마다:
  │     canonical = normalizeFood(item.name)
  │     profile = userProfile.canonicals[canonical]
  │     if (profile && profile.count >= 3):
  │       → 유저 개인 prior 사용
  │     else:
  │       → 전역 prior (sanityCheckKcal) 사용
  │
  ↓
  최종 estimate (개인화 표시 플래그 포함)
```

### 4.2 개인 prior 적용 공식
**AI가 추정한 `grams`는 살리고, 단위 영양소만 유저 중간값으로 치환.**

```js
const profile = userProfile.canonicals[canonical];
const confidence = Math.min(1, profile.count / 10);  // 10회 이상 = 1.0
const freshness  = profile.freshness;                 // 0~1
const weight     = confidence * freshness;            // 0~1

// 블렌딩 (hard replacement 피하고 AI와 가중평균)
const blendedKcalPerGram =
  weight * profile.kcalPerGram.median +
  (1 - weight) * (aiItem.kcal / aiItem.grams);

aiItem.kcal    = Math.round(blendedKcalPerGram * aiItem.grams);
aiItem.protein = Math.round(profile.proteinRatio * aiItem.grams * 10) / 10;
aiItem.carbs   = Math.round(profile.carbsRatio   * aiItem.grams * 10) / 10;
aiItem.fat     = Math.round(profile.fatRatio     * aiItem.grams * 10) / 10;
aiItem.personalPriorApplied = true;
aiItem.personalPriorWeight  = weight;
```

### 4.3 샘플 임계치
| count    | 동작                                       |
|----------|--------------------------------------------|
| 0        | 전역 prior만                                |
| 1~2      | 전역 prior 유지, **참고만**                |
| 3~9      | blended (weight = count/10)                 |
| ≥10      | 유저 prior 거의 전면 적용 (weight ≈ 1.0)    |

### 4.4 엣지 케이스
- **AI 추정 그램이 유저 평균의 3배 이상**: 유저 `avgGrams` 방향으로 20% 당김 (극단 추정 완충).
- **macro 합 > kcal의 110%**: 단탄지 비율을 `personalize`에서 재정규화.
- **신규 유저 (totalSamples < 10)**: 개인화 비활성, 전역 prior만.

---

## 5. UI 제안

### 5.1 배너 내 표시
기존 AI 추정 배너(`modals/ai-estimate-banner.js`)의 아이템 칩에 뱃지 추가:

```
🍜 김치찌개 400g · 320kcal   [🎯 내 기록 기반]
```

- `personalPriorApplied === true`인 항목에 작은 뱃지 렌더.
- 툴팁: "당신이 기록한 김치찌개 12회 평균 기반으로 보정됐어요"

### 5.2 편집 다이얼로그
- 상세 편집 모드(방금 구현한 inline editor) 저장 시 `edited: true` + `source: 'manual'` 마킹.
- 이 항목은 다음 프로파일 집계에서 **높은 가중치**로 반영 (사용자가 직접 확정한 신뢰도 높은 샘플).

### 5.3 투명성
"왜 이렇게 계산됐나요?" 링크 → 설명 모달:
> AI가 감지한 음식을 당신이 과거에 X회 기록한 평균과 비교해서 보정했어요.
> 마지막 기록: 2026-04-15.

---

## 6. 콜드 스타트 & 점진적 개선

### 6.1 신규 유저
- `totalSamples < 10` → 개인화 완전 비활성, 현재 전역 prior 파이프라인 그대로.
- 처음 10회 기록까지는 "당신의 식습관을 배우는 중" 1회성 안내 토스트.

### 6.2 즐겨먹는 음식 온보딩 (선택)
신규 유저 가입 후 1회 퀵 설문:
- "자주 먹는 음식 3~5개를 고르세요" → seed profile.
- 다만 샘플 count는 1로만 카운트 (과신 방지).

### 6.3 피드백 루프
- 유저가 AI 결과를 편집 → 편집본이 `edited: true`로 프로파일에 반영 → 다음 추정 개선.
- 자기참조 방지: `source:'ai' && !edited`은 집계 제외.

---

## 7. 구현 단계 (Phased Rollout)

### Phase P1: 프로파일 모듈 (2~3h)
- 신규 `data/ai-food-profile.js`
  - `buildUserFoodProfile()`: 최근 90일 워크아웃 훑어서 집계
  - `updateFoodProfileIncremental(item)`: 식단 저장 시 1개 반영
  - `getUserFoodPrior(canonical)`: 프로파일에서 해당 canonical 조회
- Firestore `users/{uid}/ai_food_profile` 필드 추가 (기존 유저 데이터에 영향 없음)
- 기존 저장 경로(`workout/save.js` _autoSaveDiet) 뒤에 hook 추가

### Phase P2: 추정 파이프라인 통합 (1~2h)
- `workout/ai-estimate.js`의 `runAIEstimate` 마지막에 `personalizeEstimate()` 호출
- 신규 `workout/ai-personalize.js`
  - `personalizeEstimate(estimate, profile)`: detectedItems를 순회하며 blended prior 적용
  - personalPriorApplied/Weight 메타데이터 첨부

### Phase P3: UI (1h)
- `modals/ai-estimate-banner.js`의 `renderPreview` 아이템 표시에 🎯 뱃지 추가
- "왜 이렇게 계산됐나요?" 링크 (optional, 시간 남으면)

### Phase P4: 온보딩 & 투명성 (optional)
- 신규 유저 10회 달성 시 토스트 안내
- 설명 모달

### 총 예상 코스트
- 핵심 P1+P2+P3: **4~6시간**
- Firestore 쓰기 추가: 식단 저장 시 도큐먼트 1개 업데이트 (batched) → 비용 미미.

---

## 8. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 프로파일이 AI 오답으로 오염 | 악순환 | `source:'ai' && !edited` 집계 제외 |
| 유저 식습관 변화 반영 지연 | stale prior | 최근 30샘플 버퍼 + freshness 가중치 |
| 프로파일 도큐먼트 비대화 | 읽기 비용↑ | canonical당 요약통계만 저장 (raw samples X) |
| 동명 이음 (예: "라떼" 집에서 vs 카페) | 오매핑 | P1에선 단순 canonical 매핑, 차후 context(시간대/장소) 고려 |
| 소수 샘플 과신 | 편향 | count/10 기반 weight로 점진 적용 |

---

## 9. 결정 필요 사항

구현 착수 전 유저에게 확인:

1. **Firestore 스키마**: `users/{uid}` 내부에 `ai_food_profile` 필드로 둘지, 별도 컬렉션 `users_ai_profiles/{uid}`로 분리할지.
2. **집계 주기**: 식단 저장마다 증분 업데이트(실시간) vs. 매일 1회 배치(효율).
   - 권장: 증분 (실시간이 UX 좋음, 쓰기 비용 무시 가능).
3. **최소 샘플 임계치**: 3회부터 blending 시작이 적절한지, 5회로 보수적으로 할지.
4. **Phase 분할**: P1~P3 한 번에 할지, P1(프로파일 빌드만) 먼저 배포해 데이터 쌓고 P2~P3 붙일지.
   - 권장: P1 선배포 → 1주 데이터 축적 → P2~P3 순차.

---

## 10. 요약

**한 줄 요약**: "AI가 감지한 음식 그램수는 살리고, 칼로리/매크로는 유저 본인의 과거 기록 중간값으로 블렌딩한다. 샘플이 적으면 덜 믿고, 많으면 많이 믿는다."

**즉시 가치**:
- 자주 먹는 음식의 정확도 큰 폭 개선
- AI 추정 → 유저 편집 → 프로파일 개선 → 다음 추정 개선 선순환
- "내 기록 기반" 뱃지로 투명성 확보

**점진적 구현 가능**: 프로파일 집계만 먼저 배포하고 1주간 데이터 축적 후 파이프라인에 연결하는 방식이 안전.
