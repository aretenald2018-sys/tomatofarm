# 테스트모드(Max Mode) 리디자인 v2 — 엑셀 매트릭스 방법론 통합

작성일: 2026-05-02
대상: `workout/expert/max.js`, `calc.js`, `data/data-workout-equipment.js`, `expert-mode.css`, 신규 `data/data-equipment-pool.js`, 신규 `workout/expert/max-cycle.js`, 관련 모달
선행 문서: `TEST_MODE_REDESIGN_PLAN.md` (Phase 0~5 추천 계약/카드 통일/계획-실제/헬스장 태그/프레임워크)
변경 요약: v1의 "추천 신뢰 회복" 위에 사용자 23년 엑셀 매트릭스 감각(6주 듀얼 트랙)을 메인 메탈모델로 끌어올림. v1의 framework 중 `adaptive_volume_v1`을 `dual_track_progression_v2`로 진화시켜 default로 채택.
최종 목업: `mockups/test-mode-v2-mockup.html`

---

## 0. 한 줄 요약

테스트모드는 "오늘 추천 화면"이 아니라 **"6주짜리 점진과부하 사이클의 진행감을 시각화하는 코치 화면"**이며, 사용자가 23년에 엑셀로 직접 운영하던 `벤치마크 종목 × 듀얼 트랙(중중량 고볼륨 M-Track / 고중량 저볼륨 H-Track) × 6주 마일스톤` 메탈모델을 앱이 자동으로 유지·기록·예측하는 것이 목표다.

### 0.1 최종 통합 방향

이 문서는 `TEST_MODE_REDESIGN_PLAN.md`, `TEST_MODE_EXCEL_METHOD_PLAN.md`, 그리고 `mockups/max-mode-tds-blueprint.html`에서 더 나은 방향만 골라 통합한 최종 v2 기준안이다.

| 출처 | 채택 | 제외/강등 |
|---|---|---|
| v1 리디자인 | 추천 계약, 카드 통일, 오늘 큰 부위 기준 필터, 헬스장 태그 문제의 원인 분석 | 단순 추천 리스트 중심 UX |
| 엑셀 기반 계획 | 6주 성장판, 부위별 벤치마크, 계획/실제 비교, 헬스장별 기구 CRUD | 엑셀 표를 그대로 모바일에 복붙하는 방식 |
| v2 초안 | `dual_track_progression_v2`, `equipment_pool`, 사이클 시작/정산 화면 | `확인 필요`로 남긴 핵심 정책 |
| TDS 목업 초안 | 낮은 장식성, 수치 중심 카드, 공통/헬스장별 기구 구분 | 별도 산출물 경로 `max-mode-tds-blueprint.html` |

최종 산출물은 **`mockups/test-mode-v2-mockup.html` 하나를 기준 목업**으로 삼는다. `mockups/max-mode-tds-blueprint.html`은 참고용 초안이며, 이후 구현/검수의 기준은 아니다.

### 0.2 최종 제품 원칙

1. 테스트모드는 "추천을 받는 곳"이 아니라 "내 6주 성장 사이클을 운영하는 곳"이다.
2. 첫 화면은 추천 카드 묶음이 아니라 `Week N/6`, 오늘 계획, 6주 뒤 예상 중량, 계획 대비 실제의 차이를 보여준다.
3. 추천은 항상 `오늘 큰 부위 → 선택 헬스장 기구 → 벤치마크 종목 → 트랙 → 과거 수행` 순서로 설명 가능해야 한다.
4. 모든 카드에는 `왜 이 종목인지`, `왜 이 무게인지`, `6주 계획에서 어디에 해당하는지`가 붙는다.
5. 사용자는 추천을 수락하는 사람이 아니라 계획을 수정하고 운영하는 사람이다. 수정값은 다음 처방의 baseline이 된다.
6. 일반/프로/테스트모드는 같은 기구 풀을 공유한다. 테스트모드만 별도 종목 우주를 만들지 않는다.

---

## Part A. 코칭 평가 — 23년 엑셀 매트릭스 방법론 분석

### A.1 엑셀이 했던 일을 풀어쓰면

사용자가 첨부한 매트릭스에서 읽히는 운영 원리는 다음과 같다.

1. **부위별 핵심 종목 4~5개로 풀(pool)을 한정한다.** 가슴=벤치/인클/플라/디클, 등=LPD/APD/롱풀/암로우, 어깨=솔프/백풀/사레/프론, 하체=SplSC/Smo/LgPrs/Exten/Curl, 팔=Biceps(바벨/해머/프릿)·Triceps(Exten/Flat/Rope). 모든 종목을 트래킹하지 않고, 부위당 4~5개로 신호 잡음을 줄였다.
2. **종목별로 강도 유형을 미리 라벨링한다.** 각 컬럼 헤더 아래 `중`/`고`/`중`/`중` 표기는 같은 부위 안에서도 해당 종목을 어느 강도 트랙으로 운용할지 사전 정의한 것이다. 가슴 벤치는 `중중량 x 고볼륨`, 인클은 `고중량 x 저볼륨` 같은 식.
3. **셀 안에는 무게 / 반복수만 적는다.** 예: `72.5 / 12`. 그 외 데이터(RPE, 휴식, 컨디션)는 의도적으로 비어 있다. 트래킹 비용이 낮아서 6개월씩 끊기지 않고 운영됐다.
4. **컬러 코드로 트랙을 구분한다.** 진한 색 셀 = 그 주의 메인 트랙(중중량 고볼륨), 연한 색 = 보조 트랙(고중량 저볼륨). 한 종목이 같은 주에 두 번 등장할 수 있다.
5. **6주 단위로 +5kg(하체) / +2.5kg(상체)를 누적한다.** 이 진행 폭은 자연인 트레이닝의 보수적 점진과부하와 거의 같다.
6. **시각적으로 매트릭스 전체를 한 화면에 본다.** 정체·돌파·리셋이 한눈에 보이고, 다음 6주 목표 무게가 머릿속에 그려진다.

