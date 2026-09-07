#!/usr/bin/env node
// Ashford Land Finder collector.
//
//   node run.js [--base ashford-ct] [--radius 100] [--min-acres 5] [--include-structures]
//               [--source id,id] [--no-llm] [--no-geocode] [--dry-run] [--sources path]
//
// Fetches every enabled source for the chosen base, extracts parcels, applies
// the acreage / land-only rules, geocodes, filters to the radius, estimates a
// market value where the source gave none, and writes:
//   ../data/found-parcels.js    (loaded by the app)
//   ../data/found-parcels.json  (same data, plain JSON)
//   last-run.json               (run summary and per-source diagnostics)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Fetcher } from "./lib/fetch.js";
import { htmlToText, extractLinks, pageTitle, pageText } from "./lib/html.js";
import { ADAPTERS } from "./lib/adapters/index.js";
import { VgsiLookup } from "./lib/enrich/vgsi.js";
import { ClaudeExtractor, heuristicExtract } from "./lib/extract.js";
import { Geocoder } from "./lib/geo.js";
import { normalizeParcel, dedupe, applyCriteria, applyRadius, estimateValues } from "./lib/normalize.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf("--" + name); if (i === -1) return def; const v = argv[i + 1]; return v && !v.startsWith("--") ? v : true; };
const opts = {
  base: flag("base", process.env.COLLECTOR_BASE || "ashford-ct"),
  radius: Number(flag("radius", process.env.COLLECTOR_RADIUS || 100)),
  minAcres: Number(flag("min-acres", process.env.COLLECTOR_MIN_ACRES || 5)),
  landOnly: !argv.includes("--include-structures"),
  onlySources: flag("source", null),
  noLlm: argv.includes("--no-llm"),
  noGeocode: argv.includes("--no-geocode"),
  dryRun: argv.includes("--dry-run"),
  sourcesFile: flag("sources", path.join(here, "config", "sources.json")),
  outDir: flag("out", path.join(root, "data")),
  dumpDir: flag("dump-text", null),
  ua: flag("ua", process.env.COLLECTOR_UA || "bot"),
  customLat: flag("lat", null), customLng: flag("lng", null)
};

const log = {
  info: (...a) => console.log(new Date().toISOString().slice(11, 19), ...a),
  warn: (...a) => console.warn(new Date().toISOString().slice(11, 19), "WARN", ...a)
};

// ---------- base ----------
function loadBases() {
  const src = fs.readFileSync(path.join(root, "data", "bases.js"), "utf8");
  const window = {}; new Function("window", src)(window);
  return window.BASES;
}
const bases = loadBases();
let base = bases.find(b => b.id === opts.base);
if (!base) { console.error(`Unknown base "${opts.base}". Options: ${bases.map(b => b.id).join(", ")}`); process.exit(2); }
if (base.id === "custom") {
  if (opts.customLat == null || opts.customLng == null) { console.error("--base custom needs --lat and --lng"); process.exit(2); }
  base = { ...base, lat: Number(opts.customLat), lng: Number(opts.customLng) };
}

// ---------- sources ----------
const cfg = JSON.parse(fs.readFileSync(opts.sourcesFile, "utf8"));
let sources = cfg.sources.filter(s => s.enabled !== false && (!s.bases || s.bases.includes(base.id) || base.id === "custom"));
if (opts.onlySources) { const ids = String(opts.onlySources).split(","); sources = sources.filter(s => ids.includes(s.id)); }
if (!sources.length) { console.error("No sources enabled for this base."); process.exit(2); }

// ---------- main ----------
const startedAt = new Date();
log.info(`Collector starting: base=${base.short} radius=${opts.radius}mi minAcres=${opts.minAcres} landOnly=${opts.landOnly} extractor=${opts.noLlm ? "heuristic" : "claude"} sources=${sources.length}`);

