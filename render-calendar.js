// ================================================================
// render-calendar.js  — Streak 탭 (연간 캘린더)
// ================================================================

import { MONTHS, DAYS }                                          from './config.js';
import { getMuscles, getCF, dietDayOk, getExList,
         daysInMonth, isToday, isFuture, isBeforeStart,
         getGymSkip, getGymHealth, getCFSkip, getCFHealth,
         getEvents, dateKey }                                    from './data.js';
import { MUSCLES }                                               from './config.js';

let _currentYear = new Date().getFullYear();
export const getCurrentYear = () => _currentYear;

// ── 드래그 상태 ──────────────────────────────────────────────────
let _scheduleDragStart  = null;
let _scheduleDragEnd    = null;
let _scheduleDragYear   = null;
let _scheduleDragMonth  = null;
let _scheduleWasDragged = false;
let _scheduleDragOverlay = null;

export function changeYear(delta) {
  _currentYear += delta;
  renderCalendar();
}

// ── 스케줄 드래그 핸들러 ──────────────────────────────────────────
function _scheduleStartDrag(year, m, d, e) {
  // 스케줄은 미래 날짜도 허용

  _scheduleDragStart = d;
  _scheduleDragEnd = d;
  _scheduleDragYear = year;
  _scheduleDragMonth = m;
  _scheduleWasDragged = false;

  e.preventDefault();

  const handleMove = (e2) => {
    const target = e2.target.closest('.schedule-cell');
    if (!target) return;

    const dayNumEl = target.querySelector('.day-num');
    if (!dayNumEl) return;

    const d2 = parseInt(dayNumEl.textContent);
    if (isNaN(d2)) return;

    if (d2 !== _scheduleDragEnd) {
      _scheduleDragEnd = d2;
      _scheduleWasDragged = true;
      _highlightScheduleDrag(year, m);
    }
  };

  const handleUp = () => {
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleUp);

    _clearScheduleDragHighlight();

    if (_scheduleWasDragged && _scheduleDragEnd && _scheduleDragStart !== _scheduleDragEnd) {
      const s = _scheduleDragStart <= _scheduleDragEnd ? _scheduleDragStart : _scheduleDragEnd;
      const e = _scheduleDragStart <= _scheduleDragEnd ? _scheduleDragEnd : _scheduleDragStart;
      const startDate = dateKey(year, m, s);
      const endDate = dateKey(year, m, e);
      window.openCalEventModal(startDate, endDate, null);
    }

    _scheduleDragStart = null;
    _scheduleDragEnd = null;
    _scheduleDragYear = null;
    _scheduleDragMonth = null;
    setTimeout(() => { _scheduleWasDragged = false; }, 50);
  };

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleUp);
}

function _highlightScheduleDrag(year, m) {
  const cal = document.getElementById('calendar');
  const monthSec = Array.from(cal.querySelectorAll('.month-section')).find(sec => {
    const hdr = sec.querySelector('.month-header');
    return hdr && hdr.textContent.includes(`${year}년 ${MONTHS[m]}`);
  });

  if (!monthSec) return;

  const wrap = monthSec.querySelector('.grid-wrap');
  if (!wrap) return;

  // 기존 드래그 오버레이 제거
  const existingOverlay = wrap.querySelector('.schedule-drag-overlay-container');
  if (existingOverlay) existingOverlay.remove();

  const s = Math.min(_scheduleDragStart, _scheduleDragEnd);
  const e = Math.max(_scheduleDragStart, _scheduleDragEnd);

  const days = daysInMonth(year, m);
  const monthStart = dateKey(year, m, 1);
  const monthEnd = dateKey(year, m, days);

  // 드래그 범위를 나타내는 오버레이 바 생성
  const startDate = dateKey(year, m, s);
  const endDate = dateKey(year, m, e);

  // 드래그 범위의 열 위치 계산
  const startCol = s;
  const endCol = e;

  const BAR_H = 12;
  const pctL = (startCol / (days + 1)) * 100;
  const pctW = ((endCol - startCol + 1) / (days + 1)) * 100;

  const dragOverlay = document.createElement('div');
  dragOverlay.className = 'schedule-drag-overlay-container';
  dragOverlay.style.cssText = `position:relative;width:100%;height:${BAR_H + 4}px;overflow:visible;margin-top:2px;`;

  const bar = document.createElement('div');
  bar.className = 'schedule-drag-bar';
  bar.style.cssText = [
    `left:calc(${pctL}% + 38px)`,
    `width:calc(${pctW}% - 40px)`,
    `height:${BAR_H}px`,
    `background:rgba(245,158,11,0.3)`,
    `border:2px solid #f59e0b`,
    'position:absolute',
    'border-radius:3px',
    'top:0',
  ].join(';');

  dragOverlay.appendChild(bar);
  wrap.appendChild(dragOverlay);
  _scheduleDragOverlay = dragOverlay;
}

