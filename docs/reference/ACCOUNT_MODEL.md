# 계정 모델

## 계정은 세 종류다

| 계정 id | 역할 | 개인 데이터 위치 |
| --- | --- | --- |
| `관_리자` | 관리자 콘솔 전용 운영 계정 | `users/관_리자/**` (사실상 비어 있음) |
| `김_태우` | 김태우 개인 계정 | owner registry가 정한 네임스페이스 |
| 그 외 (`최_준수` 등) | 일반 사용자 | `users/{id}/**` |

계정 id는 `${성}_${이름}`을 소문자화하고 공백을 제거한 값이다
(`data/account-unification.js`).

## 권한은 로그인한 계정 하나로 결정된다

```js
isAdmin()  // getCurrentUser()?.id === '관_리자'
```

모드도, 토글도, 클라이언트 플래그도 없다. `isAdmin()`이 참인 유일한 조건은
`관_리자` 계정으로 로그인한 것이다.

### 왜 이렇게 바꿨나

2026-07-22 이전에는 `김_태우` **한 계정**이 admin과 guest 두 모드를 겸했고,
`localStorage.kimMode` 값이 그 둘을 갈랐다. `switchKimMode()`는 비밀번호를 묻지
않았으므로, 모드 전환은 곧 무료 권한 상승이었다. 그래서 그 주변에 계속 방어
장치를 덧대야 했고, 장치를 덧댈 때마다 새 경로가 생겼다. 마지막 사례:
설치된 앱 서피스가 세션을 시드하면서 `kim_authenticated`까지 세워, APK나 PWA를
설치한 기기는 게스트 제한이 탭 한 번 거리였다 (커밋 `92ee2d0`).

권한을 계정 경계로 옮기면 그 부류의 버그가 구조적으로 사라진다. 지켜야 할
것이 "플래그가 새지 않게"에서 "그 계정으로 로그인했는가" 하나로 줄기 때문이다.

## 관리자 계정은 서버만 만들 수 있다

권한이 계정으로 결정되므로, **그 계정을 만들 수 있는 주체가 곧 권한 경계다.**

- 가입 화면은 `관_리자` id를 거부한다 (`feature-login.js`의
  `createAccountFromSignup`).
- Firestore 규칙이 `_accounts/관_리자`로의 클라이언트 쓰기를 막는다
  ([FIRESTORE_RULES.md](FIRESTORE_RULES.md)).
- 생성·비밀번호 재설정은 Admin SDK 스크립트로만 한다:

```bash
npm --prefix functions run provision:admin-console -- --password '<비밀번호>'
```

`--commit`을 붙이면 실제로 쓴다. 비밀번호 재설정은 `--commit --reset-password`.
스크립트의 해시 함수는 클라이언트의 `_simpleHash`와 같아야 하며,
`tests/admin-console-account.test.js`가 두 구현이 어긋나지 않도록 검사한다.

비밀번호 해시가 없는 `관_리자` 계정은 로그인할 수 없다 — 다른 계정의
"비밀번호 없음 = 바로 로그인" 동작이 관리자에게는 적용되지 않는다.

## 관리자 계정은 소셜에 등장하지 않는다

`getAccountList()`가 `관_리자`를 걸러낸다. 소셜·랭킹·길드·친구 목록은 모두 이
함수를 지나므로 화면마다 다시 거를 필요가 없다. 로그인 인증과 관리자 콘솔만
`getAccountListIncludingAdminConsole()`로 원본 목록을 본다.

## 개인 데이터의 물리 네임스페이스

`김_태우`의 개인 데이터가 `users/김_태우/**`에 있는지 `users/김_태우(guest)/**`에
있는지는 **서버가 정한다.** 과거 게스트 모드가 별도 네임스페이스에 쓴 이력
때문에 생긴 문제이고, `_account_data_owners/tomato_admin` 레지스트리가 그 결정을
담는다. 절차는 [SHARED_OWNER_RELEASE_RUNBOOK.md](SHARED_OWNER_RELEASE_RUNBOOK.md).

계정 분리로 **새로운** 네임스페이스 분기가 생길 원인은 사라졌지만, 이미 갈라진
과거 데이터가 저절로 합쳐지지는 않는다. 레지스트리와 배포 게이트는
`(guest)` 네임스페이스 정리가 끝날 때까지 유지한다.

`관_리자` 계정은 이 결정에 참여하지 않는다. 관리자 계정이 개인 네임스페이스에
얹히면 쓰기 가능한 SSOT가 다시 둘이 된다.

## 세션 잠금

`김_태우`와 `관_리자`는 잠금 화면이 붙는다. 해제 상태는
`tomatofarm:session-unlocked:v2` 키에 기록한다.

예전 키(`admin_authenticated`, `kim_authenticated`)는 **읽지 않는다.** 지우기만
한다. 그 플래그들은 "admin 모드로 인증됨"을 뜻했으므로, 새 모델로 넘어오면
의미가 달라진다. 키를 갈아끼운 덕에 예전 플래그를 들고 있던 기기는 한 번
다시 인증할 뿐, 낡은 의미가 새 권한 모델로 새지 않는다.

설치된 앱 서피스(APK/홈 화면 PWA)는 여전히 `김_태우` 세션을 시드한다. Chrome과
Capacitor WebView가 저장소를 공유하지 않아, 시드하지 않으면 "기록이 사라졌다"로
보이기 때문이다. 다만 **인증하지 않은 채로** 시드하므로 잠금 화면은 그대로
돈다. `관_리자`는 어떤 경우에도 시드하지 않는다.

## 남은 공백

클라이언트가 `관_리자`를 사칭하는 것은 아직 서버가 막지 못한다. Firebase Auth가
없어 규칙에 신원 조건을 쓸 수 없기 때문이다. 자세한 내용과 해소 경로는
[FIRESTORE_RULES.md](FIRESTORE_RULES.md)의 "남은 공백" 절에 있다.

## 회귀 방벽

`tests/admin-console-account.test.js`가 폐기된 이름(`kimMode`, `isAdminGuest`,
`switchKimMode`, `backupAdminAuth` 등)이 런타임 소스에 다시 나타나면 실패한다.
이름을 되살리는 대신 삭제한 이유도 같다 — 오래된 브랜치가 병합돼도 조용히 다른
값을 읽는 대신 import 단계에서 터진다.
