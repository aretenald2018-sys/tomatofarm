export const MODAL_HTML = `
<div class="modal-overlay" id="cooking-modal" onclick="closeCookingModal(event)">
  <div class="modal-sheet cooking-modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title" id="cooking-modal-title">🍳 요리 기록 추가</div>
    <div class="wine-form">
      <div class="wine-form-section">
        <div class="wine-form-row">
          <div class="wine-form-field" style="flex:3">
            <label class="wine-form-label">요리명 *</label>
            <input class="wine-form-input" id="cooking-name" placeholder="예: 된장찌개, 파스타 카르보나라">
          </div>
          <div class="wine-form-field" style="flex:1">
            <label class="wine-form-label">날짜 *</label>
            <input class="wine-form-input" id="cooking-date" type="date">
          </div>
        </div>
        <div class="wine-form-row">
          <div class="wine-form-field">
            <label class="wine-form-label">카테고리</label>
            <select class="wine-form-input" id="cooking-category">
              <option value="한식">한식</option>
              <option value="일식">일식</option>
              <option value="양식">양식</option>
              <option value="중식">중식</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div class="wine-form-field">
            <label class="wine-form-label">결과</label>
            <select class="wine-form-input" id="cooking-result">
              <option value="success">✅ 대성공</option>
              <option value="partial">🟡 보통</option>
              <option value="fail">❌ 아쉬움</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 재료 입력 섹션 -->
      <div class="wine-form-section">
        <div class="wine-form-section-title">🥬 재료</div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <div class="wine-form-field" style="flex:1;margin-bottom:0">
            <label class="wine-form-label">인분 수</label>
            <input class="wine-form-input" id="cooking-servings" type="number" value="1" min="1" max="20" style="width:70px" oninput="window._updateCookingNutrition()">
          </div>
          <div id="cooking-nutrition-summary" style="flex:2;display:flex;align-items:flex-end;padding-bottom:4px;font-size:11px;color:var(--muted)"></div>
        </div>
        <div id="cooking-ingredients-list" style="margin-bottom:8px"></div>
        <div style="position:relative">
          <input class="wine-form-input" id="cooking-ingredient-search" placeholder="재료 검색 (예: 닭가슴살, 양파...)" oninput="window._searchCookingIngredient()" autocomplete="off">
          <div id="cooking-ingredient-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:0 0 8px 8px;z-index:10"></div>
        </div>
        <!-- 인라인 중량 입력 (재료 선택 시 표시) -->
        <div id="cooking-ingredient-weight-row" style="display:none;margin-top:8px;padding:8px;background:var(--bg2);border-radius:6px">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px" id="cooking-ing-selected-name"></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="wine-form-input" id="cooking-ing-weight" type="number" placeholder="중량(g)" style="width:80px" oninput="window._previewIngredientNutrition()">
            <span id="cooking-ing-preview" style="font-size:11px;color:var(--muted);flex:1"></span>
            <button class="ex-editor-save" onclick="window._confirmIngredient()" style="padding:4px 12px;font-size:12px">추가</button>
            <button class="ex-editor-cancel" onclick="window._cancelIngredient()" style="padding:4px 8px;font-size:12px">취소</button>
          </div>
        </div>
      </div>

      <div class="wine-form-section">
        <div class="wine-form-section-title">🔗 레시피 출처</div>
        <div class="wine-form-field">
          <input class="wine-form-input" id="cooking-source" placeholder="예: 백종원 유튜브, 만개의 레시피 URL 등">
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">📝 조리 과정 메모</div>
        <div class="wine-form-field">
          <textarea class="wine-form-input wine-form-textarea" id="cooking-process" placeholder="조리 시 주의할 점이나 주요 과정을 기록하세요" rows="3"></textarea>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">🍽️ 맛 결과 & 개선점</div>
        <div class="wine-form-field">
          <textarea class="wine-form-input wine-form-textarea" id="cooking-result-notes" placeholder="맛 평점이나 다음엔 어떻게 바꿔볼지 기록하세요" rows="3"></textarea>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">📸 완성 사진</div>
        <div class="wine-form-field">
          <label class="wine-form-label">사진 URL</label>
          <input class="wine-form-input" id="cooking-photo-url" placeholder="https://..." oninput="onCookingPhotoInput()">
        </div>
        <img id="cooking-photo-preview" style="display:none;width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-top:8px;border:1px solid var(--border)" alt="미리보기">
      </div>
      <div class="wine-form-actions">
        <button class="ex-editor-cancel" onclick="closeCookingModal()">취소</button>
        <button class="ex-editor-save"   onclick="saveCookingFromModal()">저장하기</button>
      </div>
      <button class="ex-editor-delete" id="cooking-delete-btn" onclick="deleteCookingFromModal()" style="display:none">🗑️ 기록 삭제</button>
    </div>
  </div>
</div>
`;
