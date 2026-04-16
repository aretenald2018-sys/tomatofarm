// ================================================================
// modals/ai-estimate-banner.js
// AI 추정 배너 (pending / preview / error 3단계)
//
// Codex 리뷰 반영 (2026-04-17 2차):
//  - HIGH #1: 날짜 전환 race — state에 dateKey 스냅샷 저장.
//             완료 시 현재 S.date와 다르면 폐기. load.js는 clearAll() 호출.
//  - MID  #3: 재확정 시 기존 source:'ai' 항목 먼저 제거.
//  - MID  #4: quick-fix accumulator — baseEstimate에서 portion → excludes → swaps
//             순서로 매번 재계산. 버튼 조합 가능.
//  - Open Q1: 취소 시 토스트로 "사진도 제거" 되돌리기 옵션 제공.
// ================================================================

import { applyPortionScale, excludeItems, runAIEstimate } from '../workout/ai-estimate.js';
import { showToast } from '../home/utils.js';

// 상태 보관 — meal별
// 구조: { [meal]: {
//   status, estimate, baseEstimate, photoDataUrl, dateKey,
//   fixes: { portion, excludes:Set<string>, swaps:Set<string> }
// }}
const _state = {};

// ── 유틸 ────────────────────────────────────────────────────────
function _currentDateKey() {
  // S.date 읽기 — 동적 import 회피 위해 dataset 활용
  const label = document.getElementById('wt-date-label-diet') || document.getElementById('wt-date-label');
  return label?.textContent?.trim() || ''; // 대체 키. 정확한 dateKey는 아래에서 동적으로.
}

async function _exactDateKey() {
  try {
    const { S } = await import('../workout/state.js');
    if (!S.date) return '';
    const { y, m, d } = S.date;
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } catch { return _currentDateKey(); }
}

function _esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── 컨테이너 ────────────────────────────────────────────────────
function _getHostContainer(meal) {
  const body = document.querySelector(`.diet-toss-row[data-meal="${meal}"] .diet-toss-body`);
  if (!body) return null;
  let host = body.querySelector(`.ai-estimate-banner-host[data-meal="${meal}"]`);
  if (!host) {
    host = document.createElement('div');
    host.className = 'ai-estimate-banner-host';
    host.dataset.meal = meal;
    const actions = body.querySelector('.diet-meal-actions');
    if (actions) body.insertBefore(host, actions);
    else body.prepend(host);
  }
  return host;
}

function _openMealAccordion(meal) {
  const row = document.querySelector(`.diet-toss-row[data-meal="${meal}"]`);
  if (row && !row.classList.contains('diet-toss-open')) {
    row.classList.add('diet-toss-open');
  }
}

// ── Accumulator: baseEstimate + fixes → derived estimate ────────
function _deriveEstimate(base, fixes) {
  let est = base;
  if (fixes?.portion && fixes.portion !== 'normal') {
    est = applyPortionScale(est, fixes.portion);
  }
  if (fixes?.excludes?.size) {
    est = excludeItems(est, it => {
      if (fixes.excludes.has('soup') && /국|탕|찌개|수프/.test(it.name)) return true;
      if (fixes.excludes.has('side') && /샐러드|감자|빵|사이드/.test(it.name)) return true;
      if (fixes.excludes.has('last-side')) {
        // 구현 편의: last-side는 기준시점 base에서 가장 낮은 kcal 아이템 1개 제거
        // (accumulator 재계산이라 "최저 kcal 1개 제거"를 idempotent하게 처리)
        // 별도 판정 함수를 쓸 수 없으므로 바깥 로직에서 단발성 처리
      }
      return false;
    });
    if (fixes.excludes.has('last-side')) {
      const items = [...est.detectedItems].sort((a, b) => a.kcal - b.kcal);
      if (items.length > 1) {
        const victimName = items[0].name;
        est = excludeItems(est, it => it.name === victimName && it.kcal === items[0].kcal);
      }
    }
  }
  if (fixes?.swaps?.size) {
    if (fixes.swaps.has('cream-oil')) {
      const items = est.detectedItems.map(it =>
        /크림|carbonara|까르보/.test(it.name)
          ? { ...it, kcal: Math.round(it.kcal * 0.7), fat: Math.round(it.fat * 0.6 * 10) / 10 }
          : it
      );
      const totalKcal = Math.round(items.reduce((s, i) => s + i.kcal, 0));
      est = { ...est, detectedItems: items, totalKcal };
    }
  }
  return est;
}

