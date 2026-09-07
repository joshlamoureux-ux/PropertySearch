// Reader for cttaxsales.com (Pullman & Comley's calendar of Connecticut
// municipal tax sales). Layout, as seen in the collector's debug dumps:
//
//   MUNICIPALITY:  Town of Thompson
//   AUCTION DATE: 10:00 a.m. on September 16, 2026
//   LOCATION: Thompson Town Hall, ...
//   2.25 acres on West Thompson Road, Thompson CT [https://.../notice.pdf]
//   257 Hilliard Street, Manchester CT [https://.../notice.pdf]
//
// Each parcel links to a PDF notice, which is fetched and searched for the
// assessed value, acreage, amount due and whether a dwelling is mentioned.
// The site tells bidders they pay their bid, not the debt; the amount due is
// recorded as the customary opening figure (priceKind "taxes-due").

import { pageText } from "../html.js";

const PAGES = ["https://cttaxsales.com/upcoming-tax-sales/", "https://cttaxsales.com/postponed-tax-sales/"];
const LINE = /^(.*?),\s*([A-Za-z .'\-]+?)\s+CT\|?\s*\[(https?:\/\/[^\]\s]+)\]\s*$/;
const ACRES_TITLE = /^([\d.]+)\s*(?:\+\/-\s*)?acres?\s+(?:on|off|at)?\s*(.+)$/i;

export async function collect({ source, fetcher, log, maxNotices = 80 }) {
  const parcels = [], notes = [], errors = [];
  let pagesFetched = 0;
  for (const url of source.seeds && source.seeds.length ? source.seeds : PAGES) {
    let page; try { page = await fetcher.get(url); } catch (e) { errors.push(`${url}: ${e.message}`); continue; }
    if (!page || page.status >= 400) { errors.push(`${url}: ${page ? "HTTP " + page.status : "blocked/failed"}`); continue; }
    pagesFetched++;
    const postponed = /postponed/i.test(url);
    let town = null, saleDate = "", location = "";
    for (const raw of pageText(page).split("\n")) {
      const line = raw.trim();
      let m;
      if ((m = /^MUNICIPALITY:\s*(?:Town|City|Borough) of\s+(.+)$/i.exec(line))) { town = m[1].trim(); saleDate = ""; location = ""; continue; }
      if ((m = /^AUCTION DATE:\s*(.+)$/i.exec(line))) { saleDate = parseDate(m[1]); continue; }
      if ((m = /^LOCATION:\s*(.+)$/i.exec(line))) { location = m[1].trim(); continue; }
      if (!(m = LINE.exec(line))) continue;
      let [, title, lineTown, pdf] = m;
      title = title.trim(); lineTown = lineTown.trim();
      let acres = null, address = title;
      const a = ACRES_TITLE.exec(title);
      if (a) { acres = Number(a[1]); address = a[2].trim(); }
      parcels.push({
        address, town: lineTown || town, county: null, state: "CT", parcelId: null, acres,
        askingPrice: null, priceKind: "taxes-due", assessedValue: null,
        hasStructure: a ? false : null, saleDate: postponed ? "" : saleDate, url: pdf, dealType: "tax-sale",
        notes: [postponed ? "Postponed for lack of bidders; the site accepts emailed bids" : location ? "Auction at " + location : "", a ? "Vacant per notice title" : ""].filter(Boolean).join(". ")
      });
    }
  }
  // Read the notice PDFs for details (cached, so re-runs are cheap).
  let read = 0;
  for (const p of parcels) {
    if (read >= maxNotices) { notes.push(`notice cap ${maxNotices} reached; remaining parcels have index data only`); break; }
    let pdf; try { pdf = await fetcher.get(p.url); } catch { pdf = null; }
    read++;
    if (!pdf || !pdf.isPdf || !pdf.text) { notes.push(`${p.url}: notice not readable`); continue; }
    const t = pdf.text.replace(/\s+/g, " ");
    const due = /TOTAL AMOUNT DUE:\s*\$\s?([\d,]+(?:\.\d{2})?)/i.exec(t) || /(?:total|amount)\s+due[^$]{0,40}?\$\s?([\d,]{3,}(?:\.\d{2})?)/i.exec(t);
    if (due) p.askingPrice = Math.round(Number(due[1].replace(/,/g, "")));
    const addr = /ADDRESS OF REAL ESTATE:\s*(.+?)\s+PROPERTY BOUNDARIES:/i.exec(t);
    if (addr && !p.acres) { const ac = /[±~]?\s*([\d.]+)\s*\+?\s*acres?/i.exec(addr[1]); if (ac) p.acres = Number(ac[1]); }
    const vol = /Volume\s+(\d+)\s+Page\s+(\d+)/i.exec(t);
    if (vol) p.notes = [p.notes, `Land records Vol. ${vol[1]} Pg. ${vol[2]}`].filter(Boolean).join(". ");
    const owner = /DELINQUENT TAXPAYER:\s*(.+?)\s+ADDRESS OF REAL ESTATE:/i.exec(t);
    if (owner && /estate of/i.test(owner[1])) { p.dealType = "tax-sale"; p.notes = [p.notes, "Owner is an estate"].filter(Boolean).join(". "); }
    const assessed = /assess(?:ed|ment)[^$]{0,80}?\$\s?([\d,]{4,})/i.exec(t);
    if (assessed) p.assessedValue = Number(assessed[1].replace(/,/g, ""));
    if (p.hasStructure == null) {
      if (/^(mobile home|unit\s|condominium)/i.test(p.address) || /\b(dwelling|single[- ]family|two[- ]family|multi[- ]family|residence|condominium unit|apartment)\b/i.test(t)) p.hasStructure = true;
      else if (/\b(vacant|unimproved|undeveloped|land only|rear lot|lot of land|parcel of land)\b/i.test(t)) p.hasStructure = false;
    }
    if (/^mobile home/i.test(p.address)) p.notes = [p.notes, "Mobile home only; land may be leased"].filter(Boolean).join(". ");
    if (/redeem|redemption/i.test(t)) p.notes = [p.notes, "Six-month redemption period after sale"].filter(Boolean).join(". ");
  }
  return { parcels, pagesFetched, notes, errors };
}

export function parseDate(s) {
  const m = /([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d{2})/.exec(s);
  if (!m) return "";
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00:00 UTC`);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
