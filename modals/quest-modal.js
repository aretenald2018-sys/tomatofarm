export const MODAL_HTML = `
<div class="modal-backdrop" id="quest-modal" onclick="closeQuestModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title" id="quest-modal-title">⚔️ 새 퀘스트 추가</div>
<div class="ex-editor-form">
<input type="hidden" id="quest-fixed-type">
<div>
<div class="ex-editor-label">퀘스트 이름</div>
<input class="ex-editor-input" id="quest-title" placeholder="예: 유산소 30분, 물 2L 마시기">
</div>
<div id="quest-dday-wrap" style="display:none;">
<div class="ex-editor-label">마감 기한 (D-day) <span style="color:var(--muted);font-size:10px">선택</span></div>
<input class="ex-editor-input" id="quest-dday" type="date" min="2020-01-01" max="2099-12-31">
</div>
<div id="quest-target-wrap" style="display:none;">
<div class="ex-editor-label">목표 횟수 <span style="color:var(--muted);font-size:10px">(숫자 입력)</span></div>
<input class="ex-editor-input" id="quest-target" type="number" min="1" value="1" placeholder="예: 12">
</div>
<div class="goal-condition-toggle-row">
<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted2);cursor:pointer;">
<input type="checkbox" id="quest-auto" onchange="onQuestAutoChange()" style="width:14px;height:14px;">
운동/식단 기록 시 자동 완료 처리
</label>
</div>
<div id="quest-auto-wrap" style="display:none;">
<div class="ex-editor-label">연동 데이터 선택</div>
<select class="ex-editor-select" id="quest-auto-type">
<option value="workout">운동 기록 연동</option>
<option value="diet">식단 완료(OK) 연동</option>
</select>
</div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="closeQuestModal()">취소</button>
<button class="tds-btn fill md"   onclick="saveQuestFromModal()">저장하기</button>
</div>
</div>
</div>
</div>
`;