const fetcher = new Fetcher({ cacheDir: path.join(here, "cache", "pages"), log, ua: opts.ua });
if (opts.dumpDir) fs.mkdirSync(opts.dumpDir, { recursive: true });
let dumpN = 0;
const geocoder = new Geocoder({ cacheFile: path.join(here, "cache", "geocode.json"), log, enabled: !opts.noGeocode });
let extractor = null;
if (!opts.noLlm) {
  try { extractor = new ClaudeExtractor({ cacheDir: path.join(here, "cache", "extractions"), log }); }
  catch (e) { log.warn(`Claude extractor unavailable (${e.message}); falling back to heuristic extraction`); }
}

const summary = { startedAt: startedAt.toISOString(), base: base.id, baseLabel: base.short, radiusMiles: opts.radius, minAcres: opts.minAcres, landOnly: opts.landOnly, extractor: extractor ? "claude" : "heuristic", sources: [] };
const allParcels = [];

for (const source of sources) {
  const srcSummary = { id: source.id, name: source.name, pagesFetched: 0, pagesSkipped: 0, rawParcels: 0, errors: [], notes: [] };
  if (source.adapter) {
    const adapter = ADAPTERS[source.adapter];
    if (!adapter) { srcSummary.errors.push(`unknown adapter ${source.adapter}`); summary.sources.push(srcSummary); continue; }
    log.info(`Source ${source.id}: adapter ${source.adapter}`);
    try {
      const extract = async (text, { url, dealType, hint }) => {
        if (extractor) { try { return await extractor.extract(text, { url, sourceHint: hint || source.name }); } catch (e) { if (/authentication/i.test(e.message)) { log.warn(e.message); extractor = null; summary.extractor = "heuristic"; } } }
        return heuristicExtract(text, { url, dealType });
      };
      const r = await adapter.collect({ source, fetcher, log, extract });
      srcSummary.pagesFetched = r.pagesFetched; srcSummary.rawParcels = r.parcels.length;
      srcSummary.notes.push(...r.notes); srcSummary.errors.push(...r.errors);
      for (const raw of r.parcels) {
        const p = normalizeParcel(raw, source);
        p.foundOn = raw.url || source.seeds?.[0] || null; p.firstSeen = startedAt.toISOString().slice(0, 10);
        allParcels.push(p);
      }
      if (opts.dumpDir) fs.writeFileSync(path.join(opts.dumpDir, `${String(++dumpN).padStart(3, "0")}-${source.id}-adapter.json`), JSON.stringify(r.parcels, null, 1));
    } catch (e) { srcSummary.errors.push(`adapter failed: ${e.message}`); }
    log.info(`  ${source.id}: ${srcSummary.pagesFetched} pages, ${srcSummary.rawParcels} raw parcels${srcSummary.errors.length ? ", " + srcSummary.errors.length + " errors" : ""}`);
    summary.sources.push(srcSummary); continue;
  }
  if (!source.seeds || !source.seeds.length) { srcSummary.notes.push("no seed URLs configured"); summary.sources.push(srcSummary); continue; }
  log.info(`Source ${source.id}: ${source.seeds.length} seed(s)`);
  const include = (source.follow?.include || []).map(r => new RegExp(r, "i"));
  const exclude = (source.follow?.exclude || []).map(r => new RegExp(r, "i"));
  const maxPages = source.follow?.maxPages ?? 20, maxDepth = source.follow?.depth ?? 1;
  const queue = source.seeds.map(u => ({ url: u, depth: 0 }));
  const seen = new Set();
  while (queue.length && srcSummary.pagesFetched < maxPages) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue; seen.add(url);
    let page;
    try { page = await fetcher.get(url); } catch (e) { srcSummary.errors.push(`${url}: ${e.message}`); continue; }
    if (!page) { srcSummary.pagesSkipped++; continue; }
    if (page.status >= 400) { srcSummary.errors.push(`${url}: HTTP ${page.status}`); continue; }
    srcSummary.pagesFetched++;
    const text = pageText(page);
    if (opts.dumpDir) {
      const links = extractLinks(page.html, page.finalUrl).map(l => `${l.text} -> ${l.href}`).join("\n");
      fs.writeFileSync(path.join(opts.dumpDir, `${String(++dumpN).padStart(3, "0")}-${source.id}.txt`), `URL: ${page.finalUrl}\nSTATUS: ${page.status}\nTITLE: ${pageTitle(page.html)}\n\n===== TEXT =====\n${text.slice(0, 40000)}\n\n===== LINKS =====\n${links.slice(0, 30000)}\n`);
    }
    if (text.length < 200) { srcSummary.notes.push(`${url}: little text (JS-rendered or blocked?)`); }
    else {
      let result;
      const heuristic = () => heuristicExtract(text, { url: page.finalUrl, dealType: source.dealType });
      if (!extractor) result = heuristic();
      else {
        try {
          result = await extractor.extract(text, { url: page.finalUrl, sourceHint: `${source.name} (${source.dealType})` });
          if (extractor.stats.failures && !result.parcels.length && extractor.lastError) { srcSummary.notes.push(`${url}: model extraction failed (${extractor.lastError}); used heuristic`); result = heuristic(); }
        } catch (e) {
          if (/authentication/i.test(e.message)) { log.warn(e.message); extractor = null; summary.extractor = "heuristic"; }
          else srcSummary.errors.push(`${url}: ${e.message}`);
          result = heuristic();
        }
      }
      const title = pageTitle(page.html);
      for (const raw of result.parcels) {
        const p = normalizeParcel(raw, source);
        if (!p.url) p.url = page.finalUrl;
        p.foundOn = page.finalUrl; p.pageTitle = title; p.firstSeen = startedAt.toISOString().slice(0, 10);
        allParcels.push(p);
      }
      srcSummary.rawParcels += result.parcels.length;
      if (!result.parcels.length && result.skipReason) srcSummary.notes.push(`${url}: ${result.skipReason}`);
    }
    if (depth < maxDepth && !page.isPdf) {
      for (const l of extractLinks(page.html, page.finalUrl)) {
        if (seen.has(l.href)) continue;
        if (!include.some(r => r.test(l.href))) continue;
        if (exclude.some(r => r.test(l.href))) continue;
        if (new URL(l.href).host !== new URL(url).host && !include.some(r => r.test(l.href))) continue;
        queue.push({ url: l.href, depth: depth + 1 });
      }
    }
  }
  log.info(`  ${source.id}: ${srcSummary.pagesFetched} pages, ${srcSummary.rawParcels} raw parcels${srcSummary.errors.length ? ", " + srcSummary.errors.length + " errors" : ""}`);
  summary.sources.push(srcSummary);
}

