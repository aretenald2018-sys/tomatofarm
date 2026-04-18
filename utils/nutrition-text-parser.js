// ================================================================
// utils/nutrition-text-parser.js
// 정규식 기반 영양정보 텍스트 파서 — AI 호출 전 1차 시도
// 단일 항목만 처리. 표/복수 항목 텍스트는 신뢰도 낮게 반환 → 호출자가 AI로 fallback.
// ================================================================

// 라벨 → 필드 매핑 (한/영/일 주요 동의어)
// fat 정규식은 "포화지방"이 "지방"으로 오인되지 않도록 음수 look-behind 사용
const _LABELS = {
  kcal:    /(?:열\s*량|칼로리|에너지|kcal|calories?|cal|カロリー|エネルギー)/i,
  protein: /(?:단\s*백\s*질|프로틴|protein|たんぱく質|タンパク質)/i,
  carbs:   /(?:탄\s*수\s*화\s*물|탄수화물|carbohydrates?|carbs?|total\s*carb|炭水化物)/i,
  // "지방" 또는 "Total Fat" 계열만. "포화지방" / "트랜스지방" 제외.
  fat:     /(?:total\s*fat|(?<!포\s*화\s*)(?<!트\s*랜\s*스\s*)지\s*방(?!\s*이외)|fat(?!\s*oil)|脂質)/i,
  fiber:   /(?:식\s*이\s*섬\s*유|섬유질|fiber|fibre|食物繊維)/i,
  sugar:   /(?:당\s*류|당\s*질|설\s*탕\s*당|sugars?|糖類|糖質)/i,
  // 나트륨 단위는 mg로 저장 (앱 전체 컨벤션 — _saveMultipleItems 참조)
  sodium:  /(?:나\s*트\s*륨|소금|sodium|salt|ナトリウム|塩分)/i,
  saturatedFat: /(?:포\s*화\s*지\s*방|saturated\s*fat|飽和脂肪酸)/i,
  cholesterol:  /(?:콜\s*레\s*스\s*테\s*롤|cholesterol|コレステロール)/i,
};

// 제품명 후보에서 제외할 메타 키워드 (서빙/함량/기준치 등)
const _META_LINE_PATTERNS = [
  /서\s*빙\s*사\s*이\s*즈/, /서\s*빙\s*당/, /서\s*브\s*당/,
  /1\s*회\s*제\s*공\s*량/, /총\s*내\s*용\s*량/, /총\s*중\s*량/,
  /[%％]\s*영\s*양\s*성?\s*분?\s*기\s*준\s*치/, /일\s*일\s*영\s*양\s*성?\s*분?\s*기\s*준\s*치/,
  /하\s*루\s*권\s*장/,
  /serving\s*size/i, /per\s*serving/i, /daily\s*value/i, /%\s*dv/i,
  /^\s*\(.*\)\s*$/,              // 괄호만 있는 줄
  /^[\d.,\s/()-]+$/,             // 숫자/기호만
];

// 값 + 단위 패턴: "110 kcal", "22.00g", "260mg", "1,200 kJ"
const _VALUE_UNIT = /([\d]{1,4}(?:[.,]\d{1,3})?)\s*(kcal|kJ|mg|g|mg\s*\/?|)/i;

