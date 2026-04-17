// ================================================================
// utils/haptics.js — Capacitor Haptics + Web Vibrate fallback
//   - light / medium / heavy / selection
//   - Capacitor 플러그인 감지 후 동적 로드 (네이티브 환경)
//   - 웹은 navigator.vibrate fallback
//   - _settings.haptics_enabled 로 on/off (기본 ON)
//
// 사용 예:
//   import { hapticLight, hapticMedium, hapticHeavy } from './utils/haptics.js';
//   await hapticMedium(); // 저장 성공
//   await hapticHeavy();  // 수확/레벨업
//   window.haptic?.light(); // 어디서든 호출 (전역)
// ================================================================

let _hapticsMod = null;          // Capacitor @capacitor/haptics 모듈 캐시
let _nativeChecked = false;
let _settingsEnabled = true;     // _settings.haptics_enabled 기본 true

const WEB_DURATIONS = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: 5,
};

function _isNative() {
  return !!(typeof window !== 'undefined'
    && window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());
}

async function _ensureNativeMod() {
  if (_nativeChecked) return _hapticsMod;
  _nativeChecked = true;
  if (!_isNative()) return null;
  try {
    _hapticsMod = await import('@capacitor/haptics');
  } catch (e) {
    console.warn('[haptics] Capacitor @capacitor/haptics 로드 실패 (플러그인 미설치?):', e?.message || e);
    _hapticsMod = null;
  }
  return _hapticsMod;
}

export function setHapticsEnabled(flag) {
  _settingsEnabled = !!flag;
}
export function isHapticsEnabled() {
  return _settingsEnabled;
}

async function _trigger(style) {
  if (!_settingsEnabled) return;
  // 1) Capacitor 네이티브
  if (_isNative()) {
    const mod = await _ensureNativeMod();
    if (mod?.Haptics) {
      try {
        if (style === 'selection') {
          await mod.Haptics.selectionStart();
          setTimeout(() => mod.Haptics.selectionEnd().catch(() => {}), 50);
        } else {
          // ImpactStyle: Heavy / Medium / Light
          const ImpactStyle = mod.ImpactStyle || { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };
          const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
          await mod.Haptics.impact({ style: map[style] || ImpactStyle.Light });
        }
        return;
      } catch (e) {
        console.warn('[haptics] native impact 실패:', e?.message || e);
      }
    }
  }
  // 2) 웹 vibrate fallback
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(WEB_DURATIONS[style] || 10);
    } catch {}
  }
  // 3) 둘 다 없으면 no-op
}

export const hapticLight     = () => _trigger('light');
export const hapticMedium    = () => _trigger('medium');
export const hapticHeavy     = () => _trigger('heavy');
export const hapticSelection = () => _trigger('selection');

// ── 전역 노출 ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.haptic = {
    light: hapticLight,
    medium: hapticMedium,
    heavy: hapticHeavy,
    selection: hapticSelection,
    setEnabled: setHapticsEnabled,
    isEnabled: isHapticsEnabled,
  };
}
