// ================================================================
// feature-fatsecret.js — 식품영양성분 DB 검색 (CSV + 공공API)
// ================================================================

import { loadCSVDatabase, searchCSVFood, searchGovFoodAPI } from './fatsecret-api.js';
import { wtAddFoodItem } from './render-workout.js';

let _fsMeal = 'breakfast';
let _fsSelectedFood = null;

function openFatSecretSearch(meal) {
  _fsMeal = meal;
  _fsSelectedFood = null;

  const modal         = document.getElementById('fatsecret-modal');
  const input         = document.getElementById('fs-search-input');
  const results       = document.getElementById('fs-results');
  const weightSection = document.getElementById('fs-weight-section');
  const noProxy       = document.getElementById('fatsecret-no-proxy');
  const body          = document.getElementById('fatsecret-search-body');

  if (input)         input.value = '';
  if (results)       results.innerHTML = '';
  if (weightSection) weightSection.style.display = 'none';

  const mealLabel = meal === 'breakfast' ? '아침' : meal === 'lunch' ? '점심' : meal === 'dinner' ? '저녁' : '간식';
  const titleEl   = modal.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = `🍖 음식 검색 — ${mealLabel}`;

  if (noProxy) noProxy.style.display = 'none';
  if (body)    body.style.display    = 'block';

  modal.classList.add('open');
  setTimeout(() => input?.focus(), 100);
}

function closeFatSecretSearch(e) { window._closeModal('fatsecret-modal', e); }

function _renderFoodResults(foods) {
  return foods.map((food, idx) => {
    const isGov = (food.id || '').startsWith('gov_');
    const sourceTag = food.source || (isGov ? '공공DB' : 'CSV');
    const tagColor = sourceTag.includes('자연') ? '#10b981' : isGov ? '#06b6d4' : '#6b7280';
    return `
      <div class="fs-result-row" onclick="fatsecretSelectFoodById('${idx}')" style="cursor:pointer;padding:8px;border-bottom:1px solid var(--border);transition:background 0.2s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='transparent'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="fs-result-name" style="font-weight:500">${food.name}</div>
          <div style="font-size:9px;padding:1px 6px;border-radius:8px;background:${tagColor};color:#fff">${sourceTag}</div>
        </div>
        <div style="font-size:10px;color:var(--muted)">${food.manufacturer || ''}</div>
        <div style="font-size:10px;color:var(--muted2)">에너지 ${food.energy}kcal | 단 ${food.protein}g | 지 ${food.fat}g | 탄 ${food.carbs}g</div>
      </div>`;
  }).join('');
}

async function fatsecretSearch() {
  const q = document.getElementById('fs-search-input').value.trim();
  if (!q) return;
  const results = document.getElementById('fs-results');
  results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 중...</div>';

  try {
    if (/[\uAC00-\uD7AF]/.test(q)) {
      console.log('[검색] 한국어 감지:', q);

      if (!window._csvLoaded) {
        try {
          await loadCSVDatabase(window.location.pathname.replace(/\/[^/]*$/, '') + '/public/data/foods.csv');
          window._csvLoaded = true;
          console.log('[CSV] 로드 완료');
        } catch (csvErr) {
          console.warn('[CSV] 로드 실패:', csvErr);
          window._csvDatabase = [];
        }
      }

      const csvFoods = searchCSVFood(q);
      console.log('[CSV 검색 결과]', csvFoods.length, '개');

      if (csvFoods && csvFoods.length > 0) {
        results.innerHTML = _renderFoodResults(csvFoods);
        window._fsSearchItems = csvFoods;
      }

      const govFoods = await searchGovFoodAPI(q);
      if (govFoods && govFoods.length > 0) {
        const csvNames = new Set((csvFoods || []).map(f => f.name));
        const newGovFoods = govFoods.filter(f => !csvNames.has(f.name));
        const combined = [...newGovFoods, ...(csvFoods || [])].slice(0, 15);
        results.innerHTML = _renderFoodResults(combined);
        window._fsSearchItems = combined;
      } else if (!csvFoods || csvFoods.length === 0) {
        results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 결과 없음</div>';
      }
      return;
    }

    const csvFoods2 = searchCSVFood(q);
    if (csvFoods2 && csvFoods2.length > 0) {
      results.innerHTML = _renderFoodResults(csvFoods2);
      window._fsSearchItems = csvFoods2;
      return;
    }

    results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">공공DB 검색 중...</div>';
    const govFoods2 = await searchGovFoodAPI(q);
    if (!govFoods2 || govFoods2.length === 0) {
      results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 결과 없음</div>';
      return;
    }
    results.innerHTML = _renderFoodResults(govFoods2);
    window._fsSearchItems = govFoods2;
  } catch(e) {
    console.error('[검색 오류]', e);
    results.innerHTML = `<div style="padding:12px;color:var(--diet-bad);font-size:12px">❌ 오류: ${e.message}</div>`;
  }
}

