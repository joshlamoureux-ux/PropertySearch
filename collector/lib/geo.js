// Geocoding via OpenStreetMap Nominatim (1 request/second, cached to disk) and
// distance maths. The geocode cache is committed so scheduled runs rarely need
// to hit Nominatim at all.

import fs from "node:fs";

const UA = "AshfordLandFinder/0.1 (+https://github.com/joshlamoureux-ux/PropertySearch)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export class Geocoder {
  constructor({ cacheFile, log = console, enabled = true }) {
    this.cacheFile = cacheFile; this.log = log; this.enabled = enabled;
    try { this.cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { this.cache = {}; }
    this.last = 0; this.stats = { lookups: 0, cached: 0, misses: 0 };
  }
  save() { fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 1)); }

  async lookup(query) {
    const key = query.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) return null;
    if (key in this.cache) { this.stats.cached++; return this.cache[key]; }
    if (!this.enabled) return null;
    const wait = this.last + 1100 - Date.now(); if (wait > 0) await sleep(wait);
    this.last = Date.now();
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), { headers: { "User-Agent": UA, "Accept": "application/json" } });
      this.stats.lookups++;
      if (!res.ok) { this.log.warn(`nominatim HTTP ${res.status}`); return null; }
      const data = await res.json();
      const hit = data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon), name: data[0].display_name, precision: data[0].addresstype || data[0].type } : null;
      if (!hit) this.stats.misses++;
      this.cache[key] = hit; this.save();
      return hit;
    } catch (e) { this.log.warn(`nominatim failed: ${e.message}`); return null; }
  }

  /** Try the full address first, then fall back to the town centre. */
  async locate(p, countryHint = "USA") {
    const parts = [p.address, p.town, p.county ? p.county + " County" : "", p.state, countryHint].filter(Boolean);
    let hit = p.address && p.town ? await this.lookup(parts.join(", ")) : null;
    let precision = hit ? "address" : null;
    if (!hit && p.town) { hit = await this.lookup([p.town, p.state, countryHint].filter(Boolean).join(", ")); precision = hit ? "town" : null; }
    return hit ? { lat: hit.lat, lng: hit.lng, precision } : null;
  }
}
