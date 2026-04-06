export const MODAL_HTML = `
<div class="modal-backdrop" id="settings-modal" onclick="closeSettingsModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">⚙️ 설정</div>
    <div class="ex-editor-form">
      <input type="hidden" id="cfg-anthropic">
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">🤖 AI 기능 (Gemini)</span>
          <span id="gemini-status" style="font-size:11px;font-weight:600;color:var(--muted)"></span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;">사진 인식, 텍스트 파싱, AI 추천에 사용됩니다.</div>
        <input class="ex-editor-input" id="cfg-gemini" type="password" placeholder="Gemini API Key" style="font-size:12px;">
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
          <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">📆 캘린더 행 관리</span>
          <button onclick="addCalendarRow()" style="background:var(--primary-bg);color:var(--primary);border:none;border-radius:var(--radius-full);padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;">+ 추가</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;">캘린더와 홈에 표시되는 활동 항목을 관리해요.</div>
        <div id="settings-calendar-rows" style="max-height:200px;overflow-y:auto;"></div>
      </div>
      <div id="settings-nutrition-db-list" style="display:none"></div>
    </div>
  </div>
</div>
`;
