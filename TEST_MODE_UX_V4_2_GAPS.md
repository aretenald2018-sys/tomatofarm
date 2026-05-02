# 테스트모드 v4 구현 검증 및 v4.2 개선안

작성일: 2026-05-02
범위: 현재 라이브 코드 (`workout/expert/max.js`, `workout/expert/max-cycle.js`, `data/data-equipment-pool.js`) UX 검증 + 사용자 지적 6 항목 + 추가 발견 갭. 실제 코드 수정 아님 — 평가/개선 제안.
선행: `TEST_MODE_UX_V4_FROM_SCRATCH.md` (v4.1 mockup 기준)

---

## 0. 한 줄 요약

v4 의 화면 분리(Today / Adjust Sheet / Cycle Board / Plan Editor)는 라이브 코드에 잘 반영됐지만, **데이터 모델과 인터랙션이 v4 디자인 의도를 따라오지 못하고 있다.** 특히 `벤치마크 × 트랙` 의 곱이 데이터 모델에 없어서 "볼륨/강도 트랙 전환" 이 시각적 라벨에 가깝고, 계획 조정의 CRUD 가 절반만 구현됐다.

---

## 1. 사용자 지적 6 항목 — 코드 검증

### 1.1 "벤치마크 카드가 너무 공간을 많이 차지함" ✅ 확인

**위치**: `max-cycle.js:262-301` `_renderV4Lift()`

**증거**:
- 각 lift 카드에 `part / name / 큰 weight / reps / impact line / progression bar` 6 단 stack.
- `renderMaxCycleDashboard:373` 가 `(snapshot.benchmarks || []).slice(0, 5)` — 최대 5 카드.
- 카드 1 개당 약 220–260px. 5 × 240 = 1,200px. 모바일 폭(844px)에서 무조건 스크롤.

**원인**: 벤치마크 카드가 **읽기/조정/맥락** 세 역할을 한 행에 다 욱여넣음. progression bar 와 impact line 이 default 노출 — 변경 시점에만 보여도 충분.

**개선 방향**:
1. **Compact 행 (default)** — 한 줄 88px: `[부위 칩] 종목명 ─── 77.5kg × 4×10 [⌃]`
2. **Expanded 행 (탭 시 펼침)** — progression bar + impact + 인라인 stepper 노출.
3. 5 종목이 모두 default 펼침이면 안 됨. 첫 종목 펼침 + 나머지 접힘이 디폴트.

### 1.2 "계획 조정에서 벤치마크를 CRUD할 수가 없음" ✅ 확인 (절반)

**위치**: `max-cycle.js:428-494` `renderMaxPlanEditor()`, `max.js:1858-1896` `saveMaxPlanEditorSheet()`

**현재 구현**:
- ✅ Update: kg / 목표kg / 증감kg 와 movement select 변경 가능
- ❌ **Create: 없음** — `+ 새 벤치마크 추가` 버튼 부재
- ❌ **Delete: 없음** — 행 삭제 버튼 부재
- ⚠️ Update 도 제한적: `select` 가 `m.primary === b.primaryMajor` 로 필터돼 부위 자체를 바꿀 수 없음 (가슴 벤치를 등 종목으로 교체 불가)

**개선 방향**:
1. 각 행 우측에 `삭제` 아이콘 (휴지통). 삭제 시 `confirm-modal` 띄우고 `cycle.benchmarks` 에서 splice.
2. 섹션 하단에 `+ 부위별 벤치마크 추가` (가슴/등/하체/어깨/팔/이두/삼두/복근 8 개 부위 picker → 종목 picker) → `cycle.benchmarks.push(...)`
3. 부위 자체 변경 가능하게: select 옵션을 `[부위 칩 + 종목명 + 헬스장 출처]` 그룹으로 묶어 모든 부위 노출.

### 1.3 "벤치마크의 볼륨/강도에 따라 벤치마크가 달라져야 하는데 관리 별도 없음" ✅ 확인 (구조적)

**위치**: 데이터 모델 자체의 갭 — `max-cycle.js:213-256` `createDefaultMaxCycle()`, `max-cycle.js:78-94` `predictBenchmarkProgression()`

