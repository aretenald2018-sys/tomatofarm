export const MODAL_HTML = `
<div class="modal-backdrop" id="export-modal" onclick="closeExportModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">📥 데이터 내보내기 (CSV)</div>
<div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
<button class="export-period-btn" onclick="runExportCSV(30)">최근 30일 기록</button>
<button class="export-period-btn" onclick="runExportCSV(90)">최근 90일 기록</button>
<button class="export-period-btn" onclick="runExportCSV(365)">최근 1년 기록</button>
<button class="export-period-btn" onclick="runExportCSV(0)">전체 데이터 내보내기</button>
<button class="tds-btn cancel-btn ghost md"  onclick="closeExportModal()">창 닫기</button>
</div>
</div>
</div>
`;