// ── Pending ─────────────────────────────────────────────────────
export function renderPending(meal) {
  const host = _getHostContainer(meal);
  if (!host) return;
  host.innerHTML = `
    <div class="ai-estimate-banner" data-state="pending">
      <div class="ai-estimate-banner-head">
        <span class="ai-estimate-spinner"></span>
        <span>AI가 사진을 분석 중이에요…</span>
        <button class="ai-close" onclick="aiEstimateDismiss('${meal}')" title="취소">✕</button>
      </div>
      <div style="font-size:11px;color:var(--muted,#888);">보통 3~5초 걸려요. 결과가 마음에 들지 않으면 취소할 수 있어요.</div>
    </div>`;
  _openMealAccordion(meal);
}

// ── Preview ─────────────────────────────────────────────────────
export function renderPreview(meal) {
  const host = _getHostContainer(meal);
  const st = _state[meal];
  if (!host || !st || !st.estimate) return;
  const e = st.estimate;
  const itemsHtml = (e.detectedItems || []).slice(0, 10).map(it =>
    `<span class="ai-item">${_esc(it.name)} ${Math.round(it.kcal)}</span>`
  ).join('');

  const plateType = e.plateType || 'unknown';
  const quickFix = _renderQuickFixButtons(meal, plateType, st.fixes);

  host.innerHTML = `
    <div class="ai-estimate-banner" data-state="preview">
      <div class="ai-estimate-banner-head">
        <span class="ai-bot">🤖</span>
        <span>AI 추정</span>
        <span class="ai-kcal">약 ${Math.round(e.totalKcal)} kcal</span>
        <button class="ai-close" onclick="aiEstimateDismiss('${meal}')" title="닫기">✕</button>
      </div>
      <div class="ai-estimate-items">${itemsHtml || '<span style="color:var(--muted)">항목 없음</span>'}</div>
      ${quickFix}
      <div class="ai-estimate-actions">
        <button class="btn-confirm" onclick="aiEstimateConfirm('${meal}')">✓ 이대로 확정</button>
        <button class="btn-edit" onclick="aiEstimateOpenEditor('${meal}')">상세 편집</button>
      </div>
      <div style="margin-top:6px;font-size:10px;color:var(--muted,#888);">
        ${e.priorApplied ? '반상 평균(800~1200kcal) 기준 보정 · ' : ''}신뢰도 ${Math.round((e.confidence || 0) * 100)}%
        ${e.detectedItems?.some(i => i.kcalCorrected) ? ' · kcal sanity 보정 포함' : ''}
      </div>
    </div>`;
  _openMealAccordion(meal);
}

function _renderQuickFixButtons(meal, plateType, fixes) {
  const p = fixes?.portion || 'normal';
  const ex = fixes?.excludes || new Set();
  const sw = fixes?.swaps || new Set();

  const btn = (label, action, active) =>
    `<button class="${active ? 'active' : ''}" onclick="aiEstimateQuickFix('${meal}','${action}')">${label}</button>`;

  const portionRow = [
    btn('양 적게', 'portion:less', p === 'less'),
    btn('보통', 'portion:normal', p === 'normal'),
    btn('많이', 'portion:more', p === 'more'),
  ].join('');

  const extras = [];
  if (plateType === 'cafeteria') {
    extras.push(btn('국 제외', 'exclude:soup', ex.has('soup')));
    extras.push(btn('반찬 1개 줄이기', 'exclude:last-side', ex.has('last-side')));
  } else if (plateType === 'steak') {
    extras.push(btn('사이드 제외', 'exclude:side', ex.has('side')));
  } else if (plateType === 'pasta') {
    extras.push(btn('크림→오일', 'swap:cream-oil', sw.has('cream-oil')));
  }

  return `<div class="ai-estimate-quickfix">${portionRow}${extras.join('')}</div>`;
}

// ── Error ───────────────────────────────────────────────────────
export function renderError(meal, message, errorCode) {
  const host = _getHostContainer(meal);
  if (!host) return;
  // 429 / RESOURCE_EXHAUSTED → 친절한 설명
  let displayMsg = message || '잠시 후 다시 시도해 주세요.';
  let hint = '';
  const em = String(message || '');
  if (/429|RESOURCE_EXHAUSTED|quota|resource-exhausted/i.test(em)) {
    displayMsg = '오늘 AI 분석 한도를 초과했어요.';
    hint = '잠시 후 다시 시도하거나, 수동 입력으로 진행해 주세요.';
  } else if (/GROQ_UNSUPPORTED/i.test(em)) {
    displayMsg = 'AI 백업 경로가 이미지를 지원하지 않아요.';
    hint = '잠시 후 다시 시도하거나, 수동 입력으로 진행해 주세요.';
  }

  host.innerHTML = `
    <div class="ai-estimate-banner" data-state="error">
      <div class="ai-estimate-banner-head">
        <span class="ai-bot">🤖</span>
        <span>분석 실패</span>
        <button class="ai-close" onclick="aiEstimateDismiss('${meal}')" title="닫기">✕</button>
      </div>
      <div style="font-size:12px;color:var(--diet-bad,#ef4444);margin-bottom:4px;">${_esc(displayMsg)}</div>
      ${hint ? `<div style="font-size:11px;color:var(--muted,#888);margin-bottom:8px;">${_esc(hint)}</div>` : ''}
      <div class="ai-estimate-actions">
        <button class="btn-confirm" onclick="aiEstimateRetry('${meal}')">다시 시도</button>
        <button class="btn-edit" onclick="aiEstimateDismiss('${meal}')">수동 입력</button>
      </div>
    </div>`;
}