### A.2 코치 관점에서의 강점

| 강점 | 운동과학적 근거 |
|---|---|
| **종목 풀 한정** | Specificity 원리 — 같은 종목의 반복이 신경계 효율과 수행능력 그래프를 깨끗하게 만든다. |
| **듀얼 트랙(M/H)** | Daily/Weekly Undulating Periodization의 저비용 변형. 중량 자극과 볼륨 자극을 동시에 받아 정체를 회피한다. |
| **선형 점진과부하 + 6주 마일스톤** | 자연인의 적응 곡선과 일치. 6주는 hypertrophy 자극의 누적이 PR로 떨어지는 평균적 시간. |
| **벤치마크 종목** | "벤치 = 가슴의 KPI"처럼 측정 종목 1~2개를 anchor로 두면 부위 발전을 단일 수치로 인식 가능. |
| **시각적 매트릭스** | 인지부하가 낮다. "오늘 무엇을 들어야 하는지"보다 "지금 어디쯤 와 있는지"를 먼저 보여준다 → 동기부여 핵심. |
| **저비용 트래킹** | 무게/반복만 기록 → 6개월~수년 단위로 끊기지 않고 운영됨. 결국 가장 좋은 프로그램은 "하는 프로그램"이다. |

### A.3 약점 / 한계

| 약점 | 영향 | 보강 방향 |
|---|---|---|
| RPE/RIR 부재 | deload 타이밍을 감각에만 의존. 과훈련 후 부상 위험. | 세트 입력에 RPE 슬라이더 1줄 추가. RPE 기반 cap. |
| MEV/MAV/MRV 미인식 | 부위별 주간 작업 세트 총량 가이드 없음. 어깨 4종목 vs 가슴 4종목 균형 불명. | 부위별 weekly target sets 청사진. |
| 회복/수면/스트레스 미반영 | 컨디션 나쁜 날도 같은 처방. | 세션 시작 전 1탭 "오늘 컨디션 1~5" → light/normal 트랙 분기. |
| 종목 교체 룰 부재 | 같은 자극만 반복 → stimulus repetition reduction. | 사이클 끝마다 종목 1~2개 rotate 시그널. |
| 헬스장 변동성 무시 | 다른 헬스장에서 같은 종목명도 기구 스펙이 다름(스미스 vs 프리). | 헬스장 컨텍스트 분리 (Part C). |
| e1RM 추적 부재 | 무게×반복 → e1RM 변환 안 함. 정체 인식 늦음. | `calc.js buildE1rmTrend()` 추가, 청사진에 sparkline. |
| 사이클 정산 부재 | 6주 끝나도 명시적 "수확" 모먼트 없음. | 사이클 종료 모달, 다음 사이클 옵션. |

### A.4 결론 — 이 방법론은 2026년에도 작동한다

세계 최고 자연인 코치 관점에서 평가하면, 이 매트릭스는 **자연인 보디빌딩 프로그램의 sweet spot**이다. RP, Wendler 5/3/1, Greg Nuckols 같은 메인스트림 프로그램이 모두 비슷한 원리(주력 종목 anchor + 듀얼 트랙 + 4~8주 사이클 + 점진과부하)에 변형을 둔 것이고, 사용자가 직접 운영하던 매트릭스는 이미 본질을 잡은 상태다.

따라서 **테스트모드의 default framework는 RP-Lite/5·3·1이 아니라 사용자의 매트릭스를 그대로 형식화한 `dual_track_progression_v2`로 두고**, RP/5·3·1은 데이터가 충분히 쌓인 사용자에게만 advanced 옵션으로 제공한다. 현재 `workout/expert/max.js`의 `MAX_FRAMEWORKS` 리스트에서 `adaptive_volume`을 default로 두던 구조에 잘 맞는다.

### A.5 필요한 보강 5가지

1. **부위별 4~5개 핵심 종목을 사용자가 직접 pin** (벤치마크 종목 지정 UI).
2. **종목마다 트랙 라벨 부여** (`primaryTrack: 'M'|'H'`, 한 종목이 두 트랙 모두 가질 수 있음).
3. **6주 사이클 메탈모델** — 시작 무게, 매 세션 진행량, 6주 후 목표 무게를 명시.
4. **부위별 weekly volume target** — MEV~MAV 범위(가슴 12, 등 14, 하체 12, 어깨 10, 팔 8 정도가 자연인 hypertrophy MAV 근방).
5. **사이클 정산 + 다음 사이클 추천** — 끝나는 순간 "+5kg / +12.5% 진행" 가시화하고 다음 사이클로 자연스럽게 연결.