**증거**:
- `benchmark.tracks: ['M', 'H']` — **단순 라벨 array**. 트랙별 별도 값 없음.
- `benchmark.startKg / targetKg / incrementKg` — **트랙 무관 단일 값**.
- `predictBenchmarkProgression(benchmark, cycle, todayKey)` — **track 인자 없음**. 트랙 전환해도 같은 plannedKg.
- `_displayKg(cycle, todayKey, benchmark)` (`max-cycle.js:69`) — track 무관.
- `_trackRepsRange(track)` (`max-cycle.js:58`) — 트랙별 변하는 건 **반복수 라벨뿐** (M=10–12, H=5–8).

**의도와의 어긋남**: v2 / v4 디자인은 듀얼 트랙을 "같은 벤치마크의 M 라인 (75×12) 과 H 라인 (80×8) 이 한 사이클 안에서 병행 진행" 으로 설계. 그러나 코드는 "같은 무게 다른 반복수" 로 구현돼 사실상 **단일 트랙의 표시 변형**일 뿐.

**개선 방향 — 데이터 모델 변경**:
```js
// 현재
{ id, movementId, label, primaryMajor,
  tracks: ['M','H'],
  startKg, targetKg, incrementKg,
  startReps, targetReps }

// 제안
{ id, movementId, label, primaryMajor,
  tracks: {
    M: { startKg: 70, targetKg: 80, incrementKg: 2.5,
         startReps: 12, targetReps: 12, enabled: true },
    H: { startKg: 80, targetKg: 87.5, incrementKg: 2.5,
         startReps: 8,  targetReps: 6,  enabled: true }
  } }
```

함수 변경:
- `predictBenchmarkProgression(benchmark, cycle, todayKey, track)` — track 인자 추가, `benchmark.tracks[track]` 에서 값 읽음.
- `_displayKg(cycle, todayKey, benchmark, track)` — 같은 변경.
- `buildMaxCycleSnapshot` 의 benchmarks 빌드 시 `planned` 가 트랙별이 되도록.

UI:
- Plan Editor 의 각 벤치마크 행이 두 단으로 분리: `M 트랙 [시작 kg] [목표 kg] [enabled toggle]` / `H 트랙 [시작 kg] [목표 kg] [enabled toggle]`.
- 트랙 토글 OFF 시 그 트랙은 사이클에서 제외.

### 1.4 "계획조정에서 헬스장 기구 관리가 되지도 않음" ⚠️ 부분

**위치**: `max-cycle.js:484` `[헬스장 / 기구 관리]` 버튼 → `max.js:2040` `openMaxEquipmentPoolModal()`

**현재 구현**:
- 버튼 → 별도 모달이 열림 (`max-equipment-pool-modal`)
- 모달 안에서 공통 모듈 toggle, 헬스장 전용 기구 add/delete 가 모두 가능
- 사용자가 "관리가 안 됨" 으로 느낀 이유 추정:
  1. **별도 모달로 튀어나가** Plan Editor 흐름이 끊김 (Plan Editor 위에 또 다른 overlay)
  2. 모달의 입력 UI 가 매우 원시적 (text input + select + 추가 버튼) — 사진/카테고리 선택 미흡
  3. **이름 검색 / 일괄 등록 없음** — 기구 100 종 등록하려면 100 회 입력
  4. 모달 진입 시 `selectedGymId = document.getElementById('max-plan-gym-id')?.value` 로 plan editor 의 select 값 의존 — Plan Editor 가 닫히면 모달이 깨짐

**개선 방향**:
1. **모달 폐기, Plan Editor 안에 inline 펼침**. `details/summary` 형태로 헬스장 섹션 안에서 펼치고 같은 surface 에서 toggle/add/delete.
2. **공통 모듈은 토글이 아니라 "선택" 시각화** — 체크박스 row 가 아니라 칩 grid (선택된 건 진하게).
3. **사진 일괄 등록** (`_renderEquipmentPhotoIngest`) 진입점 추가 — 헬스장 들어가서 한 번만 사진 찍으면 AI 가 분류 (`workout/ai-estimate.js` 의 동일 파이프).
4. **검색 입력** — 50 개 넘는 기구는 검색 없이는 안 됨.

### 1.5 "종목 추가 시 어떤 헬스장 종목인지 안 나옴" ✅ 확인 (심각)

**위치**: `max-cycle.js:457-462` Plan Editor 의 movement select, `max.js:2148-2194` `applyMaxSuggestion()`

