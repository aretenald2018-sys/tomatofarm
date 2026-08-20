import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  W863_ORIGINAL_PROFILES,
  W863_ORIGINAL_VERSION,
  inferW863Profile,
  normalizeW863OriginalConfig,
  w863OriginalWeekPrescription,
} from '../workout/w863-original.js';

const EXPECTED_WEIGHTS = {
  squat: [
    [40,50,60,65,75,80,85,95,100,75,75,75,75,75],
    [40,50,60,70,80,85,90,100,105,80,80,80,80,80],
    [40,50,60,75,85,90,95,105,110,85,85,85,85,85],
    [40,50,60,65,75,80,90,95,120,75,75,75,75,75],
    [40,50,60,70,80,85,95,100,110,80,80,80,80,80],
    [40,50,60,75,85,90,100,105,115,85,85,85,85,85],
    [45,55,65],
  ],
  ohp: [
    [20,25,30,30,35,40,45,45,50,35,35,35,35,35],
    [20,25,30,35,40,40,45,50,55,40,40,40,40,40],
    [20,25,30,35,40,45,50,50,55,40,40,40,40,40],
    [20,25,30,30,40,40,45,50,60,40,40,40,40,40],
    [20,25,30,35,40,45,45,50,55,40,40,40,40,40],
    [20,25,30,40,45,45,50,55,55,45,45,45,45,45],
    [20,30,35],
  ],
  deadlift: [
    [45,55,65,70,80,85,95,100,110,80,80,80,80,80],
    [45,55,65,75,85,90,100,110,115,85,85,85,85,85],
    [45,55,65,80,90,95,105,115,120,90,90,90,90,90],
    [45,55,65,70,85,90,95,105,130,85,85,85,85,85],
    [45,55,65,75,90,95,100,110,120,90,90,90,90,90],
    [45,55,65,85,95,100,105,115,125,95,95,95,95,95],
    [50,60,70],
  ],
  bench: [
    [35,45,50,55,65,70,75,80,85,65,65,65,65,65],
    [35,45,50,60,70,70,80,85,90,70,70,70,70,70],
    [35,45,50,65,70,75,85,90,95,70,70,70,70,70],
    [25,45,50,55,65,70,75,85,105,65,65,65,65,65],
    [35,45,50,60,70,75,80,85,95,70,70,70,70,70],
    [35,45,50,65,75,80,85,90,100,75,75,75,75,75],
    [35,45,50],
  ],
};

const rowReps = (main, backoff, recovery = null) => recovery || [5, 5, 3, ...main, 1, 1, 1, ...Array(5).fill(backoff)];
const EXPECTED_REPS = {
  squat: [rowReps([8,8,8],4), rowReps([6,6,6],4), rowReps([8,6,3],4), rowReps([8,8,8],4), rowReps([6,6,6],4), rowReps([8,6,3],4), [5,5,5]],
  ohp: [rowReps([8,8,8],8), rowReps([6,6,6],8), rowReps([8,6,3],8), rowReps([8,6,8],8), rowReps([6,6,6],8), rowReps([8,6,3],8), [5,5,5]],
  deadlift: [rowReps([8,8,8],4), rowReps([6,6,6],4), rowReps([8,6,3],4), rowReps([8,6,8],4), rowReps([6,6,6],4), rowReps([8,6,3],4), [5,5,5]],
  bench: [rowReps([8,8,8],8), rowReps([6,6,6],8), rowReps([8,6,3],8), rowReps([8,6,8],8), rowReps([6,6,6],8), rowReps([8,6,3],8), [5,5,3]],
};

test('8/6/3 원본 4종 레퍼런스는 제공 표의 7주 중량을 정확히 보존한다', () => {
  for (const [profileId, weeks] of Object.entries(EXPECTED_WEIGHTS)) {
    const profile = W863_ORIGINAL_PROFILES[profileId];
    assert.equal(profile.weeks.length, 7);
    assert.deepEqual(profile.weeks.map(rows => rows.map(set => set.kg)), weeks, profileId);
    assert.deepEqual(profile.weeks.map(rows => rows.map(set => set.reps)), EXPECTED_REPS[profileId], `${profileId} reps`);
    for (let week = 1; week <= 6; week += 1) {
      const rx = w863OriginalWeekPrescription({ profileId, oneRmKg: profile.reference1RmKg, roundKg: 5 }, week);
      assert.equal(rx.requiredSets.length, 11 + rx.heavySingles.length, `${profileId} W${week}`);
      assert.equal(rx.sets.at(-1).amrap, true);
      assert.equal(rx.backoff.length, 5);
    }
  }
});

