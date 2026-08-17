# Case Analysis Dashboard

A single-file, fully offline HTML tool for analysing case exports. Upload a
file, confirm what its columns are, and get a written account of what the
data says — followed by the charts that support it.

It works on any case-per-row export, not just churn: complaints, NPS, or
anything else with one row per case. The tool profiles every column, works
out what each one is, and analyses whatever it finds. A Salesforce churn
export additionally gets the churn-specific dashboard described below.

**The deliverable is `dist/churn-dashboard.html`.** Open it directly in a
browser (double-click it, or open the `file://` path) — no server, no
install, no internet connection required to run it. Nothing is saved:
closing or refreshing the page clears all data, and no data ever leaves
your machine.

## Building from source

The committed `dist/churn-dashboard.html` is generated from `src/`. To
rebuild it after making changes:

```
npm install
npm run build     # -> dist/churn-dashboard.html
npm run verify     # static check: no CDN/network references in the output
```

## Verifying the offline guarantee

`npm run verify` statically scans the built file for any `http(s)://`
reference, external `<script src>`/`<link href>`, or worker-script loading
pattern. For a stronger runtime check, open `dist/churn-dashboard.html` via
`file://` with your network disconnected and confirm the upload → mapping →
dashboard flow works with zero entries in your browser's DevTools Network
tab.

A dev-only smoke test (`build/smokeTest.mjs`, requires Playwright — not part
of the shipped file) drives the built dashboard against `fixtures/sample-churn-export.csv`
in a real browser, checks every computed number against hand-calculated
expected values, exercises cross-filtering, and asserts zero non-local
requests occur during the whole flow:

```
npm install -D playwright
node build/smokeTest.mjs
```

## What this data says — the findings section

Above the charts is a written analysis. It is computed, not generated: a
fixed battery of statistical questions is asked of whatever columns the
file turned out to have, and the answers that survive are written into
sentences. Examples from the bundled synthetic fixtures:

```
TIME TO CLOSE  Billing cases take a median of 44 days to close, 6.2× longer
               than the 7 days everything else takes.            n=30
PATTERN        Among North, 59% of cases are Billing — against 12%
               elsewhere.                                        n=41
CONCENTRATION  2 of 84 customers (2%) account for half of the total value.
SCORE          Enterprise averages 4.3 against 7.6 for everything else —
               3.3 points lower.                                 n=35
```

The generators cover value concentration across customers, share-of-value
against share-of-cases, cross-dimension lift, time-to-close by category,
score gaps, and shift over time. Which ones run depends on which roles the
file fills: two dates enable time-to-close, a rating enables score
comparisons, a value column enables concentration.

**There is no LLM involved.** The tool is fully offline, so sending your
data to a model is not an option, and the prose is templated from computed
statistics. That is the better trade here: every claim traces back to the
rows that produced it, and nothing can be invented that is not in the data.

### Why it often says less than you expect

Any breakdown of a few hundred rows throws up dozens of apparent
differences, and almost all of them are sampling noise. Before a finding
can be stated it must clear:

- a minimum cell size (5 cases) and group size (10 cases);
- a significance test — two-proportion z-test for rates, Welch's t-test for
  means — at p < 0.05;
- a minimum effect size (roughly 1.75× lift, 1.5× duration, 1 point of
  score, 12 percentage points of shift).

Findings are then ranked by effect size and capped per kind and per column,
so one strong signal cannot fill the page with restatements of itself. On
the complaints fixture, 61 candidate comparisons become 10 stated findings.
Anything resting on fewer than 25 cases is marked **thin evidence**.

When nothing clears the bar the tool says so. The 17-row churn fixture
produces no findings at all, and that is the correct output — not a
failure.

## What the tool does (Phase 1 scope)