---

## Part B. 신규 서비스 시나리오 — 엑셀 감각의 앱 이식

### B.1 North Star

> 사용자가 운동탭 테스트모드를 켜는 순간 첫 화면에서 다음 4가지가 한 눈에 보인다.
>
> 1. **"나는 6주 사이클의 어디쯤 와 있나"** — Week N/6, 사이클 진행률 바.
> 2. **"오늘 무엇을 어떻게 들어야 하나"** — 트랙(M/H) 자동 결정, 벤치마크 종목별 처방.
> 3. **"이대로 가면 6주 뒤 어디까지 가나"** — 벤치마크 종목별 예측 무게 카드.
> 4. **"지금까지 나는 얼마나 발전했나"** — 매트릭스 뷰 (엑셀 재현).

### B.2 데이터 모델 — `_settings.max_cycle`

기존 `_settings.expert_preset`을 덮지 않도록 새 필드 `max_cycle`을 추가한다 (get-merge-set 필수, `setDoc` 전체 덮어쓰기 룰 위반 금지).

```js
_settings.max_cycle = {
  id: 'cycle_2026_05_02',
  status: 'active' | 'completed' | 'paused',
  startDate: '2026-05-02',
  weeks: 6,                     // default 6, 사용자가 4|6|8 선택 가능
  framework: 'dual_track_progression_v2',
  weeklyVolumeTarget: {         // 부위별 주간 작업세트 목표 (MEV~MAV)
    chest: 12, back: 14, lower: 12, shoulder: 10, glute: 8, bicep: 8, tricep: 8, abs: 8
  },
  benchmarks: [                 // 벤치마크 종목 5개 (사용자 pin)
    { exerciseId, label, primaryMajor, tracks: ['M','H'],
      startKg: 75, startReps: 12,
      progressionKgPerSession: 0.83,  // 6주 = 18 sessions(주3회 가정), +5kg / 18 ≈ 0.83
      targetKg: 80, targetReps: 12 },
    ...
  ],
  rotatePolicy: {               // 종목 교체 룰
    enabled: true,
    plateauWeeks: 2,            // 같은 무게 2주 정체 시 rotate 시그널
    minVolumeKept: 0.7
  },
  goal: 'hypertrophy' | 'strength' | 'mixed',
  primaryGymId: 'gym_woori',
};
```

`benchmarks[].tracks`가 둘 다 있으면 같은 종목이 같은 주에 M/H로 두 번 처방될 수 있다. 엑셀에서 같은 종목이 같은 주에 두 줄 등장하던 것을 그대로 재현한다.

### B.3 화면 레벨 흐름 (5~7화면)

```
[진입]
운동탭 → 테스트모드 토글 ON
    │
    ├─ 사이클 없음 → S0. 사이클 시작 모달 (벤치마크 5종 pin + 헬스장 선택)
    │
    └─ 사이클 있음 → S1. 사이클 청사진 대시보드
                       ├─ S2. 오늘 세션 처방 카드
                       ├─ S3. 듀얼 트랙 매트릭스 (엑셀 재현)
                       ├─ S4. 6주 예측 카드
                       └─ S5. 헬스장 기구 관리 (Part C)
                       
[종료]
Week 6 + last session 저장 → S6. 사이클 정산 모달
                              → 다음 사이클 자동 시드(이번 결과 + 5%)
```

### B.4 화면 정의

#### S0. 사이클 시작 모달 — "이번 6주 어떻게 보낼까요?"

목적: 벤치마크 종목 5개 pin, 사이클 길이 선택, 헬스장 선택. 입력 5분 이내.

```
[헤더]   새 사이클 시작                       [×]
[Step 1/3] 사이클 길이
  ◯ 4주 (빠른 피드백)
  ◉ 6주 (권장 — 자연인 표준)
  ◯ 8주 (장기 청사진)

[Step 2/3] 헬스장
  [woori 헬스장 ▼]   (Part C 기구 관리로 이동)

[Step 3/3] 벤치마크 종목 5개
  부위별 한 종목씩 anchor로 지정해주세요.
  [+ 가슴]  바벨 벤치프레스        시작 75kg × 12  [수정]
  [+ 등]    랫풀다운               시작 60kg × 12  [수정]
  [+ 하체]  바벨 백스쿼트           시작 100kg × 8  [수정]
  [+ 어깨]  덤벨 숄더프레스         시작 22.5kg × 10 [수정]
  [+ 팔]    바벨 컬                 시작 35kg × 12  [수정]

[하단]   [건너뛰기 — 자동 추천]   [사이클 시작]
```

권장 동작: "건너뛰기"를 누르면 최근 4주 평균에서 자동으로 5종 + 시작값을 추론한다. 기록 부족 사용자는 보수적 default.

#### S1. 사이클 청사진 대시보드 — 운동탭 진입 첫 화면

