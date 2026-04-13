import {
  escapeHtml, stageLabel, trajectoryLabel, trajectoryArrow, fmtDate,
} from './admin-utils.js';

let _peopleSort = 'streak_total';
let _peopleSortDir = 'desc';
let _peopleFilter = 'all';

function _sortIndicator(id) {
  if (_peopleSort !== id) return '';
  return _peopleSortDir === 'asc' ? ' ▲' : ' ▼';
}

function _streakForField(uid, dateKeys, workoutMap, field) {
  let streak = 0;
  for (let i = 0; i < dateKeys.length; i++) {
    if (workoutMap[dateKeys[i]]?.[uid]?.[field]) streak++;
    else break;
  }
  return streak;
}

function _contentStyle(uid, data) {
  const keys14 = data.dateKeys30.slice(0, 14);
  let exercise = 0;
  let diet = 0;
  keys14.forEach((key) => {
    const day = data.workoutMap[key]?.[uid];
    if (day?.exercise) exercise++;
    if (day?.diet) diet++;
  });
  const total = exercise + diet;
  if (total === 0) return '미참여';
  const ratio = exercise / total;
  if (ratio >= 0.65) return '운동형';
  if (ratio <= 0.35) return '식단형';
  return '균형형';
}

function _socialStyle(uid, data) {
  const likesOut = (data.lks || []).filter((x) => x.from === uid).length;
  const likesIn = (data.lks || []).filter((x) => x.to === uid).length;
  const gbOut = (data.gbs || []).filter((x) => x.from === uid).length;
  const gbIn = (data.gbs || []).filter((x) => x.to === uid).length;
  const sent = likesOut + gbOut;
  const received = likesIn + gbIn;
  if (sent + received === 0) return '미참여';
  if (sent >= received * 1.2) return '적극형';
  if (received > sent * 1.2) return '수동형';
  return '균형형';
}

function _userRowData(account, data) {
  const uid = account.id;
  const segment = data.userSegments[uid] || {};
  const key14 = data.dateKeys30.slice(0, 14);
  const workoutStreak = _streakForField(uid, key14, data.workoutMap, 'exercise');
  const dietStreak = _streakForField(uid, key14, data.workoutMap, 'diet');
  const activeDays = key14.reduce((sum, key) => sum + (data.workoutMap[key]?.[uid]?.any ? 1 : 0), 0);
  const name = account.nickname || `${account.lastName || ''}${account.firstName || ''}` || uid;

  return {
    uid,
    name,
    stage: segment.stage || '-',
    trajectory: segment.trajectory || '-',
    score: segment.score ?? 0,
    workoutStreak,
    dietStreak,
    streak_total: workoutStreak + dietStreak,
    activity_days: activeDays,
    content_type: _contentStyle(uid, data),
    social_type: _socialStyle(uid, data),
    last_login_at: account.lastLoginAt || 0,
  };
}

function _filteredRows(rows) {
  if (_peopleFilter === 'all') return rows;
  return rows.filter((row) => row.stage === _peopleFilter);
}

function _sortRows(rows) {
  const sorted = [...rows];
  const dir = _peopleSortDir === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    let av = a[_peopleSort];
    let bv = b[_peopleSort];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return String(a.name).localeCompare(String(b.name));
  });
  return sorted;
}

function _setSort(key) {
  if (_peopleSort === key) {
    _peopleSortDir = _peopleSortDir === 'asc' ? 'desc' : 'asc';
    return;
  }
  _peopleSort = key;
  _peopleSortDir = (key === 'name' || key === 'stage' || key === 'trajectory' || key === 'content_type' || key === 'social_type')
    ? 'asc'
    : 'desc';
}

function _renderPeople(container, data) {
  const baseRows = data.realAccs.map((account) => _userRowData(account, data));
  const rows = _sortRows(_filteredRows(baseRows));

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-segmented-control">
        ${[
          ['streak_total', '스트릭순'],
          ['activity_days', '활동일순'],
        ].map(([id, label]) => `<button class="${_peopleSort === id ? 'is-active' : ''}" onclick="window._adminPeopleSort('${id}')">${label}</button>`).join('')}
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${[
          ['all', '전체'],
          ['new', 'New'],
          ['activated', 'Activated'],
          ['engaged', 'Engaged'],
          ['at-risk', 'At-Risk'],
          ['dormant', 'Dormant'],
        ].map(([id, label]) => `
          <button class="hig-action-chip" style="${_peopleFilter === id ? 'opacity:1;' : 'opacity:.55;'}" onclick="window._adminPeopleFilter('${id}')">${label}</button>
        `).join('')}
      </div>

      <div class="hig-table-wrap">
        <table class="hig-data-table">
          <thead>
            <tr>
              <th><button onclick="window._adminPeopleSort('name')">이름${_sortIndicator('name')}</button></th>
              <th><button onclick="window._adminPeopleSort('stage')">단계${_sortIndicator('stage')}</button></th>
              <th><button onclick="window._adminPeopleSort('trajectory')">궤적${_sortIndicator('trajectory')}</button></th>
              <th><button onclick="window._adminPeopleSort('score')">점수${_sortIndicator('score')}</button></th>
              <th><button onclick="window._adminPeopleSort('workoutStreak')">운동스트릭${_sortIndicator('workoutStreak')}</button></th>
              <th><button onclick="window._adminPeopleSort('dietStreak')">식단스트릭${_sortIndicator('dietStreak')}</button></th>
              <th><button onclick="window._adminPeopleSort('activity_days')">활동일(14d)${_sortIndicator('activity_days')}</button></th>
              <th><button onclick="window._adminPeopleSort('content_type')">콘텐츠유형${_sortIndicator('content_type')}</button></th>
              <th><button onclick="window._adminPeopleSort('social_type')">소셜유형${_sortIndicator('social_type')}</button></th>
              <th><button onclick="window._adminPeopleSort('last_login_at')">마지막접속${_sortIndicator('last_login_at')}</button></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${stageLabel(row.stage)}</td>
                <td>${trajectoryArrow(row.trajectory)} ${trajectoryLabel(row.trajectory)}</td>
                <td>${row.score}</td>
                <td>${row.workoutStreak}</td>
                <td>${row.dietStreak}</td>
                <td>${row.activity_days}</td>
                <td>${row.content_type}</td>
                <td>${row.social_type}</td>
                <td>${fmtDate(row.last_login_at)}</td>
              </tr>
            `).join('') || `
              <tr><td colspan="10" style="color:var(--hig-gray1);">조건에 맞는 멤버가 없습니다.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;

  window._adminPeopleSort = (id) => {
    _setSort(id);
    _renderPeople(container, data);
  };
  window._adminPeopleFilter = (id) => {
    _peopleFilter = id;
    _renderPeople(container, data);
  };
}

export function renderPeopleSection(container, data) {
  _renderPeople(container, data);
}
