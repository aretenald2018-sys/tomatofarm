export const MODAL_HTML = `
<div class="modal-backdrop" id="checkin-modal" onclick="closeCheckinModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">📊 주간 체크인</div>
    <div class="ex-editor-form">
      <div><div class="ex-editor-label">날짜</div><input class="ex-editor-input" id="ci-date" type="date"></div>
      <div class="diet-plan-row">
        <div><div class="ex-editor-label">체중 (kg)</div><input class="ex-editor-input" id="ci-weight" type="number" step="0.1" placeholder="74.5"></div>
        <div><div class="ex-editor-label">체지방률 (%)</div><input class="ex-editor-input" id="ci-bodyfat" type="number" step="0.1" placeholder="16.5"></div>
      </div>
      <div><div class="ex-editor-label">메모</div><input class="ex-editor-input" id="ci-note" placeholder="이번 주 컨디션이나 변화 기록..."></div>
      <div class="ex-editor-actions">
        <button class="tds-btn cancel-btn ghost md" id="ci-delete-btn" onclick="deleteCheckinFromModal()" style="display:none;color:var(--diet-bad)">삭제</button>
        <button class="tds-btn cancel-btn ghost md" onclick="closeCheckinModal()">취소</button>
        <button class="tds-btn fill md" onclick="saveCheckinFromModal()">저장하기</button>
      </div>
    </div>
  </div>
</div>
`;
