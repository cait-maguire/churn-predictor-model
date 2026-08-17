// Dev-only manual verification script (not part of the shipped deliverable):
// loads the built dashboard via file://, uploads the fixture CSV, confirms
// every request stays local (no network calls), checks the computed
// dashboard numbers against hand-calculated expected values, exercises
// cross-filtering, and screenshots the result for a visual check.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distPath = path.join(rootDir, 'dist/churn-dashboard.html');
const fixturePath = path.join(rootDir, 'fixtures/sample-churn-export.csv');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

const externalRequests = [];
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('about:')) {
    externalRequests.push(url);
  }
});
page.on('pageerror', (err) => { throw new Error(`Page error: ${err.message}`); });

await page.goto(`file://${distPath}`);
await page.setInputFiles('#file-input', fixturePath);
await page.waitForSelector('#continue-btn', { timeout: 5000 });

if (await page.locator('#fixed-error').count() > 0) {
  throw new Error('Fixed-field mapping error shown - join key or Revenue not auto-detected.');
}

await page.click('#continue-btn');
await page.waitForSelector('.overview-widget', { timeout: 5000 });

await page.locator('.data-quality-panel').evaluate((el) => { el.open = true; });
await page.$$eval('.dq-nested', (nodes) => nodes.forEach((n) => { n.open = true; }));

const overviewText = await page.locator('.overview-widget').innerText();
const dqText = await page.locator('.data-quality-panel').innerText();

const mustContain = [
  [overviewText, '11', 'churned customers'],
  [overviewText, '468,000', 'total revenue lost'],
  // PapaParse drops fully-empty CSV lines during parsing, so the fixture's
  // trailing blank row never reaches the blank-row counter (that counter
  // catches present-but-empty rows, which XLSX exports can contain).
  [dqText, '17 total rows parsed', ''],
  [dqText, '0 entirely blank rows dropped', ''],
  [dqText, '15 churn cases found', ''],
  [dqText, '11 distinct churned customers', ''],
  [dqText, '1 churn case rows excluded', 'missing account key'],
  [dqText, '1 churn case rows missing a usable Revenue value', ''],
  [dqText, '3 accounts had more than one churn case', ''],
  [dqText, 'map to more than one Salesforce account URL', 'duplicate-name detection'],
  [dqText, 'inconsistent Revenue', ''],
  [dqText, 'inconsistent Service Market', ''],
];
for (const [text, needle, label] of mustContain) {
  if (!text.includes(needle)) throw new Error(`Expected "${needle}" (${label}), got: ${text}`);
}
console.log('Data-quality + overview numeric checks: PASS');

// Cross-filter check. Clicking a legend item applies the same filter as
// clicking its bar, and targets by value rather than by canvas coordinates,
// so this stays correct as the fixture's segment mix changes.
await page.screenshot({ path: path.join(rootDir, 'build/screenshot-dashboard.png'), fullPage: true });

const SEGMENT_UNDER_TEST = '(NL) SME - Netherlands'; // 4 churned customers in the fixture
await page.locator(`.segment-breakdown-widget [data-legend-value="${SEGMENT_UNDER_TEST}"]`).click();
await page.waitForTimeout(200);

const overviewAfterFilter = await page.locator('.overview-widget').innerText();
console.log(`--- Overview after filtering to ${SEGMENT_UNDER_TEST} ---`);
console.log(overviewAfterFilter);
if (!overviewAfterFilter.includes('of 11 total')) {
  throw new Error(`Expected overview to show a filtered subset "of 11 total", got: ${overviewAfterFilter}`);
}
if (!overviewAfterFilter.includes('4')) {
  throw new Error(`Expected 4 churned customers in ${SEGMENT_UNDER_TEST}, got: ${overviewAfterFilter}`);
}

await page.screenshot({ path: path.join(rootDir, 'build/screenshot-filtered.png'), fullPage: true });

if (externalRequests.length > 0) {
  throw new Error(`Unexpected non-local requests during the flow: ${JSON.stringify(externalRequests)}`);
}

console.log('\nAll smoke-test checks passed, including cross-filter interaction. Zero external requests observed.');
await browser.close();
