// FilRadio traffic report: reads the anonymous counters and draws simple bar lists.
(() => {
  "use strict";
  const T = window.FilTraffic;
  const $ = (id) => document.getElementById(id);

  async function get(key) {
    try {
      const res = await fetch(`${T.COUNTER}/get/${T.NS}/${key}`, { cache: "no-store" });
      if (!res.ok) return 0; // counter not created yet = 0
      const { value } = await res.json();
      return typeof value === "number" ? value : 0;
    } catch {
      return 0;
    }
  }

  function bars(el, rows, { hideZero = false } = {}) {
    const total = rows.reduce((a, r) => a + r.n, 0);
    const shown = rows.filter((r) => !hideZero || r.n > 0).sort((a, b) => b.n - a.n);
    if (!total) {
      el.innerHTML = `<li class="muted">No data yet. Counts appear after new visits.</li>`;
      return total;
    }
    const max = Math.max(...shown.map((r) => r.n), 1);
    el.innerHTML = shown.map((r) => {
      const pct = Math.round((r.n / total) * 1000) / 10;
      return `<li><div class="row"><span class="name">${r.label}</span><span class="num">${r.n.toLocaleString()}<i>${pct}%</i></span></div>
        <div class="track"><div class="fill" data-w="${(r.n / max) * 100}"></div></div></li>`;
    }).join("");
    // Widths are set via the DOM (inline style attributes are blocked by this page's CSP).
    el.querySelectorAll(".fill").forEach((f) => (f.style.width = f.dataset.w + "%"));
    return total;
  }

  async function load() {
    $("refresh").disabled = true;
    const [total, src, plc, dev, os] = await Promise.all([
      get("visits"),
      Promise.all(T.SOURCES.map(async ([k, label]) => ({ label, n: await get(`src-${k}`) }))),
      Promise.all(T.PLACES.map(async ([k, label]) => ({ label, n: await get(`loc-${k}`) }))),
      Promise.all(T.DEVICES.map(async ([k, label]) => ({ label, n: await get(`dev-${k}`) }))),
      Promise.all(T.SYSTEMS.map(async ([k, label]) => ({ label, n: await get(`os-${k}`) }))),
    ]);
    $("total").textContent = total.toLocaleString();
    const tracked = bars($("sources"), src, { hideZero: true });
    $("tracked").textContent = tracked.toLocaleString();
    bars($("places"), plc);
    bars($("devices"), dev, { hideZero: true });
    bars($("systems"), os, { hideZero: true });
    $("refresh").disabled = false;
  }

  $("refresh").addEventListener("click", load);
  load();
})();
