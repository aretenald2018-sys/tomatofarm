# 테스트모드 v4 — From Scratch 비판 리뷰 & 재설계 제안

작성일: 2026-05-02
범위: `workout/expert/max.js`, `workout/expert/max-cycle.js`, `expert-mode.css`. 실제 코드 수정 아님 — UX/디자인 시스템 재정의 및 목업.
목업 파일: `mockups/test-mode-v4-from-scratch.html` (Today / Adjust Sheet / Cycle Board / Plan Editor 4 frame)
선행 문서: `TEST_MODE_UX_CRITICAL_REVIEW.md` (v3), `TEST_MODE_REDESIGN_PLAN_v2.md`, `TEST_MODE_REDESIGN_PLAN.md`, `TEST_MODE_EXCEL_METHOD_PLAN.md`
업데이트 이력: 2026-05-02 v3 비판 점검표 통과 후 4 frame 으로 확장 + Today에 6주 목표 라인 + Adjust Sheet에 이번만/다음주 토글 + 마지막 10분 보강 placeholder 추가

---

## 0. 한 줄 요약

> 테스트모드는 **화면이 아니라 도구**다. 도구는 잡으면 바로 쓸 수 있어야 한다. 사용자는 카드를 승인하고 싶어 하는 게 아니라, 무게를 직접 잡고 싶어 한다.

v3까지의 리디자인은 "카드를 더 잘 배치하자"였다. v4는 다르다. **카드 자체를 거의 없앤다.**

---

## 1. 토스/애플 디자이너의 첫 인상 — 1분 안에 잡히는 것들

### 1.1 한 화면에 디자인 언어가 5개

`renderMaxCard(host)` 의 정상 경로 HTML을 읽으면 한 화면에 들어가는 것은 다음과 같다.

1. `wt-mode-seg` — 일반/프로/테스트 세그먼트.
2. `cycleHtml` — `renderMaxCycleDashboard()` 가 만든 대시보드 카드.
3. `planHtml` — `_renderMaxPlanCard()` Plan 카드 (framework, deload, target sets 등).
4. `setupHtml` — `_renderMaxSetup()` 설정 카드 (벤치마크, 목표 RPE, 헬스장 등).
5. `wt-max-card` — "🎯 오늘의 보강 추천" 카드 + 그 안에 추천 카드 N개. 각 추천 카드에 `수락 / 수정 / 거절` 3 CTA 와 `왜?` 토글.

같은 화면에 5개의 모듈 헤더가 나열된다. `🎯`, `🟥`, `🟦`, `🏋️`, `📭`, `✨`, `🔮` 같은 이모지가 모듈마다 다르게 박혀 있다. 모듈마다 카드 라운딩이 다르고, 모듈마다 메타라벨 위치가 다르다. **사용자가 "비직관적이다", "정보 배치가 제각각이다" 라고 한 것은 객관적 사실이다.**

토스/애플 디자이너 관점에서 첫 진단은 단순하다. 한 화면에 모듈은 1개여야 한다. 화면이 모듈을 모은 컨테이너가 아니라, 화면 자체가 1개의 도구가 되어야 한다.

### 1.2 추천 카드 한 개당 CTA 3개

`_renderMaxRecommendationCard()` 마크업.

```
[수락] [수정] [거절]   (각 카드)
```

추천이 6개 뜨면 화면에 18개의 버튼이 나온다. 거기에 `왜?` 토글, 칩 카테고리, 추천 종류 라벨까지 합치면, 사용자는 카드 1장을 읽기 위해 7~8개 인터랙션 포인트를 해석해야 한다.

이는 추천 엔진이 사용자의 결정을 요구하는 구조다. 그러나 운동 직전 사용자는 결정을 원하지 않는다. **수행을 원한다.** Toss 송금 화면이 사용자에게 "이 송금을 추천합니다, 수락/수정/거절" 을 묻지 않는 것과 같다. 자동으로 합리적인 디폴트를 깔아 두고, 잡으면 바꿀 수 있게 한다. 결정은 변경의 부산물이지 진입 조건이 아니다.

### 1.3 무게가 텍스트다 (사용자 지적의 정확한 원인)

`_prescriptionSummary(prescription)` 의 출력은 `"77.5kg × 12"` 같은 문자열이다. 이걸 바꾸려면 `data-action="apply-max" data-rec-modified="1"` 의 `[수정]` 버튼을 누르고 다른 시트/모달로 이동해야 한다.

사용자가 "무게도 고정되어 있고" 라고 말한 진짜 이유다. 시각적으로는 텍스트, 인터랙션은 모달. 시각과 인터랙션이 어긋나면 사용자는 그 요소가 "고정"이라고 학습한다. 토스가 송금 금액을 inline stepper로 두는 이유와 같다 — 숫자 자체가 컨트롤이어야 한다.

### 1.4 트랙이 라벨이다 (사용자 지적의 정확한 원인)

