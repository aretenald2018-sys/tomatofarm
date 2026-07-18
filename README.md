# Tomato Farm

운동, 러닝/Wear OS, 식단, 생활존, 캘린더와 통계를 한곳에서 관리하는 Vanilla JavaScript PWA입니다. 웹은 GitHub Pages, 모바일은 Capacitor Android, 시계 앱은 Wear OS로 배포합니다.

## 시작하기

프로젝트 루트에서 실행합니다. 로컬 경로는 문서에 고정하지 않습니다.

```powershell
npm.cmd ci
npm.cmd run check:repository
npm.cmd test
npm.cmd run dev
```

`npm.cmd run dev`가 출력한 로컬 URL을 사용합니다. `www/`는 생성물이므로 직접 수정하지 않습니다.

## 주요 명령

```powershell
npm.cmd test                 # 거버넌스, 문법, 전체 node:test
npm.cmd run test:contracts  # 빠른 구조 계약
npm.cmd run verify:assets   # 생성 CSS와 런타임 자산의 무변경 검증
npm.cmd run build           # style.css, cache/build info, www 생성
npm.cmd --prefix functions test
```

Android/Wear 검증이 필요한 변경은 다음을 추가로 실행합니다.

```powershell
npx.cmd cap sync android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\android\gradlew.bat -p android :app:testDebugUnitTest :wear:testDebugUnitTest :app:assembleDebug :wear:assembleDebug
```

## 구조와 규칙

- 코드·데이터·이벤트 소유권: [ARCHITECTURE.md](ARCHITECTURE.md)
- UI/CSS 소유권: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- 호환 레이어: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)
- 생활존 아트: [docs/LIFE_ZONE_ASSETS.md](docs/LIFE_ZONE_ASSETS.md)
- 작업·검증·릴리스 규칙: [AGENTS.md](AGENTS.md)

Production URL: `https://aretenald2018-sys.github.io/tomatofarm/`
