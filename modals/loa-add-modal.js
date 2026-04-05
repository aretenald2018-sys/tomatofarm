export const MODAL_HTML = `
<div class="modal-backdrop" id="loa-add-modal" onclick="closeLoaAddModal(event)">
<div class="modal-sheet">
<div class="sheet-handle"></div>
<div class="modal-title">👤 캐릭터 등록</div>
<div class="ex-editor-form">
<div>
<div class="ex-editor-label">캐릭터 명 입력 (원정대 전체 조회)</div>
<div style="display:flex;gap:8px;">
<input class="ex-editor-input" id="loa-search-name" placeholder="닉네임을 입력하세요"
onkeydown="if(event.key==='Enter') searchLoaSiblings()">
<button class="loa-search-btn" id="loa-search-btn" onclick="searchLoaSiblings()">검색</button>
</div>
<div id="loa-search-error" style="font-size:11px;color:var(--diet-bad);margin-top:4px;"></div>
</div>
<div id="loa-sibling-list" class="loa-sibling-list"></div>
<button class="tds-btn cancel-btn ghost md" onclick="closeLoaAddModal()" style="margin-top:4px;">닫기</button>
</div>
</div>
</div>
`;
