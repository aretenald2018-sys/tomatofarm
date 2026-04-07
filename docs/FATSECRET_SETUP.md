# FatSecret API Setup 가이드

## 문제점
FatSecret API는 CORS 정책으로 브라우저에서 직접 호출할 수 없습니다.
따라서 **Vercel 서버리스 함수**를 프록시로 사용합니다.

## 설치 방법

### 1. FatSecret API 자격증명 확보

1. https://www.fatsecret.com/api/ 방문
2. 계정 로그인 (없으면 회원가입)
3. "Applications" 또는 "My App"에서 새 앱 생성
4. **Consumer Key** 와 **Consumer Secret** 복사

### 2-A. Vercel 배포 (권장)

```bash
# 프로젝트 디렉토리에서
npm install -g vercel

# Vercel 로그인
vercel login

# 배포
vercel deploy

# 프롬프트에서 'y' 입력해서 프로덕션 배포
```

배포 후:
- Vercel이 제공한 URL 메모 (예: `https://dashboard-abc123.vercel.app`)
- 이 URL이 자동으로 FatSecret 프록시로 작동합니다.

### 2-B. 로컬 개발 (Python HTTP Server)

```bash
# 프로젝트 디렉토리에서
python -m http.server 3000
```

또는 Node.js 사용:
```bash
npx http-server . -p 3000
```

**주의:** 로컬 개발에서는 프록시가 http://localhost:3000/api/fatsecret-proxy 로 작동하지만,
API 호출이 실패할 수 있습니다. **Vercel 배포를 권장합니다.**

### 3. 앱에서 자격증명 입력

앱을 열고:
1. ⚙️ **설정** 탭 클릭
2. **FatSecret Consumer Key** 입력 (위에서 복사)
3. **FatSecret Consumer Secret** 입력 (위에서 복사)
4. **저장하기** 클릭

### 4. 테스트

식단 탭에서:
1. 🔍 **FatSecret 음식 검색** 버튼 클릭
2. "닭가슴살" 또는 "chicken breast" 입력
3. 검색 버튼 클릭
4. 결과가 나타나면 성공! ✓

## 오류 해결

### "Failed to fetch" 오류
- FatSecret 자격증명이 정확한지 확인
- Vercel 배포 URL이 올바른지 확인
- 브라우저 콘솔(F12)에서 더 상세한 오류 확인

### 결과가 없음
- 한글 검색: "닭가슴살", "계란", "현미" 등
- 영문 검색: "chicken breast", "egg", "brown rice" 등
- 한국 제품도 FatSecret에 많이 포함되어 있습니다.

### Vercel 배포 문제
```bash
# vercel.json 확인
cat vercel.json

# api/fatsecret-proxy.js 확인
ls api/

# 재배포
vercel deploy --prod
```

## 파일 구조

```
dashboard2-main/
├── api/
│   └── fatsecret-proxy.js    ← Vercel 서버리스 함수 (OAuth1 처리)
├── fatsecret-api.js           ← 클라이언트 함수 (프록시 호출)
├── app.js                      ← FatSecret 검색 UI
├── package.json               ← Node.js 설정
└── vercel.json               ← Vercel 배포 설정
```

## 작동 원리

```
사용자 입력 "닭가슴살"
    ↓
app.js → fatsecretSearch()
    ↓
fatsecret-api.js → fetch(PROXY_URL)
    ↓
api/fatsecret-proxy.js (Vercel)
    ↓
FatSecret API 호출 (OAuth1 서명 생성)
    ↓
결과 반환 → 사용자에게 표시
```

## 참고

- FatSecret API 문서: https://developer.fatsecret.com/docs
- Vercel 문서: https://vercel.com/docs
- OAuth1 HMAC-SHA1: RFC 5849 표준
