import { toFiniteNumber as _num } from '../utils/number.js';
import { escapeHtml as _escapeHtml } from '../utils/escape-html.js';
import {
  formatRunningDuration,
  formatRunningPace,
} from '../workout/running-presentation.js';
// ================================================================
// modals/trainer-running-stats.js
// Trainer quest의 러닝 전용 활동 목록과 Nike Run Club형 상세 기록 화면
// ================================================================

import { getCache } from '../data.js';
import { listRunningActivities } from '../workout/running-analytics.js';

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function _positive(value) {
  const parsed = _num(value);
  return parsed > 0 ? parsed : null;
}

function _dateForActivity(activity = {}) {
  const timestamp = _num(activity.startedAt);
  if (timestamp > 0) return new Date(timestamp);
  const match = String(activity.dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function _todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function _formatDuration(value) {
  return formatRunningDuration(value, { padMinutes: false, rounding: 'round' });
}

function _formatPace(value) {
  const seconds = _positive(value);
  return formatRunningPace(seconds, { empty: '—', secondsMark: '"' });
}

function _formatDistance(value) {
  const distance = _num(value);
  return distance > 0 ? distance.toFixed(2) : '—';
}

function _formatSplitDistance(value) {
  const distance = _num(value);
  if (distance <= 0) return '—';
  return Math.abs(distance - Math.round(distance)) < .01 ? String(Math.round(distance)) : distance.toFixed(2);
}

function _formatHeartRate(value) {
  const bpm = _positive(value);
  return bpm == null ? '—' : `${Math.round(bpm)} BPM`;
}

function _formatCadence(value) {
  const cadence = _positive(value);
  return cadence == null ? '—' : `${Math.round(cadence)} spm`;
}

function _formatElevation(value, sign = '') {
  const elevation = _num(value);
  return elevation > 0 ? `${sign}${Math.round(elevation)} m` : '—';
}

function _formatClock(timestamp) {
  const date = new Date(_num(timestamp));
  if (Number.isNaN(date.getTime())) return '';
  const rawHour = date.getHours();
  const period = rawHour < 12 ? '오전' : '오후';
  const hour = rawHour % 12 || 12;
  return `${period} ${hour}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function _activityDateLabel(activity) {
  if (String(activity.dateKey || '') === _todayKey()) return '오늘';
  const date = _dateForActivity(activity);
  return date ? `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.` : '러닝 기록';
}

function _activityTitle(activity) {
  const date = _dateForActivity(activity);
  if (!date || !_positive(activity.startedAt)) return '러닝 기록';
  const hour = date.getHours();
  const period = hour < 5 ? '새벽' : hour < 12 ? '아침' : hour < 18 ? '오후' : '저녁';
  return `${WEEKDAYS[date.getDay()]} ${period} 러닝`;
}

function _detailDateLabel(activity) {
  const date = _dateForActivity(activity);
  if (!date) return String(activity.dateKey || '러닝 기록');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}`;
}

function _detailTimeLabel(activity) {
  const start = _positive(activity.startedAt);
  const end = _positive(activity.endedAt);
  if (start && end) return `${_formatClock(start)}~${_formatClock(end)}`;
  if (start) return _formatClock(start);
  return '저장된 러닝 기록';
}

function _routePreview(route = []) {
  const points = (Array.isArray(route) ? route : [])
    .map(point => ({ lat: _num(point?.lat, NaN), lng: _num(point?.lng, NaN) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (points.length < 2) {
    return `
      <svg class="trainer-running-route-preview" viewBox="0 0 84 84" aria-hidden="true" focusable="false">
        <path d="M21 56c8-19 16-30 29-30 10 0 13 8 7 16-5 7-4 13 7 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="21" cy="56" r="3.5" fill="currentColor"></circle>
        <circle cx="64" cy="56" r="3.5" fill="currentColor"></circle>
      </svg>`;
  }
  const minLat = Math.min(...points.map(point => point.lat));
  const maxLat = Math.max(...points.map(point => point.lat));
  const minLng = Math.min(...points.map(point => point.lng));
  const maxLng = Math.max(...points.map(point => point.lng));
  const latRange = Math.max(.000001, maxLat - minLat);
  const lngRange = Math.max(.000001, maxLng - minLng);
  const padding = 12;
  const size = 84 - (padding * 2);
  const path = points.map((point, index) => {
    const x = padding + ((point.lng - minLng) / lngRange) * size;
    const y = padding + ((maxLat - point.lat) / latRange) * size;
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const first = points[0];
  const last = points.at(-1);
  const firstX = padding + ((first.lng - minLng) / lngRange) * size;
  const firstY = padding + ((maxLat - first.lat) / latRange) * size;
  const lastX = padding + ((last.lng - minLng) / lngRange) * size;
  const lastY = padding + ((maxLat - last.lat) / latRange) * size;
  return `
    <svg class="trainer-running-route-preview" viewBox="0 0 84 84" aria-hidden="true" focusable="false">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="${firstX.toFixed(1)}" cy="${firstY.toFixed(1)}" r="3" fill="currentColor"></circle>
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="#fff" stroke="currentColor" stroke-width="2"></circle>
    </svg>`;
}

function _backIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.8 4.8 7.6 12l7.2 7.2"></path></svg>';
}

function _metricRow(label, value) {
  return `<div class="trainer-running-metric-row"><dt>${_escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function _splitDelta(split, averagePace) {
  const pace = _positive(split?.paceSecPerKm);
  const average = _positive(averagePace);
  if (pace == null || average == null) return { text: '—', tone: '' };
  const delta = Math.round(pace - average);
  if (delta === 0) return { text: '±0\'00"', tone: '' };
  return {
    text: `${delta > 0 ? '+' : '-'}${_formatPace(Math.abs(delta))}`,
    tone: delta > 0 ? 'is-slower' : 'is-faster',
  };
}

function _activityCard(activity, index) {
  const title = _activityTitle(activity);
  return `
    <button type="button" class="trainer-running-activity-card" data-trainer-running-open="${index}" aria-label="${_escapeHtml(title)} 상세 정보">
      <span class="trainer-running-route-tile">${_routePreview(activity.route)}</span>
      <span class="trainer-running-card-main">
        <span class="trainer-running-card-date">${_escapeHtml(_activityDateLabel(activity))}</span>
        <strong class="trainer-running-card-title">${_escapeHtml(title)}</strong>
      </span>
      <span class="trainer-running-card-metrics" aria-label="러닝 요약">
        <span><strong>${_formatDistance(activity.distanceKm)}</strong><small>킬로미터</small></span>
        <span><strong>${_formatPace(activity.avgPaceSecPerKm)}</strong><small>평균 페이스</small></span>
        <span><strong>${_formatDuration(activity.durationSec)}</strong><small>시간</small></span>
      </span>
    </button>`;
}

function _renderRecent(root, activities, onExit, openDetail) {
  root.innerHTML = `
    <section class="trainer-running-screen" aria-label="러닝 통계">
      <header class="trainer-running-header">
        <button type="button" class="trainer-running-back" data-trainer-running-exit aria-label="트레이너 선택지로 돌아가기">${_backIcon()}</button>
        <h3>러닝 통계</h3>
        <span aria-hidden="true"></span>
      </header>
      <div class="trainer-running-scroll">
        <h4 class="trainer-running-section-title">최근 활동</h4>
        <div class="trainer-running-activity-list">
          ${activities.length
            ? activities.map(_activityCard).join('')
            : '<div class="trainer-running-empty">아직 저장된 러닝 기록이 없어요.<br>러닝을 기록하면 거리·페이스·구간 통계가 여기에 쌓입니다.</div>'}
        </div>
      </div>
    </section>`;
  root.querySelector('[data-trainer-running-exit]')?.addEventListener('click', onExit);
  root.querySelectorAll('[data-trainer-running-open]').forEach(button => {
    button.addEventListener('click', () => openDetail(_num(button.dataset.trainerRunningOpen, -1)));
  });
}

function _renderDetail(root, activity, showRecent) {
  const splits = Array.isArray(activity.splits) ? activity.splits : [];
  const caloriesLabel = activity.calorieSource === 'estimated' ? '칼로리(ACSM 추정)' : '칼로리';
  root.innerHTML = `
    <section class="trainer-running-screen" aria-label="러닝 상세 정보">
      <header class="trainer-running-header">
        <button type="button" class="trainer-running-back" data-trainer-running-list aria-label="최근 활동으로 돌아가기">${_backIcon()}</button>
        <h3>상세 정보</h3>
        <span aria-hidden="true"></span>
      </header>
      <div class="trainer-running-scroll trainer-running-detail-scroll">
        <div class="trainer-running-detail-date">
          <h4>${_escapeHtml(_detailDateLabel(activity))}</h4>
          <p>${_escapeHtml(_detailTimeLabel(activity))}</p>
        </div>
        <dl class="trainer-running-metrics">
          ${_metricRow('거리', `${_formatDistance(activity.distanceKm)} km`)}
          ${_metricRow('평균 페이스', _formatPace(activity.avgPaceSecPerKm))}
          ${_metricRow('최고 페이스', _formatPace(activity.bestPaceSecPerKm))}
          ${_metricRow('활성 시간', _formatDuration(activity.durationSec))}
          ${_metricRow('경과 시간', _formatDuration(activity.elapsedDurationSec || activity.durationSec))}
          ${_metricRow(caloriesLabel, activity.calories > 0 ? `${Math.round(activity.calories)} kcal` : '체중 정보 필요')}
          ${_metricRow('평균 케이던스', _formatCadence(activity.cadenceSpm))}
          ${_metricRow('고도 상승', _formatElevation(activity.elevationGainM, '+'))}
          ${_metricRow('고도 하강', _formatElevation(activity.elevationLossM, '-'))}
          ${_metricRow('평균 심박수', _formatHeartRate(activity.avgHeartRateBpm))}
          ${_metricRow('최대 심박수', _formatHeartRate(activity.maxHeartRateBpm))}
        </dl>
        <section class="trainer-running-splits-section" aria-labelledby="trainer-running-splits-title">
          <h4 id="trainer-running-splits-title">구간</h4>
          ${splits.length ? `
            <div class="trainer-running-split-table" role="table" aria-label="킬로미터 구간 기록">
              <div class="trainer-running-split-header" role="row">
                <span role="columnheader">Km</span><span role="columnheader">평균 페이스</span><span role="columnheader">+/-</span><span role="columnheader">고도</span><span role="columnheader">심박</span>
              </div>
              ${splits.map(split => {
                const delta = _splitDelta(split, activity.avgPaceSecPerKm);
                const elevation = _num(split.elevationGainM) - _num(split.elevationLossM);
                return `<div class="trainer-running-split-row" role="row">
                  <span role="cell">${_formatSplitDistance(split.distanceKm)}</span>
                  <strong role="cell">${_formatPace(split.paceSecPerKm)}</strong>
                  <span class="trainer-running-split-delta ${delta.tone}" role="cell">${delta.text}</span>
                  <span role="cell">${elevation === 0 ? '0 m' : `${elevation > 0 ? '+' : ''}${Math.round(elevation)} m`}</span>
                  <span role="cell">${_positive(split.avgHeartRateBpm) ? Math.round(split.avgHeartRateBpm) : '—'}</span>
                </div>`;
              }).join('')}
            </div>`
            : '<div class="trainer-running-splits-empty">GPS 구간 기록이 부족해 구간별 분석을 표시할 수 없어요.</div>'}
        </section>
      </div>
    </section>`;
  root.querySelector('[data-trainer-running-list]')?.addEventListener('click', showRecent);
}

function _recentFirst(activities = []) {
  return [...activities].sort((a, b) => (
    _num(b.startedAt) - _num(a.startedAt)
    || String(b.dateKey || '').localeCompare(String(a.dateKey || ''))
    || _num(b.sessionIndex) - _num(a.sessionIndex)
  ));
}

export function mountTrainerRunningStats(root, { onExit = () => {} } = {}) {
  if (!root) return;
  const activities = _recentFirst(listRunningActivities(Object.entries(getCache() || {})));
  const showRecent = () => _renderRecent(root, activities, onExit, index => {
    const activity = activities[index];
    if (activity) _renderDetail(root, activity, showRecent);
  });
  showRecent();
}
