# Collector

The collector is what makes the Ashford Land Finder search on its own. It runs outside the browser (on a schedule in GitHub Actions, or by hand), visits each configured source, reads the notices and listings, keeps parcels that meet the rules, and writes `data/found-parcels.js`, which the app loads on open.

```
sources.json  →  fetch (polite, cached)  →  extract parcels  →  normalise + dedupe
   →  acreage / land-only / price rules  →  geocode  →  radius filter
   →  estimate value where missing  →  data/found-parcels.js + last-run.json
```

## Running it by hand

```
cd collector
npm install
export ANTHROPIC_API_KEY=sk-ant-...     # or `ant auth login`
node run.js                              # Ashford, CT, 100 miles, 5+ acres, land only
node run.js --base ashford-wa --radius 75 --min-acres 10
node run.js --dry-run                    # print a summary and sample, write nothing
node run.js --source ct-tax-sales        # one source only
node run.js --no-llm                     # heuristic extraction, no API key needed
node run.js --include-structures         # keep improved parcels too
```

Then open `index.html`; the new parcels appear tagged **found** and the status line above the stats shows when the search last ran.

## Running it on a schedule

`.github/workflows/collect.yml` runs daily at 09:17 UTC and can be started by hand from the Actions tab. It commits `data/found-parcels.js`, `data/found-parcels.json`, `collector/last-run.json` and the geocode cache when anything changed. If the site is served by GitHub Pages, the page updates itself.

Add a repository secret named `ANTHROPIC_API_KEY`. Without it the workflow still runs, using the heuristic extractor, which is much noisier.

## How pages are read

Tax-sale notices, court lists and auction calendars have no consistent layout, so the collector converts each page to text and asks Claude to return the parcels as strict JSON (address, town, acres, asking price and what kind of price it is, assessed value, whether there is a structure, sale date, link). Each page's extraction is cached by content hash, so a page that has not changed costs nothing on the next run. A dependency-free regex extractor (`--no-llm`) exists for testing and as a fallback if the API is unavailable.

Roughly, a run over the default Connecticut sources reads 100 to 200 pages. With caching, only changed pages are re-read.

## Sources

`config/sources.json` lists sources with seed URLs, link-follow rules, a page cap, and the home bases they apply to. Three sources are placeholders for you to fill in, because the pages differ town by town:

- `ct-town-notices`: tax-collector or legal-notice pages for the towns nearest Ashford.
- `ma-land-court-tax-title`: treasurer auction pages for Massachusetts towns inside the radius.
- Rhode Island towns publish tax-sale lists individually; add them the same way.

The crawler honours `robots.txt`, identifies itself, waits 1.5 seconds between requests to the same host, and never follows more than the configured number of pages. Sites that render listings only with JavaScript or sit behind a login will come back with little text; the run summary notes those pages so you can see which sources are working.

## Values

The 15% test needs a value to compare against. Tax-sale notices often print the assessed value, which the app converts with the state's assessment ratio. Listings rarely do. For those, the collector estimates a market value as the median price per acre of ordinary land listings in the same county (or state when the county has fewer than four), times the parcel's acreage, and labels it `estimate: …` in the table. Distressed sales are excluded from the comparable set. It is a screen, not an appraisal; confirm on the assessor card before bidding.

## Output

`data/found-parcels.js` sets `window.FOUND_META` (run summary) and `window.FOUND_PARCELS`. Each parcel keeps a stable id derived from its source, town and address, so re-runs update the same record and the app preserves your status and notes on parcels you have edited. Parcels that stop appearing at their source are tagged **not seen lately** rather than deleted.

`last-run.json` has per-source diagnostics: pages fetched, raw parcels, errors and notes such as "little text (JS-rendered or blocked?)".
