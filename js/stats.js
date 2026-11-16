// FilRadio traffic report: reads the anonymous counters and draws simple bar lists.
(() => {
  "use strict";
  const T = window.FilTraffic;
  const $ = (id) => document.getElementById(id);

  // One request for the whole report (cached for a minute at Cloudflare).
  async function fetchAll() {
    const res = await fetch(`${T.STATS}/stats`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).counts || {};
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
    let c;
    try {
      c = await fetchAll();
    } catch {
      $("sources").innerHTML = `<li class="muted">Couldn't load the stats right now. Tap Refresh to try again.</li>`;
      $("refresh").disabled = false;
      return;
    }
    const rows = (list, p) => list.map(([k, label]) => ({ label, n: c[`${p}-${k}`] || 0 }));
    const total = c.visits || 0;
    const src = rows(T.SOURCES, "src"), plc = rows(T.PLACES, "loc"), dev = rows(T.DEVICES, "dev");
    const os = rows(T.SYSTEMS, "os"), cc = rows(T.COUNTRIES, "cc");
    $("total").textContent = total.toLocaleString();
    const tracked = bars($("sources"), src, { hideZero: true });
    $("tracked").textContent = tracked.toLocaleString();
    bars($("places"), plc);
    bars($("devices"), dev, { hideZero: true });
    bars($("systems"), os, { hideZero: true });
    bars($("countries"), cc, { hideZero: true });
    $("refresh").disabled = false;
  }

  $("refresh").addEventListener("click", load);
  load();
})();