1. **Upload** a case export (`.csv` or `.xlsx`) — one row per case.
2. **Confirm what the columns are.** Every column is profiled (type,
   cardinality, blank rate, sample values) and mapped to a *role* rather
   than to a known field name: customer identifier and event date are
   required, while value, score, outcome, reason and a second date are
   optional and each unlock more analysis. Any remaining categorical column
   becomes a breakdown dimension automatically, which is what lets the tool
   analyse an export it has never seen. If the file also matches the
   Salesforce churn format, its churn-specific fields are mapped as well.
3. **Review the data-quality summary** — row counts at every pipeline
   stage, blank rows dropped, rows excluded for a missing customer key or
   revenue, accounts with inconsistent values across their case rows, and
   account names that map to more than one Salesforce account.
4. **Explore the dashboard**:
   - total churned customers and revenue lost
   - revenue distribution across individual customers
   - customers/revenue by a segmentation field of your choice
   - churn reason breakdown, with a subreason drill-down
   - combined **segment × churn reason** stacked view

   Every bar carries a data label with its value, and every chart has a
   legend. Each segment value and churn reason gets its own stable color;
   **subreasons are colored as shades of their parent churn reason**, so
   related subreasons read as one family. Click any bar, slice, or legend
   item to cross-filter the rest of the dashboard; click it again to clear.

### The churn export format

When a file carries these columns, the churn-specific dashboard runs in
addition to the findings section. Any other file gets the findings section
plus a generic breakdown by any detected column.

```
Account Official Name    <- customer key (required)
Revenue                  <- required
Open Date
Case Status              <- churn filter: must equal "Closed"
Churn Date
Case Churn Decision      <- segment
Case Churn Type
Case Churn Reason
Case Churn Subreason
Service Market           <- segment
Service Team             <- segment
Service Type             <- segment
Case Win Back Action
Case Crm Url
Account Crm Url          <- used to detect duplicate account names
Affiliate Crm Url
```

Not yet built: joining a second file (e.g. a Cobra export) to add
contextual attributes about the same customers, and predictive modelling.
The pipeline (`src/lib/`) is staged — profile → roles → parse → map →
filter → rollup → findings — so both fit without a rewrite.

## Tests

```
npm test        # profiling, role inference and the findings engine (24 tests)
npm run smoke   # drives the built HTML in a real browser (needs Playwright)
```

`npm test` runs the same code against three differently-shaped fixtures —
churn, complaints and NPS — and asserts it reaches correct conclusions
about each without any of them being special-cased, including recovering
patterns deliberately planted in the synthetic files. The synthetic
fixtures exist because no real complaints or NPS export was available to
design against.

## Assumptions made (please confirm or correct)

These were either explicitly agreed during the build or are reasonable
defaults documented here per the original spec's request to flag
assumptions rather than bury them silently:

- **Customers are keyed by Account Official Name.** The current export has
  no company number, so churned customers are grouped by account name.
  Because two genuinely different Salesforce accounts could share a name,
  the tool compares each account name's `Account Crm Url` values and flags
  any name mapping to more than one Salesforce account in the data-quality
  panel — check that count before trusting customer totals. *(Confirmed
  with you during the build.)*
- **Churn rule: `Case Status = Closed`.** The export is already a churn
  report, so no record-type filter is applied; open cases are treated as
  churn attempts in progress and excluded from every count. `Case Churn
  Type` (Full/Partial Churn) is parsed and available but does **not**
  filter anything — partial churn counts as a churned customer. *(Confirmed
  with you during the build.)*
- **Revenue conflict / segment-field conflict resolution**: when an
  account's Revenue or a segment field (Case Churn Decision, Service
  Market, Service Team, Service Type) disagrees across that account's case
  rows, the tool uses the **first non-blank value in original row order**
  and flags the conflict in the data-quality panel. *(Confirmed with you
  during the build.)*
- **Revenue parsing is strict**: plain numbers only (e.g. `12345`) — no
  currency symbol or thousands-separator handling. If a real export ever
  uses a different format, values that fail to parse are counted as
  "missing revenue" rather than silently becoming `0` or crashing.
  *(Confirmed with you during the build.)*
