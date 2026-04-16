// ================================================================
// feature-nutrition.js — 영양 DB 검색, 공공API, 직접추가, 캐시
// ================================================================

import { searchNutritionDB, getNutritionDB, getRecentNutritionItems,
         deleteNutritionItem, getCookingRecords } from './data.js';
import { loadCSVDatabase, searchCSVFood, searchGovFoodAPI } from './fatsecret-api.js';
import { wtAddFoodItem } from './render-workout.js';

// ── 상태 ──────────────────────────────────────────────────────────
let _nutritionSearchMeal = null;
let _nutritionSearchCache = { db: [], csv: [], recent: [] };
let _nutritionSearchTimer = null;
let _lastSearchQuery = null;

// ── 공공데이터 식품영양성분 API ──────────────────────────────────────
const _PUBLIC_FOOD_API = 'https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api';
const _PUBLIC_FOOD_KEY = 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b';
let _publicFoodCache = null;
let _publicFoodLoading = false;

// ── 농촌진흥청 메뉴젠 식품영양성분 API ──────────────────────────────
const _AGRI_FOOD_API = 'https://apis.data.go.kr/1390803/AgriFood/MzenFoodNutri/getKoreanFoodIdntList';
const _AGRI_FOOD_KEY = 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b';
let _agriFoodCache = null;
let _agriFoodLoading = false;

// ── 공공DB 로드 ─────────────────────────────────────────────────
async function _loadPublicFoodDB() {
  if (_publicFoodCache) return _publicFoodCache;
  if (_publicFoodLoading) return [];

  try {
    const cached = localStorage.getItem('publicFoodDB');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 7 * 86400000) {
        _publicFoodCache = parsed.data;
        console.log(`[식품DB] 캐시 로드: ${_publicFoodCache.length}건`);
        return _publicFoodCache;
      }
    }
  } catch {}

  _publicFoodLoading = true;
  console.log('[식품DB] API에서 전체 데이터 로딩 중...');

  try {
    const allItems = [];
    const pageSize = 1000;
    const firstRes = await fetch(`${_PUBLIC_FOOD_API}?serviceKey=${_PUBLIC_FOOD_KEY}&pageNo=1&numOfRows=${pageSize}&type=json`);
    const firstData = await firstRes.json();
    const total = parseInt(firstData.response?.body?.totalCount || 0);
    const firstItems = firstData.response?.body?.items || [];
    firstItems.forEach(it => allItems.push(_parsePublicFoodItem(it)));

    const totalPages = Math.ceil(total / pageSize);
    console.log(`[식품DB] 총 ${total}건, ${totalPages}페이지`);

    for (let batch = 2; batch <= totalPages; batch += 5) {
      const promises = [];
      for (let p = batch; p < batch + 5 && p <= totalPages; p++) {
        promises.push(
          fetch(`${_PUBLIC_FOOD_API}?serviceKey=${_PUBLIC_FOOD_KEY}&pageNo=${p}&numOfRows=${pageSize}&type=json`)
            .then(r => r.json())
            .then(d => (d.response?.body?.items || []).forEach(it => allItems.push(_parsePublicFoodItem(it))))
            .catch(() => {})
        );
      }
      await Promise.all(promises);
    }

    _publicFoodCache = allItems;
    console.log(`[식품DB] 로드 완료: ${allItems.length}건`);

    try {
      localStorage.setItem('publicFoodDB', JSON.stringify({ ts: Date.now(), data: allItems }));
    } catch { /* storage full */ }
  } catch (e) {
    console.error('[식품DB] 로드 실패:', e);
    _publicFoodCache = [];
  } finally {
    _publicFoodLoading = false;
  }
  return _publicFoodCache;
}

