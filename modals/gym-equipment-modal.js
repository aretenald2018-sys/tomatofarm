// ================================================================
// gym-equipment-modal.js
// Scene 06~07 — 헬스장 기구 등록 (텍스트/사진/하나씩 3탭) + 파싱 리뷰
// ================================================================

export const MODAL_HTML = `
<div class="modal-overlay expert-gym-overlay" id="gym-equipment-modal" onclick="if(event.target===this) gymEqClose()">
  <div class="modal-sheet expert-gym-sheet">
    <div class="expert-onb-topbar">
      <button class="topbar-back" onclick="gymEqClose()">‹</button>
      <div class="topbar-title" id="gym-eq-title">기구 등록</div>
      <div style="width:36px"></div>
    </div>
    <div class="expert-onb-content" id="gym-eq-content"></div>
    <div class="bottom-cta" id="gym-eq-cta"></div>
  </div>
</div>
`;
