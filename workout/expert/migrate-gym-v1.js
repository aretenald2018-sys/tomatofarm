// ================================================================
// workout/expert/migrate-gym-v1.js
// 1회성 마이그레이션 — 김태우(문정토마토) 계정 운동 종목을
// 두 헬스장(헬스보이 문정점 / 강남점)으로 재배치.
//
// 분류 규칙:
//   - lower(primary='lower': quad/hamstring/calf) → 헬스보이 강남점
//   - 그 외 전부(chest/back/shoulder/bicep/tricep/abs + glute) → 헬스보이 문정점
//
// 호출:
//   await window.__migrateGymV1('dry-run')  // 영향 분석만 (쓰기 없음)
//   await window.__migrateGymV1('apply')    // 실제 실행 + window.__migrationBackup 저장
//   await window.__migrationRollback()       // 백업으로 원복
//
// 계약:
//   - saveExercise() 호출 시 muscleIds 를 [record.muscleId] 같은 대분류로
//     덮지 않는다. 기존 muscleIds 배열을 그대로 넘기면 saveExercise 내부의
//     _deriveLegacyMuscleIds 가 빈 배열일 때만 movementId→[subPattern] 보강.
//     (data.js:144-148 명시 계약: muscleIds 원소는 subPattern 만 허용)
//   - for...of await 순차 실행 (병렬 Promise.all 금지 — _exList 캐시 race)
// ================================================================

import {
  saveExercise,
  saveGym, getGyms, deleteGym,
  getExList, getGymExList,
  getExpertPreset, saveExpertPreset,
  getRoutineTemplates, saveRoutineTemplate,
} from '../../data.js';
import { MOVEMENTS } from '../../config.js';
import { SUBPATTERN_TO_MAJOR } from '../../calc.js';

const MUJEONG_NAME = '헬스보이 문정점';
const GANGNAM_NAME = '헬스보이 강남점';

// ── 분류: 종목 → 대상 gym 이름 + 근거 ──────────────────────
// 우선순위: movementId → muscleIds[0] (subPattern) → legacy muscleId → unresolved
function _classify(ex) {
  // 1차: movementId → MOVEMENTS.primary
  if (ex.movementId && ex.movementId !== 'unknown') {
    const mv = MOVEMENTS.find(m => m.id === ex.movementId);
    if (mv?.primary) {
      return {
        target: mv.primary === 'lower' ? 'gangnam' : 'mujeong',
        reason: `movementId=${ex.movementId} primary=${mv.primary}`,
        unresolved: false,
      };
    }
  }
  // 2차: muscleIds[0] → SUBPATTERN_TO_MAJOR
  if (Array.isArray(ex.muscleIds) && ex.muscleIds.length > 0) {
    const sub = ex.muscleIds[0];
    const major = SUBPATTERN_TO_MAJOR[sub];
    if (major) {
      return {
        target: major === 'lower' ? 'gangnam' : 'mujeong',
        reason: `muscleIds[0]=${sub} → major=${major}`,
        unresolved: false,
      };
    }
  }
  // 3차: legacy muscleId — major 또는 subPattern 둘 다 가능 (저장 경로에 따라).
  // workout/expert.js:1392 처럼 `mov?.primary || p.muscleIds[0]` 로 저장하면
  // muscleId 에 'quad'/'chest_mid' 같은 subPattern 이 들어감. ai/routine.js:66-69
  // 와 동일하게 SUBPATTERN_TO_MAJOR 로 먼저 정규화 후 major 판정.
  if (ex.muscleId) {
    const normalized = SUBPATTERN_TO_MAJOR[ex.muscleId] || ex.muscleId;
    return {
      target: normalized === 'lower' ? 'gangnam' : 'mujeong',
      reason: `legacy muscleId=${ex.muscleId} → major=${normalized}`,
      unresolved: false,
    };
  }
  // 4차: unresolved — apply 에서 기본 제외됨 (opts.includeUnresolved=true 시 문정점).
  // target 은 opt-in 되었을 때만 쓰이는 fallback. unresolved 플래그가 실제 판단 기준.
  return {
    target: 'mujeong',
    reason: 'unresolved (movementId/muscleIds/muscleId 모두 비어있음) — apply 기본 제외',
    unresolved: true,
  };
}