`_targetTrackLabel(track)` 은 `'볼륨 트랙' | '강도 트랙'` 문자열을 만들어 카드 안에 박는다. 클릭 핸들러가 없다.

사용자가 "볼륨트랙이랑 중량트랙 카드는 바꿀 수가 없고" 라고 한 정확한 이유. 트랙은 정보 표시가 아니라 입력값이다. **상단의 큰 segmented control 이어야 하고, 누르면 그 즉시 모든 무게/세트가 재계산되어야 한다.** v3 리뷰가 말한 것을 한 번 더 강조한다.

### 1.5 색이 의미를 잃었다

코드 안에서 동시에 활약하는 색 시스템:

- 브랜드 토마토 레드 (`#fa342c`).
- 부위색 (가슴/등/하체/어깨가 각각 다른 색).
- 트랙 색 (M-Track 진하게, H-Track 연하게).
- Recommendation kind 색 (`wt-max-rec-card--main_progression`, `--volume_gap`, `--balance_gap`, `--starter`, `--weak_focus`, `--habit_keep`).
- Diet 패널의 good/bad 색.

같은 화면에서 5개의 색 스케일이 동시에 의미를 주장한다. 사용자는 색을 의미로 읽지 않고 장식으로 읽는다 — 사용자가 정확히 한 표현이다.

토스/애플 원칙: **색은 한 번에 한 가지만 말한다.** 진행률, CTA, "오늘" 표식 — 이 셋만 토마토 레드를 쓴다. 부위/트랙/카테고리는 색을 포기하고 텍스트와 위계로 표현한다.

### 1.6 이모지가 디자인을 대체하고 있다

`🎯 오늘의 보강 추천`, `🟥/🟦` 부위 도트, `🏋️/📭/✨/🔮` empty/loading state, `★` foot note. 이모지는 빠르게 정보를 주는 듯 보이지만 다음 비용을 만든다.

- iOS/Android 렌더링이 다르다.
- 시각적 무게가 텍스트보다 크다 — 정보 위계를 헝클어뜨린다.
- 디자인 시스템에 들어오지 않는다 — 폰트가 바뀌어도 톤이 안 맞는다.

토스도 애플 Health도 이모지를 거의 안 쓴다. `Tossface` 가 있어도 의미적 도구로만 쓰지 장식으로 쓰지 않는다. **v4는 이모지 0개에서 시작한다.** 필요하면 SVG icon을 monochrome으로 추가한다.

### 1.7 "추천" 메탈모델이 잘못됐다

화면 헤더가 `🎯 오늘의 보강 추천` 이다. 사용자가 일정 동안 운영하던 6주 사이클 매트릭스를 "보강 추천 시스템"으로 부르고 있다. 이는 사용자에게 다음 메시지를 준다.

> "당신은 추천을 받는 사람이다. 시스템이 큐레이션을 해주고, 당신은 승인 버튼을 누르면 된다."

사용자가 원했던 메시지는 다르다.

> "당신은 6주 동안 무게를 한 단씩 올려가는 사람이다. 오늘의 무게는 어제까지의 결과로 계산되어 있다. 잡으면 바뀐다."

화면 헤더 자체가 "오늘의 보강 추천" 이 아니라 그냥 **오늘 날짜 + Week N/6** 이어야 한다. "추천" 이라는 단어를 첫 화면에서 지운다.

---

## 2. v3 리뷰가 놓쳤던 것

v3 리뷰는 정보 우선순위에 대한 분석은 정확했지만, 다음을 명시하지 못했다.

| v3가 말한 것 | v4가 추가하는 것 |
|---|---|
| "트랙은 segmented control이어야 한다" | 그 외 모든 카드 헤더(`🎯 오늘의 보강 추천`, `Plan`, `Setup`)를 첫 화면에서 제거한다. 화면 = 1 모듈. |
| "무게는 stepper" | stepper도 분리된 컨트롤이 아니다. **숫자 자체가 컨트롤이다.** 숫자 탭 → 인라인 stepper. 길게 누름 → bottom sheet (Adjust Sheet). |
| "색을 4개 역할로 제한" | 4개도 많다. **회색조 + 토마토 1색**. 완료 표시는 토마토에서 채도만 빼서 표현. |
| "Today / Cycle / Plan Editor 3 화면" | 같다. 다만 Plan Editor는 첫 출시 범위에서 빼도 된다. 사용자는 1년에 6번(사이클 시작/종료)만 들어간다. |
| "추천 카드는 강등" | 강등이 아니라 첫 화면에서 사라진다. "마지막 10분 보강" 이라는 작은 inline 섹션이 Today 가장 아래에 들어간다 — CTA도 1개. |
| "framework copy 제거" | 같다. 추가로 RP Lite / 5·3·1 / Hybrid 같은 advanced framework를 첫 화면에서 보이지 않게 한다. 이런 옵션은 본인이 찾는 사람에게만 의미 있다. |

