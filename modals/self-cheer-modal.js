// 유저가 직접 "축하받고 싶은 내용"을 설정하는 모달
// 규약:
//  1) 이름은 제외하고 본문만 작성 → 친구 화면에 "{name}님 {text}"로 표시
//  2) 당일에만 유효, 다음 날 자정에 자동 만료되어 시스템 자동 감지 축하로 복귀
export const MODAL_HTML = `
<div class="modal-backdrop" id="self-cheer-modal" onclick="closeSelfCheerModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">🎉 오늘 축하받고 싶은 일</div>
    <div class="self-cheer-body">
      <div class="self-cheer-hint">
        이름은 자동으로 앞에 붙어요. <strong>본문만</strong> 입력하세요.<br>
        예: "오늘 첫 5km 달리기 완주했어요!" → 친구 화면에 "<strong>줍스</strong>님 오늘 첫 5km 달리기 완주했어요!"<br>
        <span class="self-cheer-note">⏰ 당일 자정까지만 보이고, 다음 날엔 자동으로 시스템 감지 축하로 돌아갑니다.</span>
      </div>
      <textarea id="self-cheer-text" class="self-cheer-textarea" rows="3" maxlength="120"
                placeholder="축하받고 싶은 한 줄을 적어보세요"></textarea>
      <div id="self-cheer-preview" class="self-cheer-preview">미리보기: (입력 시 표시)</div>
      <div id="self-cheer-current" class="self-cheer-current"></div>
      <div class="self-cheer-actions">
        <button class="tds-btn cancel-btn ghost md" onclick="closeSelfCheerModal()">취소</button>
        <button class="tds-btn ghost md self-cheer-clear" onclick="clearSelfCheerFromModal()">지우기</button>
        <button class="tds-btn fill md" onclick="saveSelfCheerFromModal()">저장</button>
      </div>
    </div>
  </div>
</div>
`;
