// ================================================================
// home/unit-goal.js — 단위 목표달성 (3일 사이클)
// ================================================================

import { TODAY, getDiet, getDietPlan, calcDietMetrics, getBodyCheckins,
         getUnitGoalStart, saveUnitGoalStart, getDayTargetKcal,
         dateKey, isFuture, isToday }  from '../data.js';

// 순환 참조 방지용 콜백
let _renderHomeFn = null;
export function setUnitGoalDeps({ renderHome }) { _renderHomeFn = renderHome; }

// ── 단위 목표달성 정보 (3일 사이클) ──────────────────────────────
export function renderUnitGoal() {
  const container = document.getElementById('unit-goal-content');
  if (!container) return;

  const plan = getDietPlan();
  const _chk0 = getBodyCheckins();
  const _lw0 = _chk0.length ? _chk0[_chk0.length - 1].weight : null;
  const metrics = calcDietMetrics(_lw0 ? { ...plan, weight: _lw0 } : plan);

  let startStr = getUnitGoalStart();
  if (!startStr) {
    startStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    saveUnitGoalStart(startStr);
  }

  const startDate = new Date(startStr + 'T00:00:00');
  const todayMs   = new Date(dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) + 'T00:00:00').getTime();
  const diffDays  = Math.floor((todayMs - startDate.getTime()) / 86400000);

  let cycleStart;
  if (diffDays < 0) {
    cycleStart = startDate;
  } else {
    const cycleOffset = Math.floor(diffDays / 3) * 3;
    cycleStart = new Date(startDate);
    cycleStart.setDate(cycleStart.getDate() + cycleOffset);
  }

  const days = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(cycleStart);
    d.setDate(cycleStart.getDate() + i);
    days.push(d);
  }

  const dayData = days.map(d => {
    const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
    const future = isFuture(y, m, dd);
    const diet = getDiet(y, m, dd);
    const intake = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = getDayTargetKcal(plan, y, m, dd);

    const mealMacro = (prefix, prop) => {
      const foods = diet[`${prefix}Foods`] || [];
      if (foods.length > 0) return foods.reduce((s, f) => s + (f[prop] || 0), 0);
      const fieldMap = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
      return diet[`${prefix}${fieldMap[prop]}`] || 0;
    };
    const prefixes = ['b','l','d','s'];
    const actProtein = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'protein'), 0) * 10) / 10;
    const actCarbs   = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'carbs'), 0) * 10) / 10;
    const actFat     = Math.round(prefixes.reduce((s, p) => s + mealMacro(p, 'fat'), 0) * 10) / 10;

    const dow = new Date(y, m, dd).getDay();
    const isRefeed = (plan.refeedDays || []).includes(dow);
    const macroTarget = isRefeed ? metrics.refeed : metrics.deficit;

    return {
      date: d, y, m, dd, intake, target, future,
      actProtein, actCarbs, actFat,
      tgtProtein: macroTarget.proteinG, tgtCarbs: macroTarget.carbG, tgtFat: macroTarget.fatG,
    };
  });

  const recordedDays = dayData.filter(d => !d.future && d.intake > 0);
  const totalIntake  = dayData.reduce((s, d) => s + d.intake, 0);
  const totalTarget  = dayData.reduce((s, d) => s + d.target, 0);

  const calcSuccess = (intake, target) => {
    if (intake <= 0) return null;
    if (intake <= target) return 100;
    return Math.round((target / intake) * 100);
  };

  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  const DOW = ['일','월','화','수','목','금','토'];
  const rangeStr = `${fmt(days[0])}(${DOW[days[0].getDay()]}) ~ ${fmt(days[2])}(${DOW[days[2].getDay()]})`;

  const totalSuccess = recordedDays.length > 0 ? calcSuccess(totalIntake, totalTarget) : null;

  let html = `<div class="unit-goal-range">${rangeStr}</div>`;
  html += `<table class="unit-goal-table"><thead><tr><th></th>`;

  days.forEach((d, i) => {
    const today = isToday(d.getFullYear(), d.getMonth(), d.getDate());
    html += `<th class="${today ? 'ug-today' : ''}"><span class="ug-day-label">D${i+1}</span><span class="ug-date-label">${fmt(d)}</span></th>`;
  });
  html += `<th class="ug-total-col"><span class="ug-day-label">합계</span></th></tr></thead><tbody>`;

  html += `<tr class="ug-row-intake"><td class="ug-row-label">섭취</td>`;
  dayData.forEach(d => {
    if (d.future) {
      html += `<td class="ug-cell"><span class="ug-val muted">—</span></td>`;
    } else if (d.intake <= 0) {
      html += `<td class="ug-cell"><span class="ug-val muted">—</span></td>`;
    } else {
      const over = d.intake > d.target;
      html += `<td class="ug-cell"><span class="ug-val ${over ? 'over' : 'ok'}">${d.intake.toLocaleString()}</span><span class="ug-sub">/ ${d.target.toLocaleString()}</span></td>`;
    }
  });
  if (recordedDays.length > 0) {
    const over = totalIntake > totalTarget;
    html += `<td class="ug-cell ug-total-col"><span class="ug-val ${over ? 'over' : 'ok'}">${totalIntake.toLocaleString()}</span><span class="ug-sub">/ ${totalTarget.toLocaleString()}</span></td>`;
  } else {
    html += `<td class="ug-cell ug-total-col"><span class="ug-val muted">—</span></td>`;
  }
  html += `</tr>`;

  html += `<tr class="ug-row-pct"><td class="ug-row-label">달성</td>`;
  dayData.forEach(d => {
    const pct = d.future ? null : calcSuccess(d.intake, d.target);
    if (pct === null) {
      html += `<td class="ug-cell"><span class="ug-pct muted">—</span></td>`;
    } else {
      const cls = pct >= 100 ? 'perfect' : pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad';
      const icon = pct >= 100 ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fa342c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : pct >= 90 ? '⚠️' : '❌';
      html += `<td class="ug-cell"><span class="ug-pct ${cls}">${pct}%</span><span class="ug-icon">${icon}</span></td>`;
    }
  });
  if (totalSuccess !== null) {
    const cls = totalSuccess >= 100 ? 'perfect' : totalSuccess >= 90 ? 'good' : totalSuccess >= 70 ? 'warn' : 'bad';
    const icon = totalSuccess >= 100 ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fa342c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : totalSuccess >= 90 ? '⚠️' : '❌';
    html += `<td class="ug-cell ug-total-col"><span class="ug-pct ${cls}">${totalSuccess}%</span><span class="ug-icon">${icon}</span></td>`;
  } else {
    html += `<td class="ug-cell ug-total-col"><span class="ug-pct muted">—</span></td>`;
  }
  html += `</tr>`;

  const macroRows = [
    { label: '단', act: 'actProtein', tgt: 'tgtProtein', lessIsGood: false },
    { label: '탄', act: 'actCarbs',   tgt: 'tgtCarbs',   lessIsGood: true },
    { label: '지', act: 'actFat',     tgt: 'tgtFat',     lessIsGood: true },
  ];
  const fmtDelta = (actual, target, lessIsGood) => {
    if (actual <= 0) return { text: '—', cls: 'muted' };
    const diff = Math.round(actual - target);
    const pct  = target > 0 ? Math.round(((actual - target) / target) * 100) : 0;
    const sign = diff > 0 ? '+' : '';
    const cls  = diff > 0 ? 'macro-over' : diff < 0 ? (lessIsGood ? 'macro-ok' : 'macro-under') : 'macro-ok';
    const text = diff === 0 ? '±0g' : `${sign}${diff}g<span class="ug-macro-pct">${sign}${pct}%</span>`;
    return { text, cls };
  };

  macroRows.forEach(mr => {
    html += `<tr class="ug-row-macro"><td class="ug-row-label ug-macro-label">${mr.label}</td>`;
    let totAct = 0, totTgt = 0;
    dayData.forEach(d => {
      totTgt += d[mr.tgt];
      if (d.future) {
        html += `<td class="ug-cell"><span class="ug-macro muted">—</span></td>`;
      } else {
        const actual = d[mr.act], target = d[mr.tgt];
        const hasData = d.intake > 0;
        if (!hasData) {
          html += `<td class="ug-cell"><span class="ug-macro muted">—</span></td>`;
        } else {
          const delta = fmtDelta(actual, target, mr.lessIsGood);
          html += `<td class="ug-cell"><span class="ug-macro ${delta.cls}">${delta.text}</span></td>`;
          totAct += actual;
        }
      }
    });
    if (recordedDays.length > 0) {
      const delta = fmtDelta(totAct, totTgt, mr.lessIsGood);
      html += `<td class="ug-cell ug-total-col"><span class="ug-macro ${delta.cls}">${delta.text}</span></td>`;
    } else {
      html += `<td class="ug-cell ug-total-col"><span class="ug-macro muted">—</span></td>`;
    }
    html += `</tr>`;
  });

  html += `</tbody></table>`;

  if (!plan.weight || !plan.targetBodyFatPct) {
    html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">⚙️ 다이어트 플랜을 설정하면 목표 칼로리가 반영됩니다.</div>`;
  }

  container.innerHTML = html;
}

