# PWA 업데이트 안내 아이콘화 계획

## 요청 요약

- "새 버전이 준비됐어요" 새로고침 안내를 발행할 때마다 큰 토스트/배너처럼 띄우지 않는다.
- 사용자가 최신 업데이트가 있을 때만 우측 상단의 작은 아이콘에서 확인하고 새로고침할 수 있게 한다.
- 최종적으로 적용 가능한 최신 버전만 대상으로 삼는다.

## 그릴 결과

- 핵심 질문: 업데이트 안내를 즉시 큰 배너로 보여줄지, 작은 상태 아이콘으로 축소할지?
- 결정: 큰 하단 배너를 없애고 우측 상단 fixed 아이콘으로 축소한다. 아이콘을 누르면 작은 패널에서 "새 버전이 준비됐어요"와 새로고침 액션을 보여준다.
- 가정: "최종버전만"은 같은 페이지 세션에서 여러 update event가 들어와도 사용자에게 반복 안내하지 않고, 내부적으로 최신 `ServiceWorkerRegistration`만 보관해 사용자가 누른 시점의 최신 waiting worker를 새로고침한다는 뜻으로 처리한다.
- 남은 질문: 없음. 사용자가 명시한 방향만으로 구현 가능하다.

## 현재 코드 관찰

- `pwa-register.js`
  - `registration.waiting`과 `updatefound -> installed` 경로에서 `_requestAppUpdateBanner()`를 호출한다.
  - 현재 key는 scope/scriptURL 기반이라 같은 worker 안내 중복은 일부 막는다.
- `utils/build-info.js`
  - `showAppUpdateBanner()`가 `#app-update-banner`를 만들어 하단 fixed 배너를 띄운다.
  - `_reloadForAppUpdate()`는 waiting worker가 있으면 `SKIP_WAITING`을 보내고 `controllerchange` 또는 timeout에서 한 번만 reload한다.
- `style.css`
  - `.app-update-banner`가 하단 전체폭 배너로 정의되어 있다.
- `app.js`, `index.html`
  - `utils/build-info.js`와 `pwa-register.js`에 query version이 붙어 있다.
- `sw.js`
  - `utils/build-info.js`, `pwa-register.js`, `style.css`, `app.js`, `index.html` 변경 시 `STATIC_ASSETS` 규칙에 따라 `CACHE_VERSION` 범프가 필요하다.

## 실행 슬라이스

### Slice 1: 업데이트 안내를 최신 pending 아이콘으로 전환

목표:
- 기존 하단 `#app-update-banner` 대신 우측 상단 작은 `#app-update-indicator` 아이콘을 만든다.
- 반복 update event가 들어와도 DOM은 하나만 유지하고, 상태에는 최신 `registration`/`key`만 보관한다.
- 아이콘 클릭 시 작고 밀도 있는 패널을 열어 "새 버전이 준비됐어요"와 "새로고침" 버튼을 보여준다.
- 새로고침 클릭은 기존 `_reloadForAppUpdate()`의 중복 reload 방지 로직을 유지한다.

수정 대상:
- `utils/build-info.js`
  - `showAppUpdateBanner()`의 외부 API는 유지하되 내부 구현을 indicator/panel 방식으로 변경한다.
  - 전역 상태에 `latestRegistration`, `latestKey`, `panelOpen` 같은 값을 둔다.
  - 새 update가 들어오면 새 DOM을 추가하지 않고 최신 registration만 갱신한다.
- `pwa-register.js`
  - 필요하면 `_requestAppUpdateBanner()`의 key를 cache/build version 기반으로 더 안정화하거나, 최소한 최신 registration 전달만 보장한다.
- `style.css`
  - 우측 상단 작은 원형/스퀘어 아이콘 버튼과 패널 스타일을 추가한다.
  - 모바일 safe-area, z-index, 버튼 텍스트 줄바꿈/오버랩을 점검한다.
- `app.js`
  - `utils/build-info.js` query version 갱신.
- `index.html`
  - `pwa-register.js` 또는 `app.js` query version 갱신.
- `sw.js`
  - `CACHE_VERSION` 범프.

하지 말 것:
- `www/` 직접 수정 금지.
- 장기 실행 dev server를 Codex 세션에서 시작하지 않는다.
- 업데이트 감지 로직을 Firebase/FCM 서비스워커 범위와 섞지 않는다.
- 배포/push는 사용자가 명시하지 않는 한 하지 않는다.

검증:
- 정적 문법:
  - `node --check pwa-register.js utils/build-info.js sw.js app.js`
- 정적 자산 규칙:
  - `sw.js` `CACHE_VERSION`이 변경되었는지 확인한다.
  - `app.js`/`index.html` query version이 변경 대상과 맞는지 확인한다.
- UI 수동 검증:
  - 사용자 로컬 터미널에서 `cd "C:\Users\USER\Desktop\Tomato Project\tomatofarm(for lite version)"; npm.cmd run dev`
  - 로컬은 SW 등록이 스킵되므로 PWA update event 자체는 not verified yet일 수 있다.
  - 배포 환경 `/tomatofarm/`에서 기존 버전 탭을 열어둔 뒤 새 배포를 받으면 우측 상단 아이콘 하나만 표시되어야 한다.
  - 아이콘 클릭 시 작은 패널이 열리고, 새로고침 버튼 클릭 후 새 버전으로 reload되어야 한다.

## 다음 실행 지시

Read this plan and implement Slice 1 only. Convert the app update banner into a compact top-right update indicator that keeps only the latest pending service worker registration, do not edit `www/`, and bump `sw.js` `CACHE_VERSION` plus relevant query versions because static assets will change.

## 실행 기록

- Slice 1 완료: `utils/build-info.js`의 하단 업데이트 배너를 우측 상단 `#app-update-indicator` 아이콘과 작은 패널로 전환했다.
- Slice 1 완료: 반복 update event가 들어와도 DOM은 하나만 유지하고, `latestRegistration`/순번 기반 pending queue로 최신 service worker registration만 새로고침 대상에 남기도록 했다.
- Slice 1 완료: `style.css`에 compact indicator/panel 스타일을 추가하고 `app.js`, `index.html` query version 및 `sw.js` `CACHE_VERSION`을 갱신했다.
- Slice 1 검증: `node --check pwa-register.js; node --check utils/build-info.js; node --check sw.js; node --check app.js` 통과.
- Slice 1 not verified yet: 로컬 개발 환경은 service worker 등록이 스킵되므로 실제 PWA update event와 아이콘 클릭 reload flow는 배포 환경 `/tomatofarm/`에서 확인이 필요하다.
- 참고: 실행 종료 시점의 `docs/ai/NEXT_ACTION.md`는 다른 계획(`docs/ai/features/2026-05-17-max-picker-regular-catalog-ssot.md`)을 가리키고 있어 덮어쓰지 않았다.
