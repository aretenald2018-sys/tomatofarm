// ════════════════════════════════════════════════════════════════
// ai/equipment.js — 전문가 모드 기구 파싱 (텍스트/이미지)
// ════════════════════════════════════════════════════════════════
// 공통 원칙:
//  - movementId는 전달받은 MOVEMENTS 카탈로그 내 값으로만 응답하도록 프롬프트로 강제
//  - 매핑 불가 시 'unknown' 응답 (앱 측에서 ⚠️ 표시 후 사용자 선택)
//  - 응답은 _callGeminiJSON 으로 JSON 강제
// ════════════════════════════════════════════════════════════════

import {
  _callGeminiProxy, _cleanJSON, _salvagePartialJSONArray, _makeParseError,
} from './llm-core.js';
import { deriveMuscleIdsForItem } from './muscles.js';

function _movementsCatalogBrief(movements) {
  return (movements || []).map(m => `${m.id}:${m.nameKo}(${m.primary}/${m.pattern})`).join('\n');
}

// ── 로컬 구조화 추출: 마크다운/불릿 목록에서 {name,brand,machineType} 배열 ──
// AI 호출 전 로컬에서 대부분의 메타데이터를 확보해 응답 크기/에러율을 줄임.
function _extractEquipmentLines(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const stripEmojis = (s) => s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '').trim();
  // 메모/설명 섹션 판정 — 해당 섹션의 불릿은 기구가 아니므로 전부 스킵
  const isMemoSection = (title) => /메모|노트|참고|요약|정리|설명|memo|notes?|summary/i.test(title);
  const detectSectionMachineType = (title) => {
    if (/핀\s*머신|selectorized/i.test(title)) return '핀머신';
    if (/플레이트|plate\s*loaded/i.test(title)) return '플레이트';
    if (/하체\s*특화/.test(title)) return '머신';
    if (/프리\s*웨이트|케이블/i.test(title)) return ''; // 하위 ### 에서 세부 타입 결정
    if (/덤벨|dumbbell/i.test(title)) return '덤벨';
    if (/바벨|barbell/i.test(title)) return '바벨';
    return '';
  };
  const detectBrandMachineType = (title) => {
    if (/랙|플랫폼|rack/i.test(title)) return '바벨';
    if (/스미스|smith/i.test(title)) return '스미스';
    if (/케이블|cable|crossover/i.test(title)) return '케이블';
    if (/벤치|bench/i.test(title)) return '벤치';
    if (/덤벨|dumbbell/i.test(title)) return '덤벨';
    return '';
  };
  // 이름 정규화: "파워랙 **6대**" → "파워랙", "❌ ... (삭제 확정)" → null, **bold** 제거
  const normalizeName = (rawName) => {
    let n = String(rawName || '').trim();
    if (!n) return null;
    // 삭제/제외 마커 감지 → 제외
    if (/삭제\s*확정|\(\s*삭제\s*\)|deleted|removed/i.test(n)) return null;
    // 마크다운 볼드/이탤릭 제거
    n = n.replace(/\*\*/g, '').replace(/__|~~/g, '');
    // 수량 표기 제거: " 6대", " 2개", " 3세트", " 4쌍", "(5대)" 등
    n = n.replace(/\s*\(?\s*\d+\s*(?:대|개|세트|쌍|units?|pcs?)\s*\)?/gi, '');
    // 빈 괄호 제거 및 공백 정리
    n = n.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    return n.length >= 2 ? n : null;
  };

  const lines = raw.split(/\r?\n/);
  let machineType = '';
  let brand = '';
  let series = '';
  let skipSection = false;
  const out = [];

  for (const rawLine of lines) {
    const line = stripEmojis(rawLine).trim();
    if (!line) continue;
    if (/^[-=*_]{3,}$/.test(line)) continue; // HR

    // ## 섹션 헤더 → machineType 컨텍스트
    const mSection = line.match(/^##\s+(.+)$/);
    if (mSection) {
      const t = mSection[1].replace(/^\d+\.\s*/, '').trim();
      skipSection = isMemoSection(t);
      if (!skipSection) {
        const detected = detectSectionMachineType(t);
        if (detected) machineType = detected;
      }
      brand = ''; series = '';
      continue;
    }
    // ### 브랜드/시리즈 또는 장비 카테고리
    const mBrand = line.match(/^###\s+(.+)$/);
    if (mBrand) {
      const t = mBrand[1].trim();
      if (isMemoSection(t)) {
        skipSection = true;
        brand = ''; series = '';
        continue;
      }
      skipSection = false;
      const subType = detectBrandMachineType(t);
      if (subType) {
        machineType = subType;
        brand = ''; series = '';
      } else {
        // "Life Fitness Signature Series" → brand + series 분리 (heuristic)
        // "Series" 단어가 명시적으로 끝에 있을 때만 분리 (Hammer Strength 같은 케이스 보호)
        const m = t.match(/^(.+?)\s+(.+?\s+Series)$/i);
        if (m) { brand = m[1].trim(); series = m[2].trim(); }
        else   { brand = t; series = ''; }
      }
      continue;
    }
    // 메모 섹션 내부 불릿은 기구 아님 → 스킵
    if (skipSection) continue;
    // **부위** 같은 볼드 서브카테고리는 스킵 (기구 아님)
    if (/^\*\*(.+?)\*\*$/.test(line)) continue;

    // 불릿 기구명 (마크다운 형식 입력)
    const mBullet = line.match(/^\s*(?:[-*•·]|\d+[.)])\s+(.+)$/);
    if (mBullet) {
      const name = normalizeName(mBullet[1]);
      if (!name) continue;
      // rawLine은 AI가 무게 숫자(예: "110kg까지")를 추출할 수 있도록 원본 줄 전체 전달
      out.push({ name, brand, series, machineType, rawLine: rawLine.trim() });
      continue;
    }

    // 평문 한 줄 = 기구 하나 (사용자가 불릿 없이 붙여넣는 가장 흔한 케이스).
    // 헤더(##/###), 메모 섹션, 빈 줄, 볼드 서브카테고리는 이미 위에서 필터됨.
    // 숫자/문장부호만 있는 줄은 normalizeName이 null 반환.
    const plainName = normalizeName(line);
    if (plainName) {
      out.push({ name: plainName, brand, series, machineType, rawLine: rawLine.trim() });
    }
  }
  return out.slice(0, 200);
}

