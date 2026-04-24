// ================================================================
// ai/routine.js — 전문가 모드: 균형 nudge + 루틴 후보 + 목표 실현가능성
// ================================================================

import { TODAY, dietDayOk, hasExerciseRecord } from '../data.js';
import { SUBPATTERN_TO_MAJOR } from '../calc.js';
import { _callLLMJSON, _callGeminiJSON } from './llm-core.js';

// ── 균형 nudge (Scene 10 노란 카드 문구) ────────────────────────
export async function generateBalanceNudge({ balanceByPattern, targetMuscles, preset }) {
  const summary = Object.entries(balanceByPattern || {})
    .map(([k,v]) => `${k}:${v}세트`).join(', ') || '최근 기록 부족';
  const targets = (targetMuscles || []).join(',') || '자동';
  const prompt = `당신은 짧고 친근한 피트니스 코치. JSON만 출력하라.
최근 2주 subPattern별 작업세트: ${summary}
오늘 선택 부위: ${targets}
목표: ${preset?.goal || '미설정'} / 빈도: 주${preset?.daysPerWeek}회

JSON 스키마:
{"title":"한 줄 제안 (~15자)","body":"두 줄 이내 이유(HTML 허용: <b>)","suggest":["muscleId",...]}
예시:
{"title":"이번엔 등 넓이 어때요?","body":"지난 4회 등 운동이 <b>두께 중심(로우·시티드로우)</b>이었어요. 균형을 위해 <b>넓이 자극(랫풀다운·암풀다운)</b>을 추천해요.","suggest":["shoulder"]}

균형이 이미 좋으면 title을 "오늘도 좋은 선택이에요" 처럼 긍정적으로.`;
  // nudge는 실패해도 UI 치명적이지 않음 → catch→default 유지. 단, 라우터로 Groq 기회는 제공.
  try {
    const { data: r, provider } = await _callLLMJSON([{ text: prompt }], { maxTokens: 400 });
    return {
      title: r?.title || '오늘도 힘내세요',
      body: r?.body || '',
      suggest: Array.isArray(r?.suggest) ? r.suggest : [],
      _provider: provider,
    };
  } catch (e) {
    console.warn('[generateBalanceNudge] fallback (default):', e?.code || e?.message || e);
    return { title: '오늘도 힘내세요', body: '', suggest: [] };
  }
}

