export const MODAL_HTML = `
<div class="modal-backdrop" id="fatsecret-modal" onclick="closeFatSecretSearch(event)">
  <div class="modal-sheet" style="max-height:88vh">
    <div class="sheet-handle"></div>
    <div class="modal-title">🔍 음식 검색</div>
    <div id="fatsecret-search-body">
      <!-- 📝 검색 입력 -->
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;line-height:1.6">
        💡 한글 또는 영문으로 검색 가능합니다.<br>
        예: 닭가슴살, chicken breast, 계란, 우유<br>
        <span style="color:var(--muted2)">같은 식품은 정확도 순으로 정렬됩니다</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input class="ex-editor-input" id="fs-search-input" placeholder="음식명 입력" style="flex:1"
          onkeydown="if(event.key==='Enter')fatsecretSearch()">
        <button class="tds-btn fill md" style="width:60px;padding:0" onclick="fatsecretSearch()">검색</button>
      </div>

      <!-- 🔎 검색 결과 -->
      <div id="fs-results" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:8px"></div>

      <!-- 🎯 선택된 식품 정보 -->
      <div id="fs-analysis-section" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px" id="fs-selected-name"></div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:4px;line-height:1.6">
          <div id="fs-nutrition-preview"></div>
        </div>

        <!-- 중량 입력 & 추가 -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input class="ex-editor-input" id="fs-grams-input" type="number" min="1" step="1" placeholder="중량 입력" style="flex:1" value="100">
          <span style="font-size:13px;color:var(--muted)">g</span>
          <button class="tds-btn fill md" onclick="fatsecretAddFood()">식단 추가</button>
        </div>

        <!-- 영양정보 미리보기 -->
        <div id="fs-calc-preview" style="font-size:11px;color:var(--muted2);padding:6px;background:var(--bg2);border-radius:4px;text-align:center"></div>

        <button class="ex-picker-add" onclick="fatsecretBackToSearch()" style="width:100%;margin-top:8px">← 다시 검색</button>
      </div>
    </div>
  </div>
</div>
`;
