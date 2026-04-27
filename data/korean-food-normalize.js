// ================================================================
// data/korean-food-normalize.js
// 한국 음식 이름 정규화 + kcal/100g prior
// Gemini가 동일 음식을 다른 이름으로 반환하는 문제 보정용
// ================================================================

// canonical → [aliases]
export const FOOD_ALIASES = {
  // ── 밥/곡물 ──
  '잡곡밥':   ['잡곡', '잡곡쌀밥', '오곡밥', '흑미밥', '현미밥'],
  '쌀밥':     ['흰밥', '백미밥', '공기밥', '밥', '쌀'],
  '김밥':     ['김밥한줄', '참치김밥', '소고기김밥', '김마리'],
  '볶음밥':   ['김치볶음밥', '새우볶음밥', '야채볶음밥'],
  '비빔밥':   ['전주비빔밥', '돌솥비빔밥'],
  '주먹밥':   ['오니기리', '삼각김밥'],

  // ── 면 ──
  '라면':     ['신라면', '진라면', '컵라면', '너구리'],
  '냉면':     ['물냉면', '비빔냉면', '함흥냉면', '평양냉면'],
  '칼국수':   ['바지락칼국수', '들깨칼국수'],
  '잔치국수': ['국수', '소면', '비빔국수'],
  '짜장면':   ['자장면', '간짜장', '짬짜면'],
  '짬뽕':     ['삼선짬뽕', '차돌짬뽕'],
  '우동':     ['가케우동', '유부우동', '야끼우동'],
  '파스타':   ['스파게티', '까르보나라', '로제파스타', '볼로네제'],

  // ── 찌개/국 ──
  '김치찌개': ['김찌', '김치찌게', '돼지김치찌개', '참치김치찌개'],
  '된장찌개': ['된찌', '된장국', '시래기된장', '시래기국'],
  '순두부찌개': ['순두부', '얼큰순두부'],
  '부대찌개': ['부대', '스팸부대찌개'],
  '미역국':   ['소고기미역국', '들깨미역국'],
  '콩나물국': ['콩나물해장국', '북엇국콩나물'],
  '북엇국':   ['북어국', '황태해장국'],
  '설렁탕':   ['곰탕', '도가니탕'],
  '갈비탕':   ['꼬리곰탕'],
  '삼계탕':   ['영계백숙'],
  '추어탕':   ['남원추어탕'],

  // ── 고기/메인 요리 ──
  '제육볶음': ['제육', '돼지제육', '매운돼지볶음', '돼지볶음', '고추장돼지볶음'],
  '불고기':   ['소불고기', '뚝배기불고기', '돼지불고기'],
  '갈비찜':   ['소갈비찜', '찜갈비'],
  '닭볶음탕': ['닭도리탕', '닭볶탕'],
  '찜닭':     ['안동찜닭', '간장찜닭'],
  '닭갈비':   ['춘천닭갈비', '철판닭갈비'],
  '닭가슴살': ['닭가슴살구이', '닭가슴살스테이크', '훈제닭가슴살', '훈제닭', '삶은닭가슴살', 'chicken breast'],
  '삼겹살':   ['오겹살', '대패삼겹살'],
  '돈까스':   ['돈가스', '치즈돈까스', '왕돈까스'],
  '탕수육':   ['탕수'],
  '깐풍기':   ['깐풍육'],

  // ── 구이/튀김 ──
  '치킨':     ['후라이드치킨', '양념치킨', '반반치킨', '간장치킨', '프라이드'],
  '닭강정':   ['시장닭강정'],
  '새우튀김': ['에비후라이', '새우프라이'],

  // ── 반찬 ──
  '김치':     ['배추김치', '총각김치', '깍두기', '포기김치'],
  '나물':     ['시금치나물', '콩나물무침', '숙주나물', '취나물', '고사리나물'],
  '계란말이': ['에그롤'],
  '계란후라이': ['달걀후라이', '에그프라이'],
  '두부부침': ['두부구이', '두부조림'],
  '멸치볶음': ['잔멸치볶음'],

  // ── 양식/간편식 ──
  '피자':     ['포테이토피자', '페페로니피자', '하와이안피자'],
  '햄버거':   ['치즈버거', '빅맥', '와퍼'],
  '샐러드':   ['시저샐러드', '닭가슴살샐러드'],
  '스테이크': ['등심스테이크', '안심스테이크', '립아이', '채끝'],
  '리조또':   ['버섯리조또', '해산물리조또'],
  '오므라이스': ['오므레쯔'],
  '카레':     ['카레라이스', '일본카레', '인도카레'],

  // ── 일식 ──
  '초밥':     ['스시', '연어초밥', '참치초밥', '오마카세'],
  '사시미':   ['회', '연어회', '참치회'],
  '덮밥':     ['연어덮밥', '회덮밥', '소고기덮밥', '돈부리'],

  // ── 디저트/빵 ──
  '빵':       ['식빵', '크루아상', '베이글', '바게트'],
  '케이크':   ['생크림케이크', '치즈케이크', '초코케이크'],
  '도넛':     ['도너츠', '글레이즈드도넛'],
  '아이스크림': ['아이스크림콘', '젤라또'],

  // ── 음료 ──
  // 커피 = 블랙 계열만 (아메리카노/에스프레소). ~2 kcal/100g.
  '커피':     ['아메리카노', '에스프레소', '블랙커피', '드립커피', '콜드브루'],
  // 우유 기반 커피는 별도 canonical. ~55~70 kcal/100g (시럽/바리에이션에 따라 편차).
  '라떼':     ['카페라떼', '카푸치노', '바닐라라떼', '카라멜마키아또', '카라멜라떼', '플랫화이트'],
  '우유':     ['바나나우유', '초코우유', '저지방우유'],
  '주스':     ['오렌지주스', '사과주스'],
};

