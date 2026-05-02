// ================================================================
// render-stats.js
// 의존성: config.js, data.js
// 변경: 13번 CSV 내보내기 추가
// ================================================================

import { MONTHS, MOVEMENTS }                         from './config.js';
import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         daysInMonth, isFuture, getExList, getAllMuscles,
         getVolumeHistory, getCache, calcVolume, getExpertPreset,
         getExercises, dateKey, getBodyCheckins,
         hasExerciseRecord }    from './data.js';
import { SUBPATTERN_TO_MAJOR }                       from './calc.js';

let _period             = 30;
let _selectedExerciseId = null;

export function setPeriod(days, btn) {
  _period = days;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _renderMusclePeriod();
}

let _checkinChart = null;

export function renderStats() {
  _bindStatsViewTabs();
  _renderMuscle14d();
  _renderMusclePeriod();
  _renderVolumeSection();
  _renderDietStats();
  _renderMonthlySummary();
  _renderHeatmap();
  _renderCheckinChart();
  _renderDeepStats();
}

function _bindStatsViewTabs() {
  document.querySelectorAll('.stats-view-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => switchStatsView(btn.dataset.statsView || 'overall', btn));
  });
}

export function switchStatsView(view = 'overall', btn = null) {
  const next = view === 'deep' ? 'deep' : 'overall';
  document.querySelectorAll('.stats-view-btn').forEach(b => b.classList.toggle('active', b === btn || b.dataset.statsView === next));
  document.getElementById('stats-overall-panel')?.classList.toggle('active', next === 'overall');
  document.getElementById('stats-deep-panel')?.classList.toggle('active', next === 'deep');
  if (next === 'deep') _renderDeepStats();
}

if (typeof window !== 'undefined') window.switchStatsView = switchStatsView;

