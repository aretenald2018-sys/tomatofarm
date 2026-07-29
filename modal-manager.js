// ================================================================
// modal-manager.js — 모달 시스템 통합 관리
// ================================================================

// 모달 메타데이터: id, 모듈 경로, export 이름
export const MODALS = Object.freeze([
  { id: 'ex-picker-modal',        path: './modals/ex-picker-modal.js',        export: 'MODAL_HTML' },
  { id: 'ex-editor-modal',        path: './modals/ex-editor-modal.js',        export: 'MODAL_HTML' },
  { id: 'goal-modal',             path: './modals/goal-modal.js',             export: 'MODAL_HTML' },
  { id: 'quest-modal',            path: './modals/quest-modal.js',            export: 'MODAL_HTML' },
  { id: 'quest-edit-modal',       path: './modals/quest-edit-modal.js',       export: 'MODAL_HTML' },
  { id: 'section-title-modal',    path: './modals/section-title-modal.js',    export: 'MODAL_HTML' },
  { id: 'export-modal',           path: './modals/export-modal.js',           export: 'MODAL_HTML' },
  { id: 'cooking-modal',          path: './modals/cooking-modal.js',          export: 'MODAL_HTML' },
  { id: 'settings-modal',         path: './modals/settings-modal.js',         export: 'MODAL_HTML' },
  { id: 'diet-plan-modal',        path: './modals/diet-plan-modal.js',        export: 'MODAL_HTML' },
  { id: 'checkin-modal',          path: './modals/checkin-modal.js',          export: 'MODAL_HTML' },
  { id: 'weight-result-modal',    path: './modals/weight-result-modal.js',    export: 'MODAL_HTML' },
  { id: 'nutrition-search-modal', path: './modals/nutrition-search-modal.js', export: 'MODAL_HTML' },
  { id: 'nutrition-item-modal',   path: './modals/nutrition-item-modal.js',   export: 'MODAL_HTML' },
  { id: 'nutrition-weight-modal', path: './modals/nutrition-weight-modal.js', export: 'WEIGHT_MODAL_HTML' },
  { id: 'streak-milestone-modal', path: './modals/streak-milestone-modal.js', export: 'MODAL_HTML' },
  { id: 'guild-modal',            path: './modals/guild-modal.js',            export: 'MODAL_HTML' },
  { id: 'guild-info-modal',       path: './modals/guild-info-modal.js',       export: 'MODAL_HTML' },
  { id: 'self-cheer-modal',       path: './modals/self-cheer-modal.js',       export: 'MODAL_HTML' },
  { id: 'patchnote-modal',        path: './modals/patchnote-modal.js',        export: 'MODAL_HTML' },
  { id: 'trainer-quest-modal',    path: './modals/trainer-quest-modal.js',    export: 'MODAL_HTML' },
  { id: 'miranda-quest-modal',    path: './modals/miranda-quest-modal.js',    export: 'MODAL_HTML' },
  { id: 'consulting-chief-quest-modal', path: './modals/consulting-chief-quest-modal.js', export: 'MODAL_HTML' },
  // 전문가 모드 (Scene 02~13)
  { id: 'expert-onboarding-modal',path: './modals/expert-onboarding-modal.js',export: 'MODAL_HTML' },
  { id: 'gym-equipment-modal',    path: './modals/gym-equipment-modal.js',    export: 'MODAL_HTML' },
  { id: 'routine-suggest-modal',  path: './modals/routine-suggest-modal.js',  export: 'MODAL_HTML' },
  { id: 'routine-candidates-modal',path: './modals/routine-candidates-modal.js',export: 'MODAL_HTML' },
  { id: 'insights-modal',         path: './modals/insights-modal.js',         export: 'MODAL_HTML' },
  // 맥스 모드 미니 온보딩 (3 scene)
  { id: 'max-onboarding-modal',   path: './modals/max-onboarding-modal.js',   export: 'MODAL_HTML' },
  { id: 'calendar-day-modal',     path: './modals/calendar-day-modal.js',     export: 'MODAL_HTML' },
  { id: 'custom-muscles-modal',   path: './modals/custom-muscles-modal.js',   export: 'MODAL_HTML' },
]);

// 모달들이 로드되었는지 추적
let _modalsLoaded = false;
let _modalsLoadPromise = null;
const _modalPromises = new Map();

function _modalConfig(id) {
  return MODALS.find((config) => config.id === id) || null;
}

export async function ensureModal(id) {
  if (!id) return null;
  const existing = document.getElementById(id);
  if (existing) return existing;
  if (_modalPromises.has(id)) return _modalPromises.get(id);

  const config = _modalConfig(id);
  if (!config) throw new Error(`Unknown modal: ${id}`);
  const promise = (async () => {
    const container = document.getElementById('modals-container');
    if (!container) throw new Error('modals-container not found');
    const module = await import(config.path);
    const html = module[config.export] || '';
    if (!html) throw new Error(`Modal template is empty: ${id}`);
    container.insertAdjacentHTML('beforeend', html);
    const element = document.getElementById(id);
    if (!element) throw new Error(`Modal template did not create #${id}`);
    return element;
  })();
  _modalPromises.set(id, promise);
  try {
    return await promise;
  } catch (error) {
    _modalPromises.delete(id);
    throw error;
  }
}

/**
 * 모든 모달을 동적으로 로드하고 DOM에 주입
 */
export async function loadAndInjectModals(ids = null) {
  const requestedIds = Array.isArray(ids) ? [...new Set(ids)] : MODALS.map((config) => config.id);
  const loadsAll = requestedIds.length === MODALS.length && MODALS.every((config) => requestedIds.includes(config.id));
  if (loadsAll && _modalsLoaded) return;
  if (!loadsAll) {
    await Promise.all(requestedIds.map((id) => ensureModal(id)));
    return;
  }
  if (_modalsLoadPromise) return _modalsLoadPromise;

  _modalsLoadPromise = (async () => {
    const results = await Promise.allSettled(
      MODALS.map((config) => ensureModal(config.id))
    );
    const loadedCount = results.filter((result) => result.status === 'fulfilled').length;
    _modalsLoaded = loadedCount === MODALS.length;
    console.log('[modal-manager] 모달 로드 완료 (' + loadedCount + '/' + MODALS.length + ')');
    // 실패를 이름 없이 삼키면 "이 버튼만 무반응"인 증상의 원인을 찾을 수 없다.
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      console.warn(`[modal-manager] ${MODALS[index].id} 로드 실패:`, result.reason?.message || result.reason);
    });
  })();

  try {
    await _modalsLoadPromise;
  } finally {
    if (!_modalsLoaded) _modalsLoadPromise = null;
  }
}
