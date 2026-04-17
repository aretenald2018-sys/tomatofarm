// ═════════════════════════════════════════════════════════════
// 상태 관리 (파일 전역)
// ═════════════════════════════════════════════════════════════

let _niEditingId = null;
let _niCurrentTab = 'manual';
let _niPhotoBase64 = null;
let _niParsedData = null;
let _niConfidence = null;  // OCR 신뢰도

export const MODAL_HTML = `
<div class="modal-backdrop" id="nutrition-item-modal" onclick="closeNutritionItemModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title" id="nutrition-item-title" style="font-size:17px;font-weight:700;">음식 정보 등록</div>

    <!-- 탭: 수기입력 / 사진인식 / 텍스트파싱 -->
    <div class="ni-tabs">
      <button class="ni-tab-btn active" id="ni-tab-manual" data-tab="manual">수기입력</button>
      <button class="ni-tab-btn" id="ni-tab-photo" data-tab="photo">사진인식</button>
      <button class="ni-tab-btn" id="ni-tab-text" data-tab="text">텍스트파싱</button>
    </div>

    <!-- ═══ TAB 1: 수기 입력 ═══ -->
    <div class="ni-tab-content active" id="ni-tab-content-manual">
      <div class="ex-editor-form">
        <div><div class="ex-editor-label">음식 이름 * <span id="ni-name-confidence" style="font-size:11px;color:var(--muted)"></span></div><input class="ex-editor-input" id="ni-name" placeholder="예: 닭가슴살 구이"></div>
        <div><div class="ex-editor-label">검색 별칭</div><input class="ex-editor-input" id="ni-aliases" placeholder="예: 무바, 노 슈가 콘 (쉼표로 구분)"></div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">기준 단위</div><input class="ex-editor-input" id="ni-unit" placeholder="예: 100g, 1개, 1공기"></div>
          <div><div class="ex-editor-label">칼로리 (kcal) <span id="ni-kcal-confidence" style="font-size:11px;color:var(--muted)"></span></div><input class="ex-editor-input" id="ni-kcal" type="number" placeholder="165"></div>
        </div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">탄수화물 (g) <span id="ni-carbs-confidence" style="font-size:11px;color:var(--muted)"></span></div><input class="ex-editor-input" id="ni-carbs" type="number" step="0.1" placeholder="0"></div>
          <div><div class="ex-editor-label">단백질 (g) <span id="ni-protein-confidence" style="font-size:11px;color:var(--muted)"></span></div><input class="ex-editor-input" id="ni-protein" type="number" step="0.1" placeholder="31"></div>
        </div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">지방 (g) <span id="ni-fat-confidence" style="font-size:11px;color:var(--muted)"></span></div><input class="ex-editor-input" id="ni-fat" type="number" step="0.1" placeholder="3.6"></div>
          <div><div class="ex-editor-label">메모</div><input class="ex-editor-input" id="ni-note" placeholder="선택 사항"></div>
        </div>
      </div>
    </div>

    <!-- ═══ TAB 2: 사진 인식 ═══ -->
    <div class="ni-tab-content" id="ni-tab-content-photo">
      <div class="ex-editor-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div class="ni-upload-zone" style="padding:20px 12px;cursor:pointer" onclick="document.getElementById('ni-photo-input').click()">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
            <div style="font-weight:600;font-size:13px;color:var(--text);margin-top:6px">갤러리</div>
            <div style="font-size:11px;color:var(--text-tertiary)">저장된 사진</div>
            <input type="file" id="ni-photo-input" accept="image/*" style="display:none" onchange="handleNutritionPhotoSelect(event)">
          </div>
          <div class="ni-upload-zone" style="padding:20px 12px;cursor:pointer" onclick="document.getElementById('ni-camera-input').click()">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <div style="font-weight:600;font-size:13px;color:var(--text);margin-top:6px">카메라</div>
            <div style="font-size:11px;color:var(--text-tertiary)">지금 촬영</div>
            <input type="file" id="ni-camera-input" accept="image/*;capture=environment" style="display:none" onchange="handleNutritionPhotoSelect(event)">
          </div>
        </div>
        <div id="ni-photo-preview" style="display:none;margin-top:12px">
          <img id="ni-photo-img" style="max-width:100%;max-height:200px;border-radius:8px;margin-bottom:8px">
          <button class="tds-btn cancel-btn ghost md" onclick="clearNutritionPhoto()" style="width:100%">사진 변경</button>
        </div>
        <div id="ni-photo-analyzing" style="display:none;text-align:center;padding:20px;color:var(--muted)">
          <div style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px;"></div>
          <div>OCR 분석 중...</div>
        </div>
        <div id="ni-photo-result" style="display:none;border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:12px;background:var(--bg-secondary)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
            신뢰도: <span id="ni-photo-confidence">85%</span>
          </div>
          <div id="ni-photo-extracted"></div>
        </div>
      </div>
    </div>

    <!-- ═══ TAB 3: 텍스트 파싱 ═══ -->
    <div class="ni-tab-content" id="ni-tab-content-text">
      <div class="ex-editor-form">
        <div><div class="ex-editor-label">영양성분표 텍스트 *</div></div>
        <textarea class="ex-editor-input" id="ni-raw-text" style="min-height:150px;font-size:12px;font-family:monospace" placeholder="다른 곳에서 복사한 영양정보를 붙여넣으세요.
예시:
칼로리 165kcal
단백질 31g
탄수화물 0.4g
지방 3.6g"></textarea>
        <button style="width:100%;margin-top:8px;padding:10px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;" onclick="analyzeNutritionText()">분석하기</button>

        <div id="ni-text-analyzing" style="display:none;text-align:center;padding:20px;color:var(--muted)">
          <div style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px;"></div>
          <div>텍스트 분석 중...</div>
        </div>
        <div id="ni-text-result" style="display:none;border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:12px;background:var(--bg-secondary)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
            신뢰도: <span id="ni-text-confidence">85%</span> | 감지언어: <span id="ni-text-language">한국어</span>
          </div>
          <div id="ni-text-extracted"></div>
        </div>
      </div>
    </div>

    <!-- 공통 저장/취소 버튼 -->
    <div class="ex-editor-actions">
      <button class="tds-btn cancel-btn ghost md" id="ni-delete-btn" onclick="deleteNutritionItemFromModal()" style="display:none;color:var(--diet-bad)">삭제</button>
      <button class="tds-btn cancel-btn ghost md" onclick="closeNutritionItemModal()">취소</button>
      <button class="tds-btn fill md" onclick="saveNutritionItemFromModal()">저장하기</button>
    </div>
  </div>
</div>

<style>
@keyframes spin { to { transform: rotate(360deg); } }

.ni-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding: 0 12px;
}

.ni-tab-btn {
  flex: 1;
  padding: 12px 8px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.ni-tab-btn:active { opacity: 0.7; }

.ni-tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 700;
}

@media (max-width: 480px) {
  .ni-tabs {
    gap: 2px;
    padding: 0 4px;
  }

  .ni-tab-btn {
    padding: 12px 4px;
    font-size: 11px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.ni-tab-content {
  display: none;
  padding: 12px;
}

.ni-tab-content.active {
  display: block;
}

.ni-upload-zone {
  border: 1.5px dashed var(--border);
  border-radius: 12px;
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--surface2);
}

.ni-upload-zone:hover, .ni-upload-zone:active {
  border-color: var(--primary);
  background: rgba(49,130,246,0.04);
}

.ni-upload-zone.dragover {
  border-color: var(--primary);
  background: rgba(49,130,246,0.06);
}

@media (max-width: 480px) {
  .ni-upload-zone {
    padding: 16px 12px;
  }
}

#ni-photo-preview {
  text-align: center;
}
</style>
`;