v3가 화면을 정리하는 수준이라면, v4는 **디자인 시스템을 다시 깐다.**

---

## 3. v4 디자인 원칙 — Toss/Apple 합의

### 3.1 숫자가 주인공이다 (Numerical-first)

운동 앱의 첫 화면 주인공은 한 가지다 — **오늘 잡을 무게**. 무게 숫자는 다음 규약을 따른다.

- 폰트: SF Pro Display Bold (한글 fallback: SF Pro KR / Pretendard / Toss Product Sans).
- 크기: 화면 폭 390px 기준 56px 이상. (TDS Mobile t1 = 30px → 거의 2배.)
- `font-variant-numeric: tabular-nums lining-nums;` — 자릿수 변해도 흔들리지 않게.
- 단위(`kg`)는 숫자의 30% 크기, 같은 베이스라인.
- 색: `--ink-1` (거의 검정). 토마토 레드는 절대 안 씀.
- 아래에 세트/반복은 한 단계 작은 secondary로.

이렇게 하면 사용자는 화면에 진입한 0.3초 안에 "오늘 잡을 무게"를 읽는다.

### 3.2 색은 다섯 단계 회색 + 토마토 1색

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ink-1` | `#0a0a0c` | 무게 숫자, 핵심 라벨 |
| `--ink-2` | `#1c1c1e` | 종목명, 본문 |
| `--ink-3` | `#6b6b6f` | 보조 정보, 단위, 메타 |
| `--ink-4` | `#a8a8ac` | placeholder, 비활성 |
| `--line` | `#ececef` | divider |
| `--bg` | `#fafafb` | 배경 |
| `--surface` | `#ffffff` | 카드/시트 |
| `--tomato` | `#fa342c` | 1) primary CTA, 2) 진행률 바, 3) Week N 표식. 그 외 금지. |
| `--tomato-pale` | `#fdf0f0` | 선택 상태 배경 |
| `--pos` | `#2db676` | 실제 완료 마크 (수치 옆 작은 점). 텍스트엔 안 씀. |
| `--warn` | `#d99a14` | 정체 2주 이상 좌측 띠. 텍스트엔 안 씀. |

부위색·트랙색·카테고리색은 **전부 폐기**. 부위는 라벨 텍스트로만. 트랙은 segmented control 의 선택 상태로만.

### 3.3 8pt 그리드 + 명확한 리듬

- 간격: 4 / 8 / 12 / 16 / 20 / 24 / 32. 그 외는 안 씀.
- 카드 라운딩: 16px (Apple Health 카드와 같은 톤).
- 카드 그림자: `0 1px 0 rgba(10,10,12,0.04), 0 12px 32px rgba(10,10,12,0.04)` — 거의 없음. 평면적.

### 3.4 한 화면 = 한 모듈 = 한 CTA

화면 어디에도 두 번째 primary 액션을 두지 않는다. Today 화면의 sticky CTA 는 `운동 시작` 하나. 그 외 동작(`계획 조정`, `전체 사이클 보기`)은 ghost link 로 약하게.

### 3.5 직접조작 (Direct Manipulation)

- 무게 숫자 = 컨트롤. 탭 → 인라인 ±, 길게 누름 → Adjust Sheet.
- 트랙 segmented = 컨트롤. 누르면 즉시 모든 무게가 재계산되며, 변경된 숫자에 200ms 트랜지션을 준다.
- 종목 행 = 컨트롤. 좌측 swipe → "다른 종목으로 교체", 우측 swipe → "오늘 건너뛰기". (모달이 아니라 in-row.)

### 3.6 이모지 0개

`🎯`, `🟥`, `🔮`, `💪`, `🏋️`, `📭`, `✨`, `★` 모두 제거. 대체는 SVG icon (16px / 20px / 24px 세 사이즈, 단색).

### 3.7 마이크로카피의 통일

| 자리 | 현재 | v4 |
|---|---|---|
| 화면 헤더 | `🎯 오늘의 보강 추천` | `5월 2일 토 · Week 3 / 6` |
| 트랙 라벨 | `🟥 가슴 / 볼륨 트랙` | `볼륨 / 강도` (segmented) |
| CTA | `수락 / 수정 / 거절` | `시작` (단일). 변경은 숫자 탭으로. |
| Foot note | `★ 바벨/덤벨 우선 — 강제는 아니에요. 1세트라도 보강해보세요.` | (제거. 운동 직전 화면에 격려 문구 불필요.) |
| Track 자동 결정 사유 | `AI가 추천: 직전 세션이 H였으므로 오늘은 M` | 제거. 자동 적용된 결과만 보임. 궁금하면 segmented 위에 작은 i 아이콘. |

---

## 4. v4 화면 구조 — 단 3 화면

### 4.1 Today (`#today`)

진입 시 첫 화면. 다음 순서로 위에서 아래.

