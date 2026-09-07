// Assessor lookup against Vision Government Solutions online databases
// (gis.vgsi.com/<town><st>/), which most Connecticut, Massachusetts and Rhode
// Island towns use. Free, no login. Layout observed in the collector's probes:
//
//   Streets.aspx?Letter=M         -> list of street names, each linking to
//   Streets.aspx?Name=MILL%20RD   -> rows "10 MILL RD [Parcel.aspx?pid=1327] Mblu: 30/ F/ 005.00/ /"
//   Parcel.aspx?pid=1327          -> card with Location, Mblu, Assessment, Appraisal,
//                                    Improvements/Land/Total, Style (e.g. Vacant Land),
//                                    Use Code + Description, Zone, Size (Acres)
//
// For a parcel with a house number the match is exact. For "x acres on Some Road"
// notices with no number, every parcel on the street is checked when the street
// is short, matching on acreage.

import { pageText } from "../html.js";

const BASE = process.env.VGSI_BASE || "https://gis.vgsi.com";

// Town -> Vision slug. Probed 2026-09-07; towns not listed use another vendor
// (Ashford, Eastford, Killingly, Putnam, Mansfield, Chaplin, Scotland, Windham,
// Lebanon, Columbia, Hebron, Ellington, Vernon are NOT on Vision).
export const VGSI_TOWNS = {
  CT: {
    "pomfret": "pomfretct", "woodstock": "woodstockct", "thompson": "thompsonct", "union": "unionct",
    "willington": "willingtonct", "hampton": "hamptonct", "stafford": "staffordct", "tolland": "tollandct",
    "coventry": "coventryct", "brooklyn": "brooklynct", "plainfield": "plainfieldct", "canterbury": "canterburyct",
    "andover": "andoverct", "bolton": "boltonct", "sterling": "sterlingct"
  },
  MA: {},
  RI: {}
};

const SUFFIX = { ROAD: "RD", STREET: "ST", AVENUE: "AVE", DRIVE: "DR", LANE: "LN", COURT: "CT", HIGHWAY: "HWY", TURNPIKE: "TPKE", TERRACE: "TER", PLACE: "PL", CIRCLE: "CIR", BOULEVARD: "BLVD", PARKWAY: "PKWY", TRAIL: "TRL", EXTENSION: "EXT", ROUTE: "RTE", PIKE: "PIKE", WAY: "WAY", HILL: "HILL", PATH: "PATH", SQUARE: "SQ", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };
const SUFFIX_SET = new Set([...Object.keys(SUFFIX), ...Object.values(SUFFIX)]);

