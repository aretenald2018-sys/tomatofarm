// ================================================================
// calc.nutrition.test.js — 영양 환산/정규화 순수함수 회귀 테스트
// 실행: `node --test tests/calc.nutrition.test.js`
// 관련 파일:
//   - calc.js          → convertNutrition, validateNutritionConsistency, pickDefaultServing
//   - data/nutrition-normalize.js → normalizeFromCsv/Gov/Raw/LocalDB/Recipe/Parse, serializeForStorage
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  convertNutrition,
  validateNutritionConsistency,
  pickDefaultServing,
} from '../calc.js';

import {
  normalizeFromCsv,
  normalizeFromGov,
  normalizeFromRaw,
  normalizeFromLocalDB,
  normalizeFromRecipe,
  normalizeFromParse,
  normalizeFromTopLevel,
  serializeForStorage,
} from '../data/nutrition-normalize.js';

import { parseNutritionRegex } from '../utils/nutrition-text-parser.js';

// ══════════════════════════════════════════════════════════════════
// convertNutrition
// ══════════════════════════════════════════════════════════════════

test('convertNutrition · per_100g → 80g 환산 (쌀밥 100g=165kcal → 80g=132kcal)', () => {
  const n = { kcal: 165, protein: 2.6, carbs: 36.8, fat: 0.3 };
  const base = { type: 'per_100g', grams: 100 };
  const out = convertNutrition(n, base, 80);
  assert.equal(out.kcal, 132);
  // 2.6 × 0.8 = 2.08 → 1자리 반올림 2.1
  assert.equal(out.protein, 2.1);
  // 36.8 × 0.8 = 29.44 → 29.4
  assert.equal(out.carbs, 29.4);
  assert.equal(out.fat, 0.2);
});

test('convertNutrition · per_serving (30g 과자 1봉=150kcal) × 2인분 = 60g 300kcal', () => {
  const n = { kcal: 150, protein: 3, carbs: 20, fat: 7, sodium: 200 };
  const base = { type: 'per_serving', grams: 30 };
  const out = convertNutrition(n, base, 60);
  assert.equal(out.kcal, 300);
  assert.equal(out.protein, 6);
  assert.equal(out.carbs, 40);
  assert.equal(out.fat, 14);
  assert.equal(out.sodium, 400);
});

test('convertNutrition · per_100ml 음료 250ml 환산', () => {
  const n = { kcal: 42, carbs: 10.6, sugar: 10.6 };
  const base = { type: 'per_100ml', ml: 100 };
  const out = convertNutrition(n, base, 250);
  assert.equal(out.kcal, 105);
  // 10.6 × 2.5 = 26.5
  assert.equal(out.carbs, 26.5);
  assert.equal(out.sugar, 26.5);
});

test('convertNutrition · 0g 섭취 → 전부 0', () => {
  const n = { kcal: 100, protein: 5, carbs: 10, fat: 3 };
  const out = convertNutrition(n, { type: 'per_100g', grams: 100 }, 0);
  assert.equal(out.kcal, 0);
  assert.equal(out.protein, 0);
  assert.equal(out.carbs, 0);
  assert.equal(out.fat, 0);
});

test('convertNutrition · null 입력 안전', () => {
  const out = convertNutrition(null, null, 100);
  assert.equal(out.kcal, 0);
  assert.equal(out.protein, 0);
});

test('convertNutrition · baseAmount=0 방어 (0 division 방지)', () => {
  // per_serving인데 grams가 0이면 fallback 100으로 처리
  const n = { kcal: 200, protein: 10, carbs: 20, fat: 5 };
  const base = { type: 'per_serving', grams: 0 };
  const out = convertNutrition(n, base, 100);
  assert.equal(out.kcal, 200);
});

test('convertNutrition · kcal/sodium은 정수, 매크로는 1자리', () => {
  const n = { kcal: 167.7, protein: 2.67, carbs: 36.87, fat: 0.31, sodium: 123.7 };
  const out = convertNutrition(n, { type: 'per_100g', grams: 100 }, 100);
  assert.equal(out.kcal, 168);         // 정수
  assert.equal(out.sodium, 124);       // 정수
  assert.equal(out.protein, 2.7);      // 소수 1
  assert.equal(out.carbs, 36.9);
  assert.equal(out.fat, 0.3);
});

// ══════════════════════════════════════════════════════════════════
// validateNutritionConsistency  (kcal ≈ 4C + 4P + 9F)
// ══════════════════════════════════════════════════════════════════