// canonical → kcal per 100g (모델이 터무니없는 값 줄 때 sanity check용)
export const KCAL_PER_100G = {
  // 밥/곡물
  '잡곡밥':   160,
  '쌀밥':     165,
  '김밥':     180,
  '볶음밥':   175,
  '비빔밥':   130,
  '주먹밥':   170,
  // 면
  // 라면: 조리 후 국물+면 합산 기준 (plated) ~90~110 kcal/100g.
  // 건면(생 스프면) 기준 430은 plated grams에 곱하면 크게 왜곡.
  '라면':     100,
  '냉면':     125,
  '칼국수':   120,
  '잔치국수': 115,
  '짜장면':   150,
  '짬뽕':     90,
  '우동':     120,
  '파스타':   155,
  // 찌개/국
  '김치찌개': 50,
  '된장찌개': 45,
  '순두부찌개': 55,
  '부대찌개': 110,
  '미역국':   25,
  '콩나물국': 20,
  '북엇국':   30,
  '설렁탕':   70,
  '갈비탕':   90,
  '삼계탕':   140,
  '추어탕':   75,
  // 고기
  '제육볶음': 215,
  '불고기':   175,
  '갈비찜':   210,
  '닭볶음탕': 150,
  '찜닭':     180,
  '닭갈비':   180,
  '닭가슴살': 130,
  '삼겹살':   330,
  '돈까스':   260,
  '탕수육':   230,
  '깐풍기':   245,
  '치킨':     250,
  '닭강정':   280,
  '새우튀김': 265,
  // 반찬
  '김치':     30,
  '나물':     50,
  '계란말이': 165,
  '계란후라이': 200,
  '두부부침': 105,
  '멸치볶음': 225,
  // 양식
  '피자':     265,
  '햄버거':   245,
  '샐러드':   110,
  '스테이크': 270,
  '리조또':   140,
  '오므라이스': 155,
  '카레':     130,
  // 일식
  '초밥':     155, // 피스 기준 ~40kcal × 2.5
  '사시미':   120,
  '덮밥':     145,
  // 디저트
  '빵':       270,
  '케이크':   330,
  '도넛':     420,
  '아이스크림': 210,
  // 음료
  '커피':     2,   // 블랙 (아메리카노/에스프레소)
  '라떼':     60,  // 카페라떼/카푸치노 (우유 베이스, 시럽 無/소량)
  '우유':     60,
  '주스':     45,
};

