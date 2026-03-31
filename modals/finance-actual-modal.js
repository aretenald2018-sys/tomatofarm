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

    <div style="border-top:1px solid var(--border);margin:12px 0 8px;padding-top:10px">
      <div style="font-size:11px;font-weight:600;color:var(--muted2);margin-bottom:8px">현금흐름 분석</div>
    </div>
    <div class="fin-modal-field">
      <label>Inflow (만원) — 제세순수익 (세후 연간 총수입)</label>
      <input id="fin-actual-inflow" type="number" value="0" placeholder="연간 제세순수익">
    </div>
    <div class="fin-modal-field">
      <label>fOutflow (만원) — 고정연간지출 (주거·보험·통신·구독 등)</label>
      <input id="fin-actual-foutflow" type="number" value="0" placeholder="연간 고정지출">
    </div>
    <div style="font-size:10px;color:var(--muted);margin:-4px 0 8px;padding:0 2px">
      ※ Outflow(변동지출) = Inflow − fOutflow 로 자동 계산됩니다
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
