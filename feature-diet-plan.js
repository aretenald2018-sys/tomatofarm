// ================================================================
// feature-diet-plan.js — 다이어트 플랜 모달
// ================================================================

import { getDietPlan, saveDietPlan, calcDietMetrics } from './data.js';
import { showToast } from './render-home.js';

async function openDietPlanModal() {
  if (!document.getElementById('dp-height')) {
    const { loadAndInjectModals } = await import('./modal-manager.js');
    await loadAndInjectModals();
  }
  if (!document.getElementById('dp-height')) { console.error('[diet] modal not found'); return; }
  const plan = getDietPlan();
  const hasData = plan._userSet;
  document.getElementById('dp-height').value       = hasData ? (plan.height || '') : '';
  document.getElementById('dp-age').value          = hasData ? (plan.age || '') : '';
  document.getElementById('dp-weight').value       = hasData ? (plan.weight || '') : '';
  document.getElementById('dp-bodyfat').value      = hasData ? (plan.bodyFatPct || '') : '';
  document.getElementById('dp-target-weight').value= hasData ? (plan.targetWeight || '') : '';
  document.getElementById('dp-target-bf').value    = hasData ? (plan.targetBodyFatPct || '') : '';
  document.getElementById('dp-start-date').value   = hasData ? (plan.startDate || '') : '';

  const refeedDays = plan.refeedDays || [0, 6];
  document.querySelectorAll('.refeed-day-btn').forEach(btn => {
    btn.classList.toggle('active', refeedDays.includes(parseInt(btn.dataset.dow)));
    btn.onclick = () => {
      btn.classList.toggle('active');
      _updateDietCalcPreview();
    };
  });

  const advSwitch = document.getElementById('dp-advanced-switch');
  const advBody   = document.getElementById('dp-advanced-body');
  const isAdv     = !!plan.advancedMode;
  advSwitch.classList.toggle('on', isAdv);
  advBody.style.display = isAdv ? '' : 'none';

  const toggleArea = document.getElementById('dp-advanced-toggle');
  toggleArea.onclick = () => {
    const on = advSwitch.classList.toggle('on');
    advBody.style.display = on ? '' : 'none';
  };

  const dpLossRate = document.getElementById('dp-loss-rate');
  if (dpLossRate) dpLossRate.value = plan.lossRatePerWeek || 0.009;
  const actAdv = document.getElementById('dp-activity-adv');
  if (actAdv) actAdv.value = plan.activityFactor || 1.3;
  const dpRefeedKcal = document.getElementById('dp-refeed-kcal');
  if (dpRefeedKcal) dpRefeedKcal.value = plan.refeedKcal || 5000;

  const dpDefP = document.getElementById('dp-def-protein');
  const dpDefC = document.getElementById('dp-def-carb');
  const dpDefF = document.getElementById('dp-def-fat');
  if (dpDefP) dpDefP.value = plan.deficitProteinPct ?? 41;
  if (dpDefC) dpDefC.value = plan.deficitCarbPct ?? 50;
  if (dpDefF) dpDefF.value = plan.deficitFatPct ?? 9;

  const dpRefP = document.getElementById('dp-ref-protein');
  const dpRefC = document.getElementById('dp-ref-carb');
  const dpRefF = document.getElementById('dp-ref-fat');
  if (dpRefP) dpRefP.value = plan.refeedProteinPct ?? 29;
  if (dpRefC) dpRefC.value = plan.refeedCarbPct ?? 60;
  if (dpRefF) dpRefF.value = plan.refeedFatPct ?? 11;

  const dpTol = document.getElementById('dp-tolerance');
  if (dpTol) dpTol.value = plan.dietTolerance ?? 50;

  const exSwitch = document.getElementById('dp-exercise-credit-switch');
  const exBody   = document.getElementById('dp-exercise-credit-body');
  const isExOn   = !!plan.exerciseCalorieCredit;
  exSwitch.classList.toggle('on', isExOn);
  exBody.style.display = isExOn ? '' : 'none';
  exSwitch.onclick = (ev) => {
    ev.stopPropagation();
    const on = exSwitch.classList.toggle('on');
    exBody.style.display = on ? '' : 'none';
  };

  const dpExGym  = document.getElementById('dp-ex-gym');
  const dpExCF   = document.getElementById('dp-ex-cf');
  const dpExSwim = document.getElementById('dp-ex-swim');
  const dpExRun  = document.getElementById('dp-ex-run');
  if (dpExGym)  dpExGym.value  = plan.exerciseKcalGym ?? 250;
  if (dpExCF)   dpExCF.value   = plan.exerciseKcalCF ?? 300;
  if (dpExSwim) dpExSwim.value = plan.exerciseKcalSwimming ?? 200;
  if (dpExRun)  dpExRun.value  = plan.exerciseKcalRunning ?? 250;

  _updateMacroSum('dp-def-protein', 'dp-def-carb', 'dp-def-fat', 'dp-def-macro-sum');
  _updateMacroSum('dp-ref-protein', 'dp-ref-carb', 'dp-ref-fat', 'dp-ref-macro-sum');

  _updateDietCalcPreview();

  ['dp-height','dp-age','dp-weight','dp-bodyfat','dp-target-weight','dp-target-bf',
   'dp-loss-rate','dp-refeed-kcal','dp-activity-adv',
   'dp-def-protein','dp-def-carb','dp-def-fat',
   'dp-ref-protein','dp-ref-carb','dp-ref-fat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = () => {
      _updateDietCalcPreview();
      _updateMacroSum('dp-def-protein', 'dp-def-carb', 'dp-def-fat', 'dp-def-macro-sum');
      _updateMacroSum('dp-ref-protein', 'dp-ref-carb', 'dp-ref-fat', 'dp-ref-macro-sum');
    };
  });

  document.getElementById('diet-plan-modal').classList.add('open');
}