// ═════════════════════════════════════════════════════════════
// 공개 API
// ═════════════════════════════════════════════════════════════

export async function openNutritionItemEditor(id) {
  _niEditingId = id || null;
  _niCurrentTab = 'manual';
  _niPhotoBase64 = null;
  _niParsedData = null;

  const modal = document.getElementById('nutrition-item-modal');
  const titleEl = document.getElementById('nutrition-item-title');

  // 탭 리셋
  document.querySelectorAll('.ni-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ni-tab-manual').classList.add('active');
  document.querySelectorAll('.ni-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('ni-tab-content-manual').classList.add('active');

  // 탭 버튼 클릭 이벤트 리스너 (event delegation)
  const tabsContainer = document.querySelector('.ni-tabs');
  if (tabsContainer && !tabsContainer._niTabsInitialized) {
    tabsContainer._niTabsInitialized = true;
    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.ni-tab-btn');
      if (btn) {
        e.stopPropagation();
        const tab = btn.dataset.tab;
        if (tab) switchNutritionTab(tab);
      }
    }, false);
  }

  if (id) {
    // 기존 아이템 수정
    const { getNutritionDB } = await import('../data.js');
    const item = getNutritionDB().find(n => n.id === id);
    if (!item) return;

    titleEl.textContent = '🍽️ 음식 정보 수정';
    _populateNutritionForm(item);
    document.getElementById('ni-delete-btn').style.display = 'block';
  } else {
    // 새로운 아이템 추가
    titleEl.textContent = '🍽️ 음식 정보 등록';
    _clearNutritionForm();
    document.getElementById('ni-delete-btn').style.display = 'none';
  }

  modal.classList.add('open');
}

