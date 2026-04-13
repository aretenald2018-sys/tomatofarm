function _getOrCreateCanvas(container, id, height = 200) {
  let canvas = container.querySelector(`#${id}`);
  if (canvas) {
    const chart = Chart.getChart(canvas);
    if (chart) chart.destroy();
  } else {
    canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.style.height = `${height}px`;
    container.appendChild(canvas);
  }
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.maxWidth = '100%';
  return canvas;
}

const COLORS = {
  tomato: '#FA342C',
  tomatoSub: '#FC6A66',
  green: '#079171',
  orange: '#F59F00',
  red: '#FA342C',
  purple: '#8969EA',
  teal: '#5E98FE',
  gray: '#8E8E93',
  separator: '#38383A',
  text: '#E7E7EA',
};

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: COLORS.text,
        font: { size: 11, family: "'Toss Product Sans', 'Tossface', 'SF Pro KR', sans-serif" },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: COLORS.gray, font: { size: 10 } },
      grid: { color: 'rgba(56,56,58,0.2)' },
    },
    y: {
      ticks: { color: COLORS.gray, font: { size: 10 } },
      grid: { color: 'rgba(56,56,58,0.2)' },
      beginAtZero: true,
    },
  },
};

function _isNarrow(container) {
  return (container?.clientWidth || 0) > 0 && (container.clientWidth || 0) < 420;
}

function _withResponsiveOptions(container, options = {}) {
  const narrow = _isNarrow(container);
  if (!narrow) return options;
  return {
    ...options,
    plugins: {
      ...(options.plugins || {}),
      legend: {
        ...(options.plugins?.legend || {}),
        labels: {
          ...(options.plugins?.legend?.labels || {}),
          boxWidth: 10,
          font: { ...(options.plugins?.legend?.labels?.font || {}), size: 10 },
        },
      },
    },
    scales: {
      ...(options.scales || {}),
      x: {
        ...(options.scales?.x || {}),
        ticks: {
          ...(options.scales?.x?.ticks || {}),
          maxTicksLimit: 5,
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0,
          font: { ...(options.scales?.x?.ticks?.font || {}), size: 9 },
        },
      },
      y: {
        ...(options.scales?.y || {}),
        ticks: {
          ...(options.scales?.y?.ticks || {}),
          maxTicksLimit: 5,
          font: { ...(options.scales?.y?.ticks?.font || {}), size: 9 },
        },
      },
    },
  };
}

export function renderEngagementLine(container, labels, exerciseData, dietData) {
  const canvas = _getOrCreateCanvas(container, 'admin-engagement-chart', 180);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Exercise',
          data: exerciseData,
          borderColor: COLORS.tomato,
          backgroundColor: 'rgba(250,52,44,0.16)',
          pointRadius: 2,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Diet',
          data: dietData,
          borderColor: COLORS.teal,
          backgroundColor: 'rgba(94,152,254,0.14)',
          pointRadius: 2,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: _withResponsiveOptions(container, { ...BASE_OPTIONS }),
  });
}

export function renderDAULine(container, labels, dau, wau, mau) {
  const canvas = _getOrCreateCanvas(container, 'admin-dau-chart', 180);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'DAU', data: dau, borderColor: COLORS.tomato, tension: 0.3, borderWidth: 2, pointRadius: 2 },
        { label: 'WAU', data: wau, borderColor: COLORS.orange, tension: 0.3, borderWidth: 1.8, pointRadius: 2, borderDash: [4, 2] },
        { label: 'MAU', data: mau, borderColor: COLORS.purple, tension: 0.3, borderWidth: 1.8, pointRadius: 2, borderDash: [6, 3] },
      ],
    },
    options: _withResponsiveOptions(container, { ...BASE_OPTIONS }),
  });
}

export function renderFeatureAdoption(container, featureLabels, percentages) {
  const canvas = _getOrCreateCanvas(container, 'admin-feature-chart', Math.max(120, featureLabels.length * 28));
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: featureLabels,
      datasets: [{
        data: percentages,
        backgroundColor: percentages.map((v) => (v >= 60 ? COLORS.green : v >= 30 ? COLORS.orange : COLORS.red)),
        borderRadius: 6,
        barThickness: 16,
      }],
    },
    options: _withResponsiveOptions(container, {
      ...BASE_OPTIONS,
      indexAxis: 'y',
      plugins: { ...BASE_OPTIONS.plugins, legend: { display: false } },
      scales: {
        x: {
          ...BASE_OPTIONS.scales.x,
          max: 100,
          ticks: { ...BASE_OPTIONS.scales.x.ticks, callback: (v) => `${v}%` },
        },
        y: { ...BASE_OPTIONS.scales.y, grid: { display: false } },
      },
    }),
  });
}

export function renderStreakDonut(container, chartId, label, distribution) {
  const canvas = _getOrCreateCanvas(container, chartId, 140);
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['0d', '1-2d', '3-6d', '7d+'],
      datasets: [{
        data: distribution,
        backgroundColor: [COLORS.gray, COLORS.orange, COLORS.tomatoSub, COLORS.green],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: COLORS.gray, font: { size: 10 } } },
        title: { display: true, text: label, color: COLORS.text, font: { size: 12, weight: '600' } },
      },
    },
  });
}

export function renderSocialStacked(container, labels, datasets) {
  const canvas = _getOrCreateCanvas(container, 'admin-social-chart', 180);
  const palette = [COLORS.purple, COLORS.teal, COLORS.tomato, COLORS.orange];
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, index) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: palette[index % palette.length],
        borderRadius: 4,
      })),
    },
    options: _withResponsiveOptions(container, {
      ...BASE_OPTIONS,
      scales: {
        ...BASE_OPTIONS.scales,
        x: { ...BASE_OPTIONS.scales.x, stacked: true },
        y: { ...BASE_OPTIONS.scales.y, stacked: true },
      },
    }),
  });
}

export function renderHealthScoreBar(container, labels, scores) {
  const canvas = _getOrCreateCanvas(container, 'admin-health-score-bar', 200);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Health Score',
        data: scores,
        borderRadius: 6,
        backgroundColor: scores.map((score) => (score >= 70 ? COLORS.green : score >= 40 ? COLORS.orange : COLORS.red)),
      }],
    },
    options: _withResponsiveOptions(container, {
      ...BASE_OPTIONS,
      plugins: {
        ...BASE_OPTIONS.plugins,
        legend: { display: false },
      },
      scales: {
        ...BASE_OPTIONS.scales,
        y: {
          ...BASE_OPTIONS.scales.y,
          max: 100,
        },
      },
    }),
  });
}

export function renderLifecycleFunnel(container, labels, values) {
  const canvas = _getOrCreateCanvas(container, 'admin-lifecycle-funnel', 180);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        borderRadius: 8,
        backgroundColor: [COLORS.teal, COLORS.tomatoSub, COLORS.green, COLORS.orange, COLORS.red],
      }],
    },
    options: _withResponsiveOptions(container, {
      ...BASE_OPTIONS,
      plugins: { ...BASE_OPTIONS.plugins, legend: { display: false } },
      scales: {
        x: { ...BASE_OPTIONS.scales.x, grid: { display: false } },
        y: { ...BASE_OPTIONS.scales.y, ticks: { ...BASE_OPTIONS.scales.y.ticks, precision: 0 } },
      },
    }),
  });
}
