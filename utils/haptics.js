// ================================================================
// utils/haptics.js — 모바일 촉각 피드백 (짧은 진동)
// ================================================================
// Android Chrome/WebView의 navigator.vibrate만 사용한다. iOS Safari는
// 미지원이라 조용히 무시되고, WebView(APK)는 android.permission.VIBRATE가
// 매니페스트에 있어야 실제로 울린다. 약하게: 키 입력 8ms, 완료류 12ms.

export function hapticTick(durationMs = 8) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.max(1, Math.min(50, Math.floor(durationMs) || 8)));
    }
  } catch { /* 진동 미지원 환경 — 무시 */ }
}
