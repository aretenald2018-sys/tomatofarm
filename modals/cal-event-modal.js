export const MODAL_HTML = `
<div class="modal-backdrop" id="cal-event-modal" onclick="closeCalEventModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title" id="cal-event-modal-title">📅 일정 추가</div>
    <div class="ex-editor-form">
      <div>
        <div class="ex-editor-label">일정 이름</div>
        <input class="ex-editor-input" id="cal-event-title" placeholder="예: 하체 운동, 여행, 생일">
      </div>
      <div>
        <div class="ex-editor-label">기간</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input class="ex-editor-input" id="cal-event-start" type="date">
          <span style="color:var(--muted);font-size:12px;">~</span>
          <input class="ex-editor-input" id="cal-event-end" type="date">
        </div>
      </div>
      <div>
        <div class="ex-editor-label">색상 선택</div>
        <div class="event-color-picker" id="cal-event-color-picker">
          <div class="event-color-swatch selected" data-color="#f59e0b" style="background:#f59e0b" onclick="selectEventColor('#f59e0b')"></div>
          <div class="event-color-swatch" data-color="#ef4444" style="background:#ef4444" onclick="selectEventColor('#ef4444')"></div>
          <div class="event-color-swatch" data-color="#3b82f6" style="background:#3b82f6" onclick="selectEventColor('#3b82f6')"></div>
          <div class="event-color-swatch" data-color="#10b981" style="background:#10b981" onclick="selectEventColor('#10b981')"></div>
          <div class="event-color-swatch" data-color="#8b5cf6" style="background:#8b5cf6" onclick="selectEventColor('#8b5cf6')"></div>
          <div class="event-color-swatch" data-color="#ec4899" style="background:#ec4899" onclick="selectEventColor('#ec4899')"></div>
          <div class="event-color-swatch" data-color="#6b7280" style="background:#6b7280" onclick="selectEventColor('#6b7280')"></div>
        </div>
      </div>
      <div>
        <div class="ex-editor-label">표시 스타일</div>
        <div style="display:flex;gap:8px">
          <button class="event-style-btn" id="evt-style-bar" onclick="setEventViewFromModal('bar')" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;transition:all .15s">━ 바</button>
          <button class="event-style-btn" id="evt-style-arrow" onclick="setEventViewFromModal('arrow')" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;transition:all .15s">→ 선</button>
        </div>
      </div>
      <div class="ex-editor-actions">
        <button class="tds-btn cancel-btn ghost md" onclick="closeCalEventModal()">취소</button>
        <button class="tds-btn fill md" onclick="saveCalEventFromModal()">저장</button>
      </div>
      <button class="tds-btn danger sm" id="cal-event-delete-btn" onclick="deleteCalEventFromModal()" style="display:none">🗑️ 일정 삭제</button>
    </div>
  </div>
</div>
`;
