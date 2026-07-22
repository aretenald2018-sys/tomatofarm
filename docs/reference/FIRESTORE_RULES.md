# Firestore 보안 규칙

규칙의 원본은 저장소의 `firestore.rules`이고, `firebase.json`이 이를 선언한다.
그 전까지 규칙은 Firebase 콘솔에서만 관리됐고 저장소에는 사본조차 없었다.

## 이 규칙이 실제로 막는 것

이 앱은 **Firebase Auth를 쓰지 않는다.** 계정은 `_accounts` 컬렉션의 문서이고,
비밀번호 검증은 클라이언트가 `data/data-auth.js`에서 한다. 그래서 규칙 안에
`request.auth`가 없고, "관리자만 이 컬렉션을 읽을 수 있다" 같은 신원 기반 조건은
**표현할 수 없다.**

규칙이 강제할 수 있는 것은 경로 단위 금지뿐이다. 현재 닫아 둔 것:

| 경로 | 정책 | 이유 |
| --- | --- | --- |
| `_accounts/관_리자` | 클라이언트 쓰기 금지 | 권한이 로그인 계정으로 결정되므로, 그 계정을 만들 수 있는 주체가 곧 권한 경계다 |
| `_account_data_owners/**` | 클라이언트 읽기만 | 브라우저가 물리 네임스페이스를 고르면 개인 데이터가 둘로 갈린다 |
| `_account_data_migrations/**` | 버전 하향·삭제 금지 | 완료된 이전을 되돌리면 복사가 다시 돈다 |
| `_orphan/**` | 전면 금지 | 소유자 미해결 상태의 쓰기가 조용히 미아가 되는 대신 실패해야 한다 |

나머지 컬렉션은 지금 앱이 실제로 하는 접근을 그대로 허용한다. 신원 없이는 더
좁힐 수 없기 때문이며, 규칙을 조이는 것과 신원을 도입하는 것은 별개 작업이다.

## 허용형 catch-all을 두지 않는 이유

Firestore 규칙은 **OR로 합쳐진다.** 어느 하나라도 허용하면 접근이 허용된다.
따라서 `match /{document=**} { allow read, write: if true; }` 같은 catch-all이
파일 어딘가에 있으면 위의 금지가 **전부 무효**가 된다.

그래서 컬렉션을 하나씩 적는다. 대가는 명확하다. **규칙에 없는 컬렉션은 배포
순간 접근이 막힌다.** `tests/firestore-rules-coverage.test.js`가 클라이언트
소스에서 `collection(db, '...')`/`doc(db, '...')`로 참조되는 최상위 컬렉션을
모두 뽑아 규칙에 있는지 검사하므로, 새 컬렉션을 쓰기 시작하면 배포 전에 잡힌다.

Cloud Functions는 Admin SDK로 접근하므로 규칙을 우회한다. Functions만 쓰는
컬렉션은 규칙에 없어도 된다.

## ⚠️ 라이브 규칙과 대조 (첫 배포 전 필수)

`firestore.rules`는 **아직 콘솔의 라이브 규칙과 대조되지 않았다.** 이 파일은
클라이언트 소스에서 역산한 것이므로, 라이브 규칙에만 있는 조건이나 이 저장소가
모르는 컬렉션이 빠져 있을 수 있다. 대조 없이 배포하면 그 기능이 즉시 죽는다.

이 작업은 Firebase 콘솔 접근 권한이 필요하다.

1. 콘솔에서 현재 라이브 규칙을 연다:
   Firebase 콘솔 → `exercise-management` → Firestore Database → 규칙.
2. 라이브 규칙 전문을 복사해 저장소 밖에 보관한다(롤백용).
3. `firestore.rules`와 줄 단위로 비교한다. 확인할 것:
   - 라이브에만 있는 컬렉션 → `firestore.rules`에 추가
   - 라이브에만 있는 조건(필드 검증, 크기 제한 등) → 옮겨오기
   - 라이브에 허용형 catch-all이 있는지 → 있으면 지금까지 위 금지가 전부
     무효였다는 뜻이므로, 이 배포가 곧 그 구멍을 닫는 변경이 된다
4. 대조가 끝나면 `firestore.rules` 상단의 ⚠️ 경고 주석을 지운다.
   `tests/firestore-rules-coverage.test.js`가 그 경고의 존재를 검사하므로,
   경고를 지우는 커밋이 곧 "대조 완료" 선언이 된다.
5. 배포:

```bash
firebase deploy --only firestore:rules --project exercise-management
```

6. 배포 후 실제 계정으로 홈·식단·운동·소셜·길드를 한 번씩 돌려 권한 오류가
   없는지 확인한다. 콘솔의 규칙 시뮬레이터로는 이 앱의 경로 다양성을 다 못 덮는다.

정기 배포(`.github/workflows/deploy.yml`)와 `firebase deploy --only functions`는
규칙을 건드리지 않는다. 규칙 배포는 위 명령으로만, 의도적으로 한다.

## 남은 공백: 신원 없는 관리자 권한

지금 `isAdmin()`은 클라이언트가 "나는 `관_리자` 계정이다"라고 주장하는 것이다.
규칙이 계정 문서 생성은 막지만, 이미 만들어진 계정을 사칭하는 요청은
구별하지 못한다. 브라우저 콘솔에서 `setCurrentUser({id:'관_리자'})`를 실행하면
관리자 UI가 열리고, 그 UI가 하는 Firestore 접근은 규칙을 통과한다.

이 공백을 닫으려면 Firebase Auth 도입이 필요하다. 대략의 경로:

1. 익명 또는 커스텀 토큰으로 Firebase Auth 세션을 만들고, `_accounts` 문서를
   `uid`에 연결한다.
2. 규칙을 `request.auth.uid` 기반으로 다시 쓴다. 관리자 전용 컬렉션은
   `관_리자`에 연결된 uid만 접근 가능하게 한다.
3. 관리자 전용 쓰기(계정 삭제, 패치노트 발행, cheers 설정)는 Callable Function
   뒤로 옮기고, 서버에서 uid를 검증한다.

현재 클라이언트 비밀번호 해시(`_simpleHash`)도 보안 경계가 아니다. Auth를
도입할 때 함께 걷어내야 한다.

관련 문서: [SHARED_OWNER_RELEASE_RUNBOOK.md](SHARED_OWNER_RELEASE_RUNBOOK.md),
[ACCOUNT_MODEL.md](ACCOUNT_MODEL.md)
