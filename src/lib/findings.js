// Stage 3b: a profiled, role-mapped dataset -> ranked written findings.
//
// This is the difference between showing the data and analysing it. The
// widgets answer "how many, grouped by X" and leave the reader to notice
// what matters. This asks a fixed battery of questions, keeps the answers
// that are both large and statistically defensible, and writes them as
// sentences.
//
// Everything is computed locally - no model, no network. That constrains
// the prose to templates, which is the right trade for this tool: a
// finding can always be traced back to the rows that produced it, and the
// engine cannot invent a pattern that is not in the data.
//
// The discipline that makes this trustworthy rather than noisy is the
// suppression rules. Any breakdown of a few hundred rows will throw up
// dozens of differences; almost all are sampling noise. Findings must
// clear a minimum cell size AND a two-proportion significance test AND a
// minimum effect size before they are allowed to be stated.

import { ROLE } from './roles.js';
import { parseDate } from './dateParser.js';

// A single cell (one dimension value) needs this many cases before it can
// appear in a finding at all.
const MIN_CELL = 5;
// A group being compared against the rest needs this many.
const MIN_GROUP = 10;
// Below this, a finding is reported but flagged as thin evidence.
const INDICATIVE_BELOW = 25;
const SIGNIFICANCE_P = 0.05;

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

