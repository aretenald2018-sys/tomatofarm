# 영화 탭 기술적 검토

## 1. 프로젝트 개요

### 요구사항
- 무코(muko.kr/calender) 사이트의 영화 달력 데이터를 크롤링
- 월간 캘린더 형식으로 대시보드에 구현
- 영화 탭만 **분리된 URL/GitHub Pages**로 배포 가능
- 제한된 사용자(주 5명 내외)만 접근 가능
- 다른 탭의 데이터에는 접근 불가능

---

## 2. 현재 대시보드 아키텍처 분석

### 2.1 핵심 기술 스택
```
Frontend: 순수 JavaScript (ES6 모듈)
Backend: Firebase Firestore (실시간 DB)
인증: 미확인 (추가 확인 필요)
배포: 정적 사이트 (HTTP 서버)
```

### 2.2 데이터 구조
- **Firebase Collections**:
  - `goals`, `quests`, `events`, `cooking`, `bodyCheckins`, `nutritionDB`, `settings`
  - 모든 데이터가 Firebase에 저장되는 구조

- **현재 탭들**:
  - home, workout, cooking, monthly (월간 캘린더), calendar, wine, stats, loa
  - `render-{tab}.js` 패턴으로 구성

### 2.3 탭 전환 시스템
```javascript
// app.js의 switchTab() 함수
- DOM 기반 탭 전환
- 탭별 데이터는 Firebase에서 동적 로드
- 탭 순서는 `tab_order` 설정으로 관리
```

---

## 3. 크롤링 가능성 분석

### 3.1 Target Site 분석: muko.kr/calender

**특징:**
- 월간 캘린더 UI (2026년 3월 기준 스크린샷 확인)
- 왼쪽 네비게이션: 카테고리 선택 (영화, OTT, 굿즈 등)
- 색상 태그 분류 (시사회, GV, 상영회, 개봉일, 재개봉, 우대인사, 영화제)
- 각 날짜별로 여러 영화 정보가 텍스트 형태로 표시

**크롤링 방식:**

| 방식 | 장점 | 단점 | 추천도 |
|------|------|------|--------|
| **Selenium/Puppeteer** | 동적 렌더링 처리 가능 | 느림, 서버 부하 높음 | ⭐⭐ |
| **정규 HTTP + HTML 파싱** | 빠름, 간단함 | JS 렌더링 필요시 실패 | ⭐⭐⭐ (우선) |
| **API 역분석** | 가장 효율적 | 사이트 정책 확인 필요 | ⭐⭐⭐⭐ (가능시) |

**권장 접근:**
1. 먼저 Network 탭에서 실제 API 호출 확인
2. 없으면 정규 HTTP + jsdom/cheerio로 파싱
3. 필요시 Puppeteer로 upgrade

### 3.2 법적/윤리적 고려사항
- ✅ 데이터 크롤링은 일반적으로 허용 (공개 정보)
- ⚠️ 사이트의 `robots.txt` 및 ToS 확인 필요
- ⚠️ 크롤링 빈도 제한 필요 (서버 부하 고려)
- ⚠️ 크롤링한 데이터의 2차 배포 시 출처 명시 필요

---

## 4. 솔루션 아키텍처 제안

### 4.1 **옵션 A: 메인 대시보드에 통합 + 분리 배포**

```
메인 대시보드 (현재)
├── Firebase (기존 모든 탭의 데이터)
├── 기존 탭들
└── [새로운] 영화 탭 (읽기 전용)

분리 배포 (GitHub Pages)
├── 독립적 Static Site
├── 크롤링 데이터만 저장 (별도 스토리지)
├── 간단한 인증 (Password/Token)
└── URL: github.com/user/movie-calendar
```

**장점:**
- 메인 대시보드와 독립적
- 다른 데이터 접근 불가능 (자동 격리)
- GitHub Pages로 쉽게 배포

**단점:**
- 코드 중복 가능 (UI 렌더링 로직)
- 데이터 동기화 복잡

---

### 4.2 **옵션 B: Shared Module + Conditional Firebase Access**

```
공통 렌더링 라이브러리 (shared/)
├── render-movie-calendar.js
├── utils.js
└── 기타 공통 로직

메인 대시보드
├── app.js (모든 탭 접근)
├── Firebase: 전체 컬렉션

영화 탭 전용 앱 (movie-app.js)
├── 동일한 render-movie-calendar.js 사용
├── Firebase: 영화 데이터만 접근 가능
└── 간단한 인증 레이어
```

