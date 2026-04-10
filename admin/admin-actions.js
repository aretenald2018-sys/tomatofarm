// ================================================================
// admin/admin-actions.js — 관리도구 섹션 (편지, 패치노트, 푸시, 공지, 삭제)
// ================================================================

import {
  getAccountList, isAdminInstance, getAdminId,
  deleteUserAccount, sendNotification, getHeroMessage, saveHeroMessage, dateKey, TODAY, saveAccount,
} from '../data.js';
import {
  db, doc, setDoc, deleteDoc,
} from '../data/data-core.js';
import { showToast } from '../render-home.js';
import { fmtDate, nameResolver, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';

function _escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _heroMessageUsers = [];
let _welcomeBackUsers = [];
let _heroMessageSelected = new Set();
const _actionsExpanded = {
  letters: false,
  patchnotes: false,
  direct_push: false,
  announcements: false,
  hero_messages: false,
  welcome_back: false,
};

function _todayDateKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function _renderActionCard(key, title, rightHtml, bodyHtml, subtitle = '') {
  const expanded = !!_actionsExpanded[key];
  return `
    <div style="${CARD_STYLE}">
      <button onclick="window._toggleAdminActionCard('${key}')" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:0;border:none;background:transparent;cursor:pointer;text-align:left;">
        <div>
          <div style="${SECTION_TITLE};margin-bottom:0;">${title}</div>
          ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">${subtitle}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${rightHtml || ''}
          <span style="font-size:16px;color:var(--text-tertiary);transform:${expanded ? 'rotate(180deg)' : 'rotate(0deg)'};transition:transform .18s ease;">⌃</span>
        </div>
      </button>
      <div style="display:${expanded ? 'block' : 'none'};margin-top:${expanded ? '12px' : '0'};">
        ${bodyHtml}
      </div>
    </div>
  `;
}

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
    ${_renderActionCard(
      'letters',
      `편지 <span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">${letters.length}통</span>`,
      unreadCount > 0 ? `<span style="font-size:10px;font-weight:600;color:#fff;background:#ef4444;border-radius:999px;padding:2px 8px;">${unreadCount} 안 읽음</span>` : '',
      letters.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">아직 편지가 없어요</div>' :
        letters.slice(0, 15).map(l => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);${!l.read ? 'background:rgba(49,130,246,0.04);margin:0 -16px;padding-left:16px;padding-right:16px;' : ''}" data-letter-id="${l.id}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              ${!l.read ? '<span style="width:7px;height:7px;border-radius:50%;background:#fa342c;flex-shrink:0;"></span>' : ''}
              <span style="font-size:13px;font-weight:600;color:var(--text);">${l.fromName || _name(l.from)}</span>
              <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${fmtDate(l.createdAt)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;word-break:break-word;">${(l.message || '').slice(0, 200)}${(l.message || '').length > 200 ? '…' : ''}</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
              ${!l.read ? `<button onclick="window._adminMarkLetterRead('${l.id}')" style="padding:4px 12px;border:none;border-radius:8px;background:var(--surface2,#F2F4F6);color:var(--text-secondary);font-size:11px;cursor:pointer;">읽음 처리</button>` : ''}
              <button onclick="window._adminDeleteLetter('${l.id}')" style="padding:4px 12px;border:none;border-radius:8px;background:#FEE2E2;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;">삭제</button>
            </div>
          </div>
        `).join('')
      ,
      '개발자에게 온 편지를 확인하고 정리합니다.',
    )}

    ${_renderActionCard(
      'patchnotes',
      '패치노트 발행',
      `<button onclick="event.stopPropagation();window._adminOpenPatchnoteEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 패치노트</button>`,
      patchnotes.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">발행된 패치노트가 없어요</div>' :
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
      ,
      '새 패치노트를 발행하고 읽음 현황을 봅니다.',
    )}

    ${_renderActionCard(
      'direct_push',
      '개별 푸시',
      `<button onclick="event.stopPropagation();window._adminOpenDirectPushEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#6366F1;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 보내기</button>`,
      '<div style="font-size:11px;color:var(--text-tertiary);">특정 사용자에게 인앱 알림 + 폰 푸시를 보냅니다.</div>',
      '필요할 때만 열어서 개별 메시지를 발송합니다.',
    )}

    ${_renderActionCard(
      'announcements',
      '운영자 공지',
      `<button onclick="event.stopPropagation();window._adminOpenAnnouncementEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#F97316;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 공지</button>`,
      '<div style="font-size:11px;color:var(--text-tertiary);">공지는 모든 사용자의 알림 목록에 표시됩니다.</div>',
      '전체 또는 선택 사용자에게 운영 공지를 발송합니다.',
    )}

    ${_renderActionCard(
      'hero_messages',
      '오늘의 개인 메시지',
      `<input id="hero-msg-date" type="date" value="${_todayDateKey()}" onchange="window._adminRenderHeroMessages()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;">`,
      `<div style="margin-bottom:10px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">선택 사용자 일괄 메시지</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <input id="hero-msg-bulk-emoji" type="text" maxlength="4" placeholder="앞 이모지" aria-label="메시지 앞 이모지" title="메시지 앞 이모지" style="width:88px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;text-align:center;">
          <input id="hero-msg-bulk-text" type="text" placeholder="체크한 사용자에게 보낼 같은 메시지" style="flex:1;min-width:180px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
          <button onclick="window._adminFillHeroMessages()" style="padding:0 14px;border:none;border-radius:10px;background:#6366F1;color:#fff;font-size:12px;font-weight:700;cursor:pointer;min-height:40px;">빈칸 채우기</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;">앞 이모지는 메시지 맨 앞에 붙습니다. 예: ✉️ 오늘도 한 번만 더!</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="tds-btn secondary sm" onclick="window._adminToggleAllHeroTargets()">전체 선택/해제</button>
          <button class="tds-btn tonal sm" onclick="window._adminApplyHeroMessageToSelected()">선택 사용자에게 보내기</button>
          <div style="font-size:11px;color:var(--text-tertiary);margin-left:auto;">선택 <span id="hero-msg-selected-count">0</span>명</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;">저장하지 않으면 기존 자동 메시지가 그대로 표시됩니다.</div>
      <div id="admin-hero-message-list">
        <div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">불러오는 중...</div>
      </div>
      `,
      '히어로 카드 상단 문구를 사용자별로 지정합니다.',
    )}

    ${_renderActionCard(
      'welcome_back',
      '복귀 팝업 설정',
      `<div style="font-size:11px;color:var(--text-tertiary);">사용자별 기준일/메시지</div>`,
      `<div id="admin-welcome-back-list">
        <div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">불러오는 중...</div>
      </div>
      `,
      '며칠 이상 미접속 시 복귀 팝업을 띄울지 멤버별로 설정합니다.',
    )}
  `;

  window._adminRenderHeroMessages?.();
  window._adminRenderWelcomeBackSettings?.();
}

// ── window 함수 등록 (모달 에디터들) ─────────────────────────────

let _rerenderFn = null;
export function setRerender(fn) { _rerenderFn = fn; }

window._toggleAdminActionCard = function(key) {
  _actionsExpanded[key] = !_actionsExpanded[key];
  if (_rerenderFn) _rerenderFn();
};

window._adminMarkLetterRead = async function(letterId) {
  try {
    await setDoc(doc(db, '_letters', letterId), { read: true }, { merge: true });
    if (_rerenderFn) _rerenderFn();
  } catch(e) { console.error('[admin] mark read:', e); }
};

window._adminDeleteLetter = async function(letterId) {
  if (!confirm('이 편지를 삭제할까요?')) return;
  try {
    await deleteDoc(doc(db, '_letters', letterId));
    showToast('편지를 삭제했어요', 2500, 'success');
    if (_rerenderFn) _rerenderFn();
  } catch (e) {
    console.error('[admin] delete letter:', e);
    showToast('편지 삭제 실패: ' + e.message, 3000, 'error');
  }
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

window._adminRenderHeroMessages = async function() {
  const wrap = document.getElementById('admin-hero-message-list');
  if (!wrap) return;

  const selectedDate = document.getElementById('hero-msg-date')?.value || _todayDateKey();
  const accs = await getAccountList();
  _heroMessageUsers = accs
    .filter((acc) => acc.id && !isAdminInstance(acc.id) && !acc.id.includes('(guest)'))
    .sort((a, b) => (a.nickname || `${a.lastName || ''}${a.firstName || ''}`).localeCompare(b.nickname || `${b.lastName || ''}${b.firstName || ''}`));

  const messages = await Promise.all(_heroMessageUsers.map((acc) => getHeroMessage(acc.id, selectedDate)));
  const validIds = new Set(_heroMessageUsers.map((acc) => acc.id));
  _heroMessageSelected = new Set([..._heroMessageSelected].filter((id) => validIds.has(id)));

  wrap.innerHTML = _heroMessageUsers.map((acc, idx) => {
    const nick = acc.nickname || `${acc.lastName || ''}${acc.firstName || ''}` || acc.id;
    const msg = messages[idx];
    const checked = _heroMessageSelected.has(acc.id);
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);">
        <button type="button" class="hero-msg-target-toggle" data-user-id="${acc.id}" aria-pressed="${checked ? 'true' : 'false'}" onclick="window._adminToggleHeroTarget('${acc.id}')" style="margin-top:4px;min-width:68px;min-height:36px;padding:0 12px;border:${checked ? '1px solid #fa342c' : '1px solid var(--border)'};border-radius:999px;background:${checked ? 'var(--primary-bg)' : 'var(--surface)'};color:${checked ? '#fa342c' : 'var(--text-secondary)'};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0;box-sizing:border-box;">${checked ? '선택됨' : '선택'}</button>
        <div style="width:108px;flex-shrink:0;padding-top:6px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${_escapeHtml(nick)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;">${_escapeHtml(acc.id)}</div>
        </div>
        <input id="hero-msg-emoji-${idx}" type="text" maxlength="4" value="${_escapeHtml(msg?.emoji || '')}" placeholder="앞 이모지" aria-label="개별 메시지 이모지" title="개별 메시지 앞 이모지" style="width:72px;padding:10px 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:12px;text-align:center;box-sizing:border-box;">
        <input id="hero-msg-text-${idx}" type="text" value="${_escapeHtml(msg?.message || '')}" placeholder="미설정 시 자동 메시지 유지" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
        <button onclick="window._adminSaveHeroMessage(${idx})" style="padding:10px 12px;border:none;border-radius:10px;background:#fa342c;color:#fff;font-size:12px;font-weight:700;cursor:pointer;min-height:40px;">저장</button>
      </div>
    `;
  }).join('') || '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">대상 사용자가 없어요</div>';
  const countEl = document.getElementById('hero-msg-selected-count');
  if (countEl) countEl.textContent = _heroMessageSelected.size;
};

