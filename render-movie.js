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
  { id: 'rerelease', label: '재개봉', color: '#fa342c' },
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

// 새로고침: Firestore → 없으면 CORS 프록시로 직접 크롤링 시도
export async function startMovieCrawl() {
  const btn = document.getElementById('movie-refresh-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '🔄 로딩 중...';

  try {
    // 1차: Firestore에서 최신 데이터
    await refreshMovieData(_currentYear, _currentMonth);
    const data = await getMovieData(_currentYear, _currentMonth);

    // 2차: Firestore에 데이터 없으면 브라우저에서 직접 크롤링 시도
    if (!data.events || data.events.length === 0) {
      btn.textContent = '🔄 크롤링 중...';
      const crawled = await _browserCrawlMovies(_currentYear, _currentMonth);
      if (crawled && crawled.events?.length) {
        const { saveMovieData } = await import('./data.js');
        await saveMovieData(_currentYear, _currentMonth, crawled);
        console.log(`✅ 브라우저 크롤링 성공: ${crawled.events.length}건`);
      }
    }

    await renderMovie();
    console.log(`✅ ${_currentYear}년 ${_currentMonth + 1}월 새로고침 완료`);
  } catch (e) {
    console.error('❌ 새로고침 오류:', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 새로고침';
  }
}

// CORS 프록시로 muko.kr 직접 크롤링 (브라우저용)
async function _browserCrawlMovies(year, month) {
  const monthStr = String(month + 1).padStart(2, '0');
  const url = `https://muko.kr/calender/selected_month/${year}${monthStr}`;

  const PROXIES = [
    u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  ];

  let html = null;
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(10000) });
      if (res.ok) { html = await res.text(); break; }
    } catch (e) {
      console.warn('[movie-crawl] 프록시 실패:', e.message);
    }
  }

  if (!html) return null;

  // HTML 파싱 (cheerio 없이 DOM으로)
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const events = [];

  const TAG_MAP = {
    '시사회': 'premiere', 'GV': 'gv', '상영회': 'screening',
    '개봉일': 'release', '재개봉': 'rerelease',
    '무대인사': 'vip', '우대인사': 'vip', '영화제': 'festival',
  };

  // muko.kr 달력 구조 파싱: .fc-daygrid-day 또는 title 속성
  doc.querySelectorAll('[title]').forEach(el => {
    const title = el.getAttribute('title') || '';
    if (!title || title.length < 3) return;

    // 날짜 추��: data-date 또는 부���에서
    const dateAttr = el.closest('[data-date]')?.getAttribute('data-date');
    let day = 0;
    if (dateAttr) {
      const d = new Date(dateAttr);
      if (d.getFullYear() === year && d.getMonth() === month) day = d.getDate();
    }
    if (!day) return;

    // 태그 추출
    const tags = [];
    Object.keys(TAG_MAP).forEach(k => {
      if (title.includes(k)) tags.push(TAG_MAP[k]);
    });

    // href
    const href = el.closest('a')?.href || el.querySelector('a')?.href || '';

    events.push({ date: day, title: title.trim(), tags, time: '', href });
  });

  // 중복 제거
  const seen = new Set();
  const unique = events.filter(e => {
    const key = `${e.date}_${e.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { year, month: month + 1, events: unique, crawledAt: new Date().toISOString(), source: 'browser' };
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
