// ================================================================
// config.js
// 의존성: 없음
// API 키는 코드에 저장하지 않음 — 앱 설정 화면에서 입력 후 localStorage 저장
// ================================================================

export const CONFIG = {
  // 비공개 키는 localStorage에서 로드 (앱 설정에서 입력)
  get ANTHROPIC_KEY()    { return localStorage.getItem('cfg_anthropic')    || ''; },
  get ALPHAVANTAGE_KEY() { return localStorage.getItem('cfg_alphavantage') || ''; },
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
  ],
};

// ════════════════════════════════════════════════════════════════
// MOVEMENTS — 동작 카탈로그 (닫힌 enum)
// ────────────────────────────────────────────────────────────────
// 브랜드/머신타입은 Exercise 인스턴스에서 자유 입력, 유저 간 비교·AI 추천의
// 앵커는 movementId. pattern은 push/pull 커버리지 판정, subPattern은
// Scene 13 부위별 자극 균형("등 넓이" vs "등 두께") 시각화용.
//   sizeClass : 'small'(±2.5kg 추천 범위) | 'large'(±10kg)
//   stepKg    : 기본 증량 단위(기구별 override 가능)
// ════════════════════════════════════════════════════════════════
export const MOVEMENTS = [
  // 가슴 — horizontal_push
  { id:'barbell_bench',          nameKo:'바벨 벤치프레스',              primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'large', stepKg:2.5 },
  { id:'dumbbell_bench',         nameKo:'덤벨 벤치프레스',              primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5 },
  { id:'incline_smith_bench',    nameKo:'인클라인 스미스 벤치프레스',   primary:'chest',    subPattern:'chest_upper', pattern:'horizontal_push', sizeClass:'large', stepKg:2.5 },
  { id:'incline_dumbbell_bench', nameKo:'인클라인 덤벨 벤치프레스',     primary:'chest',    subPattern:'chest_upper', pattern:'horizontal_push', sizeClass:'small', stepKg:2.5 },
  { id:'decline_machine_press',  nameKo:'디클라인 머신 프레스',         primary:'chest',    subPattern:'chest_lower', pattern:'horizontal_push', sizeClass:'large', stepKg:5 },
  { id:'chest_press_machine',    nameKo:'체스트프레스 머신',            primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'large', stepKg:5 },
  { id:'chest_fly',              nameKo:'플라이',                       primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5 },
  { id:'cable_crossover',        nameKo:'케이블 크로스오버',            primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5 },
  { id:'dips',                   nameKo:'딥스',                         primary:'chest',    subPattern:'chest_lower', pattern:'horizontal_push', sizeClass:'small', stepKg:2.5 },

  // 등 — vertical_pull (넓이) / horizontal_pull (두께)
  { id:'lat_pulldown',           nameKo:'랫풀다운',                     primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'large', stepKg:2.5 },
  { id:'arm_pulldown',           nameKo:'암풀다운',                     primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5 },
  { id:'pullup',                 nameKo:'풀업',                         primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5 },
  { id:'assisted_pullup',        nameKo:'어시스트 풀업 머신',           primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'large', stepKg:2.5 },
  { id:'barbell_row',            nameKo:'바벨 로우',                    primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5 },
  { id:'t_bar_row',              nameKo:'티바로우',                     primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5 },
  { id:'seated_row',             nameKo:'시티드 로우',                  primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5 },
  { id:'high_row',               nameKo:'하이로우',                     primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5 },
  { id:'dumbbell_row',           nameKo:'덤벨 로우',                    primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'small', stepKg:2.5 },
  { id:'deadlift',               nameKo:'데드리프트',                   primary:'back',     subPattern:'posterior',      pattern:'hinge',           sizeClass:'large', stepKg:2.5 },
  { id:'rdl',                    nameKo:'루마니안 데드리프트',          primary:'back',     subPattern:'posterior',      pattern:'hinge',           sizeClass:'large', stepKg:2.5 },
  { id:'face_pull',              nameKo:'페이스풀',                     primary:'back',     subPattern:'rear_delt',      pattern:'horizontal_pull', sizeClass:'small', stepKg:2.5 },

  // 어깨 — vertical_push
  { id:'ohp',                    nameKo:'오버헤드프레스',               primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'large', stepKg:2.5 },
  { id:'dumbbell_shoulder_press',nameKo:'덤벨 숄더프레스',              primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'small', stepKg:2.5 },
  { id:'machine_shoulder_press', nameKo:'머신 숄더프레스',              primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'large', stepKg:5 },
  { id:'lateral_raise',          nameKo:'사이드 레터럴 레이즈',         primary:'shoulder', subPattern:'shoulder_side',  pattern:'isolation',       sizeClass:'small', stepKg:1 },
  { id:'cable_lateral_raise',    nameKo:'케이블 사레레',                primary:'shoulder', subPattern:'shoulder_side',  pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'front_raise',            nameKo:'프론트 레이즈',                primary:'shoulder', subPattern:'shoulder_front', pattern:'isolation',       sizeClass:'small', stepKg:1 },
  { id:'rear_delt_fly',          nameKo:'리어 델트 플라이',             primary:'shoulder', subPattern:'rear_delt',      pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'upright_row',            nameKo:'업라이트 로우',                primary:'shoulder', subPattern:'shoulder_side',  pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5 },
  { id:'shrug',                  nameKo:'슈러그',                       primary:'shoulder', subPattern:'traps',          pattern:'isolation',       sizeClass:'large', stepKg:2.5 },

  // 하체 — squat / hinge / lunge / isolation
  { id:'back_squat',             nameKo:'백스쿼트',                     primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:2.5 },
  { id:'front_squat',            nameKo:'프론트 스쿼트',                primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:2.5 },
  { id:'hack_squat',             nameKo:'핵스쿼트',                     primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:5 },
  { id:'squat_machine',          nameKo:'스쿼트 머신',                  primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:5 },
  { id:'leg_press',              nameKo:'레그프레스',                   primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:10 },
  { id:'leg_extension',          nameKo:'레그 익스텐션',                primary:'lower',    subPattern:'quad',           pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'leg_curl',               nameKo:'레그 컬',                      primary:'lower',    subPattern:'hamstring',      pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'hip_thrust',             nameKo:'힙 쓰러스트',                  primary:'lower',    subPattern:'glute',          pattern:'hinge',           sizeClass:'large', stepKg:2.5 },
  { id:'lunge',                  nameKo:'런지',                         primary:'lower',    subPattern:'quad',           pattern:'lunge',           sizeClass:'small', stepKg:2.5 },
  { id:'bulgarian_split_squat',  nameKo:'불가리안 스플릿 스쿼트',       primary:'lower',    subPattern:'quad',           pattern:'lunge',           sizeClass:'small', stepKg:2.5 },
  { id:'calf_raise',             nameKo:'카프 레이즈',                  primary:'lower',    subPattern:'calf',           pattern:'isolation',       sizeClass:'small', stepKg:2.5 },

  // 이두 — isolation
  { id:'barbell_curl',           nameKo:'바벨 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'dumbbell_curl',          nameKo:'덤벨 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1 },
  { id:'hammer_curl',            nameKo:'해머 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1 },
  { id:'cable_curl',             nameKo:'케이블 컬',                    primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'preacher_curl',          nameKo:'프리처 컬',                    primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'incline_dumbbell_curl',  nameKo:'인클라인 덤벨 컬',             primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1 },

  // 삼두 — isolation
  { id:'cable_tricep_pushdown',  nameKo:'케이블 푸쉬다운',              primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'overhead_tricep_ext',    nameKo:'오버헤드 트라이셉 익스텐션',   primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'skull_crusher',          nameKo:'스컬 크러셔',                  primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5 },
  { id:'close_grip_bench',       nameKo:'클로즈 그립 벤치',             primary:'tricep',   subPattern:'tricep',         pattern:'horizontal_push', sizeClass:'large', stepKg:2.5 },

  // 복부 — core
  { id:'plank',                  nameKo:'플랭크',                       primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0 },
  { id:'hanging_leg_raise',      nameKo:'행잉 레그 레이즈',             primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0 },
  { id:'ab_wheel',               nameKo:'앱 휠',                        primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0 },
  { id:'cable_crunch',           nameKo:'케이블 크런치',                primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:2.5 },
];

// MOVEMENTS 에 필요한 pattern 전체 (커버리지 시각화용)
export const MOVEMENT_PATTERNS = [
  'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull',
  'squat', 'hinge', 'lunge',
  'isolation', 'core',
];

// ── 앱 전역 상수 (변경 불필요) ────────────────────────────────────
export const MUSCLES = [
  { id:'chest',    name:'가슴', color:'#f97316' },
  { id:'shoulder', name:'어깨', color:'#a855f7' },
  { id:'back',     name:'등',   color:'#06b6d4' },
  { id:'lower',    name:'하체', color:'#10b981' },
  { id:'bicep',    name:'이두', color:'#f59e0b' },
  { id:'tricep',   name:'삼두', color:'#ec4899' },
  { id:'abs',      name:'복근', color:'#84cc16' },
  { id:'swimming', name:'수영', color:'#0ea5e9' },
  { id:'running',  name:'런닝', color:'#f43f5e' },
];

export const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
export const DAYS   = ['일','월','화','수','목','금','토'];
