# 테스트모드(Max Mode) UX/UI 보완계획

작성일: 2026-05-02
상태: 보완 설계 완료
대상: `workout/expert/max.js`, `workout/exercises.js`, `workout/save.js`, `workout/state.js`, `data/data-workout-equipment.js`, `calc.js`, `expert-mode.css`, 관련 모달

---

## 0. 전문가 리뷰 결론

기존 계획은 사용자의 불만을 잘 수집했고, "근거가 보이는 추천", "장기 청사진", "계획 vs 실제"라는 큰 방향도 맞다. 하지만 바로 RP/5/3/1/Hybrid, Chart.js, 신규 데이터 모델, 헬스장 태그를 한꺼번에 넣으면 테스트모드의 신뢰를 회복하기 전에 복잡도가 먼저 폭발한다.

보완 방향은 다음이다.

1. 오늘 큰 부위 선택을 추천 시스템의 최상위 제약으로 고정한다.
2. 추천 카드의 종류를 늘리기 전에 모든 추천을 같은 데이터 계약으로 정규화한다.
3. "왜 낮은 무게가 나왔는지"를 cap, deload, RPE, 최근 수행 데이터로 설명한다.
4. 그래프는 Chart.js CDN 대신 프로젝트 내부의 가벼운 SVG/Canvas 렌더러로 시작한다.
5. RP/5/3/1은 마케팅 문구가 아니라 실제 처방 로직과 검증 테스트가 있을 때만 노출한다.
6. 헬스장 섞임은 추천 UX 문제가 아니라 데이터 소유권 문제이므로 세션 컨텍스트와 종목 태그를 분리해서 해결한다.

---

## 1. 기존 계획의 보강 필요점

### 1.1 너무 큰 첫 릴리스

초안은 Phase 1 이후 바로 새 카드 컴포넌트, 청사진 모델, Chart.js, 알고리즘 선택기, 헬스장 태그까지 확장한다. 사용자가 지금 겪는 핵심 고통은 "추천을 믿을 수 없음"인데, 이 상태에서 설정 모달과 프레임워크 선택지를 늘리면 신뢰 회복보다 피로도가 먼저 올라간다.

보완: 첫 릴리스는 추천 계약과 버그 수정에 집중한다. 장기 청사진은 읽기 전용 요약 카드부터 시작하고, 사용자가 설정해야 하는 입력값은 최소화한다.

### 1.2 "운동과학 기반"의 제품 언어가 위험함

RP와 5/3/1은 유명하지만, 사용자 목표, 경력, 부상 이력, 장비, 주당 빈도, 회복 상태가 없으면 같은 프레임워크도 다른 처방이 되어야 한다. 단순히 이름을 붙이면 오히려 신뢰를 해친다.

보완: UI에는 "프로그램 이름"보다 "적용된 규칙"을 먼저 보여준다. 예: "최근 2회 모두 상단 반복수 달성 -> 다음 세션 +2.5kg", "이번 주 가슴 작업세트 목표 12세트 중 7세트 완료 -> 3세트 보강".

### 1.3 오늘 큰 부위와 추천의 관계가 데이터 계약으로 정의되지 않음

초안은 `_suggestMajorStarters` 호출 수정과 `_filterWeakPartsByMajors` 보완을 말하지만, 시스템 전체 invariant가 없다.

보완: 추천 엔진의 첫 번째 규칙을 문서와 테스트에 고정한다.

```js
// Recommendation Contract
selectedMajors.length > 0 이면,
모든 추천 카드는 다음 중 하나여야 한다.
1. primaryMajor가 selectedMajors에 포함됨
2. userPinned === true
3. crossMajorReason이 명시됨
```

이 계약을 어기는 카드는 렌더링하지 않고, 디버그 메타에 누락 사유를 남긴다.

### 1.4 그래프가 "예쁜 결과"에 치우쳐 있음

초안의 3개 그래프는 좋지만, 사용자가 원하는 것은 단순 차트가 아니라 계획과 실제의 간극을 행동으로 바꾸는 것이다.

보완: 그래프 아래에 다음 액션을 붙인다.

