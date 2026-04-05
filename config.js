// ================================================================
// config.js
// 의존성: 없음
// API 키는 코드에 저장하지 않음 — 앱 설정 화면에서 입력 후 localStorage 저장
// ================================================================

export const CONFIG = {
  // API 키는 localStorage에서 로드 (앱 설정에서 입력)
  get ANTHROPIC_KEY()    { return localStorage.getItem('cfg_anthropic')    || ''; },
  get ALPHAVANTAGE_KEY() { return localStorage.getItem('cfg_alphavantage') || ''; },

  // 식품의약품안전처 식품영양성분 DB (data.go.kr 일반인증키) — 자연식품+가공식품 모두 포함
  FOOD_DB_KEY: 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b',
  FOOD_DB_URL: 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02',

  FIREBASE: {
    apiKey:            "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
    authDomain:        "exercise-management.firebaseapp.com",
    projectId:         "exercise-management",
    storageBucket:     "exercise-management.firebasestorage.app",
    messagingSenderId: "867781711662",
    appId:             "1:867781711662:web:8fe1e9904c94d021f2ccbf",
  },

  TICKERS: [
    { sym:'TSLA', name:'테슬라' },
    { sym:'NVDA', name:'엔비디아' },
    { sym:'AMZN', name:'아마존' },
    { sym:'META', name:'메타' },
    { sym:'GOOG', name:'알파벳C' },
  ],

  STOCK_CACHE_HOURS: 8,
  DIET_KCAL_LIMIT:   500,
  CLAUDE_MODEL:      'claude-haiku-4-5-20251001',

  DEFAULT_EXERCISES: [
    { muscleId:'chest',    id:'chest_1',    name:'바벨 벤치프레스' },
    { muscleId:'chest',    id:'chest_2',    name:'덤벨 벤치프레스' },
    { muscleId:'chest',    id:'chest_3',    name:'인클라인 스미스 벤치프레스' },
    { muscleId:'chest',    id:'chest_4',    name:'인클라인 덤벨 벤치프레스' },
    { muscleId:'chest',    id:'chest_5',    name:'플라이' },
    { muscleId:'chest',    id:'chest_6',    name:'디클라인 머신' },
    { muscleId:'back',     id:'back_1',     name:'랫풀다운' },
    { muscleId:'back',     id:'back_2',     name:'암풀다운' },
    { muscleId:'back',     id:'back_3',     name:'하이로우' },
    { muscleId:'back',     id:'back_4',     name:'티바로우' },
    { muscleId:'lower',    id:'lower_1',    name:'스쿼트' },
    { muscleId:'lower',    id:'lower_2',    name:'누워서 스쿼트' },
    { muscleId:'lower',    id:'lower_3',    name:'스쿼트 머신' },
    { muscleId:'lower',    id:'lower_4',    name:'레그익스텐션' },
    { muscleId:'lower',    id:'lower_5',    name:'핵스쿼트' },
    { muscleId:'shoulder', id:'shoulder_1', name:'사레레' },
    { muscleId:'shoulder', id:'shoulder_2', name:'전면' },
    { muscleId:'shoulder', id:'shoulder_3', name:'후면' },
    { muscleId:'shoulder', id:'shoulder_4', name:'케이블' },
    { muscleId:'bicep',    id:'bicep_1',    name:'케이블' },
    { muscleId:'tricep',   id:'tricep_1',   name:'케이블' },
  ],
};

// ── 앱 전역 상수 (변경 불필요) ────────────────────────────────────
export const MUSCLES = [
  { id:'chest',    name:'가슴', color:'#f97316' },
  { id:'shoulder', name:'어깨', color:'#a855f7' },
  { id:'back',     name:'등',   color:'#06b6d4' },
  { id:'lower',    name:'하체', color:'#10b981' },
  { id:'bicep',    name:'이두', color:'#f59e0b' },
  { id:'tricep',   name:'삼두', color:'#ec4899' },
  { id:'abs',      name:'복근', color:'#84cc16' },
];

export const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
export const DAYS   = ['일','월','화','수','목','금','토'];
