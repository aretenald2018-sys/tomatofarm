# Tomato Farm Quickstart

## Shared development baseline

모든 컴퓨터와 Claude/Codex는 `origin/main`을 공통 기준점으로 사용한다. 새 checkout은 `npm.cmd run setup:repository` 후 `npm.cmd run sync:development`와 `npm.cmd run check:development`를 실행한다. 상세 절차는 [docs/SHARED_DEVELOPMENT.md](docs/SHARED_DEVELOPMENT.md)를 따른다.

## Production-first workflow

이 checkout의 최종 검증 대상은 localhost가 아니라 Tomato Farm GitHub Pages입니다.

```powershell
cd "C:\Users\USER\Desktop\Tomato Project\tomatofarm(for lite version)"
npm.cmd test
npm.cmd run check:syntax
npm.cmd run test:contracts
npm.cmd run build
git push origin main
npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>
```

배포 URL: `https://aretenald2018-sys.github.io/tomatofarm/`

## Local-only debugging

로컬 디버깅이 꼭 필요할 때만 프로젝트 루트에서 다음 명령을 사용합니다. launcher가 사용 가능한 다음 포트를 선택합니다.

```powershell
node scripts/dev-start.mjs
```

출력된 URL을 사용하며, `www/`는 편집하지 않습니다.

## Android and Wear

```powershell
npx.cmd cap sync android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\android\gradlew.bat -p android :app:testDebugUnitTest :wear:testDebugUnitTest :app:assembleDebug :wear:assembleDebug
```

Phone↔Wear 러닝 payload는 v1 계약을 사용하고, 웹 경계는 version이 없는 legacy payload도 읽습니다.

## Optional Functions checks

```powershell
npm.cmd --prefix functions test
```
