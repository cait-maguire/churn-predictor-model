// Strict plain-number parsing, matching the confirmed real export format
// (e.g. 119147 - no currency symbols, no thousands separators). Blank or
// unparseable values return null (never coerced to 0, since 0 would
// misrepresent a real zero-revenue loss) so they can be counted separately
// as a data-quality issue by the caller.
export function parseRevenue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const s = String(raw).trim();
  if (s === '') return null;

  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}
