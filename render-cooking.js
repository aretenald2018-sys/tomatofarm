// ================================================================
// render-cooking.js — 요리 탭
// 주 1회 새 요리 실험 기록 + 재료 영양정보 + 식단 연동
// ================================================================

import { saveCooking, deleteCooking, getCookingRecords,
         findDietEntriesByRecipeId, saveDay } from './data.js';
import { searchCSVFood }                      from './fatsecret-api.js';
import { searchNutritionDB }                  from './data.js';

const CATEGORIES   = ['한식','양식','일식','중식','기타'];
const RESULT_LABEL = { success:'✓ 성공', partial:'△ 보통', fail:'✗ 아쉬움' };
const RESULT_COLOR = { success:'var(--diet-ok)', partial:'var(--accent)', fail:'var(--diet-bad)' };

let _editingId   = null;
let _ingredients = [];        // 현재 편집 중인 재료 목록
let _selectedIngredient = null; // 드롭다운에서 선택한 재료 (확정 전)

// ── 공개 API ─────────────────────────────────────────────────────
export function renderCooking() {
  const records   = getCookingRecords();
  const container = document.getElementById('cooking-list');
  if (!container) return;

  container.innerHTML =
    _buildDashboard(records) +
    `<div class="cooking-cards-wrap">` +
    (records.length
      ? [...records]
          .sort((a,b) => (b.date||'').localeCompare(a.date||''))
          .map(r => _buildCard(r))
          .join('')
      : `<div style="text-align:center;padding:40px;color:var(--muted)">
           <div style="font-size:32px;margin-bottom:12px">🍳</div>
           <div style="font-size:14px">아직 기록된 요리가 없어요</div>
         </div>`)
    + `</div>`;
}

export function openCookingModal(id) {
  _editingId = id || null;
  _ingredients = [];
  _selectedIngredient = null;

  const modal   = document.getElementById('cooking-modal');
  const titleEl = document.getElementById('cooking-modal-title');

  if (id) {
    const rec = getCookingRecords().find(r => r.id === id);
    if (!rec) return;
    titleEl.textContent = '🍳 요리 기록 수정';
    document.getElementById('cooking-name').value     = rec.name     || '';
    document.getElementById('cooking-date').value     = rec.date     || '';
    document.getElementById('cooking-category').value = rec.category || '한식';
    document.getElementById('cooking-source').value   = rec.source   || '';
    document.getElementById('cooking-process').value  = rec.process  || '';
    document.getElementById('cooking-result').value   = rec.result   || 'success';
    document.getElementById('cooking-result-notes').value = rec.result_notes || '';
    document.getElementById('cooking-photo-url').value    = rec.photo_url    || '';
    document.getElementById('cooking-servings').value     = rec.servings || 1;
    _ingredients = (rec.ingredients || []).map(i => ({...i}));
    _updatePhotoPreview(rec.photo_url || '');
    document.getElementById('cooking-delete-btn').style.display = 'block';
  } else {
    titleEl.textContent = '🍳 요리 기록 추가';
    document.getElementById('cooking-name').value     = '';
    document.getElementById('cooking-date').value     = _todayStr();
    document.getElementById('cooking-category').value = '한식';
    document.getElementById('cooking-source').value   = '';
    document.getElementById('cooking-process').value  = '';
    document.getElementById('cooking-result').value   = 'success';
    document.getElementById('cooking-result-notes').value = '';
    document.getElementById('cooking-photo-url').value    = '';
    document.getElementById('cooking-servings').value     = '1';
    _updatePhotoPreview('');
    document.getElementById('cooking-delete-btn').style.display = 'none';
  }

  _renderIngredientsList();
  _updateCookingNutrition();
  _hideIngredientWeight();
  document.getElementById('cooking-ingredient-search').value = '';
  document.getElementById('cooking-ingredient-dropdown').style.display = 'none';

  modal.classList.add('open');
}

export function closeCookingModal(e) {
  if (e && e.target !== document.getElementById('cooking-modal')) return;
  document.getElementById('cooking-modal').classList.remove('open');
}