test('validateNutritionConsistency · 정상 범위 (쌀밥 165kcal ≈ 4×36.8+4×2.6+9×0.3 ≈ 160.4)', () => {
  const n = { kcal: 165, protein: 2.6, carbs: 36.8, fat: 0.3 };
  const r = validateNutritionConsistency(n);
  assert.equal(r.ok, true);
  assert.ok(r.diffPct < 20);
});

test('validateNutritionConsistency · kcal이 매크로와 심하게 다름 (라벨 %DV 오인 케이스)', () => {
  // 실제 과자: 150kcal / 3P / 20C / 7F → 파생 kcal ≈ 155
  // 그런데 %DV를 kcal로 오인해 30으로 저장된 경우 → 파생 155와 30은 ±20% 밖
  const n = { kcal: 30, protein: 3, carbs: 20, fat: 7 };
  const r = validateNutritionConsistency(n);
  assert.equal(r.ok, false);
  assert.ok(r.diffPct > 100);
  assert.equal(r.derivedKcal, Math.round(4 * 20 + 4 * 3 + 9 * 7));
});

test('validateNutritionConsistency · 0 kcal 입력은 ok:false', () => {
  const r = validateNutritionConsistency({ kcal: 0, protein: 1, carbs: 1, fat: 1 });
  assert.equal(r.ok, false);
});

test('validateNutritionConsistency · tolerance 조정 (50%)', () => {
  // 100kcal vs 파생 140 → 40% 차이. 기본 20% NG, 50% 허용 OK
  const n = { kcal: 100, protein: 5, carbs: 25, fat: 2 };
  assert.equal(validateNutritionConsistency(n, 20).ok, false);
  assert.equal(validateNutritionConsistency(n, 50).ok, true);
});

// ══════════════════════════════════════════════════════════════════
// pickDefaultServing
// ══════════════════════════════════════════════════════════════════

test('pickDefaultServing · 원재료성 → per_100g', () => {
  const s = [
    { id: 'per_serving', label: '1인분 200g', grams: 200 },
    { id: 'per_100g', label: '100g', grams: 100 },
  ];
  const picked = pickDefaultServing(s, '원재료성');
  assert.equal(picked.id, 'per_100g');
});

test('pickDefaultServing · 가공식품 → per_serving', () => {
  const s = [
    { id: 'per_100g', label: '100g', grams: 100 },
    { id: 'per_serving', label: '1회 30g', grams: 30 },
  ];
  const picked = pickDefaultServing(s, '가공식품');
  assert.equal(picked.id, 'per_serving');
});

test('pickDefaultServing · 가공식품인데 per_serving 없음 → per_100g fallback', () => {
  const s = [{ id: 'per_100g', label: '100g', grams: 100 }];
  const picked = pickDefaultServing(s, '가공식품');
  assert.equal(picked.id, 'per_100g');
});

