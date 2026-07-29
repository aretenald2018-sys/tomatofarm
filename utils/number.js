// Canonical permissive numeric coercion used at UI and device payload boundaries.
export function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