**증거**:
- `select` 안 옵션: `<option value="${m.id}">${m.nameKo || m.id}</option>` — 그냥 종목명만.
- 어떤 헬스장의 어떤 기구인지 / 공통 모듈인지 **표시 0**.
- 더 심각: `applyMaxSuggestion()` 에서 신규 운동 등록 시 `gymId: null, gymTags: ['*']` (line 2184–2185) — 모든 max 모드 신규 종목이 **gym-independent 로 강제됨**. 사용자가 우리 헬스장의 랫풀다운을 추가해도 "공통 모듈" 로 저장됨.

**의도와의 어긋남**: v2 의 `equipment_pool` 모델은 `scope: 'global' | 'gym'` 와 `ownerGymId` 로 출처를 분리하라고 했는데, 추가 흐름이 이를 무시.

**개선 방향**:
1. **Movement option 의 표기 형식**:
   ```
   바벨 벤치프레스      · 공통 (바벨)
   랫풀다운 머신 V2     · 우리 헬스장 전용
   덤벨 숄더프레스      · 공통 (덤벨)
   레그프레스 V2        · 우리 헬스장 전용
   인클라인 벤치프레스  · 출장지 호텔 전용
   ```
   글로벌 풀 매칭 기구 → "공통", 특정 헬스장 전용 → "{헬스장 이름} 전용".
2. **Optgroup** 으로 그룹핑: `<optgroup label="공통 모듈"> ... </optgroup> <optgroup label="우리 헬스장 전용"> ... </optgroup>` — 시각적 분리.
3. **`applyMaxSuggestion` 의 gym 매핑 수정**:
   - 종목의 `equipment_category` 가 `barbell/dumbbell/bodyweight` 면 `gymId=null, gymTags=['*']` (현행 OK).
   - 그 외(`machine/cable/smith`) 는 `gymId = currentGymId, gymTags = [currentGymId]` (현행 버그).
4. **Plan Editor 의 select 도 동일 메타 노출** — 추가/변경 시 사용자가 의식적으로 헬스장 출처를 본다.

### 1.6 "Current cycle 이 몇 주차 외에 진행 잘 되는지 시각화 안 됨" ✅ 확인

**위치**: `max-cycle.js:344-389` `renderMaxCycleDashboard()`, `max-cycle.js:262-301` `_renderV4Lift()`

**현재**:
- Week strip: `Week 3 / 6 · 진행 50%` — 사이클의 **시간 진행률만** 표시. "내가 잘 자라고 있는지" 와는 다름.
- 각 lift 의 progression bar: `시작 75kg → 오늘 77.5kg → 목표 80kg`. 여기서 "오늘" 은 `planned.plannedKg` — 즉 **계획상 도달해야 하는 무게**. 실제 latest 와는 다름.
- `buildMaxCycleSnapshot` (`max-cycle.js:178-179`) 에서 `delta = latest.kg - planned.plannedKg` 와 `onPlan = delta >= 0` 가 계산되지만 **UI 어디에도 노출 안 됨**.
- Cycle Board (`renderMaxCycleBoard`): 첫 번째 벤치마크만 weekly 행으로 보여줌. 다른 벤치마크는 **볼 방법 없음**.

**의도와의 어긋남**: v2 의 핵심 메탈모델은 "엑셀 매트릭스에서 `이번 주 목표 78kg 인데 75 만 나옴 → -3kg 뒤처짐` 이 한눈에 보이는 것". 코드는 계산은 다 했는데 표시를 안 함.

**개선 방향**:
1. **각 lift 행에 "이번 주 페이스" 칩**:
   - `latest >= planned.plannedKg` → `🟢 목표 페이스` (또는 톤 다운된 회색 + tomato 점)
   - `latest < planned.plannedKg` 인데 0.5 SD 이내 → `🟡 약간 뒤`
   - `latest < planned.plannedKg - 0.5SD` → `🔴 -2.5kg 뒤처짐`
2. **Progression bar 를 dual-pip 으로**: 회색 dot 은 `planned.plannedKg`, tomato dot 은 `latest.kg`. 두 점 사이의 거리가 곧 delta. 색 + 위치로 시각화.
3. **Week strip 의 progress bar 를 "계획 vs 실제" 두 줄로**: 위는 계획 50%, 아래는 실제 47% 같은 식. 두 막대의 격차가 곧 페이스.
4. **Cycle Board 를 매트릭스로**: `_renderMatrix` 함수가 이미 만들어져 있는데 (`max-cycle.js:303-326`) 호출 entry point 가 없음 (dead code). `renderMaxCycleBoard` 에서 `_renderMatrix(snapshot)` 을 메인 surface 로 노출.

