import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcWeeklyDietMacroChange } from '../calc.js';

test('calcWeeklyDietMacroChange · raw meal macro fields compare daily averages', () => {
  const result = calcWeeklyDietMacroChange(
    [{ bProtein: 30, lProtein: 20 }, { dProtein: 40 }],
    [{ bProtein: 20, lProtein: 20 }, { dProtein: 30 }],
  );
  assert.deepEqual(result, { status:'ready', currentAvgProteinG:45, previousAvgProteinG:35, deltaPct:28.6 });
});
test('calcWeeklyDietMacroChange · direct protein summaries are supported', () => {
  const result = calcWeeklyDietMacroChange([{ protein:59 }], [{ protein:50 }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.deltaPct, 18);
});
test('calcWeeklyDietMacroChange · zero baseline is collecting', () => {
  const result = calcWeeklyDietMacroChange([{ protein:40 }], [{ protein:0 }]);
  assert.equal(result.status, 'collecting');
  assert.equal(result.deltaPct, null);
});