// ── 헬스장 dedupe: 동일 이름 gym 이 여러 개면 canonical(종목 많은 것, 동률 시
// 가장 오래된 것) 로 통합. 나머지 gym 의 종목을 canonical 로 이동 후 해당 gym 삭제.
// 반환: { canonicalId, consolidatedCount, deletedGymIds }
async function _dedupeByName(name) {
  const matches = getGyms().filter(g => g.name === name);
  if (matches.length <= 1) {
    return { canonicalId: matches[0]?.id || null, consolidatedCount: 0, deletedGymIds: [] };
  }
  // canonical 선정: 종목 수 max → createdAt min
  const scored = matches.map(g => ({
    g,
    exCount: getGymExList(g.id).length,
    createdAt: g.createdAt || 0,
  }));
  scored.sort((a, b) => (b.exCount - a.exCount) || (a.createdAt - b.createdAt));
  const canonical = scored[0].g;
  const dups = scored.slice(1).map(s => s.g);

  let consolidatedCount = 0;
  const deletedGymIds = [];
  for (const d of dups) {
    const exs = getGymExList(d.id);
    // 각 종목을 canonical gym 으로 이동 (silent failure 탐지)
    for (const ex of exs) {
      await saveExercise({ ...ex, gymId: canonical.id });
      const updated = getExList().find(e => e.id === ex.id);
      if (updated?.gymId === canonical.id) consolidatedCount++;
      else console.warn(`  dedupe 이동 실패 (silent): ${ex.name}`);
    }
    // 이동 후 종목 0개면 gym 삭제
    const remaining = getGymExList(d.id).length;
    if (remaining === 0) {
      try {
        await deleteGym(d.id);
        deletedGymIds.push(d.id);
      } catch (e) { console.warn(`  gym 삭제 실패: ${d.id}`, e); }
    } else {
      console.warn(`  ${d.id} 이동 안 된 종목 ${remaining}건 — gym 삭제 스킵`);
    }
  }
  return { canonicalId: canonical.id, consolidatedCount, deletedGymIds };
}

// ── 헬스장 보장: dedupe → 없으면 생성, id 반환 ──────────────
async function _ensureGym(name) {
  // 1) 동일 이름 중복 gym 정리 (D in CRUD)
  const { canonicalId, consolidatedCount, deletedGymIds } = await _dedupeByName(name);
  if (deletedGymIds.length > 0) {
    console.log(`  [dedupe:${name}] ${consolidatedCount}건 이동, gym ${deletedGymIds.length}개 삭제`);
  }
  if (canonicalId) return { id: canonicalId, created: false };
  // 2) 없으면 신규 생성
  const rec = await saveGym({ name, location: '', notes: '' });
  // silent failure 탐지 (saveGym 도 _fbOp rethrow:false)
  if (!rec?.id) {
    throw new Error(`saveGym silent fail — '${name}' 생성 결과 없음. 콘솔 상단 [data] saveGym: 로그 확인`);
  }
  return { id: rec.id, created: true };
}

// ── dry-run 보고서 생성 ─────────────────────────────────────
function _buildReport(classifications, mujeongId, gangnamId) {
  const byTarget = { mujeong: [], gangnam: [] };
  const unresolved = [];
  const noChange = [];
  for (const c of classifications) {
    byTarget[c.target].push(c);
    if (c.unresolved) unresolved.push(c);
    const currentGymId = c.ex.gymId || null;
    const targetId = c.target === 'mujeong' ? mujeongId : gangnamId;
    if (currentGymId === targetId) noChange.push(c);
  }
  return {
    totalExercises: classifications.length,
    mujeongCount: byTarget.mujeong.length,
    gangnamCount: byTarget.gangnam.length,
    unresolvedCount: unresolved.length,
    noChangeCount: noChange.length,
    willChangeCount: classifications.length - noChange.length,
    unresolved,
  };
}

function _printTable(classifications, mujeongId, gangnamId) {
  const rows = classifications.map(c => ({
    id: c.ex.id.slice(0, 8),
    name: c.ex.name,
    beforeGymId: (c.ex.gymId || 'null').slice(0, 8),
    // unresolved 는 기본 제외 — afterGym 에 "[제외]" 명시. includeUnresolved 시만 실제 라우팅.
    afterGym: c.unresolved
      ? '[제외]'
      : (c.target === 'mujeong' ? '문정점' : '강남점'),
    afterGymId: c.unresolved
      ? '-'
      : (c.target === 'mujeong' ? mujeongId : gangnamId).slice(0, 8),
    movementId: c.ex.movementId || '(none)',
    muscleIds: (c.ex.muscleIds || []).join(',') || '(empty)',
    muscleId: c.ex.muscleId || '(none)',
    reason: c.reason,
    unresolved: c.unresolved ? '⚠' : '',
  }));
  console.table(rows);
}

