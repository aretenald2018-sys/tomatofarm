// ================================================================
// modal-manager.js — 모달 시스템 통합 관리
// ================================================================

// 모달 메타데이터: id, 모듈 경로, export 이름
const MODALS = [
  { id: 'ex-picker-modal',        path: './modals/ex-picker-modal.js',        export: 'MODAL_HTML' },
  { id: 'ex-editor-modal',        path: './modals/ex-editor-modal.js',        export: 'MODAL_HTML' },
  { id: 'goal-modal',             path: './modals/goal-modal.js',             export: 'MODAL_HTML' },
  { id: 'quest-modal',            path: './modals/quest-modal.js',            export: 'MODAL_HTML' },
  { id: 'quest-edit-modal',       path: './modals/quest-edit-modal.js',       export: 'MODAL_HTML' },
  { id: 'section-title-modal',    path: './modals/section-title-modal.js',    export: 'MODAL_HTML' },
  { id: 'stock-purchase-modal',   path: './modals/stock-purchase-modal.js',   export: 'MODAL_HTML' },
  { id: 'export-modal',           path: './modals/export-modal.js',           export: 'MODAL_HTML' },
  { id: 'loa-add-modal',          path: './modals/loa-add-modal.js',          export: 'MODAL_HTML' },
  { id: 'wine-modal',             path: './modals/wine-modal.js',             export: 'MODAL_HTML' },
  { id: 'cal-event-modal',        path: './modals/cal-event-modal.js',        export: 'MODAL_HTML' },
  { id: 'cooking-modal',          path: './modals/cooking-modal.js',          export: 'MODAL_HTML' },
  { id: 'settings-modal',         path: './modals/settings-modal.js',         export: 'MODAL_HTML' },
  { id: 'diet-plan-modal',        path: './modals/diet-plan-modal.js',        export: 'MODAL_HTML' },
  { id: 'checkin-modal',          path: './modals/checkin-modal.js',          export: 'MODAL_HTML' },
  { id: 'nutrition-search-modal', path: './modals/nutrition-search-modal.js', export: 'MODAL_HTML' },
  { id: 'nutrition-item-modal',   path: './modals/nutrition-item-modal.js',   export: 'MODAL_HTML' },
  { id: 'nutrition-weight-modal', path: './modals/nutrition-weight-modal.js', export: 'WEIGHT_MODAL_HTML' },
  { id: 'fatsecret-modal',        path: './modals/fatsecret-modal.js',        export: 'MODAL_HTML' },
];

// 모달들이 로드되었는지 추적
let _modalsLoaded = false;

/**
 * 모든 모달을 동적으로 로드하고 DOM에 주입
 */
export async function loadAndInjectModals() {
  if (_modalsLoaded) return;

  const container = document.getElementById('modals-container');
  if (!container) return;

  try {
    const htmlParts = [];

    for (const modalConfig of MODALS) {
      const module = await import(modalConfig.path + '?v=' + Date.now());
      const html = module[modalConfig.export];
      if (html) {
        htmlParts.push(html);
      }
    }

    container.innerHTML = htmlParts.join('\n');
    _modalsLoaded = true;
    console.log('[modal-manager] 모든 모달 로드 완료');
  } catch (err) {
    console.error('[modal-manager] 모달 로드 실패:', err);
  }
}

/**
 * 모달이 로드되었는지 확인 (nutrition-weight-modal의 함수들을 위해)
 */
export function areModalsLoaded() {
  return _modalsLoaded;
}
