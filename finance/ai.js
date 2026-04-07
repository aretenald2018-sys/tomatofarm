// ================================================================
// finance/ai.js — AI 분석
// ================================================================

import { S } from './state.js';
import { getFinPositions, getFinLoans } from '../data.js';
import { calcNetWorth, calcPositionPnL } from '../finance-calc.js';
import { callClaude } from '../ai.js';

export async function runFinAIAnalysis() {
  const el = document.getElementById('fin-ai-result');
  if (!el) return;
  el.innerHTML = `<div class="fin-ai-box"><div class="ai-content" style="color:var(--muted)">분석 중...</div></div>`;

  const positions = getFinPositions();
  const loans = getFinLoans();
  const { totalAssets, totalDebt, netWorth } = calcNetWorth(positions, loans, S.quotesMap);

  const positionSummary = positions.map(p => {
    const price = p.autoPrice ? (S.quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    const { pnlPct } = calcPositionPnL(p, price);
    return `${p.name||p.ticker}(${p.type}): ${p.shares}주 @${price}, 수익률 ${pnlPct.toFixed(1)}%`;
  }).join('\n');

  const loanSummary = loans.map(l => `${l.name}: ${l.amount}만원 @${l.interestRate}%`).join('\n');

  const marketSummary = [
    S.quotesMap.SPY ? `SPY: $${S.quotesMap.SPY.price.toFixed(2)} (${S.quotesMap.SPY.change > 0?'+':''}${S.quotesMap.SPY.change.toFixed(2)}%)` : '',
    S.quotesMap.QQQ ? `QQQ: $${S.quotesMap.QQQ.price.toFixed(2)} (${S.quotesMap.QQQ.change > 0?'+':''}${S.quotesMap.QQQ.change.toFixed(2)}%)` : '',
    S.fngData?.score != null ? `Fear & Greed: ${S.fngData.score} (${S.fngData.rating})` : '',
  ].filter(Boolean).join('\n');

  const prompt = `당신은 개인 자산관리 전문가입니다. 다음은 사용자의 포트폴리오 현황입니다.

[포지션]
${positionSummary || '없음'}

[대출/레버리지]
${loanSummary || '없음'}

[요약]
총자산: $${totalAssets.toFixed(0)}, 총부채: ${totalDebt.toLocaleString()}만원, 환율: ${S.fxRate} KRW/USD

[시장 상황]
${marketSummary || '데이터 없음'}

다음 관점에서 간결하게 분석해주세요 (한국어, 총 300자 이내):
1. 현재 포트폴리오의 리스크 수준
2. 레버리지 대비 수익률 효율성
3. 리밸런싱 필요 여부와 방향
4. 현재 시장 상황에서 고려할 점`;

  try {
    const reply = await callClaude(prompt);
    el.innerHTML = `<div class="fin-ai-box"><div class="ai-title">🤖 AI 포트폴리오 분석</div><div class="ai-content">${reply}</div></div>`;
  } catch (e) {
    el.innerHTML = `<div class="fin-ai-box"><div class="ai-content" style="color:var(--diet-bad)">분석 실패: ${e.message}</div></div>`;
  }
}
