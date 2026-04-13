import { TODAY } from '../data.js';
import {
  fmtDate, escapeHtml, stageLabel, trajectoryLabel,
} from './admin-utils.js';
import {
  renderEngagementLine, renderDAULine, renderFeatureAdoption,
  renderHealthScoreBar, renderLifecycleFunnel,
} from './admin-charts.js';

function _formatKoreanDate(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function _todayFeed(data, top = 20) {
  const feed = [];
  const todayStart = new Date(TODAY).setHours(0, 0, 0, 0);

  (data.lks || []).forEach((like) => {
    if ((like.createdAt || 0) < todayStart) return;
    feed.push({
      at: like.createdAt,
      type: 'social',
      text: `${data.resolveName(like.from)} → ${data.resolveName(like.to)} 리액션`,
    });
  });

  (data.gbs || []).forEach((guestbook) => {
    if ((guestbook.createdAt || 0) < todayStart) return;
    feed.push({
      at: guestbook.createdAt,
      type: 'social',
      text: `${guestbook.fromName || data.resolveName(guestbook.from)} → ${data.resolveName(guestbook.to)} 방명록`,
    });
  });

  const todayKey = data.dateKeys30[0];
  const wk = data.workoutMap[todayKey] || {};
  Object.entries(wk).forEach(([uid, value]) => {
    if (value.exercise) feed.push({ at: todayStart + 1, type: 'exercise', text: `${data.resolveName(uid)} 운동 기록` });
    if (value.diet) feed.push({ at: todayStart + 2, type: 'diet', text: `${data.resolveName(uid)} 식단 기록` });
  });

  return feed.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, top);
}

function _activeUsersForToday(data) {
  const todayKey = data.dateKeys30[0];
  const analyticsMap = Object.fromEntries((data.analytics || []).map((item) => [item.dk, item]));
  const todayUsers = analyticsMap[todayKey]?.users || {};
  const set = new Set();
  Object.entries(data.workoutMap[todayKey] || {}).forEach(([uid, value]) => {
    if (value.any) set.add(uid);
  });
  Object.entries(todayUsers).forEach(([uid, stats]) => {
    if ((stats.sessions || 0) > 0) set.add(uid);
  });
  return set.size;
}

function _coreLoopRate(data) {
  const todayKey = data.dateKeys30[0];
  const wk = data.workoutMap[todayKey] || {};
  const activeIds = Object.values(wk).filter((item) => item.any).length || 1;
  const complete = Object.values(wk).filter((item) => item.exercise && item.diet).length;
  return Math.round((complete / activeIds) * 100);
}

function _buildTrend(data) {
  const labels = [];
  const exercise = [];
  const diet = [];

  for (let i = 29; i >= 0; i--) {
    const key = data.dateKeys30[i];
    if (!key) continue;
    labels.push(key.slice(5));
    const wk = data.workoutMap[key] || {};
    exercise.push(Object.values(wk).filter((v) => v.exercise).length);
    diet.push(Object.values(wk).filter((v) => v.diet).length);
  }
  return { labels, exercise, diet };
}

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

