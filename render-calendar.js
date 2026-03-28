// ================================================================
// render-calendar.js  — Streak 탭 (연간 캘린더)
// ================================================================

import { MONTHS, DAYS }                                          from './config.js';
import { getMuscles, getCF, dietDayOk, getExList,
         daysInMonth, isToday, isFuture, isBeforeStart,
         getGymSkip, getGymHealth, getCFSkip, getCFHealth,
         getBreakfastSkipped, getLunchSkipped, getDinnerSkipped,
         getEvents, dateKey, getStreakSettings }                 from './data.js';
import { MUSCLES }                                               from './config.js';

let _currentYear = new Date().getFullYear();
export const getCurrentYear = () => _currentYear;

export function changeYear(delta) {
  _currentYear += delta;
  renderCalendar();
}
export function renderCalendar() {
  document.getElementById('year-label').textContent = _currentYear + '년';
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const days = daysInMonth(_currentYear, m);

    // ── 해당 월 전체가 앱 시작일 이전이면 스킵 ──
    if (isBeforeStart(_currentYear, m, days)) continue;

    const sec  = document.createElement('div'); sec.className = 'month-section';
    const hdr  = document.createElement('div'); hdr.className = 'month-header';
    hdr.textContent = _currentYear + '년 ' + MONTHS[m];
    hdr.style.cursor = 'pointer';
    hdr.addEventListener('click', () => {
      window.openMonthlyCalendarModal(_currentYear, m);
    });
    sec.appendChild(hdr);

    const wrap  = document.createElement('div'); wrap.className = 'grid-wrap';
    const table = document.createElement('table'); table.className = 'grid-table';
    table.appendChild(_makeHead(_currentYear, m, days));

    const tbody = document.createElement('tbody');
    tbody.appendChild(_gymRow(_currentYear, m, days));
    tbody.appendChild(_cfRow(_currentYear, m, days));
    tbody.appendChild(_dietRow(_currentYear, m, days));
    tbody.appendChild(_scheduleRow(_currentYear, m, days));
    table.appendChild(tbody);

    wrap.appendChild(table);

    sec.appendChild(wrap); cal.appendChild(sec);
  }
  _applyStreakSettings();
}

// ── 내부 빌더 ─────────────────────────────────────────────────────
function _makeHead(year, m, days) {
  const thead = document.createElement('thead');
  const hrow  = document.createElement('tr');
  const eTh   = document.createElement('th'); eTh.style.minWidth = '52px'; hrow.appendChild(eTh);
  for (let d = 1; d <= days; d++) {
    const th  = document.createElement('th');
    if (isBeforeStart(year, m, d)) {
      th.style.display = 'none';
      hrow.appendChild(th);
      continue;
    }
    const dow      = new Date(year, m, d).getDay();
    const col      = dow===0?'#f87171':dow===6?'#60a5fa':'#6b7280';
    const cfHealth = getCFHealth(year, m, d);
    const gymHealth= getGymHealth(year, m, d);

    let healthMark = '';
    if (cfHealth || gymHealth) {
      healthMark = `<span style="color:#22c55e;font-size:8px;display:block;line-height:1">🏥</span>`;
    }

    th.innerHTML = `<span style="color:${col};display:block;font-size:9px">${DAYS[dow]}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:9px">${d}</span>
      ${healthMark}`;
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  return thead;
}

function _gymRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td'); lbl.className='row-label'; lbl.textContent='🏋️ 헬스'; row.appendChild(lbl);
  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) { td.style.display = 'none'; row.appendChild(td); continue; }

    const muscles    = getMuscles(year, m, d);
    const gymSkip    = getGymSkip(year, m, d);
    const gymHealth  = getGymHealth(year, m, d);
    const cell       = _makeCell(year, m, d);

    if (gymHealth) {
      cell.classList.add('health-issue');
      const ic = document.createElement('span'); ic.className='cell-icon health-cross'; ic.textContent='✚'; cell.appendChild(ic);
    } else if (muscles.length) {
      cell.classList.add('gym-on');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='🔥'; cell.appendChild(ic);
      const dots = document.createElement('div'); dots.className='muscle-dots';
      muscles.slice(0,4).forEach(mid => {
        const mc  = MUSCLES.find(x => x.id===mid);
        const dot = document.createElement('div'); dot.className='muscle-dot';
        dot.style.background = mc?.color || '#888'; dots.appendChild(dot);
      });
      cell.appendChild(dots);
    } else if (gymSkip) {
      cell.classList.add('skip-disabled');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='❌'; cell.appendChild(ic);
    }
    td.appendChild(cell); row.appendChild(td);
  }
  return row;
}

