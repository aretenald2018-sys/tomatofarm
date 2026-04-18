// ================================================================
// data/nutrition-normalize.js
// 2026-04-18 NUTRITION_REFACTOR
// 역할: 검색 결과/저장 아이템을 canonical NutritionItem shape으로 변환.
//       기존 DB(레거시) 데이터는 건드리지 않고, 읽을 때만 변환해 UI에 공급.
// ================================================================
//
// Canonical NutritionItem:
// {
//   id, name, brand?, source, _grp?,
//   base: { type: 'per_100g'|'per_100ml'|'per_serving', grams|ml, label? },
//   nutrition: { kcal, protein, carbs, fat, fiber?, sugar?, sodium? },
//   servings: [ { id, label, grams } ],        // 전환 가능한 단위
//   defaultServingId: string,
// }
// ================================================================

const _NUM = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// 액상 판정 키워드 — 단위(ml) 추정에 사용
//   * bare `차` 는 "차돌박이/차조기" 같은 고형식품도 매칭하므로 금지.
//     대신 (?<=[가-힣])차(?![가-힣]) — 한글 뒤에 위치한 차 끝말(녹차/홍차/보리차 등)만 매칭.
//   * bare `밀크` 는 "밀크초콜릿/밀크빵" 등 고형을 유발하므로 `밀크티/밀크쉐이크` 로 명시.
const _LIQUID_KEYWORDS = /우유|음료|주스|쥬스|커피|라떼|스무디|에이드|와인|맥주|소주|사이다|콜라|탄산음료|탄산수|요거트음료|밀크티|밀크쉐이크|생수|물$|사케|막걸리|(?<=[가-힣])차(?![가-힣])/;

function _looksLiquid(name) {
  return _LIQUID_KEYWORDS.test(String(name || ''));
}

function _buildServings(base, defaultWeight, groupHint) {
  const servings = [];
  const baseAmount = base.type === 'per_100ml' ? (base.ml || 100) : (base.grams || 100);

  // 기본 단위(base)는 항상 첫 번째로 등록
  if (base.type === 'per_100g') {
    servings.push({ id: 'per_100g', label: '100g', grams: 100 });
  } else if (base.type === 'per_100ml') {
    servings.push({ id: 'per_100ml', label: '100ml', grams: 100 });
  } else if (base.type === 'per_serving') {
    const unit = base.label || `1회 제공량 ${baseAmount}g`;
    servings.push({ id: 'per_serving', label: unit, grams: baseAmount });
  }

  // 1인분 추정값이 base와 다르면 추가 (표기상 구분)
  const est = _NUM(defaultWeight);
  if (est > 0 && est !== baseAmount) {
    // 가공식품이 per_serving이라면 defaultWeight는 같은 개념이므로 중복 안 넣음
    if (!(base.type === 'per_serving' && Math.abs(est - baseAmount) < 1)) {
      servings.push({
        id: 'serving_est',
        label: groupHint === '원재료성' ? `한 줌 ${est}g` : `1인분 ${est}g`,
        grams: est,
      });
    }
  }

  // per_100g가 기본이 아니면 "100g 기준"도 옵션으로 추가 (대조 용이)
  if (base.type !== 'per_100g' && base.type !== 'per_100ml') {
    servings.push({ id: 'per_100g', label: '100g', grams: 100 });
  }

  return servings;
}

// ── CSV (fatsecret-api.js searchCSVFood 결과) ───────────────────
// CSV는 항상 per_100g 기준. defaultWeight는 1인분 추정값.
export function normalizeFromCsv(csvItem) {
  if (!csvItem) return null;
  const base = { type: 'per_100g', grams: 100, label: '100g' };
  const servings = _buildServings(base, csvItem.defaultWeight, '가공식품');
  return {
    id: csvItem.id,
    name: csvItem.name,
    brand: csvItem.manufacturer || null,
    source: 'csv',
    _grp: '가공식품',
    base,
    nutrition: {
      kcal: _NUM(csvItem.energy),
      protein: _NUM(csvItem.protein),
      carbs: _NUM(csvItem.carbs),
      fat: _NUM(csvItem.fat),
      sodium: _NUM(csvItem.sodium),
      fiber: 0, sugar: 0,
    },
    servings,
    // 가공식품이라도 CSV는 per_100g 베이스만 주므로 기본은 1인분 추정(있으면)으로 제시
    defaultServingId: servings.find(s => s.id === 'serving_est') ? 'serving_est' : 'per_100g',
  };
}

