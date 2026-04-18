export const MODAL_HTML = `
<div class="modal-backdrop" id="ex-picker-modal" onclick="wtCloseExercisePicker(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">종목 선택</div>
<!-- C-2: 검색 필드 — TDS Mobile SearchField (min-h 44, r12, font 16) -->
<div class="ex-picker-search-wrap" style="position:sticky;top:0;background:var(--surface);padding:4px 0 8px;z-index:2;">
  <div style="position:relative;">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-secondary);pointer-events:none;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="ex-picker-search" type="search" autocomplete="off" placeholder="종목명 검색 (예: 벤치, 스쿼트…)"
      oninput="window._wtOnPickerSearch && window._wtOnPickerSearch(this.value)"
      style="width:100%;min-height:44px;padding:8px 40px 8px 38px;border-radius:12px;border:1px solid var(--border);background:var(--seed-bg-fill,var(--surface2));font-size:16px;line-height:1.5;box-sizing:border-box;" />
    <button type="button" id="ex-picker-search-clear" onclick="window._wtClearPickerSearch && window._wtClearPickerSearch()" aria-label="지우기"
      style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:0;padding:6px;font-size:16px;color:var(--text-secondary);cursor:pointer;">✕</button>
  </div>
</div>
<div id="ex-picker-list"></div>
</div>
</div>
`;