function _cfRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td'); lbl.className='row-label'; lbl.textContent='🔥 클핏'; row.appendChild(lbl);
  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) { td.style.display = 'none'; row.appendChild(td); continue; }

    const cfSkip   = getCFSkip(year, m, d);
    const cfHealth = getCFHealth(year, m, d);
    const cell     = _makeCell(year, m, d);

    if (cfHealth) {
      cell.classList.add('health-issue');
      const ic = document.createElement('span'); ic.className='cell-icon health-cross'; ic.textContent='✚'; cell.appendChild(ic);
    } else if (getCF(year, m, d)) {
      cell.classList.add('cf-on');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='🔥'; cell.appendChild(ic);
    } else if (cfSkip) {
      cell.classList.add('skip-disabled');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='❌'; cell.appendChild(ic);
    }
    td.appendChild(cell); row.appendChild(td);
  }
  return row;
}

function _dietRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td');
  lbl.className='row-label';
  lbl.textContent='🥗 식단';
  row.appendChild(lbl);

  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) {
      td.style.display = 'none';
      row.appendChild(td);
      continue;
    }

    const dok = dietDayOk(year, m, d);
    const cell = _makeCell(year, m, d);

    // 굶었음 상태 확인
    const bSkipped = getBreakfastSkipped(year, m, d);
    const lSkipped = getLunchSkipped(year, m, d);
    const dSkipped = getDinnerSkipped(year, m, d);
    const anySkipped = bSkipped || lSkipped || dSkipped;

    // 표시 로직 (우선순위: 성공 -> 굶었음 -> 실패)
    if (dok === true) {
      cell.classList.add('diet-ok');
      const ic = document.createElement('span');
      ic.className='cell-icon';
      ic.textContent='🔥';
      cell.appendChild(ic);
    } else if (anySkipped) {
      cell.classList.add('diet-skipped');
      const ic = document.createElement('span');
      ic.className='cell-icon';
      ic.textContent='✚';
      cell.appendChild(ic);
    } else if (dok === false) {
      cell.classList.add('diet-bad');
      const ic = document.createElement('span');
      ic.className='cell-icon';
      ic.textContent='❌';
      cell.appendChild(ic);
    }

    td.appendChild(cell);
    row.appendChild(td);
  }
  return row;
}

function _makeCell(y, m, d) {
  const cell = document.createElement('div'); cell.className = 'cell';
  if (isToday(y,m,d))  cell.classList.add('today-cell');
  if (isFuture(y,m,d)) cell.classList.add('future');
  const dn = document.createElement('div'); dn.className='day-num'; dn.textContent=d; cell.appendChild(dn);
  cell.addEventListener('click', () => { if (!isFuture(y,m,d)) window.openSheet(y,m,d); });
  return cell;
}

