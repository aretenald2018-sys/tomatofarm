// ================================================================
// admin/admin-engagement.js — 인게이지먼트 ("프로덕트 건강" 뷰)
// ================================================================

import { TODAY } from '../data.js';
import { dk, daysAgo, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';
import { renderDAULine, renderFeatureAdoption, renderStreakDonut } from './admin-charts.js';

/**
 * 인게이지먼트 섹션 렌더
 * @param {HTMLElement} container
 * @param {Object} data - 전체 adminData
 */
export function renderEngagementSection(container, data) {
  const { realAccs, analytics, patchnotes, workoutMap, dateKeys30 } = data;
  const totalUsers = realAccs.length;

  // ── DAU/WAU/MAU 트렌드 (30일, workoutMap 기반) ──
  const chartLabels = [];
  const dauArr = [];
  const wauArr = [];
  const mauArr = [];

  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    chartLabels.push(`${d.getMonth()+1}/${d.getDate()}`);

    // DAU (workoutMap)
    const wk = workoutMap[dateKeys30[i]] || {};
    const dayUsers = Object.values(wk).filter(w => w.any).length;
    dauArr.push(dayUsers);

    // WAU (i ~ i+6)
    const wauSet = new Set();
    for (let j = i; j < Math.min(i + 7, 30); j++) {
      const wkj = workoutMap[dateKeys30[j]] || {};
      for (const [uid, w] of Object.entries(wkj)) {
        if (w.any) wauSet.add(uid);
      }
    }
    wauArr.push(wauSet.size);

    // MAU (rolling 30d)
    const mauSet = new Set();
    for (let j = i; j < Math.min(i + 30, 30); j++) {
      const wkj = workoutMap[dateKeys30[j]] || {};
      for (const [uid, w] of Object.entries(wkj)) {
        if (w.any) mauSet.add(uid);
      }
    }
    mauArr.push(mauSet.size);
  }

  // DAU/MAU 스티키니스
  const latestDAU = dauArr[dauArr.length - 1] || 0;
  const latestMAU = mauArr[mauArr.length - 1] || 1;
  const stickiness = Math.round((latestDAU / latestMAU) * 100);

  // ── 기능 채택 (최근 7일 — workoutMap + analytics 혼합) ──
  const wauSet7 = new Set();
  const featureCount = {};
  const tabCount = {};

  // workoutMap에서 운동/식단 유저 카운트
  for (let i = 0; i < 7; i++) {
    const wk = workoutMap[dateKeys30[i]] || {};
    for (const [uid, w] of Object.entries(wk)) {
      if (w.any) wauSet7.add(uid);
      if (w.exercise) { if (!featureCount['운동']) featureCount['운동'] = new Set(); featureCount['운동'].add(uid); }
      if (w.diet) { if (!featureCount['식단']) featureCount['식단'] = new Set(); featureCount['식단'].add(uid); }
    }
  }

  // analytics에서 추가 기능 (AI, 사진 등 — 트래킹 축적 후)
  for (const dayDoc of analytics.slice(0, 7)) {
    if (!dayDoc.users) continue;
    for (const [uid, u] of Object.entries(dayDoc.users)) {
      if (u.featuresUsed) {
        for (const f of u.featuresUsed) {
          if (!featureCount[f]) featureCount[f] = new Set();
          featureCount[f].add(uid);
        }
      }
      if (u.tabVisits) {
        for (const [tab, cnt] of Object.entries(u.tabVisits)) {
          if (!tabCount[tab]) tabCount[tab] = 0;
          tabCount[tab] += cnt;
        }
      }
    }
  }

  const wau7 = wauSet7.size || 1;
  const featureLabels = [];
  const featurePcts = [];
  // 기능명 매핑
  const featureNameMap = {
    '운동': '운동 기록', '식단': '식단 기록',
    'photo_upload': '사진 업로드', 'ai_diet_rec': 'AI 식단추천',
    'ai_workout_rec': 'AI 운동추천', 'ai_goal_analysis': 'AI 목표분석',
    'streak_freeze': '스트릭 프리즈',
  };

  for (const [key, userSet] of Object.entries(featureCount)) {
    if (userSet instanceof Set) {
      featureLabels.push(featureNameMap[key] || key);
      featurePcts.push(Math.round((userSet.size / wau7) * 100));
    }
  }

  // 정렬 (높은 순)
  const sortedIdx = featurePcts.map((_, i) => i).sort((a, b) => featurePcts[b] - featurePcts[a]);
  const sortedLabels = sortedIdx.map(i => featureLabels[i]);
  const sortedPcts = sortedIdx.map(i => featurePcts[i]);

  // ── 탭 사용 비율 ──
  const totalTabVisits = Object.values(tabCount).reduce((s, c) => s + c, 0) || 1;
  const tabEntries = Object.entries(tabCount).sort((a, b) => b[1] - a[1]);
  const tabNameMap = { home: '홈', workout: '운동', diet: '식단', stats: '통계', cooking: '요리', admin: '어드민' };

  // ── 스트릭 분포 (workoutMap 기반) ──
  const workoutStreaks = [];
  const dietStreaks = [];
  for (const acc of realAccs) {
    let ws = 0, ds = 0;
    for (let i = 0; i < 14; i++) {
      const wk = workoutMap[dateKeys30[i]] || {};
      if (wk[acc.id]?.exercise) ws++;
      else break;
    }
    for (let i = 0; i < 14; i++) {
      const wk = workoutMap[dateKeys30[i]] || {};
      if (wk[acc.id]?.diet) ds++;
      else break;
    }
    workoutStreaks.push(ws);
    dietStreaks.push(ds);
  }

  const wsDist = [0, 0, 0, 0]; // 0, 1-3, 4-7, 7+
  const dsDist = [0, 0, 0, 0];
  for (const s of workoutStreaks) {
    if (s === 0) wsDist[0]++;
    else if (s <= 3) wsDist[1]++;
    else if (s <= 7) wsDist[2]++;
    else wsDist[3]++;
  }
  for (const s of dietStreaks) {
    if (s === 0) dsDist[0]++;
    else if (s <= 3) dsDist[1]++;
    else if (s <= 7) dsDist[2]++;
    else dsDist[3]++;
  }

  // ── 패치노트 도달률 ──
  const patchStats = patchnotes.slice(0, 5).map(p => {
    const readCount = (p.readBy || []).length;
    const rate = totalUsers > 0 ? Math.round((readCount / totalUsers) * 100) : 0;
    return { title: p.title, rate, readCount, total: totalUsers };
  });

  // ── HTML ──
  container.innerHTML = `
    <!-- 스티키니스 KPI -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;color:var(--text-tertiary);">DAU/MAU 스티키니스</div>
          <div style="font-size:28px;font-weight:800;color:${stickiness >= 25 ? '#22c55e' : stickiness >= 15 ? '#f59e0b' : '#ef4444'};">${stickiness}%</div>
          <div style="font-size:10px;color:var(--text-tertiary);">듀오링고 기준 25%+ = 건강</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text-tertiary);">오늘 DAU</div>
          <div style="font-size:20px;font-weight:700;color:var(--text);">${latestDAU}</div>
        </div>
      </div>
    </div>

    <!-- DAU/WAU/MAU 트렌드 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">DAU / WAU / MAU 트렌드</div>
      <div id="admin-engage-dau-wrap" style="height:180px;"></div>
    </div>

    <!-- 기능 채택 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">기능 채택률 (7일 WAU 기준)</div>
      ${sortedLabels.length > 0 ? `<div id="admin-engage-feature-wrap" style="height:${Math.max(120, sortedLabels.length * 28)}px;"></div>` :
        '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:8px;">데이터 없음</div>'}
    </div>

    <!-- 탭 사용 비율 -->
    ${tabEntries.length > 0 ? `
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">탭 사용 비율 (7일)</div>
      <div style="display:flex;border-radius:8px;overflow:hidden;height:24px;">
        ${tabEntries.map(([tab, cnt], i) => {
          const pct = Math.max((cnt / totalTabVisits) * 100, 2);
          const colors = ['#fa342c','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#6366f1'];
          return `<div style="width:${pct}%;background:${colors[i % colors.length]};display:flex;align-items:center;justify-content:center;" title="${tabNameMap[tab] || tab}: ${cnt}회 (${Math.round(pct)}%)">
            <span style="font-size:8px;color:#fff;font-weight:600;overflow:hidden;white-space:nowrap;">${tabNameMap[tab] || tab}</span>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
        ${tabEntries.map(([tab, cnt], i) => {
          const colors = ['#fa342c','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#6366f1'];
          return `<span style="font-size:10px;color:var(--text-tertiary);display:flex;align-items:center;gap:3px;">
            <span style="width:8px;height:8px;border-radius:2px;background:${colors[i % colors.length]};"></span>
            ${tabNameMap[tab] || tab} ${cnt}회
          </span>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- 스트릭 분포 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">스트릭 분포</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div id="admin-engage-streak-workout" style="height:140px;"></div>
        <div id="admin-engage-streak-diet" style="height:140px;"></div>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px;">
        초록=연속, 노랑=1-3일, 주황=4-7일, 회색=0일
      </div>
    </div>

    <!-- 패치노트 도달률 -->
    ${patchStats.length > 0 ? `
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">패치노트 도달률</div>
      ${patchStats.map(p => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title || '제목 없음'}</span>
          <div style="width:60px;height:6px;border-radius:3px;background:var(--border);overflow:hidden;flex-shrink:0;">
            <div style="width:${p.rate}%;height:100%;background:${p.rate >= 70 ? '#22c55e' : p.rate >= 40 ? '#f59e0b' : '#ef4444'};border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0;width:36px;text-align:right;">${p.rate}%</span>
        </div>
      `).join('')}
    </div>` : ''}
  `;

  // 차트 렌더
  const dauWrap = document.getElementById('admin-engage-dau-wrap');
  if (dauWrap) renderDAULine(dauWrap, chartLabels, dauArr, wauArr, mauArr);

  if (sortedLabels.length > 0) {
    const featureWrap = document.getElementById('admin-engage-feature-wrap');
    if (featureWrap) renderFeatureAdoption(featureWrap, sortedLabels, sortedPcts);
  }

  const wsEl = document.getElementById('admin-engage-streak-workout');
  const dsEl = document.getElementById('admin-engage-streak-diet');
  if (wsEl) renderStreakDonut(wsEl, 'admin-streak-workout', '운동 스트릭', wsDist);
  if (dsEl) renderStreakDonut(dsEl, 'admin-streak-diet', '식단 스트릭', dsDist);
}
