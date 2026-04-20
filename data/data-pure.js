// ================================================================
// data/data-pure.js — Firebase 비의존 순수 함수/상수
// ================================================================
// 의도: data-core.js 는 Firebase HTTPS URL import 때문에 node:test 환경에서
//       로드할 수 없다. 사이드이펙트 없는 탭 정리/활성일 판정 로직을 여기로
//       빼면 단위 테스트 가능 (tests/data.load-save.test.js).
// data-core.js 와 data-load.js 가 이 모듈에서 import 한다.
// ================================================================

// ── Default tab order (live 탭만) ───────────────────────────────
export const DEFAULT_TAB_ORDER     = ['home','diet','workout','calendar','cooking','stats'];
export const DEFAULT_VISIBLE_TABS  = ['home','diet','workout','calendar'];

// ── Legacy tab sanitizer ────────────────────────────────────────
// 과거 경량화 이전에 저장된 tab_order/visible_tabs 에는 이미 UI 가 제거된
// 레거시 탭('monthly' 캘린더, 'finance', 'wine', 'movie', 'dev' 등)이
// 남아 있을 수 있음. 이 탭들이 남아 있으면 applyTabOrder/initSwipeNavigation 이
// 존재하지 않는 #tab-* 패널을 찾으려 하여 잠깐의 플래시/빈 렌더가 발생함.
// 알려진 live 탭만 필터링해 그 플래시를 차단한다.
const _LIVE_TABS = new Set(['home','diet','workout','cooking','stats','calendar','admin']);
// 하단 탭바 노출 순서는 항상 [home, diet, workout, calendar] 로 강제 (요구사항)
const _REQUIRED_PREFIX = ['home','diet','workout','calendar'];

export function _sanitizeTabList(list) {
  if (!Array.isArray(list)) return [...DEFAULT_TAB_ORDER];
  const cleaned = list.filter(t => _LIVE_TABS.has(t));
  if (!cleaned.length) return [...DEFAULT_TAB_ORDER];
  // 앞 4개가 required 순서가 아니면 DEFAULT 로 강제 복원
  const head = cleaned.slice(0, _REQUIRED_PREFIX.length).join(',');
  if (head !== _REQUIRED_PREFIX.join(',')) return [...DEFAULT_TAB_ORDER];
  return cleaned;
}

// ── isActiveWorkoutDayData — day 객체가 "기록 있음" 상태인지 pure 판정 ──
export function isActiveWorkoutDayData(workoutData) {
  if (!workoutData) return false;
  const w = workoutData;
  if ((w.exercises || []).length > 0) return true;
  if (w.cf || w.swimming || w.running || w.stretching) return true;
  if ((w.muscles || []).length > 0) return true;
  if ((w.workoutDuration || 0) > 0) return true;
  if ((w.runDistance || 0) > 0) return true;
  if ((w.runDurationMin || 0) > 0) return true;
  if ((w.runDurationSec || 0) > 0) return true;
  if ((w.cfDurationMin || 0) > 0) return true;
  if ((w.cfDurationSec || 0) > 0) return true;
  if ((w.cfWod || '').toString().trim()) return true;
  if ((w.stretchDuration || 0) > 0) return true;
  if ((w.swimDistance || 0) > 0) return true;
  if ((w.swimDurationMin || 0) > 0) return true;
  if ((w.swimDurationSec || 0) > 0) return true;
  if ((w.swimStroke || '').toString().trim()) return true;
  if (w.bKcal || w.lKcal || w.dKcal) return true;
  if (w.sKcal) return true;
  if ((w.bFoods || []).length || (w.lFoods || []).length || (w.dFoods || []).length) return true;
  if ((w.sFoods || []).length) return true;
  if (w.breakfast || w.lunch || w.dinner) return true;
  if (w.snack) return true;
  if (w.bPhoto || w.lPhoto || w.dPhoto || w.sPhoto || w.workoutPhoto) return true;
  if (w.workoutPhoto) return true;
  return false;
}