목적: "지금 어디쯤 와 있나" 한 줄, 다음 행동을 호출.

```
[Cycle Card]
  Week 3 / 6 ──────●─────────  50%
  하체 +2.5kg / 상체 +1.25kg 누적 (목표 +5kg / +2.5kg)
  남은 18 세션 중 9 완료
  [📊 매트릭스]  [🔮 예측]  [⚙️]

[Today Card] (S2와 동일 카드를 dashboard에서 미리보기)
[Volume Bar] 
  가슴 ▓▓▓▓▓▓▓░░░ 7/12   등 ▓▓▓▓▓▓▓▓░░ 11/14
  하체 ▓▓▓▓▓▓▓▓▓░ 10/12  어깨 ▓▓▓▓▓▓░░░░ 6/10
```

#### S2. 오늘 세션 처방 — 핵심 카드

목적: 트랙 자동 결정 → 벤치마크별 무게/반복/이유 1줄.

```
[Track Selector]   ◉ M-Track (중중량 고볼륨)   ◯ H-Track (고중량 저볼륨)
                   AI가 추천: 직전 세션이 H였으므로 오늘은 M

[Card 1]  주력 진행
🟥 가슴      바벨 벤치프레스
4세트 × 8~10회 · RPE 8 · 시작 77.5kg
이유: 지난 M세션 75kg×10,10,9 완료 → +2.5kg
[수락]  [수정]  [건너뛰기]
        ↓ 펼침
        근거
        - 최근 수행: 2026-04-29 75kg × 10,10,9 (RPE 8)
        - e1RM: 92.4kg → 오늘 기준 95.2kg
        - 사이클 진행: 시작 75 → 목표 80, 현재 77.5 (50%)

[Card 2]  볼륨 채우기
🟥 가슴      케이블 인클라인 플라이
3세트 × 12~15회 · RPE 7
이유: 가슴 상부 주간 5세트 부족
[수락]  [수정]  [건너뛰기]

[Card 3]  주력 진행
🟦 등        랫풀다운
... (동일 패턴)

[하단]  [+ 종목 추가]   [세션 시작]
```

핵심 계약 (v1 Recommendation Contract와 결합):
- 모든 카드는 `kind` ∈ {`main_progression`, `volume_gap`, `balance_gap`, `accessory`, `starter`}에 라벨된다.
- 모든 카드는 `track` ∈ {`M`, `H`} 또는 `null`을 가진다.
- `selectedMajors`가 있으면 카드의 `primaryMajor`는 selectedMajors 안이거나 `crossMajorReason`을 명시.

#### S3. 듀얼 트랙 매트릭스 — 엑셀 재현

목적: 엑셀에서 사용자가 본 시각적 자기효능감을 그대로 재현. **이 화면이 차별화 포인트**.

```
[Filter]   부위 ▼ 가슴   |   기간 ▼ 현재 사이클   |   트랙 ▼ All

       │ 벤치프레스 │ 인클라인 │ 케이블플라이 │ 디클라인
       │  (M)      (H)│  (H)     (M)│  (M)         │  (H)
─────────────────────────────────────────────────────────
W1 4/27│ 75/12     78/8│ 50/10            │ 14/15        │
W1 4/29│           │   55/10              │              │ 60/8
W2 5/4 │ 75/12          │                  │ 14/15        │
W2 5/6 │           │   57.5/8             │              │ 60/8
W3 5/11│ 77.5/12        │                  │ 14/15        │
W3 5/13│           │   60/8                │             │ 60/8
W4 5/18│ ?              │                  │              │
...
W6 6/1 │ 80/12     85/8│ 65/10            │ 16/15        │ 65/8
       (예측)         (예측)
```

색 코드 (TDS 토큰):
- M-Track 셀: `--primary` 진하게 (사용자 엑셀의 진한 셀)
- H-Track 셀: `--primary-bg` 연하게 (사용자 엑셀의 연한 셀)
- 미래 셀(예측): 점선 테두리 + `--text-tertiary` (실제와 시각 구분)
- 정체 2주 이상: 좌측 테두리 `--diet-bad` (rotate 시그널)

세로 스크롤 + 가로 스크롤 모두 허용. 모바일 폭에서는 부위별 1개씩 분리 + sticky 좌측 컬럼.

#### S4. 6주 예측 카드 — "이대로 가면"

목적: 사용자의 미래 자기효능감을 시각화.

```
[헤더]  6주 뒤 당신의 무게

[Bench]  바벨 벤치프레스
  지금 ━━━━━━━━━━━╋━━━━━━━━━ 6주 뒤
  77.5 kg                    80 kg  (+3.2%)
  e1RM 95.2 → 98.1
  💪 이 추세가 유지되면 BMI×0.8 1RM 진입

[Squat]  바벨 백스쿼트
  지금 ━━━━━━━━━╋━━━━━━━━━━ 6주 뒤
  102.5 kg                   107.5 kg  (+4.9%)
  ...

[밴드]  ✨ 누적 진행 일관성 84% — 사이클 완주 확률 높음
```