1. **Header strip** (높이 56) — 좌: 뒤로, 중: `5월 2일 토 · Week 3 / 6` (Week 3/6 은 `--tomato` 진행 바와 함께 표시되며 탭하면 Cycle Board로 이동), 우: `⋯` 메뉴.
2. **Track segmented** (높이 44) — `[ 볼륨 ⬤ ]  [ 강도 ]`. 탭하면 모든 무게가 재계산.
3. **Lift list** — 종목 4~5개. 각 행에 다음만:
   - 부위 캡션 (ink-3, 11px uppercase, letter-spacing 0.08em) — 라벨 텍스트, 색 없음.
   - 종목명 (ink-1, 17px, weight 600)
   - 무게 (ink-1, 56px bold, tabular) + 단위 `kg` (작게)
   - 우측: `4 × 10–12` (ink-2, 15px tabular)
   - 우측 아래: `이전 75 × 12 · 4/29` (ink-3, 12px).
   - 행 하단 가로폭 풀 라인: `─── 6주 목표 80 kg` 식의 mini progression bar — 시작값/오늘값/목표값을 같은 라인에 작은 dot로 시각화. **(v3 §2.6 "성장판이 화면 주인공" 항목 반영 — 6주 컨텍스트가 Today에서 즉시 보여야 한다.)**
   - 무게를 탭하면 인라인 `−2.5` `+2.5` 가 옆에 슬라이드 인. 길게 누르면 Adjust Sheet.
4. **마지막 10분 보강** — 한 줄 placeholder. 사용자가 핵심 4종 입력을 끝낸 시점에만 활성화. 입력 전에는 회색 hint state로 자리만 차지(`벤치마크 4종을 끝내면 부족분 1~2개를 추천합니다`). 활성화 시 1~2개 종목 inline chip + `추가` 라벨. **(v3 §4.5 "메인 카드가 아니라 마지막 10분 섹션" 반영.)**
5. **Sticky bottom** — `운동 시작` (단일 primary, 토마토). 그 위에 작은 ghost link `계획 조정` (Plan Editor 진입).

### 4.2 Adjust Sheet (`#adjust`)

Today 의 무게를 길게 누르거나 인라인 stepper의 우측 `…` 를 누르면 위로 올라오는 bottom sheet.

```
[handle bar]

[종목명]                                        [×]
가슴 · 바벨 벤치프레스

[무게 stepper big]
        − −            −          + +          +   
        −5            −2.5       +2.5         +5
              7 7 . 5  kg
   ──────────  ●   ──────────  ──────────
  70                  77.5                85
   (지난 성공)        (오늘)            (6주 목표)

[Quick presets]
  지난 성공 75    계획값 77.5    원래 80

[Reps tape — 가로 스크롤]
  4 × 12   4 × 10–12 (선택)   4 × 8   3 × 12   직접

[Apply scope segmented]
  [ 이번만 ⬤ ]   [ 다음 주부터 반영 ]
  (default: 이번만 — v3 §4.4 의미 분리 반영)

[Impact line — ± 분기, scope 분기]
  + : "계획보다 +2.5kg. 성공하면 다음 주 목표를 한 주 앞당김. 실패해도 다음 세션은 자동 75kg로 복귀."
  − : "계획보다 −2.5kg. 오늘만 낮추고 다음 주는 원래 계획 유지."
  +/scope=다음주부터 : "이번 주부터 +2.5kg 라인을 새 baseline으로 삼고 6주 목표도 +2.5kg 상향 조정."
  −/scope=다음주부터 : "이번 주부터 −2.5kg 라인으로 baseline 재설정. 6주 목표는 그대로 유지."

[CTA 라인]
  [원래대로]                              [확정]
```

핵심 디테일:

- 큰 숫자 `80` 은 그 자체로 드래그 가능. 좌우로 드래그 → ±0.5kg 미세 조정.
- 슬라이더의 세 anchor (지난 성공 / 오늘 / 6주 목표)가 사용자에게 무게의 의미 좌표계를 준다.
- ± 부호와 scope (`이번만` / `다음 주부터`) 조합에 따라 impact line이 4가지 카피로 즉시 반응.
- v3 §4.4 의 "오늘만 낮추고 다음 주는 원래 계획 유지" / "성공하면 다음 주 목표를 앞당김" 의미 차이를 segmented control 로 명시화.

### 4.3 Cycle Board (`#cycle`)

Today header 의 `Week 3 / 6` 을 누르면 진입.

```
[Top bar]
  ← Today        Week 3 / 6        [⋯]

[Hero]
  바벨 벤치프레스                                [부위 ▾]
  75.0  →  80.0 kg                          진행 50%
  ▁▂▃▄▅      [큰 line sparkline 80px 높이]

[Week list — 세로 스크롤, sticky 헤더]
  W1  4/27  볼륨   75 × 12  ●     78 × 8  ●     강도
  W1  4/29  ─                                      ─
  W2  5/4   볼륨   75 × 12  ⚠️    ─                  ─
  W2  5/6   ─                     78 × 8  ●     강도
  W3  5/11  볼륨   77.5 × 12  ←오늘
  W3  5/13  ─                     ─                ─
  W4  5/18  볼륨   78 × 12  (예측)
  W5        볼륨   80 × 12  (예측)
  W6  6/1   볼륨   80 × 12  (목표)               🏁

[footer]
  다른 벤치마크로 보기  →
```

