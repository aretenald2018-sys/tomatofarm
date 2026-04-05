export const MODAL_HTML = `
<div class="modal-backdrop" id="stock-purchase-modal" onclick="closeStockPurchaseModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">💰 매입 기록 추가</div>
<div class="ex-editor-form">
<input type="hidden" id="sp-sym">
<div>
<div class="ex-editor-label">종목 코드 (Symbol)</div>
<div class="ex-editor-input" id="sp-sym-display" style="background:var(--surface3);color:var(--muted2)"></div>
</div>
<div>
<div class="ex-editor-label">매입 날짜</div>
<input class="ex-editor-input" id="sp-date" type="date" min="2020-01-01" max="2099-12-31">
</div>
<div>
<div class="ex-editor-label">매입 단가 (USD / 주)</div>
<input class="ex-editor-input" id="sp-price" type="number" step="0.01" placeholder="예: 250.00">
</div>
<div>
<div class="ex-editor-label">매입 수량 (주)</div>
<input class="ex-editor-input" id="sp-qty" type="number" step="0.001" min="0" placeholder="예: 20">
</div>
<div>
<div class="ex-editor-label">총 매입 금액 (USD, 선택 사항)</div>
<input class="ex-editor-input" id="sp-amount" type="number" step="0.01" placeholder="미입력 시 단가×수량으로 자동 계산">
</div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="closeStockPurchaseModal()">취소</button>
<button class="tds-btn fill md"   onclick="saveStockPurchaseFromModal()">저장하기</button>
</div>
<button class="tds-btn danger sm" id="sp-delete-btn" onclick="deleteStockPurchaseFromModal()" style="display:none">🗑️ 매입 정보 삭제</button>
</div>
</div>
</div>
`;
