// ================================================================
// admin/admin-actions.js — 관리도구 섹션 (편지, 패치노트, 푸시, 공지, 삭제)
// ================================================================

import {
  getAccountList, isAdminInstance, getAdminId,
  deleteUserAccount, sendNotification,
} from '../data.js';
import {
  db, doc, setDoc,
} from '../data/data-core.js';
import { showToast } from '../render-home.js';
import { fmtDate, nameResolver, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';

/**
 * 관리도구 섹션 렌더
 * @param {HTMLElement} container
 * @param {Object} data - { accs, letters, patchnotes, _name }
 * @param {Function} rerender - renderAdmin 재호출
 */
export function renderActionsSection(container, data, rerender) {
  const { accs, letters, patchnotes } = data;
  const _name = nameResolver(accs);

  const unreadCount = letters.filter(l => !l.read).length;

  container.innerHTML = `
    <!-- 개발자에게 온 편지 -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="${SECTION_TITLE};margin-bottom:0;">편지 <span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">${letters.length}통</span></div>
        ${unreadCount > 0 ? `<span style="font-size:10px;font-weight:600;color:#fff;background:#ef4444;border-radius:999px;padding:2px 8px;">${unreadCount} 안 읽음</span>` : ''}
      </div>
      ${letters.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">아직 편지가 없어요</div>' :
        letters.slice(0, 15).map(l => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);${!l.read ? 'background:rgba(49,130,246,0.04);margin:0 -16px;padding-left:16px;padding-right:16px;' : ''}" data-letter-id="${l.id}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              ${!l.read ? '<span style="width:7px;height:7px;border-radius:50%;background:#fa342c;flex-shrink:0;"></span>' : ''}
              <span style="font-size:13px;font-weight:600;color:var(--text);">${l.fromName || _name(l.from)}</span>
              <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${fmtDate(l.createdAt)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;word-break:break-word;">${(l.message || '').slice(0, 200)}${(l.message || '').length > 200 ? '…' : ''}</div>
            ${!l.read ? `<button onclick="window._adminMarkLetterRead('${l.id}')" style="margin-top:6px;padding:4px 12px;border:none;border-radius:8px;background:var(--surface2,#F2F4F6);color:var(--text-secondary);font-size:11px;cursor:pointer;">읽음 처리</button>` : ''}
          </div>
        `).join('')
      }
    </div>

    <!-- 패치노트 관리 -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="${SECTION_TITLE};margin-bottom:0;">패치노트 발행</div>
        <button onclick="window._adminOpenPatchnoteEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 패치노트</button>
      </div>
      ${patchnotes.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">발행된 패치노트가 없어요</div>' :
        patchnotes.slice(0, 10).map(p => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:600;color:var(--text);">${p.title || '제목 없음'}</span>
              <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${fmtDate(p.createdAt)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;">${(p.body || '').slice(0, 150)}${(p.body || '').length > 150 ? '…' : ''}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">읽은 사용자: ${(p.readBy || []).length}명</div>
          </div>
        `).join('')
      }
    </div>

    <!-- 개별 푸시 -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="${SECTION_TITLE};margin-bottom:0;">개별 푸시</div>
        <button onclick="window._adminOpenDirectPushEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#6366F1;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 보내기</button>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);">특정 사용자에게 인앱 알림 + 폰 푸시를 보냅니다.</div>
    </div>

    <!-- 운영자 공지 -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="${SECTION_TITLE};margin-bottom:0;">운영자 공지</div>
        <button onclick="window._adminOpenAnnouncementEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#F97316;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 공지</button>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);">공지는 모든 사용자의 알림 목록에 표시됩니다.</div>
    </div>
  `;
}

// ── window 함수 등록 (모달 에디터들) ─────────────────────────────

let _rerenderFn = null;
export function setRerender(fn) { _rerenderFn = fn; }

window._adminMarkLetterRead = async function(letterId) {
  try {
    await setDoc(doc(db, '_letters', letterId), { read: true }, { merge: true });
    if (_rerenderFn) _rerenderFn();
  } catch(e) { console.error('[admin] mark read:', e); }
};

window._adminOpenPatchnoteEditor = function() {
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:440px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">새 패치노트 발행</div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">제목</label>
        <input id="pn-title" type="text" placeholder="예: v1.2 업데이트" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#fa342c'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">내용</label>
        <textarea id="pn-body" style="width:100%;min-height:140px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="변경 사항을 적어주세요..." onfocus="this.style.borderColor='#fa342c'" onblur="this.style.borderColor='var(--border)'"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="pn-publish-btn" onclick="window._adminPublishPatchnote()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#fa342c;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">발행하기</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('pn-title')?.focus(), 200);
};

window._adminPublishPatchnote = async function() {
  const title = document.getElementById('pn-title')?.value.trim();
  const body = document.getElementById('pn-body')?.value.trim();
  if (!title || !body) { showToast('제목과 내용을 입력해주세요', 3000, 'warning'); return; }
  const btn = document.getElementById('pn-publish-btn');
  btn.textContent = '발행 중...'; btn.disabled = true;
  try {
    const id = 'pn_' + Date.now();
    await setDoc(doc(db, '_patchnotes', id), {
      id, title, body, createdAt: Date.now(), readBy: [],
    });
    const accs = await getAccountList();
    for (const acc of accs) {
      if (isAdminInstance(acc.id) || acc.id.includes('(guest)')) continue;
      await sendNotification(acc.id, {
        type: 'patchnote', from: getAdminId(),
        message: `📋 새 패치노트: ${title}`,
      });
    }
    document.getElementById('dynamic-modal')?.remove();
    showToast('패치노트를 발행했어요!', 3000, 'success');
    if (_rerenderFn) _rerenderFn();
  } catch(e) {
    console.error('[admin] publish:', e);
    showToast('발행 실패: ' + e.message, 3000, 'error');
    btn.textContent = '발행하기'; btn.disabled = false;
  }
};

window._adminOpenAnnouncementEditor = async function() {
  const accs = await getAccountList();
  const targets = accs.filter(a => a.id && !isAdminInstance(a.id) && !a.id.includes('(guest)'));
  const userListHtml = targets.map(a => {
    const nick = a.nickname || (a.lastName + a.firstName);
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" class="ann-user-cb" value="${a.id}" checked style="width:18px;height:18px;accent-color:#F97316;">
      <span style="font-size:13px;color:var(--text);">${nick}</span>
      <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto;">${a.id}</span>
    </label>`;
  }).join('');

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:440px;padding:24px;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">운영자 공지 발송</div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">제목</label>
        <input id="ann-title" type="text" placeholder="예: 서비스 점검 안내" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">내용</label>
        <textarea id="ann-body" style="width:100%;min-height:100px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="공지 내용을 적어주세요..." onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='var(--border)'"></textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);">대상 선택</label>
          <button onclick="window._adminToggleAllAnn()" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--primary);cursor:pointer;font-weight:600;">전체 선택/해제</button>
        </div>
        <div id="ann-user-list" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:4px 12px;">
          ${userListHtml}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">선택된 사용자: <span id="ann-selected-count">${targets.length}</span>명</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="ann-publish-btn" onclick="window._adminPublishAnnouncement()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#F97316;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">발송</button>
      </div>
    </div>
  </div>`;

  document.getElementById('ann-user-list')?.addEventListener('change', () => {
    const cnt = document.querySelectorAll('.ann-user-cb:checked').length;
    const el = document.getElementById('ann-selected-count');
    if (el) el.textContent = cnt;
  });
  setTimeout(() => document.getElementById('ann-title')?.focus(), 200);
};

window._adminToggleAllAnn = function() {
  const cbs = document.querySelectorAll('.ann-user-cb');
  const allChecked = [...cbs].every(c => c.checked);
  cbs.forEach(c => c.checked = !allChecked);
  const el = document.getElementById('ann-selected-count');
  if (el) el.textContent = allChecked ? '0' : cbs.length;
};

window._adminPublishAnnouncement = async function() {
  const title = document.getElementById('ann-title')?.value.trim();
  const body = document.getElementById('ann-body')?.value.trim();
  if (!title) { showToast('제목을 입력해주세요', 3000, 'warning'); return; }
  const selectedIds = [...document.querySelectorAll('.ann-user-cb:checked')].map(c => c.value);
  if (selectedIds.length === 0) { showToast('발송 대상을 선택해주세요', 3000, 'warning'); return; }
  const btn = document.getElementById('ann-publish-btn');
  btn.textContent = '발송 중...'; btn.disabled = true;
  try {
    for (const userId of selectedIds) {
      await sendNotification(userId, {
        type: 'announcement', from: getAdminId(),
        title, body: body || '',
        message: `📢 ${title}`,
      });
    }
    document.getElementById('dynamic-modal')?.remove();
    showToast(`${selectedIds.length}명에게 공지를 발송했어요!`, 3000, 'success');
    if (_rerenderFn) _rerenderFn();
  } catch(e) {
    console.error('[admin] announcement:', e);
    showToast('발송 실패: ' + e.message, 3000, 'error');
    btn.textContent = '발송'; btn.disabled = false;
  }
};

window._adminOpenDirectPushEditor = async function() {
  const accs = await getAccountList();
  const targets = accs.filter(a => a.id && !isAdminInstance(a.id) && !a.id.includes('(guest)'));
  targets.sort((a, b) => (a.nickname || a.lastName + a.firstName).localeCompare(b.nickname || b.lastName + b.firstName));
  const userOptionsHtml = targets.map(a => {
    const nick = a.nickname || (a.lastName + a.firstName);
    return `<option value="${a.id}">${nick} (${a.id})</option>`;
  }).join('');

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:440px;padding:24px;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">개별 푸시 메시지</div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">받는 사람</label>
        <select id="dm-target" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#6366F1'" onblur="this.style.borderColor='var(--border)'">
          <option value="">-- 선택 --</option>
          ${userOptionsHtml}
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">제목</label>
        <input id="dm-title" type="text" placeholder="예: 안녕하세요!" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#6366F1'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">내용</label>
        <textarea id="dm-body" style="width:100%;min-height:100px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="메시지 내용을 적어주세요..." onfocus="this.style.borderColor='#6366F1'" onblur="this.style.borderColor='var(--border)'"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="dm-send-btn" onclick="window._adminSendDirectPush()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#6366F1;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">보내기</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('dm-target')?.focus(), 200);
};

window._adminSendDirectPush = async function() {
  const targetId = document.getElementById('dm-target')?.value;
  const title = document.getElementById('dm-title')?.value.trim();
  const body = document.getElementById('dm-body')?.value.trim();
  if (!targetId) { showToast('받는 사람을 선택해주세요', 3000, 'warning'); return; }
  if (!title) { showToast('제목을 입력해주세요', 3000, 'warning'); return; }
  const btn = document.getElementById('dm-send-btn');
  btn.textContent = '보내는 중...'; btn.disabled = true;
  try {
    await sendNotification(targetId, {
      type: 'direct_message', from: getAdminId(),
      title, body: body || '',
      message: `📬 ${title}`,
    });
    document.getElementById('dynamic-modal')?.remove();
    showToast('푸시 메시지를 보냈어요!', 3000, 'success');
  } catch(e) {
    console.error('[admin] direct push:', e);
    showToast('발송 실패: ' + e.message, 3000, 'error');
    btn.textContent = '보내기'; btn.disabled = false;
  }
};

window._adminConfirmDeleteUser = function(userId, nick) {
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:380px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 12px;">⚠️</div>
        <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:6px;">사용자 삭제</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
          <b>${nick}</b> 계정을 삭제하시겠어요?<br>
          <span style="color:#ef4444;font-weight:600;">모든 데이터가 영구적으로 삭제됩니다.</span><br>
          <span style="font-size:11px;color:var(--text-tertiary);">운동·식단·목표·방명록·리액션 등 전체 삭제</span>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">확인을 위해 "<b>${nick}</b>" 입력</label>
        <input id="del-confirm-input" type="text" placeholder="${nick}" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#ef4444'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="del-exec-btn" onclick="window._adminExecDeleteUser('${userId}','${nick}')" style="flex:2;padding:14px;border:none;border-radius:12px;background:#ef4444;color:#fff;font-size:14px;font-weight:600;cursor:pointer;opacity:0.5;" disabled>삭제하기</button>
      </div>
    </div>
  </div>`;
  const inp = document.getElementById('del-confirm-input');
  const btn = document.getElementById('del-exec-btn');
  inp?.addEventListener('input', () => {
    const match = inp.value.trim() === nick;
    btn.disabled = !match;
    btn.style.opacity = match ? '1' : '0.5';
  });
  setTimeout(() => inp?.focus(), 200);
};

window._adminExecDeleteUser = async function(userId, nick) {
  const btn = document.getElementById('del-exec-btn');
  const inp = document.getElementById('del-confirm-input');
  if (inp?.value.trim() !== nick) return;
  btn.textContent = '삭제 중...'; btn.disabled = true;
  try {
    await deleteUserAccount(userId);
    document.getElementById('dynamic-modal')?.remove();
    showToast(`${nick} 계정을 삭제했어요`, 3000, 'success');
    if (_rerenderFn) _rerenderFn();
  } catch(e) {
    console.error('[admin] delete user:', e);
    showToast('삭제 실패: ' + e.message, 3000, 'error');
    btn.textContent = '삭제하기'; btn.disabled = false;
  }
};
