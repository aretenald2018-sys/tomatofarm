import { deleteUserAccount } from '../data.js';
import {
  exportUsersReport, exportDailyActivity,
  exportSocialInteractions, exportLettersAndPatchnotes,
  exportAll, exportAIJson,
} from './admin-export.js';
import { escapeHtml } from './admin-utils.js';

let _rerender = null;

function _askDelete(uid, name) {
  const ok = confirm(`${name} 계정을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`);
  if (!ok) return;
  deleteUserAccount(uid)
    .then(() => {
      alert(`${name} 계정을 삭제했습니다.`);
      if (_rerender) _rerender();
    })
    .catch((error) => {
      alert(`삭제 실패: ${error.message}`);
    });
}

export function renderSettingsSection(container, data, rerender) {
  _rerender = rerender;
  const users = [...data.realAccs]
    .sort((a, b) => ((a.nickname || '') > (b.nickname || '') ? 1 : -1));

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-card">
        <div class="hig-headline">데이터 내보내기</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="hig-btn-secondary" onclick="window._adminExportSettings('ai_json')">AI JSON</button>
          <button class="hig-btn-secondary" onclick="window._adminExportSettings('all_csv')">전체 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminExportSettings('users')">유저 CSV</button>
          <button class="hig-btn-secondary" onclick="window._adminExportSettings('daily')">일일 CSV</button>
        </div>
      </div>

      <div class="hig-card">
        <div class="hig-headline">함께 축하해요 관리</div>
        <div class="hig-caption1" style="color:var(--hig-gray1);margin-top:4px;">감지 모듈 on/off 및 수동 축하 작성</div>
        <div id="admin-cheers-container" style="margin-top:12px;"></div>
      </div>

      <div class="hig-card">
        <div class="hig-headline">Admin 모드 전환</div>
        <div class="hig-subhead" style="color:var(--hig-gray1);margin-top:6px;">게스트 모드로 전환하려면 아래 버튼을 사용하세요.</div>
        <button class="hig-btn-secondary" style="margin-top:10px;" onclick="window.switchKimMode && window.switchKimMode('Guest')">게스트 모드로 전환</button>
      </div>

      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">유저 삭제</div></div>
        ${users.map((user) => `
          <div class="hig-list-row" style="justify-content:space-between;">
            <div>
              <div class="hig-subhead">${escapeHtml(user.nickname || `${user.lastName || ''}${user.firstName || ''}` || user.id)}</div>
              <div class="hig-caption1" style="color:var(--hig-gray1);">${escapeHtml(user.id)}</div>
            </div>
            <button class="hig-btn-destructive" onclick="window._adminConfirmDeleteUser('${user.id}','${escapeHtml(user.nickname || user.id)}')">삭제</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // cheers 관리 UI는 lazy import로 로드
  import('./admin-cheers.js').then((mod) => {
    const el = document.getElementById('admin-cheers-container');
    if (el) mod.renderCheersAdminCard(el, data);
  }).catch((err) => console.warn('[admin-actions] cheers module load:', err));
}

window._adminConfirmDeleteUser = (uid, name) => _askDelete(uid, name);

window._adminExportSettings = (type) => {
  if (!window.__adminDataCache) return;
  switch (type) {
    case 'users':
      exportUsersReport(window.__adminDataCache);
      break;
    case 'daily':
      exportDailyActivity(window.__adminDataCache);
      break;
    case 'social':
      exportSocialInteractions(window.__adminDataCache);
      break;
    case 'letters':
      exportLettersAndPatchnotes(window.__adminDataCache);
      break;
    case 'all_csv':
      exportAll(window.__adminDataCache);
      break;
    case 'ai_json':
      exportAIJson(window.__adminDataCache);
      break;
  }
};
