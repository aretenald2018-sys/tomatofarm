# 무코(muko.kr) 영화 데이터 크롤링 가이드

## 📦 설치 (Windows 기준)

### 1단계: Node.js 확인
```bash
node --version  # v18 이상 필요
npm --version
```

### 2단계: 필요한 패키지 설치
```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"

npm install puppeteer firebase
```

## 🚀 실행

### 방법 1: 직접 실행 (추천)
```bash
node crawl-movies-advanced.js
```

**예상 결과:**
```
🎬 무코 영화 캘린더 크롤러 (Puppeteer)

[crawl] 2026년 03월 크롤링 시작...
[crawl] https://muko.kr/calender 로드 중...
[crawl] 15개의 이벤트를 찾았습니다
[firebase] 2026-03 저장 완료 (15개 이벤트)

[crawl] 2026년 04월 크롤링 시작...
...

✅ 크롤링 완료
```

### 방법 2: GitHub Actions (자동 매일 밤)
→ 이미 `.github/workflows/crawl-movies.yml` 구성됨

---

## 🔍 데이터 확인

**Firebase Console에서 확인:**
1. [Firebase Console](https://console.firebase.google.com/)
2. exercise-management 프로젝트 → Firestore Database
3. `movies` 컬렉션 → `2026-03` 문서 확인

**대시보드에서 확인:**
- http://localhost:5500/index.html
- 🎬 영화 탭 → 실시간 업데이트됨

---

## 🐛 문제 해결

### "Puppeteer download failed"
```bash
npm install --save-dev puppeteer --unsafe-perm
```

### "Firebase 연결 오류"
- Firebase Console에서 API 활성화 확인
- 프로젝트 ID 일치 확인

### "이벤트를 찾을 수 없습니다"
muko.kr의 HTML 구조가 변경되었을 가능성. 수정 방법:
1. https://muko.kr/calender 브라우저에서 열기
2. F12 → Elements 탭
3. 이벤트 링크 검사해서 선택자 확인
4. `crawl-movies-advanced.js` 업데이트

---

## 📊 데이터 구조

Firebase에 저장되는 형식:
```json
{
  "2026-03": {
    "year": 2026,
    "month": 3,
    "events": [
      {
        "date": 1,
        "title": "2026 롯데시네마 아카데미 기획전",
        "tags": ["premiere"]
      },
      {
        "date": 5,
        "title": "우리에게는 아직 내일이 있다",
        "tags": ["release", "vip"]
      }
    ],
    "lastUpdated": "2026-03-29T...",
    "source": "muko.kr/calender"
  }
}
```

---

## ⚙️ 커스터마이징

### 크롤링 달 변경
`crawl-movies-advanced.js`의 `main()` 함수:
```javascript
// 3월만 크롤링
for (let offset = 0; offset <= 0; offset++) {  // ← 0으로 변경

// 또는 특정 달로 고정
let year = 2026;
let month = 3;  // ← 변경
```

### 태그 추가
```javascript
const TAG_MAP = {
  '시사회': 'premiere',
  'GV': 'gv',
  '상영회': 'screening',
  '개봉일': 'release',
  '재개봉': 'rerelease',
  '무대인사': 'vip',
  '영화제': 'festival',
  '당신의_태그': 'your_id',  // ← 추가
};
```

---

## 🔄 자동화

### GitHub Actions로 매일 밤 자동 크롤링
`.github/workflows/crawl-movies.yml`이 이미 설정되어 있습니다.

**작동 방식:**
- 매일 자정(한국 시간)에 자동 실행
- 새로운 영화 데이터 자동 저장
- 실패 시 로그 기록

**수동 실행:**
1. GitHub 레포 → Actions
2. "Crawl Movies" 선택
3. "Run workflow" 클릭

---

## 📝 로그 확인

### 로컬 실행 로그
터미널에 직접 출력됨

### GitHub Actions 로그
1. 레포 → Actions
2. "Crawl Movies" → 최신 실행
3. "Build" 또는 "Crawl" 단계 선택

---

## ✅ 체크리스트

- [ ] Node.js v18+ 설치
- [ ] `npm install puppeteer firebase` 실행
- [ ] `node crawl-movies-advanced.js` 성공
- [ ] Firebase에 데이터 저장 확인
- [ ] 대시보드에서 영화 탭 데이터 확인
- [ ] (선택) GitHub Actions 자동화 확인

---

## 💡 팁

1. **처음 실행 시 느림**: Puppeteer 브라우저 다운로드 (~200MB)
2. **매번 빨라짐**: 캐시된 브라우저 사용
3. **헤드리스 모드**: 브라우저 창 안 띄움 (자동)
4. **API 제한**: 3초 딜레이 (재요청 회피)

---

질문이나 문제 발생 시 알려주세요! 🎬
