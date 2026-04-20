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
    { muscleId:'abs',      id:'abs_1',      name:'플랭크',                       movementId:'plank' },
    { muscleId:'abs',      id:'abs_2',      name:'행잉 레그 레이즈',             movementId:'hanging_leg_raise' },
    { muscleId:'abs',      id:'abs_3',      name:'케이블 크런치',                movementId:'cable_crunch' },
    { muscleId:'glute',    id:'glute_1',    name:'힙 쓰러스트',                  movementId:'hip_thrust' },
    { muscleId:'glute',    id:'glute_2',    name:'글루트 브릿지',                movementId:'glute_bridge' },
    { muscleId:'glute',    id:'glute_3',    name:'케이블 킥백',                  movementId:'cable_kickback' },
  ],
};

// ════════════════════════════════════════════════════════════════
// MOVEMENTS — 동작 카탈로그 (닫힌 enum)
// ────────────────────────────────────────────────────────────────
// equipment_category: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'smith' | 'bodyweight'
//   장비 등록 시 카테고리를 고르면 운동 기록 시점에 이 카테고리의 MOVEMENTS만 필터링되어 보임.
// ════════════════════════════════════════════════════════════════
export const MOVEMENTS = [
  // 가슴
  { id:'barbell_bench',          nameKo:'바벨 벤치프레스',              primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'large', stepKg:2.5,  equipment_category:'barbell' },
  { id:'incline_barbell_bench',  nameKo:'인클라인 바벨 벤치프레스',     primary:'chest',    subPattern:'chest_upper', pattern:'horizontal_push', sizeClass:'large', stepKg:2.5,  equipment_category:'barbell' },
  { id:'dumbbell_bench',         nameKo:'덤벨 벤치프레스',              primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5,  equipment_category:'dumbbell' },
  { id:'incline_smith_bench',    nameKo:'인클라인 스미스 벤치프레스',   primary:'chest',    subPattern:'chest_upper', pattern:'horizontal_push', sizeClass:'large', stepKg:2.5,  equipment_category:'smith' },
  { id:'incline_dumbbell_bench', nameKo:'인클라인 덤벨 벤치프레스',     primary:'chest',    subPattern:'chest_upper', pattern:'horizontal_push', sizeClass:'small', stepKg:2.5,  equipment_category:'dumbbell' },
  { id:'decline_machine_press',  nameKo:'디클라인 머신 프레스',         primary:'chest',    subPattern:'chest_lower', pattern:'horizontal_push', sizeClass:'large', stepKg:5,    equipment_category:'machine' },
  { id:'chest_press_machine',    nameKo:'체스트프레스 머신',            primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'large', stepKg:5,    equipment_category:'machine' },
  { id:'chest_fly',              nameKo:'플라이',                       primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5,  equipment_category:'machine' },
  { id:'cable_crossover',        nameKo:'케이블 크로스오버',            primary:'chest',    subPattern:'chest_mid',   pattern:'horizontal_push', sizeClass:'small', stepKg:2.5,  equipment_category:'cable' },
  { id:'dips',                   nameKo:'딥스',                         primary:'chest',    subPattern:'chest_lower', pattern:'horizontal_push', sizeClass:'small', stepKg:2.5,  equipment_category:'bodyweight' },

  // 등
  { id:'lat_pulldown',           nameKo:'랫풀다운',                     primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'large', stepKg:2.5, equipment_category:'machine' },
  { id:'arm_pulldown',           nameKo:'암풀다운',                     primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'pullup',                 nameKo:'풀업',                         primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5, equipment_category:'bodyweight' },
  { id:'assisted_pullup',        nameKo:'어시스트 풀업 머신',           primary:'back',     subPattern:'back_width',     pattern:'vertical_pull',   sizeClass:'large', stepKg:2.5, equipment_category:'machine' },
  { id:'barbell_row',            nameKo:'바벨 로우',                    primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'smith_row',              nameKo:'스미스 로우',                  primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5, equipment_category:'smith' },
  { id:'t_bar_row',              nameKo:'티바로우',                     primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5, equipment_category:'machine' },
  { id:'seated_row',             nameKo:'시티드 로우',                  primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5, equipment_category:'machine' },
  { id:'high_row',               nameKo:'하이로우',                     primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'large', stepKg:2.5, equipment_category:'machine' },
  { id:'dumbbell_row',           nameKo:'덤벨 로우',                    primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'small', stepKg:2.5, equipment_category:'dumbbell' },
  { id:'cable_seated_row',       nameKo:'케이블 시티드 로우',           primary:'back',     subPattern:'back_thickness', pattern:'horizontal_pull', sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'deadlift',               nameKo:'데드리프트',                   primary:'back',     subPattern:'posterior',      pattern:'hinge',           sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'rdl',                    nameKo:'루마니안 데드리프트',          primary:'back',     subPattern:'posterior',      pattern:'hinge',           sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  // 2026-04-20: face_pull primary 'back' → 'shoulder' (subPattern rear_delt 과 일관).
  //   기존 'back' 분류는 subPattern(rear_delt → shoulder 역매핑)과 모순되어 루틴 필터/
  //   부위별 집계가 어긋났다. 트레이너 관점에서도 rear delt 고립이 주 목적.
  { id:'face_pull',              nameKo:'페이스풀',                     primary:'shoulder', subPattern:'rear_delt',      pattern:'horizontal_pull', sizeClass:'small', stepKg:2.5, equipment_category:'cable' },

  // 어깨
  { id:'ohp',                    nameKo:'오버헤드프레스',               primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'smith_shoulder_press',   nameKo:'스미스 숄더프레스',            primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'large', stepKg:2.5, equipment_category:'smith' },
  { id:'dumbbell_shoulder_press',nameKo:'덤벨 숄더프레스',              primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'small', stepKg:2.5, equipment_category:'dumbbell' },
  { id:'machine_shoulder_press', nameKo:'머신 숄더프레스',              primary:'shoulder', subPattern:'shoulder_front', pattern:'vertical_push',   sizeClass:'large', stepKg:5,   equipment_category:'machine' },
  { id:'lateral_raise',          nameKo:'사이드 레터럴 레이즈',         primary:'shoulder', subPattern:'shoulder_side',  pattern:'isolation',       sizeClass:'small', stepKg:1,   equipment_category:'dumbbell' },
  { id:'cable_lateral_raise',    nameKo:'케이블 사레레',                primary:'shoulder', subPattern:'shoulder_side',  pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'front_raise',            nameKo:'프론트 레이즈',                primary:'shoulder', subPattern:'shoulder_front', pattern:'isolation',       sizeClass:'small', stepKg:1,   equipment_category:'dumbbell' },
  { id:'rear_delt_fly',          nameKo:'리어 델트 플라이',             primary:'shoulder', subPattern:'rear_delt',      pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'upright_row',            nameKo:'업라이트 로우',                primary:'shoulder', subPattern:'shoulder_side',  pattern:'vertical_pull',   sizeClass:'small', stepKg:2.5, equipment_category:'dumbbell' },
  { id:'shrug',                  nameKo:'슈러그',                       primary:'shoulder', subPattern:'traps',          pattern:'isolation',       sizeClass:'large', stepKg:2.5, equipment_category:'dumbbell' },

  // 하체
  { id:'back_squat',             nameKo:'백스쿼트',                     primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'front_squat',            nameKo:'프론트 스쿼트',                primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'smith_squat',            nameKo:'스미스 스쿼트',                primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:2.5, equipment_category:'smith' },
  { id:'hack_squat',             nameKo:'핵스쿼트',                     primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:5,   equipment_category:'machine' },
  { id:'squat_machine',          nameKo:'스쿼트 머신',                  primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:5,   equipment_category:'machine' },
  { id:'leg_press',              nameKo:'레그프레스',                   primary:'lower',    subPattern:'quad',           pattern:'squat',           sizeClass:'large', stepKg:10,  equipment_category:'machine' },
  { id:'leg_extension',          nameKo:'레그 익스텐션',                primary:'lower',    subPattern:'quad',           pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'leg_curl',               nameKo:'레그 컬',                      primary:'lower',    subPattern:'hamstring',      pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'hip_thrust',             nameKo:'힙 쓰러스트',                  primary:'glute',    subPattern:'glute',          pattern:'hinge',           sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'glute_bridge',           nameKo:'글루트 브릿지',                primary:'glute',    subPattern:'glute',          pattern:'hinge',           sizeClass:'small', stepKg:2.5, equipment_category:'bodyweight' },
  { id:'cable_kickback',         nameKo:'케이블 킥백',                  primary:'glute',    subPattern:'glute',          pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'glute_machine',          nameKo:'글루트 머신',                  primary:'glute',    subPattern:'glute',          pattern:'isolation',       sizeClass:'large', stepKg:5,   equipment_category:'machine' },
  { id:'abduction_machine',      nameKo:'어브덕션 머신(아웃싸이)',      primary:'glute',    subPattern:'glute',          pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'adduction_machine',      nameKo:'어덕션 머신(이너싸이)',        primary:'lower',    subPattern:'quad',           pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'lunge',                  nameKo:'런지',                         primary:'lower',    subPattern:'quad',           pattern:'lunge',           sizeClass:'small', stepKg:2.5, equipment_category:'dumbbell' },
  { id:'bulgarian_split_squat',  nameKo:'불가리안 스플릿 스쿼트',       primary:'lower',    subPattern:'quad',           pattern:'lunge',           sizeClass:'small', stepKg:2.5, equipment_category:'dumbbell' },
  { id:'calf_raise',             nameKo:'카프 레이즈',                  primary:'lower',    subPattern:'calf',           pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },

  // 이두
  { id:'barbell_curl',           nameKo:'바벨 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'barbell' },
  { id:'dumbbell_curl',          nameKo:'덤벨 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1,   equipment_category:'dumbbell' },
  { id:'hammer_curl',            nameKo:'해머 컬',                      primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1,   equipment_category:'dumbbell' },
  { id:'cable_curl',             nameKo:'케이블 컬',                    primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'preacher_curl',          nameKo:'프리처 컬',                    primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'machine' },
  { id:'incline_dumbbell_curl',  nameKo:'인클라인 덤벨 컬',             primary:'bicep',    subPattern:'bicep',          pattern:'isolation',       sizeClass:'small', stepKg:1,   equipment_category:'dumbbell' },

  // 삼두
  { id:'cable_tricep_pushdown',  nameKo:'케이블 푸쉬다운',              primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'cable_rope_pushdown',    nameKo:'로프 트라이셉 푸쉬다운',       primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'overhead_tricep_ext',    nameKo:'오버헤드 트라이셉 익스텐션',   primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
  { id:'skull_crusher',          nameKo:'스컬 크러셔',                  primary:'tricep',   subPattern:'tricep',         pattern:'isolation',       sizeClass:'small', stepKg:2.5, equipment_category:'barbell' },
  { id:'close_grip_bench',       nameKo:'클로즈 그립 벤치',             primary:'tricep',   subPattern:'tricep',         pattern:'horizontal_push', sizeClass:'large', stepKg:2.5, equipment_category:'barbell' },
  { id:'tricep_dips',            nameKo:'트라이셉 딥스',                primary:'tricep',   subPattern:'tricep',         pattern:'horizontal_push', sizeClass:'small', stepKg:2.5, equipment_category:'bodyweight' },

  // 복부
  { id:'plank',                  nameKo:'플랭크',                       primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0,   equipment_category:'bodyweight' },
  { id:'hanging_leg_raise',      nameKo:'행잉 레그 레이즈',             primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0,   equipment_category:'bodyweight' },
  { id:'ab_wheel',               nameKo:'앱 휠',                        primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:0,   equipment_category:'bodyweight' },
  { id:'cable_crunch',           nameKo:'케이블 크런치',                primary:'abs',      subPattern:'core',           pattern:'core',            sizeClass:'small', stepKg:2.5, equipment_category:'cable' },
];

// ════════════════════════════════════════════════════════════════
// MOVEMENT_MUSCLES_MAP — 각 동작이 활성화시키는 세부 부위(subPattern) 리스트
// ────────────────────────────────────────────────────────────────
// 배열[0] = 주동근 (자극 균형 차트에서 1세트=1부위로 카운트되는 기준)
// 배열[1..] = 협응/보조근. AI 디폴트 매핑이고 유저가 UI에서 CRUD 가능.
// 입력이 구체적 운동명("벤치프레스") → 해당 movement.id 키로 이 맵을 lookup.
// 입력이 범용 기구명("스미스머신") → BROAD_EQUIPMENT_MUSCLES_MAP 사용.
// subPattern 종류: chest_upper/mid/lower, back_width/thickness/posterior,
//   shoulder_front/side/rear_delt/traps, quad/hamstring/glute/calf,
//   bicep/tricep/core
// ════════════════════════════════════════════════════════════════
export const MOVEMENT_MUSCLES_MAP = {
  // ── 가슴
  barbell_bench:          ['chest_mid', 'chest_upper', 'chest_lower', 'shoulder_front', 'tricep'],
  incline_barbell_bench:  ['chest_upper', 'chest_mid', 'shoulder_front', 'tricep'],
  dumbbell_bench:         ['chest_mid', 'chest_upper', 'chest_lower', 'shoulder_front', 'tricep'],
  incline_smith_bench:    ['chest_upper', 'chest_mid', 'shoulder_front', 'tricep'],
  incline_dumbbell_bench: ['chest_upper', 'chest_mid', 'shoulder_front', 'tricep'],
  decline_machine_press:  ['chest_lower', 'chest_mid', 'tricep'],
  chest_press_machine:    ['chest_mid', 'chest_upper', 'shoulder_front', 'tricep'],
  chest_fly:              ['chest_mid', 'chest_upper'],
  cable_crossover:        ['chest_mid', 'chest_lower', 'chest_upper'],
  dips:                   ['chest_lower', 'tricep', 'shoulder_front'],
  // ── 등
  lat_pulldown:       ['back_width', 'bicep', 'rear_delt'],
  arm_pulldown:       ['back_width', 'tricep'],
  pullup:             ['back_width', 'bicep', 'back_thickness', 'rear_delt'],
  assisted_pullup:    ['back_width', 'bicep', 'back_thickness'],
  barbell_row:        ['back_thickness', 'back_width', 'bicep', 'rear_delt', 'posterior'],
  smith_row:          ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  t_bar_row:          ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  seated_row:         ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  high_row:           ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  dumbbell_row:       ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  cable_seated_row:   ['back_thickness', 'back_width', 'bicep', 'rear_delt'],
  deadlift:           ['posterior', 'hamstring', 'glute', 'back_thickness', 'traps'],
  rdl:                ['posterior', 'hamstring', 'glute', 'back_thickness'],
  face_pull:          ['rear_delt', 'traps', 'back_thickness'],
  // ── 어깨
  ohp:                    ['shoulder_front', 'shoulder_side', 'tricep', 'traps'],
  smith_shoulder_press:   ['shoulder_front', 'shoulder_side', 'tricep'],
  dumbbell_shoulder_press:['shoulder_front', 'shoulder_side', 'tricep'],
  machine_shoulder_press: ['shoulder_front', 'shoulder_side', 'tricep'],
  lateral_raise:          ['shoulder_side'],
  cable_lateral_raise:    ['shoulder_side'],
  front_raise:            ['shoulder_front'],
  rear_delt_fly:          ['rear_delt'],
  upright_row:            ['shoulder_side', 'traps'],
  shrug:                  ['traps'],
  // ── 하체
  back_squat:            ['quad', 'glute', 'hamstring', 'calf'],
  front_squat:           ['quad', 'glute', 'hamstring'],
  smith_squat:           ['quad', 'glute', 'hamstring', 'calf'],
  hack_squat:            ['quad', 'glute', 'hamstring'],
  squat_machine:         ['quad', 'glute', 'hamstring'],
  leg_press:             ['quad', 'glute', 'hamstring', 'calf'],
  leg_extension:         ['quad'],
  leg_curl:              ['hamstring'],
  hip_thrust:            ['glute', 'hamstring'],
  glute_bridge:          ['glute', 'hamstring'],
  cable_kickback:        ['glute'],
  glute_machine:         ['glute'],
  abduction_machine:     ['glute'],
  adduction_machine:     ['quad', 'glute'],
  lunge:                 ['quad', 'glute', 'hamstring', 'calf'],
  bulgarian_split_squat: ['quad', 'glute', 'hamstring'],
  calf_raise:            ['calf'],
  // ── 이두
  barbell_curl:          ['bicep'],
  dumbbell_curl:         ['bicep'],
  hammer_curl:           ['bicep'],
  cable_curl:            ['bicep'],
  preacher_curl:         ['bicep'],
  incline_dumbbell_curl: ['bicep'],
  // ── 삼두
  cable_tricep_pushdown: ['tricep'],
  cable_rope_pushdown:   ['tricep'],
  overhead_tricep_ext:   ['tricep'],
  skull_crusher:         ['tricep'],
  close_grip_bench:      ['tricep', 'chest_mid', 'shoulder_front'],
  tricep_dips:           ['tricep', 'chest_lower', 'shoulder_front'],
  // ── 복부
  plank:             ['core'],
  hanging_leg_raise: ['core'],
  ab_wheel:          ['core'],
  cable_crunch:      ['core'],
};

// ════════════════════════════════════════════════════════════════
// BROAD_EQUIPMENT_MUSCLES_MAP — 범용 기구명(특정 운동 키워드 없음)일 때 사용.
// ────────────────────────────────────────────────────────────────
// 매칭: 기구명을 정규화(소문자 + 공백 제거)해 key에 대응되는 패턴을 포함하는지 검사.
// 포함되면 해당 배열을 muscleIds 디폴트로 사용. 유저가 UI에서 좁히거나 넓힐 수 있음.
// ════════════════════════════════════════════════════════════════
export const BROAD_EQUIPMENT_MUSCLES_MAP = [
  {
    patterns: ['스미스머신', '스미스 머신', 'smith machine', 'smithmachine'],
    muscleIds: ['chest_mid', 'chest_upper', 'chest_lower', 'shoulder_front', 'tricep',
                'back_thickness', 'quad', 'glute', 'hamstring'],
  },
  {
    patterns: ['파워랙', 'power rack', 'powerrack', '스쿼트랙', 'squat rack'],
    muscleIds: ['chest_mid', 'chest_upper', 'shoulder_front', 'tricep',
                'back_thickness', 'back_width', 'posterior', 'quad', 'glute', 'hamstring', 'traps'],
  },
  {
    patterns: ['덤벨랙', '덤벨 랙', 'dumbbell rack', '덤벨세트', '덤벨 세트'],
    muscleIds: ['chest_mid', 'chest_upper', 'shoulder_front', 'shoulder_side',
                'bicep', 'tricep', 'back_thickness', 'back_width', 'rear_delt'],
  },
  {
    patterns: ['케이블머신', '케이블 머신', 'cable machine', '케이블크로스오버', '케이블 크로스오버'],
    muscleIds: ['chest_mid', 'chest_lower', 'back_width', 'back_thickness',
                'shoulder_side', 'rear_delt', 'bicep', 'tricep', 'core'],
  },
];

// MOVEMENTS 에 필요한 pattern 전체 (커버리지 시각화용)
export const MOVEMENT_PATTERNS = [
  'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull',
  'squat', 'hinge', 'lunge',
  'isolation', 'core',
];

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

// ── 앱 전역 상수 (변경 불필요) ────────────────────────────────────
// kind: 'part' = 헬스 자극부위 | 'activity' = 유산소 활동 (수영/런닝)
// 자극부위 선택 UI에서는 kind==='part'만 노출.
export const MUSCLES = [
  { id:'chest',    name:'가슴', color:'#f97316', kind:'part' },
  { id:'shoulder', name:'어깨', color:'#a855f7', kind:'part' },
  { id:'back',     name:'등',   color:'#06b6d4', kind:'part' },
  { id:'lower',    name:'하체', color:'#10b981', kind:'part' },
  { id:'glute',    name:'둔부', color:'#14b8a6', kind:'part' },
  { id:'bicep',    name:'이두', color:'#f59e0b', kind:'part' },
  { id:'tricep',   name:'삼두', color:'#ec4899', kind:'part' },
  { id:'abs',      name:'복부', color:'#84cc16', kind:'part' },
  { id:'swimming', name:'수영', color:'#0ea5e9', kind:'activity' },
  { id:'running',  name:'런닝', color:'#f43f5e', kind:'activity' },
];

export const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
export const DAYS   = ['일','월','화','수','목','금','토'];