- 계획보다 부족: "이번 주 등 5세트 부족 -> 오늘 로우/풀다운 2개 추천"
- 계획보다 초과: "하체 볼륨 128% -> 오늘은 강도 유지 또는 보강 제외"
- 수행능력 정체: "벤치 e1RM 3주 정체 -> 다음 세션 볼륨 유지, RPE cap 8"

### 1.5 Chart.js CDN은 PWA/오프라인 정책과 충돌 가능

서비스워커가 정적 자산을 강하게 관리하는 앱에서 CDN 스크립트를 새로 넣으면 오프라인, 캐시, CSP, 배포 디버깅이 복잡해진다.

보완: 1차는 내부 `progress-sparkline.js` 또는 inline SVG 렌더러로 구현한다. 차트 라이브러리는 나중에 필요가 증명되면 도입한다.

---

## 2. 새 North Star

테스트모드는 "오늘 운동 추천 화면"이 아니라 "오늘의 선택을 장기 계획에 연결하고, 실제 수행 결과로 다음 처방을 조정하는 코치 화면"이어야 한다.

사용자는 한 화면에서 다음 4가지를 즉시 이해해야 한다.

1. 오늘 어떤 큰 부위를 선택했는가
2. 왜 이 종목과 무게가 추천됐는가
3. 이 추천이 4-8주 계획의 어디에 속하는가
4. 계획과 실제 수행이 얼마나 벌어졌고, 오늘 무엇을 하면 그 차이가 줄어드는가

---

## 3. UX 원칙

### 3.1 선택 우선

오늘 큰 부위 선택은 추천 엔진의 필터가 아니라 사용자의 의도 선언이다. 사용자가 가슴/등을 골랐는데 하체 보강이 먼저 뜨면, 알고리즘이 맞더라도 UX는 실패다.

### 3.2 설명은 짧게, 증거는 접어서

카드 기본 상태에서는 한 줄 이유만 보인다.

예: "가슴 상단 주간 목표 10세트 중 4세트 완료"

상세를 열면 최근 수행, cap, 프레임워크 규칙, 제외된 후보를 볼 수 있다.

### 3.3 추천 종류보다 행동을 먼저

`균형보강`, `고정종목`, `스타터` 같은 내부 분류명은 사용자에게 기준처럼 보이지 않는다. 카드 상단 라벨은 행동 중심으로 바꾼다.

| 내부 kind | 사용자 라벨 | 의미 |
|---|---|---|
| `main_progression` | 주력 진행 | 지난 수행을 기준으로 무게/반복을 진행 |
| `volume_gap` | 볼륨 채우기 | 이번 주 계획 대비 부족한 세트 보완 |
| `balance_gap` | 균형 보강 | 같은 큰 부위 안에서 덜 채운 세부 패턴 보완 |
| `habit_keep` | 루틴 유지 | 최근 자주 수행한 종목의 점진 과부하 유지 |
| `starter` | 시작 추천 | 기록 부족 사용자용 안전 시작점 |

### 3.4 사용자가 바꾼 것을 학습

수락/수정/거절은 단순 버튼이 아니라 다음 추천의 입력값이다.

- 수락: 다음 추천에서 해당 종목 우선순위 상승
- 수정: 사용자가 바꾼 kg/reps/RPE를 다음 처방 기준으로 사용
- 거절: 같은 세션 안에서는 숨김, 다음 주에는 낮은 우선순위

---

## 4. 핵심 데이터 계약

### 4.1 Recommendation Context

추천 엔진은 매번 같은 context를 받는다.

```js
{
  dateKey,
  selectedMajors: ['chest', 'back'],
  selectedWeakParts: ['upper_chest'],
  sessionGymId: 'gym_woori',
  framework: 'adaptive_volume',
  weekState: { weekIndex: 2, plannedSetsByMajor: {}, actualSetsByMajor: {} },
  history: { recentSessions: [], exerciseStats: {}, e1rmTrend: {} },
  userActions: { rejectedIds: [], modifiedPrescriptions: {} }
}
```

### 4.2 Recommendation Card

모든 추천은 렌더링 전에 아래 shape으로 정규화한다.

