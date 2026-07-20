# 다음 자동 액션

## 2026-07-10 Running GPS Lossless Route Rewrite

- 상태: `production_verified_physical_device_not_verified`
- 계획: `docs/ai/features/2026-07-10-running-gps-lossless-route-rewrite.md`
- ULW: `.omo/ulw-loop/tomatofarm-gps-fidelity-20260710/`
- 요청: 잘못 선택한 `budgetproject`가 아니라 Tomato Farm Lite에서 모바일/갤럭시워치 GPS 전체 좌표와 거리·시간을 실제 러닝 궤적대로 저장/표시한다.
- 진단: 모바일 240점 축소, Wear update `lastOrNull()`, GPS 10초 bucket overwrite, 2,161점 truncation, MessageClient 대용량 오용, day document inline route가 좌표 유실의 원인이다.
- 실행 결과:
  1. 모바일 `watchPosition` 원본 620개를 모두 보존하고, 30초에는 좌표 수집이 아니라 로컬 draft 저장만 batch 처리한다.
  2. Wear는 update의 전체 LOCATION을 보존하고 `DataClient` Asset + SHA/length/fsync app-private file queue + save ACK로 전달한다.
  3. 웹 Wear 경계는 2,162개를 그대로 저장하고 25,001개/malformed/decreasing route를 명시적으로 거부한다.
  4. Firestore는 immutable content-addressed route ref와 250점/900KB chunk를 한 batch로 저장하며 day/session에는 240점 preview와 full pointCount를 둔다.
  5. `경로 보기`는 클릭 후 전체 route를 single-flight hydrate하고 실패 재시도와 stale response 무시를 지원한다.
  6. `sw.js`는 `tomatofarm-v20260710z2-running-gps-accuracy`, 공개 모바일 APK는 최신 GPS WebView asset으로 재빌드했다.
- 검증:
  1. PASS JS full: `node --test --test-concurrency=1 tests/*.test.js` - 827/827.
  2. PASS Android: app/wear unit tests 및 debug APK assemble - `BUILD SUCCESSFUL` (final Health Services update ordering 포함).
  3. PASS assets: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=923`.
  4. PASS UI harness: 375px에서 click 전 map 0회, click 후 full 620점 1회 렌더, overlap/clipping 없음.
  5. PASS production: commit `400a2cf`가 `origin/main` 및 `https://aretenald2018-sys.github.io/tomatofarm/`에 배포됐고 login-screen smoke가 통과했다.
  6. not verified: 로그인 계정이 필요한 authenticated GPS flow와 물리 Galaxy Watch/phone GPS round-trip.
- 별도 정리: `budgetproject` GPS commit은 Tomato Farm 배포와 섞지 않고 해당 저장소에서 revert한다.
- 사용자 다음 액션: 운영 계정으로 러닝 시작/종료 1회 확인(선택).
- Codex 다음 액션: 없음.

## 2026-07-09 Watch Running GPS Gap Resilience

- 상태: `complete_production_verified_physical_device_not_verified`
- 계획: `docs/ai/features/2026-07-09-watch-running-gps-gap-resilience.md`
- 리뷰: `docs/ai/reviews/2026-07-09-watch-running-gps-gap-resilience-review.md`
- 요청: 이전 GPS 전체 궤적/백그라운드 중단 고려 작업이 충분히 반영됐는지 확인하고, 빠진 범위를 `omo:ulw-loop`로 반영한다.
- 판정:
  1. 웹/PWA 러닝 GPS gap-aware 저장/지도 split은 기존 Slice 1에 반영되어 있다.
  2. 워치 저장 경로는 이번 Slice에서 route gap metadata 보존/추론을 반영했다.
  3. Android/iPhone background 지속 추적은 native foreground service/Core Location 영역이다. 이번 Slice는 워치 저장 payload와 phone bridge restart queue가 중단 구간을 잃지 않는 범위로 닫았다.
- 실행 결과:
  1. `workout/wear-bridge.js`가 explicit `segmentId`, `gapBefore`, `gapReason`을 보존하고 timestamp gap을 추론한다.
  2. route summary에 `segmentCount`, `gapCount`, `interrupted`를 저장한다.
  3. Wear native payload schema/test에 gap metadata field를 추가했고, metadata 없는 timestamp gap도 native payload에서 추론한다.
  4. Wear metric accumulator가 Health Services location update 공백을 `gapBefore` segment로 표시한다.
  5. Android phone bridge persistent queue는 raw JSON을 그대로 보존하지 않고 allow-list safe payload를 재구성하며, route/gap metadata만 정규화해서 WebView 재시도에 남긴다.
  6. `sw.js` cache version은 `tomatofarm-v20260709z12-watch-running-gps-gap-resilience`로 bump했고 cache marker tests를 동기화했다.
- 검증:
  1. PASS RED: 구현 전 `node --test tests/wear-workout-bridge.test.js`가 `segmentId` 보존 실패로 깨졌다.
  2. PASS final local: `node --check workout/wear-bridge.js && node --check render-calendar.js && node --check workout/index.js && node --check sw.js && node --test tests/wear-workout-bridge.test.js tests/wear-gps-running-contract.test.js tests/workout-calendar-bottom-sheet.test.js && node --test --test-concurrency=1 tests/*.test.js && npm.cmd run verify:assets && ./android/gradlew.bat -p android :app:testDebugUnitTest :wear:testDebugUnitTest && node --test tests/wear-app-refresh-update.test.js && git diff --check`.
  3. PASS final counts: focused JS 45/45, full JS 776/776, `verify:assets` `[runtime-assets] ok refs=904`, Android app/wear unit `BUILD SUCCESSFUL`, APK freshness 6/6.
  4. PASS security rereview: Web persistent queue allow-list redaction and Android native route time-window sanitization passed.
  5. PASS production deploy: commit `6c9dcb00e3ee1f144a7d3da70bd2b45cc33f261e` pushed to `origin/main`; `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 6c9dcb00e3ee1f144a7d3da70bd2b45cc33f261e` returned `[deploy-verify] ok 6c9dcb00e3ee tomatofarm-v20260709z12-watch-running-gps-gap-resilience static=260`.
  6. PASS production browser QA: read-only browser fixture opened `운동 -> 해당 날짜 sheet -> 러닝`, rendered 2 stacked running cards, confirmed 2 `경로 보기` buttons, clicked the first route, and saw 1 active route map with `GPS 중단 구간 1개 · 기록 구간 2개` copy.
  7. not verified yet: 실기기 Galaxy Watch/phone Data Layer GPS run은 연결 기기가 없어 수행하지 않았다.
- 다음 액션: 실기기에서는 워치 `런닝 -> 시작 -> 일시적 위치 공백/백그라운드 -> 종료` 후 폰 `운동 -> 해당 날짜 -> 러닝 -> 경로 보기`에서 카드 스택과 gap 구간 비연결 궤적을 확인한다.

## 2026-07-09 Watch Running Save GPS Cards

- 상태: `complete_production_verified_physical_device_not_verified`
- 계획: `docs/ai/features/2026-07-09-watch-running-save-gps-cards.md`
- 리뷰: `docs/ai/reviews/2026-07-09-watch-running-save-gps-cards-review.md`
- 요청: 갤럭시워치 러닝 저장이 운동탭 1회차가 아니라 러닝에만 저장되어야 하고, GPS 궤적을 보존하며, 러닝 n회 저장 시 러닝 카드가 스택되어야 한다.
- 실행 결과:
  1. `workout/wear-bridge.js`는 웨어 러닝 payload를 운동 `exercises`에 넣지 않고 `sessionIndex >= 2` 러닝 세션으로만 저장한다. 같은 `startedAt`/`endedAt`은 기존 러닝 세션을 갱신하고, 다른 러닝은 다음 러닝 슬롯에 추가한다.
  2. 웨어 queue는 저장 위치별 정책을 분리한다. Web `localStorage` persistent queue는 `route: []`, `samples10s: []`, `redacted routeSummary`만 저장하고, Android native phone `SharedPreferences` retry queue는 WebView/app 재시작 후에도 궤적 복구가 가능하도록 app-private 영역에 allow-list sanitized route/gap metadata만 저장한다.
  3. `android/wear/.../WearExerciseService.kt`는 `supportedDataTypes` 필터 뒤 `DataType.LOCATION`을 강제 재추가하지 않는다. 지원되는 `LOCATION`/`HEART_RATE_BPM`만 `WarmUpConfig`로 `prepareExerciseAsync()` 후 start한다.
  4. `render-calendar.js` 러닝 탭은 2번 이후 러닝 세션들을 여러 러닝 카드로 스택하고, legacy index `0` 러닝은 삭제/토글 target을 `0`으로 보존한다.
  5. 러닝 상세 지도는 탭 진입 시 전체 route map provider를 자동 로드하지 않고, 카드별 `경로 보기` 클릭 시 해당 카드 하나만 `renderRunningMap(... phase: 'detail')`를 호출한다.
  6. `sw.js` cache version은 후속 GPS gap resilience slice와 함께 `tomatofarm-v20260709z12-watch-running-gps-gap-resilience`로 bump했고 cache marker tests를 동기화했다.
- 검증:
  1. PASS focused JS: `node --test tests/wear-workout-bridge.test.js tests/wear-gps-running-contract.test.js tests/workout-calendar-bottom-sheet.test.js` - 45 tests, 45 pass.
  2. PASS Android app/wear: `export JAVA_HOME='/c/Program Files/Android/Android Studio/jbr'; ./android/gradlew.bat -p android :app:compileDebugKotlin :wear:testDebugUnitTest` - BUILD SUCCESSFUL.
  3. PASS full JS: `node --test --test-concurrency=1 tests/*.test.js` - 776 tests, 776 pass.
  4. PASS assets: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=904`.
  5. PASS syntax: `node --check workout/wear-bridge.js && node --check render-calendar.js && node --check workout/index.js && node --check sw.js`.
  6. PASS browser QA: Puppeteer mobile render of actual `_renderWorkoutRunningDetailCard` helpers produced 2 stacked cards, no overlap, click-before mapCalls `0`, first `경로 보기` click mapCalls `1` with `pointCount=2`, second card still inactive. Evidence: `.omo/evidence/watch-running-save-gps-cards-20260709/c003-running-cards-real-render/`.
  7. PASS whitespace: `git diff --check` with CRLF warnings only.
  8. PASS rereview: security rereview and gate rereview both passed after persistent queue privacy was split by surface: Web `localStorage` stays route-redacted, while native `SharedPreferences` keeps only sanitized app-private route/gap retry data.
  9. PASS production deploy: commit `6c9dcb00e3ee1f144a7d3da70bd2b45cc33f261e` pushed to `origin/main`; `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 6c9dcb00e3ee1f144a7d3da70bd2b45cc33f261e` returned `[deploy-verify] ok 6c9dcb00e3ee tomatofarm-v20260709z12-watch-running-gps-gap-resilience static=260`.
  10. PASS production browser QA: read-only browser fixture opened `운동 -> 해당 날짜 sheet -> 러닝`, rendered 2 stacked running cards, confirmed 2 `경로 보기` buttons, clicked the first route, and saw 1 active route map with `GPS 중단 구간 1개 · 기록 구간 2개` copy.
  11. not verified yet: physical Galaxy Watch GPS capture and phone Data Layer save were not exercised because no paired phone/watch device is available in this checkout.
- 다음 액션: 실기기 검증은 ADB/폰/갤럭시워치 연결 후 워치 `런닝 -> 시작 -> 종료`를 수행하고 폰 `운동 -> 해당 날짜 -> 러닝`에서 카드 스택과 `경로 보기` 궤적을 확인한다.

## 2026-07-09 More Menu APK Mobile Asset Refresh

- 상태: `complete_production_verified`
- 계획: `docs/ai/features/2026-07-09-more-menu-apk-install.md`
- 리뷰: `docs/ai/reviews/2026-07-09-mobile-apk-asset-refresh-review.md`
- 요청: 다운로드되는 모바일 APK가 구버전처럼 보이며, 라이프존 식사 사진 말풍선 꼬리와 하트 버튼 동작이 최신 배포본과 다르다.
- 진단:
  1. root `sw.js`는 `tomatofarm-v20260709z10-mobile-apk-download`다.
  2. 기존 `public/downloads/tomato-mobile-debug.apk` 내부 `assets/public/sw.js`/`build-info.json`은 `tomatofarm-v20260709z4-more-menu-apk-deploy`였다.
  3. `www/`와 `android/app/src/main/assets/public/`도 `z4`였으므로 APK 패키징 입력 자산이 최신 root와 동기화되지 않았다.
- 실행 결과:
  1. `node scripts/generate-build-info.mjs`와 `node scripts/copy-www.js`로 최신 root asset을 `www/`에 재생성했다.
  2. 기존 checkout의 설치된 Capacitor CLI를 `NODE_PATH`로 연결해 `cap sync android`를 실행했고, Android WebView assets를 최신 `z10`으로 동기화했다.
  3. Android app debug APK를 다시 빌드해 `public/downloads/tomato-mobile-debug.apk`를 새 APK로 교체했다. 새 크기는 `39,511,153 bytes`다.
  4. `tests/wear-app-refresh-update.test.js`에 APK zip 내부의 `sw.js`, `build-info.json`, `home/life-zone.js`, `style.css`를 직접 검사하는 회귀 테스트를 추가했다.
- 검증:
  1. PASS RED: `node --test tests/wear-app-refresh-update.test.js`가 기존 APK 내부 `z4`와 root `z10` 불일치로 실패했다.
  2. PASS: `node scripts/generate-build-info.mjs && node scripts/copy-www.js`.
  3. PASS: `NODE_PATH="../tomatofarm(for lite version)/node_modules" node "../tomatofarm(for lite version)/node_modules/@capacitor/cli/bin/capacitor" sync android`.
  4. PASS: `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" android/gradlew.bat -p android :app:assembleDebug` - `BUILD SUCCESSFUL`.
  5. PASS: 새 APK 내부 `assets/public/sw.js`와 `assets/public/build-info.json`이 `tomatofarm-v20260709z10-mobile-apk-download`를 담고, `home/life-zone.js`는 `data-lz-photo-like-key`/`toggleLike(...)`, `style.css`는 polygon 꼬리와 투명 `.lz-photo-like-btn` 스타일을 담는다.
  6. PASS: `node --test tests/wear-app-refresh-update.test.js` - 6 tests, 6 pass.
  7. PASS: `npm.cmd run verify:assets` - `runtime-assets ok refs=903`.
  8. PASS: `node --test tests/app-shell-action-bridge.test.js tests/wear-app-refresh-update.test.js tests/pwa-update-auto-reload.test.js` - 16 tests, 16 pass.
  9. PASS: `node --test --test-concurrency=1 tests/*.test.js` - 772 tests, 772 pass. 병렬 전체 실행은 `running-session-recovery-behavior.test.js` 1건이 일시 실패했지만 같은 파일 단독 재실행은 2/2 pass였고, 직렬 전체 실행은 772/772 pass였다.
  10. PASS production deploy: commit `ea2f3828c28c17e61cda5fa2935bc241a866501a`를 `origin/main`에 push했다. 최초 Pages run은 `cancelled`였고 rerun 뒤 성공했다. `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ ea2f382`가 `[deploy-verify] ok ea2f3828c28c tomatofarm-v20260709z10-mobile-apk-download static=260`으로 통과했다.
  11. PASS production APK QA: production `public/downloads/tomato-mobile-debug.apk`는 `200`, `content-length=39511153`, `public/downloads/tomato-wear-debug.apk`는 `404`다. 내려받은 APK 내부 `assets/public/sw.js`는 `tomatofarm-v20260709z10-mobile-apk-download`, `home/life-zone.js`는 photo-like JS, `style.css`는 photo bubble CSS를 포함한다.
- 다음 액션: 이 APK 구버전 자산 문제는 완료. 사용자가 직접 휴대폰에 설치한 뒤에도 오래된 화면을 보면 기존 설치 앱 삭제 후 새 APK 설치 또는 앱 데이터/캐시 삭제를 안내한다.

## 2026-07-09 More Menu APK Mobile Download Fix

- 상태: `complete_production_verified`
- 계획: `docs/ai/features/2026-07-09-more-menu-apk-install.md`
- 리뷰: `docs/ai/reviews/2026-07-09-more-menu-apk-mobile-download-review.md`
- 요청: `APK 설치하기`가 갤럭시워치용 APK를 설치/다운로드하지 않고 토마토 모바일 앱 APK를 바로 다운로드해야 한다.
- 실행 결과:
  1. `public/downloads/tomato-mobile-debug.apk`를 공개 다운로드 asset으로 추가했다. 원본은 `android/app/build/outputs/apk/debug/app-debug.apk`, 크기는 `50,133,878 bytes`다.
  2. 이전 공개 워치 APK `public/downloads/tomato-wear-debug.apk`를 제거했다.
  3. `utils/build-info.js`의 APK 다운로드 상수와 helper를 모바일 APK로 바꿨다.
  4. `requestTomatoApkInstall()`은 더 이상 `TomatoWearAppUpdate` native bridge나 `_requestWearAppRefreshOrInstall()`을 호출하지 않고 모바일 APK 직접 다운로드만 시작한다.
  5. `requestTomatoAppRefresh()`의 갤럭시워치 refresh/install bridge는 유지했다.
  6. `app.js`의 helper 미노출 fallback도 `public/downloads/tomato-mobile-debug.apk`로 이동하게 바꿨다.
  7. `sw.js` cache version은 `tomatofarm-v20260709z10-mobile-apk-download`로 bump했고 cache marker tests를 동기화했다.
- 검증:
  1. PASS RED: `node --test tests/wear-app-refresh-update.test.js`가 구현 전 모바일 APK 상수/asset 부재와 Wear bridge 호출로 실패했다.
  2. PASS: `node --check app.js && node --check utils/build-info.js && node --check sw.js`.
  3. PASS: `node --test tests/app-shell-action-bridge.test.js tests/wear-app-refresh-update.test.js tests/pwa-update-auto-reload.test.js` - 15 tests, 15 pass.
  4. PASS: `npm.cmd run verify:assets` - `runtime-assets ok refs=903`.
  5. PASS: 현재 작업 루트에서 전체 test file 목록을 명시해 `node --test <all tests>` 실행 - 771 tests, 771 pass.
  6. PASS production deploy: commit `25da0a3595d69a34dcf4eb05b914e96651e9e5f0`를 `origin/main`에 push했고, `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 25da0a3`가 `[deploy-verify] ok 25da0a3595d6 tomatofarm-v20260709z10-mobile-apk-download static=260`로 통과했다.
  7. PASS production browser QA: 390x844 Android viewport에서 `더보기 -> APK 설치하기`를 클릭해 menu close, old warning 없음, `tomato-mobile-debug.apk` `50,133,878 bytes` 다운로드를 확인했다. `public/downloads/tomato-mobile-debug.apk`는 `200`, `public/downloads/tomato-wear-debug.apk`는 `404`다. 인증 테스트 세션이 없어 로그인 overlay만 숨기고 실제 배포된 app-shell 버튼을 클릭했다. Evidence: `.omo/evidence/more-menu-apk-install/production-mobile-apk-25da0a3/`.
- 다음 액션: 이 모바일 APK 다운로드 흐름은 완료. 새 요청이 없으면 다른 대기 항목으로 넘어가기 전에 production URL에서 `더보기 -> APK 설치하기` smoke check만 수행한다.

## 2026-07-09 Wear Running Live Pages

- 상태: `implemented_static_verified_device_not_verified`
- 계획: `docs/ai/features/2026-07-09-wear-running-live-pages.md`
- 리뷰: `docs/ai/reviews/2026-07-09-wear-running-live-pages-review.md`
- 요청: 첨부 사진처럼 갤럭시워치에서 러닝 중 화면을 넘기면 요약, 페이스, 심박수, 심박수 구간, 경로가 실시간으로 보여야 한다.
- 실행 결과:
  1. 기존 6-page 대시보드는 되살리지 않고, 러닝 active 상태 안에만 `ViewPager2` 기반 `runMetricPager`를 추가했다.
  2. 5개 live page layout을 추가했다: summary, pace, heart, heart zones, route.
  3. `WearRunMetricPagerAdapter.kt`와 `WearRunGraphViews.kt`를 추가해 거리/시간/평균 페이스/kcal, 페이스 graph, 심박 graph, zone bars, route sketch를 바인딩한다.
  4. `WearRunUiState.kt`와 `WearRunUiMetrics.kt`가 distance samples, heart samples, kcal estimate, 10초 기반 heart-zone duration, degenerate route projection을 계산한다.
  5. `WearExerciseMetricAccumulator.kt`/`WearExerciseSessionStore.kt`가 distance samples를 실시간 snapshot에 포함한다.
  6. 저장 payload schema는 확장하지 않고 기존 `/tomato/workout/run/complete` 경계를 보존했다. route fallback distance로도 average pace가 계산되도록 보정했다.
  7. `.gitignore`는 Wear source/resource/proguard 파일이 clean checkout에서 누락되지 않도록 narrow exception을 보강했다.
- 검증:
  1. PASS RED/GREEN: `node --test tests/wear-running-live-pages.test.js tests/wear-running-only-shell.test.js tests/wear-slice2-artifacts.test.js` - 13 tests, 13 pass.
  2. PASS RED/GREEN: `JAVA_HOME="C:Program FilesAndroidAndroid Studiojbr" .androidgradlew.bat -p android :wear:testDebugUnitTest` - BUILD SUCCESSFUL.
  3. PASS: `JAVA_HOME="C:Program FilesAndroidAndroid Studiojbr" .androidgradlew.bat -p android :wear:assembleDebug` - BUILD SUCCESSFUL.
  4. PASS: review regressions for Wear resource reviewability, 10초 heart-zone duration, route fallback avg pace, degenerate route projection.
  5. PASS: code review and gate review after fixes. Evidence lives under `.omo/evidence/wear-running-live-pages-20260709/`.
  6. not verified yet: attached Wear device/emulator가 없어 ADB install/launch/swipe screenshot QA는 수행하지 못했다. `adb devices` returned no device rows.
- 다음 액션: Galaxy Watch 또는 Wear emulator를 ADB에 연결한 뒤 `.androidgradlew.bat -p android :wear:installDebug`로 설치하고, Wear 앱에서 `런닝 -> 시작 -> summary/pace/heart/zones/route` 5개 page swipe UI를 실기기 캡처로 확인한다.

## 2026-07-09 Life Zone Photo Preview Like Flow

- 상태: `complete_production_verified`
- 계획: `docs/ai/features/2026-07-09-life-zone-photo-preview-like-flow.md`
- 리뷰: `docs/ai/reviews/2026-07-09-life-zone-photo-bubble-polish-review.md`
- 요청: 라이프존 식사 사진 말풍선을 클릭하면 사진을 크게 보는 sheet/modal을 열고, 열린 사진 더블클릭/더블탭 및 닫힌 말풍선 좋아요 버튼에서 인스타그램식 하트 플로우 모션을 보여준다.
- 추가 피드백: 첨부 스크린샷 기준 닫힌 사진 말풍선의 하트 주변 원형 제거, 말풍선 내부 사진 꽉 채움, 마름모 밑동을 말풍선 꼬리 형태로 수정한다.
- 결정:
  1. 확대 UI는 모바일 바텀시트형 lightbox, 넓은 화면은 중앙 modal처럼 보이는 동일 컴포넌트로 구현한다.
  2. 사진 말풍선 click은 preview open, 별도 heart button은 닫힌 상태 좋아요/하트 플로우로 분리한다.
  3. 애니메이션은 `transform`/`opacity`만 사용하고 `prefers-reduced-motion`을 지원한다.
  4. 사용자는 `저장형`을 선택했고, 기존 `_likes`/`toggleLike()`를 쓰는 실제 저장형 소셜 리액션으로 구현한다.
- 실행 결과:
  1. `resolveLifeZoneActors()` diet actor에 `speechPhotoMeal`/`speechLikeField`를 추가해 `meal_lunch` 같은 저장 field를 제공한다.
  2. 사진 말풍선은 preview button과 별도 heart button을 렌더한다. inline `onclick=`과 nested button은 쓰지 않는다.
  3. preview sheet는 `role=dialog`, `aria-modal=true`, 닫기 버튼, backdrop 닫기, `Escape` 닫기를 지원한다.
  4. 열린 사진 double-click/double-tap과 닫힌 말풍선 heart button 모두 저장형 좋아요와 하트 stream 모션을 실행한다.
  5. 리뷰 피드백 fix에서 닫힌 사진 말풍선의 heart surface를 투명화하고, 사진/말풍선 padding을 0으로 고정했으며, 마름모 꼬리를 polygon 말풍선 꼬리로 교체했다.
  6. `sw.js`/`build-info.json` cache version은 `tomatofarm-v20260709z9-life-zone-photo-bubble-polish` 기준으로 cache marker tests와 동기화했다.
- 검증:
  1. PASS RED: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js` 구현 전 신규 테스트 실패 확인.
  2. PASS: `node --check home/life-zone-state.js && node --check home/life-zone.js && node --check sw.js`.
  3. PASS: `npm.cmd run verify:assets` - `runtime-assets ok refs=913`.
  4. PASS: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js` - 40 tests, 40 pass.
  5. PASS browser UI QA: `node .omo/evidence/life-zone-photo-preview-like-flow/capture.mjs`로 `mobile-390`/`wide-520` rest, preview-open, double-like, bubble-like 상태를 캡처했다. double-like와 bubble-like 모두 `field="meal_lunch"`, `emoji="❤"`, `heartParticleCount=6` 확인.
  6. PASS with CRLF warnings only: `git diff --check`.
  7. PASS 리뷰 피드백 fix: focused checks/assets, fresh Puppeteer UI capture, 독립 visual QA pass A/B 모두 통과.
  8. PASS: `git diff --check && node --test tests/*.test.js` - 771 tests, 771 pass.
  9. PASS production deploy: isolated commit `eebd7c82835e7bf932e7987e6d5f11efe75811b6`를 `origin/main`에 push했고, `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ eebd7c82835e7bf932e7987e6d5f11efe75811b6`가 `[deploy-verify] ok eebd7c82835e tomatofarm-v20260709z9-life-zone-photo-bubble-polish static=260`로 통과했다.
  10. PASS latest production deploy: 이후 `origin/main`의 후속 commit `25da0a3595d69a34dcf4eb05b914e96651e9e5f0`도 life-zone commit을 포함하며, `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 25da0a3595d69a34dcf4eb05b914e96651e9e5f0`가 `[deploy-verify] ok 25da0a3595d6 tomatofarm-v20260709z10-mobile-apk-download static=260`로 통과했다.
  11. PASS production browser QA: 390x844 viewport에서 production `style.css`를 실제 브라우저에 적용한 사진 말풍선 sample을 렌더해 `bubblePaddingTop/Left=0px`, `photoButtonPaddingTop/Left=0px`, heart background transparent/border 0/shadow none, tail polygon + translate-only transform을 확인했다.
- 다음 액션: 이 life-zone 사진 말풍선 polish 배포는 완료. 새 요청이 없으면 다른 대기 항목으로 이동한다.

## 2026-07-09 Life Zone Meal Photo Bubble

- 상태: `ready_for_review_local_verified_production_not_verified`
- 계획: `docs/ai/features/2026-07-09-life-zone-meal-photo-bubble.md`
- 요청: 식사 사진을 올린 경우 홈 라이프존 actor 말풍선에 `아침냠냠`/`점심냠냠` 같은 텍스트보다 해당 이미지를 작게 우선 표시한다.
- 계획 결정:
  1. 기존 `getLifeZoneDietSpeech()`의 meal 선택 기준을 유지한다.
  2. diet actor에는 기존 `speech` 텍스트를 유지하고, 사진이 있으면 별도 사진 필드(예: `speechPhoto`)를 추가한다.
  3. `home/life-zone.js`는 `actor.speechPhoto`를 `actor.speech`보다 먼저 렌더한다.
  4. 사진이 없으면 현재 `xx냠냠` 텍스트 말풍선을 그대로 유지한다.
  5. `home/life-zone.js`, `home/life-zone-state.js`, `style.css`는 `STATIC_ASSETS` 대상이므로 수정 시 `sw.js` `CACHE_VERSION`을 같은 변경에서 bump한다.
- 실행 Slice 1:
  1. `tests/home-life-zone-state.test.js`에 RED 테스트를 추가해 diet actor 사진 필드와 기존 speech fallback을 고정한다.
  2. `tests/home-life-zone-npc-quest.test.js`에 RED 테스트를 추가해 사진 우선 DOM 렌더링과 `.lz-speech--photo`/`.lz-speech-photo` 스타일 계약을 고정한다.
  3. `home/life-zone-state.js`에 기존 meal 선택 로직을 재사용하는 사진 선택 helper를 추가한다.
  4. `home/life-zone.js`에서 사진이 있으면 작은 이미지 썸네일 말풍선을 렌더하고, 사진이 없으면 기존 텍스트 렌더를 유지한다.
  5. `style.css`에 사진 말풍선 스타일을 추가한다.
  6. `sw.js` `CACHE_VERSION`을 bump한다.
- 검증 계획:
  1. RED: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js`.
  2. PASS 목표: `node --check home/life-zone-state.js && node --check home/life-zone.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js`.
  4. PASS 목표: `npm.cmd run verify:assets`.
  5. PASS 목표: `node --test tests/*.test.js`.
  6. UI 검증: 홈 탭 `오늘의 라이프존`에서 식사 사진이 저장된 actor의 말풍선이 `xx냠냠` 대신 작은 사진 썸네일을 표시하고, 사진 없는 actor는 기존 텍스트를 유지한다.
  7. 운영 배포 검증: 관련 변경만 안전하게 commit/push한 뒤 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`를 실행한다. 배포 URL UI flow를 직접 확인하지 못하면 `not verified yet`으로 blocker를 남긴다.
- 실행 결과:
  1. `resolveLifeZoneActors()` diet actor에 `speechPhoto`를 추가했다. 기존 `speech`는 fallback/alt/title용으로 유지한다.
  2. 사진 선택 기준은 기존 diet speech meal 선택과 동일하게 `lifeZoneLastActivity`/`lifeZoneDietActivity` snapshot meal을 우선하고, 없으면 기존 meal fallback 순서를 따른다.
  3. `home/life-zone.js` actor speech bubble은 `actor.speechPhoto`가 있으면 `.lz-speech--photo` 안에 `<img class="lz-speech-photo">`를 렌더하고, 사진이 없을 때만 기존 `xx냠냠` 텍스트를 렌더한다.
  4. `style.css`에 사진 말풍선 fixed thumbnail 스타일과 mobile size rule을 추가했다.
  5. `sw.js`/`build-info.json` cache version은 이 slice 전용 `tomatofarm-v20260709z6-life-zone-photo-like-flow`로 bump했고, cache marker tests도 같은 값으로 맞췄다.
- 검증:
  1. PASS RED: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js` 구현 전 신규 테스트 실패 확인.
  2. PASS: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js tests/running-session-recovery-behavior.test.js` - 41 tests, 41 pass.
  3. PASS: `node --test tests/*.test.js` - 760 tests, 760 pass.
  4. PASS: `node --check home/life-zone-state.js; node --check home/life-zone.js; node --check sw.js; git diff --check; npm.cmd run verify:assets` - `runtime-assets ok refs=913`.
  5. PASS rendered UI QA: Puppeteer harness at `.omo/evidence/life-zone-meal-photo-bubble/` rendered the attached meal image in the life-zone speech bubble. `bubbleText=""`, `imageAlt="점심냠냠"`, `objectFit="cover"`, console errors none. Evidence: `mobile-390-rerun.png`, `wide-520-rerun.png`, `rerun-result.json`.
  6. not verified yet: production Pages commit/push/deploy verification was not run because this checkout has large pre-existing unrelated dirty changes and local `main` contains other ahead work; deploying now would risk publishing unrelated work.
- 다음 액션: 리뷰 세션에서 이 slice 변경만 검토한다. 현재 worktree에는 `.gitignore`, `render-calendar.js`, Android/Wear, 여러 `.omo/evidence/` 등 이 요청 밖 변경이 섞여 있고 local `main`도 upstream보다 앞서 있으므로, 관련 변경만 안전하게 분리해 별도 commit/push한 뒤 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`와 production UI flow(`홈 -> 오늘의 라이프존`)를 확인한다.

## 2026-07-09 More Menu APK Install

> 현재 동작 아님: 이 항목은 최초 `APK 설치하기` 버튼/워치 설치 브릿지 계획의 historical record다. 현재 운영 동작은 위 `More Menu APK Mobile Download Fix`가 기준이며, `APK 설치하기`는 모바일 APK `tomato-mobile-debug.apk`만 다운로드하고 공개 Wear APK는 제거됐다.

- 상태: `implemented_mobile_app_verified`
- 계획: `docs/ai/features/2026-07-09-more-menu-apk-install.md`
- 리뷰: `docs/ai/reviews/2026-07-09-more-menu-apk-install-review.md`
- 요청: 하단바 `더보기`에 `APK 설치하기` 버튼을 추가해 설치 흐름을 시작할 수 있게 한다.
- 계획 결정:
  1. 브라우저/PWA는 PC `adb install` 또는 local debug APK sideload를 직접 실행할 수 없다.
  2. Android Capacitor APK에서는 기존 `TomatoWearAppUpdate.requestRefreshOrInstall()` native bridge를 reload 없이 호출한다.
  3. PWA/일반 브라우저에서는 실제 설치 완료처럼 표시하지 않고, Android APK 실행 또는 `npm.cmd run install:wear-watch` 안내 toast를 띄운다.
  4. `index.html`, `app.js`, `utils/build-info.js`, `styles/components.css`가 `STATIC_ASSETS`에 있으므로 변경 시 `sw.js` `CACHE_VERSION`을 bump한다.
- 실행 Slice 1:
  1. 완료: `#more-menu`에 `data-app-action="install-apk"` 버튼과 `APK 설치하기` 라벨을 추가했다.
  2. 완료: `app.js` app shell action handler에 `install-apk`를 추가해 `window.__requestTomatoApkInstall({ control, source: 'more-menu' })` 호출 후 더보기 메뉴를 닫는다.
  3. 완료: `utils/build-info.js`에 reload 없는 `requestTomatoApkInstall()`을 export하고 window binding으로 노출했다.
  4. 완료: native bridge가 없거나 Wear install prompt가 실패하면 실제 설치 완료처럼 표시하지 않고 `npm.cmd run install:wear-watch` 안내 toast를 보여준다.
  5. 완료: `styles/components.css`에 기존 nav-icon mask 체계에 맞춘 APK 아이콘을 추가했고, `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260709z2-more-menu-apk-install`로 bump했다.
  6. 완료: 모바일앱 assets 반영을 위해 `node scripts/copy-www.js && npx.cmd cap sync android`를 실행해 `www/`와 `android/app/src/main/assets/public/`에 같은 버튼/handler를 동기화했다.
  7. 완료: `scripts/copy-www.js`가 모바일앱 런타임 dependency(`calc/`, `expert-mode.css`, `test-mode-v2.css`)를 빠뜨려 app shell binding이 실패하던 blocker를 수정했다.
- 검증 결과:
  1. PASS: `git diff --check; node --check app.js && node --check utils/build-info.js && node --check sw.js && npm.cmd run verify:assets && node --test tests/app-shell-action-bridge.test.js tests/wear-app-refresh-update.test.js`.
  2. PASS: `node --test tests/pwa-update-auto-reload.test.js tests/app-shell-action-bridge.test.js tests/wear-app-refresh-update.test.js`.
  3. PASS: `git diff --check; node --check app.js && node --check utils/build-info.js && node --check sw.js && node --check scripts/copy-www.js && npm.cmd run verify:assets && node --test tests/app-shell-action-bridge.test.js tests/wear-app-refresh-update.test.js tests/pwa-update-auto-reload.test.js tests/copy-www-mobile-assets.test.js`.
  4. PASS mobile WebView QA: `android/app/src/main/assets/public`를 임시 HTTP server로 서빙하고 390x844 viewport에서 `더보기 -> APK 설치하기` 클릭을 확인했다. 메뉴가 `flex`로 열리고 label=`APK 설치하기`, 클릭 후 메뉴는 `none`으로 닫히며 fallback toast가 기록됐다. Evidence: `.omo/evidence/more-menu-apk-install/mobile-app-more-menu-apk-open.png`, `.omo/evidence/more-menu-apk-install/mobile-app-more-menu-apk-after-click.png`.
  5. not verified yet: 실제 Android phone APK에서 native `TomatoWearAppUpdate` plugin이 Galaxy Watch 설치/refresh 요청을 수행하는 실기기 flow는 이번 세션에서 실행하지 않았다.
- 다음 액션: 변경 포함 APK를 빌드/설치한 뒤 실기기에서 `더보기 -> APK 설치하기`가 native bridge로 워치 설치/refresh 요청을 보내는지 확인한다.

## 2026-07-09 Diet Frequent Recent Compact

- 상태: `ready_for_review_production_not_verified`
- 계획: `docs/ai/features/2026-07-09-diet-frequent-recent-compact.md`
- 리뷰: `docs/ai/reviews/2026-07-09-diet-frequent-recent-compact-review.md`
- 요청: 식단 탭의 `이때 자주 먹었던 것` 추천 폰트를 줄이고 한 줄에 3개가 들어오게 하며, `최근에 먹은 것`도 위 항목과 중복 없이 최대 3개 표시한다.
- 실행 Slice 1:
  1. `tests/diet-frequent-food-suggestions.test.js`에 빈도/최근 추천 3개, 중복 제외, 3열 스타일 회귀 조건을 추가한다.
  2. `workout/render.js`에 최근 음식 추천 collector와 두 섹션 렌더링을 추가한다.
  3. `style.css` 추천 option 폰트와 grid 밀도를 조정한다.
  4. `sw.js` cache version과 관련 cache marker 테스트를 갱신한다.
- 검증 계획:
  1. RED: `node --test tests/diet-frequent-food-suggestions.test.js`.
  2. PASS 목표: `node --check workout/render.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/diet-frequent-food-suggestions.test.js tests/diet-add-button-binding.test.js tests/save-schema.test.js`.
  4. PASS 목표: `npm.cmd run verify:assets`.
  5. UI 검증: 식단 탭에서 아침/점심/저녁 추천 카드의 3열 배치와 중복 없는 `최근에 먹은 것` 표시, option 클릭 추가 흐름을 확인한다.
- 실행 결과:
  1. 빈도 추천은 기존처럼 최대 3개를 유지하고, 각 추천에 `groupKey`를 포함했다.
  2. 최근 추천 collector를 추가해 같은 끼니 히스토리 최신순 최대 3개를 고르며, 현재 끼니 음식과 빈도 추천 `groupKey`를 제외한다.
  3. 추천 카드는 `이때 자주 먹었던 것`과 `최근에 먹은 것` 두 섹션을 렌더한다.
  4. 추천 option은 3열 grid와 작은 Seed text token으로 조정했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260709z1-diet-recent-compact`로 bump하고 cache marker tests/build-info를 동기화했다.
- 검증:
  1. PASS RED: `node --test tests/diet-frequent-food-suggestions.test.js`가 구현 전 `recent suggestions should have a dedicated collector`에서 실패.
  2. PASS: `node --check workout/render.js && node --check sw.js`.
  3. PASS: `node --test tests/diet-frequent-food-suggestions.test.js tests/diet-add-button-binding.test.js tests/save-schema.test.js` - 63 tests, 63 pass.
  4. PASS: `npm.cmd run verify:assets` - refs=911.
  5. PASS: `node --test tests/*.test.js` - 756 tests, 756 pass.
  6. PASS visual harness: `.omo/evidence/diet-frequent-recent-compact/mobile-390.png`, `mobile-360.png`, `mobile-390.json`, `mobile-360.json`에서 각 섹션 3개, sameRow=true, overflowX=false.
  7. PASS with CRLF warnings only: `git diff --check`.
  8. not verified yet: TypeScript LSP 미설치로 LSP diagnostics 불가.
  9. not verified yet: production Pages commit/push/deploy 검증은 이 요청과 무관한 대량 미커밋 변경 때문에 수행하지 않았다.
- 다음 액션: 관련 변경만 안전하게 분리해 commit/push한 뒤 production Pages에서 `식단 -> 아침/점심/저녁` 추천 카드와 option 클릭 추가 flow를 검증한다.

## 2026-07-08 Wear App Refresh Update Install

- 상태: `ready_for_review_paired_qa_not_verified`
- 계획: `docs/ai/features/2026-07-08-wear-app-refresh-update-install.md`
- 요청: 앱 상단 새로고침 버튼을 누를 때마다 WearOS/Galaxy Watch 쪽도 함께 업데이트 흐름을 타게 하고, 워치에 Tomato Farm 앱이 설치되어 있지 않으면 다운로드할 수 있게 처리한다.
- 계획 결정:
  1. Android/Wear OS는 phone 앱이 watch 앱을 무음 설치/무음 업데이트할 수 없으므로, 누락된 watch에는 Play Store 설치/업데이트 화면을 `RemoteActivityHelper`로 원격 오픈한다.
  2. 이미 설치된 watch에는 `/tomato/app/refresh` Data Layer message를 보내 refresh/update ping을 전달한다.
  3. 운동 저장 bridge(`/tomato/workout/run/complete`, `workout/wear-bridge.js`)와 섞지 않고 별도 `TomatoWearAppUpdate` native plugin/listener로 구현한다.
  4. `android/`가 `.gitignore`에 걸려 새 native 파일이 diff에서 빠지는 문제를 먼저 해결한다.
  5. `utils/build-info.js`를 수정하므로 `sw.js` `CACHE_VERSION`을 같은 변경에서 bump한다.
- 실행 Slice 1:
  1. `tests/wear-app-refresh-update.test.js`를 RED로 추가해 native plugin, capability, listener, RemoteActivityHelper, JS hook 계약을 고정한다.
  2. `.gitignore` Android source/resource 예외를 추가해 새 native 변경이 리뷰 가능한 diff에 포함되게 한다.
  3. `android/app`에 `TomatoWearAppUpdatePlugin`을 추가하고 `MainActivity.java`에 `registerPlugin(...)`을 등록한다.
  4. `android/wear`에 `tomato_farm_wear_app` capability와 `/tomato/app/refresh` listener를 추가한다.
  5. `utils/build-info.js`의 `requestTomatoAppRefresh()` 시작부에서 native plugin을 짧은 timeout으로 호출하고, plugin이 없는 web/PWA에서는 no-op으로 유지한다.
  6. `sw.js` cache version과 관련 cache marker tests를 갱신한다.
- 검증 계획:
  1. RED: `node --test tests/wear-app-refresh-update.test.js`.
  2. PASS 목표: `node --check utils/build-info.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/wear-app-refresh-update.test.js tests/pwa-update-auto-reload.test.js tests/app-shell-action-bridge.test.js tests/wear-workout-bridge.test.js`.
  4. PASS 목표: `npm.cmd run verify:assets`.
  5. PASS 목표: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :app:assembleDebug :wear:testDebugUnitTest :wear:assembleDebug`.
  6. PASS 목표: paired phone/Galaxy Watch에서 refresh click 시 installed watch는 `/tomato/app/refresh` 수신, missing watch는 Play Store 설치 화면 오픈. paired 환경 또는 Play Store listing이 없으면 `not verified yet`으로 blocker를 기록한다.
- 다음 액션: `실행 Slice 1`은 완료됐다. 리뷰 세션에서 paired phone/Galaxy Watch runtime QA를 수행하고, installed watch `/tomato/app/refresh` 수신과 missing watch Play Store install prompt를 검증한다.
- 실행 결과:
  1. `tests/wear-app-refresh-update.test.js`를 RED/GREEN으로 추가했다.
  2. `.gitignore`에 Android source/resource 예외를 추가해 이 slice의 새 native 파일이 git status에 보이도록 했다. 앱 로컬 secret(`google-services.json`, `*.jks`, `*.keystore`, `*.p12`, `*.key`)은 ignore로 보호했다.
  3. `android/app/src/main/java/com/lifestreak/app/wear/TomatoWearAppUpdatePlugin.kt`를 추가했다. installed watch에는 `/tomato/app/refresh`를 보내고, missing watch에는 `RemoteActivityHelper`로 `market://details?id=com.lifestreak.app` 설치 화면을 연다. 동기 prompt 실패는 `failures` summary에 담는다.
  4. `MainActivity.java`에 `TomatoWearAppUpdatePlugin` 등록을 추가했다.
  5. `android/app/build.gradle`에 `androidx.wear:wear-remote-interactions:1.2.0`을 추가했다.
  6. `android/wear/src/main/res/values/wear.xml` capability와 `WearAppRefreshListenerService`/manifest registration을 추가했다. listener는 payload를 decode 전 2048 bytes로 제한한다.
  7. `utils/build-info.js`의 `requestTomatoAppRefresh()`가 reload 전 native Wear update/install bridge를 짧은 timeout으로 호출한다.
  8. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260708z8-wear-app-refresh-install`로 bump하고 cache marker tests/build-info를 동기화했다.
- 검증:
  1. PASS RED: `node --test tests/wear-app-refresh-update.test.js` 구현 전 실패 확인.
  2. PASS: `node --check utils/build-info.js && node --check sw.js`.
  3. PASS: `node --test tests/wear-app-refresh-update.test.js tests/pwa-update-auto-reload.test.js tests/app-shell-action-bridge.test.js tests/wear-workout-bridge.test.js` - 15 tests, 15 pass.
  4. PASS: `npm.cmd run verify:assets` - refs=911.
  5. PASS: `node --test tests/*.test.js` - 754 tests, 754 pass.
  6. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :app:assembleDebug :wear:testDebugUnitTest :wear:assembleDebug` - BUILD SUCCESSFUL.
  7. PASS with existing CRLF warnings: `git diff --check` exited 0. `git check-ignore` confirmed app-local secret files stay ignored and exact new native files are visible.
  8. not verified yet: paired phone/Galaxy Watch runtime QA and missing-watch Play Store install prompt QA could not run in this session.
  9. not verified yet probe: `node --check scripts/verify-wear-refresh-adb.mjs && npm.cmd run verify:wear-refresh -- --mode probe` found `adb` but attached device count was 0. Evidence: `.omo/evidence/wear-app-refresh-update-install/adb-device-probe-latest.txt`.
- evidence: `.omo/evidence/wear-app-refresh-update-install/`
- 리뷰 결과: `not verified yet`. Static/build/security review는 통과했지만, paired phone/Galaxy Watch runtime QA가 attached device 0개로 불가했다. Review note: `docs/ai/reviews/2026-07-08-wear-app-refresh-update-install-review.md`.
- 사용자 피드백: "안되는데? 안깔려있어" / "워치연결되어있는디 안깔려" - Galaxy Wearable에서 연결되어 있어도 PC의 `adb devices`에 phone/watch가 보이지 않으면 debug APK를 설치할 수 없다. local/debug 경로에서는 Play Store listing만 열어서는 watch APK가 설치되지 않는다. `npm.cmd run install:wear-pair`를 추가했고, ADB에 phone/watch가 정확히 하나씩 보이면 serial 없이 자동 판별해 이미 빌드된 phone/watch debug APK를 각각 sideload한다.
- 사용자 피드백: "PC에 연결했으면 PC에서 그냥 다운로드받게하면 안됨? 폰연결왜필요함" - 워치 아이콘/앱 설치만 목적이면 폰 연결은 필요 없다. `npm.cmd run install:wear-watch`를 추가해 ADB에 보이는 Galaxy Watch에 `wear-debug.apk`만 직접 sideload할 수 있게 했다.
- 검증: `npm.cmd run install:wear-watch`가 `192.168.0.106:46473` Galaxy Watch를 자동 선택했고 `watchInstallStatus=0`, `watchPackageInstalledAfter=true`, `result=PASS`를 기록했다. `adb shell monkey -p com.lifestreak.app -c android.intent.category.LAUNCHER 1`도 `launchExit=0`으로 앱 실행이 확인됐다. Evidence: `.omo/evidence/wear-app-refresh-update-install/wear-watch-install-adb-verification.txt`.
- 다음 액션: 워치 앱 아이콘은 설치 완료. 폰 앱 새로고침 버튼이 설치된 워치에 `/tomato/app/refresh`를 보내는 end-to-end 검증을 하려면 phone도 ADB에 연결한 뒤 `npm.cmd run verify:wear-refresh -- --mode installed`를 실행하고, 대기 중 phone 앱 상단 새로고침 버튼을 누른다.

## 2026-07-08 Exercise Program Goal Labels

- 상태: `ready_for_execution`
- 계획: `docs/ai/features/2026-07-08-exercise-program-goal-labels.md`
- 요청: `종목 수정` 바텀시트의 `프로그램` 목표설정에서 `세트`를 `목표 세트`, `볼륨 kg`을 `현재 n세트당 수행 kg`, `볼륨 회`를 `현재 n세트당 수행 횟수`, `증량`을 `3주 후 추가증량목표`로 바꾸고, `목표 세트` 입력을 첫 번째로 받으며 그 값을 뒤의 `n세트당` 라벨에 반영한다.
- 계획 결정:
  1. 대상은 `workout/exercises.js`의 `종목 수정 > 프로그램` editor 영역이다.
  2. 저장 schema와 프로그램 산식은 바꾸지 않고 UI 라벨, 입력 순서, 라벨 동기화만 바꾼다.
  3. `목표 세트` input 값이 바뀌면 `현재 n세트당 수행 kg`/`현재 n세트당 수행 횟수` 라벨의 n을 즉시 업데이트한다.
  4. `workout/exercises.js`가 `STATIC_ASSETS`에 있으므로 `sw.js` `CACHE_VERSION`을 bump하고 cache version 고정 테스트도 갱신한다.
- 실행 Slice 1:
  1. `tests/exercise-program-editor.test.js`에 RED 테스트를 추가해 새 라벨, 구 라벨 제거, `목표 세트` 우선 순서, label sync binding을 고정한다.
  2. `workout/exercises.js`에서 program editor HTML 라벨/순서를 변경하고 label sync helper를 추가한다.
  3. `sw.js`와 cache version 테스트 기대값을 갱신한다.
- 검증 계획:
  1. RED: `node --test tests/exercise-program-editor.test.js`.
  2. PASS 목표: `node --check workout/exercises.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/exercise-program-editor.test.js`.
  4. PASS 목표: `node --test tests/*.test.js`.
  5. PASS 목표: `npm.cmd run verify:assets`.
  6. PASS 목표: production Pages 배포 후 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`.
- 다음 액션: 위 계획의 `실행 Slice 1`을 실행한다. 앱 코드 변경 전 RED 테스트를 먼저 추가한다.

## 2026-07-08 Calendar Goal Input Exercise Editor

- 상태: `ready_for_execution`
- 계획: `docs/ai/features/2026-07-08-calendar-goal-input-exercise-editor.md`
- 요청: 운동 달력의 일요일 왼쪽 목표 칸에 `목표입력` 버튼을 만들고, 클릭 시 바텀시트 드롭다운으로 헬스 운동 종목을 선택한 뒤 선택한 종목의 기존 `종목 수정` 바텀시트를 연다.
- 계획 결정:
  1. 버튼 위치는 기존 workout calendar cycle rail(`.cal-workout-week-rail`)이다. 기존 목표 카드가 있는 주에도 버튼을 함께 표시하고, 빈 주에는 이 버튼이 왼쪽 칸의 주 동작이 된다.
  2. 첫 단계는 실제 `<select>` 기반 `목표입력` 바텀시트다. 후보는 `getExList()`와 `getMuscleParts()` 기준 헬스 근력 종목만 포함하고 러닝/유산소 후보는 제외한다.
  3. 선택 후에는 새 editor를 만들지 않고 기존 `wtOpenExerciseEditor()`와 `#ex-editor-modal`을 재사용한다.
  4. 목표입력 경로에서 열린 `종목 수정` 시트는 취소/저장/삭제 후 exercise picker로 자동 복귀하지 않도록 editor return mode를 추가한다. 기존 picker 경로는 기본값으로 picker 복귀를 유지한다.
  5. 목표입력은 오늘 운동 기록 추가가 아니므로 `saveWorkoutDay()`, `_addWorkoutHomeSession()`, `selectWorkoutExerciseEntry()`를 호출하지 않는다.
- 실행 Slice 1:
  1. `render-calendar.js`에 `목표입력` rail 버튼, capture click binding, 목표입력 dropdown sheet, `loadAndInjectModals()` 후 `wtOpenExerciseEditor(exId, null, { returnToPicker: false, source: 'calendar-goal-input' })` 연결을 추가한다.
  2. `workout/exercises.js`에 editor return mode 옵션을 추가해 기존 picker 복귀와 calendar goal input 직접 진입을 분리한다.
  3. `style.css`에 rail 버튼과 목표입력 sheet/select/action 스타일을 TDS/Seed 토큰으로 추가한다.
  4. `render-calendar.js`, `workout/exercises.js`, `style.css`가 `STATIC_ASSETS`에 있으므로 `sw.js` `CACHE_VERSION`을 bump한다.
  5. `tests/workout-calendar-bottom-sheet.test.js`, `tests/ex-picker-selection-flow.test.js` 또는 `tests/exercise-program-editor.test.js`에 focused regression tests를 추가한다.
- 검증 계획:
  1. RED: `node --test tests/workout-calendar-bottom-sheet.test.js tests/ex-picker-selection-flow.test.js tests/exercise-program-editor.test.js`.
  2. PASS 목표: `node --check render-calendar.js && node --check workout/exercises.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/workout-calendar-bottom-sheet.test.js tests/ex-picker-selection-flow.test.js tests/exercise-program-editor.test.js`.
  4. PASS 목표: `node --test tests/*.test.js`.
  5. PASS 목표: `npm.cmd run verify:assets`.
  6. PASS 목표: production Pages에서 `운동 -> 달력 홈 -> 목표입력 -> 운동 종목 select -> 다음 -> 종목 수정` flow 확인. 선택 종목명이 editor에 보이고 취소/저장 후 picker가 갑자기 열리지 않아야 한다.
- 다음 액션: 위 계획의 `실행 Slice 1`을 실행한다. 계획 범위 밖 앱 변경은 하지 말고, `STATIC_ASSETS` 수정 시 `sw.js` cache version을 같은 변경에 포함한다.

## 2026-07-08 Wear Running Only Shell

- 상태: `ready_for_paired_phone_save_qa`
- 계획: `docs/ai/features/2026-07-08-wear-running-only-shell.md`
- 리뷰: `docs/ai/reviews/2026-07-08-wear-running-only-shell-review.md`
- 진단: `docs/ai/diagnoses/2026-07-09-wear-running-phone-save-payload.md`
- ULW: `.omo/ulw-loop/watch-running-only-20260708/goals.json`
- 요청: 갤럭시워치에서 현재 구현된 6개의 화면과 관련 UX/UI 코드를 삭제하고, 워치 앱을 Tomato Farm 러닝 시작/저장 기능과만 연동한다. 러닝 중 시간/거리/심박수는 반드시 웨어 화면에 동시에 보여야 한다.
- 계획 결정:
  1. 6-page ViewPager 대시보드(`page_streak`, `page_checkin`, `page_workout`, `page_week`, `page_stocks`, `page_timer`)와 우측 6-dot indicator를 제거한다.
  2. 워치 첫 화면은 러닝 전용 start 상태로 바꾸고, active/pause/summary는 하나의 러닝 workflow 상태로 유지한다.
  3. `page_workout.xml`의 비러닝 carousel 후보, 준비중 버튼, 오늘 운동 목록은 삭제한다.
  4. `WearExerciseService`, Health Services metric 수집, `WearWorkoutDataLayer.sendRunComplete()`, phone `workout/wear-bridge.js`의 `saveWorkoutDay({ silent: true })` 저장 경계는 유지한다.
  5. Watch module의 Firestore 직접 읽기/쓰기와 old dashboard용 `FirebaseHelper.fetchWorkouts()/fetchCalEvents()` 경로는 제거한다.
- 실행 Slice 1:
  1. `tests/wear-running-only-shell.test.js`를 RED로 추가해 ViewPager/dots/old page refs/coming-soon carousel/Firestore dashboard reads가 남으면 실패하게 한다.
  2. `activity_main.xml`, `page_workout.xml`, `MainActivity.kt`, `WearWorkoutUiController.kt`, 필요 시 `WearRunUiState.kt`, `android/wear/build.gradle`을 러닝 전용 셸로 축소한다.
  3. 더 이상 참조되지 않는 `page_streak.xml`, `page_checkin.xml`, `page_week.xml`, `page_stocks.xml`, `page_timer.xml`, `FirebaseHelper.kt`는 삭제한다.
  4. 기존 wear bridge/Health Services/GPS 계약 테스트를 함께 통과시킨다.
  5. Watch surface QA와 paired phone/watch 저장 QA 증거를 `.omo/evidence/wear-running-only-shell-20260708/`에 남긴다.
- 검증 계획:
  1. RED: `node --test tests/wear-running-only-shell.test.js`.
  2. PASS 목표: `node --test tests/wear-running-only-shell.test.js`.
  3. PASS 목표: `node --test tests/wear-workout-bridge.test.js tests/wear-slice3-health-services.test.js tests/wear-gps-running-contract.test.js tests/running-entry.test.js tests/workout-save-mode-guard.test.js`.
  4. PASS 목표: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :app:assembleDebug :wear:assembleDebug`.
  5. PASS 목표: Watch APK 실행 첫 화면에 러닝 start만 보이고, 6-dot indicator와 vertical swipe page가 없으며, active 화면에서 시간/거리/심박수가 동시에 보인다.
  6. PASS 목표: paired phone/watch에서 final stop 후 phone Tomato Farm 해당 날짜 운동 카드/캐러셀에 `wear-running` cardio entry가 저장된다. paired 환경이 없으면 `not verified yet`으로 남긴다.
- 실행 결과:
  1. `activity_main.xml`은 `page_workout.xml` 단일 include로 축소했고 `ViewPager2`/6-dot indicator를 제거했다.
  2. `page_workout.xml`은 러닝 준비/진행/일시정지/요약 상태만 남겼고 active 화면에서 시간/거리/심박수 슬롯을 동시에 표시한다.
  3. `MainActivity.kt`의 6-page dashboard, Firestore read helper, timer, stocks, weekly/check-in binding을 제거했다.
  4. `WearWorkoutUiController.kt`의 coming-soon carousel 코드를 제거하고 `READY` 기반 러닝 workflow만 유지했다.
  5. old layout/helper/drawable 파일과 unused `RecyclerView`/`ViewPager2` dependency를 제거했다.
- 검증:
  1. PASS RED: `node --test tests/wear-running-only-shell.test.js` 기존 코드에서 실패 확인.
  2. PASS GREEN: `node --test tests/wear-running-only-shell.test.js tests/wear-slice2-artifacts.test.js tests/wear-workout-bridge.test.js tests/wear-slice3-health-services.test.js tests/wear-gps-running-contract.test.js tests/running-entry.test.js tests/workout-save-mode-guard.test.js` - 30 tests, 30 pass.
  3. PASS Gradle: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :wear:assembleDebug :app:assembleDebug` - BUILD SUCCESSFUL.
  4. PASS Wear emulator QA: `TomatoWearSmallRound`에서 `watch-ready.png`, `watch-active.png`, `watch-paused.png`, `watch-summary.png` 캡처. 첫 화면은 러닝 전용이고 active 화면은 시간/거리/심박수 동시 표시.
  5. PASS fallback QA: `BODY_SENSORS` denied/user-fixed 상태에서 `watch-permission-fallback.png` 캡처. 앱 crash 없이 심박 slot이 `-- bpm` fallback.
  6. not verified yet: paired phone/watch Data Layer 저장 완료와 phone WebView `saveWorkoutDay({ silent: true })` 실제 호출은 paired phone node가 없어 on-device 검증하지 못했다. 정적/단위 테스트는 통과했고 watch summary는 `폰 연결 대기`를 표시했다.
- evidence: `.omo/evidence/wear-running-only-shell-20260708/`
- 리뷰 결과: 부분 해결. `android/wear`/phone workout bridge 추적 정책은 `.gitignore` 정확한 예외와 `tests/wear-running-only-shell.test.js` 회귀 테스트로 해결했다. paired phone/watch Data Layer 저장 완료와 phone WebView `saveWorkoutDay({ silent: true })` 실제 호출은 아직 `not verified yet`이다.
- 사용자 피드백: 워치 summary에 `폰 저장 payload 오류`가 표시됨. 원인은 phone/PWA 저장 단계가 아니라 watch-side `WearRunSession.toPayload()` 실패 경로였고, 1초 미만 Health Services duration이 `durationSec=0`으로 내려가 payload 검증에서 실패할 수 있었다.
- 수정 결과:
  1. `WearWorkoutUiController.kt`에 `buildWearRunSessionForSummary()`를 추가해 종료 payload duration을 `maxOf(exerciseSnapshot.activeDurationMs, uiSnapshot.durationMs, 1_000L)`로 계산한다.
  2. payload 생성 실패는 `TomatoWearRun` logcat tag로 남긴다.
  3. `WearRunUiStateTest.kt`에 1초 미만 duration 회귀 테스트를 추가했다.
  4. phone native workout bridge, Wear source/layout/test/build.gradle이 `git check-ignore`에 걸리지 않도록 `.gitignore`와 테스트를 갱신했다.
- 검증:
  1. PASS RED: `node --test tests/wear-running-only-shell.test.js`가 수정 전 ignored 파일 목록 때문에 실패.
  2. PASS GREEN: `node --test tests/wear-running-only-shell.test.js` - 5 tests, 5 pass.
  3. PASS: `node --test tests/wear-running-only-shell.test.js tests/wear-workout-bridge.test.js tests/wear-slice3-health-services.test.js tests/wear-gps-running-contract.test.js tests/running-entry.test.js tests/workout-save-mode-guard.test.js tests/wear-app-refresh-update.test.js` - 33 tests, 33 pass.
  4. PASS: `git diff --check` exited 0 with existing CRLF warnings only.
  5. not verified yet: watch ADB는 `192.168.0.106:46473 offline`이고 reconnect가 `10060` timeout으로 실패했다.
  6. not verified yet: PWA browser 단독은 Wear Data Layer receiver가 없으므로 워치 기록 저장 검증 대상이 아니다. phone Android APK의 `TomatoWearWorkoutListenerService`/`TomatoWearWorkoutBridge`가 필요하다.
- 다음 액션: 워치를 Wireless debugging으로 재페어링한 뒤 phone APK와 watch APK를 모두 설치한다. phone 앱이 로그인된 상태에서 워치 러닝 `시작 -> 최종종료`를 수행하고, phone Tomato Farm 운동 탭 해당 날짜 `러닝` 카드에 `wear-running` cardio entry가 저장되는지 확인한다.

## 2026-07-08 App Refresh Deployment Check

- 상태: `complete`
- 진단: `docs/ai/diagnoses/2026-07-08-app-refresh-deployment-check.md`
- 요청: 헤더 새로고침 버튼을 눌렀는데도 화면이 그대로인 상황에서, 강제 새로고침 기능이 실제 동작하는지와 최신 변경이 production Pages에 배포된 것이 맞는지 확인한다.
- 결론:
  1. production Pages 배포는 정상이다. `origin/main`/로컬 `HEAD`/production `build-info.json`이 모두 `b7a6a43ba5749b36fe925058a8b884fa15891385`를 가리킨다.
  2. production `sw.js` cache version은 `tomatofarm-v20260707z20-refresh-cardio-intensity`다.
  3. 오버레이가 없는 로그인 상태에서는 `#app-refresh-btn` 좌표 클릭이 `window.__requestTomatoAppRefresh({ source: 'top-nav' })`까지 도달하고 reload navigation이 발생한다.
  4. 비로그인 화면이나 길드 온보딩 overlay가 떠 있으면 실제 클릭 타깃이 `#login-screen` 또는 `#guild-onboarding-overlay`라서 헤더 버튼 클릭이 막힌다.
- 검증:
  1. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ b7a6a43ba5749b36fe925058a8b884fa15891385`.
  2. PASS: production direct fetch에서 `build-info.json`, `sw.js`, `index.html` marker 확인.
  3. PASS: `node --test tests/pwa-update-auto-reload.test.js tests/app-shell-action-bridge.test.js` - 10 tests, 10 pass.
  4. PASS: production Chromium QA - 오버레이 없는 로그인 상태에서 refresh click `navigated=true`, `afterRefreshCalled.source="top-nav"`.
  5. PASS: `git diff --check`.
- 후속 선택지: 사용자가 원하면 로그인/길드 온보딩 overlay 위에서도 refresh를 누를 수 있게 하는 별도 fix 계획을 작성한다. 앱 코드는 이번 진단에서 수정하지 않았다.

## 2026-07-08 Diet Frequent Food Quick Add

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-08-diet-frequent-food-quick-add.md`
- ULW: `.omo/ulw-loop/diet-quick-add-suggestions-20260708/goals.json`
- 요청: 식단 탭의 아침/점심/저녁 `메모 (선택)` visible 영역을, 이용자가 해당 끼니에 자주 추가하던 음식 2~3개 빠른추가 버튼으로 대체한다. 버튼을 누르면 기존 `wtAddFoodItem(meal, item)` 저장 경로로 자동 추가된다.
- 계획 결정:
  1. 추천은 고정 목록이 아니라 현재 사용자 cache의 `bFoods/lFoods/dFoods` 히스토리에서 끼니별 빈도와 최근성을 계산한다.
  2. 히스토리가 부족하면 임의 기본 추천을 만들지 않고 추천 영역을 숨긴다.
  3. 새 Firestore top-level 필드나 settings 저장 없이 기존 food item shape와 `_autoSaveDiet({ meal })` 경로를 재사용한다.
  4. 아침/점심/저녁만 변경하고 간식은 이번 slice에서 제외한다.
  5. 기존 `wt-meal-breakfast/lunch/dinner` input id는 저장 동기화와 기존 텍스트 데이터 보존을 위해 DOM에 남긴다.
- 실행 Slice 1:
  1. `index.html` 아침/점심/저녁 visible `메모 (선택)` 자리를 `diet-frequent-foods` container로 대체한다.
  2. `workout/render.js`에 끼니별 추천 후보 계산, 렌더, `wtAddFrequentFoodSuggestion(meal, key)`를 추가한다.
  3. `app.js` `.diet-grid` 위임 핸들러에 `data-action="addFrequentFood"`를 연결한다.
  4. 필요한 경우 `workout/index.js`와 `render-workout.js` export/window 노출을 동기화한다.
  5. `style.css`에 TDS/Seed 기반 compact chip 스타일을 추가한다.
  6. `STATIC_ASSETS` 대상 파일 변경에 맞춰 `sw.js` `CACHE_VERSION`을 bump한다.
  7. focused tests와 browser QA, production Pages verification을 수행한다.
- 검증 계획:
  1. RED: 추천 chip/action이 없는 현재 코드에서 focused test가 먼저 실패한다.
  2. PASS 목표: `node --check app.js && node --check workout/render.js && node --check workout/index.js && node --check render-workout.js && node --check sw.js`.
  3. PASS 목표: `node --test tests/diet-add-button-binding.test.js tests/diet-frequent-food-suggestions.test.js tests/save-schema.test.js`.
  4. PASS 목표: `node --test tests/*.test.js`.
  5. PASS 목표: `npm.cmd run verify:assets`.
  6. PASS 목표: 모바일 식단 탭에서 큰 추천 묶음 chip과 inline 추천 option 표시, 클릭 자동 추가, skip 해제 후 추가, 후보 없음 상태, 기존 quick-add flow를 확인한다.
  7. PASS 목표: `npm.cmd run deploy:production` 후 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`.
- 실행 결과:
  1. 아침/점심/저녁의 visible `메모 (선택)` 위치를 `diet-frequent-foods` 추천 묶음 container로 대체했고, 기존 `wt-meal-*` input은 숨김 DOM으로 유지했다.
  2. 최근 90일 cache의 끼니별 `bFoods/lFoods/dFoods`에서 같은 이름/중량이 2회 이상 나온 음식만 최대 3개 추천한다. 현재 날짜와 이미 현재 끼니에 들어간 음식은 제외한다.
  3. `data-action="addFrequentFood"` 버튼은 `wtAddFrequentFoodSuggestion(meal, key)`로 연결되고, skipped 상태면 해제한 뒤 기존 `wtAddFoodItem()`/`_autoSaveDiet({ meal })` 경로로 저장한다.
  4. `app.js`, `render-workout.js`, `workout/index.js` query marker와 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260708z3-diet-frequent-foods` 기준으로 동기화했다.
  5. cache marker를 직접 고정하던 기존 테스트들의 기대값을 새 cache version으로 갱신했다.
- 로컬 검증:
  1. RED 확인: 추천 영역/action 부재로 focused tests 3건이 실패하는 것을 먼저 확인했다.
  2. PASS: `node --check app.js && node --check workout/render.js && node --check workout/index.js && node --check render-workout.js && node --check sw.js`.
  3. PASS: `node --test tests/diet-add-button-binding.test.js tests/diet-frequent-food-suggestions.test.js tests/save-schema.test.js`.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=909`.
  5. PASS: `node --test tests/*.test.js` - 744 tests, 744 pass.
  6. PASS: `git diff --check`.
- 운영 검증:
  1. PASS: `npm.cmd run deploy:production` - `5f392eb9b6876028573c3a30de8ae31dfa5cd1a7`를 `origin/main`에 push하고 Pages deploy verify 통과.
  2. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 5f392eb9b6876028573c3a30de8ae31dfa5cd1a7` - deployed commit/cache/static assets 확인.
  3. PASS 목표: production browser QA - 모바일 390x844에서 아침/점심/저녁 큰 추천 묶음 chip, 좌측 상단 `이때 자주 먹었던 것` label, inline 추천 option, 붉은 `+` 표시, visible 메모 input 0개, snack 추천 container 없음, 점심 추천 클릭 시 `안 먹었어요` 해제 및 음식 자동 추가 확인.
  4. PASS 목표: visual QA - 실제 섭취 음식 chip은 더 두껍고 bold, 추천 option은 옅고 regular weight로 구분되는지 확인한다.
- 리뷰: `docs/ai/reviews/2026-07-08-diet-frequent-food-quick-add-review.md`
- 다음 액션: 최종 UI 변경을 검증하고 production Pages 배포/검증을 완료한 뒤 이 항목을 최신 commit 기준으로 갱신한다.

## 2026-07-07 Refresh Unification Cardio Intensity

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-07-refresh-unification-cardio-intensity.md`
- 요청: 새 헤더 새로고침 버튼으로 중복 update/refresh UI를 통합하고, 유산소에 `마이마운틴`을 추가한다. `마이마운틴`은 각도, `스텝머신`은 단계를 입력받아 자동 칼로리 계산과 저장 카드에 반영한다. 새 이미지를 생성하고 cache version/static assets, production Pages 배포 검증까지 수행한다.
- 실행 Slice 1:
  1. `utils/build-info.js` legacy floating `#app-update-indicator`를 헤더 `#app-refresh-btn` 상태로 통합한다.
  2. `workout/exercises.js` `CARDIO_PICKER_EXERCISES`에 `마이마운틴`과 종목별 강도 입력/칼로리 multiplier를 추가한다.
  3. `render-calendar.js` 날짜 시트 유산소 카드에 각도/단계 metric을 표시한다.
  4. `assets/workout/cardio/my-mountain.png`를 기존 회색 PNG 톤으로 생성한다.
  5. `style.css`, `sw.js`, focused tests, browser QA, production deploy verification을 갱신한다.
- 검증:
  1. PASS: `git diff --check`.
  2. PASS: `node --check app.js && node --check utils/build-info.js && node --check workout/exercises.js && node --check render-calendar.js && node --check sw.js`.
  3. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=905`.
  4. PASS: `node --test tests/*.test.js` - 741 tests, 741 pass.
  5. PASS: local browser QA harness - 헤더 refresh button 1개, legacy update indicator 0개, `마이마운틴` 목록 1개, angle 12 -> 522 kcal, step level 10 -> 450 kcal, pageerror 없음.
  6. PASS: `npm.cmd run deploy:production` - `f42b2e8ad398055a1c1899d3a2ffda141b200c40`를 `origin/main`에 push하고 Pages deploy verify 통과.
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ f42b2e8ad398055a1c1899d3a2ffda141b200c40`.
  8. PASS: deployed marker 검증 - `index.html::20260707e-refresh-cardio-intensity`, `app.js::20260707e-refresh-cardio-intensity`, `utils/build-info.js::app-refresh-btn`, `workout/exercises.js::my-mountain`, `workout/exercises.js::ex-cardio-angle`, `workout/exercises.js::ex-cardio-level`, `render-calendar.js::angleDeg`, `sw.js::assets/workout/cardio/my-mountain.png`.
  9. PASS: production browser QA - actual URL HTTP 200, pageerror 0, `#app-refresh-btn` 1개, legacy `#app-update-indicator` 0개, DOM click 후 page complete.
  10. PASS: production module harness QA - deployed `workout/exercises.js` 기준 `마이마운틴` 목록 1개, `my-mountain.png` HTTP 200, angle 12 -> 522 kcal, step level 10 -> 450 kcal, pageerror/console error 없음.
- 리뷰: `docs/ai/reviews/2026-07-07-refresh-unification-cardio-intensity-review.md`
- 다음 액션: 없음. 사용자는 운영 URL에서 로그인 후 헤더 새로고침 버튼, `운동 -> 종목 추가 -> 유산소 -> 마이마운틴/스텝머신` flow를 확인한다.

## 2026-07-07 Header App Refresh Update

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-07-header-app-refresh-update.md`
- 요청: 알림 아이콘 오른쪽에 항상 보이는 새로고침 아이콘을 추가하고, 누르면 최신 `CACHE_VERSION`/배포본을 확인·적용한다. 최근 코드 수정이 반영되지 않은 것처럼 보이면 운영 Pages 배포와 검증까지 수행한다.
- 실행 Slice 1 완료:
  1. `index.html` `#notif-bell` 바로 오른쪽에 `id="app-refresh-btn"` 새로고침 버튼을 추가했다.
  2. 버튼은 `data-app-action="refresh-app-update"`를 사용하며 inline handler를 추가하지 않았다.
  3. `app.js` app shell action bridge에 `refresh-app-update` case를 추가했다.
  4. `utils/build-info.js`에 `requestTomatoAppRefresh()`를 추가하고 `window.__requestTomatoAppRefresh`로 노출했다.
  5. `STATIC_ASSETS` 변경에 맞춰 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260707z19-wear-bridge-load-binding`로 bump하고 cache/query marker 테스트를 갱신했다.
  6. production QA 중 발견한 `workout/index.js` top-level `loadWorkoutDate is not defined` 회귀를 local import로 수정하고 `app.js -> render-workout.js -> workout/index.js` query marker를 갱신했다.
- 검증:
  1. PASS: `node --check app.js && node --check utils/build-info.js && node --check pwa-register.js && node --check sw.js`.
  2. PASS: `node --test tests/app-shell-action-bridge.test.js tests/pwa-update-auto-reload.test.js tests/workout-active-session-recovery.test.js`.
  3. PASS: `npm.cmd run verify:assets`.
  4. PASS: `node --test tests/*.test.js` - 741 tests, 741 pass.
  5. PASS: `git diff --check`.
  6. INFO: TypeScript LSP diagnostics는 local LSP 미설치로 실행하지 못했다.
  7. PASS: `npm.cmd run deploy:production` - `origin/main` Pages 배포와 `verify:deploy` 통과.
  8. PASS: deployed marker 검증 - `index.html::app-refresh-btn`, `app.js::__requestTomatoAppRefresh`, `render-workout.js::workout/index.js?v=20260707d-wear-bridge-load-binding`, `workout/index.js::import { loadWorkoutDate`, `sw.js::tomatofarm-v20260707z19-wear-bridge-load-binding`.
  9. PASS: production Puppeteer QA - 모바일 390x844에서 `#notif-bell` 오른쪽에 `#app-refresh-btn`이 보이고 click 후 reload, `window.__requestTomatoAppRefresh === true`, pageerror 없음. Screenshot: `.omo/evidence/header-app-refresh-update/production-mobile-header-puppeteer.png`.
  10. INFO: in-app browser 기존 탭은 이전 service worker cache로 `app.js?v=20260707c-header-app-refresh`를 한 번 보여줬다. 배포 파일 marker와 clean Puppeteer production session은 최종 `20260707d`/`z19`를 확인했다.
- 다음 액션: 없음. 사용자는 운영 URL에서 헤더 새로고침 버튼을 눌러 최신 앱 reload를 확인한다.

## 2026-07-07 Workout Rest Counter

- 상태: `local_browser_verified_production_not_verified`
- 계획: `docs/ai/features/2026-07-07-workout-rest-counter.md`
- ULW: `.omo/ulw-loop/rest-counter-20260707/goals.json`
- 요청: 사진 속 초록 원형 스탑워치처럼 운동 화면에 세트 간 쉬는시간 카운터를 구현하고, 시간이 초과되면 초과 시간을 증가 방향으로 계속 카운팅하며, 더블클릭으로 총 쉬는시간을 변경하고, 세트 간 쉬는시간 기록을 저장해 통계 `전체통계` raw export에서 추출 가능하게 한다.
- 계획 결정:
  1. 기존 `workout/timers.js` rest timer를 새 시스템으로 대체하지 않고 원형 UI/저장 메타데이터로 확장한다.
  2. set-level 휴식 메타데이터를 원본으로 저장하고, raw export 편의를 위해 top-level `restBetweenSets` 배열도 저장한다.
  3. `index.html`, `style.css`, `workout/timers.js`, `workout/exercises.js`, `workout/save.js`, `workout/save-schema.js`, `render-stats.js` 수정 시 `sw.js` `CACHE_VERSION`을 함께 bump한다.
- 실행 Slice 1:
  1. 세트 완료 시 초록 원형 카운터를 띄우고 남은 시간을 ring + `mm:ss`로 표시한다.
  2. 목표 시간을 초과하면 카운터를 닫지 않고 초과 시간을 증가 방향으로 표시한다.
  3. 카운터 더블클릭으로 총 쉬는시간 변경 sheet/control을 연다.
  4. 세트 간 쉬는시간을 set-level metadata와 `restBetweenSets` top-level 배열로 저장한다.
  5. `전체통계` raw export에서 `daily[].raw.workout.restBetweenSets`를 추출할 수 있게 한다.
- 실행 요약:
  1. 기존 `#wt-rest-section`을 초록 원형 SVG ring 카운터로 바꾸고 `#wt-rest-time`을 중앙에 배치했다.
  2. `wtRestTimerStart(seconds, context, meta)`가 세트 origin을 받아 `restStartedAt`, `restPlannedSec`, `restElapsedSec`, `restOverSec`, `restEndedBy`를 세트에 기록한다.
  3. 시간 초과 후에도 타이머를 닫지 않고 기존 `_formatTime()` 경로의 `+m:ss` 증가 표시를 유지한다.
  4. 실행 중 프리셋 변경은 타이머를 재시작하지 않고 총 쉬는시간만 바꿔 현재 elapsed 기준으로 남은/초과 시간을 다시 계산한다.
  5. 저장 payload에 `restBetweenSets`를 추가하고 `WORKOUT_PAYLOAD_KEYS`에 포함해 `전체통계` raw export에서 추출 가능하게 했다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260707z19-wear-bridge-load-binding`로 bump했고 `build-info.json`도 `verify:assets`로 갱신됐다.
- 검증:
  1. PASS: RED/GREEN `node --test tests/workout-rest-counter.test.js`.
  2. PASS: Data/export `node --test tests/workout-rest-counter.test.js tests/stats-raw-export-download.test.js tests/save-schema.test.js`.
  3. PASS: `node --check workout/timers.js workout/exercises.js workout/save.js workout/save-schema.js workout/state.js render-stats.js`.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=898`.
  5. PASS: `git diff --check`.
  6. PASS: 임시 localhost visual harness at `390x844` - `#wt-rest-section` visible, green circular ring, `#wt-rest-time = 0:58`, double-click handler attribute, no counter/control overlap, screenshot/action log captured, browser tab/viewport/server cleanup confirmed.
  7. not verified yet: production Pages 배포/검증과 인증된 실제 UI flow exercise.
- evidence: `.omo/evidence/rest-counter-20260707/`
- 리뷰: `docs/ai/reviews/2026-07-07-workout-rest-counter-review.md`
- 다음 액션: unrelated dirty worktree를 정리한 뒤 production Pages 배포/검증을 수행하고, 인증된 배포 URL에서 `운동 -> 세트 완료 -> 원형 쉬는시간 카운터 -> 더블클릭 휴식시간 변경 -> 전체통계 다운로드` flow를 확인한다.

## 2026-07-07 Life Zone Weight Motion

- 상태: `review_passed_production_not_verified`
- 계획: `docs/ai/features/2026-07-07-life-zone-weight-motion.md`
- ULW: `.omo/ulw-loop/lifezone-weight-motion-20260707/goals.json`
- 요청: 러닝 후 웨이트 기구 운동도 한 경우 홈 라이프존 캐릭터가 러닝이 아니라 웨이트 모션을 취하고, 웨이트 모션은 하체=스쿼트, 가슴=벤치프레스 우선으로 배정하되 해당 위치 점유 시 다른 웨이트 모션으로 fallback한다.
- 실행 Slice 1:
  1. active running은 러닝 트랙 우선으로 유지한다.
  2. saved running + workout 동시 기록은 workout 우선으로 바꾼다.
  3. workout large muscle 기반 preferred slot을 추가해 `chest -> bench`, `lower/glute -> squat`, `back -> lat`, `unknown/default -> bench`를 우선 배정한다.
  4. preferred workout slot이 이미 점유되어 있으면 다른 workout slot으로 fallback한다.
  5. `home/life-zone-state.js`가 `STATIC_ASSETS` 대상이면 `sw.js` `CACHE_VERSION`을 bump한다.
- 실행 요약:
  1. active running은 계속 러닝 트랙을 우선하도록 유지했다.
  2. active running이 아닌 saved running + workout 동시 기록은 workout을 우선하도록 바꿨다.
  3. workout actor에 large muscle 기반 preferred slot을 추가해 `chest -> bench`, `lower/glute -> squat`, `back -> lat`, `unknown/default -> bench`를 우선 배정한다.
  4. preferred workout slot이 점유되어 있으면 남은 workout slot으로 fallback한다.
  5. `home/life-zone-state.js`가 `STATIC_ASSETS`에 포함되어 `sw.js` `CACHE_VERSION`을 bump했다. 이후 같은 dirty worktree의 rest-counter slice가 현재 `CACHE_VERSION`을 `tomatofarm-v20260707z19-wear-bridge-load-binding`로 다시 올렸고, cache marker 테스트도 현재 `sw.js` 기준으로 동기화했다.
  6. saved running-only가 `workout`으로 오분류되지 않도록 `hasLifeZoneWeightWorkoutActivity()`를 분리했다.
- 검증:
  1. RED/GREEN: `node --test tests/home-life-zone-state.test.js` - RED 2건 확인 후 GREEN 27 pass.
  2. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js` - 37 pass.
  3. PASS: `node --check home/life-zone-state.js`, `node --check tests/home-life-zone-state.test.js`, `node --check sw.js`.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=895`.
  5. PASS: `git diff --check` scoped to 라이프존/테스트/cache 변경.
  6. PASS: 375x812 Puppeteer DOM harness - `lz-actor--workout lz-actor--pose-workout-bench`, `jups-workout-bench.png`.
  7. BROAD: `node --test tests/*.test.js`는 현재 별도 `tests/workout-rest-counter.test.js` 실패가 있어 이 slice의 승인 근거로 쓰지 않았다. `tests/pwa-update-auto-reload.test.js`는 QA 재실행에서 단독 PASS.
- evidence: `.omo/evidence/lifezone-weight-motion-20260707/`
- 리뷰: `docs/ai/reviews/2026-07-07-life-zone-weight-motion-review.md`
- 리뷰 결과: PASS. QA/code/security/context gate 모두 current source 기준 승인. production Pages deploy/UI verification은 unrelated dirty/staged worktree 때문에 `not verified yet`.
- 다음 액션: production Pages 배포/검증은 현재 워크트리의 unrelated staged/unstaged 변경을 정리한 뒤 `npm.cmd run deploy:production`과 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`로 수행한다.

## 2026-07-06 Wear Cardio Running POC

- 상태: `slice6_local_complete_needs_paired_device_save_verification`
- 계획: `docs/ai/features/2026-07-06-wear-cardio-running-poc.md`
- ULW: `.omo/ulw-loop/tomato-wear-cardio-poc-20260706/goals.json`
- 요청: 첨부 사진 4장을 참고해 Tomato Farm Android APK와 Galaxy Watch용 앱을 만들고, 워치 운동 캐러셀에서 POC로 `런닝/조깅`을 구현한다. 운동 중 화면에는 심박수를 포함하고, 최종 종료 시 폰에서 종목 추가 저장한 것처럼 그날 운동 카드/캐러셀에 저장한다.
- 계획 결정:
  1. Watch는 Firestore를 직접 쓰지 않고 Wear OS Data Layer로 폰 앱에 final workout payload를 보낸다.
  2. 폰 앱은 기존 `data.js`/`saveWorkoutDay()` 경계를 통해 `S.workout.exercises` cardio/running card entry로 저장한다.
  3. 심박수는 Health Services `ExerciseClient`와 기본 batching을 우선하고, 저장 payload는 10초 bucket 샘플/avg/max bpm으로 정규화한다.
  4. 초기 POC는 GPS route를 제외했지만, 사용자 실제 워치 제보에 따라 Slice 6에서 GPS route 저장까지 포함했다. Health Connect/iOS pair는 계속 제외한다.
- 실행 Slice 1:
  1. `android/wear`에 Watch 런닝 payload 모델/serializer를 추가한다.
  2. heart-rate 10초 샘플 정규화, 평균/최고 심박, 거리/페이스 계산 계약을 JVM test로 RED/GREEN 한다.
  3. Watch UI, Health Services 실제 연결, Data Layer 송신, phone 저장 bridge는 Slice 1에서 건드리지 않는다.
- 계획 기준:
  1. RED/GREEN: `.\android\gradlew.bat -p android :wear:testDebugUnitTest`.
  2. evidence: `.omo/evidence/wear-cardio-running-poc/slice1-red-green.txt`.
- 실행 요약:
  1. `WearWorkoutType`, `HeartRateSample`, `WearRunSession`, `WearRunSummary`, `WearWorkoutPayload`를 추가했다.
  2. payload JSON은 `{ type: "running", source: "wear", dateKey, startedAt, endedAt, durationSec, distanceKm, avgPaceSecPerKm, avgHeartRateBpm, maxHeartRateBpm, samples10s }` 계약을 따른다.
  3. 심박 샘플은 30-240bpm 범위와 세션 시간 안의 값만 사용하고 10초 bucket으로 정규화한다.
  4. malformed date/end/distance 입력은 payload 생성 전 거부하고, 실제 calendar date와 payload 크기 상한(6시간, raw HR 50,000개, 10초 bucket 2,161개)을 검증한다.
  5. `android/`는 `.gitignore` 대상이라 추후 native 파일 커밋 시 `git add -f`가 필요하다.
- 검증:
  1. RED: focused JVM test가 모델 미존재 `Unresolved reference`로 실패함을 확인했다.
  2. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest --tests com.lifestreak.wear.workout.WearRunPayloadTest`.
  3. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :wear:assembleDebug`.
  4. PASS: security hardening rerun `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :wear:assembleDebug`.
  5. evidence: `.omo/evidence/wear-cardio-running-poc/slice1-red-green.txt`.
- 산출물: `android/wear/build/outputs/apk/debug/wear-debug.apk` 생성됨. 단, Slice 1 범위의 debug APK이며 Watch UI/저장 bridge는 아직 포함하지 않는다.
- 리뷰: `docs/ai/reviews/2026-07-06-wear-cardio-running-poc-slice1-review.md`
- 리뷰 결과: PASS. 보안 리뷰에서 지적한 payload 크기 상한과 실제 날짜 검증을 보강한 뒤 재리뷰 PASS.
- 다음 액션: paired physical phone/watch 또는 Android Studio paired emulator에서 phone app까지 설치해 Data Layer 저장 완료와 토마토앱 해당 날짜 운동 카드/캐러셀 생성을 검증한다.
- Slice 2 완료 요약:
  1. `page_workout.xml`에 유산소 캐러셀, `런닝/조깅` start button, active/pause/summary 화면을 추가했다.
  2. `WearWorkoutUiController`가 Watch UI 바인딩과 active tick을 관리하고, `WearRunUiState`가 elapsed/distance/pace/HR 표시 상태를 계산한다.
  3. 기존 오늘 운동 기록은 캐러셀 아래 ScrollView에 유지했다.
  4. PASS: `node --test tests/wear-slice2-artifacts.test.js`.
  5. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :wear:assembleDebug`.
  6. PASS: Wear OS 5 small round AVD `TomatoWearSmallRound`에서 `picker`, `active`, `paused`, `summary` screenshots 캡처.
  7. 리뷰: `docs/ai/reviews/2026-07-06-wear-cardio-running-poc-slice2-review.md`.
  8. evidence: `.omo/evidence/wear-cardio-running-poc/slice2-watch-ui.png`, `.omo/evidence/wear-cardio-running-poc/slice2-action-log.txt`.
- Slice 3 완료 요약:
  1. `WearExerciseService` foreground service가 Health Services `ExerciseClient`를 소유하고 `RUNNING` exercise를 start/pause/resume/end 한다.
  2. 권한은 `ACTIVITY_RECOGNITION`, `BODY_SENSORS`, API 36+ `android.permission.health.READ_HEART_RATE`, foreground service health type을 선언/요청한다.
  3. metric은 `HEART_RATE_BPM`, `DISTANCE_TOTAL`, `SPEED`, `ACTIVE_EXERCISE_DURATION_TOTAL`를 capability와 교차 요청하고, UI에는 최신 bpm/distance를 반영한다.
  4. `WearExerciseMetricAccumulator`가 저장 payload용 심박 샘플을 10초 bucket으로 제한한다.
  5. `health-services-client:1.1.0-rc02`는 현재 Kotlin 1.9.22와 metadata가 맞지 않아 AndroidX stable `1.0.0`과 Android Guava `33.2.1-android`를 사용했다.
  6. PASS: `node --test tests/wear-slice3-health-services.test.js`.
  7. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :wear:testDebugUnitTest :wear:assembleDebug`.
  8. PASS: Wear AVD `TomatoWearSmallRound`에서 최종 APK 설치 -> 권한 grant -> 운동 page -> `런닝/조깅` start -> 12초 후 `115 bpm` active 화면과 foreground service 확인 -> pause/final stop -> summary/cleanup 확인.
  9. evidence: `.omo/evidence/wear-cardio-running-poc/slice3-watch-active-hr-final.png`, `.omo/evidence/wear-cardio-running-poc/slice3-final-runtime-active-adb.txt`, `.omo/evidence/wear-cardio-running-poc/slice3-runtime-cleanup.txt`, `.omo/evidence/wear-cardio-running-poc/slice3-emulator-cleanup.txt`.
  10. 리뷰: `docs/ai/reviews/2026-07-06-wear-cardio-running-poc-slice3-review.md`.
- Slice 4 완료 요약:
  1. Wear final stop에서 `WearWorkoutDataLayer`가 `/tomato/workout/run/complete` message로 final `WearWorkoutPayload`만 전송한다. 운동 중 rapid live update는 보내지 않는다.
  2. Wear summary에는 `폰 저장 전송 중`, `폰 저장 전송 완료`, `폰 연결 대기` 등 전송 상태를 표시한다.
  3. phone `android/app`에는 `TomatoWearWorkoutListenerService`와 `TomatoWearWorkoutBridge`를 추가해 Data Layer message를 SharedPreferences queue에 넣고, WebView가 살아 있으면 `window.__tomatoWearWorkoutBridge.saveFromNative(...)`로 drain한다.
  4. 공식 Wear OS Data Layer 제약에 맞춰 phone/watch `applicationId`를 모두 `com.lifestreak.app`로 맞췄다. Kotlin namespace/package는 기존 `com.lifestreak.wear`를 유지한다.
  5. root `workout/wear-bridge.js`는 payload 검증, localStorage queue, `loadWorkoutDate()` 후 `S.workout.exercises` cardio/running card upsert, `saveWorkoutDay({ silent: true })`, toast/focus를 처리한다.
  6. `sw.js`에 `./workout/wear-bridge.js`를 추가하고 `CACHE_VERSION`을 `tomatofarm-v20260707z16-lifezone-weight-motion`로 bump했다. `npm.cmd run cap:sync`로 Android app asset에도 반영했다.
  7. PASS: `node --test tests/wear-workout-bridge.test.js tests/wear-slice3-health-services.test.js tests/wear-slice2-artifacts.test.js tests/running-entry.test.js tests/workout-save-mode-guard.test.js`.
  8. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :app:assembleDebug :wear:testDebugUnitTest :wear:assembleDebug`.
  9. PASS: Wear AVD에서 final stop summary까지 실행했고, 현재 emulator pair에는 reachable node가 없어 `폰 연결 대기` fallback이 표시되는 것을 확인했다. `dumpsys activity service WearableService`에서 reachable nodes 0도 확인했다.
  10. evidence: `.omo/evidence/wear-cardio-running-poc/slice4-post-sync-node.txt`, `.omo/evidence/wear-cardio-running-poc/slice4-post-sync-gradle.txt`, `.omo/evidence/wear-cardio-running-poc/slice4-watch-summary-fallback.png`, `.omo/evidence/wear-cardio-running-poc/slice4-wearable-service-before.txt`, `.omo/evidence/wear-cardio-running-poc/slice4-emulator-cleanup.txt`.
  11. 실제 paired phone/watch 저장 완료와 phone card screenshot은 현재 에뮬레이터 조합이 Data Layer pair를 제공하지 않아 Slice 5/실기기 검증 항목으로 남긴다.
- Slice 5 완료 요약:
  1. Phone debug APK와 Watch debug APK를 최종 산출했다.
  2. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=895`.
  3. PASS: `node --test tests/*.test.js` - 727 pass.
  4. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :app:assembleDebug :wear:testDebugUnitTest :wear:assembleDebug`.
  5. PASS: `git diff --check` - whitespace error 없음. LF/CRLF working copy warning만 표시됨.
  6. APK: `android/app/build/outputs/apk/debug/app-debug.apk` 45M, `android/wear/build/outputs/apk/debug/wear-debug.apk` 14M.
  7. 리뷰: `docs/ai/reviews/2026-07-06-wear-cardio-running-poc-slice5-review.md`.
  8. 한계: 현재 emulator pair는 reachable Data Layer node가 없어 실제 phone card 생성 screenshot은 아직 미검증이다. production Pages deploy도 현재 워크트리의 unrelated staged/unstaged 변경 때문에 실행하지 않았다.
- Slice 6 완료 요약:
  1. `ACCESS_FINE_LOCATION`, foreground service location type, Health Services `DataType.LOCATION`, `isGpsEnabled = true` 경로를 추가했다.
  2. Watch payload가 `route`와 `routeSummary`를 포함하고, phone web bridge가 이를 `runData.route`와 cardio route metadata로 저장한다.
  3. Watch active/summary 화면에 GPS 상태를 추가했다.
  4. PASS: `node --test tests/wear-gps-running-contract.test.js`.
  5. PASS: `node --test tests/*.test.js` - 731 pass.
  6. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=895`.
  7. PASS: `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./android/gradlew.bat -p android :app:assembleDebug :wear:testDebugUnitTest :wear:assembleDebug`.
  8. PASS: Wear AVD `TomatoWearSmallRound`에서 vertical swipe -> `유산소` page -> `런닝/조깅` tap -> active -> pause -> final stop summary까지 실제 터치 검증. Summary: `0.18 km`, `01:19`, `145 bpm`, `GPS 7점`, `폰 연결 대기`.
  9. evidence: `.omo/evidence/wear-cardio-running-poc/slice6-watch-summary.png`, `.omo/evidence/wear-cardio-running-poc/slice6-watch-qa-log.md`, `.omo/evidence/wear-cardio-running-poc/slice6-full-node-rerun.txt`, `.omo/evidence/wear-cardio-running-poc/slice6-gradle-final.txt`.
  10. 리뷰: `docs/ai/reviews/2026-07-06-wear-cardio-running-poc-slice6-review.md`.
  11. not verified yet: 실제 paired phone/watch Data Layer 저장 완료와 phone workout card 생성 screenshot.

## 2026-07-06 Cardio Picker Hierarchy Follow-up

- 상태: `ready_for_deploy_verification`
- 계획: `docs/ai/features/2026-07-06-cardio-picker-card-entry.md`
- ULW: `.omo/ulw-loop/cardio-picker-hierarchy-20260706/goals.json`
- 요청: picker 첫 화면에서 `런닝/조깅`, `유산소`가 다른 근육 부위 렌더링처럼 보이지 않고, `유산소` 상단탭이 다른 헬스 종목과 다른 위계로 사일로 처리되는 문제를 수정한다. 추가로 유산소 6개 하위 종목 각각은 비슷한 회색 톤의 실제 기구/운동 제스처 이미지로 렌더링해 picker row에 삽입한다.
- 실행 Slice 2:
  1. `런닝/조깅`, `유산소`를 activity 전용 tile이 아니라 기존 picker category/muscle tile primitive와 같은 전신/유산소 범주로 렌더링한다.
  2. cardio list view에서도 상단탭을 `분류 | 유산소` 사일로가 아니라 기존 `분류 | 전체 | ...부위탭` 위계와 일관되게 유지한다.
  3. `유산소` 클릭은 기존 6개 리스트와 카드 입력 흐름으로 이동하고, `런닝/조깅` 클릭은 기존 러닝 시작/전환 동작을 유지한다.
  4. `STATIC_ASSETS` 수정 시 `sw.js` cache version을 bump하고 RED/GREEN, focused/full tests, visual QA, production Pages deploy verification을 남긴다.
- 검증 예정:
  1. RED/GREEN: `node --test tests/workout-picker-cardio-hierarchy.test.js`.
  2. 정적/회귀: `node --check workout/exercises.js sw.js`, focused picker tests, `node --test tests/*.test.js`, `npm.cmd run verify:assets`.
  3. 브라우저/시각 QA: 375x812 picker category screenshot/JSON evidence.
  4. 운영 검증: `npm.cmd run deploy:production`, `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <commit>`.
- 다음 액션: Slice 2 구현 후 review 문서를 작성하고 이 항목을 `ready_for_review` 또는 blocker 상태로 갱신한다.
- 실행 Slice 3 추가:
  1. 기본 유산소 6개 종목별 bitmap asset을 생성하고 `assets/workout/cardio/`에 저장한다.
  2. `workout/exercises.js`의 `CARDIO_PICKER_EXERCISES`에 종목별 image asset을 연결하고, cardio list row가 전신 fallback 대신 해당 종목 이미지를 렌더링한다.
  3. `style.css`에서 종목별 cardio figure가 기존 picker row 밀도와 맞도록 크기/톤/텍스트 겹침을 검증한다. `최근/빈도/이름` 필터는 기존 text-button CSS를 유지하고, row 우측 `로잉 머신`/`좌식 자전거` 기구명 chip은 표시하지 않는다.
  4. 새 asset이 `STATIC_ASSETS`에 들어가면 `sw.js` `CACHE_VERSION`을 다시 bump하고 tests/visual QA/production deploy verification을 갱신한다.
- 다음 액션: Slice 2+3 구현 후 review 문서를 작성하고 이 항목을 `ready_for_review` 또는 blocker 상태로 갱신한다.
- 실행 Slice 4 추가:
  1. 유산소 입력 sheet를 `거리 -> 속도 -> 랩/반복 -> 칼로리` 4행 순서로 바꾼다.
  2. 거리와 속도가 입력되면 칼로리를 자동 추정해 채우고, 칼로리 필드 더블클릭 시 값을 지운 뒤 수동 입력 상태로 전환한다.
  3. 운동 추가 picker의 `런닝/조깅` 클릭은 standalone running session UI를 즉시 열지 않고, 삼두/복부/유산소와 같은 상단 탭 아래 `GPS 위치`/`시작` panel만 렌더링한다. `최근/빈도/이름`, `전체/기본`, 러닝 row는 보이지 않아야 하며 `시작` 버튼을 눌렀을 때만 running session을 연다.
  4. `workout/exercises.js` 또는 `style.css` 수정 시 `sw.js` `CACHE_VERSION`을 bump하고 RED/GREEN, focused/full tests, visual QA, production deploy verification을 남긴다.
- Slice 4 ULW: `.omo/ulw-loop/cardio-auto-calorie-running-tab-20260706/goals.json`
- 다음 액션: Slice 4 구현과 리뷰 보정은 완료됐다. `origin/main` 배포와 `verify:deploy` 확인 후 이 항목을 `complete` 또는 production UI blocker 상태로 갱신한다.

## 2026-07-06 Cardio Picker Card Entry

- 상태: `needs_user_auth_for_production_ui_verification`
- 계획: `docs/ai/features/2026-07-06-cardio-picker-card-entry.md`
- 요청: `런닝/조깅`과 `유산소` 버튼을 기존 운동 추가 버튼 디자인에 맞추고, `유산소` 클릭 시 기본 유산소 종목 리스트를 보여준 뒤 한국어 입력값으로 기존 운동 카드/캐러셀 시스템에 유산소 카드를 추가한다.
- 실행 Slice 1:
  1. `유산소` activity tile을 하위 리스트 view로 연결하고 기본 6개 유산소 종목을 전 사용자 공통 catalog로 제공한다.
  2. 하위 종목 클릭 시 `칼로리(kcal)`, `거리(km)`, `속도(km/h)`, `랩/반복` 한국어 입력 sheet를 연다.
  3. 저장된 유산소 기록을 기존 운동 카드/캐러셀 시스템에 맞는 카드 엔트리로 추가하고, 새 카드 포커스 및 디자인 일관성을 검증한다.
  4. `STATIC_ASSETS` 수정 시 `sw.js` cache version을 bump하고 focused/full tests, asset verification, production Pages flow까지 확인한다.
- 실행 요약:
  1. `유산소` activity tile을 기본 6개 유산소 종목 리스트 view로 연결했다.
  2. 하위 종목 클릭 시 `칼로리(kcal)`, `거리(km)`, `속도(km/h)`, `랩/반복` 한국어 입력 sheet를 열고 저장한다.
  3. 저장된 유산소 기록을 기존 `S.workout.exercises` 엔트리로 추가해 운동 카드/캐러셀과 같은 경로를 사용한다.
  4. 날짜 시트, 칼로리 계산, 세션 존재 판정, 운동 상세 카드에서 유산소 엔트리를 유지/표시한다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260706z8-cardio-picker-card`로 bump했다.
- 검증:
  1. PASS: `node --check workout/exercises.js render-calendar.js workout/save.js workout/sessions.js calc.js`.
  2. PASS: `node --test tests/running-entry.test.js tests/calc.score.test.js` - 74 pass.
  3. PASS: `node --test tests/*.test.js` - 715 pass.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=882`.
  5. LSP diagnostics: TypeScript language server missing, install declined; `node --check`와 test suite로 대체했다.
  6. PASS: `npm.cmd run deploy:production` - pushed `ef60f8672fe8` to `origin/main`.
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ ef60f8672fe8` - `[deploy-verify] ok ef60f8672fe8 tomatofarm-v20260706z8-cardio-picker-card static=242`.
  8. PASS: deployed marker verification - `CARDIO_PICKER_EXERCISES`, `data-picker-cardio-id`, `ex-cardio-kcal`, `ex-cardio-distance`, `ex-cardio-speed`, `ex-cardio-laps`, `wt-cardio-read-card`, `ex-picker-cardio-item`, cache marker.
  9. BLOCKED: in-app browser production page shows `#login-screen` and no `currentUser`; without user login, the target flow cannot be clicked without creating external Firebase data or bypassing authentication.
- 리뷰: `docs/ai/reviews/2026-07-06-cardio-picker-card-entry-review.md`
- 다음 액션: 사용자가 in-app browser에서 로그인한 뒤, 배포 URL에서 `운동 -> 종목 추가 -> 유산소 -> 스텝머신 -> 칼로리/거리/속도/랩 입력 -> 저장 -> 새 유산소 카드 캐러셀 포커스`를 직접 검증한다.

## 2026-07-06 Workout Set Type Menu Clipping

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-06-workout-set-type-menu-clipping.md`
- 리뷰: `docs/ai/reviews/2026-07-06-workout-set-type-menu-clipping-review.md`
- 요청: 운동 세트 타입 메뉴(`메인세트`, `웜업세트`, `드랍세트`)가 하단에서 열릴 때 화면 아래로 잘리는 문제를 수정한다.
- 실행 Slice 1:
  1. 열린 세트 타입 메뉴의 DOM 위치를 측정해 하단 여유가 부족하면 위 방향으로 열리게 한다.
  2. 메뉴가 sheet body/viewport 안에 들어오도록 최소 스크롤 보정을 추가한다.
  3. focused regression test와 `sw.js` cache bump를 포함한다.
- 실행 검증:
  1. PASS: RED/GREEN focused regression.
  2. PASS: `node --test tests/*.test.js` - 714 pass.
  3. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=882`.
  4. PASS: Puppeteer mobile visual QA harness - `isAbove=true`, `optionCount=4`, `clipped=false`.
- 운영 검증:
  1. PASS: `npm.cmd run deploy:production` - `origin/main` 배포 및 deployed marker 검증 통과.
  2. PASS: `[deploy-verify] ok ... tomatofarm-v20260706z7-set-type-menu-clip static=242`.
  3. PASS: 배포 URL `https://aretenald2018-sys.github.io/tomatofarm/`의 `render-calendar.js`/`style.css`를 로드한 mobile placement harness - `positionedAbove=true`, `optionCount=4`, `clipped=false`.
- 변경 파일: `render-calendar.js`, `style.css`, `sw.js`, `tests/*.test.js` cache marker assertions, `tests/workout-calendar-bottom-sheet.test.js`, `tests/workout-set-minimal-dom.test.js`.
- 리뷰 결과: PASS. blocker 없음.
- 다음 액션: 없음.

## 2026-07-06 App Update Refresh Auth Loop

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-06-app-update-refresh-auth-loop.md`
- 리뷰: `docs/ai/reviews/2026-07-06-app-update-refresh-auth-loop-review.md`
- 요청: 앱 업데이트/새로고침 때 로그아웃/로그인이 여러 번 반복되는 무한 로딩성 현상을 막는다.
- 진단 요약:
  1. `pwa-register.js`가 `SKIP_WAITING` 후 `controllerchange`가 없어도 1.5초 timeout으로 강제 reload했다.
  2. 새 Service Worker가 아직 제어권을 얻지 못한 상태에서 reload되면 앱 bootstrap과 로그인 복원이 반복 진입할 수 있다.
  3. `initLoginScreen()` 중복 DOMContentLoaded 바인딩은 원인이 아니었다.
- 실행 요약:
  1. 자동 reload는 `controllerchange`에서만 수행하도록 변경했다.
  2. timeout/postMessage 실패는 update banner fallback으로 바꿨다.
  3. 같은 SW update key는 한 탭 세션에서 자동 적용을 1회만 시도한다.
  4. active workout draft가 있으면 자동 reload 없이 배너만 보여주는 행동 테스트를 추가했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260706z6-sw-reload-stability`로 bump하고 `index.html`의 `pwa-register.js` cache-bust query를 갱신했다.
- 로컬 검증:
  1. PASS: `node --test tests/pwa-update-auto-reload.test.js` - 5 pass.
  2. PASS: `node --check pwa-register.js`.
  3. PASS: `node --check sw.js`.
  4. PASS: `node --check tests/pwa-update-auto-reload.test.js`.
  5. PASS: `node --test tests/*.test.js` - 713 pass.
  6. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=882`.
  7. PASS: `git diff --check`.
  8. PASS: review-work context/QA/code/security lanes, no blockers after test cleanup.
- 운영 검증:
  1. PASS: `npm.cmd run deploy:production` - pushed `95cb27110d45` to `origin/main`.
  2. PASS: `[deploy-verify] ok 95cb27110d45 tomatofarm-v20260706z6-sw-reload-stability static=242`.
  3. PASS: deployed `index.html`, `pwa-register.js`, `sw.js` returned HTTP 200.
  4. PASS: deployed refresh-loop harness - timeout without `controllerchange` produced `reloads=0`, `banners=1`; same update key auto-applied once; actual `controllerchange` still produced exactly one reload.
- 다음 액션: 없음.

## 2026-07-06 Stats Raw Export Download

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-06-stats-raw-export-download.md`
- 리뷰: `docs/ai/reviews/2026-07-06-stats-raw-export-download-review.md`
- 요청: 기간별 운동분석 카드 위에 `전체통계 다운로드` 버튼을 만들고, 운동 및 식단 관련 일자별 raw 데이터를 모두 내보낸다.
- 그릴 결과:
  1. raw 데이터는 CSV가 아니라 JSON으로 내보낸다. 운동 세트, 세션, 러닝 route, food 배열, 사진/추정 메타가 중첩 구조라 CSV는 정보 손실이 크다.
  2. 통계 화면은 Firestore를 직접 조회하지 않고 `data.js`의 현재 일자 cache를 원천으로 쓴다.
  3. raw workout/diet field boundary는 `workout/save-schema.js`의 payload key contract를 재사용한다.
- 실행 슬라이스:
  1. Slice 1: stats 탭 raw 일자별 JSON 다운로드 버튼과 export payload를 구현하고 테스트/asset/SW cache bump를 검증한다.
- 실행 요약:
  1. 기간별 운동분석 컨트롤 상단에 `전체통계 다운로드` 버튼을 추가하고 기존 하단 CSV inline 버튼을 제거했다.
  2. `render-stats.js`에 `buildStatsRawExport()`와 다운로드 핸들러를 추가해 일자별 운동/식단 raw snapshot, schema payload key, body checkin 데이터를 JSON으로 내보낸다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260706z4-stats-raw-export`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-stats.js`.
  2. PASS: focused stats tests - 15 pass.
  3. PASS: `node --test tests/*.test.js` - 709 pass.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=882`.
  5. PASS: Puppeteer static visual QA - mobile/desktop에서 버튼이 기간 버튼 위, 분석 카드 위에 있고 텍스트 clipping 없음.
- 다음 액션: 없음.

## 2026-07-06 Workout Add Exercise Carousel Focus

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-06-workout-add-exercise-carousel-focus.md`
- 리뷰: `docs/ai/reviews/2026-07-06-workout-add-exercise-carousel-focus-review.md`
- 요청: 운동 탭에서 종목을 추가하면 `종목을 추가했어요` 토스트만 띄우지 말고 캐러셀 화면을 방금 추가한 종목 카드로 이동시킨다.
- 실행 슬라이스:
  1. Slice 1: day sheet add picker가 선택한 exercise slide를 DOM 생성 이후까지 pending focus request로 보존하고 복원한다.
- 실행 요약:
  1. `render-calendar.js`에 day sheet carousel pending focus request map을 추가했다.
  2. add-picker `afterSelect`에서 선택된 `entryIdx`를 요청으로 저장하고, sheet render 이후 slide가 실제 DOM에 있을 때만 복원 성공 처리한다.
  3. 복원 성공 시 pending request를 제거해 이후 사용자의 수동 carousel 위치를 덮어쓰지 않는다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260706z5-workout-carousel-focus`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: RED/GREEN focused carousel focus evidence - `.omo/evidence/workout-carousel-focus-20260706/focused-test.txt`.
  2. PASS: `node --check render-calendar.js`.
  3. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` - 34 pass.
  4. PASS: `node --test tests/*.test.js` - 710 pass.
  5. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=882`.
  6. PASS: browser/mobile carousel focus harness - `entryIdx=2`, delayed render `scrollLeft=736`, `expectedScrollLeft=736`, `scrollDelta=0`, toast `종목을 추가했어요`.
  7. PASS: focused final gate review - `.omo/evidence/workout-carousel-focus-20260706-gate-review.md`.
  8. PASS: Production Pages deploy verification - final deployed commit, HTTP 200, deployed cache `tomatofarm-v20260706z5-workout-carousel-focus`.
  9. PASS: Production Pages mobile carousel focus harness - deployed `render-calendar.js`, `entryIdx=2`, delayed render `scrollLeft=736`, `expectedScrollLeft=736`, `scrollDelta=0`, toast `종목을 추가했어요`.
- 다음 액션: 없음.

## 2026-07-06 Running GPS Full Route Render

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-06-running-gps-full-route-render.md`
- 리뷰: `docs/ai/reviews/2026-07-06-running-gps-full-route-render-review.md`
- 요청: 러닝 GPS 지도가 시작점과 끝점만 직선으로 연결하지 않고, 폰이 수집한 전체 이동경로를 순서대로 렌더링한다.
- 진단 요약:
  1. `workout/running-map.js`의 공유 지도 normalizer는 현재 `lat/lng`만 허용한다.
  2. `home/life-zone-state.js`는 이미 `latitude/longitude/lon` 형태를 지원한다.
  3. 저장 상세 화면은 `runRoute`를 `row.route`로 전달하므로 지도 입력 경계에서 중간 샘플이 누락되지 않게 보정한다.
  4. `workout/running-map.js`는 `sw.js` `STATIC_ASSETS`에 있으므로 cache version bump가 필요하다.
- 실행 슬라이스:
  1. Slice 1: 공유 러닝 지도 route point normalization 보정과 RED/GREEN/browser QA.
- 실행 요약:
  1. `workout/running-map.js`의 route point normalizer가 `lat/lng`, `latitude/longitude`, `latitude/lon` 샘플을 같은 경로 배열로 정규화한다.
  2. 유효하지 않은 좌표는 버리고, 유효 샘플 순서와 지도 point count를 유지한다.
  3. 외부 지도 provider에는 `lat/lng` 좌표만 전달해 `accuracy`, `altitude`, `speed`, `ts` metadata가 SDK 경계로 나가지 않게 했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260706z1-running-gps-full-route`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: focused RED/GREEN - `.omo/evidence/gps-full-route-20260706/red-green-tests.txt`.
  2. PASS: VWorld browser QA - `data-map-point-count=4`, polyline point count `4`.
  3. PASS: Google provider boundary QA - polyline path key set `lat,lng` only.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=880`.
  5. PASS: `node --test tests/*.test.js`.
  6. PASS: production deploy verify - cache `tomatofarm-v20260706z1-running-gps-full-route`.
  7. PASS: production UI flow - Pages URL HTTP 200, deployed `workout/running-map.js` import, VWorld route `data-map-point-count=4`, polyline point count `4`.
- 다음 액션: 없음.

## 2026-07-05 Workout Set Row Real Swipe Fix

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-05-workout-set-swipe-row-real-fix.md`
- 리뷰: `docs/ai/reviews/2026-07-05-workout-set-swipe-row-real-fix-review.md`
- 요청: 운동 종목 내 세트 행의 실제 모바일 swipe 삭제가 전혀 되지 않는 문제를 끝까지 수정한다.
- 진단 요약:
  1. 기존 테스트는 row 배경 origin swipe를 주로 검증해 실제 사용자가 누르는 `kg/reps` 숫자 영역 origin swipe를 놓쳤다.
  2. `.wt-day-sheet-scroll`의 `touchmove` propagation guard가 sheet bubble 단계 swipe handler보다 먼저 실행되어 실제 앱에서 handler가 안정적으로 제스처를 소유하지 못했다.
  3. handler를 capture 단계로 옮긴 뒤에도 `saveDay()` dateKey 직렬화 큐 때문에 local cache 갱신이 뒤로 밀리면 optimistic render가 stale cache를 읽어 삭제 전 row를 다시 그릴 수 있었다.
- 실행 요약:
  1. 세트 row swipe handler를 capture 단계에 바인딩했다.
  2. 삭제 경로에 `optimisticRender: true`를 적용했다.
  3. optimistic render 전에 `getCache()[key]`를 `saveDay(merge)`와 같은 방식으로 먼저 merge한다.
  4. DOM harness에 실제 scroller `touchmove` propagation block을 추가하고, `kg/reps` 실제 컨트롤 중심 swipe를 회귀 테스트로 고정했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260705z1-workout-set-entry-followup-z6-workout-set-swipe-cache`로 bump했다.
- 검증:
  1. PASS: focused syntax/tests - 37 pass.
  2. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=880`.
  3. PASS: `node --test tests/*.test.js` - 704 pass.
  4. PASS: production deploy verify - commit `ec0dc846a7e2`, cache `tomatofarm-v20260705z1-workout-set-entry-followup-z6-workout-set-swipe-cache`.
  5. PASS: production mobile E2E - `kg` 숫자 영역 origin swipe 후 row count `2 -> 1`.
  6. PASS: production inline/swipe regression - `kg/reps` focus clear, editor closed, delete target/gap, 좌우 swipe 삭제, 새 종목 carousel focus source checks 통과.
- 다음 액션: 없음.

## 2026-07-05 Workout Set Inline Swipe Fix

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-05-workout-set-inline-swipe-fix.md`
- 리뷰: `docs/ai/reviews/2026-07-05-workout-set-inline-swipe-fix-review.md`
- 요청: 모바일 세트 행에서 `kg/횟수`를 펼침 패널 없이 해당 칸에서 직접 수정하고, 삭제 `×` hit target을 키워 파란 펼침 토글과 분리하며, 좌우 swipe로 세트 행을 삭제한다. 새 종목 추가 후 화면이 최초 종목으로 고정되는 회귀도 검증한다.
- 실행 슬라이스:
  1. Slice 1: 세트 행 인라인 숫자 수정, 삭제 hit target, 좌우 swipe 삭제, 새 종목 focus 회귀 검증.
- 실행 요약:
  1. 접힌 세트 행의 `kg/횟수` 값 버튼을 해당 칸 안의 숫자 input으로 전환하는 인라인 편집 경로를 추가했다.
  2. 인라인 input focus 시 기존 숫자를 비워 바로 재입력할 수 있게 했다.
  3. 삭제 `×` hit target을 모바일 기준 42px x 38px 이상으로 키우고, 파란 펼침 토글과 8px 간격으로 분리했다.
  4. 세트 행 swipe 삭제 판정을 좌우 양방향으로 확장했다.
  5. 새 종목 추가 후 선택 slide 복원 회귀 테스트를 유지하고 실행했다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260705z1-workout-set-entry-followup-z3-workout-set-inline-swipe`로 bump했다.
- 검증:
  1. PASS: RED focused tests 실패 확인.
  2. PASS: focused syntax/assets/tests - `verify:assets`, 37 pass.
  3. PASS: `node --test tests/*.test.js` - 704 pass.
  4. PASS: `npm.cmd run deploy:production` - GitHub Pages deploy and marker verification passed.
  5. PASS: production mobile E2E - `kg` focus value `''`, editor open `false`, inline editing `true`, delete target `42 x 38`, expand gap `8`.
  6. PASS: production source harness - `55kg / 15회` 저장 후 오른쪽 swipe와 왼쪽 swipe로 두 세트 삭제, 최종 row count `1`.
- 다음 액션: 없음.

## 2026-07-05 Workout Set Mobile Interactions

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-05-workout-set-mobile-interactions.md`
- 리뷰: `docs/ai/reviews/2026-07-05-workout-set-mobile-interactions-review.md`
- 요청: 모바일 세트 행에서 `kg/횟수` 더블탭 편집, input focus 시 숫자 초기화, 삭제 `×` 터치 영역 확대/분리, 새 종목 추가 후 새 카드 포커스 유지, 세트 행 스와이프 삭제를 구현하고 모바일 E2E로 검증한다.
- 실행 슬라이스:
  1. Slice 1: 모바일 세트 행 편집/삭제/포커스 보정.
- 실행 요약:
  1. 접힌 세트 행 `kg/횟수` 값을 탭 가능한 편집 버튼으로 바꾸고 해당 input focus/clear 경로를 추가했다.
  2. 삭제 `×` hit target을 38px × 34px로 키우고 파란 펼침 토글과 분리했다.
  3. 세트 행 좌측 swipe 삭제를 `_removeWorkoutExerciseSetFromSheet()` 경로로 연결했다.
  4. 새 종목 추가 후 새 slide 복원 회귀 테스트를 유지했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260705z1-workout-set-entry-followup-z2-workout-set-mobile-interactions`로 bump했다.
- 검증:
  1. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-set-minimal-dom.test.js` - 37 pass.
  2. PASS: `node --test tests/*.test.js` - 704 pass.
  3. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=880`.
  4. PASS: 모바일 Chromium E2E evidence - `.omo/evidence/workout-set-mobile-interactions/mobile-set-row-e2e.json`, `.omo/evidence/workout-set-mobile-interactions/mobile-set-row-after.png`.
  5. PASS: 운영 Pages 배포 검증 - commit `147f25da88e9`, cache `tomatofarm-v20260705z1-workout-set-entry-followup-z2-workout-set-mobile-interactions`.
  6. PASS: 운영 앱 모바일 smoke - 실제 터치가 `70kg` 버튼을 hit하고 `kg` input focus/value `''`/editor open 확인.
  7. PASS: 운영 배포 source 모바일 swipe harness - `55kg / 15회` 변경 후 좌측 swipe 삭제로 set count `1`.
- 다음 액션: 없음.

## 2026-07-05 Workout Set Entry Follow-up

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-05-workout-set-entry-followup.md`
- 리뷰: `docs/ai/reviews/2026-07-05-workout-set-entry-followup-review.md`
- 요청: 운동 첫 추가 시 첫 세트 값을 직전 수행 세트 또는 `40kg x 10회`로 채우고, 접힌 행의 입력칸 오인 요소를 제거하며, 펼친 편집 필드를 한 줄로 만들고, 세트 유형 라벨을 `메인/웜업`으로 바꾼다. 단, 웬들러 프로그램 운동은 해당 주 처방 세트를 전부 불러온다.
- 진단 요약:
  1. `render-calendar.js`의 `_defaultWorkoutSheetSet(prev)`는 직전 세트가 있으면 복사하지만 직전 세트가 없으면 빈 값으로 둔다.
  2. `workout/exercises.js`의 일반 picker entry는 현재 `{ kg: 0, reps: 0 }` 첫 행을 만들고, 웬들러 program prescription은 전체 세트를 갖고 있어도 사용자 표시용 `entry.sets`가 1행으로 줄어들 수 있다.
  3. `render-calendar.js`의 `_workoutSetTypeLabel()`은 일반 main/warmup을 `본`/`프리`로 표기한다.
  4. `style.css`의 `.wt-max-set-expand`와 `.wt-max-set-editor`가 우측 파란 affordance 및 한 줄 입력 밀도 보정 지점이다.
- 실행 슬라이스:
  1. Slice 1: 첫 행 기본값, 접힌 행 affordance, 한 줄 편집 패널, `메인/웜업` 라벨, 웬들러 전체 세트 예외를 구현한다.
- 계획 검증:
  1. PASS: 기존 완료 계획 `docs/ai/features/2026-07-04-workout-set-copy-expand-edit.md`와 충돌하지 않는 후속 계획을 새로 작성했다.
  2. PASS: 정적 asset 수정 예상 파일에 따라 `sw.js` cache bump가 필수임을 계획에 명시했다.
  3. PASS: 실행 범위가 `render-calendar.js`, `style.css`, `workout/exercises.js`, 관련 테스트, `sw.js`로 제한된다.
- 실행 요약:
  1. 운동 첫 추가 시 최근 유효 본세트 `kg/reps`를 seed로 쓰고, 이력이 없으면 `40kg x 10회`를 표시한다.
  2. 접힌 세트 행은 입력칸 없이 값 정보만 표출하고, 레거시 빈 값은 `미입력`으로 표시한다.
  3. 우측 펼침 버튼은 파란 affordance/glow를 가진다.
  4. 펼친 편집 패널은 `무게/횟수/RIR/ROM` 4개 입력을 한 줄로 배치한다.
  5. 라벨은 `메인/웜업`으로 바꿨고, 웬들러 프로그램 운동은 해당 주 처방 세트 전체를 불러온다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260705z1-workout-set-entry-followup`로 bump했다.
- 검증:
  1. PASS: RED targeted tests 실패 확인.
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-set-minimal-dom.test.js tests/workout-test-mode-unified.test.js tests/calc.max.test.js` - 98 pass.
  3. PASS: `node --test tests/*.test.js` - 701 pass.
  4. PASS: Puppeteer visual DOM QA - `.omo/evidence/workout-set-entry-followup-dom.png`.
- 다음 액션: 없음. 운영 배포 검증이 끝나면 최종 완료.

## 2026-07-04 Running Lock GPS Recovery

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-04-running-lock-gps-recovery.md`
- 리뷰: `docs/ai/reviews/2026-07-04-running-lock-gps-recovery-slice1-review.md`
- 요청: 러닝 진행 화면의 가짜 좌우 스와이프 점 표시를 제거하고, 폰 잠금/재시작/로그인 재진입 후 러닝 기록과 GPS draft가 날아가지 않도록 처리한다.
- 진단 요약:
  1. `workout/running-session.js` 진행 화면이 `.wt-run-live-pages` 점 3개를 렌더하지만 실제 페이지/스와이프 기능은 없다.
  2. 현재 러닝은 WebView `navigator.geolocation.watchPosition()` 기반이고 Android native background location permission/service가 없어, 잠금 중 GPS point 수집은 웹만으로 보장할 수 없다.
  3. 러닝 draft 저장은 있으나 `localStorage.currentUser` 기반 key와 `wtOpenRunningSession()` 수동 진입에 묶여 있어, 재시작/로그인 복귀 후 자동 복구가 약하다.
- 실행 슬라이스:
  1. Slice 1: 웹 러닝 세션 복구와 가짜 스와이프 affordance 제거.
  2. Slice 2: Android locked-phone GPS를 위한 native foreground location bridge.
- Slice 1 실행 요약:
  1. `workout/running-session.js`의 진행 화면 `.wt-run-live-pages` DOM을 제거했고 `style.css`의 page-dot 스타일도 제거했다.
  2. 러닝 draft에 `ownerId`와 active fallback key를 추가해 로그인 재진입 후 현재 사용자와 일치할 때만 복구한다.
  3. `wtRestoreRunningSessionIfActive()`를 `workout/index.js`/`render-workout.js`/`window`로 노출하고 `app.js` 초기화에서 일반 팝업보다 먼저 호출한다.
  4. 복구된 러닝 화면 위로 다이어트 리포트/웰컴/튜토리얼/PWA 배너가 겹치지 않도록 `runningSessionRestored`로 팝업 경로를 막았다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260704z6-running-restore-overlay`로 bump했다.
  6. 리뷰 중 발견된 dateKey 저장 블로커를 수정했다. 복구 draft의 `dateKey`를 `S.shared.date`에 반영하고, 복구 중에는 `loadWorkoutDate(TODAY)`가 날짜를 덮지 않게 했다.
  7. `saveWorkoutDay()` no-op을 `false`로 반환하게 하고, 러닝 저장은 `false`를 성공으로 처리하지 않아 draft/세션을 보존한다.
  8. 복구 가능한 러닝 draft가 있으면 기존 사용자 길드 온보딩을 띄우지 않도록 했다.
  9. 러닝 root를 `document.body` 직속 overlay로 승격해 홈 탭에서 복구돼도 0×0 hidden tab 조상에 갇히지 않게 했다.
- Slice 1 검증:
  1. PASS: RED `node --test tests/running-entry.test.js tests/running-tracker.test.js` - fake dots, active fallback/app restore, ownerId 보존 조건으로 실패 확인.
  2. PASS: GREEN `node --test tests/running-entry.test.js tests/running-tracker.test.js tests/running-session-recovery-behavior.test.js` - 23 pass.
  3. PASS: `node --check workout/running-session.js && node --check workout/save.js && node --check app.js && node --check tests/running-session-recovery-behavior.test.js && node --check tests/running-entry.test.js`.
  4. PASS: `npm.cmd run verify:assets` - `[runtime-assets] ok refs=880`.
  5. PASS: `node --test tests/*.test.js` - 700 pass.
  6. PASS: Puppeteer file harness screenshot `.omo/evidence/running-lock-gps-20260704/slice1-progress-no-dots.png` - `restored=true`, `screen=progress`, `dotCount=0`, `hasDots=false`.
  7. PASS: Puppeteer 행동 테스트 - 복구된 summary가 draft 날짜로 저장되고, 날짜 없음 save no-op은 draft/세션을 유지한다.
  8. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <deployed HEAD>` - deployed commit/cache 확인.
  9. PASS: deployed marker 검증 - `sw.js::tomatofarm-v20260704z6-running-restore-overlay`, `feature-login.js::_hasRestorableRunningDraftForUser`, `workout/running-session.js::document.body.appendChild(root)`, `app.js::runningSessionRestored`.
  10. PASS: production authenticated running restore smoke on deployed runtime - `screen=progress`, `rootRect=390x844`, `rootParentIsBody=true`, `centerHitInsideRunningRoot=true`, `dotCount=0`, `loginVisible=false`, `guildOnboardingVisible=false`, `pageErrors=[]`.
- 다음 액션: Slice 1은 완료. Slice 2(Android foreground location bridge)는 별도 계획/실행으로 남긴다.

## 2026-07-04 Workout Set Minimal BodyCalendar Correction

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-04-workout-set-copy-expand-edit.md`
- 리뷰: `docs/ai/reviews/2026-07-04-workout-set-minimal-bodycalendar-review.md`
- 요청: `세트 입력 대기`와 `지난 기록`은 유지하고, 그 아래 세트 행을 바디캘린더 참고 이미지 2~4처럼 미니멀하게 수정한다.
- 계획 요약:
  1. 추천/프로그램 운동 추가 시 처음 보이는 입력 행은 첫 세트 1개만 만든다.
  2. 전체 목표 세트 수와 처방 세트는 `maxPrescription` 메타에 보존한다.
  3. 기본 세트 행은 완료 체크, 세트 번호/유형, 무게, 횟수, 삭제, 우측 펼침만 노출한다.
  4. 숫자 입력은 우측 펼침 패널에서만 가능하고, `RIR`/`ROM` 입력도 그 안에 둔다.
  5. 좌측 세트 번호 버튼은 `메인/웜업/드랍/실패` 세트 유형 메뉴를 연다.
- 실행 슬라이스:
  1. Slice 2: 추천/프로그램 운동 초기 세트 1행화와 세트 행 미니멀 UI/세트유형 토글을 구현한다.
- 계획 검증:
  1. PASS: `render-calendar.js`에서 `세트 입력 대기`/`지난 기록` 블록은 `_renderWorkoutExerciseDetailCard()`에 남아 있음을 확인했다.
  2. PASS: `buildMaxBenchmarkPickerEntry()`와 `_buildProgramPickerExerciseEntry()`가 현재 처방 세트를 그대로 `entry.sets`로 넣어 3~4행을 노출할 수 있음을 확인했다.
  3. PASS: 세트 action은 `.cal-workout-day-sheet` capture handler의 `data-wt-sheet-card-action` 경로에서 처리된다.
- Slice 2 실행 요약:
  1. 추천/프로그램 운동 추가 시 `entry.sets`는 첫 처방 세트 1개만 만들고, 전체 처방은 `maxPrescription`에 보존했다.
  2. collapsed 세트 행은 완료 체크, 세트 번호/유형, 무게, 횟수, 삭제, 우측 펼침만 노출한다.
  3. `무게/횟수/RIR/ROM` 입력은 우측 펼침 편집 패널에서만 노출한다.
  4. 좌측 세트 번호 버튼은 `M/W/D/F` 세트 유형 메뉴를 열고 `setType`만 갱신한다.
  5. 세트 유형 선택 후 메뉴가 닫히도록 렌더 순서를 보정했다.
  6. `세트 입력 대기`와 `지난 기록` 블록은 유지했다.
- Slice 2 검증:
  1. PASS: RED focused tests 실패 확인.
  2. PASS: `node --check render-calendar.js && node --check workout/exercises.js && node --check workout/expert/max-benchmark-picker.js && node --check sw.js`
  3. PASS: `node --test tests/calc.max.test.js tests/workout-test-mode-unified.test.js tests/workout-calendar-bottom-sheet.test.js` - 95 pass
  4. PASS: `node --test tests/workout-set-minimal-dom.test.js` - 2 pass
  5. PASS: `node --test tests/*.test.js` - 695 pass
  6. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=880`
  7. PASS: 운영 Pages 배포 검증
  8. PASS: deployed marker 검증 - current cache `tomatofarm-v20260704z5-workout-set-type-menu-close`와 세트 UI/DOM test marker 확인.
  9. not verified yet: 인증 세션이 없어 운영 URL 내부 workout 클릭 flow는 자동 검증하지 못했다. 대신 Puppeteer DOM harness로 같은 row click/action path를 검증했다.
- 다음 액션: 없음. 이 피드백 수정은 완료됐다.

## 2026-07-03 Home Social Notification Decoupling

- 상태: `ready_for_execution`
- 계획: `docs/ai/features/2026-07-03-home-social-notification-decoupling.md`
- 요청: 운동 코드에서 멈추지 않고 앱 전체의 UI/backend 상호의존성, inline handler, 전역 함수, 무거운 클릭 경로를 줄인다.
- 진단 요약:
  1. 직전 social feed/profile 계획은 `complete`이고 운영 Pages 배포 검증까지 완료했다.
  2. 추가 인벤토리에서 `home/notifications.js`에 `_renderFriendFeedFn()` 직접 호출이 5개 남아 있어 알림 처리와 feed 전체 렌더가 직접 결합되어 있다.
  3. `home/friend-profile.js`에는 소개/길드 초대/토마토 선물 보조 모달의 `onclick=`이 남아 있어 profile action bridge 밖에서 별도 전역 함수와 payload escaping에 의존한다.
  4. `home/cheers-card.js`에는 cheers list/self modal 관련 inline handler가 남아 있어 social click surface가 아직 여러 namespace로 흩어져 있다.
- 실행 슬라이스:
  1. Slice 1: `home/notifications.js`의 friend feed refresh를 social render scheduler로 병합한다.
  2. Slice 2: `home/friend-profile.js`의 소개/길드/선물 보조 모달 action을 scoped delegate로 전환한다.
  3. Slice 3: `home/cheers-card.js`의 cheers inline action을 data-action bridge로 전환한다.
- 계획 검증:
  1. PASS: 남은 inline/render coupling 인벤토리 완료
  2. PASS: 다음 실행 slice가 `home/notifications.js` render scheduler로 제한됨
- 다음 액션: Slice 1 `notifications render scheduler`를 실행한다.

## 2026-07-03 Social Interaction Render Decoupling

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-social-interaction-render-decoupling.md`
- 리뷰:
  - `docs/ai/reviews/2026-07-03-social-interaction-slice1-review.md`
  - `docs/ai/reviews/2026-07-03-social-interaction-slice2-review.md`
  - `docs/ai/reviews/2026-07-03-social-interaction-slice3-review.md`
- 요청: 운동 코드에서 멈추지 않고 앱 전체의 UI/backend 상호의존성, inline handler, 전역 함수, 무거운 클릭 경로를 줄인다.
- 진단 요약:
  1. 직전 전역 계획은 `complete`이고 후속 후보로 social feed/profile reaction 중복 렌더와 남은 inline handler 재인벤토리를 지정했다.
  2. `home/friend-profile.js`에는 `onclick=` 29개, `home/friend-feed.js`에는 `onclick=` 13개가 남아 있다.
  3. social reaction/comment 경로는 `showReactionPicker`, `sendReaction`, `submitComment`, `editCommentUI`, `deleteCommentUI` 같은 전역 함수와 inline payload escaping에 의존한다.
  4. reaction/comment action은 data 저장 직후 profile/feed 전체 렌더를 직접 호출해 클릭 경로가 무거워질 수 있다.
- 실행 슬라이스:
  1. Slice 1: `home/friend-feed.js` feed/manager/reaction picker 주요 inline action을 `data-feed-action` delegate로 전환한다.
  2. Slice 2: `home/friend-profile.js` reaction/comment inline action을 기존 `_bindFriendProfileActions(root)` 계약으로 흡수한다.
  3. Slice 3: social render scheduler로 feed/profile 전체 렌더 요청을 병합한다.
- 계획 검증:
  1. PASS: 새 계획 문서 생성
  2. PASS: 다음 실행 slice가 `home/friend-feed.js` feed action namespace로 제한됨
- Slice 1 실행 요약:
  1. `home/friend-feed.js`에 `_bindFriendFeedActions(root)`와 `_runFriendFeedAction(action, control, event)`를 추가했다.
  2. `#friend-feed`, `#friend-notifications`, friend manager modal, reaction picker option의 주요 버튼을 `data-feed-action`으로 전환했다.
  3. friend manager modal은 `_bindFriendManagerActions(modal)`로 row open/backdrop close를 처리한다.
  4. feed render 후 붙이던 `.onclick`/per-element listener는 `_friendFeedGoPage`, `_friendFeedSendCheer` root callback + delegate 호출로 옮겼다.
  5. `tests/social-friend-feed-actions.test.js`를 추가했고 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z18-social-feed-actions`로 bump했다.
- Slice 1 검증:
  1. PASS: `node --check home/friend-feed.js; node --check sw.js; node --check tests/social-friend-feed-actions.test.js`
  2. PASS: `node --test tests/social-friend-feed-actions.test.js tests/social-friend-profile-actions.test.js tests/login-action-bridge.test.js tests/app-shell-action-bridge.test.js tests/pwa-update-auto-reload.test.js` - 19 pass
  3. PASS: `node --test tests/*.test.js` - 688 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  6. PASS: `npm.cmd run deploy:production` - `d15af94f6324`, `tomatofarm-v20260703z18-social-feed-actions`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ d15af94f6324`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z18-social-feed-actions home/friend-feed.js::_bindFriendFeedActions home/friend-feed.js::data-feed-action home/friend-feed.js::friendFeedActionsBound tests/social-friend-feed-actions.test.js::friendFeedActionsBound`
  9. PASS: 운영 URL browser 확인 - `https://aretenald2018-sys.github.io/tomatofarm/` title `토마토 키우기`, login screen/app shell 표시, console error 0.
  10. not verified yet: 인증 세션이 없어 실제 friend feed 내부 `data-feed-action` 클릭 flow는 자동 검증하지 못했다.
- Slice 2 실행 요약:
  1. `home/friend-profile.js`의 `_bindFriendProfileActions(root)`에 reaction/comment submit/edit/delete/reply/save/cancel action을 추가했다.
  2. 식단 사진, meal/workout reaction badge와 picker button을 `data-social-action`/`data-*` payload로 전환했다.
  3. 댓글 입력 Enter, 등록, 답글, 수정, 삭제, 수정 저장을 inline `onkeydown`/`onclick`에서 delegate로 옮겼다.
  4. comment reply cancel은 `.onclick` property 대신 `cancel-comment-reply` action으로 처리한다.
  5. `tests/social-friend-profile-actions.test.js`를 확장했고 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z19-social-profile-actions`로 bump했다.
- Slice 2 검증:
  1. PASS: `node --check home/friend-profile.js; node --check sw.js; node --check tests/social-friend-profile-actions.test.js`
  2. PASS: `node --test tests/social-friend-profile-actions.test.js tests/social-friend-feed-actions.test.js tests/login-action-bridge.test.js tests/app-shell-action-bridge.test.js tests/pwa-update-auto-reload.test.js` - 19 pass
  3. PASS: `node --test tests/*.test.js` - 688 pass
  4. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  5. PASS: `git diff --check`
  6. INFO: `d8f9b8df241bff241856571259163905baf4678c` push 완료.
  7. INFO: Pages deploy action이 GitHub 내부 오류 `Deployment failed, try again later.`로 실패했다. 실패 run: push `28658327024`, workflow_dispatch `28658491911`, workflow_dispatch `28658583875`.
  8. PASS: workflow_dispatch `28658751644` 재시도로 Pages deploy 성공.
  9. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ d46c535267feacd3cf120770476c431ef59d59db`
  10. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z19-social-profile-actions home/friend-profile.js::_bindFriendProfileActions home/friend-profile.js::data-social-action home/friend-profile.js::confirm-edit-comment tests/social-friend-profile-actions.test.js::tomatofarm-v20260703z19-social-profile-actions`
  11. PASS: 운영 URL browser 확인 - `https://aretenald2018-sys.github.io/tomatofarm/` title `토마토 키우기`, login screen/app shell 표시, console error 0.
  12. not verified yet: 인증 세션이 없어 실제 friend profile 내부 reaction/comment `data-social-action` 클릭 flow는 자동 검증하지 못했다.
- Slice 3 실행 요약:
  1. `home/social-render-scheduler.js`를 추가해 social surface render 요청을 다음 프레임 1회로 병합한다.
  2. `home/friend-feed.js`의 `quickAddNeighbor`와 `friendLike`는 `renderFriendFeed()` 직접 호출 대신 `_scheduleFriendFeedRender(...)`를 사용한다.
  3. `home/friend-profile.js`의 reaction/notification read 후 feed refresh는 `_renderFriendFeedFn()` 직접 호출 대신 `_scheduleFriendProfileFeedRender(...)`를 사용한다.
  4. `tests/social-render-scheduler.test.js`를 추가해 scheduler coalescing, 직접 렌더 호출 금지, `sw.js` 정적 asset 등록을 검증한다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z20-social-render-scheduler`로 bump했고 `./home/social-render-scheduler.js`를 `STATIC_ASSETS`에 추가했다.
- Slice 3 검증:
  1. PASS: `node --check home/social-render-scheduler.js; node --check home/friend-feed.js; node --check home/friend-profile.js; node --check sw.js; node --check tests/social-render-scheduler.test.js`
  2. PASS: `node --test tests/social-render-scheduler.test.js tests/social-friend-feed-actions.test.js tests/social-friend-profile-actions.test.js tests/login-action-bridge.test.js tests/app-shell-action-bridge.test.js tests/pwa-update-auto-reload.test.js` - 23 pass
  3. PASS: `node --test tests/*.test.js` - 692 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=879`
  6. PASS: `npm.cmd run deploy:production` - `f6b39fcdb635`, `tomatofarm-v20260703z20-social-render-scheduler`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ f6b39fcdb635`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z20-social-render-scheduler home/social-render-scheduler.js::createSocialRenderScheduler home/friend-feed.js::_scheduleFriendFeedRender home/friend-profile.js::_scheduleFriendProfileFeedRender tests/social-render-scheduler.test.js::coalesces`
  9. PASS: 운영 URL browser 확인 - `https://aretenald2018-sys.github.io/tomatofarm/` title `토마토 키우기`, login screen/app shell 표시, console error 0.
  10. not verified yet: 인증 세션이 없어 실제 social reaction/comment/feed 내부 클릭 flow는 자동 검증하지 못했다.
- 다음 액션: 이 social plan은 완료 처리하고, 남은 앱 전체 inline handler/render coupling을 재인벤토리해 다음 follow-up plan을 만든다.

## 2026-07-03 전역 상호작용 결합 완화 리팩토링

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-global-interaction-decoupling-refactor.md`
- 리뷰:
  - `docs/ai/reviews/2026-07-03-global-interaction-slice1-review.md`
  - `docs/ai/reviews/2026-07-03-global-interaction-slice2-review.md`
  - `docs/ai/reviews/2026-07-03-global-interaction-slice3-review.md`
  - `docs/ai/reviews/2026-07-03-global-interaction-slice4-review.md`
  - `docs/ai/reviews/2026-07-03-global-interaction-slice5-review.md`
- 요청: 운동 코드 리팩토링에서 멈추지 않고 코드 전체의 UI/backend 상호의존성, inline handler, 전역 함수, 무거운 클릭 경로를 줄인다.
- 진단 요약:
  1. 선행 운동 계획의 Slice 5 인벤토리에서 `home/friend-profile.js`, `feature-login.js`, `index.html`, `workout/expert.js`, `workout/expert/max.js`가 다음 hotspot으로 남았다.
  2. `home/friend-profile.js`는 동적 HTML 내부 inline `onclick`이 많아 버튼 추가/수정 시 escaping과 전역 함수 결합 위험이 크다.
  3. 로그인과 Max는 blast radius가 커서 social profile delegate부터 작은 slice로 처리한다.
- 실행 슬라이스:
  1. Slice 1: `home/friend-profile.js` profile modal action을 scoped `data-social-action` delegate로 전환한다.
  2. Slice 2: `index.html`/`feature-login.js` login inline handler를 `data-login-action` bridge로 축소한다.
  3. Slice 3: app header/nav inline handler를 app-level action bridge로 옮긴다.
  4. Slice 4: Max auxiliary modal inline handler를 modal-local delegate로 전환한다.
  5. Slice 5: social/Max 중복 렌더 클릭 경로 하나를 경량화한다.
- 계획 검증:
  1. PASS: 기존 운동 후속 계획과 충돌하지 않는 별도 계획 문서 생성
  2. PASS: 다음 실행 slice가 하나의 화면/action namespace로 제한됨
- 슬라이스 1 실행 요약:
  1. `home/friend-profile.js` profile modal에 `_bindFriendProfileActions(root)`를 추가해 주요 click/Enter action을 scoped `data-social-action`/`data-social-enter-action`으로 전환했다.
  2. close, quick guild join, neighbor add, introduce, guild invite, tomato gift, guestbook submit, workout/meal comment toggle, guestbook reply/delete, author profile navigation을 delegate 계약으로 묶었다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z13-social-profile-actions`로 bump하고 cache marker 테스트를 갱신했다.
  4. 남은 inline 범위는 reaction picker/detail, introduce/guild invite 2차 모달, my guestbook modal, comment edit/reply/delete이며 다음 social slice 후보로 남긴다.
- 슬라이스 1 검증:
  1. PASS: `node --check home/friend-profile.js; node --check sw.js; node --check tests/social-friend-profile-actions.test.js`
  2. PASS: `node --test tests/social-friend-profile-actions.test.js tests/home-hero-layout.test.js tests/home-life-zone-npc-quest.test.js` - 16 pass
  3. PASS: `node --test tests/*.test.js` - 667 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  6. PASS: `npm.cmd run deploy:production` - `135dc5128908`, `tomatofarm-v20260703z13-social-profile-actions`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 135dc5128908`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z13-social-profile-actions home/friend-profile.js::_bindFriendProfileActions home/friend-profile.js::quick-add-neighbor home/friend-profile.js::submit-guestbook home/friend-profile.js::data-social-enter-action`
  9. PASS: 운영 URL in-app browser 로드 - title `토마토 키우기`, URL `https://aretenald2018-sys.github.io/tomatofarm/`, console error 0건
  10. not verified yet: 인증 세션이 없어 실제 친구 프로필 모달 버튼 클릭 flow는 로그인 화면(`loginVisible: true`)에서 막혔다.
- 슬라이스 2 실행 요약:
  1. `index.html` login/sign-up/password modal 주요 action을 `data-login-action`, `data-login-enter-action`, `data-login-input-action`, `data-login-focus-action`으로 전환했다.
  2. `feature-login.js`에 `_bindLoginActions(root)`를 추가해 `#login-screen`, `#login-pw-modal` 내부 action만 capture 단계에서 기존 함수로 라우팅한다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z14-login-action-bridge`로 bump하고 cache marker 테스트를 갱신했다.
  4. 김태우 lock screen, onboarding guild overlay, guild management modal, app header/nav inline handler는 다음 slice 후보로 남겼다.
- 슬라이스 2 검증:
  1. PASS: `node --check feature-login.js; node --check sw.js; node --check tests/login-action-bridge.test.js`
  2. PASS: `node --test tests/login-action-bridge.test.js tests/social-friend-profile-actions.test.js tests/pwa-update-auto-reload.test.js` - 10 pass
  3. PASS: `node --test tests/*.test.js` - 670 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  6. INFO: `npm.cmd run deploy:production`은 `ebbf71b0eb31dfaf556e9f02e3c7c54f5e5665a6` push 후 Pages가 이전 커밋을 보고 실패했다. push 자체는 성공했다.
  7. PASS: `gh workflow run "Verify Pages Runtime Assets" --repo aretenald2018-sys/tomatofarm --ref main` 후 run `28653036608` 성공.
  8. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ ebbf71b0eb31dfaf556e9f02e3c7c54f5e5665a6`
  9. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z14-login-action-bridge index.html::data-login-action index.html::data-login-enter-action feature-login.js::_bindLoginActions feature-login.js::loginActionsBound`
  10. PASS: 운영 URL in-app browser 로그인 화면 click flow - 로그인 화면 표시, 가입 화면 전환, 길드 토글 표시, 로그인 화면 복귀, console error 0건.
- 슬라이스 3 실행 요약:
  1. `index.html` top nav, 알림센터, 하단 탭, 더보기 메뉴, 탭 설정 modal action을 `data-app-action` 계약으로 전환했다.
  2. `app.js`에 `_bindAppShellActions(root)`와 `_runAppShellAction(action, control, event)`를 추가해 app shell action을 idempotent하게 라우팅한다.
  3. 역할 전환 시 `moreBtn.onclick`을 다시 만들지 않고 `data-app-action`/`data-tab`만 갱신한다.
  4. `navigation.js`의 동적 더보기 항목도 `data-app-action="switch-tab-close-more"`를 사용한다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z15-app-shell-action-bridge`로 bump하고 cache marker 테스트를 갱신했다.
- 슬라이스 3 검증:
  1. PASS: `node --check app.js; node --check navigation.js; node --check sw.js; node --check tests/app-shell-action-bridge.test.js`
  2. PASS: shell 범위 legacy inline handler 검색 - 대상 handler 없음
  3. PASS: `node --test tests/app-shell-action-bridge.test.js tests/login-action-bridge.test.js tests/pwa-update-auto-reload.test.js tests/workout-navigation-stack.test.js` - 14 pass
  4. PASS: `node --test tests/*.test.js` - 674 pass
  5. PASS: `git diff --check`
  6. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  7. PASS: `npm.cmd run deploy:production` - `328961273a03`, `tomatofarm-v20260703z15-app-shell-action-bridge`
  8. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 328961273a03`
  9. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z15-app-shell-action-bridge index.html::data-app-action app.js::_bindAppShellActions app.js::appShellActionsBound navigation.js::switch-tab-close-more`
  10. PASS: 운영 URL in-app browser 로드 - title `토마토 키우기`, `appShellActionsBound=1`, `data-app-action` controls 18개, console error 0건
  11. not verified yet: 실제 nav/more-menu 클릭 flow는 로그인 화면이 hit target을 덮어 인증 없이 누를 수 없었다. `#tab-nav [data-app-action="toggle-more-menu"]`와 diet tab 모두 center hit target이 `#login-screen`이었다.
- 슬라이스 4 실행 요약:
  1. `workout/expert/max.js`에 `_bindMaxModalActions(modal, handlers)`를 추가했다.
  2. 추천 조정, 기구풀, 데이터 클렌징, 과거 수행값, 청사진 modal의 close/save/history/delete action을 `data-max-modal-action`으로 전환했다.
  3. 테스트모드 시작 카드의 일반모드 복귀 버튼과 미니 온보딩 닫기 버튼도 기존 delegate 계약으로 옮겼다.
  4. `#max-v4-sheet` 본체 overlay/sheet inline handler 2개는 기존 capture/stopPropagation 규칙 유지를 위해 보류했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z16-max-aux-modal-actions`로 bump하고 cache marker 테스트를 갱신했다.
- 슬라이스 4 검증:
  1. PASS: `node --check workout/expert/max.js; node --check sw.js; node --check tests/max-auxiliary-modal-actions.test.js`
  2. PASS: `node --test tests/max-auxiliary-modal-actions.test.js tests/max-wendler.test.js tests/max-settle.test.js tests/workout-test-mode-unified.test.js tests/workout-save-mode-guard.test.js tests/pwa-update-auto-reload.test.js` - 44 pass
  3. PASS: `node --test tests/*.test.js` - 681 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  6. INFO: `npm.cmd run deploy:production`은 `e6ed405b5000a3ff01f4ec481b1d34d555eecaf5` push 후 Pages가 이전 커밋을 보고 실패했다. push 자체는 성공했다.
  7. INFO: 수동 workflow run `28654996300`도 GitHub Pages 내부 오류 `Deployment failed, try again later.`로 실패했다.
  8. PASS: 수동 workflow run `28655128179` 성공.
  9. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ e6ed405b5000a3ff01f4ec481b1d34d555eecaf5`
  10. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z16-max-aux-modal-actions workout/expert/max.js::_bindMaxModalActions workout/expert/max.js::data-max-modal-action workout/expert/max.js::switch-normal-view "tests/max-auxiliary-modal-actions.test.js::remaining Max inline handlers"`
  11. PASS: 운영 URL in-app browser 로드 - title `토마토 키우기`, `appShellBound=1`, console error 0건
  12. not verified yet: 실제 Max UI click flow는 로그인 화면이 운동 탭 hit target을 덮어 인증 없이 열 수 없었다. `#tab-nav [data-tab="workout"]` center hit target이 `#login-screen`이었다.
- 슬라이스 5 실행 요약:
  1. `workout/expert/max.js`의 `window.renderExpertTopArea()` 직접 호출 23곳을 `_scheduleExpertTopAreaRender()` 요청으로 전환했다.
  2. `_scheduleExpertTopAreaRender()`는 `requestAnimationFrame` 기준으로 같은 프레임의 Max 상단 렌더 요청을 1회로 병합한다.
  3. 직접 `window.renderExpertTopArea()` 참조는 scheduler 내부에만 남기고, Max click/save/modal action은 scheduler 계약만 호출하도록 했다.
  4. `tests/max-render-scheduler.test.js`를 추가하고 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z17-max-render-scheduler`로 bump했다.
- 슬라이스 5 검증:
  1. PASS: `node --check workout/expert/max.js; node --check sw.js; node --check tests/max-render-scheduler.test.js`
  2. PASS: `node --test tests/max-render-scheduler.test.js tests/max-auxiliary-modal-actions.test.js tests/max-wendler.test.js tests/max-settle.test.js tests/workout-test-mode-unified.test.js tests/workout-save-mode-guard.test.js tests/pwa-update-auto-reload.test.js` - 46 pass
  3. PASS: `node --test tests/*.test.js` - 683 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
  6. INFO: `f4442872c4435761ef848ddd6b2d5b41a4c78548` push 후 Pages deploy action이 GitHub 내부 오류 `Deployment failed, try again later.`로 실패했다.
  7. INFO: 수동 workflow run `28655912543`, `28656159691`도 같은 Pages 내부 오류로 실패했고, 운영 URL은 아직 이전 `07bc8743222e`/z16을 서빙한다.
  8. PASS: 새 docs commit `34b0bc01b23a`로 Pages deploy를 재트리거했고 `npm.cmd run deploy:production`이 통과했다.
  9. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 34b0bc01b23a`
  10. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ sw.js::tomatofarm-v20260703z17-max-render-scheduler workout/expert/max.js::_scheduleExpertTopAreaRender workout/expert/max.js::_expertTopAreaRenderScheduled workout/expert/max.js::requestAnimationFrame tests/max-render-scheduler.test.js::_scheduleExpertTopAreaRender`
  11. PASS: 운영 URL in-app browser 로드 - title `토마토 키우기`, `html[data-app-shell-actions-bound="1"]`, `data-app-action` controls 18개, console error 0건
  12. not verified yet: 실제 Max UI click flow는 로그인 화면이 운동 탭 hit target을 덮어 인증 없이 열 수 없었다. `#tab-nav [data-tab="workout"]` center hit target이 `#login-screen`이었다.
- 다음 액션: 후속 전역 리팩토링은 새 planning session으로 social feed/profile reaction 중복 렌더와 남은 inline handler 후보를 재인벤토리한다.

## 2026-07-03 운동 추가/카드 추가 결합 완화 리팩토링

- 상태: `ready_for_review`
- 계획: `docs/ai/features/2026-07-03-workout-add-decoupling-refactor.md`
- 리뷰:
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice1-review.md`
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice2-review.md`
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice3-review.md`
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice4-review.md`
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice6-review.md`
  - `docs/ai/reviews/2026-07-03-workout-add-decoupling-slice7-review.md`
- 요청: 운동종목추가/운동카드추가 주변 오류가 연쇄되지 않도록 UI와 저장/상태 상호의존성을 낮추고, 운동 코드에서 멈추지 말고 코드 전체의 클릭/전역 함수/무거운 버튼 경로까지 조망해 리팩토링한 뒤 화면 검증 후 배포한다.
- 진단 요약:
  1. `workout/exercises.js`의 피커 row click handler가 종목 선택, `S.workout.exercises` mutation, 카드 재렌더, 타이머/타임라인 후속효과, 저장, 피커 닫기, 카드 포커스, 하단시트 `afterSelect`까지 한 번에 처리한다.
  2. 최근 회귀가 피커/카드/하단시트 경계에서 반복되었고, 선택 상태 전이를 독립 테스트로 고정하는 계약이 부족하다.
  3. Firestore schema보다 UI 상태 전이 경계를 먼저 분리하는 편이 데이터 위험을 낮춘다.
- 실행 슬라이스:
  1. 완료: 슬라이스 1 `workout/exercise-entry-actions.js`로 운동 선택 상태 전이를 분리하고 테스트했다.
  2. 완료: 슬라이스 2 피커 이벤트 바인딩을 단일 위임 구조로 집중화했다.
  3. 완료: 슬라이스 3 종목 editor 저장 record 생성/검증을 분리했다.
  4. 완료: 슬라이스 4 하단시트 `afterSelect` detail contract를 명문화했다.
  5. 완료: 슬라이스 5 운동 외 전체 클릭 경로/전역 함수 의존/무거운 핸들러를 인벤토리화했다.
  6. 완료: 슬라이스 6 `render-calendar.js` 운동 day sheet card action을 inline `onclick/window._wtCal*`에서 scoped data attribute + sheet capture delegate로 전환했다.
  7. 완료: 슬라이스 7 하단시트 피커 선택의 중복 운동 탭 렌더 경로를 경량화했다.
- 슬라이스 1 실행 요약:
  1. `workout/exercise-entry-actions.js`를 추가해 운동 선택 상태 전이를 DOM/Firebase와 분리했다.
  2. 피커 row handler에서 직접 `S.workout.exercises.push(_buildPickerExerciseEntry(ex))`를 제거했다.
  3. `afterSelect` detail을 `workoutExerciseSelectionDetail(selection)`으로 통일했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z8-workout-entry-actions`로 bump하고 새 runtime module을 `STATIC_ASSETS`에 등록했다.
- 슬라이스 1 검증:
  1. PASS: `node --check workout/exercises.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/workout-exercise-entry-actions.test.js tests/ex-picker-selection-flow.test.js tests/workout-card-layout-css.test.js tests/workout-empty-picker-density.test.js tests/workout-picker-gym-rail.test.js` - 21 pass
  3. PASS: `node --test tests/*.test.js` - 654 pass
  4. PASS: `git diff --check`
  5. not verified yet: `node scripts/verify-runtime-assets.mjs`는 새 runtime 파일이 아직 stage 전이라 untracked 경고로 실패. stage 후 재실행 필요.
- 슬라이스 5 인벤토리 요약:
  1. source 기준 상위 hotspot은 `workout/expert/max.js`, `workout/expert.js`, `index.html`, `feature-login.js`, `home/friend-profile.js`, `render-calendar.js`, `workout/exercises.js` 순서다.
  2. `render-calendar.js`는 total 74, inline 23, window 48이고 운동 day sheet card action이 기존 `_bindWorkoutHomeSheetActions()` capture delegate 근처에 있어 가장 안전한 다음 slice다.
  3. Max V4와 social/login/index 전환은 표면이 넓으므로 별도 slice로 나눈다.
- 슬라이스 6 실행 요약:
  1. `render-calendar.js` 운동 day sheet의 세트 추가/종목완료/삭제/카드 접기/러닝 다시 측정 버튼을 `data-wt-sheet-card-action`으로 전환했다.
  2. `_bindWorkoutHomeSheetActions()` capture listener에 `_runWorkoutHomeSheetCardAction(action, control)` dispatcher를 추가했다.
  3. 해당 button group의 `window._wtCalAddExerciseSet`, `window._wtCalCompleteExercise`, `window._wtCalToggleExerciseCard`, `window._wtCalAddRunning`, `window._wtCalDeleteExercise`, `window._wtCalDeleteActivity` exports를 제거했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z9-calendar-sheet-actions`로 bump하고 cache marker 테스트를 갱신했다.
- 슬라이스 6 검증:
  1. PASS: `node --check render-calendar.js; node --check workout/exercises.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/workout-exercise-entry-actions.test.js tests/ex-picker-selection-flow.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-card-layout-css.test.js tests/workout-empty-picker-density.test.js tests/workout-picker-gym-rail.test.js` - 52 pass
  3. PASS: `node --test tests/*.test.js` - 655 pass
  4. PASS: `git diff --check`
- 슬라이스 2 실행 요약:
  1. `workout/exercises.js`의 피커 row 선택 후속효과를 `_selectPickerExercise(ex)`로 분리했다.
  2. picker list row selection/edit/delete/hide/source-filter를 `_bindPickerListActions(container)`의 click/keydown delegate로 처리한다.
  3. `_renderPickerList()` row loop는 `data-picker-exercise-id`, `data-picker-row-action`만 렌더하고 per-row selection/edit/delete/hide listener를 붙이지 않는다.
- 슬라이스 2 검증:
  1. PASS: `node --check workout/exercises.js; node --check render-calendar.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/workout-exercise-entry-actions.test.js tests/ex-picker-selection-flow.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-card-layout-css.test.js tests/workout-empty-picker-density.test.js tests/workout-picker-gym-rail.test.js tests/stats-picker-ui-polish.test.js tests/workout-navigation-stack.test.js` - 63 pass
  3. PASS: `node --test tests/*.test.js` - 655 pass
  4. PASS: `git diff --check`
- 슬라이스 3 실행 요약:
  1. `workout/exercise-editor-actions.js`를 추가해 editor record 생성/검증 helper를 분리했다.
  2. `wtSaveExerciseFromEditor()`는 DOM 읽기, 신규 부위 저장, record build, `saveExercise()`, 저장 검증, program save 순서만 orchestrate한다.
  3. program save는 검증된 saved record만 사용하고 `saved || record` fallback을 제거했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z10-exercise-editor-actions`로 bump하고 새 runtime module을 `STATIC_ASSETS`에 등록했다.
- 슬라이스 3 검증:
  1. PASS: `node --check workout/exercises.js; node --check workout/exercise-editor-actions.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/exercise-editor-actions.test.js tests/exercise-program-editor.test.js tests/ex-picker-selection-flow.test.js tests/workout-exercise-entry-actions.test.js tests/stats-picker-ui-polish.test.js tests/workout-picker-gym-rail.test.js` - 27 pass
  3. PASS: `node --test tests/*.test.js` - 660 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=874`
  6. PASS: `npm.cmd run deploy:production` - `6577cc3fe7cb`, `tomatofarm-v20260703z10-exercise-editor-actions`, `static=241`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 6577cc3fe7cb`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ "sw.js::tomatofarm-v20260703z10-exercise-editor-actions" "workout/exercise-editor-actions.js::buildExerciseEditorRecord" "workout/exercise-editor-actions.js::verifyExerciseEditorSavedRecord" "workout/exercises.js::verifyExerciseEditorSavedRecord"`
  9. not verified yet: 운영 브라우저는 로그인 화면이 전체 viewport를 덮고 `button[data-tab="workout"]`의 hit target이 `#login-screen`으로 잡혀 인증 운동 UI 클릭 플로우까지 도달하지 못했다.
- 슬라이스 4 실행 요약:
  1. `WORKOUT_EXERCISE_SELECTION_DETAIL_FIELDS`로 `entryIdx`, `exerciseId`, `exercise`, `existing` 필드 계약을 상수화했다.
  2. `normalizeWorkoutExerciseSelectionDetail()`를 추가해 하단시트가 raw picker detail을 직접 파싱하지 않게 했다.
  3. `_refreshWorkoutHomeAfterPickerSelect()`는 정규화된 detail의 `entryIdx`/`existing`만 읽어 캐러셀 복원과 toast를 처리한다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z11-selection-detail-contract`로 bump하고 cache marker 테스트를 갱신했다.
- 슬라이스 4 검증:
  1. PASS: `node --check render-calendar.js; node --check workout/exercises.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/workout-exercise-entry-actions.test.js tests/ex-picker-selection-flow.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js tests/workout-save-mode-guard.test.js tests/workout-test-mode-unified.test.js` - 55 pass
  3. PASS: `node --test tests/*.test.js` - 662 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
- 슬라이스 7 실행 요약:
  1. `_selectPickerExercise()`에서 `afterSelect`가 있는 하단시트 선택 경로는 숨겨진 운동 탭 리스트/상단/타임라인 재렌더를 생략한다.
  2. 일반 운동 탭 선택은 기존처럼 `_renderExerciseList()`, `_syncExpertTopArea()`, timer bar, timeline refresh를 수행한다.
  3. draft 보존, picker close, `saveWorkoutDay({ keepDraftExercises: true })`, sheet refresh는 유지했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z12-picker-sheet-fast-path`로 bump하고 cache marker 테스트를 갱신했다.
- 슬라이스 7 검증:
  1. PASS: `node --check workout/exercises.js; node --check render-calendar.js; node --check workout/exercise-entry-actions.js; node --check sw.js`
  2. PASS: `node --test tests/ex-picker-selection-flow.test.js tests/workout-exercise-entry-actions.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-save-mode-guard.test.js tests/workout-navigation-stack.test.js tests/stats-picker-ui-polish.test.js tests/workout-picker-gym-rail.test.js` - 60 pass
  3. PASS: `node --test tests/*.test.js` - 662 pass
  4. PASS: `git diff --check`
  5. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=875`
- 다음 액션: 인증 계정으로 운영 URL에서 `운동 탭 -> 하단시트 + -> 종목 선택 -> 카드 표시` UI flow를 직접 확인한다. 인증이 계속 불가하면 social/login/Max hotspot 후속 계획을 별도 문서로 만든다.

## 2026-07-03 운동 종목 피커 CRUD 신규 추가 버튼 노출

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-exercise-picker-visible-crud-add.md`
- 리뷰: `docs/ai/reviews/2026-07-03-exercise-picker-visible-crud-add-review.md`
- 요청: 운동 종목 목록 화면에서 신규 종목을 추가할 수 있는 버튼이 보이지 않는다. 종목은 CRUD가 되어야 한다.
- 진단 요약:
  1. 생성/수정/삭제 로직은 `workout/exercises.js`의 종목 에디터에 이미 있다.
  2. 신규 추가 진입점은 상단 아이콘 또는 목록 하단 부위별 버튼에 숨어 있어 현재 목록 화면에서 명시적으로 보이지 않는다.
  3. 검색/필터 결과가 비어도 신규 생성 CTA가 없어 CRUD 완성도가 낮아 보인다.
- 실행 범위:
  1. 종목 피커 목록 툴바에 항상 보이는 `+ 종목 추가` 버튼을 추가한다.
  2. 빈 결과 상태에서도 신규 추가 버튼을 제공한다.
  3. 모바일에서 정렬/범위/추가 버튼이 겹치지 않게 `style.css`를 조정한다.
  4. `workout/exercises.js`, `style.css` 변경에 맞춰 `sw.js` `CACHE_VERSION`과 관련 테스트를 갱신한다.
- 구현 요약:
  1. 목록 툴바에 `data-picker-create-exercise` 기반 `+ 종목 추가` 버튼을 추가했다.
  2. 빈 결과 상태에 `data-picker-empty-create` 버튼을 추가했다.
  3. 기존 생성/수정/삭제 에디터 경로는 유지하고, 신규 버튼은 `_openPickerEditorFromHeader()`를 재사용한다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z7-exercise-picker-crud-add`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check workout/exercises.js; node --check sw.js`
  2. PASS: `node --test tests/stats-picker-ui-polish.test.js tests/workout-empty-picker-density.test.js tests/workout-picker-gym-rail.test.js` (14 pass)
  3. PASS: `node --test tests/*.test.js` (650 pass)
  4. PASS: `node scripts/verify-runtime-assets.mjs` (`refs=868`)
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run deploy:production` (`c32813a765f5`, `tomatofarm-v20260703z7-exercise-picker-crud-add`)
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ c32813a765f5`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ "sw.js::tomatofarm-v20260703z7-exercise-picker-crud-add" "workout/exercises.js::data-picker-create-exercise" "workout/exercises.js::data-picker-empty-create" "style.css::.ex-picker-create-btn"`
  9. not verified yet: 운영 브라우저가 로그인 전 상태라 실제 인증 계정의 `운동 -> + 종목 추가(선택) -> 부위 목록 -> + 종목 추가 -> 저장/삭제` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 인증 계정 실제 모바일 UI에서 종목 피커 목록 상단의 `+ 종목 추가` 버튼과 빈 결과 상태의 추가 버튼이 보이는지 확인한다.

## 2026-07-03 운동 바텀시트 재열기 캐러셀 상태 보존

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-workout-carousel-reopen-state.md`
- 리뷰: `docs/ai/reviews/2026-07-03-workout-carousel-reopen-state-review.md`
- 요청: 운동 하단시트를 닫았다 다시 열면 첫 종목이 아니라 닫기 직전에 보고 있던 종목 카드가 보여야 한다.
- 진단 요약:
  1. 기존 캐러셀 캡처/복원 함수는 세트 저장/재렌더 같은 같은 렌더 흐름 안에서는 동작한다.
  2. 새 종목 추가 직후 helper는 선택된 slide로 일회성 이동만 수행한다.
  3. 하단시트를 닫기 전에 현재 slide를 날짜+회차 단위 상태로 저장하지 않고, 다시 열 때 복원하지 않는다.
- 실행 범위:
  1. 날짜+회차 단위 마지막 캐러셀 slide 메모리를 추가한다.
  2. 닫기 전 저장, 열기 후 복원, 회차 전환 전후 저장/복원을 연결한다.
  3. `render-calendar.js` 변경에 맞춰 `sw.js` `CACHE_VERSION`과 관련 테스트를 갱신한다.
- 구현 요약:
  1. `_workoutSheetCarouselSnapshots`로 날짜+회차별 마지막 캐러셀 slide index를 기억한다.
  2. 시트 닫힘, nav snapshot 닫힘, 회차 전환 전 현재 slide를 저장하고, 열기/재열기/회차 전환 후 저장된 slide를 복원한다.
  3. 새 종목 추가 직후 선택된 slide도 마지막 상태로 기록한다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z6-workout-carousel-reopen-state`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-active-session-recovery.test.js tests/workout-save-mode-guard.test.js` - 41 pass
  3. PASS: `node --test tests/*.test.js` - 649 pass
  4. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=868`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run deploy:production` - 운영계 deploy verify 및 기본 marker 검증 완료
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <deployed-commit>`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ "sw.js::tomatofarm-v20260703z6-workout-carousel-reopen-state" "render-calendar.js::_workoutSheetCarouselSnapshots" "render-calendar.js::_restoreRememberedWorkoutSheetCarousel" "render-calendar.js::_rememberWorkoutSheetCarouselState"`
  9. not verified yet: 인증 계정 실제 UI에서 `새 종목 카드 표시 -> 하단시트 닫기 -> 다시 열기 -> 같은 종목 카드 표시` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 운영계 배포 후 인증 계정 실제 UI에서 위 클릭 플로우를 확인한다.

## 2026-07-03 운동 새 종목 추가 후 캐러셀 포커스

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-workout-carousel-new-exercise-focus.md`
- 리뷰: `docs/ai/reviews/2026-07-03-workout-carousel-new-exercise-focus-review.md`
- 요청: 운동 하단시트에서 새 종목을 추가하면 캐러셀이 첫 종목이 아니라 방금 추가한 종목 카드를 보여줘야 한다.
- 진단 요약:
  1. 운동 선택기 `afterSelect`는 선택된 종목의 `entryIdx`를 `_refreshWorkoutHomeAfterPickerSelect()`로 넘긴다.
  2. 현재 새 종목 추가 후 재렌더 경로는 날짜/회차/시트 상태만 복원하고 `entryIdx`를 캐러셀 위치 복원에 쓰지 않는다.
  3. 따라서 새 DOM의 캐러셀 track이 기본 위치인 첫 번째 카드에 머물 수 있다.
- 실행 범위:
  1. `_refreshWorkoutHomeAfterPickerSelect()`가 `detail.entryIdx`를 정규화한다.
  2. 재렌더 후 하단시트 캐러셀을 선택된 slide로 복원하는 helper를 추가한다.
  3. `render-calendar.js` 변경에 맞춰 `sw.js` `CACHE_VERSION`과 관련 테스트를 갱신한다.
- 구현 요약:
  1. `_restoreWorkoutSheetCarouselToSlide()`를 추가해 선택된 slide index로 캐러셀 track을 복원한다.
  2. 선택기 `afterSelect` 완료 후 `detail.entryIdx`가 있으면 렌더 직후 해당 slide로 이동한다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z5-workout-carousel-new-focus`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-active-session-recovery.test.js tests/workout-save-mode-guard.test.js` - 40 pass
  3. PASS: `node --test tests/*.test.js` - 648 pass
  4. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=868`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run deploy:production` - 운영계 deploy verify 및 기본 marker 검증 완료
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ <deployed-commit>`
  8. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/tomatofarm/ "sw.js::tomatofarm-v20260703z5-workout-carousel-new-focus" "render-calendar.js::_restoreWorkoutSheetCarouselToSlide" "render-calendar.js::carouselSlideIndex: index"`
  9. not verified yet: 인증 계정 실제 UI에서 `운동 하단시트 + 버튼 -> 새 종목 선택 -> 추가된 종목 카드 표시` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 운영계 배포 후 인증 계정 실제 UI에서 위 클릭 플로우를 확인한다.

## 2026-07-03 운동 카드 캐러셀 위치 보존

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-workout-carousel-position-preserve.md`
- 리뷰: `docs/ai/reviews/2026-07-03-workout-carousel-position-preserve-review.md`
- 요청: 캐러셀에서 두 번째 종목을 입력하거나 체크하면 저장/재렌더 후 강제로 첫 번째 종목으로 이동하는 회귀를 막는다.
- 진단 요약:
  1. 세트 입력/체크는 올바른 `exerciseIndex`를 전달하지만 저장 후 하단시트가 재렌더된다.
  2. `_saveWorkoutHomeSessionResult()`는 세로 scroll/focus만 복원하고 캐러셀 track의 `scrollLeft` 또는 활성 slide를 복원하지 않는다.
  3. 따라서 새 DOM의 `data-wt-day-exercise-carousel-track`이 기본 scroll 위치 0으로 시작해 첫 번째 종목으로 튄다.
- 구현 요약:
  1. `_workoutSheetScrollState()`가 하단시트 운동 카드 캐러셀의 `scrollLeft`와 활성 slide index를 함께 캡처한다.
  2. `_restoreWorkoutSheetScrollState()`가 재렌더 후 `data-wt-day-exercise-carousel-track` 위치를 복원한다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z4-workout-carousel-position`으로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-active-session-recovery.test.js tests/workout-save-mode-guard.test.js` - 39 pass
  3. PASS: `node --test tests/*.test.js` - 647 pass
  4. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=868`
  5. PASS: `git diff --check`
  6. not verified yet: 인증 계정 실제 UI에서 `두 번째 종목 카드 -> 세트 입력/체크 -> 같은 카드 유지` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 운영계 배포 후 인증 계정 실제 UI에서 위 클릭 플로우를 확인한다.

## 2026-07-03 운동 완료 도장 명시 액션 제한

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-workout-complete-stamp-explicit-action.md`
- 리뷰: `docs/ai/reviews/2026-07-03-workout-complete-stamp-explicit-action-review.md`
- 요청: `+` 버튼만 눌렀는데 `종목완료`를 누르지 않아도 완료 도장이 찍히는 회귀를 막는다.
- 진단 요약:
  1. `_defaultWorkoutSheetSet()`은 `done: false`로 시작하므로 `+`가 직접 완료 세트를 복사하는 문제가 아니다.
  2. 현재 도장 표시 조건은 `_isWorkoutExerciseComplete(row)`의 세트 `done` 상태 기반이라, `종목완료` 클릭 여부와 분리되어 있지 않다.
  3. 완료 도장은 세트 단위 체크가 아니라 `종목완료` 명시 액션 marker를 기준으로 표시해야 한다.
- 구현 요약:
  1. `render-calendar.js`가 `exerciseCompletedAt` marker와 완료 가능한 세트 `done` 상태를 함께 만족할 때만 `완료` 도장을 렌더한다.
  2. `종목완료` 경로만 marker를 저장하고, 세트 수정/추가/삭제/토글은 marker를 지워 `+` 버튼만으로 도장이 찍히지 않게 했다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z3-workout-complete-stamp-marker`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-active-session-recovery.test.js tests/workout-save-mode-guard.test.js` - 38 pass
  3. PASS: `node --test tests/*.test.js` - 646 pass
  4. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=868`
  5. PASS: `git diff --check`
  6. not verified yet: 인증 계정 실제 UI에서 `+ 버튼만 누름 -> 완료 도장 없음 -> 종목완료 -> 완료 도장 표시` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 운영계 배포 후 인증 계정 실제 UI에서 위 클릭 플로우를 확인한다.

## 2026-07-03 운영계 전용 배포 규칙 정리

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-production-only-deploy.md`
- 리뷰: `docs/ai/reviews/2026-07-03-production-only-deploy-review.md`
- 요청: Dashboard3 쪽 배포/검증을 기본 경로에서 빼고 운영계만 배포하게 설정한다.
- 구현 요약:
  1. `AGENTS.md`와 `CLAUDE.md`의 최종 배포/검증 규칙을 `https://aretenald2018-sys.github.io/tomatofarm/` 기준으로 교체했다.
  2. `package.json`에 `deploy:production`을 추가하고 `scripts/deploy-production.mjs`를 만들었다.
  3. `scripts/deploy-dashboard3.mjs`는 `ALLOW_DASHBOARD3_DEPLOY=1` 없이는 실행되지 않게 막았다.
- 검증:
  1. PASS: `node --check scripts/deploy-production.mjs scripts/deploy-dashboard3.mjs`
  2. PASS: `npm.cmd run deploy:dashboard3` 기본 실행 차단 확인
  3. PASS: `npm.cmd run deploy:production` - `125c5384ce89`, 운영계 deploy verify 및 기본 marker 검증 완료
- 다음 액션: 배포가 필요하면 `origin/main`에 push하고 Tomato Farm 운영계 Pages에서 배포 commit 및 실제 UI flow를 확인한다. Dashboard3는 명시 요청이 있을 때만 사용한다.

## 2026-07-03 운동 종목 삭제 우선순위 핫픽스

- 상태: `complete`
- 계획: `docs/ai/features/2026-07-03-workout-exercise-delete-priority.md`
- 리뷰: `docs/ai/reviews/2026-07-03-workout-exercise-delete-priority-review.md`
- 요청: 당일 `x`로 삭제한 운동종목이 `종목완료` 완료 상태나 active draft 때문에 다시 살아나지 않도록 삭제 상태를 우선한다.
- 진단 요약:
  1. `render-calendar.js`의 `x` 삭제 저장 payload는 `workoutSessions`와 aggregate `exercises`를 다시 계산하므로 삭제 payload 자체가 주원인은 아니다.
  2. 하단시트 저장 후 `S.workout`과 localStorage active draft가 같은 날짜/회차의 저장 결과로 갱신되지 않아, 오래된 운동 탭 상태가 이후 저장/복구에서 삭제 전 종목을 되살릴 수 있다.
  3. `종목완료` 도장 렌더는 세트 `done` 상태 기반이고, 실제 우선순위 문제는 완료 상태와 삭제 상태가 서로 다른 저장 경로/초안에 남는 점이다.
- 구현 요약:
  1. `workout/timers.js`에 같은 날짜/회차 active draft만 저장된 세션으로 교체하는 `wtReplaceActiveWorkoutDraftSession()`을 추가했다.
  2. `render-calendar.js`의 하단시트 저장 성공 경로가 저장한 `sessionIndex` 하나만 active draft와 같은 날짜/회차 `S.workout`에 반영한다.
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z2-workout-delete-priority`로 bump하고 cache marker 테스트를 갱신했다.
- 검증:
  1. PASS: `node --check render-calendar.js; node --check workout/timers.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-active-session-recovery.test.js tests/workout-save-mode-guard.test.js` - 37 pass
  3. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=868`
  4. PASS: `node --test tests/*.test.js` - 645 pass
  5. PASS: `git diff --check`
  6. not verified yet: 인증 계정 실제 UI에서 `운동 홈 하단시트 -> 종목완료 -> x 삭제 -> 새로고침/재진입 후 삭제 유지` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 배포가 필요하면 `origin/main`에 push하고 Tomato Farm 운영계 Pages에서 배포 commit 및 실제 UI flow를 확인한다.

## 2026-07-03 종목완료 도장 유지 핫픽스

- 상태: `complete`
- 기준 작업트리: `C:\Users\USER\Desktop\Tomato Project\tomatofarm-deploy-life-zone-nickname`
- 기준 원격: `tomatofarm/main`
- 계획: `docs/ai/features/2026-07-02-workout-card-inline-set-complete.md`
- 리뷰: `docs/ai/reviews/2026-07-02-workout-card-inline-set-complete-review.md`
- 구현 요약:
  1. 원인: `종목완료` 완료 도장이 저장 상태가 아니라 `WORKOUT_EXERCISE_STAMP_MS = 1600` 메모리 타이머에 묶여 있었다.
  2. `render-calendar.js`가 저장된 세트 완료 row 상태에서 도장을 계속 렌더하게 했다.
  3. `_markWorkoutExerciseCompletionStamp()`의 timeout 삭제/재렌더 경로를 제거했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260703z1-workout-card-stamp-persist`로 bump했다.
- 검증:
  1. PASS: `node --check render-calendar.js sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` (25 pass)
  3. PASS: `node scripts/verify-runtime-assets.mjs` (`refs=866`)
  4. PASS: `node --test tests/*.test.js` (643 pass)
  5. PASS: `git diff --check`
  6. PASS: `git push tomatofarm HEAD:main` (`ef85c9e`)
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ ef85c9e`
  8. PASS: 운영 `sw.js` HTTP 200 + `tomatofarm-v20260703z1-workout-card-stamp-persist`
  9. PASS: 운영 `render-calendar.js` HTTP 200 + `function _isWorkoutExerciseComplete` 포함, `WORKOUT_EXERCISE_STAMP_MS` 없음
  10. not verified yet: in-app Browser가 webview attach timeout으로 멈춰 인증 계정 실제 `운동 탭 -> 세트 입력 -> 종목완료 -> 2초 후 도장 유지` 클릭 플로우는 자동 검증하지 못했다.
- 다음 액션: 인증 계정 실제 UI에서 `종목완료` 후 2초 뒤에도 `완료` 도장이 남는지 확인한다.

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-02-workout-card-inline-set-complete.md`
- 진단 문서: `없음 - 계획 문서에 진단 기록`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-workout-card-inline-set-complete-review.md`
- 현재 단계: `운동 카드 인라인 + 행/종목완료 Slice 1 배포 검증 완료`
- 작업 브랜치: `deploy/tomatofarm-20260629`
- 마지막 완료: `운동 카드 세트 리스트 마지막에 + 행을 추가하고, footer 버튼을 종목완료 하나로 줄였으며, 완료 저장 시 붉은 완료 도장 이펙트를 추가했다. 운영계/Dashboard3 Pages marker 검증까지 완료했다.`
- 다음 액션: `인증 계정 실제 모바일 UI에서 운동 카드 + 행 추가와 종목완료 도장 이펙트를 확인한다.`
- 차단 사유: `없음.`

## 이번 계획

- 요청: 운동 세트 행 아래에 항상 비어 있는 `+` 행을 두고, 카드 footer는 `종목완료` 하나만 남긴다. `종목완료` 시 해당 종목 기록을 확정 저장하고 붉은 `완료` 도장 이펙트를 보여준다.
- 결정: 펼쳐진 운동 카드는 바로 입력 가능한 세트 행을 렌더하고, `+` 행은 기존 세트 추가 저장 경로를 재사용한다. `종목완료`는 값이 있는 세트를 완료 처리해 저장한 뒤 45도 붉은 도장 이펙트를 표시한다.
- 범위: `render-calendar.js`, `style.css`, `tests/workout-calendar-bottom-sheet.test.js`, cache marker 테스트들, `sw.js`, `docs/ai/*`.
- 제외: 운동 picker 플로우, 러닝 카드 UX, Firestore schema, 일반 운동 탭 카드, 세트 타입/웬들러 산식 변경.
- 검증: `node --check`, 하단 시트 테스트, 전체 테스트, runtime asset 검증, `git diff --check`, Pages 배포 검증.

## 이번 실행 결과

- 완료: `_renderWorkoutSetRows()`가 세트 행 마지막에 `wt-max-set-add-row` `+` 버튼을 항상 렌더한다.
- 완료: `_renderWorkoutExerciseDetailCard()` footer를 `종목완료` 하나로 줄이고 펼쳐진 카드 세트 행을 바로 편집 가능하게 했다.
- 완료: `_completeWorkoutExerciseFromSheet()`가 입력된 세트를 완료 처리해 저장하고 `완료` 도장 이펙트를 표시한다.
- 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z17-workout-card-inline-complete`로 bump하고 cache marker 테스트를 갱신했다.
- PASS: `node --check render-calendar.js; node --check sw.js`
- PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` - 25 tests passed
- PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=862`
- PASS: `node --test --test-reporter=dot @testFiles`
- PASS: `git diff --check`
- PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ b144556`
- PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ b144556`
- PASS: Dashboard3/운영계 marker 검증 - `tomatofarm-v20260702z17-workout-card-inline-complete`, `wt-max-set-add-row`, `window._wtCalCompleteExercise`, `wt-max-complete-stamp`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-workout-card-inline-set-complete-review.md`
- not verified yet: 인증 계정 실제 `운동 탭 -> 카드 + 행 -> 세트 입력 -> 종목완료 -> 완료 도장` UI flow 확인 필요.

## 방금 계획/실행한 항목

- Home Running Map Route Clarity 계획/실행/리뷰:
  1. 요청: 홈 라이프존 말풍선 안에 사진 2처럼 주변 지형이 읽히는 지도 배율과 사진 3처럼 명확한 주행 경로선을 표시한다.
  2. 진단: 이전 fallback 보강은 타일 실패/설정 문제를 막았지만, 현재 문제는 말풍선 자체가 `172x121` 내부 캔버스와 최대 `76px` 표시 폭, `RUNNING_MAP_HOME_MAX_ZOOM = 12` 제한 때문에 경로가 읽히지 않는 UX 문제다.
  3. 결정: Slice 1은 홈 말풍선 지도 크기, route bounds 기반 zoom fit, 흰색 casing + 빨간 main route overlay, 시작점/현재 위치 marker만 개선한다.
  4. 범위: `home/life-zone.js`, `style.css`, `sw.js`, 홈 지도 테스트와 cache marker 테스트.
  5. 제외: VWorld provider 교체, GPS 수집/저장 schema, 운동 상세 지도, 홈 부분 업데이트 리팩터.
  6. 완료: `home/life-zone.js` 내부 지도 viewBox를 `300x210`으로 키우고 `_zoomForRunningMap()`을 픽셀 span fit 방식으로 바꿨다.
  7. 완료: `style.css`에서 `.lz-running-map-bubble` 표시 폭을 `clamp(92px, calc(300 / 1672 * 100%), 136px)`로 확대하고 route casing/main/start/current 스타일을 추가했다.
  8. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z5-home-running-map-route`로 bump하고 관련 테스트 marker를 갱신했다.
  9. PASS: `node --check home/life-zone.js; node --check sw.js`
  10. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/running-entry.test.js` - 23 tests passed
  11. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=862`
  12. PASS: `node --test --test-reporter=dot tests/*.test.js`
  13. PASS: `git diff --check`
  14. 완료: 커밋 `ef2b832 fix: clarify home running map route bubble`를 `origin/main`에 push했다.
  15. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ ef2b8327e044ff8b50550ae47fd3342d046d015c` -> `[deploy-verify] ok ef2b8327e044 tomatofarm-v20260702z5-home-running-map-route static=236`
  16. PASS: Dashboard3 Pages marker 검증 - 배포된 `sw.js`, `home/life-zone.js`, `style.css`에서 새 cache version과 지도 route overlay marker 확인
  17. 리뷰 문서: `docs/ai/reviews/2026-07-02-home-running-map-route-clarity-review.md`
  18. not verified yet: 인증 계정 홈탭 실제 러닝 말풍선 UI flow 확인 필요.

- Home Running Map Route Clarity Slice 2:
  1. 요청: 말풍선 크기는 현재 대비 50% 줄이되, 내부 지도 배율은 올림픽공원 맥락이 드러나게 한다.
  2. 완료: `home/life-zone.js`에서 `RUNNING_MAP_HOME_MAX_ZOOM`과 `RUNNING_MAP_SINGLE_POINT_ZOOM`을 `14`로 낮췄다.
  3. 완료: VWorld tile을 SVG `<image>`로 렌더하고 현재 위치 dot도 SVG circle로 바꿔, tile/path/start/current marker가 같은 viewBox에서 함께 축소되게 했다.
  4. 완료: `style.css`에서 `.lz-running-map-bubble` 표시 폭을 `clamp(46px, calc(150 / 1672 * 100%), 68px)`로 줄였다.
  5. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z6-home-running-map-park-scale`로 bump하고 관련 테스트 marker를 갱신했다.
  6. PASS: `node --check home/life-zone.js; node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/running-entry.test.js` - 23 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=862`
  9. PASS: `node --test --test-reporter=dot tests/*.test.js`
  10. PASS: `git diff --check`
  11. 완료: 커밋 `0e9c5a9 fix: shrink home running map bubble scale`를 `origin/main`에 push했다.
  12. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 0e9c5a93661ae24515486d38d2e1217e8d784b41` -> `[deploy-verify] ok 0e9c5a93661a tomatofarm-v20260702z6-home-running-map-park-scale static=236`
  13. PASS: Dashboard3 Pages marker 검증 - 배포된 `sw.js`, `home/life-zone.js`, `style.css`에서 새 cache version, zoom 14, SVG tile/current marker, 절반 폭 marker 확인
  14. not verified yet: 인증 계정 홈탭 실제 러닝 말풍선 UI flow 확인 필요.

- Home Running Map Route Clarity Slice 3:
  1. 요청: 러닝 지도 말풍선을 러닝 캐릭터 가까이에 붙이고, 말풍선 클릭 시 그 사람의 오늘 러닝 기록 모달을 띄운다.
  2. 완료: `home/life-zone-state.js` 러닝 슬롯 `bubbleY`를 `[1076, 1116, 1078]`로 조정했다.
  3. 완료: `home/life-zone.js` 말풍선을 클릭 가능한 `button`으로 바꾸고 `_openRunningRecordModal()` 동적 모달을 추가했다.
  4. 완료: 말풍선/모달 지도 렌더를 `_renderRunningMapSvg()`로 공유하게 했다.
  5. 완료: `style.css`에 말풍선 focus/active 상태와 `.lz-running-record-*` 하단 시트 스타일을 추가했다.
  6. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z7-home-running-map-record-modal`로 bump하고 관련 테스트 marker를 갱신했다.
  7. PASS: `node --check home/life-zone.js; node --check home/life-zone-state.js; node --check sw.js`
  8. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js tests/running-entry.test.js` - 43 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=862`
  10. PASS: `node --test --test-reporter=dot tests/*.test.js`
  11. PASS: `git diff --check`
  12. 완료: 커밋 `d61f133 fix: add home running record modal`를 `origin/main`에 push했다.
  13. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ d61f1335eede8933e192388e9eaa2e8a13f4f252` -> `[deploy-verify] ok d61f1335eede tomatofarm-v20260702z7-home-running-map-record-modal static=236`
  14. PASS: Dashboard3 Pages marker 검증 - 배포된 `sw.js`, `home/life-zone.js`, `home/life-zone-state.js`, `style.css`에서 cache version, 기록 모달, `bubbleY`, clickable marker 확인
  15. 리뷰 문서: `docs/ai/reviews/2026-07-02-home-running-map-record-modal-review.md`
  16. not verified yet: 인증 계정 홈탭 실제 러닝 말풍선 클릭 UI flow 확인 필요.

- Workout iOS Sheet Input Scroll 실행:
  1. 요청: iPhone PWA에서 운동종목 추가 후 KG/REP 입력·수정 시 화면이 위로 자동 스크롤되는 문제를 해결한다.
  2. 요청: 운동 세트 추가 시 숫자 기본값을 지우고 빈 값으로 시작한다.
  3. 진단: 숫자 input 저장이 `saveDay()` 뒤 전체 재렌더를 호출하면서 iOS 키보드/visual viewport가 포커스 요소 교체를 자동 스크롤로 보정하는 흐름으로 판단했다.
  4. 완료: `render-calendar.js`에 시트 input 상태 캡처/복원, `data-wt-set-input`, `preventScroll`, `.wt-day-sheet-scroll` 복원을 추가했다.
  5. 완료: `render-calendar.js` 시트 새 세트 KG/REP 기본값과 빈 입력 저장값을 `''`로 보존했다.
  6. 완료: `workout/exercises.js` 실제 운동 입력 카드의 `wtAddSet()` KG/REP를 빈 값으로 만들고, KG/REP 빈 입력 parser와 저장 재렌더 scrollTop 복원을 추가했다.
  7. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z4-workout-ios-sheet-input-scroll`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  8. 리뷰 문서: `docs/ai/reviews/2026-07-02-workout-ios-sheet-input-scroll-review.md`
  9. PASS: `node --check render-calendar.js`
  10. PASS: `node --check workout/exercises.js`
  11. PASS: `node --check sw.js`
  12. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-card-layout-css.test.js`
  13. PASS: `node scripts/verify-runtime-assets.mjs`
  14. PASS: `node --test --test-reporter=dot tests/*.test.js`
  15. PASS: `git diff --check`
  16. 완료: 커밋 `30e018d fix: stabilize workout set inputs on ios`를 `origin/main`에 push했다.
  17. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 30e018d75677c57f6d4632adfe1ef85d006b57ab` -> `[deploy-verify] ok 30e018d75677 tomatofarm-v20260702z4-workout-ios-sheet-input-scroll static=236`
  18. PASS: Dashboard3 Pages marker 검증 - `sw.js` cache version, `render-calendar.js` input restore markers, `workout/exercises.js` render-scroll/blank parser markers 확인
  19. not verified yet: 인증 iPhone PWA 실제 `운동 탭 -> 종목 추가 -> KG/REP 입력/수정 -> 세트 추가` UI flow 확인 필요.

- Home Running Map Bubble Reliability 계획:
  1. 요청: 홈 화면 라이프존 러닝 지도 말풍선이 타일/경로 없이 작은 점 하나만 보이는 문제를 코드로 개선한다.
  2. 진단: 실제 `_buildRunningMapBubbleData()`에는 `tiles/path/dot` 계산이 있으므로 `missing-map`뿐 아니라 `ready` 상태의 타일 로드 실패/1점 route도 원인으로 본다.
  3. 결정: Slice 1은 홈 말풍선에 진단 `data-*` 메타, tile load/error 상태, 명확한 fallback UI를 추가한다.
  4. 범위: `home/life-zone.js`, `style.css`, 관련 홈 러닝 지도 테스트, `sw.js` cache bump.
  5. 제외: GPS 수집/저장 schema/운동 상세 지도/provider 교체/홈 부분 업데이트 리팩터.
  6. 계획 문서: `docs/ai/features/2026-07-02-home-running-map-bubble-reliability.md`

- Home Running Map Bubble Reliability 실행:
  1. `home/life-zone.js`에서 `_buildRunningMapBubbleData()` 반환값에 provider/config/reason/tileCount/pointCount/hasPath 메타를 추가했다.
  2. `home/life-zone.js`에서 지도 말풍선 DOM에 `data-lz-running-map-*` 진단 속성을 추가했다.
  3. `home/life-zone.js`에서 VWorld tile 이미지 `load`/`error` 이벤트를 추적하고, 전체 실패 시 `is-tile-failed`와 `data-lz-running-map-tile-state="failed"`를 남긴다.
  4. `style.css`에 `waiting`/`missing-map`/`is-tile-failed` placeholder 배경과 tile-failed fallback 텍스트 표시를 추가했다.
  5. `tests/home-life-zone-npc-quest.test.js`와 cache marker 테스트를 갱신했다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z3-home-running-map-bubble`로 bump했다.
  7. PASS: `node --check home/life-zone.js; node --check sw.js`
  8. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js tests/running-entry.test.js` - 43 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs`
  10. PASS: `node --test --test-reporter=dot tests/*.test.js`
  11. PASS: `git diff --check`
  12. PASS: 구현 커밋 `ea65cb4 fix: harden home running map bubble fallback`를 `origin/main`에 push했다.
  13. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ ea65cb4` -> `[deploy-verify] ok ea65cb462d1f tomatofarm-v20260702z3-home-running-map-bubble static=236`
  14. PASS: Dashboard3 Pages marker 검증 - `sw.js` cache version, `home/life-zone.js` `lzRunningMapProvider`/`_bindRunningMapTileDiagnostics`/`is-tile-failed`, `style.css` `.lz-running-map-empty--tile-failed`/`.lz-running-map-bubble.is-tile-failed`
  15. not verified yet: 인증 계정 실제 홈탭 러닝 지도 말풍선 UI flow 확인은 아직 수행하지 않았다.

- Home Running Map Bubble Reliability 리뷰:
  1. 리뷰 문서: `docs/ai/reviews/2026-07-02-home-running-map-bubble-reliability-review.md`
  2. 결과: 문제 없음.
  3. 확인: 정상 `ready` 상태의 VWorld tile/path/current-dot 렌더 계약은 유지되고, fallback은 `waiting`/`missing-map`/전체 tile 실패 상태에만 표시된다.
  4. PASS: Dashboard3 Pages 배포/marker 검증 완료.
  5. 남은 확인: 인증 계정 실제 flow 확인은 아직 수행하지 않았다.

- Workout Cycle Rail Achieved Color 계획:
  1. 요청: 운동 탭 좌측 목표를 해당 주에 달성했을 때 더 채도 높은 파란색으로 칠한다.
  2. 결정: 기존 `workoutRecordsForBenchmarkWeek()` 기준으로 같은 벤치마크의 해당 주 best set이 목표 `kg/reps` 이상이면 달성으로 본다.
  3. 범위: `render-calendar.js` 달성 class, `style.css` 달성 색상, 회귀 테스트, `sw.js` cache bump.
  4. 제외: 성장보드 산식/데이터 모델, 하단 sheet 동작, 레일 레이아웃 변경.
  5. 계획 문서: `docs/ai/features/2026-07-02-workout-cycle-rail-achieved-color.md`

- Workout Cycle Rail Achieved Color 실행:
  1. `render-calendar.js`에 `_cycleRailGoalStatus()`를 추가해 주간 best set이 목표 `kg/reps` 이상이면 달성으로 판정한다.
  2. 달성한 좌측 목표 button에 `is-achieved` class와 title/aria 달성 문구를 추가했다.
  3. `style.css`에 `.cal-cycle-branch.is-achieved` 선명한 파란색 상태를 추가했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z2-workout-rail-achieved-blue`로 bump했다.
  5. 관련 cache-version marker 테스트와 `tests/workout-calendar-bottom-sheet.test.js`를 갱신했다.
  6. PASS: `node --check render-calendar.js`
  7. PASS: `node --check sw.js`
  8. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` - 19 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` - `[runtime-assets] ok refs=862`
  10. PASS: `node --test --test-reporter=dot tests/*.test.js`
  11. PASS: `git diff --check`
  12. PASS: 구현 커밋 `242cf4b fix: highlight achieved workout rail goals`를 `origin/main`에 push했다.
  13. PASS: Dashboard3 Pages 배포 검증 - `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 242cf4b` -> `[deploy-verify] ok 242cf4b8a0e8 tomatofarm-v20260702z2-workout-rail-achieved-blue static=236`
  14. PASS: Dashboard3 Pages marker 검증 - `sw.js` cache version, `render-calendar.js` `_cycleRailGoalStatus`/`workoutRecordsForBenchmarkWeek`/`is-achieved`, `style.css` `.cal-cycle-branch.is-achieved`/`background: #2f7df4`
  15. not verified yet: 인증 계정 실제 운동 탭 UI flow 확인 필요.

- Workout Cycle Rail Achieved Color 리뷰:
  1. 리뷰 문서: `docs/ai/reviews/2026-07-02-workout-cycle-rail-achieved-color-review.md`
  2. 결과: 문제 없음.
  3. 확인: 달성 상태는 `is-achieved` class/title/aria에만 추가되어 기존 레일 클릭/설정 진입/레이아웃을 바꾸지 않는다.
  4. 확인: `tests/`와 `sw.js`에 이전 cache version marker가 남아 있지 않다.

- Running Session Reload Recovery:
  1. 요청: 러닝 기록 중 앱이 백그라운드에서 리로드되면 저장 전 기록이 전부 사라지는 문제를 수정한다.
  2. 진단: live 러닝 상태는 `workout/running-session.js` 전역 `_session`에만 있고 저장 전 reload-safe draft가 없었다.
  3. 완료: user-scoped `tomatofarm_running_session_draft_<user>` localStorage draft 저장/복구를 추가했다.
  4. 완료: `pagehide`, `beforeunload`, `visibilitychange(hidden)`, route point, pause/resume/finish/goal save 시 draft를 갱신한다.
  5. 완료: `wtOpenRunningSession()`에서 유효한 draft를 progress/summary 화면으로 복원하고 저장 성공/명시 닫기 시 draft를 삭제한다.
  6. 완료: `normalizeRunningSessionDraft()` 테스트를 추가하고 `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260702z1-running-session-reload-recovery`로 bump했다.
  7. PASS: `node --check workout/running-session.js; node --check sw.js`
  8. PASS: `node --test tests/running-entry.test.js tests/running-tracker.test.js tests/workout-sessions.test.js`
  9. PASS: `node --test --test-reporter=dot tests/*.test.js`
  10. PASS: `node scripts/verify-runtime-assets.mjs`
  11. PASS: `git diff --check`
  12. 리뷰 문서: `docs/ai/reviews/2026-07-02-running-session-reload-recovery-review.md`
  13. 완료: 커밋 `384920f fix: preserve running session draft across reload`를 `origin/main`에 push했다.
  14. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 384920f` → `[deploy-verify] ok 384920f340c3 tomatofarm-v20260702z1-running-session-reload-recovery static=236`
  15. not verified yet: 배포 URL 브라우저 확인 결과 로그인 화면이 먼저 표시되고, 인증 없이 운동 탭 클릭 후 러닝 칩까지 도달하지 못했다.

- Home Consulting Room Visitor Sofa 실행:
  1. 요청: 현재 소파 앞에 서 있는 상담실장을 1인용 소파에 앉아 있는 구도로 바꾼다.
  2. 요청: 맞은편에는 현재 소파를 상담실장을 마주보는 형태로 배치한다.
  3. 요청: 10일 이상 미접속 유저 또는 신규유저가 방문하면 그 소파에 앉아 있는 회색 상의 방문자 스프라이트를 표시한다.
  4. 결정: 방문자는 전체 계정 중 임의 선정하지 않고 현재 로그인한 사용자의 `previousLastLoginAt`/`createdAt` 기준으로 판정한다.
  5. 결정: 베이스룸 원본은 직접 수정하지 않고 우측 하단 상담 코너 transparent overlay와 seated sprites로 덮는다.
  6. 범위: `app.js`, `home/life-zone.js`, `home/life-zone-state.js`, `style.css`, `sw.js`, 새 PNG 3개, 관련 테스트와 cache-version 테스트.
  7. 제외: 상담실장 모달 내용 변경, 베이스룸 원본 교체, 기존 actor 상태 우선순위 변경, Firestore schema 변경, `www/` 직접 수정.
  8. 완료: 새 RGBA PNG 3개를 생성했다: `consulting-room-sofas.png`, `consulting-chief-npc-seated-home.png`, `consulting-visitor-gray-shirt-home.png`.
  9. 완료: `app.js`에서 저장된 이전 `lastLoginAt` snapshot과 현재 사용자 정보를 라이프존 방문자 context로 전달했다.
  10. 완료: `home/life-zone-state.js`에 `resolveLifeZoneConsultingVisitor()`를 추가해 신규/10일 복귀/일반/guest 판정을 분리했다.
  11. 완료: `home/life-zone.js`와 `style.css`에 상담 소파 overlay, 앉은 상담실장, 조건부 방문자 layer를 추가했다.
  12. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260701z3-consulting-room-visitor`로 bump하고 새 PNG 3개를 `STATIC_ASSETS`에 등록했다.
  13. PASS: `node --check app.js; node --check home/life-zone.js; node --check home/life-zone-state.js; node --check sw.js`
  14. PASS: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js tests/consulting-chief-quest-modal.test.js`
  15. PASS: `node --test tests/*.test.js` - 624 tests passed
  16. PASS: `node scripts/verify-runtime-assets.mjs`
  17. PASS: `git diff --check`
  18. PASS: 로컬 합성 미리보기 `C:\Users\USER\AppData\Local\Temp\tomato-consulting-room-preview-v2.png`에서 상담 코너 겹침을 확인했다.
  19. 리뷰 문서: `docs/ai/reviews/2026-07-02-home-consulting-room-visitor-sofa-review.md`
  20. 리뷰 결과: 문제 없음.
  21. 완료: 커밋 `fa2ea34 fix: add consulting room visitor sofa`를 `origin/main`에 push했다.
  22. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ fa2ea34` → `[deploy-verify] ok fa2ea340195d tomatofarm-v20260701z3-consulting-room-visitor static=236`
  23. PASS: Dashboard3 Pages marker 검증 — `sw.js::tomatofarm-v20260701z3-consulting-room-visitor`, `home/life-zone.js::consulting-visitor-gray-shirt-home.png`, `home/life-zone.js::setLifeZoneVisitContext`, `style.css::.lz-consulting-visitor`
  24. not verified yet: 인증 세션이 없어 실제 홈 탭에서 신규/10일 복귀 사용자 조건의 라이프존 UI flow는 직접 확인하지 못했다.

- Home Hero Life Zone Balance 계획:
  1. 요청: 홈 상단 히어로 카드는 지금보다 높이를 약 50% 줄인다.
  2. 요청: 라이프존 카드는 더 크게 보이게 한다.
  3. 확인: 히어로 카드는 `home/tomato.js` `renderTomatoCard()`의 `.tf-card > .tf-hero.tf-hero--gradient`다.
  4. 결정: 히어로 sub 줄을 제거하고, 토마토 규칙 버튼은 `.tf-hero-info-btn`으로 우측 상단에 유지한다.
  5. 결정: 토마토 SVG는 `72`에서 `44`로 줄이고, `.tf-hero` padding/count/unit 크기를 compact 값으로 낮춘다.
  6. 결정: 라이프존은 기존 좌표계를 유지하기 위해 `.lz-scene`을 `1672 / 1872`로 키우고 `.lz-world`를 `112%`로 확대한다.
  7. 제외: 라이프존 스프라이트/배경 자산 재생성, 홈 카드 순서 변경, 칼로리/체중 summary strip 제거, 운동 deck 미완료 작업.
  8. 계획 문서: `docs/ai/features/2026-07-01-home-hero-life-zone-balance.md`
  9. 완료: `home/tomato.js`에서 히어로 sub 줄을 제거하고 info button을 우측 상단으로 이동했다.
  10. 완료: `style.css`에서 히어로 compact 스타일과 라이프존 확대 스타일을 반영했다.
  11. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260701z2-home-hero-life-zone-balance`로 bump했다.
  12. PASS: `node --check home/tomato.js; node --check sw.js`
  13. PASS: `node --test tests/home-hero-layout.test.js tests/home-life-zone-npc-quest.test.js` - 11 tests passed
  14. PASS: `node scripts/verify-runtime-assets.mjs`
  15. PASS: `git diff --check`
  16. PASS: `node --test --test-reporter=dot tests/*.test.js`
  17. 리뷰 문서: `docs/ai/reviews/2026-07-01-home-hero-life-zone-balance-review.md`
  18. 완료: 커밋 `da7b5c0 fix: rebalance home hero and life zone`를 `origin/main`에 push했다.
  19. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ da7b5c0` → `[deploy-verify] ok da7b5c0fe3c9 tomatofarm-v20260701z2-home-hero-life-zone-balance static=233`
  20. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `home/tomato.js` compact hero markers, `style.css` life-zone expand markers 확인
  21. not verified yet: 배포 URL 브라우저 확인 결과 로그인 화면이 먼저 표시되어 실제 인증 홈 탭 UI flow 확인은 아직 남아 있다.

- Home Life Zone Foot Nameplates 계획:
  1. 요청: 첨부 이미지에서 X 표시된 라이프존 카드 하단 캐릭터 상태칩을 삭제한다.
  2. 요청: 줍스/문정토마토/이재헌 닉네임은 씬 안에서 각 캐릭터 발밑에 배치하되 캐릭터를 가리지 않는다.
  3. 진단: X 표시 영역은 `home/life-zone.js`의 `lz-status-row`와 `_renderStatus()`가 만드는 `.lz-status-chip`이다.
  4. 진단: actor 이름표는 이미 DOM 텍스트지만 `_applyActorNameplatePosition()`이 위쪽 기준 좌표를 써서 발밑 배치와 어긋난다.
  5. 결정: 하단 status row를 제거하고, actor 이름표를 각 `.lz-actor` 내부 child로 이동해 CSS `top: 100%` 기준 발밑 배치로 바꾼다.
  6. 제외: 스프라이트/아트 자산 재생성, NPC 전구/모달 동작 변경, 라이프존 상태 판정 변경, 칼로리/체중 summary strip 제거.
  7. 계획 문서: `docs/ai/features/2026-07-01-home-life-zone-foot-nameplates.md`
  8. 완료: `home/life-zone.js`에서 `lz-status-row`와 `.lz-status-chip` 렌더링을 제거했다.
  9. 완료: `.lz-nameplate--actor`를 `.lz-actor` 내부에서 `top: 100%`로 발밑 배치했다.
  10. 완료: `style.css`의 상태칩 스타일을 삭제하고 `sw.js`를 `tomatofarm-v20260701z1-life-zone-foot-nameplates`로 bump했다.
  11. PASS: `node --check home/life-zone.js; node --check sw.js`
  12. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js` - 29 tests passed
  13. PASS: `node scripts/verify-runtime-assets.mjs`
  14. PASS: `git diff --check`
  15. PASS: `node --test --test-reporter=dot tests/*.test.js`
  16. 리뷰 문서: `docs/ai/reviews/2026-07-01-home-life-zone-foot-nameplates-review.md`
  17. 완료: 커밋 `b37bce6 fix: place life zone names under actors`를 `origin/main`에 push했다.
  18. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ b37bce6` → `[deploy-verify] ok b37bce6b88a5 tomatofarm-v20260701z1-life-zone-foot-nameplates static=233`
  19. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `home/life-zone.js` actor child nameplate marker, `style.css` foot-nameplate marker 확인
  20. not verified yet: 인증 세션이 없어 실제 홈 탭 라이프존 UI flow 확인은 아직 남아 있다.

- Workout Entry Bookmark Deck 계획:
  1. 요청: 운동 기록 카드가 아래로 계속 쌓이지 않고, 상단 번호 책갈피로 종목 간 이동하게 한다.
  2. 확인: 현재 `_renderExerciseList()`가 `S.workout.exercises.forEach`로 모든 종목 카드를 세로 렌더한다.
  3. 확인: 완료 후 접힘은 `entry.uiCollapsed`와 `세트 다시 보기` 버튼으로 동작한다.
  4. 결정: 오늘 운동 입력 리스트 `#wt-exercise-list`에만 단일 active 카드 deck을 적용한다.
  5. 결정: active index는 저장 schema가 아닌 모듈 UI 상태로 둔다.
  6. 결정: 마지막 미완료 세트의 primary button은 `운동 완료`로 표시하고, 누르면 해당 세트 완료 후 다음 카드로 이동한다.
  7. 제외: 캘린더 read card, 성장보드 내장 card, 데이터 schema 변경.
  8. 계획 문서: `docs/ai/features/2026-06-30-workout-entry-bookmark-deck.md`

- Running NRC Core Gap 계획:
  1. 요청: 기존 `런닝/조깅`을 Nike Run Club 핵심 기능 기준으로 조사하고 미구현 기능을 구현한다.
  2. 조사: NRC 핵심은 GPS/pace/distance 추적, Audio-Guided Runs, 목표/훈련 계획, 챌린지/성취, 친구 응원, shoe tagging이다.
  3. 확인: 현재 앱은 GPS route, pace/time/BPM, 지도, summary, save/share는 갖췄다.
  4. 갭: `목표 설정` 버튼은 toast placeholder이고, 음성 안내/목표 진행 cue가 없다.
  5. 결정: Slice 1은 러닝 세션 내부 `목표 설정`과 Web Speech 기반 한국어 음성 안내만 구현한다.
  6. 제외: Training Plans, Challenges, friend cheers, shoe tagging, 음악 연동, Firebase schema 추가.
  7. 계획 문서: `docs/ai/features/2026-06-30-running-nrc-core-gap.md`
  8. 완료: start 화면에 목표/음성 안내 상태 버튼을 추가했다.
  9. 완료: `목표 설정` sheet에서 자유/거리/시간 목표와 음성 안내 on/off를 저장한다.
  10. 완료: 진행 화면에 목표 진행률과 남은 목표를 표시한다.
  11. 완료: Web Speech API 기반 한국어 cue를 시작, pause/resume, 1km split, 목표 halfway, 목표 완료, 종료 summary에 연결했다.
  12. 완료: `sw.js` cache version을 `tomatofarm-v20260630z18-running-voice-goals`로 bump했다.
  13. PASS: `node --check workout/running-session.js; node --check sw.js`
  14. PASS: `node --test tests/running-entry.test.js tests/running-tracker.test.js tests/pwa-update-auto-reload.test.js`
  15. PASS: 전체 테스트 — `node --test --test-reporter=dot $files`
  16. PASS: `node scripts/verify-runtime-assets.mjs`
  17. PASS: `git diff --check`
  18. 리뷰 문서: `docs/ai/reviews/2026-06-30-running-nrc-core-gap-review.md`
  19. 완료: 커밋 `82bd3d3 feat: add running voice guidance and goals`를 `origin/main`에 push했다.
  20. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 82bd3d3` → `[deploy-verify] ok 82bd3d3f4de5 tomatofarm-v20260630z18-running-voice-goals static=233`
  21. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `workout/running-session.js` `audio-toggle`/`goal-save`/`SpeechSynthesisUtterance`, `style.css` `wt-run-goal-sheet`/`wt-run-goal-progress` 확인
  22. not verified yet: 인증 세션이 없어 실제 `운동 탭 -> 런닝/조깅 -> 목표 설정 -> 시작 -> 음성 cue` UI flow는 직접 조작하지 못했다.

- Workout Picker Manual Cardio 계획:
  1. 요청: picker 분류 화면에 `유산소` 버튼을 추가한다.
  2. 결정: 기존 `런닝/조깅` GPS 진입은 유지하고, `유산소`는 속도 `km/h`와 시간 `분`을 수기 입력하는 별도 sheet로 연다.
  3. 결정: 새 top-level schema 대신 기존 `S.workout.runData`/러닝 저장 필드를 재사용한다.
  4. 범위: `workout/exercises.js`, `render-calendar.js`, `style.css`, 관련 테스트, `sw.js` cache version bump.
  5. 계획 문서: `docs/ai/features/2026-06-30-manual-cardio-picker.md`
  6. 완료: `workout/exercises.js`에 `유산소` tile, 수기 입력 sheet, `manual-cardio` 저장 payload를 추가했다.
  7. 완료: 저장 직전 헬스 회차 상태를 격리하고 저장 후 복원해 러닝 회차에 헬스 종목이 섞이지 않게 했다.
  8. 완료: `render-calendar.js` 상세 카드에 `manual-cardio` label/source와 `속도` metric을 추가했다.
  9. 완료: `style.css` 유산소 sheet 스타일과 `sw.js` `tomatofarm-v20260630z17-manual-cardio-picker` cache version을 반영했다.
  10. PASS: `node --check workout/exercises.js; node --check render-calendar.js; node --check sw.js`
  11. PASS: `node --test tests/running-entry.test.js tests/workout-calendar-bottom-sheet.test.js tests/pwa-update-auto-reload.test.js`
  12. PASS: 전체 테스트 파일 묶음 — `node --test --test-reporter=dot @files`
  13. PASS: `node scripts/verify-runtime-assets.mjs`
  14. PASS: `git diff --check`
  15. 리뷰 문서: `docs/ai/reviews/2026-06-30-manual-cardio-picker-review.md`
  16. 완료: 커밋 `0574140 feat: add manual cardio picker entry`를 `origin/main`에 push했다.
  17. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 0574140` → `[deploy-verify] ok 0574140da32f tomatofarm-v20260630z17-manual-cardio-picker static=233`
  18. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `workout/exercises.js` manual-cardio, `render-calendar.js` speedKmh, `style.css` cardio sheet marker 확인
  19. not verified yet: 인증 세션이 없어 실제 `운동 탭 -> + -> 유산소 -> 저장 -> 러닝 상세 카드` UI flow는 직접 조작하지 못했다.

- Workout Calendar Owned Scroll Root 계획:
  1. 요청: 운영 PWA에서 캘린더 드래그가 여전히 되지 않고 바텀시트 영역에서만 움직인다.
  2. 확인: PWA 설치/서비스워커 코드는 캘린더 터치를 직접 막지 않는다.
  3. 확인: navigation swipe는 세로 이동에서 tracking을 중단하고 `preventDefault()`를 호출하지 않는다.
  4. 확인: workout pull-back은 `data-wt-calendar-scroll-surface` 아래 터치를 예외 처리하므로 최신 marker가 반영된 상태에서는 캘린더 표면 touchmove를 직접 막지 않는다.
  5. 원인: 운동 캘린더 본문은 `overflow-y:auto`를 가진 독립 scroller가 아니고 body scroll에 의존한다. PWA WebView에서 fixed bottom sheet/tab bar/overscroll gesture와 섞여 body pan ownership이 실패한다.
  6. Slice 1 범위는 `#workout-calendar-root`를 owned scroll root로 승격하고 `render-calendar.js` scroll 저장/복원을 root scroller 기준으로 바꾸는 것이다.
  7. `render-calendar.js`, `style.css`가 `STATIC_ASSETS`에 포함되므로 `sw.js` cache version을 함께 bump한다.
  8. 완료: `style.css`에서 `#tab-workout.wt-calendar-home-mode`를 viewport 화면으로 고정하고 `overflow:hidden`을 적용했다.
  9. 완료: `#workout-calendar-root`를 `overflow-y:auto`, `overscroll-behavior-y:contain`, `-webkit-overflow-scrolling:touch`, `touch-action:pan-y`를 가진 owned scroll root로 만들었다.
  10. 완료: `render-calendar.js`에서 `_workoutHomeScrollRoot()`를 추가하고 scroll 저장/복원을 root scroller 우선으로 변경했다.
  11. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260630z16-workout-owned-scroll-root`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  12. PASS: `node --check render-calendar.js`
  13. PASS: `node --check sw.js`
  14. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js` — 24 tests passed
  15. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=858`
  16. PASS: `git diff --check`
  17. PASS: `node --test --test-reporter=dot tests/*.test.js`
  18. 리뷰 문서: `docs/ai/reviews/2026-06-30-workout-calendar-owned-scroll-root-review.md`
  19. 완료: 커밋 `7445eef fix: give workout calendar an owned scroll root`를 `origin/main`과 `tomatofarm/main`에 push했다.
  20. PASS: Tomato Farm 운영계 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 7445eef` → `[deploy-verify] ok 7445eef535e6 tomatofarm-v20260630z16-workout-owned-scroll-root static=233`
  21. PASS: Tomato Farm 운영계 marker 검증 — `sw.js` cache version, owned scroll root CSS, root scroll 저장/복원 marker 확인
  22. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 7445eef` → `[deploy-verify] ok 7445eef535e6 tomatofarm-v20260630z16-workout-owned-scroll-root static=233`
  23. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, owned scroll root CSS, root scroll 저장/복원 marker 확인
  24. not verified yet: 인증 세션이 없어 실제 모바일 PWA 손 조작 flow는 사용자가 확인해야 한다.

- PWA Calendar Backdrop Touch Fix 계획:
  1. 요청: 운영 PWA에서 캘린더 드래그가 여전히 되지 않고 바텀시트 영역에서만 움직인다.
  2. 진단: 운영 URL에는 최신 drag fix와 SW auto update marker가 반영되어 있어, stale SW 단독 원인 가능성은 낮아졌다.
  3. 진단: PWA 전용 JS가 캘린더 터치를 직접 막는 흐름은 보이지 않고, bar 상태의 투명 fixed backdrop이 `touch-action: none`으로 남는 점이 PWA/WebView 차이를 만들 가능성이 높다.
  4. Slice 1 범위는 bottom sheet backdrop을 full 상태에서만 활성화하고, bar 상태에서는 `hidden`/`display:none`으로 터치 협상에서 제외하는 것이다.
  5. `render-calendar.js`, `style.css`가 `STATIC_ASSETS`에 포함되므로 `sw.js` cache version을 함께 bump한다.
  6. 완료: `render-calendar.js`에서 backdrop 렌더에 `backdropHiddenAttr`, `backdropAriaHidden`을 추가해 bar 상태를 `hidden`으로 렌더한다.
  7. 완료: `_applyWorkoutHomeSheetState()`가 sheet state 변경 시 backdrop `hidden`과 `aria-hidden`을 함께 동기화한다.
  8. 완료: `style.css`에서 backdrop 기본 상태를 `display:none`, `touch-action:auto`, full 상태를 `display:block`, `touch-action:none`으로 분리했다.
  9. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260630z15-pwa-backdrop-touch`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  10. PASS: `node --check render-calendar.js; node --check sw.js`
  11. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/pwa-update-auto-reload.test.js` — 21 tests passed
  12. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=858`
  13. PASS: `git diff --check`
  14. PASS: `node --test --test-reporter=dot tests/*.test.js`
  15. 리뷰 문서: `docs/ai/reviews/2026-06-30-pwa-calendar-backdrop-touch-fix-review.md`
  16. 완료: 커밋 `6415021 fix: disable calendar backdrop touch capture`를 `origin/main`과 `tomatofarm/main`에 push했다.
  17. PASS: Tomato Farm 운영계 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 6415021` → `[deploy-verify] ok 64150211994b tomatofarm-v20260630z15-pwa-backdrop-touch static=233`
  18. PASS: Tomato Farm 운영계 marker 검증 — `sw.js` cache version, `render-calendar.js` `backdropHiddenAttr`/`toggleAttribute('hidden', !expanded)`, `style.css` `.cal-workout-day-backdrop.is-full`/`touch-action: auto`
  19. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 6415021` → `[deploy-verify] ok 64150211994b tomatofarm-v20260630z15-pwa-backdrop-touch static=233`
  20. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `render-calendar.js` backdrop hidden marker, `style.css` backdrop marker
  21. not verified yet: 인증 세션이 없어 실제 모바일 PWA에서 `운동 탭 -> 캘린더 본문 세로 드래그` 손 조작은 사용자가 확인해야 한다.

- Production Stale SW Auto Update 완료:
  1. 요청: 개발계에서는 캘린더 드래그가 되는데 운영계에서는 동일 증상이 반복된다.
  2. 진단: 운영 direct asset marker에는 drag fix가 있으므로, 사용자 기기의 stale Service Worker/controller/cache가 구 asset을 유지하는 케이스를 우선 원인으로 봤다.
  3. 완료: `pwa-register.js`에 `APP_SW_AUTO_RELOAD_TIMEOUT_MS`, `_hasActiveWorkoutDraftForAppSWUpdate()`, `_autoApplyAppSWUpdate()`를 추가했다.
  4. 완료: 새 앱 SW가 설치/대기 상태가 되면 `tomato-app-ready` 이후 active workout draft가 없을 때 `SKIP_WAITING` + `controllerchange` 1회 reload를 실행한다.
  5. 완료: active workout draft가 있으면 자동 reload하지 않고 기존 업데이트 안내 버튼을 유지한다.
  6. 완료: `index.html`의 `pwa-register.js` query를 `20260630z14-sw-auto-update`로 갱신했다.
  7. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260630z14-sw-auto-update`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  8. PASS: `node --check pwa-register.js; node --check sw.js`
  9. PASS: `node --test tests/pwa-update-auto-reload.test.js tests/workout-active-session-recovery.test.js` — 8 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=858`
  11. PASS: `git diff --check`
  12. PASS: `node --test --test-reporter=dot tests/*.test.js`
  13. 완료: 커밋 `4c5ab9f fix: auto apply app service worker updates`를 `origin/main`에 push했다.
  14. not verified yet: Dashboard3 Pages workflow는 `deploy-pages` 단계 실패로 Dashboard3 URL이 이전 커밋 `acf69a2`를 반환한다.
  15. 완료: 운영계 `tomatofarm/main`에 커밋 `4c5ab9f`를 push했다.
  16. PASS: Tomato Farm 운영계 workflow success — run `28438825034`
  17. PASS: Tomato Farm 운영계 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 4c5ab9f` → `[deploy-verify] ok 4c5ab9f099af tomatofarm-v20260630z14-sw-auto-update static=233`
  18. PASS: 운영 marker 검증 — `sw.js` cache version, `index.html` `pwa-register.js?v=20260630z14-sw-auto-update`, `pwa-register.js` auto update markers, 기존 drag fix markers
  19. not verified yet: 실제 운영 기기 stale SW 자동 갱신 후 캘린더 드래그 UI flow 확인이 남아 있다.

- Workout Calendar Drag Surface Fix 완료:
  1. 요청: 운동 탭 캘린더가 바텀시트 영역에서 손가락을 움직일 때만 드래그되는 상황을 수정한다.
  2. 진단: 기존 `data-wt-calendar-scroll-surface`가 월간 grid에만 있어 헤더/요약/요일/좌측 레일/여백에서 시작한 touch가 전역 workout pull-back 제스처에 잡힐 수 있었다.
  3. 완료: `render-calendar.js`에서 운동 홈 surface wrapper에 `data-wt-calendar-scroll-surface`를 조건부로 추가했다.
  4. 완료: `style.css`에서 `.cal-workout-surface-home`에 `touch-action: pan-y`를 추가했다.
  5. 완료: 기존 bottom sheet pointer drag 제거 계약은 유지했고, grid-level 표식도 보존했다.
  6. 완료: `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260630z13-workout-calendar-drag-surface`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  7. PASS: `node --check render-calendar.js; node --check sw.js`
  8. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-calendar-bottom-sheet.test.js` — 24 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=858`
  10. PASS: `git diff --check`
  11. PASS: `node --test --test-reporter=dot tests/*.test.js`
  12. 완료: 코드/문서 커밋 `041f878 fix: widen workout calendar drag surface`를 `origin/main`에 push했다.
  13. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 041f878` → `[deploy-verify] ok 041f878367c6 tomatofarm-v20260630z13-workout-calendar-drag-surface static=233`
  14. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `render-calendar.js` `scrollSurfaceAttr`/`data-wt-calendar-scroll-surface`, `style.css` `.cal-workout-surface-home`/`touch-action: pan-y`
  15. 완료: 운영계 `tomatofarm/main`에 커밋 `3120d0f`를 fast-forward push했다.
  16. PASS: Tomato Farm 운영계 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ 3120d0f` → `[deploy-verify] ok 3120d0f20fae tomatofarm-v20260630z13-workout-calendar-drag-surface static=233`
  17. PASS: 운영계 marker 검증 — `sw.js` cache version, `render-calendar.js` `scrollSurfaceAttr`/`data-wt-calendar-scroll-surface`, `style.css` `.cal-workout-surface-home`/`touch-action: pan-y`
  18. not verified yet: 인증 세션이 없어 실제 `운동 탭 -> 캘린더 본문/요일/요약/좌측 레일에서 세로 드래그` UI flow는 직접 조작하지 못했다.

- Stale UI Code Prune 완료:
  1. 요청: 화면에 구현되어 실질적인 UI/동작 변화를 일으키는 코드만 남기고, 화면에 구현되지 않는 stale 관련 코드를 제거한다.
  2. 결정: 모든 `stale`/`legacy` 문자열 삭제가 아니라, 현재 DOM/route/event에서 미구현인 stale 잔재만 제거한다.
  3. 보존: 체중 미입력 stale UI, AI stale token, 저장 stale guard, legacy 데이터 migration/fallback은 실제 동작/데이터 보존이므로 유지한다.
  4. 완료: `wtOpenWorkoutRecord`, `setPeriod`, `.wt-record-back-btn` 예외, 운동 탭 날짜 row stale selector, 홈 농장 DOM/CSS/API/모듈을 제거했다.
  5. 완료: `WorkoutRecordScreen`/`WorkoutDetailScreen`, `pushWorkoutRecord()`, `pushWorkoutDetail()`, standalone `wt-exercise-detail-root`, `renderWorkoutExerciseDetail`, 관련 export/window 등록을 제거했다.
  6. 완료: `renderMaxGrowthPreview()`의 화면 미렌더 `recommendationHtml` 파라미터를 제거했다.
  7. 유지: `_renderWorkoutExerciseDetailCard()`는 현재 하단 시트 운동 카드 렌더러라 삭제하지 않았다.
  8. PASS: `node --check app.js; node --check data.js; node --check data/data-load.js; node --check render-stats.js; node --check render-workout.js; node --check sw.js; node --check workout/load.js; node --check workout/navigation-stack.js; node --check workout/exercises.js; node --check workout/index.js; node --check workout/expert/max-same-day-advice.js`
  9. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-card-layout-css.test.js tests/workout-calendar-bottom-sheet.test.js tests/stats-overall-compact-summary.test.js tests/data.load-save.test.js tests/exercise-program-editor.test.js`
  10. PASS: `node --test tests/calc.max.test.js`
  11. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=858`
  12. PASS: `node --test --test-reporter=dot @tests`
  13. PASS: `git diff --check`
  14. 리뷰 문서: `docs/ai/reviews/2026-06-30-stale-ui-code-prune-review.md`
  15. 완료: 코드/문서 커밋 `c98ec70 fix: prune stale ui code`를 `origin/main`에 push했다.
  16. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ c98ec70` → `[deploy-verify] ok c98ec70a4a1a tomatofarm-v20260630z12-stale-ui-prune static=233`
  17. 완료: 배포 기록 커밋 `c5fd880 docs: record stale ui prune deploy`를 `origin/main`에 push했다.
  18. PASS: Dashboard3 Pages 최종 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ c5fd880` → `[deploy-verify] ok c5fd880d243b tomatofarm-v20260630z12-stale-ui-prune static=233`
  19. 완료: 운영계 `tomatofarm/main`에도 `c5fd880`을 fast-forward push했다.
  20. PASS: Tomato Farm 운영계 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ c5fd880` → `[deploy-verify] ok c5fd880d243b tomatofarm-v20260630z12-stale-ui-prune static=233`
  21. PASS: 운영계 marker 검증 — `sw.js` cache version, `app.js::sheet:tab-open`, `workout/navigation-stack.js::CALENDAR: 'CalendarScreen'`, `index.html::wt-running-session-root`
  22. not verified yet: 인증 세션이 필요한 실제 UI 클릭 흐름은 배포 URL에서 직접 조작하지 않았다.

- Workout Record Route Remove 계획:
  1. 원인: `app.js`가 `pushWorkoutRecord()`와 `_setWorkoutSurface('record')`로 legacy record 화면을 아직 표시할 수 있다.
  2. 원인: `render-calendar.js`의 `_openWorkoutEditorForSession()` / `_loadWorkoutEditorForSession()`가 record route opener로 남아 있다.
  3. 원인: `index.html` 운동 탭의 legacy 날짜 row가 정적 DOM으로 남아 있다.
  4. Slice 1 범위는 record route push/render 제거, `wtOpenWorkoutRecord`의 day sheet redirect, calendar fallback 정리, legacy 날짜 row 제거, 테스트/cache bump다.
  5. 계획 문서: `docs/ai/features/2026-06-30-workout-record-route-remove.md`
  6. 완료: `app.js`에서 `pushWorkoutRecord` 기반 record route 렌더를 제거했다.
  7. 완료: `wtOpenWorkoutRecord` 호환 호출은 하단 시트 open으로 리다이렉트한다.
  8. 완료: `render-calendar.js`의 `_openWorkoutEditorForSession()` / `_loadWorkoutEditorForSession()`를 제거했다.
  9. 완료: 운동 탭의 legacy 날짜 row와 record back button DOM/CSS를 제거했다.
  10. 완료: `sw.js` cache version을 `tomatofarm-v20260630z11-record-route-removed`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  11. PASS: `node --check app.js`
  12. PASS: `node --check render-calendar.js`
  13. PASS: `node --check sw.js`
  14. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-timer-summary-only.test.js tests/workout-card-layout-css.test.js`
  15. PASS: `node scripts/verify-runtime-assets.mjs`
  16. PASS: `node --test --test-reporter=dot tests/*.test.js`
  17. PASS: `git diff --check`
  18. 리뷰 문서: `docs/ai/reviews/2026-06-30-workout-record-route-remove-review.md`
  19. 완료: 코드/문서 커밋 `88b2e7e fix: remove workout record route UI`를 `origin/main`에 push했다.
  20. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 88b2e7e` → `[deploy-verify] ok 88b2e7eb9c5a tomatofarm-v20260630z11-record-route-removed static=234`
  21. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `app.js`의 `_redirectWorkoutRecordRouteToDaySheet`/`record:tab-redirect-sheet`, `render-calendar.js`의 sheet state loader marker 확인.
  22. not verified yet: 인증 세션이 없어 실제 모바일 UI에서 `운동 탭 -> 오늘 하단 시트 -> 편집하기` 흐름은 직접 클릭 확인하지 못했다.

- Workout Day Sheet Inline Edit Regression 계획:
  1. 원인: `render-calendar.js`의 하단 시트 헬스 카드 `편집하기`가 `_wtCalEditSession()`을 호출한다.
  2. 원인: `_editWorkoutHomeSession()`이 `_openWorkoutEditorForSession()`으로 기존 기록 편집 화면을 직접 연다.
  3. 결과: 사용자가 1화면 하단 시트에서 편집하려 할 때 2화면으로 빠져 타이머와 오늘 운동 기록 흐름이 분기된 것처럼 보인다.
  4. Slice 1 범위는 헬스 카드 inline edit mode, KG/REP/RIR/ROM 저장, 완료 토글, 세트 추가/삭제, 회귀 테스트, `sw.js` cache bump다.
  5. 계획 문서: `docs/ai/features/2026-06-30-workout-day-sheet-inline-edit-regression.md`
  6. 완료: `render-calendar.js`에서 하단 시트 헬스 카드 `편집하기`를 `_wtCalEditExerciseCard()` inline edit mode로 전환했다.
  7. 완료: stale `_wtCalEditSession()` 경로에서도 `_openWorkoutEditorForSession()`을 호출하지 않게 했다.
  8. 완료: inline edit mode에서 KG/REP/RIR/ROM 입력, 완료 토글, 세트 추가/삭제를 저장한다.
  9. 완료: `style.css`에 하단 시트 세트 입력/토글 스타일을 추가했다.
  10. 완료: `sw.js` cache version을 `tomatofarm-v20260630z10-day-sheet-inline-edit`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  11. PASS: `node --check render-calendar.js`
  12. PASS: `node --check sw.js`
  13. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js tests/workout-save-mode-guard.test.js`
  14. PASS: `node scripts/verify-runtime-assets.mjs`
  15. PASS: `node --test --test-reporter=dot tests/*.test.js`
  16. PASS: `git diff --check`
  17. 리뷰 문서: `docs/ai/reviews/2026-06-30-workout-day-sheet-inline-edit-regression-review.md`
  18. 완료: 코드/문서 커밋 `84de7cc fix: keep sheet card editing inline`을 `origin/main`에 push했다.
  19. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 84de7cc` → `[deploy-verify] ok 84de7cc152e2 tomatofarm-v20260630z10-day-sheet-inline-edit static=234`
  20. PASS: Dashboard3 Pages marker 검증 — `sw.js` cache version, `render-calendar.js`의 `_wtCalEditExerciseCard`/`sheet:edit-inline`, `style.css`의 inline edit input marker 확인.
  21. not verified yet: 인증 세션이 없어 실제 모바일 UI에서 `운동 탭 -> 오늘 하단 시트 full -> 종목 카드 편집하기 -> 세트 수정/추가/삭제` 클릭 흐름은 직접 확인하지 못했다.

- Workout Day Sheet Inline Add Timer 계획:
  1. 원인: `render-calendar.js`의 `+` 액션이 첫 빈 회차를 우선 target으로 잡고 `_loadWorkoutEditorForSession()`을 통해 `wtOpenWorkoutRecord()` route push를 수행한다.
  2. 원인: `workout/exercises.js` picker 선택 핸들러가 항상 기록 편집 화면 카드 포커스(`wtFocusWorkoutEntryCard`)로 후처리한다.
  3. 원인: 타이머 DOM은 `.workout-tab-content` 내부에 있고 캘린더 surface에서 해당 컨테이너가 숨김 처리되어 1화면에서 보이지 않는다.
  4. Slice 1 범위는 현재 회차 고정, route push 없는 날짜/회차 로드, picker afterSelect 후처리, 캘린더 surface timer bar 노출, 회귀 테스트, `sw.js` cache bump다.
  5. 계획 문서: `docs/ai/features/2026-06-30-workout-day-sheet-inline-add-timer.md`
  6. 완료: `render-calendar.js`에서 하단 시트 `+` target을 현재 gym 회차로 고정했다.
  7. 완료: `render-calendar.js`에 route push 없는 `_loadWorkoutStateForSheetSession()`과 시트 복귀 `_refreshWorkoutHomeAfterPickerSelect()`를 추가했다.
  8. 완료: `workout/exercises.js` picker가 `afterSelect` 콜백을 받을 수 있게 하고, 기본 기록 화면 포커스 동작은 유지했다.
  9. 완료: `style.css`에서 캘린더 surface의 `.workout-tab-content`는 타이머 바만 노출 가능하게 하고, 타이머를 회차 bar 위로 올렸다.
  10. 완료: `sw.js` cache version을 `tomatofarm-v20260630z08-day-sheet-inline-add-timer`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  11. PASS: `node --check render-calendar.js`
  12. PASS: `node --check workout/exercises.js`
  13. PASS: `node --check sw.js`
  14. PASS: `node --test tests/ex-picker-selection-flow.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js tests/workout-timer-summary-only.test.js` — 31 tests passed
  15. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  16. PASS: `node --test --test-reporter=dot tests/*.test.js`
  17. PASS: `git diff --check`
  18. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-day-sheet-inline-add-timer-review.md`를 작성했고 추가 수정 이슈는 없다.
  19. 완료: 코드/문서 커밋 `6fde447 fix: keep day sheet add inline`을 `origin/main`에 push했다.
  20. PASS: Dashboard3 Pages 배포 검증 — `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 6fde447` → `[deploy-verify] ok 6fde447039f3 tomatofarm-v20260630z08-day-sheet-inline-add-timer static=234`
  21. PASS: Dashboard3 Pages marker 직접 fetch — `sw.js`, `render-calendar.js`, `workout/exercises.js`, `style.css` HTTP 200 및 `_loadWorkoutStateForSheetSession`, `workout-day-sheet`, `_pickerAfterSelect`, 캘린더 surface timer CSS marker 확인.
  22. not verified yet: 인증 세션이 없어 실제 모바일 UI에서 `운동 탭 -> 오늘 하단 시트 full -> + -> 종목 선택 -> 1화면에 카드 추가 및 타이머 하단 표시` 흐름은 직접 클릭 확인하지 못했다.

- Workout Record Scroll Regression 계획:
  1. `app.js`의 전역 workout pull-back gesture가 기록/상세 본문 스크롤을 가로채는지 우선 진단한다.
  2. 기록/상세 본문에서 시작한 touch gesture는 pull-back 대상에서 제외한다.
  3. 기록 화면 `.workout-tab-content`에는 `touch-action: pan-y`와 하단 고정 타이머 여유를 추가한다.
  4. 변경 범위는 `app.js`, `style.css`, `sw.js`, 관련 테스트, 문서로 제한한다.
  5. `app.js`, `style.css`가 `STATIC_ASSETS`에 있으므로 `sw.js` cache version을 함께 bump한다.
  6. 완료: `app.js`에 `_isWorkoutRecordScrollTarget()`과 `_workoutPageScrollTop()`을 추가했다.
  7. 완료: 기록/상세 본문에서 시작한 touch gesture를 pull-back 대상에서 제외했다.
  8. 완료: `style.css`에서 기록 화면 본문 `touch-action: pan-y`, `overscroll-behavior-y: contain`, timer-open 하단 padding을 추가했다.
  9. 완료: `sw.js` cache version을 `tomatofarm-v20260630z07-workout-record-scroll`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  10. PASS: `node --check app.js`
  11. PASS: `node --check sw.js`
  12. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-card-layout-css.test.js` — 10 tests passed
  13. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  14. PASS: `node --test --test-reporter=dot tests/*.test.js`
  15. PASS: `git diff --check`
  16. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-record-scroll-regression-review.md`를 작성했고 추가 수정 이슈는 없다.
  17. PASS: Dashboard3 Pages 배포 검증 — `ce243d72f73d`, `tomatofarm-v20260630z07-workout-record-scroll`
  18. PASS: Dashboard3 Pages marker 직접 fetch — `sw.js` cache version, `app.js`의 `_isWorkoutRecordScrollTarget`/`_workoutPageScrollTop`, `style.css`의 `touch-action: pan-y`/timer-open padding marker 확인
  19. not verified yet: 인증 계정 실제 `운동 탭 -> 기록 화면 -> 카드 리스트 세로 스크롤` UI flow 확인이 남아 있다.

- Workout Cycle Rail Exercise Name 계획:
  1. 좌측 사이클 목표 칩 첫 줄을 `W1 스모데드`처럼 주차 + 종목명으로 표시한다.
  2. 둘째 줄 `목표 75kg` 구조는 유지한다.
  3. 종목명은 `benchmark.short` 우선, 없으면 `benchmark.label`을 사용한다.
  4. 긴 종목명은 CSS ellipsis로 처리한다.
  5. 변경 범위는 `render-calendar.js`, `style.css`, `tests/workout-calendar-bottom-sheet.test.js`, `sw.js`와 문서로 제한한다.
  6. 완료: `render-calendar.js`에 `_cycleRailExerciseLabel()`과 `exerciseLabel`을 추가했다.
  7. 완료: 레일 칩 첫 줄을 `W1 + 종목명`, 둘째 줄을 `목표 kg`로 렌더한다.
  8. 완료: `style.css`에 `.cal-cycle-branch-head`, `.cal-cycle-branch-name` ellipsis 스타일을 추가했다.
  9. 완료: `sw.js` cache version을 `tomatofarm-v20260630z06-cycle-rail-exercise-name`으로 bump하고 cache marker 테스트 기대값을 갱신했다.
  10. PASS: `node --check render-calendar.js`
  11. PASS: `node --check sw.js`
  12. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` — 16 tests passed
  13. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  14. PASS: `node --test tests/workout-navigation-stack.test.js` — 5 tests passed
  15. PASS: `node --test --test-reporter=dot tests/*.test.js`
  16. PASS: `git diff --check`
  17. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-cycle-rail-exercise-name-review.md`를 작성했고 추가 수정 이슈는 없다.
  18. PASS: Dashboard3 Pages 배포 검증 — `a41a02546fcc`, `tomatofarm-v20260630z06-cycle-rail-exercise-name`
  19. PASS: Dashboard3 Pages marker 직접 fetch — `sw.js` cache version, `render-calendar.js`의 `exerciseLabel`/`cal-cycle-branch-name`, `style.css`의 `.cal-cycle-branch-name`/`text-overflow: ellipsis` 확인
  20. not verified yet: 인증 계정 실제 `운동 탭 -> 월간 캘린더 좌측 사이클 레일` UI flow 확인이 남아 있다.

- Workout Record Date Row Removal 계획:
  1. 운동 기록 화면에서만 `헬스 종목` 위 날짜 UI 행을 숨긴다.
  2. 월간 캘린더 홈과 식단 탭의 날짜 UI는 유지한다.
  3. `workout-tab-content` 상단 padding을 줄여 `헬스 종목`이 제거된 날짜 행 자리에서 시작하게 한다.
  4. 변경 범위는 `style.css`, `tests/workout-navigation-stack.test.js`, `sw.js`와 문서로 제한한다.
  5. `style.css`가 `STATIC_ASSETS`에 있으므로 `sw.js` cache version을 함께 bump한다.
  6. 완료: `style.css`에서 기록 화면 날짜 행을 숨기고 본문 상단 padding을 `20px`로 줄였다.
  7. 완료: `tests/workout-navigation-stack.test.js`에 기록 모드 날짜 행 숨김/상단 padding marker를 추가했다.
  8. 완료: `sw.js` cache version을 `tomatofarm-v20260630z05-workout-record-date-row`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  9. PASS: `node --check sw.js`
  10. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-card-layout-css.test.js` — 10 tests passed
  11. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  12. PASS: `node --test --test-reporter=dot tests/*.test.js`
  13. PASS: `git diff --check`
  14. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-record-date-row-removal-review.md`를 작성했고 추가 수정 이슈는 없다.
  15. PASS: Dashboard3 Pages 배포 검증 — `b01a336c8f56`, `tomatofarm-v20260630z05-workout-record-date-row`
  16. PASS: Dashboard3 Pages marker 직접 fetch — `style.css`의 `#tab-workout.wt-workout-record-mode > .workout-date-nav`, `padding-top: 20px`, `sw.js`의 cache version 확인
  17. not verified yet: 인증 계정 실제 `운동 탭 -> 날짜 선택 -> 운동 기록 화면 -> 헬스 종목 상단 표시` UI flow 확인이 남아 있다.

- Workout Cycle Rail Target Label 계획:
  1. 좌측 사이클 목표 라벨은 화면에서 운동명을 빼고 `W1`/`목표 50kg` 두 줄로 표시한다.
  2. 운동명, 트랙, reps 정보는 `title`/`aria-label`에 유지한다.
  3. 작은 font/line-height/padding으로 레일 높이가 과하게 커지지 않게 한다.
  4. 변경 범위는 `render-calendar.js`, `style.css`, `tests/workout-calendar-bottom-sheet.test.js`, `sw.js`와 문서로 제한한다.
  5. `render-calendar.js`, `style.css`가 `STATIC_ASSETS`에 있으므로 `sw.js` cache version을 함께 bump한다.
  6. 완료: `render-calendar.js`에서 레일 item 표시값을 `weekLabel`, `targetLabel`로 분리했다.
  7. 완료: 레일 버튼을 `W1`/`목표 50kg` 두 줄 구조로 렌더하고, 운동명/트랙/reps는 `title`/`aria-label`에 유지했다.
  8. 완료: `style.css`에서 작은 2줄 라벨에 맞게 레일 버튼 font/line-height/padding을 조정했다.
  9. 완료: `tests/workout-calendar-bottom-sheet.test.js`에 2줄 라벨 marker를 추가했다.
  10. PASS: `node --check render-calendar.js`
  11. PASS: `node --check sw.js`
  12. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js` — 16 tests passed
  13. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  14. PASS: `node --test --test-reporter=dot tests/*.test.js`
  15. PASS: `git diff --check`
  16. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-cycle-rail-target-label-review.md`를 작성했고 추가 수정 이슈는 없다.
  17. PASS: Dashboard3 Pages 배포 검증 — `b01a336c8f56`, `tomatofarm-v20260630z05-workout-record-date-row`
  18. PASS: Dashboard3 Pages marker 직접 fetch — `render-calendar.js`의 `weekLabel`, `cal-cycle-branch-target`, `sw.js`의 cache version 확인
  19. not verified yet: 인증 계정 실제 `운동 탭 -> 월간 캘린더 좌측 사이클 레일` UI flow 확인이 남아 있다.

- Tomato Farm 운영계 추가 배포:
  1. `tomatofarm/main`이 현재 HEAD의 조상인지 확인했다.
  2. `git push tomatofarm HEAD:main`으로 `4b8c004..c34da15` 범위를 운영계에 반영했다.
  3. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/tomatofarm/ c34da15` — `c34da15cf5d2`, `tomatofarm-v20260630z03-home-npc-bulb-hide`
  4. PASS: 운영계 marker 검증 — NPC 전구 숨김, 캘린더 터치 스크롤, 숫자 입력 keyboard UX marker 확인
  5. not verified yet: 인증 계정 실제 UI flow 확인은 남아 있다.

- Home NPC Bulb Hide 계획:
  1. 홈 라이프존에서 미란다와 상담실장의 전구 표시를 일단 숨긴다.
  2. 새 NPC 자산, 좌표, 이름표, 모달, 이벤트는 변경하지 않는다.
  3. 트레이너 전구는 그대로 유지한다.
  4. `style.css`에 미란다/상담실장 전구만 `display: none` 처리하고, `sw.js` cache version과 관련 테스트를 갱신한다.
  5. 완료: `style.css`에 미란다/상담실장 전구 전용 `display: none` 규칙을 추가했다.
  6. 완료: `sw.js` cache version을 `tomatofarm-v20260630z03-home-npc-bulb-hide`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  7. PASS: `node --check sw.js`
  8. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/miranda-quest-modal.test.js tests/consulting-chief-quest-modal.test.js tests/trainer-quest-modal.test.js` — 24 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  10. PASS: `node --test --test-reporter=dot tests/*.test.js`
  11. PASS: `git diff --check`
  12. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-home-npc-bulb-hide-review.md`를 작성했고 추가 수정 이슈는 없다.
  13. PASS: Dashboard3 Pages 배포 검증 — `6eca291ca93f`, `tomatofarm-v20260630z03-home-npc-bulb-hide`
  14. PASS: Dashboard3 Pages marker 검증 — `style.css`의 `.lz-miranda-npc .lz-npc-bulb`, `.lz-consulting-chief-npc .lz-npc-bulb`, `display: none`, `sw.js`의 cache version 확인
  15. not verified yet: 인증 계정 실제 홈 라이프존 화면에서 미란다/상담실장 전구가 사라진 상태 확인이 남아 있다.

- Workout Calendar Touch Scroll Fix 계획:
  1. 모바일 운동 캘린더 화면에서 월간 캘린더 영역을 시작점으로 아래 방향 스크롤하면 화면이 내려가지 않는 증상을 진단했다.
  2. 1순위 원인은 `app.js`의 전역 workout pull-back gesture가 캘린더 그리드 touchmove를 capture 단계에서 잡고 `preventDefault()`를 호출하는 흐름으로 판단했다.
  3. Slice 1 범위는 월간 캘린더 그리드 표식 추가, pull-back gesture 예외 처리, `touch-action: pan-y`, 회귀 테스트, `sw.js` cache bump로 제한한다.
  4. 제외 범위는 하단 day sheet drag/snap 재설계, 날짜 선택 정책 변경, 운동 상세 pull-back 제거, 저장 schema 변경, `www/` 수정, `tomatofarm` remote 배포다.
  5. 완료: `render-calendar.js` 월간 운동 캘린더 그리드에 `data-wt-calendar-scroll-surface` 표식을 추가했다.
  6. 완료: `app.js` 전역 workout pull-back gesture 차단 대상에 `[data-wt-calendar-scroll-surface]`를 추가했다.
  7. 완료: `style.css` `.cal-workout-month-grid`에 `touch-action: pan-y`를 추가했다.
  8. 완료: `sw.js` cache version을 `tomatofarm-v20260630z02-workout-calendar-scroll`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  9. PASS: `node --check app.js`
  10. PASS: `node --check render-calendar.js`
  11. PASS: `node --check sw.js`
  12. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-calendar-bottom-sheet.test.js` — 21 tests passed
  13. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  14. PASS: `node --test --test-reporter=dot tests/*.test.js`
  15. PASS: `git diff --check`
  16. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-calendar-touch-scroll-fix-review.md`를 작성했고 추가 수정 이슈는 없다.
  17. PASS: Dashboard3 Pages 배포 검증 — `320803395160`, `tomatofarm-v20260630z02-workout-calendar-scroll`
  18. PASS: Dashboard3 Pages marker 검증 — `app.js`의 `[data-wt-calendar-scroll-surface]`, `render-calendar.js`의 `data-wt-calendar-scroll-surface`, `style.css`의 `touch-action: pan-y`, `sw.js`의 cache version 확인
  19. not verified yet: 인증 계정 실제 캘린더 터치 스크롤 UI flow 확인이 남아 있다.

- Workout Number Input Keyboard UX 계획:
  1. 모바일 숫자 입력 포커스 시 브라우저 자동 scroll 보정으로 운동 카드가 살짝 이동하는 증상을 진단했다.
  2. 작은 입력 높이, 16px 미만 input font-size, focus scroll guard 부재, 일반/Max V2 inputmode 불일치를 주요 가설로 잡았다.
  3. Slice 1 범위는 `workout/exercises.js` focus scroll guard, 숫자 inputmode 정리, `style.css` input hit area 확대, 회귀 테스트, `sw.js` cache bump로 제한한다.
  4. 제외 범위는 운동 카드 전체 재설계, 저장 schema 변경, 캘린더 sheet drag/snap 변경, `www/` 수정, `tomatofarm` remote 배포다.
  5. 완료: `workout/exercises.js`에 `WORKOUT_NUMBER_INPUT_SELECTOR` focus scroll guard를 추가했다.
  6. 완료: 일반 세트 `kg`/`회` input에 `inputmode`를 추가했다.
  7. 완료: `style.css`에서 일반 세트 input과 Max V2 input hit area를 확대하고 keyboard focus 여유 공간을 추가했다.
  8. 완료: `sw.js` cache version을 `tomatofarm-v20260630z01-workout-number-input-ux`로 bump하고 cache marker 테스트 기대값을 갱신했다.
  9. PASS: `node --check workout/exercises.js`
  10. PASS: `node --check sw.js`
  11. PASS: `node --test tests/workout-card-layout-css.test.js tests/workout-navigation-stack.test.js` — 10 tests passed
  12. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  13. PASS: `node --test --test-reporter=dot tests/*.test.js`
  14. PASS: `git diff --check`
  15. 완료: 리뷰 문서 `docs/ai/reviews/2026-06-30-workout-number-input-keyboard-ux-review.md`를 작성했고 추가 수정 이슈는 없다.
  16. PASS: Dashboard3 Pages 배포 검증 — `7456942e8edda43a052e05c918a77b2914561524`, `tomatofarm-v20260630z01-workout-number-input-ux`
  17. PASS: Dashboard3 Pages marker 검증 — `WORKOUT_NUMBER_INPUT_SELECTOR`, `input.focus({ preventScroll: true })`, `#tab-workout .set-input`, `scroll-margin-bottom`, Max V2 input CSS marker 확인
  18. not verified yet: 인증 계정 실제 숫자 입력 키보드 UI flow 확인이 남아 있다.

## 방금 계획한 항목

- Home Consulting Chief NPC 계획:
  1. 홈 라이프존 우측 하단 소파/상담 라운지 영역에 `상담실장` NPC를 추가한다.
  2. 참고 이미지는 정확한 실존 인물 복제가 아니라 병원 상담실장 분위기, 강한 눈매/눈썹, 묶은 어두운 머리, 흰 가운 또는 검은 재킷 같은 식별 단서로 반영한다.
  3. 홈용 작은 투명 PNG와 모달용 큰 투명 PNG를 분리해 `assets/home/life-zone/ui/`에 저장한다.
  4. 기존 `life-zone:npc-quest` 이벤트, DOM 이름표, `npc-quest-bubble.png` 전구 패턴을 재사용한다.
  5. 수정 범위는 `home/life-zone.js`, `app.js`, `modal-manager.js`, `modals/consulting-chief-quest-modal.js`, `style.css`, `sw.js`, 관련 테스트와 새 PNG 자산으로 제한한다.
  6. 배포는 `origin/main` Dashboard3 Pages만 허용하고 운영계 `tomatofarm` remote는 사용하지 않는다.

- Home Consulting Chief NPC Slice 1:
  1. `assets/home/life-zone/ui/consulting-chief-npc-home.png`와 `consulting-chief-npc-modal.png`를 추가했다.
  2. `home/life-zone.js`에 우측 하단 `상담실장` NPC 버튼, 이름표, 전구, `consultingChief` 이벤트 detail을 추가했다.
  3. `modals/consulting-chief-quest-modal.js`와 `app.js`/`modal-manager.js` 분기를 추가했다.
  4. `style.css`에 홈 배치와 모달 캐릭터 크기 스타일을 추가했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z29-consulting-chief-npc`로 갱신하고 새 모달/PNG를 `STATIC_ASSETS`에 등록했다.
  6. PASS: `node --check home/life-zone.js; node --check app.js; node --check modal-manager.js; node --check modals/consulting-chief-quest-modal.js; node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/consulting-chief-quest-modal.test.js tests/miranda-quest-modal.test.js tests/trainer-quest-modal.test.js` — 24 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  9. PASS: `node --test tests/*.test.js` — 613 tests passed
  10. PASS: `git diff --check`
  11. PASS: Dashboard3 Pages 배포 검증 — `f6bc1679999f8c0d5bc9f2ddae802dc04c21bf1a`, `tomatofarm-v20260629z29-consulting-chief-npc`
  12. PASS: 배포 URL 직접 fetch — `index.html`, `sw.js`, `home/life-zone.js`, `modals/consulting-chief-quest-modal.js`, 홈/모달 PNG HTTP 200과 marker 확인
  13. 리뷰: `docs/ai/reviews/2026-06-29-home-consulting-chief-npc-review.md`
  14. not verified yet: in-app browser가 Dashboard3 페이지 로딩 확인에서 두 차례 timeout되어 실제 홈 화면 전구 클릭 flow는 직접 확인하지 못했다.

- Home Consulting Chief NPC Slice 2 계획:
  1. 사용자 제공 배포 화면에서 `상담실장` 홈 스프라이트가 우측 하단 방 경계 밖으로 내려가 보이는 회귀를 확인했다.
  2. 원인은 홈 자산이 `96x256` 세로형인데 CSS가 `width: 108 기준`, `top: 1284`로 커서 모바일 카드에서 하체가 공간 밖으로 내려가는 것이다.
  3. 새 자산 생성 없이 `style.css`의 좌표/폭만 줄이고, 캐시/테스트/문서를 갱신한다.
  4. 완료: `.lz-consulting-chief-npc`를 `left: 1338`, `top: 1260`, `width: 86 기준`으로 보정하고 clamp를 `28px-40px`로 줄였다.
  5. 완료: `sw.js` 캐시 버전을 `tomatofarm-v20260629z30-consulting-chief-fit`으로 bump했다.
  6. PASS: `node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/consulting-chief-quest-modal.test.js` — 14 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  9. PASS: `node --test --test-reporter=dot tests/*.test.js`
  10. PASS: `git diff --check`
  11. PASS: 로컬 합성 미리보기에서 상담실장 스프라이트가 우측 하단 소파/테이블 공간 안쪽에 들어오는 것을 확인했다.
  12. not verified yet: 인증 세션이 없어 실제 배포 홈 화면에서 클릭 flow는 직접 시각 검증하지 못했다.

- Home Consulting Chief NPC Slice 3 계획:
  1. 사용자 피드백: Dashboard3 배포 화면에서 `상담실장` NPC가 여전히 크다.
  2. 원인: 모바일에서는 Slice 2의 `min-width: 28px`가 계속 적용되어 세로형 `96x256` 자산 높이가 약 `75px`로 남는다.
  3. 보정: 홈 전용 폭을 `clamp(18px, calc(56 / 1672 * 100%), 28px)`로 더 줄이고, 좌표/모달/다른 NPC는 건드리지 않는다.
  4. 완료: `style.css`에서 `.lz-consulting-chief-npc` 폭을 `clamp(18px, calc(56 / 1672 * 100%), 28px)`로 축소했다.
  5. 완료: `sw.js` 캐시 버전을 `tomatofarm-v20260629z31-consulting-chief-smaller`로 bump했다.
  6. PASS: `node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/consulting-chief-quest-modal.test.js` — 14 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=863`
  9. PASS: `node --test --test-reporter=dot tests/*.test.js`
  10. PASS: `git diff --check`
  11. PASS: 로컬 합성 미리보기에서 상담실장 스프라이트가 우측 하단 소파/테이블 공간 안쪽에 작게 배치되는 것을 확인했다.
  12. not verified yet: 인증 세션이 없어 실제 배포 홈 화면에서 클릭 flow는 직접 시각 검증하지 못했다.

- Home Life Zone Trainer Quest Bubble Offset 계획:
  1. `.lz-npc-quest`의 현재 `left:1084`, `top:824`, `width:168 기준` 배치가 모바일 축소 시 트레이너 얼굴과 겹치는 원인임을 확인했다.
  2. 전구를 새 자산 없이 기존 `npc-quest-bubble.png` DOM의 trainer 전용 offset으로 얼굴 우상단에 분리한다.
  3. 수정 범위는 `style.css`, `tests/home-life-zone-npc-quest.test.js`, `sw.js`, 리뷰/NEXT_ACTION 문서로 제한했다.

- Home Life Zone Trainer Quest Bubble Offset Slice 1:
  1. `style.css`에서 `.lz-npc-quest` `top`을 `792`로 올리고 폭을 `188 기준`으로 넓혔다.
  2. `.lz-npc-quest--trainer .lz-npc-bulb`에 `--lz-bulb-x: 62%`, `--lz-bulb-y: -72%`를 추가했다.
  3. reduced motion에서도 offset이 유지되도록 `.lz-npc-bulb` 기본 `transform`을 CSS 변수 기반으로 지정했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z27-trainer-quest-bubble-offset`으로 갱신했다.
  5. 캐시 marker 회귀 테스트를 새 버전으로 갱신했다.
  6. PASS: `node --check home/life-zone.js; node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/trainer-quest-modal.test.js` — 15 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  9. PASS: `node --test tests/*.test.js` — 608 tests passed
  10. PASS: `git diff --check`
  11. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z27-trainer-quest-bubble-offset` 캐시 버전 확인
  12. PASS: Dashboard3 Pages marker 검증 — `style.css`의 trainer 전구 offset과 `sw.js` 캐시 버전 확인
  13. not verified yet: 인증 세션이 없어 실제 배포 홈 화면에서 트레이너 얼굴 겹침 UI flow는 직접 시각 확인하지 못했다.

- Home Life Zone Trainer Quest Bubble Offset Slice 2 계획:
  1. `--lz-bulb-x: 62%`가 전구를 오른쪽으로 밀어 요구사항과 다르게 보이는 원인임을 확인했다.
  2. `.lz-npc-quest--trainer .lz-nameplate { order: -1; }` 때문에 이름표가 전구보다 위에 나오는 문제를 확인했다.
  3. 목표 구조는 아래에서 위로 `트레이너 머리 -> 트레이너 이름표 -> 전구`다.

- Home Life Zone Trainer Quest Bubble Offset Slice 2:
  1. `.lz-npc-quest--trainer .lz-npc-bulb`를 `order: 0`, `--lz-bulb-x: 0px`, `--lz-bulb-y: 0px`으로 고정했다.
  2. `.lz-npc-quest--trainer .lz-nameplate`를 `order: 1`로 변경해 전구가 이름표 위에 오게 했다.
  3. `.lz-npc-quest` 폭을 `168 기준`으로 되돌려 트레이너 머리 중심선에서 벗어나지 않게 했다.
  4. 테스트에 `order: -1`과 `--lz-bulb-x: 62%` 재도입 금지를 추가했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z28-trainer-quest-vertical-stack`으로 갱신했다.
  6. PASS: `node --check home/life-zone.js; node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/trainer-quest-modal.test.js` — 15 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  9. PASS: `node --test tests/*.test.js` — 608 tests passed
  10. PASS: `git diff --check`
  11. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z28-trainer-quest-vertical-stack` 캐시 버전 확인
  12. PASS: Dashboard3 Pages marker 검증 — `order: 1`, `order: 0`, `--lz-bulb-x: 0px`, `--lz-bulb-y: 0px` 확인
  13. not verified yet: 인증 세션이 없어 실제 홈 화면에서 픽셀 단위 시각 확인은 직접 수행하지 못했다.

## 직전 완료 요약

- Home Life Zone Running Stale Priority 계획:
  1. `resolveLifeZoneActivity()`가 `hasLifeZoneRunningActivity()`를 스냅샷보다 먼저 검사해 저장된 러닝 기록이 최신 점심 기록을 덮는 원인을 확인했다.
  2. 라이브 러닝만 최우선으로 두고, 저장된 러닝은 최신 활동 스냅샷 이후에 판정하도록 범위를 고정했다.
  3. 러닝 지도/스프라이트/좌표와 식단 저장 payload는 제외 범위로 고정했다.

- Home Life Zone Running Stale Priority Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-home-life-zone-running-stale-priority.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-home-life-zone-running-stale-priority-review.md`
  3. `home/life-zone-state.js`에서 라이브 러닝 판정 `hasLifeZoneActiveRunning()`을 추가했다.
  4. 홈 라이프존 상태 우선순위를 `라이브 러닝 -> 최신 활동 스냅샷 -> 저장 러닝 -> 운동 -> 식단 -> 업무`로 변경했다.
  5. `workout/save.js`에서 러닝 저장 시 `state: 'running'` 스냅샷을 남기도록 변경했다.
  6. 문정토마토 점심 스냅샷이 저장 러닝을 덮는 회귀 테스트를 추가했다.
  7. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z26-life-zone-running-priority`로 갱신했다.
  8. PASS: `node --check home/life-zone-state.js; node --check workout/save.js; node --check sw.js`
  9. PASS: `node --test tests/home-life-zone-state.test.js tests/home-life-zone-npc-quest.test.js tests/running-entry.test.js tests/save-schema.test.js` — 95 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  11. PASS: `node --test tests/*.test.js` — 608 tests passed
  12. PASS: `git diff --check`
  13. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z26-life-zone-running-priority` 캐시 버전 확인
  14. PASS: Dashboard3 Pages 마커 검증 — 라이브 러닝 우선순위, 스냅샷 우선순위, 러닝 저장 스냅샷 marker 확인

- Stats Performance Growth Blue 계획:
  1. `성장중` 판정 텍스트가 `var(--diet-ok)` 때문에 토마토 레드로 보이는 현상을 확인했다.
  2. 변경 범위를 `.stats-perf-row.is-growth .stats-perf-status b` 색상, `sw.js` 캐시 버전, 관련 회귀 테스트로 제한했다.
  3. 판정 로직, 표 구조, 데이터 집계는 제외 범위로 고정했다.

- Stats Performance Growth Blue Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-performance-growth-blue.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-performance-growth-blue-review.md`
  3. `style.css`에서 `.stats-perf-row.is-growth .stats-perf-status b` 색상을 `#2563eb`으로 변경했다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z25-stats-growth-blue`로 갱신했다.
  5. `tests/stats-exercise-performance.test.js`에 성장 판정 색상 회귀 검증을 추가했다.
  6. PASS: `node --check sw.js`
  7. PASS: `node --test tests/stats-exercise-performance.test.js tests/stats-overall-compact-summary.test.js` — 8 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  9. PASS: `node --test tests/*.test.js` — 606 tests passed
  10. PASS: `git diff --check`
  11. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z25-stats-growth-blue` 캐시 버전 확인
  12. PASS: Dashboard3 Pages 마커 검증 — `style.css::.stats-perf-row.is-growth .stats-perf-status b { color: #2563eb; }`

- Stats Weekly Burned Calorie Render Fix Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-weekly-burned-calorie-render-fix.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-weekly-burned-calorie-render-fix-review.md`
  3. 주간 그래프 집계에서 식단 day와 workout day를 분리했다.
  4. 섭취칼로리는 식단 day, 운동칼로리는 원본 cache workout day로 계산한다.
  5. 하단 `운동 kcal` KPI도 원본 cache workout day 기준으로 계산한다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z24-stats-weekly-burned-fix`로 갱신했다.
  7. PASS: `node --check render-stats.js; node --check sw.js`
  8. PASS: `node --test tests/stats-unified-health-chart.test.js tests/trainer-quest-modal.test.js tests/stats-overall-compact-summary.test.js` — 14 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  10. PASS: `node --test tests/*.test.js` — 606 tests passed
  11. PASS: `git diff --check`
  12. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z24-stats-weekly-burned-fix` 캐시 버전 확인
  13. not verified yet: 인증 계정 실제 UI에서 초록색 운동칼로리 선이 그려지는지 시각 확인이 남아 있다.

- Stats Weekly Calorie Aggregation Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-weekly-calorie-aggregation.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-weekly-calorie-aggregation-review.md`
  3. 전체통계와 트레이너 통계 모달의 건강지표 카드 제목을 `체중 & 주간 누적 칼로리 추이`로 변경했다.
  4. `_renderKcalWeightChart()`가 일별 섭취칼로리 대신 주 단위 누적 섭취칼로리와 주 단위 누적 운동칼로리를 표출하도록 바꿨다.
  5. 운동칼로리 집계는 `calcBurnedKcal(day, weightForBurn).total`을 사용한다.
  6. 별도 `월간 칼로리 리포트` 카드나 두 번째 그래프는 되살리지 않았다.
  7. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z23-stats-weekly-calories`로 갱신했다.
  8. PASS: `node --check render-stats.js; node --check sw.js`
  9. PASS: `node --test tests/stats-unified-health-chart.test.js tests/trainer-quest-modal.test.js tests/stats-overall-compact-summary.test.js` — 14 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  11. PASS: `node --test tests/*.test.js` — 606 tests passed
  12. PASS: `git diff --check`
  13. PASS: Dashboard3 Pages 배포 검증 — `tomatofarm-v20260629z23-stats-weekly-calories` 캐시 버전 확인
  14. PASS: 원격 `index.html`, `render-stats.js`, `sw.js` marker fetch — HTTP 200, 새 주간 누적 문자열과 캐시 버전 확인
  15. not verified yet: 인증 계정 실제 UI에서 Chart.js 렌더링 시각 확인이 남아 있다.

- Stats Health Calorie Report Flatten Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-health-calorie-report-flatten.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-health-calorie-report-flatten-review.md`
  3. `월간 칼로리 리포트` 하위 제목과 `calorie-month-chart` 두 번째 그래프를 제거했다.
  4. `calorie-month-summary`만 `체중 & 섭취칼로리 추이` 카드 내부에 남겼다.
  5. 트레이너 통계 모달도 같은 구조로 맞췄다.
  6. 별도 월간 차트 tracker `_calorieMonthCharts`와 Chart 생성 경로를 제거했다.
  7. 기존 월간 그래프의 운동칼로리 정보는 요약 KPI `운동`으로 보존했다.
  8. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z22-stats-health-calorie-flat`으로 갱신했다.
  9. PASS: `node --check render-stats.js; node --check sw.js`
  10. PASS: `node --test tests/stats-unified-health-chart.test.js tests/trainer-quest-modal.test.js tests/stats-overall-compact-summary.test.js` — 14 tests passed
  11. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  12. PASS: `node --test tests/*.test.js` — 606 tests passed
  13. PASS: `git diff --check`
  14. not verified yet: Dashboard3 Pages 배포 검증과 인증 계정 실제 UI 시각 확인이 남아 있다.

- Stats Health Calorie Card Merge Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-health-calorie-card-merge.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-health-calorie-card-merge-review.md`
  3. 전체통계의 `월간 칼로리 리포트`를 별도 `stats-calorie-report-block` 카드에서 제거했다.
  4. 월간 칼로리 차트/요약을 `체중 & 섭취칼로리 추이` 카드 내부 `stats-health-report` 하위 섹션으로 이동했다.
  5. 트레이너 통계 모달도 같은 구조로 맞췄다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z21-stats-health-calorie-merge`로 갱신했다.
  7. PASS: `node --check render-stats.js; node --check sw.js`
  8. PASS: `node --test tests/stats-unified-health-chart.test.js tests/trainer-quest-modal.test.js tests/stats-overall-compact-summary.test.js` — 14 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  10. PASS: `node --test tests/*.test.js` — 606 tests passed
  11. PASS: `git diff --check`
  12. not verified yet: Dashboard3 Pages 배포 검증과 인증 계정 실제 UI 시각 확인이 남아 있다.

- Trainer Stats Top Art + Home Map Scale Fix Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-trainer-stats-top-art-home-map-scale-fix.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-trainer-stats-top-art-home-map-scale-fix-review.md`
  3. 통계 모달 전용 트레이너 이미지를 본문 내부가 아니라 모달 상단 바깥 크롭 레이어로 재배치했다.
  4. 홈 러닝 지도 말풍선 전용 최대 zoom을 `12`로 낮춰 작은 말풍선에서도 더 넓은 동네 맥락을 보이게 했다.
  5. 운동 탭 러닝 결과 지도 파일은 수정하지 않고 홈 전용 계약만 변경했다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z20-trainer-top-map-zoom`으로 갱신했다.
  7. PASS: `node --check home/life-zone.js; node --check modals/trainer-quest-modal.js; node --check sw.js`
  8. PASS: `node --test tests/trainer-quest-modal.test.js tests/home-life-zone-npc-quest.test.js tests/running-entry.test.js tests/workout-calendar-bottom-sheet.test.js` — 41 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  10. PASS: `node --test tests/*.test.js` — 606 tests passed
  11. PASS: `git diff --check`
  12. not verified yet: Dashboard3 Pages 배포 검증과 인증 계정 실제 UI 시각 확인이 남아 있다.

- Home Running Map Zoom Scale Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-home-running-map-zoom-scale.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-home-running-map-zoom-scale-review.md`
  3. 홈 라이프존 러닝 지도 말풍선에 `RUNNING_MAP_HOME_MAX_ZOOM = 14`를 추가해 짧은 러닝/라이브 위치에서도 주변 동네 단위가 보이도록 했다.
  4. 운동 탭 러닝 결과 지도는 `workout/running-map.js`와 `renderRunningMap(... phase: 'detail')` 경로를 그대로 유지했다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z19-home-running-map-zoom`으로 갱신했다.
  6. PASS: `node --check home/life-zone.js; node --check sw.js`
  7. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/running-entry.test.js tests/running-tracker.test.js tests/workout-calendar-bottom-sheet.test.js` — 41 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  9. PASS: `node --test tests/*.test.js` — 606 tests passed
  10. PASS: `git diff --check`
  11. PASS: Dashboard3 Pages 배포 검증을 통과했다. 최종 검증 커밋은 핸드오프에 기록한다.
  12. not verified yet: 인증 계정 실제 홈탭 지도 말풍선 시각 확인이 남아 있다.

- Trainer Health Miranda Visuals Slice 1-3:
  1. 계획: `docs/ai/features/2026-06-29-trainer-health-miranda-visuals.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-trainer-health-miranda-visuals-review.md`
  3. `assets/home/life-zone/ui/trainer-quest-stats-guide-trainer.png`를 추가해 통계 모달 우측에서 팔을 뻗어 안내하는 트레이너를 표시했다.
  4. 트레이너 말풍선 문구를 `회원님의 운동 성과를 함께 살펴보시죠!`로 변경하고 공유/복사 버튼을 제목 줄 옆으로 이동했다.
  5. 전체통계와 트레이너 통계 모달의 건강지표 영역을 `체중 & 섭취칼로리 추이`, `월간 칼로리 리포트` 카드로 롤백했다.
  6. `assets/home/life-zone/ui/miranda-npc-seated.png`를 새 imagegen 결과로 교체해 낮은 농도 선글라스, 보이는 눈매, 차가운 표정을 반영했다.
  7. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z18-trainer-health-miranda`로 갱신했다.
  8. PASS: `node --check modals/trainer-quest-modal.js; node --check modals/miranda-quest-modal.js; node --check render-stats.js; node --check sw.js`
  9. PASS: `node --test tests/trainer-quest-modal.test.js tests/miranda-quest-modal.test.js tests/stats-unified-health-chart.test.js tests/stats-overall-compact-summary.test.js tests/stats-exercise-performance.test.js` — 21 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  11. PASS: `node --test tests/*.test.js` — 606 tests passed
  12. PASS: `git diff --check`
  13. PASS: Dashboard3 Pages 배포 검증을 통과했다. 최종 검증 커밋은 핸드오프에 기록한다.
  14. PASS: 배포 URL의 `modals/trainer-quest-modal.js`, `render-stats.js`, `style.css`, `sw.js`, `miranda-npc-seated.png`, `trainer-quest-stats-guide-trainer.png`가 HTTP 200과 새 marker를 반환했다.
  15. not verified yet: 브라우저 플러그인이 Dashboard3 탭 로딩 및 탭 목록 조회에서 제한 시간에 걸려 실제 모달 클릭 흐름은 인증 계정 브라우저에서 직접 확인이 필요하다.

- Trainer Label Stats Leaning Asset Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-trainer-label-stats-leaning-asset.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-trainer-label-stats-leaning-asset-review.md`
  3. 홈 트레이너 이름표를 전구 위로 올려 얼굴을 덮지 않게 했다.
  4. imagegen built-in 경로로 통계 모달 전용 `assets/home/life-zone/ui/trainer-quest-leaning-trainer.png`를 추가했다.
  5. 새 PNG는 `1028x1086` RGBA이며, `sw.js` `STATIC_ASSETS`에 등록했다.
  6. 트레이너 통계 화면에서는 `trainer-quest-sheet--stats`로 기존 전신 stage를 숨기고 compact padding을 적용해 통계 정보가 상단부터 시작한다.
  7. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z15-trainer-leaning-modal`로 갱신했다.
  8. PASS: `node --check modals/trainer-quest-modal.js; node --check home/life-zone.js; node --check sw.js`
  9. PASS: `node --test tests/trainer-quest-modal.test.js tests/home-life-zone-npc-quest.test.js tests/miranda-quest-modal.test.js` — 19 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=860`
  11. PASS: `node --test tests/*.test.js` — 603 tests passed
  12. PASS: `git diff --check`
  13. PASS: Dashboard3 배포 검증
  14. PASS: 배포된 `sw.js`, `modals/trainer-quest-modal.js`, `style.css` marker 검증
  15. not verified yet: 인증 세션이 없는 브라우저에서는 실제 홈탭과 트레이너 통계 모달 시각 상태를 직접 클릭 검증하지 못했다.

- Home Life Zone Overlay Alignment Fix Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-home-life-zone-overlay-alignment-fix.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-home-life-zone-overlay-alignment-fix-review.md`
  3. 트레이너 전구 버튼을 실제 트레이너 정수리 위 좌표로 이동했다.
  4. 미란다 전구는 트레이너 전구와 같은 원본 비율을 쓰고, 애니메이션이 절대 위치 `transform`을 덮어쓰지 않도록 CSS 변수를 적용했다.
  5. 미란다 이름표를 캐릭터 위로 올렸다.
  6. 러닝 actor 슬롯을 하단 트랙 원근에 맞춰 중앙/좌측/우측 차등 크기로 조정했다.
  7. 홈 지도 말풍선은 실제 지도 타일/경로/현재점/동 단위 라벨을 유지하고, 작은 말풍선에서 지도 내용을 가리던 `VWorld` attribution은 숨겼다.
  8. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z14-life-zone-alignment`로 갱신했다.
  9. PASS: `node --check home/life-zone.js; node --check home/life-zone-state.js; node --check sw.js`
  10. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js tests/miranda-quest-modal.test.js tests/running-entry.test.js` — 41 tests passed
  11. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=859`
  12. PASS: `node --test tests/*.test.js` — 603 tests passed
  13. PASS: `git diff --check`
  14. PASS: Dashboard3 배포 검증
  15. PASS: 배포된 `sw.js`, `style.css`, `home/life-zone-state.js` marker 검증
  16. not verified yet: 인증 세션이 없는 브라우저에서는 실제 홈탭 라이프존 시각 상태를 직접 클릭 검증하지 못했다.

- NPC Asset Workflow Rules 계획:
  1. 계획: `docs/ai/features/2026-06-29-npc-asset-workflow-rules.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-npc-asset-workflow-rules-review.md`
  3. `docs/ai/NPC_ASSET_WORKFLOW.md`를 추가해 홈 배치용 스프라이트, 모달용 아트에셋, 필요 시 NPC 전용 공간/소품 overlay를 기본 산출물 계약으로 고정했다.
  4. 홈탭 기존 좌표계/공간/각도/사이즈 기준, 도형/스티커형 결과 폐기, imagegen 프롬프트, PNG 후처리, DOM 이름표/전구/모달 바인딩 규칙을 정리했다.
  5. `AGENTS.md`에 NPC/라이프존 캐릭터/전구/모달 아트 요청 시 `docs/ai/NPC_ASSET_WORKFLOW.md`를 먼저 읽도록 필수 진입 규칙을 추가했다.
  6. 검증: `git diff --check`, `rg -n "NPC_ASSET_WORKFLOW|NPC|라이프존 캐릭터" AGENTS.md docs/ai/NPC_ASSET_WORKFLOW.md docs/ai/NEXT_ACTION.md`.

- Home Miranda Fashion Corner Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-home-miranda-fashion-corner.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-home-miranda-fashion-corner-review.md`
  3. `assets/home/life-zone/ui/miranda-fashion-corner.png`를 추가해 좌측 하단 기존 집기 영역 위에 옷 행거, 의상, 선반, 거울 스프라이트를 배치했다.
  4. `home/life-zone.js`에 `lz-miranda-corner` overlay를 추가하고, 미란다 NPC는 기존 이벤트/이름표 구조를 유지했다.
  5. `style.css`에서 패션 코너 좌표와 미란다 좌표를 조정해 미란다가 러닝트랙보다 아래쪽에 표시되도록 했다.
  6. `sw.js` `STATIC_ASSETS`에 새 PNG를 등록하고 `CACHE_VERSION`을 `tomatofarm-v20260629z13-home-miranda-fashion-corner`로 갱신했다.
  7. 검증: `node --check home/life-zone.js; node --check sw.js`, `node --test tests/home-life-zone-npc-quest.test.js tests/miranda-quest-modal.test.js`, `node --test tests/*.test.js`, `node scripts/verify-runtime-assets.mjs`, `git diff --check`.

- Stats Overall Deep Unification Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-stats-overall-deep-unification.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-stats-overall-deep-unification-review.md`
  3. `index.html`에서 `전체통계`/`심층통계` 탭과 `#stats-deep-panel`을 제거하고, 전체통계에 기간 프리셋과 `stats-workout-analysis`를 추가했다.
  4. `render-stats.js`에서 `_renderDeepStats()`, `switchStatsView`, `trainer-quest-deep-stats` 경로를 제거하고 `_renderWorkoutAnalysis()`로 통합했다.
  5. 운동 완료 인사이트의 `계획 이행률`, `계획 대비 볼륨`, `완료 세트`를 선택 기간 기준 통계로 흡수했다.
  6. `workout/index.js`에서 운동 저장 후 `window.insightsOpen(sessionKey)` 자동 호출을 제거했다.
  7. 중복 방지를 위해 부위별 운동량/보강 후보는 기존 `근육 피로도` 카드에만 남기고 `운동 분석`에는 별도 부위별 운동량 카드를 두지 않았다.
  8. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z9-stats-unified-overall`로 갱신했다.
  9. PASS: `node --check render-stats.js; node --check workout/index.js; node --check sw.js`
  10. PASS: `node --test tests/stats-overall-compact-summary.test.js tests/stats-unified-health-chart.test.js tests/stats-muscle-fatigue-insight.test.js tests/trainer-quest-modal.test.js tests/workout-timer-summary-only.test.js` — 24 tests passed
  11. PASS: `node --test tests/*.test.js` — 596 tests passed
  12. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=855`
  13. PASS: `git diff --check`
  14. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 794fc9343096a7f26a4f08814fbcded2250e49b5` — `[deploy-verify] ok 794fc9343096 tomatofarm-v20260629z9-stats-unified-overall static=226`
  15. PASS: deployed marker fetch — `index.html`, `render-stats.js`, `workout/index.js`, `sw.js` 모두 HTTP 200 및 새 통계 통합 marker 확인.
  16. not verified yet: 인증 세션이 없어 실제 `더보기/통계 탭 -> 기간 버튼 -> 운동 분석` UI 클릭 흐름은 인증 계정에서 확인 필요.

- Home Running Motion Map Clarity Slice 1:
  1. 계획: `docs/ai/features/2026-06-29-home-running-motion-map-clarity.md`
  2. 리뷰: `docs/ai/reviews/2026-06-29-home-running-motion-map-clarity-review.md`
  3. 기존 옆방향 러닝 스프라이트를 3/4 정면 제자리 조깅 2프레임 스프라이트로 교체했다.
  4. 러닝 actor CSS에서 좌우 이동/회전 없이 발 접지점 기준 vertical bob과 frame swap만 남겼다.
  5. 러닝 슬롯을 기존 홈트랙 하단부로 내리고, 홈 지도 말풍선에 `방이동 · 송파구` 형식의 위치 라벨을 추가했다.
  6. 러닝 라이브 경로 중심점이 생기면 VWorld reverse geocode를 백그라운드로 수행해 홈 라벨을 갱신한다.
  7. PASS: `node --check home/life-zone.js; node --check home/life-zone-state.js; node --check workout/running-session.js`
  8. PASS: `python -m py_compile scripts/process-life-zone-running-sprites.py`
  9. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js tests/running-entry.test.js` — 34 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=857`
  11. PASS: `node --test` — 594 tests passed
  12. PASS: `git diff --check`
  13. not verified yet: in-app browser에서 Dashboard3 배포 페이지 네비게이션이 70초 제한을 초과해 실제 홈탭 라이프존 시각 flow는 직접 확인하지 못했다.

- Running Result Map Tab Motion Slice 1:
  1. `render-calendar.js`에서 운동 상세 탭을 `1회차`, `2회차`, `러닝`으로 변경하고 러닝 탭을 헬스 세션과 분리했다.
  2. 러닝 상세 카드는 가짜 격자 지도와 중복 chip을 제거하고 `renderRunningMap` 실제 지도 셸에 GPS route를 표시한다.
  3. `workout/running-session.js`에서 러닝 저장 session index를 `2`로 고정하고 VWorld reverse geocode 동 단위 위치 라벨을 저장한다.
  4. phone/watch bridge sensor hook으로 고도, 심박, 케이던스를 수집할 수 있게 하고 미수집 값은 `--`로 표시한다.
  5. 홈 라이프존 러닝 actor를 기존 스프라이트 기반 작은 제자리 러닝 모션으로 조정했다.
  6. 리뷰: `docs/ai/reviews/2026-06-29-running-result-map-tab-motion-review.md`
  7. PASS: `node --check workout/running-session.js; node --check render-calendar.js; node --check home/life-zone.js; node --check home/life-zone-state.js; node --check sw.js`
  8. PASS: `node --test tests/running-entry.test.js tests/running-tracker.test.js tests/home-life-zone-npc-quest.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js` — 42 tests passed
  9. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=857`
  10. PASS: `$tests = rg --files tests | Where-Object { $_ -match '\.test\.js$' }; node --test $tests` — 594 tests passed
  11. PASS: `git diff --check`
  12. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ cb7cf08ad4812bec572efdd304591db1d91caf8f` — `[deploy-verify] ok cb7cf08ad481 tomatofarm-v20260629z7-running-map-tab-motion static=226`
  13. PASS: deployed marker fetch — `sw.js`, `render-calendar.js`, `workout/running-session.js`, `style.css` 모두 새 러닝 탭/지도/센서/홈 모션 marker 포함.
  14. not verified yet: 브라우저 탭 로딩이 60초 제한을 초과해 실제 `운동 탭 -> 러닝 탭 -> 러닝 시작/완료/저장 -> 상세 카드 지도` UI flow는 직접 확인하지 못했다.

- Trainer Quest Glass Squircle Slice 1:
  1. `modals/trainer-quest-modal.js` 말풍선 타자 간격을 `28ms`에서 `56ms`로 늦췄다.
  2. `style.css`에 `.trainer-quest-modal` 전용 glass overlay를 추가하고 `.trainer-quest-sheet`를 흰색 반투명 glass panel로 변경했다.
  3. 선택지는 어두운 직사각 패널에서 독립된 rounded squircle glass 버튼 stack으로 변경했고, 폭을 `min(236px, calc(50vw - 12px))`로 제한했다.
  4. 선택지 label은 TDS 작은 텍스트 토큰(`tds-st13`, `tds-w-semi`)을 사용한다.
  5. `tests/trainer-quest-modal.test.js`에서 이전 회색 TDS sheet/어두운 메뉴/빠른 타자 계약을 제거하고 새 계약을 검증한다.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z6-trainer-glass-squircle`로 bump했다.
  7. 리뷰: `docs/ai/reviews/2026-06-29-trainer-quest-glass-squircle-review.md`
  8. PASS: `node --check modals/trainer-quest-modal.js; node --check sw.js`
  9. PASS: `node --test tests/trainer-quest-modal.test.js tests/home-life-zone-npc-quest.test.js` — 13 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=855`
  11. PASS: `$tests = rg --files tests | Where-Object { $_ -match '\.test\.js$' }; node --test @tests` — 591 tests passed
  12. PASS: `git diff --check`
  13. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 4113ac7` — `[deploy-verify] ok 4113ac78c443 tomatofarm-v20260629z6-trainer-glass-squircle static=226`
  14. PASS: deployed marker fetch — `index.html`, `sw.js`, `modals/trainer-quest-modal.js`, `style.css` all returned HTTP 200 and contained the expected glass/squircle/typing markers.
  15. not verified yet: 자동 브라우저가 배포 페이지 로딩 제한시간을 넘겨 실제 홈탭 트레이너 모달 클릭 flow는 직접 확인하지 못했다.

- Running Save Detail Card Slice 1:
  1. 커밋: `e2e3955f42294edc4c6271ba8d3072710d04faec`
  2. 러닝 요약 저장 후 `window.wtOpenWorkoutDaySheet`로 해당 날짜/회차 캘린더 상세 시트를 바로 연다.
  3. 상세 시트 러닝 항목을 `wt-running-read-card`로 렌더하고 거리/시간/평균 페이스/칼로리/고도/케이던스/GPS 요약만 표출한다.
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260629z4-running-save-detail-card`로 bump했다.
  5. PASS: `node --check app.js; node --check workout/running-session.js; node --check render-calendar.js; node --check sw.js`
  6. PASS: `node --test tests/running-entry.test.js tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js`
  7. PASS: `$tests = rg --files tests | Where-Object { $_ -match '\.test\.js$' }; node --test @tests` — 590 tests passed
  8. PASS: `node scripts/verify-runtime-assets.mjs` — `refs=853`
  9. PASS: `git diff --check`
  10. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ e2e3955f42294edc4c6271ba8d3072710d04faec`
  11. PASS: deployed markers — `sw.js::tomatofarm-v20260629z4-running-save-detail-card`, `app.js::window.wtOpenWorkoutDaySheet = openWorkoutDaySheetFromAction`, `workout/running-session.js::action: 'running:save-detail'`, `render-calendar.js::wt-running-read-card`, `render-calendar.js::평균 페이스`, `style.css::.wt-running-metric-grid`
  12. not verified yet: 인증 계정이 없어 실제 `러닝 시작 -> 완료 -> 저장 -> 상세 시트` 터치 flow는 배포 페이지에서 직접 조작하지 못했다.

- Home Life Zone Trainer Label + CSS Motion Slice 1:
  1. `home/life-zone.js`에서 actor image에 `lz-actor--pose-${slot.pose}` class를 추가했다.
  2. `style.css`에서 `트레이너` 이름표를 하단 y 좌표로 내렸다.
  3. `workout-lat`, `workout-bench`, `workout-squat` pose class에 작은 CSS transform 애니메이션을 추가했다.
  4. `prefers-reduced-motion: reduce`에서는 해당 애니메이션을 끈다.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260627z8-home-life-zone-motion`으로 갱신했다.
  6. 리뷰: `docs/ai/reviews/2026-06-27-home-life-zone-workout-animation-review.md`
  7. PASS: `node --check home/life-zone.js; node --check sw.js`
  8. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js` — 19 tests passed
  9. PASS: `node --test tests/*.test.js` — 552 tests passed
  10. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=834`
  11. PASS: `git diff --check`
  12. 회귀 수정: `npc-quest-bubble.png`를 다시 렌더하되 `.lz-npc-bulb` crop으로 전구 말풍선만 보이게 했다.
  13. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260627z10-home-npc-bulb-restore`로 갱신하고 `npc-quest-bubble.png`를 `STATIC_ASSETS`에 복구했다.
  14. 회귀 수정: `.lz-npc-bulb` 표시 폭을 50%로 줄이고 트레이너 overlay를 머리 위 좌표로 올렸다.
  15. actor 이름표 y 계산을 스프라이트 하단 기준에서 `slot.y - 6` 머리 위 기준으로 바꿨다.
  16. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260627z13-home-overhead-labels`로 갱신했다.
  17. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js` — 19 tests passed
  18. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=835`
  19. WARN: `node --test tests/*.test.js` — 553 tests 중 552 pass, `tests/workout-picker-gym-rail.test.js` 1건 fail. 이번 홈 라이프존 변경 범위와 무관하다.
  20. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ <commit>` — deployed `tomatofarm-v20260627z13-home-overhead-labels`
  21. PASS: deployed markers — `Math.max(24, Number(slot.y) - 6)`, `top: calc(850 / 1672 * 100%)`, `width: 50%`, `transform: translate(-50%, -100%)`, `.lz-npc-bulb`
  22. not verified yet: 인증 세션이 없어 실제 홈 탭 라이프존 UI flow는 직접 조작 미완료
  23. 진행 중: 트레이너 overlay를 `top: calc(760 / 1672 * 100%)`로 올리고, 랫풀다운은 actor 래퍼의 `::after` 클립 레이어에만 `lz-workout-lat-pull`을 적용했다.
  24. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260627z14-home-trainer-lat-motion`으로 갱신했다.
  25. PASS: `node --check home/life-zone.js; node --check sw.js`
  26. PASS: `node --test tests/home-life-zone-npc-quest.test.js tests/home-life-zone-state.test.js` — 19 tests passed
  27. PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=835`
  28. PASS: `git diff --check`
  29. WARN: `node --test tests/*.test.js` — 553 tests 중 552 pass, `tests/workout-picker-gym-rail.test.js` 1건 fail. 이번 홈 라이프존 변경 범위와 무관하다.
  30. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 2094a548e1ab4e9d3b3d3f55889a63bdfc7ad9db` — deployed `tomatofarm-v20260627z14-home-trainer-lat-motion`
  31. PASS: deployed markers — `actorElement.style.setProperty('--lz-sprite-url'`, `top: calc(760 / 1672 * 100%)`, `.lz-actor--pose-workout-lat::after`, `clip-path: inset(25% 4% 38% 14%)`, `background-image: var(--lz-sprite-url)`, `translate(-1.2%, 2.8%)`
  32. not verified yet: 인증 세션이 없어 실제 홈 탭 라이프존 UI flow는 직접 조작 미완료

## 이번 실행 검증

- 계획 완료: `docs/ai/features/2026-06-24-workout-calendar-bottom-sheet.md` Slice 14
- 구현 완료: `render-calendar.js` suppression guard/toggle aria sync, `sw.js` cache marker
- 리뷰 완료: `docs/ai/reviews/2026-06-27-workout-calendar-sheet-suppress-guard-review.md`
- PASS: `node --check render-calendar.js; node --check sw.js`
- PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js` — 19 tests passed
- PASS: `$tests = rg --files tests | Where-Object { $_ -match '\.test\.js$' }; node --test @tests` — 552 tests passed
- PASS: `node scripts/verify-runtime-assets.mjs` — `[runtime-assets] ok refs=835`
- PASS: `git diff --check`
- PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 1a46c473abc3b3b7a55ae76611dfe682a3494548`
  - 결과: `[deploy-verify] ok 1a46c473abc3 tomatofarm-v20260627z5-sheet-suppress-guard static=219`
- PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/dashboard3/ "sw.js::tomatofarm-v20260627z5-sheet-suppress-guard" "render-calendar.js::WORKOUT_HOME_SHEET_MIN_SUPPRESS_MOVE_PX = 4" "render-calendar.js::if (targetState !== prevState) _suppressWorkoutHomeSheetClick()" "render-calendar.js::querySelectorAll('[data-wt-sheet-toggle]')" "render-calendar.js::data-wt-sheet-main data-wt-sheet-toggle"`
- not verified yet: 인증 계정 실제 바텀시트 터치 UI flow는 직접 확인 필요

## 리뷰 대상

- `docs/ai/features/2026-06-27-wendler-program-ssot-diagnosis.md`
- Firestore `users/김_태우/settings/test_board_v2` read-only 결과
- read-only 후보 patch 기록

## 직전 실행 검증

- PASS: `node --check workout/exercises.js; node --check sw.js`
- PASS: `node --test tests/exercise-program-editor.test.js` — 3 tests passed
- PASS: `node --test .\tests\*.test.js` — 528 tests passed
- PASS: `node scripts/verify-runtime-assets.mjs`
- PASS: `git diff --check`
- PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 66bf22b`
  - 결과: `[deploy-verify] ok 66bf22bb1564 tomatofarm-v20260625z66-wendler-calendar-density static=218`
- PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/dashboard3/ "sw.js::tomatofarm-v20260625z66-wendler-calendar-density" "workout/exercises.js::ex-program-calendar-row" "style.css::position: static" "style.css::min-height: 24px"`
- not verified yet: 인증 계정이 없어 `운동 탭 -> 종목 수정 -> 웬들러 -> 시작 주 캘린더 선택 -> 저장` 실제 UI flow는 직접 저장 확인 미완료

## 현재 실행 검증

- PASS: `node --check workout/exercises.js; node --check sw.js`
- PASS: `node --test tests/workout-test-mode-unified.test.js tests/test-v2.board-core.test.js` — 43 tests passed
- PASS: `node --test .\tests\*.test.js` — 531 tests passed
- PASS: `node scripts/verify-runtime-assets.mjs`
- PASS: `git diff --check`
- PASS: `docs/ai/reviews/2026-06-26-exercise-program-wendler-recommendation-priority-review.md`
- PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 36be474`
  - 결과: `[deploy-verify] ok 36be47482068 tomatofarm-v20260626z4-wendler-recommendation-priority static=218`
- PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/dashboard3/ "sw.js::tomatofarm-v20260626z4-wendler-recommendation-priority" "workout/exercises.js::const programEntry = _buildProgramPickerExerciseEntry(ex)" "workout/exercises.js::buildMaxPickerExerciseEntry({"`
- not verified yet: 인증 계정이 없어 실제 모바일 UI에서 `추천 종목 · 선택 헬스장 -> 웬들러 설정 종목 추가` 클릭 플로우는 직접 확인 필요

## 완료한 작업

- 계획 파일: `docs/ai/features/2026-06-25-life-zone-npc-quest-bubble.md`
- 변경 파일:
  1. `assets/home/life-zone/ui/npc-quest-bubble.png`
  2. `home/life-zone.js`
  3. `style.css`
  4. `sw.js`
  5. `scripts/validate-life-zone-assets.py`
  6. `tests/home-life-zone-npc-quest.test.js`
  7. `docs/ai/features/2026-06-25-life-zone-npc-quest-bubble.md`
  8. `docs/ai/reviews/2026-06-25-life-zone-npc-quest-bubble-review.md`

- 실행 검증:
  1. PASS: `python scripts/validate-life-zone-assets.py`
  2. PASS: `node --check home/life-zone.js; node --check sw.js`
  3. PASS: `node --test tests/home-life-zone-npc-quest.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `node --test .\tests\*.test.js` — 518 tests passed
  6. PASS: `git diff --check`
  7. 리뷰: `docs/ai/reviews/2026-06-25-life-zone-npc-quest-bubble-review.md`
  8. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ bb8bf7e`
  9. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/dashboard3/ "sw.js::tomatofarm-v20260625z59-life-zone-npc-quest" "home/life-zone.js::npc-quest-bubble.png" "home/life-zone.js::life-zone:npc-quest" "sw.js::assets/home/life-zone/ui/npc-quest-bubble.png"`
  10. PASS: 배포 URL의 `assets/home/life-zone/ui/npc-quest-bubble.png`가 HTTP 200, `192x258`, RGBA alpha `(0, 255)`, corner alpha 0으로 내려오며 로컬 파일과 SHA-256이 일치

## 이전 완료 흐름

- 계획 파일: `docs/ai/features/2026-06-25-workout-calendar-add-fab-click-fix.md`
- 변경 파일:
  1. `render-calendar.js`
  2. `style.css`
  3. `sw.js`
  4. `tests/workout-calendar-bottom-sheet.test.js`
  5. `tests/workout-empty-picker-density.test.js`
  6. cache version 참조 테스트들
  7. `docs/ai/features/2026-06-25-workout-calendar-add-fab-click-fix.md`
  8. `docs/ai/NEXT_ACTION.md`

- 실행 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-navigation-stack.test.js`
  3. PASS: `node --test .\tests\*.test.js` — 515 tests passed
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ e119fca1e0398b56406dcaa729cc7c37469cd861`
  7. PASS: 배포 자산 마커에서 z58 cache, `_bindWorkoutHomeSheetActions`, `data-wt-day-add-session`, `_addWorkoutHomeSession(key)`, `touch-action: manipulation` 확인
  8. not verified yet: 인증 계정 실제 UI flow 확인 필요

## 이전 실행 기록

- 계획 파일: `docs/ai/features/2026-06-24-workout-calendar-bottom-sheet.md`
- 완료한 Slice 12:
  1. `render-calendar.js`에서 full sheet scroll lock과 sheet body touch boundary guard를 추가한다.
  2. full 상태의 아래 방향 drag release가 항상 `bar` 끝점으로 정착하도록 닫힘 latch를 강화한다.
  3. `style.css`에 full sheet scroll-lock과 내부 scroller momentum 정책을 추가한다.
  4. `tests/workout-calendar-bottom-sheet.test.js`에 scroll ownership/source contract 테스트를 추가한다.
  5. `sw.js` `CACHE_VERSION`을 bump한다.

- Slice 12 검증:
  1. PASS: `node --check app.js; node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-navigation-stack.test.js`
  3. PASS: 영향권 테스트 38개
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: 전체 Node 테스트 514개
  6. PASS: `git diff --check`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ d23ca4cd775936b4acdb53d662d7c71c8d22b8c2`
  8. PASS: 배포 asset marker에 `wt-workout-sheet-scroll-lock`, `WORKOUT_HOME_SHEET_DRAG_HARD_CLOSE_PX = 8`, `_bindWorkoutHomeSheetScrollGuard`, `[data-wt-day-sheet]`, z57 cache marker 반영
  9. not verified yet: 인증 계정 실제 UI flow 확인 필요

- Slice 12 리뷰:
  - `docs/ai/reviews/2026-06-25-workout-calendar-sheet-scroll-lock-review.md`

- 완료한 Slice 11:
  1. 운동탭 활성 상태에만 `body.wt-workout-tab-active` class 적용.
  2. 운동탭 활성 상태에서 root overscroll/pull-to-refresh 체인 차단.
  3. 최상단 아래 방향 touch gesture를 `handleWorkoutBack({ action: 'pull:back' })` 경로로 흡수.
  4. nested scroll 영역이 아직 위로 스크롤될 수 있으면 gesture를 가로채지 않도록 조건 추가.
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260625z56-workout-pull-back`로 bump.
  6. 진단/리뷰 문서 작성.

- 검증:
  1. PASS: `node --check app.js; node --check sw.js`
  2. PASS: `node --test tests/workout-navigation-stack.test.js tests/workout-calendar-bottom-sheet.test.js`
  3. PASS: `node --test .\tests\*.test.js` — 513 tests passed
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ a8461e8`
  7. PASS: 배포 URL asset marker에서 z56 cache, `initWorkoutPullBackGesture`, `action: 'pull:back'`, `body.wt-workout-tab-active` 확인

## 직전 완료 흐름

- 계획 파일: `docs/ai/features/2026-06-25-workout-navigation-stack-redesign.md`
- 완료한 Slice 1-6:
  1. `workout/navigation-stack.js` 추가: `CalendarScreen`, `WorkoutRecordScreen`, `WorkoutDetailScreen` route stack, saved state, PWA history snapshot.
  2. `render-calendar.js` 바텀시트 상태를 navigation state와 동기화하고 record 진입을 `wtOpenWorkoutRecord()`로 교체.
  3. `app.js` 운동 탭 surface를 `calendar/record/detail`로 확장하고 record/detail 상태 보존 렌더 연결.
  4. `workout/exercises.js` detail screen 렌더와 운동 카드 detail 진입 추가.
  5. Capacitor `backButton` hook과 browser `popstate` 기반 PWA back 복원 추가.
  6. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260625z44-workout-nav-stack`로 bump하고 새 runtime asset을 precache에 추가.

- 검증:
  1. PASS: `node --check app.js render-calendar.js workout/navigation-stack.js workout/exercises.js workout/index.js`
  2. PASS: `node --check workout/load.js; node --check render-workout.js; node --check sw.js`
  3. PASS: `node --test .\tests\*.test.js` — 512 tests passed
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ ad707121d63019be2f2f5bae181c89ce53fbd460`
     - 결과: `[deploy-verify] ok ad707121d630 tomatofarm-v20260625z44-workout-nav-stack static=215`
  7. PASS: `npm.cmd run verify:deployed-markers -- https://aretenald2018-sys.github.io/dashboard3/ "workout/navigation-stack.js::WORKOUT_ROUTES" "app.js::enableWorkoutPwaHistory" "render-calendar.js::wtOpenWorkoutRecord" "index.html::wt-exercise-detail-root" "sw.js::tomatofarm-v20260625z44-workout-nav-stack"`

- 리뷰:
  - `docs/ai/reviews/2026-06-25-workout-navigation-stack-redesign-review.md`

- 남은 수동 확인:
  1. 배포 URL에서 인증 계정으로 `운동 탭 -> 날짜 클릭 -> BottomSheet -> 운동 진입 -> 운동 상세 -> Android/PWA back 순서` 확인.

## 이전 실행 기록

- 계획 파일: `docs/ai/features/2026-06-24-workout-calendar-bottom-sheet.md`
- 완료한 Slice 1:
  1. 운동 홈 월간 렌더에서 기존 `.cal-workout-day-bar`를 헤더로 쓰는 `.cal-workout-day-sheet` 렌더
  2. 날짜 클릭/오늘 상세/닫기 상태 전환을 하단 시트 기준으로 정리
  3. 날짜 클릭 시 `bar -> full`로 올라오는 애니메이션 적용
  4. 시트 handle pointer drag로 `bar`/`mid`/`full` 상태 전환 구현
  5. sheet 내부 상세 본문과 회차/session action bar CSS 조정
  6. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 1 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 3d76b141d0a47b4d60af24e5fc07e147269808f9`
  7. PASS: 배포 URL 브라우저 접근 시 최신 앱이 열리고 로그인 화면이 표시되는 것을 확인
  8. not verified yet: 로그인 화면에 막혀 인증 계정의 `운동 탭 -> 날짜 탭 -> 하단 시트 표시 -> handle 위/아래 드래그 -> + 버튼` UI flow 직접 조작은 미완료

- 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-review.md`

- 완료한 Slice 2:
  1. 접힌 sheet 높이를 절반 수준으로 줄이고 한 행 compact bar로 조정
  2. 좌측 위 화살표에 glow/pulse affordance 추가
  3. 날짜/화살표 영역 drag hit area 허용, `오늘`/`루틴` action만 drag 제외
  4. drag 후 click이 상태를 되돌리지 않도록 suppress guard 추가
  5. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 2 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 0f061f103c69150688c80e284ce5b53ae54c601a`
  7. not verified yet: 인증 계정 실제 drag UI flow 확인 필요

- Slice 2 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-compact-review.md`

- 다음 Slice 3:
  1. 위 방향 drag/key step을 거리와 무관하게 `full`로 정착
  2. 아래 방향 drag/key step은 `bar`로 접기
  3. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신
  4. 정적 검증, 리뷰, Dashboard3 Pages 배포 검증

- Slice 3 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-full-open-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ a65721dbb3e6423206d505118ead185c7c6f2926`
  8. PASS: 배포 URL HTTP 200, `sw.js` cache version `tomatofarm-v20260624z37-workout-day-sheet-full-open`, `render-calendar.js` full 전이/`12px` threshold 확인
  9. not verified yet: 로그인 화면에 막혀 인증 계정 실제 drag UI flow 확인 필요

- Slice 3 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-full-open-review.md`

- 다음 Slice 4:
  1. 드래그 후 click suppression을 1회성 boolean에서 timestamp window 방식으로 변경
  2. suppression window 동안 여러 지연 click을 모두 무시
  3. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신
  4. 정적 검증, 리뷰, Dashboard3 Pages 배포 검증

- Slice 4 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-drag-lock-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 684c6fc2025dbf20f3be4c52ab14b41cc6528831`
  8. not verified yet: 로그인 화면에 막혀 인증 계정 실제 drag UI flow 확인 필요

- Slice 4 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-drag-lock-review.md`

- 다음 Slice 5:
  1. drag release target을 거리/속도 기반 snap resolver로 결정
  2. `bar`에서 위 방향은 쉽게 열고, `full`에서 아래 방향은 의도적 제스처에서만 접기
  3. 열린 상태의 동일 날짜 탭 no-op 처리
  4. sheet grip affordance와 열린 상태 arrow pulse 정리
  5. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 5 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-snap-ux-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ b872a13e4f24c3460df45e1ef01e553728602709`
  8. not verified yet: 로그인 화면에 막혀 인증 계정 실제 drag UI flow 확인 필요

- Slice 5 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-snap-ux-review.md`

- 다음 Slice 6:
  1. `bar` 상태에서 drag 가능한 전체 확장 거리의 10% threshold 계산
  2. 위로 10%를 넘으면 drag preview를 즉시 full 높이로 표시
  3. release snap도 동일한 10% 기준으로 full 선택
  4. 아래 방향 속도만으로 닫히지 않도록 collapse는 `max(220px, dragTravel * 0.35)` 거리 기준으로 제한
  5. 작은 pointer move 뒤 release가 snap 기준 미만이어도 후속 click이 header toggle로 오인되지 않게 suppress
  6. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 6 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-open-10pct-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ d6606731f076a0ba8540c6b2b82d6f570e2417f0`
  8. PASS: 배포 URL의 `build-info.json`, `sw.js`, `render-calendar.js`가 `d6606731f076`, z40 cache, 10% open ratio, `hasMoved` click suppression, velocity-close 제거를 반환
  9. not verified yet: 로그인 화면에 막혀 인증 계정 실제 drag UI flow 확인 필요

- Slice 6 리뷰:
  - `docs/ai/reviews/2026-06-24-workout-calendar-bottom-sheet-open-10pct-review.md`

- 다음 Slice 7:
  1. open threshold를 full 확장 거리 기준에서 접힌 bar 높이 기준 10%로 변경
  2. `bar`에서 위 방향 drag가 threshold를 넘으면 `openLatched` 고정
  3. release snap에서 `openLatched`가 true면 무조건 `full` 선택
  4. `full` 시작 drag는 latch하지 않아 큰 아래 drag로 닫기 유지
  5. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 7 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-open-latch-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ bda8fd26b49e731fc43807844b737ed155fa7ed6`
  8. PASS: 배포 URL의 `build-info.json`, `sw.js`, `render-calendar.js`가 `bda8fd26b49e`, z41 cache, bar-height 10% open threshold, `openLatched`, velocity-close 제거를 반환
  9. not verified yet: 로그인 화면에 막혀 인증 계정 실제 drag UI flow 확인 필요

- Slice 7 리뷰:
  - `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-open-latch-review.md`

- 다음 Slice 8:
  1. full sheet 높이에 상단 clearance를 적용해 날짜/오늘/루틴 헤더가 앱 상단 아래로 드러나게 변경
  2. 열린 상태 화살표를 파란 아래 방향 affordance로 변경
  3. 하단 회차 bar의 연필 편집 버튼 제거
  4. `+` 운동 추가 버튼을 우측 하단 floating button으로 복구
  5. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 8 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-fab-reveal-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 1fca224816f59b9bce1257bcf2c652d4dd065fcd`
  8. PASS: 배포 URL의 `render-calendar.js`, `style.css`, `sw.js`가 `wt-day-fab`, `WORKOUT_HOME_SHEET_FULL_CLEARANCE_PX`, `--wt-day-sheet-full-clearance: 112px`, `wt-sheet-arrow-pulse-down`, z42 cache marker를 반환
  9. not verified yet: 로그인 화면에 막혀 인증 계정 실제 `운동 탭 -> 날짜 sheet full/open-close/add` UI flow 확인 필요

- Slice 8 리뷰:
  - `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-fab-reveal-review.md`

- 다음 Slice 9:
  1. drag release snap을 raw pointer 좌표가 아니라 clamp된 preview 이동량 기준으로 변경
  2. full 시작 아래 방향 drag에 `closeLatched` 추가
  3. close threshold를 handle drag에 맞는 작은 거리로 조정
  4. 회귀 테스트와 `sw.js` `CACHE_VERSION` 갱신

- Slice 9 검증:
  1. PASS: `node --check render-calendar.js; node --check sw.js`
  2. PASS: `node --test tests/workout-calendar-bottom-sheet.test.js tests/workout-empty-picker-density.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node --test tests/workout-active-session-recovery.test.js tests/workout-test-mode-unified.test.js tests/workout-timer-summary-only.test.js tests/workout-track-graph-delta.test.js tests/stats-picker-ui-polish.test.js tests/stats-muscle-fatigue-insight.test.js`
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-drag-settle-review.md`
  7. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ da94c74f943735f54c04ef74199da060c3939c26`
  8. PASS: 배포 URL의 `render-calendar.js`, `sw.js`가 `closeLatched`, `lastDragY`, `const dy = lastDragY`, z43 cache marker를 반환
  9. not verified yet: 로그인 화면에 막혀 인증 계정 실제 `운동 탭 -> 날짜 sheet drag up/down settle` UI flow 확인 필요

- Slice 9 리뷰:
  - `docs/ai/reviews/2026-06-25-workout-calendar-bottom-sheet-drag-settle-review.md`

- 이전 계획 파일: `docs/ai/features/2026-06-24-exercise-picker-category-entry.md`
- 완료한 Slice 4:
  1. picker 목록 상태에서 상단 탭을 `분류 + 부위 탭` 구조로 동적 렌더링
  2. 목록 내부 `필터 적용` 배너와 부위/헬스장 필터 스택 제거
  3. 목록 상단에 `최근`/`빈도`/`이름` 정렬과 `전체`/`즐겨찾기`/`커스텀` 범위 컨트롤 추가
  4. 캐시 기반 `총 n번, n일 전` 메타와 정렬 통계 추가
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260624z16-picker-filter-layout`로 bump

- 검증:
  1. PASS: `node --check modals/ex-picker-modal.js; node --check workout/exercises.js; node --check sw.js`
  2. PASS: `node scripts/verify-runtime-assets.mjs`
  3. PASS: `git diff --check`
  4. PASS: `docs/ai/reviews/2026-06-24-exercise-picker-filter-layout-review.md`
  5. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 9594418`
  6. not verified yet: 로그인 화면에 막혀 운동 picker 필터 UI 클릭 흐름은 인증 계정으로 확인 필요

- 완료한 Slice 5:
  1. `style.css`에서 오늘 운동 카드 헤더가 줄바꿈 가능한 레이아웃이 되도록 수정
  2. 운동명 최소 폭과 `word-break: keep-all` 적용
  3. 스파크라인을 헤더 다음 줄 전체 폭으로 이동
  4. `tests/workout-card-layout-css.test.js` 회귀 테스트 추가
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260624z17-workout-card-header`로 bump

- Slice 5 검증:
  1. PASS: `node --test tests/workout-card-layout-css.test.js`
  2. PASS: `node --check sw.js`
  3. PASS: `node scripts/verify-runtime-assets.mjs`
  4. PASS: `git diff --check`
  5. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ c682986`
  6. PASS: 배포 URL의 `style.css`에 카드 헤더 회귀 수정 CSS가 포함된 것을 확인
  7. not verified yet: 로그인 화면에 막혀 운동 추가 후 카드 UI 클릭 흐름은 인증 계정으로 확인 필요

- Slice 5 추가 하드닝:
  1. `workout/exercises.js` 일반 운동 카드 DOM에서 `${sparkline}`을 `ex-block-header` 밖으로 이동
  2. `style.css`에 `ex-block-trend` 행 스타일 추가
  3. `tests/workout-card-layout-css.test.js`에 DOM source check 추가
  4. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260624z18-workout-card-trend-row`로 bump
  5. PASS: `node --check workout/exercises.js; node --check sw.js; node --test tests/workout-card-layout-css.test.js`
  6. PASS: `node scripts/verify-runtime-assets.mjs`
  7. PASS: `git diff --check`
  8. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ f44e832`
  9. PASS: 배포 URL의 `workout/exercises.js`, `style.css`, `sw.js`에 DOM 분리와 z18 캐시 버전 반영 확인

- 완료한 Slice 6:
  1. `modals/ex-picker-modal.js`에 picker footer와 `#ex-picker-done` 추가
  2. `workout/exercises.js` row 선택 handler에서 즉시 닫기 제거
  3. 선택된 row는 `already`/`✓`로 표시하고 완료 버튼 활성화
  4. `tests/ex-picker-selection-flow.test.js` 추가
  5. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260624z19-picker-staged-done`으로 bump

- Slice 6 검증:
  1. PASS: `node --check modals/ex-picker-modal.js; node --check workout/exercises.js; node --check sw.js`
  2. PASS: `node --test tests/ex-picker-selection-flow.test.js tests/workout-card-layout-css.test.js`
  3. PASS: `node scripts/verify-runtime-assets.mjs`
  4. PASS: `git diff --check`
  5. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 3de3708`
  6. PASS: 배포 URL의 `modals/ex-picker-modal.js`, `workout/exercises.js`, `sw.js`에 `ex-picker-done`, `_syncPickerDoneButton`, `tomatofarm-v20260624z19-picker-staged-done` 반영 확인
  7. not verified yet: 배포 브라우저는 로그인 화면에 막혀 `운동 탭 -> + -> 가슴 -> row tap -> picker 유지 -> 완료` UI 클릭 흐름은 인증 계정으로 확인 필요
- 완료한 Slice 3:
  1. `assets/workout/muscles/*.png` 8개를 `384x288` RGBA 투명 PNG로 교체
  2. 기존 파일명/경로 유지
  3. `sw.js` `CACHE_VERSION`을 `tomatofarm-v20260624z15-sharp-muscle-assets`로 bump
  4. `docs/ai/reviews/2026-06-24-exercise-picker-assets-sharp-review.md` 작성

- 검증:
  1. PASS: PNG 8개 크기 `384x288`, 모드 `RGBA`, 모서리 alpha 0 확인
  2. PASS: `node --check sw.js`
  3. PASS: `node scripts/verify-runtime-assets.mjs`
  4. PASS: `git diff --check`
  5. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ 562a572`
  6. PASS: 배포 URL의 `assets/workout/muscles/*.png` 8개가 모두 `384x288` RGBA 파일로 내려오는 것을 확인
  7. not verified yet: 로그인 화면에 막혀 운동 picker 분류 화면의 시각 상태는 인증 계정으로 확인 필요

- 이전 완료 흐름:
  - 계획 파일: `docs/ai/features/2026-06-23-stats-muscle-fatigue-render.md`
- 완료한 Slice 2:
  1. `render-stats.js` 근육 활성 기간을 `주별`/`월별`로 제한
  2. 활성 부위만 렌더링하고, 다색 그룹 색상 대신 붉은색 단일 intensity 값 적용
  3. `style.css` 근육 활성 카드 레이아웃/텍스트 가시성 복구
  4. `sw.js` `CACHE_VERSION` bump
  5. `workoutSessions` 기반 다회차 운동 기록도 근육 활성 계산에 반영
  6. 정적 검증 및 리뷰 완료

- 검증:
  1. PASS: `node --check render-stats.js`
  2. PASS: `node --check sw.js`
  3. PASS: red-only source check — `render-stats.js`에 이전 다색 hex 및 `일별` 출력 없음
  4. PASS: `node scripts/verify-runtime-assets.mjs`
  5. PASS: `git diff --check`
  6. PASS: `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ e2f2a99`
  7. PASS: 배포된 `render-stats.js`에 `getWorkoutSessions`, red tint, 활성 부위 빈 상태 문구가 있고 `label: '일별'`은 없음
  8. not verified yet: 로그인 화면에 막혀 더보기 → 통계 → 운동 활성 부위 카드 UI 클릭 흐름은 인증 계정으로 확인 필요

- 함께 배포된 이전 Slice:
  1. `docs/ai/features/2026-06-24-exercise-picker-category-entry.md` Slice 2 우하단 `+` 직접 picker 진입
  2. 첨부 이미지 기반 `assets/workout/muscles/*.png` 추가
  3. picker 분류 타일 이미지 자산 적용 및 `sw.js` `CACHE_VERSION` bump

- 완료한 Slice 1:
  1. `modals/ex-picker-modal.js` 상단 구조를 전체 화면형 검색/탭/추가 버튼 레이아웃으로 변경
  2. `workout/exercises.js`에 picker view 상태, 분류 화면, 부위 타일 drilldown, 전체/커스텀 목록 전환 추가
  3. `style.css`에 전체 화면 picker, 탭, 부위 그리드, 모바일 레이아웃 스타일 추가
  4. `sw.js` `CACHE_VERSION` bump

- 검증:
  1. PASS: `node --check modals/ex-picker-modal.js; node --check workout/exercises.js; node --check sw.js`
  2. PASS: `node scripts/verify-runtime-assets.mjs`
  3. PASS: `git diff --check`
  4. PASS: `docs/ai/reviews/2026-06-24-exercise-picker-category-entry-review.md`
  5. not verified yet: Dashboard3 배포 후 `npm.cmd run verify:deploy -- https://aretenald2018-sys.github.io/dashboard3/ <commit>` 필요
  6. not verified yet: 운동 탭 → 오늘 운동 화면 → 우측 하단 `+` → 분류 첫 화면 → 부위 타일 선택 → 해당 부위 운동 목록 → 운동 추가 UI flow는 배포 URL에서 확인 필요

## 이전 흐름 요약

- 이전 홈 라이프존 Slice 9:
  1. `home/life-zone-state.js`에 actor owner id 후보와 `readAccountId` 추가
  2. `home/life-zone.js`에서 이웃 actor의 오늘 문서를 owner id 후보로 읽도록 보정
  3. 방금 입력한 기록이 바로 반영되도록 라이프존 actor 상태 캐시 비활성화
  4. `tests/home-life-zone-state.test.js`에 줍스 식단-only 상태 회귀 테스트 추가
  5. `sw.js` `CACHE_VERSION` bump
  6. `docs/ai/reviews/2026-06-23-home-life-zone-diet-read-review.md` 작성

- 방금 완료한 Slice 8:
  1. `home/life-zone-state.js`에서 `workoutDuration > 0`을 운동 활동으로 판정
  2. `tests/home-life-zone-state.test.js`에 운동 시간만 입력된 날의 라이프존 회귀 테스트 추가
  3. `sw.js` `CACHE_VERSION` bump
  4. `docs/ai/reviews/2026-06-23-home-life-zone-duration-review.md` 작성

- 방금 완료한 Slice 7:
  1. `style.css` `.lz-speech` 배경을 반투명 흰색으로 변경
  2. `style.css` `.lz-speech`에 `backdrop-filter` 추가
  3. `sw.js` `CACHE_VERSION` bump

- 방금 완료한 Slice 6:
  1. `home/life-zone-state.js`에 운동/식단/업무 말풍선 문구 생성 로직 추가
  2. `home/life-zone.js`에서 actor sprite 위 말풍선 렌더링 추가
  3. `style.css`에 `.lz-speech` 스타일 추가
  4. `tests/home-life-zone-state.test.js`에 대근육/식단 말풍선 테스트 추가
  5. `sw.js` `CACHE_VERSION` bump
  6. `docs/ai/reviews/2026-06-23-home-life-zone-speech-review.md` 작성

- 방금 완료한 Slice 5:
  1. `scripts/make-life-zone-base-alpha.py`에서 anti-aliased outline 생성으로 변경
  2. `assets/home/life-zone/base-room-alpha.png` 재생성
  3. `style.css` `.lz-base`를 `image-rendering:auto`로 변경
  4. `docs/pixel-life-zone-mockup.html` base preview 렌더링 변경
  5. `scripts/validate-life-zone-assets.py` outline 검증 기준 변경
  6. `sw.js` `CACHE_VERSION` bump
  7. `docs/ai/reviews/2026-06-23-home-life-zone-soft-border-review.md` 작성

- 방금 완료한 Slice 3:
  1. `home/hero.js`에서 랭킹 렌더링 대상을 상위 5명으로 제한
  2. `sw.js` `CACHE_VERSION` bump
  3. `docs/ai/reviews/2026-06-23-home-ranking-top5-review.md` 작성

- 방금 완료한 Slice 2:
  1. `home/hero.js`에서 랭킹 참가자 소스를 전체 계정으로 변경
  2. 누적/주간 모두 전체 계정의 기록을 읽어 계산
  3. `sw.js` `CACHE_VERSION` bump
  4. `docs/ai/reviews/2026-06-23-home-ranking-all-accounts-review.md` 작성

- 방금 완료한 Slice:
  1. `index.html`에서 함께 축하해요 카드와 길드 카드를 제거하고 랭킹 UI를 `랭킹`/`누적·주간`으로 변경
  2. `home/index.js`에서 공용 축하 카드와 홈 길드 카드 렌더 호출 제거
  3. `home/hero.js`에서 랭킹 상태를 `cumulative/weekly`로 전환하고 선택값 저장
  4. `sw.js` `CACHE_VERSION` bump
  5. `docs/ai/reviews/2026-06-23-home-ranking-cleanup-review.md` 작성

## 이전 완료 항목

- 계획 파일: `docs/ai/features/2026-06-23-home-life-zone-card.md`
- 방금 완료한 Slice 0:
  1. `assets/home/life-zone/base-room.png`
  2. `assets/home/life-zone/sprites/*.png` 27개
  3. `assets/home/life-zone/manifest.json`
  4. `scripts/process-life-zone-sprites.py`
  5. `docs/pixel-life-zone-mockup.html`
- 방금 완료한 Slice 1:
  1. `home/life-zone-state.js`
  2. `home/life-zone.js`
  3. `home/tomato.js`
  4. `style.css`
  5. `sw.js`
  6. `tests/home-life-zone-state.test.js`
  7. `assets/home/life-zone/base-room-alpha.png`
  8. `scripts/make-life-zone-base-alpha.py`
- 다음 실행 후보:
  1. 계정 id 고정 매핑: `줍스`, `문정토마토`, `이재헌`의 실제 account id를 roster에 반영
  2. Slice 4: 저장 시점 activity snapshot으로 "방금 올림/방금 운동함" 최근성 반영
  3. 운동 모션 실험: lat pulldown 2프레임 sprite를 만들고 낮은 비용의 frame animation으로 검증

## 보류 중 (이전 흐름)

- `docs/ai/features/2026-06-23-pixel-life-zone-mockup.md` — bitmap 생성/정적 검증 완료, HTTP/UI 시각 검증은 not verified yet.
- `docs/ai/features/2026-06-12-test-mode-simplify-wendler.md` — v1 개편 실행 완료(커밋 2922b64까지), 리뷰 미수행. **v2 구현으로 v1은 동결 상태** — 해당 리뷰는 폐기 권장.
- `docs/ai/features/2026-06-20-calendar-workout-tab.md` — Slice 1 구현, 리뷰, tomatofarm 원격 배포 완료. 후속 Slice 2는 로컬 정적 검증 완료, 브라우저 UI 플로우는 not verified yet.
- `docs/ai/features/2026-06-20-growth-board-wendler-default-history.md` — 로컬 정적 검증 완료, 브라우저 UI 플로우는 not verified yet.

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 "계속", "다음", "진행", "리뷰해", "해줘"처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다. 단, 기존 대기 액션과 충돌하면 어느 흐름을 계속할지 한 번만 확인한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다. 필요한 프롬프트 내용은 계획 문서와 이 파일에 남기고 에이전트가 직접 읽어 진행한다.

# 2026-07-20 Shared Development Environment

- 상태: `ready_for_review`
- 계획: `docs/ai/features/2026-07-20-shared-development-environment.md`
- 목표: 메인 컴퓨터·서브 컴퓨터·Claude/Codex가 `origin/main`을 공통 기준점으로 사용하도록 동기화 명령, 검사, 문서를 추가한다.
- 다음 단계: 변경 파일과 안전장치를 검토하고 task commit 후 통합한다.
