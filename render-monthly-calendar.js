// ================================================================
// render-monthly-calendar.js — 월간기록 탭
// 전통 달력 그리드 + 멀티데이 이벤트 바 + 드래그 일정 추가
// ================================================================

import { MONTHS }                                   from './config.js';
import { TODAY, getMuscles, getCF, dietDayOk,
         daysInMonth, getWeeklyMemos, saveWeeklyMemo,
         getGymSkip, getGymHealth, getCFSkip,
         getStretching, getWineFree, isFuture,
         getEvents, getCookingForDate, dateKey }    from './data.js';

let _currentYear  = TODAY.getFullYear();
let _currentMonth = TODAY.getMonth();

// ── 드래그 상태 ──────────────────────────────────────────────────
let _dragStart  = null;
let _dragEnd    = null;
let _wasDragged = false;

export function changeMonthlyMonth(delta) {
  _currentMonth += delta;
  if (_currentMonth < 0)  { _currentMonth = 11; _currentYear--; }
  if (_currentMonth > 11) { _currentMonth = 0;  _currentYear++; }
  renderMonthlyCalendar();
}

export function renderMonthlyCalendar() {
  const label = document.getElementById('monthly-label');
  if (label) label.textContent = `${_currentYear}년 ${MONTHS[_currentMonth]}`;

  const el = document.getElementById('monthly-calendar-content');
  if (!el) return;
  el.innerHTML = '';

  _renderMonthlyInto(el, _currentYear, _currentMonth);
}

export function renderMonthlyCalendarInModal(year, month, element) {
  if (!element) return;
  element.innerHTML = '';
  _renderMonthlyInto(element, year, month);
}

function _renderMonthlyInto(el, year, month) {
  // 임시로 전역 상태 저장 (복원하기 위해)
  const savedYear = _currentYear;
  const savedMonth = _currentMonth;
  _currentYear = year;
  _currentMonth = month;

  // ── 월간 요약 카드 ──
  const sum = _calcMonthSummary(year, month);
  const summaryCard = document.createElement('div');
  summaryCard.className = 'monthly-summary-card';
  summaryCard.innerHTML = `
    <div class="monthly-summary-title">${year}년 ${MONTHS[month]} 요약</div>
    <div class="monthly-summary-stats">
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:var(--gym)">${sum.gymDays}</span><span class="monthly-stat-lbl">헬스</span></div>
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:var(--cf)">${sum.cfDays}</span><span class="monthly-stat-lbl">클핏</span></div>
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:var(--diet-ok)">${sum.dietOkDays}</span><span class="monthly-stat-lbl">식단OK</span></div>
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:var(--streak)">${sum.stretchDays}</span><span class="monthly-stat-lbl">스트레칭</span></div>
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:#a78bfa">${sum.wineFreeDays}</span><span class="monthly-stat-lbl">와인프리</span></div>
      <div class="monthly-stat"><span class="monthly-stat-val" style="color:var(--accent)">${sum.cookingDays}</span><span class="monthly-stat-lbl">요리</span></div>
    </div>`;
  el.appendChild(summaryCard);

  // ── 달력 ──
  const calWrap = document.createElement('div');
  calWrap.className = 'monthly-cal-wrap';

  // 요일 헤더
  const hdr = document.createElement('div');
  hdr.className = 'monthly-cal-header';
  ['월','화','수','목','금','토','일'].forEach((lbl, i) => {
    const d = document.createElement('div');
    d.className = 'monthly-cal-dow' + (i===5?' sat':i===6?' sun':'');
    d.textContent = lbl;
    hdr.appendChild(d);
  });
  calWrap.appendChild(hdr);

  // 주 목록 생성
  const weeks  = _buildWeeks();
  const memos  = getWeeklyMemos();
  const events = _getMonthEvents();

  weeks.forEach((week, wi) => {
    const weekKey  = `${_currentYear}-${String(_currentMonth+1).padStart(2,'0')}-w${wi+1}`;
    const userMemo = memos[weekKey] || '';
    const weekWrap = document.createElement('div');
    weekWrap.className = 'monthly-week-wrap';

    // ── 셀 행 ──
    const cellsRow = document.createElement('div');
    cellsRow.className = 'monthly-cells-row';
    week.forEach(info => cellsRow.appendChild(_buildDayCell(info)));
    weekWrap.appendChild(cellsRow);

    // ── 이벤트 바 행 ──
    const evRow = _buildEventsRow(week, events);
    if (evRow) weekWrap.appendChild(evRow);

    // ── 주간 메모 ──
    const isWeekFuture = week.filter(d => !d.empty).every(d => d.future);
    const memoRow = document.createElement('div');
    memoRow.className = 'monthly-week-memo-row';
    const ta = document.createElement('textarea');
    ta.className     = 'monthly-week-memo-input';
    ta.rows          = 1;
    if (isWeekFuture) {
      ta.disabled     = true;
      ta.placeholder  = '';
      ta.style.opacity = '0.25';
      ta.style.cursor  = 'not-allowed';
    } else {
      ta.placeholder  = '이 주 메모...';
      ta.value        = userMemo;
      ta.addEventListener('input', e => saveWeeklyMemo(weekKey, e.target.value));
    }
    memoRow.appendChild(ta);
    weekWrap.appendChild(memoRow);

    calWrap.appendChild(weekWrap);
  });

  el.appendChild(calWrap);
  _initDrag(calWrap);

  // 전역 상태 복원
  _currentYear = savedYear;
  _currentMonth = savedMonth;
}

