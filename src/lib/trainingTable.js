// Stage 4: mapped case rows -> ml_churn_account_month_nl_v1, the
// account-month training table.
//
// This is the SQL blueprint's logic expressed as pure JS so it runs in the
// browser against an uploaded file, with no warehouse and no data leaving
// the machine. Every window is closed at as_of_month_end; nothing reads a
// record dated after the cutoff except the label, which by definition
// looks forward.
//
// Deliberately built from *mapped* rows rather than the Stage 2 churn-case
// rows: the dashboard counts only `Case Status = Closed`, but an open case
// is legitimate activity signal at a cutoff that precedes its closure, so
// activity features see every case and only the label applies the status
// rule.

import { parseDate } from './dateParser.js';
import { parseRevenue } from './revenueParser.js';

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Date helpers. Everything is normalized to local midnight and compared at
// day resolution, so "on or before as_of_month_end" is an exact day
// comparison and never depends on a time component the export doesn't have.
// ---------------------------------------------------------------------------

export function toDayStart(ms) {
  if (ms === null || ms === undefined) return null;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Day arithmetic goes through the calendar, never through
// `ms + n * DAY_MS`: adding 90 fixed-length days across a DST boundary
// lands on 23:00 the day before (or 01:00 the day after), which silently
// moves a churn dated exactly on the horizon in or out of the label
// window. Everyone running this in a European timezone would get a
// different label than someone running it in UTC.
export function addDays(ms, n) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function monthEndOf(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
}

// Inclusive list of month-end timestamps covering [fromMs, toMs].
export function enumerateMonthEnds(fromMs, toMs) {
  const out = [];
  if (fromMs === null || toMs === null || fromMs > toMs) return out;
  const start = new Date(fromMs);
  let cursor = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const last = monthEndOf(toMs);
  while (cursor.getTime() <= last) {
    out.push(cursor.getTime());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);
  }
  return out;
}

export function formatIsoDate(ms) {
  if (ms === null || ms === undefined) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(text) {
  const ms = parseDate(text);
  return ms === null ? null : toDayStart(ms);
}

// ---------------------------------------------------------------------------
// Vocabulary handling.
//
// The spec named ten reason/subreason flag columns. We have no controlled
// vocabulary to check them against, and a hardcoded string that matches
// nothing produces a column of silent zeros that looks like a real feature.
// So: spec columns are matched case-insensitively (with a few known
// spelling variants), every observed value that no spec column claims gets
// an auto-generated column, and anything that matched nothing is reported
// back to the user rather than shipped as zeros.
// ---------------------------------------------------------------------------

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'blank';
}

// field: which case attribute the flag counts over; aliases: accepted
// spellings, compared lowercased/trimmed; windowDays: trailing window.
const SPEC_FLAG_COLUMNS = [
  { column: 'ext_reason_cases_180d', field: 'churnReason', windowDays: 180, aliases: ['external'] },
  { column: 'svc_exp_cases_180d', field: 'churnReason', windowDays: 180, aliases: ['service experience'] },
  { column: 'contact_exp_cases_180d', field: 'churnReason', windowDays: 180, aliases: ['contact experience'] },
  { column: 'product_exp_cases_180d', field: 'churnReason', windowDays: 180, aliases: ['product experience'] },
  {
    column: 'incorrect_calc_cases_180d',
    field: 'churnSubreason',
    windowDays: 180,
    aliases: ['incorrect calculations or advice', 'incorrect calculations/advice'],
  },
  {
    column: 'availability_resp_cases_180d',
    field: 'churnSubreason',
    windowDays: 180,
    aliases: ['availability and responsiveness', 'availability & responsiveness'],
  },
  {
    column: 'prod_func_range_cases_180d',
    field: 'churnSubreason',
    windowDays: 180,
    aliases: ['product functionality or range', 'product functionality/range', 'missing product features'],
  },
  { column: 'bankruptcy_cases_365d', field: 'churnSubreason', windowDays: 365, aliases: ['bankruptcy'] },
  {
    column: 'merger_central_cases_365d',
    field: 'churnSubreason',
    windowDays: 365,
    aliases: ['merger or acquisition', 'merger/centralisation', 'merger/centralization', 'centralisation'],
  },
  {
    column: 'insourcing_cases_365d',
    field: 'churnSubreason',
    windowDays: 365,
    aliases: ['insourcing', 'moved in-house', 'moved in house'],
  },
  {
    column: 'mgmt_decision_cases_365d',
    field: 'churnSubreason',
    windowDays: 365,
    aliases: ['management decision', 'management/board decision'],
  },
];