async function fatsecretSelectFoodById(idx) {
  const food = (window._fsSearchItems || [])[parseInt(idx)];
  if (!food) return;

  const analysisSection = document.getElementById('fs-analysis-section');
  if (analysisSection) {
    analysisSection.style.display = 'block';
  }

  const selectedName = document.getElementById('fs-selected-name');
  if (selectedName) selectedName.textContent = `🍽️ ${food.name}`;

  const isGov = (food.id || '').startsWith('gov_');
  console.log(`[${isGov ? '공공API' : 'CSV'} 선택]`, food.name);
  const nutrition = {
    kcal: food.energy,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  };

  const sourceLabel = isGov ? (food.source || '공공DB') : 'CSV 데이터';
  const nutritionPreview = document.getElementById('fs-nutrition-preview');
  if (nutritionPreview) {
    nutritionPreview.innerHTML = `
      <strong>${sourceLabel}</strong><br>
      100g 기준: <strong>${nutrition.kcal}kcal</strong> |
      단백질 ${nutrition.protein}g | 지방 ${nutrition.fat}g | 탄수화물 ${nutrition.carbs}g
      ${food.manufacturer ? `<br><strong>${isGov ? '출처' : '제조사'}:</strong> ${food.manufacturer}` : ''}
    `;
  }

  _fsSelectedFood = {
    id: food.id,
    name: food.name,
    per100g: nutrition,
    rawData: food,
  };

  const gramsInput = document.getElementById('fs-grams-input');
  if (gramsInput) {
    gramsInput.value = '100';
    gramsInput.addEventListener('input', _updateFsCalcPreview);
  }

  _updateFsCalcPreview();
}

function _updateFsCalcPreview() {
  if (!_fsSelectedFood?.per100g) return;
  const grams = parseFloat(document.getElementById('fs-grams-input').value) || 0;
  const p     = _fsSelectedFood.per100g;
  const ratio = grams / 100;
  const el    = document.getElementById('fs-calc-preview');
  if (el) el.textContent = grams > 0
    ? `${Math.round(p.kcal*ratio)}kcal / 단${Math.round(p.protein*ratio*10)/10}g / 탄${Math.round(p.carbs*ratio*10)/10}g / 지${Math.round(p.fat*ratio*10)/10}g`
    : '';
}

function fatsecretAddFood() {
  if (!_fsSelectedFood) return;
  const grams = parseFloat(document.getElementById('fs-grams-input').value);
  if (!grams || grams <= 0) { window.showToast?.('중량을 입력해주세요', 2500, 'warning'); return; }

  const p     = _fsSelectedFood.per100g;
  const ratio = grams / 100;
  wtAddFoodItem(_fsMeal, {
    id:      _fsSelectedFood.id,
    name:    _fsSelectedFood.name,
    grams,
    kcal:    Math.round(p.kcal    * ratio),
    protein: Math.round(p.protein * ratio * 10) / 10,
    carbs:   Math.round(p.carbs   * ratio * 10) / 10,
    fat:     Math.round(p.fat     * ratio * 10) / 10,
  });
  document.getElementById('fatsecret-modal').classList.remove('open');
}

function fatsecretBackToSearch() {
  document.getElementById('fs-analysis-section').style.display = 'none';
  document.getElementById('fs-search-input').focus();
  _fsSelectedFood = null;
}

Object.assign(window, {
  openFatSecretSearch,
  closeFatSecretSearch,
  fatsecretSearch,
  fatsecretSelectFoodById,
  fatsecretAddFood,
  fatsecretBackToSearch,
});
