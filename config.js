// ================================================================
// config.js
// 의존성: 없음
// 비공개 API 키는 코드에 저장하지 않음 — 앱 설정 화면에서 입력 후 localStorage 저장
// ================================================================

const PUBLIC_VWORLD_MAP_KEY = '0E32F4A9-EA52-3F07-9A67-AE92A8384CE6';

function _readLocalSetting(key) {
  try {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(key) || '') : '';
  } catch {
    return '';
  }
}

export const CONFIG = {
  // 비공개 키는 localStorage에서 로드 (앱 설정에서 입력)
  get ANTHROPIC_KEY()    { return _readLocalSetting('cfg_anthropic'); },
  get ALPHAVANTAGE_KEY() { return _readLocalSetting('cfg_alphavantage'); },
  MAPS: {
    get RUNNING_PROVIDER()  { return _readLocalSetting('cfg_running_map_provider') || 'auto'; },
    get VWORLD_API_KEY()    { return _readLocalSetting('cfg_vworld_api_key') || PUBLIC_VWORLD_MAP_KEY; },
    get VWORLD_MAP_LAYER()  { return _readLocalSetting('cfg_vworld_map_layer') || 'base'; },
    get GOOGLE_MAPS_KEY()   { return _readLocalSetting('cfg_google_maps_key'); },
    get TMAP_APP_KEY()      { return _readLocalSetting('cfg_tmap_app_key'); },
  },
  // Groq는 Firebase Functions(geminiProxy) 서버측 secret으로 관리 — 클라 설정 불필요.
  APPCHECK_SITE_KEY: '6LfUKrYsAAAAAOhty9w6l1xUVaiGDmltI0obPVRM',

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
  GEMINI_MODEL:      'gemini-flash-latest',

  DEFAULT_EXERCISES: [
    { muscleId:'chest',    id:'chest_1',    name:'바벨 벤치프레스',              movementId:'barbell_bench' },
    { muscleId:'chest',    id:'chest_2',    name:'덤벨 벤치프레스',              movementId:'dumbbell_bench' },
    { muscleId:'chest',    id:'chest_3',    name:'인클라인 스미스 벤치프레스',   movementId:'incline_smith_bench' },
    { muscleId:'chest',    id:'chest_4',    name:'인클라인 덤벨 벤치프레스',     movementId:'incline_dumbbell_bench' },
    { muscleId:'chest',    id:'chest_5',    name:'플라이',                       movementId:'chest_fly' },
    { muscleId:'chest',    id:'chest_6',    name:'디클라인 머신',                movementId:'decline_machine_press' },
    { muscleId:'back',     id:'back_1',     name:'랫풀다운',                     movementId:'lat_pulldown' },
    { muscleId:'back',     id:'back_2',     name:'암풀다운',                     movementId:'arm_pulldown' },
    { muscleId:'back',     id:'back_3',     name:'하이로우',                     movementId:'high_row' },
    { muscleId:'back',     id:'back_4',     name:'티바로우',                     movementId:'t_bar_row' },
    { muscleId:'lower',    id:'lower_1',    name:'스쿼트',                       movementId:'back_squat' },
    { muscleId:'lower',    id:'lower_2',    name:'누워서 스쿼트',                movementId:'leg_press' },
    { muscleId:'lower',    id:'lower_3',    name:'스쿼트 머신',                  movementId:'squat_machine' },
    { muscleId:'lower',    id:'lower_4',    name:'레그익스텐션',                 movementId:'leg_extension' },
    { muscleId:'lower',    id:'lower_5',    name:'핵스쿼트',                     movementId:'hack_squat' },
    { muscleId:'shoulder', id:'shoulder_1', name:'사레레',                       movementId:'lateral_raise' },
    { muscleId:'shoulder', id:'shoulder_2', name:'전면',                         movementId:'front_raise' },
    { muscleId:'shoulder', id:'shoulder_3', name:'후면',                         movementId:'rear_delt_fly' },
    { muscleId:'shoulder', id:'shoulder_4', name:'케이블',                       movementId:'cable_lateral_raise' },
    { muscleId:'bicep',    id:'bicep_1',    name:'케이블',                       movementId:'cable_curl' },
    { muscleId:'tricep',   id:'tricep_1',   name:'케이블',                       movementId:'cable_tricep_pushdown' },
    { muscleId:'abs',      id:'abs_1',      name:'플랭크',                       movementId:'plank' },
    { muscleId:'abs',      id:'abs_2',      name:'행잉 레그 레이즈',             movementId:'hanging_leg_raise' },
    { muscleId:'abs',      id:'abs_3',      name:'케이블 크런치',                movementId:'cable_crunch' },
    { muscleId:'glute',    id:'glute_1',    name:'힙 쓰러스트',                  movementId:'hip_thrust' },
    { muscleId:'glute',    id:'glute_2',    name:'글루트 브릿지',                movementId:'glute_bridge' },
    { muscleId:'glute',    id:'glute_3',    name:'케이블 킥백',                  movementId:'cable_kickback' },
  ],
};

// MOVEMENTS 온톨로지는 config/movements.js 로 분리 — 기존 import 경로 유지를 위해 재수출.
export {
  MOVEMENTS,
  MOVEMENT_MUSCLES_MAP,
  BROAD_EQUIPMENT_MUSCLES_MAP,
  MOVEMENT_PATTERNS,
  MAX_PREFERRED_CATEGORIES,
  MUSCLES,
} from './config/movements.js';

// ════════════════════════════════════════════════════════════════
// EQUIPMENT_CATEGORIES — 장비 등록 시 선택 옵션
// ────────────────────────────────────────────────────────────────
// 장비명 + 카테고리만 등록하면 운동 기록 시점에 해당 카테고리의
// MOVEMENTS만 필터링되어 노출됨 (다대다 맵핑 부담 제거).
// ════════════════════════════════════════════════════════════════
export const EQUIPMENT_CATEGORIES = [
  { id:'barbell',    label:'💪 파워랙/바벨' },
  { id:'smith',      label:'🏗️ 스미스' },
  { id:'dumbbell',   label:'🏋️ 덤벨' },
  { id:'machine',    label:'⚙️ 머신' },
  { id:'cable',      label:'🪢 케이블' },
  { id:'bodyweight', label:'🏃 맨몸/기타' },
];

export const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
export const DAYS   = ['일','월','화','수','목','금','토'];
