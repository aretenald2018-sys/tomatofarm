// 현실(연간 실적) CRUD 모달
export const MODAL_HTML = `
<div class="modal-overlay" id="fin-actual-modal" onclick="closeFinActualModal(event)">
  <div class="modal-sheet" onclick="event.stopPropagation()">
    <div class="modal-title" id="fin-actual-modal-title">연간 실적 추가</div>

    <div class="fin-modal-field">
      <label>연도</label>
      <input id="fin-actual-year" type="number" value="2026">
    </div>
    <div class="fin-modal-field">
      <label>누적 저축/투자 총액 (만원)</label>
      <input id="fin-actual-saved" type="number" value="0" placeholder="5000 = 5천만원">
    </div>
    <div class="fin-modal-field">
      <label>순자산 (만원, 선택)</label>
      <input id="fin-actual-networth" type="number" value="0">
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>비상금 (만원, 선택)</label>
        <input id="fin-actual-emergency" type="number" value="0">
      </div>
      <div class="fin-modal-field">
        <label>월 지출 (만원, 선택)</label>
        <input id="fin-actual-expense" type="number" value="0">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>Inflow (만원) — 제세순수익</label>
        <input id="fin-actual-inflow" type="number" value="0" placeholder="연간 제세순수익">
      </div>
      <div class="fin-modal-field">
        <label>Outflow (만원) — 총지출액</label>
        <input id="fin-actual-outflow" type="number" value="0" placeholder="연간 총지출액">
      </div>
    </div>

    <input type="hidden" id="fin-actual-id">

    <div class="fin-modal-actions">
      <button class="fin-cancel-btn" onclick="closeFinActualModal()">취소</button>
      <button class="fin-delete-btn" id="fin-actual-del-btn" style="display:none" onclick="deleteFinActualFromModal()">삭제</button>
      <button class="fin-save-btn" onclick="saveFinActualFromModal()">저장</button>
    </div>
  </div>
</div>
`;
