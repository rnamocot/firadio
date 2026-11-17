// Station rules shared by the app (js/app.js) and the SEO page builder (tools/build_pages.mjs):
// name cleanup, FM/AM/Online detection, and placing a station in a city from its name or tags.
// Needs js/places.js (window.PH_PLACES, window.PH_STATION_HOMES) loaded first.
(function (root) {
  "use strict";
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Display name: drop a " | tagline" tail, and turn ALL-CAPS names into Title Case while keeping short
  // call signs and abbreviations (DWIZ, RMN, FM) as they are.
  function tidyName(n) {
    const head = n.split(/\s+\|\s+/)[0].trim();
    if (head.length >= 3) n = head;
    if (/[A-Z]/.test(n) && n === n.toUpperCase()) {
      n = n.replace(/[A-Z][A-Z']+/g, (w) => (w.length <= 4 ? w : w[0] + w.slice(1).toLowerCase()));
    }
    return n;
  }

  // FM / AM / Online from name + tags (the directory has no band field).
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
  let placeRx = null;
  function findPlace(...texts) {
    if (!placeRx) {
      placeRx = Object.keys(root.PH_PLACES)
        .sort((a, b) => b.length - a.length)
        .map((k) => [k, new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([^a-z]|$)`, "i")]);
    }
    for (const t of texts) {
      if (!t) continue;
      for (const [k, rx] of placeRx) if (rx.test(t)) return k;
    }
    return null;
  }
  // Known home city of big networks' stations whose names don't say where they are.
  const stationHome = (name) => (root.PH_STATION_HOMES || []).find(([rx]) => rx.test(name))?.[1] || null;

  root.FilCore = { clean, norm, tidyName, classify, freqLabel, freqFull, findPlace, stationHome };
})(typeof window !== "undefined" ? window : globalThis);
