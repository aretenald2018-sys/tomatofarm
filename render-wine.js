// ================================================================
// render-wine.js
// 의존성: config.js, data.js
// 역할: 와인 탭 (대시보드 + 카드 + 모달)
// 평점: 태우 별점 5점 만점만 사용
// ================================================================

import { CONFIG }                         from './config.js';
import { saveWine, deleteWine, getWines } from './data.js';

// ── 공개 API ─────────────────────────────────────────────────────
export function renderWine() {
  const wines     = getWines();
  const container = document.getElementById('wine-list');
  if (!container) return;

  container.innerHTML =
    _buildDashboard(wines) +
    `<div class="wine-cards-wrap">` +
    (wines.length
      ? wines
          .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))
          .map(w => _buildWineCard(w))
          .join('')
      : `<div style="text-align:center;padding:40px;color:var(--muted)">
           <div style="font-size:32px;margin-bottom:12px">🍷</div>
           <div style="font-size:14px">아직 기록된 와인이 없어요</div>
         </div>`)
    + `</div>`;
}

// ── 대시보드 ─────────────────────────────────────────────────────
function _buildDashboard(wines) {
  if (!wines.length) return '';

  // 지역 TOP3
  const regionCount = {};
  wines.forEach(w => {
    if (!w.region) return;
    const parts   = w.region.split(',');
    const country = parts[parts.length-1].trim();
    regionCount[country] = (regionCount[country]||0) + 1;
  });
  const regionTop3 = Object.entries(regionCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  // 품종 TOP3
  const varietyCount = {};
  wines.forEach(w => {
    if (!w.variety) return;
    const main = w.variety.split(/[\/,]/)[0].trim();
    varietyCount[main] = (varietyCount[main]||0) + 1;
  });
  const varietyTop3 = Object.entries(varietyCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  // 평균 별점
  const rated   = wines.filter(w => w.taewooScore);
  const avgStr  = rated.length
    ? (rated.reduce((s,w)=>s+w.taewooScore,0)/rated.length).toFixed(1)
    : '-';
  const topWines = [...wines]
    .filter(w => w.taewooScore)
    .sort((a,b) => b.taewooScore - a.taewooScore)
    .slice(0,3);

  const rankHtml = (arr) => arr.length
    ? arr.map((x,i) => `<span class="wine-rank-item">
        <span class="wine-rank-num">${i+1}</span>${x[0]}
        <span class="wine-rank-cnt">${x[1]}병</span>
      </span>`).join('')
    : '<span style="color:var(--muted);font-size:12px">데이터 없음</span>';

  return `
  <div class="wine-dashboard">
    <div class="wine-dash-title">📊 나의 와인 취향</div>
    <div class="wine-dash-grid">
      <div class="wine-dash-block">
        <div class="wine-dash-label">🌍 시음 지역 TOP3</div>
        <div class="wine-rank-list">${rankHtml(regionTop3)}</div>
      </div>
      <div class="wine-dash-block">
        <div class="wine-dash-label">🍇 시음 품종 TOP3</div>
        <div class="wine-rank-list">${rankHtml(varietyTop3)}</div>
      </div>
    </div>

    <div class="wine-dash-grid" style="margin-top:8px">
      <div class="wine-dash-block">
        <div class="wine-dash-label">⭐ 평균 별점</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:#f87171;margin:4px 0">${avgStr}</div>
        <div style="font-size:10px;color:var(--muted)">${rated.length}개 평가됨</div>
      </div>
      <div class="wine-dash-block">
        <div class="wine-dash-label">🏆 내 TOP3</div>
        ${topWines.length
          ? topWines.map((w,i)=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span class="wine-rank-num">${i+1}</span>
              <span style="font-size:11px;color:var(--text);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${w.name}</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#f87171">${_stars(w.taewooScore)}</span>
            </div>`).join('')
          : '<span style="font-size:11px;color:var(--muted)">평점을 입력해주세요</span>'}
      </div>
    </div>

    <div class="wine-dash-block" style="margin-top:8px">
      <div class="wine-dash-label">🤖 선호 품종·지역·특색 분석</div>
      <div id="wine-pref-text" style="font-size:12px;color:var(--muted2);line-height:1.7">
        <button class="wine-pref-btn" onclick="analyzeWinePreference()">✨ AI 선호도 분석하기</button>
      </div>
    </div>
    <div class="wine-dash-total">총 <span>${wines.length}</span>종 기록됨</div>
  </div>`;
}

// ── 별 표시 ──────────────────────────────────────────────────────
function _stars(score) {
  if (!score) return '';
  const full  = Math.floor(score);
  const half  = (score % 1) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half?'½':'') + '☆'.repeat(Math.max(empty,0));
}

// ── AI 선호도 분석 ────────────────────────────────────────────────
export async function analyzeWinePreference() {
  const btn = document.querySelector('.wine-pref-btn');
  const el  = document.getElementById('wine-pref-text');
  if (btn) { btn.textContent='분석 중...'; btn.disabled=true; }

  const wines   = getWines();
  const summary = wines.map(w =>
    `[${w.name} ${w.vintage||''} / ${w.region||''} / ${w.variety||''} / 별점:${w.taewooScore||'미평가'}]\n감상: ${w.note||''} ${w.palate||''}`
  ).join('\n\n');

  try {
    const { callGemini } = await import('./ai.js');
    const result = await callGemini(
      `다음은 내가 시음한 와인들의 감상 메모와 별점입니다.\n${summary}\n\n별점이 높은 와인들의 공통점을 중심으로, 현재 내가 선호하는 품종·지역·스타일을 3~4문장으로 간결하게 분석해주세요.`,
      400
    );
    if(el) el.innerHTML=`<div style="font-size:12px;color:var(--muted2);line-height:1.7">${result}</div>
      <button class="wine-pref-btn" onclick="analyzeWinePreference()" style="margin-top:8px">🔄 재분석</button>`;
  } catch(e) {
    if(el) el.innerHTML=`<div style="font-size:12px;color:var(--diet-bad)">분석 실패</div>
      <button class="wine-pref-btn" onclick="analyzeWinePreference()">다시 시도</button>`;
  }
}

// ── 카드 빌더 ────────────────────────────────────────────────────
function _buildWineCard(wine) {
  const imgHtml = wine.imageUrl
    ? `<img class="wine-card-img" src="${wine.imageUrl}" alt="${wine.name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="wine-card-img-placeholder" style="display:none;background:${_wineGradient(wine.color)}">🍷</div>`
    : `<div class="wine-card-img-placeholder" style="background:${_wineGradient(wine.color)}">🍷</div>`;

  // 별점 표시
  const ratingHtml = `
    <div class="wine-star-row">
      <span class="wine-stars">${wine.taewooScore ? _stars(wine.taewooScore) : '☆☆☆☆☆'}</span>
      <span class="wine-star-num">${wine.taewooScore ? wine.taewooScore : '-'}</span>
    </div>`;

  const structureHtml = _renderStructure(wine.structure);

  return `
    <div class="wine-card" onclick="openWineModal('${wine.id}')">
      <div class="wine-card-left">
        ${imgHtml}
        ${ratingHtml}
      </div>
      <div class="wine-card-body">
        <div class="wine-card-name">
          ${wine.name}${wine.vintage?` <span class="wine-vintage">${wine.vintage}</span>`:''}
        </div>
        <div class="wine-card-sub">${[wine.region,wine.variety].filter(Boolean).join(' · ')}</div>
        ${wine.taewooSummary?`<div class="wine-taewoo-summary">"${wine.taewooSummary}"</div>`:''}
        ${structureHtml}
        ${wine.nose  ?`<div class="wine-card-section"><span class="wine-card-label">향</span><span class="wine-card-text">${wine.nose}</span></div>`:''}
        ${wine.palate?`<div class="wine-card-section"><span class="wine-card-label">맛</span><span class="wine-card-text">${wine.palate}</span></div>`:''}
        ${wine.note  ?`<div class="wine-card-note">${wine.note}</div>`:''}
        <div class="wine-card-date">${(wine.createdAt||'').replace(/-/g,'/')}</div>
      </div>
    </div>`;
}

