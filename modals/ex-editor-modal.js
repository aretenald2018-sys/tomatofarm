export const MODAL_HTML = `
<div class="modal-backdrop" id="ex-editor-modal" onclick="wtCloseExerciseEditor(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title" id="ex-editor-title">종목 추가 및 편집</div>
<div class="ex-editor-form">
<div><div class="ex-editor-label">타겟 부위</div><select class="ex-editor-select" id="ex-editor-muscle"></select></div>
<div><div class="ex-editor-label">종목 이름</div><input class="ex-editor-input" id="ex-editor-name" placeholder="예: 케이블 로우, 스쿼트"></div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="wtCloseExerciseEditor()">취소</button>
<button class="tds-btn fill md"   onclick="wtSaveExerciseFromEditor()">저장</button>
</div>
<button class="tds-btn danger sm" id="tds-btn danger sm" onclick="wtDeleteExerciseFromEditor()">🗑️ 종목 삭제</button>
</div>
</div>
</div>
`;
