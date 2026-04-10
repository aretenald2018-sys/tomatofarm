// ================================================================
// home/cheer-card.js — 미확인 응원 카드
// ================================================================

import { TODAY, dateKey, toggleLike, saveCheerLastSeen } from '../data.js';
import { showToast } from './utils.js';

function _uniqueCheers(cheers) {
  const map = new Map();
  cheers.forEach((cheer) => {
    if (!map.has(cheer.from)) map.set(cheer.from, cheer);
  });
  return [...map.values()];
}

function _friendNames(cheers) {
  return _uniqueCheers(cheers).map(c => c.fromName || c.from?.replace(/_/g, '') || '이웃');
}

function _getOverlay() {
  return document.getElementById('cheer-card-overlay');
}

function _showHandshakeConfetti(duration = 2200) {
  const container = document.createElement('div');
  container.className = 'handshake-confetti';
  for (let i = 0; i < 24; i++) {
    const particle = document.createElement('div');
    particle.className = 'handshake-confetti-particle';
    particle.textContent = '🤝';
    particle.style.left = `${8 + Math.random() * 84}%`;
    particle.style.animationDelay = `${Math.random() * 0.35}s`;
    particle.style.animationDuration = `${1.4 + Math.random() * 0.8}s`;
    particle.style.transform = `rotate(${Math.round(Math.random() * 40 - 20)}deg)`;
    container.appendChild(particle);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), duration);
}

export function clearCheerCard() {
  _getOverlay()?.remove();
}

export function renderCheerCard(cheers, onAfterAction) {
  const uniqueCheers = _uniqueCheers(cheers);
  if (!uniqueCheers.length) {
    clearCheerCard();
    return;
  }

  const names = _friendNames(uniqueCheers);
  let title;
  if (names.length <= 2) {
    title = `${names.map(n => `<strong>${n}</strong>님`).join(', ')}이 당신 편이에요!`;
  } else {
    title = `<strong>${names[0]}</strong>님, <strong>${names[1]}</strong>님 외 ${names.length - 2}명이 당신 편이에요!`;
  }

  clearCheerCard();

  const overlay = document.createElement('div');
  overlay.id = 'cheer-card-overlay';
  overlay.className = 'cheer-card-overlay';
  overlay.innerHTML = `
    <div class="cheer-card-modal" role="dialog" aria-modal="true">
      <div class="cheer-card-badge">🎉 응원 도착!</div>
      <div class="cheer-card-title">${title}</div>
      <div class="cheer-card-message">응원에 답하면 서로 더 가까워져요!</div>
      <div class="cheer-card-actions">
        <button type="button" class="tds-btn fill md" id="cheer-card-reciprocate-btn">나도 응원 보내기 💪</button>
        <button type="button" class="tds-btn ghost md" id="cheer-card-close-btn">나중에요</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.querySelector('#cheer-card-close-btn')?.click();
  });
  document.body.appendChild(overlay);

  overlay.querySelector('#cheer-card-close-btn')?.addEventListener('click', async () => {
    await saveCheerLastSeen(Math.max(...uniqueCheers.map(c => c.createdAt || 0), Date.now()));
    clearCheerCard();
    if (onAfterAction) onAfterAction();
  });

  overlay.querySelector('#cheer-card-reciprocate-btn')?.addEventListener('click', async () => {
    const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    await Promise.all(uniqueCheers.map(async (c) => {
      const liked = await toggleLike(c.from, todayKey, 'cheer', '💪');
      if (!liked) await toggleLike(c.from, todayKey, 'cheer', '💪');
    }));
    _showHandshakeConfetti();
    await saveCheerLastSeen(Math.max(...uniqueCheers.map(c => c.createdAt || 0), Date.now()));
    const first = uniqueCheers[0];
    const firstName = first.fromName || first.from?.replace(/_/g, '') || '이웃';
    const profileQuestion = uniqueCheers.length === 1
      ? `${firstName}님 오늘 뭐 했을까?`
      : `${firstName}님 외 ${uniqueCheers.length - 1}명, 오늘 뭐 했을까?`;
    overlay.innerHTML = `
      <div class="cheer-card-modal cheer-card-modal--done" role="dialog" aria-modal="true">
        <div class="cheer-card-badge">🤝 맞응원 완료!</div>
        <div class="cheer-card-title">이웃에게도 응원이 전달되었어요!</div>
        <div class="cheer-card-message">${profileQuestion}</div>
        <div class="cheer-card-actions">
          <button type="button" class="tds-btn fill md" id="cheer-card-profile-btn">프로필 보러 가기</button>
          <button type="button" class="tds-btn ghost md" id="cheer-card-done-close-btn">좋아요!</button>
        </div>
      </div>
    `;
    showToast('응원 완료!', 1800, 'success');
    overlay.querySelector('#cheer-card-profile-btn')?.addEventListener('click', () => {
      clearCheerCard();
      if (window.openFriendProfile) window.openFriendProfile(first.from, firstName);
      if (onAfterAction) onAfterAction();
    });
    overlay.querySelector('#cheer-card-done-close-btn')?.addEventListener('click', () => {
      clearCheerCard();
      if (onAfterAction) onAfterAction();
    });
    if (onAfterAction) onAfterAction();
  });
}
