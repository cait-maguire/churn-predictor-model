// Static check that the built HTML has no external references and no
// dead-but-suspicious network-capable code paths accidentally enabled.
// Run after every build: npm run verify.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distPath = path.join(rootDir, 'dist/churn-dashboard.html');

const html = readFileSync(distPath, 'utf8');
const failures = [];

// SheetJS embeds these as inert OOXML/XML namespace identifier strings
// (e.g. xmlns="http://schemas.openxmlformats.org/...") - they are never
// fetched over the network, just used as namespace URIs during XLSX
// parsing/generation. Anything else starting with http(s):// is suspicious.
const KNOWN_NAMESPACE_PREFIXES = [
  'http://schemas.openxmlformats.org/',
  'http://schemas.microsoft.com/',
  'http://purl.oclc.org/',
  'http://purl.org/',
  'http://www.w3.org/',
  'http://sheetjs.openxmlformats.org/', // SheetJS-internal placeholder namespace, never fetched
];

const urlMatches = html.match(/https?:\/\/[^\s"'<>)]*/gi) || [];
const suspiciousUrls = [...new Set(urlMatches)].filter(
  (url) => !KNOWN_NAMESPACE_PREFIXES.some((prefix) => url.startsWith(prefix))
);

if (suspiciousUrls.length > 0) {
  failures.push(`Found unexpected http(s):// reference(s): ${suspiciousUrls.slice(0, 5).join(', ')}`);
}
if (/<script[^>]+\bsrc\s*=/i.test(html)) {
  failures.push('Found a <script src=...> tag (external script reference).');
}
if (/<link[^>]+\bhref\s*=/i.test(html)) {
  failures.push('Found a <link href=...> tag (external stylesheet/resource reference).');
}
if (/\bnew Worker\s*\(/.test(html)) {
  failures.push('Found new Worker( - PapaParse worker mode must stay disabled in a single-file build.');
}
if (/\bimportScripts\s*\(/.test(html)) {
  failures.push('Found importScripts( - indicates worker-script loading.');
}

const sizeKb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`Checked ${distPath} (${sizeKb} KB)`);

if (failures.length > 0) {
  console.error('\nOffline verification FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('Offline verification passed: no external references found.');
