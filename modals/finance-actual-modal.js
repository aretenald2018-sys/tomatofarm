// 현실(연간 실적) CRUD 모달
export const MODAL_HTML = `
<div class="modal" id="fin-actual-modal" onclick="closeFinActualModal(event)">
  <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px">
    <h3 style="font-size:14px;margin-bottom:12px" id="fin-actual-modal-title">연간 실적 추가</h3>

    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>연도</label>
        <input id="fin-actual-year" type="number" value="2026">
      </div>
      <div class="fin-modal-field">
        <label>통화</label>
        <select id="fin-actual-currency">
          <option value="KRW">KRW (원)</option>
          <option value="USD">USD ($)</option>
        </select>
      </div>
    </div>
    <div class="fin-modal-field">
      <label>누적 저축/투자 총액</label>
      <input id="fin-actual-saved" type="number" value="0">
    </div>
    <div class="fin-modal-field">
      <label>순자산 (선택)</label>
      <input id="fin-actual-networth" type="number" value="0" placeholder="자동계산 또는 직접 입력">
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>비상금 (선택)</label>
        <input id="fin-actual-emergency" type="number" value="0">
      </div>
      <div class="fin-modal-field">
        <label>월 지출 (선택)</label>
        <input id="fin-actual-expense" type="number" value="0" placeholder="비상금 개월수 계산용">
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
