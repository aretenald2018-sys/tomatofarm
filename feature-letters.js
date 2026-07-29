// ================================================================
// feature-letters.js — 개발자에게 편지 (작성 + 요청 상태)
// ================================================================

import { showToast } from './ui/toast.js';

export function _letterEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function _letterTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function _letterPreview(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  return text.length > 70 ? `${text.slice(0, 70)}...` : text;
}

export async function renderLetterStatusList() {
  const list = document.getElementById('letter-status-list');
  if (!list) return;
  list.innerHTML = '<div class="letter-status-empty">불러오는 중...</div>';

  try {
    const { getMyDeveloperLetters, getDeveloperLetterStatus, getDeveloperLetterStatusMeta } = await import('./data.js');
    const letters = await getMyDeveloperLetters(8);
    if (!document.getElementById('letter-status-list')) return;

    if (!letters.length) {
      list.innerHTML = '<div class="letter-status-empty">아직 보낸 요청이 없어요</div>';
      return;
    }

    list.innerHTML = letters.map((letter) => {
      const meta = getDeveloperLetterStatusMeta(getDeveloperLetterStatus(letter));
      return `
        <div class="letter-status-row">
          <div class="letter-status-main">
            <div class="letter-status-message">${_letterEscape(_letterPreview(letter.message))}</div>
            <div class="letter-status-time">${_letterEscape(_letterTime(letter.createdAt))}</div>
          </div>
          <span class="letter-status-chip letter-status-chip--${meta.key}">${_letterEscape(meta.label)}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.warn('[letter-status]', e);
    list.innerHTML = '<div class="letter-status-empty">상태를 불러오지 못했어요</div>';
  }
}

export async function openLetterModal() {
  const { getCurrentUser } = await import('./data.js');
  const user = getCurrentUser();
  if (!user) return;
  const nick = user.nickname || `${user.lastName || ''}${user.firstName || ''}` || '회원';

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" data-login-action="close-dynamic-modal">
    <div class="modal-sheet" style="max-width:420px;padding:24px;max-height:85vh;overflow-y:auto;">
      <div class="sheet-handle"></div>
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;margin-bottom:8px;">✉️</div>
        <div style="font-size:17px;font-weight:700;color:var(--text);">개발자에게 편지</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">${_letterEscape(nick)}님의 요청 상태도 여기서 확인할 수 있어요</div>
      </div>
      <textarea id="letter-text" style="width:100%;min-height:120px;padding:14px 16px;border:1.5px solid var(--border);border-radius:12px;font-size:14px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;transition:border-color 0.15s;" placeholder="편하게 적어주세요..."></textarea>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button data-login-action="close-dynamic-modal" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>
        <button id="letter-send-btn" data-login-action="send-letter" style="flex:2;padding:14px;border:none;border-radius:12px;background:#fa342c;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">보내기</button>
      </div>
      <div class="letter-status-panel">
        <div class="letter-status-head">
          <span>내 요청 현황</span>
          <button type="button" data-login-action="refresh-letter-status">새로고침</button>
        </div>
        <div id="letter-status-list" class="letter-status-list">
          <div class="letter-status-empty">불러오는 중...</div>
        </div>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('letter-text')?.focus(), 200);
  renderLetterStatusList();
}

export async function sendLetter() {
  const text = document.getElementById('letter-text')?.value.trim();
  if (!text) return;
  const btn = document.getElementById('letter-send-btn');
  btn.textContent = '보내는 중...'; btn.disabled = true;
  try {
    const { sendDeveloperLetter } = await import('./data.js');
    await sendDeveloperLetter(text);
    const textarea = document.getElementById('letter-text');
    if (textarea) textarea.value = '';
    btn.textContent = '보내기'; btn.disabled = false;
    renderLetterStatusList();
    showToast('편지를 보냈어요. 상태는 시행전으로 표시됩니다', 2500, 'success');
  } catch(e) {
    console.error('[letter]', e);
    showToast('전송 실패: ' + e.message, 3000, 'error');
    btn.textContent = '보내기'; btn.disabled = false;
  }
}