// ── 청크 단위 movementId 매핑 (AI는 작은 분류만 담당) ────────────
async function _mapMovementIdChunk(items, catalogBrief) {
  const briefItems = items.map((it, i) => {
    const ctx = [it.brand, it.series, it.machineType].filter(Boolean).join(' / ');
    // 원본 raw 텍스트도 함께 제공 — 무게 숫자 파싱이 가능하도록
    const raw = it.rawLine ? ` <<<${it.rawLine}>>>` : '';
    return `${i}: ${it.name}${ctx ? ` [${ctx}]` : ''}${raw}`;
  }).join('\n');

  const prompt = `헬스장 기구 목록을 카탈로그의 movementId에 매핑하고, 입력에서 무게 정보를 추출하라.

카탈로그 (id : 이름 (주부위/패턴)):
${catalogBrief}

기구 (index: name [brand/series/machineType] <<<원본 입력>>>):
${briefItems}

매핑 원칙 (적극 매핑):
- 브랜드(Hammer Strength, Nautilus, Cybex, Gym80, Newtech, Focus, Life Fitness, Arsenal, Watson, Shinko, Star Trac, HOIST, USP, Atlantis, Matrix, BootyBuilder, Flex Fitness, BodyMasters 등)·시리즈·색상·형식은 전부 무시. 동작(movement)만 보고 판단.
- 부분 일치·어순 다름·오타 허용. 예시:
  · "체스트 프레스", "인클라인 체스트 프레스", "디클라인 체스트 프레스" → chest_press_machine / incline_smith_bench / decline_machine_press 중 가장 가까운 것
  · "랫 풀다운", "프론트 랫 풀다운", "와이드 풀다운" → lat_pulldown
  · "시티드 로우", "로우로우", "ISO-Lateral Row", "버티컬 로우" → seated_row
  · "하이 로우", "레터럴 하이 로우" → high_row
  · "티바로우", "T바 로우", "T-Bar Row" → t_bar_row
  · "숄더 프레스", "바이킹 숄더 프레스", "머신 숄더프레스" → machine_shoulder_press
  · "사레레", "레터럴 레이즈" → lateral_raise / cable_lateral_raise
  · "리어 델트", "페이스풀" → rear_delt_fly / face_pull
  · "스쿼트", "백스쿼트", "V 스쿼트", "스쿼트 프레스" → back_squat / squat_machine
  · "레그 프레스", "Angled Leg Press", "파워 레그 프레스" → leg_press
  · "핵 스쿼트", "핵 프레스" → hack_squat
  · "레그 익스텐션" → leg_extension
  · "레그 컬", "라잉 레그 컬", "시티드 레그 컬" → leg_curl
  · "힙 쓰러스트", "힙 프레스" → hip_thrust
  · "바이셉스 컬", "바이셉 컬" → cable_curl 또는 barbell_curl
  · "트라이셉스", "트라이 익스텐션", "오버헤드 익스텐션", "푸쉬다운" → cable_tricep_pushdown / overhead_tricep_ext
  · "어시스트 풀업", "Chin/Dip Assist" → assisted_pullup
  · "딥스" → dips
  · "Pec Fly", "플라이" → chest_fly
  · "Pullover", "풀오버" → unknown (카탈로그 없음)
  · "Hip Adduction", "Abduction" → unknown (카탈로그 없음)
  · "스미스 머신", "파워랙", "플랫폼", "벤치"만 있는 항목 → unknown (동작이 아니라 도구)
- 정말 카탈로그에 상응하는 동작 자체가 없을 때만 'unknown' (예: 힙 어덕션, 복합 머신).
- 브랜드만 있는 항목("Hammer Strength 풀오버 머신" 등)도 동작으로 판단 ("풀오버" → unknown).

JSON 배열 스키마: [{"i":번호,"m":"movementId 또는 unknown","maxKg":숫자|null,"incKg":숫자|null}, ...]
- 모든 index에 대해 응답.
- maxKg: 원본 입력에 기구 최대중량이 명시돼있으면 kg 숫자, 없으면 null. 예: "랫풀다운 110kg까지" → 110.
- incKg: 원본에 "2.5kg씩 증가" 같은 단위가 있으면 숫자, 없으면 기구 유형 기본값 추론 — 핀머신/플레이트 2.5, 케이블/덤벨 1.25, 바벨 2.5, 불명이면 null.
- JSON 배열만. 설명/주석 금지.`;

  // 2026-04-21 fix: _callGeminiProxy 는 { text, provider } 반환 → 반드시 destructure.
  // 기존에는 객체 전체를 text 로 오사용해 _cleanJSON/_salvagePartialJSONArray 가
  // "[object Object]" 를 받아 항상 파싱 실패 → 브랜드/신형 기구가 AI 매핑
  // 구제받지 못하고 "mapped 없음 → muscleIds=[] → 주동근 안 잡힘" 회귀.
  const { text } = await _callGeminiProxy(
    [{ text: prompt }],
    { maxTokens: 1600, responseMimeType: 'application/json' }
  );
  let parsed;
  try { parsed = _cleanJSON(text); }
  catch {
    const salvaged = _salvagePartialJSONArray(text);
    if (salvaged) parsed = salvaged;
    else throw _makeParseError('PARSE_JSON', 'chunk JSON 파싱 실패');
  }
  const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
  const map = new Map();
  for (const row of arr) {
    const idx = typeof row?.i === 'number' ? row.i : (typeof row?.index === 'number' ? row.index : null);
    const mid = row?.m || row?.movementId || null;
    if (idx === null) continue;
    // 숫자 파싱 (문자열로 올 수도) — 비정상값은 null
    const rawMax = row?.maxKg ?? row?.max ?? null;
    const rawInc = row?.incKg ?? row?.inc ?? null;
    const maxKg = (rawMax != null && isFinite(+rawMax) && +rawMax > 0) ? +rawMax : null;
    const incKg = (rawInc != null && isFinite(+rawInc) && +rawInc > 0) ? +rawInc : null;
    map.set(idx, { movementId: mid ? String(mid) : 'unknown', maxKg, incKg });
  }
  return items.map((it, i) => {
    const r = map.get(i) || { movementId: 'unknown', maxKg: null, incKg: null };
    return { ...it, movementId: r.movementId, aiMaxKg: r.maxKg, aiIncKg: r.incKg };
  });
}

