// ================================================================
// modals/patchnote-modal.js — 패치노트 상세 모달
// ================================================================

import { getPatchnote, markPatchnoteRead } from '../data.js';

export const MODAL_HTML = `
<div class="modal-backdrop" id="patchnote-modal" onclick="closePatchnote(event)" style="display:none;z-index:1003">
  <div class="modal-sheet" style="padding:32px 20px 20px 20px;max-width:480px;">
    <div class="sheet-handle"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="font-size:22px;">📋</div>
      <div style="font-size:12px;font-weight:700;color:var(--primary);letter-spacing:0.3px;">패치노트</div>
    </div>
    <div id="patchnote-title" style="font-size:20px;line-height:29px;font-weight:700;color:var(--text);margin-bottom:6px;"></div>
    <div id="patchnote-date" style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;"></div>
    <div id="patchnote-body" style="font-size:14px;line-height:1.6;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:55vh;overflow-y:auto;padding:14px 16px;background:var(--seed-bg-layer, var(--bg-secondary));border-radius:14px;border:1px solid var(--seed-stroke-neutral, var(--border));"></div>
    <div style="margin-top:20px;">
      <button class="tds-btn fill md" onclick="closePatchnote()" style="width:100%;font-size:15px;padding:14px;">확인</button>
    </div>
  </div>
</div>
`;

function _fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${dd}`;
}

window.openPatchnote = async function(patchnoteId, fallback) {
  const modal = document.getElementById('patchnote-modal');
  if (!modal) return;

  const titleEl = document.getElementById('patchnote-title');
  const dateEl = document.getElementById('patchnote-date');
  const bodyEl = document.getElementById('patchnote-body');

  // 낙관적 초기 표시: fallback이 있으면 즉시 보여주고, Firestore fetch로 덮어쓴다.
  titleEl.textContent = fallback?.title || (patchnoteId ? '불러오는 중...' : '패치노트');
  dateEl.textContent = fallback?.createdAt ? _fmtDate(fallback.createdAt) : '';
  bodyEl.textContent = fallback?.body || '';

  modal.style.display = 'flex';

  let fetched = null;
  if (patchnoteId) {
    fetched = await getPatchnote(patchnoteId);
  }

  const data = fetched || fallback;
  if (!data) {
    titleEl.textContent = '패치노트를 찾을 수 없어요';
    dateEl.textContent = '';
    bodyEl.textContent = '삭제된 노트이거나 일시적인 오류일 수 있어요.';
    return;
  }

  titleEl.textContent = data.title || '패치노트';
  dateEl.textContent = _fmtDate(data.createdAt);
  bodyEl.textContent = data.body || '';

  // 실제 문서가 로드된 경우에만 readBy에 집계 (fallback만 보여줬다면 스킵)
  if (patchnoteId && fetched) {
    markPatchnoteRead(patchnoteId).catch(() => {});
  }
};

window.closePatchnote = function(e) {
  if (e && e.target && e.target !== document.getElementById('patchnote-modal')) return;
  const modal = document.getElementById('patchnote-modal');
  if (modal) modal.style.display = 'none';
};
