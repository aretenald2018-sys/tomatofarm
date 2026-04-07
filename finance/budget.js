// ================================================================
// finance/budget.js — 월간 가계부
// ================================================================

import { S } from './state.js';
import { genId } from './utils.js';
import { getFinBudgets, saveFinBudget } from '../data.js';

function _getBudgetDoc(year) {
  return getFinBudgets().find(b => b.year === year);
}

function _ensureBudgetDoc(year) {
  let doc = _getBudgetDoc(year);
  if (!doc) {
    doc = { id: genId(), year, groups: [
      { name: '생활유지비', items: [
        { name: '주거비용', target: 80, qGoals: {}, months: {} },
        { name: '보험비용', target: 9, qGoals: {}, months: {} },
        { name: '통신비용', target: 5, qGoals: {}, months: {} },
        { name: '교통비용', target: 9, qGoals: {}, months: {} },
        { name: '생활비용', target: 40, qGoals: {}, months: {} },
      ]},
      { name: '자아유지비', items: [
        { name: '교육비용', target: 12, qGoals: {}, months: {} },
        { name: '카페비용', target: 8, qGoals: {}, months: {} },
        { name: '정신건강', target: 20, qGoals: {}, months: {} },
      ]},
      { name: '변동비', items: [
        { name: '헬스미용피부', target: 0, qGoals: {}, months: {} },
        { name: '대인관계1', target: 30, qGoals: {}, months: {} },
        { name: '대인관계2', target: 10, qGoals: {}, months: {} },
        { name: '와인/야식', target: 10, qGoals: {}, months: {} },
        { name: '취미/여가/의류/쇼핑/기타', target: 10, qGoals: {}, months: {} },
      ]},
    ]};
  }
  return doc;
}