function _renderStructure(s) {
  if (!s) return '';
  const items=[
    {label:'당도',val:s.sweetness},{label:'탄닌',val:s.tannin},
    {label:'산도',val:s.acidity}, {label:'알콜',val:s.alcohol},
  ].filter(x=>x.val!==null&&x.val!==undefined);
  if (!items.length) return '';
  return `<div class="wine-structure">
    ${items.map(it=>`
      <div class="wine-struct-item">
        <span class="wine-struct-label">${it.label}</span>
        <div class="wine-struct-bar-wrap">
          <div class="wine-struct-bar" style="width:${Math.min((it.val/5)*100,100)}%"></div>
        </div>
        <span class="wine-struct-val">${it.val}</span>
      </div>`).join('')}
  </div>`;
}

function _wineGradient(color) {
  if (!color) return 'linear-gradient(160deg,#2a0a0a,#4a1010)';
  const c=color.toLowerCase();
  if(c.includes('루비'))   return 'linear-gradient(160deg,#3a0808,#6a1414)';
  if(c.includes('버건디')) return 'linear-gradient(160deg,#3a0820,#6a1040)';
  if(c.includes('가넷'))   return 'linear-gradient(160deg,#2a0606,#5a1010)';
  if(c.includes('황금')||c.includes('노을')) return 'linear-gradient(160deg,#4a3a08,#8a6a10)';
  if(c.includes('분홍')||c.includes('로제')) return 'linear-gradient(160deg,#4a1030,#8a2050)';
  return 'linear-gradient(160deg,#2a0a0a,#4a1010)';
}

