export function truncateTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return n >= 0 ? Math.floor(n * f) / f : Math.ceil(n * f) / f;
}

export function formatMoneyExact(n: number, decimals = 2): string {
  const t = truncateTo(n, decimals);
  return `$${t.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatBpsExact(n: number, decimals = 0): string {
  const t = truncateTo(n, decimals);
  return `${t.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} BPS`;
}

export function formatPercentExact(n: number, decimals = 2): string {
  const t = truncateTo(n * 100, decimals);
  return `${t.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}