function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function _keyOffset(daysAgo) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}
function _dayKcal(day) { return (day?.bKcal||0)+(day?.lKcal||0)+(day?.dKcal||0)+(day?.sKcal||0); }
function _dayProtein(day) { return (day?.bProtein||0)+(day?.lProtein||0)+(day?.dProtein||0)+(day?.sProtein||0); }
const MAJOR_LABELS = { chest:'가슴', back:'등', lower:'하체', shoulder:'어깨', bicep:'이두', tricep:'삼두', abs:'복근', core:'복근' };
const LANDMARKS = {
  chest: { label:'가슴', low:8, good:14, high:22 },
  back: { label:'등', low:10, good:16, high:25 },
  lower: { label:'하체', low:8, good:14, high:20 },
  shoulder: { label:'어깨', low:6, good:14, high:22 },
  bicep: { label:'이두', low:6, good:12, high:20 },
  tricep: { label:'삼두', low:6, good:14, high:18 },
  abs: { label:'복근', low:0, good:12, high:25 },
};
const PHASE_LABELS = { ACCUMULATION:'쌓는 구간', DELOAD:'회복 구간', RESET:'재정렬 구간' };
function _setsBand(sets, lm) {
  if (sets < lm.low) return { tone:'under', label:'부족', msg:`주 ${lm.low - sets}세트만 더` };
  if (sets > lm.high) return { tone:'over', label:'많음', msg:'회복 확인' };
  return { tone:'ok', label: sets >= lm.good ? '충분' : '적정', msg:'유지 가능' };
}
function _progressView(e) {
  const count = e.pointsCount || 0;
  const deltaKg = e.last - e.first;
  const deltaPct = e.first ? (deltaKg / e.first * 100) : 0;
  const name = String(e.name || '').toLowerCase();
  const likelyAccessory = e.major === 'abs' || /crunch|크런치|curl|컬|raise|레이즈|extension|익스텐션|pushdown|푸시다운/.test(name);
  const suspicious = Math.abs(deltaPct) >= 60 && (count < 4 || likelyAccessory || e.first < 25);
  const reliablePct = count >= 3 && !suspicious && Math.abs(deltaPct) < 60;
  const main = suspicious ? '기록 점검 필요' : (deltaKg >= 0 ? `+${deltaKg.toFixed(1)}kg` : `${deltaKg.toFixed(1)}kg`);
  const sub = suspicious
    ? `변화폭 ${Math.round(deltaPct)}% · 표본 ${count}회`
    : `${e.slope>=0?'+':''}${e.slope.toFixed(1)}kg/주${reliablePct ? ` · ${deltaPct>=0?'+':''}${Math.round(deltaPct)}%` : ` · 표본 ${count}회`}`;
  return { suspicious, main, sub };
}
function _entryMajor(entry, exById, movById) {
  const ex = exById.get(entry?.exerciseId);
  const sp = Array.isArray(entry?.muscleIds) && entry.muscleIds[0]
    ? entry.muscleIds[0]
    : (Array.isArray(ex?.muscleIds) && ex.muscleIds[0] ? ex.muscleIds[0] : null);
  if (sp && SUBPATTERN_TO_MAJOR[sp]) return SUBPATTERN_TO_MAJOR[sp];
  const mov = movById.get(entry?.movementId || ex?.movementId);
  if (mov?.primary) return mov.primary;
  return entry?.muscleId || ex?.muscleId || 'etc';
}
function _setE1rm(set) {
  const kg = Number(set?.kg) || 0, reps = Number(set?.reps) || 0;
  if (kg <= 0 || reps <= 0) return 0;
  return kg * (1 + Math.min(reps, 30) / 30);
}
function _isHardSet(set) {
  if (!set || set.setType === 'warmup' || set.done === false) return false;
  if (!((Number(set.kg)||0) > 0 && (Number(set.reps)||0) > 0)) return false;
  const rpe = Number(set.rpe);
  if (Number.isFinite(rpe) && rpe > 0) return rpe >= 7;
  return Number(set.reps) >= 5;
}
function _topSetE1rm(entry) {
  let best = 0;
  for (const set of entry?.sets || []) {
    if (!_isHardSet(set)) continue;
    best = Math.max(best, _setE1rm(set));
  }
  return best;
}
function _linearSlope(points) {
  const pts = points.filter(p => Number.isFinite(p.y));
  if (pts.length < 2) return 0;
  const n = pts.length, sx = pts.reduce((s,p)=>s+p.x,0), sy = pts.reduce((s,p)=>s+p.y,0);
  const sxx = pts.reduce((s,p)=>s+p.x*p.x,0), sxy = pts.reduce((s,p)=>s+p.x*p.y,0);
  const den = n*sxx - sx*sx;
  return den ? (n*sxy - sx*sy) / den : 0;
}
function _analyzeTrainerWindow(fromKey, toKey) {
  const cache = getCache();
  const exList = getExList();
  const exById = new Map(exList.map(e => [e.id, e]));
  const movById = new Map(MOVEMENTS.map(m => [m.id, m]));
  const byMajor = {};
  const byExercise = {};
  const rpeByMajor = {};
  let trainingDays = 0, hardSets = 0, rpeSum = 0, rpeCount = 0, kcalTotal = 0, kcalDays = 0, proteinTotal = 0, proteinDays = 0;
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < fromKey || key > toKey) continue;
    if (Array.isArray(day.exercises) && day.exercises.length > 0) trainingDays++;
    if (_dayKcal(day) > 0) { kcalTotal += _dayKcal(day); kcalDays++; }
    if (_dayProtein(day) > 0) { proteinTotal += _dayProtein(day); proteinDays++; }
    for (const entry of day.exercises || []) {
      const major = _entryMajor(entry, exById, movById);
      const ex = exById.get(entry.exerciseId);
      byMajor[major] = byMajor[major] || { hardSets:0, volume:0 };
      const id = entry.movementId || ex?.movementId || entry.exerciseId;
      byExercise[id] = byExercise[id] || { name: ex?.name || entry.name || id, major, points:[], volume:0, rpes:[] };
      byExercise[id].volume += calcVolume(entry.sets);
      const best = _topSetE1rm(entry);
      if (best > 0) byExercise[id].points.push({ date:key, y:best });
      for (const set of entry.sets || []) {
        if (!_isHardSet(set)) continue;
        hardSets++;
        byMajor[major].hardSets++;
        byMajor[major].volume += (Number(set.kg)||0) * (Number(set.reps)||0);
        const rpe = Number(set.rpe);
        if (Number.isFinite(rpe) && rpe > 0) {
          rpeSum += rpe; rpeCount++;
          byExercise[id].rpes.push({ date:key, rpe });
          rpeByMajor[major] = rpeByMajor[major] || { sum:0, count:0 };
          rpeByMajor[major].sum += rpe; rpeByMajor[major].count++;
        }
      }
    }
  }
  return {
    trainingDays, hardSets,
    avgKcal: kcalDays ? Math.round(kcalTotal / kcalDays) : 0,
    avgProtein: proteinDays ? Math.round(proteinTotal / proteinDays) : 0,
    avgRpe: rpeCount ? rpeSum / rpeCount : 0,
    byMajor, byExercise, rpeByMajor,
  };
}

