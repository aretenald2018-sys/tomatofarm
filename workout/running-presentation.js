function _number(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function _formatNumber(value, digits = 1) {
  const number = _number(value);
  if (Number.isInteger(number)) return String(number);
  return String(Math.round(number * (10 ** digits)) / (10 ** digits));
}

function _formatDurationShort(seconds) {
  const secondsRounded = Math.max(0, Math.round(_number(seconds)));
  if (secondsRounded <= 0) return '—';
  if (secondsRounded < 60) return `${secondsRounded}초`;
  return `${Math.round(secondsRounded / 60)}분`;
}

export function formatRunningDuration(seconds, {
  padMinutes = true,
  rounding = 'floor',
} = {}) {
  const numeric = _number(seconds);
  const total = Math.max(0, rounding === 'round' ? Math.round(numeric) : Math.floor(numeric));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  const minuteText = padMinutes ? String(minutes).padStart(2, '0') : String(minutes);
  return `${minuteText}:${String(remainder).padStart(2, '0')}`;
}

export function formatRunningPace(secondsPerKilometer, {
  empty = "--'--''",
  secondsMark = "''",
  suffix = '',
} = {}) {
  const seconds = Math.round(_number(secondsPerKilometer));
  if (seconds <= 0) return empty;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}'${String(remainder).padStart(2, '0')}${secondsMark}${suffix}`;
}

export function formatRunningDistance(value) {
  const kilometers = _number(value);
  if (kilometers <= 0) return '';
  return `${_formatNumber(kilometers, kilometers < 10 ? 2 : 1)}km`;
}

export function formatRunningPaceCard(secondsPerKilometer) {
  return formatRunningPace(secondsPerKilometer, { empty: '', suffix: '/km' });
}

export function formatRunningClock(timestamp) {
  const milliseconds = Number(timestamp);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '';
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function runningSourceLabel(source) {
  if (source === 'gps') return 'GPS 기록';
  if (source === 'wear' || source === 'wear-gps') return '워치 기록';
  if (source === 'screenshot-import') return '업로드 기록';
  if (source === 'manual-cardio') return '수기 입력';
  if (source === 'manual') return '수동 기록';
  return '러닝 기록';
}

export function runningMetricItems(row = {}) {
  const durationText = row.durationSec ? _formatDurationShort(row.durationSec) : '--';
  const paceText = formatRunningPaceCard(row.avgPaceSecPerKm) || "--'--''";
  const speedText = row.speedKmh > 0 ? `${_formatNumber(row.speedKmh, 1)} km/h` : '--';
  return [
    { label: '거리', value: formatRunningDistance(row.distanceKm) || '--' },
    { label: '시간', value: durationText },
    { label: '속도', value: speedText },
    { label: '평균 페이스', value: paceText },
    { label: '칼로리', value: row.calories > 0 ? `${Math.round(row.calories)} kcal` : '--' },
    { label: '고도 상승', value: row.elevationGainM == null ? '--' : `${Math.round(row.elevationGainM)} m` },
    { label: '평균 심박수', value: row.avgHeartRateBpm == null ? '--' : `${Math.round(row.avgHeartRateBpm)}` },
    { label: '케이던스', value: row.cadenceSpm == null ? '--' : `${Math.round(row.cadenceSpm)}` },
  ].filter(item => item?.value);
}

export function runningPlaceLabel(row = {}) {
  const label = String(row?.placeSummary?.label || '').trim();
  if (label && !/대한민국 위치 기록|위치 기록/.test(label)) return label;
  return row?.routeSummary?.centroid ? 'GPS 위치 기록' : '위치 정보 없음';
}

export function runningGpsInfoLabel(row = {}) {
  const gapCount = Math.max(0, Math.floor(_number(row?.gapCount ?? row?.routeSummary?.gapCount)));
  if (!gapCount && !row?.interrupted) return '';
  const segmentCount = Math.max(0, Math.floor(_number(row?.segmentCount ?? row?.routeSummary?.segmentCount)));
  const segmentText = segmentCount > 1 ? ` · 기록 구간 ${segmentCount}개` : '';
  return `GPS 중단 구간 ${Math.max(1, gapCount)}개${segmentText}. 끊긴 구간은 거리와 지도 선에서 제외했어요.`;
}