export async function saveCookingFromModal() {
  const name   = document.getElementById('cooking-name').value.trim();
  const date   = document.getElementById('cooking-date').value;
  if (!name) { alert('요리 이름을 입력해주세요.'); return; }
  if (!date) { alert('날짜를 입력해주세요.'); return; }

  const servings = parseInt(document.getElementById('cooking-servings').value) || 1;

  const record = {
    id:           _editingId || `cooking_${Date.now()}`,
    name,
    date,
    category:     document.getElementById('cooking-category').value,
    source:       document.getElementById('cooking-source').value.trim(),
    process:      document.getElementById('cooking-process').value.trim(),
    result:       document.getElementById('cooking-result').value,
    result_notes: document.getElementById('cooking-result-notes').value.trim(),
    photo_url:    document.getElementById('cooking-photo-url').value.trim(),
    ingredients:  _ingredients,
    servings:     servings,
    createdAt:    _editingId
      ? (getCookingRecords().find(r=>r.id===_editingId)?.createdAt || new Date().toISOString())
      : new Date().toISOString(),
  };

  await saveCooking(record);

  // 소급 업데이트: 이 레시피를 참조하는 식단 항목 갱신
  if (_editingId && _ingredients.length) {
    await _retroactiveUpdate(record);
  }

  document.getElementById('cooking-modal').classList.remove('open');
  renderCooking();
  document.dispatchEvent(new CustomEvent('cooking:saved'));
}

export async function deleteCookingFromModal() {
  if (!_editingId) return;
  if (!confirm('이 요리 기록을 삭제할까요?')) return;
  await deleteCooking(_editingId);
  document.getElementById('cooking-modal').classList.remove('open');
  renderCooking();
  document.dispatchEvent(new CustomEvent('cooking:saved'));
}

export function onCookingPhotoInput() {
  const url = document.getElementById('cooking-photo-url').value.trim();
  _updatePhotoPreview(url);
}

// ── 재료 검색 ─────────────────────────────────────────────────────
let _ingSearchTimer = null;

function _searchCookingIngredient() {
  clearTimeout(_ingSearchTimer);
  const q = document.getElementById('cooking-ingredient-search').value.trim();
  const dropdown = document.getElementById('cooking-ingredient-dropdown');

  if (!q) {
    dropdown.style.display = 'none';
    return;
  }

  _ingSearchTimer = setTimeout(() => {
    const dbResults  = searchNutritionDB(q).slice(0, 8);
    const csvResults = searchCSVFood(q).slice(0, 8);

    // DB 이름 중복 제거
    const dbNames = new Set(dbResults.map(r => r.name?.toLowerCase()));
    const dedupedCsv = csvResults.filter(c => !dbNames.has(c.name?.toLowerCase()));

    let html = '';

    dbResults.forEach((item, i) => {
      const kcal = item.nutrition?.kcal || 0;
      const ss   = item.servingSize || 100;
      html += `<div class="nutrition-result-row" style="padding:8px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
        onclick="window._selectCookingIngredient('db', ${i})">
        <div style="font-weight:500">${item.name}</div>
        <div style="color:var(--muted);font-size:11px">${ss}g 기준 ${kcal}kcal</div>
      </div>`;
      window[`_cookIngDB_${i}`] = item;
    });

    dedupedCsv.forEach((item, i) => {
      html += `<div class="nutrition-result-row" style="padding:8px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
        onclick="window._selectCookingIngredient('csv', ${i})">
        <div style="font-weight:500">📊 ${item.name}</div>
        <div style="color:var(--muted);font-size:11px">100g 기준 ${item.energy||0}kcal</div>
      </div>`;
      window[`_cookIngCSV_${i}`] = item;
    });

    if (!html) html = `<div style="padding:12px;font-size:12px;color:var(--muted);text-align:center">검색 결과 없음</div>`;

    // 맨 아래에 "직접 추가" 항목
    html += `<div class="nutrition-result-row" style="padding:10px;cursor:pointer;font-size:12px;text-align:center;color:var(--accent);font-weight:600;border-top:1px solid var(--border)"
      onclick="window._openCookingDirectAdd()">
      ➕ 직접 추가 (사진/텍스트 파싱)
    </div>`;

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
  }, 250);
}