function _renderDeepStats() {
  const root = document.getElementById('deep-stats-report');
  if (!root) return;
  const four = _analyzeTrainerWindow(_keyOffset(27), _keyOffset(0));
  const recent2 = _analyzeTrainerWindow(_keyOffset(13), _keyOffset(0));
  const prior2 = _analyzeTrainerWindow(_keyOffset(27), _keyOffset(14));
  const preset = getExpertPreset?.() || {};
  const week = _clamp(Number(preset.maxCycle?.weekIndex || preset.maxCycle?.currentWeek || 3) || 3, 1, 6);
  const phase = week === 5 ? 'DELOAD' : (week === 6 ? 'RESET' : 'ACCUMULATION');
  const phaseTone = phase === 'DELOAD' ? 'warn' : 'good';
  const weeklySets = Math.round(four.hardSets / 4);
  const setDelta = recent2.hardSets - prior2.hardSets;
  const dayDelta = recent2.trainingDays - prior2.trainingDays;
  const volumeRows = Object.entries(LANDMARKS).map(([major, lm]) => {
    const sets = Math.round((four.byMajor[major]?.hardSets || 0) / 4);
    const pct = _clamp(Math.round(sets / lm.high * 100), 0, 100);
    const band = _setsBand(sets, lm);
    return `<div class="trainer-vol-row ${band.tone}"><span>${lm.label}</span><div class="trainer-vol-track" style="--fill:${pct}%"><i style="left:${pct}%"></i><b style="left:${Math.round(lm.low/lm.high*100)}%"></b><b style="left:${Math.round(lm.good/lm.high*100)}%"></b></div><strong>${sets}세트</strong><small>${band.label} · ${band.msg}</small></div>`;
  }).join('');
  const liftAnalyses = Object.values(four.byExercise).map(e => {
    const rawPts = e.points.sort((a,b)=>a.date.localeCompare(b.date)).slice(-8);
    const baseTime = rawPts[0] ? new Date(rawPts[0].date).getTime() : 0;
    const pts = rawPts.map((p,i)=>({
      x: baseTime ? Math.max((new Date(p.date).getTime() - baseTime) / 604800000, i * 0.25) : i,
      y:p.y,
      date:p.date
    }));
    const rpes = e.rpes.sort((a,b)=>a.date.localeCompare(b.date));
    const slope = _linearSlope(pts);
    const first = pts[0]?.y || 0, last = pts.at(-1)?.y || 0;
    const delta = first ? Math.round((last-first)/first*100) : 0;
    const plateau = pts.length >= 3 && Math.abs(slope) < .15 && (rpes.at(-1)?.rpe || 0) - (rpes[0]?.rpe || 0) >= .5;
    const next = { ...e, slope, first, last, delta, plateau, pointsCount: pts.length };
    return { ...next, view: _progressView(next) };
  }).filter(e => e.last > 0);
  const liftRows = liftAnalyses
    .sort((a,b)=>(b.plateau-a.plateau) || (b.view.suspicious-a.view.suspicious) || Math.abs(b.slope)-Math.abs(a.slope)).slice(0,5)
    .map(e => `<div class="trainer-lift-row ${e.plateau?'plateau':''} ${e.view.suspicious?'suspicious':''}"><div><span>${_esc(MAJOR_LABELS[e.major]||e.major)}</span><b>${_esc(e.name)}</b></div><strong>${_esc(e.view.main)}</strong><small>${Math.round(e.first)} → ${Math.round(e.last)}kg · ${_esc(e.view.sub)}${e.plateau?' · 피로 누적 의심':''}</small></div>`).join('');
  const dataWarnings = liftAnalyses.filter(e => e.view.suspicious).slice(0,3)
    .map(e => `<li><b>${_esc(e.name)}</b><span>${Math.round(e.first)} → ${Math.round(e.last)}kg, 표본 ${e.pointsCount}회. 기록 단위/기구/운동명 혼합 여부를 확인하세요.</span></li>`).join('');
  const checkins = getBodyCheckins();
  const firstC = checkins.find(c => c.date >= _keyOffset(27));
  const lastC = [...checkins].reverse().find(c => c.date <= _keyOffset(0));
  const weightDelta = firstC && lastC ? (Number(lastC.weight)-Number(firstC.weight)) : 0;
  const bfDelta = firstC && lastC && firstC.bodyFatPct != null && lastC.bodyFatPct != null ? Number(lastC.bodyFatPct)-Number(firstC.bodyFatPct) : null;
  const phaseBody = Math.abs(weightDelta) < .2 && (bfDelta ?? 0) < 0 ? 'Recomp' : (weightDelta > .3 ? ((bfDelta ?? 0) > .4 ? 'Dirty Bulk 경계' : 'Lean Bulk') : (weightDelta < -.3 ? 'Cutting' : 'Maintenance'));
  const bodyDirection = {
    Recomp: '체중 유지 + 체지방 감량',
    'Dirty Bulk 경계': '증량 속도 빠름',
    'Lean Bulk': '천천히 증량',
    Cutting: '감량 중',
    Maintenance: '유지 중',
  }[phaseBody] || phaseBody;
  const proteinPerKg = lastC?.weight ? (four.avgProtein / Number(lastC.weight)) : 0;
  const rpeRows = Object.entries(four.rpeByMajor).map(([major, r]) => {
    const avg = r.count ? r.sum / r.count : 0;
    return `<div class="trainer-rpe-cell ${avg>=8.5?'high':avg<7?'low':''}"><span>${_esc(MAJOR_LABELS[major]||major)}</span><b>${avg.toFixed(1)}</b></div>`;
  }).join('');
  const under = Object.entries(LANDMARKS).map(([major,lm])=>({ major, lm, sets:Math.round((four.byMajor[major]?.hardSets||0)/4) })).filter(x=>x.sets < x.lm.low).sort((a,b)=>(a.sets-a.lm.low)-(b.sets-b.lm.low))[0];
  const plateauCount = liftAnalyses.filter(e => e.plateau).length;
  const briefTitle = dataWarnings ? '먼저 기록 신뢰도를 확인하세요' : (under ? `${under.lm.label} 운동량 보강이 1순위` : (plateauCount ? '정체 종목 회복 관리가 1순위' : '현재 루프 유지, 미세 증량'));
  const brief = under
    ? `${under.lm.label}이 주당 ${under.sets}세트로 최소 성장 신호보다 낮습니다. 다음 2주는 해당 부위 보조종목 2-3세트를 먼저 추가하세요.`
    : (plateauCount ? '같은 무게에서 RPE가 올라가는 종목이 있습니다. 다음 주 볼륨 -30~50% 또는 종목 rotate를 검토하세요.' : '자극·적응·회복 루프가 크게 무너지지 않았습니다. 벤치마크 1-2개만 소폭 증량하세요.');
  const asIs = under
    ? `${under.lm.label} 자극량이 기준선보다 낮아 성장 신호가 약합니다.`
    : (plateauCount ? '일부 종목은 수행능력 증가보다 피로 누적 신호가 더 큽니다.' : '핵심 부위의 자극-회복 균형은 유지되고 있습니다.');
  const toBe = under
    ? `${under.lm.label} 보조종목을 먼저 채우고, 벤치마크 증량은 유지 가능한 RPE 안에서 진행하세요.`
    : (plateauCount ? '다음 마이크로사이클은 디로드, 종목 교체, RIR 여유 확보 중 하나를 선택하세요.' : '현재 루프를 유지하되, e1RM 상승폭이 작은 종목만 미세 조정하세요.');
  root.innerHTML = `
    <section class="trainer-pulse ${phaseTone}">
      <div><span>이번 4주 요약</span><h3>${PHASE_LABELS[phase]} · ${week}/6주차</h3><p>체감강도 평균 ${four.avgRpe ? four.avgRpe.toFixed(1) : '-'} · 주당 유효세트 ${weeklySets} · 최근 2주 ${setDelta>=0?'+':''}${setDelta}세트 / ${dayDelta>=0?'+':''}${dayDelta}일</p></div>
      <div class="trainer-weeks">${[1,2,3,4,5,6].map(w=>`<i class="${w<week?'done':w===week?'now':''}">W${w}</i>`).join('')}</div>
    </section>
    <section class="trainer-panel"><div class="trainer-panel-head"><b>부위별 운동량</b><span>최근 4주 기준 · 주당 유효세트</span></div>${volumeRows}</section>
    <section class="trainer-panel"><div class="trainer-panel-head"><b>성장 추세</b><span>과장된 퍼센트 대신 kg 변화와 신뢰도 표시</span></div>${liftRows || '<p class="trainer-empty">성장 추세를 계산할 운동 기록이 부족합니다.</p>'}</section>
    ${dataWarnings ? `<section class="trainer-panel trainer-data-panel"><div class="trainer-panel-head"><b>기록 점검</b><span>갑자기 크게 뛴 종목</span></div><ul class="trainer-data-list">${dataWarnings}</ul></section>` : ''}
    <section class="trainer-panel"><div class="trainer-panel-head"><b>몸 변화와 식단</b><span>운동 성과가 몸에 반영되는지 확인</span></div><div class="trainer-body-grid"><div><span>현재 방향</span><b>${bodyDirection}</b></div><div><span>체중 4주</span><b>${weightDelta>=0?'+':''}${weightDelta.toFixed(1)}kg</b></div><div><span>체지방</span><b>${bfDelta==null?'-':`${bfDelta>=0?'+':''}${bfDelta.toFixed(1)}%p`}</b></div><div><span>단백질</span><b>${proteinPerKg ? proteinPerKg.toFixed(2) : '-'} g/kg</b></div></div><p>${four.avgKcal ? `평균 ${four.avgKcal}kcal, 단백질 ${four.avgProtein}g. 이 수치가 낮으면 운동량이 좋아도 성장 체감이 약할 수 있습니다.` : '식단 칼로리 기록이 부족해서 운동 성과와 몸 변화의 연결을 판단하기 어렵습니다.'}</p></section>
    <section class="trainer-panel"><div class="trainer-panel-head"><b>피로도</b><span>부위별 체감강도</span></div><div class="trainer-rpe-grid">${rpeRows || '<p class="trainer-empty">RPE 기록이 부족합니다.</p>'}</div><p>${four.avgRpe >= 8.6 ? '평균 체감강도가 높습니다. 이번 주는 세트 수를 줄이거나 실패지점 전 1-2회 여유를 남기세요.' : '피로도는 아직 관리 가능한 범위입니다.'}</p></section>
    <section class="trainer-brief"><span>코치 제안</span><h3>${_esc(briefTitle)}</h3><p>${_esc(dataWarnings ? '성장률이 비정상적으로 크게 잡힌 종목이 있습니다. 증량 판단보다 먼저 같은 기구/같은 단위/같은 종목명으로 기록됐는지 확인하세요.' : brief)}</p></section>
    <section class="trainer-transition"><div><span>현재 상태</span><p>${_esc(asIs)}</p></div><div><span>다음 2주</span><p>${_esc(toBe)}</p></div></section>
  `;
}

