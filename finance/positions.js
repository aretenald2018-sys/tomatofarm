// ================================================================
// finance/positions.js — 포지션/대출 테이블
// ================================================================

import { S } from './state.js';
import { getFinPositions, getFinLoans } from '../data.js';
import { calcPositionPnL, formatMoney, formatMoneyDetail, formatManwon, formatUSD } from '../finance-calc.js';

export function renderPositionTables() {
  renderLoanTable();
  renderPosTable('leveraged');
  renderPosTable('cash');
  renderLeverageSummary();
  renderTotalSummary();
}

export function renderLoanTable() {
  const el = document.getElementById('fin-loan-table');
  if (!el) return;
  const loans = getFinLoans();
  if (loans.length === 0) { el.innerHTML = `<div style="color:var(--muted);font-size:11px">대출 없음</div>`; return; }
  el.innerHTML = `<table class="fin-table">
    <thead><tr><th>대출명</th><th>잔액</th><th>금리</th><th>월상환</th><th>만기일</th><th></th></tr></thead>
    <tbody>${loans.map(l => `<tr>
      <td>${l.name}</td>
      <td class="num">${formatManwon(l.amount)}</td>
      <td class="num">${l.interestRate}%</td>
      <td class="num">${formatManwon(l.monthlyPayment)}</td>
      <td>${l.endDate || '-'}</td>
      <td class="action-cell"><button class="edit-btn" onclick="openFinLoanModal('${l.id}')">✏️</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

export function renderPosTable(type) {
  const el = document.getElementById(`fin-pos-${type}-table`);
  if (!el) return;
  const positions = getFinPositions().filter(p => p.type === type);
  if (positions.length === 0) { el.innerHTML = `<div style="color:var(--muted);font-size:11px">포지션 없음</div>`; return; }

  el.innerHTML = `<table class="fin-table">
    <thead><tr><th>종목</th><th>현재가</th><th>수량</th><th>평가금액</th><th>수익률</th><th></th></tr></thead>
    <tbody>${positions.map(p => {
      const curPrice = p.autoPrice ? (S.quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
      const { value, pnl, pnlPct } = calcPositionPnL(p, curPrice);
      const cls = pnl >= 0 ? 'pos' : 'neg';
      const sign = pnl >= 0 ? '+' : '';
      return `<tr>
        <td>${p.name || p.ticker}<br><span style="font-size:9px;color:var(--muted)">${p.ticker} · ${p.category}</span></td>
        <td class="num">${formatMoneyDetail(curPrice, p.currency)}</td>
        <td class="num">${p.shares}</td>
        <td class="num">${formatMoney(value, p.currency)}</td>
        <td class="num ${cls}">${sign}${pnlPct.toFixed(1)}%</td>
        <td class="action-cell"><button class="edit-btn" onclick="openFinPositionModal(null,'${p.id}')">✏️</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function renderLeverageSummary() {
  const el = document.getElementById('fin-leverage-summary');
  if (!el) return;
  const positions = getFinPositions();
  let levTotal = 0, cashTotal = 0;
  positions.forEach(p => {
    const price = p.autoPrice ? (S.quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    const val = price * (p.shares || 0);
    if (p.type === 'leveraged') levTotal += val; else cashTotal += val;
  });
  const total = levTotal + cashTotal;
  if (total <= 0) { el.innerHTML = ''; return; }
  const levPct = (levTotal / total * 100).toFixed(1);
  const cashPct = (cashTotal / total * 100).toFixed(1);
  el.innerHTML = `<div class="fin-leverage-summary" style="flex-direction:column">
    <div class="fin-leverage-bar"><div class="lev" style="width:${levPct}%"></div><div class="cash" style="width:${cashPct}%"></div></div>
    <div class="fin-leverage-labels"><span>레버리지 ${levPct}% (${formatUSD(levTotal)})</span><span>현금 ${cashPct}% (${formatUSD(cashTotal)})</span></div>
  </div>`;
}

export function renderTotalSummary() {
  const el = document.getElementById('fin-total-summary');
  if (!el) return;
  const positions = getFinPositions();
  let totalCost = 0, totalValue = 0;
  positions.forEach(p => {
    const price = p.autoPrice ? (S.quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    totalCost += p.avgCost * (p.shares || 0);
    totalValue += price * (p.shares || 0);
  });
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost * 100) : 0;
  const cls = pnl >= 0 ? 'positive' : 'negative';
  const sign = pnl >= 0 ? '+' : '';
  el.innerHTML = `<div class="fin-networth-row" style="margin-top:10px">
    <div class="fin-nw-card"><div class="fin-nw-label">총 투자원금</div><div class="fin-nw-val">${formatUSD(totalCost)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">현재 가치</div><div class="fin-nw-val">${formatUSD(totalValue)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">전체 손익</div><div class="fin-nw-val ${cls}">${sign}${formatUSD(pnl)} (${sign}${pnlPct.toFixed(1)}%)</div></div>
  </div>`;
}