export function closeNutritionItemModal(e) {
  if (e && e.target !== document.getElementById('nutrition-item-modal')) return;
  document.getElementById('nutrition-item-modal').classList.remove('open');
}

// ═════════════════════════════════════════════════════════════
// 탭 전환
// ═════════════════════════════════════════════════════════════

export function switchNutritionTab(tab) {
  _niCurrentTab = tab;

  // 버튼 활성화
  document.querySelectorAll('.ni-tab-btn').forEach(b => b.classList.remove('active'));
  const tabBtn = document.getElementById(`ni-tab-${tab}`);
  if (tabBtn) tabBtn.classList.add('active');

  // 콘텐츠 표시
  document.querySelectorAll('.ni-tab-content').forEach(c => c.classList.remove('active'));
  const tabContent = document.getElementById(`ni-tab-content-${tab}`);
  if (tabContent) tabContent.classList.add('active');
}

// ═════════════════════════════════════════════════════════════
// 사진 업로드 & OCR
// ═════════════════════════════════════════════════════════════

async function _resizeImageToBase64(file, maxEdge = 1920, quality = 0.85) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
  return jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

export async function handleNutritionPhotoSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // 업로드 존 비활성화 (연타 방지)
  const uploadZones = document.querySelectorAll('.ni-tab-content.active .ni-upload-zone');
  uploadZones.forEach(zone => {
    zone.style.pointerEvents = 'none';
    zone.style.opacity = '0.5';
  });

  // 1단계: 업로드 중
  window.showToast?.('📷 사진 압축 중...', 1500, 'info');

  try {
    // 리사이즈 + Base64 변환 (긴 변 1280px, JPEG 0.75)
    _niPhotoBase64 = await _resizeImageToBase64(file);

    // 미리보기 표시
    const preview = document.getElementById('ni-photo-preview');
    const img = document.getElementById('ni-photo-img');
    img.src = `data:image/jpeg;base64,${_niPhotoBase64}`;
    preview.style.display = 'block';

    // 갤러리/카메라 버튼 숨기기
    uploadZones.forEach(zone => {
      if (zone.parentElement) zone.parentElement.style.display = 'none';
    });

    // 2단계: OCR 분석 시작 (내부에서 토스트)
    window.showToast?.('🔍 영양정보 분석 중...', 2500, 'info');
    _analyzeNutritionPhoto();
  } catch (e) {
    // 실패 시 업로드 존 복구
    uploadZones.forEach(zone => {
      zone.style.pointerEvents = '';
      zone.style.opacity = '';
    });
    window.showToast?.('사진 업로드 실패: ' + e.message, 3500, 'error');
  }
}

export function clearNutritionPhoto() {
  _niPhotoBase64 = null;
  _niParsedData = null;
  document.getElementById('ni-photo-input').value = '';
  document.getElementById('ni-camera-input').value = '';
  document.getElementById('ni-photo-preview').style.display = 'none';

  // 갤러리/카메라 버튼 영역 다시 표시
  const uploadZone = document.querySelector('.ni-tab-content.active .ni-upload-zone:first-of-type');
  if (uploadZone) {
    uploadZone.parentElement.style.display = 'grid';
  }

  document.getElementById('ni-photo-result').style.display = 'none';
}

let _niMultipleItems = null; // 복수 제품 감지 시 아이템 배열
let _ocrFallbackWarned = false; // Vision 쿼터 초과 → Gemini 전환 안내는 세션당 1회
let _photoAnalyzeToken = 0; // 연속 업로드 시 stale 응답 차단용

