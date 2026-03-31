// ================================================================
// render-movie.js — 영화 탭
// 무코 캘린더 데이터를 월간 달력으로 렌더링
// ================================================================

import { MONTHS } from './config.js';
import { TODAY, daysInMonth, getMovieData, refreshMovieData } from './data.js';

let _currentYear  = TODAY.getFullYear();
let _currentMonth = TODAY.getMonth();
let _activeTagFilters = new Set(); // 선택된 필터 태그

const MOVIE_TAGS = [
  { id: 'premiere', label: '시사회', color: '#a78bfa' },
  { id: 'gv', label: 'GV', color: '#f472b6' },
  { id: 'screening', label: '상영회', color: '#06b6d4' },
  { id: 'release', label: '개봉일', color: '#fb923c' },
  { id: 'rerelease', label: '재개봉', color: '#3b82f6' },
  { id: 'vip', label: '우대인사', color: '#10b981' },
  { id: 'festival', label: '영화제', color: '#f59e0b' },
];

export async function changeMovieMonth(delta) {
  _currentMonth += delta;
  if (_currentMonth < 0)  { _currentMonth = 11; _currentYear--; }
  if (_currentMonth > 11) { _currentMonth = 0;  _currentYear++; }
  await renderMovie();
}

export async function renderMovie() {
  const label = document.getElementById('movie-label');
  if (label) label.textContent = `${_currentYear}년 ${MONTHS[_currentMonth]}`;

  // 필터 UI 렌더링
  const filterEl = document.getElementById('movie-tag-filters');
  if (filterEl) {
    _renderMovieTagFilters(filterEl);
  }

  const el = document.getElementById('movie-calendar-content');
  if (!el) return;
  el.innerHTML = '';

  await _renderMovieCalendar(el);
}

// Firestore에서 최신 데이터 새로고침
export async function startMovieCrawl() {
  const btn = document.getElementById('movie-refresh-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '🔄 로딩 중...';

  try {
    await refreshMovieData(_currentYear, _currentMonth);
    await renderMovie();
    console.log(`✅ ${_currentYear}년 ${_currentMonth + 1}월 데이터 새로고침 완료`);
  } catch (e) {
    console.error('❌ 새로고침 오류:', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 새로고침';
  }
}

async function _renderMovieCalendar(el) {
  const data = await getMovieData(_currentYear, _currentMonth);
  let events = data.events || [];

  // ── 필터 적용 ──────────────────────────────────────
  let filteredEvents = events;
  if (_activeTagFilters.size > 0) {
    filteredEvents = events.filter(e =>
      (e.tags || []).some(t => _activeTagFilters.has(t))
    );
  }

  // 월간 정보 카드 (필터된 이벤트 기준)
  const infoCard = document.createElement('div');
  infoCard.className = 'movie-info-card';
  infoCard.innerHTML = `
    <div class="movie-info-title">${_currentYear}년 ${MONTHS[_currentMonth]} 영화</div>
    <div class="movie-info-stats">
      <div class="movie-stat">
        <span class="movie-stat-val">${filteredEvents.length}</span>
        <span class="movie-stat-lbl">개봉작</span>
      </div>
      <div class="movie-stat">
        <span class="movie-stat-val">${_countByTag(filteredEvents, 'premiere')}</span>
        <span class="movie-stat-lbl">시사회</span>
      </div>
      <div class="movie-stat">
        <span class="movie-stat-val">${_countByTag(filteredEvents, 'release')}</span>
        <span class="movie-stat-lbl">개봉일</span>
      </div>
    </div>
  `;
  el.appendChild(infoCard);

  // ── 일별 리스트 뷰 ──────────────────────────────────
  const DOWS = ['일','월','화','수','목','금','토'];
  const daysCount = daysInMonth(_currentYear, _currentMonth);
  const listWrap = document.createElement('div');
  listWrap.className = 'movie-list-wrap';

  for (let day = 1; day <= daysCount; day++) {
    const dayEvents = filteredEvents.filter(e => e.date === day);
    const dow = new Date(_currentYear, _currentMonth, day).getDay();
    const dowClass = dow === 0 ? ' sun' : dow === 6 ? ' sat' : '';
    const isToday = _currentYear === TODAY.getFullYear() && _currentMonth === TODAY.getMonth() && day === TODAY.getDate();

    const row = document.createElement('div');
    row.className = 'movie-day-row' + (dayEvents.length ? '' : ' empty') + (isToday ? ' today' : '');

    // 날짜 열
    let dateHtml = `<div class="movie-day-date${dowClass}">
      <span class="movie-day-num">${day}</span>
      <span class="movie-day-dow">${DOWS[dow]}</span>
    </div>`;

    // 이벤트 열
    let eventsHtml = '<div class="movie-day-events">';
    if (dayEvents.length > 0) {
      dayEvents.forEach(evt => {
        let tagsHtml = '';
        (evt.tags || []).forEach(tag => {
          const tagInfo = MOVIE_TAGS.find(t => t.id === tag);
          if (tagInfo) {
            tagsHtml += `<span class="movie-tag" style="background-color:${tagInfo.color}20;color:${tagInfo.color}">${tagInfo.label}</span>`;
          }
        });
        const timeHtml = evt.time ? `<span class="movie-event-time">${evt.time}</span>` : '';
        const eventInner = `${timeHtml}<span class="movie-event-title">${evt.title}</span><span class="movie-event-tags">${tagsHtml}</span>`;

        if (evt.href) {
          eventsHtml += `<a href="${evt.href}" target="_blank" rel="noopener noreferrer" class="movie-day-event-link">${eventInner}</a>`;
        } else {
          eventsHtml += `<div class="movie-day-event">${eventInner}</div>`;
        }
      });
    }
    eventsHtml += '</div>';

    row.innerHTML = dateHtml + eventsHtml;
    listWrap.appendChild(row);
  }

  el.appendChild(listWrap);
}

// ── 필터 함수 ─────────────────────────────────────────
function _renderMovieTagFilters(el) {
  el.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'movie-tag-filter-row';

  MOVIE_TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'movie-tag-filter-btn';
    btn.style.borderColor = tag.color;
    btn.textContent = tag.label;
    btn.id = `filter-btn-${tag.id}`;

    // 이미 선택된 태그면 active 클래스 추가
    if (_activeTagFilters.has(tag.id)) {
      btn.classList.add('active');
    }

    btn.onclick = () => toggleMovieTagFilter(tag.id, btn);
    container.appendChild(btn);
  });

  el.appendChild(container);
}

export async function toggleMovieTagFilter(tagId, btn) {
  if (_activeTagFilters.has(tagId)) {
    _activeTagFilters.delete(tagId);
    btn.classList.remove('active');
  } else {
    _activeTagFilters.add(tagId);
    btn.classList.add('active');
  }
  await renderMovie();
}

function _countByTag(events, tagId) {
  return events.filter(e => (e.tags || []).includes(tagId)).length;
}

// 전역 노출
window.changeMovieMonth = changeMovieMonth;
window.startMovieCrawl = startMovieCrawl;
