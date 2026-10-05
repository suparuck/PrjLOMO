export const fmt = (n: number, d = 0) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
