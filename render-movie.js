// ================================================================
// render-movie.js — 영화 탭
// 무코 캘린더 데이터를 월간 달력으로 렌더링
// ================================================================

import { MONTHS } from './config.js';
import { TODAY, daysInMonth, getMovieData, saveMovieData } from './data.js';

let _currentYear  = TODAY.getFullYear();
let _currentMonth = TODAY.getMonth();

const MOVIE_TAGS = [
  { id: 'premiere', label: '시사회', color: '#a78bfa' },
  { id: 'gv', label: 'GV', color: '#f472b6' },
  { id: 'screening', label: '상영회', color: '#06b6d4' },
  { id: 'release', label: '개봉일', color: '#fb923c' },
  { id: 'rerelease', label: '재개봉', color: '#3b82f6' },
  { id: 'vip', label: '우대인사', color: '#10b981' },
  { id: 'festival', label: '영화제', color: '#f59e0b' },
];

export function changeMovieMonth(delta) {
  _currentMonth += delta;
  if (_currentMonth < 0)  { _currentMonth = 11; _currentYear--; }
  if (_currentMonth > 11) { _currentMonth = 0;  _currentYear++; }
  renderMovie();
}

export function renderMovie() {
  const label = document.getElementById('movie-label');
  if (label) label.textContent = `${_currentYear}년 ${MONTHS[_currentMonth]}`;

  const el = document.getElementById('movie-calendar-content');
  if (!el) return;
  el.innerHTML = '';

  _renderMovieCalendar(el);
}

// 크롤링 상태 확인 및 버튼 업데이트
async function _checkCrawlStatus() {
  try {
    const response = await fetch('http://localhost:3000/api/status');
    const status = await response.json();

    const btn = document.getElementById('movie-refresh-btn');
    if (!btn) return;

    if (status.status === 'crawling') {
      btn.disabled = true;
      btn.textContent = `🔄 크롤링 중 (${status.progress || 0}%)`;
      btn.style.opacity = '0.5';

      // 1초마다 상태 확인
      setTimeout(_checkCrawlStatus, 1000);
    } else if (status.status === 'success') {
      btn.disabled = false;
      btn.textContent = '🔄 새로고침';
      btn.style.opacity = '1';

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
    // API 서버가 없으면 무시
  }
}

// 크롤링 시작
export async function startMovieCrawl() {
  const btn = document.getElementById('movie-refresh-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '🔄 크롤링 중...';

  try {
    const response = await fetch('http://localhost:3000/api/crawl-movies', {
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
    alert('API 서버가 실행 중이어야 합니다\nnpm run server 를 먼저 실행해주세요');
  }
}

// 초기화: 버튼 상태 확인
setInterval(_checkCrawlStatus, 5000);

function _renderMovieCalendar(el) {
  const data = getMovieData(_currentYear, _currentMonth);
  const events = data.events || [];

  // 월간 정보 카드
  const infoCard = document.createElement('div');
  infoCard.className = 'movie-info-card';
  infoCard.innerHTML = `
    <div class="movie-info-title">${_currentYear}년 ${MONTHS[_currentMonth]} 영화</div>
    <div class="movie-info-stats">
      <div class="movie-stat">
        <span class="movie-stat-val">${events.length}</span>
        <span class="movie-stat-lbl">개봉작</span>
      </div>
      <div class="movie-stat">
        <span class="movie-stat-val">${_countByTag(events, 'premiere')}</span>
        <span class="movie-stat-lbl">시사회</span>
      </div>
      <div class="movie-stat">
        <span class="movie-stat-val">${_countByTag(events, 'release')}</span>
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

    const dayEvents = events.filter(e => e.date === day);
    const dateStr = `${String(day).padStart(2, '0')}`;

    let html = `<div class="movie-cell-date">${dateStr}</div>`;

    if (dayEvents.length > 0) {
      html += '<div class="movie-cell-events">';
      dayEvents.forEach(evt => {
        html += `<div class="movie-cell-event">
          <div class="movie-event-title">${evt.title}</div>
          <div class="movie-event-tags">`;

        (evt.tags || []).forEach(tag => {
          const tagInfo = MOVIE_TAGS.find(t => t.id === tag);
          if (tagInfo) {
            html += `<span class="movie-tag" style="background-color:${tagInfo.color}20;color:${tagInfo.color}">${tagInfo.label}</span>`;
          }
        });

        html += '</div></div>';
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

function _countByTag(events, tagId) {
  return events.filter(e => (e.tags || []).includes(tagId)).length;
}

// 전역 노출
window.changeMovieMonth = changeMovieMonth;
window.startMovieCrawl = startMovieCrawl;
