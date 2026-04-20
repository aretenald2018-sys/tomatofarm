// ================================================================
// feature-nutrition.js — 영양 DB 검색, 공공API, 직접추가, 캐시
// ================================================================

import { searchNutritionDB, getNutritionDB, getRecentNutritionItems,
         deleteNutritionItem, getCookingRecords } from './data.js';
import { loadCSVDatabase, searchCSVFood, searchGovFoodAPI } from './fatsecret-api.js';
import { searchRawIngredients } from './data/raw-ingredients.js';
import { wtAddFoodItem } from './render-workout.js';

// ── 상태 ──────────────────────────────────────────────────────────
let _nutritionSearchMeal = null;
let _nutritionSearchCache = { db: [], csv: [], recent: [], raw: [] };
let _nutritionSearchTimer = null;
let _lastSearchQuery = null;

// NOTE: _loadPublicFoodDB / _loadAgriFoodDB는 과거에 19,495건을 localStorage에
// 적재했지만 검색에 쓰지 않아 비용 대비 효용이 없었음. 2026-04-17 제거.
// 원재료 검색은 1) 로컬 큐레이티드 DB(data/raw-ingredients.js) 우선,
// 2) 식약처 공공API(searchGovFoodAPI) 보조로 처리.

// ── 영양 검색 모달 ────────────────────────────────────────────────
export async function openNutritionSearch(mealId) {
  _nutritionSearchMeal = mealId;
  window._nutritionSearchMeal = mealId;
  document.getElementById('nutrition-search-input').value = '';

  if (!window._nutritionCSVLoaded) {
    try {
      const csvPath2 = window.location.pathname.replace(/\/[^/]*$/, '') + '/public/data/foods.csv';
      await loadCSVDatabase(csvPath2);
      window._nutritionCSVLoaded = true;
      console.log('[영양검색] CSV 로드됨:', csvPath2);
    } catch (e) {
      console.warn('[영양검색] CSV 로드 실패:', e);
    }
  }

  renderNutritionSearchInitial();
  document.getElementById('nutrition-search-modal').classList.add('open');
  setTimeout(() => document.getElementById('nutrition-search-input').focus(), 100);
}

export function closeNutritionSearch(e) { window._closeModal('nutrition-search-modal', e); }

// ── 검색 디바운싱 ────────────────────────────────────────────────
export function debouncedNutritionSearch() {
  const q = (document.getElementById('nutrition-search-input').value || '').trim();
  if (q === _lastSearchQuery) return;
  _lastSearchQuery = q;

  clearTimeout(_nutritionSearchTimer);
  _nutritionSearchTimer = setTimeout(() => {
    if (q) {
      renderNutritionSearchResults();
    } else {
      renderNutritionSearchInitial();
    }
  }, 300);
}

// ── 렌더링 헬퍼 ──────────────────────────────────────────────────
function _renderNutritionRow(item, { icon = '🏠', removable = false, isCSV = false } = {}) {
  const itemDataKey = `_nutritionItem_${item.id}`;
  window[itemDataKey] = item;
  const kcal = isCSV ? (item.energy || 0) : (item.nutrition?.kcal || item.kcal || 0);
  const carbs = isCSV ? item.carbs : (item.nutrition?.carbs ?? item.carbs);
  const protein = isCSV ? item.protein : (item.nutrition?.protein ?? item.protein);
  const fat = isCSV ? item.fat : (item.nutrition?.fat ?? item.fat);
  const removeBtn = removable
    ? `<button onclick="event.stopPropagation(); removeFromFavorites('${item.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0" title="즐겨찾기에서 제거">✕</button>`
    : '';
  return `
    <div class="nutrition-result-row"${removable ? ' style="display:flex;justify-content:space-between;align-items:center"' : ''}>
      <div onclick="selectNutritionItemFromCache('${itemDataKey}')" style="cursor:pointer;flex:1">
        <div class="nutrition-result-name">${icon} ${item.name}</div>
        <div class="nutrition-result-meta">
          ${item.defaultWeight && item.defaultWeight !== 100 ? `<span style="color:var(--primary);font-weight:600">1인분 ${item.defaultWeight}g · ${Math.round(kcal * item.defaultWeight / 100)}kcal</span>` : `<span>${(!isCSV && item.unit) ? item.unit : '100g'}</span><span>${kcal}kcal</span>`}
          ${carbs != null ? `<span>탄${Math.round(carbs)}g</span>` : ''}
          ${protein != null ? `<span>단${Math.round(protein)}g</span>` : ''}
          ${fat != null ? `<span>지${Math.round(fat)}g</span>` : ''}
        </div>
      </div>
      ${removeBtn}
    </div>`;
}

