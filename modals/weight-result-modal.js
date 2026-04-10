const WEIGHT_MESSAGES = {
  slight_loss: [
    '어제보다 가벼워졌어요!',
    '조금씩 줄어들고 있어요!',
    '꾸준함이 답이에요!',
  ],
  big_loss: [
    '우와! {delta}kg 빠졌어요!',
    '대단해요! 이 기세 계속 가봐요!',
    '목표체중이 눈앞이에요!',
  ],
  gain: [
    '괜찮아요! 다시 화이팅!',
    '한 번의 증가는 아무것도 아니에요!',
    '꾸준히 하면 분명 줄어들 거예요!',
  ],
  same: [
    '유지도 대단해요! 꾸준함이 최고!',
    '안정적이네요! 계속 이 조자로!',
  ],
};

function _pickMessage(type, deltaAbs) {
  const pool = WEIGHT_MESSAGES[type] || WEIGHT_MESSAGES.same;
  const seed = Math.round(deltaAbs * 10) || 0;
  return pool[seed % pool.length].replace('{delta}', deltaAbs.toFixed(1));
}

function _buildSeries(values, width, height, min, max) {
  const usableW = width - 52;
  const usableH = height - 54;
  const left = 18;
  const top = 14;
  if (!values.length) return [];
  return values.map((item, idx) => {
    const x = left + (usableW * idx / Math.max(values.length - 1, 1));
    const ratio = max === min ? 0.5 : (item.value - min) / (max - min);
    const y = top + usableH - (ratio * usableH);
    return { ...item, x, y };
  });
}

function _path(points) {
  if (!points.length) return '';
  return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function _buildWeightGraph(checkins) {
  const recent = [...checkins].sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(-10);
  const weightVals = recent
    .filter(c => Number.isFinite(c.weight))
    .map(c => ({ date: c.date, value: Number(c.weight) }));
  const bodyFatVals = recent
    .filter(c => Number.isFinite(c.bodyFatPct))
    .map(c => ({ date: c.date, value: Number(c.bodyFatPct) }));

  if (!weightVals.length) {
    return '<div class="weight-result-empty">그래프를 그릴 기록이 아직 부족해요.</div>';
  }

  const width = 320;
  const height = 180;
  const weightMin = Math.min(...weightVals.map(v => v.value)) - 2;
  const weightMax = Math.max(...weightVals.map(v => v.value)) + 2;
  const bodyFatMin = bodyFatVals.length ? Math.min(...bodyFatVals.map(v => v.value)) - 2 : 0;
  const bodyFatMax = bodyFatVals.length ? Math.max(...bodyFatVals.map(v => v.value)) + 2 : 0;

  const weightPts = _buildSeries(weightVals, width, height, weightMin, weightMax);
  const bodyFatPts = _buildSeries(bodyFatVals, width, height, bodyFatMin, bodyFatMax);
  const xLabels = recent.map((c, idx) => {
    const [, mm, dd] = (c.date || '').split('-');
    const x = 18 + ((width - 52) * idx / Math.max(recent.length - 1, 1));
    return `<text x="${x.toFixed(1)}" y="168" class="weight-result-axis-label">${Number(mm)}/${Number(dd)}</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weight-result-graph" aria-label="최근 체크인 그래프">
      <line x1="18" y1="150" x2="${width - 18}" y2="150" class="weight-result-axis"></line>
      <line x1="18" y1="14" x2="18" y2="150" class="weight-result-axis"></line>
      <path d="${_path(weightPts)}" class="weight-result-weight-line"></path>
      ${weightPts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="weight-result-weight-point"></circle>`).join('')}
      ${bodyFatPts.length ? `<path d="${_path(bodyFatPts)}" class="weight-result-fat-line"></path>` : ''}
      ${bodyFatPts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="weight-result-fat-point"></circle>`).join('')}
      ${xLabels}
    </svg>
  `;
}

function _setContent(delta, checkins) {
  const titleEl = document.getElementById('weight-result-title');
  const msgEl = document.getElementById('weight-result-message');
  const graphEl = document.getElementById('weight-result-graph-wrap');
  const panel = document.getElementById('weight-result-panel');
  if (!titleEl || !msgEl || !graphEl || !panel) return;

  const deltaAbs = Math.abs(delta);
  let type = 'same';
  let title = '유지 중이에요!';
  if (delta <= -0.5) {
    type = 'big_loss';
    title = `${deltaAbs.toFixed(1)}kg 빠졌어요!`;
  } else if (delta <= -0.1) {
    type = 'slight_loss';
    title = `${deltaAbs.toFixed(1)}kg 가벼워졌어요!`;
  } else if (delta >= 0.1) {
    type = 'gain';
    title = `${deltaAbs.toFixed(1)}kg 늘었어요`;
  }

  panel.classList.toggle('is-loss', delta <= -0.1);
  panel.classList.toggle('is-gain', delta >= 0.1);
  titleEl.textContent = title;
  msgEl.textContent = _pickMessage(type, deltaAbs);
  graphEl.innerHTML = _buildWeightGraph(checkins);
}

export const MODAL_HTML = `
<div class="modal-backdrop" id="weight-result-modal" onclick="closeWeightResultModal(event)">
  <div class="modal-sheet weight-result-sheet" id="weight-result-panel">
    <div class="sheet-handle"></div>
    <div class="weight-result-hero">
      <div class="weight-result-kicker">체크인 완료</div>
      <div class="weight-result-title" id="weight-result-title"></div>
      <div class="weight-result-message" id="weight-result-message"></div>
    </div>
    <div class="weight-result-graph-wrap" id="weight-result-graph-wrap"></div>
    <button class="tds-btn fill md" style="width:100%;" onclick="closeWeightResultModal()">계속하기</button>
  </div>
</div>
`;

export function openWeightResultModal(delta, checkins) {
  _setContent(delta, checkins);
  if (delta <= -0.1 && window._showConfetti) window._showConfetti(delta <= -0.5 ? 3600 : 2400);
  window._openModal?.('weight-result-modal');
}

export function closeWeightResultModal(e) {
  window._closeModal?.('weight-result-modal', e);
}

Object.assign(window, {
  openWeightResultModal,
  closeWeightResultModal,
});
