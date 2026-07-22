import { showToast } from '../ui/toast.js';
import {
  DIET_PREMIUM_REPORT_AUTO_DELIVERY_ENABLED,
  DIET_PREMIUM_REPORT_TARGETS,
  deleteUserAccount,
  publishDietPremiumReportIssue,
} from '../data.js';
import {
  exportUsersReport, exportDailyActivity,
  exportSocialInteractions, exportLettersAndPatchnotes,
  exportAll, exportAIJson,
} from './admin-export.js';
import { escapeHtml } from './admin-utils.js';
import { confirmAction } from '../utils/confirm-modal.js';
import { signOutToLoginScreen } from '../feature-login.js';

let _rerender = null;
let _dietReportPeriod = 'weekly';
let _dietReportLastPublish = null;
let _adminData = null;

function _targetLabel(target) {
  return `${target.name}${target.nick ? `(${target.nick})` : ''}`;
}

function _renderDietReportPublisher() {
  const publishDisabled = !DIET_PREMIUM_REPORT_AUTO_DELIVERY_ENABLED;
  const periodButtons = [
    ['weekly', '주간'],
    ['monthly', '월간'],
  ].map(([period, label]) => `
    <button
      class="${_dietReportPeriod === period ? 'hig-btn-primary' : 'hig-btn-secondary'}"
      type="button"
      data-admin-settings-action="set-period" data-period="${period}"
    >${label}</button>
  `).join('');
  const targetChips = DIET_PREMIUM_REPORT_TARGETS.map((target) => `
    <span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:var(--hig-fill-tertiary);color:var(--hig-text);font-size:12px;font-weight:700;">
      ${escapeHtml(_targetLabel(target))}
    </span>
  `).join('');
  const lastPublish = _dietReportLastPublish ? `
    <div class="hig-caption1" style="margin-top:10px;color:var(--hig-gray1);">
      마지막 발간: ${escapeHtml(_dietReportLastPublish.title)} · ${escapeHtml(_dietReportLastPublish.cycleLabel)} · ${escapeHtml(String(_dietReportLastPublish.deliveredCount))}명 배송
    </div>
  ` : '';

  return `
    <div class="hig-card">
      <div class="hig-headline">식단 프리미엄 리포트 발간${publishDisabled ? ' 중지됨' : ''}</div>
      <div class="hig-caption1" style="color:var(--hig-gray1);margin-top:6px;">
        ${publishDisabled
          ? '기존 사용자에게 불필요한 리포트 모달이 뜨지 않도록 자동 배송을 중지했습니다.'
          : '선택한 주기 기준으로 최신 리포트 ID를 생성하고, 대상 계정의 다음 접속 때 1회성 모달로 배송합니다.'}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${periodButtons}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
        ${targetChips}
      </div>
      <button type="button" id="admin-diet-report-publish-button" class="hig-btn-primary" style="margin-top:12px;" data-admin-settings-action="publish-report"${publishDisabled ? ' disabled' : ''}>
        ${publishDisabled ? '자동 배송 중지됨' : '지금 리포트 발간/배송'}
      </button>
      <div class="hig-caption1" style="color:var(--hig-gray1);margin-top:8px;">
        ${publishDisabled
          ? '수동 미리보기는 localhost 개발 환경에서만 유지됩니다.'
          : '같은 주 또는 같은 달에 다시 발간하면 같은 ID를 사용해, 이미 확인한 사용자에게는 중복 자동 노출되지 않습니다.'}
      </div>
      ${lastPublish}
    </div>
  `;
}

async function _askDelete(uid, name) {
  const ok = await confirmAction({
    title: `${name} 계정을 삭제할까요?`,
    message: '이 작업은 되돌릴 수 없어요.\n계정의 모든 운동·식단 기록이 함께 삭제돼요.',
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
    longPress: 2000,
  });
  if (!ok) return;
  deleteUserAccount(uid)
    .then(() => {
      showToast(`${name} 계정을 삭제했습니다`, 2500, 'success');
      if (_rerender) _rerender();
    })
    .catch((error) => {
      showToast(`삭제 실패: ${error.message}`, 3500, 'error');
    });
}

