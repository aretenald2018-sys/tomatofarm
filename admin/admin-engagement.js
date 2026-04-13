import {
  renderDAULine, renderFeatureAdoption,
  renderHealthScoreBar, renderLifecycleFunnel,
} from './admin-charts.js';

function _dauWauMau(data) {
  const labels = [];
  const dau = [];
  const wau = [];
  const mau = [];

  for (let i = 29; i >= 0; i--) {
    const key = data.dateKeys30[i];
    if (!key) continue;
    labels.push(key.slice(5));

    const day = data.workoutMap[key] || {};
    dau.push(Object.values(day).filter((v) => v.any).length);

    const wauSet = new Set();
    for (let j = i; j < Math.min(i + 7, data.dateKeys30.length); j++) {
      Object.entries(data.workoutMap[data.dateKeys30[j]] || {}).forEach(([uid, v]) => {
        if (v.any) wauSet.add(uid);
      });
    }
    wau.push(wauSet.size);

    const mauSet = new Set();
    for (let j = i; j < Math.min(i + 30, data.dateKeys30.length); j++) {
      Object.entries(data.workoutMap[data.dateKeys30[j]] || {}).forEach(([uid, v]) => {
        if (v.any) mauSet.add(uid);
      });
    }
    mau.push(mauSet.size);
  }

  return { labels, dau, wau, mau };
}

function _featureAdoption(data) {
  const bucket = new Map();
  data.analytics.slice(0, 7).forEach((doc) => {
    Object.entries(doc.users || {}).forEach(([uid, user]) => {
      (user.featuresUsed || []).forEach((feature) => {
        if (!bucket.has(feature)) bucket.set(feature, new Set());
        bucket.get(feature).add(uid);
      });
    });
  });

  const labels = [];
  const values = [];
  const total = Math.max(1, data.realAccs.length);
  Array.from(bucket.entries())
    .map(([feature, users]) => ({ feature, count: users.size }))
    .sort((a, b) => b.count - a.count)
    .forEach(({ feature, count }) => {
      labels.push(feature);
      values.push(Math.round((count / total) * 100));
    });
  return { labels, values };
}

export function renderHealthSection(container, data) {
  const lifecycleCounts = {
    new: data.segmentSummary.byLifecycle.new.length,
    activated: data.segmentSummary.byLifecycle.activated.length,
    engaged: data.segmentSummary.byLifecycle.engaged.length,
    atRisk: data.segmentSummary.byLifecycle.atRisk.length,
    dormant: data.segmentSummary.byLifecycle.dormant.length,
  };

  const scoreRows = Object.values(data.userSegments)
    .sort((a, b) => a.score - b.score)
    .map((seg) => ({ label: seg.name.slice(0, 6), score: seg.score }));

  const trend = _dauWauMau(data);
  const features = _featureAdoption(data);

  const latestDAU = trend.dau[trend.dau.length - 1] || 0;
  const latestMAU = Math.max(1, trend.mau[trend.mau.length - 1] || 1);
  const stickiness = Math.round((latestDAU / latestMAU) * 100);

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-metric-grid">
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">DAU/MAU</div>
          <div class="hig-title2">${stickiness}%</div>
          <div class="hig-caption1" style="color:var(--hig-gray1);">5-10명 규모에서는 30% 이상이면 안정 구간</div>
        </div>
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">At-Risk + Dormant</div>
          <div class="hig-title2">${lifecycleCounts.atRisk + lifecycleCounts.dormant}</div>
          <div class="hig-caption1" style="color:var(--hig-gray1);">즉시 아웃리치 대상</div>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">DAU / WAU / MAU</div>
        <div id="admin-health-dau" style="height:180px;"></div>
      </div>

      <div class="hig-grid-2">
        <div class="hig-card">
          <div class="hig-headline" style="margin-bottom:10px;">Lifecycle Funnel</div>
          <div id="admin-health-funnel" style="height:180px;"></div>
        </div>
        <div class="hig-card">
          <div class="hig-headline" style="margin-bottom:10px;">Health Score 분포</div>
          <div id="admin-health-score" style="height:180px;"></div>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">기능 채택률 (7일)</div>
        <div id="admin-health-feature" style="height:${Math.max(140, features.labels.length * 30)}px;"></div>
      </div>
    </div>
  `;

  const dauEl = document.getElementById('admin-health-dau');
  if (dauEl) renderDAULine(dauEl, trend.labels, trend.dau, trend.wau, trend.mau);

  const funnelEl = document.getElementById('admin-health-funnel');
  if (funnelEl) {
    renderLifecycleFunnel(funnelEl, ['New', 'Activated', 'Engaged', 'At-Risk', 'Dormant'], [
      lifecycleCounts.new,
      lifecycleCounts.activated,
      lifecycleCounts.engaged,
      lifecycleCounts.atRisk,
      lifecycleCounts.dormant,
    ]);
  }

  const scoreEl = document.getElementById('admin-health-score');
  if (scoreEl) renderHealthScoreBar(scoreEl, scoreRows.map((r) => r.label), scoreRows.map((r) => r.score));

  const featureEl = document.getElementById('admin-health-feature');
  if (featureEl) renderFeatureAdoption(featureEl, features.labels, features.values);
}
