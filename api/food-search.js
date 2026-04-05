// Vercel Serverless Function — 공공데이터포털 식품영양성분 API 프록시
// CORS 우회용: 브라우저 → /api/food-search → data.go.kr

const API_KEY = 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b';
const API_URL = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { q, pageNo = '1', numOfRows = '20' } = req.query;
  if (!q) {
    return res.status(400).json({ error: '검색어(q)를 입력해주세요.' });
  }

  try {
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      FOOD_NM_KR: q,
      pageNo,
      numOfRows,
      type: 'json',
    });

    const response = await fetch(`${API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`API 응답 오류: ${response.status}`);

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('[food-search proxy]', err);
    res.status(500).json({ error: err.message });
  }
}