window._adminFillHeroMessages = function() {
  const emoji = document.getElementById('hero-msg-bulk-emoji')?.value || '';
  const text = document.getElementById('hero-msg-bulk-text')?.value?.trim() || '';
  if (!text) {
    showToast('채울 메시지를 입력해주세요', 2500, 'warning');
    return;
  }

  _heroMessageUsers.forEach((_, idx) => {
    const textEl = document.getElementById(`hero-msg-text-${idx}`);
    const emojiEl = document.getElementById(`hero-msg-emoji-${idx}`);
    if (textEl && !textEl.value.trim()) textEl.value = text;
    if (emojiEl && !emojiEl.value.trim() && emoji) emojiEl.value = emoji;
  });
};

window._adminToggleHeroTarget = function(userId, checked) {
  if (!userId) return;
  const nextChecked = typeof checked === 'boolean' ? checked : !_heroMessageSelected.has(userId);
  if (nextChecked) _heroMessageSelected.add(userId);
  else _heroMessageSelected.delete(userId);
  const btn = [...document.querySelectorAll('.hero-msg-target-toggle')].find((el) => el.dataset.userId === userId);
  if (btn) {
    btn.setAttribute('aria-pressed', nextChecked ? 'true' : 'false');
    btn.style.border = nextChecked ? '1px solid #fa342c' : '1px solid var(--border)';
    btn.style.background = nextChecked ? 'var(--primary-bg)' : 'var(--surface)';
    btn.style.color = nextChecked ? '#fa342c' : 'var(--text-secondary)';
    btn.textContent = nextChecked ? '선택됨' : '선택';
  }
  const countEl = document.getElementById('hero-msg-selected-count');
  if (countEl) countEl.textContent = _heroMessageSelected.size;
};