**구현:**
```javascript
// config.js에 앱 모드 추가
export const CONFIG = {
  FIREBASE: {...},
  APP_MODE: 'main' | 'movie-only', // 배포 시 결정
  ALLOWED_COLLECTIONS: {
    'main': ['goals', 'quests', 'events', 'cooking', 'movies'],
    'movie-only': ['movies']  // 영화만
  }
};
```

**장점:**
- 코드 재사용
- 메인테넌스 용이
- 명확한 권한 격리

**추천도: ⭐⭐⭐⭐⭐**

---

### 4.3 **옵션 C: API Gateway + Proxy**

Firebase의 Firestore Rules로 명시적으로 접근 제어:

```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 메인 앱: 모든 데이터 접근
    match /{document=**} {
      allow read, write: if request.auth.uid == 'main-app-user';
    }

    // 영화 전용 앱: 영화 데이터만
    match /movies/{document=**} {
      allow read: if request.auth.token.app_mode == 'movie-only';
    }
  }
}
```

**장점:**
- 가장 안전한 격리
- 세밀한 권한 제어

**단점:**
- Firebase Rules 복잡도 증가
- 별도 인증 토큰 관리 필요

---

## 5. 데이터 저장 방식

### 5.1 영화 데이터 구조

```javascript
// Firebase: /movies/{year}/{month}
{
  year: 2026,
  month: 3,
  data: [
    {
      date: 1,
      events: [
        {
          title: "2026 부산시네마 아차데",
          tags: ["시사회"],  // 색상 태그
          movieId: "xxx"
        }
      ]
    }
  ],
  lastUpdated: timestamp,
  source: "muko.kr/calender"
}
```

### 5.2 크롤링 및 갱신 전략

**옵션:**
1. **주기적 자동 크롤링** (매일 밤 11시)
   - 별도 스크립트 (Node.js) → Firebase 저장
   - Vercel Cron or GitHub Actions

2. **수동 크롤링** (UI 버튼)
   - 사용자가 "갱신" 버튼 클릭
   - 클라이언트 사이드에서 간단한 스크레이핑

3. **API 연계** (가능시)
   - muko.kr이 공개 API 제공하는지 확인
   - 가장 효율적

---

## 6. 인증 및 접근 제어

### 6.1 영화 탭 전용 인증

**방식 1: Firebase 자체 인증**
```javascript
// Firestore Rules에서 특정 UID 관리
const MOVIE_APP_USERS = [
  'user1@example.com',
  'user2@example.com',
  // ... 최대 5명
];
```

**방식 2: 간단한 Password**
```javascript
// 배포된 영화 앱에서
const MOVIE_PASSWORD = localStorage.getItem('movie-pwd');
if (!MOVIE_PASSWORD) {
  // 비밀번호 입력 페이지
}
```

**방식 3: Token 기반** (권장)
```javascript
// github.com/user/movie-calendar?token=xxx
// 토큰 검증 후 firebase auth token 발급
```

**추천: 방식 3 (Token) + Firebase Rules 이중 격리**

---

## 7. 배포 전략

### 7.1 메인 대시보드에 영화 탭 추가

```
현재 구조:
app.js
├── switchTab('home', 'workout', 'cooking', 'monthly', ...)

수정:
app.js
├── switchTab(..., 'movie')
├── render-movie.js (크롤린 데이터 렌더링)
└── data.js에 getMovieEvents() 추가
```

**Firebase Rules 수정:**
```javascript
// 메인 앱: /movies 컬렉션 추가 접근 권한
match /movies/{document=**} {
  allow read: if isMainApp();
}
```

### 7.2 분리된 GitHub Pages 배포

```
repository: dashboard3-movie
├── index.html
├── app-movie.js (축소된 버전)
├── render-movie-calendar.js
├── config.js (Firebase 같은 프로젝트 사용)
├── styles/
└── package.json
```

**배포:**
```bash
# GitHub Actions 설정
on: [push]
  - npm run build
  - gh-pages 자동 배포
  → github.com/user/movie-calendar
```

**접근 제어:**
```javascript
// app-movie.js
const VALID_TOKENS = [
  'token_user1',
  'token_user2',
  // ...
];

const token = new URLSearchParams(window.location.search).get('token');
if (!VALID_TOKENS.includes(token)) {
  document.body.innerHTML = '<p>접근 권한이 없습니다.</p>';
  throw new Error('Unauthorized');
}
```

