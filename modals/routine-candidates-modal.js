// Scene 11 — AI 후보 2개 (균형 보완 vs 익숙한 패턴)
export const MODAL_HTML = `
<div class="modal-overlay routine-cand-overlay" id="routine-candidates-modal" onclick="if(event.target===this) routineCandidatesClose()">
  <div class="modal-sheet routine-cand-sheet">
    <div class="expert-onb-topbar">
      <button class="topbar-back" onclick="routineCandidatesClose()">‹</button>
      <div class="topbar-title">오늘의 루틴</div>
      <div style="width:36px"></div>
    </div>
    <div class="expert-onb-content" id="routine-cand-content"></div>
    <div class="bottom-cta">
      <button class="btn btn-ghost" onclick="routineCandidatesRegen()">🔄 다시 생성 (다른 2개)</button>
      <button class="btn btn-primary" id="routine-cand-select" onclick="routineCandidatesSelect()" disabled>후보 선택</button>
    </div>
  </div>
</div>
`;
