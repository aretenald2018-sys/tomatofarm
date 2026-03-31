// ================================================================
// finance-calc.js — 재무 계산 엔진
// 모든 금액 단위: 만원 (입력/저장/표시 모두 만원)
// ================================================================

const BIRTH_YEAR = 1994;

/**
 * 나이 계산 (한국 나이 아닌 만 나이)
 */
export function getAge(year) {
  return year - BIRTH_YEAR;
}

/**
 * 복리 프로젝션 (연도별 step-by-step)
 * 매 연도: 기초잔액 → +이자 → +기말납입 → 기말잔액
 * 명목(nominal) + 실질(real, 물가상승률 반영) 둘 다 계산
 * 모든 금액 단위: 만원
 */
export function compoundProjection(benchmark) {
  const { initialPrincipal = 0, annualRate, annualContribution, periodYears, startYear, inflationRate = 0 } = benchmark;
  const r = annualRate / 100;
  const inf = inflationRate / 100;
  const rows = [];
  let balance = initialPrincipal; // 만원

  for (let n = 1; n <= periodYears; n++) {
    const year = startYear + n - 1;
    const openBalance = balance;
    const interest = Math.round(openBalance * r);
    const contribution = annualContribution;
    const closeBalance = openBalance + interest + contribution;
    balance = closeBalance;

    // 실질가치: 현재 시점 구매력 기준 (물가상승률로 할인)
    const deflator = Math.pow(1 + inf, n);
    const realCloseBalance = Math.round(closeBalance / deflator);

    rows.push({
      year,
      age: getAge(year),
      n,
      openBalance,        // 기초잔액 (만원, 명목)
      interest,           // 연간이자 (만원, 명목)
      contribution,       // 기말납입금 (만원)
      closeBalance,       // 기말잔액 (만원, 명목)
      realCloseBalance,   // 기말잔액 (만원, 실질)
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
 * 순자산 계산 (positions는 USD, loans는 만원)
 */
export function calcNetWorth(positions, loans, quotesMap) {
  let totalAssets = 0;
  for (const p of positions) {
    const currentPrice = p.autoPrice ? (quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    totalAssets += currentPrice * (p.shares || 0);
  }
  let totalDebt = 0;
  for (const l of loans) {
    totalDebt += l.amount || 0; // 만원
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
 * 비상금 개월수 (만원 단위)
 */
export function calcEmergencyMonths(emergencyFund, monthlyExpense) {
  if (!monthlyExpense || monthlyExpense <= 0) return null;
  return Math.round((emergencyFund || 0) / monthlyExpense * 10) / 10;
}

/**
 * 만원 포맷 (재무탭 기본 단위)
 */
export function formatManwon(amount) {
  if (amount == null || isNaN(amount)) return '-';
  if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(1) + '억';
  return amount.toLocaleString() + '만';
}

/**
 * USD 포맷
 */
export function formatUSD(amount) {
  if (amount == null || isNaN(amount)) return '-';
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * 금액 포맷 (통화별)
 */
export function formatMoney(amount, currency = 'KRW') {
  if (currency === 'KRW') return formatManwon(amount);
  return formatUSD(amount);
}

/**
 * 금액 포맷 (소수점 포함, 상세용)
 */
export function formatMoneyDetail(amount, currency = 'KRW') {
  if (amount == null || isNaN(amount)) return '-';
  if (currency === 'KRW') return amount.toLocaleString() + '만원';
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
