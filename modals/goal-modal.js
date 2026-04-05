export const MODAL_HTML = `
<div class="modal-backdrop" id="goal-modal" onclick="closeGoalModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">🎯 목표 설정</div>
<div class="ex-editor-form">
<div>
<div class="ex-editor-label">목표 이름</div>
<input class="ex-editor-input" id="goal-label" placeholder="예: 바디프로필 찍기">
</div>
<div>
<div class="ex-editor-label">목표일 (D-day)</div>
<input class="ex-editor-input" id="goal-dday" type="date" min="2020-01-01" max="2099-12-31">
</div>
<div class="goal-condition-toggle-row">
<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted2);cursor:pointer;">
<input type="checkbox" id="goal-use-condition" onchange="toggleGoalCondition()" style="width:14px;height:14px;">
달성 조건 직접 설정 (미설정 시 AI가 추천)
</label>
</div>
<div id="goal-condition-wrap" style="display:none;">
<div class="ex-editor-label">주간 운동 횟수 목표</div>
<input class="ex-editor-input" id="goal-workout-per-week" type="number" min="1" max="7" placeholder="예: 5">
<div class="ex-editor-label" style="margin-top:8px;">식단 달성 목표율 (%)</div>
<input class="ex-editor-input" id="goal-diet-ok-pct" type="number" min="1" max="100" placeholder="예: 80">
</div>
<div class="ex-editor-actions">
<button class="tds-btn cancel-btn ghost md" onclick="closeGoalModal()">취소</button>
<button class="tds-btn fill md"   onclick="saveGoalFromModal()">저장하기</button>
</div>
</div>
</div>
</div>
`;
