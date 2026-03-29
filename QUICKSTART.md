# 🚀 빠른 시작 가이드

## 1️⃣ API 키 설정

먼저 Claude API 키를 얻어야 합니다:

### Windows (cmd 또는 PowerShell)
```cmd
set ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

### macOS / Linux (bash 또는 zsh)
```bash
export ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

## 2️⃣ 서버 시작

### 터미널 1: 웹 서버 (대시보드)
```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
npm start
```
✅ http://localhost:5500 에서 접속 가능

### 터미널 2: API 서버 (크롤링 백엔드)
```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
npm run server
```
✅ http://localhost:3000 에서 API 서버 실행 중

## 3️⃣ 대시보드 사용

1. 브라우저에서 http://localhost:5500 열기
2. 상단 탭에서 "영화" 클릭
3. "🔄 새로고침" 버튼 클릭
4. 진행률 표시 (0% → 100%) 확인
5. 완료 후 캘린더 자동 업데이트

## ✅ 검증

시스템이 제대로 설정되었는지 확인:

```bash
node verify-setup.js
```

모든 항목이 ✅ 로 표시되어야 합니다.

## 📚 문서

- `MOVIE_CRAWL_SETUP.md`: 상세한 설정 가이드
- `IMPLEMENTATION_SUMMARY.md`: 기술 구현 상세 정보
- `test-api.js`: API 엔드포인트 테스트
- `verify-setup.js`: 시스템 검증 스크립트

## 🔄 데이터 흐름

```
클릭: 🔄 새로고침
  ↓
startMovieCrawl() 호출
  ↓
POST http://localhost:3000/api/crawl-movies
  ↓
Puppeteer: muko.kr 스크린샷
  ↓
Claude Vision: 이미지 분석
  ↓
Firestore: 데이터 저장
  ↓
프론트엔드: 캘린더 업데이트 ✨
```

## 🆘 문제 해결

### "ANTHROPIC_API_KEY 오류"
- API 키를 환경변수로 설정했는지 확인
- 터미널을 재시작했는지 확인
- 명령어: `echo $ANTHROPIC_API_KEY` (또는 `echo %ANTHROPIC_API_KEY%` Windows)

### "localhost:3000 연결 실패"
- API 서버가 실행 중인지 확인: 터미널 2 확인
- 포트 3000이 다른 프로그램에서 사용 중인지 확인
- 명령어: `npm run server` 다시 실행

### "localhost:5500 연결 실패"
- 웹 서버가 실행 중인지 확인: 터미널 1 확인
- 포트 5500이 다른 프로그램에서 사용 중인지 확인
- 명령어: `npm start` 다시 실행

### "크롤링이 진행되지 않음"
- 브라우저 개발자 도구 (F12) 열기
- 콘솔 탭 확인
- 에러 메시지 읽기
- API 서버 터미널의 로그 확인

## 📊 테스트

### 기본 API 테스트
```bash
npm run server & sleep 1 && node test-api.js
```

### 상태 확인
브라우저 콘솔에서:
```javascript
fetch('http://localhost:3000/api/status')
  .then(r => r.json())
  .then(console.log)
```

## 🎯 다음 단계

1. ✅ ANTHROPIC_API_KEY 설정
2. ✅ 두 터미널에서 서버 시작
3. ✅ 대시보드 접속 및 테스트
4. ✅ 영화 탭에서 새로고침 클릭
5. ✅ 자동 크롤링 작동 확인

## 💡 팁

- 첫 크롤링은 Chromium 다운로드로 시간이 걸릴 수 있습니다
- 크롤링 중에는 여러 번 클릭해도 "이미 크롤링 중" 메시지가 표시됩니다
- 브라우저를 새로고침해도 이전 데이터는 유지됩니다 (Firebase에 저장됨)

## 📞 지원

문제가 발생하면:
1. `verify-setup.js` 실행하여 설정 확인
2. 브라우저 개발자 도구 콘솔 확인
3. API 서버 터미널 로그 확인
4. `MOVIE_CRAWL_SETUP.md`의 문제 해결 섹션 참고

---

**준비 완료! 이제 영화 데이터를 자동으로 크롤링할 수 있습니다! 🎬**