```js
{
  id,
  kind: 'main_progression' | 'volume_gap' | 'balance_gap' | 'habit_keep' | 'starter',
  label: '주력 진행',
  exerciseId,
  movementId,
  primaryMajor: 'chest',
  subPattern: 'upper_chest',
  gymScope: { sessionGymId: 'gym_woori', matched: true, source: 'tag' },
  prescription: {
    sets: 4,
    repsLow: 8,
    repsHigh: 12,
    targetRpe: 8,
    startKg: 75,
    action: 'load' | 'volume' | 'hold' | 'deload',
    capApplied: { applied: true, previousE1rm: 100, cappedE1rm: 95, reason: 'session_jump_limit' }
  },
  reason: {
    headline: '가슴 상단 주간 목표 10세트 중 4세트 완료',
    rule: '최근 2회 상단 반복수 달성 전까지 무게 유지',
    evidence: [
      { label: '최근 수행', value: '2026-04-29 70kg x 10,10,9' },
      { label: '계획 대비', value: '이번 주 40% 완료' }
    ]
  },
  debug: {
    generatedBy: 'adaptive_volume_v1',
    excludedCandidates: []
  }
}
```

### 4.3 Major Alignment Contract

`selectedMajors`가 있으면 모든 추천은 `primaryMajor`를 가진다. `primaryMajor`가 선택 밖이면 카드에는 반드시 `crossMajorReason`이 필요하고, 기본 목록 아래 "선택 밖 추천" 섹션으로 내려간다.

이 규칙은 사용자 불만 S1, S6, S8의 핵심 방어선이다.

---

## 5. 화면 구조

### 5.1 첫 화면

```text
[8주 진행 요약]
Week 2/8 · 이번 주 계획 18세트 중 11세트 완료
가슴 -3세트 · 등 +1세트 · 하체 휴식 권장

[오늘 큰 부위]
가슴 선택됨 · 등 선택됨

[오늘 추천]
1. 주력 진행        벤치프레스
2. 볼륨 채우기      인클라인 덤벨프레스
3. 균형 보강        케이블 플라이

[계획 vs 실제]
가슴 70%  등 108%  하체 122%
```

### 5.2 추천 카드 기본 상태

```text
주력 진행
벤치프레스
4세트 x 6-8회 · RPE 8 · 시작 75kg
왜? 최근 2회 목표 반복수 달성, 단 세션 점프 cap으로 +2.5kg 제한
[수락] [수정] [거절]
```

### 5.3 추천 카드 상세 상태

```text
근거
- 최근 수행: 2026-04-29 72.5kg x 8,8,7
- e1RM: 91.8kg -> 오늘 기준 94.1kg
- cap: 한 세션 최대 +5% 제한 적용
- 계획 대비: 가슴 주간 목표 12세트 중 7세트 완료
```

### 5.4 빈 상태

기록이 부족할 때는 "AI가 아무거나 추천"하지 않는다.

```text
아직 이 부위의 최근 기록이 부족해요.
오늘은 안전 시작점으로 제안합니다.
완료한 세트가 2회 이상 쌓이면 다음부터 지난 수행 기준으로 조정돼요.
```

---

## 6. 구현 로드맵

### Phase 0 - 추천 계약 감사와 테스트 고정

목표: 고치기 전에 어떤 카드가 왜 나오는지 관찰 가능하게 만든다.

- [ ] `workout/expert/max.js`에 recommendation context 생성 헬퍼 추가
- [ ] 모든 추천 후보에 `primaryMajor`, `subPattern`, `source`, `reason.headline`을 붙이는 정규화 함수 추가
- [ ] `selectedMajors` 밖 추천을 기본 리스트에서 제외하거나 별도 섹션으로 분리
- [ ] 단위 테스트 추가
  - 큰 부위 1개 선택 시 해당 major 추천만 렌더 후보
  - 큰 부위 3개 선택 시 각 major 최소 1개 후보를 시도
  - 선택 밖 weak part는 "선택 밖 추천"으로 내려감
  - 후보가 없을 때 빈 상태 메시지 반환

Acceptance:
- 추천 후보마다 `debug.generatedBy`와 제외 사유가 남는다.
- 다중 큰 부위 선택 시 특정 부위가 조용히 누락되지 않는다.

### Phase 1 - 긴급 UX/버그 수정