예측 모델: `progressionKgPerSession × 남은 세션 수 + 현재 누적`. 정체 발생 시 보수 보정(±0.5kg/주). 외부 차트 라이브러리 없이 inline SVG sparkline.

#### S5. 헬스장 기구 관리 — Part C 참조

(다음 섹션에 분리)

#### S6. 사이클 정산 모달 — 6주 끝났을 때

```
[Header]   🎉 사이클 완주!
           2026-05-02 → 2026-06-13 (6주)

[Result]
  가슴   벤치프레스    75 → 80kg  (+6.7%)  ✅ 목표 달성
  등     랫풀다운     60 → 65kg  (+8.3%)  ✅ 목표 달성
  하체   백스쿼트    100 → 105kg (+5.0%)  🟡 목표 미달 (107.5 목표)
  어깨   숄더프레스 22.5 → 25kg (+11%)   ✅ 목표 달성
  팔     바벨컬       35 → 37.5kg (+7.1%) ✅ 목표 달성

[Volume]  주간 평균 작업세트
  가슴 11.5 (목표 12) · 등 13.8 (14) · 하체 11.2 (12) · 어깨 9.4 (10)

[Next]
  ◉ 같은 framework로 다음 사이클 (이번 결과 + 4주차 deload)
  ◯ 종목 rotate (정체 종목 1~2개 교체)
  ◯ Strength framework로 변경 (5/3/1)

[하단]  [수확 모달로 가기]   [다음 사이클 시작]
```

토마토 사이클(`settleTomatoCycleIfNeeded`)과 분리된 별개 정산이지만, UI는 동일한 "수확" 메탈모델을 공유한다.

### B.5 사용자 액션 → 학습 루프

| 사용자 액션 | 시스템 학습 |
|---|---|
| 수락 | 다음 추천 우선순위 ↑ |
| 수정(kg/reps) | 수정값을 다음 처방의 baseline으로 |
| 건너뛰기 | 같은 세션 안 hide, 다음 세션 우선순위 ↓ |
| 정체 2주 (같은 무게 미달) | rotate 시그널 — 같은 부위 다른 종목 제안 |
| RPE 9+ 2회 연속 | 자동 deload (다음 세션 -10% 무게) |
| 컨디션 나쁨 | M-Track으로 전환, 무게 -5% |

### B.6 v1과의 매핑

| v1 Phase | v2 매핑 |
|---|---|
| Phase 0 — 추천 계약 + 정규화 | 그대로 유지. 카드에 `track` 필드 추가. |
| Phase 1 — 긴급 UX/버그 | 그대로 유지. 트랙 자동 결정 추가. |
| Phase 2 — 카드 UI 통일 | 그대로 유지. 카드 좌측에 트랙 색띠 추가. |
| Phase 3 — 계획 vs 실제 미니 청사진 | **확장**: `_settings.max_cycle.weeklyVolumeTarget` 추가, 매트릭스 뷰(S3) 추가. |
| Phase 4 — 헬스장 태그 | **확장**: Part C 데이터 모델로 진화. |
| Phase 5 — 프레임워크 도입 | **변경**: default를 `dual_track_progression_v2`로 교체. RP/5·3·1은 advanced. |

---

## Part C. 헬스장별 기구 CRUD + 공통모듈

### C.1 요구사항 재확인

- 일반/프로/테스트모드 **공통**으로 헬스장별 기구 관리.
- 덤벨/바벨/맨몸 같은 **헬스장 무관 공통모듈**은 한 번 등록 후 모든 헬스장에서 활용.
- **CRUD 모두 가능**.
- 테스트모드에서 헬스장 선택 시 **공통모듈 + 그 헬스장 전용**을 머지해 추천.
- 사용자 결정: **전역 풀 + 헬스장별 활성화 토글** 방식.

### C.2 데이터 모델

기존 `data-workout-equipment.js`의 `users/{uid}/gyms/{gymId}` 구조를 확장하고, 새 컬렉션 `equipment_pool`을 추가한다.

#### C.2.1 글로벌 풀 (유저 단위, 헬스장 무관)

```js
// users/{uid}/equipment_pool/{poolId}
{
  id: 'pool_dumbbell_2_50',
  scope: 'global',                       // 'global' | 'gym'
  name: '덤벨 (2~50kg, 2.5kg 간격)',
  category: 'dumbbell',                  // barbell | dumbbell | machine | cable | smith | bodyweight | band | kettlebell
  movementIds: ['dumbbell_press','dumbbell_curl','dumbbell_row',...],
  variations: {
    weights: { min: 2, max: 50, step: 2.5, unit: 'kg' },
    pairs: 2                             // 양손에 2개
  },
  notes: '',
  createdAt, updatedAt
}
```

기본 시드(앱 첫 진입 시 자동 생성):
- `pool_barbell_olympic` — 올림픽 바벨 (20kg + 원판)
- `pool_dumbbell_default` — 덤벨 풀 (2~50kg)
- `pool_ezbar` — EZ바
- `pool_bodyweight` — 맨몸 (푸쉬업, 풀업, 딥스, 행잉레그)
- `pool_band_resistance` — 저항 밴드 (선택)

#### C.2.2 헬스장 (확장)