function _selectCookingIngredient(source, idx) {
  let item;
  if (source === 'db') {
    item = window[`_cookIngDB_${idx}`];
    _selectedIngredient = {
      id:   item.id,
      name: item.name,
      servingSize: item.servingSize || 100,
      kcal:    item.nutrition?.kcal || 0,
      protein: item.nutrition?.protein || 0,
      carbs:   item.nutrition?.carbs || 0,
      fat:     item.nutrition?.fat || 0,
    };
  } else {
    item = window[`_cookIngCSV_${idx}`];
    _selectedIngredient = {
      id:   item.id,
      name: item.name,
      servingSize: 100,
      kcal:    item.energy || 0,
      protein: item.protein || 0,
      carbs:   item.carbs || 0,
      fat:     item.fat || 0,
    };
  }

  // 드롭다운 닫고 인라인 중량 입력 표시
  document.getElementById('cooking-ingredient-dropdown').style.display = 'none';
  document.getElementById('cooking-ingredient-search').value = '';
  document.getElementById('cooking-ing-selected-name').textContent = _selectedIngredient.name;
  document.getElementById('cooking-ing-weight').value = String(_selectedIngredient.servingSize);
  document.getElementById('cooking-ingredient-weight-row').style.display = 'block';
  _previewIngredientNutrition();
  setTimeout(() => document.getElementById('cooking-ing-weight').focus(), 50);
}

function _previewIngredientNutrition() {
  if (!_selectedIngredient) return;
  const w = parseFloat(document.getElementById('cooking-ing-weight').value) || 0;
  const ss = _selectedIngredient.servingSize;
  const ratio = w / ss;
  const kcal = Math.round(_selectedIngredient.kcal * ratio);
  const p = Math.round(_selectedIngredient.protein * ratio * 10) / 10;
  const c = Math.round(_selectedIngredient.carbs * ratio * 10) / 10;
  const f = Math.round(_selectedIngredient.fat * ratio * 10) / 10;
  document.getElementById('cooking-ing-preview').textContent =
    `${kcal}kcal | 단${p}g 탄${c}g 지${f}g`;
}

function _confirmIngredient() {
  if (!_selectedIngredient) return;
  const w = parseFloat(document.getElementById('cooking-ing-weight').value) || 0;
  if (w <= 0) return;
  const ss = _selectedIngredient.servingSize;
  const ratio = w / ss;

  _ingredients.push({
    id:      _selectedIngredient.id,
    name:    _selectedIngredient.name,
    grams:   w,
    kcal:    Math.round(_selectedIngredient.kcal * ratio),
    protein: Math.round(_selectedIngredient.protein * ratio * 10) / 10,
    carbs:   Math.round(_selectedIngredient.carbs * ratio * 10) / 10,
    fat:     Math.round(_selectedIngredient.fat * ratio * 10) / 10,
  });

  _selectedIngredient = null;
  _hideIngredientWeight();
  _renderIngredientsList();
  _updateCookingNutrition();
}

function _cancelIngredient() {
  _selectedIngredient = null;
  _hideIngredientWeight();
}

// ── 직접 추가: 영양 정보 등록 후 자동으로 재료로 선택 ─────────────
function _openCookingDirectAdd() {
  document.getElementById('cooking-ingredient-dropdown').style.display = 'none';
  // 콜백 등록: 저장 후 자동으로 해당 항목을 재료로 선택
  window._onNutritionItemSaved = (savedItem) => {
    window._onNutritionItemSaved = null; // 일회성
    if (!savedItem) return;
    _selectedIngredient = {
      id:   savedItem.id,
      name: savedItem.name,
      servingSize: savedItem.servingSize || parseFloat(savedItem.unit?.match(/[\d.]+/)?.[0] || 100),
      kcal:    savedItem.nutrition?.kcal || 0,
      protein: savedItem.nutrition?.protein || 0,
      carbs:   savedItem.nutrition?.carbs || 0,
      fat:     savedItem.nutrition?.fat || 0,
    };
    document.getElementById('cooking-ing-selected-name').textContent = _selectedIngredient.name;
    document.getElementById('cooking-ing-weight').value = String(_selectedIngredient.servingSize);
    document.getElementById('cooking-ingredient-weight-row').style.display = 'block';
    _previewIngredientNutrition();
    setTimeout(() => document.getElementById('cooking-ing-weight').focus(), 50);
  };
  window.openNutritionItemEditor(null);
}

function _removeIngredient(idx) {
  _ingredients.splice(idx, 1);
  _renderIngredientsList();
  _updateCookingNutrition();
}

function _hideIngredientWeight() {
  document.getElementById('cooking-ingredient-weight-row').style.display = 'none';
}

