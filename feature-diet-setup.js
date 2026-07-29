// ================================================================
// feature-diet-setup.js — 식단 탭 인라인 다이어트 설정
// ================================================================

import { showToast } from './ui/toast.js';

export async function submitDietSetup() {
  const h = parseFloat(document.getElementById('ds-height')?.value);
  const w = parseFloat(document.getElementById('ds-weight')?.value);
  const age = parseInt(document.getElementById('ds-age')?.value);
  const tw = parseFloat(document.getElementById('ds-target-weight')?.value);
  if (!h || !w || !age || !tw) { showToast('신장, 체중, 연령, 목표 체중을 입력해주세요', 2500, 'warning'); return; }

  // 체지방률: 미입력 시 BMI 기반 추정 (Deurenberg + 보수적 보정 -2%p)
  let bf = parseFloat(document.getElementById('ds-bodyfat')?.value);
  let bfEstimated = false;
  if (!bf) {
    const bmi = w / ((h / 100) ** 2);
    // Deurenberg(1991) 남성: 1.20*BMI + 0.23*나이 - 16.2, 보수적 보정 -2%p
    bf = Math.round((1.20 * bmi + 0.23 * age - 16.2 - 2) * 10) / 10;
    bf = Math.max(5, Math.min(bf, 40));
    bfEstimated = true;
  }
  let tbf = parseFloat(document.getElementById('ds-target-bf')?.value);
  if (!tbf) {
    const targetBmi = tw / ((h / 100) ** 2);
    tbf = Math.round((1.20 * targetBmi + 0.23 * age - 16.2 - 2) * 10) / 10;
    tbf = Math.max(5, Math.min(tbf, 35));
  }

  const btn = document.getElementById('ds-submit-btn');
  btn.textContent = '계산 중...'; btn.disabled = true;

  const { saveDietPlan } = await import('./data.js');
  await saveDietPlan({
    height: h, weight: w, bodyFatPct: bf, age,
    targetWeight: tw, targetBodyFatPct: tbf,
    startDate: new Date().toISOString().split('T')[0],
  });

  // 애니메이션: 설정 폼 → 칼로리 트래커
  const setup = document.getElementById('wt-diet-setup');
  setup.style.transition = 'opacity 0.3s, transform 0.3s';
  setup.style.opacity = '0';
  setup.style.transform = 'scale(0.95)';

  setTimeout(async () => {
    setup.style.display = 'none';
    // 칼로리 트래커 표시 (애니메이션)
    const tracker = document.getElementById('wt-calorie-tracker');
    tracker.style.display = 'block';
    tracker.style.opacity = '0';
    tracker.style.transform = 'translateY(-10px)';
    tracker.style.transition = 'opacity 0.4s, transform 0.4s';
    requestAnimationFrame(() => {
      tracker.style.opacity = '1';
      tracker.style.transform = 'translateY(0)';
    });
    // 다이어트 요약도 표시
    const summary = document.getElementById('wt-diet-summary');
    if (summary) {
      summary.style.opacity = '0';
      summary.style.transition = 'opacity 0.4s 0.15s';
      summary.style.display = 'block';
      requestAnimationFrame(() => { summary.style.opacity = '1'; });
    }
    // 데이터 리렌더
    const { loadWorkoutDate } = await import('./workout/load.js');
    const t = new Date();
    loadWorkoutDate(t.getFullYear(), t.getMonth(), t.getDate());
  }, 300);
}

// "설정" 버튼 → 인라인 폼 다시 열기
export async function openDietSetupInline() {
  const { getDietPlan } = await import('./data.js');
  const plan = getDietPlan();
  const setup = document.getElementById('wt-diet-setup');
  if (!setup) return;

  // 기존 값 채우기 (0은 빈칸 처리)
  document.getElementById('ds-height').value = plan.height || '';
  document.getElementById('ds-weight').value = plan.weight || '';
  document.getElementById('ds-bodyfat').value = plan.bodyFatPct || '';
  document.getElementById('ds-age').value = plan.age || '';
  document.getElementById('ds-target-weight').value = plan.targetWeight || '';
  document.getElementById('ds-target-bf').value = plan.targetBodyFatPct || '';
  document.getElementById('ds-submit-btn').textContent = '저장하기';
  document.getElementById('ds-submit-btn').disabled = false;

  // 칼로리 트래커 숨기고 폼 보이기
  const tracker = document.getElementById('wt-calorie-tracker');
  const summary = document.getElementById('wt-diet-summary');
  tracker.style.transition = 'opacity 0.2s';
  tracker.style.opacity = '0';
  if (summary) { summary.style.transition = 'opacity 0.2s'; summary.style.opacity = '0'; }

  setTimeout(() => {
    tracker.style.display = 'none';
    if (summary) summary.style.display = 'none';
    setup.style.display = 'block';
    setup.style.opacity = '0';
    setup.style.transform = 'scale(0.95)';
    setup.style.transition = 'opacity 0.3s, transform 0.3s';
    requestAnimationFrame(() => {
      setup.style.opacity = '1';
      setup.style.transform = 'scale(1)';
    });
  }, 200);
}
