// Unit tests for the source-agnostic analysis layer: column profiling,
// role inference, and (below) the findings engine.
//
// The point of these tests is that the same code reaches sensible
// conclusions about three differently-shaped exports - churn, complaints
// and NPS - without any of them being special-cased. Run: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Papa from 'papaparse';

import { profileColumns, COLUMN_TYPE } from '../src/lib/profileColumns.js';
import { suggestRoles, dimensionsFor, ROLE, missingRequiredRoles } from '../src/lib/roles.js';
import { buildFindings, buildRecords, amountIsPerEntity, twoProportionP } from '../src/lib/findings.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function loadFixture(name) {
  const text = readFileSync(path.join(rootDir, 'fixtures', name), 'utf8');
  const { data, meta } = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
  return { rows: data, headers: meta.fields };
}

const churn = loadFixture('sample-churn-export.csv');
const complaints = loadFixture('sample-complaints-export.csv');
const nps = loadFixture('sample-nps-export.csv');

const profileOf = (fixture) => {
  const profiles = profileColumns(fixture.rows, fixture.headers);
  return { profiles, byHeader: Object.fromEntries(profiles.map((p) => [p.header, p])) };
};

const churnP = profileOf(churn);
const complaintsP = profileOf(complaints);
const npsP = profileOf(nps);

console.log('\nColumn profiling — type inference');

test('date columns are detected across all three exports', () => {
  assert.equal(churnP.byHeader['Churn Date'].type, COLUMN_TYPE.DATE);
  assert.equal(complaintsP.byHeader['Date Resolved'].type, COLUMN_TYPE.DATE);
  assert.equal(npsP.byHeader['Response Date'].type, COLUMN_TYPE.DATE);
});

test('a 0-10 integer rating is a SCORE, not a plain number', () => {
  assert.equal(npsP.byHeader['NPS Score'].type, COLUMN_TYPE.SCORE);
});

test('a money column is a NUMBER, not a score', () => {
  assert.equal(complaintsP.byHeader['Contract Value'].type, COLUMN_TYPE.NUMBER);
  assert.equal(churnP.byHeader['Revenue'].type, COLUMN_TYPE.NUMBER);
});

test('a numeric column is never mistaken for a date', () => {
  // Excel serial-date parsing will happily turn 7 into a date; the profiler
  // must not let it, or every NPS score column becomes a timeline.
  assert.notEqual(npsP.byHeader['NPS Score'].type, COLUMN_TYPE.DATE);
  assert.notEqual(complaintsP.byHeader['Contract Value'].type, COLUMN_TYPE.DATE);
});

test('URL columns are identifiers, not categories to group by', () => {
  assert.equal(churnP.byHeader['Case Crm Url'].type, COLUMN_TYPE.ID);
});

test('low-cardinality text columns are categories', () => {
  assert.equal(complaintsP.byHeader['Complaint Category'].type, COLUMN_TYPE.CATEGORY);
  assert.equal(complaintsP.byHeader['Region'].type, COLUMN_TYPE.CATEGORY);
  assert.equal(npsP.byHeader['Segment'].type, COLUMN_TYPE.CATEGORY);
});

test('profiles carry completeness and cardinality', () => {
  const region = complaintsP.byHeader['Region'];
  assert.equal(region.distinctCount, 4);
  assert.equal(region.nullCount, 0);
  assert.ok(region.topValues[0].count > 0);
});

console.log('\nRole inference — no export is special-cased');

test('complaints export: entity, dates, amount and outcome all found', () => {
  const roles = suggestRoles(complaintsP.profiles);
  assert.equal(roles[ROLE.ENTITY], 'Customer Name');
  assert.equal(roles[ROLE.EVENT_DATE], 'Date Resolved');
  assert.equal(roles[ROLE.START_DATE], 'Date Raised');
  assert.equal(roles[ROLE.AMOUNT], 'Contract Value');
  assert.equal(roles[ROLE.OUTCOME], 'Resolution');
  assert.equal(roles[ROLE.REASON], 'Complaint Category');
  assert.equal(missingRequiredRoles(roles).length, 0);
});

test('NPS export: the score role is filled and no amount is invented', () => {
  const roles = suggestRoles(npsP.profiles);
  assert.equal(roles[ROLE.ENTITY], 'Client');
  assert.equal(roles[ROLE.EVENT_DATE], 'Response Date');
  assert.equal(roles[ROLE.SCORE], 'NPS Score');
  assert.equal(roles[ROLE.AMOUNT], null);
  assert.equal(roles[ROLE.REASON], 'Primary Driver');
  assert.equal(missingRequiredRoles(roles).length, 0);
});

test('churn export: the Phase 1 format still maps correctly', () => {
  const roles = suggestRoles(churnP.profiles);
  assert.equal(roles[ROLE.EVENT_DATE], 'Churn Date');
  assert.equal(roles[ROLE.START_DATE], 'Open Date');
  assert.equal(roles[ROLE.AMOUNT], 'Revenue');
  assert.equal(roles[ROLE.REASON], 'Case Churn Reason');
  assert.equal(roles[ROLE.SUBREASON], 'Case Churn Subreason');
  assert.equal(missingRequiredRoles(roles).length, 0);
});

test('one column never fills two roles', () => {
  for (const profiles of [churnP.profiles, complaintsP.profiles, npsP.profiles]) {
    const used = Object.values(suggestRoles(profiles)).filter(Boolean);
    assert.equal(used.length, new Set(used).size);
  }
});

