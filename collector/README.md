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

The workflow is free on a public repository. It runs without any API key, using the built-in readers above and a regex extractor for pages without a dedicated reader. Adding a repository secret named `ANTHROPIC_API_KEY` switches the generic extractor to Claude, which reads unfamiliar page layouts far better; it is optional.

`debug=true` on a manual run dumps every page's text into `collector/debug/` and probes the URLs in `config/probe-urls.txt`, which is how new sources are inspected without leaving GitHub.

## How pages are read

Tax-sale notices, court lists and auction calendars have no consistent layout, so the collector converts each page to text and asks Claude to return the parcels as strict JSON (address, town, acres, asking price and what kind of price it is, assessed value, whether there is a structure, sale date, link). Each page's extraction is cached by content hash, so a page that has not changed costs nothing on the next run. A dependency-free regex extractor (`--no-llm`) exists for testing and as a fallback if the API is unavailable.

Roughly, a run over the default Connecticut sources reads 100 to 200 pages. With caching, only changed pages are re-read.

## Sources

`config/sources.json` lists sources with seed URLs, link-follow rules, a page cap, and the home bases they apply to. Sources with an `adapter` use a purpose-built reader in `lib/adapters/`:

- `cttaxsales`: Pullman & Comley's calendar of Connecticut municipal tax sales (upcoming and postponed), reading each parcel's PDF notice.
- `craigslist`: real-estate search pages for the regions around a base. Craigslist fills its result grid with JavaScript, so this sees the listings present in the HTML, a subset.
- `bid4assets`: the county tax-sale calendar, opening only auctions in the target states.

LandWatch, Land.com, LandSearch, Land And Farm, LandFlip and Auctions International refuse automated readers (HTTP 403 or a bot challenge) even with a browser identity, so they are disabled; use their links in the app's Sources tab by hand. Zillow and Realtor.com forbid scraping in their terms and are not included.

Three sources are placeholders for you to fill in, because the pages differ town by town:

- `ct-town-notices`: tax-collector or legal-notice pages for the towns nearest Ashford.
- `ma-land-court-tax-title`: treasurer auction pages for Massachusetts towns inside the radius.
- Rhode Island towns publish tax-sale lists individually; add them the same way.

The crawler honours `robots.txt`, identifies itself, waits 1.5 seconds between requests to the same host, and never follows more than the configured number of pages. Sites that render listings only with JavaScript or sit behind a login will come back with little text; the run summary notes those pages so you can see which sources are working.

## Values, for free: the assessor lookup

The 15% test needs a value to compare against. Connecticut tax-sale notices print the amount due but not the assessment, so after collection the collector looks each parcel up in its town's online assessor database when the town uses Vision Government Solutions (`gis.vgsi.com`), which is free and needs no login. It matches by street and house number (or by acreage on short streets for un-numbered "x acres on Some Road" notices) and fills in:

- acreage (Size in acres, summed across land lines),
- assessed value and the assessor's own appraisal, which the app uses as the market value,
- whether there is a structure (improvement value above zero),
- map/lot, land use and zone.

Parcels in current-use programs (PA 490 open space, forest or farm) are assessed far below appraisal, which the lookup notes, because converting them triggers a rollback tax.

Vision towns near Ashford so far: Pomfret, Woodstock, Thompson, Union, Willington, Hampton, Stafford, Tolland, Coventry, Brooklyn, Plainfield, Canterbury, Andover, Bolton and Sterling. Ashford itself, Eastford, Killingly, Putnam, Mansfield, Chaplin, Scotland, Windham, Lebanon, Columbia, Hebron, Ellington and Vernon use other vendors. The town-to-slug table is `VGSI_TOWNS` in `lib/enrich/vgsi.js`; add a town after confirming `https://gis.vgsi.com/<town>ct/` loads. Each run reads at most `COLLECTOR_MAX_CARDS` cards (default 80); pages are cached, so repeat runs re-read only what changed.

Where no assessor value is available, the collector estimates a market value as the median price per acre of ordinary land listings in the same county (or state, needing six samples with outliers trimmed), times the parcel's acreage, and labels it `estimate: …`. It is a screen, not an appraisal.

## Output

`data/found-parcels.js` sets `window.FOUND_META` (run summary) and `window.FOUND_PARCELS`. Each parcel keeps a stable id derived from its source, town and address, so re-runs update the same record and the app preserves your status and notes on parcels you have edited. Parcels that stop appearing at their source are tagged **not seen lately** rather than deleted.

`last-run.json` has per-source diagnostics: pages fetched, raw parcels, errors and notes such as "little text (JS-rendered or blocked?)".