window._adminToggleAllHeroTargets = function() {
  const allIds = _heroMessageUsers.map((acc) => acc.id);
  const shouldSelectAll = allIds.some((id) => !_heroMessageSelected.has(id));
  _heroMessageSelected = shouldSelectAll ? new Set(allIds) : new Set();
  document.querySelectorAll('.hero-msg-target-toggle').forEach((btn) => {
    btn.setAttribute('aria-pressed', shouldSelectAll ? 'true' : 'false');
    btn.style.border = shouldSelectAll ? '1px solid #fa342c' : '1px solid var(--border)';
    btn.style.background = shouldSelectAll ? 'var(--primary-bg)' : 'var(--surface)';
    btn.style.color = shouldSelectAll ? '#fa342c' : 'var(--text-secondary)';
    btn.textContent = shouldSelectAll ? '선택됨' : '선택';
  });
  const countEl = document.getElementById('hero-msg-selected-count');
  if (countEl) countEl.textContent = _heroMessageSelected.size;
};

window._adminApplyHeroMessageToSelected = async function() {
  const selectedDate = document.getElementById('hero-msg-date')?.value || _todayDateKey();
  const text = document.getElementById('hero-msg-bulk-text')?.value?.trim() || '';
  const emoji = document.getElementById('hero-msg-bulk-emoji')?.value?.trim() || '';
  const selectedUsers = _heroMessageUsers.filter((acc) => _heroMessageSelected.has(acc.id));

  if (!selectedUsers.length) {
    showToast('메시지를 보낼 사용자를 선택해주세요', 2500, 'warning');
    return;
  }
  if (!text) {
    showToast('같이 보낼 메시지를 입력해주세요', 2500, 'warning');
    return;
  }

  await Promise.all(selectedUsers.map((acc) => saveHeroMessage(acc.id, selectedDate, text, emoji)));
  await window._adminRenderHeroMessages();
  showToast(`${selectedUsers.length}명에게 같은 개인 메시지를 적용했어요`, 2500, 'success');
};

