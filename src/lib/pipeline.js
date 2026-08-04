import { applyMapping, isBlankRow } from './applyMapping.js';
import { filterChurnCases } from './churnFilter.js';
import { rollupChurnedCustomers } from './rollup.js';

// Orchestrates Stages 1-3 and assembles the full data-quality report by
// combining whole-file stats (blank rows) with the churn-rollup-specific
// stats from rollup.js. Kept separate from rollup.js so that stage is only
// ever handed churn case rows and stays focused on the account-level
// grouping logic Phase 2 will also need to reuse.
export function runPipeline(rawRows, fieldMap) {
  const mappedRows = applyMapping(rawRows, fieldMap);

  const blankRows = mappedRows.filter(isBlankRow);
  const nonBlankRows = mappedRows.filter((r) => !isBlankRow(r));

  const churnCaseRows = filterChurnCases(nonBlankRows);
  const { customers, report: rollupReport } = rollupChurnedCustomers(churnCaseRows);

  const report = {
    totalRowsParsed: rawRows.length,
    blankRowsDropped: blankRows.length,
    ...rollupReport,
  };

  return { customers, report };
}