function _clearScheduleDragHighlight() {
  if (_scheduleDragOverlay) {
    _scheduleDragOverlay.remove();
    _scheduleDragOverlay = null;
  }
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
    tbody.appendChild(_scheduleRow(_currentYear, m, days));
    tbody.appendChild(_gymRow(_currentYear, m, days));
    tbody.appendChild(_cfRow(_currentYear, m, days));
    tbody.appendChild(_dietRow(_currentYear, m, days));
    table.appendChild(tbody);

    wrap.appendChild(table);

    // 스케줄 event bar 오버레이 추가 (월간 캘린더 스타일)
    const scheduleEventsOverlay = _buildScheduleEventsOverlay(_currentYear, m, days, table);
    if (scheduleEventsOverlay) wrap.appendChild(scheduleEventsOverlay);

    sec.appendChild(wrap); cal.appendChild(sec);
  }
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
    } else if (gymSkip) {
      cell.classList.add('skipped');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='✗'; cell.appendChild(ic);
    } else if (muscles.length) {
      cell.classList.add('gym-on');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='🏋️'; cell.appendChild(ic);
      const dots = document.createElement('div'); dots.className='muscle-dots';
      muscles.slice(0,4).forEach(mid => {
        const mc  = MUSCLES.find(x => x.id===mid);
        const dot = document.createElement('div'); dot.className='muscle-dot';
        dot.style.background = mc?.color || '#888'; dots.appendChild(dot);
      });
      cell.appendChild(dots);
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
      const ic = document.createElement('span'); ic.className='cell-icon health-cross'; ic.textContent='🏥'; cell.appendChild(ic);
    } else if (cfSkip) {
      cell.classList.add('skipped');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='✗'; cell.appendChild(ic);
    } else if (getCF(year, m, d)) {
      cell.classList.add('cf-on');
      const ic = document.createElement('span'); ic.className='cell-icon'; ic.textContent='🔥'; cell.appendChild(ic);
    }
    td.appendChild(cell); row.appendChild(td);
  }
  return row;
}

function _dietRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td'); lbl.className='row-label'; lbl.textContent='🥗 식단'; row.appendChild(lbl);
  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) { td.style.display = 'none'; row.appendChild(td); continue; }

    const dok  = dietDayOk(year, m, d);
    const cell = _makeCell(year, m, d);
    if (dok === true)  { cell.classList.add('diet-ok');  const ic=document.createElement('span');ic.className='cell-icon';ic.textContent='✅';cell.appendChild(ic); }
    if (dok === false) { cell.classList.add('diet-bad'); const ic=document.createElement('span');ic.className='cell-icon';ic.textContent='❌';cell.appendChild(ic); }
    td.appendChild(cell); row.appendChild(td);
  }
  return row;
}

function _scheduleRow(year, m, days) {
  const row = document.createElement('tr');
  const lbl = document.createElement('td'); lbl.className='row-label'; lbl.textContent='📅 스케줄'; row.appendChild(lbl);

  // 각 날짜의 셀 생성 (event bar는 별도 오버레이로 렌더링)
  for (let d = 1; d <= days; d++) {
    const td = document.createElement('td');
    if (isBeforeStart(year, m, d)) { td.style.display = 'none'; row.appendChild(td); continue; }

    const cell = document.createElement('div');
    cell.className = 'schedule-cell';
    if (isToday(year,m,d))  cell.classList.add('today-cell');
    if (isFuture(year,m,d)) cell.classList.add('future');

    const dn = document.createElement('div'); dn.className='day-num'; dn.textContent=d; cell.appendChild(dn);

    // 드래그 이벤트 (스케줄 생성) - 미래 날짜도 허용
    cell.addEventListener('mousedown', (e) => {
      _scheduleStartDrag(year, m, d, e);
    });

    td.appendChild(cell); row.appendChild(td);
  }
  return row;
}

