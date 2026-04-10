export const MODAL_HTML = `
<div class="modal-backdrop" id="guild-modal" onclick="closeGuildModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="gm-modal-header">
      <div class="modal-title tds-modal-title">소속 길드</div>
      <button class="gm-close-btn" type="button" onclick="closeGuildModal()">닫기</button>
    </div>

    <div id="guild-modal-list" class="gm-section"></div>

    <div id="guild-modal-members"></div>

    <div class="gm-section">
      <div class="gm-section-label">길드 추가</div>
      <div class="gm-search-wrap">
        <input class="gm-search-input" id="gm-guild-input" placeholder="가입할 길드를 검색하세요" maxlength="20" autocomplete="off"
               oninput="searchGuildsForModal(this.value)" onfocus="searchGuildsForModal(this.value)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addGuildFromModal();}">
        <div id="gm-guild-suggestions" class="guild-suggest-list" style="display:none;"></div>
      </div>
      <div class="gm-hint">기존 길드는 검색해서 추가하고, 새 길드는 아래에서 만들 수 있어요.</div>
      <div class="gm-create-row">
        <input class="gm-search-input" id="gm-create-guild-input" placeholder="새 길드 이름" maxlength="20" autocomplete="off"
               onkeydown="if(event.key==='Enter'){event.preventDefault();createGuildFromModal();}">
        <button class="tds-btn fill md gm-create-btn" type="button" onclick="createGuildFromModal()">길드 만들기</button>
      </div>
    </div>
  </div>
</div>
`;
