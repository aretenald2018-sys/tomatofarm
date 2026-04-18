// ================================================================
// modals/nutrition-weight-modal.js
// 2026-04-18 NUTRITION_REFACTOR Phase C
//   - 단위 드롭다운(servings[]) + 수량 배수 + 직접 중량 입력
//   - canonical 아이템(base/servings/nutrition) 기반으로 convertNutrition 환산
//   - 레거시(servingSize/unit/nutrition) 아이템은 normalizeFromLocalDB로 변환 후 처리
//   - 저장 시 servingRef 메타 포함 → 나중에 재로드해도 원 단위/배수 복원 가능
// ================================================================

import { wtAddFoodItem } from '../render-workout.js';
import { saveNutritionItem } from '../data.js';
import { convertNutrition } from '../calc.js';
import {
  normalizeFromCsv,
  normalizeFromLocalDB,
  normalizeFromTopLevel,
  serializeForStorage,
} from '../data/nutrition-normalize.js';

// ── 내부 상태 ──────────────────────────────────────────────────
// _current 는 canonical NutritionItem. UI에서 수정되는 선택 서빙/배수/커스텀 중량은 별도.
let _current = null;
let _selectedServingId = null;
let _multiplier = 1;
let _customGrams = null; // 'custom' 모드일 때만 사용

export const WEIGHT_MODAL_HTML = `
<div class="modal-backdrop" id="nutrition-weight-modal" onclick="closeNutritionWeightModal(event)" style="display:none;z-index:1001">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title">섭취량 설정</div>
    <div class="ex-editor-form" style="padding-bottom:8px">
      <div id="nutrition-weight-item-info" style="padding:12px;background:var(--bg2);border-radius:4px;margin-bottom:12px;font-size:12px">
        <div style="font-weight:600;margin-bottom:4px" id="weight-item-name"></div>
        <div style="color:var(--muted);font-size:11px" id="weight-item-nutrition"></div>
      </div>

      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--primary-bg);border-radius:var(--radius-md);margin-bottom:12px;">
        <span style="font-size:14px;flex-shrink:0;line-height:1.4;">ℹ️</span>
        <span style="font-size:11px;color:var(--primary);line-height:1.4;font-weight:500;">단위를 고르고 수량을 조절해주세요. 정확한 중량은 직접 입력할 수 있어요.</span>
      </div>

      <div style="margin-bottom:12px">
        <label style="font-size:13px;color:var(--muted);display:block;margin-bottom:6px;font-weight:500">단위</label>
        <div class="tds-dropdown" id="nw-serving-dropdown">
          <button type="button" id="nw-serving-trigger" class="tds-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false" onclick="toggleNutritionServingDropdown(event)">
            <span class="tds-dd-label" id="nw-serving-label">단위 선택</span>
            <svg class="tds-dd-caret" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="nw-serving-panel" class="tds-dropdown-panel" role="listbox" aria-label="단위" hidden></div>
        </div>
      </div>

      <div style="margin-bottom:12px" id="nw-multiplier-row">
        <label style="font-size:13px;color:var(--muted);display:block;margin-bottom:6px;font-weight:500">수량</label>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="tds-btn ghost md" style="flex:1;min-width:0" onclick="setNutritionMultiplier(0.5)">½</button>
          <button type="button" class="tds-btn ghost md" style="flex:1;min-width:0" onclick="setNutritionMultiplier(1)">1</button>
          <button type="button" class="tds-btn ghost md" style="flex:1;min-width:0" onclick="setNutritionMultiplier(2)">2</button>
          <button type="button" class="tds-btn ghost md" style="flex:1;min-width:0" onclick="setNutritionMultiplier(3)">3</button>
          <input type="number" id="nw-multiplier-input" class="tds-input" value="1" min="0.1" max="20" step="0.1" style="flex:1.2;text-align:center" oninput="onNutritionMultiplierInput()">
        </div>
      </div>

      <div style="margin-bottom:12px" id="nw-custom-row" hidden>
        <label style="font-size:13px;color:var(--muted);display:block;margin-bottom:6px;font-weight:500">중량 (<span id="nw-custom-unit">g</span>)</label>
        <input type="number" id="nutrition-weight-input" class="tds-input" value="100" min="1" max="5000" oninput="updateNutritionWeightPreview()">
      </div>

      <div style="padding:12px;background:var(--surface3);border-radius:4px;margin-bottom:12px;font-size:12px">
        <div style="font-weight:600;margin-bottom:6px;color:var(--text)">계산된 영양정보 <span id="nw-total-amount" style="color:var(--muted);font-weight:400;font-size:11px"></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;color:var(--muted);font-size:11px">
          <div>💪 <span id="weight-calc-kcal">0</span>kcal</div>
          <div>🥕 탄 <span id="weight-calc-carbs">0</span>g</div>
          <div>🍖 단 <span id="weight-calc-protein">0</span>g</div>
          <div>🧈 지 <span id="weight-calc-fat">0</span>g</div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="tds-btn fill md" onclick="confirmNutritionItemWithWeight()" style="flex:1">추가</button>
        <button class="tds-btn cancel-btn ghost md" onclick="closeNutritionWeightModal()" style="flex:1">취소</button>
      </div>
    </div>
  </div>
</div>
`;

