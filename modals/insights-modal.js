// Scene 13 — 인사이트 (이번 주 + 오늘 통합)
// 2026-04-19: '이번주 인사이트' + '오늘의 인사이트' 통합 + AI 공유 버튼 추가.
//   - 이번주 섹션: 부위별 자극 균형 heatmap, 주요 종목 추세, 주간 PR
//   - 오늘 섹션: 오늘 부위별 세트/볼륨, 오늘 자극 균형, 최근 3일 식단 요약
//   - 하단 AI 공유 버튼: Gemini/ChatGPT/Claude — 클립보드 복사 + AI 웹/앱 열기
// 2026-04-20: 공유 본문을 요약(summary)/상세(detail) 두 모드로 분리.
//   상세 모드는 오늘 세션 raw 세트 로그 + JSON을 포함 → AI가 재추상화 없이 바로 피드백.
//   모드 세그먼트는 window.insightsShareMode 전역 상태로 유지 (버튼 핸들러에서 참조).
export const MODAL_HTML = `
<div class="modal-overlay insights-overlay" id="insights-modal" onclick="if(event.target===this) insightsClose()">
  <div class="modal-sheet insights-sheet">
    <div class="expert-onb-topbar">
      <button class="topbar-back" onclick="insightsClose()">‹</button>
      <div class="topbar-title">인사이트</div>
      <div class="topbar-skip" id="insights-range"></div>
    </div>
    <div class="expert-onb-content" id="insights-content"></div>
    <div class="insights-ai-share" id="insights-ai-share">
      <div class="ai-share-label">AI에게 물어보기</div>
      <div class="ai-share-mode-seg" id="ai-share-mode-seg" role="tablist">
        <button type="button" class="ai-share-mode-btn on" data-mode="summary"
          role="tab" onclick="insightsSetShareMode('summary')">요약</button>
        <button type="button" class="ai-share-mode-btn" data-mode="detail"
          role="tab" onclick="insightsSetShareMode('detail')">상세 (세션 raw)</button>
      </div>
      <div class="ai-share-mode-hint" id="ai-share-mode-hint">
        주간 상위 부위 · PR · 최근 식단을 짧게 요약합니다.
      </div>
      <div class="ai-share-row">
        <button type="button" class="ai-share-btn" onclick="insightsShareToAI('gemini', window.insightsShareMode || 'summary')">
          <span class="ai-share-icon">✦</span>
          <span class="ai-share-name">Gemini</span>
        </button>
        <button type="button" class="ai-share-btn" onclick="insightsShareToAI('chatgpt', window.insightsShareMode || 'summary')">
          <span class="ai-share-icon">◉</span>
          <span class="ai-share-name">ChatGPT</span>
        </button>
        <button type="button" class="ai-share-btn" onclick="insightsShareToAI('claude', window.insightsShareMode || 'summary')">
          <span class="ai-share-icon">✧</span>
          <span class="ai-share-name">Claude</span>
        </button>
        <button type="button" class="ai-share-btn" onclick="insightsCopyToClipboard(window.insightsShareMode || 'summary')">
          <span class="ai-share-icon">📋</span>
          <span class="ai-share-name">복사</span>
        </button>
      </div>
    </div>
    <div class="bottom-cta">
      <button class="btn btn-primary" onclick="insightsClose()">확인</button>
    </div>
  </div>
</div>
`;
