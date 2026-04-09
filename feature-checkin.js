// ================================================================
// feature-checkin.js — 체크인 모달 (체중/체지방 기록)
// ================================================================

import { dateKey, TODAY, saveBodyCheckin, deleteBodyCheckin, getBodyCheckins } from './data.js';

let _checkinId = null;

function openCheckinModal(id) {
  _checkinId = id || null;
  if (id) {
    const rec = getBodyCheckins().find(c => c.id === id);
    if (rec) {
      document.getElementById('ci-date').value   = rec.date || '';
      document.getElementById('ci-weight').value = rec.weight || '';
      document.getElementById('ci-bodyfat').value= rec.bodyFatPct || '';
      document.getElementById('ci-note').value   = rec.note || '';
    }
    document.getElementById('ci-delete-btn').style.display = 'inline-block';
  } else {
    const t = TODAY;
    document.getElementById('ci-date').value   = dateKey(t.getFullYear(), t.getMonth(), t.getDate());
    document.getElementById('ci-weight').value = '';
    document.getElementById('ci-bodyfat').value= '';
    document.getElementById('ci-note').value   = '';
    document.getElementById('ci-delete-btn').style.display = 'none';
  }
  document.getElementById('checkin-modal').classList.add('open');
}

function closeCheckinModal(e) { window._closeModal('checkin-modal', e); }

async function saveCheckinFromModal() {
  const date   = document.getElementById('ci-date').value;
  const weight = parseFloat(document.getElementById('ci-weight').value);
  const bf     = parseFloat(document.getElementById('ci-bodyfat').value);
  const note   = document.getElementById('ci-note').value.trim();
  if (!date || !weight) { alert('날짜와 체중을 입력해주세요.'); return; }
  const rec = {
    id:         _checkinId || `ci_${Date.now()}`,
    date,
    weight,
    bodyFatPct: bf || null,
    note:       note || null,
  };
  await saveBodyCheckin(rec);

  document.getElementById('checkin-modal').classList.remove('open');
  window.renderAll();
}

async function deleteCheckinFromModal() {
  if (!_checkinId) return;
  if (!confirm('체크인 기록을 삭제할까요?')) return;
  await deleteBodyCheckin(_checkinId);
  document.getElementById('checkin-modal').classList.remove('open');
  window.renderAll();
}

Object.assign(window, {
  openCheckinModal,
  closeCheckinModal,
  saveCheckinFromModal,
  deleteCheckinFromModal,
});
