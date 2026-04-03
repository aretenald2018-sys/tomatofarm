export const MODAL_HTML = `
<div class="modal-overlay" id="stock-detail-modal" onclick="closeStockDetailModal(event)">
<div class="modal-sheet" style="max-width:540px;max-height:92vh;overflow-y:auto">
<div class="sheet-handle"></div>
<div id="sd-header" style="padding-bottom:8px"></div>
<div class="fin-detail-tabs">
  <div class="fin-detail-tab" data-tab="live" onclick="switchStockDetailTab('live')">실시간</div>
  <div class="fin-detail-tab active" data-tab="chart" onclick="switchStockDetailTab('chart')">차트</div>
  <div class="fin-detail-tab" data-tab="stratA" onclick="switchStockDetailTab('stratA')">전략A</div>
  <div class="fin-detail-tab" data-tab="stratB" onclick="switchStockDetailTab('stratB')">전략B</div>
</div>
<div id="sd-content" class="fin-detail-content"></div>
<div style="text-align:center;padding:8px 0 4px">
  <button class="ex-editor-cancel" onclick="closeStockDetailModal()">닫기</button>
</div>
</div>
</div>
`;
