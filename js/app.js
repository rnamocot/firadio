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
  const PH_CENTER = [122.3, 12.1];
  const BRAND = { ink: "#10182b", sun: "#ffc93c", red: "#e63946", fm: "#2347d6", am: "#e4572e", online: "#0e9f8e", unknown: "#9aa0aa" };
  // Branded icon set lives in the SVG sprite in index.html.
  const use = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const ICON = { play: use("i-play"), pause: use("i-pause"), pin: use("i-pin"), sig: use("i-signal", "sig") };
  // Fallback artwork when a station has no logo of its own.
  const RADIO_IMG = { sm: "icons/radio-128.webp", lg: "icons/radio-512.webp" };
  const HINTS = ["Search stations, cities, genres", "Try “Bombo Radyo”", "Try “Cebu”", "Try “OPM”", "Try “Love Radio”", "Try “Davao”", "Try “news”"];

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
  let is3D = true;
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
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.t < CACHE_TTL) return cached.d;
    } catch {}
    const data = await fetchJSON("/json/stations/bycountrycodeexact/PH?hidebroken=true&order=votes&reverse=true&limit=5000");
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
      st.hay = `${st.name} ${st.tags} ${st.where} ${freqLabel(st)} ${st.band}`.toLowerCase();
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return out;
  }

  // ======================================================
  // 3D Map (MapLibre GL + OpenFreeMap + AWS terrain)
  // ======================================================
  const map = new maplibregl.Map({
    container: "map",
    style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`,
    center: PH_CENTER,
    zoom: reduceMotion ? 5 : 1.6,
    pitch: 0,
    maxPitch: 78,
    attributionControl: { compact: true },
    cooperativeGestures: false,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.on("error", (e) => console.warn("[map]", e.error?.message || e));

  map.on("style.load", () => {
    try { map.setProjection({ type: "globe" }); } catch {}
    // Start the fly-in as soon as the style is ready instead of waiting for every terrain tile.
    setTimeout(intro, 250);
  });

  // Pin images drawn on canvas — one per band, plus "playing" and "unknown".
  async function makePins() {
    try { await document.fonts.load('700 20px "JetBrains Mono"'); } catch {}
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
        g.font = '700 11px "JetBrains Mono", ui-monospace, monospace';
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

  map.on("load", async () => {
    // Terrain + hillshade
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
    map.setTerrain({ source: "dem", exaggeration: 1.5 });
    try {
      map.setSky({
        "sky-color": dark ? "#0b1020" : "#bfd6ee", "horizon-color": dark ? "#1b2440" : "#f4f1ea", "fog-color": dark ? "#0b1020" : "#f4f1ea",
        "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.5,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 7, 0.6, 10, 0],
      });
    } catch {}

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
        if (st) { play(st); showPopup(st); }
      });
    }
    map.on("click", "playing-pin", () => current && showPopup(current));

    mapReady = true;
    if (stations.length) render();
    if (current) setPlayingFeature();
  });

  let introDone = false;
  function intro() {
    if (introDone) return;
    introDone = true;
    const target = { center: PH_CENTER, zoom: isMobile() ? 4.7 : 5.4, pitch: 42, bearing: -14, padding: mapPadding() };
    if (reduceMotion) map.jumpTo(target);
    else map.flyTo({ ...target, duration: 3800, curve: 1.6, essential: true });
  }

  function mapPadding() {
    if (isMobile()) {
      const sheetTop = $("sheet").getBoundingClientRect().top;
      return { top: 140, bottom: Math.max(80, innerHeight - sheetTop + 20), left: 20, right: 20 };
    }
    const sb = $("sidebar");
    return { top: 40, bottom: $("player").hidden ? 40 : 110, left: sb.classList.contains("open") ? 400 : 40, right: 60 };
  }

  // Pulse animation for the playing pin
  let pulseT0 = performance.now();
  (function pulse(t) {
    if (mapReady && current && !audio.paused && map.getLayer("playing-pulse")) {
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
      ? `<img class="logo-img" src="${esc(st.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.className='radio-img';this.src='${RADIO_IMG.sm}'">`
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
      if (current === st) togglePlay(); else play(st);
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

  // 3D / recenter
  $("toggle3d").addEventListener("click", () => {
    is3D = !is3D;
    $("toggle3d").setAttribute("aria-pressed", String(is3D));
    $("toggle3d").querySelector(".fab-label").textContent = is3D ? "3D" : "2D";
    if (!mapReady) return;
    map.setTerrain(is3D ? { source: "dem", exaggeration: 1.5 } : null);
    if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", is3D ? "visible" : "none");
    map.easeTo({ pitch: is3D ? 55 : 0, bearing: is3D ? -14 : 0, duration: 900 });
  });
  $("recenter").addEventListener("click", () => {
    map.flyTo({ center: PH_CENTER, zoom: isMobile() ? 4.7 : 5.4, pitch: is3D ? 42 : 0, bearing: is3D ? -14 : 0, padding: mapPadding(), duration: 1800 });
  });

  // ======================================================
  // Rendering
  // ======================================================
  const byId = new Map();
  const matches = (st) => (band === "all" || st.band === band) && (!query || st.hay.includes(query));
  const toFeature = (st) => ({ type: "Feature", properties: { id: st.id, band: st.band }, geometry: { type: "Point", coordinates: [st.lng, st.lat] } });

  function render() {
    visible = stations.filter(matches);
    const showUnknown = $("showUnknown").checked;

    if (mapReady) {
      map.getSource("st").setData({ type: "FeatureCollection", features: visible.filter((s) => !s.unknown).map(toFeature) });
      map.getSource("unk").setData({ type: "FeatureCollection", features: showUnknown ? visible.filter((s) => s.unknown).map(toFeature) : [] });
    }

    const searched = query ? stations.filter((s) => s.hay.includes(query)) : stations;
    for (const b of document.querySelectorAll(".band")) {
      const n = b.dataset.band === "all" ? searched.length : searched.filter((s) => s.band === b.dataset.band).length;
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
    if (!visible.length) {
      list.innerHTML = `<li class="empty">No stations match “${esc(query)}”.</li>`;
      return;
    }
    const frag = document.createDocumentFragment();
    visible.forEach((st, i) => {
      const li = document.createElement("li");
      li.dataset.id = st.id;
      if (current === st) li.classList.add("playing");
      if (i < 18) { li.classList.add("anim"); li.style.setProperty("--i", i); }
      li.innerHTML = `${readoutHtml(st)}
        <div class="info">
          <div class="name">${esc(st.name)}</div>
          <div class="meta">${ICON.pin}<span>${esc(st.where)}${st.genre ? " · " + esc(st.genre) : ""}</span></div>
        </div>
        <span class="bars"><i></i><i></i><i></i></span>`;
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  $("list").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const st = byId.get(li.dataset.id);
    if (!st) return;
    li.classList.remove("tap"); void li.offsetWidth; li.classList.add("tap");
    play(st);
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

  function playStream(st, idx) {
    stopEngine();
    const s = st.streams[idx];
    if (!s) { setStatus("Off air", true); updatePlayingUI(); return; }
    st._idx = idx;
    setStatus(idx > 0 ? `Retuning ${idx}…` : "Tuning…");
    const tryNext = () => { if (current === st && st._idx === idx) playStream(st, idx + 1); };

    if (s.hls && window.Hls && Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) tryNext(); });
      hls.loadSource(s.url);
      hls.attachMedia(audio);
    } else {
      audio.src = s.url;
    }
    audio.onerror = tryNext;
    audio.play().catch((e) => {
      if (e.name === "NotAllowedError") setStatus("Tap play");
      else if (e.name !== "AbortError") tryNext();
    });
    fetch(`${apiHost}/json/url/${encodeURIComponent(s.id)}`).catch(() => {});
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

  audio.addEventListener("playing", () => { setStatus("Live"); updatePlayingUI(); });
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
  const step = (d) => {
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
      if (!isMobile() || e.target.closest(".toggle")) return;
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

  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    $("installBtn").hidden = false;
    mobileInstall.hidden = !isMobile();
  });
  for (const btn of [$("installBtn"), mobileInstall]) {
    btn.addEventListener("click", async () => {
      if (!installEvt) return;
      installEvt.prompt();
      const { outcome } = await installEvt.userChoice;
      installEvt = null;
      $("installBtn").hidden = true; mobileInstall.hidden = true;
      if (outcome === "accepted") toast("FilRadio installed — find it on your home screen");
    });
  }
  addEventListener("appinstalled", () => { $("installBtn").hidden = true; mobileInstall.hidden = true; });
  // iOS Safari has no install prompt: show a one-time hint.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) {
    try {
      if (!localStorage.getItem("filradio.iosHint")) {
        setTimeout(() => toast("Install: tap Share, then “Add to Home Screen”", 5000), 6000);
        localStorage.setItem("filradio.iosHint", "1");
      }
    } catch {}
  }

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
      $("summary").textContent = `${stations.length} stations · ${c("FM")} FM · ${c("AM")} AM · ${placed} pinned`;
      render();
    } catch (e) {
      console.error(e);
      $("summary").textContent = "Offline — can't reach radio-browser.info";
      $("list").innerHTML = `<li class="empty">Couldn't load stations. Check your connection and reload.</li>`;
    }
  })();
})();
