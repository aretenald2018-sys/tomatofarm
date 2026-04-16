// ================================================================
// expert-onboarding-modal.js
// Scene 02~08 — 전문가 모드 5단계 온보딩 wizard (단일 모달)
// ----------------------------------------------------------------
// step 진행 로직은 workout/expert.js가 소유. 이 파일은 HTML 템플릿만 export.
// ================================================================

export const MODAL_HTML = `
<div class="modal-overlay expert-onb-overlay" id="expert-onboarding-modal" onclick="if(event.target===this) expertOnbClose()">
  <div class="modal-sheet expert-onb-sheet">
    <div class="expert-onb-topbar">
      <button class="topbar-back" id="expert-onb-back" onclick="expertOnbBack()">‹</button>
      <div class="topbar-title" id="expert-onb-title">맞춤 루틴 모드</div>
      <button class="topbar-skip" id="expert-onb-skip" onclick="expertOnbSkip()">나중에</button>
    </div>
    <div class="stepper" id="expert-onb-stepper">
      <div class="stepper-dot"></div>
      <div class="stepper-dot"></div>
      <div class="stepper-dot"></div>
      <div class="stepper-dot"></div>
      <div class="stepper-dot"></div>
    </div>
    <div class="expert-onb-content" id="expert-onb-content">
      <!-- 동적으로 렌더됨 -->
    </div>
    <div class="bottom-cta" id="expert-onb-cta">
      <button class="btn btn-primary" id="expert-onb-next" onclick="expertOnbNext()">다음</button>
      <button class="btn btn-ghost" id="expert-onb-ghost" style="display:none"></button>
    </div>
  </div>
</div>
`;
