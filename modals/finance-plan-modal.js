// 계획실적 CRUD 모달
export const MODAL_HTML = `
<div class="modal-overlay" id="fin-plan-modal" onclick="closeFinPlanModal(event)">
  <div class="modal-sheet" onclick="event.stopPropagation()">
    <div class="modal-title" id="fin-plan-modal-title">계획실적 추가</div>

    <div class="fin-modal-field">
      <label>계획 이름</label>
      <input id="fin-plan-name" placeholder="예: 2026년 계획">
    </div>

    <div id="fin-plan-entries">
      <!-- 연도별 목표 기말잔액 입력 rows가 동적으로 추가됨 -->
    </div>

    <button class="fin-add-btn" onclick="addFinPlanEntry()" style="margin:8px 0;width:100%">+ 연도 추가</button>

    <input type="hidden" id="fin-plan-id">

    <div class="fin-modal-actions">
      <button class="fin-cancel-btn" onclick="closeFinPlanModal()">취소</button>
      <button class="fin-delete-btn" id="fin-plan-del-btn" style="display:none" onclick="deleteFinPlanFromModal()">삭제</button>
      <button class="fin-save-btn" onclick="saveFinPlanFromModal()">저장</button>
    </div>
  </div>
</div>
`;
