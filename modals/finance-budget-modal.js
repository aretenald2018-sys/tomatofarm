// 가계부 항목 CRUD 모달
export const MODAL_HTML = `
<div class="modal-backdrop" id="fin-budget-item-modal" onclick="closeBudgetItemModal(event)">
  <div class="modal-sheet" onclick="event.stopPropagation()">
    <div class="modal-title" id="bud-item-modal-title">항목 추가</div>

    <input type="hidden" id="bud-item-gi" value="">
    <input type="hidden" id="bud-item-ii" value="">

    <div class="fin-modal-field">
      <label>그룹 (대분류)</label>
      <select id="bud-item-group"></select>
    </div>
    <div class="fin-modal-field">
      <label>항목명 (소분류)</label>
      <input id="bud-item-name" placeholder="예: 월세, 식비, 교통비">
    </div>
    <div class="fin-modal-field">
      <label>월 목표 (만원)</label>
      <input id="bud-item-target" type="number" step="0.1" placeholder="0">
    </div>

    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeBudgetItemModal()">취소</button>
      <button class="modal-del" id="bud-item-del-btn" style="display:none" onclick="deleteBudgetItemFromModal()">삭제</button>
      <button class="modal-save" onclick="saveBudgetItemFromModal()">저장</button>
    </div>
  </div>
</div>
`;
