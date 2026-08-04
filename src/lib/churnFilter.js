// Stage 2: MappedRow[] -> churn case rows only, per the confirmed churn
// definition: Case Record Type == "Churn" AND Status == "Closed"
// (case-insensitive, trimmed - real exports may have inconsistent casing).
// Keeps the full mapped-row shape (not yet grouped by account) so
// case-level detail stays available for the data-quality drill-down.

function normalizeEquals(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

export function isChurnCase(mappedRow) {
  return normalizeEquals(mappedRow.caseRecordType, 'churn') && normalizeEquals(mappedRow.status, 'closed');
}

export function filterChurnCases(mappedRows) {
  return mappedRows.filter(isChurnCase);
}
