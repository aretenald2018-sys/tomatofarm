// ── 날짜 유틸 ────────────────────────────────────────────────────
export const dateKey     = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
export const daysInMonth = (y,m)   => new Date(y,m+1,0).getDate();
export const TODAY       = (() => { const t=new Date(); t.setHours(0,0,0,0); return t; })();
export const isToday     = (y,m,d) => { const t=new Date(y,m,d);t.setHours(0,0,0,0);return t.getTime()===TODAY.getTime(); };
export const isFuture    = (y,m,d) => { const t=new Date(y,m,d);t.setHours(0,0,0,0);return t.getTime()>TODAY.getTime(); };
// 앱 시작일 이전: 2026-03-21
export const isBeforeStart = (y,m,d) => {
  const t=new Date(y,m,d); t.setHours(0,0,0,0);
  const start=new Date(2026,2,21); start.setHours(0,0,0,0);
  return t.getTime() < start.getTime();
};