function _renderNutritionSection(title, items, options = {}) {
  if (!items.length) return '';
  return `<div style="font-size:12px;font-weight:600;color:${options.color || 'var(--text)'};padding:12px 8px;border-bottom:1px solid var(--border)${options.marginTop ? ';margin-top:8px' : ''}">${title}</div>`
    + items.map(item => _renderNutritionRow(item, options)).join('');
}

// ── 초기 검색 결과 ────────────────────────────────────────────────
export function renderNutritionSearchInitial() {
  const container = document.getElementById('nutrition-search-results');
  const recentItems = getRecentNutritionItems(10);

  let html = _renderNutritionSection('⭐ 최근 항목', recentItems, { removable: true });
  html += _buildRecipeResultsHtml('');

  if (!recentItems.length && !getCookingRecords().some(r => r.ingredients?.length)) {
    html = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">검색어를 입력해주세요</div>`;
  }

  container.innerHTML = html;
}

// ── 검색 결과 렌더링 ────────────────────────────────────────────────
export async function renderNutritionSearchResults() {
  const q = (document.getElementById('nutrition-search-input').value || '').trim();
  const container = document.getElementById('nutrition-search-results');

  let html = '';
  let allNames = new Set();

  if (!q) {
    const recentItems = getRecentNutritionItems(10);
    const csvResults = searchCSVFood('');
    _nutritionSearchCache = { db: [], csv: csvResults, recent: recentItems };

    html += _renderNutritionSection(`⭐ 즐겨찾기 (최근 ${recentItems.length}개)`, recentItems, { removable: true });
    html += _renderNutritionSection('📊 CSV 데이터', csvResults.slice(0, 20), { icon: '📊', isCSV: true, marginTop: true });

    if (!recentItems.length && !csvResults.length) {
      html = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">DB가 비어 있어요. 아래에서 음식을 추가해보세요</div>`;
    }
  } else {
    const dbResults = searchNutritionDB(q);
    const dbMatchedIds = new Set(dbResults.map(item => item.id));
    const recentFiltered = getRecentNutritionItems(10).filter(item => dbMatchedIds.has(item.id));
    const csvResults = searchCSVFood(q);
    // 로컬 원재료(큐레이티드) DB 검색 — 샐러리/닭가슴살처럼 단일 재료일 때 즉시 나옴
    const rawResults = searchRawIngredients(q);
    _nutritionSearchCache = { db: dbResults, csv: csvResults, recent: recentFiltered, raw: rawResults };

    html += _renderNutritionSection('⭐ 즐겨찾기', recentFiltered, { removable: true, color: 'var(--accent)' });

    // 원재료를 최상단에 — 자연식품은 보통 여기서 해결됨
    const rawForRender = rawResults.map(r => ({
      ...r,
      // 표시용: 카테고리 뱃지를 이름 뒤에 덧붙이지 않고 별도 메타에 이미 노출
    }));
    html += _renderNutritionSection('🥦 원재료 · 자연식품', rawForRender.slice(0, 10), { icon: '🥦', marginTop: true });

    html += _renderNutritionSection('🏠 DB 검색 결과', dbResults.slice(0, 15), { marginTop: true });

    const rawNames = new Set(rawResults.map(r => r.name?.toLowerCase()));
    const dbNames = new Set([...dbResults, ...recentFiltered].map(r => r.name?.toLowerCase()));
    const dedupedCsv = csvResults.filter(c => !dbNames.has(c.name?.toLowerCase()) && !rawNames.has(c.name?.toLowerCase()));
    html += _renderNutritionSection('📊 CSV 검색 결과', dedupedCsv.slice(0, 15), { icon: '📊', isCSV: true, marginTop: true });

    allNames = new Set([...dbNames, ...rawNames, ...dedupedCsv.map(c => c.name?.toLowerCase())]);

    html += `<div id="gov-api-results-placeholder" style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">🏛️ 공공 식품DB 검색 중...</div>`;

    html += _buildRecipeResultsHtml(q);
  }

  html += `<div style="padding:14px;text-align:center;border-top:1px solid var(--border);margin-top:8px">
    <button onclick="openNutritionDirectAdd()" style="background:none;border:1px dashed var(--accent);border-radius:8px;color:var(--accent);font-size:12px;font-weight:600;padding:10px 20px;cursor:pointer;width:100%">
      ➕ 직접 추가 (사진/텍스트 파싱)
    </button>
  </div>`;

  container.innerHTML = html;

  if (q) {
    try {
      const govResults = await searchGovFoodAPI(q);
      const placeholder = document.getElementById('gov-api-results-placeholder');
      if (placeholder && govResults && govResults.length > 0) {
        const dedupedGov = govResults.filter(g => !allNames?.has(g.name?.toLowerCase()));
        if (dedupedGov.length > 0) {
          const mapItem = (g) => ({
            id: g.id,
            name: g.name,
            defaultWeight: g.defaultWeight || 100,
            unit: '100g',
            kcal: g.energy,
            protein: g.protein,
            fat: g.fat,
            carbs: g.carbs,
            _source: g.source || '공공DB',
          });
          const rawItems  = dedupedGov.filter(g => g._grp === '원재료성').map(mapItem);
          const mealItems = dedupedGov.filter(g => g._grp === '음식').map(mapItem);
          const procItems = dedupedGov.filter(g => !g._grp || (g._grp !== '원재료성' && g._grp !== '음식')).map(mapItem);

          let govHtml = '';
          if (rawItems.length) {
            govHtml += _renderNutritionSection(
              '🌿 공공DB 원재료',
              rawItems.slice(0, 10),
              { icon: '🌿', marginTop: false }
            );
          }
          if (mealItems.length) {
            govHtml += _renderNutritionSection(
              '🍽️ 공공DB 음식',
              mealItems.slice(0, 8),
              { icon: '🍽️', marginTop: true }
            );
          }
          if (procItems.length) {
            govHtml += _renderNutritionSection(
              '🏛️ 공공DB 가공식품',
              procItems.slice(0, 8),
              { icon: '🏛️', marginTop: true }
            );
          }
          placeholder.outerHTML = govHtml || '';
        } else {
          placeholder.remove();
        }
      } else if (placeholder) {
        placeholder.remove();
      }
    } catch (e) {
      console.warn('[공공API] 검색 실패:', e);
      document.getElementById('gov-api-results-placeholder')?.remove();
    }
  }
}

