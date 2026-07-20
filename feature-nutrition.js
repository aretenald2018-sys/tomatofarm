// ================================================================
// feature-nutrition.js — 영양 DB 검색, 공공API, 직접추가, 캐시
// ================================================================

import { searchNutritionDB, getNutritionDB, getRecentNutritionItems,
         deleteNutritionItem, getCookingRecords } from './data.js';
import { loadCSVDatabase, searchCSVFood, searchGovFoodAPI, searchOpenFoodFacts } from './fatsecret-api.js';
import { searchRawIngredients } from './data/raw-ingredients.js';
import { addMealFood } from './diet/feature.js';
import { ensureModal } from './modal-manager.js';
import { openModal, closeModal } from './app/overlay-stack.js';
import { canonicalNutritionDisplay, toCanonicalNutritionItem } from './diet/nutrition-item.js';
import { setNutritionItemSavedHandler } from './diet/editor-events.js';
import { getNutritionSearchMeal, setNutritionSearchMeal } from './diet/selection.js';
import { openNutritionWeightModal } from './modals/nutrition-weight-modal.js';
import { openNutritionItemEditor, switchNutritionTab } from './modals/nutrition-item-modal.js';

// ── 상태 ──────────────────────────────────────────────────────────
let _nutritionSearchCache = { db: [], csv: [], recent: [], raw: [], brand: [] };
let _nutritionSearchTimer = null;
let _lastSearchQuery = null;
let _nutritionCSVLoaded = false;

// NOTE: _loadPublicFoodDB / _loadAgriFoodDB는 과거에 19,495건을 localStorage에
// 적재했지만 검색에 쓰지 않아 비용 대비 효용이 없었음. 2026-04-17 제거.
// 원재료 검색은 1) 로컬 큐레이티드 DB(data/raw-ingredients.js) 우선,
// 2) 식약처 공공API(searchGovFoodAPI) 보조로 처리.

// ── 영양 검색 모달 ────────────────────────────────────────────────
async function _getNutritionSearchElements() {
  await ensureModal('nutrition-search-modal');
  const modal = document.getElementById('nutrition-search-modal');
  const input = document.getElementById('nutrition-search-input');
  const results = document.getElementById('nutrition-search-results');
  if (!modal || !input || !results) {
    throw new Error('nutrition-search-modal is not ready');
  }
  return { modal, input, results };
}

export async function openNutritionSearch(mealId) {
  setNutritionSearchMeal(mealId);
  const { modal, input } = await _getNutritionSearchElements();
  input.value = '';

  if (!_nutritionCSVLoaded) {
    try {
      const csvPath2 = window.location.pathname.replace(/\/[^/]*$/, '') + '/public/data/foods.csv';
      await loadCSVDatabase(csvPath2);
      _nutritionCSVLoaded = true;
      console.log('[영양검색] CSV 로드됨:', csvPath2);
    } catch (e) {
      console.warn('[영양검색] CSV 로드 실패:', e);
    }
  }

  renderNutritionSearchInitial();
  openModal('nutrition-search-modal');
  setTimeout(() => input?.focus(), 100);
}

export function closeNutritionSearch(e) { closeModal('nutrition-search-modal', e); }

