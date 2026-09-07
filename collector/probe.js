#!/usr/bin/env node
// Fetch a list of URLs and dump their text and links, so candidate sources and
// data endpoints can be inspected from a machine that can reach them (CI).
//   node probe.js --out debug/probe --ua browser URL [URL...]
//   node probe.js --out debug/probe --file urls.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Fetcher } from "./lib/fetch.js";
import { htmlToText, extractLinks, pageTitle } from "./lib/html.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };
const out = flag("out", path.join(here, "debug", "probe"));
let urls = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
if (flag("file")) urls = urls.concat(fs.readFileSync(flag("file"), "utf8").split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#")));
fs.mkdirSync(out, { recursive: true });
const fetcher = new Fetcher({ cacheDir: path.join(here, "cache", "pages"), ttlHours: 0, ua: flag("ua", "bot") });
let n = 0;
for (const url of urls) {
  let page = null, err = null;
  try { page = await fetcher.get(url, { respectRobots: false }); } catch (e) { err = e.message; }
  const name = `${String(++n).padStart(2, "0")}-${url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}.txt`;
  const body = page ? `URL: ${url}\nFINAL: ${page.finalUrl}\nSTATUS: ${page.status}\nTITLE: ${pageTitle(page.html)}\nBYTES: ${page.html.length}\n\n===== TEXT =====\n${htmlToText(page.html).slice(0, 60000)}\n\n===== LINKS =====\n${extractLinks(page.html, page.finalUrl).map(l => `${l.text} -> ${l.href}`).join("\n").slice(0, 40000)}\n\n===== RAW HEAD =====\n${page.html.slice(0, 4000)}\n` : `URL: ${url}\nFAILED: ${err || "blocked/failed"}\n`;
  fs.writeFileSync(path.join(out, name), body);
  console.log(`${page ? page.status : "FAIL"} ${url}`);
}