---

## 2. 추가 발견 갭 — 사용자가 명시 안 했지만 의도와 어긋남

### 2.1 dead code: `renderMaxCard()` 의 setup/plan/recommendation block

**위치**: `max.js:1085-1259`

**증거**: line 1133-1136 에서 `host.innerHTML = cycleHtml` 후 `return` — 그 아래 `_renderMaxPlanCard`, `_renderMaxSetup`, `wt-max-card` 추천 블록은 **전부 unreachable**.

```js
host.innerHTML = cycleHtml;
_bindMaxHost(host);
_ensureWeakTimerTick();
return;                                          // ← early return
const planHtml = _renderMaxPlanCard(...);        // ← 도달 불가
// ... 100+ lines of dead code
```

**평가**: v3 → v4 마이그레이션 중에 잠시 "둘 다 띄워서 비교" 하다가 v4 만 남기고 나머지를 dead code 로 묶은 흔적. **이대로 두면 다음 세션에서 누군가 다시 쓰려다 혼란이 생긴다.**

**개선**: 1133-1259 의 dead block 삭제 + setupHtml 변수도 제거. 1085-1136 만 유효 흐름으로 정리.

### 2.2 dead code: `_renderMatrix()` / `_renderPrediction()` (max-cycle.js)

**위치**: `max-cycle.js:303-326` (`_renderMatrix`), `max-cycle.js:328-342` (`_renderPrediction`)

**증거**: 두 함수 모두 정의되어 있지만 grep 으로 호출처 0 — 어디서도 부르지 않음.

**평가**: v2 의 매트릭스 / 6주 예측 카드 의도가 코드로 들어왔으나 v4 simplification 중에 entry point 가 빠짐. 매트릭스는 v2 의 핵심 차별 화면이었는데 사라짐.

**개선**: `renderMaxCycleBoard` 안에서 `_renderMatrix(snapshot)` 호출 → 6주 전체 매트릭스를 메인 surface 로. `_renderPrediction` 은 Plan Editor 의 `벤치마크` 섹션 끝에 미리보기 카드로.

### 2.3 트랙 전환의 인터랙션 비대칭

**위치**: `max-cycle.js:367-371` (track segmented), `max.js:1687-1692` `setMaxCycleTrack()`

**증거**: 사용자가 `볼륨` ↔ `강도` 누르면:
- `cycle.todayTrack = 'M' | 'H'` 저장
- 재렌더 → `_trackRepsRange(track)` 가 반복수 라벨만 바꿈 (`'10-12'` ↔ `'5-8'`)
- 무게는 변동 없음 (위 §1.3 참조)

**의도와의 어긋남**: 사용자는 "오늘은 강도로 갈래" 라고 누르면 무게도 조정될 거라 기대 (예: 75→80kg). 그러나 무게 그대로 — 사실상 라벨 바뀌는 toggle 에 불과.

**개선**: §1.3 의 데이터 모델 개편으로 자동 해결. 트랙별 별도 progression 이 있으면 누를 때마다 무게 + 반복수가 같이 바뀜.

### 2.4 Cycle Board 가 1 종목만 보여줌

**위치**: `max-cycle.js:392-426` `renderMaxCycleBoard()`

**증거**: `const primary = snapshot.benchmarks?.[0]` — 첫 벤치마크만 hero 로. 그 외 벤치마크의 weekly 진행은 어디서도 못 봄.

**개선**: 두 옵션 중 하나.
1. **매트릭스 메인 (권장)** — `_renderMatrix(snapshot)` 를 hero 자리에 배치. 주차 × 벤치마크 grid 한 화면.
2. **벤치마크 swap** — hero 우측에 `[가슴 ▾]` dropdown 으로 벤치마크 전환. 한 번에 하나씩 보지만 swap 자유.

v2 디자인 원본에 가까운 건 1번. 모바일 폭에서는 `Compact view` (부위 1개씩) ↔ `Wide view` (전체) 토글로 분기.

### 2.5 사이클 정산의 trigger / surface 부재

**위치**: `max.js:1959-1995` `settleMaxCycle()`