```js
// users/{uid}/gyms/{gymId}
{
  id, name, location, notes,
  enabledGlobalPoolIds: [                // 글로벌 풀 중 이 헬스장에서 사용 가능한 것
    'pool_barbell_olympic',
    'pool_dumbbell_default',
    'pool_bodyweight'
  ],
  exclusiveEquipmentIds: [               // 이 헬스장에만 있는 전용 기구
    'eq_woori_lat_machine',
    'eq_woori_legpress_v2'
  ],
  createdAt, updatedAt
}
```

#### C.2.3 헬스장 전용 기구

```js
// users/{uid}/equipment_pool/{poolId}  — scope:'gym'
{
  id: 'eq_woori_lat_machine',
  scope: 'gym',
  ownerGymId: 'gym_woori',
  name: '랫풀다운 머신 (V2)',
  category: 'machine',
  movementIds: ['lat_pulldown'],
  variations: { weightStack: { min: 5, max: 100, step: 5 } },
  photoUrl: null,                        // 사용자 업로드
  notes: '시트 4번이 이상함',
  createdAt, updatedAt
}
```

`equipment_pool/{poolId}`라는 단일 컬렉션에 `scope`로 구분. 글로벌이면 `ownerGymId` 없음, gym 전용이면 `ownerGymId` 필수.

#### C.2.4 활성 세션 컨텍스트

```js
S.workout.currentGymId            // 오늘 세션의 헬스장
S.workout.activeEquipmentIds      // currentGym.enabledGlobalPoolIds + exclusiveEquipmentIds
```

`activeEquipmentIds`는 `loadWorkoutDate()` 또는 `setCurrentGym()` 시점에 계산해 메모리에 캐시.

### C.3 CRUD API (`data/data-equipment-pool.js` 신설)

```js
// Read
loadEquipmentPool(uid)                   // 모든 풀 (global + 모든 gym 전용)
loadActiveEquipmentForGym(uid, gymId)    // gym에 활성된 global + gym 전용

// Create
createGlobalPool(uid, { name, category, movementIds, variations })
createGymExclusive(uid, gymId, { name, category, ... })

// Update
updateEquipment(uid, poolId, patch)
toggleGymPool(uid, gymId, poolId, enabled)   // 글로벌 풀의 헬스장별 활성화 토글

// Delete
deleteEquipment(uid, poolId)             // 사용 중이면 confirm 모달
```

기존 `data-workout-equipment.js`의 gym CRUD는 그대로 유지하되, `gyms/{gymId}`의 `enabledGlobalPoolIds`/`exclusiveEquipmentIds` 필드만 추가. 마이그레이션은 `migrateLegacyExercises()` (Phase 4).

`data.js` 배럴에서 re-export:

```js
export {
  loadEquipmentPool, loadActiveEquipmentForGym,
  createGlobalPool, createGymExclusive,
  updateEquipment, toggleGymPool, deleteEquipment
} from './data/data-equipment-pool.js';
```

### C.4 추천 엔진의 머지 로직

```js
// workout/expert/max.js 추천 후보 생성 시
const activeEquipment = await loadActiveEquipmentForGym(uid, S.workout.currentGymId);
const activeMovementIds = new Set(activeEquipment.flatMap(e => e.movementIds));

const candidates = exerciseList.filter(ex => activeMovementIds.has(ex.movementId));
// 이 후보군 안에서만 추천 카드를 생성
```

#### C.4.1 헬스장 전환 시

`setCurrentGym(newGymId)` 호출 시:
1. 기존 세션에 등록된 종목 중 `newGym.activeEquipment`에 없는 것을 식별.
2. 사용자에게 옵션 제공:
   - 유지 — 오늘 세션에만 남기기
   - 새 헬스장에도 추가 — `exclusiveEquipmentIds`에 추가
   - 숨김 — 오늘 세션에서 제외
3. 추천 카드는 새 헬스장 기준으로 재계산.

### C.5 UI — 헬스장 기구 관리 (S5)

```
[헤더]  헬스장 관리                          [+ 새 헬스장]

[탭]    [woori 헬스장 ●]  [집]  [출장지 호텔]

[woori 헬스장]  서울 강남구 · 메인 헬스장
                [편집] [삭제]

[Section: 공통 모듈]   "다른 헬스장에서도 같이 쓰는 기구"
  ◉ 바벨 (20kg + 원판) ─ 활성              [편집]
  ◉ 덤벨 (2~50kg, 2.5kg 간격) ─ 활성       [편집]
  ◉ 맨몸 (푸쉬업/풀업/딥스/행잉) ─ 활성    [편집]
  ◯ EZ바 ─ 비활성                          [편집]
  [+ 공통 모듈 추가]

[Section: woori 전용 기구]
  랫풀다운 머신 V2                          [편집] [삭제]
   머신 · 5~100kg
  레그프레스 V2                             [편집] [삭제]
   머신 · 20~300kg
  스미스 머신                              [편집] [삭제]
   smith · 무게추 자동
  [+ 전용 기구 추가]

[하단]  📷 사진으로 한꺼번에 등록 (AI 인식)
        ✏️ 수기로 직접 입력
```