function _standardizeMachineType(mt) {
  if (!mt) return '기타';
  if (/핀|selector/i.test(mt)) return '핀머신';
  if (/플레이트|plate/i.test(mt)) return '플레이트';
  if (/케이블|cable/i.test(mt)) return '케이블';
  if (/덤벨|dumbbell/i.test(mt)) return '덤벨';
  if (/스미스|smith/i.test(mt)) return '스미스';
  if (/바벨|barbell/i.test(mt)) return '바벨';
  if (/벤치|bench/i.test(mt)) return '벤치';
  if (/머신|machine/i.test(mt)) return '머신';
  return '기타';
}

// ── 로컬 카탈로그 매칭 (alias 기반 분류기) ─────────────────────────
// 출력 계약: { state, topId, candidates }
//  - 'mapped'      : 자동 확정 (top 점수 충분, 1·2등 차이 충분)
//  - 'ambiguous'   : 후보 있으나 1등 확신 부족 → 사용자 확인 필요
//  - 'unsupported' : 카탈로그에 동작 자체 없음 OR 단순 도구(랙/벤치 등)
function _normalizeForMatch(s) {
  return String(s || '').toLowerCase()
    .replace(/머신|machine|기구|장비|머쉰/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s\-_·&+[\]/]+/g, '');
}