// ---------- filter, geocode, radius, value ----------
let parcels = dedupe(allParcels);
summary.rawParcels = allParcels.length; summary.uniqueParcels = parcels.length;
const { kept, dropped } = applyCriteria(parcels, { minAcres: opts.minAcres, landOnly: opts.landOnly, keepUnknownAcresFor: ["tax-sale", "tax-lien", "foreclosure", "estate", "government", "auction"] });
summary.dropped = dropped;
log.info(`${parcels.length} unique parcels; ${kept.length} meet acreage/land/price rules (dropped: ${JSON.stringify(dropped)})`);

// Assessor lookup (free): fills acreage, assessed value and the assessor's own
// appraisal for parcels in towns whose database is on Vision.
const vgsi = new VgsiLookup({ fetcher, log, maxCards: Number(process.env.COLLECTOR_MAX_CARDS || 150) });
if (!argv.includes("--no-assessor")) {
  const targets = kept.filter(p => p.assessedValue == null && vgsi.slugFor(p.town, p.state));
  log.info(`assessor lookup: ${targets.length} parcels in Vision towns`);
  for (const p of targets) { try { await vgsi.enrich(p); } catch (e) { log.warn(`assessor lookup failed for ${p.address}: ${e.message}`); } }
  log.info(`assessor lookup: ${JSON.stringify(vgsi.stats)}`);
}
summary.assessor = vgsi.stats;
// Re-apply the acreage rule now that some unknowns are filled.
for (const p of kept) { if (p.acres != null) { delete p.acresUnknown; } }
const kept2 = kept.filter(p => !(p.acres != null && p.acres < opts.minAcres) && !(opts.landOnly && p.hasStructure === true));
summary.droppedAfterAssessor = kept.filter(p => !kept2.includes(p)).map(p => ({ address: p.address, town: p.town, acres: p.acres, hasStructure: p.hasStructure, assessedValue: p.assessedValue, dealType: p.dealType }));
summary.assessorMatchedKept = kept2.filter(p => p.assessorUrl).length;
kept.length = 0; kept.push(...kept2);

