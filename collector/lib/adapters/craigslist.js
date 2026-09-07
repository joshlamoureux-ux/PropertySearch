// Reader for Craigslist real-estate search results. The server-rendered page
// carries a set of listings as lines of the form
//   Title $price Location [https://www.craigslist.org/view/...]
// (Craigslist fills the main result grid with JavaScript; the lines present
// in the HTML are what this reader sees.)

import { pageText } from "../html.js";

const LINE = /^(.*?)\s+\$([\d,]+)(?:\s+(.*?))?\s+\[(https?:\/\/(?:www\.)?craigslist\.org\/view\/[^\]\s]+)\]\s*$/;
const ACRES = /([\d.]+)\s*\+?\s*(?:[a-z]+\s+)?(?:acres?|ac\b)/i;
const STRUCTURE = /\b(home|house|cabin|cottage|bed|bd|br\b|bath|bth|ba\b|ranch|colonial|cape|condo|apartment|duplex|mobile|manufactured|man\.\s*home|garage|barn|farmhouse)\b/i;
const LAND = /\b(land|lot|acreage|acres|parcel|building lot|wooded|meadow|timber|farmland|buildable)\b/i;
const RENT = /\b(rent|lease|rental|for rent)\b/i;

export async function collect({ source, fetcher, log }) {
  const parcels = [], notes = [], errors = [];
  let pagesFetched = 0;
  for (const url of source.seeds) {
    let page; try { page = await fetcher.get(url); } catch (e) { errors.push(`${url}: ${e.message}`); continue; }
    if (!page) { errors.push(`${url}: blocked/failed`); continue; }
    if (page.status >= 400) { errors.push(`${url}: HTTP ${page.status}`); continue; }
    pagesFetched++;
    let n = 0;
    for (const raw of pageText(page).split("\n")) {
      const m = LINE.exec(raw.trim()); if (!m) continue;
      const [, title, priceStr, location, link] = m;
      if (RENT.test(title)) continue;
      const price = Number(priceStr.replace(/,/g, ""));
      const a = ACRES.exec(title);
      const loc = (location || "").trim();
      const st = /,\s*([A-Z]{2})\b/.exec(loc);
      const town = loc.replace(/,\s*[A-Z]{2}\b.*$/, "").replace(/^(near|in)\s+/i, "").trim() || null;
      const auction = /\bauction\b/i.test(title);
      parcels.push({
        address: title.replace(/\s+/g, " ").trim().slice(0, 140),
        town, county: null, state: st ? st[1] : null, parcelId: null,
        acres: a ? Number(a[1]) : null,
        askingPrice: price > 0 ? price : null,
        priceKind: price > 0 ? "list-price" : "unknown",
        assessedValue: null,
        hasStructure: STRUCTURE.test(title) ? true : LAND.test(title) ? false : null,
        saleDate: null, url: link,
        dealType: auction ? "auction" : "fsbo",
        notes: "Craigslist; town is the poster's location label, confirm on the listing"
      });
      n++;
    }
    if (!n) notes.push(`${url}: no listing lines found`);
  }
  return { parcels, pagesFetched, notes, errors };
}