---

## 8. 실제 구현 체크리스트

### Phase 1: 데이터 크롤링 (1-2주)
- [ ] muko.kr의 Network API 확인
- [ ] 크롤링 스크립트 작성 (cheerio 또는 Puppeteer)
- [ ] Firebase에 /movies 컬렉션 생성
- [ ] 샘플 데이터 1-2개월 저장

### Phase 2: 메인 탭 구현 (1-2주)
- [ ] render-movie.js 작성
- [ ] UI 디자인 (기존 월간 캘린더 참고)
- [ ] 데이터 동기화 테스트
- [ ] 메인 앱 배포

### Phase 3: 분리 배포 (1주)
- [ ] GitHub 새 레포 생성 (movie-calendar)
- [ ] 축소된 앱 코드 작성
- [ ] 토큰 기반 인증 구현
- [ ] GitHub Pages 배포
- [ ] 사용자별 토큰 발급

### Phase 4: QA 및 최적화 (1주)
- [ ] 5명 사용자로 UAT
- [ ] 성능 최적화
- [ ] 보안 감사 (Firestore Rules 재검토)
- [ ] 모니터링 설정

---

## 9. 보안 고려사항

### 9.1 Firebase Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 영화 데이터 (공개 읽기)
    match /movies/{document=**} {
      // 메인 앱: 모든 접근
      allow read: if isAuthenticatedAsMainApp();
      // 영화 앱: token 검증
      allow read: if hasValidMovieToken();
    }

    // 다른 데이터 (완전 격리)
    match /{collection}/{document=**} {
      allow read, write: if isAuthenticatedAsMainApp();
    }
  }

  function isAuthenticatedAsMainApp() {
    return request.auth.uid == 'main-app-uid'
        && request.auth.token.app_mode == 'main';
  }

  function hasValidMovieToken() {
    return request.auth.token.app_mode == 'movie-only'
        && request.auth.token.token in validTokens; // Cloud Function으로 검증
  }
}
```

### 9.2 클라이언트 보안

- ✅ 토큰은 URL에 포함 (GitHub Pages 배포에서)
- ❌ localStorage에 저장하지 말 것 (탈취 위험)
- ✅ HTTPS only (GitHub Pages 기본)
- ✅ 토큰 만료 시간 설정 (30일 등)

---

## 10. 기술 스택 확정안

| 구성 | 기술 | 상세 |
|------|------|------|
| **크롤링** | cheerio (간단) or Puppeteer (복잡) | Node.js 스크립트 |
| **크롤링 실행** | GitHub Actions Cron | 매일 자동 |
| **저장소** | Firebase Firestore | 기존 프로젝트 사용 |
| **메인 탭** | 순수 JS (기존 패턴) | render-movie.js |
| **분리 배포** | GitHub Pages | 정적 사이트 |
| **인증** | Firebase Auth + Custom Token | 토큰 기반 |
| **접근 제어** | Firestore Rules + 클라이언트 검증 | 이중 격리 |

---

## 11. 예상 일정 및 복잡도

```
총 예상 기간: 4-5주

Week 1: 데이터 크롤링 ([어려움] 파싱 로직 불명확)
Week 2: 메인 탭 구현 ([쉬움] 기존 패턴 적용)
Week 3: 분리 배포 ([쉬움] 정적 사이트)
Week 4-5: QA & 모니터링 ([보통] 토큰 관리 등)

핵심 리스크:
- muko.kr 구조 변경 → 크롤링 실패
- Firebase Rules 오류 → 보안 침해
```

---

## 12. 최종 결론

### ✅ 기술적으로 실행 가능
- 크롤링: cheerio로 충분할 것으로 예상
- 메인 탭 추가: 기존 패턴으로 간단히 구현 가능
- 분리 배포: GitHub Pages로 자동화 가능
- 보안: Firestore Rules + 토큰으로 완전히 격리 가능

### 🎯 권장 진행안
1. **옵션 B + 옵션 3 토큰 인증** 선택
2. 메인 대시보드에 영화 탭 먼저 구현
3. 검증 후 GitHub Pages 분리 배포
4. Firestore Rules로 이중 격리

### ⚠️ 주의사항
- 크롤링 법적 검토 (muko.kr ToS 확인)
- 데이터 출처 명시
- 토큰 만료/갱신 정책 수립
- 월 1-2회 크롤링 빈도 제한 권장

