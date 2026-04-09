// ================================================================
// home/farm.js — 농장 시스템 (듀오링고/싸이월드 스타일)
// ================================================================

import { TODAY, getCurrentUser,
         getUnitGoalStart,
         getTomatoState, getFarmState, getFarmShopItems,
         buyFarmItem, placeFarmItem, removeFarmItem, moveFarmCharacter }  from '../data.js';
import { calcTomatoCycle, getQuarterKey }  from '../calc.js';
import { showToast } from './utils.js';

let _farmEditMode = false;
let _farmSelectedItem = null;

// ── 듀오링고 스타일 농장 ─────────────────────────────────────────
export function renderFarmDuolingo() {
  const el = document.getElementById('farm-duolingo-content');
  if (!el) return;

  const farm = getFarmState();
  const tomatoState = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = tomatoState.quarterlyTomatoes[qKey] || 0;
  const totalCount = Math.max(0, tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0));
  const shopItems = getFarmShopItems();
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = shopItems.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = totalCount - spent;

  const startStr = getUnitGoalStart();
  const cycle = startStr ? calcTomatoCycle(startStr, TODAY) : null;
  const dayIndex = cycle ? cycle.dayIndex : 0;
  const stages = ['🌱','🌿','🍅'];
  const stageLabels = ['씨앗 심기','새싹 돌보기','수확하기'];
  const stageColors = ['#8b95a1','#5cb85c','#e53935'];

  const user = getCurrentUser();
  const userName = user ? user.lastName + user.firstName : '';

  const farmTiles = (farm.tiles || []).slice(0, 24);
  let gardenItems = '';
  const gardenSlots = [7,8,9,13,14,15,19,20,21];
  gardenSlots.forEach((idx, i) => {
    const tile = farmTiles[idx];
    const item = tile ? shopItems.find(s => s.id === tile.itemId) : null;
    if (item) {
      gardenItems += `<div class="tf-plot tf-filled" onclick="farmTileClick(${idx})">${item.emoji}</div>`;
    } else {
      gardenItems += `<div class="tf-plot tf-growing">${stages[dayIndex]}</div>`;
    }
  });

  const decoIdxs = [0,1,2,3,4,5,6,10,11,12,16,17,18,22,23];
  let decoItems = '';
  decoIdxs.forEach(idx => {
    const tile = farmTiles[idx];
    const item = tile ? shopItems.find(s => s.id === tile.itemId) : null;
    if (item) decoItems += `<span class="tf-deco-item" onclick="farmTileClick(${idx})">${item.emoji}</span>`;
  });

  const clampedIdx = Math.min(dayIndex, 2);
  const dots = [0,1,2].map(i => {
    let cls = 'tf-step';
    if (i < clampedIdx) cls += ' tf-done';
    else if (i === clampedIdx) cls += ' tf-current';
    return `<div class="${cls}"><span class="tf-step-icon">${stages[i]}</span><span class="tf-step-label">${['D1','D2','D3'][i]}</span></div>`;
  }).join('<div class="tf-step-line"></div>');

  el.innerHTML = `
    <div class="tf-card">
      <div class="tf-hero">
        <div class="tf-hero-left">
          <div class="tf-hero-label">내 토마토</div>
          <div class="tf-hero-count">${totalCount}<span class="tf-hero-unit">개</span></div>
          <div class="tf-hero-sub">이번 분기 <b>${qCount}개</b> 수확</div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${stages[dayIndex]}</div>
        </div>
      </div>

      <div class="tf-progress">
        <div class="tf-progress-title">${stageLabels[dayIndex]}</div>
        <div class="tf-steps">${dots}</div>
      </div>

      <div class="tf-garden">
        <div class="tf-garden-header">
          <span class="tf-garden-title">내 텃밭</span>
          <div class="tf-garden-actions">
            <span class="tf-balance">🍅 ${balance}</span>
            <button class="tf-action-btn" onclick="farmToggleEdit()">${_farmEditMode ? '✓ 완료' : '꾸미기'}</button>
            <button class="tf-action-btn" onclick="openFarmShop()">상점</button>
          </div>
        </div>
        <div class="tf-garden-scene">
          <div class="tf-garden-bg">
            ${decoItems ? `<div class="tf-deco-row">${decoItems}</div>` : ''}
          </div>
          <div class="tf-plots">${gardenItems}</div>
        </div>
      </div>

      <div class="tf-footer">
        <div class="tf-footer-item">
          <span class="tf-footer-val">${qCount}</span>
          <span class="tf-footer-lbl">수확</span>
        </div>
        <div class="tf-footer-divider"></div>
        <div class="tf-footer-item">
          <span class="tf-footer-val">${tomatoState.giftedReceived || 0}</span>
          <span class="tf-footer-lbl">선물 받음</span>
        </div>
        <div class="tf-footer-divider"></div>
        <div class="tf-footer-item">
          <span class="tf-footer-val">${balance}</span>
          <span class="tf-footer-lbl">잔액</span>
        </div>
      </div>

      ${_farmEditMode ? `
        <div class="tf-toolbar">
          <div class="tf-toolbar-label">아이템 배치</div>
          <div class="tf-toolbar-items" id="farm-toolbar-items"></div>
        </div>
      ` : ''}
    </div>
  `;

  if (_farmEditMode) renderFarmToolbar(farm, shopItems);
}

