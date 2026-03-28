// ================================================================
// modals/streak-settings-modal.js
// ================================================================

export const MODAL_HTML = `
<div class="modal-overlay" id="streak-settings-modal" onclick="closeStreakSettingsModal(event)" style="display:none;z-index:1001">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">Streak 탭 세팅</div>
    <div class="ex-editor-form" style="padding-bottom:8px">

      <!-- Font Size Setting -->
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:8px;font-weight:600">일정 글자 크기</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="font-size" value="small" style="cursor:pointer">
            작음
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="font-size" value="default" checked style="cursor:pointer">
            기본
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="font-size" value="large" style="cursor:pointer">
            큼
          </label>
        </div>
      </div>

      <!-- Cell Width Setting -->
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:8px;font-weight:600">셀 너비</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="cell-width" value="small" style="cursor:pointer">
            좁음
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="cell-width" value="default" checked style="cursor:pointer">
            기본
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="cell-width" value="large" style="cursor:pointer">
            넓음
          </label>
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:8px">
        <button class="ex-editor-save" onclick="saveStreakSettingsAndClose()" style="flex:1">저장</button>
        <button class="ex-editor-cancel" onclick="closeStreakSettingsModal()" style="flex:1">취소</button>
      </div>
    </div>
  </div>
</div>
`;

// 전역 상태 저장
window._streakSettingsData = null;

// 모달 열기
export async function openStreakSettingsModal() {
  const { getStreakSettings } = await import('../data.js');
  const settings = getStreakSettings();
  window._streakSettingsData = { ...settings };

  // 현재 설정값으로 라디오 버튼 초기화
  document.querySelector(`input[name="font-size"][value="${settings.fontSizeMode}"]`).checked = true;
  document.querySelector(`input[name="cell-width"][value="${settings.cellWidthMode}"]`).checked = true;

  // 모달 열기
  const modal = document.getElementById('streak-settings-modal');
  modal.style.display = 'flex';
}

// 모달 닫기
export function closeStreakSettingsModal(e) {
  if (e && e.target !== document.getElementById('streak-settings-modal')) return;
  document.getElementById('streak-settings-modal').style.display = 'none';
  window._streakSettingsData = null;
}

// 저장 및 닫기
export async function saveStreakSettingsAndClose() {
  const { saveStreakSettings } = await import('../data.js');
  const fontSizeMode = document.querySelector('input[name="font-size"]:checked')?.value || 'default';
  const cellWidthMode = document.querySelector('input[name="cell-width"]:checked')?.value || 'default';

  // Firebase에 저장
  await saveStreakSettings('fontSizeMode', fontSizeMode);
  await saveStreakSettings('cellWidthMode', cellWidthMode);

  // 캘린더 재렌더링
  if (window.renderCalendar) {
    window.renderCalendar();
  }

  // 모달 닫기
  document.getElementById('streak-settings-modal').style.display = 'none';
  window._streakSettingsData = null;
}

// 전역 window에 함수 노출
window.openStreakSettingsModal = openStreakSettingsModal;
window.closeStreakSettingsModal = closeStreakSettingsModal;
window.saveStreakSettingsAndClose = saveStreakSettingsAndClose;
