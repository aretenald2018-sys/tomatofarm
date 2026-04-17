// ================================================================
// fatsecret-api.js — Claude + CSV RAG Integration
// ================================================================
import { CONFIG } from './config.js';

// ========== CSV 데이터 로딩 ==========
let csvFoodDatabase = null;

/**
 * CSV 파일 로드 (앱 시작 시 한 번만)
 */
export async function loadCSVDatabase(csvPath = '/data/foods.csv') {
  if (csvFoodDatabase) return csvFoodDatabase;

  try {
    const response = await fetch(csvPath);
    const csvText = await response.text();

    // CSV 파싱
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    csvFoodDatabase = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const record = {};
      headers.forEach((header, idx) => {
        record[header] = values[idx] || '';
      });
      return record;
    });

    console.log(`✅ CSV 로드 완료: ${csvFoodDatabase.length}개 식품`);
    return csvFoodDatabase;
  } catch (error) {
    console.error('CSV 로드 실패:', error);
    return [];
  }
}

/**
 * 검색 정확도 스코링 (정확 일치 > 부분 일치 > 유사 매칭)
 */
function calculateSearchScore(foodName, searchTerm) {
  const name = foodName.toLowerCase();
  const term = searchTerm.toLowerCase();

  // 1. 정확 일치 (100점)
  if (name === term) return 100;

  // 2. 시작 일치 (90점)
  if (name.startsWith(term)) return 90;

  // 3. 전체 포함 (80점)
  if (name.includes(term)) return 80;

  // 4. 각 단어 포함 (70점)
  const searchWords = term.split(/\s+/);
  const allWordsIncluded = searchWords.every(word => name.includes(word));
  if (allWordsIncluded) return 70;

  // 5. 부분 단어 일치 (50점)
  const partialMatches = searchWords.filter(word => name.includes(word)).length;
  if (partialMatches > 0) return 50 + (partialMatches * 5);

  return 0;
}

/**
 * 음식 이름에서 기본 1인분 중량(g) 추정
 * CSV는 모두 100g 기준이므로, 실제 1인분 양을 매핑
 */
function _estimateServingSize(name) {
  const n = (name || '').toLowerCase();
  // 국/탕/찌개류: 400~600g
  if (/국$|탕$|찌개|국밥|곰탕|설렁탕|해장|매운탕|미역국|된장국|김치국/.test(n)) return 500;
  // 밥류: 200~300g
  if (/밥$|비빔밥|볶음밥|덮밥|김밥|리조또/.test(n)) return 300;
  // 면류: 400~500g
  if (/면$|라면|우동|짜장|짬뽕|국수|냉면|파스타|스파게티/.test(n)) return 450;
  // 죽: 300~400g
  if (/죽$/.test(n)) return 350;
  // 빵/과자: 30~80g
  if (/빵$|빵\(|쿠키|과자|크래커|비스켓|케이크|머핀|도넛/.test(n)) return 60;
  // 음료: 200~350ml
  if (/주스|음료|우유|두유|커피|라떼|차$|스무디|에이드/.test(n)) return 250;
  // 고기/구이류: 150~200g
  if (/구이|스테이크|불고기|갈비|삼겹|닭가슴|치킨/.test(n)) return 180;
  // 전/부침: 100~150g
  if (/전$|전\(|부침|튀김/.test(n)) return 120;
  // 찜류: 200~300g
  if (/찜$|찜\(|조림/.test(n)) return 250;
  // 샐러드: 150~200g
  if (/샐러드|샐러드/.test(n)) return 180;
  // 기본값
  return 100;
}

/**
 * CSV에서 정확도 높은 순으로 검색 (중복 제거, 정렬)
 */
export function searchCSVFood(searchTerm) {
  if (!csvFoodDatabase || csvFoodDatabase.length === 0) {
    console.warn('CSV 데이터가 로드되지 않았습니다');
    return [];
  }

  // 1. 스코어 계산
  const scoredResults = csvFoodDatabase
    .map(food => ({
      ...food,
      score: calculateSearchScore(food['제품명'] || '', searchTerm),
      normalizedName: (food['제품명'] || '').toLowerCase(),
    }))
    .filter(f => f.score > 0);

  // 2. 정확도 높은 순으로 정렬
  scoredResults.sort((a, b) => b.score - a.score);

  // 3. 같은 이름인 경우 제조사 기준으로 중복 제거 (각각 하나씩만)
  const seen = new Set();
  const results = [];

  for (const food of scoredResults) {
    const key = food['제품명'];
    if (!seen.has(key)) {
      seen.add(key);
      // 안정적인 ID: 제품명과 제조사 조합 (검색 결과 개수와 무관)
      const stableId = `csv_${encodeURIComponent(food['제품명'])}_${encodeURIComponent(food['제조사'])}`;
      const foodName = food['제품명'];
      results.push({
        id: stableId,
        name: foodName,
        manufacturer: food['제조사'],
        energy: parseFloat(food['에너지(kcal)']) || 0,
        protein: parseFloat(food['단백질(g)']) || 0,
        fat: parseFloat(food['지방(g)']) || 0,
        carbs: parseFloat(food['탄수화물(g)']) || 0,
        sodium: parseFloat(food['나트륨(mg)']) || 0,
        calcium: 0,
        iron: 0,
        defaultWeight: _estimateServingSize(foodName),
        score: food.score,
        rawData: food,
      });
    }
  }

  return results.slice(0, 10); // 상위 10개만 반환
}

// ========== 공공데이터포털 식품영양성분 API (자연식품 포함) ==========

// 검색 결과 캐시 (sessionStorage + 메모리)
const _govFoodCache = {};
const _GOV_CACHE_KEY = 'govFoodCache';
const _GOV_CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

function _loadGovCache() {
  try {
    const raw = sessionStorage.getItem(_GOV_CACHE_KEY);
    if (!raw) return;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < _GOV_CACHE_TTL) {
      Object.assign(_govFoodCache, data);
      console.log(`[공공API] 캐시 복원: ${Object.keys(data).length}개 검색어`);
    }
  } catch {}
}
_loadGovCache();

function _saveGovCache() {
  try {
    sessionStorage.setItem(_GOV_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: _govFoodCache }));
  } catch {}
}