function _updateMacroSum(pId, cId, fId, sumId) {
  const p = parseFloat(document.getElementById(pId)?.value) || 0;
  const c = parseFloat(document.getElementById(cId)?.value) || 0;
  const f = parseFloat(document.getElementById(fId)?.value) || 0;
  const sum = p + c + f;
  const el = document.getElementById(sumId);
  if (!el) return;
  el.textContent = `합계: ${sum}%`;
  el.className = 'dp-adv-macro-sum ' + (sum === 100 ? 'ok' : 'bad');
}

function _updateDietCalcPreview() {
  const preview = document.getElementById('dp-calc-preview');
  if (!preview) return;
  const isAdvanced = document.getElementById('dp-advanced-switch')?.classList.contains('on');
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || 0,
    age:              parseFloat(document.getElementById('dp-age').value)          || 0,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || 0,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || 0,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| 0,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || 0,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   isAdvanced ? (parseFloat(document.getElementById('dp-activity-adv')?.value) || 1.3) : 1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
    deficitProteinPct: isAdvanced ? (parseFloat(document.getElementById('dp-def-protein')?.value) || 41) : 41,
    deficitCarbPct:    isAdvanced ? (parseFloat(document.getElementById('dp-def-carb')?.value) || 50) : 50,
    deficitFatPct:     isAdvanced ? (parseFloat(document.getElementById('dp-def-fat')?.value) || 9) : 9,
    refeedProteinPct:  isAdvanced ? (parseFloat(document.getElementById('dp-ref-protein')?.value) || 29) : 29,
    refeedCarbPct:     isAdvanced ? (parseFloat(document.getElementById('dp-ref-carb')?.value) || 60) : 60,
    refeedFatPct:      isAdvanced ? (parseFloat(document.getElementById('dp-ref-fat')?.value) || 11) : 11,
  };
  if (!plan.weight || !plan.height || !plan.age) { preview.innerHTML = ''; return; }
  try {
    const m = calcDietMetrics(plan);
    preview.innerHTML = `
      <div class="diet-calc-row"><span>기초대사량(BMR)</span><strong>${m.bmr.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>유지대사량(TDEE)</span><strong>${m.tdee.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>제지방량(LBM)</span><strong>${m.lbm.toFixed(1)} kg</strong></div>
      <div class="diet-calc-row"><span>데피싯 데이 목표</span><strong>${m.deficit.kcal.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>리피드 데이 목표</span><strong>${m.refeed.kcal.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>주당 예상 감량</span><strong>${m.weeklyLossG}g</strong></div>
      <div class="diet-calc-row"><span>예상 기간</span><strong>약 ${Math.ceil(m.weeksNeeded)}주</strong></div>
    `;
  } catch(e) { preview.innerHTML = ''; }
}

