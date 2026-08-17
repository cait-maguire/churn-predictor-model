// Stage 0.5: raw rows -> a profile of every column.
//
// Phase 1 could assume it knew the file: sixteen named Salesforce columns,
// matched by name. To analyse a complaints or NPS export - or any other
// case-per-row extract - the tool has to work out what each column *is*
// before it can work out what it means. Everything downstream (role
// inference, the findings engine) reads these profiles rather than the
// original headers, so no analysis is hardcoded to one export format.
//
// Inference is deliberately conservative: a column is only given a type
// when a clear majority of its non-blank values parse that way, and the
// parse rate is kept on the profile so the UI can show how confident the
// guess was.

import { parseDate } from './dateParser.js';

// A column has to parse this cleanly before we call it a date or a number.
// Below this, real exports are usually a mixed/free-text column with a few
// parseable values in it.
const TYPE_CONFIDENCE = 0.8;

// Above this share of distinct values, a text column is an identifier
// rather than a category worth grouping by.
const ID_DISTINCT_RATIO = 0.9;

// A categorical column with more distinct values than this is too granular
// to break down by, however few rows there are.
const MAX_CATEGORY_DISTINCT = 60;

export const COLUMN_TYPE = {
  EMPTY: 'empty',
  DATE: 'date',
  NUMBER: 'number',
  SCORE: 'score',
  CATEGORY: 'category',
  ID: 'id',
  TEXT: 'text',
};

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === '') return null;
  // Tolerant of a leading currency symbol and thousands separators, but the
  // *whole* remaining string must be numeric. Stripping arbitrary leading
  // non-digits instead would read "Customer A1" as the number 1 and
  // "CMP-10000" as -10000, turning identifier columns into quantities.
  const cleaned = text
    .replace(/^[€$£¥]\s?/, '')
    .replace(/\s/g, '')
    .replace(/,/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

// Values that look like a URL are identifiers in every export we have seen
// (Salesforce CRM links), never something to group by.
function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value).trim());
}

// Date detection uses a stricter test than the shared date parser, which
// falls through to Date.parse for robustness when reading a column already
// known to be a date. Date.parse accepts far too much - it reads
// "https://example.invalid/case/1001" as a date in 1000 BC - so profiling,
// which has to decide *whether* a column is a date, needs the tighter check.
const DATE_SHAPES = [
  /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/, // 7/23/2025, 23-07-2025
  /^\d{4}-\d{1,2}-\d{1,2}([T ]|$)/, // 2025-07-23, ISO timestamps
  /^\d{1,2} [A-Za-z]{3,9} \d{4}$/, // 23 July 2025
];

function looksLikeDate(value) {
  if (value instanceof Date) return true;
  return DATE_SHAPES.some((shape) => shape.test(String(value).trim()));
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function profileColumn(header, values) {
  const nonBlank = values.filter((v) => !isBlank(v));
  const nullCount = values.length - nonBlank.length;

  const distinct = new Map();
  for (const v of nonBlank) {
    const key = String(v).trim();
    distinct.set(key, (distinct.get(key) || 0) + 1);
  }

  const profile = {
    header,
    rowCount: values.length,
    nonNullCount: nonBlank.length,
    nullCount,
    nullRate: values.length === 0 ? 1 : nullCount / values.length,
    distinctCount: distinct.size,
    distinctRatio: nonBlank.length === 0 ? 0 : distinct.size / nonBlank.length,
    // Most common values first - both the UI preview and the findings
    // engine want these, and computing them once here avoids re-walking
    // every column later.
    topValues: [...distinct.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([value, count]) => ({ value, count })),
    type: COLUMN_TYPE.EMPTY,
    typeConfidence: 0,
    urlRate: 0,
    numeric: null,
    dateRange: null,
  };

  if (nonBlank.length === 0) return profile;

  const dateHits = [];
  const numberHits = [];
  let urlHits = 0;
  for (const v of nonBlank) {
    // A URL is neither a number nor a date, and must be taken out first:
    // Date.parse reads one as a valid (absurd) date.
    if (looksLikeUrl(v)) {
      urlHits += 1;
      continue;
    }
    // A bare number is not a date, whatever the date parser makes of it -
    // otherwise an NPS score column parses as Excel serial dates.
    const asNumber = parseNumber(v);
    if (asNumber !== null) {
      numberHits.push(asNumber);
      continue;
    }
    if (looksLikeDate(v)) {
      const asDate = parseDate(v);
      if (asDate !== null) dateHits.push(asDate);
    }
  }

  const dateRate = dateHits.length / nonBlank.length;
  const numberRate = numberHits.length / nonBlank.length;
  // Kept on the profile because role scoring needs it: a URL column is a
  // perfectly good identifier but a terrible label to print in a finding.
  profile.urlRate = urlHits / nonBlank.length;

  if (dateRate >= TYPE_CONFIDENCE && dateRate >= numberRate) {
    profile.type = COLUMN_TYPE.DATE;
    profile.typeConfidence = dateRate;
    profile.dateRange = { min: Math.min(...dateHits), max: Math.max(...dateHits) };
    return profile;
  }

  if (numberRate >= TYPE_CONFIDENCE) {
    const sorted = [...numberHits].sort((a, b) => a - b);
    profile.numeric = {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: numberHits.reduce((a, b) => a + b, 0) / numberHits.length,
      median: median(sorted),
      allIntegers: numberHits.every((n) => Number.isInteger(n)),
    };
    profile.typeConfidence = numberRate;
    // A 0-10 (or 1-5) integer scale with few distinct values is a rating,
    // not a quantity: summing it is meaningless, averaging it is the point.
    // NPS is the case this exists for.
    const { min, max, allIntegers } = profile.numeric;
    const looksLikeScale = allIntegers && min >= 0 && max <= 10 && distinct.size <= 11 && distinct.size > 1;
    profile.type = looksLikeScale ? COLUMN_TYPE.SCORE : COLUMN_TYPE.NUMBER;
    return profile;
  }

  if (profile.urlRate >= TYPE_CONFIDENCE || profile.distinctRatio >= ID_DISTINCT_RATIO) {
    profile.type = COLUMN_TYPE.ID;
    profile.typeConfidence = Math.max(profile.urlRate, profile.distinctRatio);
    return profile;
  }

  if (distinct.size <= MAX_CATEGORY_DISTINCT) {
    profile.type = COLUMN_TYPE.CATEGORY;
    profile.typeConfidence = 1 - profile.distinctRatio;
    return profile;
  }

  profile.type = COLUMN_TYPE.TEXT;
  profile.typeConfidence = 1;
  return profile;
}

// rawRows are keyed by original header text (Stage 0 output).
export function profileColumns(rawRows, headers) {
  const cols = headers && headers.length > 0 ? headers : Object.keys(rawRows[0] || {});
  return cols.map((header) => profileColumn(header, rawRows.map((row) => row[header])));
}

// Columns worth offering as a breakdown axis: categorical, not almost-all
// blank, and with more than one value to compare.
export function analysableDimensions(profiles) {
  return profiles.filter(
    (p) => p.type === COLUMN_TYPE.CATEGORY && p.distinctCount > 1 && p.nullRate < 0.9
  );
}