// 전역 상태 (레거시 호환) — 호출자가 window._nutritionWeightItem을 참고하는 경우 대비
window._nutritionWeightItem = null;

// ── 아이템을 canonical로 정규화 (legacy / csv / raw / gov / ocr 공통) ──
function _toCanonical(item) {
  if (!item) return null;
  // 이미 canonical
  if (item.base && Array.isArray(item.servings) && item.servings.length) {
    return item;
  }
  // CSV 스타일 (top-level energy 필드) — fatsecret-api.js searchCSVFood
  if (item.energy != null && item.nutrition == null) {
    return normalizeFromCsv(item);
  }
  // raw-ingredients.js / feature-nutrition.js mapItem — top-level kcal/protein/fat/carbs
  // (예: { id, name, unit:'100g', defaultWeight, kcal, protein, fat, carbs, _source, _grp })
  // 과거 이 경로가 normalizeFromLocalDB로 빠져 dbItem.nutrition || {} 로 전 영양소가 0이 됐음.
  if (item.nutrition == null && (item.kcal != null || item.protein != null || item.carbs != null)) {
    return normalizeFromTopLevel(item);
  }
  // 레거시 로컬 DB / 저장 아이템 (unit/servingSize/nutrition)
  return normalizeFromLocalDB(item);
}

// ── 현재 선택된 실 중량(g 또는 ml) 계산 ─────────────────────────
function _computeSelectedGrams() {
  if (!_current) return 0;
  if (_selectedServingId === 'custom') {
    return Math.max(0, Number(_customGrams) || 0);
  }
  const sv = _current.servings.find(s => s.id === _selectedServingId)
    || _current.servings[0];
  return (sv?.grams || 0) * (Number(_multiplier) || 1);
}

// ── base 단위 라벨 (g vs ml) ────────────────────────────────────
function _baseUnitLabel() {
  return _current?.base?.type === 'per_100ml' ? 'ml' : 'g';
}