**증거**: 함수는 만들어져 있고 `_toast` 로 "사이클을 정산했어요" 도 띄움. 하지만:
- 사용자가 어디서 이 함수를 호출하지? grep 결과 호출처 없음 (`window.settleMaxCycle = settleMaxCycle` 같은 노출도 안 됨)
- Week 6 마지막 세션 끝났을 때 자동 호출되는 hook 없음

**평가**: v2 디자인의 "수확 모먼트" 가 코드에 존재하지만 사용자에게 노출되지 않는다.

**개선**:
1. `home/tomato.js` 의 `settleTomatoCycleIfNeeded` 와 같은 패턴으로 **세션 저장 시 hook**: 마지막 세션 저장 후 `weekIndex >= weeks` 면 settle 모달 자동 호출.
2. Plan Editor 의 사이클 섹션에 `[지금 정산하기]` ghost link.

### 2.6 부위 게이트의 마찰

**위치**: `max.js:1107-1112` `_renderMaxTodayMajorGate()` 호출

**증거**: 매 진입마다 `meta.majorGateOpen || majors.size === 0` 체크 → 부위 미선택이면 게이트.

**평가**: v2 의도는 "사이클 시작 모달에서 한 번 부위/벤치마크 pin" 후 매일은 그 사이클의 벤치마크가 자동 표시. 그러나 현재는 **매 세션마다 부위 선택을 다시 받음** (게이트가 재진입할 때마다 뜸).

**개선**:
1. 사이클이 active 면 게이트 자동 통과 — `cycle.benchmarks` 에서 majors 자동 도출.
2. 게이트는 "사이클 없는 신규 사용자 / 사이클 일시정지 상태" 에서만 노출.
3. 사용자가 의도적으로 오늘만 다른 부위 추가하고 싶으면 Today 화면 우상단 `⋯` → `오늘 부위 변경`.

### 2.7 Plan Editor 의 weight 입력이 native number input

**위치**: `max-cycle.js:464-468`

**증거**: `<input type="number" min="0" max="400" step="...">` 3 개 — 시작/목표/증감.

**평가**: 모바일에서 native number input 은 OS 기본 키패드를 띄움. step 화살표는 너무 작아서 누르기 힘듦. Adjust Sheet 의 큰 stepper UI 와 일관성 없음.

**개선**: Plan Editor 의 weight 값도 큰 stepper 로. 행 누르면 Adjust Sheet 와 동일한 sheet 가 사이클의 startKg/targetKg 편집용으로 열리는 흐름.

### 2.8 progression bar 가 트랙 정보 미반영

**위치**: `max-cycle.js:291-298` `_renderV4Lift()` 의 progression block

**증거**: `시작 ${b.planned.startKg}kg → 오늘 ${displayKg}kg → 목표 ${b.planned.targetKg}kg` — track 무관 단일 progression.

**평가**: 듀얼 트랙 모델에선 한 종목이 **두 progression 라인**을 가져야 함. UI 도 두 줄 또는 토글 필요.

**개선**: §1.3 데이터 모델 변경 후, progression bar 도 트랙별 두 줄 (또는 현재 트랙 위주 + 반대 트랙 회색 그림자).

### 2.9 마지막 10분 보강의 미작동

**위치**: `max-cycle.js:375-381`

**증거**: HTML 만 placeholder ("벤치마크를 끝내면 부족분 1-2개만 제안합니다") — 실제 4 종 끝났을 때 활성화하는 JS / 추천 hook 없음. `_suggestWeakTargetBoosts` 같은 로직은 있지만 v4 board 와 wired up 되지 않았음.

**개선**: `S.workout.exercises` 에서 벤치마크 movementId 모두 출현 + 각각 1세트 이상 done 인지 체크 → 충족 시 placeholder 를 `_suggestWeakTargetBoosts` 결과로 교체.

### 2.10 Adjust Sheet 의 scope 토글이 hard-coded

**위치**: `max.js:1945-1948`

**증거**:
```js
<div class="wt-v4-scope">
  <button type="button" class="on">이번만</button>
  <button type="button">다음 주부터 반영</button>
</div>
```

**평가**: 두 버튼이 정적 마크업 — `data-action` 없고 toggle 안 됨. 즉 "이번만" 으로만 적용되고 "다음 주부터" 는 클릭해도 효과 없음.