async function _analyzeNutritionPhoto() {
  if (!_niPhotoBase64) return;

  // 이 분석 사이클의 고유 토큰. 응답 수신 후 최신 토큰과 비교해 stale이면 폐기.
  const myToken = ++_photoAnalyzeToken;
  const snapshotBase64 = _niPhotoBase64;

  const analyzing = document.getElementById('ni-photo-analyzing');
  const result = document.getElementById('ni-photo-result');

  analyzing.style.display = 'block';
  result.style.display = 'none';
  _niMultipleItems = null;

  try {
    const { ocrImage, parseNutritionFromText, parseNutritionFromImage } = await import('../ai.js');

    let parsed = null;
    let useDirectGemini = false;

    // 1) Cloud Vision OCR 우선 시도
    try {
      const ocrText = await ocrImage(snapshotBase64);
      if (ocrText && ocrText.trim().length >= 20) {
        parsed = await parseNutritionFromText(ocrText);
      } else {
        useDirectGemini = true;
      }
    } catch (err) {
      const code = err?.code || err?.details?.code || '';
      const msg  = err?.message || '';
      if (code === 'functions/resource-exhausted' || /monthly-ocr-quota/.test(msg)) {
        if (!_ocrFallbackWarned && window.showToast) {
          window.showToast('이번 달 OCR 무료 한도 소진 — AI 이미지 인식으로 전환', 3000, 'info');
          _ocrFallbackWarned = true;
        }
      } else {
        console.warn('[OCR] Vision 실패, Gemini로 fallback:', msg || err);
      }
      useDirectGemini = true;
    }

    // 토큰 검증 — 도중에 사용자가 사진을 바꾸거나 지웠으면 여기서 중단
    if (myToken !== _photoAnalyzeToken) return;

    // 2) Vision 경로가 실패/빈응답이면 Gemini 이미지 파서 fallback
    if (useDirectGemini || !parsed) {
      parsed = await parseNutritionFromImage(snapshotBase64, 'ko');
    }

    // 응답 도착 후 최종 토큰 검증
    if (myToken !== _photoAnalyzeToken) return;

    if (parsed?.multiple && Array.isArray(parsed.items) && parsed.items.length > 1) {
      _niMultipleItems = parsed.items;
      _niParsedData = parsed.items[0];
      _displayMultipleResults(parsed.items);
    } else {
      _niParsedData = parsed?.multiple ? parsed.items[0] : parsed;
      _displayNutritionResult(_niParsedData);
      _populateNutritionForm(_niParsedData);
      setTimeout(() => { switchNutritionTab('manual'); }, 300);
    }
    // 3단계: 완료
    window.showToast?.('✓ 분석 완료', 1800, 'success');
  } catch (e) {
    if (myToken !== _photoAnalyzeToken) return;
    console.error('OCR 분석 실패:', e);
    window.showToast?.('사진 분석 실패: ' + e.message, 3000, 'error');
  } finally {
    if (myToken === _photoAnalyzeToken) analyzing.style.display = 'none';
    // 업로드 존 복구 (재업로드 가능하게)
    document.querySelectorAll('.ni-tab-content.active .ni-upload-zone').forEach(zone => {
      zone.style.pointerEvents = '';
      zone.style.opacity = '';
    });
  }
}

// ═════════════════════════════════════════════════════════════
// 텍스트 파싱
// ═════════════════════════════════════════════════════════════

export async function analyzeNutritionText() {
  const rawText = document.getElementById('ni-raw-text').value.trim();
  if (!rawText) {
    window.showToast?.('텍스트를 입력해주세요', 2500, 'warning');
    return;
  }

  const analyzing = document.getElementById('ni-text-analyzing');
  const result = document.getElementById('ni-text-result');

  analyzing.style.display = 'block';
  result.style.display = 'none';
  _niMultipleItems = null;

  try {
    const { parseNutritionFromText } = await import('../ai.js');

    // 텍스트 파싱 (복수 항목 지원) — language는 응답에 포함됨
    const parsed = await parseNutritionFromText(rawText);
    const langResult = parsed?.language
      ? { language: parsed.language, confidence: parsed.confidence || 0.9 }
      : (parsed?.items?.[0]?.language
          ? { language: parsed.items[0].language, confidence: parsed.items[0].confidence || 0.9 }
          : null);

    if (parsed.multiple && Array.isArray(parsed.items) && parsed.items.length > 1) {
      // ── 복수 항목 감지 ──
      parsed.items.forEach(it => {
        it.rawText = rawText;
      });
      _niMultipleItems = parsed.items;
      _niParsedData = parsed.items[0];
      _displayMultipleTextResults(parsed.items, langResult);
    } else {
      // ── 단일 항목 ──
      _niParsedData = parsed.multiple ? parsed.items[0] : parsed;
      _niParsedData.rawText = rawText;

      // 결과 표시
      _displayNutritionTextResult(_niParsedData, langResult);

      // 폼에 자동 채우기
      _populateNutritionForm(_niParsedData);
    }
  } catch (e) {
    console.error('텍스트 분석 실패:', e);
    window.showToast?.('텍스트 분석 실패: ' + e.message, 3500, 'error');
  } finally {
    analyzing.style.display = 'none';
  }
}