// 동작 카탈로그에 없는 보조장비/일반도구 — 자동 unsupported 판정
const UNSUPPORTED_PATTERNS = [
  /^파워?\s*랙$/i, /^랙$/i, /half\s*rack/i, /power\s*rack/i, /squat\s*rack/i,
  /^스미스(\s*머신)?$/i, /^smith(\s*machine)?$/i,
  /^플랫(\s*벤치(프레스)?)?(\s*랙)?$/i, /^인클라인\s*벤치$/i, /^벤치$/i, /^bench$/i,
  /^덤벨(\s*랙)?$/i, /dumbbell\s*rack/i, /^원판$/i, /^바벨(\s*\+\s*원판)?(\s*세트)?$/i,
  /^플랫폼$/i, /^platform$/i,
  /풀오버/i, /pullover/i, /pull\s*over/i,                // 카탈로그 없음
  /hip\s*ad?(b?)duction/i, /힙\s*어덕션/i, /힙\s*애브덕션/i, /^abduction$/i, /^adduction$/i,
  /torso\s*rotat/i, /토르소/i, /회전\s*머신/i,
  /백\s*익스텐션/i, /back\s*extension/i,                  // 카탈로그 없음
  /로타리\s*토르소/i,
];

// movementId → 한/영 별칭 사전 (브랜드 무관 일반 명칭 위주)
// AI 매핑 + 카탈로그 nameKo 외에 추가 신뢰도를 주는 보조 사전
const MOVEMENT_ALIASES = {
  // 가슴
  barbell_bench:           ['바벨 벤치프레스', '바벨 벤치 프레스', 'barbell bench press', 'flat barbell bench'],
  dumbbell_bench:          ['덤벨 벤치프레스', '덤벨 벤치 프레스', 'dumbbell bench press', 'db bench press'],
  incline_smith_bench:     ['인클라인 스미스 벤치프레스', 'incline smith bench', 'smith incline bench', '인클라인 스미스'],
  incline_dumbbell_bench:  ['인클라인 덤벨 벤치프레스', 'incline dumbbell bench', '인클라인 덤벨 프레스', 'incline db bench'],
  decline_machine_press:   ['디클라인 머신 프레스', 'decline machine press', '디클라인 체스트 프레스', 'decline chest press', 'decline press'],
  chest_press_machine:     ['체스트 프레스', '체스트프레스', 'chest press', 'iso-lateral bench press', 'iso lateral bench press', 'iso-lateral chest press', 'incline chest press', '인클라인 체스트 프레스', 'iso-lateral incline press', 'iso-lateral super incline press', 'super incline press', 'plate chest press'],
  chest_fly:               ['플라이', 'pec fly', 'chest fly', 'pec deck', '펙 덱', 'machine fly', '머신 플라이'],
  cable_crossover:         ['케이블 크로스오버', 'cable crossover', '케이블 플라이', 'cable fly'],
  dips:                    ['딥스', 'dips', '체스트 딥스'],

  // 등 - 풀다운 계열
  lat_pulldown:            ['랫 풀다운', '랫풀다운', 'lat pulldown', '와이드 풀다운', 'wide pulldown', '프론트 랫 풀다운', 'front lat pulldown', 'iso-lateral wide pulldown', 'iso-lateral front lat pulldown', 'wide lat pulldown', '와이드 풀다운 리어'],
  arm_pulldown:            ['암 풀다운', '암풀다운', 'arm pulldown', 'straight arm pulldown'],
  pullup:                  ['풀업', 'pull up', 'pullup', '친업', 'chin up'],
  assisted_pullup:         ['어시스트 풀업', 'assisted pullup', 'assisted pull up', 'chin/dip assist', 'chin dip assist', '어시스트 친업'],

  // 등 - 로우 계열
  barbell_row:             ['바벨 로우', '바벨로우', 'barbell row', '벤트오버 로우', 'bent over row', '펜들레이 로우'],
  t_bar_row:               ['티바 로우', '티바로우', 't-bar row', 't bar row', 'tbar row', 't바 로우'],
  seated_row:              ['시티드 로우', '시티드로우', 'seated row', 'seated cable row', '로우로우', 'low row', 'iso-lateral row', 'iso-lateral low row', 'iso lateral low row', 'mid row', '미드 로우', '리니어 로우', 'linear row', '어드저스터블 로우'],
  high_row:                ['하이 로우', '하이로우', 'high row', 'iso-lateral high row', '레터럴 하이 로우', 'lateral high row', 'incline lever row', 'incline row', '버티컬 로우', 'vertical row', 'dy 로우', 'iso-lateral pulldown'],
  dumbbell_row:            ['덤벨 로우', '덤벨로우', 'dumbbell row', 'one arm dumbbell row', '원암 덤벨 로우'],
  deadlift:                ['데드리프트', 'deadlift', '컨벤셔널 데드리프트'],
  rdl:                     ['루마니안 데드리프트', '루마니안 데드', 'romanian deadlift', 'rdl', '스티프 레그 데드'],
  face_pull:               ['페이스풀', '페이스 풀', 'face pull'],

  // 어깨
  ohp:                     ['오버헤드프레스', '오버헤드 프레스', 'overhead press', 'ohp', '바벨 숄더프레스', 'military press', '밀리터리 프레스'],
  dumbbell_shoulder_press: ['덤벨 숄더프레스', '덤벨 숄더 프레스', 'dumbbell shoulder press', 'db shoulder press'],
  machine_shoulder_press:  ['머신 숄더프레스', '머신 숄더 프레스', 'machine shoulder press', '숄더 프레스 머신', 'shoulder press machine', '숄더 프레스', 'shoulder press', '바이킹 숄더 프레스', 'viking shoulder press', '넥프레스', '넥 프레스', 'neck press', '인클라인 숄더 프레스'],
  lateral_raise:           ['사이드 레터럴 레이즈', '레터럴 레이즈', '사레레', 'lateral raise', 'side lateral raise', '사이드 레이즈', '시티드 레터럴 레이즈', 'seated lateral raise', '스탠딩 레터럴 레이즈', 'standing lateral raise'],
  cable_lateral_raise:     ['케이블 사레레', '케이블 레터럴 레이즈', 'cable lateral raise'],
  front_raise:             ['프론트 레이즈', 'front raise', '전면 레이즈'],
  rear_delt_fly:           ['리어 델트 플라이', '리어 델트', 'rear delt fly', 'rear delt', 'rear deltoid', '후면', 'pec fly / rear delt', 'rear delt machine', 'bentover lateral raise', '벤트오버 레터럴', 'matrix rear delt'],
  upright_row:             ['업라이트 로우', 'upright row'],
  shrug:                   ['슈러그', 'shrug', '바벨 슈러그'],

  // 하체
  back_squat:              ['백스쿼트', '백 스쿼트', 'back squat', '바벨 스쿼트'],
  front_squat:             ['프론트 스쿼트', 'front squat'],
  hack_squat:              ['핵스쿼트', '핵 스쿼트', 'hack squat', '핵 프레스', 'hack press'],
  squat_machine:           ['스쿼트 머신', 'squat machine', 'v 스쿼트', 'v squat', '스쿼트 프레스', 'squat press', '몬스터 글루트', 'monster glute', '플레이트 스쿼트'],
  leg_press:               ['레그프레스', '레그 프레스', 'leg press', 'angled leg press', '앵글 레그 프레스', 'iso-lateral leg press', '파워 레그 프레스', 'horizontal leg press', 'angled linear leg press', 'linear leg press'],
  leg_extension:           ['레그 익스텐션', '레그익스텐션', 'leg extension', 'iso-lateral leg extension'],
  leg_curl:                ['레그 컬', '레그컬', 'leg curl', '라잉 레그 컬', 'lying leg curl', 'seated leg curl', '시티드 레그 컬', 'iso-lateral leg curl', 'standing leg curl', 'standing hamstring curl', '햄스트링 컬'],
  hip_thrust:              ['힙 쓰러스트', '힙쓰러스트', 'hip thrust', 'booty builder', 'bootybuilder', '힙 프레스', 'hip press', 'standing hip thrust'],
  lunge:                   ['런지', 'lunge', 'walking lunge', '워킹 런지'],
  bulgarian_split_squat:   ['불가리안 스플릿 스쿼트', 'bulgarian split squat', 'split squat'],
  calf_raise:              ['카프 레이즈', 'calf raise', 'standing calf raise', 'seated calf raise', '카프'],

  // 이두
  barbell_curl:            ['바벨 컬', '바벨컬', 'barbell curl', 'ez bar curl', 'ez 바 컬'],
  dumbbell_curl:           ['덤벨 컬', '덤벨컬', 'dumbbell curl', 'standing dumbbell curl'],
  hammer_curl:             ['해머 컬', '해머컬', 'hammer curl'],
  cable_curl:              ['케이블 컬', '케이블컬', 'cable curl', 'rope curl', '바이셉스 컬', '바이셉 컬', 'bicep curl', 'biceps curl', 'biceps curl machine'],
  preacher_curl:           ['프리처 컬', 'preacher curl'],
  incline_dumbbell_curl:   ['인클라인 덤벨 컬', 'incline dumbbell curl'],

  // 삼두
  cable_tricep_pushdown:   ['케이블 푸쉬다운', '푸쉬다운', 'tricep pushdown', 'triceps pushdown', '트라이셉스 푸쉬다운', 'rope pushdown', 'cable pushdown', 'tricep press', 'triceps press', '트라이셉스 프레스', 'tricep extension', 'triceps extension', '어시스트 딥스'],
  overhead_tricep_ext:     ['오버헤드 트라이셉 익스텐션', 'overhead tricep extension', 'overhead triceps extension', '오버헤드 익스텐션', 'french press', '프렌치 프레스'],
  skull_crusher:           ['스컬 크러셔', 'skull crusher', '라잉 트라이셉 익스텐션'],
  close_grip_bench:        ['클로즈 그립 벤치', 'close grip bench', '내로우 벤치'],

  // 복부
  plank:                   ['플랭크', 'plank'],
  hanging_leg_raise:       ['행잉 레그 레이즈', 'hanging leg raise', '레그 레이즈', '무빙 레그 레이즈'],
  ab_wheel:                ['앱 휠', 'ab wheel', 'ab roller'],
  cable_crunch:            ['케이블 크런치', 'cable crunch', 'rope crunch', 'abdominal crunch', '복근 크런치', 'abdominal'],
};