function renderFarmToolbar(farm, shopItems) {
  const toolbar = document.getElementById('farm-toolbar-items');
  if (!toolbar) return;
  const owned = farm.ownedItems || [];
  if (!owned.length) {
    toolbar.innerHTML = '<div style="font-size:12px;color:var(--seed-fg-subtle);padding:8px;">상점에서 아이템을 구매하세요!</div>';
    return;
  }
  toolbar.innerHTML = owned.map(o => {
    const item = shopItems.find(s => s.id === o.itemId);
    if (!item) return '';
    const placedCount = farm.tiles.filter(t => t?.itemId === o.itemId).length;
    const remaining = o.quantity - placedCount;
    const isSelected = _farmSelectedItem === o.itemId;
    return `<button class="farm-inv-item ${isSelected ? 'selected' : ''} ${remaining <= 0 ? 'depleted' : ''}"
      onclick="farmSelectItem('${o.itemId}')">${item.emoji}<span class="farm-inv-count">${remaining}</span></button>`;
  }).join('');
}

window.farmSceneClick = async function(e) {
  const scene = e.currentTarget;
  const rect = scene.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
  const SLOT_POSITIONS = [
    {x:12,y:18},{x:32,y:16},{x:55,y:18},{x:78,y:16},{x:92,y:18},{x:5,y:20},
    {x:18,y:34},{x:40,y:32},{x:60,y:36},{x:82,y:33},{x:10,y:36},{x:90,y:35},
    {x:15,y:52},{x:35,y:50},{x:55,y:54},{x:75,y:51},{x:92,y:53},{x:5,y:50},
    {x:20,y:70},{x:42,y:68},{x:62,y:72},{x:80,y:69},{x:8,y:71},{x:93,y:70},
  ];
  let closest = 0, minDist = Infinity;
  SLOT_POSITIONS.forEach((p, i) => {
    const d = Math.sqrt((p.x - xPct)**2 + (p.y - yPct)**2);
    if (d < minDist) { minDist = d; closest = i; }
  });
  await moveFarmCharacter(closest);
  renderFarmDuolingo();
};

window.farmToggleEdit = function() {
  _farmEditMode = !_farmEditMode;
  _farmSelectedItem = null;
  renderFarmDuolingo();
};

window.farmSelectItem = function(itemId) {
  _farmSelectedItem = _farmSelectedItem === itemId ? null : itemId;
  const farm = getFarmState();
  renderFarmToolbar(farm, getFarmShopItems());
};

window.farmTileClick = async function(idx) {
  const farm = getFarmState();
  if (farm.tiles[idx]) {
    await removeFarmItem(idx);
  } else if (_farmSelectedItem) {
    await placeFarmItem(idx, _farmSelectedItem);
  }
  renderFarmDuolingo();
};

window.farmMoveChar = async function(idx) {
  await moveFarmCharacter(idx);
  renderFarmDuolingo();
};