// ── 오늘의 루틴 후보 2개 생성 (Scene 11) ────────────────────────
// onProviderSwitch({provider, reason}): Groq로 전환될 때 UI 중간 상태 콜백.
// ⚠️ 이 함수의 핵심 불변식: 반환되는 items의 exerciseId는
//   (a) gymExercises에 존재하고 (b) muscleId가 targetMuscles에 포함돼야 한다.
//   AI가 "균형 보완" 지시를 과해석해 선택 안 한 부위를 추가하는 버그가 있었음 →
//   서버사이드 gymExercises 필터 + 프롬프트 강제 규칙 + 호출부 post-validate 3중 방어.
export async function generateRoutineCandidates({ preset, targetMuscles, sessionMinutes, preferredRpe, gymExercises, recentHistory, sameMuscleContext, movements, onProviderSwitch }) {
  const targets = (Array.isArray(targetMuscles) ? targetMuscles : []).filter(Boolean);
  const hasTargets = targets.length > 0;

  // 2026-04-20: gym 기구의 대분류 muscles 집합을 muscleId/muscleIds[]/movementId 3단계로
  //   결정한다. 이전에는 `targets.includes(e.muscleId)` 만 썼는데, 저장 경로가 movementId
  //   없이 저장될 때 `muscleId` 필드에 subPattern(예: 'chest_mid') 을 넣는다
  //   (workout/expert.js:1392 `mov?.primary || p.muscleIds[0]`). 이 경우 이전 필터는
  //   유효한 기구를 `NO_GYM_FOR_TARGETS` 로 거르거나 프롬프트에서 누락시켰다.
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const _gymMajors = (e) => {
    const out = new Set();
    if (!e) return out;
    // 1) muscleIds[] (진실 소스) — subPattern → major 역매핑
    const subs = Array.isArray(e.muscleIds) ? e.muscleIds : [];
    for (const sp of subs) {
      const mj = SUBPATTERN_TO_MAJOR[sp];
      if (mj) out.add(mj);
    }
    // 2) muscleId — major 일 수도 있고 subPattern 일 수도 있다 (저장 경로에 따라)
    if (e.muscleId) {
      if (SUBPATTERN_TO_MAJOR[e.muscleId]) out.add(SUBPATTERN_TO_MAJOR[e.muscleId]);
      else out.add(e.muscleId);                              // major 라고 가정
    }
    // 3) movementId → movement.primary / subPattern
    if (out.size === 0 && e.movementId && e.movementId !== 'unknown') {
      const mov = movById.get(e.movementId);
      if (mov?.primary) out.add(mov.primary);
      if (mov?.subPattern && SUBPATTERN_TO_MAJOR[mov.subPattern]) out.add(SUBPATTERN_TO_MAJOR[mov.subPattern]);
    }
    return out;
  };

  // 서버사이드 1차 방어: 타겟 외 기구는 아예 프롬프트에 노출하지 않음.
  // AI가 눈에 보이지 않는 건 고를 수 없다 — "균형 보완" 지시와 무관하게 타 부위 유입 차단.
  const filteredGym = hasTargets
    ? (gymExercises || []).filter(e => {
        const mj = _gymMajors(e);
        if (mj.size === 0) return false;
        for (const m of mj) { if (targets.includes(m)) return true; }
        return false;
      })
    : (gymExercises || []);

  if (hasTargets && filteredGym.length === 0) {
    const err = new Error(`선택한 부위(${targets.join(',')})에 등록된 기구가 없어요`);
    err.code = 'NO_GYM_FOR_TARGETS';
    throw err;
  }

  const gymList = filteredGym.map(e => {
    const majors = [..._gymMajors(e)].join('/') || (e.muscleId || '?');
    const subs   = Array.isArray(e.muscleIds) && e.muscleIds.length ? ` [${e.muscleIds.join(',')}]` : '';
    return `${e.id}:${e.name}(${e.movementId || 'unknown'}, ${majors}${subs}, max ${e.maxWeightKg || '?'}kg, step ${e.incrementKg || 2.5}kg)`;
  }).join('\n');
  const hist = (recentHistory || []).slice(0, 20).map(h => `- ${h.exerciseId} ${h.date}: top ${h.topKg}kg×${h.topReps}`).join('\n') || '기록 없음';

  // 2026-04-20: 선택 부위별 **독립** 직전/직직전 세션 요약 블록.
  //   기존은 targetMuscles 전체를 한 번에 묶어서 가슴+이두 같은 복수 부위 날엔 이두-only
  //   세션이 가슴 비교에 섞이는 혼합 버그(리뷰 #1). 이제 sameMuscleContext 는 per-major
  //   배열이므로 각 부위 섹션을 분리해 AI 가 부위별로 판단하게 한다. imbalance.weakSubPatterns
  //   가 있으면 그 부위 기구 1개 이상 포함하도록 강제.
  const sameMuscleBlock = (() => {
    if (!Array.isArray(sameMuscleContext) || sameMuscleContext.length === 0) return '';
    const sections = [];
    for (const ctx of sameMuscleContext) {
      const { major, today, previous, imbalance } = ctx || {};
      if (!major) continue;
      const lines = [`[${major}] 최근 세션 요약:`];
      if (today) {
        const subs = Object.entries(today.subBalance || {}).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${k} ${v}`).join('/');
        lines.push(`- 오늘(${today.dateKey}): ${today.workSets}세트, 볼륨 ${today.totalVolume}, Top ${today.topKg}kg${subs ? `, 세부 ${subs}` : ''}`);
      }
      (previous || []).forEach((p, i) => {
        const head = i === 0 ? '직전' : '직직전';
        const subs = Object.entries(p.subBalance || {}).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${k} ${v}`).join('/');
        lines.push(`- ${head}(${p.dateKey}): ${p.workSets}세트, 볼륨 ${p.totalVolume}, Top ${p.topKg}kg${subs ? `, 세부 ${subs}` : ''}`);
      });
      if (imbalance?.weakSubPatterns?.length) {
        lines.push(`⚠ 반드시 반영: [${major}] 최근 3세션 합산에서 [${imbalance.weakSubPatterns.join(', ')}] 세부 부위가 부족 — 후보 A에 ${major} 중 해당 세부 부위 기구 1개 이상 포함시킬 것.`);
      }
      sections.push(lines.join('\n'));
    }
    return sections.length ? sections.join('\n\n') : '';
  })();

  // NOTE: 프롬프트에서 `선호=preset.preferMuscles`를 일부러 뺐다.
  //   과거엔 preset.preferMuscles가 오늘 targets와 불일치할 때 AI가 preset 쪽을
  //   "사용자 선호 부위"로 오해해 오늘 선택 밖 부위(예: 등)를 포함시키는 원인이었음.
  //   오늘 세션 설계에 영향을 미쳐야 하는 단 하나의 부위 신호는 `오늘 선택 부위`다.
  const targetsLabel = hasTargets ? targets.join(',') : '자동';
  const prompt = `당신은 전문 트레이너. 오늘 루틴 후보 2개를 JSON으로 설계하라.

프리셋: 목표=${preset?.goal}, 주${preset?.daysPerWeek}회, 기피=${(preset?.avoidMuscles||[]).join(',')}, 금지동작=${(preset?.forbiddenMovements||[]).join(',')}
오늘 선택 부위(반드시 이 부위만): ${targetsLabel}  / 시간: ${sessionMinutes}분 / RPE: ${preferredRpe}

⚠️ 절대 규칙 (위반 시 응답 무효):
- items의 exerciseId는 반드시 아래 "가능한 기구" 목록 중 하나.
- 목록에 없는 id는 생성 금지.
- 오늘 선택 부위 외의 부위(예: '등'이 위 선택에 없으면 등/랫풀다운/풀업류) 절대 포함 금지.
- "균형 보완"은 오늘 선택 부위 **내부**의 subPattern 다양화를 의미한다
  (예: 등 선택 시 넓이 vs 두께, 가슴 선택 시 상부 vs 중부 vs 하부).
  선택 부위 자체를 바꾸거나 추가하는 것이 아니다.

⚠️ title / rationale 용어 규칙 (매우 중요 — 과거 회귀 원인):
- title 은 15자 이내. title·rationale 에 등장하는 "신체 부위명"은 오늘 선택 부위(${targetsLabel})
  중 실제 items 에 포함된 부위 만 허용. 선택하지 않은 부위(하체/다리/복근/코어/어깨/이두 등)
  단어 사용 금지.
- 한국어 용어 주의: "가슴 하부 / 가슴 상부 / 가슴 중부" 의 "하부/상부/중부"는 **가슴 근육의 세부
  위치** 일 뿐, 독립적으로 "하체"(다리)·"상체"(몸통 전체) 와 다른 뜻이다. 서로 혼용 금지.
  예: chest_lower 세부 부위를 언급할 땐 "가슴 하부" 라고만 쓰고, "하체 보강" 같은 표현은 절대
      만들지 말 것 (하체 = 대퇴/햄/둔근/종아리).
- rationale 에서 subPattern 코드(chest_lower, posterior, back_thickness 등)를 언급할 땐 반드시
  한국어 근육명과 함께 쓰고, 그 근육이 오늘 선택 부위에 포함되는지 한 번 더 검증.

가능한 기구(오늘 부위로 이미 필터된 목록 — 이 중에서만 선택):
${gymList || '없음 — 일반 기구 추천'}

최근 14일 기록(참고):
${hist}
${sameMuscleBlock ? `\n${sameMuscleBlock}\n` : ''}
후보 역할 (반드시 서로 다른 훈련 자극 — 같은 처방 금지):
- 후보 A · "균형 보완 (Volume/Hypertrophy)" · candidateTag="A · 균형 보완 ⭐"
  · 오늘 선택 부위의 subPattern 다양화 + 부족한 세부 부위 보완.
  · 자극 스타일: 중량 적당 · reps 중간~많음 · RPE 7~8.5 · 종목 수 많음(5~7) · 총 세트 많음.
  · 위 "선택 부위 최근 세션 요약" 의 세부 부위(subPattern) 분포가 편중돼 있으면 A 는 반드시
    부족한 subPattern 쪽 기구를 1개 이상 포함해 보완한다.
- 후보 B · "고강도 도전 (Top-set / Strength)" · candidateTag="B · 고강도 도전 💪"
  · 오늘 선택 부위의 **컴파운드 1~2개를 주 운동**으로 두고, 저렙·고중량·고RPE 로 Top-set 도전.
  · 자극 스타일: reps 3~6 (주 컴파운드) / 6~8 (보조) · RPE 8~9.5 · 종목 수 적음(4~5).
  · 위 "선택 부위 최근 세션 요약" 의 Top kg 에 근거해 "직전 top ${'$'}{prevTop}kg → 오늘 +2.5kg 시도"
    처럼 **구체적 증량 목표**를 rationale 에 명시. 데이터 없으면 "오늘 top 세트 PR 시도" 수준 표현.
  · A 가 볼륨/근비대 세션이므로 B 는 절대 볼륨/다양화 카피가 되면 안 됨 — 인텐시티 축이 달라야 함.

세트 처방 규칙 (두 후보 공통 — 실제 트레이너 처방처럼):
⚠️ 핵심: **모든 종목의 세트 수가 동일한 응답은 규칙 위반** (예: 모든 종목 3세트 = 위반).
   종목별로 세트 수가 다른 자연스러운 편차를 반드시 둘 것. 같은 근육 그룹 안에서도
   컴파운드/고립에 따라 다르게 처방.
- 각 종목의 sets 배열은 종목 유형별 권장 길이를 따른다:
  · **items[0] (첫 번째 종목 = 세션 메인 lift) 은 반드시 컴파운드 + 4 세트** — 가장 많은 볼륨.
  · **그 외 컴파운드** (스쿼트/데드리프트/벤치프레스/오버헤드프레스/바벨로우/풀업·풀다운/딥스 계열
    = 다관절·큰 근육 동원): **3 워킹 세트** · movementType="compound".
  · **고립** (컬/푸쉬다운/레이즈/플라이/익스텐션/크런치/사레레 계열 = 단관절 또는 단일 근육 고립):
    **2~3 워킹 세트** · movementType="isolation".
  · 애매하면 컴파운드로 간주.
- 점진 과부하 현실성: 유저의 직전 top kg 대비 **한 세션 +5~10% 이내**가 트레이너 관례.
  저반복 환산해서 RPE 계산이 튀어도 실제 제안 무게는 이 범위를 넘으면 안 됨.
  (RPE/reps 조합 선정 시 이 현실성까지 고려할 것.)
- 예시 편차(참고): 벤치프레스 4세트 + 인클라인 덤벨프레스 3세트 + 체스트프레스 3세트 + 플라이 2세트.
  (모두 3세트로 통일하지 말 것. items[0] 은 반드시 4세트.)
- 각 세트의 reps 와 rpeTarget 은 **개별 값** 으로 지정 — 모든 세트 동일 금지.
  일반 패턴 중 하나 이상 적용:
  · 피라미드(무게 증가형): 첫 세트 reps 많고 RPE 낮음 → 마지막 세트 reps 적고 RPE 높음.
    예: [{reps:12,rpeTarget:7},{reps:10,rpeTarget:8},{reps:8,rpeTarget:9}]
  · Top-set + Back-off: 첫 세트 최고 강도(RPE 9) → 이후 2 세트 백오프(RPE 7~8, reps ↑).
    예: [{reps:5,rpeTarget:9},{reps:8,rpeTarget:7},{reps:8,rpeTarget:7}]
  · 스트레이트(같은 reps, RPE 점증): RPE 만 +1 씩 (7→8→9) — 워밍업 후 본세트용.
- 목표(${preset?.goal || 'hypertrophy'})에 따라 rep 범위 차등:
  · strength / 근력 : 주 컴파운드 **3~6 reps**, 보조 6~10.
  · hypertrophy / 근비대 (기본): 컴파운드 **6~10**, 고립 **8~12**.
  · endurance / 근지구력 : 전반 **12~20 reps**, RPE 6~8.5.
- restSec: 컴파운드 120~180, 고립 60~90.
- 후보당 items 4~7개, 총 소요 ≈ ${sessionMinutes}분.
- movementId는 카탈로그(${(movements||[]).map(m=>m.id).slice(0,60).join(',')}).
- rpeTarget은 5~10 범위, reps 는 3~20 범위 내에서만.

JSON 스키마 (sets 는 반드시 2개 이상 · 각 세트 reps/rpeTarget 개별 지정):
{"candidates":[{
  "candidateKey":"A",
  "candidateTag":"A · 균형 보완 ⭐",
  "title":"등 넓이 빌더",
  "sessionMinutes": ${sessionMinutes||60},
  "rationale":"한 문단(HTML <b>허용)",
  "items":[
    {"exerciseId":"...","movementType":"compound","sets":[
      {"reps":10,"rpeTarget":7},{"reps":8,"rpeTarget":8},{"reps":6,"rpeTarget":9}
    ],"restSec":150},
    {"exerciseId":"...","movementType":"isolation","sets":[
      {"reps":12,"rpeTarget":7},{"reps":10,"rpeTarget":8}
    ],"restSec":75}
  ]
},{
  "candidateKey":"B",
  "candidateTag":"B · 고강도 도전 💪",
  "title":"가슴 Top-set PR",
  "sessionMinutes": ${sessionMinutes||60},
  "rationale":"지난 top N kg → 오늘 +2.5kg 시도 (HTML <b>허용)",
  "items":[ /* 컴파운드 중심 · 저렙 고RPE */ ]
}]}
JSON만 출력.`;
  // 라우터 사용: Gemini 실패 시 Groq로 자동 전환. 에러는 swallow하지 않고 정규화된 형태로 throw
  // → 호출부(expert.js:routineSuggestGenerate)의 catch가 quota 전용 UI를 띄울 수 있음.
  try {
    const { data: r, provider } = await _callLLMJSON([{ text: prompt }], {
      maxTokens: 4096,
      onProviderSwitch,
    });
    console.log(`[generateRoutineCandidates] provider=${provider} raw:`, r);
    const candidates = Array.isArray(r?.candidates) ? r.candidates.slice(0, 2) : [];
    if (candidates.length === 0) {
      const err = new Error('AI가 후보를 반환하지 않음');
      err.code = 'NO_CANDIDATES';
      err.provider = provider;
      throw err;
    }
    return candidates;
  } catch (e) {
    // 이미 정규화된 에러(QUOTA_EXCEEDED, PROVIDER_ALL_FAIL 등)는 그대로 전파.
    // 그 외(네트워크, 스키마 등)는 명시적으로 마킹 후 throw.
    if (e?.code) {
      console.error('[generateRoutineCandidates] routed error:', e.code, e.message);
      throw e;
    }
    console.error('[generateRoutineCandidates] unknown error:', e);
    const err = new Error(e?.message || '루틴 생성 실패');
    err.code = 'UNKNOWN';
    err.cause = e;
    throw err;
  }
}

