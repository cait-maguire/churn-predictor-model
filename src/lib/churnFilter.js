// Stage 2: MappedRow[] -> churn case rows only.
//
// The export is already a churn report (every row is a churn case), so the
// churn definition is Case Status = "Closed" - case-insensitive and
// trimmed, since real exports may have inconsistent casing. Open cases are
// churn attempts still in progress and are excluded from every count.
//
// Keeps the full mapped-row shape (not yet grouped by account) so
// case-level detail stays available for the data-quality drill-down.

function normalizeEquals(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

export function isChurnCase(mappedRow) {
  return normalizeEquals(mappedRow.status, 'closed');
}

export function filterChurnCases(mappedRows) {
  return mappedRows.filter(isChurnCase);
}