export function renderSettingsSection(container, data, rerender) {
  _rerender = rerender;
  _adminData = data;
  const users = [...data.realAccs]
    .sort((a, b) => ((a.nickname || '') > (b.nickname || '') ? 1 : -1));

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-card">
        <div class="hig-headline">데이터 내보내기</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          ${[['ai_json','AI JSON'],['all_csv','전체 CSV'],['users','유저 CSV'],['daily','일일 CSV']].map(([type,label]) => `<button type="button" class="hig-btn-secondary" data-admin-settings-action="export" data-export-type="${type}">${label}</button>`).join('')}
        </div>
      </div>

      ${_renderDietReportPublisher()}

      <div class="hig-card">
        <div class="hig-headline">함께 축하해요 관리</div>
        <div class="hig-caption1" style="color:var(--hig-gray1);margin-top:4px;">감지 모듈 on/off 및 수동 축하 작성</div>
        <div id="admin-cheers-container" style="margin-top:12px;"></div>
      </div>

      <div class="hig-card">
        <div class="hig-headline">계정 전환</div>
        <div class="hig-subhead" style="color:var(--hig-gray1);margin-top:6px;">관리자 권한은 이 계정에만 있습니다. 개인 계정을 쓰려면 로그아웃 후 김태우 계정으로 로그인하세요.</div>
        <button type="button" class="hig-btn-secondary" style="margin-top:10px;" data-admin-settings-action="sign-out">로그아웃</button>
      </div>

      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">유저 삭제</div></div>
        ${users.map((user) => `
          <div class="hig-list-row" style="justify-content:space-between;">
            <div>
              <div class="hig-subhead">${escapeHtml(user.nickname || `${user.lastName || ''}${user.firstName || ''}` || user.id)}</div>
              <div class="hig-caption1" style="color:var(--hig-gray1);">${escapeHtml(user.id)}</div>
            </div>
            <button type="button" class="hig-btn-destructive" data-admin-settings-action="delete-user" data-uid="${escapeHtml(user.id)}" data-name="${escapeHtml(user.nickname || user.id)}">삭제</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  container.onclick = (event) => {
    const control = event.target.closest('[data-admin-settings-action]');
    if (!control || !container.contains(control)) return;
    const action = control.dataset.adminSettingsAction;
    if (action === 'set-period') { _dietReportPeriod = control.dataset.period === 'monthly' ? 'monthly' : 'weekly'; _rerender?.(); }
    if (action === 'publish-report') void _publishDietReport();
    if (action === 'export') _exportSettings(control.dataset.exportType);
    if (action === 'sign-out') void signOutToLoginScreen();
    if (action === 'delete-user') void _askDelete(control.dataset.uid, control.dataset.name);
  };

  // cheers 관리 UI는 lazy import로 로드
  import('./admin-cheers.js').then((mod) => {
    const el = document.getElementById('admin-cheers-container');
    if (el) mod.renderCheersAdminCard(el, data);
  }).catch((err) => console.warn('[admin-actions] cheers module load:', err));
}

async function _publishDietReport() {
  if (!DIET_PREMIUM_REPORT_AUTO_DELIVERY_ENABLED) {
    showToast('식단 프리미엄 리포트 자동 배송은 중지되어 있습니다', 3000, 'info');
    return;
  }

  const periodLabel = _dietReportPeriod === 'monthly' ? '월간' : '주간';
  const ok = await confirmAction({
    title: `${periodLabel} 식단 리포트를 발간할까요?`,
    message: DIET_PREMIUM_REPORT_TARGETS.map(_targetLabel).join(', ') + ' 계정에 다음 접속 1회성 모달로 배송됩니다.',
    confirmLabel: '발간',
    cancelLabel: '취소',
  });
  if (!ok) return;

  const button = document.getElementById('admin-diet-report-publish-button');
  if (button) {
    button.disabled = true;
    button.textContent = '발간 중...';
  }

  try {
    const result = await publishDietPremiumReportIssue({
      period: _dietReportPeriod,
      targetUserIds: DIET_PREMIUM_REPORT_TARGETS.map((target) => target.id),
    });
    _dietReportLastPublish = result;
    showToast(`${result.title}를 ${result.deliveredCount}명에게 배송했습니다`, 3000, 'success');
    if (_rerender) _rerender();
  } catch (error) {
    showToast(`리포트 발간 실패: ${error.message}`, 3500, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = '지금 리포트 발간/배송';
    }
  }
};

function _exportSettings(type) {
  if (!_adminData) return;
  switch (type) {
    case 'users':
      exportUsersReport(_adminData);
      break;
    case 'daily':
      exportDailyActivity(_adminData);
      break;
    case 'social':
      exportSocialInteractions(_adminData);
      break;
    case 'letters':
      exportLettersAndPatchnotes(_adminData);
      break;
    case 'all_csv':
      exportAll(_adminData);
      break;
    case 'ai_json':
      exportAIJson(_adminData);
      break;
  }
};