- 가로 스크롤 안 함. 한 종목 = 한 column = 가로 풀폭.
- "다른 벤치마크로 보기" → 같은 화면 hero swap. (Apple Health 의 metric 전환과 같은 톤.)
- 정체 (`⚠️` 자리는 v4에서 작은 `--warn` 좌측 띠로 대체).
- 미래 셀은 ink-4 색 + 점선 좌측 띠.

### 4.4 Plan Editor (`#plan`)

Today 의 ghost link `계획 조정` 을 누르면 진입. v3 §5 가 "Plan Editor 화면" 으로 명시한 surface. v2의 `_renderMaxSetup()` / `_renderMaxPlanCard()` / 헬스장 기구 관리 / 사이클 정산이 모두 여기로 통합된다.

```
[Top bar]
  ← Today      계획 조정       저장

[Section 1: 사이클]
  사이클 길이
  [ 4주 ]  [ 6주 ⬤ ]  [ 8주 ]
  
  시작일: 4/13 (W1)  ·  종료일: 6/1 (W6)
  사이클 정산은 마지막 세션 완료 시 자동 호출.   ↗ 지금 보기

[Section 2: 벤치마크 5종]
  부위별 한 종목씩 anchor. 각 행:

  가슴
  바벨 벤치프레스                              [편집]
  75 → 80 kg     · 트랙 둘 다 · +2.5kg/주

  등
  랫풀다운                                     [편집]
  60 → 65 kg     · 트랙 둘 다 · +2.5kg/주

  하체
  바벨 백스쿼트                                [편집]
  100 → 105 kg   · 트랙 둘 다 · +5kg/주

  어깨
  덤벨 숄더프레스                              [편집]
  32.5 → 35 kg   · 트랙 둘 다 · +2.5kg/주

  팔
  바벨 컬                                      [편집]
  32.5 → 35 kg   · 트랙 둘 다 · +2.5kg/주

  [+ 종목 변경 / 추가]

[Section 3: 헬스장]
  현재: 우리 헬스장
  공통 모듈 5개 + 전용 기구 8개 활성
  ↗ 헬스장 / 기구 관리

[Section 4: 고급 (접힘 default)]
  ▾ 펼치기
  - 프레임워크: 듀얼 트랙 (default) / RP Lite / 5·3·1 / Hybrid
  - Deload 주차: 자동 / 수동 (W4)
  - 종목 교체 신호: 정체 2주 후 알림
  - 컨디션 기반 자동 트랙 전환 (실험적)

[Footer 위험 액션]
  사이클 일시정지
  다른 헬스장에서 다시 시작
```

핵심 디테일:

- v3 가 "기구 관리, 정산, 프레임워크는 Plan Editor 안으로 들어간다" 라고 명시했던 모든 항목을 한 화면에 통합. 단, 디폴트는 가시성 4 섹션만. `고급` 은 접힘 — 신규 사용자에게 framework / deload / RP lite 같은 용어가 노출되지 않는다.
- `편집` 행은 Adjust Sheet 와 같은 시각언어를 재사용 (큰 숫자 stepper). 진입 시 시작값/목표값/증량폭을 한 화면에서 바꾼다.
- `↗` 화살표는 별도 surface 로의 이동을 나타내는 monochrome SVG icon. 동선이 깊어지는 것을 명시적으로 보여주기 위함.
- v2 의 `_settings.max_cycle` 데이터 모델을 그대로 입출력으로 사용 — 데이터 모델 변경 없음.

---

## 5. 인터랙션 시나리오 (재정의된 5초)

운동 직전 사용자 시나리오.

```
0.0초  앱 진입. 운동 탭. 테스트모드 자동 (이미 ON).
0.3초  화면에 "5월 2일 토 · Week 3 / 6" 과 첫 종목 "벤치 77.5kg" 이 보인다.
0.8초  스크롤 없이 4종목의 오늘 무게가 다 보인다.
1.5초  "오늘은 볼륨이구나" 가 segmented 의 채워진 칸으로 인지된다.
2.0초  "벤치는 77.5인데 어제 컨디션 나빴으니 75로" — 77.5 를 탭, 인라인 −2.5 를 누름.
2.5초  무게가 75로 부드럽게 바뀜. 아래 줄: "계획보다 −2.5kg. 다음 주는 원래대로." 가 뜸.
3.0초  바닥의 [운동 시작] 을 누름.
```

이 5초 안에 사용자는 한 번도 모달을 보지 않았다. 한 번도 "수락" 같은 단어를 읽지 않았다. 한 번도 색을 해석하지 않았다.

