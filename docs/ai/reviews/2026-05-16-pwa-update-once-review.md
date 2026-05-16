# PWA 업데이트 안내 중복 차단 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-05-16-max-picker-pwa-update-regression.md`
- 슬라이스: `Slice 1: PWA 업데이트 안내 중복 차단`
- 변경 파일: `pwa-register.js`, `utils/build-info.js`, `app.js`, `index.html`, `sw.js`

## Findings

- 발견된 차단 이슈 없음.

## 확인한 사항

- `pwa-register.js`는 `registration.waiting` 초기 확인과 `updatefound -> installed` 이벤트가 같은 worker를 가리켜도 update key 기준으로 한 번만 배너를 요청한다.
- `window.__showAppUpdateBanner`가 아직 준비되지 않은 경우 `tomato-app-ready` 또는 timeout에서 다시 시도하므로, 초기 로드 순서 때문에 안내가 유실될 가능성을 줄였다.
- `utils/build-info.js`는 모듈 로컬 가드와 `window.__tomatoUpdateBannerState` 전역 가드를 함께 써서 동일 페이지의 중복 DOM 생성을 막는다.
- 새로고침 클릭은 중복 실행을 막고, waiting worker가 있으면 `SKIP_WAITING` 후 `controllerchange`에서 한 번만 reload한다.
- `app.js`, `index.html`, `sw.js` 버전 갱신이 정적 자산 변경 규칙과 맞다.

## 검증

- `node --check pwa-register.js utils/build-info.js sw.js app.js` 통과.
- `git diff --check` 통과.
- 실제 PWA 업데이트 UI는 localhost에서 service worker가 해제되므로 아직 브라우저 실사용 플로우 검증은 남아 있다.
