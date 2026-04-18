// ================================================================
// home/weekly-streak.js — 주간 스트릭 미니 캘린더
// ================================================================

import { DAYS }  from '../config.js';
import { TODAY, getMuscles, getCF, dietDayOk,
         getHomeStreakDays, saveHomeStreakDays,
         getBreakfastSkipped, getLunchSkipped, getDinnerSkipped,
         isFuture, isToday }  from '../data.js';
import { getMonday } from './utils.js';

// ── 주간 스트릭 미니 캘린더 ───────────────────────────────────────
export function renderWeeklyStreak() {
  const container = document.getElementById('weekly-streak-grid');
  const label     = document.getElementById('home-streak-days-label');
  if (!container) return;

  const n = getHomeStreakDays(); // 0~6
  window._homeStreakDays = n;
  const totalDays = n + 1;

  if (label) label.textContent = `${totalDays}일`;

  const monday = getMonday(TODAY);
  const dates = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  let html = '<table class="weekly-streak-table"><thead><tr><th></th>';
  dates.forEach(d => {
    const dow = d.getDay();
    const col = dow === 0 ? '#f87171' : dow === 6 ? '#fc6a66' : 'var(--muted2)';
    const today = isToday(d.getFullYear(), d.getMonth(), d.getDate());
    html += `<th class="${today ? 'ws-today-col' : ''}"><span style="color:${col};font-size:9px;display:block">${DAYS[dow]}</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${col}">${d.getDate()}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  const rows = [
    { label: '🏋️', key: 'gym' },
    { label: '🔥', key: 'cf' },
    { label: '🥗', key: 'diet' },
  ];

  rows.forEach(r => {
    html += `<tr><td class="ws-row-label">${r.label}</td>`;
    dates.forEach(d => {
      const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
      const future = isFuture(y, m, dd);
      const today  = isToday(y, m, dd);
      let cls = 'ws-cell';
      let icon = '';

      if (future) {
        cls += ' ws-future';
      } else if (r.key === 'gym') {
        const muscles = getMuscles(y, m, dd);
        if (muscles.length) {
          cls += ' gym-on'; icon = '✓';
        }
      } else if (r.key === 'cf') {
        if (getCF(y, m, dd)) {
          cls += ' cf-on'; icon = '✓';
        }
      } else if (r.key === 'diet') {
        const dok = dietDayOk(y, m, dd);
        const bS = getBreakfastSkipped(y, m, dd);
        const lS = getLunchSkipped(y, m, dd);
        const dS = getDinnerSkipped(y, m, dd);
        if (dok === true) {
          cls += ' diet-ok'; icon = '✓';
        } else if (bS || lS || dS) {
          cls += ' diet-skipped'; icon = '✚';
        } else if (dok === false) {
          cls += ' diet-bad'; icon = '❌';
        }
      }

      if (today) cls += ' ws-today';

      html += `<td><div class="${cls}" onclick="window.openSheet(${y},${m},${dd})">${icon}</div></td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

window.changeHomeStreakDays = async function(n) {
  const clamped = Math.max(0, Math.min(6, n));
  await saveHomeStreakDays(clamped);
  renderWeeklyStreak();
};