---

## 6. 구현 차이 — v3 → v4

`workout/expert/max.js` 기준 변경점.

### 제거

- `_renderMaxSetup()` 의 첫 화면 노출 (Plan Editor 로 이동).
- `_renderMaxPlanCard()` 의 첫 화면 노출 (Cycle Board 안의 Hero 로 흡수).
- `wt-max-rec-card` 의 `[수락][수정][거절]` 3 CTA. 추천 행을 Today 에 두는 게 아니라 별도 inline 보강 섹션으로.
- `🎯/🟥/🟦/🏋️/📭/✨/★` 모든 이모지.
- 부위색 칩, kind별 카드 색, M/H 색띠. 색은 `--tomato` 와 회색조만.
- `💡 framework copy` 노출.
- Recommendation Card 의 `왜?` details — 첫 화면에서 안 보임. 사용자가 명시적으로 카드를 펼칠 때만.

### 신설

- `wt-track-seg` — Today 상단 segmented (볼륨/강도). 누르면 `applyTrack(track)` 으로 모든 row 의 무게 재계산.
- `wt-lift-row` — `[종목명/부위/무게(56px)/세트] + [이전 기록 1줄]`. 무게를 탭하면 inline stepper, 길게 누르면 sheet.
- `wt-adjust-sheet` — 위에서 올라오는 bottom sheet. 큰 숫자 + 슬라이더 + 의미 anchor + Quick presets + Reps tape + Impact line.
- `wt-cycle-hero` — Cycle Board 상단의 sparkline + 시작/목표 무게 + 현재 진행 % 한 줄.
- `wt-week-row` — Week list 의 한 줄. 좌측 띠로 정체/예측 상태 표현.

### 데이터 모델 (v2 그대로 유지)

`_settings.max_cycle` 데이터 모델, `predictBenchmarkProgression`, `_actuals` 는 그대로 사용. v4는 데이터 모델 변경이 아니라 표현 레이어 재설계다.

---

## 7. 성공 기준 (v3보다 강화)

1. **첫 화면 진입 후 0.5초 안에 무게가 읽힌다.**
2. **첫 화면에서 색은 토마토 1색 + 회색조만 보인다.** 부위색·트랙색이 보이면 실패.
3. **모달/시트 없이 무게를 ±5kg 바꿀 수 있다.**
4. **"수락 / 수정 / 거절" 같은 단어가 첫 화면에 없다.**
5. **CTA는 sticky bottom 1개.**
6. **Cycle Board 진입은 Today header 의 `Week 3/6` 한 곳에서만.**
7. **이모지 0개.**

이 7개를 다 못 만족하면 v4도 실패다.

---

## 8. 목업 검토 가이드

`mockups/test-mode-v4-from-scratch.html` 을 브라우저에서 열면 3 frame 이 가로로 늘어선다 (Figma 스타일).

검토 순서:

1. **Frame 1 (Today)** — 처음 봤을 때 0.5초 안에 무게가 읽히는가? "추천" 단어가 보이는가?
2. **Frame 2 (Adjust Sheet)** — 큰 숫자 / 슬라이더 / Impact line 의 위계가 명확한가?
3. **Frame 3 (Cycle Board)** — 정체/예측/오늘 행이 색 없이 위계만으로 구분되는가?
4. **세 frame 공통** — 색이 토마토 + 회색조만 쓰였는가? 이모지가 있는가?

목업은 정적이지만 인라인 stepper, segmented 클릭 시 무게 재계산, sheet 열기 등을 JS로 한 단계까지는 동작하게 했다.

---

## 9. 다음 단계

- 본 리뷰 + 목업 사용자 검토.
- 승인되면 v4 Phase 1: `workout/expert/max.js` 의 `renderMaxCard(host)` 를 v4 구조로 재작성. `expert-mode.css` 는 v4 전용 스코프(`.tm-v4 *`)로 신규 작성하고 기존 클래스는 점진 폐기.
- v2 데이터 모델 (`_settings.max_cycle`, `predictBenchmarkProgression`, etc.) 은 그대로 사용 — 표현 레이어만 갈아끼우는 형태.
- SW 캐시 버전 범프 + STATIC_ASSETS 재확인 (CLAUDE.md 룰).

---

## 10. v3 비판 점검표 — 어떻게 반영되었나

v3 (`TEST_MODE_UX_CRITICAL_REVIEW.md`) 의 모든 비판 항목을 v4 산출물과 1:1 매핑한 점검표. 이 표가 통과하지 못하면 v4 도 v3 의 반복일 뿐이다.

### 10.1 §2 비판 7개 — 정보 구조 / 색 / CTA

