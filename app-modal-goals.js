// ================================================================
// app-modal-goals.js — 목표 모달 핸들러
// ================================================================

import { saveGoal, deleteGoal, getGoals } from './data.js';
import { analyzeGoalFeasibility } from './ai.js';

// renderAll은 app.js에서 window에 등록됨

// ── 목표 모달 ────────────────────────────────────────────────
export function openGoalModal() {
  document.getElementById('goal-label').value           = '';
  document.getElementById('goal-dday').value            = '';
  document.getElementById('goal-use-condition').checked = false;
  document.getElementById('goal-condition-wrap').style.display = 'none';
  document.getElementById('goal-workout-per-week').value = '';
  document.getElementById('goal-diet-ok-pct').value     = '';
  document.getElementById('goal-modal').classList.add('open');
}

export function closeGoalModal(e) {
  if (e && e.target !== document.getElementById('goal-modal')) return;
  document.getElementById('goal-modal').classList.remove('open');
}

export function toggleGoalCondition() {
  const checked = document.getElementById('goal-use-condition').checked;
  document.getElementById('goal-condition-wrap').style.display = checked ? 'block' : 'none';
}

export async function saveGoalFromModal() {
  const label = document.getElementById('goal-label').value.trim();
  const dday  = document.getElementById('goal-dday').value;
  if (!label) { window.showToast?.('목표 이름을 입력해주세요', 2500, 'warning'); return; }

  const useCondition = document.getElementById('goal-use-condition').checked;
  const condition = useCondition ? {
    workoutPerWeek: parseInt(document.getElementById('goal-workout-per-week').value) || null,
    dietOkPct:      parseInt(document.getElementById('goal-diet-ok-pct').value)      || null,
  } : null;

  await saveGoal({ id:`goal_${Date.now()}`, label, dday:dday||null, condition, aiAnalysis:null });
  document.getElementById('goal-modal').classList.remove('open');
  window.renderAll();
}

export async function deleteGoalItem(id) {
  const ok = await (window.confirmSimple?.('목표를 삭제할까요?', { destructive: true }) || Promise.resolve(false));
  if (!ok) return;
  await deleteGoal(id);
  window.showToast?.('목표가 삭제됐어요', 2000, 'info');
  window.renderAll();
}

export async function analyzeGoalFeasibilityHandler(id) {
  const goal = getGoals().find(g => g.id === id);
  if (!goal) return;
  const btns = document.querySelectorAll(`[onclick="analyzeGoalFeasibility('${id}')"]`);
  btns.forEach(b => { b.disabled=true; b.textContent='분석 중...'; });
  try {
    const result = await analyzeGoalFeasibility(goal);
    await saveGoal({ ...goal, aiAnalysis: result });
    renderAll();
  } catch(e) {
    window.showToast?.('분석 실패: ' + e.message, 3500, 'error');
    btns.forEach(b => { b.disabled=false; b.textContent='✨ AI 실현가능성 분석'; });
  }
}