function closeDietPlanModal(e) { window._closeModal('diet-plan-modal', e); }

async function saveDietPlanFromModal() {
  const refeedDays = [...document.querySelectorAll('.refeed-day-btn.active')]
    .map(b => parseInt(b.dataset.dow));
  const isAdvanced = document.getElementById('dp-advanced-switch')?.classList.contains('on');
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || null,
    age:              parseFloat(document.getElementById('dp-age').value)          || null,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || null,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || null,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| null,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || null,
    startDate:        document.getElementById('dp-start-date').value               || null,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   isAdvanced ? (parseFloat(document.getElementById('dp-activity-adv')?.value) || 1.3) : 1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
    refeedDays,
    advancedMode:       isAdvanced,
    deficitProteinPct:  isAdvanced ? (parseFloat(document.getElementById('dp-def-protein')?.value) || 41) : 41,
    deficitCarbPct:     isAdvanced ? (parseFloat(document.getElementById('dp-def-carb')?.value) || 50) : 50,
    deficitFatPct:      isAdvanced ? (parseFloat(document.getElementById('dp-def-fat')?.value) || 9) : 9,
    refeedProteinPct:   isAdvanced ? (parseFloat(document.getElementById('dp-ref-protein')?.value) || 29) : 29,
    refeedCarbPct:      isAdvanced ? (parseFloat(document.getElementById('dp-ref-carb')?.value) || 60) : 60,
    refeedFatPct:       isAdvanced ? (parseFloat(document.getElementById('dp-ref-fat')?.value) || 11) : 11,
    dietTolerance:      isAdvanced ? (parseFloat(document.getElementById('dp-tolerance')?.value) ?? 50) : 50,
    exerciseCalorieCredit: isAdvanced && document.getElementById('dp-exercise-credit-switch')?.classList.contains('on'),
    exerciseKcalGym:    parseFloat(document.getElementById('dp-ex-gym')?.value) || 250,
    exerciseKcalCF:     parseFloat(document.getElementById('dp-ex-cf')?.value) || 300,
    exerciseKcalSwimming: parseFloat(document.getElementById('dp-ex-swim')?.value) || 200,
    exerciseKcalRunning: parseFloat(document.getElementById('dp-ex-run')?.value) || 250,
  };
  if (!plan.weight || !plan.height) { alert('키와 체중을 입력해주세요.'); return; }
  if (isAdvanced) {
    const defSum = plan.deficitProteinPct + plan.deficitCarbPct + plan.deficitFatPct;
    const refSum = plan.refeedProteinPct + plan.refeedCarbPct + plan.refeedFatPct;
    if (defSum !== 100 || refSum !== 100) {
      alert(`매크로 비율 합계가 100%가 아닙니다.\n데피싯: ${defSum}% / 리피드: ${refSum}%`);
      return;
    }
  }
  await saveDietPlan(plan);
  document.getElementById('diet-plan-modal').classList.remove('open');
  showToast('플랜이 저장되었습니다');
  window.renderAll();
}

Object.assign(window, {
  openDietPlanModal,
  closeDietPlanModal,
  saveDietPlanFromModal,
});