function _buildPersonalizedInsights(data) {
  const insights = [];
  const keys14 = data.dateKeys30.slice(0, 14);
  const analyticsByDay = Object.fromEntries((data.analytics || []).map((a) => [a.dk, a]));
  const majorFeatures = ['ai_diet_rec', 'ai_workout_rec', 'streak_freeze', 'friend_feed'];

  data.realAccs.forEach((account) => {
    const uid = account.id;
    const seg = data.userSegments[uid];
    const name = account.nickname || `${account.lastName || ''}${account.firstName || ''}` || uid;

    let exStreak = 0;
    for (let i = 0; i < keys14.length; i++) {
      if (data.workoutMap[keys14[i]]?.[uid]?.exercise) exStreak++;
      else break;
    }
    if (exStreak === 6) {
      insights.push({
        type: 'milestone',
        uid,
        message: `${name} 운동 6일째, 내일이면 7일`,
        cta: '스트릭 격려',
      });
    }

    const tabWeekRecent = { home: 0, stats: 0, social: 0 };
    const tabWeekPrev = { home: 0, stats: 0, social: 0 };
    for (let i = 0; i < 7; i++) {
      const r = analyticsByDay[keys14[i]]?.users?.[uid]?.tabVisits || {};
      const p = analyticsByDay[keys14[i + 7]]?.users?.[uid]?.tabVisits || {};
      tabWeekRecent.home += r.home || 0;
      tabWeekRecent.stats += r.stats || 0;
      tabWeekRecent.social += r.social || 0;
      tabWeekPrev.home += p.home || 0;
      tabWeekPrev.stats += p.stats || 0;
      tabWeekPrev.social += p.social || 0;
    }
    const recentFocus = Object.entries(tabWeekRecent).sort((a, b) => b[1] - a[1])[0]?.[0];
    const prevFocus = Object.entries(tabWeekPrev).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (recentFocus && prevFocus && recentFocus !== prevFocus && (tabWeekRecent[recentFocus] + tabWeekPrev[prevFocus]) > 2) {
      insights.push({
        type: 'time-shift',
        uid,
        message: `${name} 활동 중심이 ${prevFocus} → ${recentFocus}로 이동`,
        cta: '패턴 확인',
      });
    }

    const social7 = (data.lks || []).filter((x) => (x.from === uid || x.to === uid) && (Date.now() - (x.createdAt || 0) <= 7 * 86400000)).length
      + (data.gbs || []).filter((x) => (x.from === uid || x.to === uid) && (Date.now() - (x.createdAt || 0) <= 7 * 86400000)).length;
    const active7 = keys14.slice(0, 7).reduce((acc, key) => acc + (data.workoutMap[key]?.[uid]?.any ? 1 : 0), 0);
    if (active7 >= 3 && social7 === 0) {
      insights.push({
        type: 'social-gap',
        uid,
        message: `${name} 운동/식단은 유지 중, 소셜 활동 0`,
        cta: '소셜 초대',
      });
    }

    const featureUsed = new Set();
    for (let i = 0; i < 7; i++) {
      (analyticsByDay[keys14[i]]?.users?.[uid]?.featuresUsed || []).forEach((f) => featureUsed.add(f));
    }
    const missing = majorFeatures.filter((f) => !featureUsed.has(f));
    if (missing.length) {
      insights.push({
        type: 'unused-feature',
        uid,
        message: `${name} 미사용 기능: ${missing[0]}`,
        cta: '기능 소개',
      });
    }

    if (seg?.stage === 'at-risk' || seg?.stage === 'dormant') {
      insights.push({
        type: 'retention',
        uid,
        message: `${name} ${stageLabel(seg.stage)} · ${trajectoryLabel(seg.trajectory)}`,
        cta: '복귀 메시지',
      });
    }
  });

  const uniqueByUserAndType = new Set();
  return insights.filter((insight) => {
    const key = `${insight.uid}:${insight.type}`;
    if (uniqueByUserAndType.has(key)) return false;
    uniqueByUserAndType.add(key);
    return true;
  }).slice(0, 6);
}

