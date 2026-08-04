# Churn Analysis Dashboard — Phase 1

A single-file, fully offline HTML tool for analyzing churn from a Salesforce
case export. Upload your file, confirm the column mapping, and explore who
churned, why, and how much revenue was lost — with cross-filtering across
segments and churn reasons.

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

## What the tool does (Phase 1 scope)

1. **Upload** one churn case export (`.csv` or `.xlsx`) — one row per case,
   with account-level fields (Revenue, Service Market, etc.) repeated across
   every case row for that account.
2. **Confirm column mapping.** The customer key (Account Official Name) and
   Revenue are auto-detected by exact/near name match and required; all
   other fields are auto-suggested but you confirm or override them.
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
   legend. Each segment value and churn reason gets its own stable color
   from a muted/pastel palette; **subreasons are colored as shades of their
   parent churn reason**, so related subreasons read as one family. Click
   any bar, slice, or legend item to cross-filter the rest of the
   dashboard; click it again to clear.

### Expected columns

The tool is built against this export format (auto-detected by name; any
column can be remapped on the mapping screen):

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

Out of scope for Phase 1 (by design, for later phases): case-feedback/NPS
analysis and predictive modeling. The internal pipeline (`src/lib/`) is
staged (parse → map → filter → rollup) specifically so those can be added
without a rewrite.

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
- **Chart palette is muted/pastel.** The eight chart hues were searched
  against colorblind-separation and lightness/chroma checks rather than
  picked by eye, and sit at the pale end of what still passes: going any
  paler or greyer starts failing colour-blind separation. If you want them
  softer still, the honest trade is fewer simultaneous colours (fold small
  categories into "Other"), not weaker colours. Note that pastels are
  inherently low-contrast against the white page — the data label on every
  bar and the text legend are what keep a colour from carrying meaning on
  its own. Buttons, links and status text deliberately stay at full
  strength for legibility.
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