let _aliasIndex = null;
function _getAliasIndex(movements) {
  if (_aliasIndex) return _aliasIndex;
  _aliasIndex = new Map();
  for (const m of movements) {
    const list = MOVEMENT_ALIASES[m.id] ? [...MOVEMENT_ALIASES[m.id]] : [];
    if (m.nameKo) list.push(m.nameKo);
    _aliasIndex.set(m.id, list.map(_normalizeForMatch).filter(s => s.length >= 2));
  }
  return _aliasIndex;
}

// 분류기: alias 점수 → 3-state 판정 (mapped/ambiguous/unsupported)
function _classifyEquipment(item, movements) {
  const rawName = String(item.name || '');
  const normName = _normalizeForMatch(rawName);
  if (!normName || normName.length < 1) return { state: 'unsupported', topId: null, candidates: [], reason: 'empty' };

  // 1) unsupported 패턴 → 즉시 판정
  for (const pat of UNSUPPORTED_PATTERNS) {
    if (pat.test(rawName)) return { state: 'unsupported', topId: null, candidates: [], reason: 'pattern' };
  }

  // 2) alias 점수
  const idx = _getAliasIndex(movements);
  const scores = [];
  for (const [movementId, aliases] of idx.entries()) {
    let best = 0;
    for (const a of aliases) {
      let s = 0;
      if (normName === a) s = 100;
      else if (normName.includes(a)) s = a.length * 2;
      else if (a.includes(normName) && normName.length >= 4) s = normName.length;
      if (s > best) best = s;
    }
    if (best > 0) scores.push({ id: movementId, score: best });
  }
  if (scores.length === 0) return { state: 'unsupported', topId: null, candidates: [], reason: 'no-match' };

  scores.sort((a, b) => b.score - a.score);
  const top1 = scores[0];
  const top2 = scores[1];

  // 자동 확정: top1 충분히 강력 + 2등과 충분한 격차
  const TOP_STRONG = 8;
  const MARGIN = 4;
  if (top1.score >= TOP_STRONG && (!top2 || (top1.score - top2.score) >= MARGIN)) {
    return { state: 'mapped', topId: top1.id, candidates: scores.slice(0, 3) };
  }
  // 후보 존재 → 사용자 확인 필요
  if (top1.score >= 4) {
    return { state: 'ambiguous', topId: top1.id, candidates: scores.slice(0, 3) };
  }
  return { state: 'unsupported', topId: null, candidates: [], reason: 'low-score' };
}