for (const p of kept) {
  const hit = await geocoder.locate(p, base.state === "UK" ? "United Kingdom" : "USA");
  if (hit) { p.lat = hit.lat; p.lng = hit.lng; p.geoPrecision = hit.precision; }
}
const { inside, outside, unknown } = applyRadius(kept, base, opts.radius);
summary.geocode = geocoder.stats; summary.insideRadius = inside.length; summary.outsideRadius = outside.length; summary.noCoordinates = unknown.length;
log.info(`${inside.length} inside ${opts.radius} mi, ${outside.length} outside, ${unknown.length} without coordinates`);

// Parcels without coordinates but in a nearby state are kept so the user can place them.
const nearbyStates = new Set([base.state, ...(base.nearbyStates || [])]);
const final = inside.concat(unknown.filter(p => nearbyStates.has(p.state)));
summary.estimatedValues = estimateValues(kept);
summary.finalParcels = final.length;
summary.fetch = fetcher.stats;
summary.extractorStats = extractor ? extractor.stats : null;
summary.finishedAt = new Date().toISOString();
summary.durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

final.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));

// ---------- write ----------
const meta = { ranAt: summary.finishedAt, base: base.id, baseLabel: base.short, radiusMiles: opts.radius, minAcres: opts.minAcres, landOnly: opts.landOnly, extractor: summary.extractor, sources: summary.sources.map(s => ({ id: s.id, name: s.name, pages: s.pagesFetched, parcels: s.rawParcels, errors: s.errors.length, notes: s.notes.slice(0, 3) })), totals: { raw: summary.rawParcels, unique: summary.uniqueParcels, insideRadius: summary.insideRadius, noCoordinates: unknown.length, written: final.length } };

if (opts.dryRun) {
  console.log(JSON.stringify({ meta, sample: final.slice(0, 5) }, null, 2));
  log.info("dry run: nothing written");
} else {
  fs.mkdirSync(opts.outDir, { recursive: true });
  const js = `// Generated by collector/run.js on ${meta.ranAt}. Do not edit by hand; re-run the collector.\nwindow.FOUND_META = ${JSON.stringify(meta, null, 1)};\nwindow.FOUND_PARCELS = ${JSON.stringify(final, null, 1)};\n`;
  fs.writeFileSync(path.join(opts.outDir, "found-parcels.js"), js);
  fs.writeFileSync(path.join(opts.outDir, "found-parcels.json"), JSON.stringify({ meta, parcels: final }, null, 1));
  fs.writeFileSync(path.join(here, "last-run.json"), JSON.stringify(summary, null, 1));
  log.info(`wrote ${final.length} parcels to ${path.join(opts.outDir, "found-parcels.js")}`);
}
if (extractor) log.info(`Claude extractor: ${extractor.stats.calls} calls, ${extractor.stats.cached} cached, ~${extractor.stats.inputTokens} in / ${extractor.stats.outputTokens} out tokens`);
