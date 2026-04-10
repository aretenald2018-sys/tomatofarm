// ================================================================
// admin/admin-overview.js — 오버뷰 ("모닝커피" 뷰)
// ================================================================

import { TODAY, dateKey } from '../data.js';
import { dk, daysAgo, fmtDate, fmtDateShort, nameResolver, deltaText, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';
import { renderEngagementLine } from './admin-charts.js';

/**
 * 오버뷰 섹션 렌더
 * @param {HTMLElement} container
 * @param {Object} data - 전체 adminData
 */
export function renderOverviewSection(container, data) {
  const { realAccs, accs, frs, gbs, lks, letters, analytics, workoutMap, dateKeys30 } = data;
  const _name = nameResolver(accs);

  const todayTs = new Date(TODAY).setHours(0,0,0,0);
  const todayKey = dk(TODAY);
  const analyticsMap = Object.fromEntries((analytics || []).map(a => [a.dk, a]));
  const todayAnalyticsUsers = analyticsMap[todayKey]?.users || {};

  // ── KPI 계산 (workoutMap 기반 — 실제 운동/식단 데이터) ──
  const totalUsers = realAccs.length;

  // DAU: 오늘 활동한 유저 (운동/식단 또는 앱 접속)
  const todayWk = workoutMap[todayKey] || {};
  const dauSet = new Set();
  for (const [uid, w] of Object.entries(todayWk)) {
    if (w.any) dauSet.add(uid);
  }
  for (const [uid, stats] of Object.entries(todayAnalyticsUsers)) {
    if ((stats.sessions || 0) > 0) dauSet.add(uid);
  }
  const dau = dauSet.size;

  const dauSessionUsers = [...dauSet]
    .map((uid) => ({
      uid,
      sessions: todayAnalyticsUsers[uid]?.sessions || 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // WAU: 최근 7일 유니크
  const wauSet = new Set();
  for (let i = 0; i < 7; i++) {
    const wk = workoutMap[dateKeys30[i]] || {};
    for (const [uid, w] of Object.entries(wk)) {
      if (w.any) wauSet.add(uid);
    }
  }
  const wau = wauSet.size;

  // 7일 전 DAU (비교용)
  const weekAgoDk = dateKeys30[7];
  const weekAgoWk = workoutMap[weekAgoDk] || {};
  const weekAgoAnalyticsUsers = analyticsMap[weekAgoDk]?.users || {};
  const dauWeekAgoSet = new Set();
  for (const [uid, w] of Object.entries(weekAgoWk)) {
    if (w.any) dauWeekAgoSet.add(uid);
  }
  for (const [uid, stats] of Object.entries(weekAgoAnalyticsUsers)) {
    if ((stats.sessions || 0) > 0) dauWeekAgoSet.add(uid);
  }
  const dauWeekAgo = dauWeekAgoSet.size;

  // 7일 전 WAU (비교용)
  const wauPrevSet = new Set();
  for (let i = 7; i < 14; i++) {
    const wk = workoutMap[dateKeys30[i]] || {};
    for (const [uid, w] of Object.entries(wk)) {
      if (w.any) wauPrevSet.add(uid);
    }
  }
  const wauPrev = wauPrevSet.size;

  // 코어루프 완료율 (운동+식단 모두 기록)
  let coreLoopUsers = 0;
  for (const [uid, w] of Object.entries(todayWk)) {
    if (w.exercise && w.diet) coreLoopUsers++;
  }
  const coreLoopRate = dau > 0 ? Math.round((coreLoopUsers / dau) * 100) : 0;

  // 오늘 소셜 인터랙션
  const todayLikes = lks.filter(l => (l.createdAt || 0) >= todayTs).length;
  const todayGb = gbs.filter(g => (g.createdAt || 0) >= todayTs).length;
  const todaySocial = todayLikes + todayGb;

  // ── 주의 필요 알림 ──
  const alerts = [];

  // 이탈 위험: 지난주 활동했으나 이번주 미활동 (workoutMap 기반)
  const churnRisk = [...wauPrevSet].filter(uid => !wauSet.has(uid));
  if (churnRisk.length > 0) {
    alerts.push({ color: '#ef4444', text: `이탈 위험 ${churnRisk.length}명: ${churnRisk.map(id => _name(id)).join(', ')}` });
  }

  // 튜토리얼 미완료
  const noTutorial = realAccs.filter(a => !a.tutorialDoneAt);
  if (noTutorial.length > 0) {
    alerts.push({ color: '#f59e0b', text: `튜토리얼 미완료 ${noTutorial.length}명: ${noTutorial.map(a => a.nickname || a.lastName + a.firstName).join(', ')}` });
  }

  // 미읽은 편지
  const unread = letters.filter(l => !l.read).length;
  if (unread > 0) {
    alerts.push({ color: '#3b82f6', text: `미읽은 개발자 편지 ${unread}통` });
  }

  // ── 30일 차트 데이터 ──
  const chartLabels = [];
  const exerciseData = [];
  const dietData = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const key = dateKeys30[i] || dk(d);
    chartLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
    const wk = workoutMap[key] || {};
    let exCount = 0, dietCount = 0;
    for (const w of Object.values(wk)) {
      if (w.exercise) exCount++;
      if (w.diet) dietCount++;
    }
    exerciseData.push(exCount);
    dietData.push(dietCount);
  }

  // ── 오늘 활동 피드 ──
  const feedItems = [];
  // 소셜 이벤트 (좋아요, 방명록)
  const todayLikesList = lks.filter(l => (l.createdAt || 0) >= todayTs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const todayGbList = gbs.filter(g => (g.createdAt || 0) >= todayTs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  todayLikesList.forEach(l => feedItems.push({
    time: l.createdAt, type: 'social', color: '#8b5cf6',
    text: `${_name(l.from)} → ${_name(l.to)} ${l.emoji || '👏'}`,
  }));
  todayGbList.forEach(g => feedItems.push({
    time: g.createdAt, type: 'social', color: '#8b5cf6',
    text: `${g.fromName || _name(g.from)} → ${_name(g.to)} 방명록`,
  }));

  // workoutMap에서 운동/식단 피드 추가
  for (const [uid, w] of Object.entries(todayWk)) {
    if (w.exercise) feedItems.push({ time: todayTs + 1, type: 'exercise', color: '#22c55e', text: `${_name(uid)} 운동 기록` });
    if (w.diet) feedItems.push({ time: todayTs + 2, type: 'diet', color: '#3b82f6', text: `${_name(uid)} 식단 기록` });
  }

  feedItems.sort((a, b) => b.time - a.time);

  // ── HTML ──
  container.innerHTML = `
    <!-- KPI 카드 -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">
      ${[
        {
          label: 'DAU / 전체',
          value: `${dau}<span style="font-size:13px;font-weight:400;color:var(--text-tertiary);">/${totalUsers}</span>`,
          delta: deltaText(dau, dauWeekAgo),
          color: '#fa342c',
          subHtml: dauSessionUsers.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;">${dauSessionUsers.map(({ uid, sessions }) => `<span style="font-size:10px;color:var(--text-tertiary);">${_name(uid)} · ${sessions}회</span>`).join('')}</div>`
            : '<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">오늘 활동 유저 없음</div>',
        },
        { label: 'WAU', value: wau, delta: deltaText(wau, wauPrev), color: 'var(--text)' },
        { label: '코어루프 완료율', value: `${coreLoopRate}<span style="font-size:12px;font-weight:400;color:var(--text-tertiary);">%</span>`, delta: '', color: coreLoopRate >= 50 ? '#22c55e' : '#f59e0b' },
        { label: '오늘 소셜', value: todaySocial, delta: '', color: 'var(--text)', sub: `리액션 ${todayLikes} · 방명록 ${todayGb}` },
      ].map(m => `
        <div style="${CARD_STYLE};margin-bottom:0;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">${m.label}</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span style="font-size:22px;font-weight:800;color:${m.color};">${m.value}</span>
            ${m.delta || ''}
          </div>
          ${m.subHtml || ''}
          ${m.sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${m.sub}</div>` : ''}
        </div>
      `).join('')}
    </div>

    <!-- 30일 인게이지먼트 차트 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">30일 인게이지먼트</div>
      <div id="admin-overview-chart-wrap" style="height:180px;"></div>
      ${realAccs.length === 0 ? '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:8px;">사용자가 없어요</div>' : ''}
    </div>

    <!-- 주의 필요 -->
    ${alerts.length > 0 ? `
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">주의 필요</div>
      ${alerts.map(a => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="width:6px;height:6px;border-radius:50%;background:${a.color};flex-shrink:0;margin-top:5px;"></span>
          <span style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${a.text}</span>
        </div>
      `).join('')}
    </div>` : ''}

    <!-- 오늘 활동 피드 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">오늘 활동</div>
      ${feedItems.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">아직 오늘 활동이 없어요</div>' :
        feedItems.slice(0, 20).map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">
            <span style="width:6px;height:6px;border-radius:50%;background:${f.color};flex-shrink:0;"></span>
            <span style="font-size:12px;color:var(--text);flex:1;">${f.text}</span>
            <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0;">${fmtDate(f.time)}</span>
          </div>
        `).join('')
      }
    </div>
  `;

  // 차트 렌더
  const chartWrap = document.getElementById('admin-overview-chart-wrap');
  if (chartWrap) renderEngagementLine(chartWrap, chartLabels, exerciseData, dietData);
}
