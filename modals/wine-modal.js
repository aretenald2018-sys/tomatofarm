export const MODAL_HTML = `
<div class="modal-backdrop" id="wine-modal" onclick="closeWineModal(event)">
  <div class="modal-sheet wine-modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title" id="wine-modal-title">🍷 와인 기록 추가</div>
    <div class="wine-form">
      <div class="wine-form-section">
        <div class="wine-form-row">
          <div class="wine-form-field" style="flex:3">
            <label class="wine-form-label">와인명 *</label>
            <input class="wine-form-input" id="wine-name" placeholder="예: Maggy Hawk Stormin">
          </div>
          <div class="wine-form-field" style="flex:1">
            <label class="wine-form-label">빈티지</label>
            <input class="wine-form-input" id="wine-vintage" placeholder="2021" type="number">
          </div>
        </div>
        <div class="wine-form-row">
          <div class="wine-form-field">
            <label class="wine-form-label">생산지</label>
            <input class="wine-form-input" id="wine-region" placeholder="예: 앤더슨 밸리, 캘리포니아">
          </div>
          <div class="wine-form-field">
            <label class="wine-form-label">품종</label>
            <input class="wine-form-input" id="wine-variety" placeholder="예: Pinot Noir">
          </div>
        </div>
        <div class="wine-form-field">
          <label class="wine-form-label">기록 날짜</label>
          <input class="wine-form-input" id="wine-date" type="date" min="2020-01-01" max="2099-12-31">
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">⭐ 나의 평가</div>
        <div class="wine-form-row" style="align-items:flex-end">
          <div class="wine-form-field" style="flex:1">
            <label class="wine-form-label">별점 (0.5~5.0)</label>
            <input class="wine-form-input" id="wine-taewoo" placeholder="4.5" type="number" min="0.5" max="5" step="0.5">
          </div>
          <div class="wine-form-field" style="flex:2">
            <label class="wine-form-label">한 줄 총평</label>
            <input class="wine-form-input" id="wine-taewoo-summary" placeholder="예: 우아한 피노 누아, 강추">
          </div>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">👁️ 색상</div>
        <div class="wine-form-field">
          <label class="wine-form-label">색상</label>
          <input class="wine-form-input" id="wine-color" placeholder="예: 맑고 투명한 루비색">
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">👃 향 & 👅 맛</div>
        <div class="wine-form-field">
          <label class="wine-form-label">향(Nose)</label>
          <textarea class="wine-form-input wine-form-textarea" id="wine-nose" placeholder="예: 라즈베리, 딸기, 사워체리의 고혹적인 향기" rows="2"></textarea>
        </div>
        <div class="wine-form-field">
          <label class="wine-form-label">맛(Palate)</label>
          <textarea class="wine-form-input wine-form-textarea" id="wine-palate" placeholder="예: 적당한 산도, 탄닌이 부드럽게 감싸는 맛" rows="3"></textarea>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">🏗️ 구조감 (0~5)</div>
        <div class="wine-form-row">
          <div class="wine-form-field"><label class="wine-form-label">당도</label><input class="wine-form-input" id="wine-sweetness" type="number" min="0" max="5" step="0.5" placeholder="0~5"></div>
          <div class="wine-form-field"><label class="wine-form-label">탄닌</label><input class="wine-form-input" id="wine-tannin"    type="number" min="0" max="5" step="0.5" placeholder="0~5"></div>
          <div class="wine-form-field"><label class="wine-form-label">산도</label><input class="wine-form-input" id="wine-acidity"   type="number" min="0" max="5" step="0.5" placeholder="0~5"></div>
          <div class="wine-form-field"><label class="wine-form-label">알코올</label><input class="wine-form-input" id="wine-alcohol"   type="number" min="0" max="5" step="0.5" placeholder="0~5"></div>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">📝 추가 감상평</div>
        <div class="wine-form-field">
          <textarea class="wine-form-input wine-form-textarea" id="wine-note" placeholder="자유로운 시음 메모" rows="3"></textarea>
        </div>
      </div>
      <div class="wine-form-section">
        <div class="wine-form-section-title">🖼️ 와인 사진</div>
        <div class="wine-form-row" style="align-items:flex-end">
          <div class="wine-form-field" style="flex:1">
            <label class="wine-form-label">사진 URL</label>
            <input class="wine-form-input" id="wine-image-url" placeholder="https://...">
          </div>
          <button class="wine-search-btn" onclick="searchWineImage()">이미지 검색</button>
        </div>
        <img id="wine-image-preview" style="display:none;width:80px;height:100px;object-fit:cover;border-radius:6px;margin-top:8px;border:1px solid var(--border)" alt="미리보기">
      </div>
      <div class="wine-form-actions">
        <button class="tds-btn cancel-btn ghost md" onclick="closeWineModal()">취소</button>
        <button class="tds-btn fill md"   onclick="saveWineFromModal()">저장하기</button>
      </div>
      <button class="tds-btn danger sm" id="wine-delete-btn" onclick="deleteWineFromModal()" style="display:none">🗑️ 기록 삭제</button>
    </div>
  </div>
</div>
`;