| v3 항목 | v4 상태 | 위치 |
|---|---|---|
| §2.1 #1 "오늘 뭐 하지?" | ✅ Today 첫 화면 lift list 4종 | Frame 1 |
| §2.1 #2 "몇 kg?" | ✅ 56px tabular bold weight 가 lift 행 주인공 | Frame 1 lift row |
| §2.1 #3 "6주 계획에서 맞나?" | ✅ **각 lift 행 하단 mini progression bar (시작 → 오늘 → 6주 목표)** + Week strip | Frame 1 lift row 신설 라인 |
| §2.1 #4 "컨디션에 따라 조정?" | ✅ track segmented + 무게 inline stepper + Adjust Sheet | Frame 1, Frame 2 |
| §2.1 #5 "끝나고 어떻게 남기나?" | ✅ 운동 시작 후 같은 lift 행이 입력 surface 로 전환 (기존 일반 모드 입력 UI 재사용 — Cycle Board 의 W3 행이 "오늘 진행 중" 상태로 갱신). v4는 별도 frame 으로 그리지 않음 — 일반 모드 입력 UX 와 동일하게 유지하는 것이 v3 §6 "v2 구현을 완전히 버릴 필요는 없다" 와 일치. | Frame 1 → 운동 시작 후 동일 lift |
| §2.2 트랙은 segmented | ✅ Today 상단 segmented `볼륨 / 강도`. 누르면 모든 무게 200ms 트랜지션 재계산 | Frame 1 |
| §2.3 무게는 stepper | ✅ 무게 숫자 자체가 컨트롤. 탭 → inline ±, 길게 누름 → Adjust Sheet | Frame 1, Frame 2 |
| §2.4 CTA 1개 | ✅ `운동 시작` sticky bottom 단일 + `계획 조정` ghost link | Frame 1 |
| §2.5 색 4개 역할 | ✅ **v4가 더 강함** — 토마토 1색 + 회색조 5단계 + pos/warn 점·띠. v3 가 prescribe 한 "Neutral blue-gray" 도 ink-3/ink-4 회색으로 대체 (블루 비스듬 색조차 안 씀) | 모든 frame |
| §2.6 성장판 주인공 | ✅ Today 의 lift 행 하단 mini progression bar + Cycle Board 의 sparkline. 사용자가 첫 화면에서 6주 목표값까지 본다. | Frame 1 lift row, Frame 3 |
| §2.7 설정/실행 분리 | ✅ Plan Editor (Frame 4) 신설. Today 에서 framework / deload / target sets 모두 제거 | Frame 4 |

### 10.2 §3 North Star 검증

> "오늘 벤치 77.5kg. 필요하면 75나 80으로 바꾸고 바로 시작한다. 바꾸면 6주 계획도 같이 조정된다."

| 부분 | v4 반영 |
|---|---|
| "오늘 벤치 77.5kg" | ✅ Frame 1 첫 lift 행 56px 숫자 |
| "필요하면 75나 80으로 바꾸고" | ✅ inline ±2.5 stepper / Adjust Sheet 의 quick presets `지난 75` / `계획 77.5` / `목표 80` |
| "바로 시작한다" | ✅ sticky bottom `운동 시작` 한 번에 |
| "바꾸면 6주 계획도 같이 조정된다" | ✅ Adjust Sheet 의 `이번만 / 다음 주부터 반영` segmented + 4-way impact line copy |

### 10.3 §4 서비스 시나리오 7개

| v3 §4 항목 | v4 반영 |
|---|---|
| §4.1 화면 3개 (Today / Cycle / Plan Editor) | ✅ 4 frame (Today / Adjust Sheet / Cycle / Plan Editor). Adjust Sheet 는 Today 의 sub-surface 로 분리해 Today 의 정보 밀도를 추가로 낮춤. |
| §4.2 첫 화면 구조 5요소 | ✅ Header / Week strip / Track seg / Lift list / Sticky CTA — v3 prescribed 그대로 |
| §4.3 트랙 자동 + 사용자 즉시 변경 | ✅ Today segmented 의 디폴트는 사이클 규칙 자동, 클릭으로 즉시 변경. v4 mockup 에서 클릭 시 무게 재계산 동작 시연됨 |
| §4.4 무게 ± / 카드 하단 문장 | ✅ Adjust Sheet 의 ± 분기 + scope (이번만 / 다음주부터) 분기 = 4 가지 카피로 즉시 반응 |
| §4.5 보강 = 마지막 10분 | ✅ Today 하단 placeholder 행 추가. 4종 입력 끝나면 활성, 그 전엔 회색 hint state |
| §4.6 카드 radius 8px | ⚠️ **의도적 divergence — v4는 16px 사용.** 사유: 8px는 Material/Google 톤이라 "토스/애플 합의" 방향과 어긋난다. Apple Health 카드 radius 가 14~16px, 토스 카드 radius 가 12~14px 인 점을 참고해 16px 채택. 단 작은 컨트롤(stepper 12px, week-row 12px)은 12px 사용해 위계 표현. |
| §4.6 mono numerals 통일 | ✅ 모든 무게 / 반복수 / 진행률에 `font-variant-numeric: tabular-nums lining-nums` 적용 |