const norm = (v) => (v === null || v === undefined ? '' : String(v).trim().toLowerCase());

// Builds the flag-column plan for the vocabulary actually present in this
// file. Returns spec columns (with the observed values each one claimed),
// auto-generated columns for the remainder, and the unmatched spec columns
// so the UI can say so out loud.
export function planFlagColumns(events) {
  const observed = { churnReason: new Set(), churnSubreason: new Set() };
  for (const e of events) {
    if (e.churnReason) observed.churnReason.add(e.churnReason);
    if (e.churnSubreason) observed.churnSubreason.add(e.churnSubreason);
  }

  const claimed = { churnReason: new Set(), churnSubreason: new Set() };
  const columns = [];
  const unmatchedSpecColumns = [];

  for (const spec of SPEC_FLAG_COLUMNS) {
    const values = [...observed[spec.field]].filter((v) => spec.aliases.includes(norm(v)));
    if (values.length === 0) {
      unmatchedSpecColumns.push(spec.column);
      continue;
    }
    for (const v of values) claimed[spec.field].add(v);
    columns.push({ column: spec.column, field: spec.field, windowDays: spec.windowDays, values, source: 'spec' });
  }

  // Anything the spec columns did not claim still gets a column, at both
  // window lengths the spec uses, so no observed reason is silently dropped.
  for (const field of ['churnReason', 'churnSubreason']) {
    const prefix = field === 'churnReason' ? 'reason' : 'subreason';
    for (const value of [...observed[field]].sort()) {
      if (claimed[field].has(value)) continue;
      for (const windowDays of [180, 365]) {
        columns.push({
          column: `${prefix}_${slugify(value)}_cases_${windowDays}d`,
          field,
          windowDays,
          values: [value],
          source: 'auto',
        });
      }
    }
  }

  return { columns, unmatchedSpecColumns };
}

// ---------------------------------------------------------------------------
// Market parsing: "(NL) SME - Netherlands" -> country NL, size SME.
// ---------------------------------------------------------------------------

const SIZE_TOKENS = ['SME', 'MME', 'LME', 'ENT'];

export function parseMarket(market) {
  if (!market) return { countryCode: null, sizeSegment: null };
  const text = String(market);
  const countryMatch = text.match(/\(([A-Za-z]{2})\)/);
  const upper = text.toUpperCase();
  const sizeSegment = SIZE_TOKENS.find((t) => new RegExp(`\\b${t}\\b`).test(upper)) || null;
  return { countryCode: countryMatch ? countryMatch[1].toUpperCase() : null, sizeSegment };
}

// ---------------------------------------------------------------------------
// Event normalization.
// ---------------------------------------------------------------------------

