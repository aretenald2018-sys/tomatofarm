export const MODAL_HTML = `
<div class="modal-backdrop" id="diet-plan-modal" onclick="closeDietPlanModal(event)">
  <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
    <div class="sheet-handle"></div>
    <div class="modal-title" style="font-size:17px;font-weight:700;">다이어트 플랜 설정</div>
    <div style="display:flex;align-items:flex-start;gap:8px;padding:0 4px 14px;margin-bottom:2px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <span style="font-size:12px;color:var(--text-secondary);line-height:1.5;">입력하신 신체 정보는 <b style="color:var(--primary);">본인만 볼 수 있어요.</b> 이웃에게는 목표 달성률(%)만 보여요.</span>
    </div>
    <div class="ex-editor-form">
      <div class="diet-plan-section-title">신체 정보</div>
      <div class="diet-plan-row">
        <div><div class="ex-editor-label">신장 (cm)</div><input class="ex-editor-input" id="dp-height" type="number" placeholder="입력"></div>
        <div><div class="ex-editor-label">연령 (세)</div><input class="ex-editor-input" id="dp-age" type="number" placeholder="입력"></div>
      </div>
      <div class="diet-plan-row">
        <div><div class="ex-editor-label">현재 체중 (kg)</div><input class="ex-editor-input" id="dp-weight" type="number" step="0.1" placeholder="입력"></div>
        <div><div class="ex-editor-label">체지방률 (%)</div><input class="ex-editor-input" id="dp-bodyfat" type="number" step="0.1" placeholder="입력"></div>
      </div>

      <div class="diet-plan-section-title" style="margin-top:14px">목표 설정</div>
      <div class="diet-plan-row">
        <div><div class="ex-editor-label">목표 체중 (kg)</div><input class="ex-editor-input" id="dp-target-weight" type="number" step="0.1" placeholder="입력"></div>
        <div><div class="ex-editor-label">목표 체지방률 (%)</div><input class="ex-editor-input" id="dp-target-bf" type="number" step="0.1" placeholder="입력"></div>
      </div>
      <div><div class="ex-editor-label">플랜 시작일</div><input class="ex-editor-input" id="dp-start-date" type="date"></div>

      <div class="diet-calc-preview" id="dp-calc-preview"></div>

      <!-- ── 고급 모드 ── -->
      <div class="dp-advanced-toggle" id="dp-advanced-toggle">
        <div class="dp-advanced-toggle-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--seed-fg-subtle)" stroke-width="2" stroke-linecap="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          <div>
            <span class="dp-advanced-toggle-title">고급 모드</span>
            <span class="dp-advanced-toggle-desc">감량 속도, 리피드, 매크로 비율, 활동계수 등</span>
          </div>
        </div>
        <button class="toggle-switch" id="dp-advanced-switch" type="button">
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="dp-advanced-body" id="dp-advanced-body" style="display:none">
        <!-- 감량 속도 & 활동 계수 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">감량 속도 및 활동 계수</div>
          <div class="diet-plan-row">
            <div>
              <div class="ex-editor-label">주당 감량 속도 <span style="color:var(--muted);font-size:10px">(권장: 0.007~0.010)</span></div>
              <input class="ex-editor-input" id="dp-loss-rate" type="number" step="0.001" min="0.003" max="0.015" placeholder="0.009">
            </div>
            <div>
              <div class="ex-editor-label">활동 계수</div>
              <input class="ex-editor-input" id="dp-activity-adv" type="number" step="0.05" min="1.1" max="2.0" placeholder="1.3">
            </div>
          </div>
          <div class="dp-adv-hint" style="margin-top:6px">활동 계수: 좌식 1.2 / 가벼운 활동 1.375 / 보통 1.55 / 활발 1.725</div>
        </div>

        <!-- 리피드 설정 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">리피드(Refeed) 설정</div>
          <div>
            <div class="ex-editor-label">리피드 칼로리 <span style="color:var(--muted);font-size:10px">(이틀 합계, 권장: 5000kcal)</span></div>
            <input class="ex-editor-input" id="dp-refeed-kcal" type="number" step="100" placeholder="5000">
          </div>
          <div style="margin-top:8px">
            <div class="ex-editor-label">리피드 요일 <span style="color:var(--muted);font-size:10px">(복수 선택 가능)</span></div>
            <div class="refeed-day-btns" id="dp-refeed-days">
              <button class="refeed-day-btn" data-dow="1">월</button>
              <button class="refeed-day-btn" data-dow="2">화</button>
              <button class="refeed-day-btn" data-dow="3">수</button>
              <button class="refeed-day-btn" data-dow="4">목</button>
              <button class="refeed-day-btn" data-dow="5">금</button>
              <button class="refeed-day-btn" data-dow="6">토</button>
              <button class="refeed-day-btn" data-dow="0">일</button>
            </div>
          </div>
        </div>

        <!-- 데피싯 데이 매크로 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">데피싯 데이 매크로 비율</div>
          <div class="dp-adv-hint">단백질 + 탄수화물 + 지방 = 100%</div>
          <div class="dp-adv-macro-row">
            <div class="dp-adv-macro-item">
              <label>단백질</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-def-protein" type="number" min="0" max="100" placeholder="41"><span class="dp-adv-unit">%</span></div>
            </div>
            <div class="dp-adv-macro-item">
              <label>탄수화물</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-def-carb" type="number" min="0" max="100" placeholder="50"><span class="dp-adv-unit">%</span></div>
            </div>
            <div class="dp-adv-macro-item">
              <label>지방</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-def-fat" type="number" min="0" max="100" placeholder="9"><span class="dp-adv-unit">%</span></div>
            </div>
          </div>
          <div class="dp-adv-macro-sum" id="dp-def-macro-sum"></div>
        </div>

        <!-- 리피드 데이 매크로 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">리피드 데이 매크로 비율</div>
          <div class="dp-adv-macro-row">
            <div class="dp-adv-macro-item">
              <label>단백질</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ref-protein" type="number" min="0" max="100" placeholder="29"><span class="dp-adv-unit">%</span></div>
            </div>
            <div class="dp-adv-macro-item">
              <label>탄수화물</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ref-carb" type="number" min="0" max="100" placeholder="60"><span class="dp-adv-unit">%</span></div>
            </div>
            <div class="dp-adv-macro-item">
              <label>지방</label>
              <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ref-fat" type="number" min="0" max="100" placeholder="11"><span class="dp-adv-unit">%</span></div>
            </div>
          </div>
          <div class="dp-adv-macro-sum" id="dp-ref-macro-sum"></div>
        </div>

        <!-- 허용 오차 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">식단 판정 허용 오차</div>
          <div class="dp-adv-hint">목표 칼로리를 이만큼 초과해도 '달성'으로 인정</div>
          <div class="dp-adv-input-wrap" style="max-width:140px"><input class="ex-editor-input" id="dp-tolerance" type="number" min="0" max="500" step="10" placeholder="50"><span class="dp-adv-unit">kcal</span></div>
        </div>

        <!-- 운동 칼로리 크레딧 -->
        <div class="dp-adv-section">
          <div class="dp-adv-section-title">운동 칼로리 크레딧</div>
          <div class="dp-adv-hint">그날 한 운동의 소모 칼로리만큼 허용 칼로리를 늘립니다</div>
          <div class="dp-exercise-credit-toggle">
            <span style="font-size:13px;color:var(--text-secondary)">운동 칼로리 반영</span>
            <button class="toggle-switch" id="dp-exercise-credit-switch" type="button">
              <span class="toggle-knob"></span>
            </button>
          </div>
          <div id="dp-exercise-credit-body" style="display:none">
            <div class="dp-adv-hint" style="margin-top:8px">운동 유형별 소모 칼로리를 설정하세요</div>
            <div class="dp-exercise-kcal-grid">
              <div class="dp-exercise-kcal-item">
                <span class="dp-exercise-kcal-label">🏋️ 헬스</span>
                <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ex-gym" type="number" min="0" max="1000" step="10" placeholder="250"><span class="dp-adv-unit">kcal</span></div>
              </div>
              <div class="dp-exercise-kcal-item">
                <span class="dp-exercise-kcal-label">🔥 크로스핏</span>
                <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ex-cf" type="number" min="0" max="1000" step="10" placeholder="300"><span class="dp-adv-unit">kcal</span></div>
              </div>
              <div class="dp-exercise-kcal-item">
                <span class="dp-exercise-kcal-label">🏊 수영</span>
                <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ex-swim" type="number" min="0" max="1000" step="10" placeholder="200"><span class="dp-adv-unit">kcal</span></div>
              </div>
              <div class="dp-exercise-kcal-item">
                <span class="dp-exercise-kcal-label">🏃 러닝</span>
                <div class="dp-adv-input-wrap"><input class="ex-editor-input" id="dp-ex-run" type="number" min="0" max="1000" step="10" placeholder="250"><span class="dp-adv-unit">kcal</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="ex-editor-actions">
        <button class="tds-btn cancel-btn ghost md" onclick="closeDietPlanModal()">취소</button>
        <button class="tds-btn fill md" onclick="saveDietPlanFromModal()">플랜 저장</button>
      </div>
    </div>
  </div>
</div>
`;
