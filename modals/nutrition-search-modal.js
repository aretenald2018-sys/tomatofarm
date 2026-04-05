export const MODAL_HTML = `
<div class="modal-backdrop" id="nutrition-search-modal" onclick="closeNutritionSearch(event)">
  <div class="modal-sheet" onclick="event.stopPropagation()">
    <div class="sheet-handle"></div>
    <div class="modal-title" style="font-size:17px;font-weight:700;">음식 추가</div>
    <div style="padding:0 4px 12px;">
      <div style="position:relative;margin-bottom:12px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2.5" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        <input style="width:100%;padding:12px 12px 12px 36px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);font-size:14px;color:var(--text);outline:none;font-family:var(--font-sans);transition:border-color 0.15s;" id="nutrition-search-input" placeholder="음식 이름으로 검색" oninput="debouncedNutritionSearch()" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div id="nutrition-search-results" style="max-height:300px;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>
      <div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
        <button onclick="openNutritionItemEditor(null)" style="flex:1;padding:10px;border:1px dashed var(--border);border-radius:12px;background:none;font-size:13px;font-weight:500;color:var(--primary);cursor:pointer;">직접 입력</button>
        <button onclick="openNutritionPhotoUpload()" style="flex:1;padding:10px;border:1px dashed var(--border);border-radius:12px;background:none;font-size:13px;font-weight:500;color:var(--text-secondary);cursor:pointer;">사진으로 등록</button>
      </div>
    </div>
  </div>
</div>
`;
