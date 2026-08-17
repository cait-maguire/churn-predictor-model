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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