function _toNum(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// 특정 라벨의 값 추출 — 같은 줄에서 첫 유효 값(% 제외)
// 라벨이 라인 일부에 끼어있고 그 뒤에 "15% 300mg" 처럼 %DV와 실제값이 섞여 있으면
// % 붙은 숫자는 건너뛰고 실제 g/mg/kcal 단위의 숫자를 선택한다.
function _extractField(text, labelRe) {
  // 라벨을 포함한 줄을 찾음
  const lineRe = new RegExp('^.*' + labelRe.source + '.*$', 'im');
  const lineMatch = text.match(lineRe);
  if (!lineMatch) return null;
  const line = lineMatch[0];

  // 라벨 이후 부분만 대상으로
  const afterLabelIdx = line.search(labelRe);
  const label = line.match(labelRe)[0];
  const rest = line.slice(afterLabelIdx + label.length);

  // 숫자+단위 후보를 전부 뽑고, % 또는 "기준치" 계열은 제외
  // 우선순위: kcal|kJ|mg|g 단위가 붙은 것 > 단위 없는 것
  const candidates = [];
  const re = /([\d]{1,4}(?:[.,]\d{1,3})?)\s*(kcal|kJ|mg|g|%|％)?/gi;
  let m;
  while ((m = re.exec(rest)) !== null) {
    const unit = (m[2] || '').toLowerCase();
    if (unit === '%' || unit === '％') continue; // %DV 무시
    candidates.push({ num: _toNum(m[1]), unit, idx: m.index, hasUnit: !!unit });
  }
  if (candidates.length === 0) return null;

  // 단위 있는 것을 우선, 없으면 첫번째
  const withUnit = candidates.find(c => c.hasUnit);
  const pick = withUnit || candidates[0];
  return { num: pick.num, unit: pick.unit };
}

// ── 1회 제공량 / 총 내용량 / 기준 단위 탐지 ──────────────────────
// 라벨에 "1회 제공량 30g" / "1회 분량 45ml" / "per serving 2oz(56g)" 같은 표기가 있으면 추출
function _extractServingInfo(text) {
  const info = { servingSize: null, servingUnit: null, totalAmount: null, per100Unit: null };

  // 1회 제공량 / 1회분당 / 1회분
  // 예: "1회 제공량 30g", "1회 분량 200ml", "1회 제공량: 45 g", "단위섭취량 30g"
  const servingMatch = text.match(
    /(?:1\s*회\s*(?:제\s*공\s*량|분\s*량|섭\s*취\s*량)|단\s*위\s*섭\s*취\s*량|per\s*serving)[^\n:()]{0,20}?([\d]{1,4}(?:[.,]\d{1,3})?)\s*(g|ml|mL|ML|그램|밀리리터)/i
  );
  if (servingMatch) {
    info.servingSize = _toNum(servingMatch[1]);
    const u = servingMatch[2].toLowerCase();
    info.servingUnit = (u === 'ml' || u === 'mL'.toLowerCase() || u === '밀리리터') ? 'ml' : 'g';
  }

  // 총 내용량
  // 예: "총 내용량 500g", "내용량 250ml", "Net Wt. 100g"
  const totalMatch = text.match(
    /(?:총\s*내\s*용\s*량|내\s*용\s*량|total\s*(?:amount|weight)|net\s*w(?:ei)?ght|net\s*wt\.?)[^\n:()]{0,10}?([\d]{1,4}(?:[.,]\d{1,3})?)\s*(g|ml|mL|ML)/i
  );
  if (totalMatch) {
    info.totalAmount = _toNum(totalMatch[1]);
    if (!info.servingUnit) {
      info.servingUnit = totalMatch[2].toLowerCase() === 'ml' ? 'ml' : 'g';
    }
  }

  // 100g당 / 100ml당 / per 100g / per 100ml — 명시적으로 100 기준 단위 존재 여부
  if (/(?:100\s*ml\s*당|per\s*100\s*ml)/i.test(text)) {
    info.per100Unit = 'ml';
    if (!info.servingUnit) info.servingUnit = 'ml';
  } else if (/(?:100\s*g\s*당|per\s*100\s*g)/i.test(text)) {
    info.per100Unit = 'g';
    if (!info.servingUnit) info.servingUnit = 'g';
  }

  return info;
}

// 이름 추출: 메타/헤더/영양라벨 줄을 제외한 첫 번째 짧은 자연어 줄
function _extractName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const headerRe = /(?:영\s*양\s*(?:정보|성분)|nutrition\s*facts?|栄養成分)/i;
  const isMeta = (line) => _META_LINE_PATTERNS.some(p => p.test(line));
  const isLabelLine = (line) => Object.values(_LABELS).some(re => re.test(line));

  for (const line of lines) {
    if (headerRe.test(line)) continue;
    if (isMeta(line)) continue;
    if (isLabelLine(line)) continue; // "단백질 21g" 같은 영양 라벨 줄 제외
    if (/^[\d.,\s/()-]+$/.test(line)) continue;
    if (line.length > 30) continue;
    if (line.length < 2) continue;
    return line;
  }
  return '';
}

// 언어 감지: 어느 라벨 셋이 매치됐는지로 결정 (한/영/일)
function _detectLanguage(text) {
  const ko = /[가-힣]/.test(text);
  const ja = /[ぁ-んァ-ヶ一-龯]/.test(text) && !ko;
  if (ja) return 'ja';
  if (ko) return 'ko';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'other';
}

// 표 형식 감지 — 행이 3개 이상 있고 각 행에 숫자가 여러 개 반복되면 표로 간주
function _looksLikeTable(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 10);
  if (lines.length < 5) return false;
  let multiNumLines = 0;
  for (const line of lines) {
    const nums = line.match(/[\d.]+/g);
    if (nums && nums.length >= 4) multiNumLines++;
  }
  return multiNumLines >= 3;
}