// ── modal open ─────────────────────────────────────────────────
export function openNutritionWeightModal(item) {
  const canonical = _toCanonical(item);
  if (!canonical) {
    console.error('[nutrition-weight-modal] 정규화 실패:', item);
    return;
  }
  _current = canonical;
  window._nutritionWeightItem = item; // 레거시 호환

  // servings 드롭다운 빌드 (+ "직접 입력" 옵션) — 커스텀 TDS 드롭다운
  _selectedServingId = _current.defaultServingId || _current.servings[0]?.id;
  _renderServingOptions();
  _multiplier = 1;
  _customGrams = null;
  const multInput = document.getElementById('nw-multiplier-input');
  if (multInput) multInput.value = '1';

  // 기준 표시 — 정수로만 노출 (레거시 재환산 등으로 소수점이 생겨도 표시는 정수)
  document.getElementById('weight-item-name').textContent = _current.name || '';
  const n = _current.nutrition || {};
  const _r = (v) => Math.round(Number(v) || 0);
  const baseLabel = _current.base.label
    || (_current.base.type === 'per_100ml' ? '100ml'
       : _current.base.type === 'per_serving' ? `1회 ${_current.base.grams}g`
       : '100g');
  document.getElementById('weight-item-nutrition').textContent =
    `${baseLabel} 기준: ${_r(n.kcal)}kcal | 탄${_r(n.carbs)}g 단${_r(n.protein)}g 지${_r(n.fat)}g`;

  // 직접 입력 행 초기화 (기본은 숨김)
  document.getElementById('nw-custom-row').hidden = true;
  document.getElementById('nw-custom-unit').textContent = _baseUnitLabel();
  document.getElementById('nutrition-weight-input').value = String(
    _current.servings.find(s => s.id === _selectedServingId)?.grams || 100
  );

  updateNutritionWeightPreview();

  document.getElementById('nutrition-weight-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('nw-multiplier-input')?.focus(), 100);
}

// ── 커스텀 드롭다운: 옵션 렌더 ─────────────────────────────────
function _renderServingOptions() {
  if (!_current) return;
  const panel = document.getElementById('nw-serving-panel');
  if (!panel) return;
  // 무게 미상(1인분 등) 아이템은 "직접 입력" 옵션 제공 안 함 — g를 알 수 없으므로 무의미
  const list = [..._current.servings.map(s => ({ id: s.id, label: s.label }))];
  if (!_current.base?.isUnknownWeight) {
    list.push({ id: 'custom', label: '직접 입력…' });
  }
  panel.innerHTML = list.map(o => {
    const sel = o.id === _selectedServingId ? ' is-selected' : '';
    return `<button type="button" class="tds-dropdown-option${sel}" role="option" aria-selected="${o.id === _selectedServingId}" data-serving-id="${o.id}" onclick="selectNutritionServing('${o.id}')">
      <span>${o.label}</span>
      <svg class="tds-dd-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 L6.5 11.5 L12.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;
  }).join('');
  // 트리거 라벨 업데이트
  const trigger = document.getElementById('nw-serving-label');
  if (trigger) {
    const current = list.find(o => o.id === _selectedServingId);
    trigger.textContent = current?.label || '단위 선택';
  }
}

// ── 커스텀 드롭다운: 열기/닫기 ─────────────────────────────────
function _openServingDropdown() {
  const panel = document.getElementById('nw-serving-panel');
  const trigger = document.getElementById('nw-serving-trigger');
  if (!panel || !trigger) return;
  panel.hidden = false;
  trigger.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  document.addEventListener('click', _onDocClickForDropdown, true);
  document.addEventListener('keydown', _onKeyDownForDropdown, true);
}
function _closeServingDropdown() {
  const panel = document.getElementById('nw-serving-panel');
  const trigger = document.getElementById('nw-serving-trigger');
  if (!panel || !trigger) return;
  panel.hidden = true;
  trigger.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', _onDocClickForDropdown, true);
  document.removeEventListener('keydown', _onKeyDownForDropdown, true);
}
function _onDocClickForDropdown(ev) {
  const dd = document.getElementById('nw-serving-dropdown');
  if (dd && !dd.contains(ev.target)) _closeServingDropdown();
}
function _onKeyDownForDropdown(ev) {
  if (ev.key === 'Escape') { ev.stopPropagation(); _closeServingDropdown(); }
}

export function toggleNutritionServingDropdown(ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const panel = document.getElementById('nw-serving-panel');
  if (!panel) return;
  if (panel.hidden) _openServingDropdown();
  else _closeServingDropdown();
}

// ── 단위 드롭다운 변경 (옵션 선택 시 호출) ──────────────────────
export function selectNutritionServing(servingId) {
  _selectedServingId = servingId;
  _closeServingDropdown();
  _renderServingOptions();

  const isCustom = _selectedServingId === 'custom';
  document.getElementById('nw-custom-row').hidden = !isCustom;
  document.getElementById('nw-multiplier-row').hidden = isCustom;
  document.getElementById('nw-custom-unit').textContent = _baseUnitLabel();

  if (isCustom) {
    const initGrams = _customGrams
      || _current?.servings?.find(s => s.id === _current.defaultServingId)?.grams
      || 100;
    document.getElementById('nutrition-weight-input').value = String(initGrams);
    _customGrams = initGrams;
  } else {
    const multInput = document.getElementById('nw-multiplier-input');
    if (multInput) multInput.value = String(_multiplier);
  }
  updateNutritionWeightPreview();
}

export function setNutritionMultiplier(mult) {
  _multiplier = Number(mult) || 1;
  const input = document.getElementById('nw-multiplier-input');
  if (input) input.value = String(_multiplier);
  updateNutritionWeightPreview();
}

export function onNutritionMultiplierInput() {
  const v = parseFloat(document.getElementById('nw-multiplier-input').value);
  _multiplier = Number.isFinite(v) && v > 0 ? v : 1;
  updateNutritionWeightPreview();
}

// ── 계산 미리보기 ──────────────────────────────────────────────
export function updateNutritionWeightPreview() {
  if (!_current) return;
  if (_selectedServingId === 'custom') {
    _customGrams = parseFloat(document.getElementById('nutrition-weight-input').value) || 0;
  }

  const grams = _computeSelectedGrams();
  const out = convertNutrition(_current.nutrition, _current.base, grams);
  const _r = (v) => Math.round(Number(v) || 0);

  document.getElementById('weight-calc-kcal').textContent = _r(out.kcal);
  document.getElementById('weight-calc-carbs').textContent = _r(out.carbs);
  document.getElementById('weight-calc-protein').textContent = _r(out.protein);
  document.getElementById('weight-calc-fat').textContent = _r(out.fat);

  // 총량 표시: 무게 아는 경우 "(120g)", 무게 미상(1인분)은 "(1인분 × 2)" 형식
  const totalEl = document.getElementById('nw-total-amount');
  if (_current.base?.isUnknownWeight) {
    const sv = _current.servings.find(s => s.id === _selectedServingId) || _current.servings[0];
    const mult = Number(_multiplier) || 1;
    totalEl.textContent = mult === 1 ? `(${sv.label})` : `(${sv.label} × ${mult})`;
  } else {
    totalEl.textContent = `(${_r(grams)}${_baseUnitLabel()})`;
  }
}

// ── 모달 닫기 ──────────────────────────────────────────────────
export function closeNutritionWeightModal(event) {
  if (event && event.target.id !== 'nutrition-weight-modal') return;
  _closeServingDropdown();
  document.getElementById('nutrition-weight-modal').style.display = 'none';
  _current = null;
  _selectedServingId = null;
  _multiplier = 1;
  _customGrams = null;
  window._nutritionWeightItem = null;
}

// ── 저장 (식단에 추가 + 최근 항목 DB) ──────────────────────────
export function confirmNutritionItemWithWeight() {
  if (!_current || !window._nutritionSearchMeal) return;

  const grams = _computeSelectedGrams();
  if (!(grams > 0)) {
    console.warn('[nutrition-weight-modal] 중량이 0 이하 — 무시');
    return;
  }
  const out = convertNutrition(_current.nutrition, _current.base, grams);
  const mealId = window._nutritionSearchMeal;

  // 선택된 serving의 정보 (servingRef 저장용)
  const sv = _selectedServingId === 'custom'
    ? { id: 'custom', label: `${grams}${_baseUnitLabel()}`, grams }
    : (_current.servings.find(s => s.id === _selectedServingId) || _current.servings[0]);

  const foodItem = {
    id: _current.id,
    name: _current.name,
    grams,
    kcal: out.kcal,
    carbs: out.carbs,
    protein: out.protein,
    fat: out.fat,
    servingRef: {
      servingId: sv.id,
      label: sv.label,
      multiplier: _selectedServingId === 'custom' ? 1 : _multiplier,
      baseGrams: sv.grams,
      unit: _baseUnitLabel(),
    },
    source: 'manual',
  };

  console.log('[nutrition-weight-modal] 음식 추가:', { mealId, foodItem });
  try {
    wtAddFoodItem(mealId, foodItem);
  } catch (e) {
    console.error('[nutrition-weight-modal] 음식 추가 실패:', e);
  }

  // 최근 항목 DB 저장 — canonical 그대로 직렬화하여 레거시 + 신규 필드 병존
  try {
    const record = serializeForStorage(_current, {
      // 최근 사용 컨텍스트 메타 (optional)
      lastServingRef: foodItem.servingRef,
      lastUsedAt: Date.now(),
    });
    saveNutritionItem(record)
      .then(() => console.log('[nutrition-weight-modal] 최근 항목 저장:', _current.name))
      .catch(e => console.warn('[nutrition-weight-modal] 최근 항목 저장 실패:', e));
  } catch (e) {
    console.error('[nutrition-weight-modal] 최근 항목 직렬화 실패:', e);
  }

  closeNutritionWeightModal();
  document.getElementById('nutrition-search-modal')?.classList.remove('open');
}

// ── 전역 window 등록 ──────────────────────────────────────────
window.openNutritionWeightModal = openNutritionWeightModal;
window.updateNutritionWeightPreview = updateNutritionWeightPreview;
window.closeNutritionWeightModal = closeNutritionWeightModal;
window.confirmNutritionItemWithWeight = confirmNutritionItemWithWeight;
window.toggleNutritionServingDropdown = toggleNutritionServingDropdown;
window.selectNutritionServing = selectNutritionServing;
window.onNutritionMultiplierInput = onNutritionMultiplierInput;
window.setNutritionMultiplier = setNutritionMultiplier;