// ── 공공API (searchGovFoodAPI 결과) ─────────────────────────────
// 모두 per_100g. _grp로 원재료/음식/가공식품 분기.
export function normalizeFromGov(govItem) {
  if (!govItem) return null;
  const isLiquid = _looksLiquid(govItem.name);
  const base = isLiquid
    ? { type: 'per_100ml', ml: 100, label: '100ml' }
    : { type: 'per_100g', grams: 100, label: '100g' };
  const grp = govItem._grp || null;
  const servings = _buildServings(base, govItem.defaultWeight, grp);

  let defaultServingId = 'per_100g';
  if (base.type === 'per_100ml') defaultServingId = 'per_100ml';
  if (grp === '원재료성') defaultServingId = base.type === 'per_100ml' ? 'per_100ml' : 'per_100g';
  else if (servings.find(s => s.id === 'serving_est')) defaultServingId = 'serving_est';

  return {
    id: govItem.id,
    name: govItem.name,
    brand: govItem.manufacturer || null,
    source: grp === '원재료성' ? 'gov_raw' : (grp === '음식' ? 'gov_meal' : 'gov_proc'),
    _grp: grp,
    base,
    nutrition: {
      kcal: _NUM(govItem.energy),
      protein: _NUM(govItem.protein),
      carbs: _NUM(govItem.carbs),
      fat: _NUM(govItem.fat),
      sodium: _NUM(govItem.sodium),
      fiber: 0, sugar: 0,
    },
    servings,
    defaultServingId,
  };
}

// ── Top-level nutrition shape (raw-ingredients.js + feature-nutrition.js mapItem) ──
// { id, name, unit:'100g', defaultWeight, kcal, protein, fat, carbs, [fiber,sodium,] _source?, _grp? }
// raw 검색 결과와 공공API mapItem 결과 둘 다 이 shape으로 귀결됨.
// 레거시 로컬 DB(`nutrition` 객체) shape과 달라서 normalizeFromLocalDB는 올바로 다루지 못함.
export function normalizeFromTopLevel(item) {
  if (!item) return null;
  const looksRaw = item._grp === '원재료성'
    || /원재료/.test(String(item._source || ''))
    || String(item.id || '').startsWith('raw_');
  const unitStr = String(item.unit || '').toLowerCase();
  const isLiquid = /ml/.test(unitStr) || _looksLiquid(item.name);
  const base = isLiquid
    ? { type: 'per_100ml', ml: 100, label: '100ml' }
    : { type: 'per_100g', grams: 100, label: '100g' };
  const grp = item._grp || (looksRaw ? '원재료성' : null);
  const servings = _buildServings(base, item.defaultWeight, grp);

  let defaultServingId;
  if (base.type === 'per_100ml') defaultServingId = 'per_100ml';
  else if (looksRaw) defaultServingId = 'per_100g';
  else if (servings.find(s => s.id === 'serving_est')) defaultServingId = 'serving_est';
  else defaultServingId = 'per_100g';

  return {
    id: item.id,
    name: item.name,
    brand: item.manufacturer || item.brand || null,
    source: item._source || item.source || 'external',
    _grp: grp,
    base,
    nutrition: {
      kcal: _NUM(item.kcal),
      protein: _NUM(item.protein),
      carbs: _NUM(item.carbs),
      fat: _NUM(item.fat),
      fiber: _NUM(item.fiber),
      sugar: _NUM(item.sugar),
      sodium: _NUM(item.sodium),
    },
    servings,
    defaultServingId,
  };
}

