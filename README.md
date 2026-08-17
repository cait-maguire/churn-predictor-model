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
   legend. Each segment value and churn reason gets its own stable color;
   **subreasons are colored as shades of their parent churn reason**, so
   related subreasons read as one family. Click any bar, slice, or legend
   item to cross-filter the rest of the dashboard; click it again to clear.

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

5. **Export a training table** (see below) — an account-month supervised
   learning table built from the same file, downloadable as CSV.

Out of scope (by design, for later phases): case-feedback/NPS analysis, and
model training itself — this tool produces the training table, it does not
fit a model. The internal pipeline (`src/lib/`) is staged (parse → map →
filter → rollup → training table) so those can be added without a rewrite.

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

## Training table export (account-month)

The dashboard also builds `ml_churn_account_month_v1` — a supervised
learning table at account-month grain — from the same uploaded file, and
offers it as a CSV download. It runs entirely in the browser: the file
never leaves your machine, and nothing is written to disk except the CSV
you explicitly save.

Open the **Training table export** panel on the dashboard, adjust the
options, and click download.

### Grain, features and label

- **One row per account per month end** (`as_of_month`).
- **Features use only records dated on or before `as_of_month`.** Trailing
  windows are half-open — `open_dt > as_of − N days AND open_dt <= as_of` —
  so a case opened exactly on the cutoff counts and one opened the next day
  does not. Service attributes come from the most recent case at or before
  the cutoff, never from the account's latest-ever row.
- **`label_left_90d = 1`** when the account has a `Case Status = Closed`,
  `Case Churn Decision = Left` case whose Churn Date falls in
  `(as_of_month, as_of_month + 90 days]` — strictly after the cutoff,
  inclusive of day 90. `label_left_rev_90d` carries the account's revenue on
  positive rows and 0 elsewhere.
- **Day arithmetic goes through the calendar, not `n × 86400000`.** Adding
  90 fixed-length days across a DST boundary lands on 23:00 the previous
  day, which silently moves a churn dated exactly on the horizon out of the
  window — so an analyst in Amsterdam would get different labels than one
  in UTC. `build/trainingTableTest.mjs` pins both DST directions.
- **`split`** is time-based, with an embargo: a row whose 90-day label
  window crosses a split boundary shares its outcome period with the next
  split, so it is marked `embargo` and belongs to neither.

### Three things to know before training on it

These are properties of the export, not bugs in the builder, and the panel
restates them against your actual numbers:

1. **There are no true negatives.** The export is a churn report, so every
   account in it churned. The rows labelled 0 are months *before* a churn,
   not customers who stayed. A model trained here estimates *when*, not
   *whether*, and cannot be scored against the live customer base. Fixing
   this needs a source listing all customers, churned or not.
2. **The features are largely built from the case that creates the label.**
   A churn case's Open Date precedes its Churn Date, so at a cutoff inside
   the horizon that case is usually already open — and `cases_30d`,
   `svc_exp_cases_180d` and the rest are counting it. This passes the
   cutoff rule and is still a label proxy. The `labeling_case_open_at_cutoff`
   column marks exactly which rows it affects, and the panel reports the
   share. On the sample fixture it is 100%. Until there is a source of
   general (non-churn) case activity, this table is better understood as a
   save-desk dataset — *will this open case end in a churn* — than as early
   warning.
3. **Revenue is an account attribute, not a per-case amount.** The blueprint's
   `revenue_hist_90d` / `revenue_hist_365d` would sum the same account
   figure once per case in the window, producing a scaled case count wearing
   a revenue label. Those columns are deliberately not emitted; a single
   `account_revenue` is, taken from the latest case at or before the cutoff.

### Columns

Stable in every export: `account_id`, `account_name`, `as_of_month`,
`service_market`, `service_type`, `service_team`, `segment_size`,
`market_country_code`, `account_revenue`, `days_since_last_case`,
`cases_30d/90d/180d/365d`, `left_cases_365d`,
`service_type_blank_rate_180d`, `label_left_90d`, `label_left_rev_90d`,
`labeling_case_open_at_cutoff`, `label_window_complete`, `split`.

The reason/subreason flag columns depend on the vocabulary in your file. A
hardcoded reason string that matches nothing produces a column of zeros
that looks like a real feature, so instead: the named spec columns
(`svc_exp_cases_180d`, `bankruptcy_cases_365d`, …) are matched
case-insensitively against the values actually present, any observed value
no spec column claims gets an auto-generated `reason_*` / `subreason_*`
column at both 180d and 365d, and spec columns that matched nothing are
**omitted and listed in the panel** rather than shipped as zeros.

### Assumptions specific to this table

- **`account_id` is the Account CRM URL**, falling back to the account name
  when the URL is blank. The export has no account ID column, and the URL is
  the closest thing to a real key; the panel counts how many accounts fell
  back to a name.
- **Accounts enter the spine at their first observed case.** Before that
  there is no evidence they were a customer, and an all-null feature row
  labelled 0 is noise rather than a negative.
- **Accounts leave the spine once they churn** (toggleable). Note this makes
  `left_cases_365d` structurally zero except for accounts with more than one
  churn case, since an account's own churn is never in its own past.
- **Rows whose label window extends past the file's latest date are dropped**
  (toggleable) as right-censored — a churn that has not been exported yet
  would otherwise be scored as a negative, which is a wrong label rather
  than a missing one.
- **Open cases count as activity signal but never as a label.** The
  dashboard counts only `Case Status = Closed`; an open case is still real
  activity at a cutoff that precedes its closure, so features see every case
  and only the label applies the status rule.
- **The market filter is applied per account, not per case**, so filtering
  cannot split one account's history in half. It defaults to `Netherlands`
  per the v1 plan; clear it for all markets.

### Tests

```
npm test        # boundary tests for the cutoff, label window, splits, censoring
npm run smoke   # drives the built HTML in a real browser (needs Playwright)
```

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