// ── 목표 실현가능성 분석 ─────────────────────────────────────────
export async function analyzeGoalFeasibility(goal) {
  const today    = new Date();
  const ddayDate = goal.dday ? new Date(goal.dday) : null;
  const daysLeft = ddayDate ? Math.ceil((ddayDate - today) / 86400000) : null;

  let workoutDays=0, dietOkDays=0;
  for (let i=0; i<30; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate()-i);
    const y=d.getFullYear(), m=d.getMonth(), dd=d.getDate();
    if (hasExerciseRecord(y,m,dd)) workoutDays++;
    if (dietDayOk(y,m,dd) === true) dietOkDays++;
  }
  const workoutRate = Math.round((workoutDays / 30) * 100);
  const dietRate    = Math.round((dietOkDays  / 30) * 100);

  const conditionStr = goal.condition
    ? `사용자 설정 조건: 주 ${goal.condition.workoutPerWeek}회 운동, 식단OK ${goal.condition.dietOkPct}% 달성`
    : '(조건 미설정 — 목표 이름에서 추론하여 판단)';

  const prompt = `헬스 트레이너 겸 목표 달성 코치로서 분석하세요.
사용자 목표: "${goal.label}"
D-day: ${daysLeft !== null ? `${daysLeft}일 후 (${goal.dday})` : '날짜 미설정'}
${conditionStr}
최근 30일: 운동 ${workoutRate}%(${workoutDays}/30일), 식단OK ${dietRate}%(${dietOkDays}/30일)

JSON 형식: {"feasibility":72,"realisticDate":"2025-09-15","summary":"2~3문장 분석"}
feasibility: 0-100, realisticDate: YYYY-MM-DD, summary: 간결한 분석`;

  // 2026-04-20: wrapper unwrap. 이전 반환은 { data:{feasibility,...}, provider }.
  //   app-modal-goals.js:62 에서 goal.aiAnalysis 로 저장 → 홈 goal 카드가 feasibility
  //   읽으면 undefined. "분석해도 결과가 안 보이는" 회귀의 직접 원인.
  const { data } = await _callGeminiJSON([{ text: prompt }], 400);
  return data;
}
