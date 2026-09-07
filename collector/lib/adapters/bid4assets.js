// Reader for the Bid4Assets tax-sale calendar. The calendar lists county
// auctions as "County, ST ... [storefront url]"; only storefronts in the
// source's target states are opened, and their text goes through the
// configured extractor (Claude when available, else the heuristic).

import { pageText } from "../html.js";

export async function collect({ source, fetcher, log, extract }) {
  const parcels = [], notes = [], errors = [];
  const states = new Set(source.states || [source.state]);
  let pagesFetched = 0;
  for (const url of source.seeds) {
    let page; try { page = await fetcher.get(url); } catch (e) { errors.push(`${url}: ${e.message}`); continue; }
    if (!page || page.status >= 400) { errors.push(`${url}: ${page ? "HTTP " + page.status : "blocked/failed"}`); continue; }
    pagesFetched++;
    const re = /([A-Z][A-Za-z .'-]+ County),\s*([A-Z]{2})\b([^\[\n]*)\[(https:\/\/www\.bid4assets\.com\/storefront\/[^\]\s]+)\]/g;
    const text = pageText(page);
    let m; const seen = new Set(); const hits = [];
    while ((m = re.exec(text))) { if (states.has(m[2]) && !seen.has(m[4])) { seen.add(m[4]); hits.push({ county: m[1], state: m[2], title: m[3].trim(), url: m[4] }); } }
    if (!hits.length) { notes.push(`${url}: no auctions listed for ${[...states].join("/")} right now`); continue; }
    for (const h of hits.slice(0, source.follow?.maxPages ?? 10)) {
      let sf; try { sf = await fetcher.get(h.url); } catch { sf = null; }
      if (!sf || sf.status >= 400) { errors.push(`${h.url}: ${sf ? "HTTP " + sf.status : "blocked/failed"}`); continue; }
      pagesFetched++;
      const r = await extract(pageText(sf), { url: h.url, dealType: "tax-sale", hint: `Bid4Assets ${h.county}, ${h.state} tax sale` });
      for (const p of r.parcels) { p.county = p.county || h.county.replace(/ County$/, ""); p.state = p.state || h.state; p.dealType = p.dealType || "tax-sale"; p.url = p.url || h.url; parcels.push(p); }
      if (!r.parcels.length) notes.push(`${h.url}: ${r.skipReason || "no parcels extracted"}`);
    }
  }
  return { parcels, pagesFetched, notes, errors };
}