function _parsePublicFoodItem(raw) {
  const baseUnit = raw.nutConSrtrQua || '100g';
  const baseGrams = parseFloat(baseUnit) || 100;
  const foodSize = parseFloat(raw.foodSize) || 0;
  const defaultWeight = foodSize > 0 && foodSize !== baseGrams ? foodSize : baseGrams;

  return {
    id: 'pub_' + (raw.foodCd || Math.random().toString(36).slice(2)),
    name: raw.foodNm || '',
    unit: baseUnit,
    defaultWeight,
    kcal: parseFloat(raw.enerc) || 0,
    protein: parseFloat(raw.prot) || 0,
    fat: parseFloat(raw.fatce) || 0,
    carbs: parseFloat(raw.chocdf) || 0,
    sugar: parseFloat(raw.sugar) || 0,
    sodium: parseFloat(raw.nat) || 0,
    fiber: parseFloat(raw.fibtg) || 0,
    _source: 'public_api',
  };
}

function searchPublicFoodDB(query) {
  if (!_publicFoodCache || !query) return [];
  const q = query.toLowerCase();
  return _publicFoodCache
    .filter(it => it.name && it.name.toLowerCase().includes(q))
    .slice(0, 20);
}

// ── 농식품DB 로드 ────────────────────────────────────────────────
async function _loadAgriFoodDB() {
  if (_agriFoodCache) return _agriFoodCache;
  if (_agriFoodLoading) return [];

  try {
    const cached = localStorage.getItem('agriFoodDB');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 7 * 86400000) {
        _agriFoodCache = parsed.data;
        console.log(`[농식품DB] 캐시 로드: ${_agriFoodCache.length}건`);
        return _agriFoodCache;
      }
    }
  } catch {}

  _agriFoodLoading = true;
  console.log('[농식품DB] API 로딩 중...');

  try {
    const allItems = [];
    const res = await fetch(`${_AGRI_FOOD_API}?serviceKey=${_AGRI_FOOD_KEY}&pageNo=1&numOfRows=1000&type=json`);
    if (!res.ok) {
      console.warn('[농식품DB] API 응답 에러:', res.status);
      _agriFoodCache = [];
      return [];
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      const items = xml.querySelectorAll('item');
      items.forEach(item => {
        const get = (tag) => item.querySelector(tag)?.textContent || '';
        allItems.push({
          id: 'agri_' + get('foodCd'),
          name: get('foodNm'),
          unit: '1인분',
          defaultWeight: parseFloat(get('servSize')) || parseFloat(get('foodSize')) || 100,
          kcal: parseFloat(get('enerc')) || 0,
          protein: parseFloat(get('prot')) || 0,
          fat: parseFloat(get('fatce')) || 0,
          carbs: parseFloat(get('chocdf')) || 0,
          _source: 'agri_api',
        });
      });
      _agriFoodCache = allItems;
      console.log(`[농식품DB] XML 파싱 완료: ${allItems.length}건`);
      try { localStorage.setItem('agriFoodDB', JSON.stringify({ ts: Date.now(), data: allItems })); } catch {}
      return allItems;
    }

    const body = data?.response?.body;
    const total = parseInt(body?.totalCount || 0);
    const items = body?.items || [];
    items.forEach(it => allItems.push(_parseAgriFoodItem(it)));

    const pageSize = 1000;
    const totalPages = Math.ceil(total / pageSize);
    for (let p = 2; p <= totalPages; p++) {
      try {
        const r = await fetch(`${_AGRI_FOOD_API}?serviceKey=${_AGRI_FOOD_KEY}&pageNo=${p}&numOfRows=${pageSize}&type=json`);
        const d = await r.json();
        (d?.response?.body?.items || []).forEach(it => allItems.push(_parseAgriFoodItem(it)));
      } catch {}
    }

    _agriFoodCache = allItems;
    console.log(`[농식품DB] 로드 완료: ${allItems.length}건`);
    try { localStorage.setItem('agriFoodDB', JSON.stringify({ ts: Date.now(), data: allItems })); } catch {}
  } catch (e) {
    console.warn('[농식품DB] 로드 실패:', e.message);
    _agriFoodCache = [];
  } finally {
    _agriFoodLoading = false;
  }
  return _agriFoodCache;
}