// ═════════════════════════════════════════════════════════════
// 저장 & 삭제
// ═════════════════════════════════════════════════════════════

export async function saveNutritionItemFromModal() {
  const name = document.getElementById('ni-name').value.trim();
  if (!name) {
    window.showToast?.('음식 이름을 입력해주세요', 2500, 'warning');
    return;
  }

  const item = {
    id: _niEditingId,
    name: name,
    aliases: document.getElementById('ni-aliases').value
      .split(/[,\n/]/)
      .map(v => v.trim())
      .filter(Boolean),
    unit: document.getElementById('ni-unit').value.trim() || '100g',
    servingSize: parseFloat(document.getElementById('ni-unit').value.match(/[\d.]+/)?.[0] || 100),
    servingUnit: 'g',
    nutrition: {
      kcal: parseFloat(document.getElementById('ni-kcal').value || 0),
      protein: parseFloat(document.getElementById('ni-protein').value || 0),
      carbs: parseFloat(document.getElementById('ni-carbs').value || 0),
      fat: parseFloat(document.getElementById('ni-fat').value || 0),
      fiber: 0,
      sugar: 0,
      sodium: 0,
    },
    notes: document.getElementById('ni-note').value.trim(),
    source: _niCurrentTab === 'manual' ? 'manual' : (_niCurrentTab === 'photo' ? 'ocr' : 'text'),
    language: _niParsedData?.language || 'ko',
    confidence: _niParsedData?.confidence || (name ? 1.0 : 0),
    photoUrl: null,
    rawText: _niCurrentTab === 'text' ? document.getElementById('ni-raw-text').value : null,
  };

  try {
    const { saveNutritionItem } = await import('../data.js');
    const savedItem = await saveNutritionItem(item);
    window.showToast?.('저장 완료', 2500, 'success');
    closeNutritionItemModal();

    // 콜백: 직접 추가 후 자동으로 해당 항목 선택 (요리 재료 / 식단 등)
    if (window._onNutritionItemSaved) {
      window._onNutritionItemSaved(savedItem);
    }

    // 저장 후 검색 결과 업데이트 (새로운 데이터 즉시 반영)
    if (window.renderNutritionSearchResults) {
      setTimeout(() => {
        window.renderNutritionSearchResults();
        if (window._renderNutritionDBList) {
          window._renderNutritionDBList();
        }
      }, 100);
    }
  } catch (e) {
    window.showToast?.('저장 실패: ' + e.message, 3500, 'error');
  }
}

export async function deleteNutritionItemFromModal() {
  if (!_niEditingId) return;
  const ok = await (window.confirmAction?.({
    title: '이 음식을 삭제할까요?',
    message: '음식 DB에서 제거돼요.\n과거 기록에는 영향 없어요.',
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
  }) || Promise.resolve(false));
  if (!ok) return;

  try {
    const { deleteNutritionItem } = await import('../data.js');
    await deleteNutritionItem(_niEditingId);
    window.showToast?.('삭제 완료', 2500, 'success');
    closeNutritionItemModal();
  } catch (e) {
    window.showToast?.('삭제 실패: ' + e.message, 3500, 'error');
  }
}

// ═════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═════════════════════════════════════════════════════════════

