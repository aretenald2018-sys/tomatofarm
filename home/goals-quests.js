// ================================================================
// home/goals-quests.js — 목표, 퀘스트, 미니메모, 섹션 타이틀
// ================================================================

import { TODAY, getMuscles, getCF, dietDayOk,
         getGoals, getQuests, dateKey, getMiniMemoItems,
         getSectionTitle, getQuestOrder }  from '../data.js';
import { getMonday, quarterStart, quarterEnd } from './utils.js';

// ── 미니 메모 (체크리스트) ────────────────────────────────────────
export function renderMiniMemo() {
  const container = document.getElementById('mini-memo-list');
  if (!container) return;
  const items = getMiniMemoItems();
  if (!items.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0">항목을 추가해보세요</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="mini-memo-item ${item.checked ? 'checked' : ''}">
      <label class="mini-memo-check-label">
        <input type="checkbox" class="mini-memo-checkbox"
          ${item.checked ? 'checked' : ''}
          onchange="toggleMiniMemoItem('${item.id}')">
        <span class="mini-memo-text">${item.text}</span>
      </label>
      <button class="mini-memo-del-btn" onclick="deleteMiniMemoItem('${item.id}')">✕</button>
    </div>`).join('');
}

// ── 구역 제목 일괄 적용 ───────────────────────────────────────────
export function applyAllSectionTitles() {
  const keys = ['mini_memo','goals','quests'];
  keys.forEach(k => {
    const el = document.getElementById(`title-${k}`);
    if (el) el.textContent = getSectionTitle(k);
  });
}

// ── 목표 ─────────────────────────────────────────────────────────
export function renderGoals() {
  const container = document.getElementById('goals-section');
  if (!container) return;
  const goals = getGoals();
  if (!goals.length) {
    container.innerHTML = `
      <div class="tds-empty">
        <div class="tds-empty-icon">🎯</div>
        <div class="tds-empty-title">아직 목표가 없어요</div>
        <div class="tds-empty-desc">작은 목표부터 시작해볼까요?</div>
        <button class="tds-btn tonal" onclick="openGoalModal()">+ 목표 추가</button>
      </div>`;
    return;
  }

  const todayStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  container.innerHTML = goals.map(g => {
    let ddayStr = '';
    if (g.dday) {
      const diff = Math.ceil((new Date(g.dday) - new Date(todayStr)) / 86400000);
      ddayStr = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : `D+${Math.abs(diff)}`;
    }

    let aiHtml = '';
    if (g.aiAnalysis) {
      const { feasibility, realisticDate, summary } = g.aiAnalysis;
      const color = feasibility >= 70 ? 'var(--diet-ok)' : feasibility >= 40 ? 'var(--accent)' : 'var(--diet-bad)';
      aiHtml = `<div class="goal-ai-block" style="margin-top:8px;padding:8px;background:var(--surface2);border-radius:8px;font-size:11px;color:var(--muted)">
        <span style="color:${color};font-weight:700">${feasibility}% 달성 가능</span>
        ${realisticDate ? ` · 예상: ${realisticDate}` : ''}
        ${summary ? `<div style="margin-top:4px">${summary}</div>` : ''}
      </div>`;
    }

    return `<div class="goal-item">
      <div class="goal-item-header">
        <span class="goal-label">${g.label}</span>
        <div class="goal-item-actions">
          ${ddayStr ? `<span class="goal-dday">${ddayStr}</span>` : ''}
          <button class="goal-ai-btn" onclick="analyzeGoalFeasibility('${g.id}')" title="AI 분석">🤖</button>
          <button class="goal-del-btn" onclick="deleteGoalItem('${g.id}')">✕</button>
        </div>
      </div>
      ${aiHtml}
    </div>`;
  }).join('');

  container.innerHTML += `<div style="text-align:center;margin-top:10px">
    <button class="quest-add-btn" onclick="openGoalModal()" style="padding:4px 16px">+ 목표 추가</button>
  </div>`;
}

// ── 퀘스트 보드 ──────────────────────────────────────────────────
export function renderQuests() {
  const quests = getQuests();
  const order  = getQuestOrder();
  const now    = TODAY;
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  ['quarterly','monthly','weekly','daily'].forEach(type => {
    const container = document.getElementById(`${type}-quests`);
    if (!container) return;

    const list = order.includes(type) || true
      ? quests.filter(q => q.type === type)
      : [];

    if (!list.length) {
      container.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0;text-align:center">없음</div>';
      return;
    }

    container.innerHTML = list.map(q => {
      const { done, current, target } = questProgress(q, now, todayKey);
      const pct = target > 1 ? Math.min(Math.round(current / target * 100), 100) : (done ? 100 : 0);
      const isAuto = q.auto;

      let ddayStr = '';
      if (q.dday) {
        const diff = Math.ceil((new Date(q.dday) - new Date(todayKey)) / 86400000);
        ddayStr = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '';
      }

      return `<div class="quest-item ${done ? 'done' : ''}">
        <div class="quest-item-main">
          ${!isAuto && type === 'daily'
            ? `<input type="checkbox" class="quest-check" ${done ? 'checked' : ''} onchange="toggleQuestCheck('${q.id}')">`
            : ''}
          <span class="quest-item-title">${q.title}${ddayStr ? ` <span class="goal-dday" style="font-size:9px">${ddayStr}</span>` : ''}</span>
          <button class="quest-item-edit" onclick="openQuestEditModal('${q.id}')">✏️</button>
          <button class="goal-del-btn" onclick="deleteQuestItem('${q.id}')">✕</button>
        </div>
        ${target > 1 ? `
          <div class="quest-progress-row">
            <div class="quest-prog-bar"><div class="quest-prog-fill" style="width:${pct}%"></div></div>
            <span class="quest-prog-label">${current}/${target}</span>
          </div>` : ''}
      </div>`;
    }).join('');
  });
}

function questProgress(q, now, todayKey) {
  const checks = q.checks || {};
  const type   = q.type;

  if (type === 'daily') {
    if (q.auto) {
      const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
      const hasDone = q.autoType === 'workout'
        ? (getMuscles(y,m,d).length > 0 || getCF(y,m,d))
        : dietDayOk(y,m,d) === true;
      return { done: hasDone, current: hasDone ? 1 : 0, target: 1 };
    }
    const done = !!checks[todayKey];
    return { done, current: done ? 1 : 0, target: 1 };
  }

  const keys   = Object.keys(checks).filter(k => checks[k]);
  let filtered = [];
  if (type === 'weekly') {
    const mon = getMonday(now);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const monStr = dateKey(mon.getFullYear(), mon.getMonth(), mon.getDate());
    const sunStr = dateKey(sun.getFullYear(), sun.getMonth(), sun.getDate());
    filtered = keys.filter(k => k >= monStr && k <= sunStr);
  } else if (type === 'monthly') {
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    filtered = keys.filter(k => k.startsWith(prefix));
  } else {
    const qStart = quarterStart(now);
    const qEnd   = quarterEnd(now);
    filtered = keys.filter(k => k >= qStart && k <= qEnd);
  }

  if (q.auto) {
    filtered = autoCountInPeriod(q.autoType, type, now);
  }

  const current = filtered.length;
  const target  = q.target || 1;
  return { done: current >= target, current, target };
}

function autoCountInPeriod(autoType, periodType, now) {
  let dates = [];
  if (periodType === 'weekly') {
    const mon = getMonday(now);
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      dates.push([d.getFullYear(), d.getMonth(), d.getDate()]);
    }
  } else if (periodType === 'monthly') {
    const y = now.getFullYear(), m = now.getMonth();
    for (let d = 1; d <= new Date(y, m+1, 0).getDate(); d++) dates.push([y, m, d]);
  }
  return dates.filter(([y,m,d]) => {
    return autoType === 'workout'
      ? (getMuscles(y,m,d).length > 0 || getCF(y,m,d))
      : dietDayOk(y,m,d) === true;
  });
}

// ── 퀘스트 드래그 앤 드롭 ────────────────────────────────────────
export function initQuestDragDrop() {
  const containers = document.querySelectorAll('.quest-type-section');
  containers.forEach(sec => {
    const items = sec.querySelectorAll('.quest-item');
    items.forEach(item => {
      item.draggable = true;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', item.dataset.id);
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
    });
    sec.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = sec.querySelector('.dragging');
      if (!dragging) return;
      const afterEl = [...sec.querySelectorAll('.quest-item:not(.dragging)')].reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
      if (afterEl) sec.insertBefore(dragging, afterEl);
      else sec.appendChild(dragging);
    });
  });
}