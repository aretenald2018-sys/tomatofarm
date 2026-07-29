export function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;

  const y = Number(match[1]);
  const month = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isInteger(y) || !Number.isInteger(month) || !Number.isInteger(d)) return null;

  const date = new Date(y, month - 1, d);
  if (
    date.getFullYear() !== y
    || date.getMonth() !== month - 1
    || date.getDate() !== d
  ) return null;

  return { y, m: month - 1, d, date };
}

export function dateFromKey(key) {
  return parseDateKey(key)?.date || null;
}