// ── 스케줄 행 ──────────────────────────────────────────────────────
function _scheduleRow(year, m, days) {
  const visibleDays = [];
  for (let d = 1; d <= days; d++) {
    if (!isBeforeStart(year, m, d)) visibleDays.push(d);
  }
  const N = visibleDays.length;
  if (N === 0) return null;

  const mStr   = String(m + 1).padStart(2, '0');
  const mStart = `${year}-${mStr}-01`;
  const mEnd   = `${year}-${mStr}-${String(days).padStart(2, '0')}`;
  const events = getEvents().filter(ev => ev.start <= mEnd && ev.end >= mStart);

  // 트랙 배정
  const BAR_H = 20, BAR_GAP = 2;
  const tracks = [];
  const evTracks = events.map(ev => {
    const s = ev.start < mStart ? mStart : ev.start;
    const e = ev.end   > mEnd   ? mEnd   : ev.end;
    for (let t = 0; t < tracks.length; t++) {
      if (!tracks[t].some(r => r.s <= e && r.e >= s)) {
        tracks[t].push({ s, e }); return t;
      }
    }
    tracks.push([{ s, e }]); return tracks.length - 1;
  });

  const totalH = Math.max(112, tracks.length * (BAR_H + BAR_GAP) + BAR_GAP);

  const row = document.createElement('tr');
  const lbl = document.createElement('td');
  lbl.className = 'row-label'; lbl.textContent = '📅 일정';
  row.appendChild(lbl);

  // dateKey → visible index 맵
  const dayToIdx = {};
  visibleDays.forEach((d, i) => { dayToIdx[dateKey(year, m, d)] = i; });

  // 드래그 상태
  let dragStart = null, dragEnd = null;

  for (let i = 0; i < N; i++) {
    const d = visibleDays[i];
    const td = document.createElement('td');
    td.className = 'schedule-cell';
    td.dataset.date = dateKey(year, m, d);
    td.style.position = 'relative';
    td.style.padding = '0';
    td.style.height = `${totalH}px`;
    td.style.verticalAlign = 'top';
    td.style.cursor = 'crosshair';

    // 절대 위치 컨테이너
    const container = document.createElement('div');
    container.style.cssText = `position:absolute;top:0;left:0;right:0;height:${totalH}px;pointer-events:none;`;

    // 이벤트 바들 렌더링
    events.forEach((ev, idx) => {
      const cStart   = ev.start < mStart ? mStart : ev.start;
      const cEnd     = ev.end   > mEnd   ? mEnd   : ev.end;
      const idxS     = dayToIdx[cStart];
      const idxE     = dayToIdx[cEnd];
      if (idxS === undefined || idxE === undefined) return;
      if (i !== idxS) return;  // 시작 셀에서만 처리

      const track = evTracks[idx];
      const span = idxE - idxS + 1;  // 일정이 이 달에 며칠 동안 이어지는지 계산

      const bar = document.createElement('div');
      bar.className = 'schedule-event-bar';

      // 월을 넘어가는 일정일 경우 모서리를 직각으로 처리하기 위한 진짜 시작/종료 판별
      const isRealStart = ev.start >= mStart;
      const isRealEnd   = ev.end <= mEnd;

      bar.style.cssText = [
        `position:absolute`,
        `left:0`,
        `width:calc(${span * 100}% + ${span}px)`,
        `top:${BAR_GAP + track * (BAR_H + BAR_GAP)}px`,
        `height:${BAR_H}px`,
        `background:${ev.color || '#f59e0b'}`,
        `border-radius:${isRealStart ? '4px' : '0'} ${isRealEnd ? '4px' : '0'} ${isRealEnd ? '4px' : '0'} ${isRealStart ? '4px' : '0'}`,
        `pointer-events:auto`,
        `cursor:pointer`,
        `display:flex`,
        `align-items:center`,
        `overflow:hidden`,
        `transition:opacity .12s`,
        `z-index:2`,
      ].join(';');

      const prefix = !isRealStart ? '← ' : '';
      const suffix = !isRealEnd ? ' →' : '';
      bar.innerHTML = `<span class="event-bar-title" style="padding-left: 4px;">${prefix}${ev.title}${suffix}</span>`;
      bar.addEventListener('click', e => {
        e.stopPropagation();
        window.openCalEventModal(ev.start, ev.end, ev.id);
      });
      container.appendChild(bar);
    });

    td.appendChild(container);
    row.appendChild(td);
  }

  // 드래그 이벤트 (월간달력과 동일한 방식)
  function getDate(el) {
    const cell = el?.closest?.('.schedule-cell');
    if (!cell) return null;
    const d = cell.dataset.date;
    return d || null;
  }

  function highlight(s, e) {
    const lo = s <= e ? s : e;
    const hi = s <= e ? e : s;
    row.querySelectorAll('.schedule-cell[data-date]').forEach(c => {
      c.classList.toggle('drag-highlight', c.dataset.date >= lo && c.dataset.date <= hi);
    });
  }

  function clear() {
    row.querySelectorAll('.drag-highlight').forEach(c => c.classList.remove('drag-highlight'));
  }

  // Mouse
  row.addEventListener('mousedown', e => {
    const d = getDate(e.target);
    if (!d) return;
    dragStart = d;
    dragEnd = d;
    e.preventDefault();
  });

  row.addEventListener('mousemove', e => {
    if (!dragStart) return;
    const d = getDate(e.target);
    if (!d || d === dragEnd) return;
    dragEnd = d;
    highlight(dragStart, dragEnd);
  });

  const onUp = () => {
    if (!dragStart) return;
    clear();
    if (dragEnd) {
      const s = dragStart <= dragEnd ? dragStart : dragEnd;
      const e = dragStart <= dragEnd ? dragEnd : dragStart;
      window.openCalEventModal(s, e, null);
    }
    dragStart = null;
    dragEnd = null;
  };
  document.addEventListener('mouseup', onUp);

  return row;
}

// ── Streak 설정 적용 ──────────────────────────────────────────────
function _applyStreakSettings() {
  const settings = getStreakSettings();

  // 폰트 사이즈 맵핑
  const fontSizeMap = {
    'small': '8px',
    'default': '10px',
    'large': '12px'
  };

  // 셀 너비 맵핑
  const cellWidthMap = {
    'small': '28px',
    'default': '34px',
    'large': '42px'
  };

  const fontSize = fontSizeMap[settings.fontSizeMode] || fontSizeMap['default'];
  const cellWidth = cellWidthMap[settings.cellWidthMode] || cellWidthMap['default'];

  // 이벤트 바 제목 폰트 사이즈 적용
  const eventBarTitles = document.querySelectorAll('.event-bar-title');
  eventBarTitles.forEach(el => {
    el.style.fontSize = fontSize;
  });

  // 셀 너비 적용
  const gridTables = document.querySelectorAll('.grid-table');
  gridTables.forEach(table => {
    // th 요소들의 너비 수정
    const ths = table.querySelectorAll('th');
    ths.forEach(th => {
      th.style.minWidth = cellWidth;
      th.style.width = cellWidth;
    });

    // td 셀들의 너비 수정
    const cells = table.querySelectorAll('.cell');
    cells.forEach(cell => {
      cell.style.minWidth = cellWidth;
      cell.style.width = cellWidth;
      // 높이도 함께 조정하여 정사각형 유지
      cell.style.height = cellWidth;
    });
  });
}