// ── 13번: CSV 내보내기 ───────────────────────────────────────────
export function exportCSV(period) {
  const cache  = getCache();
  const exList = getExList();
  const rows   = [['날짜','운동부위','종목','세트수','총볼륨(vol)','아침','점심','저녁','총칼로리','식단OK']];

  // 기간 필터
  const now   = new Date(TODAY);
  const since = period > 0
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - period)
    : null;

  Object.entries(cache)
    .filter(([key]) => !since || key >= dateKey(since.getFullYear(), since.getMonth(), since.getDate()))
    .sort(([a],[b]) => a.localeCompare(b))
    .forEach(([key, day]) => {
      // canonical diet 기록 — 텍스트(snack 포함)/food-chip/kcal-only/skip/photo 전부 인정
      const dietHas = day.breakfast || day.lunch || day.dinner || day.snack ||
                      day.bFoods?.length || day.lFoods?.length || day.dFoods?.length || day.sFoods?.length ||
                      (day.bKcal||0) > 0 || (day.lKcal||0) > 0 || (day.dKcal||0) > 0 || (day.sKcal||0) > 0 ||
                      day.breakfast_skipped || day.lunch_skipped || day.dinner_skipped ||
                      day.bPhoto || day.lPhoto || day.dPhoto || day.sPhoto;
      const diet     = dietHas ? day : null;
      const totalKcal= (day.bKcal||0)+(day.lKcal||0)+(day.dKcal||0)+(day.sKcal||0);
      const dietOk   = diet ? (day.bOk!==false&&day.lOk!==false&&day.dOk!==false?'O':'X') : '';

      if (day.exercises?.length) {
        const allMuscles = getAllMuscles();
        day.exercises.forEach(entry => {
          const ex  = exList.find(e => e.id === entry.exerciseId);
          const mc  = allMuscles.find(m => m.id === entry.muscleId);
          const vol = calcVolume(entry.sets);
          rows.push([
            key,
            mc?.name||entry.muscleId,
            ex?.name||entry.exerciseId,
            entry.sets.length,
            vol,
            day.breakfast||'', day.lunch||'', day.dinner||'',
            totalKcal||'', dietOk,
          ]);
        });
      } else if (day.cf) {
        rows.push([key,'크로스핏','크로스핏','','','',day.breakfast||'',day.lunch||'',day.dinner||'',totalKcal||'',dietOk]);
      } else if (diet) {
        rows.push([key,'','','','',day.breakfast||'',day.lunch||'',day.dinner||'',totalKcal||'',dietOk]);
      }
    });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `life-streak-${TODAY.toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 근육 14일 ────────────────────────────────────────────────────
function _renderMuscle14d() {
  const allMuscles = getAllMuscles();
  const data={};
  allMuscles.forEach(m=>data[m.id]=0);
  for(let i=0;i<14;i++){
    const d=new Date(TODAY);d.setDate(d.getDate()-i);
    getMuscles(d.getFullYear(),d.getMonth(),d.getDate()).forEach(mid=>{if(mid in data)data[mid]++;});
  }
  const el=document.getElementById('muscle-14d');el.innerHTML='';
  allMuscles.forEach(mu=>{
    const cnt=data[mu.id],pct=Math.round((cnt/14)*100);
    const badge=cnt>=2?'good':cnt===1?'warn':'bad',bt=cnt>=2?`${cnt}회✓`:cnt===1?'1회':'0회';
    const row=document.createElement('div');row.className='muscle-stat-row';
    row.innerHTML=`
      <span class="muscle-stat-name" style="color:${mu.color}">${mu.name}</span>
      <div class="muscle-stat-bar-wrap"><div class="muscle-stat-bar" style="width:${pct}%;background:${mu.color};opacity:.8"></div></div>
      <span class="muscle-stat-count">${pct}%</span>
      <span class="muscle-stat-14d ${badge}">${bt}</span>`;
    el.appendChild(row);
  });
}

// ── 기간별 근육 ──────────────────────────────────────────────────
function _renderMusclePeriod() {
  const allMuscles = getAllMuscles();
  const data={}; allMuscles.forEach(m=>data[m.id]=0);
  const limit=_period===0?3650:_period;
  for(let i=0;i<limit;i++){
    const d=new Date(TODAY);d.setDate(d.getDate()-i);
    getMuscles(d.getFullYear(),d.getMonth(),d.getDate()).forEach(mid=>{if(mid in data)data[mid]++;});
  }
  const el=document.getElementById('muscle-period');el.innerHTML='';
  const max=Math.max(...Object.values(data),1);
  allMuscles.forEach(mu=>{
    const cnt=data[mu.id],pct=Math.round((cnt/max)*100);
    const row=document.createElement('div');row.className='muscle-stat-row';
    row.innerHTML=`
      <span class="muscle-stat-name" style="color:${mu.color}">${mu.name}</span>
      <div class="muscle-stat-bar-wrap"><div class="muscle-stat-bar" style="width:${pct}%;background:${mu.color};opacity:.8"></div></div>
      <span class="muscle-stat-count">${cnt}일</span>`;
    el.appendChild(row);
  });
}

// ── 종목별 볼륨 추이 ──────────────────────────────────────────────
function _renderVolumeSection() {
  const container=document.getElementById('volume-section');container.innerHTML='';
  const allMuscles = getAllMuscles();
  const usedExIds=new Set();
  Object.values(getCache()).forEach(day=>(day.exercises||[]).forEach(e=>usedExIds.add(e.exerciseId)));

  if(!usedExIds.size){
    container.innerHTML='<div style="font-size:12px;color:var(--muted)">운동 기록이 없어요.</div>';
    return;
  }

  const selector=document.createElement('div');selector.className='vol-selector';
  allMuscles.forEach(muscle=>{
    getExList().filter(e=>e.muscleId===muscle.id&&usedExIds.has(e.id)).forEach(ex=>{
      const btn=document.createElement('button');
      btn.className='vol-ex-btn'+(_selectedExerciseId===ex.id?' active':'');
      btn.style.setProperty('--mc',muscle.color);
      btn.textContent=ex.name;
      btn.addEventListener('click',()=>{_selectedExerciseId=ex.id;_renderVolumeSection();});
      selector.appendChild(btn);
    });
  });
  container.appendChild(selector);

  if(!_selectedExerciseId||!usedExIds.has(_selectedExerciseId))
    _selectedExerciseId=[...usedExIds][0];

  const history=getVolumeHistory(_selectedExerciseId);
  if(!history.length){
    container.innerHTML+='<div style="font-size:12px;color:var(--muted);margin-top:8px">기록이 없어요.</div>';
    return;
  }

  const chartWrap=document.createElement('div');
  chartWrap.style.cssText='position:relative;width:100%;height:200px;margin-top:14px;';
  const canvas=document.createElement('canvas');canvas.id='vol-chart';
  chartWrap.appendChild(canvas);container.appendChild(chartWrap);

  const recent=history.slice(-5).reverse();
  const tableWrap=document.createElement('div');tableWrap.className='vol-table';
  tableWrap.innerHTML=`<div class="vol-table-title">최근 ${recent.length}회 기록</div>`+
    recent.map((h,i)=>{
      const prev=recent[i+1],diff=prev?h.volume-prev.volume:0;
      const arrow=diff>0?'↑':diff<0?'↓':'→';
      const col=diff>0?'var(--diet-ok)':diff<0?'var(--diet-bad)':'var(--muted)';
      return `<div class="vol-row">
        <span class="vol-date">${h.date.replace(/-/g,'/')}</span>
        <span class="vol-val">${h.volume.toLocaleString()} vol</span>
        <span class="vol-diff" style="color:${col}">${diff!==0?arrow+Math.abs(diff).toLocaleString():arrow}</span>
      </div>`;
    }).join('');
  container.appendChild(tableWrap);
  requestAnimationFrame(()=>_drawVolumeChart(canvas,history));
}

function _drawVolumeChart(canvas,history){
  if(typeof Chart==='undefined')return;
  const existing=Chart.getChart(canvas);if(existing)existing.destroy();
  const ex=getExList().find(e=>e.id===_selectedExerciseId);
  const mc=getAllMuscles().find(m=>m.id===ex?.muscleId);
  const color=mc?.color||'#f97316';
  new Chart(canvas,{
    type:'line',
    data:{labels:history.map(h=>h.date.slice(5)),
      datasets:[{data:history.map(h=>h.volume),borderColor:color,backgroundColor:color+'22',tension:.3,fill:true,pointRadius:4,pointBackgroundColor:color}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#5c6478',font:{size:10}},grid:{color:document.documentElement.classList.contains('light') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}},
              y:{ticks:{color:'#5c6478',font:{size:10}},grid:{color:document.documentElement.classList.contains('light') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}}}},
  });
}

// ── 식단 통계 ────────────────────────────────────────────────────
function _renderDietStats(){
  let okDays=0,ngDays=0,totalKcal=0,kcalDays=0;
  const ny=TODAY.getFullYear();
  for(let m=0;m<12;m++)for(let d=1;d<=daysInMonth(ny,m);d++){
    const dt=getDiet(ny,m,d),dok=dietDayOk(ny,m,d);
    if(dok===true)okDays++;else if(dok===false)ngDays++;
    const k=(dt.bKcal||0)+(dt.lKcal||0)+(dt.dKcal||0)+(dt.sKcal||0);
    if(k>0){totalKcal+=k;kcalDays++;}
  }
  const avg=kcalDays>0?Math.round(totalKcal/kcalDays):0;
  const rate=okDays+ngDays>0?Math.round(okDays/(okDays+ngDays)*100):0;
  document.getElementById('diet-stats').innerHTML=`
    <div class="diet-stat-row"><span class="diet-stat-label">✅ 식단 OK 일수 (올해)</span><span class="diet-stat-val" style="color:var(--diet-ok)">${okDays}일</span></div>
    <div class="diet-stat-row"><span class="diet-stat-label">❌ 식단 NG 일수 (올해)</span><span class="diet-stat-val" style="color:var(--diet-bad)">${ngDays}일</span></div>
    <div class="diet-stat-row"><span class="diet-stat-label">🔥 평균 일일 칼로리</span><span class="diet-stat-val">${avg} kcal</span></div>
    <div class="diet-stat-row"><span class="diet-stat-label">📊 식단 달성률</span><span class="diet-stat-val">${rate}%</span></div>`;
}

// ── 월별 요약 ────────────────────────────────────────────────────
function _renderMonthlySummary(){
  const ny=TODAY.getFullYear(),curM=TODAY.getMonth();
  const el=document.getElementById('monthly-summary');el.innerHTML='';
  for(let m=0;m<12;m++){
    let cnt=0;
    for(let d=1;d<=daysInMonth(ny,m);d++)
      if(hasExerciseRecord(ny,m,d)||dietDayOk(ny,m,d)===true)cnt++;
    const pill=document.createElement('div');pill.className='month-pill'+(m===curM?' active':'');
    pill.innerHTML=`<span class="mp-m">${MONTHS[m]}</span><span class="mp-v">${cnt}</span>`;
    el.appendChild(pill);
  }
}

// ── 연간 히트맵 ──────────────────────────────────────────────────
function _renderHeatmap(){
  const y=TODAY.getFullYear();
  const yearEl=document.getElementById('heatmap-year');
  if(yearEl) yearEl.textContent=y+'년';
  const el=document.getElementById('heatmap');if(!el)return;el.innerHTML='';
  const startDow=new Date(y,0,1).getDay();
  for(let i=0;i<startDow;i++){const b=document.createElement('div');b.style.aspectRatio='1';el.appendChild(b);}
  for(let m=0;m<12;m++)for(let d=1;d<=daysInMonth(y,m);d++){
    const hasGym=getMuscles(y,m,d).length>0,hasCF=getCF(y,m,d),hasDiet=dietDayOk(y,m,d)===true,fut=isFuture(y,m,d);
    const hasEx=hasExerciseRecord(y,m,d);
    const cell=document.createElement('div');cell.className='heatmap-cell';
    if(!fut){
      if(hasGym&&hasCF)cell.classList.add('h4');
      else if(hasGym){const cnt=getMuscles(y,m,d).length;cell.classList.add(cnt>=3?'h3':cnt===2?'h2':'h1');}
      else if(hasCF)cell.classList.add('hcf');
      else if(hasEx)cell.classList.add('hcf'); // stretching/running/swimming도 표시
      else if(hasDiet)cell.classList.add('hdiet');
    }
    el.appendChild(cell);
  }
}

// ── 체크인 차트 (체중 & 체지방 추이) ────────────────────────────
function _renderCheckinChart() {
  const canvas   = document.getElementById('checkin-chart');
  const emptyEl  = document.getElementById('checkin-chart-empty');
  if (!canvas) return;

  const checkins = getBodyCheckins(); // sorted by date asc

  if (!checkins.length) {
    canvas.style.display   = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // 기존 차트 파기
  if (_checkinChart) { _checkinChart.destroy(); _checkinChart = null; }

  const labels  = checkins.map(c => c.date.replace(/-/g,'/'));
  const weights = checkins.map(c => c.weight);
  const bfPcts  = checkins.map(c => c.bodyFatPct ?? null);

  const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = dark ? '#8899a6' : '#6b7280';

  _checkinChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '체중 (kg)',
          data:  weights,
          borderColor: 'var(--gym)',
          backgroundColor: 'rgba(99,102,241,0.08)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: '체지방률 (%)',
          data:  bfPcts,
          borderColor: 'var(--cf)',
          backgroundColor: 'rgba(34,197,94,0.08)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
          yAxisID: 'y2',
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}${ctx.datasetIndex===0?'kg':'%'}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
          grid:  { color: gridColor },
        },
        y: {
          position: 'left',
          title:    { display: true, text: 'kg', color: textColor, font: { size: 10 } },
          ticks:    { color: textColor, font: { size: 10 } },
          grid:     { color: gridColor },
        },
        y2: {
          position: 'right',
          title:    { display: true, text: '%', color: textColor, font: { size: 10 } },
          ticks:    { color: textColor, font: { size: 10 } },
          grid:     { drawOnChartArea: false },
        },
      },
    },
  });
}