// Account identity: the export has no account ID column, so the CRM URL is
// the closest thing to a real key (two different Salesforce accounts can
// share a name). Fall back to the name when the URL is absent, and count
// the fallbacks so the caller can warn about name-collision risk.
function normalizeEvents(mappedRows) {
  const events = [];
  let missingAccountKey = 0;
  let nameKeyedAccounts = 0;
  const nameKeyed = new Set();

  for (const row of mappedRows) {
    const accountCrmUrl = row.accountCrmUrl || null;
    const accountName = row.accountKey || null;
    if (!accountCrmUrl && !accountName) {
      missingAccountKey += 1;
      continue;
    }
    const accountId = accountCrmUrl || `name:${accountName}`;
    if (!accountCrmUrl) nameKeyed.add(accountId);

    events.push({
      accountId,
      accountName,
      caseId: row.caseCrmUrl || `row:${row.__rowIndex}`,
      openMs: toDayStart(parseDate(row.openDate)),
      churnMs: toDayStart(parseDate(row.terminationDate)),
      status: row.status || null,
      decision: row.segments?.decision || null,
      churnReason: row.churnReason || null,
      churnSubreason: row.churnSubreason || null,
      serviceMarket: row.segments?.serviceMarket || null,
      serviceTeam: row.segments?.serviceTeam || null,
      serviceType: row.segments?.serviceType || null,
      revenue: parseRevenue(row.revenueRaw),
      rowIndex: row.__rowIndex,
    });
  }

  nameKeyedAccounts = nameKeyed.size;
  return { events, missingAccountKey, nameKeyedAccounts };
}

const isClosed = (e) => norm(e.status) === 'closed';
const isLeft = (e) => norm(e.decision) === 'left';

// A case counts toward the label only if it is a closed, Left decision with
// a real churn date - matching the dashboard's churn rule so the two views
// of the same file agree on who churned.
const isLabelCase = (e) => isClosed(e) && isLeft(e) && e.churnMs !== null;

// ---------------------------------------------------------------------------
// Main builder.
// ---------------------------------------------------------------------------

export const DEFAULT_OPTIONS = {
  horizonDays: 90,
  marketFilter: 'Netherlands',
  censorAfterChurn: true,
  dropIncompleteLabelWindow: true,
  trainEnd: '2024-12-31',
  validateEnd: '2025-06-30',
};

export function buildTrainingTable(mappedRows, userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  const { events: allEvents, missingAccountKey, nameKeyedAccounts } = normalizeEvents(mappedRows);

  // Market filter is applied at the account level (an account's market is
  // an account attribute, so filtering individual cases would split an
  // account's history in half).
  const filterText = norm(options.marketFilter);
  let events = allEvents;
  if (filterText) {
    const keep = new Set();
    for (const e of allEvents) {
      if (norm(e.serviceMarket).includes(filterText)) keep.add(e.accountId);
    }
    events = allEvents.filter((e) => keep.has(e.accountId));
  }

  const flagPlan = planFlagColumns(events);

  // The observable horizon of the file. Any as_of month whose label window
  // extends past this is right-censored: a churn that has not been exported
  // yet would be scored as a negative, which is a false label, not a
  // missing one.
  let dataMaxMs = null;
  let dataMinMs = null;
  for (const e of events) {
    for (const ms of [e.openMs, e.churnMs]) {
      if (ms === null) continue;
      if (dataMaxMs === null || ms > dataMaxMs) dataMaxMs = ms;
      if (dataMinMs === null || ms < dataMinMs) dataMinMs = ms;
    }
  }

  const byAccount = new Map();
  for (const e of events) {
    if (!byAccount.has(e.accountId)) byAccount.set(e.accountId, []);
    byAccount.get(e.accountId).push(e);
  }

  const trainEndMs = parseIsoDate(options.trainEnd);
  const validateEndMs = parseIsoDate(options.validateEnd);

  const rows = [];
  const summary = {
    accountsIncluded: byAccount.size,
    accountsExcludedByMarketFilter: new Set(allEvents.map((e) => e.accountId)).size - byAccount.size,
    rowsMissingAccountKey: missingAccountKey,
    nameKeyedAccounts,
    unmatchedSpecColumns: flagPlan.unmatchedSpecColumns,
    dataMinDate: formatIsoDate(dataMinMs),
    dataMaxDate: formatIsoDate(dataMaxMs),
    monthsCovered: 0,
    positives: 0,
    positivesWithLabelCaseAlreadyOpen: 0,
    rowsDroppedIncompleteLabelWindow: 0,
    rowsDroppedPostChurn: 0,
    splitCounts: {},
  };

  if (dataMinMs === null || dataMaxMs === null) {
    return { columns: buildColumnList(flagPlan.columns), rows, summary, options, flagColumns: flagPlan.columns };
  }

  summary.monthsCovered = enumerateMonthEnds(dataMinMs, dataMaxMs).length;

  for (const [accountId, accountEvents] of byAccount) {
    const sorted = [...accountEvents].sort((a, b) => (a.openMs ?? 0) - (b.openMs ?? 0) || a.rowIndex - b.rowIndex);

    // The account enters the spine at its first observed case: before that
    // we have no evidence it was a customer at all, and a row of all-null
    // features labelled 0 is noise, not a negative.
    const firstEventMs = sorted.reduce(
      (acc, e) => (e.openMs !== null && (acc === null || e.openMs < acc) ? e.openMs : acc),
      null
    );
    if (firstEventMs === null) continue;

    // Earliest confirmed churn - the account leaves the spine after it.
    const churnMsList = sorted.filter(isLabelCase).map((e) => e.churnMs);
    const firstChurnMs = churnMsList.length > 0 ? Math.min(...churnMsList) : null;

    for (const asOf of enumerateMonthEnds(firstEventMs, dataMaxMs)) {
      if (options.censorAfterChurn && firstChurnMs !== null && asOf > firstChurnMs) {
        summary.rowsDroppedPostChurn += 1;
        continue;
      }

      const labelWindowComplete = addDays(asOf, options.horizonDays) <= dataMaxMs;
      if (options.dropIncompleteLabelWindow && !labelWindowComplete) {
        summary.rowsDroppedIncompleteLabelWindow += 1;
        continue;
      }

      rows.push(
        buildRow({
          accountId,
          asOf,
          events: sorted,
          flagColumns: flagPlan.columns,
          labelWindowComplete,
          trainEndMs,
          validateEndMs,
          horizonDays: options.horizonDays,
          summary,
        })
      );
    }
  }

  for (const row of rows) {
    summary.splitCounts[row.split] = (summary.splitCounts[row.split] || 0) + 1;
  }
  summary.totalRows = rows.length;
  summary.positiveRate = rows.length > 0 ? summary.positives / rows.length : 0;

  return { columns: buildColumnList(flagPlan.columns), rows, summary, options, flagColumns: flagPlan.columns };
}

