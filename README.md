# Ashford Land Finder

A browser-only deal screener for raw land around Ashford. It finds parcels that are:

- within a chosen radius of your Ashford (default 100 miles),
- 5 or more acres (adjustable),
- land only, with no house or other structure,
- offered at 85% or less of adjusted market value (a 15%+ discount, adjustable),
- and tags each one by deal type: tax sale, tax lien, short sale, foreclosure, REO, auction, estate, government surplus, FSBO or MLS.

There is no build step and no server. Open `index.html` in a browser, or serve the folder from any static host (GitHub Pages works). The map library (Leaflet) and map tiles load from the internet; everything else works offline.

## Which Ashford?

Several US towns are named Ashford. The sidebar defaults to **Ashford, Connecticut** (Windham County) and also offers Ashford WA, AL, NY, WV, Ashford in Kent (UK), or custom coordinates. Changing the base changes the distance calculation, the default assessment ratio, and which regional sources appear.

## How the opportunity test works

```
market value   = assessed value ÷ assessment ratio
adjusted value = market value × market adjustment factor
                 (a comp-based value entered on the parcel overrides this)
discount       = 1 − asking price ÷ adjusted value
```

A parcel passes when discount ≥ 15% (asking ≤ 85% of adjusted value), it is inside the radius, it meets the acreage minimum and, if "land only" is on, it has no structure.

Default assessment ratios: Connecticut 0.70, Rhode Island and Massachusetts 1.00, Washington 1.00, Alabama 0.20 (0.10 for current-use farm or timber land), West Virginia 0.60. New York equalization rates vary by town; enter them per parcel.

## Getting parcels into it

The browser cannot scrape tax-collector sites, MLS feeds or auction platforms directly, so the page works from data you import or enter:

1. **Sources & searches tab**. Curated links to tax-sale calendars (for Connecticut, `cttaxsales.com` lists every municipal tax sale), court foreclosure lists, county tax-foreclosure auctioneers, USDA/GSA/Treasury dispositions, land marketplaces, and one-click searches pre-filled for land in your base state.
2. **Import**. Paste or upload CSV (or JSON). Common column names are recognised automatically, for example `address, town, state, acres, minimum bid, assessed value, building value, sale date, url, lat, lng`. A template is in `templates/parcels-template.csv`. Tax-sale notices and assessor exports usually paste straight in.
3. **Add parcel**. Manual entry with a live calculator and an address-to-coordinates lookup (OpenStreetMap Nominatim).

Everything is saved in the browser's localStorage. Use **Backup** to download a JSON copy and **Restore backup** to load it on another machine.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page layout, dialogs |
| `styles.css` | Styling, light and dark |
| `app.js` | Filtering, scoring, map, import/export, persistence |
| `data/bases.js` | Ashford locations, default assessment ratios |
| `data/sources.js` | Source directory and search-link templates |
| `data/sample-parcels.js` | Illustrative sample parcels (made-up numbers, real town centres) |
| `templates/parcels-template.csv` | Import template |

## Roadmap: automating the search

The next step is a small server (Node or Python, on a schedule) that collects candidates and writes a JSON file this page can import or fetch:

- **Tax sales**: scrape `cttaxsales.com` and the town treasurer pages for RI and MA; poll Bid4Assets, Auctions International and NYS Auctions for county auctions inside the radius.
- **Foreclosures**: CT Judicial foreclosure sales list; RI and MA court dockets.
- **Listings**: Zillow, Realtor.com and LandWatch searches filtered to Lots/Land, 5+ acres, sorted by price per acre; flag "short sale", "bank owned", "estate" and "motivated" in remarks.
- **Assessor join**: pull land and building assessed values from Vision (VGSI) assessor cards or MassGIS/CT parcel exports so the adjusted value is computed automatically and structures are detected from a non-zero building value.
- **Alerts**: email or text when a new parcel passes every test or when a sale date is within 14 days.

## Due-diligence reminders

Assessments lag the market, so confirm value with recent land sales. Check legal access and road frontage, wetlands and flood layers, zoning minimum lot size, septic feasibility, current-use programs with rollback taxes (CT PA 490, MA Chapter 61, AL current use), and the redemption period after a tax sale (six months in Connecticut, one year in Rhode Island, three years in Alabama).