export async function parseEquipmentFromText(rawText, movements) {
  const candidates = _extractEquipmentLines(rawText);
  if (candidates.length === 0) {
    throw _makeParseError('PARSE_EMPTY', '입력에서 기구를 추출하지 못했습니다');
  }

  // 1) 로컬 분류 (mapped / ambiguous / unsupported)
  const classified = candidates.map(item => ({
    ...item,
    classification: _classifyEquipment(item, movements),
  }));

  // 2) AI 호출: mapped 제외한 전체(ambiguous + unsupported). 브랜드/모델명 위주 입력이
  //    로컬 alias에 안 잡혀 unsupported가 된 경우를 구제 — AI는 카탈로그 풀텍스트 참조 가능.
  //    aiMaxKg/aiIncKg도 함께 추출해 리뷰 화면에 즉시 반영.
  const needsAiIdxs = classified
    .map((c, i) => (c.classification.state !== 'mapped' ? i : -1))
    .filter(i => i >= 0);

  // AI가 추출한 무게 — classified에 역병합용 맵
  const aiWeights = new Map();  // origIdx → {maxKg, incKg}

  let aiUsed = false;
  let aiFailed = false;
  if (needsAiIdxs.length > 0) {
    aiUsed = true;
    const CHUNK = 20;
    const catalog = _movementsCatalogBrief(movements);
    for (let i = 0; i < needsAiIdxs.length; i += CHUNK) {
      const idxSlice = needsAiIdxs.slice(i, i + CHUNK);
      const itemSlice = idxSlice.map(idx => classified[idx]);
      try {
        const aiResults = await _mapMovementIdChunk(itemSlice, catalog);
        aiResults.forEach((r, j) => {
          const origIdx = idxSlice[j];
          const c = classified[origIdx].classification;
          // 무게 정보는 항상 저장 (매핑 성공 여부와 무관)
          if (r.aiMaxKg != null || r.aiIncKg != null) {
            aiWeights.set(origIdx, { maxKg: r.aiMaxKg, incKg: r.aiIncKg });
          }
          if (r.movementId && r.movementId !== 'unknown') {
            const hadLocalCandidates = c.candidates.length > 0;
            const inCandidates = c.candidates.some(cd => cd.id === r.movementId);
            // 로컬 후보가 있을 때: candidate 일치 → mapped / 불일치 → ambiguous
            // 로컬 후보가 없었을 때(이전 unsupported): AI 판단 신뢰 → mapped
            classified[origIdx].classification = {
              state: inCandidates ? 'mapped'
                   : hadLocalCandidates ? 'ambiguous'
                   : 'mapped',
              topId: r.movementId,
              candidates: c.candidates,
              reason: inCandidates ? 'ai-confirmed'
                    : hadLocalCandidates ? 'ai-override'
                    : 'ai-rescued',  // unsupported → AI가 구조
            };
          }
        });
      } catch (e) {
        console.warn(`[parseEquipmentFromText] AI chunk ${i}-${i+idxSlice.length} 실패:`, e?.message || e);
        aiFailed = true;
      }
    }
  }

  const counts = { mapped: 0, ambiguous: 0, unsupported: 0 };
  for (const c of classified) counts[c.classification.state]++;
  console.log(`[parseEquipmentFromText] 분류 → mapped ${counts.mapped} · ambiguous ${counts.ambiguous} · unsupported ${counts.unsupported} (AI ${aiUsed ? (aiFailed ? '일부 실패' : '사용') : '미사용'})`);

  // 최종 스키마로 정규화 (리뷰 화면이 기대하는 필드 맞춤)
  // 2026-04-19 리팩토링: 기존 _expandMultiPurposeItem이 "스미스머신"/"파워랙" 같은 범용 기구를
  // 여러 row로 분할했으나, 유저 요구에 따라 한 기구 = 한 row로 유지하고 대신
  // muscleIds 배열(세부 부위 N개)로 자극 부위를 표현하도록 변경.
  // 예: "스미스머신" 단독 → muscleIds=[가슴중부/상부/하부, 등두께, 대퇴사두, 햄스트링, 둔근, 어깨전면, 삼두]
  //     "스미스머신 스쿼트" 또는 "벤치프레스" → MOVEMENT_MUSCLES_MAP[movementId] 기반 좁은 세트
  //     유저가 UI에서 칩으로 추가/제거/순서변경 가능. muscleIds[0] = 주동근.
  const out = [];
  classified.forEach((x, i) => {
    const c = x.classification;
    const w = aiWeights.get(i) || { maxKg: null, incKg: null };
    const finalMovementId = c.state === 'unsupported' ? 'unknown' : (c.topId || 'unknown');
    const base = {
      name: x.name,
      brand: x.brand || (x.series || ''),
      machineType: _standardizeMachineType(x.machineType),
      maxKg: w.maxKg,
      incKg: w.incKg,
      movementId: finalMovementId,
    };
    const muscleIds = deriveMuscleIdsForItem(base, movements);
    // mappingState 재평가: muscleIds가 비면 ambiguous, 아니면 mapped.
    const hasMuscles = muscleIds.length > 0;
    const mappingState = hasMuscles ? 'mapped' : c.state;
    out.push({
      ...base,
      weightUnit: 'kg',
      muscleIds,
      mappingState,
      candidates: c.candidates || [],
      confidence: hasMuscles ? (c.state === 'mapped' ? 0.9 : 0.7)
                             : (c.state === 'ambiguous' ? 0.5 : 0),
    });
  });
  return out;
}