목표: 현재 사용자 피드백 중 신뢰를 깨는 문제를 먼저 해결한다.

- [ ] `_suggestMajorStarters`를 선택 major별로 호출하고 결과를 병합
- [ ] `_filterWeakPartsByMajors`를 strict drop 대신 상태 분리 방식으로 변경
  - 선택한 큰 부위 안: 기본 추천
  - 선택 밖 약점: 접힌 보조 섹션
- [ ] 추천 무게가 낮아지는 이유를 카드에 표시
  - deload
  - RPE target
  - 세션 점프 cap
  - 지난 세트가 미완료/워밍업 제외
- [ ] `wtAddExercise`/추천 수락 경로에서 entry에 `sessionGymId` 또는 `gymTagAtTime` 스냅샷 저장
- [ ] 오늘 헬스장과 맞지 않는 종목은 추천 카드에 경고 또는 제외 처리

Acceptance:
- "오늘 큰 부위"와 추천 목록이 시각적으로 일치한다.
- 낮은 무게 추천은 반드시 한 줄 이유를 가진다.
- 헬스장 A에서 만든 종목이 헬스장 B 추천에 섞여 나오지 않는다.

### Phase 2 - 카드 UI 통일

목표: "정신사나움"을 제거하고 기준을 한눈에 보이게 한다.

- [ ] `workout/expert/recommendation-card.js` 신설
- [ ] 카드 label, 처방, 이유, 액션 버튼의 DOM 구조 통일
- [ ] 기존 `starter`, `fixed`, `weak`, `balance` 렌더링을 새 카드 컴포넌트로 흡수
- [ ] `expert-mode.css`의 추천 카드 스타일을 하나의 토큰 세트로 정리
- [ ] 액션 버튼은 수락/수정/거절 3개로 통일
- [ ] 수정 시 kg/reps/RPE만 빠르게 바꾸는 bottom sheet 또는 inline editor 제공

Acceptance:
- 모든 추천 카드가 같은 레이아웃, 같은 버튼 순서, 같은 이유 토글을 가진다.
- 카드 라벨만 봐도 "주력 진행/볼륨 채우기/균형 보강/루틴 유지/시작 추천"이 구분된다.

### Phase 3 - 계획 vs 실제 미니 청사진

목표: 거대한 설정 모달 없이 장기 맥락을 먼저 제공한다.

- [ ] 별도 신규 컬렉션보다 기존 `_settings.expert_preset` 확장을 우선 검토
- [ ] `maxPlan` 필드 추가
  - `startDate`
  - `weeks`
  - `targetSetsByMajor`
  - `deloadWeek`
  - `framework: 'adaptive_volume_v1'`
- [ ] 기록이 있는 사용자는 최근 4주 평균으로 기본 목표 자동 생성
- [ ] 기록이 부족한 사용자는 보수적 기본값 자동 생성
- [ ] `calc.js`에 순수 함수 추가
  - `buildWeeklyVolumePlan`
  - `comparePlanActual`
  - `buildE1rmTrend`
- [ ] 운동탭 상단에 읽기 전용 청사진 카드 렌더
- [ ] 그래프는 SVG bar/sparkline으로 구현

Acceptance:
- 사용자가 설정하지 않아도 Week N/8과 부위별 계획 대비 실제가 보인다.
- 그래프가 실제 운동 기록과 오늘 선택한 부위에 반응한다.
- 추천 이유가 청사진 수치와 연결된다.

### Phase 4 - 헬스장 태그 시스템

목표: 멀티 헬스장 사용자의 데이터 오염을 구조적으로 막는다.

- [ ] 사용자 종목 모델에 `gymTags`와 `primaryGymId` 추가
- [ ] 기존 종목은 `gymTags: ['*']` fallback
- [ ] 종목 picker는 현재 헬스장, `*`, 태그 없는 legacy만 표시
- [ ] 종목 편집 UI에 헬스장 태그 선택 추가
- [ ] 헬스장 전환 시 현재 세션 종목 중 불일치 항목을 감지
- [ ] 전환 처리 옵션
  - 유지: 오늘 세션에만 남김
  - 새 헬스장에도 추가: 해당 종목에 gymTag 추가
  - 숨김: 오늘 세션에서 제외

