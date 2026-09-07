// Turns page text into structured parcel candidates.
//
// Two extractors:
//   1. claudeExtract  - sends the page text to Claude with a strict JSON schema.
//                       Handles tax-sale notices, auction calendars and listing
//                       pages whose layout we have never seen.
//   2. heuristicExtract - dependency-free regex pass used with --no-llm, when no
//                       API credential is available, or as a fallback if the API
//                       call fails. Much noisier; good enough to smoke-test the
//                       pipeline and to catch obvious acreage + price pairs.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { chunkText } from "./html.js";
import { sha1 } from "./fetch.js";

export const DEAL_TYPES = ["tax-sale", "tax-lien", "short-sale", "foreclosure", "reo", "auction", "estate", "government", "fsbo", "mls", "other"];

const ParcelSchema = z.object({
  address: z.string().describe("Street address, road name, or lot description as written on the page"),
  town: z.string().nullable(),
  county: z.string().nullable(),
  state: z.string().nullable().describe("Two-letter US state code, e.g. CT"),
  parcelId: z.string().nullable().describe("Assessor map/lot, APN, PID or tax ID if shown"),
  acres: z.number().nullable().describe("Lot size in acres. Convert square feet to acres (43,560 sq ft per acre)."),
  askingPrice: z.number().nullable().describe("Dollar amount the buyer would pay: list price, minimum/opening bid, or amount of taxes due for a tax sale"),
  priceKind: z.enum(["list-price", "minimum-bid", "taxes-due", "sold-price", "unknown"]),
  assessedValue: z.number().nullable().describe("Total assessed value from the assessor if shown"),
  hasStructure: z.boolean().nullable().describe("true if a house, cabin, barn, mobile home or other building is on the parcel; false if described as vacant, raw or undeveloped land; null if not stated"),
  saleDate: z.string().nullable().describe("Auction or sale date as YYYY-MM-DD if shown"),
  url: z.string().nullable().describe("Link to the specific listing or notice if one appears in square brackets next to it"),
  dealType: z.enum(DEAL_TYPES).nullable(),
  notes: z.string().nullable().describe("Short facts worth keeping: access, wetlands, zoning, redemption period, owner financing, price reduced")
});
const ExtractionSchema = z.object({
  parcels: z.array(ParcelSchema),
  pageKind: z.enum(["listing-index", "listing-detail", "tax-sale-notice", "auction-calendar", "court-notice", "other"]),
  skipReason: z.string().nullable().describe("If nothing relevant was on the page, why (e.g. login wall, only houses, calendar with no parcels)")
});

const SYSTEM = `You extract land-for-sale opportunities from web page text for a buyer looking for vacant land near a home base.

Rules:
- Only report parcels that are actually offered on the page: for sale, at auction, in a tax sale, in foreclosure, or listed as surplus. Do not invent parcels, prices, acreage or dates. If a field is not stated, return null.
- One entry per parcel. Include parcels of any size; the caller filters by acreage. Include improved parcels too but set hasStructure true.
- askingPrice is what a buyer would pay: list price, minimum or opening bid, or taxes due for a tax sale. Never put assessed value in askingPrice.
- Prefer the listing's own link when a bracketed [URL] appears next to it.
- Text may be a page fragment; treat it on its own.
- Keep notes under 200 characters and factual.`;

const MODEL = process.env.COLLECTOR_MODEL || "claude-opus-5";

export class ClaudeExtractor {
  constructor({ cacheDir, log = console }) {
    this.client = new Anthropic();
    this.cacheDir = cacheDir; fs.mkdirSync(cacheDir, { recursive: true });
    this.log = log;
    this.stats = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, failures: 0 };
    this.lastError = null;
  }

  async extract(text, { url, sourceHint }) {
    const chunks = chunkText(text);
    const results = [];
    for (const [i, chunk] of chunks.entries()) {
      const key = sha1(MODEL + "|" + sourceHint + "|" + chunk);
      const cachePath = path.join(this.cacheDir, key + ".json");
      try {
        const j = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        this.stats.cached++; results.push(j); continue;
      } catch { /* miss */ }
      try {
        const response = await this.client.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          output_config: { format: zodOutputFormat(ExtractionSchema), effort: "medium" },
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: `Source: ${sourceHint}\nPage URL: ${url}\nPart ${i + 1} of ${chunks.length}\n\n<page_text>\n${chunk}\n</page_text>` }]
        });
        this.stats.calls++;
        this.stats.inputTokens += response.usage.input_tokens + (response.usage.cache_read_input_tokens || 0) + (response.usage.cache_creation_input_tokens || 0);
        this.stats.outputTokens += response.usage.output_tokens;
        if (response.stop_reason === "refusal") { this.stats.failures++; this.log.warn(`extractor declined ${url}`); continue; }
        const parsed = response.parsed_output;
        if (!parsed) { this.stats.failures++; this.log.warn(`extractor returned unparseable output for ${url}`); continue; }
        fs.writeFileSync(cachePath, JSON.stringify(parsed));
        results.push(parsed);
      } catch (e) {
        this.stats.failures++;
        if (e instanceof Anthropic.AuthenticationError || /authentication|apiKey|authToken/i.test(e.message)) throw new Error("Anthropic API authentication failed. Set ANTHROPIC_API_KEY (or run `ant auth login`), or use --no-llm.");
        if (e instanceof Anthropic.RateLimitError) { this.log.warn("rate limited; waiting 30s"); await new Promise(r => setTimeout(r, 30000)); i--; continue; }
        this.lastError = e.message;
        this.log.warn(`extractor error for ${url}: ${e.message}`);
      }
    }
    const parcels = results.flatMap(r => r.parcels || []);
    const skip = results.map(r => r.skipReason).filter(Boolean)[0] || null;
    return { parcels, pageKind: results[0]?.pageKind || "other", skipReason: parcels.length ? null : skip };
  }
}