export async function parseEquipmentFromImage(imageBase64, movements) {
  const prompt = `이미지에 보이는 헬스장 기구(라벨/안내판/기구 사진)를 추출하라.

카탈로그 (id : 이름 (주부위/패턴)):
${_movementsCatalogBrief(movements)}

JSON 배열 스키마:
[{"name":"표시명","brand":"브랜드(선택)","machineType":"핀머신|플레이트|케이블|덤벨|바벨|스미스|벤치|머신|기타","movementId":"카탈로그 id 또는 unknown","maxKg":숫자|null,"incKg":숫자|null}]

규칙:
- movementId는 카탈로그 id만 사용. 애매하면 'unknown'.
- 카테고리명/브랜드명만 있고 기구 아닌 것은 항목 제외.
- maxKg: 이미지의 라벨/스티커에 최대 중량이 보이면 kg 숫자, 아니면 null.
- incKg: 기구 유형 기본값 — 핀머신/플레이트 2.5, 케이블/덤벨 1.25, 바벨 2.5, 불명 null.
- JSON 배열만 출력. 설명 금지.`;
  // 2026-04-21 fix: _callGeminiProxy 반환 destructure (위 _mapMovementIdChunk 와 동일 회귀).
  let text;
  try {
    const r = await _callGeminiProxy([
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    ], { maxTokens: 2400, responseMimeType: 'application/json' });
    text = r.text;
  } catch (e) {
    console.warn('[parseEquipmentFromImage] Gemini 호출 실패:', e?.message || e);
    throw _makeParseError('PARSE_API', 'AI 서버 호출 실패', e);
  }
  let parsed;
  try { parsed = _cleanJSON(text); }
  catch (e) {
    const salvaged = _salvagePartialJSONArray(text);
    if (salvaged) parsed = salvaged;
    else {
      console.warn('[parseEquipmentFromImage] JSON 파싱 실패:', e?.message || e);
      throw _makeParseError('PARSE_JSON', 'AI 응답 JSON 파싱 실패', e);
    }
  }
  const items = Array.isArray(parsed) ? parsed
              : (Array.isArray(parsed?.items) ? parsed.items : null);
  if (!Array.isArray(items)) throw _makeParseError('PARSE_JSON', 'AI 응답 스키마 불일치');
  if (items.length === 0) throw _makeParseError('PARSE_EMPTY', '추출된 기구 없음');
  // 공통 정규화 — 숫자 필드는 유효성 검증 (AI가 문자열/NaN 반환 가능)
  const num = (v) => (v != null && isFinite(+v) && +v > 0) ? +v : null;
  // 2026-04-19 리팩토링: 멀티퍼포스 확장 중단 → 한 기구 = 한 row + muscleIds[] 부위 배열.
  const out = [];
  for (const x of items) {
    const name = x.name || '';
    if (!name || name.length < 2) continue;
    const movId = x.movementId || 'unknown';
    const base = {
      name,
      brand: x.brand || '',
      machineType: _standardizeMachineType(x.machineType),
      maxKg: num(x.maxKg),
      incKg: num(x.incKg),
      movementId: movId,
    };
    const muscleIds = deriveMuscleIdsForItem(base, movements);
    out.push({
      ...base,
      weightUnit: 'kg',
      muscleIds,
      mappingState: muscleIds.length > 0 ? 'mapped' : 'ambiguous',
      confidence: muscleIds.length > 0 ? 0.8 : 0.3,
    });
  }
  return out;
}
