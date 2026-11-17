// Sponsor card, shared by the main site (index.html) and the embedded player (embed.html).
// Items in sponsor.json slide on their own every 7 seconds; visitors can also slide by hand
// with the arrows, the dots or a swipe. "on": false hides the card.
// Auto-slide pauses while the pointer is on the card, while it has focus, and while the tab is hidden.
// The first item shown changes daily (midnight Philippine time) so every sponsor gets first views.
window.FilSponsor = function (opts = {}) {
  const $ = (id) => document.getElementById(id);
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const box = $("sponsor");
  if (!box) return;
  const HOLD = 7000;

  (async () => {
    try {
      const res = await fetch(`sponsor.json?h=${Math.floor(Date.now() / 3600e3)}`);
      if (!res.ok) return;
      const sp = await res.json();
      const items = (Array.isArray(sp.items) ? sp.items : [])
        .filter((x) => x && /^https:\/\//i.test(x.url || "") && clean(x.name))
        .map((x) => ({
          name: clean(x.name).slice(0, 60),
          text: clean(x.text).slice(0, 120),
          btn: clean(x.button || "Visit").slice(0, 16),
          url: x.url,
          image: /^https:\/\//i.test(x.image || "") ? x.image : "",
        }));
      if (!sp.on || !items.length) return;

      const img = $("spImg"), go = $("spGo"), nav = $("spNav");
      const body = box.querySelector(".sc-body, .sp-body");
      const still = matchMedia("(prefers-reduced-motion: reduce)");
      $("spLabel").textContent = clean(sp.label || "Today's Sponsor").slice(0, 40);
      img.addEventListener("error", () => { img.hidden = true; });
      let cur = Math.floor((Date.now() + 8 * 3600e3) / 864e5) % items.length;
      let dots = [];

      function render(i) {
        const it = items[i];
        $("spName").textContent = it.name;
        $("spText").textContent = it.text;
        $("spText").hidden = !it.text;
        go.textContent = it.btn;
        go.href = it.url;
        go.setAttribute("aria-label", `${it.btn} ${it.name} (sponsor, opens in a new tab)`);
        if (it.image) { img.hidden = false; img.src = it.image; } else { img.hidden = true; img.removeAttribute("src"); }
        dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i)));
      }

      // Fade/slide out, swap the content, slide back in. A newer slide cancels an older one.
      let step = 0;
      function show(i, dir) {
        i = (i + items.length) % items.length;
        if (i === cur) return;
        cur = i;
        const t = ++step;
        const dx = still.matches || !body.animate ? 0 : 14 * dir;
        if (!body.animate) { render(i); return; }
        body.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-dx}px)` }], { duration: 160, easing: "ease-in", fill: "forwards" })
          .finished.then(() => {
            if (t !== step) return;
            render(i);
            body.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: "ease-out", fill: "forwards" });
          }).catch(() => {});
      }

      // Auto-slide
      let timer = 0, hover = false, focus = false;
      function schedule() {
        clearTimeout(timer);
        if (items.length < 2 || hover || focus || document.hidden) return;
        timer = setTimeout(() => { show(cur + 1, 1); schedule(); }, HOLD);
      }
      box.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hover = true; schedule(); } });
      box.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hover = false; schedule(); } });
      box.addEventListener("focusin", () => { focus = true; schedule(); });
      box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget)) { focus = false; schedule(); } });
      document.addEventListener("visibilitychange", schedule);

      // Manual: arrows and dots (only when there is more than one sponsor)
      if (items.length > 1 && nav) {
        const btn = (cls, label, html, fn) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = cls; b.setAttribute("aria-label", label); b.innerHTML = html;
          b.addEventListener("click", () => { fn(); schedule(); });
          return b;
        };
        const prev = btn("sp-arrow", "Previous sponsor", "&lsaquo;", () => show(cur - 1, -1));
        const next = btn("sp-arrow", "Next sponsor", "&rsaquo;", () => show(cur + 1, 1));
        dots = items.map((it, k) => btn("sp-dot", `Show sponsor ${k + 1} of ${items.length}: ${it.name}`, "", () => show(k, k > cur ? 1 : -1)));
        nav.replaceChildren(prev, ...dots, next);
        nav.hidden = false;
        for (const it of items) if (it.image) { const p = new Image(); p.referrerPolicy = "no-referrer"; p.src = it.image; }

        // Swipe left/right. A swipe never counts as a tap on the Visit button.
        let x0 = null, y0 = 0, swiped = false;
        box.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; swiped = false; });
        box.addEventListener("pointerup", (e) => {
          if (x0 === null) return;
          const dx = e.clientX - x0, dy = e.clientY - y0;
          x0 = null;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); schedule(); }
        });
        box.addEventListener("pointercancel", () => { x0 = null; });
        box.addEventListener("click", (e) => { if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; } }, true);
      }

      go.addEventListener("click", () => opts.onClick?.(items[cur].name));
      render(cur);
      box.hidden = false;
      schedule();
    } catch {}
  })();
};