/**
 * 영양정보 텍스트를 정규식으로 파싱.
 * @param {string} rawText
 * @returns {{ok: boolean, confidence: number, data: object|null, reason?: string}}
 *   - ok=true: 주요 필드(kcal + protein/carbs/fat 중 1개 이상) 확보
 *   - ok=false: 호출자가 AI로 fallback해야 함
 */
export function parseNutritionRegex(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, confidence: 0, data: null, reason: 'empty' };
  }

  const text = rawText.trim();
  if (text.length < 10) {
    return { ok: false, confidence: 0, data: null, reason: 'too-short' };
  }

  if (_looksLikeTable(text)) {
    return { ok: false, confidence: 0, data: null, reason: 'table-detected' };
  }

  const nutrition = {
    kcal: 0, protein: 0, carbs: 0, fat: 0,
    fiber: 0, sugar: 0, sodium: 0,
  };

  // kcal 특수: "460 kJ / 110 kcal" 또는 "110 kcal" 형식 둘 다 대응
  const kcalLine = text.match(/(?:열량|칼로리|에너지|calories?|カロリー)[\s\S]{0,40}?(\d{1,4}(?:[.,]\d+)?)\s*kcal/i);
  if (kcalLine) nutrition.kcal = _toNum(kcalLine[1]);

  // 나머지 필드
  for (const field of ['protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium']) {
    const ext = _extractField(text, _LABELS[field]);
    if (ext) {
      let val = ext.num;
      // 나트륨은 mg 기본, 이미 다른 단위면 변환
      if (field === 'sodium') {
        if (ext.unit === 'g') val = val * 1000; // g → mg
        // mg 또는 단위 없으면 그대로
      } else {
        if (ext.unit === 'mg') val = val / 1000; // 매크로는 g 기준
      }
      nutrition[field] = val;
    }
  }

  // 주요 필드 확보 판정: kcal > 0 + (protein|carbs|fat) 중 하나 이상 > 0
  const hasMacro = (nutrition.protein > 0) || (nutrition.carbs > 0) || (nutrition.fat > 0);
  if (!(nutrition.kcal > 0 && hasMacro)) {
    return { ok: false, confidence: 0, data: null, reason: 'insufficient-fields' };
  }

  // 이름 없으면 Gemini로 넘김 — 메타 라인을 제품명으로 저장하면 DB 오염
  const name = _extractName(text);
  if (!name) {
    return { ok: false, confidence: 0, data: null, reason: 'name-not-found' };
  }

  const language = _detectLanguage(text);

  // 1회 제공량 / 총 내용량 / 기준 단위 추출 — 라벨 기반 동적 servingSize
  const serving = _extractServingInfo(text);

  // servingSize 결정 우선순위:
  //   1) 라벨에 "1회 제공량 N (g|ml)" 명시 → 그 값
  //   2) "100g당"/"100ml당" 명시 → 100 + unit
  //   3) 그 외 → 100g 보수적 기본값
  let servingSize = 100;
  let servingUnit = 'g';
  let unitLabel = '100g';

  if (serving.servingSize && serving.servingSize > 0 && serving.servingSize !== 100) {
    servingSize = serving.servingSize;
    servingUnit = serving.servingUnit || 'g';
    unitLabel = `1회 제공량 ${servingSize}${servingUnit}`;
  } else if (serving.per100Unit === 'ml') {
    servingUnit = 'ml';
    unitLabel = '100ml';
  } else if (serving.servingUnit === 'ml') {
    servingUnit = 'ml';
    unitLabel = '100ml';
  }

  // 매크로 일관성 검증 — kcal ≈ 4C + 4P + 9F ± 30%
  // 크게 어긋나면 %DV를 값으로 오인했을 가능성 → confidence 하향
  let confidence = 0.92;
  const derivedKcal = 4 * nutrition.carbs + 4 * nutrition.protein + 9 * nutrition.fat;
  if (derivedKcal > 0 && nutrition.kcal > 0) {
    const diffPct = Math.abs(nutrition.kcal - derivedKcal) / nutrition.kcal * 100;
    if (diffPct > 30) confidence = 0.55;
  }

  return {
    ok: true,
    confidence,
    data: {
      name,
      unit: unitLabel,
      servingSize,
      servingUnit,
      totalAmount: serving.totalAmount || null,
      nutrition,
      brand: null,
      language,
      confidence,
    },
  };
}