// ── 로컬 원재료 DB (data/raw-ingredients.js) ────────────────────
// per_100g 기준. 자연식품은 1인분 개념 약해서 per_100g를 기본으로.
export function normalizeFromRaw(rawItem) {
  if (!rawItem) return null;
  const base = { type: 'per_100g', grams: 100, label: '100g' };
  const servings = [{ id: 'per_100g', label: '100g', grams: 100 }];
  return {
    id: rawItem.id || `raw_${encodeURIComponent(rawItem.name || '')}`,
    name: rawItem.name,
    brand: null,
    source: 'raw',
    _grp: '원재료성',
    base,
    nutrition: {
      kcal: _NUM(rawItem.kcal),
      protein: _NUM(rawItem.protein),
      carbs: _NUM(rawItem.carbs),
      fat: _NUM(rawItem.fat),
      sodium: _NUM(rawItem.sodium),
      fiber: 0, sugar: 0,
    },
    servings,
    defaultServingId: 'per_100g',
  };
}

// ── 로컬 저장 nutrition_db 아이템 ────────────────────────────────
// 레거시 필드(unit/servingSize/nutrition)를 canonical로 변환.
// base.type 결정:
//   1. item.base.type 이미 있으면 그대로
//   2. count 단위(인분/공기/개/봉지/컵 등)
//        - servingSize가 의미있는 g (>5이고 servingUnit=g) → per_serving with known grams
//        - 아니면 (ss≤5, servingUnit 불명 등) → per_serving + isUnknownWeight
//          저장된 nutrition은 이미 "1회 분량 기준" 값으로 간주. 100g 환산 금지.
//   3. servingUnit === 'ml' → per_100ml
//   4. 그 외 → per_100g (ss가 명확한 g면 100g 기준으로 rescale)
export function normalizeFromLocalDB(dbItem) {
  if (!dbItem) return null;

  // 이미 canonical이면 그대로
  if (dbItem.base && dbItem.base.type && Array.isArray(dbItem.servings)) {
    return dbItem;
  }

  const ss = _NUM(dbItem.servingSize) || 100;
  const unitStr = String(dbItem.unit || '').toLowerCase();
  const isMl = dbItem.servingUnit === 'ml' || /ml/.test(unitStr);
  // count 단위(무게 아닌 수량 기준) — 인분/공기/개/봉지 등
  const countUnitMatch = unitStr.match(/(인분|공기|잔|컵|병|봉지|봉|쪽|조각|팩|포|줌|스틱|덩이|판|알|조각|개|회)/);
  const servingUnitIsG = dbItem.servingUnit === 'g' || dbItem.servingUnit === '그램';

  let base;
  let looksCountOnly = false; // nutrition 재환산 금지 플래그
  if (countUnitMatch && !isMl) {
    // count 단위 + 의미있는 g 정보(ss>5 and servingUnit=g): 1회 분량 weight 알려짐
    const hasExplicitGrams = ss > 5 && servingUnitIsG;
    if (hasExplicitGrams) {
      base = { type: 'per_serving', grams: ss, label: dbItem.unit || `1회 ${ss}g` };
    } else {
      // 무게 미상 — "1인분" 값 그대로 사용, 100g 환산 UI 제공 안 함
      base = {
        type: 'per_serving',
        grams: 1, // 내부 수학용 단위 (multiplier 처리 위해)
        label: dbItem.unit || '1인분',
        isUnknownWeight: true,
      };
      looksCountOnly = true;
    }
  } else if (isMl) {
    base = { type: 'per_100ml', ml: 100, label: '100ml' };
  } else {
    // 무게 단위 없거나 "100g", "300g" 등 단순 무게 표기
    base = { type: 'per_100g', grams: 100, label: '100g' };
  }

  // 저장된 nutrition 값이 "servingSize 기준"이었던 레거시 케이스만 100g로 축소.
  // count unit + unknownWeight 일 땐 rescale 금지 (값이 이미 1회 분량 값).
  const n = dbItem.nutrition || {};
  let normalized = { ...n };
  if (base.type === 'per_100g' && ss !== 100 && ss > 0 && !looksCountOnly) {
    const r = 100 / ss;
    normalized = {
      kcal:   _NUM(n.kcal) * r,
      protein:_NUM(n.protein) * r,
      carbs:  _NUM(n.carbs) * r,
      fat:    _NUM(n.fat) * r,
      fiber:  _NUM(n.fiber) * r,
      sugar:  _NUM(n.sugar) * r,
      sodium: _NUM(n.sodium) * r,
    };
  }

  let servings;
  let defaultServingId;
  if (looksCountOnly) {
    // 무게 미상 — 100g 옵션/추정 옵션 없이 해당 count 단위 단독
    servings = [{ id: 'per_serving', label: base.label, grams: 1 }];
    defaultServingId = 'per_serving';
  } else {
    servings = _buildServings(base, ss, dbItem._grp);
    defaultServingId = base.type === 'per_serving' ? 'per_serving'
      : (servings.find(s => s.id === 'serving_est') ? 'serving_est' : servings[0].id);
  }

  return {
    id: dbItem.id,
    name: dbItem.name,
    brand: dbItem.brand || null,
    source: 'local',
    _grp: dbItem._grp || null,
    base,
    nutrition: {
      kcal: _NUM(normalized.kcal),
      protein: _NUM(normalized.protein),
      carbs: _NUM(normalized.carbs),
      fat: _NUM(normalized.fat),
      fiber: _NUM(normalized.fiber),
      sugar: _NUM(normalized.sugar),
      sodium: _NUM(normalized.sodium),
    },
    servings,
    defaultServingId,
    // 레거시 필드 보존 (DB 저장 시 그대로 유지하기 위해)
    _legacy: {
      unit: dbItem.unit,
      servingSize: dbItem.servingSize,
      servingUnit: dbItem.servingUnit,
      aliases: dbItem.aliases,
      notes: dbItem.notes,
      source: dbItem.source,
      language: dbItem.language,
      confidence: dbItem.confidence,
      rawText: dbItem.rawText,
      createdAt: dbItem.createdAt,
    },
  };
}

