export const MODAL_HTML = `
<div class="modal-backdrop" id="settings-modal" onclick="closeSettingsModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">⚙️ 설정</div>
    <div class="ex-editor-form">
      <input type="hidden" id="cfg-anthropic">
      <div id="pwa-install-section" style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;display:none">
        <button id="pwa-install-btn" onclick="installPWA()" style="width:100%;padding:12px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          📲 앱 다운로드 (홈 화면에 추가)
        </button>
      </div>
      <div id="settings-nutrition-db-list" style="display:none"></div>
    </div>
  </div>
</div>
`;