function _populateNutritionForm(data) {
  _niConfidence = data.confidence || 0.8;
  const confidencePct = Math.round(_niConfidence * 100);

  document.getElementById('ni-name').value = data.name || '';
  document.getElementById('ni-aliases').value = Array.isArray(data.aliases) ? data.aliases.join(', ') : '';
  document.getElementById('ni-unit').value = data.unit || '100g';
  document.getElementById('ni-kcal').value = data.nutrition?.kcal || '';
  document.getElementById('ni-carbs').value = data.nutrition?.carbs || '';
  document.getElementById('ni-protein').value = data.nutrition?.protein || '';
  document.getElementById('ni-fat').value = data.nutrition?.fat || '';
  document.getElementById('ni-note').value = data.notes || '';

  // 신뢰도 표시 (OCR 분석일 때만)
  if (_niCurrentTab === 'photo' || _niCurrentTab === 'text') {
    const confText = `(신뢰도 ${confidencePct}%)`;
    document.getElementById('ni-name-confidence').textContent = confText;
    document.getElementById('ni-kcal-confidence').textContent = confText;
    document.getElementById('ni-carbs-confidence').textContent = confText;
    document.getElementById('ni-protein-confidence').textContent = confText;
    document.getElementById('ni-fat-confidence').textContent = confText;
  } else {
    // 수기입력일 때는 신뢰도 숨기기
    document.getElementById('ni-name-confidence').textContent = '';
    document.getElementById('ni-kcal-confidence').textContent = '';
    document.getElementById('ni-carbs-confidence').textContent = '';
    document.getElementById('ni-protein-confidence').textContent = '';
    document.getElementById('ni-fat-confidence').textContent = '';
  }
}

function _clearNutritionForm() {
  document.getElementById('ni-name').value = '';
  document.getElementById('ni-aliases').value = '';
  document.getElementById('ni-unit').value = '100g';
  document.getElementById('ni-kcal').value = '';
  document.getElementById('ni-carbs').value = '';
  document.getElementById('ni-protein').value = '';
  document.getElementById('ni-fat').value = '';
  document.getElementById('ni-note').value = '';
}

function _displayNutritionResult(data) {
  const result = document.getElementById('ni-photo-result');
  const extracted = document.getElementById('ni-photo-extracted');

  result.style.display = 'block';
  document.getElementById('ni-photo-confidence').textContent = Math.round((data.confidence || 0.8) * 100) + '%';

  extracted.innerHTML = `
    <div style="margin-bottom:8px"><strong>${data.name || '음식명'}</strong> (${data.language === 'ja' ? '일본어' : data.language === 'en' ? '영어' : '한국어'})</div>
    <div style="font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px">
      <div>칼로리: <strong>${data.nutrition?.kcal || '?'} kcal</strong></div>
      <div>단백질: <strong>${data.nutrition?.protein || '?'} g</strong></div>
      <div>탄수화물: <strong>${data.nutrition?.carbs || '?'} g</strong></div>
      <div>지방: <strong>${data.nutrition?.fat || '?'} g</strong></div>
    </div>
  `;
}

