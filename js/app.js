(() => {
  "use strict";

  // ======================================================
  // Config
  // ======================================================
  const API_HOSTS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
  ];
  const CACHE_KEY = "filradio.stations.v1";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const MANILA = [14.5995, 120.9842];
  // ?secure=1 lets you test the https behaviour on localhost.
  const SECURE = location.protocol === "https:" || /[?&]secure=1(&|$)/.test(location.search);
  const BRAND = { ink: "#10182b", sun: "#ffc93c", red: "#e63946", fm: "#2347d6", am: "#e4572e", online: "#0e9f8e", unknown: "#9aa0aa" };
  // Branded icon set lives in the SVG sprite in index.html.
  const use = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const ICON = { play: use("i-play"), pause: use("i-pause"), pin: use("i-pin"), sig: use("i-signal", "sig") };
  // Fallback artwork when a station has no logo of its own.
  const RADIO_IMG = { sm: "icons/radio-128.webp", lg: "icons/radio-512.webp" };
  const HINTS = ["Search stations, cities, genres", "Try a city: “Cebu”", "Try “Bombo Radyo”", "Try a province: “Bohol”", "Try “OPM”", "Try “Love Radio”", "Try “Davao”", "Try “news”"];

  // ======================================================
  // State
  // ======================================================
  let apiHost = API_HOSTS[0];
  let stations = [];
  let visible = [];
  let band = "all";
  let query = "";
  let current = null;
  let hls = null;
  let is3D = false; // 2D first for a fast start; 3D loads on demand
  let mapReady = false;
  let installEvt = null;

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const mq = matchMedia("(max-width: 760px)");
  const isMobile = () => mq.matches;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ======================================================
  // Helpers
  // ======================================================
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

  // Rate limiter persisted per device: allow(key, ms) is true at most once per `ms`.
  const guard = {
    allow(key, ms) {
      try {
        const k = "filradio.rl." + key, last = +localStorage.getItem(k) || 0;
        if (Date.now() - last < ms) return false;
        localStorage.setItem(k, String(Date.now()));
      } catch {}
      return true;
    },
  };
  // Station "click" vote on radio-browser: once per station per device per day.
  function reportClick(st) {
    if (!guard.allow("click." + st.id, 24 * 60 * 60 * 1000)) return;
    fetch(`${apiHost}/json/url/${encodeURIComponent(st.streams[0]?.id || st.id)}`).catch(() => {});
  }
  // Broken station logos fall back to the radio artwork (no inline handlers needed).
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.classList.contains("logo-img")) {
      img.className = "radio-img";
      img.src = RADIO_IMG.sm;
    }
  }, true);

  function toast(msg, ms = 2800) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // FM / AM / Online from name + tags (radio-browser has no band field).
  function classify(name, tags) {
    const text = `${name} ${tags}`;
    const dec = text.match(/\b(8[7-9]|9\d|10[0-8])[.,]\d\b/);
    if (dec) { const n = +dec[0].replace(",", "."); return { band: "FM", num: n }; }
    if ((/\b(DZRH|DZBB|DZMM|DZAS|DZRV|DWIZ|DZRB|DZXL|DZME|DZEC|DWWW|DZAR|DZRJ|DZRM|DWAD|DZSR|DZIQ|DWBL|DXRB|DYRC|DYLA|DXMF)\b/i.test(name) && !/\bfm\b/i.test(name))
        || /\b(Bombo Radyo|Aksyon Radyo|Super Radyo|RMN|Radyo Patrol|Radyo Pilipinas|Radyo Agong)\b/i.test(name)) {
      const m = text.match(/\b(\d{3,4})\b/);
      const n = m && +m[1] >= 531 && +m[1] <= 1611 ? +m[1] : null;
      return { band: "AM", num: n };
    }
    const fmWord = /\bfm\b|\d\s*fm\b|fm\d/i.test(text);
    const amWord = /\bam\b|\d\s*am\b|\bkhz\b/i.test(text);
    for (const m of text.matchAll(/\b(\d{3,4})\b/g)) {
      const n = +m[1];
      if (!amWord && n >= 875 && n <= 1079 && n % 2 === 1) return { band: "FM", num: n / 10 };
      if (!fmWord && n >= 531 && n <= 1611 && n % 9 === 0) return { band: "AM", num: n };
    }
    if (fmWord) return { band: "FM", num: null };
    if (amWord) return { band: "AM", num: null };
    return { band: "Online", num: null };
  }
  const freqLabel = (st) => (st.num == null ? "" : st.band === "FM" ? st.num.toFixed(1) : String(st.num));
  const freqFull = (st) => (st.num == null ? "" : st.band === "FM" ? `${st.num.toFixed(1)} MHz` : `${st.num} kHz`);

  // Gazetteer lookup (longest names first, whole-word).
  const placeRx = Object.keys(window.PH_PLACES)
    .sort((a, b) => b.length - a.length)
    .map((k) => [k, new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([^a-z]|$)`, "i")]);
  function findPlace(...texts) {
    for (const t of texts) {
      if (!t) continue;
      for (const [k, rx] of placeRx) if (rx.test(t)) return k;
    }
    return null;
  }
  function jitter(seed, amount) {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
    const r = (0.25 + 0.75 * (((h >>> 16) & 0xffff) / 0xffff)) * amount;
    return [Math.sin(a) * r, Math.cos(a) * r];
  }

  // ======================================================
  // Data
  // ======================================================
  async function fetchJSON(path) {
    let lastErr;
    for (const host of [apiHost, ...API_HOSTS.filter((h) => h !== apiHost)]) {
      try {
        const res = await fetch(host + path, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(res.status);
        apiHost = host;
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async function loadRaw() {
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && (Date.now() - cached.t < CACHE_TTL || !navigator.onLine)) return cached.d;
    } catch {}
    if (!guard.allow("api-list", 60 * 1000) && cached) return cached.d;
    let data;
    try {
      data = await fetchJSON("/json/stations/bycountrycodeexact/PH?hidebroken=true&order=votes&reverse=true&limit=5000");
    } catch (e) {
      if (cached) return cached.d; // offline or API down: use the last list we saved
      throw e;
    }
    return saveRaw(data);
  }
  function saveRaw(data) {
    const slim = data.map((s) => ({
      u: s.stationuuid, n: s.name, url: s.url_resolved || s.url, hp: s.homepage, f: s.favicon, t: s.tags,
      st: s.state, la: s.geo_lat, lo: s.geo_long, c: s.codec, b: s.bitrate, h: s.hls, v: s.votes, ok: s.lastcheckok,
    }));
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: slim })); } catch {}
    return slim;
  }

  function build(raw) {
    const byName = new Map();
    for (const s of raw) {
      if (!s.url) continue;
      const key = norm(s.n);
      if (!key) continue;
      let st = byName.get(key);
      if (!st) {
        const name = clean(s.n);
        const cls = classify(name, s.t || "");
        st = { id: s.u, name, tags: clean(s.t).replace(/,/g, ", "), band: cls.band, num: cls.num, state: clean(s.st),
               favicon: safeUrl(s.f), homepage: safeUrl(s.hp), votes: 0, streams: [], lat: null, lng: null, exact: false };
        byName.set(key, st);
      }
      st.votes += s.v || 0;
      if (!st.favicon && s.f) st.favicon = safeUrl(s.f);
      if (!st.state && s.st) st.state = clean(s.st);
      if (st.lat == null && s.la != null && s.lo != null) { st.lat = s.la; st.lng = s.lo; st.exact = true; }
      st.streams.push({ id: s.u, url: s.url, hls: !!s.h || /\.m3u8(\?|$)/i.test(s.url), bitrate: s.b, ok: s.ok });
    }
    const out = [...byName.values()];
    for (const st of out) {
      st.streams.sort((a, b) => (b.url.startsWith("https") - a.url.startsWith("https")) || (b.ok - a.ok) || ((b.bitrate || 0) - (a.bitrate || 0)));
      // On an https site browsers block http audio ("mixed content"). Use https links first, then try the
      // same http address over https (works for many hosts), and keep the http link so the station can
      // still be opened in the browser's own player as a last resort.
      if (SECURE) {
        st.insecureUrl = st.streams.find((x) => x.url.startsWith("http:"))?.url || "";
        const upgraded = st.streams
          .filter((x) => x.url.startsWith("http:") && !/^http:\/\/(\d+\.\d+\.\d+\.\d+|\[)/.test(x.url))
          .map((x) => ({ ...x, url: "https:" + x.url.slice(5), upgraded: true }));
        st.streams = [...st.streams.filter((x) => x.url.startsWith("https:")), ...upgraded];
      }
      if (!st.exact) {
        const place = findPlace(st.state, st.name, st.tags);
        if (place) {
          const [la, lo] = window.PH_PLACES[place];
          const [dy, dx] = jitter(st.id, 0.03);
          st.lat = la + dy; st.lng = lo + dx; st.place = place;
        } else {
          const [dy, dx] = jitter(st.id, 0.3);
          st.lat = MANILA[0] + dy; st.lng = MANILA[1] + dx; st.unknown = true;
        }
      }
      st.where = st.exact ? (st.state || "Exact location") : st.place ? (st.state || st.place) : "Location unknown";
      st.genre = (st.tags.split(",")[0] || "").trim();
      st.external = SECURE && !st.streams.length && !!st.insecureUrl;
      st.hay = `${st.name} ${st.tags} ${st.where} ${freqLabel(st)} ${st.band}`.toLowerCase();
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return out;
  }

  // ======================================================
  // 3D Map (MapLibre GL + OpenFreeMap + AWS terrain)
  // ======================================================
  // Whole Philippines, framed around the panel/sheet.
  const PH_BOUNDS = [[116.6, 4.4], [127.0, 21.2]];
  try { is3D = localStorage.getItem("filradio.3d") === "1"; } catch {}

  // Starts as a flat 2D map (no terrain, no globe, no 3D buildings) so it loads fast.
  const map = new maplibregl.Map({
    container: "map",
    // Phones: render at 1.5x (sharp enough, far less GPU/memory than 3x) and keep a smaller tile cache
    // so iOS Safari doesn't reload the tab for using too much memory.
    pixelRatio: Math.min(devicePixelRatio || 1, isMobile() ? 1.5 : 2),
    maxTileCacheSize: isMobile() ? 60 : 200,
    refreshExpiredTiles: false,
    fadeDuration: 150,
    style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`,
    bounds: PH_BOUNDS,
    fitBoundsOptions: { padding: startPadding() },
    maxPitch: 78,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.on("error", (e) => console.warn("[map]", e.error?.message || e));
  // Phones can drop the WebGL context under memory pressure; MapLibre restores it, we just say so.
  map.on("webglcontextlost", () => toast("Reloading the map…"));
  map.on("webglcontextrestored", () => map.triggerRepaint());

  // Pin images drawn on canvas — one per band, plus "playing" and "unknown".
  async function makePins() {
    // Wait briefly for the LCD font, but never hold the pins back on a slow mobile connection.
    try { await Promise.race([document.fonts.load('20px "Share Tech Mono"'), new Promise((r) => setTimeout(r, 700))]); } catch {}
    const defs = {
      "pin-FM": [BRAND.fm, "#fff", "FM"],
      "pin-AM": [BRAND.am, "#fff", "AM"],
      "pin-Online": [BRAND.online, "#fff", "sig"],
      "pin-unknown": [BRAND.unknown, "#fff", "?"],
      "pin-playing": [BRAND.sun, BRAND.ink, "play"],
    };
    for (const [id, [fill, fg, label]] of Object.entries(defs)) {
      const r = 2, w = 34, h = 44;
      const c = document.createElement("canvas");
      c.width = w * r; c.height = h * r;
      const g = c.getContext("2d");
      g.scale(r, r);
      // shadow
      g.fillStyle = "rgba(16,24,43,.25)";
      g.beginPath(); g.ellipse(17, 41.5, 6, 2, 0, 0, Math.PI * 2); g.fill();
      // body: rounded square tag with pointer — reads like a tuner preset button
      g.beginPath();
      g.moveTo(9, 3); g.lineTo(25, 3); g.quadraticCurveTo(31, 3, 31, 9); g.lineTo(31, 23);
      g.quadraticCurveTo(31, 29, 25, 29); g.lineTo(21, 29); g.lineTo(17, 38); g.lineTo(13, 29); g.lineTo(9, 29);
      g.quadraticCurveTo(3, 29, 3, 23); g.lineTo(3, 9); g.quadraticCurveTo(3, 3, 9, 3); g.closePath();
      g.fillStyle = fill; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = id === "pin-playing" ? BRAND.ink : "#fff"; g.stroke();
      g.fillStyle = fg; g.strokeStyle = fg;
      if (label === "sig") {
        g.lineWidth = 2.2; g.lineCap = "round";
        g.beginPath(); g.arc(17, 21, 9, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
        g.beginPath(); g.arc(17, 21, 5, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
        g.beginPath(); g.arc(17, 20.5, 1.9, 0, Math.PI * 2); g.fill();
      } else if (label === "play") {
        g.beginPath(); g.moveTo(13.5, 10); g.lineTo(23, 16); g.lineTo(13.5, 22); g.closePath(); g.fill();
      } else {
        g.font = '12.5px "Share Tech Mono", ui-monospace, monospace';
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(label, 17, 16.5);
      }
      if (!map.hasImage(id)) map.addImage(id, g.getImageData(0, 0, w * r, h * r), { pixelRatio: r });
    }

    // Cluster markers drawn as the FilRadio sun: 8 rays (long/short) around a navy core.
    for (const [id, ray, core, ring] of [
      ["cluster-st", BRAND.sun, BRAND.ink, BRAND.sun],
      ["cluster-unk", BRAND.unknown, "#5c6373", BRAND.unknown],
    ]) {
      const r = 2, S = 64;
      const c = document.createElement("canvas");
      c.width = c.height = S * r;
      const g = c.getContext("2d");
      g.scale(r, r);
      g.translate(S / 2, S / 2);
      g.lineCap = "round";
      g.strokeStyle = ray;
      for (let i = 0; i < 8; i++) {
        const long = i % 2 === 0;
        g.lineWidth = long ? 4.2 : 3.6;
        g.beginPath();
        g.moveTo(0, -(long ? 21 : 21.5));
        g.lineTo(0, -(long ? 29.5 : 26.5));
        g.stroke();
        g.rotate(Math.PI / 4);
      }
      g.beginPath(); g.arc(0, 0, 17.5, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
      g.beginPath(); g.arc(0, 0, 14.5, 0, Math.PI * 2); g.fillStyle = core; g.fill();
      if (!map.hasImage(id)) map.addImage(id, g.getImageData(0, 0, S * r, S * r), { pixelRatio: r });
    }
  }

  const emptyFC = { type: "FeatureCollection", features: [] };

  // Map details we don't need: shop/restaurant icons compete with station pins and cost tile processing.
  // Hidden layers are skipped entirely when tiles are parsed, so this makes every tile lighter.
  const SKIP_LAYERS = /^(poi_|road_one_way_arrow|highway-shield|road_shield_us)|_hatching$/;
  const SKIP_ON_PHONE = /^(building|highway-name-path|highway-name-minor|landuse_track|landuse_pitch|aeroway_taxiway)$|path_pedestrian/;

  map.once("style.load", async () => {
    for (const layer of map.getStyle().layers) {
      if (SKIP_LAYERS.test(layer.id) || (isMobile() && SKIP_ON_PHONE.test(layer.id))) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    // 3D buildings stay hidden until the user switches to 3D.
    if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");
    await makePins();

    // Station sources: located (clustered) + unknown (clustered separately)
    for (const src of ["st", "unk"]) {
      map.addSource(src, { type: "geojson", data: emptyFC, cluster: true, clusterRadius: 46, clusterMaxZoom: 11 });
      const isUnk = src === "unk";
      map.addLayer({
        id: `${src}-cluster`, type: "symbol", source: src, filter: ["has", "point_count"],
        layout: {
          "icon-image": isUnk ? "cluster-unk" : "cluster-st",
          "icon-size": ["step", ["get", "point_count"], 0.72, 10, 0.86, 40, 1.04],
          "icon-allow-overlap": true, "icon-ignore-placement": true,
          "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"],
          "text-size": ["step", ["get", "point_count"], 11, 10, 12, 40, 14],
          "text-allow-overlap": true, "text-ignore-placement": true,
        },
        paint: { "text-color": isUnk ? "#fff" : BRAND.sun },
      });
      map.addLayer({
        id: `${src}-pin`, type: "symbol", source: src, filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": isUnk ? "pin-unknown" : ["concat", "pin-", ["get", "band"]],
          "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 1],
        },
      });
    }
    // Currently playing — its own source so it's never hidden inside a cluster.
    map.addSource("playing", { type: "geojson", data: emptyFC });
    map.addLayer({
      id: "playing-pulse", type: "circle", source: "playing",
      paint: { "circle-color": BRAND.sun, "circle-radius": 12, "circle-opacity": 0.5, "circle-pitch-alignment": "map" },
    });
    map.addLayer({
      id: "playing-pin", type: "symbol", source: "playing",
      layout: { "icon-image": "pin-playing", "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": 1.15 },
    });

    // Interactions
    for (const src of ["st", "unk"]) {
      map.on("click", `${src}-cluster`, async (e) => {
        const f = e.features[0];
        const zoom = await map.getSource(src).getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.3, 14), pitch: is3D ? 55 : 0, padding: mapPadding(), duration: 900 });
      });
      for (const l of [`${src}-cluster`, `${src}-pin`]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", `${src}-pin`, (e) => {
        const st = byId.get(e.features[0].properties.id);
        if (st) { tapStation(st); showPopup(st); }
      });
    }
    map.on("click", "playing-pin", () => current && showPopup(current));

    // Keep the map credits collapsed to the (i) button on small screens.
    if (isMobile()) document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    mapReady = true;
    if (stations.length) render();
    if (current) setPlayingFeature();
  });
  // Restore 3D only after the first full load (terrain must not be added mid-load).
  map.once("load", () => { if (is3D) set3D(true, false); });

  // First view on phones: tighter framing so the islands fill the space between search bar and list.
  function startPadding() {
    if (!isMobile()) return mapPadding();
    return { top: 118, bottom: Math.round(innerHeight * 0.5) + 6, left: 8, right: 52 };
  }

  function mapPadding() {
    if (isMobile()) {
      const sheetTop = $("sheet").getBoundingClientRect().top;
      return { top: 210, bottom: Math.max(80, innerHeight - sheetTop + 20), left: 20, right: 60 };
    }
    const sb = $("sidebar");
    return { top: 40, bottom: $("player").hidden ? 40 : 110, left: sb.classList.contains("open") ? 400 : 40, right: 60 };
  }

  // Pulse animation for the playing pin
  let pulseT0 = performance.now();
  let lastPulse = 0;
  (function pulse(t) {
    if (t - lastPulse > 33 && mapReady && current && !audio.paused && map.getLayer("playing-pulse")) {
      lastPulse = t;
      const p = ((t - pulseT0) % 1600) / 1600;
      map.setPaintProperty("playing-pulse", "circle-radius", 10 + p * 26);
      map.setPaintProperty("playing-pulse", "circle-opacity", 0.55 * (1 - p));
    }
    requestAnimationFrame(pulse);
  })(pulseT0);

  function setPlayingFeature() {
    if (!mapReady) return;
    map.getSource("playing").setData(current
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: current.id }, geometry: { type: "Point", coordinates: [current.lng, current.lat] } }] }
      : emptyFC);
    if (audio.paused) {
      map.setPaintProperty("playing-pulse", "circle-opacity", 0);
    }
  }

  // Popup
  const popup = new maplibregl.Popup({ offset: [0, -40], closeButton: true, maxWidth: "290px", focusAfterOpen: false });
  let popupFor = null;
  popup.on("close", () => (popupFor = null));

  // Thumbnail: the station's own logo, or the FilRadio radio artwork when it has none (or it fails to load).
  function readoutHtml(st, cls = "") {
    const tag = st.num != null ? freqLabel(st) : st.band === "Online" ? "NET" : st.band;
    const img = st.favicon
      ? `<img class="logo-img" src="${esc(st.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<img class="radio-img" src="${RADIO_IMG.sm}" alt="" loading="lazy">`;
    return `<span class="readout ${st.band} ${cls}">${img}<b class="tag">${tag}</b></span>`;
  }

  function popupHtml(st) {
    const playing = current === st && !audio.paused;
    return `<div class="popup">
      <div class="row">${readoutHtml(st)}<div><h3>${esc(st.name)}</h3>
        <div class="meta">${esc(st.where)}${st.unknown || st.exact ? "" : " · approx."}</div></div></div>
      ${st.tags ? `<div class="tags">${esc(st.tags)}</div>` : ""}
      <div class="actions">
        <button class="go" data-play="${esc(st.id)}">${playing ? ICON.pause + "Pause" : ICON.play + "Listen"}</button>
        ${st.homepage ? `<a href="${esc(st.homepage)}" target="_blank" rel="noopener">Website ↗</a>` : ""}
        ${SECURE && !st.streams.length && st.insecureUrl ? `<a href="${esc(st.insecureUrl)}" target="_blank" rel="noopener noreferrer">Play in browser ↗</a>` : ""}
      </div></div>`;
  }

  function showPopup(st) {
    popupFor = st;
    popup.setLngLat([st.lng, st.lat]).setHTML(popupHtml(st)).addTo(map);
    bindPopup();
  }
  function refreshPopup() {
    if (popupFor && popup.isOpen()) { popup.setHTML(popupHtml(popupFor)); bindPopup(); }
  }
  function bindPopup() {
    const btn = popup.getElement()?.querySelector("[data-play]");
    btn?.addEventListener("click", () => {
      const st = byId.get(btn.dataset.play);
      if (!st) return;
      if (current === st && !st.external) togglePlay(); else tapStation(st);
    });
  }

  function focus(st, opts = {}) {
    if (st.unknown && !$("showUnknown").checked) { $("showUnknown").checked = true; render(); }
    map.flyTo({
      center: [st.lng, st.lat], zoom: 12.5, pitch: is3D ? 58 : 0, bearing: is3D ? map.getBearing() : 0,
      padding: mapPadding(), duration: reduceMotion ? 0 : 2200, essential: true,
    });
    if (opts.popup !== false) map.once("moveend", () => showPopup(st));
  }

  // ---------- 3D on demand ----------
  // Terrain elevation tiles, hillshade, globe and 3D buildings are only fetched the first time 3D is turned on.
  let terrainAdded = false;
  function addTerrain() {
    if (terrainAdded) return;
    terrainAdded = true;
    const dem = {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium", tileSize: 256, maxzoom: 14,
      attribution: "Terrain: Mapzen / AWS Open Data",
    };
    map.addSource("dem", dem);
    map.addSource("dem-hs", { ...dem });
    const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer({
      id: "hillshade", type: "hillshade", source: "dem-hs",
      paint: { "hillshade-exaggeration": dark ? 0.35 : 0.45, "hillshade-shadow-color": dark ? "#000" : "#5b4b2e", "hillshade-highlight-color": "#fffbe8" },
    }, firstSymbol);
    try {
      map.setSky({
        "sky-color": dark ? "#0b1020" : "#bfd6ee", "horizon-color": dark ? "#1b2440" : "#f4f1ea", "fog-color": dark ? "#0b1020" : "#f4f1ea",
        "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.5,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 7, 0.6, 10, 0],
      });
    } catch {}
  }

  function set3D(on, animate = true) {
    is3D = on;
    $("toggle3d").setAttribute("aria-pressed", String(on));
    $("toggle3d").classList.remove("hint");
    try { localStorage.setItem("filradio.3d", on ? "1" : "0"); } catch {}
    if (!mapReady) return;
    if (on) addTerrain();
    if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", on ? "visible" : "none");
    map.setTerrain(on ? { source: "dem", exaggeration: 1.5 } : null);
    if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", on ? "visible" : "none");
    try { map.setProjection({ type: on ? "globe" : "mercator" }); } catch {}
    map.easeTo({ pitch: on ? 55 : 0, bearing: on ? -14 : 0, duration: animate && !reduceMotion ? 1000 : 0 });
  }
  $("toggle3d").setAttribute("aria-pressed", String(is3D));
  $("toggle3d").addEventListener("click", () => set3D(!is3D));

  // First visit: point out the 3D button once.
  if (!is3D && guard.allow("hint3d", 30 * 24 * 60 * 60 * 1000)) {
    setTimeout(() => {
      $("toggle3d").classList.add("hint");
      toast("Tip: tap 3D to see mountains and city buildings", 4000);
      setTimeout(() => $("toggle3d").classList.remove("hint"), 6000);
    }, 3000);
  }

  $("recenter").addEventListener("click", () => {
    map.fitBounds(PH_BOUNDS, { padding: mapPadding(), pitch: is3D ? 42 : 0, bearing: is3D ? -14 : 0, duration: reduceMotion ? 0 : 1500 });
  });


  // ======================================================
  // Rendering
  // ======================================================
  const byId = new Map();
  const bandOk = (st) => band === "all" || st.band === band;
  const matches = (st) => bandOk(st) && (!query || st.hay.includes(query));
  const toFeature = (st) => ({ type: "Feature", properties: { id: st.id, band: st.band }, geometry: { type: "Point", coordinates: [st.lng, st.lat] } });

  // ---------- Location search ----------
  // Typing a city/province ("Cebu", "Davao", "Iloilo") lists every station within AREA_KM, nearest first.
  const AREA_KM = 45;
  let nearMe = null;      // set by the "near me" button
  let lastAreaKey = null; // so the map only flies when the area changes
  const placeNames = Object.keys(window.PH_PLACES);
  function km(lat1, lng1, lat2, lng2) {
    const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }
  function findArea(q) {
    if (q.length < 3) return null;
    const exact = placeNames.find((p) => p.toLowerCase() === q);
    const name = exact || placeNames.filter((p) => p.toLowerCase().startsWith(q)).sort((a, b) => a.length - b.length)[0];
    if (!name) return null;
    const [lat, lng] = window.PH_PLACES[name];
    return { key: name, label: name, lat, lng };
  }
  function currentArea() { return nearMe || (query ? findArea(query) : null); }

  function render() {
    const area = currentArea();
    if (area) {
      for (const st of stations) st.dist = st.unknown ? Infinity : km(area.lat, area.lng, st.lat, st.lng);
      visible = stations
        .filter((st) => bandOk(st) && (st.dist <= AREA_KM || (query && !nearMe && st.hay.includes(query))))
        .sort((a, b) => a.dist - b.dist);
      // Near me but nothing within range (e.g. abroad): show the 20 nearest instead.
      if (nearMe && !visible.length) visible = stations.filter((st) => bandOk(st) && isFinite(st.dist)).sort((a, b) => a.dist - b.dist).slice(0, 20);
      if (area.key !== lastAreaKey && mapReady) {
        map.flyTo({ center: [area.lng, area.lat], zoom: 9.6, pitch: is3D ? 50 : 0, padding: mapPadding(), duration: reduceMotion ? 0 : 2000, essential: true });
      }
    } else {
      for (const st of stations) st.dist = undefined;
      visible = stations.filter(matches);
    }
    lastAreaKey = area ? area.key : null;
    const showUnknown = $("showUnknown").checked;

    if (mapReady) {
      map.getSource("st").setData({ type: "FeatureCollection", features: visible.filter((s) => !s.unknown).map(toFeature) });
      map.getSource("unk").setData({ type: "FeatureCollection", features: showUnknown && !area ? visible.filter((s) => s.unknown).map(toFeature) : [] });
    }

    const pool = area ? stations.filter((s) => s.dist <= AREA_KM || (query && !nearMe && s.hay.includes(query)))
                      : query ? stations.filter((s) => s.hay.includes(query)) : stations;
    for (const b of document.querySelectorAll(".band")) {
      const n = b.dataset.band === "all" ? pool.length : pool.filter((s) => s.band === b.dataset.band).length;
      const span = b.querySelector("span");
      if (span.textContent !== String(n)) {
        span.textContent = n;
        b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
      }
    }
    $("listCount").textContent = `${visible.length}`;

    const list = $("list");
    list.innerHTML = "";
    list.scrollTop = 0;
    const frag = document.createDocumentFragment();
    if (area) {
      const near = visible.filter((s) => s.dist <= AREA_KM).length;
      const banner = document.createElement("li");
      banner.className = "area-banner anim";
      banner.innerHTML = `<span class="area-ico">${use(nearMe ? "i-near" : "i-locate")}</span>
        <div class="info"><div class="name">${nearMe ? "Stations near you" : `Stations in &amp; around ${esc(area.label)}`}</div>
        <div class="meta">${near} within ${AREA_KM} km · nearest first</div></div>
        <button class="area-clear" data-area-clear aria-label="Clear location">${use("i-x")}</button>`;
      frag.appendChild(banner);
    }
    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = area ? `No stations found within ${AREA_KM} km.` : `No stations match “${query}”.`;
      frag.appendChild(li);
      list.appendChild(frag);
      return;
    }
    visible.forEach((st, i) => {
      const li = document.createElement("li");
      li.dataset.id = st.id;
      if (current === st) li.classList.add("playing");
      if (i < 18) { li.classList.add("anim"); li.style.setProperty("--i", i + (area ? 1 : 0)); }
      const dist = st.dist != null && isFinite(st.dist) ? `<b class="dist">${st.dist < 1 ? "<1" : Math.round(st.dist)} km</b>` : "";
      li.innerHTML = `${readoutHtml(st)}
        <div class="info">
          <div class="name">${esc(st.name)}</div>
          <div class="meta">${dist}${st.external ? `<b class="ext-chip" title="Opens in your browser's own player">↗ Browser</b>` : ""}${ICON.pin}<span>${esc(st.where)}${st.genre ? " · " + esc(st.genre) : ""}</span></div>
        </div>
        <span class="bars"><i></i><i></i><i></i></span>`;
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  // Every tap on a station goes through here. Stations that only have an old http stream are opened in the
  // browser's own player right away: it must happen inside the tap, or the browser blocks the new tab.
  function tapStation(st) {
    if (st.external) {
      const win = window.open(st.insecureUrl, "_blank", "noopener,noreferrer");
      toast(win === null ? "Tap Play ↗ to open this station in your browser" : "Opening in your browser's player…", 3500);
    }
    play(st);
  }

  $("list").addEventListener("click", (e) => {
    if (e.target.closest("[data-area-clear]")) {
      nearMe = null;
      search.value = "";
      search.dispatchEvent(new Event("input"));
      return;
    }
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const st = byId.get(li.dataset.id);
    if (!st) return;
    li.classList.remove("tap"); void li.offsetWidth; li.classList.add("tap");
    tapStation(st);
    if (isMobile()) { setSheet("peek"); setTimeout(() => focus(st), 120); }
    else focus(st);
  });

  // ======================================================
  // Player
  // ======================================================
  function setStatus(text, isError) {
    $("pStatus").textContent = text;
    $("nStatus").textContent = text;
    $("nStatus").classList.toggle("error", !!isError);
    $("player").classList.toggle("error", !!isError);
  }

  function stopEngine() {
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function setPlayIcons() {
    const icon = audio.paused ? ICON.play : ICON.pause;
    for (const id of ["pToggle", "nToggle"]) {
      const b = $(id);
      if (b.dataset.state !== String(audio.paused)) {
        b.dataset.state = String(audio.paused);
        b.innerHTML = icon;
        b.classList.remove("swap"); void b.offsetWidth; b.classList.add("swap");
      }
    }
  }

  function updatePlayingUI() {
    document.querySelectorAll(".list li.playing").forEach((li) => li.classList.remove("playing"));
    if (current) document.querySelector(`.list li[data-id="${CSS.escape(current.id)}"]`)?.classList.add("playing");
    const live = !!current && !audio.paused;
    $("player").classList.toggle("live", live);
    $("now").classList.toggle("live", live);
    $("dial").classList.toggle("stream", live && current?.num == null);
    setPlayIcons();
    setPlayingFeature();
    refreshPopup();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = live ? "playing" : "paused";
  }

  let hlsPromise = null;
  function loadHls() {
    return (hlsPromise ||= new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
      sc.onload = resolve;
      sc.onerror = () => { hlsPromise = null; reject(); };
      document.head.appendChild(sc);
    }));
  }

  let stallTimer = 0, needsTap = false;
  function showExternal(st) {
    const url = st && st.insecureUrl;
    for (const id of ["pExt", "nExt"]) {
      const a = $(id);
      if (url) a.href = url; else a.removeAttribute("href");
      a.hidden = !url;
    }
    $("nExtBox").hidden = !url;
    $("player").classList.toggle("external", !!url);
  }

  function playStream(st, idx) {
    stopEngine();
    clearTimeout(stallTimer);
    needsTap = false;
    showExternal(null);
    const s = st.streams[idx];
    if (!s) {
      if (st.insecureUrl) {
        // Every in-page option failed or was blocked: offer the browser's own player.
        setStatus(st.external ? "Plays in your browser's player" : "Tap Play ↗ to listen");
        showExternal(st);
        if (!st.external && current === st) toast("This station plays in your browser. Tap Play ↗", 4000);
      } else {
        setStatus("Off air", true);
        if (current === st) toast("This station seems off air right now. Try another one.", 3500);
      }
      updatePlayingUI();
      return;
    }
    st._idx = idx;
    setStatus(idx > 0 ? `Retuning ${idx}…` : "Tuning…");
    const tryNext = () => { if (current === st && st._idx === idx) { clearTimeout(stallTimer); playStream(st, idx + 1); } };
    // Some streams never answer and never error (common on mobile data): move on after 12 s.
    stallTimer = setTimeout(() => {
      if (current === st && st._idx === idx && !needsTap && (audio.paused || audio.readyState < 3)) tryNext();
    }, 12000);

    const start = () => audio.play().catch((e) => {
      if (e.name === "NotAllowedError") { needsTap = true; setStatus("Tap play"); }
      else if (e.name !== "AbortError") tryNext();
    });
    audio.onerror = tryNext;
    reportClick(st);

    // HLS: Safari plays it natively; elsewhere hls.js is fetched only when a station needs it.
    if (s.hls && !audio.canPlayType("application/vnd.apple.mpegurl")) {
      loadHls().then(() => {
        if (current !== st || st._idx !== idx) return;
        if (!window.Hls || !Hls.isSupported()) return tryNext();
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) tryNext(); });
        hls.loadSource(s.url);
        hls.attachMedia(audio);
        start();
      }, tryNext);
      return;
    }
    audio.src = s.url;
    start();
  }

  function togglePlay() {
    if (!current) return;
    if (audio.paused) playStream(current, current._idx || 0); // reconnect at the live edge
    else audio.pause();
  }

  function play(st) {
    if (current === st) { if (audio.paused) togglePlay(); return; }
    current = st;

    $("player").hidden = false;
    $("sheet").classList.add("has-player");
    $("pArt").outerHTML = readoutHtml(st, "small").replace('class="readout', 'id="pArt" class="readout');
    $("pName").textContent = st.name;
    $("pMeta").textContent = [freqFull(st) || st.band, st.where].filter(Boolean).join(" · ");

    // Now Playing screen
    $("nName").textContent = st.name;
    $("nMeta").textContent = [st.band === "Online" ? "Online stream" : st.band, st.where].join(" · ");
    $("nTags").textContent = st.tags;
    const site = $("nSite");
    if (st.homepage) { site.href = st.homepage; site.classList.remove("off"); } else { site.removeAttribute("href"); site.classList.add("off"); }
    const art = $("nArt");
    const artTag = `<span class="art-tag">${st.num != null ? freqFull(st) : st.band === "Online" ? "Online stream" : st.band}</span>`;
    art.className = "now-art " + (st.favicon ? "has-logo" : "has-radio");
    art.innerHTML = (st.favicon
      ? `<img src="${esc(st.favicon)}" alt="${esc(st.name)} logo" referrerpolicy="no-referrer">`
      : `<img src="${RADIO_IMG.lg}" alt="">`) + artTag;
    const img = art.querySelector("img");
    img.onerror = () => { img.onerror = null; art.className = "now-art has-radio"; img.src = RADIO_IMG.lg; };
    tuneDial(st);
    document.title = `▶ ${st.name} · FilRadio`;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: st.name,
        artist: [freqFull(st) || "Online", st.where].join(" · "),
        album: "FilRadio",
        artwork: [
          ...(st.favicon ? [{ src: st.favicon, sizes: "256x256" }] : []),
          { src: RADIO_IMG.lg, sizes: "512x512", type: "image/webp" },
        ],
      });
    }
    playStream(st, 0);
    updatePlayingUI();
  }

  audio.addEventListener("playing", () => { clearTimeout(stallTimer); setStatus("Live"); updatePlayingUI(); });
  audio.addEventListener("waiting", () => setStatus("Buffering…"));
  audio.addEventListener("pause", updatePlayingUI);

  $("pToggle").addEventListener("click", togglePlay);
  $("nToggle").addEventListener("click", togglePlay);
  $("pVolume").addEventListener("input", (e) => (audio.volume = +e.target.value));
  audio.volume = +$("pVolume").value;
  $("pLocate").addEventListener("click", () => current && focus(current));
  $("pOpen").addEventListener("click", () => {
    if (!current) return;
    if (isMobile()) openNow(); else focus(current);
  });
  $("nLocate").addEventListener("click", () => {
    if (!current) return;
    closeNow(); setSheet("peek");
    setTimeout(() => focus(current), 200);
  });
  let lastStep = 0;
  const step = (d) => {
    if (Date.now() - lastStep < 400) return; // don't open a burst of stream connections
    lastStep = Date.now();
    const pool = visible.length ? visible : stations;
    if (!pool.length) return;
    const i = current ? pool.indexOf(current) : -1;
    play(pool[(i + d + pool.length) % pool.length]);
  };
  $("nPrev").addEventListener("click", () => step(-1));
  $("nNext").addEventListener("click", () => step(1));

  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => togglePlay());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("stop", () => audio.pause());
    try { ms.setActionHandler("previoustrack", () => step(-1)); ms.setActionHandler("nexttrack", () => step(1)); } catch {}
  }

  // Tuning dial (signature element in Now Playing)
  const TICK = 12;
  function tuneDial(st) {
    const scale = $("dialScale");
    let html = "", idx = 0;
    if (st.band === "FM" || (st.band !== "AM" && st.num == null)) {
      let at = 0;
      for (let f = 870; f <= 1080; f += 2) {
        const mhz = f / 10, major = f % 20 === 0, mid = f % 10 === 0;
        html += `<i class="t ${major ? "major" : mid ? "mid" : ""}">${major ? `<span>${mhz}</span>` : ""}</i>`;
        if (st.num != null && Math.abs(mhz - st.num) < 0.11 && !at) at = idx;
        idx++;
      }
      scale.style.transform = `translateX(${-(at || Math.round(idx / 2)) * TICK}px)`;
    } else {
      let at = 0;
      for (let k = 530; k <= 1700; k += 10) {
        const major = k % 100 === 0, mid = k % 50 === 0;
        html += `<i class="t ${major ? "major" : mid ? "mid" : ""}">${major ? `<span>${k}</span>` : ""}</i>`;
        if (st.num != null && Math.abs(k - st.num) <= 5 && !at) at = idx;
        idx++;
      }
      scale.style.transform = `translateX(${-(at || Math.round(idx / 2)) * TICK}px)`;
    }
    scale.innerHTML = html;
  }

  // ======================================================
  // Mobile app shell: bottom sheet, tabs, Now Playing
  // ======================================================
  const sheet = $("sheet");
  let sheetState = "half";
  let nowOpen = false;

  function sheetY(state) {
    const H = sheet.clientHeight;
    return state === "full" ? 0 : state === "half" ? Math.round(H * 0.5) : H - 74;
  }
  function setSheet(state) {
    if (!isMobile()) return;
    sheetState = state;
    sheet.style.setProperty("--sheet-y", sheetY(state) + "px");
    syncTabs();
  }
  function syncTabs() {
    const active = nowOpen ? "now" : sheetState === "peek" ? "map" : "list";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === active));
  }
  function openNow() {
    if (!current) { toast("Tap any station to start listening"); return; }
    if (nowOpen) return;
    nowOpen = true;
    $("now").classList.add("open");
    $("now").setAttribute("aria-hidden", "false");
    history.pushState({ now: 1 }, "");
    syncTabs();
  }
  function closeNow(fromPop) {
    if (!nowOpen) return;
    nowOpen = false;
    $("now").classList.remove("open");
    $("now").setAttribute("aria-hidden", "true");
    if (!fromPop && history.state?.now) history.back();
    syncTabs();
  }
  addEventListener("popstate", () => closeNow(true));
  $("nowClose").addEventListener("click", () => closeNow());

  $("tabbar").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    if (navigator.vibrate) navigator.vibrate(8);
    if (tab.dataset.tab === "now") return openNow();
    closeNow();
    setSheet(tab.dataset.tab === "map" ? "peek" : "full");
  });

  // Drag the sheet by its grip
  (() => {
    const grip = $("sheetGrip");
    let startY = 0, startOff = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
    grip.addEventListener("pointerdown", (e) => {
      // Let buttons inside the grip (Install, Unplaced switch) receive their own taps:
      // capturing the pointer here would redirect their click to the grip.
      if (!isMobile() || e.target.closest(".toggle, button, a, input, label")) return;
      dragging = true; startY = lastY = e.clientY; lastT = performance.now();
      startOff = sheetY(sheetState);
      sheet.classList.add("dragging");
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const now = performance.now();
      vel = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY; lastT = now;
      const y = Math.min(Math.max(0, startOff + e.clientY - startY), sheetY("peek"));
      sheet.style.setProperty("--sheet-y", y + "px");
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      const moved = e.clientY - startY;
      if (Math.abs(moved) < 6) { // tap on grip toggles
        setSheet(sheetState === "full" ? "half" : sheetState === "half" ? "full" : "half");
        return;
      }
      const y = startOff + moved;
      const order = ["full", "half", "peek"];
      let target = order.reduce((best, s) => (Math.abs(sheetY(s) - y) < Math.abs(sheetY(best) - y) ? s : best), "half");
      if (vel > 0.6) target = order[Math.min(2, order.indexOf(sheetState) + 1)];
      if (vel < -0.6) target = order[Math.max(0, order.indexOf(sheetState) - 1)];
      setSheet(target);
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  })();

  addEventListener("resize", () => { if (isMobile()) setSheet(sheetState); });
  mq.addEventListener("change", () => { if (isMobile()) setSheet("half"); else sheet.style.removeProperty("--sheet-y"); });

  // ======================================================
  // Search & filters
  // ======================================================
  const searchBox = $("searchBox");
  const search = $("search");
  let debounce;
  search.addEventListener("input", () => {
    if (search.value) nearMe = null;
    searchBox.classList.toggle("has-text", !!search.value);
    clearTimeout(debounce);
    if (search.value) {
      $("sidebar").classList.add("open");
      if (isMobile() && sheetState !== "full") setSheet("full");
    }
    debounce = setTimeout(() => { query = search.value.trim().toLowerCase(); render(); }, 140);
  });
  search.addEventListener("focus", () => {
    searchBox.classList.add("focused");
    if (isMobile()) { closeNow(); setSheet("full"); }
  });
  search.addEventListener("blur", () => searchBox.classList.remove("focused"));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { search.blur(); if (visible[0] && query) { $("list").querySelector("li[data-id]")?.click(); } }
    if (e.key === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); search.blur(); }
  });
  $("searchClear").addEventListener("mousedown", (e) => e.preventDefault()); // keep focus
  $("searchClear").addEventListener("click", () => { search.value = ""; search.dispatchEvent(new Event("input")); search.focus(); });
  $("searchBack").addEventListener("click", () => { search.blur(); setSheet("half"); });

  // Near me (device location, only on tap)
  $("nearMe").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Location isn't available on this device");
    const btn = $("nearMe");
    if (btn.classList.contains("busy")) return;
    btn.classList.add("busy");
    navigator.geolocation.getCurrentPosition((pos) => {
      btn.classList.remove("busy");
      const { latitude: lat, longitude: lng } = pos.coords;
      nearMe = { key: `me:${lat.toFixed(2)},${lng.toFixed(2)}`, label: "you", lat, lng };
      search.value = ""; query = "";
      searchBox.classList.remove("has-text");
      $("sidebar").classList.add("open");
      if (isMobile()) setSheet("half");
      render();
      if (!visible.some((st) => st.dist <= AREA_KM)) toast(`No stations within ${AREA_KM} km, showing the nearest ones`);
    }, () => {
      btn.classList.remove("busy");
      toast("Allow location access to find stations near you");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 });
  });

  // Rotating hints
  let hintI = 0;
  setInterval(() => {
    if (search.value || document.activeElement === search || reduceMotion) return;
    const el = $("hintText");
    el.className = "out";
    setTimeout(() => {
      hintI = (hintI + 1) % HINTS.length;
      el.textContent = HINTS[hintI];
      el.className = "in";
    }, 330);
  }, 3200);

  $("bandChips").addEventListener("click", (e) => {
    const b = e.target.closest(".band");
    if (!b) return;
    document.querySelectorAll(".band").forEach((c) => { c.classList.toggle("active", c === b); c.setAttribute("aria-selected", c === b); });
    band = b.dataset.band;
    render();
  });
  $("showUnknown").addEventListener("change", render);
  $("sheetToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));

  // ======================================================
  // Install (PWA)
  // ======================================================
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const mobileInstall = $("installBtn").cloneNode(true);
  mobileInstall.id = "installBtnM";
  mobileInstall.classList.add("in-sheet");
  document.querySelector(".sheet-title").insertBefore(mobileInstall, $("listCount").nextSibling);

  // Install buttons are always offered (except inside the installed app). Browsers with a built-in
  // prompt (Chrome, Edge, Samsung) get it directly; others (iPhone/iPad, Safari, Firefox) get the guide.
  $("installBtn").hidden = !!standalone;
  mobileInstall.hidden = !!standalone;
  const nativePrompt = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    installEvt = null;
    if (outcome === "accepted") toast("FilRadio installed. Find it on your home screen.");
  };
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  for (const btn of [$("installBtn"), mobileInstall]) {
    btn.addEventListener("click", () => (installEvt ? nativePrompt() : window.FilGuide?.open()));
  }
  $("howInstall").addEventListener("click", (e) => { e.preventDefault(); window.FilGuide?.open({ canPrompt: !!installEvt, onPrompt: nativePrompt }); });
  addEventListener("appinstalled", () => { $("installBtn").hidden = true; mobileInstall.hidden = true; });

  // OFWs and Filipinos abroad: a warm welcome once a week (streams work from any country).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz && tz !== "Asia/Manila" && guard.allow("ofw", 7 * 24 * 60 * 60 * 1000)) {
      setTimeout(() => toast("Kumusta, kabayan! Listen to home radio wherever you are.", 5000), 4500);
    }
  } catch {}

  // ======================================================
  // Visitor counter (Abacus, free & keyless). One "hit" per device per day; never counts localhost.
  // ======================================================
  (async () => {
    const el = $("visits");
    const T = window.FilTraffic;
    const dev = /^(localhost|127\.|\[::1\])/.test(location.hostname) || location.protocol === "file:";
    const action = !dev && guard.allow("visit", 24 * 60 * 60 * 1000) ? "hit" : "get";
    // Traffic source report (see stats.html): +1 on "where from", "PH or abroad" and "device" counters,
    // only when this visit is counted. Read before tidyUrl() strips the tracking parameters.
    if (T && action === "hit") {
      for (const k of [`src-${T.classify()}`, `loc-${T.place()}`, `dev-${T.device()}`, `os-${T.system()}`]) {
        fetch(`${T.COUNTER}/hit/${T.NS}/${k}`).catch(() => {});
      }
    }
    T?.tidyUrl();
    try {
      const res = await fetch(`https://abacus.jasoncameron.dev/${action}/webtarsier-filradio/visits`);
      if (!res.ok) return;
      const { value } = await res.json();
      if (typeof value === "number") {
        el.querySelector("b").textContent = value.toLocaleString();
        el.hidden = false;
      }
    } catch {}
  })();

  // ======================================================
  // Boot
  // ======================================================
  setPlayIcons();
  if (isMobile()) requestAnimationFrame(() => setSheet("half"));

  (async () => {
    try {
      stations = build(await loadRaw());
      stations.forEach((s) => byId.set(s.id, s));
      const c = (b) => stations.filter((s) => s.band === b).length;
      const placed = stations.filter((s) => !s.unknown).length;
      $("summary").textContent = `${stations.length} stations · Luzon to Mindanao`;
      render();
    } catch (e) {
      console.error(e);
      $("summary").textContent = "Offline — can't reach radio-browser.info";
      $("list").innerHTML = `<li class="empty">Couldn't load stations. Check your connection and reload.</li>`;
    }
  })();
})();
