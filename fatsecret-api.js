// ================================================================
// fatsecret-api.js — Claude + CSV RAG Integration
// ================================================================

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
      results.push({
        id: stableId,
        name: food['제품명'],
        manufacturer: food['제조사'],
        energy: parseFloat(food['에너지(kcal)']) || 0,
        protein: parseFloat(food['단백질(g)']) || 0,
        fat: parseFloat(food['지방(g)']) || 0,
        carbs: parseFloat(food['탄수화물(g)']) || 0,
        sodium: parseFloat(food['나트륨(mg)']) || 0,
        calcium: 0,  // CSV에 칼슘 데이터 없음
        iron: 0,     // CSV에 철분 데이터 없음
        score: food.score,
        rawData: food,
      });
    }
  }

  return results.slice(0, 10); // 상위 10개만 반환
}

