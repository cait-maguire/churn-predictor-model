import { SEGMENT_KEYS } from './fieldCatalog.js';

// Stage 1: raw rows (Stage 0, keyed by original header text) + a confirmed
// field map (canonical key -> original header string) -> MappedRow[] with
// canonical keys. This is the shape Phase 2 (non-churn case analysis) reuses
// unchanged.

function get(row, header) {
  if (!header) return null;
  const v = row[header];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

// fieldMap: { [canonicalKey]: originalHeaderString | null }
export function applyMapping(rawRows, fieldMap) {
  return rawRows.map((row, index) => {
    const segments = {};
    for (const key of SEGMENT_KEYS) segments[key] = get(row, fieldMap[key]);

    return {
      __rowIndex: index,
      accountKey: get(row, fieldMap.accountKey),
      revenueRaw: get(row, fieldMap.revenue),
      status: get(row, fieldMap.status),
      terminationDate: get(row, fieldMap.terminationDate),
      openDate: get(row, fieldMap.openDate),
      churnType: get(row, fieldMap.churnType),
      churnReason: get(row, fieldMap.churnReason),
      churnSubreason: get(row, fieldMap.churnSubreason),
      winBackAction: get(row, fieldMap.winBackAction),
      caseCrmUrl: get(row, fieldMap.caseCrmUrl),
      accountCrmUrl: get(row, fieldMap.accountCrmUrl),
      affiliateCrmUrl: get(row, fieldMap.affiliateCrmUrl),
      segments,
    };
  });
}

// A row is "entirely blank" if every field we mapped to is empty - these are
// dropped and counted separately from missing-key rows, per the plan.
export function isBlankRow(mappedRow) {
  const { __rowIndex, segments, ...fields } = mappedRow;
  return [...Object.values(fields), ...Object.values(segments)].every((v) => v === null);
}
