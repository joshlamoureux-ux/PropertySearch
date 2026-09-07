// Polite fetcher: identifies itself, honours robots.txt, rate-limits per host,
// retries transient failures, and caches page bodies on disk so re-runs and
// re-extractions do not hammer the sources.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extractText } from "unpdf";

const UA_BOT = "AshfordLandFinder/0.1 (+https://github.com/joshlamoureux-ux/PropertySearch; land-opportunity research; contact via repo)";
const UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Fetcher {
  constructor({ cacheDir, ttlHours = 20, perHostDelayMs = 1500, timeoutMs = 30000, log = console, ua = "bot" }) {
    this.ua = ua === "browser" ? UA_BROWSER : UA_BOT;
    this.cacheDir = cacheDir; fs.mkdirSync(cacheDir, { recursive: true });
    this.ttlMs = ttlHours * 3600 * 1000;
    this.perHostDelayMs = perHostDelayMs;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.lastHit = new Map();   // host -> timestamp
    this.robots = new Map();    // host -> { disallow: [] }
    this.stats = { fetched: 0, cached: 0, failed: 0, robotsBlocked: 0 };
  }

  cachePath(url) { return path.join(this.cacheDir, sha1(url) + ".json"); }

  readCache(url) {
    try {
      const j = JSON.parse(fs.readFileSync(this.cachePath(url), "utf8"));
      if (Date.now() - j.fetchedAt < this.ttlMs) return j;
    } catch { /* miss */ }
    return null;
  }

  async robotsAllows(url) {
    const u = new URL(url);
    if (!this.robots.has(u.host)) {
      let rules = { disallow: [] };
      try {
        const res = await this.rawFetch(`${u.protocol}//${u.host}/robots.txt`);
        if (res.ok) rules = parseRobots(await res.text());
      } catch { /* treat as allowed */ }
      this.robots.set(u.host, rules);
    }
    const { disallow } = this.robots.get(u.host);
    const p = u.pathname + u.search;
    return !disallow.some(rule => rule && p.startsWith(rule));
  }

  async rawFetch(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await fetch(url, { headers: { "User-Agent": this.ua, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.8" }, redirect: "follow", signal: ctrl.signal });
    } finally { clearTimeout(t); }
  }

  async throttle(host) {
    const last = this.lastHit.get(host) || 0;
    const wait = last + this.perHostDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastHit.set(host, Date.now());
  }

  /** Returns { url, finalUrl, status, html, fromCache } or null when blocked/failed. */
  async get(url, { respectRobots = true } = {}) {
    const cached = this.readCache(url);
    if (cached) { this.stats.cached++; return { ...cached, fromCache: true }; }
    if (respectRobots && !(await this.robotsAllows(url))) {
      this.stats.robotsBlocked++; this.log.warn(`robots.txt disallows ${url}`); return null;
    }
    const host = new URL(url).host;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.throttle(host);
      try {
        const res = await this.rawFetch(url);
        if (res.status === 429 || res.status >= 500) { await sleep(2000 * attempt); continue; }
        const ctype = res.headers.get("content-type") || "";
        let html = "", text = null, isPdf = false;
        if (/application\/pdf/i.test(ctype) || /\.pdf(\?|$)/i.test(res.url || url)) {
          isPdf = true;
          try {
            const buf = new Uint8Array(await res.arrayBuffer());
            const r = await extractText(buf, { mergePages: true });
            text = String(r.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
          } catch (e) { this.log.warn(`pdf text extraction failed for ${url}: ${e.message}`); text = ""; }
        } else {
          html = await res.text();
        }
        const rec = { url, finalUrl: res.url || url, status: res.status, html, text, isPdf, fetchedAt: Date.now() };
        if (res.ok) fs.writeFileSync(this.cachePath(url), JSON.stringify(rec));
        this.stats.fetched++;
        if (!res.ok) this.log.warn(`HTTP ${res.status} for ${url}`);
        return { ...rec, fromCache: false };
      } catch (e) {
        if (attempt === 3) { this.stats.failed++; this.log.warn(`fetch failed for ${url}: ${e.message}`); return null; }
        await sleep(1500 * attempt);
      }
    }
    return null;
  }
}

export function parseRobots(text) {
  const disallow = []; let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const [k, ...rest] = line.split(":"); const v = rest.join(":").trim();
    const key = k.trim().toLowerCase();
    if (key === "user-agent") applies = v === "*" || /ashfordlandfinder/i.test(v);
    else if (key === "disallow" && applies && v) disallow.push(v.replace(/\*$/, ""));
  }
  return { disallow };
}
