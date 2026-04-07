// ================================================================
// finance/modals.js — 모달 핸들러 (벤치마크, 실적, 계획, 대출, 포지션)
// ================================================================

import { genId } from './utils.js';
import {
  getFinBenchmarks, saveFinBenchmark, deleteFinBenchmark,
  getFinActuals, saveFinActual, deleteFinActual,
  getFinLoans, saveFinLoan, deleteFinLoan,
  getFinPositions, saveFinPosition, deleteFinPosition,
  getFinPlans, saveFinPlan, deleteFinPlan,
} from '../data.js';

// ── deps (renderFinance 콜백) ──
let _renderFinance = null;
export function setModalDeps({ renderFinance }) { _renderFinance = renderFinance; }

// ── 벤치마크 ──
export function openFinBenchmarkModal(id) {
  const modal = document.getElementById('fin-benchmark-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-bench-modal-title');
  const delBtn = document.getElementById('fin-bench-del-btn');

  if (id) {
    const b = getFinBenchmarks().find(x => x.id === id);
    if (!b) return;
    titleEl.textContent = '벤치마크 수정';
    delBtn.style.display = '';
    document.getElementById('fin-bench-id').value = b.id;
    document.getElementById('fin-bench-name').value = b.name || '';
    document.getElementById('fin-bench-startYear').value = b.startYear || 2026;
    document.getElementById('fin-bench-period').value = b.periodYears || 20;
    document.getElementById('fin-bench-rate').value = b.annualRate || 7;
    document.getElementById('fin-bench-inflation').value = b.inflationRate || 0;
    document.getElementById('fin-bench-principal').value = b.initialPrincipal || 0;
    document.getElementById('fin-bench-contribution').value = b.annualContribution || 0;
  } else {
    titleEl.textContent = '벤치마크 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-bench-id').value = '';
    document.getElementById('fin-bench-name').value = '';
    document.getElementById('fin-bench-startYear').value = new Date().getFullYear();
    document.getElementById('fin-bench-period').value = 20;
    document.getElementById('fin-bench-rate').value = 7;
    document.getElementById('fin-bench-inflation').value = 2.5;
    document.getElementById('fin-bench-principal').value = 5000;
    document.getElementById('fin-bench-contribution').value = 2000;
  }
  modal.classList.add('open');
}

export function closeFinBenchmarkModal(e) {
  if (e && e.target !== document.getElementById('fin-benchmark-modal')) return;
  document.getElementById('fin-benchmark-modal')?.classList.remove('open');
}

