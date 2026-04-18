// ================================================================
// modals/custom-muscles-modal.js — 커스텀 자극부위 CRUD
// ================================================================

export const MODAL_HTML = `
<div class="modal-overlay" id="custom-muscles-modal" onclick="if(event.target===this)closeCustomMusclesModal()">
  <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="cmm-title">
    <div class="modal-title" id="cmm-title">🏷️ 내 자극부위</div>
    <div class="modal-sub" style="color:var(--text-secondary); font-size:13px; margin-top:4px;">
      기본 부위 8종 + 원하는 부위를 직접 추가할 수 있어요.<br/>
      예: 전완, 인클라인, 어브덕션…
    </div>

    <div id="cmm-list" style="margin-top:16px;"></div>

    <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:14px;">
      <div class="section-label" style="margin-bottom:8px;">새 부위 추가</div>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="cmm-new-name" class="tf-input" placeholder="예: 전완, 어브덕션" maxlength="12" style="flex:1;">
        <input type="color" id="cmm-new-color" value="#8b5cf6" style="width:44px; height:44px; border:1px solid var(--border); border-radius:10px; cursor:pointer; padding:2px;">
        <button class="tds-btn fill sm" onclick="addCustomMuscle()">추가</button>
      </div>
    </div>

    <div style="display:flex; gap:8px; margin-top:20px;">
      <button class="tds-btn tonal md" onclick="closeCustomMusclesModal()" style="flex:1;">닫기</button>
    </div>
  </div>
</div>
`;