window._adminSaveHeroMessage = async function(index) {
  const acc = _heroMessageUsers[index];
  if (!acc) return;
  const selectedDate = document.getElementById('hero-msg-date')?.value || _todayDateKey();
  const text = document.getElementById(`hero-msg-text-${index}`)?.value?.trim() || '';
  const emoji = document.getElementById(`hero-msg-emoji-${index}`)?.value?.trim() || '';

  if (!text) {
    showToast('메시지를 입력해주세요', 2500, 'warning');
    return;
  }

  await saveHeroMessage(acc.id, selectedDate, text, emoji);
  showToast('개인 메시지를 저장했어요', 2500, 'success');
};

window._adminRenderWelcomeBackSettings = async function() {
  const wrap = document.getElementById('admin-welcome-back-list');
  if (!wrap) return;

  const accs = await getAccountList();
  _welcomeBackUsers = accs
    .filter((acc) => acc.id && !isAdminInstance(acc.id) && !acc.id.includes('(guest)'))
    .sort((a, b) => (a.nickname || `${a.lastName || ''}${a.firstName || ''}`).localeCompare(b.nickname || `${b.lastName || ''}${b.firstName || ''}`));

  wrap.innerHTML = _welcomeBackUsers.map((acc, idx) => {
    const nick = acc.nickname || `${acc.lastName || ''}${acc.firstName || ''}` || acc.id;
    const thresholdDays = Number(acc.welcomeBackThresholdHours || 24) / 24;
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="width:92px;flex-shrink:0;padding-top:10px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${_escapeHtml(nick)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;">${_escapeHtml(acc.id)}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="welcome-back-days-${idx}" type="number" min="0" step="1" value="${thresholdDays}" style="width:68px;padding:10px 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;text-align:center;box-sizing:border-box;">
            <input id="welcome-back-title-${idx}" type="text" value="${_escapeHtml(acc.welcomeBackCustomTitle || '')}" placeholder="제목 비우면 자동" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
          </div>
          <input id="welcome-back-badge-${idx}" type="text" value="${_escapeHtml(acc.welcomeBackCustomBadge || '')}" placeholder="보조 문구 비우면 자동 예: 8일... 보고 싶었어요" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="welcome-back-text-${idx}" type="text" value="${_escapeHtml(acc.welcomeBackCustomMessage || '')}" placeholder="본문 비우면 자동 메시지" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
            <button onclick="window._adminSaveWelcomeBack(${idx})" style="padding:10px 12px;border:none;border-radius:10px;background:#F97316;color:#fff;font-size:12px;font-weight:700;cursor:pointer;min-height:40px;">저장</button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">대상 사용자가 없어요</div>';
};

window._adminSaveWelcomeBack = async function(index) {
  const acc = _welcomeBackUsers[index];
  if (!acc) return;

  const days = Math.max(0, Number(document.getElementById(`welcome-back-days-${index}`)?.value || 0));
  const customTitle = document.getElementById(`welcome-back-title-${index}`)?.value?.trim() || '';
  const customBadge = document.getElementById(`welcome-back-badge-${index}`)?.value?.trim() || '';
  const customMessage = document.getElementById(`welcome-back-text-${index}`)?.value?.trim() || '';
  acc.welcomeBackThresholdHours = Math.round(days * 24);
  acc.welcomeBackCustomTitle = customTitle;
  acc.welcomeBackCustomBadge = customBadge;
  acc.welcomeBackCustomMessage = customMessage;
  await saveAccount(acc);
  showToast('복귀 팝업 설정을 저장했어요', 2500, 'success');
};
