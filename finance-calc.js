// ================================================================
// finance-calc.js — 재무 계산 엔진
// ================================================================

/**
 * 복리 프로젝션 (연도별)
 * FV = P*(1+r)^n + C*[((1+r)^n - 1)/r]
 */
export function compoundProjection(benchmark) {
  const { initialPrincipal = 0, annualRate, annualContribution, periodYears, inflationRate = 0, startYear } = benchmark;
  const r = annualRate / 100;
  const i = inflationRate / 100;
  const realR = i > 0 ? ((1 + r) / (1 + i)) - 1 : r;
  const rows = [];
  let totalContrib = initialPrincipal;

  for (let n = 0; n <= periodYears; n++) {
    const year = startYear + n;
    const nominalFV = n === 0
      ? initialPrincipal
      : initialPrincipal * Math.pow(1 + r, n) + (r > 0 ? annualContribution * ((Math.pow(1 + r, n) - 1) / r) : annualContribution * n);

    const realFV = n === 0
      ? initialPrincipal
      : initialPrincipal * Math.pow(1 + realR, n) + (realR > 0 ? annualContribution * ((Math.pow(1 + realR, n) - 1) / realR) : annualContribution * n);

    if (n > 0) totalContrib += annualContribution;

    rows.push({
      year,
      n,
      totalContribution: totalContrib,
      nominalValue: Math.round(nominalFV),
      realValue: Math.round(realFV),
      nominalGain: Math.round(nominalFV - totalContrib),
      realGain: Math.round(realFV - totalContrib),
    });
  }
  return rows;
}

/**
 * CAGR (Compound Annual Growth Rate)
 */
export function calcCAGR(startValue, endValue, years) {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * 순자산 계산
 */
export function calcNetWorth(positions, loans, quotesMap) {
  let totalAssets = 0;
  for (const p of positions) {
    const currentPrice = p.autoPrice ? (quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    totalAssets += currentPrice * (p.shares || 0);
  }
  let totalDebt = 0;
  for (const l of loans) {
    totalDebt += l.amount || 0;
  }
  return { totalAssets, totalDebt, netWorth: totalAssets - totalDebt };
}

/**
 * 부채비율
 */
export function calcDebtRatio(totalDebt, totalAssets) {
  if (totalAssets <= 0) return 0;
  return totalDebt / totalAssets;
}

/**
 * 포지션별 수익률
 */
export function calcPositionPnL(position, currentPrice) {
  const cost = position.avgCost * (position.shares || 0);
  const value = currentPrice * (position.shares || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { cost, value, pnl, pnlPct };
}

/**
 * 리밸런싱 경고 체크 — 30% 초과 종목
 */
export function checkRebalanceAlerts(positions, quotesMap, threshold = 0.3) {
  let total = 0;
  const values = positions.map(p => {
    const price = p.autoPrice ? (quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    const val = price * (p.shares || 0);
    total += val;
    return { ...p, currentValue: val };
  });
  if (total <= 0) return [];
  return values
    .filter(v => v.currentValue / total > threshold)
    .map(v => ({ ticker: v.ticker, name: v.name, pct: (v.currentValue / total * 100).toFixed(1) }));
}

/**
 * 비상금 개월수
 */
export function calcEmergencyMonths(emergencyFund, monthlyExpense) {
  if (!monthlyExpense || monthlyExpense <= 0) return null;
  return Math.round((emergencyFund || 0) / monthlyExpense * 10) / 10;
}

/**
 * 금액 포맷
 */
export function formatMoney(amount, currency = 'KRW') {
  if (amount == null || isNaN(amount)) return '-';
  if (currency === 'KRW') {
    if (Math.abs(amount) >= 100000000) return (amount / 100000000).toFixed(1) + '억';
    if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(0) + '만';
    return amount.toLocaleString() + '원';
  }
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * 금액 포맷 (소수점 포함, 상세용)
 */
export function formatMoneyDetail(amount, currency = 'KRW') {
  if (amount == null || isNaN(amount)) return '-';
  if (currency === 'KRW') return amount.toLocaleString() + '원';
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