**개선**: `data-action="set-adjust-scope" data-scope="once|next"` 추가 + 핸들러에서 `cycle.todayOverrides[todayKey][benchmarkId].scope = 'once' | 'next'` 저장. `next` 면 다음 세션부터 `cycle.benchmarks[].startKg / targetKg` 베이스라인을 갱신.

---

## 3. 우선순위 매트릭스 — 무엇부터 고칠까

| # | 갭 | 영향 | 비용 | 우선순위 |
|---|---|---|---|---|
| §1.3 | 데이터 모델: 트랙별 benchmark 구조 | 매우 높음 (트랙 토글이 의미 가짐) | 높음 (마이그레이션 + 5+ 함수 시그니처 변경) | **P0** |
| §1.6 + §2.4 | 사이클 진행 시각화 + 매트릭스 부활 | 매우 높음 (메탈모델 회복) | 중간 (`_renderMatrix` 부활 + delta 표시) | **P0** |
| §1.2 | 벤치마크 CRUD (Create/Delete) | 높음 (사용자가 사이클 운영 가능) | 낮음 (UI + push/splice) | **P0** |
| §1.5 | 종목 picker 의 헬스장 출처 표시 + applyMaxSuggestion 의 gym 매핑 버그 | 높음 (헬스장 데이터 모델 정상화) | 중간 | **P1** |
| §1.1 | 벤치마크 카드 compact / expanded 토글 | 높음 (스크롤 부담) | 낮음 (CSS + class toggle) | **P1** |
| §1.4 | Plan Editor 안 inline 헬스장 / 검색 / 사진 일괄 등록 | 중간 | 높음 | **P2** |
| §2.1, §2.2 | dead code 정리 | 낮음 (혼란 방지) | 낮음 | **P1** |
| §2.5 | 사이클 정산 trigger | 중간 | 낮음 (hook 추가) | **P2** |
| §2.6 | 부위 게이트 마찰 제거 | 중간 | 낮음 | **P1** |
| §2.10 | Adjust Sheet scope 토글 작동 | 중간 | 낮음 | **P1** |
| §2.7 | Plan Editor weight stepper UX | 낮음 | 중간 | **P3** |
| §2.9 | 마지막 10분 활성화 hook | 중간 | 중간 | **P2** |

P0 3 개부터 처리하면 사용자 지적 6 항목 중 4 개가 동시에 해결됨 (§1.1, §1.2, §1.3, §1.6).

---

## 4. P0 패치 스케치

### 4.1 트랙별 벤치마크 데이터 모델

**Migration**: `_settings.max_cycle.benchmarks[].tracks` 가 array → object 로 변환.

```js
// data/data-core.js 또는 새 file: workout/expert/max-cycle-migrate.js
function migrateBenchmarkTracks(b) {
  if (b.tracks && !Array.isArray(b.tracks)) return b; // 이미 신규
  const oldStart = Number(b.startKg) || 0;
  const oldTarget = Number(b.targetKg) || oldStart;
  const oldInc = Number(b.incrementKg) || 2.5;
  return {
    ...b,
    tracks: {
      M: {
        startKg: oldStart,
        targetKg: oldTarget,
        incrementKg: oldInc,
        startReps: b.startReps || 12,
        targetReps: b.targetReps || 12,
        enabled: true,
      },
      H: {
        startKg: Math.round((oldStart + 5) * 10) / 10,         // M 보다 +5kg
        targetKg: Math.round((oldTarget + 5) * 10) / 10,
        incrementKg: oldInc,
        startReps: 8,
        targetReps: 6,
        enabled: true,
      },
    },
  };
}
```

**호출 위치**: `_getMaxCycleSafe` 가 cycle 반환 직전에 모든 benchmark 에 적용. 첫 호출 시 한 번 변환 + Firestore 저장 (`saveExpertPreset({ maxCycle: migrated })`).

**함수 시그니처 변경**:
- `predictBenchmarkProgression(b, cycle, todayKey, track)` — track 추가.
- `_displayKg(cycle, todayKey, b, track)` — track 추가.
- `buildMaxCycleSnapshot` — benchmarks 가 `{ M: planned, H: planned }` 둘 다 보유.
- `_renderV4Lift(b, snapshot, cycle)` — `snapshot.track` 으로 보여줄 트랙 결정.