핵심 인터랙션:
- 공통 모듈은 토글로 활성/비활성. 비활성 시 추천에서 제외되지만 다른 헬스장에서는 유지.
- 전용 기구는 이 헬스장에만 존재. 삭제 시 confirm.
- 사진 일괄 등록은 기존 `gym-equipment-modal.js`의 AI 파서 재사용.

### C.6 마이그레이션 (Phase 4 보강)

기존 `users/{uid}/exercise_list/{exerciseId}` 데이터에는 헬스장 컨텍스트가 없다.

1. 첫 진입 시 사용자가 사용 중인 종목들을 `pool_legacy`라는 임시 풀에 모아 `scope:'global'`로 흡수.
2. 헬스장 1개라도 등록되면, 사용자에게 "기존 종목들을 어느 헬스장에 배치할까요?" 마이그레이션 모달.
3. 마이그레이션 완료 전까지는 모든 헬스장에서 legacy pool을 활성으로 처리(데이터 손실 방지 룰).

`localStorage` 금지 룰을 따라, 마이그레이션 완료 플래그는 `_settings.equipment_pool_migrated_at` (Firestore)에 저장.

### C.7 모드별 동작

| 모드 | 동작 |
|---|---|
| 일반 | 헬스장 선택 후, 활성 기구 안에서만 종목 picker 표시. CRUD UI 동일. |
| 프로 (Expert v1) | 동일. 추가로 `routine_templates`가 헬스장 컨텍스트를 가짐. |
| 테스트 (Max v2) | 동일. 추가로 사이클 시작 시 헬스장 lock(중간 변경 시 경고). |

---

## Part D. 추가 제안 / 대안

### D.1 6주 예측을 더 강한 시그널로 — "당신의 첫 100kg 벤치"

벤치마크 종목 중 strength milestone(BW×1, BW×1.5, 100kg, 60kg 등)에 가장 가까운 종목에 대해 별도의 milestone 카드를 띄운다. "현재 92.5kg → 6주 뒤 97.5kg → 첫 100kg까지 8주". 사용자가 매트릭스에서 봤던 "이대로 가면 어디까지 가나"를 더 강하게 시각화.

### D.2 RP/5·3·1 자동 매핑

Default `dual_track_progression_v2`는 사실 RP-Lite의 단순화 버전이다. 사용자가 충분한 데이터(8주 이상 기록)를 쌓으면, 동일한 데이터에서 RP / 5·3·1 처방이 어떻게 다른지 비교해주는 advanced 모드를 노출. 사용자는 framework를 바꿀지 결정.

### D.3 토마토 사이클과의 연동

토마토팜의 토마토 사이클(매일 단위)과 매트릭스 사이클(6주 단위)은 다른 시간 척도다. 두 사이클을 분리하되, **6주 사이클 정산 모달에서 토마토 누적 수확을 함께 보여주면** 두 메탈모델이 서로 강화한다 ("이번 6주에 토마토 5개 수확, 벤치 +5kg").

### D.4 단일 매트릭스 뷰의 모바일 적응

엑셀 매트릭스를 모바일에서 그대로 보여주면 가로 스크롤이 길다. 두 가지 뷰를 제공:
- **Compact view** — 부위 1개 + 종목 4개 + 주차 6개. 모바일 default.
- **Wide view** — 부위 전체. 가로 스크롤 + sticky 컬럼. 태블릿/데스크탑.

### D.5 종목별 트랙 자동 라벨링

벤치마크 종목 5개를 사용자가 pin할 때 트랙(M/H)을 직접 고르라고 하면 입력 비용이 너무 크다. 대신 카테고리 휴리스틱으로 자동 부여하고 사용자가 수정만 가능하게.

```
프리웨이트 컴파운드 → M+H (둘 다)
머신 컴파운드      → M
케이블/플라이      → M (보조)
프리웨이트 isolation → H (후반 강도)
```

### D.6 최종 제품 결정

| 항목 | 최종 결정 | 이유 |
|---|---|---|
| 사이클 길이 | 6주 default, 4/8주는 고급 설정 | 사용자가 성공 경험을 가진 단위이고, 자연인 점진과부하 체감 주기와 맞는다. |
| 기본 framework | `dual_track_progression_v2` | RP/5·3·1보다 사용자의 과거 성공 메탈모델과 직접 연결된다. |
| 사용자 라벨 | `볼륨 트랙` / `강도 트랙` | `중·고`는 엑셀에는 빠르지만 신규 사용자에게 모호하다. 내부 키는 `M`/`H` 유지. |
| 성장폭 기본값 | 상체 6주 +2.5kg, 하체 6주 +5kg | 과거 엑셀 경험과 자연인 보수적 증량 폭을 모두 만족한다. |
| 벤치마크 개수 | 처음에는 5개 권장, 최대 8개 | 너무 많으면 다시 엑셀 관리 비용으로 돌아간다. 부위별 KPI만 남긴다. |
| 보조 추천 위치 | 성장판 아래 `볼륨 보강` 섹션으로 강등 | 테스트모드의 주인공은 추천 종목이 아니라 사이클 진행이다. |
| Strength milestone 카드 | default ON, 설정에서 OFF | "첫 100kg", "BW×1" 같은 목표는 성장 감각을 강화한다. |
| 헬스장 기구 모델 | 전역 풀 + 헬스장별 활성 토글 + 헬스장 전용 기구 | 바벨/덤벨은 공통, 머신은 헬스장 종속이라는 실제 사용 맥락과 맞다. |
| 사이클 중 헬스장 변경 | 경고 후 `오늘만 변경` 또는 `사이클 일시정지 후 재매핑` | 다른 기구 스펙이 섞이는 현상을 막는다. |
| 최종 목업 기준 | `mockups/test-mode-v2-mockup.html` | 이후 구현, 피드백, 검수의 단일 기준 산출물로 사용한다. |