// ── main: dry-run | apply ────────────────────────────────────
// opts.includeUnresolved: apply 시 unresolved 항목도 포함. 기본 false (제외).
// opts.force: 중간 실패 후 재실행 시 진행 경고 스킵.
export async function run(mode = 'dry-run', opts = {}) {
  if (!['dry-run', 'apply'].includes(mode)) {
    console.error('[migrate-gym-v1] mode 는 "dry-run" 또는 "apply" 만 허용');
    return { ok: false, error: 'invalid mode' };
  }
  const includeUnresolved = !!opts.includeUnresolved;

  console.group(`[migrate-gym-v1] mode=${mode} includeUnresolved=${includeUnresolved}`);

  // ── Step 0: 백업 스냅샷 ─────────────────────────────────
  const exListSnapshot = getExList().map(e => ({ ...e }));  // shallow copy per record
  const gymsSnapshot = getGyms().map(g => ({ ...g }));
  const presetSnapshot = { ...getExpertPreset() };
  // routine_templates 는 gymId 필드를 가짐 (data-workout-equipment.js:88).
  // 마이그레이션은 템플릿을 직접 변경하지 않지만, 템플릿이 구 gymId 를 참조할 경우
  // apply 후 재사용 시 dangling 유발 가능. 롤백 완전성을 위해 백업.
  const templatesSnapshot = getRoutineTemplates().map(t => ({ ...t }));
  const backup = {
    timestamp: new Date().toISOString(),
    exercises: exListSnapshot,
    gyms: gymsSnapshot,
    expertPreset: presetSnapshot,
    routineTemplates: templatesSnapshot,
  };
  console.log('backup snapshot: exercises', exListSnapshot.length, 'gyms', gymsSnapshot.length, 'templates', templatesSnapshot.length);

  // ── Step 1: 두 gym 보장 ──────────────────────────────
  // apply 모드의 경우 rollback 훅을 **saveGym 호출 이전** 에 먼저 설치.
  // 이전 구현은 _ensureGym(문정) 성공 + _ensureGym(강남) 실패 같은 상황에서
  // DB 는 이미 부분 변경됐는데 rollback 훅이 없는 위험이 있었다.
  // 해결: 가변 context 객체를 공유해서 _ensureGym 가 값을 채워나가고,
  // rollback 함수는 호출 시점의 ctx 를 읽어 현재 상태를 반영하도록 함.
  const existingMujeong = gymsSnapshot.find(g => g.name === MUJEONG_NAME);
  const existingGangnam = gymsSnapshot.find(g => g.name === GANGNAM_NAME);
  const applyCtx = {
    createdMujeong: false,
    createdGangnam: false,
    mujeongId: existingMujeong?.id || null,
    gangnamId: existingGangnam?.id || null,
  };

  if (mode === 'apply') {
    // rollback 훅을 가장 먼저 설치 — 이 시점부터 모든 쓰기에 대해 원복 가능.
    window.__migrationBackup = backup;
    window.__migrationRollback = () => _rollback(backup, applyCtx);
    console.log('\n백업 + rollback 훅 조기 설치 완료. 비상: await window.__migrationRollback()');
    console.log('raw 백업: copy(JSON.stringify(window.__migrationBackup)) 로 메모장에 보존 권장');

    try {
      const m = await _ensureGym(MUJEONG_NAME);
      applyCtx.mujeongId = m.id;
      applyCtx.createdMujeong = m.created;
      const g = await _ensureGym(GANGNAM_NAME);
      applyCtx.gangnamId = g.id;
      applyCtx.createdGangnam = g.created;
    } catch (e) {
      console.error('[Step 1] gym 보장 실패. rollback: await window.__migrationRollback()', e);
      console.groupEnd();
      throw e;
    }
  } else {
    // dry-run: 가상 id 로 분류 표시. 기존 gym 있으면 그 id 사용
    applyCtx.mujeongId = existingMujeong?.id || '(신규-문정점)';
    applyCtx.gangnamId = existingGangnam?.id || '(신규-강남점)';
  }
  const mujeongId = applyCtx.mujeongId;
  const gangnamId = applyCtx.gangnamId;
  console.log('mujeongId:', mujeongId, '(created:', applyCtx.createdMujeong, ')');
  console.log('gangnamId:', gangnamId, '(created:', applyCtx.createdGangnam, ')');

  // ── Step 2: 분류 ─────────────────────────────────────
  const classifications = exListSnapshot.map(ex => ({
    ex,
    ..._classify(ex),
  }));

  const report = _buildReport(classifications, mujeongId, gangnamId);
  console.log('보고서:', report);
  if (report.unresolvedCount > 0) {
    console.warn(`⚠ unresolved ${report.unresolvedCount}건 — apply 시 기본 **제외**됨.`);
    console.warn('   이들도 문정점으로 저장하려면:  await window.__migrateGymV1("apply", { includeUnresolved: true })');
    console.warn('   아래 표에서 ⚠ 마크 확인:');
  }
  _printTable(classifications, mujeongId, gangnamId);

  if (mode === 'dry-run') {
    // pre-existing muscleIds 오염 탐지: 대분류(chest/back/lower/shoulder/glute/bicep/tricep/abs)
    // 가 muscleIds 에 섞여있는 레코드는 saveExercise 의 filter(Boolean) 로 유지되며
    // downstream 집계 오작동 가능. 마이그레이션이 악화시키진 않지만 기회주의적 정리 대상.
    const MAJORS = new Set(['chest','back','lower','shoulder','glute','bicep','tricep','abs']);
    const contaminated = exListSnapshot.filter(e =>
      Array.isArray(e.muscleIds) && e.muscleIds.some(m => MAJORS.has(m))
    );
    if (contaminated.length > 0) {
      console.warn(`\n⚠ muscleIds 대분류 오염 의심 ${contaminated.length}건 (Phase B 정리 후보 — 이번 마이그레이션이 건드리지 않음):`);
      console.table(contaminated.map(e => ({ id: e.id.slice(0,8), name: e.name, muscleIds: (e.muscleIds||[]).join(',') })));
    }
    console.log('\n=== DRY-RUN 완료 ===');
    console.log('⚠ apply 전 권장: (1) 운동탭에 있다면 진행 중 세션 저장/종료  (2) 다른 기기 로그아웃');
    console.log('실제 적용하려면: await window.__migrateGymV1("apply")');
    console.groupEnd();
    return { ok: true, mode, report, backup, classifications, contaminated };
  }

  // ── Step 3: apply ────────────────────────────────────
  console.log('\n=== APPLY exercises 시작 ===');
  // rollback 훅은 Step 1 에서 조기 설치됨. 여기서 재설치하지 않음.

  // 3b) unresolved 기본 제외 — 자동 저장은 위험. opt-in 으로 포함 가능.
  const toApply = classifications.filter(c => {
    if (c.unresolved && !includeUnresolved) return false;
    return true;
  });
  const excludedUnresolved = classifications.length - toApply.length;
  if (excludedUnresolved > 0) {
    console.warn(`unresolved ${excludedUnresolved}건 apply 제외. 포함하려면:`);
    console.warn('  await window.__migrateGymV1("apply", { includeUnresolved: true })');
  }

  // 3c) 순차 saveExercise + **post-call 캐시 검증**
  // saveExercise 는 내부 _fbOp 가 rethrow:false 로 에러를 삼킨다(data-core.js:254-267).
  // 따라서 setDoc 실패 시 saveExercise 는 undefined 반환하고 catch 도 안 걸린다.
  // 대응: 호출 후 _exList 캐시의 해당 record 가 실제로 새 gymId 로 업데이트됐는지
  // 읽어서 검증. 업데이트 안 됐으면 silent failure 로 간주하고 failed 로 카운트.
  let done = 0, skipped = 0, failed = 0;
  const errors = [];
  for (const c of toApply) {
    const targetId = c.target === 'mujeong' ? mujeongId : gangnamId;
    if (c.ex.gymId === targetId) { skipped++; continue; }
    try {
      await saveExercise({ ...c.ex, gymId: targetId });
      // post-call 검증: _exList 캐시가 실제로 새 gymId 로 업데이트됐는지
      const updated = getExList().find(e => e.id === c.ex.id);
      if (!updated) {
        throw new Error('saveExercise silent fail — _exList 에 레코드 없음');
      }
      if (updated.gymId !== targetId) {
        throw new Error(`saveExercise silent fail — cache gymId=${updated.gymId} (expected ${targetId})`);
      }
      done++;
      if (done % 10 === 0) console.log(`  진행 ${done}/${toApply.length - skipped}...`);
    } catch (e) {
      failed++;
      errors.push({ id: c.ex.id, name: c.ex.name, error: e?.message || String(e) });
      console.warn(`  실패: ${c.ex.name}`, e?.message || e);
    }
  }
  console.log(`Step 3 완료: done=${done}, skipped=${skipped}, failed=${failed}, unresolved제외=${excludedUnresolved}`);
  if (errors.length) {
    console.error('errors:', errors);
    console.error('⚠ silent failure 가능성 — _fbOp 래퍼가 rethrow:false 라 원 에러는 console 상단의 "[data] saveExercise:" 로그 확인');
  }

  // 3d) Firestore 왕복 검증 — loadAll 재호출로 DB 현재 상태 재페치
  // 로컬 캐시(_exList) 만으로는 setDoc 성공 여부를 100% 보장 못함. Firestore 에서
  // 다시 읽어와서 gymId 분포가 의도대로인지 확인.
  if (done > 0 || failed > 0) {
    try {
      console.log('[3d] Firestore 재페치 검증 중...');
      const { loadAll } = await import('../../data.js');
      await loadAll();
      const mujeongCount = getGymExList(mujeongId).length;
      const gangnamCount = getGymExList(gangnamId).length;
      const nullCount = getExList().filter(e => !e.gymId).length;
      const otherCount = getExList().filter(e => e.gymId && e.gymId !== mujeongId && e.gymId !== gangnamId).length;
      console.log(`[3d] Firestore 재페치 후 분포:`, { mujeongCount, gangnamCount, nullCount, otherCount, total: getExList().length });
      if (mujeongCount === 0 && gangnamCount === 0 && done > 0) {
        console.error('⚠ CRITICAL: done>0 인데 재페치 후 새 gym 에 0건 — setDoc 이 Firestore 에 쓰지 못했을 가능성. Firestore 규칙 / 인증 확인 필요.');
      }
    } catch (e) {
      console.warn('[3d] 재페치 검증 실패:', e?.message || e);
    }
  }

  // ── Step 4: expert_preset.currentGymId + 세션 S 양쪽 동기화 ─────
  // 기존 currentGymId 가 비게 된 구 gym 을 가리킬 수 있음 (resolveCurrentGymId 는
  // 존재하는 empty gym 을 자동 교정하지 않음). 문정점으로 강제.
  // 또한 apply 실행 시점에 유저가 운동탭에 있으면 S.workout.currentGymId 가 stale →
  // 다음 saveWorkoutDay (workout/save.js:101) 가 day.gymId 를 구 값으로 박을 수 있음.
  // preset + S 양쪽 모두 동기화.
  await saveExpertPreset({ currentGymId: mujeongId, draftGymId: null });
  try {
    const { S } = await import('../state.js');
    S.workout.currentGymId = mujeongId;
  } catch (e) {
    console.warn('S.workout.currentGymId 동기화 실패 (세션 미로드 상태일 수 있음):', e?.message || e);
  }
  console.log(`expert_preset.currentGymId → 문정점(${mujeongId.slice(0,8)}), draftGymId → null, S 세션 동기화됨`);

  // ── Step 5: 비게 된 구 gym 리스트 출력 ───────────────
  const emptyGyms = getGyms().filter(g => {
    if (g.id === mujeongId || g.id === gangnamId) return false;
    return getGymExList(g.id).length === 0;
  });
  if (emptyGyms.length > 0) {
    console.warn(`\n⚠ 종목 0개 남은 구 gym ${emptyGyms.length}곳 — 자동 삭제 시도:`);
    for (const g of emptyGyms) {
      try {
        await deleteGym(g.id);
        console.log(`  삭제 완료: ${g.name} (${g.id.slice(0,8)})`);
      } catch (e) {
        console.warn(`  삭제 실패: ${g.name}`, e?.message || e);
        console.warn(`  수동: await (await import("/data.js")).deleteGym("${g.id}")`);
      }
    }
  }

  // ── Step 5b: 구 gymId 참조 루틴 템플릿 경고 ─────────
  // 마이그레이션은 템플릿 gymId 를 건드리지 않음. 템플릿이 구 gymId 참조 상태로
  // 남아있으면 "최근 루틴으로 시작" 시 기구 목록 mismatch 가능.
  const validGymIds = new Set(getGyms().map(g => g.id));
  const templates = getRoutineTemplates();
  const danglingTemplates = templates.filter(t => t.gymId && !validGymIds.has(t.gymId));
  const orphanGymTemplates = templates.filter(t => {
    if (!t.gymId) return false;
    if (t.gymId === mujeongId || t.gymId === gangnamId) return false;
    return validGymIds.has(t.gymId);  // 존재하는 구 gym 참조
  });
  // item-level cross-gym 체크: template.gymId 와 실제 items[].exerciseId 의
  // 현 gymId 가 다른 경우. openRoutineSuggestWithRecent 는 getExList() 전체에서
  // 로드하므로 (expert.js:2272), 여기서 mixed load 가 일어나면 세션에 두 gym
  // 종목이 섞임. Step 5b 경고로 유저가 해당 템플릿 삭제 판단 가능.
  const exById = Object.fromEntries(getExList().map(e => [e.id, e]));
  const crossGymTemplates = [];
  for (const t of templates) {
    if (!Array.isArray(t.items) || t.items.length === 0) continue;
    const itemGymIds = new Set();
    const missingItems = [];
    for (const it of t.items) {
      const ex = exById[it.exerciseId];
      if (!ex) { missingItems.push(it.exerciseId); continue; }
      itemGymIds.add(ex.gymId || '__null__');
    }
    if (itemGymIds.size > 1 || (t.gymId && itemGymIds.size === 1 && !itemGymIds.has(t.gymId)) || missingItems.length > 0) {
      crossGymTemplates.push({
        id: t.id.slice(0,8),
        title: t.title,
        templateGymId: (t.gymId || 'null').slice(0,8),
        itemGymIds: [...itemGymIds].map(x => x === '__null__' ? 'null' : x.slice(0,8)).join(','),
        missingItems: missingItems.length,
      });
    }
  }
  if (danglingTemplates.length > 0 || orphanGymTemplates.length > 0 || crossGymTemplates.length > 0) {
    console.warn(`\n⚠ 루틴 템플릿 이슈 감지 — 재사용 시 세션에 mixed/missing 종목 로드 가능:`);
    if (danglingTemplates.length) {
      console.warn('  (a) dangling (gym 삭제됨):');
      console.table(danglingTemplates.map(t => ({ id: t.id.slice(0,8), title: t.title, gymId: t.gymId.slice(0,8) })));
    }
    if (orphanGymTemplates.length) {
      console.warn('  (b) 구 gym 참조:');
      console.table(orphanGymTemplates.map(t => ({ id: t.id.slice(0,8), title: t.title, gymId: t.gymId.slice(0,8) })));
    }
    if (crossGymTemplates.length) {
      console.warn('  (c) items[].exerciseId 가 여러 gym 혼재 또는 template.gymId 불일치:');
      console.table(crossGymTemplates);
    }
    console.warn('대응: deleteRoutineTemplate(id) 로 삭제 후 Expert 모드에서 새로 생성 권장');
  }

  // ── Step 5c: workouts 캐시의 orphan exerciseId 스캔 (pre-existing 탐지) ─
  // 마이그레이션이 유발하진 않지만 (exerciseId 는 안 건드림), 과거 삭제된 종목
  // 참조가 있으면 _buildRecentHistory 가 조용히 드롭 → 유저가 "과거 기록 왜 안뜨지?"
  // 혼란. apply 직후 한 번만 점검해서 목록 제공.
  try {
    const { getCache } = await import('../../data.js');
    const cache = getCache() || {};
    const allExIds = new Set(getExList().map(e => e.id));
    const orphanById = new Map();  // exerciseId → { count, dates:[...], lastDate }
    const past30Cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    for (const [dk, day] of Object.entries(cache)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
      if (dk < past30Cutoff) continue;
      for (const e of (day?.exercises || [])) {
        if (!e?.exerciseId) continue;
        if (allExIds.has(e.exerciseId)) continue;
        const rec = orphanById.get(e.exerciseId) || { exerciseId: e.exerciseId, count: 0, dates: [], lastDate: null };
        rec.count++;
        rec.dates.push(dk);
        if (!rec.lastDate || dk > rec.lastDate) rec.lastDate = dk;
        orphanById.set(e.exerciseId, rec);
      }
    }
    if (orphanById.size > 0) {
      console.warn(`\n⚠ 과거 30일 workouts 에 카탈로그 미존재 exerciseId ${orphanById.size}종 (pre-existing orphan — 마이그레이션 무관):`);
      console.table([...orphanById.values()].map(r => ({
        exerciseId: r.exerciseId.slice(0, 8),
        count: r.count,
        lastDate: r.lastDate,
      })));
      console.warn('이들은 AI 추천 히스토리에 포함되지 않음. 필요 시 같은 이름으로 재등록 후 과거 기록 수동 편집.');
    } else {
      console.log('orphan exerciseId: 없음 (과거 30일 기준)');
    }
  } catch (e) {
    console.warn('orphan 스캔 실패:', e?.message || e);
  }

  // ── Step 6: 완료 메시지 ──────────────────────────────
  // rollback 훅은 Step 3a 에서 이미 설치됨 — 여기서 재설치하지 않음.
  console.log('\n=== APPLY 완료 ===');
  console.log('원복: await window.__migrationRollback()');
  console.log('검증: Expert 모드 재진입 → 바텀시트에서 문정/강남 전환 → 루틴 추천 실행');
  console.groupEnd();

  // unresolved 미처리 건수가 있으면 ok:false — 1회성 마이그레이션의 완결성 기준.
  const fullyOk = failed === 0 && excludedUnresolved === 0;
  return {
    ok: fullyOk,
    mode,
    report,
    result: { done, skipped, failed, excludedUnresolved, errors },
    mujeongId, gangnamId,
    createdMujeong: applyCtx.createdMujeong,
    createdGangnam: applyCtx.createdGangnam,
    emptyGyms: emptyGyms.map(g => ({ id: g.id, name: g.name })),
  };
}

