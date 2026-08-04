// Normalizes a column header for matching: trims, collapses whitespace,
// normalizes colon spacing (real exports vary, e.g. "Account Name : X" vs
// "Account Name: X"), lowercases.
export function normalizeHeader(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ': ')
    .toLowerCase();
}

// Standard Levenshtein edit distance, iterative DP, no dependency.
export function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