---

## Part E. 구현 로드맵 (v1 위에 추가)

### E.0 구현 범위 가드

- `dual_track_progression_v2`, 6주 성장판, 트랙 추천, 사이클 시작/정산, 계획 대비 실제 그래프는 **테스트모드에만 적용**한다.
- 헬스장/공통 기구 CRUD는 사용자 요구상 일반/프로/테스트모드 공통 기반 기능으로 구현하되, 테스트모드에서는 이 기구 풀을 추천 후보 필터로 사용한다.
- 기존 일반모드 기록 UX와 프로모드 루틴 UX는 기구 picker의 후보군만 공유하고, 화면 구조나 추천 메커니즘은 바꾸지 않는다.
- 기존 `expert_preset`, `tomato_state`, 사진 필드, 과거 운동 기록은 절대 덮어쓰지 않는다. settings 저장은 항상 merge 기반이어야 한다.
- `www/`는 빌드 산출물이므로 직접 수정하지 않는다. 정적 자산 변경 시 `sw.js`의 `CACHE_VERSION`을 함께 올린다.

| Phase | 작업 | 산출 |
|---|---|---|
| **v2-0 목업 확정** | TDS 기준 단일 목업 정리, 화면 8종의 정보 우선순위 확정 | `mockups/test-mode-v2-mockup.html` |
| **v2-1 추천 계약 보강** | Recommendation Card에 `track`, `cycleWeek`, `benchmarkId`, `planReason` 필드 추가 | `workout/expert/max.js`, `expert-mode.css` |
| **v2-2 사이클 코어** | `_settings.max_cycle` 데이터 모델 + 사이클 시작 모달 + 오늘 행 생성 | 신규 `workout/expert/max-cycle.js`, `modals/max-cycle-start-modal.js` |
| **v2-3 오늘 화면 전환** | 테스트모드 첫 화면을 추천 리스트에서 `오늘 성장판 행` 중심으로 전환 | `workout/expert/max.js`, `workout/exercises.js` |
| **v2-4 매트릭스/예측** | 매트릭스 뷰(S3), 6주 예측 카드(S4), 계획 vs 실제 delta | 신규 `workout/expert/matrix-view.js`, `calc.js` |
| **v2-5 기구 풀** | `equipment_pool` 데이터 모델 + 공통/헬스장 전용 CRUD + 마이그레이션 | 신규 `data/data-equipment-pool.js`, `modals/gym-equipment-pool-modal.js` |
| **v2-6 정산/다음 사이클** | 사이클 정산, 다음 사이클 자동 시드, strength milestone | `workout/expert/max-cycle.js`, 정산 모달 |
| **v2-7 안전장치** | 정체 감지, rotate 시그널, RPE cap, deload 분기 | `calc.js`, `workout/expert/max.js` |

배포 단위 추천: v2-0은 문서/목업, v2-1~v2-3을 1차 기능 배포, v2-4를 2차 시각화 배포, v2-5를 3차 공통 인프라 배포, v2-6~v2-7을 4차 코칭 고도화로 묶는다. 각 단계에 SW 캐시 버전 범프 + 기존 데이터 보존 회귀 체크 필수.

---

## Part F. 검증 / 테스트 계획 추가

v1 검증 위에 추가:

- 사이클 시작 → 6주차 처방까지의 무게 곡선이 `progressionKgPerSession`과 일치하는지 시뮬레이션 테스트.
- M-Track 처방값이 H-Track의 70~80% 강도, 1.5배 볼륨인지 검증.
- 매트릭스 뷰에서 미래 셀(예측)과 과거 셀(실측)이 시각적으로 구분되는지 e2e 스냅샷.
- 헬스장 A에서 등록한 풀이 B 추천에 누락 없이 (활성 토글에 따라) 반영되는지.
- 6주 사이클 정산 후 `_settings.max_cycle.status: 'completed'`로 변경되고 `expert_preset`/`tomato_state` 등 다른 settings가 보존되는지 (setDoc 덮어쓰기 회귀 방지).

---

## 변경 이력

- 2026-05-02: v1 보완 위에 사용자의 23년 엑셀 매트릭스 분석을 코칭 평가로 통합. `dual_track_progression_v2`를 default framework로 격상. `equipment_pool` 데이터 모델 신설. 5~7화면 시나리오 정의. 매트릭스 뷰(S3)·6주 예측(S4)·사이클 정산(S6) 신규 화면 추가.
