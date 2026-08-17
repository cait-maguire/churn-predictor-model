// Unit tests for the Stage 4 training table (src/lib/trainingTable.js).
//
// Plain Node, no browser and no test framework - the module is pure
// functions over plain objects specifically so the leakage rules can be
// asserted directly. Run: npm run test:training-table
//
// The cases that matter here are the boundaries: a churn dated exactly on
// the cutoff, exactly on the horizon, and one day past it. Those are where
// a training table silently goes wrong, and where an off-by-one is
// invisible in aggregate statistics.

import assert from 'node:assert/strict';
import {
  buildTrainingTable,
  assignSplit,
  addDays,
  enumerateMonthEnds,
  parseMarket,
  slugify,
  toCsv,
  formatIsoDate,
} from '../src/lib/trainingTable.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}

// Builds a mapped row in the shape applyMapping produces.
let rowIndex = 0;
function caseRow({
  account = 'https://example.invalid/acct/1',
  name = 'Acme',
  caseUrl = null,
  open,
  churn = null,
  status = 'Closed',
  decision = 'Left',
  reason = null,
  subreason = null,
  market = '(NL) SME - Netherlands',
  team = '(NL) SME Nederland 1-50',
  type = 'AA All-in',
  revenue = '50000',
} = {}) {
  rowIndex += 1;
  return {
    __rowIndex: rowIndex,
    accountKey: name,
    accountCrmUrl: account,
    caseCrmUrl: caseUrl || `https://example.invalid/case/${rowIndex}`,
    revenueRaw: revenue,
    status,
    openDate: open,
    terminationDate: churn,
    churnType: 'Full Churn',
    churnReason: reason,
    churnSubreason: subreason,
    winBackAction: null,
    affiliateCrmUrl: null,
    segments: { decision, serviceMarket: market, serviceTeam: team, serviceType: type },
  };
}

// Disables the guards that would otherwise drop the rows under test, so a
// boundary assertion fails for the reason it is testing and not because the
// row was censored away.
const RAW = { censorAfterChurn: false, dropIncompleteLabelWindow: false, marketFilter: null };

function rowFor(result, asOfIso) {
  return result.rows.find((r) => r.as_of_month === asOfIso);
}

console.log('\nDate helpers');

test('addDays crosses a spring DST boundary by calendar days, not 24h blocks', () => {
  // 2024-01-31 + 90 calendar days is 2024-04-30 in every timezone. With
  // fixed-length millisecond arithmetic this lands on 04-30T01:00 in
  // Europe/Amsterdam and would compare wrong against a midnight churn date.
  const jan31 = new Date(2024, 0, 31).getTime();
  assert.equal(formatIsoDate(addDays(jan31, 90)), '2024-04-30');
});

test('addDays crosses an autumn DST boundary correctly', () => {
  const jul31 = new Date(2024, 6, 31).getTime();
  assert.equal(formatIsoDate(addDays(jul31, 90)), '2024-10-29');
});

test('enumerateMonthEnds yields inclusive month ends', () => {
  const months = enumerateMonthEnds(new Date(2024, 0, 15).getTime(), new Date(2024, 2, 10).getTime());
  assert.deepEqual(months.map(formatIsoDate), ['2024-01-31', '2024-02-29', '2024-03-31']);
});

console.log('\nLabel window boundaries (horizon = 90 days)');

test('churn exactly ON the cutoff is NOT labelled (window is strictly after)', () => {
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', churn: '3/31/2024' })], RAW);
  assert.equal(rowFor(result, '2024-03-31').label_left_90d, 0);
});

test('churn exactly 90 days after the cutoff IS labelled', () => {
  // 2024-01-31 + 90d = 2024-04-30.
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', churn: '4/30/2024' })], RAW);
  assert.equal(rowFor(result, '2024-01-31').label_left_90d, 1);
});

test('churn 91 days after the cutoff is NOT labelled', () => {
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', churn: '5/1/2024' })], RAW);
  assert.equal(rowFor(result, '2024-01-31').label_left_90d, 0);
  // ...but it is labelled from the following month end, which is in range.
  assert.equal(rowFor(result, '2024-02-29').label_left_90d, 1);
});

test('an open (not Closed) churn case never produces a label', () => {
  const result = buildTrainingTable(
    [caseRow({ open: '1/15/2024', churn: '3/15/2024', status: 'Open' })],
    RAW
  );
  assert.equal(rowFor(result, '2024-01-31').label_left_90d, 0);
});

test('a Closed case with a non-Left decision never produces a label', () => {
  const result = buildTrainingTable(
    [caseRow({ open: '1/15/2024', churn: '3/15/2024', decision: 'Retained' })],
    RAW
  );
  assert.equal(rowFor(result, '2024-01-31').label_left_90d, 0);
});

test('label_left_rev_90d carries account revenue only on positive rows', () => {
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', churn: '3/15/2024', revenue: '12345' })], RAW);
  assert.equal(rowFor(result, '2024-01-31').label_left_rev_90d, 12345);
  assert.equal(rowFor(result, '2024-03-31').label_left_rev_90d, 0);
});