// ── 요리 레시피 → canonical ──────────────────────────────────────
// perServing: { grams, kcal, protein, carbs, fat, fiber?, sugar?, sodium? }
// 레시피는 "1인분(접시) 기준" 값이 자연스러움 → per_serving base.
export function normalizeFromRecipe(recipe, perServing) {
  if (!recipe || !perServing) return null;
  const grams = _NUM(perServing.grams) || 0;
  const label = grams > 0 ? `1인분 ${grams}g` : '1인분';
  const base = { type: 'per_serving', grams: grams || 1, label };
  const servings = [{ id: 'per_serving', label, grams: grams || 1 }];
  if (grams > 0 && grams !== 100) {
    servings.push({ id: 'per_100g', label: '100g', grams: 100 });
  }
  return {
    id: recipe.id || `recipe_${encodeURIComponent(recipe.name || '')}`,
    name: recipe.name,
    brand: null,
    source: 'recipe',
    _grp: '음식',
    base,
    nutrition: {
      kcal:    _NUM(perServing.kcal),
      protein: _NUM(perServing.protein),
      carbs:   _NUM(perServing.carbs),
      fat:     _NUM(perServing.fat),
      fiber:   _NUM(perServing.fiber),
      sugar:   _NUM(perServing.sugar),
      sodium:  _NUM(perServing.sodium),
    },
    servings,
    defaultServingId: 'per_serving',
  };
}

