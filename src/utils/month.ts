export function normalizeMonthInput(s: string) {
  const t = String(s ?? '').trim().replace(/\//g, '-'); // allow 2025/6 or 2025-6
  const m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (!m) throw new Error('Invalid month — use YYYY-MM');
  const y = +m[1], mm = +m[2]; 
  if (mm < 1 || mm > 12) throw new Error('Invalid month — use 01–12');
  return `${y}-${String(mm).padStart(2,'0')}`; // e.g., 2025-06
}