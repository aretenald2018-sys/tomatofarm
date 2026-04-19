// ================================================================
// render-stats.js
// 의존성: config.js, data.js
// 변경: 13번 CSV 내보내기 추가
// ================================================================

import { MONTHS }                                    from './config.js';
import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         daysInMonth, isFuture, getExList, getAllMuscles,
         getVolumeHistory, getCache, calcVolume,
         getExercises, dateKey, getBodyCheckins,
         hasExerciseRecord }    from './data.js';

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
  _renderMuscle14d();
  _renderMusclePeriod();
  _renderVolumeSection();
  _renderDietStats();
  _renderMonthlySummary();
  _renderHeatmap();
  _renderCheckinChart();
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
