// FilRadio mini player (embed.html): runs inside an iframe on partner sites, opened by widget.js.
// Favorites-first: the stations people saved show up top, then Popular, then All (search).
// Station grouping, band detection and stream fallback mirror js/app.js (kept small: no map, no places).
//
// URL options (all optional): ?ref=partner  &tagline=Short text  &theme=light|dark|auto  &layout=full|compact|bar  &widget=1
// ?export=1 is the pop-up that copies favorites from filradio.xyz into the player (see importFavs).
(() => {
  "use strict";

  const DATA_URL = "data/stations.json";
  const CACHE_KEY = "filradio.stations.v3"; // same cache format as the main app
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const FAV_KEY = "filradio.favs";          // same key and format as the main app
  const TAB_KEY = "filradio.embed.tab";
  const RADIO_IMG = "icons/radio-128.webp";
  const SECURE = location.protocol === "https:";
  const LIST_MAX = 150;

  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- Theme ----------
  const theme = q.get("theme") || "auto";
  const setDark = (on) => document.documentElement.classList.toggle("dark", on);
  if (theme === "dark") setDark(true);
  else if (theme === "auto") {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    mq.addEventListener?.("change", (e) => setDark(e.matches));
  }

  // ---------- Export pop-up: runs on filradio.xyz as a normal tab, so it can read the saved favorites ----------
  if (q.get("export") === "1") {
    const favs = store.get(FAV_KEY, []);
    const n = Array.isArray(favs) ? favs.length : 0;
    document.body.innerHTML = `<div class="export"><div>
      <img src="icon.svg" alt="" width="48" height="48">
      <p><b>${n ? `Sending ${n} favorite${n > 1 ? "s" : ""} to your player…` : "No favorites saved on FilRadio in this browser yet."}</b></p>
      ${n ? "" : `<p class="note">Open <a href="./" target="_blank" rel="noopener">filradio.xyz</a>, tap ♡ on stations you like, then try again.</p>`}
    </div></div>`;
    if (n && window.opener) {
      window.opener.postMessage({ type: "filradio-favs", favs }, location.origin);
      setTimeout(() => window.close(), 1200);
    }
    return;
  }

  // ---------- Partner options ----------
  const layout = ["compact", "bar"].includes(q.get("layout")) ? q.get("layout") : "full";
  document.body.classList.add(`layout-${layout}`);
  // In a pop-up or modal (widget.js), a close button hands "close" back to the host page; the radio keeps playing.
  if (q.get("close") === "1" && window.parent !== window) {
    $("closeBtn").hidden = false;
    $("closeBtn").addEventListener("click", () => window.parent.postMessage({ type: "filradio-close" }, "*"));
  }
  const ref = (q.get("ref") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  const tagline = clean(q.get("tagline")).slice(0, 60);
  if (tagline) $("tagline").textContent = tagline;
  const full = new URL("https://filradio.xyz/");
  full.searchParams.set("utm_source", ref || "widget");
  full.searchParams.set("utm_medium", "widget");
  $("fullLink").href = full.href;
  const getW = new URL("https://filradio.xyz/widget.html");
  getW.searchParams.set("utm_source", ref || "widget");
  getW.searchParams.set("utm_medium", "widget");
  $("getWidget").href = getW.href;

  // ---------- Band detection (same rules as js/app.js) ----------
  function classify(name, tags) {
    const text = `${name} ${tags}`;
    const dec = text.match(/\b(8[7-9]|9\d|10[0-8])[.,]\d\b/);
    if (dec) return { band: "FM", num: +dec[0].replace(",", ".") };
    if ((/\b(DZRH|DZBB|DZMM|DZAS|DZRV|DWIZ|DZRB|DZXL|DZME|DZEC|DWWW|DZAR|DZRJ|DZRM|DWAD|DZSR|DZIQ|DWBL|DXRB|DYRC|DYLA|DXMF)\b/i.test(name) && !/\bfm\b/i.test(name))
        || /\b(Bombo Radyo|Aksyon Radyo|Super Radyo|RMN|Radyo Patrol|Radyo Pilipinas|Radyo Agong)\b/i.test(name)) {
      const m = text.match(/\b(\d{3,4})\b/);
      return { band: "AM", num: m && +m[1] >= 531 && +m[1] <= 1611 ? +m[1] : null };
    }
    const fmWord = /\bfm\b|\d\s*fm\b|fm\d/i.test(text);
    const amWord = /\bam\b|\d\s*am\b|\bkhz\b/i.test(text);
    for (const m of text.matchAll(/\b(\d{3,4})\b/g)) {
      const n = +m[1];
      if (!amWord && n >= 875 && n <= 1079 && n % 2 === 1) return { band: "FM", num: n / 10 };
      if (!fmWord && n >= 531 && n <= 1611 && n % 9 === 0) return { band: "AM", num: n };
    }
    return { band: fmWord ? "FM" : amWord ? "AM" : "Online", num: null };
  }
  const freq = (st) => (st.num == null ? "" : st.band === "FM" ? `${st.num.toFixed(1)} FM` : `${st.num} AM`);

  // ---------- Data ----------
  async function loadRaw() {
    const cached = store.get(CACHE_KEY, null);
    if (cached && Date.now() - cached.t < CACHE_TTL) return cached.d;
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const { d, checked } = await res.json();
      store.set(CACHE_KEY, { t: Date.now(), d, c: checked || null });
      return d;
    } catch (e) {
      if (cached) return cached.d;
      throw e;
    }
  }

  function build(raw) {
    const byKey = new Map();
    for (const s of raw) {
      const key = norm(s.n);
      if (!s.url || !key) continue;
      let st = byKey.get(key);
      if (!st) {
        const name = clean(s.n), tags = clean(s.t);
        st = { key, name, ...classify(name, tags), genre: (tags.split(",")[0] || "").trim(), state: clean(s.st),
               logo: safeUrl(s.f), votes: 0, onAir: null, streams: [] };
        byKey.set(key, st);
      }
      st.votes += s.v || 0;
      if (s.on === 1) st.onAir = true; else if (s.on === 0 && st.onAir !== true) st.onAir = false;
      if (!st.logo && s.f) st.logo = safeUrl(s.f);
      if (!st.state && s.st) st.state = clean(s.st);
      st.streams.push({ url: s.url, hls: !!s.h || /\.m3u8(\?|$)/i.test(s.url), bitrate: s.b || 0, ok: s.ok || 0 });
    }
    const out = [];
    for (const st of byKey.values()) {
      st.streams.sort((a, b) => (b.url.startsWith("https") - a.url.startsWith("https")) || (b.ok - a.ok) || (b.bitrate - a.bitrate));
      // https pages can't play http audio: use https links, then try http hosts over https.
      if (SECURE) {
        const up = st.streams.filter((x) => x.url.startsWith("http:") && !/^http:\/\/(\d+\.\d+\.\d+\.\d+|\[)/.test(x.url))
          .map((x) => ({ ...x, url: "https:" + x.url.slice(5) }));
        st.streams = [...st.streams.filter((x) => x.url.startsWith("https:")), ...up];
      }
      if (!st.streams.length) continue; // only plays in the browser's own player: leave it to the full site
      st.meta = [freq(st) || st.band, st.state || st.genre].filter(Boolean).join(" · ");
      st.hay = `${st.name} ${st.genre} ${st.state} ${st.band} ${freq(st)}`.toLowerCase();
      out.push(st);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }

  // ---------- State ----------
  let stations = [], byKey = new Map(), popular = [];
  let favs = new Set(store.get(FAV_KEY, []));
  let tab = store.get(TAB_KEY, null) || (favs.size ? "favs" : "popular");
  if (layout === "compact" && tab === "all") tab = favs.size ? "favs" : "popular";
  let current = null, hls = null, stallTimer = 0;
  const audio = $("audio");

  // ---------- List ----------
  const logoHtml = (st, cls) => `<span class="${cls}"><img src="${esc(st.logo || RADIO_IMG)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  const favHtml = (st) => {
    const on = favs.has(st.key);
    return `<button type="button" class="fav" data-fav="${esc(st.key)}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Save to"} favorites"><svg class="i"><use href="#i-heart"/></svg></button>`;
  };

  function render() {
    const query = $("q").value.trim().toLowerCase();
    let rows;
    if (tab === "favs") rows = stations.filter((st) => favs.has(st.key));
    else if (tab === "popular") rows = popular;
    else rows = query ? stations.filter((st) => query.split(/\s+/).every((w) => st.hay.includes(w))) : stations;

    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $("searchBox").hidden = tab !== "all";
    $("favCount").textContent = favs.size ? String(favs.size) : "";
    $("empty").hidden = !(tab === "favs" && !rows.length);

    const shown = rows.slice(0, LIST_MAX);
    $("list").innerHTML = shown.map((st) => `<li data-key="${esc(st.key)}"${current === st ? ' class="playing"' : ""}>
        <button type="button" class="row" data-play="${esc(st.key)}">${logoHtml(st, "logo")}
          <span><b>${esc(st.name)}</b><small><span class="tag ${st.band}">${st.band}</span>${esc(st.meta.replace(/^(FM|AM|Online)( · )?/, ""))}</small></span>
        </button>${favHtml(st)}</li>`).join("")
      + (rows.length > LIST_MAX ? `<li class="more">Showing ${LIST_MAX} of ${rows.length}. Search to find more.</li>` : "")
      + (tab === "all" && query && !rows.length ? `<li class="more">No station matches “${esc(query)}”.</li>` : "");
  }

  function setTab(t) {
    tab = t;
    store.set(TAB_KEY, t);
    render();
    $("list").scrollTop = 0;
    if (t === "all") $("q").focus({ preventScroll: true });
  }

  function toggleFav(key) {
    if (favs.has(key)) favs.delete(key); else favs.add(key);
    store.set(FAV_KEY, [...favs]);
    if (tab === "favs") render();
    else document.querySelectorAll(`[data-fav="${CSS.escape(key)}"]`).forEach((b) => {
      const on = favs.has(key);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", `${on ? "Remove from" : "Save to"} favorites`);
    });
    $("favCount").textContent = favs.size ? String(favs.size) : "";
    syncNowFav();
  }
  function syncNowFav() {
    const b = $("nowFav");
    b.hidden = !current;
    if (!current) return;
    const on = favs.has(current.key);
    b.dataset.fav = current.key;
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "Remove from" : "Save to"} favorites`);
  }

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fav]");
    if (f) return toggleFav(f.dataset.fav);
    const p = e.target.closest("[data-play]");
    if (p) return play(byKey.get(p.dataset.play));
    const t = e.target.closest(".tabs button");
    if (t) return setTab(t.dataset.tab);
  });
  $("q").addEventListener("input", render);
  // Broken station logos fall back to the radio artwork.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && !img.src.endsWith(RADIO_IMG)) img.src = RADIO_IMG;
  }, true);

  // ---------- Playback ----------
  function setStatus(text, err) {
    $("nowStatus").textContent = text;
    $("now").classList.toggle("error", !!err);
  }
  function stopEngine() {
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  let hlsPromise = null;
  const loadHls = () => (hlsPromise ||= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
    sc.onload = resolve;
    sc.onerror = () => { hlsPromise = null; reject(); };
    document.head.appendChild(sc);
  }));

  function playStream(st, idx) {
    stopEngine();
    clearTimeout(stallTimer);
    const s = st.streams[idx];
    if (!s) { setStatus("Off air right now. Try another station.", true); updateUI(); return; }
    st._idx = idx;
    setStatus(idx > 0 ? "Trying another link…" : "Tuning in…");
    const tryNext = () => { if (current === st && st._idx === idx) { clearTimeout(stallTimer); playStream(st, idx + 1); } };
    stallTimer = setTimeout(() => { if (current === st && st._idx === idx && (audio.paused || audio.readyState < 3)) tryNext(); }, 12000);
    const start = () => audio.play().catch((e) => {
      if (e.name === "NotAllowedError") { clearTimeout(stallTimer); setStatus("Tap play to listen"); }
      else if (e.name !== "AbortError") tryNext();
    });
    audio.onerror = tryNext;
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

  function play(st) {
    if (!st) return;
    if (current === st) return togglePlay();
    current = st;
    $("nowName").textContent = st.name;
    $("art").innerHTML = `<img src="${esc(st.logo || RADIO_IMG)}" alt="" referrerpolicy="no-referrer">`;
    $("toggle").disabled = false;
    syncNowFav();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: st.name, artist: st.meta, album: "FilRadio",
        artwork: [...(st.logo ? [{ src: st.logo, sizes: "256x256" }] : []), { src: "icons/radio-512.webp", sizes: "512x512", type: "image/webp" }],
      });
    }
    playStream(st, 0);
    updateUI();
  }

  // What prev/next and a cold "play" step through: your favorites, or Popular if you have none.
  function pool() {
    const f = stations.filter((st) => favs.has(st.key));
    return f.length ? f : popular;
  }
  let lastStep = 0;
  function step(d) {
    if (Date.now() - lastStep < 400) return; // don't open a burst of stream connections
    lastStep = Date.now();
    const list = pool();
    if (!list.length) return;
    const i = current ? list.indexOf(current) : -1;
    play(list[(i + d + list.length) % list.length]);
  }
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));

  function togglePlay() {
    if (!current) return step(1);
    if (audio.paused) playStream(current, current._idx || 0); // rejoin the live edge
    else audio.pause();
  }

  function updateUI() {
    const live = !!current && !audio.paused;
    $("now").classList.toggle("live", live);
    $("toggle").innerHTML = `<svg class="i"><use href="#i-${live ? "pause" : "play"}"/></svg>`;
    $("toggle").setAttribute("aria-label", live ? "Pause" : "Play");
    document.querySelectorAll(".list li.playing").forEach((li) => li.classList.remove("playing"));
    if (current) document.querySelector(`.list li[data-key="${CSS.escape(current.key)}"]`)?.classList.add("playing");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = live ? "playing" : "paused";
    document.title = live ? `▶ ${current.name} · FilRadio` : "FilRadio Player";
    // Tell the host page (widget.js) what's on, so its button can show it while the panel is closed.
    if (window.parent !== window) window.parent.postMessage({ type: "filradio-state", playing: live, station: current ? current.name : "" }, "*");
  }

  audio.addEventListener("playing", () => { clearTimeout(stallTimer); setStatus("Live"); updateUI(); });
  audio.addEventListener("waiting", () => setStatus("Loading…"));
  audio.addEventListener("pause", updateUI);
  // Counted in FilRadio's "listening now" total (random tab id + station key, every 2 minutes).
  const live = window.FilTraffic?.liveTracker?.();
  audio.addEventListener("playing", () => { if (current) live?.playing(current.key); });
  audio.addEventListener("pause", () => live?.stopped());
  $("toggle").addEventListener("click", togglePlay);
  $("volume").addEventListener("input", (e) => (audio.volume = +e.target.value));
  audio.volume = +$("volume").value;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", togglePlay);
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    try {
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    } catch {}
  }

  // Host page controls (widget.js): { type: "filradio-cmd", cmd: "pause" | "toggle" }.
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "filradio-cmd" && e.source === window.parent) {
      if (m.cmd === "pause") audio.pause();
      else if (m.cmd === "toggle") togglePlay();
    } else if (m.type === "filradio-favs" && e.origin === location.origin && e.source === importWin && Array.isArray(m.favs)) {
      const before = favs.size;
      for (const k of m.favs) if (typeof k === "string" && k.length < 120) favs.add(k);
      store.set(FAV_KEY, [...favs]);
      setTab("favs");
      setStatus(favs.size > before ? `Added ${favs.size - before} favorite${favs.size - before > 1 ? "s" : ""}` : "Your favorites are already here");
    }
  });

  // ---------- Toast ----------
  function toast(msg, ms = 2400) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- Share ----------
  // Shares the station that's on (filradio.xyz/?station=<key> opens it there), or FilRadio itself.
  function shareData() {
    const url = new URL("https://filradio.xyz/");
    if (current) url.searchParams.set("station", current.key);
    url.searchParams.set("utm_source", "share");
    return current
      ? { title: `${current.name} on FilRadio`, text: `Listening to ${current.name} live on FilRadio 📻`, url: url.href }
      : { title: "FilRadio", text: "Philippine FM, AM and online radio, live and free 📻", url: url.href };
  }
  async function copyLink(d) {
    try { await navigator.clipboard.writeText(`${d.text} ${d.url}`); toast("Link copied"); }
    catch { window.prompt("Copy this link:", d.url); }
  }
  $("share").addEventListener("click", async () => {
    const d = shareData();
    if (layout === "bar") { // no room for the sheet in a one-row bar
      if (navigator.share) { try { await navigator.share(d); return; } catch (e) { if (e.name === "AbortError") return; } }
      return copyLink(d);
    }
    const u = encodeURIComponent(d.url), t = encodeURIComponent(`${d.text} ${d.url}`);
    $("shareTitle").textContent = current ? `Share ${current.name}` : "Share FilRadio";
    $("shFb").href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    $("shMsg").href = `fb-messenger://share/?link=${u}`;
    $("shMsg").hidden = !matchMedia("(pointer: coarse)").matches; // the Messenger app link only works on phones
    $("shViber").href = `viber://forward?text=${t}`;
    $("shWa").href = `https://wa.me/?text=${t}`;
    $("shX").href = `https://x.com/intent/post?text=${encodeURIComponent(d.text)}&url=${u}`;
    $("shCopy").onclick = () => { copyLink(d); closeShare(); };
    $("shMore").hidden = !navigator.share;
    $("shMore").onclick = () => { closeShare(); navigator.share(d).catch(() => {}); };
    $("shareSheet").hidden = false;
  });
  const closeShare = () => { $("shareSheet").hidden = true; };
  $("shareClose").addEventListener("click", closeShare);
  $("shareSheet").addEventListener("click", (e) => { if (e.target === $("shareSheet") || e.target.closest(".share-grid a")) closeShare(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeShare(); });

  // ---------- Sponsor card: auto-slides, can be slid by hand (js/sponsor.js, sponsor.json) ----------
  function loadSponsor() {
    if (layout === "bar") return;
    window.FilSponsor?.();
  }

  // ---------- Import favorites ----------
  // Inside another site's iframe the browser gives us separate storage, so hearts saved on filradio.xyz
  // aren't visible here. A small pop-up on filradio.xyz (normal storage) reads them and posts them back.
  let importWin = null;
  $("importBtn").addEventListener("click", () => {
    importWin = window.open("embed.html?export=1", "filradio-export", "popup,width=380,height=360");
    if (!importWin) setStatus("Allow pop-ups to bring your favorites", true);
  });

  // ---------- Visit counter (once per device per day, same anonymous counters as the main site) ----------
  function countVisit() {
    const T = window.FilTraffic;
    if (!T || /^(localhost|127\.)/.test(location.hostname)) return;
    const last = store.get("filradio.embed.visit", 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    store.set("filradio.embed.visit", Date.now());
    const keys = ["src-widget", `loc-${T.place()}`, `cc-${T.country()}`, `dev-${T.device()}`, `os-${T.system()}`];
    const site = hostSite();
    fetch(`${T.STATS}/hit`, { method: "POST", body: JSON.stringify(site ? { k: keys, w: site } : { k: keys }), keepalive: true }).catch(() => {});
  }

  // The website this player is embedded on (site name only, never the page address), or "" if unknown or our own.
  function hostSite() {
    try {
      const anc = location.ancestorOrigins; // Chrome, Edge, Safari: the top-most page is the last one
      const src = anc && anc.length ? anc[anc.length - 1] : document.referrer;
      const h = src ? new URL(src).hostname.toLowerCase().replace(/^www\./, "") : "";
      return h && h !== location.hostname.replace(/^www\./, "") ? h : "";
    } catch { return ""; }
  }

  // ---------- Start ----------
  loadSponsor();
  loadRaw().then((raw) => {
    stations = build(raw);
    byKey = new Map(stations.map((st) => [st.key, st]));
    popular = stations.filter((st) => st.onAir !== false).sort((a, b) => b.votes - a.votes).slice(0, 60);
    render();
    $("toggle").disabled = false;
    countVisit();
  }).catch(() => {
    $("list").innerHTML = `<li class="more">Couldn't load stations. Check your connection and reopen the player.</li>`;
  });
})();
