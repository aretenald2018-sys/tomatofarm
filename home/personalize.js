// ================================================================
// home/personalize.js — 홈 카드 개인화 (순서/숨김)
//   - _settings.home_card_order: 카드 id 순서 배열
//   - _settings.home_card_hidden: 숨길 카드 id 배열
//   - 드래그 UI는 향후 설정 모달에서 구현 — 여기서는 순서/숨김 적용만
//
// 전역 API (window.homeCardPersonalize):
//   setOrder([...ids])        — 순서 저장 + 즉시 반영
//   setHidden([...ids])       — 숨김 저장 + 즉시 반영
//   moveUp(id) / moveDown(id) — 카드 하나 위/아래
//   toggleHidden(id)          — 카드 숨김 토글
//   reset()                   — 기본값으로 리셋
// ================================================================

import {
  getHomeCardOrder, saveHomeCardOrder,
  getHomeCardHidden, saveHomeCardHidden,
} from '../data.js';

// 모든 홈 카드 id를 DOM 순서대로 수집
function _allCardIds() {
  const section = document.querySelector('#tab-home .home-section');
  if (!section) return [];
  return Array.from(section.querySelectorAll('.home-card'))
    .map(el => el.id)
    .filter(id => !!id);
}

/**
 * 저장된 설정에 따라 홈 카드 순서를 재배치하고, 숨김 목록의 카드를 display:none.
 * renderHome() 직후 호출.
 */
export function applyHomeCardPersonalization() {
  const section = document.querySelector('#tab-home .home-section');
  if (!section) return;

  // 1) 순서 적용
  const savedOrder = getHomeCardOrder();
  if (Array.isArray(savedOrder) && savedOrder.length > 0) {
    savedOrder.forEach((cardId) => {
      const el = document.getElementById(cardId);
      if (el && el.classList.contains('home-card')) {
        section.appendChild(el); // 말미로 이동 → 순서대로 append하면 정렬됨
      }
    });
  }

  // 2) 숨김 적용
  const hidden = getHomeCardHidden() || [];
  _allCardIds().forEach((cardId) => {
    const el = document.getElementById(cardId);
    if (!el) return;
    // hidden 목록에 있으면 display:none, 아니면 기존 display 복원
    if (hidden.includes(cardId)) {
      el.dataset.personalizeHidden = '1';
      el.style.display = 'none';
    } else if (el.dataset.personalizeHidden === '1') {
      delete el.dataset.personalizeHidden;
      el.style.display = '';
    }
  });
}

// ── 전역 API ───────────────────────────────────────────────────
async function setOrder(idArr) {
  if (!Array.isArray(idArr)) return;
  await saveHomeCardOrder(idArr);
  applyHomeCardPersonalization();
}

async function setHidden(idArr) {
  if (!Array.isArray(idArr)) return;
  await saveHomeCardHidden(idArr);
  applyHomeCardPersonalization();
}

async function moveUp(cardId) {
  const current = getHomeCardOrder() || _allCardIds();
  const idx = current.indexOf(cardId);
  if (idx <= 0) return;
  [current[idx - 1], current[idx]] = [current[idx], current[idx - 1]];
  await setOrder(current);
}

async function moveDown(cardId) {
  const current = getHomeCardOrder() || _allCardIds();
  const idx = current.indexOf(cardId);
  if (idx < 0 || idx >= current.length - 1) return;
  [current[idx + 1], current[idx]] = [current[idx], current[idx + 1]];
  await setOrder(current);
}

async function toggleHidden(cardId) {
  const hidden = [...(getHomeCardHidden() || [])];
  const idx = hidden.indexOf(cardId);
  if (idx >= 0) hidden.splice(idx, 1);
  else hidden.push(cardId);
  await setHidden(hidden);
}

async function reset() {
  await Promise.all([
    saveHomeCardOrder(null),
    saveHomeCardHidden([]),
  ]);
  applyHomeCardPersonalization();
}

if (typeof window !== 'undefined') {
  window.homeCardPersonalize = {
    apply: applyHomeCardPersonalization,
    setOrder,
    setHidden,
    moveUp,
    moveDown,
    toggleHidden,
    reset,
    listCards: _allCardIds,
  };
}
