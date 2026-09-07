// Minimal HTML helpers: convert a page to readable text and pull out links.
// No dependencies, so the collector installs in seconds and has few moving parts.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK_TAGS = "p|div|br|li|ul|ol|tr|td|th|table|thead|tbody|h1|h2|h3|h4|h5|h6|section|article|header|footer|nav|aside|blockquote|pre|hr|dt|dd|dl|form|fieldset|address|figure|figcaption|main";

export function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ");
  // Keep link targets visible so the extractor can attach a URL to a listing.
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? ` ${text} [${href}] ` : " ";
  });
  s = s.replace(/<(td|th)\b[^>]*>/gi, " | ");
  s = s.replace(new RegExp(`</?(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t\r\f\v]+/g, " ");
  s = s.replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)(?:#[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = decodeEntities(m[1].trim());
    if (/^(javascript|mailto|tel):/i.test(href)) continue;
    try { href = new URL(href, baseUrl).toString(); } catch { continue; }
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    out.push({ href, text });
  }
  return out;
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || "");
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

// Split long text into chunks the extractor can handle, breaking on blank lines.
export function chunkText(text, maxChars = 30000, overlap = 1500) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const cut = text.lastIndexOf("\n\n", end);
      if (cut > start + maxChars * 0.5) end = cut;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