test('8/6/3 원본은 1RM 비례 스케일링하고 기준 1RM 초과 싱글만 선택 PR로 분리한다', () => {
  const rx = w863OriginalWeekPrescription({ profileId: 'squat', oneRmKg: 220, roundKg: 5 }, 4);
  assert.equal(rx.templateVersion, W863_ORIGINAL_VERSION);
  assert.deepEqual(rx.warmup.sets.map(set => set.kg), [80, 100, 120]);
  assert.deepEqual(rx.heavySingles.map(set => set.kg), [180, 190]);
  assert.deepEqual(rx.optionalSets.map(set => set.kg), [240]);
  assert.equal(rx.optionalSets[0].requiresConfirmation, true);
  assert.equal(rx.requiredSets.some(set => set.role === 'pr_attempt'), false);
});

test('8/6/3 원본 W7은 회복 세트만 반환한다', () => {
  const rx = w863OriginalWeekPrescription({ profileId: 'deadlift', oneRmKg: 120, roundKg: 5 }, 7);
  assert.equal(rx.warmup.enabled, false);
  assert.equal(rx.sets.length, 0);
  assert.equal(rx.heavySingles.length, 0);
  assert.equal(rx.optionalSets.length, 0);
  assert.deepEqual(rx.deload.map(set => [set.kg, set.reps, set.role]), [[50,5,'deload'], [60,5,'deload'], [70,5,'deload']]);
});

test('백오프는 기본 SSL(본세트2 무게)이고 FSL을 고르면 본세트1 무게로 낮아진다', () => {
  const base = { profileId: 'squat', oneRmKg: 110, roundKg: 5 };
  for (let week = 1; week <= 6; week += 1) {
    const ssl = w863OriginalWeekPrescription(base, week);
    const fsl = w863OriginalWeekPrescription({ ...base, backoffMode: 'fsl' }, week);
    assert.equal(ssl.backoffMode, 'ssl');
    assert.equal(fsl.backoffMode, 'fsl');
    // SSL = 본세트2 무게(원본 표 그대로), FSL = 본세트1 무게. 반복수/세트수는 그대로.
    assert.ok(ssl.backoff.every(set => set.kg === ssl.sets[1].kg), `W${week} ssl kg`);
    assert.ok(fsl.backoff.every(set => set.kg === fsl.sets[0].kg), `W${week} fsl kg`);
    assert.deepEqual(fsl.backoff.map(set => set.reps), ssl.backoff.map(set => set.reps));
    assert.equal(fsl.backoff.length, 5);
    assert.ok(ssl.backoff.every(set => set.supplementalKind === 'ssl'));
    assert.ok(fsl.backoff.every(set => set.supplementalKind === 'fsl'));
    // requiredSets에도 같은 백오프가 실린다(페인트 경로).
    assert.deepEqual(
      fsl.requiredSets.filter(set => set.role === 'backoff').map(set => set.kg),
      fsl.backoff.map(set => set.kg),
    );
  }
  // W7 디로드 주는 백오프가 없다.
  assert.equal(w863OriginalWeekPrescription({ ...base, backoffMode: 'fsl' }, 7).backoff.length, 0);
});

test('기존 w863는 운동명으로 프로필을 마이그레이션하고 TM을 1RM으로 환산한다', () => {
  assert.equal(inferW863Profile({ label: '스모데드' }), 'deadlift');
  assert.equal(inferW863Profile({ label: '스쿼트(와이드)' }), 'squat');
  const cfg = normalizeW863OriginalConfig({ scheme: 'w863', tmKg: 99, roundKg: 2.5 }, { label: '스모데드' });
  assert.equal(cfg.profileId, 'deadlift');
  assert.equal(cfg.oneRmKg, 110);
  assert.equal(cfg.tmKg, 99);
  assert.equal(cfg.weeks, 7);
});
