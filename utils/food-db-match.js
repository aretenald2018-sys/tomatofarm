// ================================================================
// utils/food-db-match.js — 식약처 foods.csv 로컬 매칭 (순수 함수)
// ================================================================
// Gemini 음식 검색 캐스케이드의 1단계. LLM은 제품명 후보만 뽑고,
// 수치는 이 모듈이 로컬 식약처 DB(제품명,에너지,단백질,지방,탄수화물,나트륨,제조사;
// 100g 기준)에서 라벨 신고값 그대로 가져온다 — 수치 환각이 원천적으로 불가능한 경로.
//
// 정밀도 > 재현율: 여기서 놓친 후보는 그라운딩 검색으로 넘어가 여전히 근거
// 기반으로 처리되지만, 잘못 매칭된 행은 엉뚱한 제품의 수치가 라벨값 행세를
// 한다(예: "황금올리브 치킨"이 "황금올리브치킨 전용 튀김유" 900kcal에 걸리는 사고).
// 그래서 비정확 매칭에는 이름 길이 초과 가드를 둔다.
//
// DOM/네트워크 의존 없음: rows는 fatsecret-api.js loadCSVDatabase()가 돌려주는
// 원본 레코드 배열을 그대로 받는다. 25만 행을 후보마다 전수 스캔하므로
// 행당 연산은 소문자화+공백제거 1회로 유지한다(ko-KR locale 변환은 40배 느림).

const MATCH_THRESHOLD = 70;

export function normalizeFoodText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _compact(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function _termShape(text) {
  const compact = _compact(text);
  return {
    compact,
    tokens: normalizeFoodText(text).split(' ').filter(Boolean).map(t => t.replace(/\s+/g, '')),
  };
}

// 정확(100) > 시작(90) > 포함(80) > 전 토큰 포함(70). 70 미만은 "다른 제품".
// 비정확 매칭은 행 이름이 질의보다 과하게 길면(수식어가 아니라 다른 제품일
// 확률이 높음) 0으로 처리한다.
function _scoreCompact(nameCompact, term) {
  if (!nameCompact || !term.compact) return 0;
  if (nameCompact === term.compact) return 100;
  const extra = nameCompact.length - term.compact.length;
  const extraLimit = Math.max(4, Math.round(term.compact.length * 0.6));
  if (extra > extraLimit) return 0;
  if (nameCompact.startsWith(term.compact)) return 90;
  if (nameCompact.includes(term.compact)) return 80;
  if (term.tokens.length && term.tokens.every(token => nameCompact.includes(token))) return 70;
  return 0;
}

export function scoreFoodDbName(rowName, queryName) {
  return _scoreCompact(_compact(rowName), _termShape(queryName));
}

// candidate: { name, brand?, searchTerms?: [] } — LLM이 뽑은 제품명 후보.
// 반환: { row, score, matchedTerm } | null. 동점이면 제품명이 짧은 행
// (수식어가 덜 붙은, 요청에 더 가까운 기본형)을 고른다.
export function matchFoodInDb(rows, candidate) {
  if (!Array.isArray(rows) || !rows.length || !candidate) return null;
  const rawTerms = [candidate.name, ...(Array.isArray(candidate.searchTerms) ? candidate.searchTerms : [])];
  const terms = [];
  const seenTerms = new Set();
  for (const raw of rawTerms) {
    const shape = _termShape(raw);
    if (!shape.compact || seenTerms.has(shape.compact)) continue;
    seenTerms.add(shape.compact);
    terms.push({ ...shape, raw: String(raw).trim() });
  }
  if (!terms.length) return null;
  const brand = _compact(candidate.brand);

  let best = null;
  for (const row of rows) {
    const rowName = row && row['제품명'];
    if (!rowName) continue;
    const nameCompact = _compact(rowName);
    let score = 0;
    let matchedTerm = '';
    for (const term of terms) {
      const termScore = _scoreCompact(nameCompact, term);
      if (termScore > score) { score = termScore; matchedTerm = term.raw; }
    }
    if (score < MATCH_THRESHOLD) continue;
    if (brand && _compact(row['제조사']).includes(brand)) score += 5;
    if (!best
      || score > best.score
      || (score === best.score && String(rowName).length < String(best.row['제품명']).length)) {
      best = { row, score, matchedTerm };
    }
  }
  return best;
}

// DB 행 → 등록 그리드가 쓰는 아이템 shape. CSV 헤더는 지방이 탄수화물보다
// 앞이지만 여기서는 키 이름으로 읽으므로 열 순서와 무관하다. 값은 100g 기준.
export function dbRowToNutritionItem(row, candidate = {}) {
  const num = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const name = String(row['제품명'] || '').trim();
  const requested = String(candidate.name || '').trim();
  return {
    name,
    brand: String(row['제조사'] || '').trim() || null,
    unit: '100g',
    servingSize: 100,
    servingUnit: 'g',
    totalAmount: null,
    nutrition: {
      kcal: num(row['에너지(kcal)']),
      protein: num(row['단백질(g)']),
      carbs: num(row['탄수화물(g)']),
      fat: num(row['지방(g)']),
      fiber: 0,
      sugar: 0,
      sodium: num(row['나트륨(mg)']),
    },
    aliases: requested && _compact(requested) !== _compact(name) ? [requested] : [],
    basis: 'db',
    confidence: 1,
    language: 'ko',
  };
}
