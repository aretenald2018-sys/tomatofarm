export const MODAL_HTML = `
<div class="modal-overlay" id="settings-modal" onclick="closeSettingsModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">⚙️ API 연동 설정</div>
    <div class="ex-editor-form">
      <div>
        <div class="ex-editor-label">Anthropic API 키 (Claude AI)</div>
        <input class="ex-editor-input" id="cfg-anthropic" type="password" placeholder="sk-ant-api03-..." autocomplete="off">
      </div>
      <div>
        <div class="ex-editor-label">Alpha Vantage API 키 (주식 데이터)</div>
        <input class="ex-editor-input" id="cfg-alphavantage" type="password" placeholder="XXXXXXXXXXXXXXXX" autocomplete="off">
      </div>
      <div style="font-size:11px;color:var(--muted);line-height:1.6;padding:8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        키 정보는 현재 기기의 브라우저에만 암호화되어 저장됩니다.<br>서버나 외부로 노출되지 않으니 안심하세요.
      </div>
      <div class="ex-editor-actions">
        <button class="ex-editor-cancel" onclick="closeSettingsModal()">취소</button>
        <button class="ex-editor-save"   onclick="saveSettings()">저장하기</button>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:12px;font-weight:700;color:var(--muted2)">🥦 영양 성분 DB 관리</span>
          <button class="ex-picker-add" onclick="openNutritionItemEditor(null)" style="padding:4px 12px;font-size:11px">+ 품목 추가</button>
        </div>
        <div id="settings-nutrition-db-list" style="max-height:220px;overflow-y:auto"></div>
      </div>
    </div>
  </div>
</div>
`;
