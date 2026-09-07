/* Ashford Land Finder — client-side deal screener.
   No build step, no server. State lives in localStorage. */
(function () {
  "use strict";

  const STORAGE_KEY = "ashford-land-finder:v1";

  const DEAL_TYPES = [
    ["tax-sale", "Tax sale / tax deed"],
    ["tax-lien", "Tax lien"],
    ["short-sale", "Short sale"],
    ["foreclosure", "Foreclosure"],
    ["reo", "REO / bank-owned"],
    ["auction", "Auction"],
    ["estate", "Estate / probate"],
    ["government", "Government surplus"],
    ["fsbo", "For sale by owner"],
    ["mls", "MLS listing"],
    ["other", "Other"]
  ];
  const STATUSES = [
    ["new", "New"],
    ["watching", "Watching"],
    ["contacted", "Contacted"],
    ["bidding", "Bidding"],
    ["won", "Won"],
    ["passed", "Passed"]
  ];
  const STATE_NAMES = { CT: "Connecticut", RI: "Rhode Island", MA: "Massachusetts", NY: "New York", NH: "New Hampshire", VT: "Vermont", ME: "Maine", WA: "Washington", OR: "Oregon", AL: "Alabama", GA: "Georgia", FL: "Florida", WV: "West Virginia", KY: "Kentucky", OH: "Ohio", VA: "Virginia", PA: "Pennsylvania", UK: "United Kingdom" };

  const defaultSettings = () => ({
    baseId: "ashford-ct",
    customLat: null, customLng: null,
    radiusMiles: 100,
    minAcres: 5,
    maxRatio: 0.85,
    marketAdj: 1.0,
    assessmentRatio: 0.70,
    landOnly: true,
    dealTypes: DEAL_TYPES.map(d => d[0]),
    statuses: ["new", "watching", "contacted", "bidding"],
    sortDeals: "discount",
    view: "deals"
  });

  const state = { parcels: [], settings: defaultSettings(), map: null, mapLayer: null, editingId: null };

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state.parcels = Array.isArray(saved.parcels) ? saved.parcels : [];
        state.settings = Object.assign(defaultSettings(), saved.settings || {});
        return true;
      }
    } catch (e) { console.warn("Could not read saved data", e); }
    return false;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ parcels: state.parcels, settings: state.settings })); }
    catch (e) { toast("Could not save to this browser's storage"); }
  }

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => (n == null || isNaN(n)) ? "—" : "$" + Math.round(n).toLocaleString();
  const pct = n => (n == null || isNaN(n)) ? "—" : (n * 100).toFixed(0) + "%";
  const num = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/[$,%\s]/g, "")); return isNaN(n) ? null : n; };
  const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function haversineMiles(lat1, lng1, lat2, lng2) {
    const R = 3958.7613, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function currentBase() {
    const b = window.BASES.find(x => x.id === state.settings.baseId) || window.BASES[0];
    if (b.id === "custom") return Object.assign({}, b, { lat: state.settings.customLat, lng: state.settings.customLng });
    return b;
  }

  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- metrics ----------
  function metrics(p) {
    const s = state.settings, base = currentBase();
    const ratio = p.assessmentRatio || s.assessmentRatio || 1;
    const derived = p.assessedValue != null ? (p.assessedValue / ratio) * (s.marketAdj || 1) : null;
    const amv = p.marketValue != null ? p.marketValue : derived;
    const priceRatio = (amv && p.askingPrice != null) ? p.askingPrice / amv : null;
    const discount = priceRatio != null ? 1 - priceRatio : null;
    const distance = (p.lat != null && p.lng != null && base.lat != null && base.lng != null) ? haversineMiles(base.lat, base.lng, p.lat, p.lng) : null;
    const ppa = (p.acres && p.askingPrice != null) ? p.askingPrice / p.acres : null;

    const reasons = [];
    const inRadius = distance != null && distance <= s.radiusMiles;
    if (distance == null) reasons.push(["warn", "No coordinates"]);
    else if (!inRadius) reasons.push(["bad", `${Math.round(distance)} mi, outside radius`]);
    const acresOk = p.acres != null && p.acres >= s.minAcres;
    if (p.acres == null) reasons.push(["warn", "Acres unknown"]);
    else if (!acresOk) reasons.push(["bad", `Under ${s.minAcres} acres`]);
    const landOk = !s.landOnly || !p.hasStructure;
    if (!landOk) reasons.push(["bad", "Has structure"]);
    let priceOk = false;
    if (priceRatio == null) reasons.push(["warn", "No value to compare"]);
    else if (priceRatio <= s.maxRatio) priceOk = true;
    else reasons.push(["bad", `Only ${pct(discount)} below value`]);
    const typeOk = s.dealTypes.includes(p.dealType || "other");
    const statusOk = s.statuses.includes(p.status || "new");

    const passes = inRadius && acresOk && landOk && priceOk;
    const visible = passes && typeOk && statusOk;

    let tier = "neutral", tierLabel = "Market";
    if (discount != null) {
      if (discount >= 0.30) { tier = "good"; tierLabel = "Strong deal"; }
      else if (priceOk) { tier = "good"; tierLabel = "Opportunity"; }
      else if (discount >= 0.05) { tier = "warn"; tierLabel = "Watch"; }
      else { tier = "bad"; tierLabel = "At/above value"; }
    }
    // Score: discount dominates, proximity and acreage add modestly.
    const score = (discount ?? 0) * 100 + (distance != null ? Math.max(0, (s.radiusMiles - distance) / s.radiusMiles) * 15 : 0) + Math.min(10, Math.log2((p.acres || 1) / Math.max(1, s.minAcres)) * 3);

    return { amv, derived, priceRatio, discount, distance, ppa, reasons, passes, visible, inRadius, acresOk, landOk, priceOk, typeOk, statusOk, tier, tierLabel, score };
  }

  // ---------- rendering ----------
  function renderHeader() {
    const b = currentBase();
    $("#hdrBase").textContent = b.id === "custom" ? "your custom base" : b.short;
    $("#hdrRadius").textContent = state.settings.radiusMiles;
    $("#hdrDiscount").textContent = Math.round((1 - state.settings.maxRatio) * 100);
  }

  function renderStats() {
    const rows = state.parcels.map(p => ({ p, m: metrics(p) }));
    const inR = rows.filter(r => r.m.inRadius).length;
    const opp = rows.filter(r => r.m.passes).length;
    const vis = rows.filter(r => r.m.visible);
    const soon = rows.filter(r => r.m.visible && r.p.saleDate && new Date(r.p.saleDate) >= new Date(new Date().toDateString()) && (new Date(r.p.saleDate) - Date.now()) < 30 * 86400000).length;
    const avgDisc = vis.length ? vis.reduce((a, r) => a + (r.m.discount || 0), 0) / vis.length : null;
    const acres = vis.reduce((a, r) => a + (r.p.acres || 0), 0);
    $("#stats").innerHTML = [
      [state.parcels.length, "parcels tracked"],
      [inR, "inside radius"],
      [opp, "meet every criterion"],
      [vis.length, "shown after type/status filters"],
      [avgDisc == null ? "—" : pct(avgDisc), "average discount shown"],
      [soon, "sales in next 30 days"],
      [acres ? acres.toFixed(0) : "—", "acres in shortlist"]
    ].map(([n, l]) => `<div class="stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join("");
  }

  function sortRows(rows, key) {
    const cmp = {
      discount: (a, b) => (b.m.discount ?? -9) - (a.m.discount ?? -9),
      score: (a, b) => b.m.score - a.m.score,
      distance: (a, b) => (a.m.distance ?? 1e9) - (b.m.distance ?? 1e9),
      price: (a, b) => (a.p.askingPrice ?? 1e15) - (b.p.askingPrice ?? 1e15),
      ppa: (a, b) => (a.m.ppa ?? 1e15) - (b.m.ppa ?? 1e15),
      acres: (a, b) => (b.p.acres ?? 0) - (a.p.acres ?? 0),
      saleDate: (a, b) => (a.p.saleDate || "9999") .localeCompare(b.p.saleDate || "9999")
    }[key] || ((a, b) => 0);
    return rows.sort(cmp);
  }

  function matchesText(p, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return [p.address, p.town, p.county, p.state, p.notes, p.source, p.parcelId, p.zoning, p.dealType].some(v => String(v || "").toLowerCase().includes(q));
  }

  function dealTypeLabel(t) { return (DEAL_TYPES.find(d => d[0] === t) || ["other", "Other"])[1]; }

  function rowHtml(r, showReasons) {
    const { p, m } = r;
    const loc = [p.town, p.state].filter(Boolean).join(", ") + (p.county ? ` · ${p.county} Co.` : "");
    const statusSel = `<select class="status" data-act="status" data-id="${p.id}">${STATUSES.map(s => `<option value="${s[0]}" ${p.status === s[0] ? "selected" : ""}>${s[1]}</option>`).join("")}</select>`;
    const link = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">source ↗</a>` : "";
    const badge = `<span class="badge ${m.tier}">${m.tierLabel}</span>`;
    const reasons = showReasons ? `<td><div class="reasons">${m.passes ? '<span class="badge good">Passes all tests</span>' : m.reasons.map(([c, t]) => `<span class="badge ${c}">${esc(t)}</span>`).join("")}</div></td>` : "";
    return `<tr>
      <td>${badge}${p.isSample ? '<br><span class="badge neutral">sample</span>' : ""}${p.isFound ? `<br><span class="badge neutral" title="Found by the automatic search${p.firstSeen ? " on " + p.firstSeen : ""}">found</span>` : ""}${p.stale ? '<br><span class="badge warn" title="Not seen at the source on the latest run">not seen lately</span>' : ""}</td>
      <td><span class="title">${esc(p.address || "(no address)")}</span><span class="sub">${esc(loc)}${p.parcelId ? " · #" + esc(p.parcelId) : ""}</span>${p.notes ? `<span class="sub">${esc(p.notes)}</span>` : ""}</td>
      <td>${esc(dealTypeLabel(p.dealType))}<span class="sub">${esc(p.source || "")} ${link}</span></td>
      <td class="num">${p.acres != null ? p.acres.toFixed(1) : "—"}${p.hasStructure ? '<span class="sub">structure</span>' : ""}</td>
      <td class="num">${m.distance != null ? m.distance.toFixed(0) : "—"}</td>
      <td class="num">${money(p.askingPrice)}<span class="sub">${m.ppa ? money(m.ppa) + "/ac" : ""}</span></td>
      <td class="num">${money(m.amv)}<span class="sub">${p.marketValue != null ? (p.valueSource ? esc(p.valueSource) : "comp-based") : p.assessedValue != null ? "from " + money(p.assessedValue) + " assessed" : ""}</span></td>
      <td class="num"><strong>${pct(m.discount)}</strong></td>
      <td>${p.saleDate ? esc(p.saleDate) : "—"}</td>
      ${reasons}
      <td>${statusSel}</td>
      <td><button class="rowbtn" data-act="edit" data-id="${p.id}">Edit</button></td>
    </tr>`;
  }

  const HEAD = (showReasons) => `<thead><tr>
    <th>Verdict</th><th>Parcel</th><th>Deal</th><th>Acres</th><th>Miles</th><th>Asking</th><th>Adj. value</th><th>Discount</th><th>Sale date</th>${showReasons ? "<th>Tests</th>" : ""}<th>Status</th><th></th>
  </tr></thead>`;

  function renderDeals() {
    const q = $("#searchDeals").value.trim();
    let rows = state.parcels.map(p => ({ p, m: metrics(p) })).filter(r => r.m.visible && matchesText(r.p, q));
    rows = sortRows(rows, state.settings.sortDeals);
    $("#dealsTable").innerHTML = rows.length ? HEAD(false) + "<tbody>" + rows.map(r => rowHtml(r, false)).join("") + "</tbody>" : "";
    $("#dealsEmpty").hidden = rows.length > 0;
  }

  function renderAll() {
    const q = $("#searchAll").value.trim();
    let rows = state.parcels.map(p => ({ p, m: metrics(p) })).filter(r => matchesText(r.p, q));
    rows = sortRows(rows, "score");
    $("#allTable").innerHTML = rows.length ? HEAD(true) + "<tbody>" + rows.map(r => rowHtml(r, true)).join("") + "</tbody>" : "";
    $("#allEmpty").hidden = rows.length > 0;
  }

  function renderMap() {
    if (typeof L === "undefined") { $("#map").innerHTML = '<p class="empty">Map library did not load (offline?). The rest of the app works without it.</p>'; return; }
    const base = currentBase();
    if (!state.map) {
      state.map = L.map("map", { scrollWheelZoom: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(state.map);
      state.mapLayer = L.layerGroup().addTo(state.map);
    }
    state.mapLayer.clearLayers();
    if (base.lat == null) { state.map.setView([39, -98], 4); return; }
    if (!state.map._loaded) state.map.setView([base.lat, base.lng], 8);
    const circle = L.circle([base.lat, base.lng], { radius: state.settings.radiusMiles * 1609.344, color: "#2f6b3f", weight: 1.5, fillOpacity: 0.04 }).addTo(state.mapLayer);
    L.circleMarker([base.lat, base.lng], { radius: 9, color: "#ffffff", weight: 2, fillColor: "#2f6b3f", fillOpacity: 1 }).bindPopup(`<b>${esc(base.short)}</b><br>home base`).addTo(state.mapLayer);
    state.parcels.forEach(p => {
      if (p.lat == null || p.lng == null) return;
      const m = metrics(p);
      const color = m.passes ? "#2f8f4e" : m.inRadius ? "#b47a10" : "#8a948e";
      L.circleMarker([p.lat, p.lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
        .bindPopup(`<b>${esc(p.address)}</b><br>${esc([p.town, p.state].filter(Boolean).join(", "))}<br>${p.acres ?? "?"} ac · ${money(p.askingPrice)} · ${pct(m.discount)} below value<br>${esc(dealTypeLabel(p.dealType))}${m.distance != null ? " · " + m.distance.toFixed(0) + " mi" : ""}<br><a href="#" data-map-edit="${p.id}">Edit parcel</a>`)
        .addTo(state.mapLayer);
    });
    state.map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    setTimeout(() => state.map.invalidateSize(), 50);
  }

  function slug(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

  function renderSources() {
    const S = window.SOURCES, base = currentBase(), s = state.settings;
    const stateCode = base.state || "";
    const stateName = STATE_NAMES[stateCode] || stateCode;
    const nearbyTowns = state.parcels.filter(p => p.town).map(p => p.town).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).map(t => `"${t}"`).join(" OR ") || `"${base.short.split(",")[0]}"`;
    const vars = {
      town: base.short.split(",")[0], townSlug: slug(base.short.split(",")[0]), townCap: base.short.split(",")[0].replace(/\s+/g, "-"),
      state: stateCode, stateLower: stateCode.toLowerCase(), stateName, stateNameSlug: slug(stateName),
      lat: base.lat, lng: base.lng, radiusMi: s.radiusMiles, minAcres: s.minAcres, nearbyTowns
    };
    const fill = (str) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    const typeChip = t => `<span class="badge neutral">${esc(t)}</span>`;
    function sourceCard(x) {
      return `<div class="source"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a><div class="tags">${(x.types || []).map(typeChip).join("")}</div><p class="note">${esc(x.note || "")}</p></div>`;
    }
    const searches = stateCode && stateCode !== "UK" ? S.searchTemplates.map(t => {
      const url = t.q ? t.url.replace("{q1}", encodeURIComponent(fill(t.q))) : fill(t.url);
      return sourceCard({ name: fill(t.name), url, types: ["search"], note: t.note });
    }).join("") : "";
    const craigs = (base.craigslist || []).map(r => sourceCard({ name: `Craigslist ${r}`, url: S.craigslistTemplate.replace("{region}", r), types: ["fsbo"], note: "Land & acreage in the real-estate-for-sale section. Owners here often price off old assessments." })).join("");

    const regional = (base.nearbyStates || []).map(code => {
      const g = S.byState[code]; if (!g) return "";
      return `<div class="source-group"><h3>${esc(g.title)}</h3><p class="lead">${esc(g.lead)}</p><div class="source-list">${g.items.map(sourceCard).join("")}</div></div>`;
    }).join("");

    $("#sources").innerHTML = `
      <div class="source-group">
        <h3>One-click searches around ${esc(base.short)}</h3>
        <p class="lead">${esc(base.note || "")} Links are pre-filled for land in your base state; set acreage ≥ ${s.minAcres} and sort by price per acre once the page opens, then add anything promising with the + Add parcel button.</p>
        <div class="source-list">${searches}${craigs}</div>
      </div>
      ${regional}
      <div class="source-group">
        <h3>National platforms</h3>
        <p class="lead">Aggregators for tax sales, foreclosures, REO, auctions and land listings.</p>
        <div class="source-list">${S.national.map(sourceCard).join("")}</div>
      </div>
      <div class="source-group">
        <h3>Working the assessor</h3>
        <p class="lead">The most reliable "adjusted market value" comes from the assessor card: total assessed value ÷ assessment ratio. Building value of $0 confirms raw land. Also check: wetlands and flood layers, road frontage and legal access, zoning minimum lot size, and whether the parcel is in a current-use program (Connecticut PA 490, Massachusetts Chapter 61, Alabama current use) that carries rollback taxes.</p>
      </div>`;
  }

  function renderFilters() {
    $("#dealTypeFilters").innerHTML = DEAL_TYPES.map(([v, l]) => `<label class="chip ${state.settings.dealTypes.includes(v) ? "on" : ""}"><input type="checkbox" data-filter="dealTypes" value="${v}" ${state.settings.dealTypes.includes(v) ? "checked" : ""}>${esc(l)}</label>`).join("");
    $("#statusFilters").innerHTML = STATUSES.map(([v, l]) => `<label class="chip ${state.settings.statuses.includes(v) ? "on" : ""}"><input type="checkbox" data-filter="statuses" value="${v}" ${state.settings.statuses.includes(v) ? "checked" : ""}>${esc(l)}</label>`).join("");
  }

  function syncControls() {
    const s = state.settings;
    $("#baseSelect").innerHTML = window.BASES.map(b => `<option value="${b.id}" ${b.id === s.baseId ? "selected" : ""}>${esc(b.label)}</option>`).join("");
    $("#customBaseFields").hidden = s.baseId !== "custom";
    $("#customLat").value = s.customLat ?? ""; $("#customLng").value = s.customLng ?? "";
    $("#radius").value = s.radiusMiles; $("#radiusOut").value = s.radiusMiles;
    $("#minAcres").value = s.minAcres;
    $("#landOnly").checked = s.landOnly;
    $("#maxRatio").value = Math.round(s.maxRatio * 100); $("#ratioOut").value = Math.round(s.maxRatio * 100);
    $("#marketAdj").value = s.marketAdj;
    $("#assessRatio").value = s.assessmentRatio;
    $("#sortDeals").value = s.sortDeals;
    renderFilters();
  }

  function showView(v) {
    state.settings.view = v;
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === v));
    $$(".view").forEach(el => el.hidden = el.id !== "view-" + v);
    if (v === "map") renderMap();
    save();
  }

  function renderAllViews() {
    renderHeader(); renderStats(); renderDeals(); renderAll(); renderSources();
    if (state.settings.view === "map") renderMap();
  }

  // ---------- parcel editor ----------
  function openEditor(p) {
    state.editingId = p ? p.id : null;
    const f = $("#parcelForm");
    $("#dialogTitle").textContent = p ? "Edit parcel" : "Add parcel";
    $("#btnDelete").hidden = !p;
    f.reset();
    $("#dealTypeSelect").innerHTML = DEAL_TYPES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    $("#statusSelect").innerHTML = STATUSES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    const base = currentBase();
    const src = p || { state: base.state === "UK" ? "" : base.state, dealType: "tax-sale", status: "new" };
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") el.checked = !!src[el.name];
      else el.value = src[el.name] ?? "";
    }
    $("#geocodeMsg").textContent = "";
    updateLiveCalc();
    $("#parcelDialog").showModal();
  }

  function readForm() {
    const f = $("#parcelForm"), o = {};
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") o[el.name] = el.checked;
      else if (el.type === "number") o[el.name] = num(el.value);
      else o[el.name] = el.value.trim();
    }
    if (o.state) o.state = o.state.toUpperCase();
    return o;
  }

  function updateLiveCalc() {
    const o = readForm();
    const m = metrics(Object.assign({ id: "tmp" }, o));
    $("#liveCalc").innerHTML = [
      [money(m.amv), o.marketValue != null ? "adjusted value (comp-based)" : "adjusted value (from assessment)"],
      [pct(m.discount), "discount vs. value"],
      [m.distance != null ? m.distance.toFixed(1) + " mi" : "—", "from " + currentBase().short],
      [m.ppa ? money(m.ppa) : "—", "per acre"],
      [`<span class="badge ${m.tier}">${m.tierLabel}</span>`, m.passes ? "passes every test" : m.reasons.map(r => r[1]).join(", ") || "—"]
    ].map(([n, l]) => `<div><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`).join("");
  }

  async function geocode() {
    const o = readForm();
    const q = [o.address, o.town, o.county ? o.county + " County" : "", o.state, o.state === "UK" ? "" : "USA"].filter(Boolean).join(", ");
    const msg = $("#geocodeMsg");
    msg.textContent = "Looking up " + q + " …";
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q), { headers: { "Accept": "application/json" } });
      const data = await res.json();
      if (!data.length) {
        // Fall back to town centre.
        const q2 = [o.town, o.state, o.state === "UK" ? "" : "USA"].filter(Boolean).join(", ");
        const res2 = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q2));
        const d2 = await res2.json();
        if (!d2.length) { msg.textContent = "No match. Enter coordinates from the county GIS instead."; return; }
        $("#parcelForm").elements.lat.value = Number(d2[0].lat).toFixed(6);
        $("#parcelForm").elements.lng.value = Number(d2[0].lon).toFixed(6);
        msg.textContent = "Exact address not found; using the town centre. Refine from the GIS if needed.";
      } else {
        $("#parcelForm").elements.lat.value = Number(data[0].lat).toFixed(6);
        $("#parcelForm").elements.lng.value = Number(data[0].lon).toFixed(6);
        msg.textContent = "Found: " + data[0].display_name;
      }
      updateLiveCalc();
    } catch (e) { msg.textContent = "Lookup failed (offline or blocked). Enter coordinates manually."; }
  }

  function saveParcel(ev) {
    ev.preventDefault();
    const o = readForm();
    if (!o.address || o.acres == null || o.askingPrice == null) { toast("Address, acres and asking price are required"); return; }
    if (state.editingId) {
      const i = state.parcels.findIndex(p => p.id === state.editingId);
      state.parcels[i] = Object.assign({}, state.parcels[i], o, { isSample: false, userEdited: true, updatedAt: new Date().toISOString() });
    } else {
      state.parcels.push(Object.assign({ id: uid(), addedAt: new Date().toISOString() }, o));
    }
    save(); $("#parcelDialog").close(); renderAllViews(); toast("Parcel saved");
  }

  // ---------- import ----------
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') { cell += '"'; i++; }
        else if (c === '"') inQ = false;
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ""));
  }

  const ALIASES = {
    address: ["address", "site address", "property address", "location", "parcel address", "street", "description", "property"],
    parcelId: ["parcel id", "parcelid", "pid", "apn", "map lot", "map/lot", "map-lot", "parcel", "parcel number", "account", "tax id", "sbl", "uniqueid", "pin"],
    town: ["town", "city", "municipality", "town/city", "city/town"],
    county: ["county"],
    state: ["state", "st"],
    zoning: ["zoning", "zone", "use", "land use", "use code", "class"],
    dealType: ["deal type", "dealtype", "type", "sale type", "category", "listing type"],
    source: ["source", "listing source", "site", "seller", "office"],
    url: ["url", "link", "listing url", "source url", "website", "href"],
    acres: ["acres", "acreage", "lot acres", "land acres", "lot size (acres)", "lot size acres", "size", "land area"],
    hasStructure: ["has structure", "hasstructure", "structure", "improved", "building", "dwelling", "improvements"],
    buildingValue: ["building value", "improvement value", "improvements value", "building assessed", "bldg value", "bldg", "building assessment", "improvement assessed"],
    askingPrice: ["asking price", "askingprice", "asking", "price", "list price", "minimum bid", "min bid", "opening bid", "starting bid", "bid", "amount due", "taxes due", "total due", "upset price"],
    assessedValue: ["assessed value", "assessedvalue", "assessed", "total assessed", "assessment", "total assessment", "total value", "assessed total"],
    assessmentRatio: ["assessment ratio", "ratio", "equalization rate", "eq rate"],
    marketValue: ["market value", "marketvalue", "appraised value", "appraised", "fmv", "comp value", "adjusted market value", "full market value", "estimated value"],
    saleDate: ["sale date", "saledate", "auction date", "date", "sale", "auction"],
    liens: ["liens", "back taxes", "taxes owed", "delinquent amount", "lien amount"],
    lat: ["lat", "latitude", "y"],
    lng: ["lng", "lon", "long", "longitude", "x"],
    status: ["status"],
    notes: ["notes", "note", "comments", "remarks", "memo"]
  };
  function mapHeader(h) {
    const k = h.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
    for (const [field, names] of Object.entries(ALIASES)) if (names.includes(k)) return field;
    for (const [field, names] of Object.entries(ALIASES)) if (names.some(n => k.startsWith(n))) return field;
    return null;
  }
  function normalizeDealType(v) {
    v = String(v || "").toLowerCase();
    if (!v) return null;
    if (/tax\s*lien|certificate/.test(v)) return "tax-lien";
    if (/tax|delinquen|upset|judicial/.test(v)) return "tax-sale";
    if (/short/.test(v)) return "short-sale";
    if (/reo|bank|lender|homepath|homesteps/.test(v)) return "reo";
    if (/foreclos|sheriff|committee|mortgagee|trustee/.test(v)) return "foreclosure";
    if (/estate|probate/.test(v)) return "estate";
    if (/gov|surplus|usda|gsa|treasury|irs|county[- ]owned|town[- ]owned|city[- ]owned/.test(v)) return "government";
    if (/auction|absolute/.test(v)) return "auction";
    if (/fsbo|owner/.test(v)) return "fsbo";
    if (/mls|listing|realtor|zillow|redfin/.test(v)) return "mls";
    return "other";
  }
  function parseBool(v) { v = String(v ?? "").trim().toLowerCase(); if (!v) return null; if (["y", "yes", "true", "1", "x", "improved"].includes(v)) return true; if (["n", "no", "false", "0", "vacant", "land", "none"].includes(v)) return false; const n = Number(v.replace(/[$,]/g, "")); return isNaN(n) ? null : n > 0; }
  function parseDate(v) {
    v = String(v || "").trim(); if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  }

  function rowsToParcels(rows, defaults) {
    const header = rows[0].map(mapHeader), raw = rows[0];
    const out = [];
    for (const r of rows.slice(1)) {
      const p = { id: uid(), addedAt: new Date().toISOString(), status: "new", dealType: defaults.dealType, state: defaults.state || "" };
      const extras = [];
      let buildingValue = null;
      r.forEach((v, i) => {
        const f = header[i]; v = (v ?? "").trim();
        if (!f) { if (v) extras.push(`${raw[i]}: ${v}`); return; }
        switch (f) {
          case "acres": case "askingPrice": case "assessedValue": case "assessmentRatio": case "marketValue": case "liens": case "lat": case "lng": p[f] = num(v); break;
          case "buildingValue": buildingValue = num(v); break;
          case "hasStructure": p.hasStructure = parseBool(v); break;
          case "dealType": p.dealType = normalizeDealType(v) || defaults.dealType; break;
          case "saleDate": p.saleDate = parseDate(v); break;
          case "status": p.status = STATUSES.some(s => s[0] === v.toLowerCase()) ? v.toLowerCase() : "new"; break;
          case "state": p.state = v.toUpperCase().slice(0, 2) || defaults.state; break;
          default: p[f] = v;
        }
      });
      if (p.hasStructure == null) p.hasStructure = buildingValue != null ? buildingValue > 0 : false;
      if (p.assessmentRatio != null && p.assessmentRatio > 1) p.assessmentRatio = p.assessmentRatio / 100;
      if (extras.length) p.notes = [p.notes, extras.join("; ")].filter(Boolean).join(" | ");
      if (!p.address && !p.parcelId) continue;
      if (!p.address) p.address = "Parcel " + p.parcelId;
      out.push(p);
    }
    return out;
  }

  function importFromText(text, defaults) {
    text = text.trim();
    if (!text) return [];
    if (text[0] === "[" || text[0] === "{") {
      let j = JSON.parse(text);
      if (j.parcels) j = j.parcels;
      if (!Array.isArray(j)) throw new Error("JSON must be an array of parcels");
      return j.map(o => Object.assign({ id: uid(), addedAt: new Date().toISOString(), status: "new", dealType: defaults.dealType, hasStructure: false }, o, { id: o.id && !state.parcels.some(p => p.id === o.id) ? o.id : uid() }));
    }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("Need a header row and at least one data row");
    return rowsToParcels(rows, defaults);
  }

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCsv() {
    const cols = ["verdict", "discount", "address", "parcelId", "town", "county", "state", "dealType", "source", "url", "acres", "hasStructure", "distanceMiles", "askingPrice", "assessedValue", "assessmentRatio", "marketValue", "adjustedValue", "pricePerAcre", "saleDate", "liens", "lat", "lng", "status", "notes"];
    const view = state.settings.view === "all" ? state.parcels.map(p => ({ p, m: metrics(p) })) : state.parcels.map(p => ({ p, m: metrics(p) })).filter(r => r.m.visible);
    const q = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(",")].concat(sortRows(view, state.settings.sortDeals).map(({ p, m }) => cols.map(c => q({
      verdict: m.tierLabel, discount: m.discount == null ? "" : (m.discount * 100).toFixed(1) + "%", distanceMiles: m.distance == null ? "" : m.distance.toFixed(1),
      adjustedValue: m.amv == null ? "" : Math.round(m.amv), pricePerAcre: m.ppa == null ? "" : Math.round(m.ppa)
    }[c] ?? p[c])).join(",")));
    download(`land-opportunities-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
  }

  // ---------- events ----------
  function bind() {
    $("#baseSelect").addEventListener("change", e => { state.settings.baseId = e.target.value; const b = currentBase(); if (b.id !== "custom") state.settings.assessmentRatio = b.assessmentRatio; syncControls(); save(); renderAllViews(); });
    $("#customLat").addEventListener("input", e => { state.settings.customLat = num(e.target.value); save(); renderAllViews(); });
    $("#customLng").addEventListener("input", e => { state.settings.customLng = num(e.target.value); save(); renderAllViews(); });
    $("#radius").addEventListener("input", e => { state.settings.radiusMiles = Number(e.target.value); $("#radiusOut").value = e.target.value; save(); renderAllViews(); });
    $("#minAcres").addEventListener("input", e => { state.settings.minAcres = num(e.target.value) ?? 0; save(); renderAllViews(); });
    $("#landOnly").addEventListener("change", e => { state.settings.landOnly = e.target.checked; save(); renderAllViews(); });
    $("#maxRatio").addEventListener("input", e => { state.settings.maxRatio = Number(e.target.value) / 100; $("#ratioOut").value = e.target.value; save(); renderAllViews(); });
    $("#marketAdj").addEventListener("input", e => { state.settings.marketAdj = num(e.target.value) || 1; save(); renderAllViews(); });
    $("#assessRatio").addEventListener("input", e => { const v = num(e.target.value); if (v) { state.settings.assessmentRatio = v; save(); renderAllViews(); } });
    $("#sortDeals").addEventListener("change", e => { state.settings.sortDeals = e.target.value; save(); renderDeals(); });
    $("#searchDeals").addEventListener("input", renderDeals);
    $("#searchAll").addEventListener("input", renderAll);

    document.addEventListener("change", e => {
      const f = e.target.dataset.filter;
      if (!f) return;
      const set = new Set(state.settings[f]);
      e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
      state.settings[f] = Array.from(set);
      e.target.closest(".chip").classList.toggle("on", e.target.checked);
      save(); renderAllViews();
    });

    $$(".tab").forEach(t => t.addEventListener("click", () => showView(t.dataset.view)));

    document.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (b && b.dataset.act === "edit") openEditor(state.parcels.find(p => p.id === b.dataset.id));
      const me = e.target.closest("[data-map-edit]");
      if (me) { e.preventDefault(); openEditor(state.parcels.find(p => p.id === me.dataset.mapEdit)); }
    });
    document.addEventListener("change", e => {
      const s = e.target.closest("select[data-act=status]");
      if (!s) return;
      const p = state.parcels.find(x => x.id === s.dataset.id);
      if (p) { p.status = s.value; save(); renderAllViews(); }
    });

    $("#btnAdd").addEventListener("click", () => openEditor(null));
    $("#parcelForm").addEventListener("submit", saveParcel);
    $("#parcelForm").addEventListener("input", updateLiveCalc);
    $("#parcelForm").addEventListener("change", updateLiveCalc);
    $("#btnCancel").addEventListener("click", () => $("#parcelDialog").close());
    $("#dialogClose").addEventListener("click", () => $("#parcelDialog").close());
    $("#btnGeocode").addEventListener("click", geocode);
    $("#btnDelete").addEventListener("click", () => {
      if (!state.editingId || !confirm("Delete this parcel?")) return;
      state.parcels = state.parcels.filter(p => p.id !== state.editingId);
      save(); $("#parcelDialog").close(); renderAllViews(); toast("Parcel deleted");
    });

    $("#btnImport").addEventListener("click", () => {
      $("#importDealType").innerHTML = DEAL_TYPES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
      const b = currentBase(); $("#importState").value = b.state === "UK" ? "" : b.state;
      $("#importText").value = ""; $("#importPreview").textContent = "";
      $("#importDialog").showModal();
    });
    $("#importClose").addEventListener("click", () => $("#importDialog").close());
    $("#importCancel").addEventListener("click", () => $("#importDialog").close());
    $("#importFile").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      $("#importText").value = await f.text(); previewImport();
    });
    $("#importText").addEventListener("input", previewImport);
    $("#importRun").addEventListener("click", () => {
      try {
        const ps = importFromText($("#importText").value, { dealType: $("#importDealType").value, state: $("#importState").value.toUpperCase() });
        if (!ps.length) { toast("Nothing to import"); return; }
        state.parcels.push(...ps); save(); $("#importDialog").close(); renderAllViews();
        const noCoords = ps.filter(p => p.lat == null).length;
        toast(`Imported ${ps.length} parcel${ps.length === 1 ? "" : "s"}${noCoords ? ` (${noCoords} without coordinates)` : ""}`);
      } catch (err) { toast("Import failed: " + err.message); }
    });
    function previewImport() {
      try {
        const ps = importFromText($("#importText").value, { dealType: $("#importDealType").value, state: $("#importState").value.toUpperCase() });
        const hdr = $("#importText").value.trim().startsWith("[") ? [] : parseCsv($("#importText").value)[0] || [];
        const mapped = hdr.map(h => `${h} → ${mapHeader(h) || "notes"}`).join(", ");
        $("#importPreview").textContent = ps.length ? `${ps.length} rows ready. Columns: ${mapped}` : "";
      } catch (err) { $("#importPreview").textContent = err.message; }
    }

    $("#btnExportCsv").addEventListener("click", exportCsv);
    $("#btnBackup").addEventListener("click", () => download(`land-finder-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ parcels: state.parcels, settings: state.settings }, null, 2), "application/json"));
    $("#restoreFile").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!Array.isArray(j.parcels)) throw new Error("not a backup file");
        if (!confirm(`Replace the current ${state.parcels.length} parcels with ${j.parcels.length} from the backup?`)) return;
        state.parcels = j.parcels; state.settings = Object.assign(defaultSettings(), j.settings || {});
        save(); syncControls(); renderAllViews(); toast("Backup restored");
      } catch (err) { toast("Restore failed: " + err.message); }
      e.target.value = "";
    });
    $("#btnLoadSample").addEventListener("click", () => {
      const existing = new Set(state.parcels.map(p => p.id));
      const add = window.SAMPLE_PARCELS.filter(p => !existing.has(p.id)).map(p => JSON.parse(JSON.stringify(p)));
      state.parcels.push(...add); save(); renderAllViews();
      toast(add.length ? `Added ${add.length} sample parcels` : "Sample parcels already loaded");
    });
    $("#btnClearAll").addEventListener("click", () => {
      const samples = state.parcels.filter(p => p.isSample).length, real = state.parcels.length - samples;
      if (!state.parcels.length) return;
      const msg = real ? `Remove all ${state.parcels.length} parcels (${real} of them are yours, not samples)? Back up first if unsure.` : `Remove the ${samples} sample parcels?`;
      if (!confirm(msg)) return;
      state.parcels = []; save(); renderAllViews(); toast("Cleared");
    });
  }

  // ---------- collector output ----------
  // data/found-parcels.js is written by collector/run.js. Merge it in, keeping
  // anything the user has changed on a parcel they have already looked at.
  function mergeFound() {
    const found = Array.isArray(window.FOUND_PARCELS) ? window.FOUND_PARCELS : [];
    const meta = window.FOUND_META || null;
    if (!found.length) return { added: 0, updated: 0, meta };
    const byId = new Map(state.parcels.map(p => [p.id, p]));
    let added = 0, updated = 0;
    const seen = new Set();
    for (const f of found) {
      seen.add(f.id);
      const ex = byId.get(f.id);
      if (!ex) { state.parcels.push(Object.assign({ status: "new", addedAt: new Date().toISOString() }, f, { lastSeen: meta ? meta.ranAt : null })); added++; continue; }
      if (ex.userEdited) { ex.lastSeen = meta ? meta.ranAt : ex.lastSeen; continue; }
      const keep = { status: ex.status, notes: ex.notes && ex.notes !== f.notes && !String(ex.notes).startsWith(String(f.notes || "")) ? ex.notes : f.notes, addedAt: ex.addedAt };
      Object.assign(ex, f, keep, { lastSeen: meta ? meta.ranAt : null }); updated++;
    }
    // Found parcels that no longer appear at the source are kept but marked.
    for (const p of state.parcels) if (p.isFound && !seen.has(p.id) && meta && (!p.lastSeen || p.lastSeen < meta.ranAt)) p.stale = true;
    return { added, updated, meta };
  }

  function renderCollectorStatus() {
    const el = $("#collectorStatus"); if (!el) return;
    const meta = window.FOUND_META;
    if (!meta) { el.innerHTML = '<span class="dot off"></span>Automatic search has not run yet. Run <code>collector/run.js</code> or enable the GitHub Actions schedule; results appear here.'; return; }
    const found = state.parcels.filter(p => p.isFound).length;
    const errs = meta.sources.reduce((a, s) => a + (s.errors || 0), 0);
    const when = new Date(meta.ranAt);
    el.innerHTML = `<span class="dot"></span><span>Automatic search last ran <strong>${esc(when.toLocaleString())}</strong></span><span>${esc(meta.baseLabel)} · ${meta.radiusMiles} mi · ${meta.minAcres}+ acres</span><span><strong>${found}</strong> found parcels in your list</span><span>${meta.sources.filter(s => s.pages).length} of ${meta.sources.length} sources returned pages${errs ? ` · ${errs} errors` : ""}</span><span>extractor: ${esc(meta.extractor)}</span>`;
  }

  // ---------- boot ----------
  const hadSaved = load();
  if (!hadSaved && !(window.FOUND_PARCELS || []).length) state.parcels = window.SAMPLE_PARCELS.map(p => JSON.parse(JSON.stringify(p)));
  const merged = mergeFound();
  if (merged.added || merged.updated) save();
  syncControls(); bind(); renderAllViews(); renderCollectorStatus(); showView(state.settings.view || "deals");
  if (merged.added) toast(`${merged.added} new parcel${merged.added === 1 ? "" : "s"} from the automatic search`);
})();