function inWindow(ms, asOf, windowDays) {
  return ms !== null && ms > addDays(asOf, -windowDays) && ms <= asOf;
}

function buildRow({
  accountId,
  asOf,
  events,
  flagColumns,
  labelWindowComplete,
  trainEndMs,
  validateEndMs,
  horizonDays,
  summary,
}) {
  // Feature side: strictly on or before the cutoff.
  const past = events.filter((e) => e.openMs !== null && e.openMs <= asOf);

  // Attributes are taken from the most recent case at or before the cutoff
  // (the MAX_BY in the blueprint), never from the account's latest-ever row,
  // which would be reading the future.
  const latest = past.reduce(
    (acc, e) => (acc === null || e.openMs > acc.openMs || (e.openMs === acc.openMs && e.rowIndex > acc.rowIndex) ? e : acc),
    null
  );
  const revenueSource = [...past].reverse().find((e) => e.revenue !== null) || null;
  const market = parseMarket(latest?.serviceMarket);

  const countIn = (windowDays, predicate) => {
    const seen = new Set();
    for (const e of past) {
      if (!inWindow(e.openMs, asOf, windowDays)) continue;
      if (predicate && !predicate(e)) continue;
      seen.add(e.caseId);
    }
    return seen.size;
  };

  const lastCaseMs = past.reduce((acc, e) => (acc === null || e.openMs > acc ? e.openMs : acc), null);

  const windowCases = past.filter((e) => inWindow(e.openMs, asOf, 180));
  const blankRate =
    windowCases.length === 0
      ? null
      : windowCases.filter((e) => e.serviceType === null).length / windowCases.length;

  // Historical completed churn up to the cutoff, keyed on Churn Date rather
  // than Open Date. With post-churn censoring on, this can only be non-zero
  // for an account with more than one churn case (e.g. a partial churn
  // preceding a full one).
  const leftCases365d = new Set(
    past.filter((e) => isLabelCase(e) && inWindow(e.churnMs, asOf, 365)).map((e) => e.caseId)
  ).size;

  const row = {
    account_id: accountId,
    account_name: latest?.accountName ?? '',
    as_of_month: formatIsoDate(asOf),
    service_market: latest?.serviceMarket ?? '',
    service_type: latest?.serviceType ?? '',
    service_team: latest?.serviceTeam ?? '',
    segment_size: market.sizeSegment ?? '',
    market_country_code: market.countryCode ?? '',
    account_revenue: revenueSource?.revenue ?? null,
    days_since_last_case: lastCaseMs === null ? null : Math.round((asOf - lastCaseMs) / DAY_MS),
    cases_30d: countIn(30),
    cases_90d: countIn(90),
    cases_180d: countIn(180),
    cases_365d: countIn(365),
    left_cases_365d: leftCases365d,
  };

  for (const flag of flagColumns) {
    const values = new Set(flag.values.map(norm));
    row[flag.column] = countIn(flag.windowDays, (e) => values.has(norm(e[flag.field])));
  }

  row.service_type_blank_rate_180d = blankRate;

  // Label side: strictly after the cutoff, within the horizon.
  const labelWindowEnd = addDays(asOf, horizonDays);
  const labelCases = events.filter(
    (e) => isLabelCase(e) && e.churnMs > asOf && e.churnMs <= labelWindowEnd
  );
  row.label_left_90d = labelCases.length > 0 ? 1 : 0;
  row.label_left_rev_90d = labelCases.length > 0 ? revenueSource?.revenue ?? null : 0;

  // Diagnostic, not a feature: was the churn case that produces this label
  // already open at the cutoff? When this is 1, every activity feature above
  // is counting the very case that defines the label.
  const labelCaseAlreadyOpen = labelCases.some((e) => e.openMs !== null && e.openMs <= asOf);
  row.labeling_case_open_at_cutoff = row.label_left_90d === 1 ? (labelCaseAlreadyOpen ? 1 : 0) : 0;

  if (row.label_left_90d === 1) {
    summary.positives += 1;
    if (labelCaseAlreadyOpen) summary.positivesWithLabelCaseAlreadyOpen += 1;
  }

  row.label_window_complete = labelWindowComplete ? 1 : 0;
  row.split = assignSplit(asOf, horizonDays, trainEndMs, validateEndMs);

  return row;
}

