# Tomato Farm

운동, 러닝/Wear, 식단·영양, 홈·소셜, 캘린더·통계를 한 곳에서 관리하는 Vanilla JavaScript PWA입니다. 웹은 GitHub Pages, Android는 Capacitor, 시계 앱은 Wear OS로 배포합니다.

## Production

공통 개발환경과 메인 컴퓨터·서브 컴퓨터·Claude/Codex 간 동기화 규칙은 [docs/SHARED_DEVELOPMENT.md](docs/SHARED_DEVELOPMENT.md)를 따른다. 모든 checkout의 공통 기준점은 `origin/main`이다.

- URL: `https://aretenald2018-sys.github.io/tomatofarm/`
- 배포 브랜치: `origin/main`
- 데이터: Firebase Authentication/Firestore 경계는 루트 `data.js` facade를 통해서만 접근합니다.

## 주요 구조

```text
app/          앱 shell, 탭 registry, lazy loader, overlay stack, action/event contracts
data/         Firebase adapter와 도메인 repository; data.js는 공개 facade
workout/      운동 세션, 세트, 러닝, Wear, 프로그램 도메인
diet/         식사 모델, 영양 편집, 사진 추정 pipeline
home/         홈 read model, life-zone, 소셜 UI와 action service
calendar/     캘린더 activity read model
stats/        통계 selector
styles/       token, component, primitive, accessibility 계층
functions/    Firebase Functions trigger와 검증/service 경계
android/      Capacitor Android 앱과 Wear OS 앱
tests/        node:test 회귀·계약·DOM 통합 테스트
```

자세한 의존 방향과 데이터 저장 규칙은 [ARCHITECTURE.md](ARCHITECTURE.md), 기능 소유권과 rollback 규칙은 [docs/REFACTOR_OWNERSHIP.md](docs/REFACTOR_OWNERSHIP.md), 디자인 계층은 [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)를 참고하세요.

## 검증 명령

프로젝트 루트에서 실행합니다.

```powershell
npm.cmd test
npm.cmd run test:contracts
npm.cmd run build
npx.cmd cap sync android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\android\gradlew.bat -p android :app:testDebugUnitTest :wear:testDebugUnitTest :app:assembleDebug :wear:assembleDebug
```

`npm.cmd run build`는 cache version/build info를 생성하고 `runtime-assets.js`의 모든 자산이 `www/`에 복사됐는지 검증합니다. `www/`는 생성물이며 직접 수정하지 않습니다.

## 배포 검증

변경을 `origin/main`에 push한 뒤 배포된 커밋과 정적 자산을 확인합니다.

```powershell
npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>
```

기여 시 UI/feature 모듈에서 Firebase SDK를 직접 import하지 않고, 기존 사용자 데이터 필드를 보존하는 merge 저장 계약을 지켜야 합니다.