export function renderDashboardSection(container, data, options = {}) {
  const trend = _buildTrend(data);
  const feed = _todayFeed(data);
  const dauTrend = _dauWauMau(data);
  const features = _featureAdoption(data);
  const insights = _buildPersonalizedInsights(data);
  const today = new Date(TODAY);
  const dau = _activeUsersForToday(data);
  const totalUsers = data.realAccs.length;
  const wau = new Set(
    data.dateKeys30.slice(0, 7).flatMap((key) => Object.entries(data.workoutMap[key] || {})
      .filter(([, value]) => value.any)
      .map(([uid]) => uid)),
  ).size;
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
  const latestDAU = dauTrend.dau[dauTrend.dau.length - 1] || 0;
  const latestMAU = Math.max(1, dauTrend.mau[dauTrend.mau.length - 1] || 1);
  const stickiness = Math.round((latestDAU / latestMAU) * 100);

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-card" style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div class="hig-title2">토마토팜 홈</div>
          <div class="hig-footnote" style="color:var(--hig-gray1);margin-top:3px;">${_formatKoreanDate(today)} Morning Briefing</div>
        </div>
        <button class="hig-btn-secondary" onclick="window._adminToggleExportMenu()">내보내기</button>
      </div>

      <div class="hig-metric-grid">
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">DAU / Total</div>
          <div class="hig-title2">${dau}<span class="hig-footnote" style="color:var(--hig-gray1);">/${totalUsers}</span></div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:4px;">오늘 활동한 유저 수. 일일 서비스 참여도 지표</div>
        </div>
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">WAU</div>
          <div class="hig-title2">${wau}</div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:4px;">최근 7일 내 1회 이상 활동한 유저 수. 주간 리텐션 파악에 활용</div>
        </div>
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">Core Loop</div>
          <div class="hig-title2">${_coreLoopRate(data)}%</div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:4px;">운동+식단 모두 기록한 유저 비율. 핵심 습관 완성도 지표</div>
        </div>
        <div class="hig-metric-card">
          <div class="hig-caption1" style="color:var(--hig-gray1);">DAU / MAU</div>
          <div class="hig-title2">${stickiness}%</div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:4px;">일간/월간 활성 비율. 높을수록 매일 돌아오는 유저가 많음</div>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">최근 30일 운동/식단 추이</div>
        <div id="admin-overview-chart-wrap" style="height:180px;"></div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">서비스 건강 (DAU/WAU/MAU)</div>
        <div id="admin-home-dau" style="height:180px;"></div>
      </div>

      <div class="hig-grid-2">
        <div class="hig-card">
          <div class="hig-headline" style="margin-bottom:10px;">Lifecycle Funnel</div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:-4px;margin-bottom:8px;">신규→활성→참여→이탈위험→휴면 흐름으로 현재 생애주기 분포를 확인</div>
          <div id="admin-home-funnel" style="height:180px;"></div>
        </div>
        <div class="hig-card">
          <div class="hig-headline" style="margin-bottom:10px;">Health Score 분포</div>
          <div class="hig-caption2" style="color:var(--hig-gray1);margin-top:-4px;margin-bottom:8px;">유저별 건강 점수 분포. 낮은 점수 구간이 많을수록 관리 우선순위 높음</div>
          <div id="admin-home-score" style="height:180px;"></div>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">기능 채택률 (7일)</div>
        <div id="admin-home-feature" style="height:${Math.max(140, features.labels.length * 30)}px;"></div>
      </div>

      <div class="hig-card">
        <div class="hig-headline" style="margin-bottom:10px;">개인화 인사이트</div>
        <div class="hig-rows">
          ${insights.map((insight) => `
            <div class="hig-card" style="margin:0;background:var(--hig-surface-elevated);">
              <div class="hig-subhead">${escapeHtml(insight.message)}</div>
              <div style="margin-top:8px;">
                <button class="hig-btn-primary" onclick="window._adminOpenComposeForUser('${insight.uid}','${escapeHtml(insight.cta)}')">메시지 보내기</button>
              </div>
            </div>
          `).join('') || '<div class="hig-footnote" style="color:var(--hig-gray1);">표시할 인사이트가 없습니다.</div>'}
        </div>
      </div>

      <div class="hig-card-grouped">
        <div class="hig-list-row">
          <div class="hig-headline">오늘의 활동 타임라인</div>
        </div>
        ${feed.map((item) => `
          <div class="hig-list-row" style="justify-content:space-between;">
            <div class="hig-subhead">${escapeHtml(item.text)}</div>
            <div class="hig-caption1" style="color:var(--hig-gray1);">${fmtDate(item.at)}</div>
          </div>
        `).join('') || '<div class="hig-list-row"><span class="hig-subhead" style="color:var(--hig-gray1);">오늘 활동이 없습니다.</span></div>'}
      </div>
    </div>
  `;

  const chartWrap = document.getElementById('admin-overview-chart-wrap');
  if (chartWrap) renderEngagementLine(chartWrap, trend.labels, trend.exercise, trend.diet);
  const dauEl = document.getElementById('admin-home-dau');
  if (dauEl) renderDAULine(dauEl, dauTrend.labels, dauTrend.dau, dauTrend.wau, dauTrend.mau);
  const funnelEl = document.getElementById('admin-home-funnel');
  if (funnelEl) {
    renderLifecycleFunnel(funnelEl, ['New', 'Activated', 'Engaged', 'At-Risk', 'Dormant'], [
      lifecycleCounts.new,
      lifecycleCounts.activated,
      lifecycleCounts.engaged,
      lifecycleCounts.atRisk,
      lifecycleCounts.dormant,
    ]);
  }
  const scoreEl = document.getElementById('admin-home-score');
  if (scoreEl) renderHealthScoreBar(scoreEl, scoreRows.map((r) => r.label), scoreRows.map((r) => r.score));
  const featureEl = document.getElementById('admin-home-feature');
  if (featureEl) renderFeatureAdoption(featureEl, features.labels, features.values);

  if (typeof options.afterRender === 'function') options.afterRender();
}
