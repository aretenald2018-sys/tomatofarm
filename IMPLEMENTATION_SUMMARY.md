# 영화 캘린더 자동 크롤링 - 구현 완료

## ✅ 완료된 작업

### 1. 백엔드 API 서버 (`api-server.js`)
- ✅ Express.js 기반 REST API 서버
- ✅ Puppeteer를 이용한 muko.kr 스크린샷 캡처
- ✅ Claude Vision API를 이용한 이미지 분석
- ✅ Firestore REST API를 이용한 데이터 저장
- ✅ 크롤링 상태 추적 및 폴링 지원
- ✅ CORS 헤더 설정 (프론트엔드 호출 지원)

### 2. 프론트엔드 통합 (`render-movie.js`)
- ✅ `startMovieCrawl()` 함수 구현
- ✅ `_checkCrawlStatus()` 폴링 함수
- ✅ 진행률 표시 (0% → 100%)
- ✅ 완료 시 자동 렌더링
- ✅ 에러 핸들링 및 사용자 알림

### 3. UI 요소 (`index.html`, `style.css`)
- ✅ "🔄 새로고침" 버튼 추가
- ✅ 호버 및 비활성화 상태 스타일링
- ✅ onclick 핸들러 연결

### 4. 데이터 레이어 (`data.js`)
- ✅ Firebase에서 영화 데이터 로드
- ✅ `getMovieData()` 함수
- ✅ `saveMovieData()` 함수
- ✅ 영화 데이터 캐싱

### 5. 프로젝트 설정
- ✅ `package.json` 업데이트 (dependencies + scripts)
- ✅ `.claude/launch.json` 추가 (api-server 설정)
- ✅ `test-api.js` 테스트 파일
- ✅ 설정 가이드 문서

## 📁 수정된 파일 목록

| 파일 | 변경 사항 |
|------|---------|
| `api-server.js` | 생성 (완전한 백엔드 서버) |
| `render-movie.js` | startMovieCrawl(), window.startMovieCrawl 노출 |
| `index.html` | 새로고침 버튼 추가 |
| `style.css` | 버튼 스타일 추가 |
| `package.json` | dependencies, scripts 업데이트 |
| `.claude/launch.json` | api-server 설정 추가 |
| `test-api.js` | 생성 (API 테스트) |
| `MOVIE_CRAWL_SETUP.md` | 생성 (설정 가이드) |
| `IMPLEMENTATION_SUMMARY.md` | 생성 (이 파일) |

## 🔄 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                      사용자 인터페이스                       │
│  버튼: 🔄 새로고침 (movie-refresh-btn)                     │
└────────────────────┬────────────────────────────────────────┘
                     │ onclick="startMovieCrawl()"
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               프론트엔드 (render-movie.js)                   │
│  startMovieCrawl()                                          │
│    ↓ POST /api/crawl-movies                               │
│    ↓ 버튼 비활성화 & 텍스트 변경                           │
│    ↓ setTimeout(_checkCrawlStatus, 1000)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  API 서버 (api-server.js)                   │
│  POST /api/crawl-movies (비동기)                            │
│    1. Puppeteer로 muko.kr/calender 방문                   │
│    2. 스크린샷 캡처 (.temp-screenshot.png)                 │
│    3. Claude Vision API에 전송                             │
│    4. 응답에서 JSON 추출                                   │
│    5. Firestore REST API로 저장                            │
│    6. status 업데이트 (idle → crawling → success/error)   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Puppeteer    Claude Vision   Firestore
  (muko.kr)     (Image Analysis) (Storage)
```

## 🏗️ 아키텍처 설명

### 마이크로서비스 패턴
- **프론트엔드**: 버튼 클릭 → API 호출 → 상태 폴링
- **백엔드**: 비동기 작업 수행 → 상태 추적 → 결과 반환
- **데이터베이스**: Firestore (실시간 동기화)

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|------|------|------|
| GET | `/api/health` | 서버 상태 확인 |
| GET | `/api/status` | 크롤링 상태 조회 |
| POST | `/api/crawl-movies` | 크롤링 시작 (비동기) |

### 상태 추적

```
idle
  ↓
