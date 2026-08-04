// Shared segment x category cross-tab used by the stacked "by segment &
// churn reason" and "by segment & churn subreason" widgets. Kept separate
// so both read from one implementation of the counting/sorting rules.

export function getSegmentValue(customer, fieldKey) {
  return customer.segments[fieldKey]?.value ?? null;
}

function isBlank(v) {
  return v === null || v === undefined || v === '';
}

// getCategory: customer -> the value to stack by (churn reason or subreason).
// Returns segment values and categories each sorted by total count descending.
export function buildSegmentMatrix(customers, segmentFieldKey, getCategory) {
  const matrix = new Map(); // segmentValue -> Map<category, count>
  const segmentTotals = new Map();
  const categoryTotals = new Map();
  let blankSegmentCount = 0;
  let blankCategoryCount = 0;

  for (const customer of customers) {
    const segValue = getSegmentValue(customer, segmentFieldKey);
    if (isBlank(segValue)) { blankSegmentCount += 1; continue; }
    const category = getCategory(customer);
    if (isBlank(category)) { blankCategoryCount += 1; continue; }

    if (!matrix.has(segValue)) matrix.set(segValue, new Map());
    const row = matrix.get(segValue);
    row.set(category, (row.get(category) || 0) + 1);
    segmentTotals.set(segValue, (segmentTotals.get(segValue) || 0) + 1);
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
  }

  const byCountDesc = (a, b) => b[1] - a[1];
  return {
    matrix,
    segmentTotals,
    categoryTotals,
    segmentValues: [...segmentTotals.entries()].sort(byCountDesc).map(([v]) => v),
    categories: [...categoryTotals.entries()].sort(byCountDesc).map(([c]) => c),
    blankSegmentCount,
    blankCategoryCount,
  };
}

// Maps each subreason to the churn reason it appears under, so subreasons
// can be colored as shades of their parent reason. If the same subreason
// text appears under more than one reason (possible in messy data), the
// most frequent parent wins, and the conflict is reported so the UI can
// mention it rather than silently picking one.
export function buildSubreasonParentMap(customers) {
  const counts = new Map(); // subreason -> Map<reason, count>
  for (const customer of customers) {
    const { churnReason, churnSubreason } = customer.canonicalCase;
    if (isBlank(churnSubreason)) continue;
    if (!counts.has(churnSubreason)) counts.set(churnSubreason, new Map());
    const m = counts.get(churnSubreason);
    const key = isBlank(churnReason) ? null : churnReason;
    m.set(key, (m.get(key) || 0) + 1);
  }

  const parentOf = new Map();
  const ambiguous = [];
  for (const [subreason, reasonCounts] of counts) {
    const sorted = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
    parentOf.set(subreason, sorted[0][0]);
    if (sorted.length > 1) ambiguous.push(subreason);
  }
  return { parentOf, ambiguous };
}