function _renderIngredientsList() {
  const el = document.getElementById('cooking-ingredients-list');
  if (!el) return;
  if (!_ingredients.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">재료를 추가해보세요</div>';
    return;
  }
  el.innerHTML = _ingredients.map((ing, i) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex:1">${ing.name} <span style="color:var(--muted)">${ing.grams}g</span></span>
      <span style="color:var(--muted);font-size:11px">${ing.kcal}kcal</span>
      <button onclick="window._removeIngredient(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 4px">✕</button>
    </div>`
  ).join('');
}

function _updateCookingNutrition() {
  const el = document.getElementById('cooking-nutrition-summary');
  if (!el) return;
  if (!_ingredients.length) {
    el.textContent = '';
    return;
  }
  const servings = parseInt(document.getElementById('cooking-servings')?.value) || 1;
  const totals = _calcTotals();
  const ps = {
    kcal: Math.round(totals.kcal / servings),
    protein: Math.round(totals.protein / servings * 10) / 10,
    carbs: Math.round(totals.carbs / servings * 10) / 10,
    fat: Math.round(totals.fat / servings * 10) / 10,
  };
  el.innerHTML = `<span style="color:var(--text);font-weight:600">1인분:</span> ${ps.kcal}kcal | 단${ps.protein}g 탄${ps.carbs}g 지${ps.fat}g`;
}

function _calcTotals() {
  let kcal=0, protein=0, carbs=0, fat=0;
  _ingredients.forEach(i => { kcal+=i.kcal; protein+=i.protein; carbs+=i.carbs; fat+=i.fat; });
  return { kcal, protein, carbs, fat };
}

// ── 1인분 영양정보 계산 (외부에서도 사용) ──────────────────────────
export function calcPerServing(recipe) {
  const ings = recipe.ingredients || [];
  if (!ings.length) return null;
  const servings = recipe.servings || 1;
  let kcal=0, protein=0, carbs=0, fat=0, totalGrams=0;
  ings.forEach(i => { kcal+=i.kcal; protein+=i.protein; carbs+=i.carbs; fat+=i.fat; totalGrams+=i.grams; });
  return {
    kcal: Math.round(kcal / servings),
    protein: Math.round(protein / servings * 10) / 10,
    carbs: Math.round(carbs / servings * 10) / 10,
    fat: Math.round(fat / servings * 10) / 10,
    grams: Math.round(totalGrams / servings),
  };
}

// ── 소급 업데이트 ─────────────────────────────────────────────────
async function _retroactiveUpdate(recipe) {
  const ps = calcPerServing(recipe);
  if (!ps) return;
  const entries = findDietEntriesByRecipeId(recipe.id);
  if (!entries.length) return;

  // 날짜별로 그룹핑
  const byDate = {};
  entries.forEach(e => {
    if (!byDate[e.dateKey]) byDate[e.dateKey] = { day: {...e.day}, updates: [] };
    byDate[e.dateKey].updates.push(e);
  });

  for (const [dateKey, { day, updates }] of Object.entries(byDate)) {
    const updatedDay = {...day};
    updates.forEach(u => {
      const foods = [...(updatedDay[u.mealKey] || [])];
      if (foods[u.foodIndex]) {
        foods[u.foodIndex] = {
          ...foods[u.foodIndex],
          name: recipe.name,
          grams: ps.grams,
          kcal: ps.kcal,
          protein: ps.protein,
          carbs: ps.carbs,
          fat: ps.fat,
        };
        updatedDay[u.mealKey] = foods;
      }
    });

    // 식사별 합계 재계산
    for (const mk of ['bFoods', 'lFoods', 'dFoods', 'sFoods']) {
      const prefix = mk[0]; // b, l, d, s
      const foods = updatedDay[mk] || [];
      let tk=0, tp=0, tc=0, tf=0;
      foods.forEach(f => { tk+=f.kcal||0; tp+=f.protein||0; tc+=f.carbs||0; tf+=f.fat||0; });
      updatedDay[`${prefix}Kcal`] = Math.round(tk);
      updatedDay[`${prefix}Protein`] = Math.round(tp * 10) / 10;
      updatedDay[`${prefix}Carbs`] = Math.round(tc * 10) / 10;
      updatedDay[`${prefix}Fat`] = Math.round(tf * 10) / 10;
      if (foods.length) {
        updatedDay[`${prefix}Reason`] = `DB: ${Math.round(tk)}kcal (단${Math.round(tp*10)/10}g 탄${Math.round(tc*10)/10}g 지${Math.round(tf*10)/10}g)`;
      }
    }

    await saveDay(dateKey, updatedDay);
  }
  console.log(`[cooking] 소급 업데이트: ${entries.length}건 갱신`);
}

// ── window 등록 ──────────────────────────────────────────────────
window._searchCookingIngredient  = _searchCookingIngredient;
window._selectCookingIngredient  = _selectCookingIngredient;
window._previewIngredientNutrition = _previewIngredientNutrition;
window._confirmIngredient        = _confirmIngredient;
window._cancelIngredient         = _cancelIngredient;
window._openCookingDirectAdd     = _openCookingDirectAdd;
window._removeIngredient         = _removeIngredient;
window._updateCookingNutrition   = _updateCookingNutrition;

// ── 내부 ─────────────────────────────────────────────────────────
function _todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

function _updatePhotoPreview(url) {
  const img = document.getElementById('cooking-photo-preview');
  if (!img) return;
  if (url) { img.src = url; img.style.display = 'block'; }
  else     { img.style.display = 'none'; }
}

function _buildDashboard(records) {
  if (!records.length) return '';

  const total   = records.length;
  const success = records.filter(r => r.result === 'success').length;
  const partial = records.filter(r => r.result === 'partial').length;
  const fail    = records.filter(r => r.result === 'fail').length;
  const successRate = total ? Math.round(success / total * 100) : 0;

  const catCount = {};
  records.forEach(r => { catCount[r.category||'기타'] = (catCount[r.category||'기타']||0) + 1; });
  const catTop3 = Object.entries(catCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const catHtml = catTop3.map((x,i) =>
    `<span class="cooking-rank-item">
       <span class="cooking-rank-num">${i+1}</span>${x[0]}
       <span class="cooking-rank-cnt">${x[1]}회</span>
     </span>`).join('');

  return `
  <div class="cooking-dashboard">
    <div class="cooking-dash-title">📊 요리 실험 현황</div>
    <div class="cooking-dash-grid">
      <div class="cooking-dash-block">
        <div class="cooking-dash-label">총 실험</div>
        <div class="cooking-dash-val">${total}<span style="font-size:12px;color:var(--muted)">회</span></div>
      </div>
      <div class="cooking-dash-block">
        <div class="cooking-dash-label">성공률</div>
        <div class="cooking-dash-val" style="color:var(--diet-ok)">${successRate}<span style="font-size:12px;color:var(--muted)">%</span></div>
      </div>
      <div class="cooking-dash-block">
        <div class="cooking-dash-label">결과</div>
        <div style="font-size:11px;margin-top:4px;display:flex;flex-direction:column;gap:2px;">
          <span style="color:var(--diet-ok)">✓ ${success}회</span>
          <span style="color:var(--accent)">△ ${partial}회</span>
          <span style="color:var(--diet-bad)">✗ ${fail}회</span>
        </div>
      </div>
      <div class="cooking-dash-block" style="grid-column:span 3">
        <div class="cooking-dash-label">카테고리 TOP</div>
        <div class="cooking-rank-list" style="margin-top:6px">${catHtml}</div>
      </div>
    </div>
  </div>`;
}

function _buildCard(r) {
  const resultColor = RESULT_COLOR[r.result] || 'var(--muted)';
  const resultLabel = RESULT_LABEL[r.result] || r.result;
  const imgHtml = r.photo_url
    ? `<img src="${r.photo_url}" class="cooking-card-img" alt="${r.name}" onerror="this.style.display='none'">`
    : '';

  // 1인분 영양정보
  let nutritionHtml = '';
  if (r.ingredients?.length) {
    const ps = calcPerServing(r);
    if (ps) {
      nutritionHtml = `<div style="font-size:11px;color:var(--muted);margin-top:4px">
        1인분: ${ps.kcal}kcal | 단${ps.protein}g 탄${ps.carbs}g 지${ps.fat}g
      </div>`;
    }
  }

  return `
  <div class="cooking-card" onclick="openCookingModal('${r.id}')">
    ${imgHtml}
    <div class="cooking-card-body">
      <div class="cooking-card-header">
        <span class="cooking-card-name">${r.name}</span>
        <span class="cooking-card-result" style="color:${resultColor}">${resultLabel}</span>
      </div>
      <div class="cooking-card-meta">
        <span class="cooking-card-date">${(r.date||'').replace(/-/g,'/')}</span>
        <span class="cooking-card-cat">${r.category||''}</span>
      </div>
      ${nutritionHtml}
      ${r.result_notes ? `<div class="cooking-card-notes">${r.result_notes}</div>` : ''}
    </div>
  </div>`;
}
