import {
  getAccountList, sendNotification, getAdminOutreachHistory, saveHeroMessage, saveAccount, deleteUserAccount,
} from '../data.js';
import {
  exportUsersReport, exportDailyActivity,
  exportSocialInteractions, exportLettersAndPatchnotes,
  exportAll, exportAIJson,
} from './admin-export.js';
import {
  escapeHtml, stageColor, stageLabel, trajectoryArrow, trajectoryLabel, fmtDate, fmtReadDelay,
} from './admin-utils.js';

let _outreachTab = 'compose';
const HISTORY_KEY = '_admin_outreach_history';
const HISTORY_LIMIT = 50;
const COMPOSE_TEMPLATE_KEY = '_admin_outreach_template';

const TEMPLATES = [
  { id: 'none', label: '직접 작성' },
  { id: 'streak', label: '스트릭 격려', body: '{name}님, 벌써 {streak}일째! 대단해요 🔥' },
  { id: 'comeback', label: '복귀 환영', body: '{name}님 돌아오셨네요! {days_away}일 만이에요 🎉' },
  { id: 'feature', label: '기능 소개', body: '{name}님, {unused_feature} 기능 써보셨나요?' },
  { id: 'social', label: '소셜 초대', body: '{name}님, {friend_name}님이 오늘 운동했어요!' },
];

function _toast(msg, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, 3000, type);
    return;
  }
  console.log(`[toast:${type}] ${msg}`);
}

function _readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

let _history = _readHistory();

function _persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(_history.slice(0, HISTORY_LIMIT)));
}

function _upsertHistory(item) {
  _history.unshift(item);
  _history = _history.slice(0, HISTORY_LIMIT);
  _persistHistory();
}

function _targetUsers(data, selectedUid) {
  const users = data.realAccs.map((account) => {
    const segment = data.userSegments[account.id];
    return {
      uid: account.id,
      name: account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id,
      stage: segment?.stage || 'activated',
      trajectory: segment?.trajectory || 'stable',
      account,
    };
  });
  users.sort((a, b) => (a.name > b.name ? 1 : -1));
  if (!selectedUid) return users;
  return users.sort((a, b) => {
    if (a.uid === selectedUid) return -1;
    if (b.uid === selectedUid) return 1;
    return 0;
  });
}

function _currentStreak(uid, data) {
  const keys14 = data.dateKeys30.slice(0, 14);
  let exStreak = 0;
  let dietStreak = 0;
  for (let i = 0; i < keys14.length; i++) {
    const day = data.workoutMap[keys14[i]]?.[uid];
    if (i === exStreak && day?.exercise) exStreak++;
    if (i === dietStreak && day?.diet) dietStreak++;
  }
  return Math.max(exStreak, dietStreak);
}

function _unusedFeature(uid, data) {
  const major = ['friend_feed', 'ai_diet_rec', 'ai_workout_rec', 'streak_freeze'];
  const used = new Set();
  data.analytics.slice(0, 7).forEach((doc) => {
    (doc.users?.[uid]?.featuresUsed || []).forEach((f) => used.add(f));
  });
  return major.find((f) => !used.has(f)) || '추천 기능';
}

function _friendName(uid, data) {
  const friend = (data.frs || []).find((f) => f.status === 'accepted' && (f.from === uid || f.to === uid));
  if (!friend) return '친구';
  const friendUid = friend.from === uid ? friend.to : friend.from;
  return data.resolveName(friendUid);
}

function _daysAway(account) {
  const last = account?.lastLoginAt || 0;
  if (!last) return 0;
  return Math.max(0, Math.round((Date.now() - last) / 86400000));
}

function _fillTemplate(templateId, uid, data) {
  const tpl = TEMPLATES.find((x) => x.id === templateId);
  if (!tpl || !tpl.body) return '';
  const account = data.realAccs.find((x) => x.id === uid);
  const name = account?.nickname || `${account?.lastName || ''}${account?.firstName || ''}` || uid || '회원';
  const body = tpl.body
    .replaceAll('{name}', name)
    .replaceAll('{streak}', String(_currentStreak(uid, data)))
    .replaceAll('{days_away}', String(_daysAway(account)))
    .replaceAll('{unused_feature}', _unusedFeature(uid, data))
    .replaceAll('{friend_name}', _friendName(uid, data));
  return body;
}