// ── standalone cleanup: 현재 중복 상태 정리 전용 (apply 없이 dedupe 만) ─────
// 유저가 이전 apply 에서 silent-fail 로 빈 gym 이 생긴 현 상태를 깨끗이 정리하는 용도.
// 동일 이름 gym 그룹 전부 dedupe. 추가로 이름 지정 시 해당 이름만 대상.
// 호출: await window.__migrationCleanupGyms()  또는  await window.__migrationCleanupGyms('헬스보이 강남점')
export async function cleanup(targetName = null) {
  console.group('[migrate-gym-v1] cleanup');
  const allGyms = getGyms();
  const byName = new Map();
  for (const g of allGyms) {
    const arr = byName.get(g.name) || [];
    arr.push(g);
    byName.set(g.name, arr);
  }
  const namesToDedupe = targetName
    ? [targetName]
    : [...byName.keys()].filter(n => byName.get(n).length > 1);

  if (namesToDedupe.length === 0) {
    console.log('dedupe 대상 없음 (동일 이름 gym 없음)');
    console.groupEnd();
    return { ok: true, deduped: [] };
  }

  console.log('dedupe 대상:', namesToDedupe);
  const results = [];
  for (const name of namesToDedupe) {
    console.log(`\n[${name}]`);
    try {
      const r = await _dedupeByName(name);
      console.log(`  canonical: ${r.canonicalId?.slice(0,8)} | 이동: ${r.consolidatedCount} | 삭제: ${r.deletedGymIds.length}`);
      results.push({ name, ...r });
    } catch (e) {
      console.warn(`  실패:`, e?.message || e);
      results.push({ name, error: e?.message || String(e) });
    }
  }
  console.log('\n=== CLEANUP 완료 ===');
  console.groupEnd();
  return { ok: results.every(r => !r.error), deduped: results };
}

