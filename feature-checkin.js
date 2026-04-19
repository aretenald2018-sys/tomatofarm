// ================================================================
// feature-checkin.js — 체크인 모달 (체중/체지방 기록)
// ================================================================

import { dateKey, TODAY, saveBodyCheckin, deleteBodyCheckin, getBodyCheckins } from './data.js';
import { showToast } from './home/utils.js';
import { openWeightResultModal } from './modals/weight-result-modal.js';
import { confirmAction } from './utils/confirm-modal.js';

let _checkinId = null;
let _bodyFatEnabled = false;

function _setBodyFatEnabled(enabled, { clearWhenOff = false } = {}) {
  _bodyFatEnabled = !!enabled;
  document.getElementById('ci-bodyfat-toggle')?.classList.toggle('on', _bodyFatEnabled);
  document.getElementById('ci-bodyfat-wrap')?.classList.toggle('open', _bodyFatEnabled);
  if (!_bodyFatEnabled && clearWhenOff) {
    const input = document.getElementById('ci-bodyfat');
    if (input) input.value = '';
  }
}

function openCheckinModal(id) {
  _checkinId = id || null;
  if (id) {
    const rec = getBodyCheckins().find(c => c.id === id);
    if (rec) {
      document.getElementById('ci-date').value   = rec.date || '';
      document.getElementById('ci-weight').value = rec.weight || '';
      document.getElementById('ci-bodyfat').value= rec.bodyFatPct || '';
      document.getElementById('ci-note').value   = rec.note || '';
      _setBodyFatEnabled(rec.bodyFatPct !== null && rec.bodyFatPct !== undefined);
    }
    document.getElementById('ci-delete-btn').style.display = 'inline-block';
  } else {
    const t = TODAY;
    document.getElementById('ci-date').value   = dateKey(t.getFullYear(), t.getMonth(), t.getDate());
    document.getElementById('ci-weight').value = '';
    document.getElementById('ci-bodyfat').value= '';
    document.getElementById('ci-note').value   = '';
    document.getElementById('ci-delete-btn').style.display = 'none';
    _setBodyFatEnabled(false, { clearWhenOff: true });
  }
  document.getElementById('checkin-modal').classList.add('open');
}

function closeCheckinModal(e) { window._closeModal('checkin-modal', e); }
function toggleCheckinBodyFat() { _setBodyFatEnabled(!_bodyFatEnabled, { clearWhenOff: !_bodyFatEnabled ? false : true }); }

async function saveCheckinFromModal() {
  const date   = document.getElementById('ci-date').value;
  const weight = parseFloat(document.getElementById('ci-weight').value);
  const bf     = parseFloat(document.getElementById('ci-bodyfat').value);
  const note   = document.getElementById('ci-note').value.trim();
  if (!date || !weight) { window.showToast?.('날짜와 체중을 입력해주세요', 2500, 'warning'); return; }
  const rec = {
    id:         _checkinId || `ci_${Date.now()}`,
    date,
    weight,
    bodyFatPct: _bodyFatEnabled && Number.isFinite(bf) ? bf : null,
    note:       note || null,
  };
  await saveBodyCheckin(rec);

  const checkins = getBodyCheckins().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  document.getElementById('checkin-modal').classList.remove('open');
  window.renderAll();
  if (checkins.length < 2) {
    showToast('첫 기록 완료!', 1800, 'success');
    return;
  }
  const recent = checkins.slice(-2);
  const delta = Number(((recent[1].weight || 0) - (recent[0].weight || 0)).toFixed(1));
  requestAnimationFrame(() => openWeightResultModal(delta, checkins));
}

async function deleteCheckinFromModal() {
  if (!_checkinId) return;
  const ok = await confirmAction({ title: '체크인 삭제', message: '체크인 기록을 삭제할까요?', destructive: true, longPress: 2000 });
  if (!ok) return;
  await deleteBodyCheckin(_checkinId);
  document.getElementById('checkin-modal').classList.remove('open');
  window.renderAll();
}

Object.assign(window, {
  openCheckinModal,
  closeCheckinModal,
  toggleCheckinBodyFat,
  saveCheckinFromModal,
  deleteCheckinFromModal,
});
