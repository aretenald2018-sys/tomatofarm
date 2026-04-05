export const MODAL_HTML = `
<div class="modal-backdrop" id="stock-chart-modal" onclick="closeStockChartModal(event)">
<div class="modal-sheet" style="max-width:600px;max-height:92vh;overflow-y:auto">
<div class="sheet-handle"></div>
<div class="modal-title" id="stock-chart-title">📈 주가 차트</div>
<div id="stock-chart-loading" style="text-align:center;padding:20px;color:var(--muted);font-size:12px">데이터 로딩 중...</div>
<div id="stock-chart-content" style="display:none">
  <div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px">
    <button class="fin-add-btn stock-range-btn" data-range="1mo" onclick="changeStockChartRange('1mo')">1개월</button>
    <button class="fin-add-btn stock-range-btn active" data-range="3mo" onclick="changeStockChartRange('3mo')">3개월</button>
    <button class="fin-add-btn stock-range-btn" data-range="6mo" onclick="changeStockChartRange('6mo')">6개월</button>
    <button class="fin-add-btn stock-range-btn" data-range="1y" onclick="changeStockChartRange('1y')">1년</button>
  </div>
  <div style="height:200px;margin-bottom:8px"><canvas id="stock-price-chart"></canvas></div>
  <div style="height:80px;margin-bottom:8px"><canvas id="stock-volume-chart"></canvas></div>
  <div style="height:80px;margin-bottom:8px"><canvas id="stock-rsi-chart"></canvas></div>
  <div id="stock-chart-info" style="font-size:11px;color:var(--muted);padding:4px 0"></div>
</div>
<div style="text-align:center;padding:8px">
  <button class="tds-btn cancel-btn ghost md" onclick="closeStockChartModal()">닫기</button>
</div>
</div>
</div>
`;