### 10.4 §6 구현 방향 — 유지 / 변경 / 제거

| v3 prescribe | v4 처리 |
|---|---|
| 유지: max_cycle 데이터 모델 | ✅ 그대로 |
| 유지: 6주 progression 계산 | ✅ `predictBenchmarkProgression` 그대로 |
| 유지: equipment_pool 모델 | ✅ Plan Editor 의 헬스장 섹션이 hook |
| 변경: Cycle Dashboard 첫 화면 중심 | ⚠️ **v4 는 다르게 결정** — Cycle Dashboard 가 첫 화면이 아니라, Today 가 첫 화면이고 Cycle Board (Frame 3) 는 Week strip 클릭으로 진입하는 별도 surface. 이유: 운동 직전 사용자의 1순위 질문은 "오늘 무엇/몇 kg" 이지 "사이클 어디쯤" 이 아님. 사이클 컨텍스트는 첫 화면의 Week strip 한 줄로 충분하고, 매트릭스 전체는 별도 surface 로 분리해야 첫 화면이 단순해진다. 단, 각 lift 행 하단의 mini progression bar 가 "Cycle Dashboard 의 핵심" 인 시작/오늘/목표를 Today 안으로 끌어와 v3 의도를 만족. |
| 변경: setupHtml → 계획 조정 시트 | ✅ Plan Editor (Frame 4) 신설 |
| 변경: 추천 카드 → 마지막 10분 | ✅ Today placeholder 행 |
| 변경: applyTodayPlan 우선 | ✅ Today lift 의 무게가 곧 today plan |
| 변경: 무게 stepper | ✅ 인라인 ± + Adjust Sheet |
| 제거: framework copy 첫 화면 | ✅ Plan Editor `고급` 접힘으로 이동 |
| 제거: 기구 관리 CTA 첫 화면 | ✅ Plan Editor §3 으로 이동 |
| 제거: 정산 CTA 첫 화면 | ✅ Plan Editor §1 의 ghost link 로 이동 |
| 제거: 빨강/노랑/초록/부위색 카드 테두리 | ✅ 모든 카드 1px ink-1 4% 테두리 + tomato 는 today 행 / CTA 만 |

### 10.5 §7 성공 기준 — 5초 5답

| v3 prescribe 한 5답 | v4 첫 화면에서 답 가능? |
|---|---|
| Q1 "오늘 몇 주차?" | ✅ Week strip "Week 3 / 6" |
| Q2 "오늘 볼륨/강도?" | ✅ Track segmented 선택 상태 |
| Q3 "오늘 벤치/랫풀/스쿼트 몇 kg?" | ✅ 각 lift 행 56px 숫자 |
| Q4 "그 무게를 바꿀 수 있나?" | ✅ 숫자 자체가 컨트롤 (탭하면 ± 슬라이드 인) |
| Q5 "바꾸면 6주 계획에 어떤 영향?" | ✅ lift 행 하단 mini progression bar + Adjust Sheet 4-way impact line |

5/5 만족. v3 가 prescribe 한 성공 기준 통과.

### 10.6 의도적 Divergence 요약

| 항목 | v3 | v4 | 사유 |
|---|---|---|---|
| 카드 radius | 8px | 16px (큰 카드) / 12px (작은 컨트롤) | Apple Health/iOS HIG 매칭, 8px 는 Material 톤 |
| 화면 수 | 3 (Today / Cycle / Plan Editor) | 4 (Today / Adjust Sheet / Cycle / Plan Editor) | Adjust Sheet 를 별도 surface 로 분리해 Today 정보 밀도 더 낮춤 |
| 첫 화면 중심 | Cycle Dashboard | Today (사이클 컨텍스트는 Week strip 1 줄) | 운동 직전 1순위 질문은 "오늘 무엇/몇 kg" |
| 색 역할 | 4개 (브랜드/계획/완료/주의) | 3개 (브랜드 + 완료점 + 정체띠) — "계획/예측" 역할은 회색조로 흡수 | 색은 적을수록 의미가 강해진다 |

이 4 항목은 v3 의 정신을 유지하되 토스/애플 방향으로 한 단계 더 나아간 결정.

---

## 변경 이력

- 2026-05-02 v4.0: v3 위에 "디자인 시스템부터 다시 짠다" 관점의 초안 작성. 카드 stacking 자체를 폐기, 화면당 모듈 1개·CTA 1개·색 2계열 원칙으로 단순화. `mockups/test-mode-v4-from-scratch.html` 3 frame (Today / Adjust Sheet / Cycle Board) 동반 작성.
- 2026-05-02 v4.1: v3 비판 점검표 통과를 위해 6 갭 채움 — Today lift 행에 mini progression bar (시작 → 오늘 → 목표), Adjust Sheet 에 `이번만 / 다음주부터` segmented + 4-way impact line, Today 하단에 마지막 10분 보강 placeholder, Frame 4 Plan Editor 신설, §10 점검표 신설.
