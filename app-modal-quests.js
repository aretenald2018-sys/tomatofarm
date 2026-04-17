// ================================================================
// app-modal-quests.js — 퀘스트 모달 핸들러
// ================================================================

import { saveQuest, deleteQuest, getQuests, dateKey, TODAY } from './data.js';

// renderAll은 app.js에서 window에 등록됨

// ── 퀘스트 추가 모달 ─────────────────────────────────────────────
// type: 'quarterly' | 'monthly' | 'weekly' | 'daily'
export function openQuestModal(type) {
  const typeNames = { quarterly:'🌙 분기 퀘스트', monthly:'📆 월간 퀘스트', weekly:'📅 주간 퀘스트', daily:'☀️ 일간 퀘스트' };
  document.getElementById('quest-modal-title').textContent = `📋 ${typeNames[type]||'퀘스트'} 추가`;
  document.getElementById('quest-fixed-type').value = type;
  document.getElementById('quest-title').value      = '';
  document.getElementById('quest-target').value     = '1';
  document.getElementById('quest-dday').value       = '';
  document.getElementById('quest-auto').checked     = false;
  document.getElementById('quest-auto-wrap').style.display    = 'none';
  // 분기/월간만 D-day + 목표횟수 표시, 주간도 목표횟수 표시
  const showDday   = type === 'quarterly' || type === 'monthly';
  const showTarget = type !== 'daily';
  document.getElementById('quest-dday-wrap').style.display   = showDday   ? 'block' : 'none';
  document.getElementById('quest-target-wrap').style.display = showTarget ? 'block' : 'none';
  document.getElementById('quest-modal').classList.add('open');
}

export function closeQuestModal(e) {
  if (e && e.target !== document.getElementById('quest-modal')) return;
  document.getElementById('quest-modal').classList.remove('open');
}

export function onQuestAutoChange() {
  const checked = document.getElementById('quest-auto').checked;
  document.getElementById('quest-auto-wrap').style.display = checked ? 'block' : 'none';
}

export async function saveQuestFromModal() {
  const title    = document.getElementById('quest-title').value.trim();
  const type     = document.getElementById('quest-fixed-type').value;
  const target   = type === 'daily' ? 1 : (parseInt(document.getElementById('quest-target').value) || 1);
  const dday     = document.getElementById('quest-dday').value || null;
  const isAuto   = document.getElementById('quest-auto').checked;
  const autoType = document.getElementById('quest-auto-type')?.value || 'workout';

  if (!title) { window.showToast?.('퀘스트 이름을 입력해주세요', 2500, 'warning'); return; }

  const today = new Date();
  const registeredAt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  await saveQuest({
    id:           `quest_${Date.now()}`,
    title, type, target,
    dday:         dday,
    registeredAt: registeredAt,
    auto:         isAuto,
    autoType:     isAuto ? autoType : null,
    checks:       {},
  });
  document.getElementById('quest-modal').classList.remove('open');
  window.renderAll();
}

// ── 퀨스트 편집 모달 ─────────────────────────────────────────────
export function openQuestEditModal(id) {
  const quest = getQuests().find(q => q.id === id);
  if (!quest) return;

  document.getElementById('quest-edit-id').value      = id;
  document.getElementById('quest-edit-title').value   = quest.title;
  document.getElementById('quest-edit-target').value  = quest.target || 1;
  document.getElementById('quest-edit-dday').value    = quest.dday || '';

  const showDday   = quest.type === 'quarterly' || quest.type === 'monthly';
  const showTarget = quest.type !== 'daily';
  document.getElementById('quest-edit-dday-wrap').style.display   = showDday   ? 'block' : 'none';
  document.getElementById('quest-edit-target-wrap').style.display = showTarget ? 'block' : 'none';

  document.getElementById('quest-edit-modal').classList.add('open');
}

export function closeQuestEditModal(e) {
  if (e && e.target !== document.getElementById('quest-edit-modal')) return;
  document.getElementById('quest-edit-modal').classList.remove('open');
}

export async function saveQuestEdit() {
  const id     = document.getElementById('quest-edit-id').value;
  const title  = document.getElementById('quest-edit-title').value.trim();
  const target = parseInt(document.getElementById('quest-edit-target').value) || 1;
  const dday   = document.getElementById('quest-edit-dday').value || null;
  if (!title) { window.showToast?.('퀘스트 이름을 입력해주세요', 2500, 'warning'); return; }

  const quest = getQuests().find(q => q.id === id);
  if (!quest) return;

  await saveQuest({ ...quest, title, target: quest.type === 'daily' ? 1 : target, dday });
  document.getElementById('quest-edit-modal').classList.remove('open');
  window.renderAll();
}

export async function deleteQuestItem(id) {
  const ok = await (window.confirmSimple?.('퀘스트를 삭제할까요?', { destructive: true }) || Promise.resolve(false));
  if (!ok) return;
  await deleteQuest(id);
  window.showToast?.('퀘스트가 삭제됐어요', 2000, 'info');
  window.renderAll();
}

export async function toggleQuestCheck(id) {
  const quest = getQuests().find(q => q.id === id);
  if (!quest || quest.auto) return;

  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const checks   = { ...(quest.checks || {}) };
  checks[todayKey] = !checks[todayKey];

  await saveQuest({ ...quest, checks });
  window.renderAll();
}