function _qMonths(q) {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

const _monthNames = ['', '1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function _shortYear(y) { return String(y).slice(-2); }

function _fmtBudget(v) {
  if (!v || v === 0) return '-';
  return v.toLocaleString();
}

export function renderBudget() {
  const ctrlEl = document.getElementById('fin-budget-controls');
  const tableEl = document.getElementById('fin-budget-table');
  if (!ctrlEl || !tableEl) return;

  const yearSel = document.getElementById('fin-budget-year');
  if (yearSel) {
    const years = new Set();
    getFinBudgets().forEach(b => years.add(b.year));
    years.add(S.budgetYear);
    const sortedYears = [...years].sort();
    yearSel.innerHTML = sortedYears.map(y =>
      `<option value="${y}"${y === S.budgetYear ? ' selected' : ''}>${y}</option>`
    ).join('');
  }

  const qTabEl = document.getElementById('fin-budget-qtabs');
  if (qTabEl) {
    qTabEl.innerHTML = [1,2,3,4].map(q =>
      `<button class="fin-q-tab${q === S.budgetQ ? ' active' : ''}" onclick="onBudgetQChange(${q})">${_shortYear(S.budgetYear)}'${q}Q</button>`
    ).join('');
  }

  const budgetDoc = _getBudgetDoc(S.budgetYear);
  if (!budgetDoc || budgetDoc.groups.length === 0) {
    tableEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:16px;text-align:center">
      가계부 데이터가 없습니다. <b>+ 그룹</b>으로 대분류를 추가하세요.
    </div>`;
    return;
  }

  const months = _qMonths(S.budgetQ);
  let html = `<div style="overflow-x:auto"><table class="fin-budget-tbl">
    <thead><tr>
      <th class="bud-name">항목</th>
      <th class="bud-num">목표/월</th>
      <th class="bud-num">${_monthNames[months[0]]}</th>
      <th class="bud-num">${_monthNames[months[1]]}</th>
      <th class="bud-num">${_monthNames[months[2]]}</th>
      <th class="bud-num">분기합</th>
      <th class="bud-num">차이</th>
    </tr></thead><tbody>`;

  let grandTarget = 0, grandMonths = [0,0,0], grandQSum = 0;

  budgetDoc.groups.forEach((grp, gi) => {
    let grpTarget = 0, grpMonths = [0,0,0], grpQSum = 0;

    html += `<tr class="bud-group-row">
      <td colspan="7">
        <span class="bud-group-name">${grp.name}</span>
        <button class="bud-edit-grp" onclick="openBudgetGroupModal(${gi})" title="그룹 수정">✏️</button>
        <button class="bud-del-grp" onclick="deleteBudgetGroup(${gi})" title="그룹 삭제">🗑️</button>
      </td>
    </tr>`;

    (grp.items || []).forEach((item, ii) => {
      const target = item.target || 0;
      const m0 = (item.months && item.months[months[0]]) || 0;
      const m1 = (item.months && item.months[months[1]]) || 0;
      const m2 = (item.months && item.months[months[2]]) || 0;
      const qSum = m0 + m1 + m2;
      const qTarget = target * 3;
      const diff = qTarget > 0 ? qSum - qTarget : 0;

      grpTarget += target;
      grpMonths[0] += m0; grpMonths[1] += m1; grpMonths[2] += m2;
      grpQSum += qSum;

      const diffCls = diff > 0 ? ' bud-over' : diff < 0 ? ' bud-under' : '';

      html += `<tr class="bud-item-row">
        <td class="bud-name">
          <span>${item.name}</span>
          <button class="bud-edit-item" onclick="openBudgetItemModal(${gi},${ii})" title="수정">✏️</button>
          <button class="bud-del-item" onclick="deleteBudgetItem(${gi},${ii})" title="삭제">🗑️</button>
        </td>
        <td class="bud-num">${_fmtBudget(target)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[0]})">${_fmtBudget(m0)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[1]})">${_fmtBudget(m1)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[2]})">${_fmtBudget(m2)}</td>
        <td class="bud-num">${_fmtBudget(qSum)}</td>
        <td class="bud-num${diffCls}">${diff > 0 ? '+' : ''}${diff !== 0 ? _fmtBudget(diff) : '-'}</td>
      </tr>`;
    });

    const grpQTarget = grpTarget * 3;
    const grpDiff = grpQTarget > 0 ? grpQSum - grpQTarget : 0;
    const grpOver = grpQTarget > 0 && grpQSum > grpQTarget;
    html += `<tr class="bud-sum-row">
      <td class="bud-name"><b>소계</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpTarget)}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[0])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[1])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[2])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpQSum)}</b></td>
      <td class="bud-num${grpOver ? ' bud-over' : ''}"><b>${grpDiff > 0 ? '+' : ''}${grpDiff !== 0 ? _fmtBudget(grpDiff) : '-'}</b></td>
    </tr>`;

    grandTarget += grpTarget;
    grandMonths[0] += grpMonths[0]; grandMonths[1] += grpMonths[1]; grandMonths[2] += grpMonths[2];
    grandQSum += grpQSum;
  });

  const grandQTarget = grandTarget * 3;
  const grandDiff = grandQTarget > 0 ? grandQSum - grandQTarget : 0;
  const totalOver = grandQTarget > 0 && grandQSum > grandQTarget;
  html += `<tr class="bud-total-row">
    <td class="bud-name"><b>TOTAL</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandTarget)}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[0])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[1])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[2])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandQSum)}</b></td>
    <td class="bud-num${totalOver ? ' bud-over' : ''}"><b>${grandDiff > 0 ? '+' : ''}${grandDiff !== 0 ? _fmtBudget(grandDiff) : '-'}</b></td>
  </tr>`;

  html += `</tbody></table></div>`;
  tableEl.innerHTML = html;
}

// ── 연도/분기 변경 ──
export function onBudgetYearChange() {
  const sel = document.getElementById('fin-budget-year');
  if (sel) S.budgetYear = parseInt(sel.value);
  renderBudget();
}

export function onBudgetQChange(q) {
  S.budgetQ = q;
  renderBudget();
}

// ── 인라인 편집 ──
export function editBudgetMonth(gi, ii, month) {
  const doc = _getBudgetDoc(S.budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item) return;
  const cur = (item.months && item.months[month]) || 0;
  const val = prompt(`${item.name} — ${_monthNames[month]} 실적 (만원):`, cur || '');
  if (val === null) return;
  if (!item.months) item.months = {};
  item.months[month] = parseFloat(val) || 0;
  saveFinBudget(doc);
  renderBudget();
}

export function editBudgetQGoal(gi, ii) {
  const doc = _getBudgetDoc(S.budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item) return;
  const cur = (item.qGoals && item.qGoals[S.budgetQ]) || 0;
  const val = prompt(`${item.name} — ${_shortYear(S.budgetYear)}'${S.budgetQ}Q 목표 (만원):`, cur || '');
  if (val === null) return;
  if (!item.qGoals) item.qGoals = {};
  item.qGoals[S.budgetQ] = parseFloat(val) || 0;
  saveFinBudget(doc);
  renderBudget();
}

