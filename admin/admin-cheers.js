// ================================================================
// admin/admin-cheers.js — "함께 축하해요" 모듈 on/off + 수동 축하 작성
// ================================================================

import {
  getCheersConfigRemote, saveCheersConfig,
  getCustomCheers, saveCustomCheer, deleteCustomCheer,
} from '../data.js';
import { escapeHtml } from './admin-utils.js';

const MODULE_LABELS = [
  { key: 'weight',         label: '체중 변화',       desc: '최근 체크인 간 체중 감소/증가 감지' },
  { key: 'revival',        label: '기록 복귀',       desc: '며칠 쉬다가 오늘 다시 기록 시작' },
  { key: 'kcal',           label: '칼로리 조절',     desc: '어제(완결된 날) vs 그저께 섭취 비교 — 오늘은 평가 제외' },
  { key: 'volume_pr',      label: '운동 볼륨 증가',   desc: '종목별 볼륨(kg×rep) 경신' },
  { key: 'weight_pr',      label: '최고 중량 경신',   desc: '종목별 최대 중량 돌파' },
  { key: 'frequency_up',   label: '운동 빈도 증가',   desc: '저번 주에 안 하던 운동을 추가' },
  { key: 'full_diet_day',  label: '3끼 목표 달성',    desc: '오늘 세 끼 모두 목표 칼로리 내' },
];

let _config = { modules: {} };
let _customCheers = [];
let _accounts = [];

function _defaultsFor(config) {
  const base = {};
  MODULE_LABELS.forEach((m) => { base[m.key] = true; });
  return { ...base, ...(config?.modules || {}) };
}

export async function renderCheersAdminCard(container, data) {
  if (!container) return;
  _accounts = (data?.realAccs || []).slice();

  container.innerHTML = `<div class="hig-card"><div class="hig-subhead" style="color:var(--hig-gray1);">불러오는 중...</div></div>`;

  try {
    const [config, list] = await Promise.all([
      getCheersConfigRemote(),
      getCustomCheers(),
    ]);
    _config = config || { modules: {} };
    _customCheers = list || [];
    _paint(container);
  } catch (e) {
    console.error('[admin-cheers] load failed', e);
    container.innerHTML = `<div class="hig-card"><div class="hig-subhead" style="color:var(--hig-red);">불러오기 실패: ${escapeHtml(e.message || '')}</div></div>`;
  }
}

