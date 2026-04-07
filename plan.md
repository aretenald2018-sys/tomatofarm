# Project Plan

## 작업 진행 방법

### "go" 명령 시
1. plan.md에서 다음 미완료 체크박스 찾기
2. 해당 작업 구현
3. localhost에서 동작 확인 (python -m http.server 5500)
4. COMMIT: 커밋 (feat:/fix:/refactor:/style:/docs:)
5. plan.md 체크박스 업데이트

### 작업 완료 시
1. 모든 변경사항 커밋 완료 확인
2. localhost에서 최종 테스트
3. plan.md 체크박스 [x] 업데이트
4. 다음 미완료 작업으로 이동

---

## Phase 1: 개발 기반 정비
**목표**: AI 코딩 효율화를 위한 문서 체계 구축

- [x] CLAUDE.md 생성 — 프로젝트 규칙, 컨벤션, 워크플로우 정의
- [x] ARCHITECTURE.md 보강 — 전체 시스템 아키텍처 추가
- [x] plan.md 생성 — 마일스톤, 체크리스트, "go" 워크플로우
- [x] prd.md 생성 — 제품 요구사항 문서
- [x] 커밋 메시지 규칙 통일 — feat:/fix:/refactor: 접두사

## Phase 2: 코드 품질 개선
**목표**: 핵심 로직에 테스트 안전망 확보

- [ ] 테스트 환경 설정 (Vitest 설치, package.json scripts 추가)
- [ ] calc.js 테스트 작성 — calcDietMetrics, dietDayOk, calcStreaks
- [ ] data.js 유틸리티 테스트 — dateKey 등 순수 함수
- [ ] API 키 하드코딩 제거 — Gemini, 식품안전처 키를 localStorage로 이동

## Phase 3: 구조 리팩토링
**목표**: 대형 파일 분할로 유지보수성 향상 (테스트 확보 후 진행)

- [ ] app.js 분할 검토 (app-init, app-tabs, app-events)
- [ ] data.js 분할 검토 (data-workout, data-social, data-finance)
- [ ] Git 브랜치 전략 도입 (main → dev → feature)

## Phase 현재: 기능 개발

### 2026-04-08 UI 개선 3건
- [x] 프로필 댓글 "등록"/"남기기" 버튼 Tonal 스타일로 변경 (friend-profile.js)
- [x] 칼로리 카드 단/탄/지 매크로 정수 표시 (render-workout.js)
- [x] 히어로카드 듀오링고 스타일 이웃 통합 문구 (hero.js)
  - **구현 중 발견한 버그**: `updateHeroSocialProof()`가 `renderFriendFeed()`에서만 호출되어, 오늘 활동한 이웃이 없으면 메시지가 업데이트되지 않았음. `renderLeaderboard()`에서도 주간 리더보드 이웃 데이터로 호출하도록 추가 수정.
  - social-proof 영역 왼쪽 정렬 + 이웃 이름/핵심어 `<strong>` 강조 + 말투 활발하게 변경

---

## 리스크 관리

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 테스트 없이 리팩토링 | 회귀 버그 | Phase 2 완료 후 Phase 3 진행 |
| API 키 노출 | 보안 위험 | Phase 2에서 localStorage 이동 |
| 대형 파일 복잡도 | 유지보수 어려움 | Phase 3에서 단계적 분할 |
