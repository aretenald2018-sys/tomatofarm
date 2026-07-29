// ================================================================
// feature-misc.js — 설정, 구역 제목, 미니 메모, CSV 내보내기
// ================================================================

import { getSectionTitle, saveSectionTitle,
         getMiniMemoItems, saveMiniMemoItems,
         deleteNutritionItem, getNutritionDB } from './data.js';
import { renderHome } from './home/index.js';
import { showToast } from './ui/toast.js';
import { getDeferredInstallPrompt } from './pwa-fcm.js';
import { confirmAction } from './utils/confirm-modal.js';
import { renderBuildInfo } from './utils/build-info.js';
import { closeModal, openModal } from './app/overlay-stack.js';

// ── 구역 제목 편집 ────────────────────────────────────────────────
export function editSectionTitle(key) {
  document.getElementById('section-title-key').value   = key;
  document.getElementById('section-title-input').value = getSectionTitle(key);
  openModal('section-title-modal');
}

export function closeSectionTitleModal(e) { closeModal('section-title-modal', e); }

export async function saveSectionTitleFromModal() {
  const key   = document.getElementById('section-title-key').value;
  const title = document.getElementById('section-title-input').value.trim();
  if (!title) return;
  await saveSectionTitle(key, title);
  const el = document.getElementById(`title-${key}`);
  if (el) el.textContent = title;
  document.getElementById('section-title-modal').classList.remove('open');
  showToast('저장되었습니다');
}

// ── 미니 메모 (체크리스트) ────────────────────────────────────────
export async function addMiniMemoItem() {
  const input = document.getElementById('mini-memo-new-input');
  const text  = input.value.trim();
  if (!text) return;
  const items = getMiniMemoItems();
  items.push({ id: `memo_${Date.now()}`, text, checked: false });
  await saveMiniMemoItems(items);
  input.value = '';
  renderHome();
}

export async function toggleMiniMemoItem(id) {
  const items = getMiniMemoItems().map(item =>
    item.id === id ? { ...item, checked: !item.checked } : item
  );
  await saveMiniMemoItems(items);
  renderHome();
}

export async function deleteMiniMemoItem(id) {
  const items = getMiniMemoItems().filter(item => item.id !== id);
  await saveMiniMemoItems(items);
  renderHome();
}

// ── CSV 내보내기 ─────────────────────────────────────────────────
export function openExportModal() {
  document.getElementById('export-modal').classList.add('open');
}
export function closeExportModal(e) { closeModal('export-modal', e); }
export async function runExportCSV(period) {
  const m = await import('./render-stats.js');
  m.exportCSV(period);
  document.getElementById('export-modal').classList.remove('open');
}

// ── 설정 모달 ────────────────────────────────────────────────────
export function openSettingsModal() {
  document.getElementById('cfg-anthropic').value = localStorage.getItem('cfg_anthropic') || '';
  _renderNutritionDBList();
  document.getElementById('settings-modal').classList.add('open');
  renderBuildInfo().catch(e => console.warn('[settings] build info 표시 실패:', e));
  // PWA 설치 섹션 업데이트
  try {
    const section = document.getElementById('pwa-install-section');
    if (section) {
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      section.style.display = getDeferredInstallPrompt() ? 'block' : (!isInstalled ? 'block' : 'none');
    }
  } catch(e) { console.error(e); }
}

function _renderNutritionDBList() {
  const container = document.getElementById('settings-nutrition-db-list');
  if (!container) return;
  const db = getNutritionDB();
  if (!db.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px">DB가 비어 있어요</div>';
    return;
  }
  container.innerHTML = db.map(item => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text)">${item.name}${item.unit ? ` <span style="font-weight:400;color:var(--muted)">(${item.unit})</span>` : ''}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${item.kcal}kcal ${item.protein!=null?`단${Math.round(item.protein)}g`:''} ${item.carbs!=null?`탄${Math.round(item.carbs)}g`:''} ${item.fat!=null?`지${Math.round(item.fat)}g`:''}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:4px" data-action="settings:edit-nutrition" data-item-id="${item.id}">✏️</button>
      <button style="background:none;border:none;color:var(--diet-bad);font-size:14px;cursor:pointer;padding:4px" data-action="settings:delete-nutrition" data-item-id="${item.id}">✕</button>
    </div>`).join('');
}

export async function quickDeleteNutritionItem(id) {
  const ok = await confirmAction({ title: '영양 아이템 삭제', message: '삭제할까요?', destructive: true });
  if (!ok) return;
  await deleteNutritionItem(id);
  _renderNutritionDBList();
}

export function closeSettingsModal(e) { closeModal('settings-modal', e); }
export function saveSettings() {
  const anthropic = document.getElementById('cfg-anthropic').value.trim();
  if (anthropic) localStorage.setItem('cfg_anthropic', anthropic);

  document.getElementById('settings-modal').classList.remove('open');
  showToast('설정이 저장되었습니다');
}

document.addEventListener('nutrition:database-changed', () => {
  if (document.getElementById('nutrition-db-list')) _renderNutritionDBList();
});
