import { parseRevenue } from './revenueParser.js';
import { parseDate } from './dateParser.js';

const SEGMENT_KEYS = ['serviceSegment', 'serviceType', 'sdWorxCustomerType', 'affiliate', 'groupId'];

// Picks the first non-blank value in original row order, per the confirmed
// conflict-resolution rule. Also reports whether the group actually
// disagreed (more than one distinct non-blank value seen).
function resolveFirstNonBlank(rowsInOrder, getter) {
  let value = null;
  const distinct = new Set();
  for (const row of rowsInOrder) {
    const v = getter(row);
    if (v === null || v === undefined || v === '') continue;
    distinct.add(typeof v === 'string' ? v.trim() : v);
    if (value === null) value = typeof v === 'string' ? v.trim() : v;
  }
  return { value, conflict: distinct.size > 1 };
}

// Revenue conflict compares *parsed* numeric values (rounded to 2dp) so
// formatting noise doesn't produce false-positive conflicts; the resolved
// value is still the first non-blank raw value, parsed.
function resolveRevenue(rowsInOrder) {
  let rawValue = null;
  const distinctParsed = new Set();
  for (const row of rowsInOrder) {
    const parsed = parseRevenue(row.revenueRaw);
    if (parsed === null) continue;
    distinctParsed.add(Math.round(parsed * 100) / 100);
    if (rawValue === null) rawValue = row.revenueRaw;
  }
  return {
    value: rawValue === null ? null : parseRevenue(rawValue),
    conflict: distinctParsed.size > 1,
  };
}

// Picks the churn case with the latest Termination Date for a given account
// (the "one churn case per account is the norm" rule) - ties broken by
// original row order (last one in the file wins), for determinism.
function pickCanonicalCase(rowsInOrder) {
  let best = null;
  let bestTimestamp = -Infinity;
  for (const row of rowsInOrder) {
    const timestamp = parseDate(row.terminationDate);
    const comparable = timestamp === null ? -Infinity : timestamp;
    if (best === null || comparable > bestTimestamp || (comparable === bestTimestamp && row.__rowIndex > best.__rowIndex)) {
      best = row;
      bestTimestamp = comparable;
    }
  }
  return {
    caseNb: best.caseNb,
    terminationDate: best.terminationDate,
    terminationTimestamp: bestTimestamp === -Infinity ? null : bestTimestamp,
    churnReason: best.churnReason,
    churnSubreason: best.churnSubreason,
    decision: best.decision,
    winBackAction: best.winBackAction,
    __rowIndex: best.__rowIndex,
  };
}

// Stage 3: churn case rows (Stage 2 output) -> churned-customer records,
// one per distinct companyNo, plus a report of churn-rollup-specific data
// quality issues. Rows with a blank/missing companyNo cannot be attributed
// to an account and are excluded from rollup (counted, never silently
// dropped without a visible count).
export function rollupChurnedCustomers(churnCaseRows) {
  const excludedMissingJoinKey = [];
  const groups = new Map();

  for (const row of churnCaseRows) {
    if (row.companyNo === null) {
      excludedMissingJoinKey.push(row);
      continue;
    }
    if (!groups.has(row.companyNo)) groups.set(row.companyNo, []);
    groups.get(row.companyNo).push(row);
  }

  const customers = [];
  const conflicts = { revenue: [], serviceSegment: [], serviceType: [], sdWorxCustomerType: [], affiliate: [], groupId: [] };
  const accountsWithDuplicateChurnCases = [];
  let rowsMissingRevenue = 0;

  for (const [companyNo, rows] of groups) {
    const rowsInOrder = [...rows].sort((a, b) => a.__rowIndex - b.__rowIndex);

    const accountName = resolveFirstNonBlank(rowsInOrder, (r) => r.accountName);
    const revenue = resolveRevenue(rowsInOrder);

    const segments = {};
    for (const key of SEGMENT_KEYS) {
      const resolved = resolveFirstNonBlank(rowsInOrder, (r) => r.segments[key]);
      segments[key] = resolved;
      if (resolved.conflict) conflicts[key].push(companyNo);
    }
    if (revenue.conflict) conflicts.revenue.push(companyNo);

    for (const row of rowsInOrder) {
      if (parseRevenue(row.revenueRaw) === null) rowsMissingRevenue += 1;
    }

    const hasDuplicateChurnCases = rowsInOrder.length > 1;
    if (hasDuplicateChurnCases) accountsWithDuplicateChurnCases.push(companyNo);

    customers.push({
      companyNo,
      accountName: accountName.value,
      revenue: revenue.value,
      revenueConflict: revenue.conflict,
      segments,
      canonicalCase: pickCanonicalCase(rowsInOrder),
      hasDuplicateChurnCases,
      allCases: rowsInOrder.map((r) => ({
        caseNb: r.caseNb,
        terminationDate: r.terminationDate,
        terminationTimestamp: parseDate(r.terminationDate),
        churnReason: r.churnReason,
        churnSubreason: r.churnSubreason,
        decision: r.decision,
        winBackAction: r.winBackAction,
        __rowIndex: r.__rowIndex,
      })),
    });
  }

  const report = {
    totalChurnCases: churnCaseRows.length,
    totalChurnedCustomers: customers.length,
    excludedMissingJoinKeyCount: excludedMissingJoinKey.length,
    rowsMissingRevenue,
    conflicts,
    accountsWithDuplicateChurnCases,
  };

  return { customers, report };
}
