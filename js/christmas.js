// FilRadio Christmas mode: string lights on top, light snow, Santa's sleigh flying by,
// and twinkling lights around the station that is playing on the map.
// On from Sept 1 to Jan 6 (the Pinoy "ber months"). ?xmas=1 / ?xmas=0 forces it; the
// "Christmas effects" switch in the map type menu turns it off for this browser.
(() => {
  "use strict";
  const KEY = "filradio.xmas";
  const q = /[?&]xmas=([01])/.exec(location.search);
  const d = new Date();
  const season = d.getMonth() >= 8 || (d.getMonth() === 0 && d.getDate() <= 6);
  if (!(q ? q[1] === "1" : season)) return;

  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch {}
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => matchMedia("(max-width: 760px)").matches;
  const COLORS = ["#ff4d4d", "#ffc93c", "#3ddc84", "#4da3ff", "#ff7ad9"];
  const root = document.documentElement;

  // ---------- String lights across the top ----------
  function garland() {
    const el = document.createElement("div");
    el.className = "xmas-garland";
    el.setAttribute("aria-hidden", "true");
    const n = Math.ceil(Math.max(innerWidth, screen.width || 0, 1920) / 34) + 1; // wide enough for any resize
    let wire = "M0 4", bulbs = "";
    for (let i = 0; i < n; i++) {
      const x = i * 34, mid = x + 17;
      wire += ` Q${mid} 16 ${x + 34} 4`;
      const c = COLORS[i % COLORS.length];
      bulbs += `<g class="xb" style="--c:${c};--d:${(i % 5) * 0.37}s" transform="translate(${mid} 10)">` +
        `<rect x="-2.2" y="0" width="4.4" height="3.4" rx="1" fill="#2b3a2e"/>` +
        `<ellipse cx="0" cy="8" rx="4" ry="5.6" fill="${c}"/></g>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${n * 34} 26" width="${n * 34}" height="26" preserveAspectRatio="xMinYMin meet">` +
      `<path d="${wire}" fill="none" stroke="#1f3a28" stroke-width="1.6"/>${bulbs}</svg>`;
    return el;
  }

  // ---------- Snow ----------
  function snow() {
    const cv = document.createElement("canvas");
    cv.className = "xmas-snow";
    cv.setAttribute("aria-hidden", "true");
    const g = cv.getContext("2d");
    let W = 0, H = 0, dpr = 1, flakes = [], raf = 0, last = 0;
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = phone() ? 28 : 55;
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.4,
        v: 0.25 + Math.random() * 0.6, w: Math.random() * Math.PI * 2,
      }));
    };
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // ~30 fps is plenty for snow
      last = t;
      g.clearRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,.85)";
      for (const f of flakes) {
        f.y += f.v; f.w += 0.02; f.x += Math.sin(f.w) * 0.35;
        if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; }
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
      }
    };
    size();
    addEventListener("resize", size);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && on) raf = requestAnimationFrame(frame);
    });
    raf = requestAnimationFrame(frame);
    cv.stop = () => cancelAnimationFrame(raf);
    cv.start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    return cv;
  }

  // ---------- Santa's sleigh ----------
  // Drawn facing right: reindeer lead, the sleigh follows. Flipped with CSS for right-to-left flights.
  const REINDEER = (x, y, lead) => `<g transform="translate(${x} ${y})"><g class="deer${lead ? " lead" : ""}">
      <path class="leg back" d="M16 44 L8 58 L1 66" stroke="url(#xDeerDark)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="leg back b2" d="M20 46 L14 60 L9 69" stroke="url(#xDeerDark)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="leg front" d="M44 44 L56 52 L64 49" stroke="url(#xDeerDark)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="leg front f2" d="M48 45 L58 57 L66 57" stroke="url(#xDeerDark)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 38 C8 28 22 26 34 28 C44 29 52 32 54 39 C56 47 48 53 35 53 C22 54 9 50 8 38Z" fill="url(#xDeer)"/>
      <ellipse cx="34" cy="49" rx="13" ry="4" fill="#e8d3b8" opacity=".75"/>
      <path d="M9 33 q-6 -4 -5 2 q3 3 6 1z" fill="#f4ece0"/>
      <path d="M44 33 C48 25 53 18 58 14 L65 19 C60 27 56 35 52 41Z" fill="url(#xDeer)"/>
      <path d="M56 12 C60 8 68 9 73 15 C75 18 73 21 69 21 L62 21 C58 20 55 16 56 12Z" fill="#8a5a3b"/>
      <path d="M58 10 l-6 -5 l4 7z" fill="#6b4428"/>
      <g stroke="#d9c39a" stroke-width="2" stroke-linecap="round" fill="none">
        <path d="M60 9 C58 1 54 -4 48 -7 M55 0 L50 0 M58 3 L55 -3"/>
        <path d="M63 8 C64 0 62 -5 59 -9 M63 1 L67 -3"/>
      </g>
      <circle cx="64" cy="13.5" r="1.3" fill="#1b1209"/>
      <circle class="${lead ? "rudolph" : ""}" cx="73.5" cy="17" r="${lead ? 3 : 2}" fill="${lead ? "#ff2d2d" : "#2a1a0f"}"/>
      <path d="M46 31 C50 36 52 42 50 47" stroke="#b3202b" stroke-width="4" fill="none"/>
      <circle cx="51" cy="44" r="2.6" fill="url(#xGold)"/>
      <path d="M22 29 C24 38 24 46 22 52" stroke="#b3202b" stroke-width="3.4" fill="none"/>
    </g></g>`;
  function santa() {
    const el = document.createElement("div");
    el.className = "xmas-santa";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<svg viewBox="-30 -14 350 120" width="230" height="79">
      <defs>
        <linearGradient id="xDeer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8754e"/><stop offset=".6" stop-color="#8a5a3b"/><stop offset="1" stop-color="#5e3b24"/></linearGradient>
        <linearGradient id="xDeerDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4428"/><stop offset="1" stop-color="#2a1a0f"/></linearGradient>
        <linearGradient id="xRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef3b3b"/><stop offset=".55" stop-color="#c1121f"/><stop offset="1" stop-color="#780000"/></linearGradient>
        <linearGradient id="xGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#e0b43a"/><stop offset="1" stop-color="#9c7414"/></linearGradient>
        <radialGradient id="xSack" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#b98a5a"/><stop offset="1" stop-color="#6e4b2a"/></radialGradient>
        <radialGradient id="xSkin" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#ffd9bd"/><stop offset="1" stop-color="#e9a983"/></radialGradient>
      </defs>
      <g class="sparkles" fill="#fff6c8">
        <circle cx="-22" cy="70" r="1.6"/><circle cx="-12" cy="58" r="1.2"/><circle cx="-26" cy="50" r="1"/>
        <circle cx="-6" cy="78" r="1.3"/><circle cx="-16" cy="84" r="1"/><path d="M-4 64 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z"/>
      </g>
      <g class="team">
        <path d="M110 50 Q150 70 186 60 M190 58 Q232 68 280 56" stroke="#5a2a14" stroke-width="1.4" fill="none"/>
        <path d="M118 74 Q150 80 168 70" stroke="#c9a227" stroke-width="1.6" fill="none"/>
        ${REINDEER(140, 20, false)}${REINDEER(236, 14, true)}
      </g>
      <g class="sleigh">
        <path d="M2 98 L98 98 C116 98 124 88 118 79 C113 72 104 78 110 84" stroke="url(#xGold)" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path d="M22 86 v12 M50 88 v10 M80 88 v10" stroke="url(#xGold)" stroke-width="2.6"/>
        <path d="M12 54 C0 46 2 26 16 20 C26 16 40 17 46 26 C52 36 50 48 44 54Z" fill="url(#xSack)"/>
        <path d="M18 22 C26 26 36 26 42 22" stroke="#5a3a1f" stroke-width="2" fill="none"/>
        <rect x="17" y="8" width="15" height="15" rx="2" fill="#2a9d55" transform="rotate(-10 25 15)"/>
        <path d="M24.5 8 v15 M17 15.5 h15" stroke="#ffd166" stroke-width="2" transform="rotate(-10 25 15)"/>
        <rect x="30" y="4" width="12" height="18" rx="2" fill="#3a7bd5" transform="rotate(8 36 13)"/>
        <path d="M36 4 v18" stroke="#fff" stroke-width="2" transform="rotate(8 36 13)"/>
        <path d="M58 58 C56 42 62 32 74 32 C86 32 93 42 92 58Z" fill="url(#xRed)"/>
        <rect x="58" y="50" width="34" height="5" rx="2" fill="#1d1d1d"/><rect x="72" y="49" width="7" height="7" rx="1" fill="none" stroke="url(#xGold)" stroke-width="1.6"/>
        <path d="M84 40 C92 42 100 46 106 48" stroke="url(#xRed)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <circle cx="103" cy="47.5" r="3.6" fill="#f4f4f4"/><circle cx="108" cy="49" r="3.4" fill="#1d1d1d"/>
        <circle cx="80" cy="22" r="7.5" fill="url(#xSkin)"/>
        <circle cx="84" cy="20" r="1" fill="#2b1a10"/><circle cx="86.5" cy="23" r="1.8" fill="#e98b7a"/>
        <path d="M72 24 C72 34 78 40 86 40 C90 38 90 30 88 26 C84 28 78 28 72 24Z" fill="#fafafa"/>
        <path d="M72 18 C70 6 80 2 88 10 C82 6 72 8 66 20 L72 20Z" fill="url(#xRed)"/>
        <circle class="pom" cx="64" cy="22" r="3.4" fill="#fafafa"/>
        <path d="M71 18 C76 14 84 14 89 18" stroke="#fafafa" stroke-width="4.6" stroke-linecap="round" fill="none"/>
        <path d="M2 54 C-2 50 0 44 6 46 C10 47 10 52 6 54 L104 54 C112 54 116 48 114 44 C120 44 122 52 118 60 C114 76 106 88 92 88 L26 88 C12 88 4 76 2 54Z" fill="url(#xRed)"/>
        <path d="M6 54 L104 54" stroke="url(#xGold)" stroke-width="3" stroke-linecap="round"/>
        <path d="M20 66 C34 76 54 76 70 66 C80 74 96 74 104 66" stroke="url(#xGold)" stroke-width="1.6" fill="none" opacity=".85"/>
        <path d="M14 80 C40 84 80 84 108 76" stroke="#5c0000" stroke-width="2" fill="none" opacity=".5"/>
      </g>
    </svg>`;
    return el;
  }
  let santaTimer = 0;
  function flySanta(el) {
    if (!on || document.hidden) return schedule(el);
    const ltr = Math.random() < 0.5;
    el.classList.remove("fly", "rtl");
    el.style.setProperty("--y", `${(phone() ? 0 : 6) + Math.random() * 10}vh`);
    if (!ltr) el.classList.add("rtl");
    void el.offsetWidth;
    el.classList.add("fly");
    schedule(el);
  }
  function schedule(el) {
    clearTimeout(santaTimer);
    santaTimer = setTimeout(() => flySanta(el), 25000 + Math.random() * 25000);
  }

  // ---------- Lights around the playing station on the map ----------
  let marker = null, ringEl = null;
  function ring() {
    const el = document.createElement("div");
    el.className = "xmas-ring";
    el.setAttribute("aria-hidden", "true");
    const N = 14, R = 36;
    let html = '<div class="xr-spin">';
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      html += `<i style="--c:${COLORS[i % COLORS.length]};--d:${(i % 4) * 0.3}s;left:${50 + Math.cos(a) * R}px;top:${50 + Math.sin(a) * R}px"></i>`;
    }
    html += '</div><span class="xr-star">★</span>';
    el.innerHTML = html;
    return el;
  }
  // Called by app.js whenever the playing station or play state changes.
  function mapLights(map, st, live) {
    if (!window.maplibregl || !map) return;
    if (!on || !st || st.lng == null || st.lat == null) {
      marker?.remove(); marker = null;
      return;
    }
    if (!marker) {
      ringEl = ring();
      // The pin stands on the point (about 50px tall), so centre the lights on its body.
      marker = new maplibregl.Marker({ element: ringEl, anchor: "center", offset: [0, -26], pitchAlignment: "viewport" });
    }
    marker.setLngLat([st.lng, st.lat]);
    if (!marker._map) marker.addTo(map);
    ringEl.classList.toggle("live", !!live);
  }
  let lastArgs = null;

  // ---------- Switch ----------
  let parts = null;
  function mount() {
    if (parts) return;
    parts = { garland: garland(), snow: reduceMotion ? null : snow(), santa: reduceMotion ? null : santa() };
    for (const p of Object.values(parts)) if (p) document.body.appendChild(p);
    if (parts.santa) {
      parts.santa.addEventListener("animationend", () => parts?.santa?.classList.remove("fly"));
      santaTimer = setTimeout(() => flySanta(parts.santa), 3000);
    }
  }
  function unmount() {
    if (!parts) return;
    clearTimeout(santaTimer);
    parts.snow?.stop();
    for (const p of Object.values(parts)) p?.remove();
    parts = null;
  }
  function set(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? "on" : "off"); } catch {}
    root.classList.toggle("xmas", v);
    v ? mount() : unmount();
    if (lastArgs) mapLights(...lastArgs);
  }

  window.FilXmas = {
    mapLights(map, st, live) { lastArgs = [map, st, live]; mapLights(map, st, live); },
    set,
    get on() { return on; },
  };

  const start = () => {
    root.classList.toggle("xmas", on);
    if (on) mount();
    const sw = document.getElementById("xmasToggle");
    if (sw) {
      sw.closest("label").hidden = false;
      sw.checked = on;
      sw.addEventListener("change", () => set(sw.checked));
    }
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
