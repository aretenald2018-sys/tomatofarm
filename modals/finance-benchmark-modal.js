// 벤치마크 CRUD 모달
export const MODAL_HTML = `
<div class="modal" id="fin-benchmark-modal" onclick="closeFinBenchmarkModal(event)">
  <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px">
    <h3 style="font-size:14px;margin-bottom:12px" id="fin-bench-modal-title">벤치마크 추가</h3>

    <div class="fin-modal-field">
      <label>벤치마크 이름</label>
      <input id="fin-bench-name" placeholder="예: S&P500 추종 7%">
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>시작연도</label>
        <input id="fin-bench-startYear" type="number" value="2026">
      </div>
      <div class="fin-modal-field">
        <label>기간 (년)</label>
        <input id="fin-bench-period" type="number" value="20">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>연금리 (%)</label>
        <input id="fin-bench-rate" type="number" step="0.1" value="7">
      </div>
      <div class="fin-modal-field">
        <label>물가상승률 (%)</label>
        <input id="fin-bench-inflation" type="number" step="0.1" value="2.5">
      </div>
    </div>
    <div class="fin-modal-row">
      <div class="fin-modal-field">
        <label>초기 원금 (시드머니)</label>
        <input id="fin-bench-principal" type="number" value="0">
      </div>
      <div class="fin-modal-field">
        <label>연간 불입금</label>
        <input id="fin-bench-contribution" type="number" value="20000000">
      </div>
    </div>
    <div class="fin-modal-field">
      <label>통화</label>
      <select id="fin-bench-currency">
        <option value="KRW">KRW (원)</option>
        <option value="USD">USD ($)</option>
      </select>
    </div>

    <input type="hidden" id="fin-bench-id">

    <div class="fin-modal-actions">
      <button class="fin-cancel-btn" onclick="closeFinBenchmarkModal()">취소</button>
      <button class="fin-delete-btn" id="fin-bench-del-btn" style="display:none" onclick="deleteFinBenchmarkFromModal()">삭제</button>
      <button class="fin-save-btn" onclick="saveFinBenchmarkFromModal()">저장</button>
    </div>
  </div>
</div>
`;