console.log('\nFeature cutoff (leakage)');

test('a case opened exactly ON the cutoff counts as a feature', () => {
  const result = buildTrainingTable([caseRow({ open: '1/31/2024' })], RAW);
  assert.equal(rowFor(result, '2024-01-31').cases_30d, 1);
});

test('a case opened after the cutoff does not count', () => {
  const rows = [caseRow({ open: '1/15/2024' }), caseRow({ open: '2/5/2024' })];
  const result = buildTrainingTable(rows, RAW);
  assert.equal(rowFor(result, '2024-01-31').cases_30d, 1);
  assert.equal(rowFor(result, '2024-02-29').cases_30d, 1); // only the Feb case is within 30d
  assert.equal(rowFor(result, '2024-02-29').cases_90d, 2);
});

test('the 30-day window is exclusive at its lower edge', () => {
  // 2024-01-31 minus 30 days = 2024-01-01, so a case opened 1/1 is outside.
  const result = buildTrainingTable(
    [caseRow({ open: '1/1/2024' }), caseRow({ open: '1/2/2024' })],
    RAW
  );
  assert.equal(rowFor(result, '2024-01-31').cases_30d, 1);
  assert.equal(rowFor(result, '2024-01-31').cases_90d, 2);
});

test('service attributes come from the latest case at or before the cutoff', () => {
  const rows = [
    caseRow({ open: '1/15/2024', type: 'AA All-in' }),
    caseRow({ open: '3/15/2024', type: 'Payroll BPO' }),
  ];
  const result = buildTrainingTable(rows, RAW);
  assert.equal(rowFor(result, '2024-01-31').service_type, 'AA All-in');
  assert.equal(rowFor(result, '2024-03-31').service_type, 'Payroll BPO');
});

test('days_since_last_case measures to the cutoff', () => {
  // A second account only to extend the file's observable date range - the
  // spine cannot run past the latest date the export actually contains.
  const rows = [caseRow({ open: '1/15/2024' }), caseRow({ account: 'acct/anchor', open: '3/1/2024' })];
  const result = buildTrainingTable(rows, RAW);
  const forA = (iso) => result.rows.find((r) => r.as_of_month === iso && r.account_id !== 'acct/anchor');
  assert.equal(forA('2024-01-31').days_since_last_case, 16);
  assert.equal(forA('2024-02-29').days_since_last_case, 45);
});

console.log('\nDiagnostics and guards');

test('labeling_case_open_at_cutoff flags features built from the labelling case', () => {
  // The churn case is opened 1/15 and churns 3/15: at the 1/31 cutoff the
  // case is already open, so cases_30d is counting the very case that
  // defines the label.
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', churn: '3/15/2024' })], RAW);
  const row = rowFor(result, '2024-01-31');
  assert.equal(row.label_left_90d, 1);
  assert.equal(row.labeling_case_open_at_cutoff, 1);
  assert.equal(row.cases_30d, 1);
  assert.equal(result.summary.positivesWithLabelCaseAlreadyOpen, result.summary.positives);
});

test('post-churn months are censored out by default', () => {
  const rows = [caseRow({ open: '1/15/2024', churn: '3/15/2024' }), caseRow({ open: '9/1/2024' })];
  const result = buildTrainingTable(rows, { marketFilter: null, dropIncompleteLabelWindow: false });
  const months = result.rows.map((r) => r.as_of_month);
  // The account churns 2024-03-15, so 2024-03-31 is already past its exit:
  // the last row it can legitimately contribute is 2024-02-29.
  assert.deepEqual(months, ['2024-01-31', '2024-02-29']);
  assert.ok(result.summary.rowsDroppedPostChurn > 0);
});

test('rows whose label window extends past the data are dropped as right-censored', () => {
  // Latest observable date in the file is 2024-06-30, so any cutoff after
  // 2024-03-31 has an incomplete 90-day window and would score an
  // unexported churn as a negative.
  const rows = [caseRow({ open: '1/15/2024' }), caseRow({ open: '6/30/2024' })];
  const result = buildTrainingTable(rows, { marketFilter: null, censorAfterChurn: false });
  const months = result.rows.map((r) => r.as_of_month);
  assert.deepEqual(months, ['2024-01-31', '2024-02-29', '2024-03-31']);
  assert.equal(result.summary.rowsDroppedIncompleteLabelWindow, 3);
  assert.ok(result.rows.every((r) => r.label_window_complete === 1));
});

test('accounts enter the spine at their first case, not at file start', () => {
  const rows = [
    caseRow({ account: 'acct/A', open: '1/15/2024' }),
    caseRow({ account: 'acct/B', open: '4/10/2024' }),
  ];
  const result = buildTrainingTable(rows, RAW);
  const bMonths = result.rows.filter((r) => r.account_id === 'acct/B').map((r) => r.as_of_month);
  assert.equal(bMonths[0], '2024-04-30');
});

