# 영화 탭 구현 완료 가이드

## ✅ 완료된 항목

### 1. 메인 대시보드 통합 ✓
- **파일 수정:**
  - `data.js`: `_movies` 캐시 변수, `getMovieData()`, `saveMovieData()` 함수 추가
  - `app.js`: 영화 탭 import 및 switchTab() 로직 추가
  - `index.html`: 네비게이션 버튼 및 탭 패널 추가
  - `style.css`: 영화 탭 스타일 추가

- **신규 파일:**
  - `render-movie.js`: 월간 캘린더 렌더링 로직
  - `sample-movie-data.js`: 샘플 데이터 (테스트용)

### 2. 분리 배포 앱 ✓
- **파일:** `app-movie.html`
  - 독립적인 HTML 파일 (JS 포함)
  - 토큰 기반 인증
  - 모바일 최적화

### 3. 자동화 & 크롤링 ✓
- **파일:**
  - `crawl-movies.js`: Node.js 크롤링 스크립트
  - `.github/workflows/crawl-movies.yml`: GitHub Actions 워크플로우
  - `FIRESTORE_RULES_FOR_MOVIES.md`: 보안 설정 가이드

---

## 🚀 사용 방법

### A. 메인 대시보드에서 영화 탭 사용

**1단계: 샘플 데이터 추가**
```javascript
// data.js의 loadAll() 함수에서, 다음을 추가 (임시):
import { SAMPLE_MOVIE_DATA } from './sample-movie-data.js';

// loadAll() 내에서 영화 로드 후:
if (Object.keys(_movies).length === 0) {
  for (const [key, data] of Object.entries(SAMPLE_MOVIE_DATA)) {
    await saveMovieData(data.year, data.month, data);
  }
}
```

**2단계: 브라우저에서 테스트**
- 대시보드 열기
- 🎬 영화 탭 클릭
- 월간 캘린더와 영화 목록 확인

**3단계: 실제 크롤링 데이터 추가**
```bash
# 로컬에서 테스트
node crawl-movies.js

# 또는 GitHub Actions 자동화 설정
# → .github/workflows/crawl-movies.yml 참고
```

---

### B. 분리 배포 (GitHub Pages)

**1단계: 새 레포 생성**
```bash
git clone https://github.com/YOUR_USERNAME/movie-calendar.git
cd movie-calendar
```

**2단계: 파일 복사**
```bash
cp app-movie.html index.html
# 필요시 CSS/JS 분리
```

**3단계: 배포**
```bash
git add .
git commit -m "feat: initial movie calendar app"
git push -u origin main

# GitHub: Settings → Pages → Deploy from branch
# 또는 GitHub Actions 사용
```

**4단계: 접근 토큰 발급**
```
https://github.com/USERNAME/movie-calendar?token=token_user1_demo
```

---

## 📊 데이터 구조

### Firebase: /movies 컬렉션
```javascript
{
  "2026-03": {
    year: 2026,
    month: 3,
    events: [
      {
        date: 1,
        title: "영화 제목",
        tags: ["premiere", "gv", "screening", "release", "rerelease", "vip", "festival"]
      }
    ],
    lastUpdated: "2026-03-29T...",
    source: "muko.kr/calender"
  }
}
```

### 태그 매핑
| 태그 | ID | 색상 |
|------|-----|------|
| 시사회 | `premiere` | 보라색 |
| GV | `gv` | 핑크색 |
| 상영회 | `screening` | 하늘색 |
| 개봉일 | `release` | 주황색 |
| 재개봉 | `rerelease` | 파란색 |
| 우대인사 | `vip` | 초록색 |
| 영화제 | `festival` | 황색 |

---

## 🔧 커스터마이징

### 1. 크롤링 선택자 조정
`crawl-movies.js`에서:
```javascript
// muko.kr의 실제 DOM 구조에 맞게 수정
const movieCells = $('.your-selector, .actual-class');
```

### 2. 토큰 관리 (분리 배포)
`app-movie.html`에서:
```javascript
const VALID_TOKENS = [
  'token_user1_your_secret',
  'token_user2_your_secret',
  // ...
];
```

### 3. Firestore Rules 강화
`FIRESTORE_RULES_FOR_MOVIES.md` 참고하여 Firebase Console에서 설정

---

## 🔒 보안 고려사항

### 메인 대시보드
- ✅ 기존 Firebase 인증 유지
- ✅ /movies 컬렉션 자동 보호 (인증사용자만)

### 분리 배포 앱
- ✅ URL 토큰 기반 (임시 접근)
- ✅ sessionStorage 사용 (새로고침 후 재입력)
- ❌ 로컬스토리지 사용 금지 (탈취 위험)

### 크롤링 자동화
- ⚠️ Service Account 설정 필요 (보안 추가)
- ⚠️ GitHub Secrets에서 API 키 관리

---

## 📝 다음 단계 (선택사항)

### Phase 2: 고급 기능
1. **실시간 동기화** - Firestore listeners
2. **사용자별 즐겨찾기** - 별도 /user_favorites 컬렉션
3. **알림** - Cloud Messaging
4. **영화 검색** - Elasticsearch 또는 Algolia

### Phase 3: 분리 배포 고도화
1. **API 게이트웨이** - Firebase Functions로 프록시
2. **인증 고도화** - OAuth2 또는 JWT
3. **캐시** - Service Worker
4. **도메인** - custom domain 설정

### Phase 4: 크롤링 최적화
1. **정확도 향상** - Selenium/Puppeteer로 업그레이드
2. **에러 처리** - Slack 알림
3. **데이터 검증** - 중복 제거, 형식 확인
4. **성능** - 스케줄 최적화, 병렬 처리

---

## 🐛 트러블슈팅

### 영화 탭이 안 보임
```javascript
// 확인: app.js의 renderMovie import 있는지
// 확인: index.html의 탭 버튼 있는지
// 확인: DEFAULT_TAB_ORDER에 'movie' 있는지
```

### 데이터가 안 로드됨
```javascript
// 1. Firebase 콘솔에서 /movies 컬렉션 생성 확인
// 2. sample-movie-data.js 실행해서 샘플 추가
// 3. render-movie.js의 getMovieData() 호출 확인
```

### 크롤링이 실패함
```javascript
// 1. muko.kr 구조 변경 확인 (콘솔에서 F12)
// 2. crawl-movies.js의 선택자 조정
// 3. Node.js 버전 18+ 확인
```

---

## 📚 참고 파일

| 파일 | 용도 |
|------|------|
| `render-movie.js` | 메인 앱 영화 렌더링 |
| `app-movie.html` | 분리 배포용 독립 앱 |
| `crawl-movies.js` | 웹 크롤링 스크립트 |
| `sample-movie-data.js` | 테스트용 샘플 데이터 |
| `.github/workflows/crawl-movies.yml` | 자동화 워크플로우 |
| `FIRESTORE_RULES_FOR_MOVIES.md` | 보안 설정 |
| `MOVIE_TAB_TECHNICAL_REVIEW.md` | 아키텍처 설계 |

---

## ✨ 완성!

메인 대시보드와 분리 배포 앱 모두 기술적으로 실행 가능한 상태입니다.

**다음 진행 순서:**
1. ✅ 메인 탭에서 기본 기능 테스트
2. → 샘플 데이터로 UI/UX 검증
3. → 실제 크롤링 데이터 추가
4. → GitHub Pages 배포 (필요시)
5. → 토큰 기반 사용자 관리 (필요시)

질문이나 추가 요청이 있으시면 언제든 말씀해주세요! 🎬