// ── OCR/텍스트 파서 결과 → canonical ──────────────────────────────
// parseInput: { id?, name, brand?, servingSize, servingUnit, unit?, nutrition, _source?, _grp? }
//   - servingUnit === 'ml' → per_100ml (ss가 100이 아니면 비율로 100ml 기준 환산)
//   - servingSize === 100 & servingUnit === 'g' → per_100g
//   - servingSize > 0 & servingUnit === 'g' → per_serving with known grams
//   - 그 외(ss ≤ 0 등) → per_100g fallback
export function normalizeFromParse(p) {
  if (!p) return null;
  const ss = _NUM(p.servingSize);
  const unitStr = String(p.unit || '').toLowerCase();
  const isMl = p.servingUnit === 'ml' || /ml/.test(unitStr);
  const n = p.nutrition || {};

  let base;
  let normalized = { ...n };

  if (isMl) {
    base = { type: 'per_100ml', ml: 100, label: '100ml' };
    if (ss > 0 && ss !== 100) {
      const r = 100 / ss;
      normalized = {
        kcal:    _NUM(n.kcal) * r,
        protein: _NUM(n.protein) * r,
        carbs:   _NUM(n.carbs) * r,
        fat:     _NUM(n.fat) * r,
        fiber:   _NUM(n.fiber) * r,
        sugar:   _NUM(n.sugar) * r,
        sodium:  _NUM(n.sodium) * r,
      };
    }
  } else if (ss === 100) {
    base = { type: 'per_100g', grams: 100, label: '100g' };
  } else if (ss > 0) {
    const label = p.unit || `1회 ${ss}g`;
    base = { type: 'per_serving', grams: ss, label };
  } else {
    base = { type: 'per_100g', grams: 100, label: '100g' };
  }

  const servings = _buildServings(base, ss, p._grp);
  let defaultServingId;
  if (base.type === 'per_serving') defaultServingId = 'per_serving';
  else if (base.type === 'per_100ml') defaultServingId = 'per_100ml';
  else defaultServingId = servings.find(s => s.id === 'serving_est') ? 'serving_est' : 'per_100g';

  return {
    id: p.id || `parse_${encodeURIComponent(p.name || '')}_${Date.now()}`,
    name: p.name,
    brand: p.brand || null,
    source: p._source || 'ocr',
    _grp: p._grp || null,
    base,
    nutrition: {
      kcal:    _NUM(normalized.kcal),
      protein: _NUM(normalized.protein),
      carbs:   _NUM(normalized.carbs),
      fat:     _NUM(normalized.fat),
      fiber:   _NUM(normalized.fiber),
      sugar:   _NUM(normalized.sugar),
      sodium:  _NUM(normalized.sodium),
    },
    servings,
    defaultServingId,
  };
}

// ── canonical → 저장 shape (레거시 필드 + canonical 병존) ─────────
// 저장 시 기존 UI(unit/servingSize/servingUnit/nutrition)와
// 신규 UI(base/servings/defaultServingId) 모두가 읽을 수 있도록 합쳐 저장.
// extras: aliases/notes/source/language/confidence/photoUrl/rawText/per100/totalAmount
export function serializeForStorage(canonical, extras) {
  if (!canonical) return null;
  const base = canonical.base || { type: 'per_100g', grams: 100, label: '100g' };

  // 레거시 호환 필드 계산
  let servingSize;
  let servingUnit;
  let unit;
  if (base.type === 'per_100ml') {
    servingSize = 100;
    servingUnit = 'ml';
    unit = base.label || '100ml';
  } else if (base.type === 'per_serving') {
    servingSize = _NUM(base.grams) || 1;
    servingUnit = 'g';
    unit = base.label || `1회 ${servingSize}g`;
  } else {
    // per_100g
    servingSize = 100;
    servingUnit = 'g';
    unit = base.label || '100g';
  }

  const ex = extras || {};
  return {
    id: canonical.id,
    name: canonical.name,
    brand: canonical.brand || null,
    _grp: canonical._grp || null,
    // 레거시 호환
    unit,
    servingSize,
    servingUnit,
    nutrition: { ...(canonical.nutrition || {}) },
    // 신규 canonical
    base: { ...base },
    servings: Array.isArray(canonical.servings) ? canonical.servings.map(s => ({ ...s })) : [],
    defaultServingId: canonical.defaultServingId || null,
    // 병합 extras
    ...ex,
  };
}