export function streetKey(name) {
  const words = String(name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map(w => SUFFIX[w] || w);
  // Drop a trailing suffix word for loose matching (RD/ST/...), keep the rest.
  const core = words.length > 1 && SUFFIX_SET.has(words[words.length - 1]) ? words.slice(0, -1) : words;
  return { full: words.join(" "), core: core.join(" ") };
}

/** "0 Hall Hill Road" -> {number:"0", street:"Hall Hill Road"}; "±2.25 acres on West Thompson Road" -> {number:null, street:"West Thompson Road"} */
export function splitAddress(address) {
  let a = String(address || "").replace(/^(mobile home at|unit \S+ at|lot \S+ at)\s+/i, "").trim();
  a = a.replace(/^[±~]?\s*[\d.]+\s*\+?\s*acres?\s+(?:on|off|at|near)\s+/i, "");
  // "874 and 876 Gibson Hill Road" -> first number, shared street; "0 Main Street and 0 Sterling Road" -> first address.
  const multi = /^(\d+[A-Za-z]?)(?:\s*(?:-|,|and|&)\s*\d+[A-Za-z]?)+\s+([A-Za-z].+)$/.exec(a);
  if (multi) return { number: multi[1].toUpperCase(), street: multi[2].split(/\s+(?:and|&|a\/k\/a|aka)\s+/i)[0].replace(/,.*$/, "").trim() };
  a = a.split(/\s+(?:and|&|a\/k\/a|aka)\s+/i)[0];
  const m = /^(\d+[A-Za-z]?(?:-\d+)?)\s+(.+)$/.exec(a);
  if (m) return { number: m[1].split("-")[0].toUpperCase(), street: m[2].replace(/,.*$/, "").trim() };
  return { number: null, street: a.replace(/,.*$/, "").trim() };
}

export class VgsiLookup {
  constructor({ fetcher, log = console, maxCards = 60 }) {
    this.fetcher = fetcher; this.log = log; this.maxCards = maxCards;
    this.streetIndex = new Map(); // slug|letter -> [{name,url}]
    this.stats = { attempted: 0, matched: 0, cards: 0, noTown: 0, noStreet: 0, noNumber: 0 };
  }

  slugFor(town, state) { return (VGSI_TOWNS[state] || {})[String(town || "").toLowerCase().replace(/^(town|city) of /, "").trim()] || null; }

  async streetsForLetter(slug, letter) {
    const key = slug + "|" + letter;
    if (this.streetIndex.has(key)) return this.streetIndex.get(key);
    const page = await this.fetcher.get(`${BASE}/${slug}/Streets.aspx?Letter=${encodeURIComponent(letter)}`);
    const list = [];
    if (page && page.status < 400) {
      const re = /([A-Z0-9][A-Z0-9 .'&\/-]{1,60}?)\s+\[([^\]]*Streets\.aspx\?Name=[^\]]+)\]/g;
      let m; const text = pageText(page);
      while ((m = re.exec(text))) list.push({ name: m[1].trim(), url: m[2] });
    }
    this.streetIndex.set(key, list);
    return list;
  }

  async findStreet(slug, street) {
    const k = streetKey(street);
    if (!k.core) return null;
    const list = await this.streetsForLetter(slug, k.core[0]);
    const exact = list.find(s => streetKey(s.name).full === k.full);
    if (exact) return exact;
    const loose = list.filter(s => streetKey(s.name).core === k.core);
    return loose.length === 1 ? loose[0] : (loose[0] || null);
  }

  async parcelsOnStreet(streetUrl) {
    const page = await this.fetcher.get(streetUrl);
    if (!page || page.status >= 400) return [];
    const rows = [];
    const re = /^(\d+[A-Z]?(?:-\d+[A-Z]?)?|0)[ \t]+([^\n\[]+?)[ \t]+\[([^\]\n]*Parcel\.aspx\?pid=\d+)\](?:[ \t]+Mblu:[ \t]*([^\n]+))?/gm;
    let m; const text = pageText(page);
    while ((m = re.exec(text))) rows.push({ number: m[1].toUpperCase(), street: m[2], url: m[3], mblu: (m[4] || "").trim() });
    return rows;
  }

  async card(url) {
    const page = await this.fetcher.get(url);
    if (!page || page.status >= 400) return null;
    this.stats.cards++;
    const lines = pageText(page).split("\n").map(l => l.replace(/^\|\s*/, "").trim()).filter(Boolean);
    const after = (label, n = 1) => { const i = lines.findIndex(l => l.toLowerCase() === label.toLowerCase()); return i >= 0 ? lines[i + n] : null; };
    const money = v => { const m = /\$\s?([\d,]+)/.exec(v || ""); return m ? Number(m[1].replace(/,/g, "")) : null; };
    const c = { location: after("Location"), mblu: after("Mblu"), assessment: money(after("Assessment")), appraisal: money(after("Appraisal")), style: null, useDesc: null, zone: after("Zone"), acres: null, improvementsAppraised: null, valuationYear: null };
    const si = lines.findIndex(l => /^Style:?$/i.test(l)); if (si >= 0) c.style = lines[si + 1];
    // Land section: Use Code / Description follow the "Land Use" heading.
    const lu = lines.findIndex(l => /^Land Use$/i.test(l));
    if (lu >= 0) { const d = lines.slice(lu, lu + 8).findIndex(l => /^Description$/i.test(l)); if (d >= 0) c.useDesc = lines[lu + d + 1]; }
    let acres = 0, any = false;
    lines.forEach((l, i) => { if (/^Size \(Acres\)$/i.test(l) && /^[\d.]+$/.test(lines[i + 1] || "")) { acres += Number(lines[i + 1]); any = true; } });
    if (any) c.acres = Math.round(acres * 100) / 100;
    // Current Value / Appraisal table: Valuation Year | Improvements | Land | Total, then a row of values.
    const cv = lines.findIndex(l => /^Current Value$/i.test(l));
    if (cv >= 0) {
      const seg = lines.slice(cv, cv + 14);
      const yi = seg.findIndex(l => /^\d{4}$/.test(l));
      if (yi >= 0) { c.valuationYear = seg[yi]; c.improvementsAppraised = money(seg[yi + 1]); c.landAppraised = money(seg[yi + 2]); c.totalAppraised = money(seg[yi + 3]); }
    }
    return c;
  }

  /** Try to enrich one parcel in place. Returns true when a card was matched. */
  async enrich(p) {
    if (this.stats.cards >= this.maxCards) return false;
    const slug = this.slugFor(p.town, p.state);
    if (!slug) { this.stats.noTown++; return false; }
    this.stats.attempted++;
    const { number, street } = splitAddress(p.address);
    if (!street) return false;
    const s = await this.findStreet(slug, street);
    if (!s) { this.stats.noStreet++; return false; }
    const rows = await this.parcelsOnStreet(s.url);
    let candidates = [];
    if (number != null) candidates = rows.filter(r => r.number === number);
    else if (rows.length && rows.length <= 12) candidates = rows;
    else { this.stats.noNumber++; return false; }
    if (!candidates.length) { this.stats.noNumber++; return false; }
    let chosen = null, card = null;
    for (const r of candidates) {
      const c = await this.card(r.url); if (!c) continue;
      if (number != null) { chosen = r; card = c; break; }
      if (p.acres != null && c.acres != null && Math.abs(c.acres - p.acres) <= Math.max(0.15, p.acres * 0.06)) { chosen = r; card = c; break; }
      if (this.stats.cards >= this.maxCards) break;
    }
    if (!card) return false;
    this.stats.matched++;
    if (p.acres == null && card.acres != null) p.acres = card.acres;
    if (card.assessment != null) p.assessedValue = card.assessment;
    if (card.appraisal != null) { p.marketValue = card.appraisal; p.valueSource = `assessor appraisal (Vision${card.valuationYear ? ", " + card.valuationYear + " valuation" : ""})`; }
    const vacant = /vacant/i.test(card.style || "") || /vacant|open space|forest|farm land|undevelop/i.test(card.useDesc || "");
    if (card.improvementsAppraised != null) p.hasStructure = card.improvementsAppraised > 0;
    else if (card.style) p.hasStructure = !vacant;
    if (card.mblu && !p.parcelId) p.parcelId = card.mblu.replace(/\s+/g, "");
    const facts = [card.useDesc ? "Use: " + card.useDesc : "", card.zone ? "Zone " + card.zone : "", card.assessment != null && card.appraisal ? `assessed ${Math.round(card.assessment / card.appraisal * 100)}% of appraisal` : ""].filter(Boolean);
    if (card.assessment != null && card.appraisal && card.assessment / card.appraisal < 0.5) facts.push("likely PA 490 current-use assessment; conversion can trigger rollback tax");
    p.notes = [p.notes, "Assessor: " + facts.join(", ") + (chosen && chosen.url ? ` [${chosen.url}]` : "")].filter(Boolean).join(". ");
    p.assessorUrl = chosen ? chosen.url : null;
    return true;
  }
}
