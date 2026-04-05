export const MODAL_HTML = `
<div class="modal-backdrop" id="quest-edit-modal" onclick="closeQuestEditModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">📝 퀘스트 수정</div>
<div class="ex-editor-form">
<input type="hidden" id="quest-edit-id">
<div>
<div class="ex-editor-label">퀘스트 이름</div>
<input class="ex-editor-input" id="quest-edit-title" placeholder="퀘스트 이름 입력">
</div>
<div id="quest-edit-dday-wrap" style="display:none;">
<div class="ex-editor-label">마감 기한 (D-day)</div>
<input class="ex-editor-input" id="quest-edit-dday" type="date" min="2020-01-01" max="2099-12-31">
</div>
<div id="quest-edit-target-wrap">
<div class="ex-editor-label">목표 횟수 <span style="color:var(--muted);font-size:10px">(숫자 입력)</span></div>
<input class="ex-editor-input" id="quest-edit-target" type="number" min="1" placeholder="예: 12">
</div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="closeQuestEditModal()">취소</button>
<button class="tds-btn fill md"   onclick="saveQuestEdit()">변경사항 저장</button>
</div>
</div>
</div>
</div>
`;
