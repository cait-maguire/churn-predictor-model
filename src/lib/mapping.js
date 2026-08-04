import { normalizeHeader, levenshtein } from './normalizeHeader.js';

// Confidence tiers, best to worst.
export const MATCH_TIER = {
  EXACT: 'exact',
  NEAR: 'near',
  KEYWORD: 'keyword',
  NONE: 'none',
};

const NEAR_MATCH_MAX_DISTANCE = 3;

function keywordsOf(s) {
  return normalizeHeader(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2); // drop tiny/stopword-ish tokens
}

function scoreHeaderAgainstField(header, field) {
  const normHeader = normalizeHeader(header);
  for (const variant of field.exactVariants) {
    if (normHeader === normalizeHeader(variant)) {
      return { tier: MATCH_TIER.EXACT, distance: 0 };
    }
  }

  let bestDistance = Infinity;
  for (const variant of field.exactVariants) {
    const d = levenshtein(normHeader, normalizeHeader(variant));
    if (d < bestDistance) bestDistance = d;
  }
  if (bestDistance <= NEAR_MATCH_MAX_DISTANCE) {
    return { tier: MATCH_TIER.NEAR, distance: bestDistance };
  }

  const headerWords = new Set(keywordsOf(header));
  for (const variant of field.exactVariants) {
    const variantWords = keywordsOf(variant);
    if (variantWords.length > 0 && variantWords.every((w) => headerWords.has(w))) {
      return { tier: MATCH_TIER.KEYWORD, distance: bestDistance };
    }
  }

  return { tier: MATCH_TIER.NONE, distance: bestDistance };
}

// For a given field definition, find the best-matching header among the
// uploaded file's headers. Returns { header, tier } or { header: null, tier: NONE }.
export function suggestMapping(field, headers) {
  let best = { header: null, tier: MATCH_TIER.NONE, distance: Infinity };
  for (const header of headers) {
    const { tier, distance } = scoreHeaderAgainstField(header, field);
    const tierRank = { exact: 0, near: 1, keyword: 2, none: 3 };
    if (
      tierRank[tier] < tierRank[best.tier] ||
      (tier === best.tier && distance < best.distance)
    ) {
      best = { header, tier, distance };
    }
  }
  return best.tier === MATCH_TIER.NONE ? { header: null, tier: MATCH_TIER.NONE } : best;
}

// Builds the full suggested field map for a set of fields against uploaded headers.
// Returns { [fieldKey]: { header: string|null, tier } }
export function suggestAllMappings(fields, headers) {
  const result = {};
  for (const field of fields) {
    result[field.key] = suggestMapping(field, headers);
  }
  return result;
}

// Fixed fields (join key, revenue) are load-bearing for every downstream
// metric, so auto-detection only trusts exact/near matches - a keyword-only
// match is too weak to silently rely on. Falls through to a blocking error
// in the UI if nothing clears this bar.
export function suggestFixedMapping(field, headers) {
  const match = suggestMapping(field, headers);
  return match.tier === MATCH_TIER.EXACT || match.tier === MATCH_TIER.NEAR ? match : { header: null, tier: MATCH_TIER.NONE };
}
