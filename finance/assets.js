// ================================================================
// finance/assets.js — 벤치마크/실적/계획/순자산
// ================================================================

import { S } from './state.js';
import {
  getFinBenchmarks, getFinActuals, getFinPlans,
  getFinPositions, getFinLoans,
} from '../data.js';
import {
  compoundProjection, calcCAGR, calcNetWorth, calcDebtRatio,
  checkRebalanceAlerts, calcEmergencyMonths,
  formatManwon, formatUSD, getAge,
} from '../finance-calc.js';

export function renderBenchmarks() {
  const benchmarks = getFinBenchmarks();
  const listEl = document.getElementById('fin-bench-list');
  if (!listEl) return;

  if (benchmarks.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">벤치마크를 추가하세요</div>`;
    return;
  }

  listEl.innerHTML = benchmarks.map(b => {
    const proj = compoundProjection(b);
    const last = proj[proj.length - 1];
    const hasInflation = (b.inflationRate || 0) > 0;
    return `
    <div class="fin-bench-card">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">${b.name || '벤치마크'}</span>
        <span class="fin-bench-meta">초기 ${formatManwon(b.initialPrincipal)} · ${b.annualRate}% · ${formatManwon(b.annualContribution)}/yr → ${formatManwon(last.closeBalance)}${hasInflation ? ` (실질 ${formatManwon(last.realCloseBalance)})` : ''}</span>
      </div>
      <div class="fin-bench-detail" style="display:none">
        <div style="font-size:10px;color:var(--muted);margin:6px 0">초기 ${formatManwon(b.initialPrincipal)}에 연 ${b.annualRate}% 복리, 매년 연말 ${formatManwon(b.annualContribution)} 납입${hasInflation ? `, 물가상승률 ${b.inflationRate}%` : ''} 가정</div>
        <div style="overflow-x:auto">
        <table class="fin-proj-table">
          <thead><tr><th>연차</th><th>나이</th><th>기초 잔액</th><th>연간 이자 (${b.annualRate}%)</th><th>기말 납입금</th><th>기말 잔액 (명목)</th>${hasInflation ? `<th>기말 잔액 (실질)</th>` : ''}</tr></thead>
          <tbody>${proj.map(r => `<tr>
            <td>${r.year}년 말</td>
            <td>${r.age}살</td>
            <td>${formatManwon(r.openBalance)}</td>
            <td>${formatManwon(r.interest)}</td>
            <td>${formatManwon(r.contribution)}</td>
            <td style="font-weight:600">${formatManwon(r.closeBalance)}</td>
            ${hasInflation ? `<td style="font-weight:600;color:var(--muted2)">${formatManwon(r.realCloseBalance)}</td>` : ''}
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>
      <div class="fin-bench-actions">
        <button onclick="openFinBenchmarkModal('${b.id}')">수정</button>
        <button class="fin-del-btn" onclick="deleteFinBenchmarkDirect('${b.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

export function renderPlans() {
  const plans = getFinPlans();
  const listEl = document.getElementById('fin-plan-list');
  if (!listEl) return;

  if (plans.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = plans.map(p => {
    const entries = (p.entries || []).sort((a, b) => a.year - b.year);
    const last = entries[entries.length - 1];
    return `
    <div class="fin-bench-card" style="border-left-color:#8b5cf6">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">🎯 ${p.name || '계획실적'}</span>
        <span class="fin-bench-meta">${entries.length}개 연도 ${last ? '→ ' + last.year + '년 ' + formatManwon(last.target) : ''}</span>
      </div>
      <div class="fin-bench-detail" style="display:none">
        <div style="overflow-x:auto">
        <table class="fin-proj-table">
          <thead><tr><th>연도</th><th>나이</th><th>목표 기말잔액</th></tr></thead>
          <tbody>${entries.map(e => `<tr>
            <td>${e.year}년</td>
            <td>${getAge(e.year)}살</td>
            <td style="font-weight:600">${formatManwon(e.target)}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>
      <div class="fin-bench-actions">
        <button onclick="openFinPlanModal('${p.id}')">수정</button>
        <button class="fin-del-btn" onclick="deleteFinPlanDirect('${p.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

export function renderActuals() {
  const actuals = getFinActuals();
  const listEl = document.getElementById('fin-actual-list');
  if (!listEl) return;

  if (actuals.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">연간 실적을 추가하세요</div>`;
  } else {
    const latest = actuals[actuals.length - 1];
    listEl.innerHTML = `
    <div class="fin-bench-card" style="border-left-color:#10b981">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">📋 연간 실적</span>
        <span class="fin-bench-meta">${actuals.length}건 · 최근 ${latest.year}년 (${getAge(latest.year)}살) ${formatManwon(latest.cumulativeSaved)}</span>
      </div>
      <div style="display:none">
        <div style="overflow-x:auto">
        <table class="fin-table" style="margin-top:6px">
          <thead><tr><th>연도</th><th>나이</th><th>누적 저축/투자</th><th>순자산</th><th>비상금</th><th>Inflow</th><th>고정지출</th><th>가처분여력</th><th>월환산</th><th></th></tr></thead>
          <tbody>${actuals.map(a => {
            const em = calcEmergencyMonths(a.emergencyFund, a.monthlyExpense);
            const discretionary = (a.inflow || 0) - (a.fOutflow || 0);
            const monthlyDisc = discretionary > 0 ? Math.round(discretionary / 12) : null;
            const hasFlow = a.inflow || a.fOutflow;
            return `<tr>
              <td>${a.year}</td>
              <td>${getAge(a.year)}살</td>
              <td class="num">${formatManwon(a.cumulativeSaved)}</td>
              <td class="num">${a.netWorth ? formatManwon(a.netWorth) : '-'}</td>
              <td class="num">${a.emergencyFund ? formatManwon(a.emergencyFund) + (em != null ? ` (${em}개월)` : '') : '-'}</td>
              <td class="num">${a.inflow ? formatManwon(a.inflow) : '-'}</td>
              <td class="num">${a.fOutflow ? formatManwon(a.fOutflow) : '-'}</td>
              <td class="num ${hasFlow ? (discretionary < 0 ? 'neg' : '') : ''}">${hasFlow ? formatManwon(discretionary) : '-'}</td>
              <td class="num">${monthlyDisc != null ? formatManwon(monthlyDisc) + '/월' : '-'}</td>
              <td class="action-cell"><button class="edit-btn" onclick="openFinActualModal('${a.id}')">✏️</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        </div>
      </div>
    </div>`;
  }

  const cagrEl = document.getElementById('fin-cagr-display');
  if (cagrEl && actuals.length >= 2) {
    const first = actuals[0], last = actuals[actuals.length - 1];
    const years = last.year - first.year;
    if (years > 0 && first.cumulativeSaved > 0) {
      const cagr = calcCAGR(first.cumulativeSaved, last.cumulativeSaved, years);
      cagrEl.innerHTML = `<div style="font-size:11px;color:var(--muted);margin:6px 0">CAGR: <span style="color:var(--diet-ok);font-weight:700;font-family:'JetBrains Mono',monospace">${(cagr * 100).toFixed(1)}%</span></div>`;
    }
  }
}

export function renderNetWorthCards() {
  const el = document.getElementById('fin-networth-cards');
  if (!el) return;

  const positions = getFinPositions();
  const loans = getFinLoans();
  const { totalAssets, totalDebt, netWorth } = calcNetWorth(positions, loans, S.quotesMap);
  const debtRatio = calcDebtRatio(totalDebt, totalAssets);

  const actuals = getFinActuals();
  const latest = actuals[actuals.length - 1];
  const emMonths = latest ? calcEmergencyMonths(latest.emergencyFund, latest.monthlyExpense) : null;
  const emClass = emMonths == null ? '' : emMonths < 3 ? 'negative' : emMonths < 6 ? 'warn' : 'positive';

  const totalAssetsKRW = Math.round(totalAssets * S.fxRate / 10000);
  el.innerHTML = `<div class="fin-networth-row">
    <div class="fin-nw-card"><div class="fin-nw-label">총 자산</div><div class="fin-nw-val">${formatManwon(totalAssetsKRW)}</div><div style="font-size:9px;color:var(--muted)">${formatUSD(totalAssets)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">총 부채</div><div class="fin-nw-val negative">${formatManwon(totalDebt)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">부채비율</div><div class="fin-nw-val ${debtRatio > 0.5 ? 'negative' : debtRatio > 0.3 ? 'warn' : 'positive'}">${(debtRatio * 100).toFixed(1)}%</div></div>
    ${emMonths != null ? `<div class="fin-nw-card"><div class="fin-nw-label">비상금</div><div class="fin-nw-val ${emClass}">${emMonths}개월</div></div>` : ''}
  </div>`;

  const alerts = checkRebalanceAlerts(positions, S.quotesMap);
  const alertEl = document.getElementById('fin-rebal-alerts');
  if (alertEl) {
    alertEl.innerHTML = alerts.length > 0
      ? `<div class="fin-rebal-alert">⚠️ 리밸런싱 필요: ${alerts.map(a => `${a.name || a.ticker} (${a.pct}%)`).join(', ')} — 단일 종목 30% 초과</div>`
      : '';
  }
}