// ── 그룹 추가/수정/삭제 ──
export function openBudgetGroupModal(gi) {
  const isEdit = gi !== undefined && gi !== null;
  let doc = _ensureBudgetDoc(S.budgetYear);
  const existing = isEdit ? doc.groups[gi] : null;
  const name = prompt(isEdit ? '그룹명 수정:' : '새 그룹명 (대분류):', existing?.name || '');
  if (!name) return;
  if (isEdit) {
    doc.groups[gi].name = name;
  } else {
    doc.groups.push({ name, items: [] });
  }
  saveFinBudget(doc);
  renderBudget();
}

export function deleteBudgetGroup(gi) {
  const doc = _getBudgetDoc(S.budgetYear);
  if (!doc) return;
  if (!confirm(`"${doc.groups[gi].name}" 그룹과 하위 항목을 모두 삭제할까요?`)) return;
  doc.groups.splice(gi, 1);
  saveFinBudget(doc);
  renderBudget();
}

// ── 항목 추가/수정/삭제 모달 ──
export function openBudgetItemModal(gi, ii) {
  const modal = document.getElementById('fin-budget-item-modal');
  if (!modal) return;

  const doc = _ensureBudgetDoc(S.budgetYear);
  const isEdit = gi !== undefined && gi !== null && ii !== undefined && ii !== null;
  const item = isEdit ? doc.groups[gi]?.items[ii] : null;

  document.getElementById('bud-item-modal-title').textContent = isEdit ? '항목 수정' : '항목 추가';
  document.getElementById('bud-item-gi').value = gi !== undefined && gi !== null ? gi : '';
  document.getElementById('bud-item-ii').value = isEdit ? ii : '';
  document.getElementById('bud-item-name').value = item?.name || '';
  document.getElementById('bud-item-target').value = item?.target || '';
  document.getElementById('bud-item-del-btn').style.display = isEdit ? '' : 'none';

  const grpSel = document.getElementById('bud-item-group');
  grpSel.innerHTML = doc.groups.map((g, i) =>
    `<option value="${i}"${(gi !== undefined && gi !== null && i === gi) ? ' selected' : ''}>${g.name}</option>`
  ).join('');

  modal.classList.add('open');
}

export function closeBudgetItemModal(e) {
  if (e && e.target !== document.getElementById('fin-budget-item-modal')) return;
  document.getElementById('fin-budget-item-modal')?.classList.remove('open');
}

export async function saveBudgetItemFromModal() {
  let doc = _ensureBudgetDoc(S.budgetYear);
  const gi = parseInt(document.getElementById('bud-item-group').value);
  const iiStr = document.getElementById('bud-item-ii').value;
  const isEdit = iiStr !== '';
  const ii = isEdit ? parseInt(iiStr) : -1;

  const name = document.getElementById('bud-item-name').value.trim();
  if (!name) { alert('항목명을 입력하세요'); return; }
  const target = parseFloat(document.getElementById('bud-item-target').value) || 0;

  if (isEdit) {
    const origGi = parseInt(document.getElementById('bud-item-gi').value);
    const existingItem = doc.groups[origGi]?.items[ii];
    const itemObj = existingItem ? { ...existingItem, name, target } : { name, target, qGoals: {}, months: {} };

    if (origGi !== gi) {
      doc.groups[origGi].items.splice(ii, 1);
      doc.groups[gi].items.push(itemObj);
    } else {
      doc.groups[gi].items[ii] = itemObj;
    }
  } else {
    doc.groups[gi].items.push({ name, target, qGoals: {}, months: {} });
  }

  await saveFinBudget(doc);
  closeBudgetItemModal();
  renderBudget();
}

export async function deleteBudgetItemFromModal() {
  const gi = parseInt(document.getElementById('bud-item-gi').value);
  const ii = parseInt(document.getElementById('bud-item-ii').value);
  const doc = _getBudgetDoc(S.budgetYear);
  if (!doc || !confirm('이 항목을 삭제할까요?')) return;
  doc.groups[gi].items.splice(ii, 1);
  await saveFinBudget(doc);
  closeBudgetItemModal();
  renderBudget();
}

export function deleteBudgetItem(gi, ii) {
  const doc = _getBudgetDoc(S.budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item || !confirm(`"${item.name}" 항목을 삭제할까요?`)) return;
  doc.groups[gi].items.splice(ii, 1);
  saveFinBudget(doc);
  renderBudget();
}