test('unclaimed categorical columns remain available as dimensions', () => {
  const roles = suggestRoles(complaintsP.profiles);
  const dims = dimensionsFor(complaintsP.profiles, roles);
  // Channel and Handling Team have no named role but are still analysable.
  assert.ok(dims.includes('Channel'));
  assert.ok(dims.includes('Handling Team'));
  assert.ok(dims.includes('Region'));
  // The entity and identifier columns must never become breakdown axes.
  assert.ok(!dims.includes('Customer Name'));
  assert.ok(!dims.includes('Complaint Reference'));
});

test('reason and outcome stay in the dimension sweep', () => {
  const roles = suggestRoles(npsP.profiles);
  const dims = dimensionsFor(npsP.profiles, roles);
  assert.ok(dims.includes('Primary Driver'));
  assert.ok(dims.includes('Segment'));
  assert.ok(dims.includes('Market'));
});

console.log('\nFindings engine — recovering planted patterns');

function analyse(fixture, profiled) {
  const roles = suggestRoles(profiled.profiles);
  const dimensions = dimensionsFor(profiled.profiles, roles);
  return buildFindings(fixture.rows, roles, dimensions);
}

const complaintsResult = analyse(complaints, complaintsP);
const npsResult = analyse(nps, npsP);
const churnResult = analyse(churn, churnP);

const textOf = (result) => result.findings.map((f) => f.text).join('\n');

test('complaints: the planted resolution-time gap is found', () => {
  const finding = complaintsResult.findings.find((f) => f.kind === 'duration' && f.value === 'Billing');
  assert.ok(finding, `no Billing duration finding in:\n${textOf(complaintsResult)}`);
  // Planted: Billing 25-60 days, everything else 2-14.
  assert.ok(finding.stats.ratio > 3, `expected a large ratio, got ${finding.stats.ratio}`);
});

test('complaints: the planted Billing/North concentration is found', () => {
  const finding = complaintsResult.findings.find(
    (f) => f.kind === 'crossLift' && f.value === 'North' && /Billing/.test(f.text)
  );
  assert.ok(finding, `no North/Billing finding in:\n${textOf(complaintsResult)}`);
  assert.ok(finding.stats.lift > 2);
  assert.ok(finding.stats.p < 0.05);
});

test('complaints: value concentration across customers is found', () => {
  const finding = complaintsResult.findings.find((f) => f.kind === 'concentration');
  assert.ok(finding, 'no concentration finding');
  assert.ok(finding.stats.topCustomers < finding.stats.totalCustomers * 0.35);
});

test('NPS: the planted Enterprise score gap is found', () => {
  const finding = npsResult.findings.find((f) => f.kind === 'score' && f.value === 'Enterprise');
  assert.ok(finding, `no Enterprise score finding in:\n${textOf(npsResult)}`);
  assert.ok(finding.stats.diff < -2, `expected Enterprise well below average, got ${finding.stats.diff}`);
});

test('NPS: the overview computes a real NPS, and no total value', () => {
  assert.equal(npsResult.overview.totalAmount, null);
  assert.ok(npsResult.overview.nps < 0);
  assert.ok(npsResult.overview.meanScore > 6 && npsResult.overview.meanScore < 7);
});

test('a 17-row file yields no findings rather than confident noise', () => {
  // The churn fixture is far too small to support any claim. Reporting
  // nothing is the correct behaviour, and the suppression rules are the
  // main thing standing between this tool and confident nonsense.
  assert.equal(churnResult.findings.length, 0);
  assert.equal(churnResult.overview.caseCount, 17);
});

test('every reported finding clears its minimum sample size', () => {
  for (const result of [complaintsResult, npsResult]) {
    for (const finding of result.findings) {
      assert.ok(finding.n >= 5, `finding rests on n=${finding.n}: ${finding.text}`);
      assert.equal(finding.confidence, finding.n < 25 ? 'indicative' : 'strong');
    }
  }
});

test('findings are ranked and capped, not dumped', () => {
  assert.ok(complaintsResult.candidateCount > complaintsResult.findings.length);
  assert.ok(complaintsResult.findings.length <= 12);
  const kinds = complaintsResult.findings.map((f) => f.kind);
  for (const kind of new Set(kinds)) {
    assert.ok(kinds.filter((k) => k === kind).length <= 3, `too many ${kind} findings`);
  }
});

console.log('\nStatistics');

test('two-proportion test separates a real gap from a coin flip', () => {
  assert.ok(twoProportionP(45, 50, 5, 50) < 0.001);
  assert.ok(twoProportionP(25, 50, 24, 50) > 0.5);
});

test('an amount repeated across an entity is not summed per case', () => {
  // Three cases for one customer, all carrying the same account revenue.
  const records = buildRecords(
    [
      { c: 'A', v: '1000' },
      { c: 'A', v: '1000' },
      { c: 'A', v: '1000' },
      { c: 'B', v: '500' },
      { c: 'B', v: '500' },
      { c: 'C', v: '250' },
      { c: 'C', v: '250' },
    ],
    { entity: 'c', amount: 'v' },
    []
  );
  assert.equal(amountIsPerEntity(records), true);
});

test('genuinely varying per-case amounts are detected as per-case', () => {
  const records = buildRecords(
    [
      { c: 'A', v: '100' },
      { c: 'A', v: '900' },
      { c: 'B', v: '50' },
      { c: 'B', v: '700' },
      { c: 'C', v: '20' },
      { c: 'C', v: '640' },
    ],
    { entity: 'c', amount: 'v' },
    []
  );
  assert.equal(amountIsPerEntity(records), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
