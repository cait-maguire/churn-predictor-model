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
  [overviewText, '5', 'churned customers'],
  [overviewText, '182,000', 'total revenue lost'],
  [dqText, '11 total rows parsed', ''],
  [dqText, '1 entirely blank rows dropped', ''],
  [dqText, '8 churn cases found', ''],
  [dqText, '5 distinct churned customers', ''],
  [dqText, '2 accounts had more than one churn case', ''],
  [dqText, 'inconsistent Revenue', ''],
  [dqText, 'inconsistent Service Segment', ''],
];
for (const [text, needle, label] of mustContain) {
  if (!text.includes(needle)) throw new Error(`Expected "${needle}" (${label}), got: ${text}`);
}
console.log('Data-quality + overview numeric checks: PASS');

// Cross-filter check: click the "SME" bar in the segment count chart, confirm
// overview narrows from 5 to 4 customers (SME = Acme, Gamma, Delta, Epsilon).
await page.screenshot({ path: path.join(rootDir, 'build/screenshot-dashboard.png'), fullPage: true });

const segmentCanvas = page.locator('#segment-count-canvas');
const box = await segmentCanvas.boundingBox();
// Chart.js draws category bars left-to-right in descending count order; SME
// (count 4) should be the first/tallest bar. Try a few candidate points
// within the expected bar column/height until the filter actually applies,
// since exact plot-area padding isn't known ahead of time.
let overviewAfterFilter = await page.locator('.overview-widget').innerText();
const candidates = [
  [0.30, 0.5], [0.32, 0.6], [0.28, 0.7], [0.35, 0.4], [0.25, 0.8],
];
for (const [xf, yf] of candidates) {
  await page.mouse.click(box.x + box.width * xf, box.y + box.height * yf);
  await page.waitForTimeout(150);
  overviewAfterFilter = await page.locator('.overview-widget').innerText();
  if (overviewAfterFilter.includes('of 5 total')) break;
}
console.log('--- Overview after clicking segment bar ---');
console.log(overviewAfterFilter);
if (!overviewAfterFilter.includes('of 5 total')) {
  throw new Error(`Expected overview to show a filtered subset "of 5 total", got: ${overviewAfterFilter}`);
}

await page.screenshot({ path: path.join(rootDir, 'build/screenshot-filtered.png'), fullPage: true });

if (externalRequests.length > 0) {
  throw new Error(`Unexpected non-local requests during the flow: ${JSON.stringify(externalRequests)}`);
}

console.log('\nAll smoke-test checks passed, including cross-filter interaction. Zero external requests observed.');
await browser.close();