Acceptance:
- 종목 추가/추천/검색/세션 표시가 모두 같은 헬스장 필터를 사용한다.
- 기존 사용자는 마이그레이션 전에도 기존 종목을 잃지 않는다.

### Phase 5 - 프로그램 프레임워크 도입

목표: 이름뿐인 운동과학이 아니라 실제 처방 규칙을 넣는다.

기본값은 `adaptive_volume_v1`로 둔다. RP/5/3/1/Hybrid는 아래 조건을 만족할 때만 노출한다.

- [ ] 사용자의 목표가 명확함
  - 근비대/볼륨 우선
  - 주력 리프트 PR 우선
  - 혼합
- [ ] 주당 운동 가능 일수 입력
- [ ] 주요 리프트 최근 기록 또는 추정 1RM 존재
- [ ] 각 프레임워크별 테스트 존재

프레임워크 모듈:

- `workout/expert/algo-adaptive-volume.js`
- `workout/expert/algo-rp-lite.js`
- `workout/expert/algo-wendler531.js`
- `workout/expert/recommend.js`

Acceptance:
- 프레임워크를 바꾸면 추천 종류뿐 아니라 처방 수치와 이유가 실제로 달라진다.
- 5/3/1은 메인 리프트 데이터가 없는 사용자에게 노출되지 않는다.

---

## 7. 데이터/저장 가드

### 7.1 Firestore 접근

Firebase 직접 호출은 금지한다. 새 데이터 CRUD는 `data.js` 배럴과 `data/` 모듈을 통해서만 노출한다.

### 7.2 setDoc 전체 덮어쓰기 방지

`_settings`에 `maxPlan` 또는 `workout_blueprint`를 저장할 때 기존 `tomato_state`, `expert_preset`을 덮지 않는다. 현재 프로젝트 규칙상 `setDoc`은 전체 overwrite로 취급하므로 get-merge-set 또는 기존 setter 확장이 필요하다.

### 7.3 세션 저장

`workout/save.js`의 `_buildSavePayload()`에서만 저장 payload를 확장한다.

추가 후보:

```js
sessionGymId: S.workout.currentGymId || null,
exercises: [{
  ...,
  gymTagAtTime,
  recommendationMeta: { cardId, kind, acceptedAt, modified }
}]
```

### 7.4 서비스워커

`index.html`, `style.css`, `expert-mode.css`, `calc.js`, `workout/*.js`, `data/*.js`, `modals/*.js` 등 `STATIC_ASSETS`에 등록된 파일을 수정하면 반드시 `sw.js`의 `CACHE_VERSION`을 범프한다.

### 7.5 Chart 라이브러리

1차 구현은 외부 CDN을 쓰지 않는다. 그래프는 내부 SVG/Canvas로 구현한다. 외부 라이브러리 도입은 성능/접근성/유지보수 필요가 확인된 뒤 별도 결정한다.

---

## 8. UX 카피 가이드

나쁜 카피:

- "AI 추천"
- "운동과학 기반 추천"
- "균형보강"
- "알고리즘이 계산했어요"

좋은 카피:

- "가슴 상단 세트가 이번 주 목표보다 3세트 부족해요"
- "지난번 12회에 도달해서 오늘은 +2.5kg로 시작해요"
- "최근 2회 RPE 9 이상이라 오늘은 무게를 유지해요"
- "이 종목은 현재 헬스장에 등록되어 있지 않아 숨겼어요"

---

## 9. 검증 계획

### 9.1 자동 검증

- `node --check` 변경 JS 파일
- `node --test tests/*.test.js`
- 추천 계약 테스트
- 헬스장 필터 테스트
- plan vs actual 순수 함수 테스트

### 9.2 수동 검증

- 큰 부위 가슴만 선택 -> 가슴 관련 추천만 기본 목록에 표시
- 큰 부위 가슴/등/하체 선택 -> 각 부위 추천 후보가 최소 한 번 생성 시도됨
- 선택 밖 약점 선택 -> 기본 추천이 아니라 접힌 보조 섹션에 표시
- 최근 수행보다 낮은 무게 추천 -> cap/deload/RPE 이유가 표시
- 헬스장 A 종목 등록 후 B 전환 -> B 추천/검색에 A 전용 종목 미노출
- 추천 수락 -> 오늘 세션에 종목 추가, 저장 후 새로고침해도 유지
- 추천 수정 -> 수정값이 다음 추천 기준으로 반영
- 청사진 카드 -> 이번 주 계획 대비 실제 세트가 실제 기록과 일치

