export const MODAL_HTML = `
<div class="modal-backdrop" id="section-title-modal" onclick="closeSectionTitleModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">⚙️ 섹션 제목 설정</div>
<div class="ex-editor-form">
<input type="hidden" id="section-title-key">
<div>
<div class="ex-editor-label">섹션 이름</div>
<input class="ex-editor-input" id="section-title-input" placeholder="새로운 제목 입력">
</div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="closeSectionTitleModal()">취소</button>
<button class="tds-btn fill md"   onclick="saveSectionTitleFromModal()">저장</button>
</div>
</div>
</div>
</div>
`;