export async function saveFinBenchmarkFromModal() {
  const id = document.getElementById('fin-bench-id').value || genId();
  await saveFinBenchmark({
    id,
    name: document.getElementById('fin-bench-name').value,
    startYear: parseInt(document.getElementById('fin-bench-startYear').value),
    periodYears: parseInt(document.getElementById('fin-bench-period').value),
    annualRate: parseFloat(document.getElementById('fin-bench-rate').value),
    inflationRate: parseFloat(document.getElementById('fin-bench-inflation').value) || 0,
    initialPrincipal: parseFloat(document.getElementById('fin-bench-principal').value) || 0,
    annualContribution: parseFloat(document.getElementById('fin-bench-contribution').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinBenchmarkModal();
  if (_renderFinance) _renderFinance();
}

export async function deleteFinBenchmarkDirect(id) {
  if (!confirm('이 벤치마크를 삭제할까요?')) return;
  await deleteFinBenchmark(id);
  if (_renderFinance) _renderFinance();
}

export async function deleteFinBenchmarkFromModal() {
  const id = document.getElementById('fin-bench-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinBenchmark(id);
  closeFinBenchmarkModal();
  if (_renderFinance) _renderFinance();
}

// ── 현실 (연간 실적) ──
export function openFinActualModal(id) {
  const modal = document.getElementById('fin-actual-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-actual-modal-title');
  const delBtn = document.getElementById('fin-actual-del-btn');

  if (id) {
    const a = getFinActuals().find(x => x.id === id);
    if (!a) return;
    titleEl.textContent = '연간 실적 수정';
    delBtn.style.display = '';
    document.getElementById('fin-actual-id').value = a.id;
    document.getElementById('fin-actual-year').value = a.year;
    document.getElementById('fin-actual-saved').value = a.cumulativeSaved || 0;
    document.getElementById('fin-actual-networth').value = a.netWorth || 0;
    document.getElementById('fin-actual-emergency').value = a.emergencyFund || 0;
    document.getElementById('fin-actual-expense').value = a.monthlyExpense || 0;
    document.getElementById('fin-actual-inflow').value = a.inflow || 0;
    document.getElementById('fin-actual-foutflow').value = a.fOutflow || 0;
  } else {
    titleEl.textContent = '연간 실적 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-actual-id').value = '';
    document.getElementById('fin-actual-year').value = new Date().getFullYear();
    document.getElementById('fin-actual-saved').value = 0;
    document.getElementById('fin-actual-networth').value = 0;
    document.getElementById('fin-actual-emergency').value = 0;
    document.getElementById('fin-actual-expense').value = 0;
    document.getElementById('fin-actual-inflow').value = 0;
    document.getElementById('fin-actual-foutflow').value = 0;
  }
  modal.classList.add('open');
}

export function closeFinActualModal(e) {
  if (e && e.target !== document.getElementById('fin-actual-modal')) return;
  document.getElementById('fin-actual-modal')?.classList.remove('open');
}

export async function saveFinActualFromModal() {
  const id = document.getElementById('fin-actual-id').value || genId();
  await saveFinActual({
    id,
    year: parseInt(document.getElementById('fin-actual-year').value),
    cumulativeSaved: parseFloat(document.getElementById('fin-actual-saved').value) || 0,
    netWorth: parseFloat(document.getElementById('fin-actual-networth').value) || 0,
    emergencyFund: parseFloat(document.getElementById('fin-actual-emergency').value) || 0,
    monthlyExpense: parseFloat(document.getElementById('fin-actual-expense').value) || 0,
    inflow: parseFloat(document.getElementById('fin-actual-inflow').value) || 0,
    fOutflow: parseFloat(document.getElementById('fin-actual-foutflow').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinActualModal();
  if (_renderFinance) _renderFinance();
}

export async function deleteFinActualFromModal() {
  const id = document.getElementById('fin-actual-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinActual(id);
  closeFinActualModal();
  if (_renderFinance) _renderFinance();
}

// ── 계획실적 ──
export function openFinPlanModal(id) {
  const modal = document.getElementById('fin-plan-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-plan-modal-title');
  const delBtn = document.getElementById('fin-plan-del-btn');
  const entriesEl = document.getElementById('fin-plan-entries');

  if (id) {
    const p = getFinPlans().find(x => x.id === id);
    if (!p) return;
    titleEl.textContent = '계획실적 수정';
    delBtn.style.display = '';
    document.getElementById('fin-plan-id').value = p.id;
    document.getElementById('fin-plan-name').value = p.name || '';
    entriesEl.innerHTML = '';
    (p.entries || []).sort((a, b) => a.year - b.year).forEach(e => {
      _addPlanEntryRow(entriesEl, e.year, e.target);
    });
  } else {
    titleEl.textContent = '계획실적 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-plan-id').value = '';
    document.getElementById('fin-plan-name').value = '';
    entriesEl.innerHTML = '';
    _addPlanEntryRow(entriesEl, new Date().getFullYear(), 0);
  }
  modal.classList.add('open');
}

function _addPlanEntryRow(container, year, target) {
  const row = document.createElement('div');
  row.className = 'fin-modal-row fin-plan-entry';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <div class="fin-modal-field" style="flex:1">
      <label>연도</label>
      <input type="number" class="fin-plan-year" value="${year}">
    </div>
    <div class="fin-modal-field" style="flex:1">
      <label>목표 기말잔액 (만원)</label>
      <input type="number" class="fin-plan-target" value="${target}" placeholder="5000 = 5천만원">
    </div>
    <button class="fin-del-btn" onclick="this.parentElement.remove()" style="margin-top:18px;padding:4px 8px;font-size:12px">✕</button>
  `;
  container.appendChild(row);
}

export function addFinPlanEntry() {
  const container = document.getElementById('fin-plan-entries');
  if (!container) return;
  const rows = container.querySelectorAll('.fin-plan-entry');
  const lastYear = rows.length > 0
    ? parseInt(rows[rows.length - 1].querySelector('.fin-plan-year').value) + 1
    : new Date().getFullYear();
  _addPlanEntryRow(container, lastYear, 0);
}

export function closeFinPlanModal(e) {
  if (e && e.target !== document.getElementById('fin-plan-modal')) return;
  document.getElementById('fin-plan-modal')?.classList.remove('open');
}

export async function saveFinPlanFromModal() {
  const id = document.getElementById('fin-plan-id').value || genId();
  const name = document.getElementById('fin-plan-name').value;
  const rows = document.querySelectorAll('#fin-plan-entries .fin-plan-entry');
  const entries = [];
  rows.forEach(row => {
    const year = parseInt(row.querySelector('.fin-plan-year').value);
    const target = parseFloat(row.querySelector('.fin-plan-target').value) || 0;
    if (year && target) entries.push({ year, target });
  });

  await saveFinPlan({ id, name, entries, createdAt: new Date().toISOString() });
  closeFinPlanModal();
  if (_renderFinance) _renderFinance();
}

export async function deleteFinPlanDirect(id) {
  if (!confirm('이 계획실적을 삭제할까요?')) return;
  await deleteFinPlan(id);
  if (_renderFinance) _renderFinance();
}

export async function deleteFinPlanFromModal() {
  const id = document.getElementById('fin-plan-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinPlan(id);
  closeFinPlanModal();
  if (_renderFinance) _renderFinance();
}

// ── 대출 ──
export function openFinLoanModal(id) {
  const modal = document.getElementById('fin-loan-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-loan-modal-title');
  const delBtn = document.getElementById('fin-loan-del-btn');

  if (id) {
    const l = getFinLoans().find(x => x.id === id);
    if (!l) return;
    titleEl.textContent = '대출 수정';
    delBtn.style.display = '';
    document.getElementById('fin-loan-id').value = l.id;
    document.getElementById('fin-loan-name').value = l.name || '';
    document.getElementById('fin-loan-amount').value = l.amount || 0;
    document.getElementById('fin-loan-rate').value = l.interestRate || 0;
    document.getElementById('fin-loan-monthly').value = l.monthlyPayment || 0;
    document.getElementById('fin-loan-type').value = l.type || 'margin';
    document.getElementById('fin-loan-start').value = l.startDate || '';
    document.getElementById('fin-loan-end').value = l.endDate || '';
  } else {
    titleEl.textContent = '대출 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-loan-id').value = '';
    document.getElementById('fin-loan-name').value = '';
    document.getElementById('fin-loan-amount').value = 0;
    document.getElementById('fin-loan-rate').value = 5;
    document.getElementById('fin-loan-monthly').value = 0;
    document.getElementById('fin-loan-type').value = 'margin';
    document.getElementById('fin-loan-start').value = '';
    document.getElementById('fin-loan-end').value = '';
  }
  modal.classList.add('open');
}

export function closeFinLoanModal(e) {
  if (e && e.target !== document.getElementById('fin-loan-modal')) return;
  document.getElementById('fin-loan-modal')?.classList.remove('open');
}

export async function saveFinLoanFromModal() {
  const id = document.getElementById('fin-loan-id').value || genId();
  await saveFinLoan({
    id,
    name: document.getElementById('fin-loan-name').value,
    amount: parseFloat(document.getElementById('fin-loan-amount').value) || 0,
    interestRate: parseFloat(document.getElementById('fin-loan-rate').value) || 0,
    monthlyPayment: parseFloat(document.getElementById('fin-loan-monthly').value) || 0,
    type: document.getElementById('fin-loan-type').value,
    startDate: document.getElementById('fin-loan-start').value,
    endDate: document.getElementById('fin-loan-end').value,
    createdAt: new Date().toISOString(),
  });
  closeFinLoanModal();
  if (_renderFinance) _renderFinance();
}

export async function deleteFinLoanFromModal() {
  const id = document.getElementById('fin-loan-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinLoan(id);
  closeFinLoanModal();
  if (_renderFinance) _renderFinance();
}

// ── 포지션 ──
export function openFinPositionModal(defaultType, id) {
  const modal = document.getElementById('fin-position-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-pos-modal-title');
  const delBtn = document.getElementById('fin-pos-del-btn');

  if (id) {
    const p = getFinPositions().find(x => x.id === id);
    if (!p) return;
    titleEl.textContent = '포지션 수정';
    delBtn.style.display = '';
    document.getElementById('fin-pos-id').value = p.id;
    document.getElementById('fin-pos-ticker').value = p.ticker || '';
    document.getElementById('fin-pos-name').value = p.name || '';
    document.getElementById('fin-pos-type').value = p.type || 'cash';
    document.getElementById('fin-pos-category').value = p.category || 'stock';
    document.getElementById('fin-pos-shares').value = p.shares || 0;
    document.getElementById('fin-pos-avgcost').value = p.avgCost || 0;
    document.getElementById('fin-pos-date').value = p.purchaseDate || '';
    document.getElementById('fin-pos-currency').value = p.currency || 'USD';
    document.getElementById('fin-pos-autoprice').value = p.autoPrice ? 'true' : 'false';
    document.getElementById('fin-pos-manualprice').value = p.manualPrice || 0;
  } else {
    titleEl.textContent = '포지션 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-pos-id').value = '';
    document.getElementById('fin-pos-ticker').value = '';
    document.getElementById('fin-pos-name').value = '';
    document.getElementById('fin-pos-type').value = defaultType || 'cash';
    document.getElementById('fin-pos-category').value = 'stock';
    document.getElementById('fin-pos-shares').value = 0;
    document.getElementById('fin-pos-avgcost').value = 0;
    document.getElementById('fin-pos-date').value = '';
    document.getElementById('fin-pos-currency').value = 'USD';
    document.getElementById('fin-pos-autoprice').value = 'true';
    document.getElementById('fin-pos-manualprice').value = 0;
  }
  modal.classList.add('open');
}

export function closeFinPositionModal(e) {
  if (e && e.target !== document.getElementById('fin-position-modal')) return;
  document.getElementById('fin-position-modal')?.classList.remove('open');
}

export async function saveFinPositionFromModal() {
  const id = document.getElementById('fin-pos-id').value || genId();
  await saveFinPosition({
    id,
    ticker: document.getElementById('fin-pos-ticker').value.toUpperCase(),
    name: document.getElementById('fin-pos-name').value,
    type: document.getElementById('fin-pos-type').value,
    category: document.getElementById('fin-pos-category').value,
    shares: parseFloat(document.getElementById('fin-pos-shares').value) || 0,
    avgCost: parseFloat(document.getElementById('fin-pos-avgcost').value) || 0,
    purchaseDate: document.getElementById('fin-pos-date').value,
    currency: document.getElementById('fin-pos-currency').value,
    autoPrice: document.getElementById('fin-pos-autoprice').value === 'true',
    manualPrice: parseFloat(document.getElementById('fin-pos-manualprice').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinPositionModal();
  if (_renderFinance) _renderFinance();
}

export async function deleteFinPositionFromModal() {
  const id = document.getElementById('fin-pos-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinPosition(id);
  closeFinPositionModal();
  if (_renderFinance) _renderFinance();
}
