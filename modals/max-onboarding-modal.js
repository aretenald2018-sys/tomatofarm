// ================================================================
// max-onboarding-modal.js
// 맥스 모드 미니 온보딩 (3 scene: 목표 / 주당일수+세션분 / 선호 RPE)
// ----------------------------------------------------------------
// step 진행/state 는 workout/expert/max.js의 _maxObState가 소유.
// 이 파일은 HTML 템플릿만 export. 내부 #max-ob-body 가 step별로 갱신됨.
// ================================================================

export const MODAL_HTML = `
<div class="modal-overlay wt-max-ob-back-overlay" id="max-onboarding-modal" onclick="if(event.target===this) closeMaxMiniOnboarding()">
  <div class="modal-sheet wt-max-ob-sheet">
    <div class="wt-max-ob-topbar">
      <div class="wt-max-ob-topbar-title">⚡ 테스트 모드 시작</div>
      <button type="button" class="wt-max-ob-close" data-close-max-ob aria-label="닫기">×</button>
    </div>
    <div class="wt-max-ob-content" id="max-ob-body">
      <!-- step 1~3 동적 렌더 (workout/expert/max.js _renderMaxOb) -->
    </div>
  </div>
</div>
`;
