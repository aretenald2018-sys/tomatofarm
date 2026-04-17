# TDS Mobile 디자인 시스템 정합 감사 — 토마토팜

> 작성일: 2026-04-17
> 기준: [TDS Mobile](https://tossmini-docs.toss.im/tds-mobile/) (컬러 제외)
> 범위: `style.css`, `index.html`, 핵심 탭(`home/`, `workout/`), 모달(`modals/`), 유틸 클래스(`.tds-*`)
> 자매 문서: `UX_IMPROVEMENT.md` — 본 문서는 "디자인 정합" 관점, UX 문서는 "사용자 경험" 관점

---

## 0. 총평

현재 코드베이스는 TDS Mobile을 **부분적으로** 수용하고 있다. `.tds-card`, `.tds-search`, `.tds-segmented`, `.tds-progress`, `.tds-text-btn` 등 TDS 컴포넌트 유틸 클래스가 `style.css` 전반부(280~420행대)에 깔끔하게 정의되어 있으나, **실제 사용처는 제한적**이며 구 Seed 패턴(`.ex-block`, `.sheet-*`, `.modal-sheet`)과 혼재한다.

**주요 위반 카테고리:**
1. 모달/시트 시스템이 TDS 규격과 불일치 — 특히 제목 t5(17px) ↔ TDS t4(20px)
2. 트랜지션 0.2s / 0.4s / 0.5s 등 비표준 값 50+ 곳
3. 버튼 크기가 TDS 스케일(sm/md/lg/xl)을 벗어난 임의값 (5/6/7px padding 등)
4. 하드코딩 border-radius(6px 등) TDS 스케일 외 값
5. `alert()` 39곳 — TDS Toast 미사용 (CLAUDE.md 규칙 위반)
6. 인라인 `style=` 속성 `index.html` 여러 곳
7. 레거시 Seed 토큰(`--seed-*`) vs TDS 토큰 혼용

**정량 요약(발견 건수):**

| 카테고리 | 건수 | 심각도 |
|---|---|---|
| 비표준 트랜지션(0.2s/0.4s/0.5s/0.6s/1s) | 50+ | 높음 |
| alert/ confirm 사용 | 39+ | 높음 |
| 모달·시트 타이틀/패딩 규격 위반 | 3 | 높음 |
| 하드코딩 border-radius | 10+ | 중간 |
| 버튼 padding 스케일 위반 | 5+ | 중간 |
| 인라인 스타일(HTML) | 10+ | 중간 |
| 타이포그래피 라인하이트 누락 | 5+ | 중간 |

---

## 1. Typography (타이포그래피)

### 1.1 TDS Mobile 표준 (재확인)

| 토큰 | Size / Line-height | Weight |
|---|---|---|
| t1 | 30 / 40 | 700 |
| t2 | 26 / 36 | 700 |
| t3 | 22 / 32 | 700 |
| t4 | 20 / 29 | 700 |
| t5 | 17 / 25.5 | 700 |
| t6 | 15 / 22.5 | 600 |
| t7 | 13 / 19.5 | 600 |
| st10 | 16 / 24 | 500 |
| st11 | 14 / 21 | 500 |
| st12 | 13 / 19.5 | 500 |
| st13 | 11 / 16.5 | 500 |

### 1.2 위반 사례

| # | 파일:행 | 현재 | 위반 | 수정안 |
|---|---|---|---|---|
| T1 | `style.css:1156-1158` | `.sheet-title` 17px/700/no LH | TDS 모달 제목은 t4(20/29/700) | `font-size:20px; line-height:29px; font-weight:700;` |
| T2 | `style.css:1208-1210` | `.modal-title` 17px/700/no LH | 동일 | 동일 |
| T3 | `style.css:1165-1170` | `.section-category-title` 15px/600 LH 없음 | t6는 line-height 22.5px 필수 | `line-height: 22.5px;` 추가 |
| T4 | `style.css:1171-1174` | `.sheet-section-label` 12px/600 | TDS에 12px 단계 없음 (13px t7 또는 11px st13) | t7(13/19.5/600) 또는 st13(11/16.5/500)로 |
| T5 | `style.css:1172-1184` | `.sheet-btn` 14px/600 → md 버튼 타이포 | 맞음 (md 레이블 14/21/600) | line-height 21px 추가 권장 |
| T6 | 전역 | 하드코딩 `17px`, `15px` 등 많음 | TDS 스케일 값만 허용 | 임의 값은 14 / 16 / 20 / 24 스케일로 재배치 |

### 1.3 권장 조치
1. `style.css` 상단에 CSS 변수 추가:
   ```css
   :root {
     --tds-t1: 30px/40px; --tds-t2: 26px/36px; --tds-t3: 22px/32px;
     --tds-t4: 20px/29px; --tds-t5: 17px/25.5px; --tds-t6: 15px/22.5px;
     --tds-t7: 13px/19.5px;
     --tds-st10: 16px/24px; --tds-st11: 14px/21px;
     --tds-st12: 13px/19.5px; --tds-st13: 11px/16.5px;
     --tds-w-bold: 700; --tds-w-semi: 600; --tds-w-med: 500; --tds-w-reg: 400;
   }
   ```
2. 헬퍼 클래스 `.tds-t1 ~ .tds-t7`, `.tds-st10 ~ .tds-st13`을 만들어 인라인 스타일처럼 사용.
3. ESLint/Stylelint 규칙: `font-size: 17px` 같은 임의 값 금지 (`scripts/lint-css.mjs`에서 체크).

---

## 2. Spacing & Radius (간격·라운딩)

### 2.1 TDS Radius 스케일

| 토큰 | 값 | 용도 |
|---|---|---|
| r4 (xs) | 4px | 프로그레스, 세그먼티드 item inner |
| r8 (sm) | 8px | sm 버튼, tds-text-btn, 배지 sm |
| r10 | 10px | 세그먼티드 indicator |
| r11 | 11px | 스켈레톤 타이틀 |
| r12 (md) | 12px | 서치필드, 카드, 중간 버튼, 세그먼티드 item |
| r14 | 14px | 텍스트필드, 세그먼티드 컨테이너 |
| r15 | 15px | 스위치 (50x30 기준 half) |
| r16 (lg) | 16px | 큰 버튼 |
| r18 | 18px | 스켈레톤 카드 |
| r9999 (full) | 99999px | 배지, 알 모양 |

### 2.2 위반 사례 (하드코딩 값)

| # | 파일:행 | 현재 | 수정안 |
|---|---|---|---|
| R1 | `style.css:1387, 967, 1828` 등 | `border-radius: 6px` 다수 | `var(--radius-sm)`(8px) 또는 `var(--radius-xs)`(4px) |
| R2 | `style.css:3835` | `border-radius: 3px` | `var(--radius-xs)`(4px) |
| R3 | `index.html` 인라인 | `border-radius: 12px` 그대로 | `var(--radius-md)` 토큰 사용 |

### 2.3 Spacing (4px grid)

TDS Mobile은 4px 그리드를 권장. 패딩/마진은 `4 / 8 / 12 / 16 / 20 / 24 / 32` 이 권장.

| # | 파일:행 | 현재 | 문제 | 수정안 |
|---|---|---|---|---|
| S1 | `style.css:1826-1828` | `padding: 5px 12px` (wt-today-btn) | 5px 그리드 외 | `padding: 8px 14px` (sm 버튼) |
| S2 | `style.css:1814-1816` | `padding: 8px 18px` (wt-date-nav-btn) | 18px 그리드 외 | `padding: 8px 20px` |
| S3 | `style.css:1147, 1205` | `.sheet / .modal-sheet padding: 0 20px 36px` | 상단 패딩 0 | `padding: 32px 20px 20px 20px` (TDS 모달 content 기준). 상단 핸들 고려해 `.sheet-handle` 이후 `.sheet-body` 랩퍼로 분리 권장 |
| S4 | `style.css:1160-1163` | `.sheet-section padding: 20px 16px` | TextField 15/15 과 불일치 | 섹션은 20/20 또는 16/16, TextField 내부는 14/16 |

### 2.4 권장 조치
1. `--space-0 ~ --space-8` 변수 정의(0/4/8/12/16/20/24/32/40).
2. Stylelint 규칙: 패딩/마진은 변수나 4px 배수만 허용.
3. 인스펙터 DevTools에서 각 화면 캡처하여 틀어진 간격 시각적으로 식별.

---

## 3. Button (버튼)

### 3.1 TDS 버튼 규격 (size → padding / radius / typography)

| Size | Padding V/H | Radius | Typography | 최소 높이 |
|---|---|---|---|---|
| sm | 8 / 14 | r8 | 12/18/600 | 36px |
| md | 12 / 20 | r12 | 14/21/600 | 44px |
| lg | 14 / 24 | r16 | 17/25.5/600 | 52px |
| xl | 16 / 28 | r16 | 20/29/700 | 60px |

### 3.2 위반 & 누락

| # | 위치 | 현재 | 수정 |
|---|---|---|---|
| B1 | `.sheet-btn` `style.css:1181-1186` | padding 14px(정사각) | md 기준 `padding: 12px 20px; border-radius: var(--radius-md);` |
| B2 | `.wt-today-btn` `style.css:1826-1828` | padding 5px 12px, r6 | sm로: `padding: 8px 14px; border-radius: var(--radius-sm);` + `min-height: 36px;` |
| B3 | `.wt-date-nav-btn` `style.css:1814-1816` | padding 8px 18px | `padding: 8px 20px;` (sm 기준) + `border-radius: var(--radius-sm);` |
| B4 | `.ex-add-btn` `style.css:1217-1220` | sm 변형이지만 굵기/LH 미검증 | font: `12px/18px 600` 명시 |
| B5 | 여러 `onclick` 버튼 | `<button onclick>` 인라인 | 클래스로 승격 `.tds-btn.tds-btn-sm` 또는 `-md` |
| B6 | 텍스트 전용 링크 버튼 | `<a>` 요소로 구현된 것 다수 | `.tds-text-btn` 강제 적용 |
| B7 | Destructive(삭제) 버튼 | 이모지·텍스트·색상 제각각 | 신규 `.tds-btn.destructive` 정의: `color: var(--diet-bad); background: transparent; border: 1px solid var(--diet-bad);` |

### 3.3 권장 조치
1. `style.css`에 `.tds-btn`, `.tds-btn-sm/md/lg/xl` 기본 스타일 추가 (아직 없음).
2. 기존 버튼 클래스(`.sheet-btn`, `.wt-*-btn`, `.ex-add-btn`)를 `.tds-btn` + modifier 조합으로 치환.
3. HTML 마이그레이션: `class="tds-btn tds-btn-md confirm"` 형태.
4. 버튼 최소 높이 44px 보장 (접근성) — sm만 36px, 나머지 ≥44.

---

## 4. Modal & Sheet (모달·시트)

### 4.1 TDS 규격
- Content padding: `32px 20px 20px 20px`
- Title: t4 (20/29/700)
- Close button (있다면): icon-btn 24px, 우상단
- Backdrop: `rgba(0,0,0,0.6)` + blur(현재 OK)
- Animation: slideUp (하단 시트) 또는 fadeIn (센터 다이얼로그)

### 4.2 위반

| # | 위치 | 현재 | 수정 |
|---|---|---|---|
| M1 | `.sheet` `style.css:1142-1150` | padding `0 20px 36px`, 핸들로 상단 여백 대체 | 구조 변경 권장: `<div class="sheet"><div class="sheet-handle"/><div class="sheet-content">…</div></div>` 에서 `.sheet-content { padding: 32px 20px 20px 20px; }` |
| M2 | `.modal-sheet` `style.css:1200-1206` | 동일 문제 + max-height 80vh | content 내부 패딩 동일 규격 + max-height 90vh(TDS 기본) |
| M3 | `.sheet-title / .modal-title` | 17px/700 | 20px/29px/700 (t4) |
| M4 | `.sheet-actions` sticky bottom padding | padding-top 12px | `padding: 16px 0 0 0` + 상단 shadow/border 고려 |
| M5 | 모달 닫기 버튼 | 일부 모달만 보유(×), 크기 불균일 | 공통 `.tds-icon-btn` 24px 적용, `aria-label="닫기"` 강제 |
| M6 | 백드롭 페이드 애니메이션 `style.css:1140,1199` | `fadeIn 0.2s ease` | TDS 표준 fade-in 0.3s 권장 (또는 0.1s ease-in-out) |

### 4.3 권장 조치
1. 공통 모달 랩퍼 컴포넌트를 `modal-manager.js`에서 생성하도록 리팩토링.
2. 모든 모달 마크업을 `<section class="tds-modal"><header class="tds-modal-header"><h2 class="tds-modal-title">…</h2><button class="tds-icon-btn close">✕</button></header><div class="tds-modal-body">…</div><footer class="tds-modal-actions">…</footer></section>` 표준화.
3. ESC / 백드롭 클릭 / 닫기 버튼 셋 다 지원.

---

## 5. Input & TextField / SearchField

### 5.1 TDS 규격
- TextField: padding `14px 16px`, radius `14px`, font `16px / 1.5`
- SearchField: min-height 44, radius 12, padding `8px 10px`, font 16

### 5.2 현 상태

| 컴포넌트 | 상태 |
|---|---|
| `.tds-search` `style.css:342-354` | **준수** ✅ (44px, r12, 8/10, 16px) |
| 일반 input (workout 폼, 모달 폼) | 공통 클래스 없이 각자 스타일 → **위반** |

### 5.3 개선

| # | 조치 |
|---|---|
| I1 | `.tds-textfield` 신규 클래스: `padding: 14px 16px; border-radius: 14px; font-size: 16px; line-height: 1.5; background: var(--seed-bg-fill); border: 1px solid var(--seed-stroke-weak);` |
| I2 | 포커스 상태: `border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-bg);` |
| I3 | 모든 `<input type="text|number|email|tel">` 및 `<textarea>` 에 `.tds-textfield` 적용 |
| I4 | 숫자 인풋(무게/리프스/칼로리)은 `inputmode="decimal"` + `.tds-textfield.num` 변형(가운데 정렬, 탭 확장) |

---

## 6. ListRow (리스트 행)

### 6.1 TDS 규격
- min-height 44px, padding `12px 0`, gap 16px, line-height 1.35

### 6.2 현 상태
- `.ex-list`, `.ex-item` 등 운동 종목 리스트가 커스텀 간격 사용.
- 홈 카드 내부 라인 행들(영양 목표 행, 목표 리스트 등) 패딩 제각각.

### 6.3 개선
- `.tds-row` 신규: `display: flex; align-items: center; gap: 16px; min-height: 44px; padding: 12px 0;`
- 모든 리스트 아이템은 이 클래스 기반 + modifier(`.with-avatar`, `.clickable`).

---

## 7. Tab / Chip / SegmentedControl

### 7.1 TDS 규격
- Tab: min-width 64, indicator 2px (radius 1px), font 13, transition `0.3s ease`
- SegmentedControl: container r14, item r12, indicator r10
- Chip (파생): 일반적으로 sm 버튼 베이스

### 7.2 현 상태

| 컴포넌트 | 상태 | 비고 |
|---|---|---|
| `.tds-segmented / -item / -indicator` | 치수 OK ✅ 하지만 `transition: 0.2s ease` | **0.3s ease**로 교정 |
| `.wt-type-chip` 운동 유형 칩 | TDS 외 커스텀. 크기/라운딩 미검증 | sm 버튼 규격 강제 + 활성 시 primary-bg |
| 상단 탭 네비게이션(`.tds-tab-*`) | 0.3s ease ✅ 준수 | indicator 높이 / radius 재확인 필요 |

### 7.3 개선
- SegmentedControl `transition` 값 `0.3s ease`로 수정(TDS 슬로우).
- `.wt-type-chip` 을 `.tds-chip`으로 재명명, 다음 스펙:
  ```css
  .tds-chip {
    display:inline-flex; align-items:center; gap:4px;
    min-height:36px; padding:8px 14px;
    border-radius: var(--radius-sm);
    font: 12px/18px var(--font-sans); font-weight: 600;
    border: 1px solid var(--border);
    background: var(--surface2); color: var(--text-secondary);
    transition: var(--transition);
  }
  .tds-chip.active { background: var(--primary-bg); color: var(--primary); border-color: var(--primary); }
  ```

---

## 8. Badge

### 8.1 TDS 규격
- sm: 9/13 폰트, r8
- md: 10/15 폰트, r9999
- font-weight: bold (700)

### 8.2 현 상태
- `.tds-badge` `style.css:~260-282` 존재. 그러나 각 모달/카드에서 `<span style="font-size:10px; background:...">` 인라인 badge가 따로 만들어지는 경우 다수.

### 8.3 개선
- `.tds-badge.sm`, `.tds-badge.md` 두 변형 명시 + 색상 modifier(`.primary`, `.success`, `.warning`, `.danger`).
- `grep -rn "font-size:10px" index.html *.js`로 인라인 배지 찾아 마이그레이션.

---

## 9. Switch / Toggle

### 9.1 TDS 규격
- 50x30px, radius 15px
- disabled opacity 0.3
- 트랜지션 0.1s ease-in-out

### 9.2 현 상태
- 프로젝트에 전용 `.tds-switch` 정의 없음. 대부분 체크박스 또는 커스텀 토글 `<button>` 사용.

### 9.3 개선
- `.tds-switch`, `.tds-switch-track`, `.tds-switch-thumb` 신규 구현.
- 식단 스킵/추천 토글/ 알림 설정 등 on/off 컨텍스트에 적용.

---

## 10. Toast / Loader / Skeleton / ProgressBar

### 10.1 TDS 규격
- Toast: 3000ms 자동 닫기, 0.1s ease-in-out
- Loader: 1.8s rotation, fade-in 0.3s (delay 0.7s)
- Skeleton: card r18, title r11, subtitle r9
- ProgressBar: 0.5s ease-in-out transform

### 10.2 현 상태

| 컴포넌트 | 상태 |
|---|---|
| Toast (`showToast`) | 구현 존재. 기본 지속시간/트랜지션 검증 필요 |
| Loader | 전역 스피너 패턴 부재(UX_IMPROVEMENT 4.4 참조) |
| Skeleton | **부재** |
| ProgressBar (`.tds-progress-fill`) | `transition: transform 0.5s ease-in-out` ✅ 준수 |

### 10.3 개선
- `showToast` 기본값 재확인: 3000ms, `transition: transform 0.1s ease-in-out, opacity 0.1s ease-in-out`.
- `.tds-loader` 스피너: 28px 링, 1.8s rotation, 최초 0.7s 동안은 표시 안 함(깜빡임 방지).
- `.tds-skeleton-card { border-radius: 18px; background: linear-gradient(…); animation: skeleton 1.5s infinite; }`.
- Stats/Admin 탭 레이지 로드 시 skeleton 기본 삽입.

---

## 11. Transitions (트랜지션) — 대규모 정합

### 11.1 TDS 기본
- 표준: `0.1s ease-in-out` (탭/버튼/상태 변화)
- 슬로우: `0.3s ease` (탭 인디케이터, 세그먼티드)
- ProgressBar: `0.5s ease-in-out transform`
- Slide/Sheet: `0.3s cubic-bezier(0.32,0.72,0,1)` (TDS sheet 권장)

### 11.2 위반 사례 (일부, 50+ 중 대표)

| 행 | 현재 | 수정 |
|---|---|---|
| 304 | `transition: color 0.2s ease` (segmented-item) | `color 0.1s ease-in-out` |
| 313 | `transition: left 0.2s ease, width 0.2s ease` (segmented-indicator) | `left 0.3s ease, width 0.3s ease` |
| 616 | `transition: opacity 0.2s ease` (notif-center) | `opacity 0.1s ease-in-out` |
| 959 | `transition: width 0.5s ease` (quest-bar) | `width 0.5s ease-in-out` (프로그레스 규격) |
| 1314 | `transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1)` | 표준 `0.1s ease-in-out` (스프링 바운스가 필요한 축하 모먼트에만 예외) |
| 1478 | `transition: width 0.4s ease` (muscle-stat-bar) | `width 0.5s ease-in-out` |
| 2422 | `transition: all 0.2s ease` | `all 0.1s ease-in-out` |
| 2506 | `transition: width 0.5s ease-in-out` | 정합 (프로그레스인 경우 OK) |
| 2790 | `transition: background 0.2s ease-in-out, border-color 0.2s ease-in-out` | `0.1s ease-in-out` |
| 4608 | `transition: width 0.6s cubic-bezier(...)` | `0.5s ease-in-out` 또는 `0.3s ease` |
| 6174 | `transition: width 1s linear, background 0.2s ease` | 1s linear는 프로그레스 아닌 이상 배제. `0.5s ease-in-out`로 |

### 11.3 권장 조치
1. CSS 변수 추가:
   ```css
   :root {
     --tds-transition: 0.1s ease-in-out;
     --tds-transition-slow: 0.3s ease;
     --tds-transition-progress: 0.5s ease-in-out;
     --tds-ease-sheet: cubic-bezier(0.32, 0.72, 0, 1);
   }
   ```
2. 기존 `--transition` / `--transition-slow` 변수 값 검토 및 TDS 값으로 일치시킴.
3. `transition: 0.2s` / `0.4s` / `0.6s` / `1s` 전부 제거 — 필요한 5단계(0.1 / 0.3 / 0.5)만 허용.
4. Stylelint 규칙: `declaration-property-value-allowed-list`에 허용 트랜지션만 등록.

---

## 12. Toast vs alert() — 즉시 조치

| 파일 | 건수 | 조치 |
|---|---|---|
| `modals/nutrition-item-modal.js` | 15 | 저장/에러/검증 메시지 모두 toast로 |
| `admin/admin-cheers.js` | 6 | success/error 타입 분리 |
| `admin/admin-actions.js` | 2 | 계정 삭제 확인은 커스텀 confirm |
| `feature-fatsecret.js` | 1 | info/error |
| `feature-diet-plan.js` | 2 | success/error |
| `feature-checkin.js` | 1 | success |
| `workout/exercises.js` | 2 | success/error |
| `sheet.js` | 1 | success |
| `app-modal-quests.js` | 2 | success |
| `app-modal-goals.js` | 2 | success |
| `render-cooking.js` | 2 | success/error |
| `pwa-fcm.js` | 1 | info |
| `modals/guild-info-modal.js` | 2 | success/warning |

**합계 39건** → Phase 0 일괄 치환 대상. `scripts/migrate-alerts.mjs` 작성 제안.

---

## 13. 인라인 스타일(HTML) 정리

| # | 파일:행 | 현재 | 수정 |
|---|---|---|---|
| H1 | `index.html:49-50` | `style="flex:1;" ... style="flex:2;"` | 유틸 클래스 `.flex-1 / .flex-2` |
| H2 | `index.html:56` | `style="padding:10px 12px; border-radius:var(--radius-md)"` | `.login-radio-label` 클래스 이전 |
| H3 | `index.html:83` | `style="background:none; border:none; color:var(--primary); ..."` | `.tds-text-btn` 클래스 |
| H4 | `index.html` 여러 곳 | `style="font-size:10px"` 계열 | `.tds-st13` 또는 `.tds-badge.sm` |
| H5 | `index.html` 여러 곳 | `style="margin-top:4px"` 류 | 간격 변수(`--space-1` 등)로 |

### 권장 조치
- `grep -n "style=\"" index.html` 로 전부 수집 → 클래스화 후 CSS 이동.
- 이후 ESLint/HTMLlint 규칙: `style=` 속성 사용 금지(예외는 동적 CSS 변수 주입만 허용).

---

## 14. 컴포넌트 마이그레이션 매트릭스

| 현재 커스텀 | → 목표 TDS 클래스 | 대표 사용처 |
|---|---|---|
| `.sheet-btn` | `.tds-btn.tds-btn-md .primary / .secondary` | 하단 시트 액션 |
| `.wt-today-btn`, `.wt-date-nav-btn` | `.tds-btn.tds-btn-sm` | 운동 날짜 네비 |
| `.wt-type-chip` | `.tds-chip` | 운동 유형 선택 |
| `.ex-add-btn` | `.tds-btn.tds-btn-sm.ghost` | 종목 추가 |
| `.sheet-section` | `.tds-card` (padding 조정) | 시트 내 구역 |
| `.section-category-title` | `.tds-t6 .tds-section-title` | 카드 내 섹션 제목 |
| `.sheet-title / .modal-title` | `.tds-t4 .tds-modal-title` | 모달 제목 |
| `.sheet-section-label` | `.tds-t7.muted` | 필드 그룹 라벨 |
| 인라인 뱃지 `<span style="font-size:10px;...">` | `.tds-badge.sm .variant` | 카테고리/상태 표시 |
| 커스텀 토글 `<button>` | `.tds-switch` | 설정/알림 on-off |
| 커스텀 skeleton 없음 | `.tds-skeleton-card / -title / -subtitle` 신규 | 탭 전환, 데이터 로딩 |

---

## 15. 마이그레이션 로드맵

### Phase T0 — 토큰·트랜지션 정비 (0.5일)
**변경 범위 작고 효과 큰 저위험 작업**
- [ ] `--tds-t*`, `--tds-st*`, `--radius-*`, `--tds-transition*`, `--space-*` 변수 정의
- [ ] 기존 `--transition` / `--transition-slow` 값을 TDS 기준으로 교정
- [ ] `transition: 0.2s / 0.4s / 0.6s / 1s` 전역 치환 (grep → sed 스크립트)
- [ ] 하드코딩 `border-radius: 6px / 3px` → 토큰 치환

### Phase T1 — Toast & Alert 마이그레이션 (1일)
- [ ] `showToast`에 `action` 옵션 추가 (Undo)
- [ ] `alert()` 39건 → `showToast()` 치환 (수동 검수)
- [ ] `confirm()` 사용처 → 커스텀 confirm 모달 `utils/confirm-modal.js`
- [ ] QA: 주요 플로우 수동 시나리오 1회

### Phase T2 — Button & Chip 표준화 (2일)
- [ ] `.tds-btn / -sm / -md / -lg / -xl` 정의
- [ ] `.tds-chip` 정의
- [ ] `.tds-text-btn` 기존 유지(규격 검토)
- [ ] `.sheet-btn` / `.wt-*-btn` / `.ex-add-btn` 을 `.tds-btn` 기반으로 리팩토링
- [ ] `.wt-type-chip` → `.tds-chip`
- [ ] `min-height 44px` 접근성 가드

### Phase T3 — Modal / Sheet 구조 정리 (2일)
- [ ] 공통 모달 래퍼 `renderModalShell(title, body, actions)` 도입 (`modal-manager.js`)
- [ ] `.tds-modal-header / -body / -actions` 표준 마크업
- [ ] 제목 t4, content padding `32/20/20/20`
- [ ] ESC / 백드롭 / 닫기버튼 일관성 + 포커스 관리

### Phase T4 — Input / ListRow / Badge 정합 (1.5일)
- [ ] `.tds-textfield` 정의 + 전 입력 마이그레이션
- [ ] 숫자 입력 `inputmode` 보강
- [ ] `.tds-row` 정의 + 홈/워크아웃 리스트 행 치환
- [ ] `.tds-badge.sm/md` + 인라인 배지 제거

### Phase T5 — Segmented / Tab / Switch (1일)
- [ ] Segmented 트랜지션 `0.3s ease`로 교정
- [ ] `.tds-switch` 구현(50x30, r15)
- [ ] 식단 스킵/운동 상태/알림 설정 → SegmentedControl로 통일

### Phase T6 — Skeleton / Loader / Empty (1일)
- [ ] `.tds-skeleton-*` 구현
- [ ] `.tds-loader` 구현 (delay 0.7s fade-in 0.3s)
- [ ] 레이지 탭 로드 시 skeleton 기본 삽입
- [ ] 엠프티 스테이트 공통 `.tds-empty` 도입

### Phase T7 — 인라인 스타일 제거 (0.5일)
- [ ] `index.html` `style="..."` 전부 클래스로 이전
- [ ] HTMLlint 규칙 추가

### Phase T8 — Linting / 회귀 방지 (0.5일)
- [ ] Stylelint: 허용 값 리스트(transition, border-radius, font-size)
- [ ] ESLint: `alert(` / `confirm(` 금지
- [ ] PR 체크리스트에 "TDS 정합" 항목 추가

---

## 16. 회귀 방지 · 체크리스트

배포 커밋 전 다음을 수동 체크:

- [ ] 새 컴포넌트를 추가할 때 **항상** 기존 `.tds-*` 유틸부터 재사용
- [ ] 새 CSS 값에 `0.2s / 0.4s / 0.6s` 트랜지션 사용 금지
- [ ] 새 버튼은 `.tds-btn.tds-btn-{sm|md|lg|xl}` + modifier
- [ ] 새 모달은 `renderModalShell()` 사용 (직접 HTML 작성 금지)
- [ ] 새 인풋은 `.tds-textfield` + `inputmode` 정확히 지정
- [ ] 새 토스트는 `showToast(msg, 3000, type, { action })`
- [ ] `alert()` 호출 금지 — PR 단계에서 실패 처리

---

## 17. 위험·트레이드오프

| 항목 | 위험 | 대응 |
|---|---|---|
| 모달 구조 재작성 | 기존 DOM 참조 코드(onclick ID 등) 깨짐 | 모달별로 점진 이관, 스냅샷 스크린샷 비교 |
| 트랜지션 값 치환 | 스프링 바운스 의도적 연출 손실 | 축하/수확 등 특수 모션은 opt-in 예외 유지 |
| 버튼 `min-height: 44px` 강제 | 기존 촘촘한 칩 레이아웃 붕괴 가능 | sm은 36px 허용, 카드 안 미니 액션만 예외 |
| Seed 토큰 제거 | ARCHITECTURE에 "호환 유지" 명시됨 | 제거하지 않고 TDS와 매핑 레이어만 추가 |
| Stylelint 도입 | 파이프라인 없음(빌드리스) | `npm run lint:css` 수동 실행, PR 체크 |

---

## 18. 부록 — TDS 정합 핫스폿(파일별 요약)

| 파일 | 주요 작업 |
|---|---|
| `style.css` | 트랜지션·라디어스·타이포·버튼 표준화(본 문서의 90%) |
| `index.html` | 인라인 스타일 제거, 클래스 부여 |
| `modal-manager.js` + `modals/*.js` | 모달 쉘 래퍼 도입, 제목 t4, padding 정합 |
| `workout-ui.js`, `workout/*.js` | 칩/세그먼티드 통일, 버튼 치환 |
| `home/*.js` | 카드/행/타이포/CTA 버튼 치환 |
| `feature-*.js`, `admin/*.js` | alert → toast, confirm → 커스텀 모달 |

---

**다음 행동 권장**:
1. `plan.md` 에 본 문서의 Phase T0~T8 체크박스를 "Phase 디자인 시스템 정합" 섹션으로 복사.
2. T0+T1(저위험·임팩트 큼)을 먼저 1 PR로 배포.
3. T2~T5는 컴포넌트별로 1 PR씩 쪼개 리뷰 용이하게.
4. T6~T8은 마무리 폴리시.