- **Duplicate churn cases per account** (expected to be rare/an error,
  since one churn case per account is the norm): the tool uses the case
  with the most recent Churn Date for that account's Churn
  Reason/Subreason/Decision/Win Back Action, and flags the account in the
  data-quality panel. No user-facing toggle. *(Confirmed with you during
  the build.)*
- **No overall churn-rate metric.** Dashboard scope is churned customers
  only — no "% of total customer base," since the file isn't guaranteed to
  represent the full non-churned universe. *(Confirmed with you during the
  build.)*
- **Segmentation fields**: Service Market, Service Team, Service Type, and
  Case Churn Decision — four fields total. *(Confirmed with you during the
  build.)*
- **Case-insensitive matching** is used for the `Case Status` equality
  check (e.g. `"closed"` matches `"Closed"`), since real exports may have
  inconsistent casing.
- **Blank rows**: a row is treated as entirely blank (dropped, counted
  separately from missing-join-key rows) if every *mapped* field is empty
  — not necessarily every raw column, in case an unmapped column has
  stray data.
- **Subreason parent reason**: subreason colors are derived from the churn
  reason they appear under in the data. If the same subreason text appears
  under more than one reason, it is colored by its **most frequent** parent
  reason, and the widget says how many subreasons this affected rather than
  resolving it silently.
- **Data labels** are drawn on every bar, but suppressed on charts with more
  than 30 bars and inside stacked slices thinner than 16px, where they would
  overlap rather than inform.
- **Chart palette is a fixed, approved set of 14 colours** (see
  `src/ui/chartColors.js`). Nothing outside that list is ever drawn — no
  generated tints or shades — in either light or dark mode.
  - **Eight of the fourteen carry the categorical series.** Both which
    eight, and their order, were chosen by scoring options against the
    colour-blind separation checks (adjacent CVD ΔE 13.6, normal-vision
    21.0), with the extra constraint that the first five slots come from
    five different hue families. Most charts here show four to six
    categories, and a purely separation-optimal order front-loaded three
    blues — it measured fine but looked muddled.
  - **Five are held back for subreason drill-downs**: pale pink, sand,
    peach, light lime and mint sit at 1.3–1.6:1 against a white card, too
    faint to carry a whole series. They appear only in drill-downs, where
    there are few bars and each is labelled.
  - **Subreasons use other members of their parent reason's hue family**
    rather than generated tints, so a reason's subreasons still read as
    one family while staying inside the approved set. A reason with more
    subreasons than its family has members falls through to the rest of
    the palette.
  - **Caveat worth knowing**: these are light tones, so most sit below the
    3:1 contrast guideline against the white page. The per-bar data labels
    and the text legend are what keep colour from carrying meaning alone.
    Buttons and links use the palette's deepest blue (`#4b72ee`), the only
    member dark enough to sit behind white button text, and even that is
    marginally under the usual threshold for body-size text.
- **Revenue-distribution histogram threshold**: above 75 churned customers
  in the current selection, the per-customer bar chart switches to a
  12-bucket histogram for legibility. Arbitrary, easy to adjust in
  `src/ui/widgets/revenueDistributionWidget.js`.
- **Known dependency vulnerability**: the bundled `xlsx` (SheetJS) npm
  package has two published high-severity advisories (prototype pollution,
  ReDoS) with no fix available on the npm-published version — SheetJS
  moved newer releases off npm to their own distribution channel. Since
  this tool only parses files you choose to open locally (never untrusted
  network input), the practical risk is low, but it's worth knowing if you
  ever consider a stricter security posture for this tool.

## Project layout

```
src/            hand-maintained source
  lib/          pipeline stages (parse -> map -> filter -> rollup), pure functions
  state/        in-memory pub/sub store (no localStorage/sessionStorage anywhere)
  ui/           screens + Chart.js-based dashboard widgets
build/          build.mjs (esbuild bundle + HTML assembly), verifyOffline.mjs, smokeTest.mjs
fixtures/       dev-only test fixture (never bundled into the shipped HTML)
dist/           churn-dashboard.html — the deliverable
```
