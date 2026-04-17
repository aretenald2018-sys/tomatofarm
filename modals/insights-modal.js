// Scene 13 — 주간 인사이트
export const MODAL_HTML = `
<div class="modal-overlay insights-overlay" id="insights-modal" onclick="if(event.target===this) insightsClose()">
  <div class="modal-sheet insights-sheet">
    <div class="expert-onb-topbar">
      <button class="topbar-back" onclick="insightsClose()">‹</button>
      <div class="topbar-title">이번 주 인사이트</div>
      <div class="topbar-skip" id="insights-range"></div>
    </div>
    <div class="expert-onb-content" id="insights-content"></div>
    <div class="bottom-cta">
      <button class="btn btn-primary" onclick="insightsClose()">확인</button>
    </div>
  </div>
</div>
`;