function _lettersTab(data) {
  return `
    <div class="hig-card-grouped">
      <div class="hig-list-row"><div class="hig-headline">유저 메시지 수신함</div></div>
      ${(data.letters || []).slice(0, 30).map((letter) => `
        <div class="hig-list-row" style="align-items:flex-start;flex-direction:column;">
          <div class="hig-subhead">${escapeHtml(letter.fromName || data.resolveName(letter.from))}</div>
          <div class="hig-caption1" style="color:var(--hig-gray1);">${fmtDate(letter.createdAt)}</div>
          <div class="hig-subhead" style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(letter.message || '')}</div>
        </div>
      `).join('') || '<div class="hig-list-row"><span class="hig-subhead" style="color:var(--hig-gray1);">수신 메시지가 없습니다.</span></div>'}
    </div>
  `;
}

function _historyTab() {
  return `
    <div id="outreach-history-container">
      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">발송 기록</div></div>
        <div class="hig-list-row"><span class="hig-subhead" style="color:var(--hig-gray1);">불러오는 중...</span></div>
      </div>
    </div>
  `;
}

async function _loadHistoryTable(data) {
  const container = document.getElementById('outreach-history-container');
  if (!container) return;
  try {
    const notifs = await getAdminOutreachHistory();
    if (!document.getElementById('outreach-history-container')) return;

    const accountMap = Object.fromEntries(data.realAccs.map((account) => [
      account.id,
      account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id,
    ]));
    const typeLabel = {
      direct_message: 'DM',
      announcement: '공지',
      admin_comeback: '복귀',
      push: 'Push',
      hero: '히어로',
    };

    const readCount = notifs.filter((n) => n.read === true).length;
    const unreadCount = notifs.filter((n) => n.read === false).length;
    const untrackedCount = notifs.filter((n) => n.read !== true && n.read !== false).length;

    // 배치별 집계 (createdAt 초 단위로 그룹핑)
    const batches = new Map();
    notifs.forEach((n) => {
      if (!n.createdAt) return;
      const bucket = Math.floor(n.createdAt / 60000); // 같은 분에 보낸 것들을 한 배치로
      const key = `${bucket}_${n.type || ''}`;
      if (!batches.has(key)) {
        batches.set(key, { createdAt: n.createdAt, type: n.type, total: 0, read: 0, sumDelay: 0, readCount: 0 });
      }
      const b = batches.get(key);
      b.total += 1;
      if (n.read === true) {
        b.read += 1;
        if (n.readAt) { b.sumDelay += (n.readAt - n.createdAt); b.readCount += 1; }
      }
    });
    const batchRows = Array.from(batches.values())
      .filter((b) => b.total >= 2)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);

    const batchCard = batchRows.length ? `
      <div class="hig-card-grouped" style="margin-bottom:12px;">
        <div class="hig-list-row"><div class="hig-headline">배치별 요약</div></div>
        ${batchRows.map((b) => {
          const avgMin = b.readCount ? Math.round(b.sumDelay / b.readCount / 60000) : null;
          const rate = Math.round(100 * b.read / b.total);
          return `<div class="hig-list-row" style="justify-content:space-between;">
            <div>
              <div class="hig-subhead">${fmtDate(b.createdAt)} · ${escapeHtml(typeLabel[b.type] || b.type || '-')}</div>
              <div class="hig-caption2" style="color:var(--hig-gray1);">${b.read}/${b.total} 읽음 (${rate}%)${avgMin != null ? ` · 평균 ${avgMin}분 뒤` : ''}</div>
            </div>
            <div style="width:120px;height:6px;background:var(--hig-surface-elevated);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${rate}%;background:var(--hig-green, #34c759);"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      ${batchCard}
      <div class="hig-card-grouped">
        <div class="hig-list-row" style="justify-content:space-between;">
          <div class="hig-headline">발송 기록 (${notifs.length}건)</div>
          <div class="hig-caption1" style="color:var(--hig-gray1);">읽음 ${readCount} · 미읽음 ${unreadCount}${untrackedCount ? ` · 기록없음 ${untrackedCount}` : ''}</div>
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.4;">
            <thead>
              <tr style="border-bottom:2px solid var(--hig-separator);background:var(--hig-surface);">
                <th style="text-align:left;padding:8px 10px;white-space:nowrap;font-weight:600;">계정</th>
                <th style="text-align:left;padding:8px 10px;white-space:nowrap;font-weight:600;">종류</th>
                <th style="text-align:left;padding:8px 10px;font-weight:600;">메시지</th>
                <th style="text-align:center;padding:8px 10px;white-space:nowrap;font-weight:600;">상태</th>
                <th style="text-align:left;padding:8px 10px;white-space:nowrap;font-weight:600;">발송일</th>
                <th style="text-align:left;padding:8px 10px;white-space:nowrap;font-weight:600;">읽기까지</th>
              </tr>
            </thead>
            <tbody>
              ${notifs.map((notif) => {
    const accountName = accountMap[notif.to] || notif.to || '-';
    const label = typeLabel[notif.type] || notif.type || '-';
    const preview = escapeHtml((notif.body || notif.message || '').trim().slice(0, 40) || '-');
    const isRead = notif.read === true;
    const isUnread = notif.read === false;
    const hasReadState = isRead || isUnread;

    let badgeHtml;
    if (isRead) {
      badgeHtml = `<span style="display:inline-block;padding:2px 8px;border-radius:8px;background:var(--primary-bg, rgba(250,52,44,0.12));color:var(--primary, #fa342c);font-size:10px;font-weight:700;">읽음</span>`;
    } else if (isUnread) {
      badgeHtml = `<span style="display:inline-block;padding:2px 8px;border-radius:8px;background:var(--hig-surface-elevated);color:var(--hig-gray1);font-size:10px;font-weight:700;">미읽음</span>`;
    } else {
      badgeHtml = `<span style="display:inline-block;padding:2px 8px;border-radius:8px;background:var(--hig-surface-elevated);color:var(--hig-gray2, #999);font-size:10px;font-weight:600;">기록없음</span>`;
    }

    let readDelayHtml = '';
    if (isRead && notif.readAt) {
      readDelayHtml = `<span title="${escapeHtml(fmtDate(notif.readAt))}">${escapeHtml(fmtReadDelay(notif.createdAt, notif.readAt))}</span>`;
    } else if (isRead) {
      readDelayHtml = '<span style="color:var(--hig-gray2);">시간 미기록</span>';
    } else if (isUnread) {
      readDelayHtml = '<span style="color:var(--hig-gray2);">—</span>';
    } else {
      readDelayHtml = '<span style="color:var(--hig-gray2);">—</span>';
    }

    const rowBg = isUnread ? 'background:color-mix(in srgb, var(--hig-red, #ff3b30) 5%, transparent);' : '';
    return `
                <tr style="border-bottom:1px solid var(--hig-separator);${rowBg}">
                  <td style="padding:8px 10px;font-weight:500;">${escapeHtml(accountName)}</td>
                  <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 6px;border-radius:6px;background:var(--hig-surface-elevated);font-size:11px;font-weight:600;">${escapeHtml(label)}</span></td>
                  <td style="padding:8px 10px;color:var(--hig-gray1);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preview}</td>
                  <td style="padding:8px 10px;text-align:center;">${badgeHtml}</td>
                  <td style="padding:8px 10px;white-space:nowrap;color:var(--hig-gray1);">${fmtDate(notif.createdAt)}</td>
                  <td style="padding:8px 10px;white-space:nowrap;color:var(--hig-gray1);font-size:11px;">${readDelayHtml}</td>
                </tr>
              `;
  }).join('') || `
                <tr>
                  <td colspan="6" style="padding:14px 12px;color:var(--hig-gray1);">발송 기록이 없습니다.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `
      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">발송 기록</div></div>
        <div class="hig-list-row"><span class="hig-subhead" style="color:var(--hig-red);">불러오기 실패: ${escapeHtml(error.message || 'unknown error')}</span></div>
      </div>
    `;
  }
}

function _manageTab(data) {
  const users = [...data.realAccs].sort((a, b) => ((a.nickname || a.id) > (b.nickname || b.id) ? 1 : -1));
  return `
    <div class="hig-rows">
      <div class="hig-card">
        <div class="hig-headline">내보내기</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('ai_json')">AI JSON</button>
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('all_csv')">전체 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('users')">유저 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('daily')">일일 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('social')">소셜 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminOutreachExport('letters')">메시지 CSV</button>
        </div>
      </div>
      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">계정 삭제</div></div>
        ${users.map((user) => `
          <div class="hig-list-row" style="justify-content:space-between;">
            <div>
              <div class="hig-subhead">${escapeHtml(user.nickname || `${user.lastName || ''}${user.firstName || ''}` || user.id)}</div>
              <div class="hig-caption1" style="color:var(--hig-gray1);">${escapeHtml(user.id)}</div>
            </div>
            <button class="hig-btn-destructive" onclick="window._adminOutreachDeleteUser('${user.id}', '${escapeHtml(user.nickname || user.id)}')">삭제</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function _sendCompose(data) {
  const sendButton = document.getElementById('outreach-send-button');
  const prevLabel = sendButton?.textContent || '보내기';
  try {
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = '발송 중...';
    }

    const channel = document.querySelector('input[name="outreach-channel"]:checked')?.value || 'push';
    const title = document.getElementById('outreach-title')?.value.trim() || '';
    const body = document.getElementById('outreach-body')?.value.trim() || '';
    const emoji = document.getElementById('outreach-emoji')?.value.trim() || '';
    const heroDate = document.getElementById('outreach-hero-date')?.value || '';
    const welcomeDays = Math.max(0, Number(document.getElementById('outreach-welcome-days')?.value || 0));

    if (!body) {
      _toast('메시지 내용을 입력해 주세요.', 'warning');
      return;
    }

    const all = await getAccountList();
    const targetIds = _getScheduleTargetIds('outreach-target', data);
    if (!targetIds.length) {
      _toast('대상을 1명 이상 선택해 주세요.', 'warning');
      return;
    }
    const targets = all.filter((a) => targetIds.includes(a.id));

    if (!targets.length) {
      _toast('대상 유저를 찾지 못했습니다.', 'error');
      return;
    }

    if (channel === 'hero') {
      const dateKey = heroDate || data.dateKeys30[0];
      await Promise.all(targets.map((account) => saveHeroMessage(account.id, dateKey, body, emoji)));
    } else if (channel === 'comeback') {
      const freshAccounts = await getAccountList();
      const byId = Object.fromEntries(freshAccounts.map((a) => [a.id, a]));
      await Promise.all(targets.map(async (target) => {
        const account = byId[target.id];
        if (!account) return;
        const next = { ...account };
        next.welcomeBackThresholdHours = Math.round(welcomeDays * 24);
        next.welcomeBackCustomTitle = title || '';
        next.welcomeBackCustomMessage = body;
        await saveAccount(next);
        await sendNotification(target.id, {
          type: 'admin_comeback',
          from: 'admin',
          title: title || '복귀 메시지',
          body,
          message: `${emoji || '🍅'} ${title || '복귀 메시지가 도착했어요.'}`,
        });
      }));
    } else {
      const type = channel === 'announcement' ? 'announcement' : 'direct_message';
      await Promise.all(targets.map((account) => sendNotification(account.id, {
        type,
        title: title || '',
        body,
        message: `${emoji || '🍅'} ${title || body.slice(0, 24)}`,
        from: 'admin',
      })));
    }

    _upsertHistory({
      type: channel,
      recipients: targets.length,
      message: body,
      sentAt: Date.now(),
    });
    _toast(`발송 완료: ${targets.length}명`, 'success');
  } catch (error) {
    console.error('[admin-outreach] send error:', error);
    _toast(`발송 실패: ${error.message}`, 'error');
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = prevLabel;
    }
  }
}

function _targetSelect(users, name, selectedUid) {
  const allChecked = selectedUid === 'all' || !selectedUid;
  return `
    <details class="hig-target-dropdown" style="border:1px solid var(--hig-separator);border-radius:12px;background:var(--hig-surface-elevated);padding:8px 10px;">
      <summary id="${name}-summary" style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px;">
        대상: 전체
      </summary>
      <div style="display:grid;gap:6px;margin-top:10px;">
        <label class="hig-target-option" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--hig-separator);border-radius:10px;opacity:${allChecked ? '1' : '.55'};">
          <input type="checkbox" name="${name}" value="all" ${allChecked ? 'checked' : ''} style="margin:0;accent-color:var(--primary);" onchange="window._adminToggleScheduleTarget('${name}', this.value)">
          <span>전체</span>
        </label>
        ${users.map((user) => `
          <label class="hig-target-option" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid ${stageColor(user.stage)};border-radius:10px;opacity:${selectedUid === user.uid ? '1' : '.55'};" title="${trajectoryLabel(user.trajectory)}">
            <input type="checkbox" name="${name}" value="${user.uid}" ${selectedUid === user.uid ? 'checked' : ''} style="margin:0;accent-color:var(--primary);" onchange="window._adminToggleScheduleTarget('${name}', this.value)">
            <span>${escapeHtml(user.name)} · ${stageLabel(user.stage)} ${trajectoryArrow(user.trajectory)}</span>
          </label>
        `).join('')}
      </div>
    </details>
  `;
}

function _updateTargetSummary(name, data) {
  const summaryEl = document.getElementById(`${name}-summary`);
  if (!summaryEl) return;
  const ids = _getScheduleTargetIds(name, data);
  const allChecked = !!document.querySelector(`input[name="${name}"][value="all"]`)?.checked;
  if (allChecked) {
    summaryEl.textContent = '대상: 전체';
    return;
  }
  if (ids.length === 1) {
    const user = data.realAccs.find((x) => x.id === ids[0]);
    const userName = user?.nickname || `${user?.lastName || ''}${user?.firstName || ''}` || ids[0];
    summaryEl.textContent = `대상: ${userName}`;
    return;
  }
  summaryEl.textContent = ids.length > 1 ? `대상: ${ids.length}명 선택` : '대상: 없음';
}

function _updateScheduleTargetUI(name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    const chip = input.closest('label.hig-target-option');
    if (!chip) return;
    chip.style.opacity = input.checked ? '1' : '.55';
    chip.style.background = input.checked ? 'var(--hig-surface)' : 'transparent';
  });
}

function _toggleScheduleTarget(name, changedValue) {
  const allInput = document.querySelector(`input[name="${name}"][value="all"]`);
  const memberInputs = Array.from(document.querySelectorAll(`input[name="${name}"]`)).filter((input) => input.value !== 'all');
  if (changedValue === 'all') {
    if (allInput?.checked) memberInputs.forEach((input) => { input.checked = false; });
  } else {
    const changedInput = document.querySelector(`input[name="${name}"][value="${changedValue}"]`);
    if (changedInput?.checked && allInput) allInput.checked = false;
    const anyMemberChecked = memberInputs.some((input) => input.checked);
    if (!anyMemberChecked && allInput) allInput.checked = true;
  }
  _updateScheduleTargetUI(name);
}

function _getScheduleTargetIds(name, data) {
  const allInput = document.querySelector(`input[name="${name}"][value="all"]`);
  if (allInput?.checked) return data.realAccs.map((a) => a.id);
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map((input) => input.value)
    .filter((value) => value && value !== 'all');
}

function _getSinglePreviewAccount(name, data) {
  const ids = _getScheduleTargetIds(name, data);
  if (ids.length !== 1) {
    _toast('미리보기는 대상 1명 선택이 필요합니다.', 'warning');
    return null;
  }
  const uid = ids[0];
  return data.realAccs.find((x) => x.id === uid) || null;
}

function _previewHeroSchedule(data) {
  const wrap = document.getElementById('outreach-hero-preview');
  if (!wrap) return;
  const account = _getSinglePreviewAccount('outreach-schedule-hero-target', data);
  if (!account) return;
  const body = document.getElementById('outreach-schedule-hero-body')?.value.trim() || '';
  const emoji = document.getElementById('outreach-schedule-hero-emoji')?.value.trim() || '';
  const dateKey = document.getElementById('outreach-schedule-hero-date')?.value || data.dateKeys30[0] || '';
  if (!body) {
    _toast('히어로 메시지를 먼저 입력해 주세요.', 'warning');
    return;
  }
  const displayName = escapeHtml(account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id);
  const textValue = `${emoji ? `${emoji} ` : ''}${body}`;
  wrap.innerHTML = `
    <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:8px;">미리보기 · 홈 히어로 카드 · ${displayName} · ${escapeHtml(dateKey)}</div>
    <div class="tf-card" style="max-width:520px;margin:0 auto;">
      <div class="tf-hero tf-hero--gradient">
        <div class="tf-hero-left">
          <div class="tf-hero-label hero-message-custom">${escapeHtml(textValue)}</div>
          <div class="tf-hero-count">0<span class="tf-hero-unit">개</span></div>
          <div class="tf-hero-sub">이번 분기 <b>0개</b> 수확</div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${escapeHtml(emoji || '🍅')}</div>
        </div>
      </div>
    </div>
  `;
}

function _previewComebackSchedule(data) {
  const wrap = document.getElementById('outreach-comeback-preview');
  if (!wrap) return;
  const account = _getSinglePreviewAccount('outreach-schedule-comeback-target', data);
  if (!account) return;
  const days = Math.max(0, Number(document.getElementById('outreach-schedule-comeback-days')?.value || 0));
  const title = (document.getElementById('outreach-schedule-comeback-title')?.value.trim() || '다시 돌아와줘서 반가워요');
  const message = (document.getElementById('outreach-schedule-comeback-message')?.value.trim() || '오늘 기록부터 가볍게 다시 시작해봐요.');
  const displayName = escapeHtml(account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id);
  wrap.innerHTML = `
    <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:8px;">미리보기 · 복귀 메시지 카드 · ${displayName}</div>
    <div class="wb-card wb-card--moderate" style="position:relative;inset:auto;max-width:520px;width:100%;margin:0 auto;opacity:1;transform:none;animation:none;">
      <div class="wb-mascot-wrap" style="opacity:1;transform:none;animation:none;">
        <div class="wb-mascot wb-mascot--moderate" style="transform:none;animation:none;">
          <div class="wb-mascot-stem"></div>
          <div class="wb-mascot-leaf wb-mascot-leaf--left"></div>
          <div class="wb-mascot-leaf wb-mascot-leaf--right"></div>
          <div class="wb-mascot-eye wb-mascot-eye--left"></div>
          <div class="wb-mascot-eye wb-mascot-eye--right"></div>
          <div class="wb-mascot-smile"></div>
        </div>
      </div>
      <div class="wb-title-wrap" style="opacity:1;transform:none;animation:none;">
        <div class="wb-title">${escapeHtml(title)}</div>
        <div class="wb-badge">${days}일 미접속 <span>✨</span></div>
      </div>
      <div class="wb-message" style="opacity:1;transform:none;animation:none;">${escapeHtml(message)}</div>
      <div class="wb-actions" style="opacity:1;transform:none;animation:none;">
        <button type="button" class="tds-btn fill lg">오늘 기록 시작하기</button>
        <button type="button" class="tds-btn ghost md">나중에 할게요</button>
      </div>
    </div>
  `;
}

function _scheduleTab(data, options) {
  const users = _targetUsers(data, options.prefillUid);
  const selectedUid = options.prefillUid || 'all';
  const today = data.dateKeys30[0] || '';
  const selectedAccount = data.realAccs.find((x) => x.id === selectedUid) || data.realAccs[0] || {};
  const thresholdDays = Math.max(0, Math.round((selectedAccount.welcomeBackThresholdHours || 168) / 24));
  const title = selectedAccount.welcomeBackCustomTitle || '';
  const message = selectedAccount.welcomeBackCustomMessage || '';

  return `
    <div class="hig-rows">
      <div class="hig-card">
        <div class="hig-headline">히어로 메시지 예약</div>
        <div style="display:grid;gap:10px;margin-top:10px;">
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">대상 (복수 선택)</div>
            ${_targetSelect(users, 'outreach-schedule-hero-target', selectedUid)}
          </div>
          <div class="hig-grid-2">
            <div>
              <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">예약 날짜</div>
              <input id="outreach-schedule-hero-date" type="date" value="${today}" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
            </div>
            <div>
              <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">이모지</div>
              <input id="outreach-schedule-hero-emoji" maxlength="4" placeholder="🍅" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
            </div>
          </div>
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">본문</div>
            <textarea id="outreach-schedule-hero-body" class="hig-subhead" style="min-height:100px;border:1px solid var(--hig-separator);border-radius:12px;padding:10px 12px;background:var(--hig-surface-elevated);color:var(--hig-text);" placeholder="홈 화면에 표시할 히어로 메시지"></textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="hig-btn-primary" onclick="window._adminSaveHeroSchedule()">저장</button>
            <button class="hig-btn-secondary" onclick="window._adminPreviewHeroSchedule()">미리보기</button>
          </div>
          <div id="outreach-hero-preview"></div>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline">복귀 메시지 설정</div>
        <div style="display:grid;gap:10px;margin-top:10px;">
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">대상 (복수 선택)</div>
            ${_targetSelect(users, 'outreach-schedule-comeback-target', selectedUid)}
          </div>
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">복귀 임계일</div>
            <input id="outreach-schedule-comeback-days" type="number" min="0" value="${thresholdDays}" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
            <div class="hig-caption2" style="margin-top:6px;color:var(--hig-gray1);">현재 기본값: ${(selectedAccount.welcomeBackThresholdHours || 168) / 24}일</div>
          </div>
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">커스텀 제목</div>
            <input id="outreach-schedule-comeback-title" value="${escapeHtml(title)}" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
          </div>
          <div>
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">커스텀 메시지</div>
            <textarea id="outreach-schedule-comeback-message" class="hig-subhead" style="min-height:100px;border:1px solid var(--hig-separator);border-radius:12px;padding:10px 12px;background:var(--hig-surface-elevated);color:var(--hig-text);" placeholder="복귀 카드에 노출할 메시지">${escapeHtml(message)}</textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="hig-btn-primary" onclick="window._adminSaveComebackSchedule()">저장</button>
            <button class="hig-btn-secondary" onclick="window._adminPreviewComebackSchedule()">미리보기</button>
          </div>
          <div id="outreach-comeback-preview"></div>
        </div>
      </div>
    </div>
  `;
}

async function _saveHeroSchedule(data) {
  try {
    const ids = _getScheduleTargetIds('outreach-schedule-hero-target', data);
    const dateKey = document.getElementById('outreach-schedule-hero-date')?.value || data.dateKeys30[0];
    const emoji = document.getElementById('outreach-schedule-hero-emoji')?.value.trim() || '';
    const message = document.getElementById('outreach-schedule-hero-body')?.value.trim() || '';
    if (!message) {
      _toast('히어로 메시지를 입력해 주세요.', 'warning');
      return;
    }
    if (!ids.length) {
      _toast('대상을 1명 이상 선택해 주세요.', 'warning');
      return;
    }
    await Promise.all(ids.map((uid) => saveHeroMessage(uid, dateKey, message, emoji)));
    _toast(`히어로 예약 저장 ${ids.length}명`, 'success');
  } catch (error) {
    _toast(`히어로 예약 저장 실패: ${error.message}`, 'error');
  }
}

async function _saveComebackSchedule(data) {
  try {
    const ids = _getScheduleTargetIds('outreach-schedule-comeback-target', data);
    const days = Math.max(0, Number(document.getElementById('outreach-schedule-comeback-days')?.value || 0));
    const title = document.getElementById('outreach-schedule-comeback-title')?.value.trim() || '';
    const message = document.getElementById('outreach-schedule-comeback-message')?.value.trim() || '';
    if (!ids.length) {
      _toast('대상을 1명 이상 선택해 주세요.', 'warning');
      return;
    }
    const byId = Object.fromEntries((await getAccountList()).map((a) => [a.id, a]));
    await Promise.all(ids.map((uid) => {
      const account = byId[uid];
      if (!account) return Promise.resolve();
      const next = { ...account };
      next.welcomeBackThresholdHours = Math.round(days * 24);
      next.welcomeBackCustomTitle = title;
      next.welcomeBackCustomMessage = message;
      return saveAccount(next).then(() => sendNotification(uid, {
        type: 'admin_comeback',
        from: 'admin',
        title: title || '복귀 메시지',
        body: message,
        message: title || '복귀 메시지가 도착했어요.',
      }));
    }));
    _toast(`복귀 설정 저장 ${ids.length}명`, 'success');
  } catch (error) {
    _toast(`복귀 설정 저장 실패: ${error.message}`, 'error');
  }
}

function _updateChipSelectionUI(inputName) {
  document.querySelectorAll(`input[name="${inputName}"]`).forEach((input) => {
    const chip = input.closest('label.hig-action-chip');
    if (!chip) return;
    chip.style.opacity = input.checked ? '1' : '.55';
  });
}

function _updateComposeChannelUI() {
  _updateChipSelectionUI('outreach-channel');
  const channel = document.querySelector('input[name="outreach-channel"]:checked')?.value || 'push';
  const heroWrap = document.getElementById('outreach-hero-date-wrap');
  const comebackWrap = document.getElementById('outreach-comeback-days-wrap');
  const extraFields = document.getElementById('outreach-channel-extra-fields');
  const isHero = channel === 'hero';
  const isComeback = channel === 'comeback';
  if (heroWrap) heroWrap.style.display = isHero ? '' : 'none';
  if (comebackWrap) comebackWrap.style.display = isComeback ? '' : 'none';
  if (extraFields) extraFields.style.display = isHero || isComeback ? 'grid' : 'none';
}

function _composeTab(data, options) {
  const users = _targetUsers(data, options.prefillUid);
  const selectedUid = options.prefillUid || 'all';
  const today = data.dateKeys30[0] || '';
  const presetBody = options.prefillMessage || '';
  const prefillChannel = options.prefillChannel || 'push';
  const selectedTemplate = localStorage.getItem(COMPOSE_TEMPLATE_KEY) || 'none';

  return `
    <div class="hig-card">
      <div class="hig-headline">통합 메시지 작성</div>
      <div style="display:grid;gap:12px;margin-top:10px;">
        <div>
          <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">템플릿</div>
          <select id="outreach-template" onchange="window._adminApplyTemplate()" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
            ${TEMPLATES.map((tpl) => `<option value="${tpl.id}" ${selectedTemplate === tpl.id ? 'selected' : ''}>${tpl.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">채널</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${[
              ['push', 'Push'],
              ['hero', '히어로'],
              ['announcement', '공지'],
              ['comeback', '복귀'],
            ].map(([id, label]) => `
              <label class="hig-action-chip" style="opacity:${prefillChannel === id ? '1' : '.75'};">
                <input type="radio" name="outreach-channel" value="${id}" ${prefillChannel === id ? 'checked' : ''} style="display:none;" onchange="window._adminUpdateChannelUI()">
                ${label}
              </label>
            `).join('')}
          </div>
        </div>
        <div>
          <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">받는 사람</div>
          ${_targetSelect(users, 'outreach-target', selectedUid)}
        </div>

        <div style="display:grid;grid-template-columns:100px 1fr;gap:8px;">
          <input id="outreach-emoji" class="hig-subhead" maxlength="4" placeholder="🍅" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
          <input id="outreach-title" class="hig-subhead" placeholder="제목 (선택)" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 12px;background:var(--hig-surface-elevated);color:var(--hig-text);">
        </div>

        <textarea id="outreach-body" class="hig-subhead" placeholder="메시지 내용" style="min-height:120px;border:1px solid var(--hig-separator);border-radius:12px;padding:10px 12px;background:var(--hig-surface-elevated);color:var(--hig-text);">${escapeHtml(presetBody)}</textarea>

        <div id="outreach-channel-extra-fields" class="hig-grid-2">
          <div id="outreach-hero-date-wrap">
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">히어로 날짜</div>
            <input id="outreach-hero-date" type="date" value="${today}" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
          </div>
          <div id="outreach-comeback-days-wrap">
            <div class="hig-caption1" style="color:var(--hig-gray1);margin-bottom:6px;">복귀 임계(일)</div>
            <input id="outreach-welcome-days" type="number" min="0" value="7" style="width:100%;min-height:40px;border:1px solid var(--hig-separator);border-radius:12px;padding:0 10px;background:var(--hig-surface-elevated);color:var(--hig-text);">
          </div>
        </div>

        <button id="outreach-send-button" class="hig-btn-primary" onclick="window._adminSendOutreach()">보내기</button>
      </div>
    </div>
  `;
}

function _render(container, data, options) {
  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-segmented-control">
        ${[
          ['compose', '작성'],
          ['schedule', '예약'],
          ['inbox', '수신함'],
          ['history', '기록'],
          ['manage', '관리'],
        ].map(([id, label]) => `
          <button class="${_outreachTab === id ? 'is-active' : ''}" onclick="window._adminOutreachTab('${id}')">${label}</button>
        `).join('')}
      </div>

      ${
    _outreachTab === 'compose' ? _composeTab(data, options)
      : _outreachTab === 'schedule' ? _scheduleTab(data, options)
        : _outreachTab === 'inbox' ? _lettersTab(data)
          : _outreachTab === 'history' ? _historyTab(data)
            : _manageTab(data)
  }
    </div>
  `;

  window._adminOutreachTab = (tab) => {
    _outreachTab = tab;
    _render(container, data, options);
  };

  window._adminUpdateChannelUI = () => {
    _updateComposeChannelUI();
  };

  window._adminUpdateTargetUI = () => {
    _updateScheduleTargetUI('outreach-target');
    _updateTargetSummary('outreach-target', data);
    window._adminApplyTemplate();
  };

  window._adminToggleScheduleTarget = (name, changedValue) => {
    _toggleScheduleTarget(name, changedValue);
    _updateTargetSummary(name, data);
    if (name === 'outreach-target') window._adminApplyTemplate();
  };

  window._adminApplyTemplate = () => {
    const templateId = document.getElementById('outreach-template')?.value || 'none';
    localStorage.setItem(COMPOSE_TEMPLATE_KEY, templateId);
    const body = document.getElementById('outreach-body');
    if (!body || templateId === 'none') return;
    const ids = _getScheduleTargetIds('outreach-target', data);
    if (ids.length !== 1) return;
    body.value = _fillTemplate(templateId, ids[0], data);
  };

  window._adminSendOutreach = () => _sendCompose(data);
  window._adminSaveHeroSchedule = () => _saveHeroSchedule(data);
  window._adminPreviewHeroSchedule = () => _previewHeroSchedule(data);
  window._adminSaveComebackSchedule = () => _saveComebackSchedule(data);
  window._adminPreviewComebackSchedule = () => _previewComebackSchedule(data);
  window._adminOutreachExport = (type) => {
    switch (type) {
      case 'users': exportUsersReport(data); break;
      case 'daily': exportDailyActivity(data); break;
      case 'social': exportSocialInteractions(data); break;
      case 'letters': exportLettersAndPatchnotes(data); break;
      case 'all_csv': exportAll(data); break;
      case 'ai_json': exportAIJson(data); break;
      default: break;
    }
  };
  window._adminOutreachDeleteUser = async (uid, name) => {
    const ok = window.confirm(`${name} 계정을 삭제할까요?`);
    if (!ok) return;
    try {
      await deleteUserAccount(uid);
      _toast(`${name} 계정을 삭제했습니다.`, 'success');
      if (typeof window.renderAdmin === 'function') {
        // no-op: kept for compatibility when exposed
      }
    } catch (error) {
      _toast(`계정 삭제 실패: ${error.message}`, 'error');
    }
  };

  if (_outreachTab === 'compose') {
    setTimeout(() => {
      window._adminUpdateChannelUI();
      window._adminUpdateTargetUI();
    }, 0);
  }

  if (_outreachTab === 'schedule') {
    setTimeout(() => {
      _updateScheduleTargetUI('outreach-schedule-hero-target');
      _updateScheduleTargetUI('outreach-schedule-comeback-target');
      _updateTargetSummary('outreach-schedule-hero-target', data);
      _updateTargetSummary('outreach-schedule-comeback-target', data);
    }, 0);
  }

  if (_outreachTab === 'history') {
    setTimeout(() => {
      _loadHistoryTable(data);
    }, 0);
  }
}

export function renderOutreachSection(container, data, options = {}) {
  _render(container, data, options);
}