window.openFarmShop = function() {
  const shopItems = getFarmShopItems();
  const tomatoState = getTomatoState();
  const farm = getFarmState();
  const totalCount = Math.max(0, tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0));
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = shopItems.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = totalCount - spent;

  const categories = { nature: '🌿 자연', building: '🏡 건물', animal: '🐾 동물', special: '✨ 특별' };
  let html = '';
  for (const [cat, label] of Object.entries(categories)) {
    const items = shopItems.filter(i => i.category === cat);
    html += `<div class="farm-shop-cat">${label}</div>`;
    html += items.map(i => `
      <button class="farm-shop-item" onclick="farmBuyItem('${i.id}')">
        <span class="farm-shop-emoji">${i.emoji}</span>
        <span class="farm-shop-name">${i.name}</span>
        <span class="farm-shop-price">${i.price}🍅</span>
      </button>
    `).join('');
  }

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop open" style="z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title">🛒 농장 상점</div>
      <div style="text-align:center;font-size:14px;font-weight:700;color:var(--primary);margin-bottom:16px;">보유: ${balance} 🍅</div>
      <div id="farm-shop-list">${html}</div>
    </div>
  </div>`;
};

window.farmBuyItem = async function(itemId) {
  const result = await buyFarmItem(itemId);
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  showToast('구매 완료!', 2500, 'success');
  renderFarmDuolingo();
  window.openFarmShop();
};

// ── 싸이월드 스타일 농장 ─────────────────────────────────────────
export function renderFarmCyworld() {
  const el = document.getElementById('farm-cyworld-content');
  if (!el) return;

  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const totalCount = Math.max(0, state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0));
  const startStr = getUnitGoalStart();
  const cycle = startStr ? calcTomatoCycle(startStr, TODAY) : null;
  const dayIndex = cycle ? cycle.dayIndex : 0;

  const stages = ['🌱','🌿','🍅'];

  const farmSlots = [];
  for (let i = 0; i < 12; i++) {
    if (i < qCount) {
      farmSlots.push('<div class="cy-slot cy-has">🍅</div>');
    } else if (i === qCount && cycle) {
      farmSlots.push(`<div class="cy-slot cy-growing">${stages[Math.min(dayIndex, 2)]}</div>`);
    } else {
      farmSlots.push('<div class="cy-slot cy-dirt"></div>');
    }
  }

  const user = getCurrentUser();
  const userName = user ? user.lastName + user.firstName : '';
  const initial = user ? user.lastName.charAt(0) : '?';

  el.innerHTML = `
    <div class="cy-farm">
      <div class="cy-farm-header">
        <div class="cy-avatar">${initial}</div>
        <div class="cy-header-info">
          <div class="cy-farm-name">${userName}의 미니농장</div>
          <div class="cy-farm-sub">옵션 B: 싸이월드</div>
        </div>
        <div class="cy-weather">🌤️</div>
      </div>
      <div class="cy-farm-scene">
        <div class="cy-fence-top"></div>
        <div class="cy-garden-grid">${farmSlots.join('')}</div>
        <div class="cy-fence-bottom"></div>
      </div>
      <div class="cy-info-bar">
        <div class="cy-info-item">
          <span class="cy-info-icon">🍅</span>
          <span class="cy-info-val">${qCount}</span>
          <span class="cy-info-lbl">수확</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">🌱</span>
          <span class="cy-info-val">D${dayIndex+1}</span>
          <span class="cy-info-lbl">성장중</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">💰</span>
          <span class="cy-info-val">${totalCount}</span>
          <span class="cy-info-lbl">누적</span>
        </div>
        <div class="cy-info-item">
          <span class="cy-info-icon">🎁</span>
          <span class="cy-info-val">${state.giftedReceived || 0}</span>
          <span class="cy-info-lbl">선물</span>
        </div>
      </div>
      <div class="cy-bgm-bar">
        <span class="cy-bgm-note">♪</span>
        <span class="cy-bgm-text">나의 농장에 오신 걸 환영합니다~</span>
        <span class="cy-bgm-note">♪</span>
      </div>
    </div>
  `;
}
