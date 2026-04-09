// ================================================================
// feature-misc.js — 설정, 구역 제목, 미니 메모, CSV 내보내기
// ================================================================

import { getSectionTitle, saveSectionTitle,
         getMiniMemoItems, saveMiniMemoItems,
         deleteNutritionItem, getNutritionDB } from './data.js';
import { renderHome, showToast } from './render-home.js';
import { getDeferredInstallPrompt } from './pwa-fcm.js';

// ── 구역 제목 편집 ────────────────────────────────────────────────
function editSectionTitle(key) {
  document.getElementById('section-title-key').value   = key;
  document.getElementById('section-title-input').value = getSectionTitle(key);
  window._openModal('section-title-modal');
}

function closeSectionTitleModal(e) { window._closeModal('section-title-modal', e); }

async function saveSectionTitleFromModal() {
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
async function addMiniMemoItem() {
  const input = document.getElementById('mini-memo-new-input');
  const text  = input.value.trim();
  if (!text) return;
  const items = getMiniMemoItems();
  items.push({ id: `memo_${Date.now()}`, text, checked: false });
  await saveMiniMemoItems(items);
  input.value = '';
  renderHome();
}

async function toggleMiniMemoItem(id) {
  const items = getMiniMemoItems().map(item =>
    item.id === id ? { ...item, checked: !item.checked } : item
  );
  await saveMiniMemoItems(items);
  renderHome();
}

async function deleteMiniMemoItem(id) {
  const items = getMiniMemoItems().filter(item => item.id !== id);
  await saveMiniMemoItems(items);
  renderHome();
}

// ── CSV 내보내기 ─────────────────────────────────────────────────
function openExportModal() {
  document.getElementById('export-modal').classList.add('open');
}
function closeExportModal(e) { window._closeModal('export-modal', e); }
async function runExportCSV(period) {
  const m = await import('./render-stats.js');
  m.exportCSV(period);
  document.getElementById('export-modal').classList.remove('open');
}

// ── 설정 모달 ────────────────────────────────────────────────────
function openSettingsModal() {
  document.getElementById('cfg-anthropic').value = localStorage.getItem('cfg_anthropic') || '';
  _renderNutritionDBList();
  document.getElementById('settings-modal').classList.add('open');
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
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${item.kcal}kcal ${item.protein!=null?`단${item.protein}g`:''} ${item.carbs!=null?`탄${item.carbs}g`:''} ${item.fat!=null?`지${item.fat}g`:''}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:4px" onclick="openNutritionItemEditor('${item.id}')">✏️</button>
      <button style="background:none;border:none;color:var(--diet-bad);font-size:14px;cursor:pointer;padding:4px" onclick="_quickDeleteNutritionItem('${item.id}')">✕</button>
    </div>`).join('');
}

async function _quickDeleteNutritionItem(id) {
  if (!confirm('삭제할까요?')) return;
  await deleteNutritionItem(id);
  _renderNutritionDBList();
}

function closeSettingsModal(e) { window._closeModal('settings-modal', e); }
function saveSettings() {
  const anthropic = document.getElementById('cfg-anthropic').value.trim();
  if (anthropic) localStorage.setItem('cfg_anthropic', anthropic);

  document.getElementById('settings-modal').classList.remove('open');
  showToast('설정이 저장되었습니다');
}

// ── window 등록 ─────────────────────────────────────────────────
Object.assign(window, {
  editSectionTitle,
  closeSectionTitleModal,
  saveSectionTitleFromModal,
  addMiniMemoItem,
  toggleMiniMemoItem,
  deleteMiniMemoItem,
  openExportModal,
  closeExportModal,
  runExportCSV,
  openSettingsModal,
  closeSettingsModal,
  saveSettings,
  _quickDeleteNutritionItem,
});
