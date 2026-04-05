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

/**
 * 공공데이터포털 API로 식품 검색 (자연식품 + 가공식품 모두 포함)
 * CSV에 없는 원재료(우둔살, 닭가슴살 등) 검색 시 사용
 */
export async function searchGovFoodAPI(searchTerm) {
  try {
    // data.go.kr 직접 호출 (CORS 허용됨)
    const params = new URLSearchParams({
      serviceKey: CONFIG.FOOD_DB_KEY,
      FOOD_NM_KR: searchTerm,
      pageNo: '1',
      numOfRows: '20',
      type: 'json',
    });
    const url = `${CONFIG.FOOD_DB_URL}?${params.toString()}`;
    console.log('[공공API] 검색:', searchTerm);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const items = data?.body?.items;
    if (!items || items.length === 0) return [];

    // 중복 제거 + 매핑
    const seen = new Set();
    const results = [];

    for (const item of items) {
      const name = item.FOOD_NM_KR || '';
      if (seen.has(name)) continue;
      seen.add(name);

      const isRaw = item.DB_GRP_NM === '원재료성';
      const foodName = name;
      results.push({
        id: `gov_${encodeURIComponent(name)}`,
        name: foodName,
        manufacturer: item.MAKER_NM || (isRaw ? '자연식품' : ''),
        energy:  parseFloat(item.AMT_NUM1)  || 0,   // kcal
        protein: parseFloat(item.AMT_NUM3)  || 0,   // 단백질(g)
        fat:     parseFloat(item.AMT_NUM4)  || 0,   // 지방(g)
        carbs:   parseFloat(item.AMT_NUM6)  || 0,   // 탄수화물(g)
        sodium:  parseFloat(item.AMT_NUM13) || 0,   // 나트륨(mg)
        calcium: 0,
        iron: 0,
        defaultWeight: _estimateServingSize(foodName),
        score: isRaw ? 95 : 85,  // 원재료 우선 표시
        source: isRaw ? '자연식품(공공DB)' : '가공식품(공공DB)',
        rawData: item,
      });
    }

    // 원재료(자연식품)를 상위에 배치
    results.sort((a, b) => b.score - a.score);
    console.log(`[공공API] 결과: ${results.length}개`);
    return results.slice(0, 10);
  } catch (err) {
    console.error('[공공API] 검색 실패:', err);
    return [];
  }
}

