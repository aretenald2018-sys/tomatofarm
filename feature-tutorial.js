// ================================================================
// feature-tutorial.js — 첫 이용자 튜토리얼 (코치마크 스타일)
// ================================================================

import { getCurrentUser, isAdmin } from './data.js';

const NEW_USER_TUTORIAL_WINDOW_MS = 30 * 60 * 1000;

export function showTutorialIfNeeded(options = {}) {
  if (localStorage.getItem('tutorial_completed')) return false;
  if (isAdmin()) return false;

  const user = getCurrentUser();
  const previousLastLoginAt = Number(options.previousLastLoginAt || 0);
  const tutorialDoneAt = Number(user?.tutorialDoneAt || 0);
  const createdAt = Number(user?.createdAt || 0);
  const isFreshSignup = !!user
    && !previousLastLoginAt
    && !tutorialDoneAt
    && createdAt > 0
    && (Date.now() - createdAt) <= NEW_USER_TUTORIAL_WINDOW_MS;

  if (!isFreshSignup) return false;
  if (document.getElementById('tutorial-overlay')) return true;

  document.getElementById('cheer-card-overlay')?.remove();

  const steps = [
    {
      icon: '🍅',
      title: '내 토마토',
      desc: '4일간 식단 목표를 달성하면 토마토를 하나 수확해요. 매일 꾸준히 기록해보세요!',
      tab: 'home',
      target: '#hero-content',
      tabLabel: '홈',
      position: 'below',
    },
    {
      icon: '👋',
      title: '이웃과 함께해요',
      desc: '이웃을 맺으면 친구가 뭘 먹었는지, 무슨 운동을 했는지 볼 수 있어요. 좋아요와 응원 메시지도 남길 수 있답니다!',
      tab: 'home',
      target: '#card-friends',
      tabLabel: '홈',
      position: 'below',
    },
    {
      icon: '🍽️',
      title: '오늘의 칼로리',
      desc: '식단 탭에서 신체정보를 입력하면 하루 목표 칼로리가 자동 계산돼요. 아침·점심·저녁·간식을 기록하세요.',
      tab: 'diet',
      target: '#wt-diet-setup, .diet-grid',
      tabLabel: '식단',
      position: 'below',
    },
    {
      icon: '🔍',
      title: '가공식품도 검색 가능',
      desc: '라라스윗, 다논, 프로틴바 등 가공식품까지 모두 검색돼요. 영양 정보가 자동으로 입력됩니다.',
      tab: 'diet',
      target: '.diet-grid',
      tabLabel: '식단',
      position: 'above',
    },
    {
      icon: '💪',
      title: '운동 기록',
      desc: '헬스, 크로스핏, 수영, 런닝 등 다양한 운동을 기록할 수 있어요. 세트·횟수까지 상세하게!',
      tab: 'workout',
      target: '#wt-flow',
      tabLabel: '운동',
      position: 'below',
    },
  ];

  let currentStep = 0;

  function getOverlay() {
    let el = document.getElementById('tutorial-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'tutorial-overlay'; document.body.appendChild(el); }
    return el;
  }

  function renderStep() {
    const s = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    const prevOverlay = document.getElementById('tutorial-overlay');
    if (prevOverlay) prevOverlay.innerHTML = '';

    window.switchTab(s.tab);

    setTimeout(() => {
      const targetEl = s.target.split(',').map(sel => document.querySelector(sel.trim())).find(el => el && el.offsetHeight > 0);

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      requestAnimationFrame(() => { requestAnimationFrame(() => {
        _renderCoachOverlay(targetEl, s, isLast);
      }); });
    }, 400);
  }

  function _renderCoachOverlay(targetEl, s, isLast) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const rect = targetEl
      ? targetEl.getBoundingClientRect()
      : null;

    const pad = 10;
    let hlTop, hlLeft, hlW, hlH;
    if (rect) {
      const maxHlH = Math.min(rect.height, 150);
      hlLeft = Math.max(rect.left - pad, 0);
      hlW = Math.min(rect.width + pad * 2, vw - hlLeft);
      hlTop = Math.max(rect.top - pad, 0);
      hlH = Math.min(maxHlH + pad * 2, vh * 0.4);
      if (hlTop + hlH > vh * 0.55) {
        hlH = Math.max(vh * 0.55 - hlTop, 60);
      }
    } else {
      hlTop = vh * 0.15; hlLeft = 16; hlW = vw - 32; hlH = 100;
    }

    const hlBottom = hlTop + hlH;

    const gap = 14;
    const tooltipMinH = 220;
    const maxW = 400;
    const tooltipW = Math.min(maxW, vw - 32);

    const hlCenterX = hlLeft + hlW / 2;
    let tooltipLeft = Math.round(hlCenterX - tooltipW / 2);
    tooltipLeft = Math.max(16, Math.min(tooltipLeft, vw - tooltipW - 16));

    let tooltipTopVal;
    let arrowDir;
    const belowY = hlBottom + gap;
    const aboveBottomY = hlTop - gap;

    if (vh - belowY >= tooltipMinH) {
      tooltipTopVal = belowY;
      arrowDir = 'up';
    } else if (aboveBottomY >= tooltipMinH) {
      tooltipTopVal = Math.max(aboveBottomY - tooltipMinH, 8);
      arrowDir = 'down';
    } else {
      tooltipTopVal = vh - tooltipMinH - 16;
      arrowDir = 'up';
      if (hlBottom > tooltipTopVal - gap) {
        hlH = Math.max(tooltipTopVal - gap - hlTop, 40);
      }
    }

    tooltipTopVal = Math.max(8, Math.min(tooltipTopVal, vh - tooltipMinH - 8));

    const arrowX = Math.max(20, Math.min(Math.round(hlCenterX - tooltipLeft), tooltipW - 20));

    const hlBottomFinal = hlTop + hlH;

    const overlay = getOverlay();
    overlay.innerHTML = `
      <div class="coach-backdrop" id="coach-backdrop">
        <svg class="coach-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="coach-mask">
              <rect width="100%" height="100%" fill="white"/>
              <rect x="${hlLeft}" y="${hlTop}" width="${hlW}" height="${hlH}" rx="16" fill="black"/>
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#coach-mask)"/>
        </svg>
        <div class="coach-highlight" style="top:${hlTop}px;left:${hlLeft}px;width:${hlW}px;height:${hlH}px;"></div>
        <div class="coach-tooltip coach-arrow-${arrowDir}" style="top:${tooltipTopVal}px;left:${tooltipLeft}px;width:${tooltipW}px;">
          <div class="coach-tooltip-head">
            <div class="coach-step-badge">${currentStep + 1} / ${steps.length}</div>
            <div class="coach-tab-badge">${s.tabLabel} 탭</div>
          </div>
          <div class="coach-tooltip-icon">${s.icon}</div>
          <div class="coach-tooltip-title">${s.title}</div>
          <div class="coach-tooltip-desc">${s.desc}</div>
          <div class="coach-tooltip-actions">
            ${currentStep > 0 ? '<button class="coach-btn coach-btn-ghost" id="tut-prev">이전</button>' : ''}
            <button class="coach-btn coach-btn-primary" id="tut-next">${isLast ? '시작하기!' : '다음'}</button>
          </div>
          <button class="coach-dismiss" id="tut-dismiss">건너뛰고 다시는 안보기</button>
        </div>
      </div>
    `;

    const tooltip = overlay.querySelector('.coach-tooltip');
    if (tooltip) tooltip.style.setProperty('--arrow-x', arrowX + 'px');

    document.getElementById('tut-next')?.addEventListener('click', () => {
      if (isLast) { closeTutorial(); } else { currentStep++; renderStep(); }
    });
    document.getElementById('tut-prev')?.addEventListener('click', () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    });
    document.getElementById('tut-dismiss')?.addEventListener('click', closeTutorial);
    document.getElementById('coach-backdrop')?.addEventListener('click', (e) => {
      if (e.target.closest('.coach-tooltip')) return;
      if (isLast) { closeTutorial(); } else { currentStep++; renderStep(); }
    });

    window.addEventListener('resize', () => {
      const el = s.target.split(',').map(sel => document.querySelector(sel.trim())).find(el => el && el.offsetHeight > 0);
      if (el && document.getElementById('coach-backdrop')) {
        _renderCoachOverlay(el, s, isLast);
      }
    }, { once: true });
  }

  function closeTutorial() {
    localStorage.setItem('tutorial_completed', '1');
    import('./data.js').then(m => m.recordTutorialDone());
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.classList.add('coach-fade-out');
      setTimeout(() => overlay.remove(), 250);
    }
    window.switchTab('home');
  }

  function startWhenReady() {
    setTimeout(renderStep, 600);
  }
  startWhenReady();
  return true;
}