// ── 직접 추가 ────────────────────────────────────────────────────
// 2026-04-20: servingSize 우선순위를 canonical base/servings 기준으로 명시.
//   이전엔 `savedItem.servingSize || parseFloat(unit 정규식) || 100` 체인만 있어서
//   레거시/OCR 경로로 unit 만 문자열로 들어온 아이템이 100g 로 잘못 덮어쓰이는 2차 원인.
//   serializeForStorage 를 거친 저장은 servingSize 를 항상 세팅하지만, 구 버전 저장이나
//   외부 import 경로에 대한 방어.
export function openNutritionDirectAdd() {
  window._onNutritionItemSaved = (savedItem) => {
    window._onNutritionItemSaved = null;
    if (!savedItem) return;
    const baseGrams = savedItem.base && Number(savedItem.base.grams) > 0
      ? Number(savedItem.base.grams) : null;
    const servingGrams = Array.isArray(savedItem.servings) && savedItem.servings.length > 0
      ? (Number(savedItem.servings[0]?.baseGrams) || null) : null;
    const servingSize = Number(savedItem.servingSize)
      || baseGrams
      || servingGrams
      || parseFloat(savedItem.unit?.match(/[\d.]+/)?.[0] || 100);
    const item = {
      id: savedItem.id,
      name: savedItem.name,
      servingSize,
      unit: savedItem.unit || savedItem.base?.label || '100g',
      nutrition: savedItem.nutrition || { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      // canonical 보존 — weight-modal 이 _toCanonical 로 읽어 단위 드롭다운 생성 가능.
      base: savedItem.base,
      servings: savedItem.servings,
      defaultServingId: savedItem.defaultServingId,
    };
    if (window.openNutritionWeightModal) {
      window.openNutritionWeightModal(item);
    }
  };
  // window 경로 명시 — nutrition-item-modal.js 의 window 노출(2026-04-20 수정)에 의존.
  if (typeof window.openNutritionItemEditor === 'function') {
    window.openNutritionItemEditor(null);
  } else {
    console.error('[openNutritionDirectAdd] openNutritionItemEditor 미등록 — modal-manager 가 nutrition-item-modal 을 로드했는지 확인');
  }
}

// ── 즐겨찾기 제거 ─────────────────────────────────────────────────
export async function removeFromFavorites(itemId) {
  try {
    await deleteNutritionItem(itemId);
    renderNutritionSearchResults();
    console.log('[영양검색] 즐겨찾기에서 제거:', itemId);
  } catch (e) {
    console.error('[영양검색] 삭제 실패:', e);
  }
}

// ── 1인분 영양정보 계산 ────────────────────────────────────────────
function _calcPerServing(recipe) {
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

// ── 내 요리 → 식단에 추가 ──────────────────────────────────────────
export function selectCookingRecipeForDiet(recipeId) {
  const recipe = getCookingRecords().find(r => r.id === recipeId);
  if (!recipe || !_nutritionSearchMeal) return;
  const ps = _calcPerServing(recipe);
  if (!ps) return;

  const foodItem = {
    id: recipe.id,
    name: recipe.name,
    grams: ps.grams,
    kcal: ps.kcal,
    protein: ps.protein,
    carbs: ps.carbs,
    fat: ps.fat,
    recipeId: recipe.id,
  };

  wtAddFoodItem(_nutritionSearchMeal, foodItem);
  document.getElementById('nutrition-search-modal')?.classList.remove('open');
}

function _buildRecipeResultsHtml(q) {
  const recipes = getCookingRecords()
    .filter(r => r.ingredients?.length > 0)
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  if (!recipes.length) return '';

  let html = `<div style="font-size:12px;font-weight:600;color:var(--text);padding:12px 8px;border-bottom:1px solid var(--border);margin-top:8px">🍳 내 요리</div>`;
  html += recipes.slice(0, 10).map(r => {
    const ps = _calcPerServing(r);
    if (!ps) return '';
    return `
      <div class="nutrition-result-row" onclick="selectCookingRecipeForDiet('${r.id}')" style="cursor:pointer">
        <div class="nutrition-result-name">🍳 ${r.name} <span style="color:var(--muted);font-size:10px">${r.servings||1}인분</span></div>
        <div class="nutrition-result-meta">
          <span>${ps.kcal}kcal</span>
          <span>탄${Math.round(ps.carbs)}g</span>
          <span>단${Math.round(ps.protein)}g</span>
          <span>지${Math.round(ps.fat)}g</span>
        </div>
      </div>`;
  }).join('');
  return html;
}

// ── 항목 선택 ────────────────────────────────────────────────────
export function selectNutritionItem(itemId) {
  let item = null;

  if (_nutritionSearchCache.recent && _nutritionSearchCache.recent.length > 0) {
    item = _nutritionSearchCache.recent.find(n => n.id === itemId);
  }
  if (!item && _nutritionSearchCache.db && _nutritionSearchCache.db.length > 0) {
    item = _nutritionSearchCache.db.find(n => n.id === itemId);
  }
  if (!item && _nutritionSearchCache.raw && _nutritionSearchCache.raw.length > 0) {
    item = _nutritionSearchCache.raw.find(n => n.id === itemId);
  }
  if (!item && _nutritionSearchCache.csv && _nutritionSearchCache.csv.length > 0) {
    item = _nutritionSearchCache.csv.find(c => c.id === itemId);
  }
  if (!item) {
    item = getNutritionDB().find(n => n.id === itemId);
  }

  console.log('[selectNutritionItem] 찾은 항목:', { itemId, item, cacheSize: { recent: _nutritionSearchCache.recent?.length, db: _nutritionSearchCache.db?.length, csv: _nutritionSearchCache.csv?.length } });

  if (!item || !_nutritionSearchMeal) {
    console.error('[selectNutritionItem] 항목을 찾을 수 없거나 meal이 없습니다:', { itemId, hasItem: !!item, hasMeal: !!_nutritionSearchMeal });
    return;
  }

  openNutritionWeightModal(item);
}

export function selectNutritionItemFromCache(itemDataKey) {
  const item = window[itemDataKey];

  if (!item) {
    console.error('[selectNutritionItemFromCache] 항목을 찾을 수 없습니다:', itemDataKey);
    return;
  }

  if (!_nutritionSearchMeal) {
    console.error('[selectNutritionItemFromCache] 선택된 meal이 없습니다');
    return;
  }

  console.log('[selectNutritionItemFromCache] 항목 열기:', { itemDataKey, item });
  openNutritionWeightModal(item);
}

// ── window 등록 (self-register) ─────────────────────────────────
Object.assign(window, {
  openNutritionSearch,
  closeNutritionSearch,
  debouncedNutritionSearch,
  renderNutritionSearchResults,
  renderNutritionSearchInitial,
  selectNutritionItem,
  selectNutritionItemFromCache,
  openNutritionDirectAdd,
  removeFromFavorites,
  selectCookingRecipeForDiet,
});