// ── 시작 / 재시도 ───────────────────────────────────────────────
export async function startAIEstimate(meal, photoDataUrl) {
  const base64 = (photoDataUrl || '').replace(/^data:image\/\w+;base64,/, '');
  const dateKey = await _exactDateKey();
  _state[meal] = {
    status: 'pending',
    photoDataUrl,
    dateKey,
    fixes: { portion: 'normal', excludes: new Set(), swaps: new Set() },
  };
  renderPending(meal);
  try {
    const estimate = await runAIEstimate(base64);
    // HIGH #1: 완료 시점에 날짜가 바뀌었거나 state가 취소됐다면 폐기
    const curKey = await _exactDateKey();
    const st = _state[meal];
    if (!st || st.status !== 'pending' || st.dateKey !== curKey) {
      console.log('[aiEstimate] 날짜 전환 또는 취소로 결과 폐기', { meal, stale: st?.dateKey, cur: curKey });
      return;
    }
    st.status = 'preview';
    st.baseEstimate = estimate;
    st.estimate = _deriveEstimate(estimate, st.fixes);
    renderPreview(meal);
  } catch (err) {
    console.error('[aiEstimate] 실패:', err);
    // 에러 시에도 날짜가 바뀌었으면 조용히 폐기
    const curKey = await _exactDateKey();
    const st = _state[meal];
    if (!st || st.dateKey !== curKey) return;
    st.status = 'error';
    renderError(meal, err?.message || '네트워크 오류', err?.code);
  }
}

// ── Quick-fix (accumulator) ─────────────────────────────────────
export function handleQuickFix(meal, action) {
  const st = _state[meal];
  if (!st || !st.baseEstimate) return;
  const [kind, value] = action.split(':');

  if (kind === 'portion') {
    st.fixes.portion = value;
  } else if (kind === 'exclude') {
    // 토글
    if (st.fixes.excludes.has(value)) st.fixes.excludes.delete(value);
    else st.fixes.excludes.add(value);
  } else if (kind === 'swap') {
    if (st.fixes.swaps.has(value)) st.fixes.swaps.delete(value);
    else st.fixes.swaps.add(value);
  }
  // base + 모든 fixes 재계산 (누적 아닌 순수 함수)
  st.estimate = _deriveEstimate(st.baseEstimate, st.fixes);
  renderPreview(meal);
}

// ── 확정 (기존 AI 항목 제거 후 재부착) ──────────────────────────
export async function confirmEstimate(meal) {
  const st = _state[meal];
  if (!st || !st.estimate) return;
  const { S } = await import('../workout/state.js');
  const { _renderMealFoodItems, _renderDietResults } = await import('../workout/render.js');
  const { _autoSaveDiet } = await import('../workout/save.js');

  // HIGH #1: 확정 시점 날짜 검증
  const curKey = await _exactDateKey();
  if (st.dateKey && st.dateKey !== curKey) {
    showToast('날짜가 바뀌어 AI 결과를 반영할 수 없어요', 2500, 'warning');
    dismiss(meal, { keepPhoto: true });
    return;
  }

  const mealKey = meal === 'breakfast' ? 'bFoods' : meal === 'lunch' ? 'lFoods' : meal === 'dinner' ? 'dFoods' : 'sFoods';
  const prefix  = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';

  const aiFoods = (st.estimate.detectedItems || []).map(it => ({
    name: it.name,
    grams: it.grams || 0,
    kcal: it.kcal || 0,
    protein: it.protein || 0,
    carbs: it.carbs || 0,
    fat: it.fat || 0,
    source: 'ai',
  }));

  // MID #3: 기존 source:'ai' 항목 제거 후 추가 (재확정 시 중복 누적 방지)
  const existing = S.diet[mealKey] || [];
  const preserved = existing.filter(f => f.source !== 'ai');
  S.diet[mealKey] = [...preserved, ...aiFoods];

  const foods = S.diet[mealKey];
  S.diet[`${prefix}Kcal`]    = Math.round(foods.reduce((s, f) => s + (f.kcal || 0), 0));
  S.diet[`${prefix}Protein`] = Math.round(foods.reduce((s, f) => s + (f.protein || 0), 0) * 10) / 10;
  S.diet[`${prefix}Carbs`]   = Math.round(foods.reduce((s, f) => s + (f.carbs || 0), 0) * 10) / 10;
  S.diet[`${prefix}Fat`]     = Math.round(foods.reduce((s, f) => s + (f.fat || 0), 0) * 10) / 10;
  S.diet[`${prefix}Ok`]      = true;
  S.diet[`${prefix}Reason`]  = `AI: ${S.diet[`${prefix}Kcal`]}kcal (단${S.diet[`${prefix}Protein`]}g 탄${S.diet[`${prefix}Carbs`]}g 지${S.diet[`${prefix}Fat`]}g)`;

  S.diet[`${prefix}EstimateMeta`] = {
    plateType: st.estimate.plateType,
    confidence: st.estimate.confidence,
    priorApplied: !!st.estimate.priorApplied,
    portionApplied: st.fixes.portion || 'normal',
    excludes: [...st.fixes.excludes],
    swaps: [...st.fixes.swaps],
    createdAt: Date.now(),
  };

  _renderMealFoodItems(meal);
  _renderDietResults();
  await _autoSaveDiet();

  dismiss(meal, { keepPhoto: true, silent: true });
  showToast(`AI 추정 ${Math.round(st.estimate.totalKcal)}kcal 반영 완료`, 2500, 'success');
}

