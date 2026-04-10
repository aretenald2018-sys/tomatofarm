// ================================================================
// admin/admin-charts.js — Chart.js 팩토리 함수
// ================================================================

/** 기존 차트 파괴 후 새로 생성 (메모리 누수 방지) */
function _getOrCreateCanvas(container, id, height = 200) {
  let canvas = container.querySelector(`#${id}`);
  if (canvas) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
  } else {
    canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.style.height = height + 'px';
    container.appendChild(canvas);
  }
  return canvas;
}

/** 공통 Chart.js 옵션 (TDS 다크모드 호환) */
const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { font: { size: 11, family: "'Toss Product Sans', sans-serif" }, color: '#888' },
    },
  },
  scales: {
    x: { ticks: { font: { size: 10 }, color: '#888' }, grid: { display: false } },
    y: { ticks: { font: { size: 10 }, color: '#888' }, grid: { color: 'rgba(128,128,128,0.1)' }, beginAtZero: true },
  },
};

/**
 * 30일 인게이지먼트 라인 차트
 * @param {HTMLElement} container
 * @param {string[]} labels - 날짜 라벨
 * @param {number[]} exerciseData - 운동 기록 유저 수
 * @param {number[]} dietData - 식단 기록 유저 수
 */
export function renderEngagementLine(container, labels, exerciseData, dietData) {
  const canvas = _getOrCreateCanvas(container, 'admin-engagement-chart', 180);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '운동 기록',
          data: exerciseData,
          borderColor: '#fa342c',
          backgroundColor: 'rgba(250,52,44,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: '식단 기록',
          data: dietData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: { ...BASE_OPTIONS },
  });
}

/**
 * DAU/WAU/MAU 트렌드 라인 차트
 */
export function renderDAULine(container, labels, dau, wau, mau) {
  const canvas = _getOrCreateCanvas(container, 'admin-dau-chart', 180);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'DAU', data: dau, borderColor: '#fa342c', tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: 'WAU', data: wau, borderColor: '#f59e0b', tension: 0.3, pointRadius: 2, borderWidth: 1.5, borderDash: [4,2] },
        { label: 'MAU', data: mau, borderColor: '#6366f1', tension: 0.3, pointRadius: 2, borderWidth: 1.5, borderDash: [6,3] },
      ],
    },
    options: { ...BASE_OPTIONS },
  });
}

/**
 * 기능 채택 가로 바 차트
 */
export function renderFeatureAdoption(container, featureLabels, percentages) {
  const canvas = _getOrCreateCanvas(container, 'admin-feature-chart', Math.max(120, featureLabels.length * 28));
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: featureLabels,
      datasets: [{
        data: percentages,
        backgroundColor: percentages.map(p => p >= 50 ? '#22c55e' : p >= 25 ? '#f59e0b' : '#ef4444'),
        borderRadius: 4,
        barThickness: 16,
      }],
    },
    options: {
      ...BASE_OPTIONS,
      indexAxis: 'y',
      plugins: { ...BASE_OPTIONS.plugins, legend: { display: false } },
      scales: {
        x: { ...BASE_OPTIONS.scales.x, max: 100, ticks: { callback: v => v + '%' } },
        y: { ...BASE_OPTIONS.scales.y, grid: { display: false } },
      },
    },
  });
}

/**
 * 스트릭 분포 도넛 차트
 */
export function renderStreakDonut(container, chartId, label, distribution) {
  const canvas = _getOrCreateCanvas(container, chartId, 140);
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['0일', '1-3일', '4-7일', '7일+'],
      datasets: [{
        data: distribution,
        backgroundColor: ['#e5e7eb', '#fbbf24', '#fb923c', '#22c55e'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, color: '#888', padding: 8 } },
        title: { display: true, text: label, font: { size: 12, weight: '600' }, color: '#888' },
      },
    },
  });
}

/**
 * 소셜 인터랙션 스택드 바 차트
 */
export function renderSocialStacked(container, labels, datasets) {
  const canvas = _getOrCreateCanvas(container, 'admin-social-chart', 180);
  const colors = ['#fa342c', '#3b82f6', '#8b5cf6', '#f59e0b'];
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: colors[i % colors.length],
        borderRadius: 2,
      })),
    },
    options: {
      ...BASE_OPTIONS,
      scales: {
        ...BASE_OPTIONS.scales,
        x: { ...BASE_OPTIONS.scales.x, stacked: true },
        y: { ...BASE_OPTIONS.scales.y, stacked: true },
      },
    },
  });
}
