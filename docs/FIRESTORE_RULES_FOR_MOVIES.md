# Firestore Rules for Movie Tab

## 현재 상태
- 영화 탭이 메인 대시보드에 통합됨
- Firebase 프로젝트: `exercise-management`

## 필요한 설정

### 1. Firebase Console 접속
```
https://console.firebase.google.com/
프로젝트: exercise-management
```

### 2. Firestore Rules 수정

**경로:** Firestore Database → Rules

**현재 Rules (추가 수정 필요시)**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 모든 사용자 인증된 접근 허용 (현재 설정이라고 가정)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**권장 Rules (보안 강화 - 선택사항)**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 영화 데이터 (공개 읽기 + 관리자만 쓰기)
    match /movies/{year_month} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }

    // 다른 데이터는 소유자만 접근
    match /{document=**} {
      allow read, write: if request.auth != null && isOwner();
    }
  }

  function isAdmin() {
    return request.auth.uid in ['your_admin_uid'];
  }

  function isOwner() {
    return true; // 현재는 모든 인증사용자 허용
  }
}
```

### 3. 현재 앱 상태

**메인 대시보드:**
- Firebase 전체 컬렉션 접근 가능
- 영화 탭도 동일 접근 권한

**분리 배포 (이후 진행 시):**
- 별도 URL로 배포
- `movies` 컬렉션만 접근 가능
- 토큰 기반 인증

## 주의사항

1. **현재는 Rules 수정 필수 아님** - 메인 앱 사용자만 접근 가능하므로 안전
2. **분리 배포 시** - 반드시 Rules 수정 필요
3. **크롤링 자동화** - Cloud Function이나 GitHub Actions에서 쓰기 권한 필요

## 추후 단계

1. GitHub Pages 분리 배포 계획 시 → Rules 수정
2. 크롤링 자동화 시 → Cloud Function 또는 Service Account 설정
3. 다중 사용자 접근 시 → 토큰 기반 인증 추가
