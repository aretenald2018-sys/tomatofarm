// ================================================================
// data-equipment-pool.js
// 일반/프로/테스트 공통 기구 풀 CRUD
// ----------------------------------------------------------------
// Firestore 경로:
//   users/{uid}/equipment_pool/{poolId}
//   users/{uid}/gyms/{gymId}.enabledGlobalPoolIds
// ================================================================

import {
  _doc, _col, _fbOp, _generateId,
  setDoc, deleteDoc, getDocs,
  _equipmentPool, _setEquipmentPool,
  _gyms, _setGyms,
} from './data-core.js';

const DEFAULT_GLOBAL_POOL = [
  {
    id: 'pool_barbell_olympic',
    scope: 'global',
    name: '올림픽 바벨',
    category: 'barbell',
    movementIds: ['barbell_bench', 'back_squat', 'deadlift', 'ohp', 'barbell_curl'],
    variations: { barWeightKg: 20, stepKg: 2.5 },
    notes: '20kg 바벨 + 원판',
  },
  {
    id: 'pool_dumbbell_default',
    scope: 'global',
    name: '덤벨',
    category: 'dumbbell',
    movementIds: ['dumbbell_bench', 'incline_dumbbell_bench', 'dumbbell_shoulder_press', 'dumbbell_curl', 'hammer_curl'],
    variations: { weights: { min: 2, max: 50, step: 2.5, unit: 'kg' } },
    notes: '헬스장 공통 덤벨 풀',
  },
  {
    id: 'pool_bodyweight',
    scope: 'global',
    name: '맨몸',
    category: 'bodyweight',
    movementIds: ['pushup', 'pullup', 'dip', 'plank', 'hanging_leg_raise'],
    variations: {},
    notes: '장소 무관 공통 모듈',
  },
  {
    id: 'pool_cable_basic',
    scope: 'global',
    name: '기본 케이블',
    category: 'cable',
    movementIds: ['cable_curl', 'cable_tricep_pushdown', 'cable_lateral_raise', 'cable_crunch'],
    variations: { weightStack: { min: 5, max: 100, step: 5 } },
    notes: '대부분의 헬스장에 있는 기본 케이블',
  },
];

function _normalizeEquipment(item = {}) {
  const scope = item.scope === 'gym' ? 'gym' : 'global';
  return {
    id: item.id || _generateId(),
    scope,
    ownerGymId: scope === 'gym' ? (item.ownerGymId || item.gymId || null) : null,
    name: String(item.name || '').trim(),
    category: item.category || 'machine',
    movementIds: Array.isArray(item.movementIds) ? item.movementIds.filter(Boolean) : [],
    variations: item.variations && typeof item.variations === 'object' ? item.variations : {},
    notes: item.notes || '',
    createdAt: item.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function _withDefaultPool(list) {
  const byId = new Map();
  DEFAULT_GLOBAL_POOL.forEach(item => byId.set(item.id, { ...item, createdAt: 0, updatedAt: 0 }));
  (list || []).forEach(item => {
    if (item?.id) byId.set(item.id, _normalizeEquipment(item));
  });
  return [...byId.values()].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'global' ? -1 : 1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export async function loadEquipmentPool() {
  try {
    const snap = await getDocs(_col('equipment_pool'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    _setEquipmentPool(_withDefaultPool(list));
  } catch (e) {
    console.warn('[data] equipment_pool load skipped:', e?.message || e);
    _setEquipmentPool(_withDefaultPool([]));
  }
}

export function getEquipmentPool() {
  return _equipmentPool.length ? _equipmentPool : _withDefaultPool([]);
}

export function getGlobalEquipmentPool() {
  return getEquipmentPool().filter(item => item.scope === 'global');
}

export function getGymExclusiveEquipment(gymId) {
  return getEquipmentPool().filter(item => item.scope === 'gym' && item.ownerGymId === gymId);
}

export function getActiveEquipmentForGym(gymId) {
  const all = getEquipmentPool();
  const gym = _gyms.find(g => g.id === gymId) || null;
  const enabled = Array.isArray(gym?.enabledGlobalPoolIds)
    ? new Set(gym.enabledGlobalPoolIds)
    : new Set(all.filter(item => item.scope === 'global').map(item => item.id));
  return all.filter(item => {
    if (item.scope === 'global') return enabled.has(item.id);
    return gymId && item.ownerGymId === gymId;
  });
}

export async function saveEquipmentPoolItem(item) {
  const record = _normalizeEquipment(item);
  return _fbOp('saveEquipmentPoolItem', async () => {
    await setDoc(_doc('equipment_pool', record.id), record);
    const list = getEquipmentPool().filter(x => x.id !== record.id);
    _setEquipmentPool(_withDefaultPool([...list, record]));
    return record;
  }, { sync: false });
}

export function createGlobalPool(item) {
  return saveEquipmentPoolItem({ ...item, scope: 'global', ownerGymId: null });
}

export function createGymExclusive(gymId, item) {
  return saveEquipmentPoolItem({ ...item, scope: 'gym', ownerGymId: gymId });
}

export async function updateEquipment(poolId, patch) {
  const current = getEquipmentPool().find(item => item.id === poolId);
  if (!current) throw new Error('equipment not found');
  return saveEquipmentPoolItem({ ...current, ...patch, id: poolId, createdAt: current.createdAt });
}

export async function deleteEquipment(poolId) {
  return _fbOp('deleteEquipment', async () => {
    await deleteDoc(_doc('equipment_pool', poolId));
    _setEquipmentPool(getEquipmentPool().filter(item => item.id !== poolId));
  }, { sync: false });
}

export async function toggleGymPool(gymId, poolId, enabled) {
  const gym = _gyms.find(g => g.id === gymId);
  if (!gym) throw new Error('gym not found');
  const allGlobalIds = getGlobalEquipmentPool().map(item => item.id);
  const set = new Set(Array.isArray(gym.enabledGlobalPoolIds) ? gym.enabledGlobalPoolIds : allGlobalIds);
  if (enabled) set.add(poolId);
  else set.delete(poolId);
  const record = {
    ...gym,
    enabledGlobalPoolIds: [...set],
    updatedAt: Date.now(),
  };
  return _fbOp('toggleGymPool', async () => {
    await setDoc(_doc('gyms', gymId), record);
    _setGyms(_gyms.map(g => g.id === gymId ? record : g));
    return record;
  }, { sync: false });
}