function _paint(container) {
  const modules = _defaultsFor(_config);

  const moduleRows = MODULE_LABELS.map((m) => {
    const on = !!modules[m.key];
    return `
      <label class="hig-list-row" style="justify-content:space-between;cursor:pointer;">
        <div>
          <div class="hig-subhead">${escapeHtml(m.label)}</div>
          <div class="hig-caption1" style="color:var(--hig-gray1);">${escapeHtml(m.desc)}</div>
        </div>
        <input type="checkbox" class="admin-cheers-toggle" data-key="${m.key}" ${on ? 'checked' : ''}
               style="width:20px;height:20px;cursor:pointer;accent-color:var(--primary, #fa342c);">
      </label>
    `;
  }).join('');

  const userOptions = _accounts.map((a) => {
    const label = a.nickname || `${a.lastName || ''}${a.firstName || ''}` || a.id;
    return `<option value="${escapeHtml(a.id)}">${escapeHtml(label)}</option>`;
  }).join('');

  const customRows = _customCheers.length
    ? _customCheers.map((c) => {
        const targetLabel = _accounts.find((a) => a.id === c.targetUid);
        const name = targetLabel
          ? (targetLabel.nickname || `${targetLabel.lastName || ''}${targetLabel.firstName || ''}` || targetLabel.id)
          : (c.targetName || c.targetUid || '누군가');
        const expiresText = c.expiresAt
          ? `${Math.max(0, Math.round((c.expiresAt - Date.now()) / 86400000))}일 남음`
          : '만료 없음';
        return `
          <div class="hig-list-row" style="justify-content:space-between;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div class="hig-subhead">${escapeHtml(name)} <span class="hig-caption1" style="color:var(--hig-gray1);">· ${escapeHtml(expiresText)}</span></div>
              <div class="hig-caption1" style="color:var(--hig-gray1);white-space:normal;">${escapeHtml(c.text || '')}</div>
            </div>
            <button class="hig-btn-destructive" data-cheer-id="${escapeHtml(c.id)}" onclick="window._adminCheersDelete(this.dataset.cheerId)">삭제</button>
          </div>
        `;
      }).join('')
    : `<div class="hig-list-row"><span class="hig-subhead" style="color:var(--hig-gray1);">현재 활성 수동 축하가 없습니다.</span></div>`;

  container.innerHTML = `
    <div class="hig-rows">
      <div class="hig-card-grouped">
        <div class="hig-list-row" style="justify-content:space-between;">
          <div>
            <div class="hig-headline">축하 모듈</div>
            <div class="hig-caption1" style="color:var(--hig-gray1);">홈 화면 "함께 축하해요!" 카드에 표시할 감지기를 선택합니다.</div>
          </div>
          <button class="hig-btn-primary" onclick="window._adminCheersSaveConfig()">저장</button>
        </div>
        ${moduleRows}
      </div>

      <div class="hig-card">
        <div class="hig-headline">수동 축하 추가</div>
        <div class="hig-caption1" style="color:var(--hig-gray1);margin-top:4px;">감지기로 못 잡는 이벤트(승진, 생일, 대회 완주 등)를 직접 작성합니다. 기본 3일 후 만료.</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
          <label class="hig-caption1" style="color:var(--hig-gray1);">대상 유저</label>
          <select id="admin-cheers-target" class="hig-input" style="padding:10px 12px;border-radius:10px;">
            <option value="">-- 선택 --</option>
            ${userOptions}
          </select>
          <label class="hig-caption1" style="color:var(--hig-gray1);">메시지 (이름은 자동으로 앞에 붙으니 <strong>제외하고</strong> 본문만 입력)</label>
          <textarea id="admin-cheers-text" class="hig-input" rows="2" placeholder="예: 오늘 첫 5km 달리기 완주했어요! 🎉  → 렌더 결과: &quot;줍스님 오늘 첫 5km 달리기 완주했어요! 🎉&quot;"
                    style="padding:10px 12px;border-radius:10px;resize:vertical;"></textarea>
          <div id="admin-cheers-preview" class="hig-caption1" style="color:var(--hig-gray1);padding:8px 12px;border-radius:8px;background:var(--hig-surface-elevated);min-height:24px;"></div>
          <label class="hig-caption1" style="color:var(--hig-gray1);">만료 (일 단위, 기본 3)</label>
          <input id="admin-cheers-days" type="number" min="1" max="30" value="3" class="hig-input" style="padding:10px 12px;border-radius:10px;width:120px;">
          <button class="hig-btn-primary" style="margin-top:6px;" onclick="window._adminCheersAddCustom()">추가</button>
        </div>
      </div>

      <div class="hig-card-grouped">
        <div class="hig-list-row"><div class="hig-headline">활성 수동 축하 (${_customCheers.length}건)</div></div>
        ${customRows}
      </div>
    </div>
  `;

  // 체크박스 변경 → 메모리만 갱신 (저장 버튼 눌러야 반영)
  container.querySelectorAll('.admin-cheers-toggle').forEach((input) => {
    input.addEventListener('change', (e) => {
      const key = e.target.dataset.key;
      if (!_config.modules) _config.modules = {};
      _config.modules[key] = !!e.target.checked;
    });
  });

  // 메시지 실시간 프리뷰 (이름 자동 prepend 시각화)
  const previewEl = container.querySelector('#admin-cheers-preview');
  const textEl = container.querySelector('#admin-cheers-text');
  const targetEl = container.querySelector('#admin-cheers-target');
  const updatePreview = () => {
    if (!previewEl) return;
    const raw = (textEl?.value || '').trim();
    const normalized = raw.replace(/^님[\s,]*/, '').trim();
    const targetUid = targetEl?.value || '';
    const acc = _accounts.find((a) => a.id === targetUid);
    const name = acc
      ? (acc.nickname || `${acc.lastName || ''}${acc.firstName || ''}` || acc.id)
      : '(대상 선택)';
    if (!normalized) {
      previewEl.innerHTML = '<span style="opacity:0.6;">미리보기: 메시지 입력 시 여기 표시</span>';
      return;
    }
    previewEl.innerHTML = `미리보기: <strong>${escapeHtml(name)}</strong>님 ${escapeHtml(normalized)}`;
  };
  textEl?.addEventListener('input', updatePreview);
  targetEl?.addEventListener('change', updatePreview);
  updatePreview();
}

window._adminCheersSaveConfig = async () => {
  try {
    const modules = _defaultsFor(_config);
    await saveCheersConfig({ modules });
    window.showToast?.('축하 모듈 설정 저장 완료', 2500, 'success');
  } catch (e) {
    window.showToast?.('저장 실패: ' + (e.message || e), 3500, 'error');
  }
};

window._adminCheersAddCustom = async () => {
  const targetSel = document.getElementById('admin-cheers-target');
  const textEl = document.getElementById('admin-cheers-text');
  const daysEl = document.getElementById('admin-cheers-days');
  if (!targetSel || !textEl) return;
  const targetUid = targetSel.value;
  const text = (textEl.value || '').trim();
  const days = Math.max(1, Math.min(30, parseInt(daysEl?.value || '3', 10) || 3));
  if (!targetUid) { window.showToast?.('대상 유저를 선택하세요', 2500, 'warning'); return; }
  if (!text) { window.showToast?.('메시지를 입력하세요', 2500, 'warning'); return; }
  const targetAcc = _accounts.find((a) => a.id === targetUid);
  const targetName = targetAcc?.nickname || `${targetAcc?.lastName || ''}${targetAcc?.firstName || ''}` || targetUid;
  try {
    await saveCustomCheer({
      targetUid,
      targetName,
      text,
      expiresAt: Date.now() + days * 86400000,
    });
    textEl.value = '';
    // 목록 갱신
    _customCheers = await getCustomCheers();
    const container = document.querySelector('#admin-cheers-container');
    if (container) _paint(container);
  } catch (e) {
    window.showToast?.('추가 실패: ' + (e.message || e), 3500, 'error');
  }
};

window._adminCheersDelete = async (id) => {
  if (!id) return;
  if (!confirm('이 수동 축하를 삭제할까요?')) return;
  try {
    await deleteCustomCheer(id);
    _customCheers = _customCheers.filter((c) => c.id !== id);
    const container = document.querySelector('#admin-cheers-container');
    if (container) _paint(container);
  } catch (e) {
    window.showToast?.('삭제 실패: ' + (e.message || e), 3500, 'error');
  }
};
