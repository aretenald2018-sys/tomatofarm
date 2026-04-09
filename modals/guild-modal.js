export const MODAL_HTML = `
<div class="modal-backdrop" id="guild-modal" onclick="closeGuildModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">🏠 소속 길드</div>

    <div id="guild-modal-list" style="margin-bottom:16px;"></div>

    <div id="guild-modal-members" style="margin-bottom:16px;"></div>

    <div id="guild-modal-input-section" style="position:relative;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;">길드 추가</div>
      <div style="position:relative;">
        <input class="ex-editor-input" id="gm-guild-input" placeholder="길드 이름을 검색하거나 입력하세요" maxlength="20" style="width:100%;" autocomplete="off"
               oninput="searchGuildsForModal(this.value)" onfocus="searchGuildsForModal(this.value)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addGuildFromModal();}">
        <div id="gm-guild-suggestions" class="guild-suggest-list" style="display:none;"></div>
      </div>
    </div>

    <div class="ex-editor-actions">
      <button class="tds-btn cancel-btn ghost md" onclick="closeGuildModal()">취소</button>
      <button class="tds-btn fill md" onclick="saveGuildFromModal()">저장하기</button>
    </div>
  </div>
</div>
`;