// 역 alias 맵을 메모이제이션 (최초 한 번만 빌드)
let _reverseAliasMap = null;
function _buildReverseMap() {
  if (_reverseAliasMap) return _reverseAliasMap;
  const m = new Map();
  for (const [canonical, aliases] of Object.entries(FOOD_ALIASES)) {
    m.set(canonical, canonical);
    for (const a of aliases) m.set(a, canonical);
  }
  _reverseAliasMap = m;
  return m;
}

/**
 * 음식 이름 정규화.
 * 1) exact match 먼저 (역 alias)
 * 2) substring contains (가장 긴 canonical 우선)
 * 3) 매칭 없으면 원본 반환
 */
export function normalizeFood(rawName) {
  if (!rawName || typeof rawName !== 'string') return rawName;
  const name = rawName.trim();
  if (!name) return rawName;

  const map = _buildReverseMap();
  // exact
  if (map.has(name)) return map.get(name);

  // substring — 긴 canonical 먼저 (ex: "김치볶음밥" > "김치")
  const canonicals = Object.keys(FOOD_ALIASES).sort((a, b) => b.length - a.length);
  for (const canonical of canonicals) {
    if (name.includes(canonical)) return canonical;
    for (const alias of FOOD_ALIASES[canonical]) {
      if (alias.length >= 2 && name.includes(alias)) return canonical;
    }
  }
  return rawName;
}

/**
 * kcal/100g sanity check. 모델 추정이 prior와 심하게 벗어날 때 "완화 블렌드"로 보정.
 *
 * 정책 (보수적):
 *  - 0.3x ~ 3.0x: 그대로 신뢰 (정상 편차 허용. 예: 진한 카레 vs 묽은 카레)
 *  - 3.0x 초과 OR 0.3x 미만: blend (prior 70% + model 30%) — 완전 대체 아님
 *  - 10x 초과 OR 0.1x 미만: 거의 확실한 에러. blend (prior 90% + model 10%)
 *
 * 이전 버전은 0.5x~2.0x 밖이면 prior로 "완전 대체"해서 모델이 합리적인 편차 가진
 * 답을 내도 무조건 덮어쓰는 문제가 있었음 (예: 300g 라떼 180kcal → 6kcal로 깎임).
 *
 * @returns { kcal, corrected:boolean, correctionNote?:string }
 */
export function sanityCheckKcal(canonicalName, kcal, grams) {
  if (!grams || grams <= 0 || !kcal || kcal <= 0) return { kcal, corrected: false };
  const prior = KCAL_PER_100G[canonicalName];
  if (!prior) return { kcal, corrected: false };

  const priorKcal = (prior * grams) / 100;
  const ratio = kcal / priorKcal;

  if (canonicalName === '닭가슴살') {
    if (ratio >= 0.5 && ratio <= 1.8) {
      return { kcal, corrected: false };
    }
    const blended = Math.round(priorKcal * 0.85 + kcal * 0.15);
    return {
      kcal: blended,
      corrected: true,
      correctionNote: `lean-protein(ratio=${ratio.toFixed(2)}, prior=${Math.round(priorKcal)}) → ${blended}`,
    };
  }

  // 정상 범위: 그대로 신뢰
  if (ratio >= 0.3 && ratio <= 3.0) {
    return { kcal, corrected: false };
  }

  // 극단 범위: 90/10 블렌드 (prior 지배)
  if (ratio < 0.1 || ratio > 10.0) {
    const blended = Math.round(priorKcal * 0.9 + kcal * 0.1);
    return {
      kcal: blended,
      corrected: true,
      correctionNote: `extreme(ratio=${ratio.toFixed(2)}, prior=${Math.round(priorKcal)}) → ${blended}`,
    };
  }

  // 중간 외곽: 70/30 블렌드 (prior 우세지만 모델 값도 일부 반영)
  const blended = Math.round(priorKcal * 0.7 + kcal * 0.3);
  return {
    kcal: blended,
    corrected: true,
    correctionNote: `soft(ratio=${ratio.toFixed(2)}, prior=${Math.round(priorKcal)}) → ${blended}`,
  };
}