console.log('\nSegmentation, filtering and vocabulary');

test('market filter keeps whole accounts, not individual cases', () => {
  const rows = [
    caseRow({ account: 'acct/NL', open: '1/15/2024', market: '(NL) SME - Netherlands' }),
    caseRow({ account: 'acct/BE', open: '1/15/2024', market: '(BE) LME - Belgium' }),
  ];
  const result = buildTrainingTable(rows, { ...RAW, marketFilter: 'Netherlands' });
  assert.ok(result.rows.every((r) => r.account_id === 'acct/NL'));
  assert.equal(result.summary.accountsExcludedByMarketFilter, 1);
});

test('parseMarket splits country code and size segment', () => {
  assert.deepEqual(parseMarket('(NL) SME - Netherlands'), { countryCode: 'NL', sizeSegment: 'SME' });
  assert.deepEqual(parseMarket('(BE) LME - Belgium'), { countryCode: 'BE', sizeSegment: 'LME' });
  assert.deepEqual(parseMarket(null), { countryCode: null, sizeSegment: null });
});

test('spec flag columns match observed vocabulary case-insensitively', () => {
  const result = buildTrainingTable(
    [caseRow({ open: '1/15/2024', reason: 'service experience', subreason: 'Bankruptcy' })],
    RAW
  );
  const row = rowFor(result, '2024-01-31');
  assert.equal(row.svc_exp_cases_180d, 1);
  assert.equal(row.bankruptcy_cases_365d, 1);
});

test('unmatched spec columns are reported, not shipped as silent zeros', () => {
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', reason: 'Pricing' })], RAW);
  assert.ok(result.summary.unmatchedSpecColumns.includes('svc_exp_cases_180d'));
  assert.ok(!result.columns.includes('svc_exp_cases_180d'));
});

test('observed values with no spec column get auto-generated columns', () => {
  const result = buildTrainingTable([caseRow({ open: '1/15/2024', reason: 'Pricing' })], RAW);
  assert.ok(result.columns.includes('reason_pricing_cases_180d'));
  assert.equal(rowFor(result, '2024-01-31').reason_pricing_cases_180d, 1);
});

test('service_type_blank_rate_180d is a rate, null when the window is empty', () => {
  const rows = [caseRow({ open: '1/10/2024', type: 'AA All-in' }), caseRow({ open: '1/20/2024', type: null })];
  const result = buildTrainingTable(rows, RAW);
  assert.equal(rowFor(result, '2024-01-31').service_type_blank_rate_180d, 0.5);
});

test('slugify produces stable snake_case column fragments', () => {
  assert.equal(slugify('Incorrect calculations or advice'), 'incorrect_calculations_or_advice');
  assert.equal(slugify('Merger / acquisition'), 'merger_acquisition');
});

console.log('\nSplits');

test('split boundaries follow the configured dates', () => {
  const trainEnd = new Date(2024, 11, 31).getTime();
  const validateEnd = new Date(2025, 5, 30).getTime();
  const at = (y, m, d) => assignSplit(new Date(y, m, d).getTime(), 90, trainEnd, validateEnd);
  assert.equal(at(2024, 5, 30), 'train');
  assert.equal(at(2025, 2, 31), 'validate');
  assert.equal(at(2025, 8, 30), 'test');
});

test('rows whose label window crosses a split boundary are embargoed', () => {
  const trainEnd = new Date(2024, 11, 31).getTime();
  const validateEnd = new Date(2025, 5, 30).getTime();
  const at = (y, m, d) => assignSplit(new Date(y, m, d).getTime(), 90, trainEnd, validateEnd);
  assert.equal(at(2024, 9, 31), 'embargo'); // 2024-10-31 + 90d = 2025-01-29, past train end
  assert.equal(at(2024, 8, 30), 'train'); //   2024-09-30 + 90d = 2024-12-29, still inside train
  assert.equal(at(2025, 3, 30), 'embargo'); // 2025-04-30 + 90d = 2025-07-29, past validate end
});

console.log('\nCSV output');

test('toCsv quotes separators, quotes and newlines', () => {
  const csv = toCsv(['a', 'b'], [{ a: 'x,y', b: 'he said "hi"' }, { a: null, b: 'line\nbreak' }]);
  assert.equal(csv, 'a,b\n"x,y","he said ""hi"""\n,"line\nbreak"');
});

test('every declared column is present in every row', () => {
  const rows = [
    caseRow({ open: '1/15/2024', reason: 'Pricing', subreason: 'Budget cuts' }),
    caseRow({ account: 'acct/B', open: '2/1/2024', reason: 'External', subreason: 'Bankruptcy' }),
  ];
  const result = buildTrainingTable(rows, RAW);
  for (const row of result.rows) {
    for (const column of result.columns) {
      assert.ok(column in row, `column ${column} missing from row ${row.as_of_month}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