test('pickDefaultServing · 빈 배열 → null', () => {
  assert.equal(pickDefaultServing([], '가공식품'), null);
  assert.equal(pickDefaultServing(null, '가공식품'), null);
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromCsv  — CSV(fatsecret) → canonical
// ══════════════════════════════════════════════════════════════════

test('normalizeFromCsv · 가공식품 CSV → per_100g base + 1인분 추정 포함', () => {
  const csv = {
    id: 'csv_123',
    name: '콜라',
    manufacturer: '코카콜라',
    energy: 42, protein: 0, carbs: 10.6, fat: 0, sodium: 10,
    defaultWeight: 250,
  };
  const c = normalizeFromCsv(csv);
  assert.equal(c.source, 'csv');
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c.base.grams, 100);
  assert.equal(c.nutrition.kcal, 42);
  // servings: per_100g + serving_est(250g)
  const ids = c.servings.map(s => s.id);
  assert.ok(ids.includes('per_100g'));
  assert.ok(ids.includes('serving_est'));
  const est = c.servings.find(s => s.id === 'serving_est');
  assert.equal(est.grams, 250);
  // default: 1인분 추정이 있으면 serving_est
  assert.equal(c.defaultServingId, 'serving_est');
});

test('normalizeFromCsv · null 입력 방어', () => {
  assert.equal(normalizeFromCsv(null), null);
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromGov  — 공공 API → canonical
// ══════════════════════════════════════════════════════════════════

test('normalizeFromGov · 액상(우유) → per_100ml base', () => {
  const g = {
    id: 'gov_milk',
    name: '서울우유',
    energy: 65, protein: 3.2, carbs: 4.8, fat: 3.5,
    defaultWeight: 200,
    _grp: '가공식품',
  };
  const c = normalizeFromGov(g);
  assert.equal(c.base.type, 'per_100ml');
  assert.equal(c.base.ml, 100);
  assert.equal(c.source, 'gov_proc');
});

test('normalizeFromGov · 원재료성(닭가슴살) → per_100g + defaultServing per_100g', () => {
  const g = {
    id: 'gov_chicken',
    name: '닭가슴살',
    energy: 165, protein: 31, carbs: 0, fat: 3.6,
    _grp: '원재료성',
  };
  const c = normalizeFromGov(g);
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c.source, 'gov_raw');
  assert.equal(c.defaultServingId, 'per_100g');
});

test('normalizeFromGov · 음식(김치찌개) + defaultWeight → serving_est가 기본', () => {
  const g = {
    id: 'gov_soup',
    name: '김치찌개',
    energy: 50, protein: 4, carbs: 3, fat: 2.5,
    defaultWeight: 400,
    _grp: '음식',
  };
  const c = normalizeFromGov(g);
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c.source, 'gov_meal');
  assert.equal(c.defaultServingId, 'serving_est');
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromRaw  — 로컬 원재료 DB → canonical
// ══════════════════════════════════════════════════════════════════

test('normalizeFromRaw · 원재료는 per_100g 단일 serving', () => {
  const r = { id: 'raw_apple', name: '사과', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 };
  const c = normalizeFromRaw(r);
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c.source, 'raw');
  assert.equal(c._grp, '원재료성');
  assert.equal(c.servings.length, 1);
  assert.equal(c.servings[0].id, 'per_100g');
  assert.equal(c.defaultServingId, 'per_100g');
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromTopLevel — raw 검색/공공API mapItem 공통 shape
// (과거: 이 shape이 normalizeFromLocalDB 경로로 빠져 전 영양소가 0이 됨)
// ══════════════════════════════════════════════════════════════════

test('normalizeFromTopLevel · 로컬 raw 아이템은 nutrition 값이 보존됨', () => {
  const raw = {
    id: 'raw_%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4',
    name: '닭가슴살',
    unit: '100g',
    defaultWeight: 100,
    kcal: 165, protein: 31, fat: 3.6, carbs: 0,
    _source: '원재료(큐레이티드)',
  };
  const c = normalizeFromTopLevel(raw);
  assert.equal(c.nutrition.kcal, 165);
  assert.equal(c.nutrition.protein, 31);
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c._grp, '원재료성');
  assert.equal(c.defaultServingId, 'per_100g');
});

test('normalizeFromTopLevel · 공공API mapItem 결과(음식, defaultWeight 400) → serving_est 기본', () => {
  const gov = {
    id: 'gov_kimchi_jjigae',
    name: '김치찌개',
    unit: '100g',
    defaultWeight: 400,
    kcal: 50, protein: 4, fat: 2.5, carbs: 3,
    _source: '공공DB',
    _grp: '음식',
  };
  const c = normalizeFromTopLevel(gov);
  assert.equal(c.nutrition.kcal, 50);
  assert.equal(c.base.type, 'per_100g');
  assert.equal(c.defaultServingId, 'serving_est');
  assert.ok(c.servings.find(s => s.id === 'serving_est' && s.grams === 400));
});

// ══════════════════════════════════════════════════════════════════
// 액상 판정 휴리스틱 회귀 — bare `차` 가 "차돌박이" 같은 고형을 잡지 않아야 함
// ══════════════════════════════════════════════════════════════════

test('_LIQUID_KEYWORDS · 차돌박이는 액상이 아님 (bare 차 매칭 금지)', () => {
  const c = normalizeFromGov({
    id: 'gov_brisket',
    name: '차돌박이',
    energy: 294, protein: 19, fat: 24, carbs: 0,
    _grp: '음식',
  });
  assert.equal(c.base.type, 'per_100g');
});

test('_LIQUID_KEYWORDS · 녹차/보리차는 여전히 액상으로 잡혀야 함', () => {
  const greenTea = normalizeFromGov({
    id: 'gov_green_tea', name: '녹차',
    energy: 1, protein: 0, fat: 0, carbs: 0, _grp: '음식',
  });
  assert.equal(greenTea.base.type, 'per_100ml');
  const barley = normalizeFromGov({
    id: 'gov_barley_tea', name: '보리차',
    energy: 1, protein: 0, fat: 0, carbs: 0, _grp: '음식',
  });
  assert.equal(barley.base.type, 'per_100ml');
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromLocalDB  — 레거시 저장 아이템 → canonical
// ══════════════════════════════════════════════════════════════════

test('normalizeFromLocalDB · 레거시 (쌀밥 300g 기준 495kcal) → per_100g 165kcal로 재환산', () => {
  const legacy = {
    id: 'local_rice',
    name: '쌀밥',
    unit: '100g',
    servingSize: 300,
    servingUnit: 'g',
    nutrition: { kcal: 495, protein: 7.8, carbs: 110.4, fat: 0.9 },
  };
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.type, 'per_100g');
  // 레거시 300g=495kcal → 100g=165kcal 로 재환산
  assert.ok(Math.abs(c.nutrition.kcal - 165) < 0.5);
  assert.ok(Math.abs(c.nutrition.carbs - 36.8) < 0.5);
});

test('normalizeFromLocalDB · "1공기" 단위 → per_serving 유지', () => {
  const legacy = {
    id: 'local_bowl',
    name: '국밥',
    unit: '1공기',
    servingSize: 500,
    servingUnit: 'g',
    nutrition: { kcal: 600, protein: 30, carbs: 60, fat: 20 },
  };
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.type, 'per_serving');
  assert.equal(c.base.grams, 500);
  // per_serving는 재환산 없이 그대로
  assert.equal(c.nutrition.kcal, 600);
  assert.equal(c.defaultServingId, 'per_serving');
});

test('normalizeFromLocalDB · "1인분" + ss=1 → isUnknownWeight (100g 환산 금지)', () => {
  // 레거시 회귀: 과거 "닭가슴살 박스 (L)" 처럼 unit=1인분, ss=1 저장된 경우
  // 이전엔 per_100g + ×100 rescale → 49500kcal 괴담. 이제 1회 분량 값 그대로.
  const legacy = {
    id: 'local_chicken_box',
    name: '닭가슴살 박스 (L)',
    unit: '1인분',
    servingSize: 1,
    servingUnit: 'g',
    nutrition: { kcal: 495, protein: 54, carbs: 41, fat: 12 },
  };
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.type, 'per_serving');
  assert.equal(c.base.isUnknownWeight, true);
  assert.equal(c.base.label, '1인분');
  assert.equal(c.nutrition.kcal, 495);
  assert.equal(c.nutrition.protein, 54);
  // 무게 미상이므로 100g/한줌 등 다른 옵션 추가 금지
  assert.equal(c.servings.length, 1);
  assert.equal(c.servings[0].id, 'per_serving');
});

test('normalizeFromLocalDB · "1개" + ss=1 → isUnknownWeight, rescale 금지', () => {
  const legacy = {
    id: 'local_egg', name: '계란',
    unit: '1개', servingSize: 1, servingUnit: 'g',
    nutrition: { kcal: 80, protein: 6, carbs: 0.6, fat: 5.5 },
  };
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.isUnknownWeight, true);
  assert.equal(c.nutrition.kcal, 80);
});

test('normalizeFromLocalDB · servingUnit=ml → per_100ml', () => {
  const legacy = {
    id: 'local_juice',
    name: '오렌지주스',
    unit: '200ml',
    servingSize: 200,
    servingUnit: 'ml',
    nutrition: { kcal: 90, carbs: 22 },
  };
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.type, 'per_100ml');
});