// ── 모달 ─────────────────────────────────────────────────────────
export function openWineModal(wineId=null) {
  const modal=document.getElementById('wine-modal');
  const titleEl=document.getElementById('wine-modal-title');
  if (wineId) {
    const wine=getWines().find(w=>w.id===wineId);
    if (!wine) return;
    titleEl.textContent='와인 수정';
    _fillWineForm(wine);
    modal.dataset.editingId=wineId;
  } else {
    titleEl.textContent='🍷 와인 기록 추가';
    _clearWineForm();
    modal.dataset.editingId='';
  }
  modal.classList.add('open');
}

export function closeWineModal(e) {
  if (e&&e.target!==document.getElementById('wine-modal')) return;
  document.getElementById('wine-modal').classList.remove('open');
}

export async function saveWineFromModal() {
  const modal    =document.getElementById('wine-modal');
  const editingId=modal.dataset.editingId;
  const wine={
    id:           editingId||`wine_${Date.now()}`,
    name:         _val('wine-name'),
    vintage:      parseInt(_val('wine-vintage'))||null,
    region:       _val('wine-region'),
    variety:      _val('wine-variety'),
    taewooScore:  parseFloat(_val('wine-taewoo'))||null,
    taewooSummary:_val('wine-taewoo-summary'),
    color:        _val('wine-color'),
    nose:         _val('wine-nose'),
    palate:       _val('wine-palate'),
    structure:{
      sweetness:parseFloat(_val('wine-sweetness'))||null,
      tannin:   parseFloat(_val('wine-tannin'))   ||null,
      acidity:  parseFloat(_val('wine-acidity'))  ||null,
      alcohol:  parseFloat(_val('wine-alcohol'))  ||null,
    },
    note:     _val('wine-note'),
    imageUrl: _val('wine-image-url')||null,
    createdAt:_val('wine-date')||new Date().toISOString().slice(0,10),
  };
  await saveWine(wine);
  modal.classList.remove('open');
  renderWine();
}

export async function deleteWineFromModal() {
  const modal=document.getElementById('wine-modal');
  if (!confirm('이 와인 기록을 삭제할까요?')) return;
  await deleteWine(modal.dataset.editingId);
  modal.classList.remove('open');
  renderWine();
}

// 하위 호환 (app.js window 등록용 — 실제 기능 없음)
export async function searchVivinoRating() {}
export async function searchWineImage() {
  alert('이미지 자동 검색은 지원하지 않아요.\n구글에서 와인 라벨 이미지를 찾아 URL을 직접 붙여넣어 주세요.');
}
export async function searchCriticRatings() {}
export async function bulkSearchVivino() {}

// ── 폼 헬퍼 ─────────────────────────────────────────────────────
function _val(id){return(document.getElementById(id)?.value||'').trim();}

function _fillWineForm(wine){
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||'';};
  set('wine-name',          wine.name);
  set('wine-vintage',       wine.vintage);
  set('wine-region',        wine.region);
  set('wine-variety',       wine.variety);
  set('wine-taewoo',        wine.taewooScore);
  set('wine-taewoo-summary',wine.taewooSummary);
  set('wine-color',         wine.color);
  set('wine-nose',          wine.nose);
  set('wine-palate',        wine.palate);
  set('wine-sweetness',     wine.structure?.sweetness);
  set('wine-tannin',        wine.structure?.tannin);
  set('wine-acidity',       wine.structure?.acidity);
  set('wine-alcohol',       wine.structure?.alcohol);
  set('wine-note',          wine.note);
  set('wine-image-url',     wine.imageUrl);
  set('wine-date',          wine.createdAt);
  const prev=document.getElementById('wine-image-preview');
  if(wine.imageUrl){prev.src=wine.imageUrl;prev.style.display='block';}
  else prev.style.display='none';
  document.getElementById('wine-delete-btn').style.display='block';
}

function _clearWineForm(){
  ['wine-name','wine-vintage','wine-region','wine-variety',
   'wine-taewoo','wine-taewoo-summary','wine-color','wine-nose',
   'wine-palate','wine-sweetness','wine-tannin','wine-acidity',
   'wine-alcohol','wine-note','wine-image-url']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('wine-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('wine-image-preview').style.display='none';
  document.getElementById('wine-delete-btn').style.display='none';
}
