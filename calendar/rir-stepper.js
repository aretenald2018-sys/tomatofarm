// Missing is distinct from a recorded zero. Display never invents a value.
export function readWorkoutRir(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10 ? number : null;
}

// Match the existing new-set default only on an explicit first tap:
// missing − → 1.5, missing + → 2.5. Do not quantize existing decimal RIR.
export function stepWorkoutRir(value, direction) {
  const step = Number(direction);
  if (step !== -1 && step !== 1) return null;
  const current = readWorkoutRir(value) ?? 2;
  return Math.max(0, Math.min(10, Number((current + step * 0.5).toFixed(10))));
}
