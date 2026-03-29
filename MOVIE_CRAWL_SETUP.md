# 영화 캘린더 자동 크롤링 설정 가이드

## 🎬 시스템 개요

클릭 한 번으로 `muko.kr/calender`에서 최신 영화 데이터를 자동으로 크롤링하고 Firebase에 저장하는 시스템입니다.

### 아키텍처

```
사용자 클릭 (🔄 새로고침 버튼)
    ↓
startMovieCrawl() [render-movie.js]
    ↓
POST /api/crawl-movies [api-server.js]
    ↓
Puppeteer 스크린샷 캡처
    ↓
Claude Vision API 이미지 분석
    ↓
JSON 구조화 (날짜, 제목, 태그)
    ↓
Firestore REST API 저장
    ↓
프론트엔드 폴링 (GET /api/status)
    ↓
renderMovie() 호출 → 캘린더 업데이트
```

## 📋 사전 요구사항

### 1. 환경 변수 설정
```bash
# ANTHROPIC_API_KEY를 반드시 설정해야 합니다
export ANTHROPIC_API_KEY="your-api-key-here"

# Windows의 경우:
set ANTHROPIC_API_KEY=your-api-key-here
```

### 2. Node.js 의존성
모든 필요한 패키지가 설치되어 있는지 확인:
```bash
npm install
```

필수 패키지:
- `@anthropic-ai/sdk`: Claude Vision API 호출
- `puppeteer`: 스크린샷 캡처
- `express`: API 서버 프레임워크
- `firebase`: 클라이언트 SDK (이미 설치됨)

## 🚀 실행 방법

### 1. 터미널 1: 대시보드 웹 서버 (포트 5500)
```bash
npm start
# 또는
npm run dev
```

### 2. 터미널 2: API 서버 (포트 3000)
```bash
npm run server
```

또는 두 개를 동시에 실행하려면:
```bash
# 터미널 1
npm start &

# 터미널 2
npm run server
```

## 🧪 테스트

### 기본 API 테스트
```bash
npm run server &
sleep 2
node test-api.js
```

결과:
```
✅ 헬스체크 성공
✅ 상태 조회 성공
✅ 구조 검증 완료
✅ 폴링 흐름 검증 완료
```

## 📱 사용 방법

### 1. 대시보드 열기
브라우저에서 `http://localhost:5500` 접속

### 2. 영화 탭으로 이동
상단 네비게이션에서 "영화" 탭 클릭

### 3. 새로고침 버튼 클릭
"🔄 새로고침" 버튼을 클릭하면:
- 버튼이 "🔄 크롤링 중 (0%)"로 변경
- muko.kr에 접속하여 스크린샷 캡처
- Claude Vision API가 이미지 분석
- 데이터가 Firebase에 저장
- 캘린더가 자동으로 업데이트

### 4. 진행 상황 확인
- 버튼 텍스트에 진행률 표시 (0% → 100%)
- 완료되면 "🔄 새로고침"으로 복원

## 🔍 API 엔드포인트

### GET /api/health
헬스체크 (서버 구동 확인)

```bash
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

### GET /api/status
크롤링 상태 조회

```bash
curl http://localhost:3000/api/status
# → {
#     "status": "idle|crawling|success|error",
#     "message": "상태 메시지",
#     "progress": 0-100
#   }
```

### POST /api/crawl-movies
크롤링 시작 (비동기)

```bash
curl -X POST http://localhost:3000/api/crawl-movies \
  -H "Content-Type: application/json"
# → {"status":"started"}
```

## 🐛 문제 해결

### "API 서버가 실행 중이어야 합니다" 에러
- 터미널에서 `npm run server` 실행 확인
- 포트 3000이 이미 사용 중인지 확인: `netstat -ano | findstr :3000`

### "ANTHROPIC_API_KEY" 오류
```bash
# 환경변수가 제대로 설정되었는지 확인
echo $ANTHROPIC_API_KEY

# 설정되지 않았으면:
export ANTHROPIC_API_KEY="your-key"
npm run server
```

### "Chromium이 설치되지 않음" 오류
Puppeteer가 자동으로 다운로드하지만, 수동으로 설치할 수도 있습니다:
```bash
npx puppeteer browsers install chrome
```

### Firebase 저장 실패
- Firebase 프로젝트 ID 확인 (현재: `exercise-management`)
- Firestore 'movies' 컬렉션 접근 권한 확인
- API 키 (`config.js`에 있음) 유효성 확인

## 📊 데이터 형식

### Firestore에 저장되는 구조

```json
{
  "2026-03": {
    "year": 2026,
    "month": 3,
    "events": [
      {
        "date": 1,
        "title": "영화 제목",
        "tags": ["premiere", "release"]
      }
    ],
    "lastUpdated": "2026-03-29T12:34:56.000Z",
    "source": "muko.kr/calender (auto)"
  }
}
```

### 지원하는 태그
- `premiere`: 시사회
- `gv`: GV
- `screening`: 상영회
- `release`: 개봉일
- `rerelease`: 재개봉
- `vip`: 우대인사 / 무대인사
- `festival`: 영화제

## 🔐 보안

### API 키 노출 주의
- `config.js`에 Firebase API 키가 포함되어 있습니다
- 공개 저장소에 푸시하지 마세요
- `.env` 파일로 분리할 것을 권장합니다

### Firebase 보안 규칙
현재 설정:
```
- 클라이언트: 모든 사용자 읽기 허용
- API 서버: API 키로 인증
```

필요시 보안 규칙을 더 강화할 수 있습니다.

## 📝 로그 확인

### API 서버 로그
```
[server] 스크린샷 저장: /path/to/.temp-screenshot.png
[server] Firebase 저장 완료: 2026-03 (15개 이벤트)
```

### 브라우저 콘솔
개발자 도구 (F12) → 콘솔 탭에서:
```javascript
// 크롤링 상태 확인
fetch('http://localhost:3000/api/status')
  .then(r => r.json())
  .then(console.log)
```

## 🎯 다음 단계

1. ANTHROPIC_API_KEY 환경변수 설정
2. 두 개의 터미널에서 서버 실행
3. 브라우저에서 대시보드 열기
4. 영화 탭의 "🔄 새로고침" 버튼 클릭
5. 진행률 표시 확인
6. 캘린더 데이터 업데이트 확인

## 💡 팁

- 정기적인 자동 크롤링을 원한다면 `cron` 작업으로 설정할 수 있습니다
- Firebase에서 실시간 업데이트를 원한다면 `onSnapshot()` 리스너 추가 가능
- muko.kr 레이아웃이 변경되어도 Claude Vision이 자동으로 적응합니다

## 📞 지원

문제 발생 시 다음을 확인하세요:
1. ANTHROPIC_API_KEY 설정 여부
2. 두 서버 포트 (3000, 5500) 충돌 여부
3. 인터넷 연결 및 muko.kr 접근성
4. 브라우저 콘솔의 에러 메시지
5. API 서버 터미널의 로그 메시지
