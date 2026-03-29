// ================================================================
// render-movie.js — 영화 탭
// 무코 캘린더 데이터를 월간 달력으로 렌더링
// ================================================================

import { MONTHS } from './config.js';
import { TODAY, daysInMonth, getMovieData, saveMovieData } from './data.js';

// saveMovieData를 전역으로 노출 (크롤링 결과 저장용)
let _saveMovieData = saveMovieData;

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

// API URL (로컬: localhost:3000, 배포: 같은 도메인)
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

// 폴링 시도 카운터 (무한 루프 방지)
let _pollAttempts = 0;
const MAX_POLL_ATTEMPTS = 60; // 1분 = 60초

// 크롤링 상태 확인 및 버튼 업데이트
async function _checkCrawlStatus() {
  try {
    // API 서버가 없으면 중단
    if (!API_BASE) {
      console.warn('⚠️ API 서버 URL이 설정되지 않았습니다. npm run server를 실행하세요.');
      return;
    }

    const response = await fetch(`${API_BASE}/api/status`, { timeout: 5000 });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const status = await response.json();
    _pollAttempts = 0; // 성공 시 카운터 리셋

    const btn = document.getElementById('movie-refresh-btn');
    if (!btn) return;

    if (status.status === 'crawling') {
      btn.disabled = true;
      btn.textContent = `🔄 크롤링 중 (${status.progress || 0}%)`;
      btn.style.opacity = '0.5';

      // 1초마다 상태 확인 (최대 1분)
      if (_pollAttempts < MAX_POLL_ATTEMPTS) {
        _pollAttempts++;
        setTimeout(_checkCrawlStatus, 1000);
      } else {
        console.error('❌ 크롤링 타임아웃 - 너무 오래 걸리고 있습니다');
        btn.disabled = false;
        btn.textContent = '🔄 새로고침';
        btn.style.opacity = '1';
        alert('크롤링이 타임아웃되었습니다. 나중에 다시 시도해주세요.');
      }
    } else if (status.status === 'success') {
      btn.disabled = false;
      btn.textContent = '🔄 새로고침';
      btn.style.opacity = '1';

      // 크롤링 데이터 저장
      if (status.data) {
        const { year, month, events, lastUpdated, source } = status.data;
        await _saveMovieData(year, month, {
          year, month, events, lastUpdated, source
        });
        console.log('✅ 데이터 저장 완료');
      }

      // 데이터 새로고침
      renderMovie();

      // 알림
      console.log('✅ 크롤링 완료:', status.message);
    } else if (status.status === 'error') {
      btn.disabled = false;
      btn.textContent = '🔄 새로고침';
      btn.style.opacity = '1';
      console.error('❌ 크롤링 실패:', status.message);
      alert(status.message);
    }
  } catch (e) {
    _pollAttempts++;

    // 너무 많은 오류는 로깅하지 않기
    if (_pollAttempts === 1) {
      console.warn('⚠️ API 서버에 연결할 수 없습니다. 다음을 확인하세요:');
      console.warn('   1. npm run server 실행 여부');
      console.warn('   2. 포트 3000이 사용 가능한지');
      console.warn('   3. 또는 Railway 배포 완료 대기');
    }

    // 최대 시도 횟수에 도달하면 중단
    if (_pollAttempts >= MAX_POLL_ATTEMPTS) {
      const btn = document.getElementById('movie-refresh-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 새로고침';
        btn.style.opacity = '1';
      }
      console.error('❌ API 서버 연결 타임아웃');
      return;
    }

    // 계속 재시도
    setTimeout(_checkCrawlStatus, 1000);
  }
}

// 크롤링 시작
export async function startMovieCrawl() {
  const btn = document.getElementById('movie-refresh-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '🔄 크롤링 중...';

  try {
    const response = await fetch(`${API_BASE}/api/crawl-movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      console.log('✅ 크롤링 시작됨');
      // 상태 확인 시작
      setTimeout(_checkCrawlStatus, 1000);
    } else {
      throw new Error('API 응답 실패');
    }
  } catch (e) {
    console.error('❌ 크롤링 오류:', e.message);
    btn.disabled = false;
    btn.textContent = '🔄 새로고침';
    const msg = window.location.hostname === 'localhost'
      ? 'API 서버가 실행 중이어야 합니다\nnpm run server 를 먼저 실행해주세요'
      : '크롤링 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    alert(msg);
  }
}

// 초기화: 버튼 상태 확인
setInterval(_checkCrawlStatus, 5000);

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

  // 캘린더 그리드
  const calWrap = document.createElement('div');
  calWrap.className = 'movie-cal-wrap';

  // 요일 헤더
  const hdr = document.createElement('div');
  hdr.className = 'movie-cal-header';
  ['월','화','수','목','금','토','일'].forEach((lbl, i) => {
    const d = document.createElement('div');
    d.className = 'movie-cal-dow' + (i===5?' sat':i===6?' sun':'');
    d.textContent = lbl;
    hdr.appendChild(d);
  });
  calWrap.appendChild(hdr);

  // 날짜 셀
  const cellsRow = document.createElement('div');
  cellsRow.className = 'movie-cells-row';

  // 월 시작 요일
  const firstDay = new Date(_currentYear, _currentMonth, 1).getDay();
  const startMonday = firstDay === 0 ? 6 : firstDay - 1; // 월요일 기준
  const daysCount = daysInMonth(_currentYear, _currentMonth);

  // 이전 달 패딩
  for (let i = 0; i < startMonday; i++) {
    const cell = document.createElement('div');
    cell.className = 'movie-cell empty';
    cellsRow.appendChild(cell);
  }

  // 현재 달 날짜
  for (let day = 1; day <= daysCount; day++) {
    const cell = document.createElement('div');
    cell.className = 'movie-cell';

    const dayEvents = filteredEvents.filter(e => e.date === day);
    const dateStr = `${String(day).padStart(2, '0')}`;

    let html = `<div class="movie-cell-date">${dateStr}</div>`;

    if (dayEvents.length > 0) {
      html += '<div class="movie-cell-events">';
      dayEvents.forEach(evt => {
        let tagsHtml = '';
        (evt.tags || []).forEach(tag => {
          const tagInfo = MOVIE_TAGS.find(t => t.id === tag);
          if (tagInfo) {
            tagsHtml += `<span class="movie-tag" style="background-color:${tagInfo.color}20;color:${tagInfo.color}">${tagInfo.label}</span>`;
          }
        });

        const eventInner = `<div class="movie-event-title">${evt.title}</div><div class="movie-event-tags">${tagsHtml}</div>`;

        // 링크가 있으면 클릭 가능하게, 없으면 그냥 표시
        if (evt.href) {
          html += `<a href="${evt.href}" target="_blank" rel="noopener noreferrer" class="movie-cell-event-link">${eventInner}</a>`;
        } else {
          html += `<div class="movie-cell-event">${eventInner}</div>`;
        }
      });
      html += '</div>';
    }

    cell.innerHTML = html;
    cellsRow.appendChild(cell);
  }

  calWrap.appendChild(cellsRow);
  el.appendChild(calWrap);

  // 태그 범례
  const legend = document.createElement('div');
  legend.className = 'movie-legend';
  MOVIE_TAGS.forEach(tag => {
    const item = document.createElement('div');
    item.className = 'movie-legend-item';
    item.innerHTML = `
      <span class="movie-legend-color" style="background-color:${tag.color}"></span>
      <span class="movie-legend-label">${tag.label}</span>
    `;
    legend.appendChild(item);
  });
  el.appendChild(legend);
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
