// Parses Termination Date / Start Date values into a comparable timestamp
// (milliseconds since epoch), handling the confirmed real format (M/D/YYYY
// text, e.g. "7/23/2025") as well as plain Date objects (e.g. if the XLSX
// parser resolves a real date-typed cell) and Excel serial-date numbers.
// Returns null when unparseable, never a guessed/fallback date.
export function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }

  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30).
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return Number.isFinite(ms) ? ms : null;
  }

  const s = String(raw).trim();
  if (s === '') return null;

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}