// ── 단위 목표 시작일 설정 ─────────────────────────────────────────
window.openUnitGoalDatePicker = function() {
  const current = getUnitGoalStart() || dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const [cy, cm, cd] = current.split('-').map(Number);
  let viewY = cy, viewM = cm - 1;

  function render() {
    const firstDay = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    let grid = '';
    for (let i = 0; i < firstDay; i++) grid += '<div class="sdp-cell sdp-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewY}-${String(viewM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isSelected = key === current;
      const isToday = viewY === TODAY.getFullYear() && viewM === TODAY.getMonth() && d === TODAY.getDate();
      let cls = 'sdp-cell sdp-day';
      if (isSelected) cls += ' sdp-selected';
      if (isToday) cls += ' sdp-today';
      grid += `<div class="${cls}" data-date="${key}">${d}</div>`;
    }

    const el = document.getElementById('seed-datepicker-body');
    if (!el) return;
    document.getElementById('sdp-month-label').textContent = `${viewY}년 ${monthNames[viewM]}`;
    el.innerHTML = grid;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.id = 'seed-datepicker-modal';
  modal.style.zIndex = '1002';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal-sheet" style="max-width:360px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title">시작일 선택</div>
      <div class="sdp-nav">
        <button class="sdp-nav-btn" id="sdp-prev">&lt;</button>
        <span class="sdp-month-label" id="sdp-month-label"></span>
        <button class="sdp-nav-btn" id="sdp-next">&gt;</button>
      </div>
      <div class="sdp-header">
        <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
      </div>
      <div class="sdp-grid" id="seed-datepicker-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#sdp-prev').onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); };
  modal.querySelector('#sdp-next').onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); };
  modal.querySelector('#seed-datepicker-body').addEventListener('click', async (e) => {
    const cell = e.target.closest('.sdp-day');
    if (!cell) return;
    const val = cell.dataset.date;
    await saveUnitGoalStart(val);
    renderUnitGoal();
    if (_renderHomeFn) _renderHomeFn();
    modal.remove();
  });

  render();
};
