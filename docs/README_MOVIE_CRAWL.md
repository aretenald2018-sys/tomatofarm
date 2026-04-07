# 🎬 영화 캘린더 자동 크롤링 시스템

## 완성! ✨

당신이 요청한 모든 기능이 완성되었습니다. 이제 버튼 하나 클릭으로 muko.kr에서 최신 영화 데이터를 자동으로 크롤링할 수 있습니다!

## 📦 구현된 기능

### ✅ 자동 크롤링
- 클릭 버튼 → Puppeteer 스크린샷 → Claude Vision 분석 → Firebase 저장 → 자동 표시

### ✅ 진행률 표시
- "🔄 크롤링 중 (0%)" → "🔄 크롤링 중 (50%)" → "🔄 완료!"

### ✅ 실시간 데이터 갱신
- Firebase에 저장된 데이터가 즉시 캘린더에 반영

### ✅ 에러 처리
- 크롤링 실패 시 사용자에게 알림
- 자동 재시도 불가능한 경우 명확한 에러 메시지

## 🚀 시작하기

### 1단계: 환경 설정 (한 번만)

```bash
# ANTHROPIC_API_KEY를 반드시 설정해야 합니다
export ANTHROPIC_API_KEY="sk-ant-...your-api-key..."

# Windows인 경우:
set ANTHROPIC_API_KEY=sk-ant-...your-api-key...
```

### 2단계: 서버 시작

**터미널 A에서:**
```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
npm start
# 웹 서버가 http://localhost:5500 에서 시작됨
```

**터미널 B에서:**
```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
npm run server
# API 서버가 http://localhost:3000 에서 시작됨
```

### 3단계: 대시보드 사용

1. 브라우저에서 http://localhost:5500 접속
2. 상단 탭에서 "영화" 클릭
3. "🔄 새로고침" 버튼 클릭
4. 진행률 표시 확인
5. 완료 후 캘린더 자동 업데이트

## 🏗️ 기술 구조

```
┌─────────────────────────────────────────┐
│           UI (render-movie.js)          │
│        🔄 새로고침 버튼                 │
└──────────────┬──────────────────────────┘
               │ onclick="startMovieCrawl()"
               ▼
┌─────────────────────────────────────────┐
│      Frontend (index.html, style.css)   │
│   POST http://localhost:3000/...        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│    API Server (api-server.js)           │
│  POST /api/crawl-movies (비동기)        │
│  GET /api/status (폴링)                 │
└──────────────┬──────────────────────────┘
               │
        ┌──────┼──────┬──────────┐
        ▼      ▼      ▼          ▼
    Puppeteer Claude Firebase   Firebase
    (screenshot) (Vision) (REST API) (data)
```

## 📚 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server.js` | Express API 서버 (Puppeteer, Claude Vision, Firebase) |
| `render-movie.js` | 영화 탭 UI 및 상태 폴링 |
| `data.js` | Firebase 데이터 로드/저장 |
| `package.json` | 의존성 및 npm 스크립트 |
| `.claude/launch.json` | 서버 실행 설정 |

## 🔍 API 엔드포인트

### GET /api/health
```bash
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

### GET /api/status
```bash
curl http://localhost:3000/api/status
# → {
#     "status": "idle|crawling|success|error",
#     "message": "상태 메시지",
#     "progress": 0-100
#   }
```

### POST /api/crawl-movies
```bash
curl -X POST http://localhost:3000/api/crawl-movies \
  -H "Content-Type: application/json"
# → {"status":"started"}
```

## 🧪 테스트

### 시스템 검증
```bash
node verify-setup.js
```
모든 항목이 ✅ 로 표시되면 준비 완료!

### API 테스트
```bash
npm run server & sleep 1 && node test-api.js
```

## 📖 문서

- **QUICKSTART.md** - 5분 안에 시작하는 가이드
- **MOVIE_CRAWL_SETUP.md** - 상세한 설정 및 문제 해결
- **IMPLEMENTATION_SUMMARY.md** - 기술적 구현 상세 정보
- **verify-setup.js** - 시스템 자동 검증

## 🎯 사용 시나리오

### 매주 영화 정보 갱신
1. 대시보드의 영화 탭으로 이동
2. "🔄 새로고침" 클릭
3. 30초 내에 최신 정보 자동 로드

### 특정 영화 검색
1. 캘린더에서 원하는 월 네비게이션
2. 영화 데이터가 있으면 표시
3. 각 영화의 태그로 종류 구분 (시사회, 개봉일 등)

### 영화 이벤트 추적
1. 표시된 영화 이벤트 확인
2. 색상으로 이벤트 종류 구분
3. 매달 새로고침 버튼으로 최신 데이터 유지

## 🔐 보안 고려사항

1. **API 키 보호**
   - ANTHROPIC_API_KEY는 환경변수로만 사용
   - 소스 코드에 노출하지 않기

2. **Firebase 보안**
   - API 키는 공개 저장소에 커밋하지 않기
   - `.env` 파일로 분리할 것을 권장

3. **CORS 설정**
   - localhost에서만 접근 가능하도록 제한됨

## 💾 데이터 저장 형식

Firestore의 'movies' 컬렉션:

```
movies/
  ├── 2026-03/
  │   ├── year: 2026
  │   ├── month: 3
  │   ├── events: [
  │   │   {
  │   │     date: 1,
  │   │     title: "영화 제목",
  │   │     tags: ["premiere", "release"]
  │   │   }
  │   │ ]
  │   ├── lastUpdated: "2026-03-29T12:34:56Z"
  │   └── source: "muko.kr/calender (auto)"
  │
  └── 2026-04/
      └── ...
```

## 🚨 문제 해결

### "ANTHROPIC_API_KEY" 오류
```bash
# 환경변수 확인
echo $ANTHROPIC_API_KEY

# 설정 안 되어 있으면:
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "API 서버 연결 실패"
```bash
# 포트 3000 사용 중 확인
netstat -ano | findstr :3000

# 서버가 실행 중인지 확인
npm run server
```

### "크롤링이 진행되지 않음"
1. 개발자 도구 (F12) 콘솔 확인
2. API 서버 터미널의 에러 확인
3. muko.kr이 접근 가능한지 확인
4. 인터넷 연결 확인

## 📈 성능

- **첫 크롤링**: 30-60초 (Chromium 초기 다운로드 포함)
- **이후 크롤링**: 10-30초
- **폴링 주기**: 1초
- **캐싱**: Firebase에 캐시되어 재접속 시 즉시 로드

## 🎓 학습 포인트

이 프로젝트를 통해 배울 수 있는 것:
- Express.js REST API 설계
- Puppeteer를 이용한 웹 자동화
- Claude Vision API를 이용한 이미지 분석
- Firebase Firestore 연동
- 비동기 작업 관리 (상태 폴링)
- CORS 및 크로스 도메인 통신
- 프론트엔드-백엔드 데이터 흐름

## 🎉 축하합니다!

모든 설정이 완료되었습니다. 이제:

1. 터미널 두 개를 열고 서버를 시작하세요
2. http://localhost:5500 에서 대시보드를 열어보세요
3. 영화 탭에서 "🔄 새로고침" 버튼을 클릭하세요
4. 자동 크롤링이 시작되는 것을 지켜보세요!

**재미있는 기능 여행을 시작하세요! 🎬✨**