// ---------- heuristic fallback ----------
const ROAD = /\b(road|rd|street|st|lane|ln|drive|dr|avenue|ave|highway|hwy|route|rte|way|turnpike|tpke|hill|trail|trl|circle|cir|court|ct|place|pl|path|pike|lot|lots|parcel|map)\b/i;
const ACRES = /(\d{1,4}(?:\.\d+)?)\s*(?:\+\/-|±)?\s*(?:acres?|ac\b)/i;
const SQFT = /([\d,]{4,})\s*(?:sq\.?\s*ft|square feet|sf\b)/i;
const MONEY = /\$\s?([\d,]{3,}(?:\.\d{2})?)/g;
const DATE = /\b(20\d{2}-\d{2}-\d{2})\b|\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b|\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/i;
const STRUCTURE = /\b(house|home|cabin|cottage|barn|garage|mobile home|dwelling|residence|bedroom|bath|sq\.? ?ft living|colonial|ranch|cape)\b/i;
const VACANT = /\b(vacant|raw land|undeveloped|unimproved|land only|wooded lot|building lot|acreage|timberland|farmland)\b/i;
const STATE_RE = /\b([A-Z][a-zA-Z.' ]{2,30}),\s*(CT|RI|MA|NY|NH|VT|ME|WA|OR|AL|GA|FL|WV|KY|OH|VA|PA)\b/;

export function heuristicExtract(text, { url, dealType }) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 20 && b.length < 3000);
  const parcels = [];
  for (const b of blocks) {
    let acres = null;
    const a = ACRES.exec(b); if (a) acres = Number(a[1]);
    else { const s = SQFT.exec(b); if (s) acres = Number(s[1].replace(/,/g, "")) / 43560; }
    if (acres == null) continue;
    // Prefer a labelled bid or price; otherwise the first dollar amount that is not an assessment.
    const labelled = /(?:minimum|opening|starting|upset)\s+bid[^$\n]{0,25}\$\s?([\d,]{3,})/i.exec(b) || /(?:list(?:ed|ing)?\s+(?:price|at)|asking(?:\s+price)?|price)[^$\n]{0,25}\$\s?([\d,]{3,})/i.exec(b);
    const money = labelled ? [Number(labelled[1].replace(/,/g, ""))] : Array.from(b.matchAll(MONEY)).filter(m => !/assess/i.test(b.slice(Math.max(0, m.index - 40), m.index))).map(m => Number(m[1].replace(/,/g, ""))).filter(n => n >= 500);
    const lines = b.split("\n").map(l => l.trim()).filter(Boolean);
    const addrLine = lines.find(l => ROAD.test(l) && l.length < 120) || lines[0];
    const address = addrLine.replace(/\[[^\]]+\]/g, "").replace(/\|/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    const st = STATE_RE.exec(b);
    const d = DATE.exec(b);
    const link = /\[(https?:\/\/[^\]\s]+)\]/.exec(b);
    parcels.push({
      address, town: st ? st[1].trim() : null, county: null, state: st ? st[2] : null, parcelId: null,
      acres: Math.round(acres * 100) / 100,
      askingPrice: money.length ? money[0] : null,
      priceKind: money.length ? (/(minimum|opening|starting)\s+bid/i.test(b) ? "minimum-bid" : /taxes? due|amount due/i.test(b) ? "taxes-due" : "list-price") : "unknown",
      assessedValue: (() => { const m = /assess(?:ed|ment)[^$]{0,40}\$\s?([\d,]{4,})/i.exec(b); return m ? Number(m[1].replace(/,/g, "")) : null; })(),
      hasStructure: STRUCTURE.test(b) ? true : VACANT.test(b) ? false : null,
      saleDate: d ? normalizeDate(d[0]) : null,
      url: link ? link[1] : null,
      dealType: dealType || null,
      notes: "heuristic extraction; verify on source"
    });
  }
  return { parcels, pageKind: "other", skipReason: parcels.length ? null : "no acreage found" };
}

export function normalizeDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