// Abramowitz & Stegun 7.1.26 - accurate to ~1e-7, which is far beyond what
// a significance gate needs, and avoids a dependency.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Two-sided two-proportion z-test. Returns a p-value.
export function twoProportionP(successesA, totalA, successesB, totalB) {
  if (totalA === 0 || totalB === 0) return 1;
  const pooled = (successesA + successesB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return 1;
  const z = Math.abs(successesA / totalA - successesB / totalB) / se;
  return 2 * (1 - normalCdf(z));
}

// Welch's t-test p-value, for comparing mean scores between two groups.
export function welchP(a, b) {
  if (a.length < 2 || b.length < 2) return 1;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = (xs, m) => xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  const ma = mean(a);
  const mb = mean(b);
  const se = Math.sqrt(variance(a, ma) / a.length + variance(b, mb) / b.length);
  if (se === 0) return 1;
  // Normal approximation to the t distribution - at the sample sizes that
  // clear MIN_GROUP the difference is immaterial for a 0.05 gate.
  return 2 * (1 - normalCdf(Math.abs(ma - mb) / se));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------------------------------------------------------------------------
// Normalising the dataset
// ---------------------------------------------------------------------------

function cleanValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function numberOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/^[€$£¥]\s?/, '').replace(/\s/g, '').replace(/,/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

// Turns raw rows into the shape every generator reads, so no generator
// touches original header names.
export function buildRecords(rows, roles, dimensions) {
  return rows.map((row) => {
    const dims = {};
    for (const dimension of dimensions) dims[dimension] = cleanValue(row[dimension]);
    return {
      entity: cleanValue(row[roles[ROLE.ENTITY]]),
      eventMs: roles[ROLE.EVENT_DATE] ? parseDate(row[roles[ROLE.EVENT_DATE]]) : null,
      startMs: roles[ROLE.START_DATE] ? parseDate(row[roles[ROLE.START_DATE]]) : null,
      amount: roles[ROLE.AMOUNT] ? numberOf(row[roles[ROLE.AMOUNT]]) : null,
      score: roles[ROLE.SCORE] ? numberOf(row[roles[ROLE.SCORE]]) : null,
      dims,
    };
  });
}

// Whether the amount column is a per-case figure or an account attribute
// repeated on every one of that account's rows. Summing the latter across
// cases multiplies one customer's value by its case count - the single
// easiest way to produce a confident, wrong revenue finding.
export function amountIsPerEntity(records) {
  const byEntity = new Map();
  for (const r of records) {
    if (r.entity === null || r.amount === null) continue;
    if (!byEntity.has(r.entity)) byEntity.set(r.entity, { cases: 0, amounts: new Set() });
    const entry = byEntity.get(r.entity);
    entry.cases += 1;
    entry.amounts.add(r.amount);
  }

  // Only entities with more than one case carry any evidence: a customer
  // with a single case trivially has a single amount whichever way round
  // it is, and counting those swamps the signal.
  const multiCase = [...byEntity.values()].filter((e) => e.cases > 1);
  if (multiCase.length < 3) return true;

  const constant = multiCase.filter((e) => e.amounts.size === 1).length;
  // Biased toward treating the column as an entity attribute. Both mistakes
  // are wrong, but they are not equally wrong: summing a repeated
  // account-level figure invents value that does not exist and produces a
  // confident, false finding, while treating a genuinely per-case amount as
  // per-entity only understates. Real exports also carry a few conflicting
  // values per account as a data-quality artefact, which a stricter
  // threshold would misread as evidence of per-case amounts.
  return constant / multiCase.length >= 0.5;
}

// Total amount, counting an entity-level figure once per entity.
function totalAmount(records, perEntity) {
  if (!perEntity) {
    return records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  }
  const seen = new Map();
  for (const r of records) {
    if (r.entity === null || r.amount === null) continue;
    if (!seen.has(r.entity)) seen.set(r.entity, r.amount);
  }
  return [...seen.values()].reduce((sum, v) => sum + v, 0);
}

// ---------------------------------------------------------------------------
// Finding construction
// ---------------------------------------------------------------------------

function makeFinding({ kind, text, magnitude, n, stats = {}, dimension = null, value = null }) {
  return {
    kind,
    text,
    magnitude: Math.max(0, Math.min(1, magnitude)),
    n,
    confidence: n < INDICATIVE_BELOW ? 'indicative' : 'strong',
    stats,
    dimension,
    value,
  };
}

const pct = (fraction) => `${Math.round(fraction * 100)}%`;
const num = (n) => n.toLocaleString('en-US');
const amountText = (n) => (Math.abs(n) >= 1000 ? num(Math.round(n)) : num(Math.round(n * 100) / 100));

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// How much of the total value sits with how few customers. The classic
// "half the loss is four accounts" story, which a bar chart of 200
// customers hides completely.
function concentrationFindings(records, perEntity) {
  const byEntity = new Map();
  for (const r of records) {
    if (r.entity === null || r.amount === null) continue;
    if (perEntity) {
      if (!byEntity.has(r.entity)) byEntity.set(r.entity, r.amount);
    } else {
      byEntity.set(r.entity, (byEntity.get(r.entity) || 0) + r.amount);
    }
  }
  const amounts = [...byEntity.values()].sort((a, b) => b - a);
  const total = amounts.reduce((s, v) => s + v, 0);
  if (amounts.length < 5 || total <= 0) return [];

  let running = 0;
  let k = 0;
  for (const amount of amounts) {
    running += amount;
    k += 1;
    if (running / total >= 0.5) break;
  }
  const share = k / amounts.length;
  // Only interesting when it is genuinely top-heavy.
  if (share > 0.35) return [];

  return [
    makeFinding({
      kind: 'concentration',
      text: `${num(k)} of ${num(amounts.length)} customers (${pct(share)}) account for half of the total value — ${amountText(running)} of ${amountText(total)}.`,
      magnitude: 1 - share * 2,
      n: amounts.length,
      stats: { topCustomers: k, totalCustomers: amounts.length, topValue: running, total },
    }),
  ];
}

// A dimension value that carries a disproportionate share of value
// relative to its share of cases. This is where "the reason that matters"
// diverges from "the reason that happens most".
function valueVsCountFindings(records, dimension, perEntity) {
  const withDim = records.filter((r) => r.dims[dimension] !== null && r.amount !== null);
  if (withDim.length < MIN_GROUP) return [];
  const total = totalAmount(withDim, perEntity);
  if (total <= 0) return [];

  const groups = new Map();
  for (const r of withDim) {
    if (!groups.has(r.dims[dimension])) groups.set(r.dims[dimension], []);
    groups.get(r.dims[dimension]).push(r);
  }

  const out = [];
  for (const [value, rows] of groups) {
    if (rows.length < MIN_CELL) continue;
    const countShare = rows.length / withDim.length;
    const valueShare = totalAmount(rows, perEntity) / total;
    if (countShare === 0 || valueShare === 0) continue;
    const ratio = valueShare / countShare;
    if (ratio < 1.6 && ratio > 0.625) continue;

    const direction = ratio > 1 ? 'but' : 'but only';
    out.push(
      makeFinding({
        kind: 'valueVsCount',
        text: `${value} is ${pct(countShare)} of cases ${direction} ${pct(valueShare)} of value — ${ratio.toFixed(1)}× its share.`,
        magnitude: Math.min(1, Math.abs(Math.log2(ratio)) / 2),
        n: rows.length,
        stats: { countShare, valueShare, ratio },
        dimension,
        value,
      })
    );
  }
  return out;
}

// The core "why" generator: within group A, does outcome/reason B occur at
// a materially different rate than everywhere else? Every finding must
// clear cell size, effect size and a significance test.
function crossLiftFindings(records, dimensionA, dimensionB) {
  const usable = records.filter((r) => r.dims[dimensionA] !== null && r.dims[dimensionB] !== null);
  if (usable.length < MIN_GROUP * 2) return [];

  const groupsA = new Map();
  for (const r of usable) {
    if (!groupsA.has(r.dims[dimensionA])) groupsA.set(r.dims[dimensionA], []);
    groupsA.get(r.dims[dimensionA]).push(r);
  }

  const out = [];
  for (const [valueA, rowsA] of groupsA) {
    if (rowsA.length < MIN_GROUP) continue;
    const others = usable.filter((r) => r.dims[dimensionA] !== valueA);
    if (others.length < MIN_GROUP) continue;

    const valuesB = new Set(rowsA.map((r) => r.dims[dimensionB]));
    for (const valueB of valuesB) {
      const inGroup = rowsA.filter((r) => r.dims[dimensionB] === valueB).length;
      if (inGroup < MIN_CELL) continue;
      const inOthers = others.filter((r) => r.dims[dimensionB] === valueB).length;

      const rateIn = inGroup / rowsA.length;
      const rateOut = inOthers / others.length;
      if (rateOut === 0 && rateIn < 0.25) continue;
      const lift = rateOut === 0 ? Infinity : rateIn / rateOut;
      if (lift < 1.75 && lift > 0.5) continue;

      const p = twoProportionP(inGroup, rowsA.length, inOthers, others.length);
      if (p > SIGNIFICANCE_P) continue;

      const comparison =
        rateOut === 0
          ? `against none elsewhere`
          : `against ${pct(rateOut)} elsewhere`;
      out.push(
        makeFinding({
          kind: 'crossLift',
          text: `Among ${valueA}, ${pct(rateIn)} of cases are ${valueB} — ${comparison}.`,
          magnitude: Math.min(1, Math.abs(Math.log2(Number.isFinite(lift) ? lift : 4)) / 2.5),
          n: rowsA.length,
          stats: { rateIn, rateOut, lift, p, inGroup, groupSize: rowsA.length },
          dimension: dimensionA,
          value: valueA,
        })
      );
    }
  }
  return out;
}

// Time from start to event, by dimension. Turns two date columns into an
// operational finding: which categories drag, and by how much.
function durationFindings(records, dimension) {
  const usable = records.filter(
    (r) => r.dims[dimension] !== null && r.startMs !== null && r.eventMs !== null && r.eventMs >= r.startMs
  );
  if (usable.length < MIN_GROUP * 2) return [];

  const overall = median(usable.map((r) => (r.eventMs - r.startMs) / DAY_MS));
  if (overall === null || overall <= 0) return [];

  const groups = new Map();
  for (const r of usable) {
    if (!groups.has(r.dims[dimension])) groups.set(r.dims[dimension], []);
    groups.get(r.dims[dimension]).push((r.eventMs - r.startMs) / DAY_MS);
  }

  const out = [];
  for (const [value, durations] of groups) {
    if (durations.length < MIN_CELL) continue;
    const groupMedian = median(durations);
    const rest = usable
      .filter((r) => r.dims[dimension] !== value)
      .map((r) => (r.eventMs - r.startMs) / DAY_MS);
    if (rest.length < MIN_CELL) continue;
    const restMedian = median(rest);
    if (restMedian === null || restMedian <= 0) continue;

    const ratio = groupMedian / restMedian;
    if (ratio < 1.5 && ratio > 0.667) continue;
    if (welchP(durations, rest) > SIGNIFICANCE_P) continue;

    const slower = ratio > 1;
    out.push(
      makeFinding({
        kind: 'duration',
        text: `${value} cases take a median of ${Math.round(groupMedian)} days to close, ${ratio.toFixed(1)}× ${slower ? 'longer' : 'faster'} than the ${Math.round(restMedian)} days everything else takes.`,
        magnitude: Math.min(1, Math.abs(Math.log2(ratio)) / 2),
        n: durations.length,
        stats: { groupMedian, restMedian, ratio },
        dimension,
        value,
      })
    );
  }
  return out;
}

// Mean score by dimension - the NPS "why" - plus detractor concentration.
function scoreFindings(records, dimension) {
  const usable = records.filter((r) => r.dims[dimension] !== null && r.score !== null);
  if (usable.length < MIN_GROUP * 2) return [];

  const overallMean = usable.reduce((s, r) => s + r.score, 0) / usable.length;

  const groups = new Map();
  for (const r of usable) {
    if (!groups.has(r.dims[dimension])) groups.set(r.dims[dimension], []);
    groups.get(r.dims[dimension]).push(r.score);
  }

  const out = [];
  for (const [value, scores] of groups) {
    if (scores.length < MIN_CELL) continue;
    const rest = usable.filter((r) => r.dims[dimension] !== value).map((r) => r.score);
    if (rest.length < MIN_CELL) continue;

    const groupMean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const restMean = rest.reduce((s, v) => s + v, 0) / rest.length;
    const diff = groupMean - restMean;
    if (Math.abs(diff) < 1) continue;
    if (welchP(scores, rest) > SIGNIFICANCE_P) continue;

    out.push(
      makeFinding({
        kind: 'score',
        text: `${value} averages ${groupMean.toFixed(1)} against ${restMean.toFixed(1)} for everything else — ${Math.abs(diff).toFixed(1)} points ${diff > 0 ? 'higher' : 'lower'}.`,
        magnitude: Math.min(1, Math.abs(diff) / 4),
        n: scores.length,
        stats: { groupMean, restMean, diff, overallMean },
        dimension,
        value,
      })
    );
  }
  return out;
}

// Change over time: first half of the period against the second.
function trendFindings(records, dimension) {
  const dated = records.filter((r) => r.dims[dimension] !== null && r.eventMs !== null);
  if (dated.length < MIN_GROUP * 4) return [];

  const times = dated.map((r) => r.eventMs).sort((a, b) => a - b);
  const midpoint = times[Math.floor(times.length / 2)];
  const first = dated.filter((r) => r.eventMs < midpoint);
  const second = dated.filter((r) => r.eventMs >= midpoint);
  if (first.length < MIN_GROUP || second.length < MIN_GROUP) return [];

  const values = new Set(dated.map((r) => r.dims[dimension]));
  const out = [];
  for (const value of values) {
    const inFirst = first.filter((r) => r.dims[dimension] === value).length;
    const inSecond = second.filter((r) => r.dims[dimension] === value).length;
    if (inFirst + inSecond < MIN_GROUP) continue;

    const shareFirst = inFirst / first.length;
    const shareSecond = inSecond / second.length;
    const change = shareSecond - shareFirst;
    if (Math.abs(change) < 0.12) continue;
    if (twoProportionP(inFirst, first.length, inSecond, second.length) > SIGNIFICANCE_P) continue;

    out.push(
      makeFinding({
        kind: 'trend',
        text: `${value} ${change > 0 ? 'rose' : 'fell'} from ${pct(shareFirst)} to ${pct(shareSecond)} of cases between the first and second half of the period.`,
        magnitude: Math.min(1, Math.abs(change) * 3),
        n: inFirst + inSecond,
        stats: { shareFirst, shareSecond, change },
        dimension,
        value,
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Caps stop one strong dimension from filling the whole report with
// variations of the same observation.
const MAX_PER_KIND = 3;
const MAX_PER_DIMENSION = 3;
const MAX_FINDINGS = 12;

function rank(findings) {
  const scored = [...findings].sort((a, b) => {
    const weight = (f) => f.magnitude * (f.confidence === 'strong' ? 1 : 0.7);
    return weight(b) - weight(a);
  });

  const perKind = new Map();
  const perDimension = new Map();
  const seen = new Set();
  const out = [];
  for (const finding of scored) {
    if (out.length >= MAX_FINDINGS) break;
    // Two generators can phrase the same underlying fact; dedupe on the
    // dimension/value pair they rest on.
    const key = `${finding.kind}|${finding.dimension}|${finding.value}`;
    if (seen.has(key)) continue;
    const kindCount = perKind.get(finding.kind) || 0;
    if (kindCount >= MAX_PER_KIND) continue;
    const dimensionCount = finding.dimension ? perDimension.get(finding.dimension) || 0 : 0;
    if (finding.dimension && dimensionCount >= MAX_PER_DIMENSION) continue;

    seen.add(key);
    perKind.set(finding.kind, kindCount + 1);
    if (finding.dimension) perDimension.set(finding.dimension, dimensionCount + 1);
    out.push(finding);
  }
  return out;
}

export function buildOverview(records, roles, perEntity) {
  const entities = new Set(records.map((r) => r.entity).filter(Boolean));
  const dates = records.map((r) => r.eventMs).filter((ms) => ms !== null);
  const scores = records.map((r) => r.score).filter((s) => s !== null);

  return {
    caseCount: records.length,
    entityCount: entities.size,
    dateFrom: dates.length > 0 ? Math.min(...dates) : null,
    dateTo: dates.length > 0 ? Math.max(...dates) : null,
    totalAmount: roles[ROLE.AMOUNT] ? totalAmount(records, perEntity) : null,
    amountPerEntity: perEntity,
    meanScore: scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null,
    // Net Promoter Score proper, when the scale looks like NPS.
    nps:
      scores.length > 0 && Math.max(...scores) <= 10
        ? Math.round(
            ((scores.filter((s) => s >= 9).length - scores.filter((s) => s <= 6).length) / scores.length) * 100
          )
        : null,
  };
}

export function buildFindings(rows, roles, dimensions) {
  const records = buildRecords(rows, roles, dimensions);
  const perEntity = amountIsPerEntity(records);
  const overview = buildOverview(records, roles, perEntity);

  const candidates = [];
  if (roles[ROLE.AMOUNT]) candidates.push(...concentrationFindings(records, perEntity));

  for (const dimension of dimensions) {
    if (roles[ROLE.AMOUNT]) candidates.push(...valueVsCountFindings(records, dimension, perEntity));
    if (roles[ROLE.SCORE]) candidates.push(...scoreFindings(records, dimension));
    if (roles[ROLE.START_DATE] && roles[ROLE.EVENT_DATE]) {
      candidates.push(...durationFindings(records, dimension));
    }
    if (roles[ROLE.EVENT_DATE]) candidates.push(...trendFindings(records, dimension));

    for (const other of dimensions) {
      if (other === dimension) continue;
      candidates.push(...crossLiftFindings(records, dimension, other));
    }
  }

  return { overview, findings: rank(candidates), candidateCount: candidates.length, records };
}