### 9.3 UX 리뷰 체크

- 첫 화면에서 설명 문단 없이도 오늘 할 일이 보이는가
- 카드 종류가 달라도 버튼 위치가 같은가
- 추천이 없는 경우에도 다음 행동이 있는가
- 기록 부족 사용자에게 죄책감이 아니라 안전한 시작점을 주는가
- 모든 수치에는 출처가 있는가

---

## 10. 우선순위 재정렬

기존 초안의 Phase 3-5는 모두 가치가 있지만 순서를 바꾼다.

| 우선순위 | 작업 | 이유 |
|---|---|---|
| 1 | 추천 계약 + 오늘 큰 부위 정렬 | 사용자가 지금 가장 크게 불신하는 지점 |
| 2 | 추천 카드 통일 + 이유 노출 | 디자인 혼란과 기준 불명 해결 |
| 3 | 헬스장 컨텍스트 분리 | 데이터 오염 방지 |
| 4 | 계획 vs 실제 미니 청사진 | 장기 효과 검증 시작 |
| 5 | RP/5/3/1 선택기 | 충분한 데이터와 테스트 이후 노출 |

---

## 11. 구현 시 파일별 예상 변경

### `workout/expert/max.js`

- recommendation context 생성
- major alignment contract 적용
- 추천 후보 정규화
- cap/deload/RPE 이유 생성
- 기존 4종 추천 렌더 제거 또는 새 카드 컴포넌트로 위임

### `workout/exercises.js`

- 추천 수락 시 `recommendationMeta`, `gymTagAtTime` 저장
- 헬스장 mismatch 표시
- 수정된 처방값을 세트 입력 초기값에 반영

### `workout/save.js`

- `_buildSavePayload()`에서 session gym과 추천 메타 스냅샷 보존
- 사진 필드 보존 확인

### `calc.js`

- plan vs actual 순수 함수 추가
- e1RM trend 함수 추가
- 추천 계약 테스트 가능한 순수 로직 분리

### `data/data-workout-equipment.js`

- 종목 `gymTags`, `primaryGymId` 저장
- 기존 종목 fallback 유지

### `expert-mode.css`

- 추천 카드 스타일 단일화
- TDS Mobile 토큰 기준 적용
- 텍스트 overflow, 모바일 버튼 줄바꿈 검증

---

## 12. 확인이 필요한 제품 결정

지금 구현을 막는 필수 확인은 없다. 다만 Phase 5 전에 아래 결정은 필요하다.

1. 테스트모드의 기본 목표를 근비대 중심으로 둘지, 근력 중심으로 둘지
2. 5/3/1을 실제로 노출할 때 4대 리프트 데이터 입력을 강제할지
3. 외부 차트 라이브러리를 허용할지, 내부 SVG 렌더러로 계속 갈지

권장 기본값:

- 기본 목표: 근비대/볼륨 중심
- 5/3/1: 데이터가 있는 사용자에게만 고급 옵션으로 노출
- 그래프: 내부 SVG 렌더러

---

## 13. 최종 제안

바로 구현한다면 Phase 0-2를 하나의 첫 릴리스로 묶는 것이 가장 좋다.

첫 릴리스 목표:

- 오늘 큰 부위와 추천의 불일치 제거
- 다중 큰 부위 선택 누락 버그 제거
- 추천 무게가 낮아지는 이유 표시
- 추천 카드 UI 통일
- 추천 수락/수정/거절의 사용자 제어권 제공

이후 Phase 3에서 계획 vs 실제를 붙이면, 사용자는 "오늘 왜 이걸 해야 하는지"와 "그게 장기 계획에서 어떤 의미인지"를 순서대로 이해할 수 있다.

---

## 14. 변경 이력

- 2026-05-02: 기존 Claude 초안 비판 검토 후 보완계획으로 전면 재작성
