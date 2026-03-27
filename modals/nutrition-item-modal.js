// ═════════════════════════════════════════════════════════════
// 상태 관리 (파일 전역)
// ═════════════════════════════════════════════════════════════

let _niEditingId = null;
let _niCurrentTab = 'manual';
let _niPhotoBase64 = null;
let _niParsedData = null;

export const MODAL_HTML = `
<div class="modal-overlay" id="nutrition-item-modal" onclick="closeNutritionItemModal(event)">
  <div class="modal-sheet">
    <div class="sheet-handle"></div>
    <div class="modal-title" id="nutrition-item-title">음식 정보 등록</div>

    <!-- 탭: 수기입력 / 사진인식 / 텍스트파싱 -->
    <div class="ni-tabs">
      <button class="ni-tab-btn active" id="ni-tab-manual" onclick="switchNutritionTab('manual')">✏️ 수기입력</button>
      <button class="ni-tab-btn" id="ni-tab-photo" onclick="switchNutritionTab('photo')">📷 사진인식</button>
      <button class="ni-tab-btn" id="ni-tab-text" onclick="switchNutritionTab('text')">📝 텍스트파싱</button>
    </div>

    <!-- ═══ TAB 1: 수기 입력 ═══ -->
    <div class="ni-tab-content active" id="ni-tab-content-manual">
      <div class="ex-editor-form">
        <div><div class="ex-editor-label">음식 이름 *</div><input class="ex-editor-input" id="ni-name" placeholder="예: 닭가슴살 구이"></div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">기준 단위</div><input class="ex-editor-input" id="ni-unit" placeholder="예: 100g, 1개, 1공기"></div>
          <div><div class="ex-editor-label">칼로리 (kcal)</div><input class="ex-editor-input" id="ni-kcal" type="number" placeholder="165"></div>
        </div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">탄수화물 (g)</div><input class="ex-editor-input" id="ni-carbs" type="number" step="0.1" placeholder="0"></div>
          <div><div class="ex-editor-label">단백질 (g)</div><input class="ex-editor-input" id="ni-protein" type="number" step="0.1" placeholder="31"></div>
        </div>
        <div class="diet-plan-row">
          <div><div class="ex-editor-label">지방 (g)</div><input class="ex-editor-input" id="ni-fat" type="number" step="0.1" placeholder="3.6"></div>
          <div><div class="ex-editor-label">메모</div><input class="ex-editor-input" id="ni-note" placeholder="선택 사항"></div>
        </div>
      </div>
    </div>

    <!-- ═══ TAB 2: 사진 인식 ═══ -->
    <div class="ni-tab-content" id="ni-tab-content-photo">
      <div class="ex-editor-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div class="ni-upload-zone" style="padding:20px 12px;cursor:pointer" onclick="document.getElementById('ni-photo-input').click()">
            <div style="font-size:32px;margin-bottom:4px">🖼️</div>
            <div style="font-weight:500;font-size:12px">갤러리</div>
            <div style="font-size:10px;color:var(--muted)">저장된 사진</div>
            <input type="file" id="ni-photo-input" accept="image/*" style="display:none" onchange="handleNutritionPhotoSelect(event)">
          </div>
          <div class="ni-upload-zone" style="padding:20px 12px;cursor:pointer" onclick="document.getElementById('ni-camera-input').click()">
            <div style="font-size:32px;margin-bottom:4px">📸</div>
            <div style="font-weight:500;font-size:12px">카메라</div>
            <div style="font-size:10px;color:var(--muted)">지금 촬영</div>
            <input type="file" id="ni-camera-input" accept="image/*;capture=environment" style="display:none" onchange="handleNutritionPhotoSelect(event)">
          </div>
        </div>
        <div id="ni-photo-preview" style="display:none;margin-top:12px">
          <img id="ni-photo-img" style="max-width:100%;max-height:200px;border-radius:8px;margin-bottom:8px">
          <button class="ex-editor-cancel" onclick="clearNutritionPhoto()" style="width:100%">사진 변경</button>
        </div>
        <div id="ni-photo-analyzing" style="display:none;text-align:center;padding:20px;color:var(--muted)">
          <div style="font-size:24px;animation:spin 1s linear infinite;margin-bottom:8px">⏳</div>
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
        <button class="diet-db-btn" style="width:100%;margin-top:8px;padding:10px" onclick="analyzeNutritionText()">🔍 분석하기</button>

        <div id="ni-text-analyzing" style="display:none;text-align:center;padding:20px;color:var(--muted)">
          <div style="font-size:24px;animation:spin 1s linear infinite;margin-bottom:8px">⏳</div>
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
      <button class="ex-editor-cancel" id="ni-delete-btn" onclick="deleteNutritionItemFromModal()" style="display:none;color:var(--diet-bad)">삭제</button>
      <button class="ex-editor-cancel" onclick="closeNutritionItemModal()">취소</button>
      <button class="ex-editor-save" onclick="saveNutritionItemFromModal()">저장하기</button>
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
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

@media (max-width: 480px) {
  .ni-tabs {
    gap: 2px;
    padding: 0 4px;
  }

  .ni-tab-btn {
    padding: 10px 4px;
    font-size: 11px;
  }
}

.ni-tab-btn.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.ni-tab-content {
  display: none;
  padding: 12px;
}

.ni-tab-content.active {
  display: block;
}

.ni-upload-zone {
  border: 2px dashed var(--border);
  border-radius: 8px;
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.ni-upload-zone:hover {
  border-color: var(--accent);
  background: var(--bg-secondary);
}

.ni-upload-zone.dragover {
  border-color: var(--accent);
  background: var(--bg-secondary);
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
  document.getElementById(`ni-tab-${tab}`).classList.add('active');

  // 콘텐츠 표시
  document.querySelectorAll('.ni-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`ni-tab-content-${tab}`).classList.add('active');
}

// ═════════════════════════════════════════════════════════════
// 사진 업로드 & OCR
// ═════════════════════════════════════════════════════════════

export async function handleNutritionPhotoSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    // Base64로 변환
    const { imageToBase64 } = await import('../data.js');
    _niPhotoBase64 = await imageToBase64(file);

    // 미리보기 표시
    const preview = document.getElementById('ni-photo-preview');
    const img = document.getElementById('ni-photo-img');
    img.src = `data:image/jpeg;base64,${_niPhotoBase64}`;
    preview.style.display = 'block';

    // 갤러리/카메라 버튼 숨기기
    const uploadZones = document.querySelectorAll('.ni-tab-content.active .ni-upload-zone');
    uploadZones.forEach(zone => {
      if (zone.parentElement) zone.parentElement.style.display = 'none';
    });

    // OCR 분석 시작
    _analyzeNutritionPhoto();
  } catch (e) {
    alert('사진 업로드 실패: ' + e.message);
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

async function _analyzeNutritionPhoto() {
  if (!_niPhotoBase64) return;

  const analyzing = document.getElementById('ni-photo-analyzing');
  const result = document.getElementById('ni-photo-result');

  analyzing.style.display = 'block';
  result.style.display = 'none';

  try {
    const { parseNutritionFromImage } = await import('../ai.js');
    _niParsedData = await parseNutritionFromImage(_niPhotoBase64, 'ko');

    // 결과 표시
    _displayNutritionResult(_niParsedData);

    // 폼에 자동 채우기
    _populateNutritionForm(_niParsedData);
  } catch (e) {
    console.error('OCR 분석 실패:', e);
    alert('사진 분석 실패: ' + e.message);
  } finally {
    analyzing.style.display = 'none';
  }
}

// ═════════════════════════════════════════════════════════════
// 텍스트 파싱
// ═════════════════════════════════════════════════════════════

export async function analyzeNutritionText() {
  const rawText = document.getElementById('ni-raw-text').value.trim();
  if (!rawText) {
    alert('텍스트를 입력해주세요.');
    return;
  }

  const analyzing = document.getElementById('ni-text-analyzing');
  const result = document.getElementById('ni-text-result');

  analyzing.style.display = 'block';
  result.style.display = 'none';

  try {
    const { parseNutritionFromText, detectLanguage } = await import('../ai.js');

    // 언어 감지
    const langResult = await detectLanguage(rawText);

    // 텍스트 파싱
    _niParsedData = await parseNutritionFromText(rawText);
    _niParsedData.rawText = rawText;
    if (langResult?.language) _niParsedData.language = langResult.language;

    // 결과 표시
    _displayNutritionTextResult(_niParsedData, langResult);

    // 폼에 자동 채우기
    _populateNutritionForm(_niParsedData);
  } catch (e) {
    console.error('텍스트 분석 실패:', e);
    alert('텍스트 분석 실패: ' + e.message);
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
    alert('음식 이름을 입력해주세요.');
    return;
  }

  const item = {
    id: _niEditingId,
    name: name,
    unit: document.getElementById('ni-unit').value.trim() || '100g',
    servingSize: parseInt(document.getElementById('ni-unit').value.match(/\\d+/)?.[0] || 100),
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
    await saveNutritionItem(item);
    alert('저장되었습니다!');
    closeNutritionItemModal();
  } catch (e) {
    alert('저장 실패: ' + e.message);
  }
}

export async function deleteNutritionItemFromModal() {
  if (!_niEditingId) return;
  if (!confirm('이 음식을 삭제하시겠습니까?')) return;

  try {
    const { deleteNutritionItem } = await import('../data.js');
    await deleteNutritionItem(_niEditingId);
    alert('삭제되었습니다!');
    closeNutritionItemModal();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

// ═════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═════════════════════════════════════════════════════════════

function _populateNutritionForm(data) {
  document.getElementById('ni-name').value = data.name || '';
  document.getElementById('ni-unit').value = data.unit || '100g';
  document.getElementById('ni-kcal').value = data.nutrition?.kcal || '';
  document.getElementById('ni-carbs').value = data.nutrition?.carbs || '';
  document.getElementById('ni-protein').value = data.nutrition?.protein || '';
  document.getElementById('ni-fat').value = data.nutrition?.fat || '';
  document.getElementById('ni-note').value = data.notes || '';
}

function _clearNutritionForm() {
  document.getElementById('ni-name').value = '';
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

  extracted.innerHTML = `
    <div style="margin-bottom:8px"><strong>${data.name || '음식명 (미감지)'}</strong></div>
    <div style="font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px">
      <div>칼로리: <strong>${data.nutrition?.kcal || '?'} kcal</strong></div>
      <div>단백질: <strong>${data.nutrition?.protein || '?'} g</strong></div>
      <div>탄수화물: <strong>${data.nutrition?.carbs || '?'} g</strong></div>
      <div>지방: <strong>${data.nutrition?.fat || '?'} g</strong></div>
    </div>
  `;
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