test('normalizeFromLocalDB · 이미 canonical shape이면 그대로 반환', () => {
  const already = {
    id: 'x', name: 'y',
    base: { type: 'per_100g', grams: 100 },
    servings: [{ id: 'per_100g', label: '100g', grams: 100 }],
    nutrition: { kcal: 100 },
  };
  const c = normalizeFromLocalDB(already);
  assert.equal(c, already); // 동일 레퍼런스
});

test('normalizeFromLocalDB · 레거시 필드 _legacy에 보존', () => {
  const legacy = {
    id: 'x',
    name: '테스트',
    unit: '100g',
    servingSize: 100,
    nutrition: { kcal: 100 },
    aliases: ['ts'],
    createdAt: 12345,
  };
  const c = normalizeFromLocalDB(legacy);
  assert.deepEqual(c._legacy.aliases, ['ts']);
  assert.equal(c._legacy.createdAt, 12345);
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromRecipe
// ══════════════════════════════════════════════════════════════════

test('normalizeFromRecipe · 레시피 1인분(400g) → per_serving base', () => {
  const recipe = { id: 'r1', name: '카레' };
  const perServing = { grams: 400, kcal: 520, protein: 20, carbs: 60, fat: 18 };
  const c = normalizeFromRecipe(recipe, perServing);
  assert.equal(c.base.type, 'per_serving');
  assert.equal(c.base.grams, 400);
  assert.equal(c.source, 'recipe');
  assert.equal(c.defaultServingId, 'per_serving');
  assert.equal(c.nutrition.kcal, 520);
});

// ══════════════════════════════════════════════════════════════════
// normalizeFromParse  — OCR/텍스트 파서 결과 → canonical
// ══════════════════════════════════════════════════════════════════

test('normalizeFromParse · "1회 제공량 30g" 라벨 → per_serving', () => {
  const p = {
    name: '초코파이',
    servingSize: 30,
    servingUnit: 'g',
    nutrition: { kcal: 135, protein: 1.5, carbs: 20, fat: 5 },
  };
  const c = normalizeFromParse(p);
  assert.equal(c.base.type, 'per_serving');
  assert.equal(c.base.grams, 30);
  assert.equal(c.nutrition.kcal, 135);
  assert.equal(c.defaultServingId, 'per_serving');
});

test('normalizeFromParse · servingSize=100 → per_100g 기본', () => {
  const p = {
    name: '밥',
    servingSize: 100,
    servingUnit: 'g',
    nutrition: { kcal: 165 },
  };
  const c = normalizeFromParse(p);
  assert.equal(c.base.type, 'per_100g');
});

test('normalizeFromParse · ml 단위 → per_100ml', () => {
  const p = {
    name: '우유',
    servingSize: 200,
    servingUnit: 'ml',
    nutrition: { kcal: 130 },
  };
  const c = normalizeFromParse(p);
  assert.equal(c.base.type, 'per_100ml');
});

// ══════════════════════════════════════════════════════════════════
// serializeForStorage  (canonical → legacy-호환 저장 shape)
// ══════════════════════════════════════════════════════════════════

test('serializeForStorage · canonical → 레거시 필드 + base/servings 둘 다 포함', () => {
  const canonical = {
    id: 'test',
    name: '테스트',
    base: { type: 'per_serving', grams: 30, label: '1회 30g' },
    nutrition: { kcal: 150, protein: 3, carbs: 20, fat: 7 },
    servings: [
      { id: 'per_serving', label: '1회 30g', grams: 30 },
      { id: 'per_100g', label: '100g', grams: 100 },
    ],
    defaultServingId: 'per_serving',
    _grp: '가공식품',
  };
  const s = serializeForStorage(canonical);
  // 레거시 호환
  assert.equal(s.servingSize, 30);
  assert.equal(s.servingUnit, 'g');
  assert.equal(s.unit, '1회 30g');
  // 신규 canonical
  assert.equal(s.base.type, 'per_serving');
  assert.equal(s.servings.length, 2);
  assert.equal(s.defaultServingId, 'per_serving');
});

test('serializeForStorage · extras 병합', () => {
  const canonical = {
    name: 'x',
    base: { type: 'per_100g', grams: 100 },
    nutrition: { kcal: 100 },
    servings: [{ id: 'per_100g', label: '100g', grams: 100 }],
    defaultServingId: 'per_100g',
  };
  const s = serializeForStorage(canonical, { confidence: 0.9, source: 'ocr' });
  assert.equal(s.confidence, 0.9);
  assert.equal(s.source, 'ocr');
});

// ══════════════════════════════════════════════════════════════════
// Integration: 레거시 → 정규화 → 환산 → 섭취 저장값 일관성
// ══════════════════════════════════════════════════════════════════

test('integration · 레거시 쌀밥 300g=495kcal → 200g 섭취 = 330kcal', () => {
  const legacy = {
    id: 'local_rice',
    name: '쌀밥',
    unit: '100g',
    servingSize: 300,
    nutrition: { kcal: 495, protein: 7.8, carbs: 110.4, fat: 0.9 },
  };
  // 1. 레거시를 canonical per_100g로 정규화
  const c = normalizeFromLocalDB(legacy);
  assert.equal(c.base.type, 'per_100g');
  // 300g=495kcal → per_100g = 165kcal (495/3)
  assert.ok(Math.abs(c.nutrition.kcal - 165) < 0.5,
    `per_100g kcal expected ~165, got ${c.nutrition.kcal}`);

  // 2. 200g 섭취 환산
  const intake = convertNutrition(c.nutrition, c.base, 200);
  assert.equal(intake.kcal, 330);
  // protein: 7.8/3 = 2.6 per 100g → ×2 = 5.2
  assert.equal(intake.protein, 5.2);
  // carbs: 110.4/3 = 36.8 per 100g → ×2 = 73.6
  assert.equal(intake.carbs, 73.6);
  // fat: 0.9/3 = 0.3 per 100g → ×2 = 0.6
  assert.equal(intake.fat, 0.6);
});
