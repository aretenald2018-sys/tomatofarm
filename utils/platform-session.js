// 설치형 PWA와 Capacitor APK는 Chrome과 저장소(origin)가 다르다.
// 설치 앱에서만 개인 위젯의 공유 계정 세션을 복원할 수 있도록 플랫폼을 판별한다.

export function isInstalledAppSurface({
  capacitor = globalThis.Capacitor,
  matchMedia = globalThis.matchMedia,
  standalone = globalThis.navigator?.standalone,
} = {}) {
  if (capacitor?.isNativePlatform?.() === true) return true;
  if (standalone === true) return true;
  return matchMedia?.('(display-mode: standalone)')?.matches === true;
}