// ── 표기 변형 정규화 ──────────────────────────────────────────────
// 한국어 식재료는 같은 재료인데 표기가 여러 개인 경우가 많다
// (ex: 샐러리/셀러리, 도너츠/도넛, 프라이드/후라이드).
// API는 표기 그대로만 검색하므로, 변형을 전부 병렬 질의한 뒤 합쳐야
// 원재료성 결과가 누락되지 않는다.
const _QUERY_VARIANTS = {
  '샐러리': ['셀러리'],
  '셀러리': ['샐러리'],
  '도넛':   ['도너츠'],
  '도너츠': ['도넛'],
  '후라이드': ['프라이드'],
  '프라이드': ['후라이드'],
  '자장면':  ['짜장면'],
  '짜장면':  ['자장면'],
  '돈까스':  ['돈가스'],
  '돈가스':  ['돈까스'],
};
function _expandQueryVariants(term) {
  const t = (term || '').trim();
  if (!t) return [];
  const variants = new Set([t]);
  for (const key of Object.keys(_QUERY_VARIANTS)) {
    if (t.includes(key)) {
      for (const v of _QUERY_VARIANTS[key]) {
        variants.add(t.split(key).join(v));
      }
    }
  }
  return Array.from(variants);
}

async function _fetchGovPage(term, pageNo, numOfRows) {
  const params = new URLSearchParams({
    serviceKey: CONFIG.FOOD_DB_KEY,
    FOOD_NM_KR: term,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    type: 'json',
  });
  const url = `${CONFIG.FOOD_DB_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.body || {};
}

/**
 * 공공데이터포털 API로 식품 검색 (자연식품 + 가공식품 모두 포함)
 * CSV에 없는 원재료(우둔살, 닭가슴살, 셀러리 등) 검색 시 사용.
 *
 * 주요 전략:
 *  1. 표기 변형(샐러리↔셀러리 등) 모두 병렬 질의해서 합친다.
 *  2. 한 쿼리당 100행을 받는다 (이전 20행이면 원재료성이 뒤로 밀려서 누락됨).
 *     예: "셀러리" totalCount=31 중 원재료성 2건은 30,31번째 위치 → 20행으로는 포함 X.
 *  3. 쿼리와 완전 일치하는 이름, 원재료성(raw)을 최상위로 올림.
 *  4. 같은 이름은 dedupe, 최종 상위 N개 반환.
 *
 * 결과는 메모리 + sessionStorage에 캐시 (같은 검색어 즉시 반환).
 */
export async function searchGovFoodAPI(searchTerm) {
  // 캐시 히트 → 즉시 반환
  if (_govFoodCache[searchTerm]) {
    console.log(`[공공API] 캐시 히트: "${searchTerm}" (${_govFoodCache[searchTerm].length}개)`);
    return _govFoodCache[searchTerm];
  }

  try {
    const variants = _expandQueryVariants(searchTerm);
    console.log('[공공API] 검색:', searchTerm, variants.length > 1 ? `(+변형 ${variants.slice(1).join(',')})` : '');

    // 변형 쿼리를 병렬 호출. 각 쿼리 결과가 100개 이상이면 page2도 한 번 더 가져와서
    // 원재료성(뒤쪽에 몰림)이 포함될 확률을 높인다.
    const pagePromises = [];
    for (const v of variants) {
      pagePromises.push(
        _fetchGovPage(v, 1, 100).then(async (body) => {
          const items = body.items || [];
          const total = parseInt(body.totalCount) || items.length;
          // 원재료성이 100번 이후에 있을 수 있어서 마지막 페이지도 한 번 더 시도
          if (total > 100 && total <= 500) {
            const lastPage = Math.ceil(total / 100);
            try {
              const body2 = await _fetchGovPage(v, lastPage, 100);
              return [...items, ...(body2.items || [])];
            } catch { return items; }
          }
          return items;
        }).catch(err => {
          console.warn(`[공공API] variant "${v}" 실패:`, err.message);
          return [];
        })
      );
    }
    const allItems = (await Promise.all(pagePromises)).flat();
    if (allItems.length === 0) return [];

    const qLower = (searchTerm || '').toLowerCase();

    // 중복 제거 + 매핑 + 스코어링
    const seen = new Set();
    const results = [];

    for (const item of allItems) {
      const name = item.FOOD_NM_KR || '';
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const grp = item.DB_GRP_NM || '';
      const isRaw  = grp === '원재료성';
      const isMeal = grp === '음식';
      const isProc = grp === '가공식품';
      const nLower = name.toLowerCase();

      // 스코어: 원재료 > 음식 > 가공식품, 같은 카테고리 안에서는 이름 일치도 우선
      let score = 0;
      if (isRaw)  score = 100;
      else if (isMeal) score = 70;
      else if (isProc) score = 50;
      else             score = 40;

      // 이름 매칭 보너스 (원재료성은 "셀러리_생것"처럼 언더스코어로 표기됨 → 시작 일치 판단)
      if (nLower === qLower) score += 15;
      else if (nLower.startsWith(qLower)) score += 10;
      else if (nLower.startsWith(qLower + '_')) score += 12;  // 셀러리_생것 패턴
      else if (nLower.includes('_' + qLower)) score += 5;

      results.push({
        id: `gov_${encodeURIComponent(name)}`,
        name,
        manufacturer: item.MAKER_NM || (isRaw ? '자연식품' : ''),
        energy:  parseFloat(item.AMT_NUM1)  || 0,   // kcal
        protein: parseFloat(item.AMT_NUM3)  || 0,   // 단백질(g)
        fat:     parseFloat(item.AMT_NUM4)  || 0,   // 지방(g)
        carbs:   parseFloat(item.AMT_NUM6)  || 0,   // 탄수화물(g)
        sodium:  parseFloat(item.AMT_NUM13) || 0,   // 나트륨(mg)
        calcium: 0,
        iron: 0,
        defaultWeight: isRaw ? 100 : _estimateServingSize(name),
        score,
        source: isRaw ? '자연식품(공공DB)' : (isMeal ? '음식(공공DB)' : '가공식품(공공DB)'),
        _grp: grp,
        rawData: item,
      });
    }

    // 스코어 내림차순
    results.sort((a, b) => b.score - a.score);
    const sliced = results.slice(0, 15);

    // 캐시 저장 (rawData 제외 — 용량 절약)
    _govFoodCache[searchTerm] = sliced.map(({ rawData, ...rest }) => rest);
    _saveGovCache();

    const rawCount = sliced.filter(r => r._grp === '원재료성').length;
    console.log(`[공공API] 결과: ${sliced.length}개 (원재료 ${rawCount}개, 캐시 저장됨)`);
    return sliced;
  } catch (err) {
    console.error('[공공API] 검색 실패:', err);
    return [];
  }
}