// ── rollback: 백업 JSON 기반 원복 ────────────────────────────
async function _rollback(backup, ctx) {
  if (!backup?.exercises) {
    console.error('[rollback] 백업 없음');
    return { ok: false, error: 'no backup' };
  }
  console.group('[migrate-gym-v1] rollback');
  console.log('백업 시각:', backup.timestamp);

  // 모든 R1~R5 단계의 실패를 집계. 단 하나라도 실패하면 ok:false.
  // 이전 구현은 exercise 복원 실패(R1)만 ok 판정에 반영했고 R2~R5 실패는 경고만
  // 출력 → 운영자가 "rollback 성공"으로 오판 가능했음. 이제 단계별 카운터를
  // 누적하고, 반환값에 per-step 결과도 같이 넘겨 오류 위치 추적 용이하게.
  const stats = {
    exercisesRestored: 0, exercisesFailed: 0,
    gymDeletionFailed: 0,
    presetRestoreFailed: 0,
    templatesRestored: 0, templatesFailed: 0,
    sessionSyncFailed: 0,
  };

  // Step R1: 종목 전원 원복 (for...of await)
  for (const ex of backup.exercises) {
    try { await saveExercise({ ...ex }); stats.exercisesRestored++; }
    catch (e) { stats.exercisesFailed++; console.warn('  복원 실패:', ex.name, e); }
  }
  console.log(`종목 복원: done=${stats.exercisesRestored}, failed=${stats.exercisesFailed}`);

  // Step R2: 이번 실행에서 신규 생성된 gym 삭제 (원래 있던 건 유지)
  if (ctx?.createdMujeong && ctx.mujeongId) {
    try { await deleteGym(ctx.mujeongId); console.log('신규 생성 문정점 삭제:', ctx.mujeongId); }
    catch (e) { stats.gymDeletionFailed++; console.warn('문정점 삭제 실패:', e); }
  }
  if (ctx?.createdGangnam && ctx.gangnamId) {
    try { await deleteGym(ctx.gangnamId); console.log('신규 생성 강남점 삭제:', ctx.gangnamId); }
    catch (e) { stats.gymDeletionFailed++; console.warn('강남점 삭제 실패:', e); }
  }

  // Step R3: expert_preset 복원
  try {
    await saveExpertPreset(backup.expertPreset);
    console.log('expert_preset 복원 완료');
  } catch (e) {
    stats.presetRestoreFailed++;
    console.warn('expert_preset 복원 실패:', e);
  }

  // Step R4: routine_templates 복원 (순차 saveRoutineTemplate)
  if (Array.isArray(backup.routineTemplates)) {
    for (const t of backup.routineTemplates) {
      try { await saveRoutineTemplate({ ...t }); stats.templatesRestored++; }
      catch (e) { stats.templatesFailed++; console.warn('  템플릿 복원 실패:', t.title, e); }
    }
    console.log(`routine_templates 복원: done=${stats.templatesRestored}, failed=${stats.templatesFailed}`);
  }

  // Step R5: 세션 S.workout.currentGymId 를 백업 시점 값으로 되돌림.
  // apply 에서는 S 를 mujeongId 로 덮어쓰므로, rollback 에서도 반대 방향 동기화
  // 필요. 안 하면 유저가 운동탭 열어둔 채 rollback 할 경우 다음 save 가 stale
  // currentGymId 로 day.gymId 기록(workout/save.js:101).
  // 주의: 세션 미로드(운동탭 미진입) 상태면 state.js 로드는 되지만 S.workout 은
  //   초기값이라 덮어써도 무해. dynamic import 실패만 failure 로 카운트.
  try {
    const { S } = await import('../state.js');
    S.workout.currentGymId = backup.expertPreset?.currentGymId || null;
    console.log('S.workout.currentGymId 복원 →', S.workout.currentGymId);
  } catch (e) {
    stats.sessionSyncFailed++;
    console.warn('S.workout.currentGymId 복원 실패:', e?.message || e);
  }

  const ok = stats.exercisesFailed === 0
    && stats.gymDeletionFailed === 0
    && stats.presetRestoreFailed === 0
    && stats.templatesFailed === 0
    && stats.sessionSyncFailed === 0;
  if (!ok) {
    console.error('⚠ ROLLBACK 부분 실패. 재시도 또는 수동 복구 필요:', stats);
  }
  console.log(ok ? '=== ROLLBACK 완료 (전원 성공) ===' : '=== ROLLBACK 부분 완료 ===');
  console.groupEnd();
  return { ok, stats };
}