// ── 주 목록 ──────────────────────────────────────────────────────
function _buildWeeks() {
  const y = _currentYear, m = _currentMonth;
  const total    = daysInMonth(y, m);
  const firstDow = new Date(y, m, 1).getDay();           // 0=일
  const offset   = firstDow === 0 ? 6 : firstDow - 1;   // 월=0 기준

  const weeks = [];
  let week = [];

  for (let i = 0; i < offset; i++) week.push({ empty: true });

  for (let d = 1; d <= total; d++) {
    const date    = new Date(y, m, d);
    const future  = isFuture(y, m, d);
    const isToday = date.toDateString() === TODAY.toDateString();
    week.push({ empty:false, d, y, m, date,
      dateStr: dateKey(y, m, d),
      future, isToday,
      dow: date.getDay() });

    if (week.length === 7 || d === total) {
      while (week.length < 7) week.push({ empty: true });
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

// ── 날짜 셀 ──────────────────────────────────────────────────────
function _buildDayCell(info) {
  const cell = document.createElement('div');
  if (info.empty) { cell.className = 'monthly-cal-cell empty'; return cell; }

  const { d, y, m, future, isToday, dow, dateStr } = info;
  cell.className = 'monthly-cal-cell' + (future?' future':'') + (isToday?' today':'');
  cell.dataset.date = dateStr;

  // 형광펜 배경
  if (!future) {
    const hasGym = getMuscles(y,m,d).length > 0;
    const hasCF  = getCF(y,m,d);
    const dietOk = dietDayOk(y,m,d);
    if (hasGym || hasCF || dietOk === true) {
      const score = (hasGym?1:0)+(hasCF?1:0)+(dietOk===true?1:0);
      const a     = score===3?'0.22':score===2?'0.15':'0.09';
      if      (hasGym && hasCF) cell.style.background = `rgba(16,185,129,${a})`;
      else if (hasGym)          cell.style.background = `rgba(249,115,22,${a})`;
      else if (hasCF)           cell.style.background = `rgba(59,130,246,${a})`;
      else                      cell.style.background = `rgba(16,185,129,${a})`;
    }
  }

  // 날짜 숫자
  const dn = document.createElement('div');
  dn.className = 'monthly-cal-daynum' + (dow===0?' sun':dow===6?' sat':'');
  dn.textContent = d;
  cell.appendChild(dn);

  // 활동 dots
  if (!future) {
    const hasGym = getMuscles(y,m,d).length>0, hasCF=getCF(y,m,d);
    const dietOk = dietDayOk(y,m,d);
    const gymH   = getGymHealth(y,m,d), gymS = getGymSkip(y,m,d);
    const dots   = document.createElement('div');
    dots.className = 'monthly-cal-dots';
    if (hasGym)          dots.innerHTML += `<span class="mcal-dot" style="background:var(--gym)"></span>`;
    if (hasCF)           dots.innerHTML += `<span class="mcal-dot" style="background:var(--cf)"></span>`;
    if (dietOk===true)   dots.innerHTML += `<span class="mcal-dot" style="background:var(--diet-ok)"></span>`;
    if (dietOk===false && (hasGym||hasCF)) dots.innerHTML += `<span class="mcal-dot" style="background:var(--diet-bad)"></span>`;
    if (gymH)            dots.innerHTML += `<span class="mcal-dot-icon">✚</span>`;
    else if (gymS)       dots.innerHTML += `<span class="mcal-dot-icon">✗</span>`;
    const hasCooking = getCookingForDate(dateKey(y,m,d)).length > 0;
    if (hasCooking)      dots.innerHTML += `<span class="mcal-dot" style="background:#f59e0b;opacity:.9" title="요리"></span>`;
    if (dots.innerHTML)  cell.appendChild(dots);
  }

  // 클릭 → 운동·식단 탭 (드래그 아닐 때)
  cell.addEventListener('click', () => {
    if (!future && !_wasDragged) window.openWorkoutTab(y, m, d);
  });

  return cell;
}

// ── 이벤트 표시 모드 ────────────────────────────────────────────
function _getEventViewMode() {
  return localStorage.getItem('event_view_mode') || 'bar';
}

// ── 이벤트 바/화살표 행 ─────────────────────────────────────────
function _buildEventsRow(week, events) {
  const validDays = week.filter(d => !d.empty);
  if (!validDays.length) return null;

  const weekStart = validDays[0].dateStr;
  const weekEnd   = validDays[validDays.length-1].dateStr;
  const overlap   = events.filter(ev => ev.start <= weekEnd && ev.end >= weekStart);
  if (!overlap.length) return null;

  const dateToIdx = {};
  week.forEach((d, i) => { if (!d.empty) dateToIdx[d.dateStr] = i; });

  const tracks = [];
  const evTracks = overlap.map(ev => {
    const s = ev.start > weekStart ? ev.start : weekStart;
    const e = ev.end   < weekEnd   ? ev.end   : weekEnd;
    for (let t = 0; t < tracks.length; t++) {
      if (!tracks[t].some(r => r.s <= e && r.e >= s)) {
        tracks[t].push({s,e}); return t;
      }
    }
    tracks.push([{s,e}]); return tracks.length - 1;
  });

  const mode = _getEventViewMode();
  const BAR_H = mode === 'arrow' ? 18 : 22;
  const BAR_GAP = 2;
  const totalH = tracks.length * (BAR_H + BAR_GAP);

  const row = document.createElement('div');
  row.className = 'monthly-events-row';
  row.style.height = `${totalH}px`;

  overlap.forEach((ev, idx) => {
    const track  = evTracks[idx];
    const colS   = dateToIdx[ev.start > weekStart ? ev.start : weekStart] ?? 0;
    const colE   = dateToIdx[ev.end   < weekEnd   ? ev.end   : weekEnd]   ?? 6;
    const pctL   = (colS / 7) * 100;
    const pctW   = ((colE - colS + 1) / 7) * 100;
    const isStart= ev.start >= weekStart;
    const isEnd  = ev.end   <= weekEnd;
    const color  = ev.color || '#f59e0b';

    if (mode === 'arrow') {
      const el = document.createElement('div');
      el.className = 'monthly-event-arrow';
      el.style.cssText = `left:calc(${pctL}% + 4px);width:calc(${pctW}% - 8px);top:${track*(BAR_H+BAR_GAP) + BAR_H/2 - 1}px;height:${BAR_H}px;align-items:center;`;

      let html = '';
      // 시작점: 동그라미
      if (isStart) html += `<div class="event-arrow-dot" style="background:${color}"></div>`;
      // 선
      html += `<div class="event-arrow-line" style="background:${color}"><span class="event-arrow-label" style="color:${color}">${ev.title}</span></div>`;
      // 끝점: 화살촉
      if (isEnd) html += `<div class="event-arrow-head" style="border-left:6px solid ${color}"></div>`;

      el.innerHTML = html;
      el.addEventListener('click', e => { e.stopPropagation(); window.openCalEventModal(ev.start, ev.end, ev.id); });
      row.appendChild(el);
    } else {
      const bar = document.createElement('div');
      bar.className = 'monthly-event-bar';
      bar.style.cssText = [
        `left:calc(${pctL}% + 1px)`,
        `width:calc(${pctW}% - 2px)`,
        `top:${track*(BAR_H+BAR_GAP)}px`,
        `height:${BAR_H}px`,
        `background:${color}`,
        `border-radius:${isStart?'4px':'0'} ${isEnd?'4px':'0'} ${isEnd?'4px':'0'} ${isStart?'4px':'0'}`,
      ].join(';');

      const prefix = !isStart ? '← ' : '';
      const suffix = !isEnd   ? ' →' : '';
      bar.innerHTML = `<span class="event-bar-title">${prefix}${ev.title}${suffix}</span>`;
      bar.addEventListener('click', e => { e.stopPropagation(); window.openCalEventModal(ev.start, ev.end, ev.id); });
      row.appendChild(bar);
    }
  });

  return row;
}

// ── 드래그 초기화 ────────────────────────────────────────────────
function _initDrag(calWrap) {
  const todayStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  function getDate(el) {
    const d = el?.closest?.('[data-date]')?.dataset?.date || null;
    return (d && d <= todayStr) ? d : null;  // 미래 날짜 무시
  }
  function highlight(s, e) {
    const lo = s<=e?s:e, hi = s<=e?e:s;
    calWrap.querySelectorAll('.monthly-cal-cell[data-date]').forEach(c => {
      c.classList.toggle('drag-highlight', c.dataset.date>=lo && c.dataset.date<=hi);
    });
  }
  function clear() {
    calWrap.querySelectorAll('.drag-highlight').forEach(c => c.classList.remove('drag-highlight'));
  }

  // Mouse
  calWrap.addEventListener('mousedown', e => {
    const d = getDate(e.target);
    if (!d) return;
    _dragStart = d; _dragEnd = d; _wasDragged = false;
    e.preventDefault();
  });
  calWrap.addEventListener('mousemove', e => {
    if (!_dragStart) return;
    const d = getDate(e.target);
    if (!d || d === _dragEnd) return;
    _dragEnd = d; _wasDragged = true; highlight(_dragStart, _dragEnd);
  });
  const onUp = () => {
    if (!_dragStart) return;
    clear();
    if (_wasDragged && _dragEnd && _dragStart !== _dragEnd) {
      const s = _dragStart <= _dragEnd ? _dragStart : _dragEnd;
      const e = _dragStart <= _dragEnd ? _dragEnd   : _dragStart;
      window.openCalEventModal(s, e, null);
    }
    _dragStart = null; _dragEnd = null;
    setTimeout(() => { _wasDragged = false; }, 50);
  };
  document.addEventListener('mouseup', onUp);

  // Touch
  calWrap.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const d = getDate(document.elementFromPoint(t.clientX, t.clientY));
    if (!d) return;
    _dragStart = d; _dragEnd = d; _wasDragged = false;
  }, {passive:true});
  calWrap.addEventListener('touchmove', e => {
    if (!_dragStart) return;
    const t = e.touches[0];
    const d = getDate(document.elementFromPoint(t.clientX, t.clientY));
    if (!d || d===_dragEnd) return;
    _dragEnd = d; _wasDragged = true; highlight(_dragStart, _dragEnd);
  }, {passive:true});
  calWrap.addEventListener('touchend', onUp);
}

// ── 월 이벤트 필터 ───────────────────────────────────────────────
function _getMonthEvents() {
  const mStart = `${_currentYear}-${String(_currentMonth+1).padStart(2,'0')}-01`;
  const mEnd   = `${_currentYear}-${String(_currentMonth+1).padStart(2,'0')}-${String(daysInMonth(_currentYear,_currentMonth)).padStart(2,'0')}`;
  return getEvents().filter(ev => ev.start <= mEnd && ev.end >= mStart);
}

// ── 월간 통계 ────────────────────────────────────────────────────
function _calcMonthSummary(year = _currentYear, month = _currentMonth) {
  const y = year, m = month;
  let gymDays=0,cfDays=0,dietOkDays=0,stretchDays=0,wineFreeDays=0,cookingDays=0;
  const mStr = `${y}-${String(m+1).padStart(2,'0')}`;
  for (let d=1; d<=daysInMonth(y,m); d++) {
    if (new Date(y,m,d) > TODAY) break;
    if (getMuscles(y,m,d).length) gymDays++;
    if (getCF(y,m,d))             cfDays++;
    if (dietDayOk(y,m,d)===true)  dietOkDays++;
    if (getStretching(y,m,d))     stretchDays++;
    if (getWineFree(y,m,d))       wineFreeDays++;
    if (getCookingForDate(dateKey(y,m,d)).length) cookingDays++;
  }
  return {gymDays,cfDays,dietOkDays,stretchDays,wineFreeDays,cookingDays};
}