// Time-based split with an embargo the width of the label horizon: a row
// whose 90-day label window crosses a split boundary shares its outcome
// period with the next split, so it belongs to neither.
export function assignSplit(asOf, horizonDays, trainEndMs, validateEndMs) {
  const labelWindowEnd = addDays(asOf, horizonDays);
  if (trainEndMs !== null && asOf <= trainEndMs) {
    return labelWindowEnd > trainEndMs ? 'embargo' : 'train';
  }
  if (validateEndMs !== null && asOf <= validateEndMs) {
    return labelWindowEnd > validateEndMs ? 'embargo' : 'validate';
  }
  return 'test';
}

const BASE_COLUMNS = [
  'account_id',
  'account_name',
  'as_of_month',
  'service_market',
  'service_type',
  'service_team',
  'segment_size',
  'market_country_code',
  'account_revenue',
  'days_since_last_case',
  'cases_30d',
  'cases_90d',
  'cases_180d',
  'cases_365d',
  'left_cases_365d',
];

const TAIL_COLUMNS = [
  'service_type_blank_rate_180d',
  'label_left_90d',
  'label_left_rev_90d',
  'labeling_case_open_at_cutoff',
  'label_window_complete',
  'split',
];

function buildColumnList(flagColumns) {
  return [...BASE_COLUMNS, ...flagColumns.map((f) => f.column), ...TAIL_COLUMNS];
}

// ---------------------------------------------------------------------------
// CSV serialization. Kept here (not in the UI) so the same output can be
// asserted on in tests without a browser.
// ---------------------------------------------------------------------------

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(','));
  }
  return lines.join('\n');
}
