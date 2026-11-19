// FilRadio sky: the map follows the time of day in the Philippines (morning, noon, afternoon,
// evening, night). The weather is "Auto" (random, changes every so often) unless the listener
// picks one in the map type menu: sunny, cloudy, rainy, stormy, windy or typhoon (or off).
// Purely for looks: drawn over the map, under the buttons and panels, taps pass through.
// ?wx=<weather> and ?tod=<time of day> force a sky (for testing).
(() => {
  "use strict";
  const KEY = "filradio.wx";
  // w = how often Auto picks it
  const WEATHER = {
    sunny: { e: "☀️", night: "🌙", label: "Sunny", nightLabel: "Clear", w: 32 },
    cloudy: { e: "⛅", night: "☁️", label: "Cloudy", w: 24 },
    rainy: { e: "🌧️", label: "Rainy", w: 20 },
    stormy: { e: "⛈️", label: "Stormy", w: 8 },
    windy: { e: "🍃", label: "Windy", w: 12 },
    typhoon: { e: "🌀", label: "Typhoon", w: 4 },
  };
  const TODS = ["morning", "noon", "afternoon", "evening", "night"];
  const qs = new URLSearchParams(location.search);
  const forceWx = WEATHER[qs.get("wx")] ? qs.get("wx") : "";
  const forceTod = TODS.includes(qs.get("tod")) ? qs.get("tod") : "";

  // Saved choice: "auto", "off" or one of the weathers
  let pick = "auto";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "off" || WEATHER[v]) pick = v;
  } catch {}
  if (forceWx) pick = forceWx;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const phone = () => matchMedia("(max-width: 760px)").matches;
  const root = document.documentElement;
  const RAINY = { rainy: 1, stormy: 1, typhoon: 1 };

  // Hour in the Philippines, wherever the listener is.
  function phHour() {
    try {
      return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(new Date())) % 24;
    } catch { return new Date().getHours(); }
  }
  function timeOfDay() {
    if (forceTod) return forceTod;
    const h = phHour();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 13) return "noon";
    if (h >= 13 && h < 17) return "afternoon";
    if (h >= 17 && h < 19) return "evening";
    return "night";
  }
  function randomWeather(not) {
    const list = Object.entries(WEATHER).filter(([k]) => k !== not);
    let r = Math.random() * list.reduce((s, [, v]) => s + v.w, 0);
    for (const [k, v] of list) { if ((r -= v.w) < 0) return k; }
    return list[0][0];
  }

  let weather = WEATHER[pick] ? pick : randomWeather();
  let tod = timeOfDay();
  const describe = () => {
    const w = WEATHER[weather];
    const night = tod === "night";
    const word = night && w.nightLabel ? w.nightLabel : w.label;
    return { icon: night && w.night ? w.night : w.e, text: `${word} ${tod}` };
  };

  // ---------- Layer ----------
  let el = null, cv = null, g = null, raf = 0, last = 0, W = 0, H = 0, parts = [], flashT = 0, bolt = null, gust = 0;
  function build() {
    el = document.createElement("div");
    el.className = "wx";
    el.setAttribute("aria-hidden", "true");
    let stars = "";
    for (let i = 0; i < 46; i++) {
      // Fixed pseudo-random spots so they don't jump around between visits
      const x = (i * 37.7) % 100, y = (i * 23.3) % 62, s = 1 + (i % 3) * 0.6;
      stars += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${s}px;height:${s}px;--d:${(i % 7) * 0.45}s"></i>`;
    }
    el.innerHTML = `<div class="wx-tint"></div><div class="wx-stars">${stars}</div>` +
      `<div class="wx-sun"><span class="wx-rays"></span><span class="wx-disc"></span></div>` +
      `<div class="wx-moon"><span></span></div>` +
      `<div class="wx-clouds"></div>` +
      `<canvas class="wx-fx"></canvas><div class="wx-flash"></div>`;
    const box = el.querySelector(".wx-clouds");
    for (let n = 1; n <= 5; n++) {
      const c = document.createElement("div");
      c.className = `wx-cloud c${n}`;
      c.append(cloudArt(n));
      box.append(c);
    }
    cv = el.querySelector("canvas");
    g = cv.getContext("2d");
    (document.querySelector(".map-wrap") || document.body).appendChild(el);
  }

  // A soft, realistic cumulus cloud painted once: many fuzzy puffs in a domed shape, bright
  // on top and grey underneath. Colours for storms, night and dusk come from CSS filters.
  function cloudArt(n) {
    const w = 420, h = 200, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    let s = n * 9301 + 49297; // seeded so each cloud keeps its own shape
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const base = h * 0.78;
    for (let i = 0; i < 70; i++) {
      const t = r();
      const px = w * (0.12 + t * 0.76);
      const dome = Math.sin(t * Math.PI); // taller in the middle
      const py = base - r() * dome * h * 0.5 - 8;
      const pr = 18 + r() * 34 * (0.5 + dome * 0.7);
      const gr = x.createRadialGradient(px - pr * 0.2, py - pr * 0.25, pr * 0.1, px, py, pr);
      gr.addColorStop(0, "rgba(255,255,255,.95)");
      gr.addColorStop(0.55, "rgba(250,251,255,.75)");
      gr.addColorStop(1, "rgba(245,247,252,0)");
      x.fillStyle = gr;
      x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    }
    // Finer wisps around the edges so it isn't one smooth blob
    for (let i = 0; i < 60; i++) {
      const t = r();
      const px = w * (0.08 + t * 0.84);
      const py = base - r() * Math.sin(t * Math.PI) * h * 0.62 - 4;
      const pr = 6 + r() * 14;
      const gr = x.createRadialGradient(px, py, 1, px, py, pr);
      gr.addColorStop(0, "rgba(255,255,255,.6)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gr;
      x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    }
    // Shade the underside, then a soft highlight on top
    x.globalCompositeOperation = "source-atop";
    const sh = x.createLinearGradient(0, h * 0.25, 0, h);
    sh.addColorStop(0, "rgba(255,255,255,0)");
    sh.addColorStop(0.6, "rgba(150,160,182,.35)");
    sh.addColorStop(1, "rgba(110,120,145,.6)");
    x.fillStyle = sh; x.fillRect(0, 0, w, h);
    const hi = x.createRadialGradient(w * 0.45, h * 0.2, 4, w * 0.45, h * 0.2, w * 0.4);
    hi.addColorStop(0, "rgba(255,255,255,.5)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = hi; x.fillRect(0, 0, w, h);
    return c;
  }

  function size() {
    if (!el) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = el.clientWidth || innerWidth; H = el.clientHeight || innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  // How hard it rains and blows: drops (desktop), drop speed, slant, wind streaks, leaves (desktop)
  const FX = {
    rainy: { drops: 140, v: [9, 16], slant: 0.18 },
    stormy: { drops: 230, v: [13, 21], slant: 0.32, streaks: 4 },
    windy: { streaks: 16, leaves: 10 },
    typhoon: { drops: 300, v: [16, 25], slant: 0.75, streaks: 22, leaves: 14 },
  };
  function seed() {
    parts = [];
    const f = FX[weather];
    if (!f) return;
    const k = phone() ? 0.5 : 1;
    for (let i = 0; i < Math.round((f.drops || 0) * k); i++) parts.push(drop(true));
    for (let i = 0; i < Math.round((f.streaks || 0) * k); i++) parts.push(streak(true));
    for (let i = 0; i < Math.round((f.leaves || 0) * k); i++) parts.push(leaf(true));
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const drop = (any) => { const v = FX[weather]?.v || [9, 16]; return { k: "d", x: rnd(-W * 0.3, W + 60), y: any ? Math.random() * H : rnd(-40, 0), l: rnd(10, 24), v: rnd(v[0], v[1]) }; };
  const streak = (any) => ({ k: "s", x: any ? Math.random() * W : -200, y: Math.random() * H, l: rnd(60, 180), v: rnd(7, 13) * (weather === "typhoon" ? 2 : 1), a: rnd(0.12, 0.3), ph: Math.random() * 6 });
  const LEAF = ["#5aa845", "#7cbf4a", "#c9a227", "#9bc53d"];
  const leaf = (any) => ({ k: "l", x: any ? Math.random() * W : -20, y: Math.random() * H, v: rnd(3, 6) * (weather === "typhoon" ? 2.2 : 1), r: Math.random() * 6, vr: rnd(0.05, 0.13), ph: Math.random() * 6, c: LEAF[(Math.random() * LEAF.length) | 0], s: rnd(4, 7) });

  // A jagged lightning bolt from the top of the map
  function makeBolt() {
    let x = rnd(W * 0.15, W * 0.85), y = 0;
    const pts = [[x, y]], end = rnd(H * 0.35, H * 0.65);
    while (y < end) { y += rnd(18, 42); x += rnd(-28, 28); pts.push([x, y]); }
    const branch = pts.slice(2 + ((Math.random() * (pts.length - 3)) | 0)).slice(0, 4).map(([bx, by], i) => [bx + i * rnd(10, 22), by + i * 6]);
    return { pts, branch, life: 1 };
  }
  function drawBolt() {
    if (!bolt) return;
    const line = (pts, w) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineWidth = w; g.stroke(); };
    g.save();
    g.globalAlpha = Math.max(0, bolt.life);
    g.strokeStyle = "rgba(255,255,240,.95)";
    g.shadowColor = "rgba(180,200,255,.95)"; g.shadowBlur = 18;
    line(bolt.pts, 2.6);
    line(bolt.branch, 1.4);
    g.restore();
    bolt.life -= 0.12;
    if (bolt.life <= 0) bolt = null;
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return; // ~30 fps
    last = t;
    g.clearRect(0, 0, W, H);
    const dim = tod === "night" || tod === "evening" || root.classList.contains("dark");
    const f = FX[weather] || {};
    // Typhoon gusts: the rain angle sways
    gust += 0.03;
    const slant = (f.slant || 0) + (weather === "typhoon" ? Math.sin(gust) * 0.35 : 0);
    g.strokeStyle = dim ? "rgba(190,210,255,.45)" : "rgba(70,95,140,.45)";
    g.lineWidth = weather === "rainy" ? 1.2 : 1.4;
    g.beginPath();
    for (const p of parts) {
      if (p.k !== "d") continue;
      p.y += p.v; p.x += p.v * slant;
      if (p.y > H || p.x > W + 80) Object.assign(p, drop(false));
      g.moveTo(p.x, p.y); g.lineTo(p.x - p.l * slant, p.y - p.l);
    }
    g.stroke();
    for (const p of parts) {
      if (p.k === "s") {
        p.ph += 0.05; p.x += p.v;
        if (p.x - p.l > W) Object.assign(p, streak(false));
        const y = p.y + Math.sin(p.ph) * 6;
        g.strokeStyle = dim ? `rgba(220,230,255,${p.a})` : `rgba(255,255,255,${p.a + 0.25})`;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(p.x - p.l, y); g.quadraticCurveTo(p.x - p.l / 2, y - 6, p.x, y); g.stroke();
      } else if (p.k === "l") {
        p.ph += 0.05; p.x += p.v; p.y += Math.sin(p.ph) * 1.4; p.r += p.vr;
        if (p.x > W + 20) Object.assign(p, leaf(false));
        g.save(); g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.c;
        g.beginPath(); g.ellipse(0, 0, p.s * 1.6, p.s * 0.7, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    drawBolt();
  }
  function startFx() {
    cancelAnimationFrame(raf);
    g?.clearRect(0, 0, W, H);
    if (!el || document.hidden || reduceMotion.matches) return;
    if (FX[weather]) raf = requestAnimationFrame(frame);
  }
  // Thunder: a flash of light (and a bolt in storms and typhoons). Never with "reduce motion".
  const THUNDER = { rainy: [25e3, 50e3], stormy: [4e3, 11e3], typhoon: [8e3, 18e3] };
  function thunder() {
    clearTimeout(flashT);
    const gap = THUNDER[weather];
    if (!el || !gap || reduceMotion.matches) return;
    flashT = setTimeout(() => {
      if (!document.hidden) {
        el.classList.remove("flash", "rumble"); void el.offsetWidth;
        el.classList.add("flash");
        if (weather !== "rainy") { bolt = makeBolt(); el.classList.add("rumble"); }
      }
      thunder();
    }, rnd(gap[0], gap[1]));
  }

  function apply() {
    if (!el) return;
    el.className = `wx wx-${weather} wx-${tod}${RAINY[weather] ? " wx-wet" : ""}`;
    root.classList.toggle("wx-rain", !!RAINY[weather]); // hides the Christmas snow while it rains
    bolt = null;
    seed();
    startFx();
    thunder();
    updateMenu();
  }

  // ---------- Weather button + menu (right-hand button column) ----------
  const CHOICES = [["auto", "🎲", "Auto (random)"], ...Object.entries(WEATHER).map(([k, v]) => [k, v.e, v.label]), ["off", "🚫", "Off"]];
  function updateMenu() {
    const d = describe();
    const ico = document.getElementById("wxIco");
    if (ico) ico.textContent = pick === "off" ? "🌤️" : d.icon;
    const lbl = document.getElementById("wxLbl");
    if (lbl) lbl.textContent = pick === "off" ? "Weather" : (tod === "night" && WEATHER[weather].nightLabel) || WEATHER[weather].label;
    document.getElementById("wxBtn")?.setAttribute("title", pick === "off" ? "Weather: off" : `Weather: ${d.text}`);
    const now = document.getElementById("wxNow");
    if (now) now.textContent = pick === "off" ? "Weather effects are off" : `Now: ${d.icon} ${d.text}`;
    document.querySelectorAll("#wxMenu [data-wx]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.wx === pick)));
  }
  function menuOpen(v) {
    const m = document.getElementById("wxMenu"), b = document.getElementById("wxBtn");
    if (!m || !b) return;
    m.hidden = !v;
    b.setAttribute("aria-expanded", String(v));
  }
  function setupMenu() {
    const m = document.getElementById("wxMenu"), b = document.getElementById("wxBtn");
    if (!m || !b) return;
    for (const [k, e, label] of CHOICES) {
      const o = document.createElement("button");
      o.type = "button";
      o.dataset.wx = k;
      o.innerHTML = `<span class="wx-e" aria-hidden="true">${e}</span>`;
      o.append(label);
      m.append(o);
    }
    // Let the click bubble so the map type menu and credits close when this one opens
    b.addEventListener("click", () => menuOpen(m.hidden));
    m.addEventListener("click", (e) => {
      e.stopPropagation();
      const o = e.target.closest("[data-wx]");
      if (o) { choose(o.dataset.wx); menuOpen(false); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".wx-wrap")) menuOpen(false); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menuOpen(false); });
  }

  let changeT = 0;
  function scheduleChange() {
    clearTimeout(changeT);
    if (pick !== "auto") return;
    // Auto: a new random weather every 8 to 15 minutes
    changeT = setTimeout(() => { weather = randomWeather(weather); apply(); scheduleChange(); }, rnd(8, 15) * 60e3);
  }
  // The time of day follows the clock in the Philippines
  setInterval(() => { const t = timeOfDay(); if (t !== tod) { tod = t; apply(); } }, 60e3);

  function mount() {
    if (!el) { build(); size(); }
    apply();
    scheduleChange();
  }
  function unmount() {
    cancelAnimationFrame(raf);
    clearTimeout(flashT); clearTimeout(changeT);
    el?.remove(); el = null;
    root.classList.remove("wx-rain");
    updateMenu();
  }
  function choose(v) {
    pick = v === "off" || WEATHER[v] ? v : "auto";
    try { localStorage.setItem(KEY, pick); } catch {}
    if (pick === "off") return unmount();
    weather = WEATHER[pick] ? pick : randomWeather(weather);
    mount();
  }

  addEventListener("resize", () => { if (el) size(); });
  document.addEventListener("visibilitychange", startFx);
  reduceMotion.addEventListener?.("change", () => { startFx(); thunder(); });

  window.FilWeather = { choose, get now() { return { pick, weather, tod, ...describe() }; } };

  const start = () => {
    if (pick !== "off") mount();
    // Say once what the sky is, after the splash is gone (not on ?shot screenshots)
    if (pick !== "off" && !/[?&]shot(=|&|$)/.test(location.search)) setTimeout(() => {
      const t = document.getElementById("toast");
      if (!t || t.classList.contains("show") || !el) return;
      const d = describe();
      t.textContent = `${d.icon} ${d.text[0].toUpperCase()}${d.text.slice(1)} in the Philippines`;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 3200);
    }, 6000);
    setupMenu();
    updateMenu();
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