function _parseAgriFoodItem(raw) {
  return {
    id: 'agri_' + (raw.foodCd || raw.FOOD_CD || Math.random().toString(36).slice(2)),
    name: raw.foodNm || raw.FOOD_NM_KR || '',
    unit: '1인분',
    defaultWeight: parseFloat(raw.servSize || raw.SERVING_SIZE || raw.foodSize) || 100,
    kcal: parseFloat(raw.enerc || raw.AMT_NUM1) || 0,
    protein: parseFloat(raw.prot || raw.AMT_NUM3) || 0,
    fat: parseFloat(raw.fatce || raw.AMT_NUM4) || 0,
    carbs: parseFloat(raw.chocdf || raw.AMT_NUM7) || 0,
    _source: 'agri_api',
  };
}

function searchAgriFoodDB(query) {
  if (!_agriFoodCache || !query) return [];
  const q = query.toLowerCase();
  return _agriFoodCache
    .filter(it => it.name && it.name.toLowerCase().includes(q))
    .slice(0, 20);
}

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

  Promise.all([_loadPublicFoodDB(), _loadAgriFoodDB()]).then(() => {
    const q = document.getElementById('nutrition-search-input')?.value?.trim();
    if (q) renderNutritionSearchResults();
  });

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
          ${carbs != null ? `<span>탄${carbs}g</span>` : ''}
          ${protein != null ? `<span>단${protein}g</span>` : ''}
          ${fat != null ? `<span>지${fat}g</span>` : ''}
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
    _nutritionSearchCache = { db: dbResults, csv: csvResults, recent: recentFiltered };

    html += _renderNutritionSection('⭐ 즐겨찾기', recentFiltered, { removable: true, color: 'var(--accent)' });
    html += _renderNutritionSection('🏠 DB 검색 결과', dbResults.slice(0, 15), { marginTop: true });

    const dbNames = new Set([...dbResults, ...recentFiltered].map(r => r.name?.toLowerCase()));
    const dedupedCsv = csvResults.filter(c => !dbNames.has(c.name?.toLowerCase()));
    html += _renderNutritionSection('📊 CSV 검색 결과', dedupedCsv.slice(0, 15), { icon: '📊', isCSV: true, marginTop: true });

    allNames = new Set([...dbNames, ...dedupedCsv.map(c => c.name?.toLowerCase())]);

    html += `<div id="gov-api-results-placeholder" style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">🏛️ 공공 식품DB 검색 중...</div>`;

    html += _buildRecipeResultsHtml(q);

    if (!recentFiltered.length && !dbResults.length && !dedupedCsv.length && !html.includes('🍳 내 요리')) {
      // CSV/DB 결과 없으면 공공API 결과를 기다림
    }
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
          const govItems = dedupedGov.map(g => ({
            id: g.id,
            name: g.name,
            defaultWeight: g.defaultWeight || 100,
            unit: '100g',
            kcal: g.energy,
            protein: g.protein,
            fat: g.fat,
            carbs: g.carbs,
            _source: g.source || '공공DB',
          }));
          let govHtml = _renderNutritionSection(
            '🏛️ 공공 식품DB (자연식품 포함)',
            govItems.slice(0, 15),
            { icon: '🏛️', marginTop: false }
          );
          placeholder.outerHTML = govHtml;
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
export function openNutritionDirectAdd() {
  window._onNutritionItemSaved = (savedItem) => {
    window._onNutritionItemSaved = null;
    if (!savedItem) return;
    const item = {
      id: savedItem.id,
      name: savedItem.name,
      servingSize: savedItem.servingSize || parseFloat(savedItem.unit?.match(/[\d.]+/)?.[0] || 100),
      unit: savedItem.unit || '100g',
      nutrition: savedItem.nutrition || { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    };
    if (window.openNutritionWeightModal) {
      window.openNutritionWeightModal(item);
    }
  };
  openNutritionItemEditor(null);
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
          <span>탄${ps.carbs}g</span>
          <span>단${ps.protein}g</span>
          <span>지${ps.fat}g</span>
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