// ── 검색 디바운싱 ────────────────────────────────────────────────
export function debouncedNutritionSearch() {
  const input = document.getElementById('nutrition-search-input');
  if (!input) return;
  const q = (input.value || '').trim();
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
function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _renderNutritionRow(item, { icon = '🏠', removable = false, isCSV = false } = {}) {
  const display = canonicalNutritionDisplay(item);
  if (!display) return '';
  const canonical = display.canonical;
  const itemDataKey = `_nutritionItem_${item.id}`;
  window[itemDataKey] = canonical;
  const name = _escapeHtml(canonical.name || '이름 없는 식품');
  const manufacturer = _escapeHtml(canonical.brand || '');
  const { kcal, carbs, protein, fat } = display.nutrition;
  const removeBtn = removable
    ? `<button data-nutrition-action="remove-favorite" data-item-id="${canonical.id}" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0" title="즐겨찾기에서 제거">✕</button>`
    : '';
  return `
    <div class="nutrition-result-row"${removable ? ' style="display:flex;justify-content:space-between;align-items:center"' : ''}>
      <div data-nutrition-action="select-cache" data-item-key="${itemDataKey}" style="cursor:pointer;flex:1">
        <div class="nutrition-result-name">${icon} ${name}${manufacturer ? ` <span style="color:var(--muted);font-size:10px">· ${manufacturer}</span>` : ''}</div>
        <div class="nutrition-result-meta">
          <span>${_escapeHtml(display.serving.label || canonical.base?.label || '100g')}</span><span>${Math.round(kcal)}kcal</span>
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
  if (!container) return;
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
  const input = document.getElementById('nutrition-search-input');
  const container = document.getElementById('nutrition-search-results');
  if (!input || !container) return;
  const q = (input.value || '').trim();

  let html = '';
  let allNames = new Set();

  if (!q) {
    const recentItems = getRecentNutritionItems(10);
    const csvResults = searchCSVFood('');
    _nutritionSearchCache = { db: [], csv: csvResults, recent: recentItems, raw: [], brand: [] };

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
    _nutritionSearchCache = { db: dbResults, csv: csvResults, recent: recentFiltered, raw: rawResults, brand: [] };

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

    html += `<div id="live-food-db-results-placeholder" style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">🏛️ 최신 공공·브랜드 식품DB 검색 중...</div>`;

    html += _buildRecipeResultsHtml(q);
  }

  html += `<div style="padding:14px;text-align:center;border-top:1px solid var(--border);margin-top:8px">
    <button data-nutrition-action="open-direct-add" style="background:none;border:1px dashed var(--accent);border-radius:8px;color:var(--accent);font-size:12px;font-weight:600;padding:10px 20px;cursor:pointer;width:100%">
      ➕ 직접 추가 (사진/텍스트 파싱)
    </button>
  </div>`;

  container.innerHTML = html;

  if (q) {
    try {
      const [govResults, brandResults] = await Promise.all([
        searchGovFoodAPI(q),
        searchOpenFoodFacts(q),
      ]);
      const placeholder = document.getElementById('live-food-db-results-placeholder');
      if (!placeholder || (input.value || '').trim() !== q) return;

      const resultKey = (item) => `${item?.name || ''}|${item?.manufacturer || item?.brand || ''}`.toLocaleLowerCase('ko-KR');
      const shouldHideAsDuplicate = (item, keys) => {
        if (keys.has(resultKey(item))) return true;
        const hasBrand = Boolean(item?.manufacturer || item?.brand);
        return !hasBrand && allNames?.has(item?.name?.toLowerCase());
      };
      const localKeys = new Set([
        ...dbResults,
        ...recentFiltered,
        ...rawResults,
        ...dedupedCsv,
      ].map(resultKey));
      const dedupedGov = (govResults || []).filter(g => !shouldHideAsDuplicate(g, localKeys));
      const govKeys = new Set(dedupedGov.map(resultKey));
      const dedupedBrand = (brandResults || []).filter(item => !shouldHideAsDuplicate(item, localKeys) && !govKeys.has(resultKey(item)));
      _nutritionSearchCache.brand = dedupedBrand;

      const mapItem = (item) => ({
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        aliases: item.aliases,
        defaultWeight: item.defaultWeight || 100,
        unit: '100g',
        kcal: item.energy,
        protein: item.protein,
        fat: item.fat,
        carbs: item.carbs,
        sodium: item.sodium,
        _grp: item._grp,
        _source: item.source || '식품DB',
      });
      const rawItems  = dedupedGov.filter(g => g._grp === '원재료성').map(mapItem);
      const mealItems = dedupedGov.filter(g => g._grp === '음식').map(mapItem);
      const procItems = dedupedGov.filter(g => !g._grp || (g._grp !== '원재료성' && g._grp !== '음식')).map(mapItem);
      const brandedItems = dedupedBrand.map(mapItem);

      let liveHtml = '';
      if (rawItems.length) {
        liveHtml += _renderNutritionSection(
          '🌿 공공DB 원재료',
          rawItems.slice(0, 10),
          { icon: '🌿', marginTop: false }
        );
      }
      if (mealItems.length) {
        liveHtml += _renderNutritionSection(
          '🍽️ 공공DB 음식',
          mealItems.slice(0, 10),
          { icon: '🍽️', marginTop: true }
        );
      }
      if (procItems.length) {
        liveHtml += _renderNutritionSection(
          '🏛️ 공공DB 가공식품',
          procItems.slice(0, 10),
          { icon: '🏛️', marginTop: true }
        );
      }
      if (brandedItems.length) {
        liveHtml += _renderNutritionSection(
          '🏷️ 최신 브랜드 식품',
          brandedItems.slice(0, 10),
          { icon: '🏷️', marginTop: true }
        );
      }
      placeholder.outerHTML = liveHtml;
    } catch (e) {
      console.warn('[식품DB] 검색 실패:', e);
      document.getElementById('live-food-db-results-placeholder')?.remove();
    }
  }
}