// ── 취소 ────────────────────────────────────────────────────────
// options.keepPhoto: AI 결과만 폐기, 사진은 유지 (기본)
// options.removePhoto: 사진까지 제거
// options.silent: 토스트 표시 안 함 (confirm 내부에서 호출 시)
export async function dismiss(meal, options = {}) {
  const st = _state[meal];
  delete _state[meal];
  const host = _getHostContainer(meal);
  if (host) host.innerHTML = '';

  if (options.removePhoto) {
    if (window._mealPhotos) delete window._mealPhotos[meal];
    try {
      const { _renderMealPhotos } = await import('../workout/render.js');
      _renderMealPhotos();
      const { saveWorkoutDay } = await import('../workout/save.js');
      saveWorkoutDay().catch(() => {});
    } catch {}
    if (!options.silent) showToast('AI 결과와 사진을 모두 취소했어요', 2500, 'info');
    return;
  }

  if (options.silent) return;

  // 기본 취소: AI 결과만 폐기. 사진은 유지. 사용자에게 "사진도 제거" 옵션 제공.
  if (st?.photoDataUrl) {
    showToast('AI 추정을 취소했어요', 3200, 'info');
    // 토스트 위에 추가 링크 — 3초 안에 되돌리기 가능한 2차 토스트
    setTimeout(() => {
      const existing = document.getElementById('tds-toast');
      // 기존 토스트가 아직 있으면 추가 버튼 끼워넣기
      if (existing && existing.classList.contains('show')) {
        const link = document.createElement('button');
        link.textContent = '사진도 제거';
        link.className = 'ai-toast-undo-btn';
        link.style.cssText = 'margin-left:10px;background:none;border:none;color:#7c3aed;text-decoration:underline;font-size:12px;cursor:pointer;';
        link.onclick = () => {
          existing.remove();
          dismiss(meal, { removePhoto: true });
        };
        existing.appendChild(link);
      }
    }, 50);
  }
}

// ── 상세 편집 (1차 MVP: placeholder) ─────────────────────────────
// 의도된 미완성: 2차에서 nutrition-item-modal pre-fill 구현 예정.
// 현재는 사용자에게 명확히 알림.
export async function openEditor(meal) {
  const st = _state[meal];
  if (!st || !st.estimate) return;
  showToast('상세 편집은 다음 업데이트에서 지원 예정. 지금은 확정 후 일반 편집을 이용해 주세요', 3500, 'info');
}

export async function retry(meal) {
  const st = _state[meal];
  const url = st?.photoDataUrl;
  if (!url) { dismiss(meal, { silent: true }); return; }
  await startAIEstimate(meal, url);
}

// ── HIGH #1: load.js에서 날짜 전환 시 호출 ──────────────────────
// pending 중인 모든 meal의 state를 폐기하고 배너 제거
export function clearAllForDateChange() {
  for (const meal of Object.keys(_state)) {
    const host = _getHostContainer(meal);
    if (host) host.innerHTML = '';
    delete _state[meal];
  }
}

// ── window 노출 ─────────────────────────────────────────────────
window.aiEstimateConfirm    = (meal) => confirmEstimate(meal);
window.aiEstimateDismiss    = (meal) => dismiss(meal);
window.aiEstimateQuickFix   = (meal, action) => handleQuickFix(meal, action);
window.aiEstimateOpenEditor = (meal) => openEditor(meal);
window.aiEstimateRetry      = (meal) => retry(meal);
window.aiEstimateClearAll   = () => clearAllForDateChange();