function _buildScheduleEventsOverlay(year, m, days, table) {
  // 이번 월의 모든 이벤트 가져오기
  const monthStart = dateKey(year, m, 1);
  const monthEnd   = dateKey(year, m, days);
  const allEvents  = getEvents().filter(ev => ev.start <= monthEnd && ev.end >= monthStart);

  if (!allEvents.length) return null;

  // 트랙 배정 (겹치는 이벤트 처리)
  const tracks = [];
  const evTracks = allEvents.map(ev => {
    const s = ev.start < monthStart ? monthStart : ev.start;
    const e = ev.end > monthEnd ? monthEnd : ev.end;
    for (let t = 0; t < tracks.length; t++) {
      if (!tracks[t].some(r => r.s <= e && r.e >= s)) {
        tracks[t].push({s,e}); return t;
      }
    }
    tracks.push([{s,e}]); return tracks.length - 1;
  });

  const BAR_H = 12, BAR_GAP = 2;
  const totalH = tracks.length * (BAR_H + BAR_GAP);

  const overlay = document.createElement('div');
  overlay.className = 'schedule-events-overlay';
  overlay.style.height = `${totalH}px`;

  // 각 이벤트를 오버레이에 배치
  allEvents.forEach((ev, idx) => {
    const track = evTracks[idx];
    const dateRange = _getEventColumnRange(year, m, days, ev, monthStart, monthEnd);
    if (!dateRange) return;

    const { startCol, endCol } = dateRange;
    const pctL = (startCol / (days + 1)) * 100;  // +1은 row-label 때문
    const pctW = ((endCol - startCol + 1) / (days + 1)) * 100;

    const bar = document.createElement('div');
    bar.className = 'schedule-event-bar-overlay';
    bar.style.cssText = [
      `left:calc(${pctL}% + 38px)`,  // 38px = row-label width
      `width:calc(${pctW}% - 40px)`,
      `top:${track * (BAR_H + BAR_GAP)}px`,
      `height:${BAR_H}px`,
      `background:${ev.color || '#f59e0b'}`,
    ].join(';');
    bar.textContent = ev.title;
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      window.openCalEventModal(ev.start, ev.end, ev.id);
    });
    overlay.appendChild(bar);
  });

  return overlay;
}

function _getEventColumnRange(year, m, days, ev, monthStart, monthEnd) {
  // 이벤트의 시작/종료 날짜를 월 내의 열 인덱스로 변환
  let startDate = ev.start >= monthStart ? ev.start : monthStart;
  let endDate = ev.end <= monthEnd ? ev.end : monthEnd;

  // dateKey 형식 (YYYY-MM-DD)에서 일자 추출
  const startDay = parseInt(startDate.split('-')[2]);
  const endDay = parseInt(endDate.split('-')[2]);

  // 이전 달 날짜 체크
  if (ev.start < monthStart) {
    const prevMonthDays = daysInMonth(
      parseInt(monthStart.split('-')[0]),
      parseInt(monthStart.split('-')[1]) - 1
    );
  }

  return { startCol: startDay, endCol: endDay };
}

function _makeCell(y, m, d) {
  const cell = document.createElement('div'); cell.className = 'cell';
  if (isToday(y,m,d))  cell.classList.add('today-cell');
  if (isFuture(y,m,d)) cell.classList.add('future');
  const dn = document.createElement('div'); dn.className='day-num'; dn.textContent=d; cell.appendChild(dn);
  cell.addEventListener('click', () => { if (!isFuture(y,m,d)) window.openSheet(y,m,d); });
  return cell;
}
