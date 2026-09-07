// Clean, dedupe, filter and enrich extracted parcels.

import { sha1 } from "./fetch.js";
import { haversineMiles } from "./geo.js";
import { DEAL_TYPES } from "./extract.js";

const STATE_OK = /^[A-Z]{2}$/;

export function normalizeParcel(raw, source) {
  const p = { ...raw };
  p.address = String(p.address || "").replace(/\s+/g, " ").trim();
  p.town = clean(p.town); p.county = clean(p.county)?.replace(/\s+county$/i, "") || null;
  p.state = (p.state || source.state || "").toUpperCase().slice(0, 2);
  if (!STATE_OK.test(p.state)) p.state = source.state || "";
  p.acres = num(p.acres); p.askingPrice = num(p.askingPrice); p.assessedValue = num(p.assessedValue);
  p.dealType = DEAL_TYPES.includes(p.dealType) ? p.dealType : (source.dealType || "other");
  p.hasStructure = p.hasStructure === true ? true : p.hasStructure === false ? false : null;
  p.saleDate = /^\d{4}-\d{2}-\d{2}$/.test(p.saleDate || "") ? p.saleDate : "";
  if (p.url && !/^https?:\/\//i.test(p.url)) p.url = null;
  p.source = source.name;
  p.sourceId = source.id;
  p.priceKind = p.priceKind || "unknown";
  // Stable id: same parcel on the same source keeps the same id across runs,
  // so the app can preserve the user's status and notes.
  p.id = "f_" + sha1([source.id, p.state, (p.town || "").toLowerCase(), p.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), p.parcelId || ""].join("|")).slice(0, 12);
  p.isFound = true;
  return p;
}

function clean(v) { v = v == null ? "" : String(v).replace(/\s+/g, " ").trim(); return v || null; }
function num(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) && n >= 0 ? n : null; }

export function dedupe(parcels) {
  const byId = new Map();
  for (const p of parcels) {
    const prev = byId.get(p.id);
    if (!prev) { byId.set(p.id, p); continue; }
    // Merge: keep the most complete record.
    for (const k of Object.keys(p)) if ((prev[k] == null || prev[k] === "") && p[k] != null && p[k] !== "") prev[k] = p[k];
  }
  return Array.from(byId.values());
}

/** Keep parcels that meet the size and land-only rules. Unknown structure status is kept. */
export function applyCriteria(parcels, { minAcres, landOnly }) {
  const dropped = { smallOrUnknownAcres: 0, structure: 0, noPrice: 0 };
  const kept = parcels.filter(p => {
    if (p.acres == null || p.acres < minAcres) { dropped.smallOrUnknownAcres++; return false; }
    if (landOnly && p.hasStructure === true) { dropped.structure++; return false; }
    if (p.askingPrice == null) { dropped.noPrice++; return false; }
    return true;
  });
  return { kept, dropped };
}

export function applyRadius(parcels, base, radiusMiles) {
  const inside = [], outside = [], unknown = [];
  for (const p of parcels) {
    if (p.lat == null || p.lng == null) { unknown.push(p); continue; }
    p.distanceMiles = Math.round(haversineMiles(base.lat, base.lng, p.lat, p.lng) * 10) / 10;
    (p.distanceMiles <= radiusMiles ? inside : outside).push(p);
  }
  return { inside, outside, unknown };
}

/**
 * When a parcel has no assessed value, estimate a market value from the
 * price-per-acre of ordinary listings (MLS / FSBO list prices) in the same
 * county, or state when the county has too few. Distressed sales are excluded
 * from the comparable set so they do not drag the benchmark down. The estimate
 * is written to marketValue with valueSource explaining it, so the app shows it
 * as an estimate rather than a fact.
 */
export function estimateValues(parcels, { minSamples = 4 } = {}) {
  const comps = parcels.filter(p => ["mls", "fsbo"].includes(p.dealType) && p.priceKind === "list-price" && p.askingPrice && p.acres >= 1);
  const groups = { county: new Map(), state: new Map() };
  for (const c of comps) {
    const ppa = c.askingPrice / c.acres;
    if (c.county) push(groups.county, `${c.state}|${c.county.toLowerCase()}`, ppa);
    push(groups.state, c.state, ppa);
  }
  let estimated = 0;
  for (const p of parcels) {
    if (p.assessedValue != null || p.marketValue != null || !p.acres) continue;
    const countyKey = p.county ? `${p.state}|${p.county.toLowerCase()}` : null;
    let sample = countyKey ? groups.county.get(countyKey) : null, area = p.county ? `${p.county} County` : null;
    if (!sample || sample.length < minSamples) { sample = groups.state.get(p.state); area = p.state; }
    if (!sample || sample.length < minSamples) continue;
    const med = median(sample);
    p.marketValue = Math.round(med * p.acres);
    p.valueSource = `estimate: median $${Math.round(med).toLocaleString()}/acre across ${sample.length} land listings in ${area}`;
    estimated++;
  }
  return estimated;
}

function push(map, k, v) { if (!map.has(k)) map.set(k, []); map.get(k).push(v); }
function median(a) { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
