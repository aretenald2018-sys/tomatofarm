// ================================================================
// data-workout-equipment.js
// 전문가 모드 전용 CRUD — 헬스장(Gym) + 루틴 템플릿(RoutineTemplate)
// 의존성: data-core
// ----------------------------------------------------------------
// Firestore 경로:
//   users/{uid}/gyms/{gymId}
//   users/{uid}/routine_templates/{id}
// ================================================================

import {
  _doc, _col, _fbOp, _generateId,
  setDoc, deleteDoc, getDocs,
  _gyms, _setGyms, _routineTemplates, _setRoutineTemplates,
} from './data-core.js';

// ── Gym ─────────────────────────────────────────────────────────

export async function loadGyms() {
  try {
    const snap = await getDocs(_col('gyms'));
    const list = [];
    snap.forEach(d => list.push(d.data()));
    _setGyms(list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  } catch (e) {
    console.warn('[data] gyms load skipped:', e?.message || e);
    _setGyms([]);
  }
}

export function getGyms() { return _gyms; }
export function getGym(gymId) { return _gyms.find(g => g.id === gymId) || null; }

export async function saveGym(gym) {
  const record = {
    id: gym.id || _generateId(),
    name: String(gym.name || '').trim(),
    location: gym.location || '',
    notes: gym.notes || '',
    enabledGlobalPoolIds: Array.isArray(gym.enabledGlobalPoolIds) ? gym.enabledGlobalPoolIds : undefined,
    exclusiveEquipmentIds: Array.isArray(gym.exclusiveEquipmentIds) ? gym.exclusiveEquipmentIds : undefined,
    createdAt: gym.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  return _fbOp('saveGym', async () => {
    await setDoc(_doc('gyms', record.id), record);
    const idx = _gyms.findIndex(g => g.id === record.id);
    if (idx >= 0) _gyms[idx] = record; else _gyms.push(record);
    return record;
  }, { sync: false });
}

export async function deleteGym(gymId) {
  return _fbOp('deleteGym', async () => {
    await deleteDoc(_doc('gyms', gymId));
    _setGyms(_gyms.filter(g => g.id !== gymId));
  }, { sync: false });
}

// ── Routine Template ────────────────────────────────────────────

export async function loadRoutineTemplates() {
  try {
    const snap = await getDocs(_col('routine_templates'));
    const list = [];
    snap.forEach(d => list.push(d.data()));
    _setRoutineTemplates(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  } catch (e) {
    console.warn('[data] routine_templates load skipped:', e?.message || e);
    _setRoutineTemplates([]);
  }
}

export function getRoutineTemplates() { return _routineTemplates; }

export function getRecentRoutineTemplate() {
  return _routineTemplates.length > 0 ? _routineTemplates[0] : null;
}

export async function saveRoutineTemplate(template) {
  const record = {
    id: template.id || _generateId(),
    title: String(template.title || '').trim(),
    source: template.source || 'ai',              // 'ai'|'manual'
    candidateKey: template.candidateKey || null,   // 'A'|'B'
    rationale: template.rationale || '',
    targetMuscles: template.targetMuscles || [],
    sessionMinutes: template.sessionMinutes || 60,
    items: template.items || [],                   // [{exerciseId, sets:[{reps,rpeTarget,kg?}], restSec?}]
    gymId: template.gymId || null,
    createdAt: template.createdAt || Date.now(),
  };
  return _fbOp('saveRoutineTemplate', async () => {
    await setDoc(_doc('routine_templates', record.id), record);
    const idx = _routineTemplates.findIndex(t => t.id === record.id);
    if (idx >= 0) _routineTemplates[idx] = record;
    else _routineTemplates.unshift(record);
    return record;
  }, { sync: false });
}

export async function deleteRoutineTemplate(id) {
  return _fbOp('deleteRoutineTemplate', async () => {
    await deleteDoc(_doc('routine_templates', id));
    _setRoutineTemplates(_routineTemplates.filter(t => t.id !== id));
  }, { sync: false });
}