crawling (progress: 0-100)
  ├→ success (progress: 100)
  └→ error (progress: 0)
```

## 🔧 기술 스택

| 계층 | 기술 |
|------|------|
| 프론트엔드 | Vanilla JS (ES6 modules) |
| 백엔드 | Node.js + Express |
| 자동화 | Puppeteer |
| AI | Claude Vision API (@anthropic-ai/sdk) |
| 데이터베이스 | Firebase Firestore |
| 인증 | API Key (클라이언트), REST API (서버) |

## 📦 의존성

```json
{
  "@anthropic-ai/sdk": "^0.24.3",
  "express": "^4.21.0",
  "firebase": "^12.11.0",
  "puppeteer": "^24.40.0"
}
```

## 🚀 시작 명령어

```bash
# 1. 환경변수 설정 (필수!)
export ANTHROPIC_API_KEY="your-key-here"

# 2. 서버 시작
npm run server

# 3. 다른 터미널에서 웹 서버 시작
npm start

# 4. 테스트
npm run server & sleep 2 && node test-api.js
```

## ⚙️ 설정 파일

### `.claude/launch.json`
```json
{
  "name": "api-server",
  "runtimeExecutable": "node",
  "runtimeArgs": ["api-server.js"],
  "port": 3000
}
```

### `package.json` (scripts)
```json
{
  "start": "python -m http.server 5500",
  "server": "node api-server.js",
  "crawl": "node crawl-movies-advanced.js"
}
```

## 🎯 사용 흐름

1. **대시보드 접속**: http://localhost:5500
2. **영화 탭 클릭**: 상단 탭 메뉴에서 "영화" 선택
3. **새로고침 클릭**: "🔄 새로고침" 버튼 클릭
4. **자동 진행**: 서버가 자동으로 다음을 수행
   - muko.kr에 접속하여 스크린샷 캡처
   - Claude Vision AI가 이미지 분석
   - 영화 이벤트 데이터 추출
   - Firebase에 저장
5. **자동 업데이트**: 완료되면 캘린더가 새 데이터로 업데이트

## 🔍 모니터링

### 서버 콘솔 로그
```
[server] 스크린샷 저장: /path/to/.temp-screenshot.png
[server] Firebase 저장 완료: 2026-03 (15개 이벤트)
```

### 브라우저 콘솔
```javascript
// 현재 상태 확인
fetch('http://localhost:3000/api/status').then(r => r.json()).then(console.log)

// 크롤링 시작
fetch('http://localhost:3000/api/crawl-movies', {method: 'POST'})
```

## ⚠️ 주의사항

1. **ANTHROPIC_API_KEY 필수**: Claude Vision API 호출에 필수
2. **포트 충돌**: 3000, 5500 포트가 미사용인지 확인
3. **인터넷 연결**: muko.kr 접근 필요
4. **API 키 보안**: config.js의 Firebase 키는 공개 저장소에 커밋하지 않기

## 🎓 학습 포인트

이 구현은 다음을 학습할 수 있는 좋은 예제입니다:
- REST API 설계 (상태 추적, 비동기 작업)
- 브라우저-서버 통신 (fetch, CORS)
- 자동화 (Puppeteer, 스크린샷)
- 이미지 AI 분석 (Claude Vision)
- 데이터베이스 통합 (Firestore)
- 상태 관리 (폴링)
- 에러 핸들링

## 📝 다음 개선사항 (선택사항)

- [ ] 실패 시 자동 재시도
- [ ] 일정 기간마다 자동 크롤링 스케줄
- [ ] 데이터 변경 감지 시 실시간 알림
- [ ] 크롤링 히스토리 기록
- [ ] 사용자별 알림 설정
- [ ] 메일 알림
- [ ] 대시보드 위젯화 (다른 탭과 함께 표시)

## ✨ 구현 완료!

모든 필수 기능이 구현되었습니다. 위의 "시작 명령어"를 따라 시스템을 테스트하면 됩니다.