// ── 직접 추가 ────────────────────────────────────────────────────
// 2026-04-20: servingSize 우선순위를 canonical base/servings 기준으로 명시.
//   이전엔 `savedItem.servingSize || parseFloat(unit 정규식) || 100` 체인만 있어서
//   레거시/OCR 경로로 unit 만 문자열로 들어온 아이템이 100g 로 잘못 덮어쓰이는 2차 원인.
//   serializeForStorage 를 거친 저장은 servingSize 를 항상 세팅하지만, 구 버전 저장이나
//   외부 import 경로에 대한 방어.
async function _openNutritionEditorTab(tab) {
  await ensureModal('nutrition-item-modal');
  closeModal('nutrition-search-modal');
  await openNutritionItemEditor(null);
  switchNutritionTab(tab);
}

export async function openNutritionDirectAdd() {
  setNutritionItemSavedHandler((savedItem) => {
    if (!savedItem) return;
    openNutritionWeightModal(toCanonicalNutritionItem(savedItem));
  });
  await _openNutritionEditorTab('manual');
}

export async function openNutritionPhotoAdd() {
  await _openNutritionEditorTab('photo');
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
  const searchMeal = getNutritionSearchMeal();
  if (!recipe || !searchMeal) return;
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

  addMealFood(searchMeal, foodItem);
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
      <div class="nutrition-result-row" data-nutrition-action="select-recipe" data-recipe-id="${r.id}" style="cursor:pointer">
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
  if (!item && _nutritionSearchCache.brand && _nutritionSearchCache.brand.length > 0) {
    item = _nutritionSearchCache.brand.find(c => c.id === itemId);
  }
  if (!item) {
    item = getNutritionDB().find(n => n.id === itemId);
  }

  const searchMeal = getNutritionSearchMeal();
  if (!item || !searchMeal) {
    console.error('[selectNutritionItem] 항목을 찾을 수 없거나 meal이 없습니다:', { itemId, hasItem: !!item, hasMeal: !!searchMeal });
    return;
  }

  openNutritionWeightModal(toCanonicalNutritionItem(item));
}

export function selectNutritionItemFromCache(itemDataKey) {
  const item = window[itemDataKey];

  if (!item) {
    console.error('[selectNutritionItemFromCache] 항목을 찾을 수 없습니다:', itemDataKey);
    return;
  }

  if (!getNutritionSearchMeal()) {
    console.error('[selectNutritionItemFromCache] 선택된 meal이 없습니다');
    return;
  }

  openNutritionWeightModal(toCanonicalNutritionItem(item));
}

// ── window 등록 (self-register) ─────────────────────────────────
function _bindNutritionActions(root = document) {
  if (root.documentElement?.dataset.nutritionActionsBound === '1') return;
  if (root.documentElement) root.documentElement.dataset.nutritionActionsBound = '1';
  root.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-nutrition-action]');
    if (!control) return;
    const action = control.dataset.nutritionAction;
    if (action === 'close-search') closeNutritionSearch(event);
    if (action === 'open-direct-add') void openNutritionDirectAdd();
    if (action === 'open-photo-add') void openNutritionPhotoAdd();
    if (action === 'remove-favorite') {
      event.stopPropagation();
      void removeFromFavorites(control.dataset.itemId || '');
    }
    if (action === 'select-cache') selectNutritionItemFromCache(control.dataset.itemKey || '');
    if (action === 'select-recipe') selectCookingRecipeForDiet(control.dataset.recipeId || '');
  });
  root.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-nutrition-input-action="search"]')) debouncedNutritionSearch();
  });
}

_bindNutritionActions();
document.addEventListener('nutrition:database-changed', () => {
  if (document.getElementById('nutrition-search-modal')?.classList.contains('open')) {
    void renderNutritionSearchResults();
  }
});
