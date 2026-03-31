// 포지션(주식/ETF/금/TDF 등) CRUD 모달
export const MODAL_HTML = `
<div class="modal" id="fin-position-modal" onclick="closeFinPositionModal(event)">
  <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px">
    <h3 style="font-size:14px;margin-bottom:12px" id="fin-pos-modal-title">포지션 추가</h3>

    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>종목코드 (Ticker)</label>
        <input id="fin-pos-ticker" placeholder="예: TSLA, GLD">
      </div>
      <div class="fin-modal-field">
        <label>표시명</label>
        <input id="fin-pos-name" placeholder="예: 테슬라, 금 ETF">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>구분</label>
        <select id="fin-pos-type">
          <option value="cash">현금 투자</option>
          <option value="leveraged">레버리지 투자</option>
        </select>
      </div>
      <div class="fin-modal-field">
        <label>카테고리</label>
        <select id="fin-pos-category">
          <option value="stock">주식</option>
          <option value="etf">ETF</option>
          <option value="gold">금</option>
          <option value="tdf">TDF/연금</option>
          <option value="rp">RP/외화RP</option>
          <option value="other">기타</option>
        </select>
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>보유 수량</label>
        <input id="fin-pos-shares" type="number" step="0.001" value="0">
      </div>
      <div class="fin-modal-field">
        <label>평균 매입가</label>
        <input id="fin-pos-avgcost" type="number" step="0.01" value="0">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>매입일</label>
        <input id="fin-pos-date" type="date">
      </div>
      <div class="fin-modal-field">
        <label>통화</label>
        <select id="fin-pos-currency">
          <option value="USD">USD ($)</option>
          <option value="KRW">KRW (원)</option>
        </select>
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>자동 시세 연동</label>
        <select id="fin-pos-autoprice">
          <option value="true">자동 (Alpha Vantage)</option>
          <option value="false">수동 입력</option>
        </select>
      </div>
      <div class="fin-modal-field">
        <label>수동 현재가 (자동=false 시)</label>
        <input id="fin-pos-manualprice" type="number" step="0.01" value="0">
      </div>
    </div>

    <input type="hidden" id="fin-pos-id">

    <div class="fin-modal-actions">
      <button class="fin-cancel-btn" onclick="closeFinPositionModal()">취소</button>
      <button class="fin-delete-btn" id="fin-pos-del-btn" style="display:none" onclick="deleteFinPositionFromModal()">삭제</button>
      <button class="fin-save-btn" onclick="saveFinPositionFromModal()">저장</button>
    </div>
  </div>
</div>
`;