function _displayNutritionTextResult(data, langResult) {
  const result = document.getElementById('ni-text-result');
  const extracted = document.getElementById('ni-text-extracted');

  result.style.display = 'block';
  document.getElementById('ni-text-confidence').textContent = Math.round((data.confidence || 0.8) * 100) + '%';

  const langMap = { ko: '한국어', ja: '일본어', en: '영어', other: '기타' };
  document.getElementById('ni-text-language').textContent = langMap[data.language] || '한국어';

  const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const safeName = String(data.name || '').replace(/"/g, '&quot;');

  extracted.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px">
      📋 파싱 결과 — 값 직접 수정 가능
    </div>
    <div class="ni-single-edit" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="margin-bottom:8px">
        <input id="ni-single-name" type="text" value="${safeName}" placeholder="제품명" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:13px;font-weight:600">
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px;color:var(--muted2)">
        <label>🔥 kcal<input id="ni-single-kcal" type="number" step="1" inputmode="decimal" value="${N(data.nutrition?.kcal)}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;text-align:right"></label>
        <label>🥩 단<input id="ni-single-protein" type="number" step="0.1" inputmode="decimal" value="${N(data.nutrition?.protein)}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;text-align:right"></label>
        <label>🍚 탄<input id="ni-single-carbs" type="number" step="0.1" inputmode="decimal" value="${N(data.nutrition?.carbs)}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;text-align:right"></label>
        <label>🧈 지<input id="ni-single-fat" type="number" step="0.1" inputmode="decimal" value="${N(data.nutrition?.fat)}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;text-align:right"></label>
      </div>
    </div>
    <button class="diet-db-btn" id="ni-single-save-btn" style="width:100%;padding:12px;font-size:13px;background:var(--gym-dim);border-color:var(--gym);color:var(--gym)">
      💾 저장
    </button>
  `;

  // 저장 버튼
  document.getElementById('ni-single-save-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('ni-single-name').value.trim();
    if (!name) {
      window.showToast?.('제품명을 입력해주세요', 2000, 'warning');
      return;
    }
    const btn = document.getElementById('ni-single-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      const { saveNutritionItem } = await import('../data.js');
      const entry = {
        id: null,
        name,
        unit: data.unit || '100g',
        servingSize: data.servingSize || 100,
        servingUnit: data.servingUnit || 'g',
        nutrition: {
          kcal: N(document.getElementById('ni-single-kcal').value),
          protein: N(document.getElementById('ni-single-protein').value),
          carbs: N(document.getElementById('ni-single-carbs').value),
          fat: N(document.getElementById('ni-single-fat').value),
          fiber: N(data.nutrition?.fiber),
          sugar: N(data.nutrition?.sugar),
          sodium: N(data.nutrition?.sodium),
        },
        notes: '텍스트 파싱 (단일)',
        source: 'text',
        language: data.language || 'ko',
        confidence: data.confidence || 0.8,
        photoUrl: null,
        rawText: data.rawText || null,
      };
      await saveNutritionItem(entry);
      window.showToast?.('저장 완료', 2500, 'success');
      closeNutritionItemModal();
      if (window.renderNutritionSearchResults) {
        setTimeout(() => {
          window.renderNutritionSearchResults();
          if (window._renderNutritionDBList) window._renderNutritionDBList();
        }, 100);
      }
    } catch (e) {
      window.showToast?.('저장 실패: ' + e.message, 3000, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
    }
  });
}

// ═════════════════════════════════════════════════════════════
// 복수 항목 텍스트 파싱 결과 표시
// ═════════════════════════════════════════════════════════════

function _displayMultipleTextResults(items, langResult) {
  const result = document.getElementById('ni-text-result');
  const extracted = document.getElementById('ni-text-extracted');

  result.style.display = 'block';
  document.getElementById('ni-text-confidence').textContent =
    items.map(it => Math.round((it.confidence || 0.8) * 100) + '%').join(' / ');

  const langMap = { ko: '한국어', ja: '일본어', en: '영어', other: '기타' };
  document.getElementById('ni-text-language').textContent = langMap[langResult?.language] || '한국어';

  _renderInlineGrid(items, extracted, { saveBtnId: 'ni-text-multi-save-all-btn', source: 'text' });
}

// ═════════════════════════════════════════════════════════════
// 복수 제품 처리 (OCR / 텍스트 공통)
// ═════════════════════════════════════════════════════════════

function _renderInlineGrid(items, extracted, { saveBtnId, source }) {
  const N = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const _input = (idx, field, value, step, placeholder) =>
    `<input class="ni-grid-input" data-idx="${idx}" data-field="${field}" type="number" step="${step}" inputmode="decimal" value="${value}" placeholder="${placeholder}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;text-align:right">`;

  extracted.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <span>📋 ${items.length}개 항목 — 값 직접 수정 가능</span>
      <span style="font-size:10px;color:var(--muted);font-weight:400">체크 해제 시 저장 제외</span>
    </div>
    ${items.map((item, i) => `
      <div class="ni-grid-row" data-idx="${i}" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input type="checkbox" class="ni-grid-skip" data-idx="${i}" checked style="width:18px;height:18px;flex-shrink:0;accent-color:var(--accent)">
          <input class="ni-grid-input" data-idx="${i}" data-field="name" type="text" value="${(item.name || '항목 ' + (i + 1)).replace(/"/g, '&quot;')}" placeholder="이름" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:13px;font-weight:600">
          <span style="font-size:10px;color:var(--muted);white-space:nowrap">${Math.round((item.confidence || 0.8) * 100)}%</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px;color:var(--muted2)">
          <label>🔥 kcal${_input(i, 'kcal', N(item.nutrition?.kcal), '1', '0')}</label>
          <label>🥩 단${_input(i, 'protein', N(item.nutrition?.protein), '0.1', '0')}</label>
          <label>🍚 탄${_input(i, 'carbs', N(item.nutrition?.carbs), '0.1', '0')}</label>
          <label>🧈 지${_input(i, 'fat', N(item.nutrition?.fat), '0.1', '0')}</label>
        </div>
      </div>
    `).join('')}
    <button class="diet-db-btn" id="${saveBtnId}" style="width:100%;padding:12px;font-size:13px;margin-top:8px;background:var(--gym-dim);border-color:var(--gym);color:var(--gym)">
      💾 체크된 항목 저장
    </button>
  `;

  // 값 변경 시 items 원본 배열 업데이트
  extracted.querySelectorAll('.ni-grid-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      const item = items[idx];
      if (!item) return;
      if (field === 'name') {
        item.name = inp.value;
      } else {
        item.nutrition = item.nutrition || {};
        item.nutrition[field] = Number(inp.value) || 0;
      }
    });
  });

  // 체크박스: 저장 제외 토글
  extracted.querySelectorAll('.ni-grid-skip').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx);
      if (items[idx]) items[idx]._skip = !cb.checked;
    });
  });

  // 저장 버튼
  document.getElementById(saveBtnId)?.addEventListener('click', () => {
    const toSave = items
      .filter(it => !it._skip)
      .map(it => source ? { ...it, _source: source } : it);
    if (toSave.length === 0) {
      window.showToast?.('저장할 항목이 없습니다', 2000, 'warning');
      return;
    }
    _saveMultipleItems(toSave, saveBtnId);
  });
}

