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
      <div style="font-size:11px;color:var(--muted);line-height:1.6;padding:8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        키 정보는 현재 기기의 브라우저에만 저장됩니다.<br>주식 데이터는 Yahoo Finance에서 자동 제공 (키 불필요).
      </div>
      <div class="ex-editor-actions">
        <button class="ex-editor-cancel" onclick="closeSettingsModal()">취소</button>
        <button class="ex-editor-save"   onclick="saveSettings()">저장하기</button>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:12px;font-weight:700;color:var(--muted2)">📅 Google Calendar 연동</span>
          <span id="gcal-status" style="font-size:11px;font-weight:600;color:var(--muted)">미연결</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="gcal-connect-btn" onclick="connectGCal()" style="flex:1;padding:8px;border:none;border-radius:8px;background:#4285f4;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Google 연결</button>
          <button id="gcal-disconnect-btn" onclick="disconnectGCal()" style="flex:1;padding:8px;border:none;border-radius:8px;background:var(--surface2);color:var(--muted);font-size:12px;cursor:pointer;display:none">연결 해제</button>
          <button id="gcal-sync-btn" onclick="syncGCalNow()" style="flex:1;padding:8px;border:none;border-radius:8px;background:#10b981;color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:none">지금 동기화</button>
        </div>
      </div>
      <div id="pwa-install-section" style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;display:none">
        <button id="pwa-install-btn" onclick="installPWA()" style="width:100%;padding:12px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          📲 앱 다운로드 (홈 화면에 추가)
        </button>
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
