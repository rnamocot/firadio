// FilRadio traffic report (private). Sign in with the STATS_USER / STATS_PASS set on the chat worker,
// then one request per range returns everything on this page (cached for a minute at Cloudflare).
(() => {
  "use strict";
  const T = window.FilTraffic;
  const $ = (id) => document.getElementById(id);
  const TOKEN = "filradio.statsToken", RANGE = "filradio.statsRange";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => Number(n || 0).toLocaleString();
  let days = Number(store.get(RANGE) ?? 30);
  if (![0, 1, 7, 30, 90].includes(days)) days = 30;

  // Channels group the detailed sources.
  const CHANNELS = [
    ["Social media", ["facebook", "instagram", "tiktok", "x", "youtube", "threads", "reddit"]],
    ["Messaging apps", ["messenger", "viber", "whatsapp", "telegram"]],
    ["Search engines", ["google", "bing", "search-other"]],
    ["Ads", ["ads"]],
    ["Other websites", ["other-sites", "widget"]],
    ["Installed app", ["app"]],
    ["Direct", ["direct"]],
  ];

  // ---------- sign in ----------
  function showLogin(msg) {
    $("report").hidden = true; $("actions").hidden = true; $("login").hidden = false;
    $("loginErr").hidden = !msg; $("loginErr").textContent = msg || "";
    $("user").focus();
  }
  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginBtn").disabled = true;
    try {
      const res = await fetch(`${T.STATS}/stats/login`, { method: "POST", body: JSON.stringify({ u: $("user").value.trim(), p: $("pass").value }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.token) throw new Error(d.error || "Couldn't sign in. Try again.");
      store.set(TOKEN, d.token);
      $("pass").value = "";
      $("login").hidden = true;
      load();
    } catch (err) {
      showLogin(err.message === "Failed to fetch" ? "Couldn't reach the stats server. Check your connection." : err.message);
    } finally { $("loginBtn").disabled = false; }
  });
  $("logout").addEventListener("click", () => { store.set(TOKEN, null); showLogin(); });

  // ---------- station names (key = name lowercased, letters and digits only, like the app) ----------
  let names = null;
  async function stationNames() {
    if (names) return names;
    names = new Map();
    try {
      const d = await (await fetch("data/stations.json")).json();
      for (const s of d.d || []) names.set(String(s.n || "").toLowerCase().replace(/[^a-z0-9]+/g, ""), s.n);
    } catch {}
    return names;
  }

  // ---------- bar lists ----------
  function bars(el, rows, { hideZero = true, empty = "No data yet for this range." } = {}) {
    const total = rows.reduce((a, r) => a + r.n, 0);
    const shown = rows.filter((r) => !hideZero || r.n > 0).sort((a, b) => b.n - a.n);
    if (!total) { el.innerHTML = `<li class="muted">${empty}</li>`; return total; }
    const max = Math.max(...shown.map((r) => r.n), 1);
    el.innerHTML = shown.map((r) => {
      const pct = Math.round((r.n / total) * 1000) / 10;
      return `<li><div class="row"><span class="name">${r.html || esc(r.label)}</span><span class="num">${fmt(r.n)}<i>${pct}%</i></span></div>
        <div class="track"><div class="fill" data-w="${(r.n / max) * 100}"></div></div></li>`;
    }).join("");
    // Widths are set via the DOM (inline style attributes are blocked by this page's CSP).
    el.querySelectorAll(".fill").forEach((f) => (f.style.width = f.dataset.w + "%"));
    return total;
  }

  const title = (slug) => slug.replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());
  function pageLabel(p) {
    let m;
    if (p === "/") return "Radio map (home)";
    if (p === "/stations/") return "All stations";
    if (p === "/games/") return "Games";
    if (p === "/404") return "Page not found (404)";
    if (p === "/sitemap.html") return "Sitemap (all stations)";
    if ((m = /^\/station\/(.+)\/$/.exec(p))) return `Station: ${title(m[1])}`;
    if ((m = /^\/city\/(.+)\/$/.exec(p))) return `City: ${title(m[1])}`;
    if ((m = /^\/games\/(.+)\/$/.exec(p))) return `Game: ${title(m[1])}`;
    return p.replace(/^\//, "").replace(/\.html$/, "").replace(/^./, (c) => c.toUpperCase());
  }

  // ---------- visitors per day ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  const dayName = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  function series(r) {
    const vis = new Map(r.perDay.map((x) => [x.d, x.n])), pv = new Map(r.pvPerDay.map((x) => [x.d, x.n]));
    // Fill every day from the start of the range (or the first tracked day) to today.
    let start = r.days ? r.today : (r.perDay[0]?.d || r.today);
    if (r.days) { const t = new Date(`${r.today}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - (r.days - 1)); start = t.toISOString().slice(0, 10); }
    if (start < r.since) start = r.since;
    const out = [];
    for (let t = new Date(`${start}T00:00:00Z`); ; t.setUTCDate(t.getUTCDate() + 1)) {
      const d = t.toISOString().slice(0, 10);
      out.push({ d, n: vis.get(d) || 0, pv: pv.get(d) || 0 });
      if (d >= r.today || out.length > 400) break;
    }
    return out;
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function dayChart(rows) {
    const box = $("dayChart");
    box.textContent = "";
    if (!rows.some((x) => x.n || x.pv)) { box.innerHTML = `<p class="muted">No visits counted in this range yet.</p>`; return; }
    lastRows = rows;
    // Drawn at the box's real width so the labels stay readable on phones.
    const W = Math.max(280, Math.round(box.clientWidth || 720)), H = W < 500 ? 190 : 230, L = 44, R = 8, TOP = 10, B = 26;
    const max = niceMax(Math.max(...rows.map((x) => x.n), 1));
    const step = (W - L - R) / rows.length;
    const bw = Math.max(1.5, Math.min(28, step - 2)); // 2px surface gap between bars
    const y = (v) => TOP + (H - TOP - B) * (1 - v / max);
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Visitors per day, ${rows.length} days, highest ${fmt(Math.max(...rows.map((x) => x.n)))}`);
    const add = (tag, attrs, text) => {
      const el = document.createElementNS(SVGNS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (text != null) el.textContent = text;
      svg.appendChild(el);
      return el;
    };
    for (let i = 0; i <= 4; i++) { // recessive grid + y labels
      const v = (max / 4) * i, yy = y(v);
      add("line", { x1: L, x2: W - R, y1: yy, y2: yy, class: i ? "grid" : "axis" });
      add("text", { x: L - 8, y: yy + 4, class: "ylab", "text-anchor": "end" }, fmt(Math.round(v)));
    }
    rows.forEach((x, i) => {
      const cx = L + step * i + step / 2, top = y(x.n), h = Math.max(0, H - B - top);
      if (h > 0) {
        // Rounded data end (top), square at the baseline.
        const r = Math.min(4, bw / 2, h);
        const x0 = cx - bw / 2;
        add("path", { class: "bar", "data-i": i, d: `M${x0} ${H - B}V${top + r}Q${x0} ${top} ${x0 + r} ${top}H${x0 + bw - r}Q${x0 + bw} ${top} ${x0 + bw} ${top + r}V${H - B}Z` });
      }
    });
    // A few date labels along the bottom.
    const every = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(W / 95))));
    rows.forEach((x, i) => {
      if (i % every && i !== rows.length - 1) return;
      if (i !== rows.length - 1 && rows.length - 1 - i < every * 0.6) return; // keep the last label clear
      add("text", { x: L + step * i + step / 2, y: H - 7, class: "xlab", "text-anchor": "middle" }, shortDay(x.d));
    });
    const hover = add("rect", { class: "hover", x: 0, y: TOP, width: step, height: H - TOP - B, visibility: "hidden" });
    svg.insertBefore(hover, svg.firstChild.nextSibling);
    box.appendChild(svg);

    // Hover / tap: the whole column is the target, not just the bar.
    const tip = $("tip");
    const at = (e) => {
      const b = svg.getBoundingClientRect();
      const i = Math.floor(((e.clientX - b.left) / b.width * W - L) / step);
      if (i < 0 || i >= rows.length) return hide();
      const x = rows[i];
      hover.setAttribute("x", L + step * i); hover.setAttribute("visibility", "visible");
      svg.querySelectorAll(".bar.on").forEach((el) => el.classList.remove("on"));
      svg.querySelector(`.bar[data-i="${i}"]`)?.classList.add("on");
      tip.innerHTML = `<b>${dayName(x.d)}</b><span>${fmt(x.n)} visitors</span><span class="muted">${fmt(x.pv)} page views</span>`;
      tip.hidden = false;
      const tx = Math.min(innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX - tip.offsetWidth / 2));
      tip.style.left = `${tx}px`;
      tip.style.top = `${b.top + scrollY - tip.offsetHeight - 6}px`;
    };
    const hide = () => { tip.hidden = true; hover.setAttribute("visibility", "hidden"); svg.querySelectorAll(".bar.on").forEach((el) => el.classList.remove("on")); };
    svg.addEventListener("pointermove", at);
    svg.addEventListener("pointerdown", at);
    svg.addEventListener("pointerleave", hide);

    // Table view (newest first).
    $("dayTable").innerHTML = `<table><thead><tr><th>Day</th><th>Visitors</th><th>Page views</th></tr></thead><tbody>${
      rows.slice().reverse().map((x) => `<tr><td>${dayName(x.d)}</td><td>${fmt(x.n)}</td><td>${fmt(x.pv)}</td></tr>`).join("")}</tbody></table>`;
  }
  let lastRows = null, lastW = 0;
  addEventListener("resize", () => {
    const w = $("dayChart").clientWidth;
    if (lastRows && Math.abs(w - lastW) > 40) { lastW = w; dayChart(lastRows); }
  });
  $("dayTableBtn").addEventListener("click", (e) => {
    const open = $("dayTable").hidden;
    $("dayTable").hidden = !open;
    e.currentTarget.setAttribute("aria-expanded", String(open));
    e.currentTarget.textContent = open ? "Hide table" : "Show table";
  });

  // ---------- load ----------
  const RANGE_TEXT = { 1: "today", 7: "the last 7 days", 30: "the last 30 days", 90: "the last 90 days", 0: "all time" };
  async function load() {
    const token = store.get(TOKEN);
    if (!token) return showLogin();
    $("refresh").disabled = true;
    let r;
    try {
      const res = await fetch(`${T.STATS}/stats?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { store.set(TOKEN, null); return showLogin("Your session ended. Please sign in again."); }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || String(res.status));
      r = await res.json();
    } catch (err) {
      $("report").hidden = false; $("actions").hidden = false;
      $("note").textContent = `Couldn't load the stats right now (${err.message}). Tap Refresh to try again.`;
      $("refresh").disabled = false;
      return;
    }
    $("login").hidden = true; $("report").hidden = false; $("actions").hidden = false;
    document.querySelectorAll("#range button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));

    const c = r.counts || {};
    const rows = (list, p) => list.map(([k, label]) => ({ label, n: c[`${p}-${k}`] || 0 }));
    $("kVisitors").textContent = fmt(c.visits);
    $("kViews").textContent = fmt(r.views);
    $("kListens").textContent = fmt(r.listens);
    $("kLive").textContent = fmt(r.live);
    const sinceTxt = dayName(r.since);
    $("note").textContent = days
      ? `Showing ${RANGE_TEXT[days]} (Philippine dates). Each device counts as one visitor per day. Daily numbers, pages and referring sites start on ${sinceTxt}.`
      : `All time: visitors, sources, countries and devices include everything counted so far. Pages and referring sites start on ${sinceTxt}; the chart shows the last 365 days.`;
    $("dayTitle").textContent = days === 1 ? "Visitors today" : days ? `Visitors per day, ${RANGE_TEXT[days]}` : "Visitors per day, last 365 days";
    dayChart(series(r));

    bars($("pages"), (r.pages || []).slice(0, 25).map((x) => ({ n: x.n, html: `${esc(pageLabel(x.p))} <small class="path">${esc(x.p)}</small>` })), { empty: "No page views counted yet. They start with this update." });
    const src = rows(T.SOURCES, "src");
    const bySrc = Object.fromEntries(src.map((x, i) => [T.SOURCES[i][0], x.n]));
    bars($("channels"), CHANNELS.map(([label, keys]) => ({ label, n: keys.reduce((a, k) => a + (bySrc[k] || 0), 0) })));
    bars($("sources"), src);
    bars($("refs"), (r.refs || []).map((x) => ({ label: x.h, n: x.n })), { empty: "No referring sites yet. Visits from other websites and apps show here." });
    bars($("places"), rows(T.PLACES, "loc"), { hideZero: false });
    bars($("devices"), rows(T.DEVICES, "dev"));
    bars($("systems"), rows(T.SYSTEMS, "os"));
    bars($("countries"), rows(T.COUNTRIES, "cc"));

    $("stTitle").textContent = `Most played stations, ${r.topDays === 1 ? "today" : `last ${r.topDays} days`}`;
    const nm = await stationNames();
    bars($("stations"), (r.stations || []).slice(0, 25).map((x) => ({ label: nm.get(x.s) || x.s, n: x.n })), { empty: "No plays counted in this range yet." });
    $("refresh").disabled = false;
  }

  $("range").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-days]");
    if (!b) return;
    days = Number(b.dataset.days);
    store.set(RANGE, String(days));
    load();
  });
  $("refresh").addEventListener("click", load);
  load();
})();