function _displayMultipleResults(items) {
  const result = document.getElementById('ni-photo-result');
  const extracted = document.getElementById('ni-photo-extracted');

  result.style.display = 'block';
  document.getElementById('ni-photo-confidence').textContent =
    items.map(it => Math.round((it.confidence || 0.8) * 100) + '%').join(' / ');

  _renderInlineGrid(items, extracted, { saveBtnId: 'ni-multi-save-all-btn', source: null });
}

async function _saveMultipleItems(items, saveBtnId) {
  const toSave = items.filter(it => !it._skip);
  // 호출한 버튼만 disable (숨겨진 쪽 버튼 오조작 방지)
  const btn = saveBtnId ? document.getElementById(saveBtnId) : null;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    const { saveNutritionItem } = await import('../data.js');
    let savedCount = 0;

    for (const item of toSave) {
      const entry = {
        id: null,
        name: item.name || '미확인 제품',
        unit: item.unit || '100g',
        servingSize: item.servingSize || 100,
        servingUnit: item.servingUnit || 'g',
        nutrition: {
          kcal: item.nutrition?.kcal || 0,
          protein: item.nutrition?.protein || 0,
          carbs: item.nutrition?.carbs || 0,
          fat: item.nutrition?.fat || 0,
          fiber: item.nutrition?.fiber || 0,
          sugar: item.nutrition?.sugar || 0,
          sodium: item.nutrition?.sodium || 0,
        },
        notes: `복수 파싱 (${toSave.length}개 중 ${savedCount + 1}번째)`,
        source: item._source || 'ocr',
        language: item.language || 'ko',
        confidence: item.confidence || 0.8,
        photoUrl: item.photoUrl || null,
        rawText: item.rawText || null, // provenance 보존
      };
      await saveNutritionItem(entry);
      savedCount++;
    }

    window.showToast?.(`${savedCount}개 저장 완료`, 2500, 'success');
    closeNutritionItemModal();

    if (window.renderNutritionSearchResults) {
      setTimeout(() => {
        window.renderNutritionSearchResults();
        if (window._renderNutritionDBList) window._renderNutritionDBList();
      }, 100);
    }
  } catch (e) {
    window.showToast?.('저장 실패: ' + e.message, 3000, 'error');
  } finally {
    if (btn && document.contains(btn)) { btn.disabled = false; btn.textContent = '💾 체크된 항목 저장'; }
  }
}

// ═════════════════════════════════════════════════════════════
// Window 전역 등록 (HTML onclick에서 호출 가능하도록)
// ═════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.switchNutritionTab = switchNutritionTab;
  window.handleNutritionPhotoSelect = handleNutritionPhotoSelect;
  window.clearNutritionPhoto = clearNutritionPhoto;
  window.analyzeNutritionText = analyzeNutritionText;
  window.openNutritionItemEditor = openNutritionItemEditor;
  window.closeNutritionItemModal = closeNutritionItemModal;
  window.saveNutritionItemFromModal = saveNutritionItemFromModal;
  window.deleteNutritionItemFromModal = deleteNutritionItemFromModal;
}