### 4.2 사이클 진행 페이스 시각화 (delta 노출)

**위치**: `_renderV4Lift()` 의 progression block.

**전**:
```html
<div class="wt-v4-prog-meta">
  <span>시작 75kg</span>
  <b>오늘 77.5kg</b>
  <span>목표 80kg</span>
</div>
```

**후**:
```html
<div class="wt-v4-prog-meta">
  <span>시작 75</span>
  <span class="planned">계획 77.5</span>
  <b class="actual ${onPlan ? 'on-plan' : 'behind'}">실제 ${latest.kg} ${delta >= 0 ? '+' : ''}${delta}</b>
  <span>목표 80</span>
</div>
<!-- + bar with two pips: gray=planned, tomato=actual -->
```

CSS:
- `.actual.on-plan` → `color: var(--pos)` 또는 ink-1.
- `.actual.behind` → `color: var(--warn)` 또는 ink-1 + 좌측 띠.

Week strip 의 bar 도 dual layer:
```html
<div class="wt-v4-week-bar dual">
  <i class="planned" style="width:50%"></i>     <!-- 회색 -->
  <i class="actual" style="width:47%"></i>      <!-- 토마토 -->
</div>
```

### 4.3 벤치마크 CRUD

**Plan Editor `wt-v4-bench-row` 끝**:
```html
<button class="bench-row-delete" data-action="delete-benchmark"
        data-benchmark-id="${b.id}" aria-label="삭제">×</button>
```

**섹션 하단**:
```html
<button class="bench-add" data-action="open-benchmark-picker">
  + 벤치마크 추가
</button>
```

**`open-benchmark-picker` 핸들러**:
1. 부위 8 개 chip 노출 (가슴/등/하체/어깨/둔부/이두/삼두/복근).
2. 부위 선택 → 해당 부위 movements 목록 + **헬스장 출처 표시** (§1.5 의 optgroup 패턴).
3. 종목 선택 → 시작/목표 kg 빠른 입력 → `cycle.benchmarks.push(...)`.

**Save 시 처리**: 기존 `saveMaxPlanEditorSheet` 가 `nextBenchmarks = Array.from(...)` 로 DOM 에서 다시 읽으므로, push/splice 한 결과가 자동 반영.

---

## 5. v4 mockup 과의 정합성

`mockups/test-mode-v4-from-scratch.html` (v4.1) 는 위 갭 중 다음을 이미 반영하고 있음:
- §1.1 lift card compact (mockup 은 default 행 + progression bar 가 항상 보이지만 stepper 를 inline 으로 줄여 절약)
- §1.2 Plan Editor 에 `+ 종목 변경 / 추가` 버튼은 있으나 실제 흐름 없음 — 코드 패치 필요
- §1.5 mockup 의 Plan Editor benchmark 행에는 출처 표시 없음 — mockup v4.2 로 보강 필요
- §1.6 mockup 의 progression bar 가 시각화는 함 (시작/오늘/목표) 그러나 "계획 vs 실제" delta 는 없음 — mockup v4.2 로 보강
- §2.4 mockup 에 Cycle Board 가 매트릭스가 아니라 단일 종목 리스트 — mockup v4.2 로 매트릭스 옵션 추가

**제안**: 이 분석이 승인되면 `v4.2` 로 mockup + 계획서 한 번 더 갱신 + P0 3 개 코드 패치 착수.

---

## 6. 사용자 원래 의도 회복 — 한 줄

> 테스트모드 = 23년 엑셀 매트릭스의 디지털 부활. 듀얼 트랙으로 무게/볼륨을 6주 동안 점진적으로 올리고, 한 화면에서 "계획대로 가고 있나" 가 보이고, 헬스장이 바뀌어도 같은 사이클을 운영할 수 있어야 한다.

현재 코드는 이 중 "한 화면 v4 board" 까지만 와 있고, 나머지(트랙 별도 progression / 페이스 가시화 / 헬스장 출처 / 매트릭스 / 정산 hook) 는 미구현.

다음 단계는 P0 3 개를 v4.2 mockup 에 먼저 그려본 뒤 코드 패치하는 순서가 적절.

---

## 변경 이력

- 2026-05-02 v4.2-analysis: 라이브 코드 검증 후 사용자 지적 6 항목 + 추가 갭 10 개 정리. 우선순위 매트릭스 + P0 패치 스케치.
