# 🚀 Railway로 배포 가이드 (5분)

## 📋 사전 요구사항

- GitHub 계정 (또는 Google, GitHub으로 로그인)
- 이 리포지토리가 GitHub에 푸시되어 있어야 함

---

## 🎯 배포 단계

### **1단계: 코드 커밋 및 푸시**

```bash
cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
git add -A
git commit -m "feat: Prepare for Railway deployment"
git push origin main
```

### **2단계: Railway 프로젝트 생성**

1. **Railway 접속**
   - https://railway.app 열기
   - GitHub으로 로그인

2. **새 프로젝트 생성**
   - "+ New Project" 클릭
   - "Deploy from GitHub repo" 선택
   - 당신의 대시보드 리포지토리 선택

3. **설정 확인**
   - 자동으로 Node.js 감지함
   - Start command: `npm start` (자동으로 설정됨)

### **3단계: 환경변수 설정**

Railway 대시보드에서:

1. **Variables 탭 클릭**

2. **새 환경변수 추가**
   ```
   Name: ANTHROPIC_API_KEY
   Value: sk-ant-...your-api-key...
   ```

3. **저장**

### **4단계: 배포 확인**

1. Railway 대시보드에서 "Deployments" 탭
2. 배포 진행 상황 확인
3. 완료 후 생성된 URL 확인

```
https://your-project-xxxxxxx.up.railway.app
```

---

## ✨ 배포 완료!

### **휴대폰에서 접속**

```
https://your-project-xxxxxxx.up.railway.app
```

바로 사용 가능합니다! 🎬

---

## 🔍 확인사항

### **배포된 사이트에서 테스트**

1. 브라우저에서 배포 URL 열기
2. 영화 탭 클릭
3. "🔄 새로고침" 버튼 클릭
4. **자동 크롤링 시작 확인!**

### **문제 해결**

#### "화이트 스크린 또는 404"
- Railway 대시보드의 "Logs" 탭에서 에러 확인
- API 서버가 정상 시작했는지 확인

#### "크롤링이 작동 안 함"
- 환경변수 확인: ANTHROPIC_API_KEY 설정되어 있나?
- 브라우저 콘솔 (F12) 에러 확인
- Railway 로그 확인

#### "배포가 안 되고 있음"
- GitHub에 코드가 푸시되었는지 확인
- Railway 프로젝트가 올바른 리포지토리를 연결했는지 확인

---

## 🔄 업데이트

로컬에서 코드 수정 후:

```bash
git add -A
git commit -m "update: 변경 사항"
git push origin main
```

**Railway가 자동으로 재배포합니다!** ✨

---

## 💡 팁

### **로컬과 배포 환경 동시 사용**

**로컬:**
```bash
npm run dev              # Python 웹서버 (5500)
npm run server          # Node API (3000)
# http://localhost:5500
```

**배포:**
```
https://your-project-xxxxxxx.up.railway.app
```

### **로그 확인**

Railway 대시보드 → Logs 탭:
```
[server] 스크린샷 저장: ...
[server] Firebase 저장 완료: 2026-03 (15개 이벤트)
```

### **성능**

- 첫 배포: 30초~1분
- 재배포: 10~30초
- 크롤링: 10~30초

---

## 📱 **완료!**

이제:

✅ 휴대폰에서 언제든 접속 가능
✅ PC가 꺼져도 작동
✅ 5명이 각각 접속 가능
✅ URL 공유 가능

**대시보드 URL을 공유하세요!** 🎬✨

---

## 🆘 더 필요하면

Railway 문서: https://docs.railway.app
Puppeteer: https://pptr.dev
