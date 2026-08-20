// ================================================================
// food-db-match.test.js — 식약처 foods.csv 로컬 매칭 순수함수 회귀 테스트
// 실행: `node --test tests/food-db-match.test.js`
// 관련 파일:
//   - utils/food-db-match.js → scoreFoodDbName, matchFoodInDb, dbRowToNutritionItem
// 배경: Gemini 음식 검색은 LLM이 제품명 후보만 뽑고, 수치는 이 매처가
//   로컬 식약처 DB에서 그대로 가져온다. 아래 행들은 실측 검증한 실제 데이터.
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreFoodDbName, matchFoodInDb, dbRowToNutritionItem } from '../utils/food-db-match.js';

// 실제 foods.csv 검증 행 (100g 기준, 헤더: 제품명,에너지,단백질,지방,탄수화물,나트륨,제조사)
const ROWS = [
  { '제품명': '한끼통살 핫양념치킨맛', '에너지(kcal)': '125', '단백질(g)': '19.0', '지방(g)': '2.1', '탄수화물(g)': '8.0', '나트륨(mg)': '470.0', '제조사': '주식회사 와이앤비푸드' },
  { '제품명': '한끼통살 크리스피 핫양념치킨맛 스낵', '에너지(kcal)': '300', '단백질(g)': '30', '지방(g)': '10', '탄수화물(g)': '20', '나트륨(mg)': '600', '제조사': '주식회사 와이앤비푸드' },
  { '제품명': '한끼통살 갈릭맛', '에너지(kcal)': '120', '단백질(g)': '20.0', '지방(g)': '2.0', '탄수화물(g)': '6.0', '나트륨(mg)': '400.0', '제조사': '주식회사 와이앤비푸드' },
  { '제품명': '아이즈 프로틴 초코볼', '에너지(kcal)': '416', '단백질(g)': '37.25', '지방(g)': '22.65', '탄수화물(g)': '33.97', '나트륨(mg)': '191.0', '제조사': '(주)씨앤지' },
  { '제품명': '양념치킨', '에너지(kcal)': '275', '단백질(g)': '16', '지방(g)': '14', '탄수화물(g)': '21', '나트륨(mg)': '550', '제조사': '' },
  // 실측 사고 사례: "황금올리브 치킨" 질의가 이 튀김유(900kcal)에 걸리면 안 된다.
  { '제품명': 'BBQ 황금올리브치킨제품전용튀김유', '에너지(kcal)': '900', '단백질(g)': '0', '지방(g)': '100', '탄수화물(g)': '0', '나트륨(mg)': '0', '제조사': '제네시스' },
];

test('scoreFoodDbName: 정확 > 시작 > 포함 > 전 토큰, 그 외 0', () => {
  assert.equal(scoreFoodDbName('한끼통살 갈릭맛', '한끼통살 갈릭맛'), 100);
  assert.equal(scoreFoodDbName('한끼통살 갈릭맛', '한끼통살갈릭맛'), 100); // 띄어쓰기 무시
  assert.equal(scoreFoodDbName('한끼통살 크리스피 핫양념치킨맛 스낵', '한끼통살 크리스피 핫양념치킨맛'), 90);
  assert.equal(scoreFoodDbName('한끼통살 핫양념치킨맛', '핫양념치킨맛'), 80);
  assert.equal(scoreFoodDbName('한끼통살 핫양념치킨맛', '한끼통살 양념치킨맛'), 70); // 토큰 포함
  assert.equal(scoreFoodDbName('한끼통살 갈릭맛', '황금올리브 치킨'), 0);
  assert.equal(scoreFoodDbName('', '한끼통살'), 0);
});

test('scoreFoodDbName: 행 이름이 질의보다 과하게 길면 부분 일치라도 다른 제품으로 본다', () => {
  // "황금올리브치킨"을 포함하긴 하지만 전용 튀김유 — 길이 초과 가드로 걸러야 한다.
  assert.equal(scoreFoodDbName('BBQ 황금올리브치킨제품전용튀김유', '황금올리브 치킨'), 0);
  // 반대로 수식어 한두 글자 차이(핫)는 가드 안에서 여전히 잡힌다.
  assert.equal(scoreFoodDbName('한끼통살 핫양념치킨맛', '한끼통살 양념치킨맛'), 70);
});

test('matchFoodInDb: 맛 표기가 조금 달라도(양념→핫양념) 같은 제품 행을 잡는다', () => {
  const hit = matchFoodInDb(ROWS, { name: '한끼통살 양념치킨맛', brand: null, searchTerms: [] });
  assert.ok(hit, '토큰 포함 매칭으로 잡혀야 한다');
  assert.equal(hit.row['제품명'], '한끼통살 핫양념치킨맛', '동점이면 이름이 짧은(기본형) 행 우선');
});

test('matchFoodInDb: searchTerms 변형으로도 매칭하고, 무관한 제품은 null', () => {
  const viaTerm = matchFoodInDb(ROWS, { name: '이데아 초코볼', searchTerms: ['아이즈 프로틴 초코볼'] });
  assert.equal(viaTerm?.row['제품명'], '아이즈 프로틴 초코볼');
  // 부분 토큰만 겹치는 후보(양념치킨 ⊂ 양념치킨맛)가 엉뚱한 행에 걸리지 않는지:
  // "황금올리브 치킨"은 조리 치킨이라 DB에 없다 — 어떤 행도 임계 미달이어야 한다.
  assert.equal(matchFoodInDb(ROWS, { name: '황금올리브 치킨', searchTerms: ['황금올리브'] }), null);
  assert.equal(matchFoodInDb([], { name: '한끼통살' }), null);
  assert.equal(matchFoodInDb(ROWS, null), null);
});

test('dbRowToNutritionItem: 열 이름 기준 매핑(지방/탄수 순서 뒤집힘 방지) + 100g 라벨값 그대로', () => {
  const item = dbRowToNutritionItem(ROWS[0], { name: '한끼통살 양념치킨맛' });
  assert.equal(item.name, '한끼통살 핫양념치킨맛');
  assert.equal(item.brand, '주식회사 와이앤비푸드');
  assert.equal(item.unit, '100g');
  assert.equal(item.servingSize, 100);
  assert.deepEqual(
    [item.nutrition.kcal, item.nutrition.protein, item.nutrition.carbs, item.nutrition.fat, item.nutrition.sodium],
    [125, 19, 8, 2.1, 470], // CSV 헤더는 지방이 탄수보다 앞 — 키 매핑이 이를 흡수해야 한다
  );
  assert.equal(item.basis, 'db');
  assert.equal(item.confidence, 1);
  assert.deepEqual(item.aliases, ['한끼통살 양념치킨맛'], '요청 표기가 다르면 별칭으로 보존');

  const same = dbRowToNutritionItem(ROWS[3], { name: '아이즈 프로틴 초코볼' });
  assert.deepEqual(same.aliases, [], '요청 표기가 같으면 별칭 없음');
});
