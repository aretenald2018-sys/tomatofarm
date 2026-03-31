// 대출/레버리지 CRUD 모달
export const MODAL_HTML = `
<div class="modal" id="fin-loan-modal" onclick="closeFinLoanModal(event)">
  <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px">
    <h3 style="font-size:14px;margin-bottom:12px" id="fin-loan-modal-title">대출 추가</h3>

    <div class="fin-modal-field">
      <label>대출명</label>
      <input id="fin-loan-name" placeholder="예: 신용대출, 마진론">
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>잔액</label>
        <input id="fin-loan-amount" type="number" value="0">
      </div>
      <div class="fin-modal-field">
        <label>연이율 (%)</label>
        <input id="fin-loan-rate" type="number" step="0.1" value="5">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>월 상환액</label>
        <input id="fin-loan-monthly" type="number" value="0">
      </div>
      <div class="fin-modal-field">
        <label>유형</label>
        <select id="fin-loan-type">
          <option value="margin">마진론</option>
          <option value="mortgage">주담대</option>
          <option value="personal">신용대출</option>
          <option value="other">기타</option>
        </select>
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>시작일</label>
        <input id="fin-loan-start" type="date">
      </div>
      <div class="fin-modal-field">
        <label>만기일</label>
        <input id="fin-loan-end" type="date">
      </div>
    </div>
    <div class="fin-modal-field">
      <label>통화</label>
      <select id="fin-loan-currency">
        <option value="KRW">KRW (원)</option>
        <option value="USD">USD ($)</option>
      </select>
    </div>

    <input type="hidden" id="fin-loan-id">

    <div class="fin-modal-actions">
      <button class="fin-cancel-btn" onclick="closeFinLoanModal()">취소</button>
      <button class="fin-delete-btn" id="fin-loan-del-btn" style="display:none" onclick="deleteFinLoanFromModal()">삭제</button>
      <button class="fin-save-btn" onclick="saveFinLoanFromModal()">저장</button>
    </div>
  </div>
</div>
`;
