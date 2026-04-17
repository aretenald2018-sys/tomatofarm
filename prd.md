# Product Requirements Document — 토마토팜 (dashboard3)

## 1. 제품 개요

### 1.1 배경
개인 건강/생산성 데이터가 여러 앱에 분산되어 있어 통합 관리가 어려움.
운동, 식단, 요리 등 일상의 추적을 한 곳에서 관리하고,
게임화 요소(토마토 농장)로 지속적인 동기 부여를 제공하는 개인 대시보드.

### 1.2 목표
- 운동/식단 스트릭을 시각적으로 추적하여 동기 부여
- 친구 네트워크로 상호 동기 부여 (소셜 피드, 방명록, 길드, 푸시 알림)
- AI(Claude/Gemini)를 활용한 식단 분석, 운동 추천, 목표 실현 가능성 분석
- Expert Mode로 고급 사용자에게 체육관/루틴 수준의 세밀한 관리 제공
- 오프라인에서도 사용 가능한 PWA

## 2. 사용자

### 2.1 핵심 사용자
- **관리자 (Admin)**: 모든 기능 사용, 데이터 관리, 친구 네트워크 운영
- **게스트 (Admin Guest)**: 관리자 데이터 공유, 읽기 중심 UX
- **Expert 사용자**: 운동탭에서 체육관/장비/루틴 템플릿까지 관리 (옵트인)

### 2.2 사용자 스토리
- 관리자로서, 매일 운동/식단을 기록하고 스트릭을 확인하고 싶다.
- 관리자로서, 친구들의 운동 현황을 보고 서로 응원하고 싶다.
- 관리자로서, AI에게 식단 추천과 목표 분석을 받고 싶다.
- Expert 사용자로서, 내 체육관 장비 목록과 루틴을 등록하고 AI가 이를 기반으로 추천하길 원한다.
- 사용자로서, 식사 사진을 찍으면 AI가 음식과 칼로리를 자동 추정해줬으면 한다.

## 3. 기능 요구사항

### 3.1 핵심 기능 (완료)

| 기능 | 설명 | 상태 |
|------|------|------|
| **운동 트래킹** | 근육 부위별 종목, 세트/무게/횟수 기록, 런닝/CF/스트레칭/수영 | 완료 |
| **식단 트래킹** | 3끼+간식 칼로리/매크로 추적, 음식 DB 검색 (FatSecret + 식품안전처) | 완료 |
| **운동 타이머** | 운동 총 시간 + 세트 간 휴식 타이머 (프리셋 시트) | 완료 |
| **토마토 농장** | 게임화 — 스트릭 기반 토마토 성장, 레벨, 수확 | 완료 |
| **소셜 피드** | 친구 프로필, 활동 피드, 방명록, 선물, 푸시 알림 | 완료 |
| **길드 시스템** | 길드 가입/리더보드/주간 랭킹 | 완료 |
| **목표/퀘스트** | 목표 설정, AI 실현 가능성 분석, 일일 퀘스트 | 완료 |
| **요리 기록** | 요리 레시피, 사진, 메모 | 완료 |
| **AI 식단 분석** | Gemini 음식 이미지 인식 + Bayesian prior + 한국어 정규화 | 완료 |
| **AI 운동 추천** | Claude 기반 식단/운동 추천, 주간 인사이트(Scene 13) | 완료 |
| **Expert Mode** | 8-scene 위자드, 체육관/장비/루틴 등록, RPE/근육 선호도 | 완료 |
| **홈 카드 개인화** | 카드 순서/숨김 커스터마이즈 | 완료 |
| **통합 알림 센터** | 친구 요청, 길드, 댓글, 응원 한 곳에서 확인 | 완료 |
| **분석 집계** | `_analytics/{dateKey}` 이벤트 일별 집계 | 완료 |
| **API 키 로컬 저장** | Anthropic/AlphaVantage 키 localStorage 이동 (하드코딩 제거) | 완료 |
| ~~스트릭 캘린더~~ | 경량화로 UI 삭제 (데이터 보존) | 삭제 |
| ~~재무 대시보드~~ | 경량화로 UI 삭제 (데이터 보존) | 삭제 |
| ~~와인 기록~~ | 경량화로 UI 삭제 (데이터 보존) | 삭제 |
| ~~영화 기록~~ | 경량화로 UI 삭제 (데이터 보존) | 삭제 |
| ~~Google Calendar~~ | 경량화로 UI 삭제 | 삭제 |

### 3.2 향후 기능 (계획)

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| 테스트 확충 | calc.js 전체 순수 함수 커버리지 (현재 expert 테스트 1개만) | P1 |
| Vitest 도입 검토 | `node:test`에서 Vitest로 마이그레이션(또는 유지 결정) | P2 |
| AI Food Profile Phase 2 | 현재 메모리 전용인 prior를 Firestore 영속화 | P2 |
| 코드 분할 | `app.js`/`data.js`/`style.css` 대형 파일 리팩토링 | P2 |
| Gemini/식품DB 키 보안 | `config.js` 하드코딩 키를 localStorage/서버 프록시로 이동 | P2 |

## 4. 비기능 요구사항

### 4.1 성능
- 초기 로드: 코어 탭(home, workout, diet) 즉시 로드, 나머지(stats, cooking, admin) 레이지 로드
- 오프라인: Service Worker + IndexedDB 캐싱으로 오프라인 사용 가능
- SW 캐시 버전: 자산 변경 시 `CACHE_VERSION` 범프 필수

### 4.2 보안
- API 키:
  - Anthropic/AlphaVantage — localStorage (완료)
  - Gemini/식품안전처 — `config.js` 하드코딩 (P2 개선 대상)
  - Firebase config — 퍼블릭 안전, App Check(reCAPTCHA)로 보호
- 계정: Firebase 커스텀 계정 (비밀번호 해시 지원)
- 역할: Admin / Admin Guest / 일반 사용자 구분

### 4.3 호환성
- 웹: 모던 브라우저 (ES6 modules 지원)
- 모바일: Android (Capacitor 8.x)
- 다크모드: 기본 적용 (TDS Mobile)

### 4.4 디자인 원칙
- **TDS Mobile (Toss Design System Mobile)** 적용 — https://tossmini-docs.toss.im/tds-mobile/
- 컬러 스케일만 커스텀: 토마토 레드 `#fa342c` Primary, `#fdf0f0` BG, `#fed4d2` Light, `#fc6a66` Sub, `#ca1d13` Dark, `#921708` Deepest
- 타이포, 컴포넌트, 스페이싱, 라디어스, 섀도, 모션은 TDS Mobile 공식 스펙 준수
- Typography: t1(30px)→t7(13px), Font: Toss Product Sans + Tossface
- Transition: 0.1s ease-in-out (표준)
- 모바일 우선 반응형 레이아웃
- **사용자 액션 피드백**: CRUD 완료 시 `showToast(msg, duration, type)` 필수. `alert()` 금지

## 5. 제약 사항

- **빌드 스텝 없음**: Vanilla JS, CDN import, 번들러 미사용
- **1인 개발**: 코드 리뷰 없음, 문서 기반 자기 검증 (에이전트 활용)
- **Firebase 무료 티어**: Firestore 읽기/쓰기 한도 고려
- **배포**: `tomatofarm` 리모트에만 push, AI 에이전트 배포 금지 (유저가 직접 push)
- **setDoc 전체 덮어쓰기**: 사진 필드 5종 포함 모든 필드 보존 필수
