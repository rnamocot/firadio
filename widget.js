/*! FilRadio widget: Philippine radio on any website. https://filradio.xyz/  (builder: https://filradio.xyz/widget.html)
 *
 *   <script src="https://filradio.xyz/widget.js" data-ref="yoursite" defer></script>
 *
 * Options (data- attributes on the script tag, all optional):
 *   data-mode       "popover" (default): radio button in a corner, player pops up beside it
 *                   "modal":   radio button in a corner, player opens in the middle of the screen
 *                   "inline":  player sits inside your page, in the element named by data-target
 *   data-target     CSS selector for inline mode, e.g. "#radio-box"
 *   data-launcher   "pill" (default: icon + text), "icon" (round radio icon only), "none" (use your own button)
 *   data-layout     "full" (default: favorites, popular, search), "compact" (station strip), "bar" (one row)
 *   data-size       "sm", "md" (default) or "lg"; or set exact pixels with data-width / data-height
 *   data-label      launcher text (default "Radio")
 *   data-tagline    line under the FilRadio logo, e.g. "Your favorite stations while you sell"
 *   data-position   "right" (default) or "left"
 *   data-bottom     distance from the bottom in px (default 20), to clear chat boxes or nav bars
 *   data-theme      "auto" (default), "light" or "dark"
 *   data-ref        short name of your site, for FilRadio's anonymous referral count
 *
 * JavaScript API: FilRadio.open(), FilRadio.close(), FilRadio.toggle(), FilRadio.pause()
 * Event: window "filradio:state" with detail { playing, station }, e.g. to show "Now playing" in your chat header.
 *
 * The player loads only when first opened. Closing it keeps the radio playing;
 * it stops only if the page itself is closed or reloaded.
 */
(() => {
  "use strict";
  if (window.FilRadio) return;
  const me = document.currentScript;
  const cfg = (me && me.dataset) || {};
  const base = me ? new URL(".", me.src).href : "https://filradio.xyz/";
  const origin = new URL(base).origin;
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const num = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

  const mode = pick(cfg.mode, ["popover", "modal", "inline"], "popover");
  const layout = pick(cfg.layout, ["full", "compact", "bar"], mode === "inline" ? "compact" : "full");
  const size = pick(cfg.size, ["sm", "md", "lg"], "md");
  const launcher = mode === "inline" ? "none" : pick(cfg.launcher, ["pill", "icon", "none"], "pill");
  const side = cfg.position === "left" ? "left" : "right";
  const bottom = num(cfg.bottom, 0, 400) ?? 20;
  const label = (cfg.label || "Radio").slice(0, 24);
  const SIZES = {
    full: { sm: [320, 480], md: [360, 560], lg: [420, 660] },
    compact: { sm: [300, 236], md: [360, 246], lg: [440, 256] },
    bar: { sm: [300, 64], md: [380, 64], lg: [480, 64] },
  };
  const width = num(cfg.width, 240, 1200) ?? SIZES[layout][size][0];
  const height = num(cfg.height, 56, 1000) ?? SIZES[layout][size][1];
  // The sponsor box needs about 80px more in the full layout.
  const fullH = layout === "full" && !cfg.height ? height + 80 : height;

  const host = document.createElement("div");
  host.id = "filradio-widget";
  const root = host.attachShadow({ mode: "open" });
  const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 9h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm10.5 2.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5.5 12v1.5h5V12zm0 3v1.5h5V15zM6 8l10-4 .6 1.4L9.8 8z"/></svg>`;
  const anchored = `${side}: 16px; bottom: ${bottom + (launcher === "icon" ? 68 : 60)}px; transform-origin: bottom ${side};`;
  root.innerHTML = `<style>
    :host { all: initial; display: block; }
    * { box-sizing: border-box; }
    .btn {
      position: fixed; ${side}: 16px; bottom: ${bottom}px; z-index: 2147483000;
      display: flex; align-items: center; gap: 8px; max-width: min(260px, calc(100vw - 32px)); height: 48px; padding: 0 18px 0 12px;
      border: 0; border-radius: 999px; background: #10182b; color: #fff; cursor: pointer;
      font: 700 14px/1 "Archivo", ui-sans-serif, system-ui, sans-serif; box-shadow: 0 10px 28px -8px rgba(16,24,43,.55);
      transition: transform .15s;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn:focus-visible { outline: 3px solid #ffc93c; outline-offset: 2px; }
    .ico { width: 28px; height: 28px; border-radius: 50%; background: #ffc93c; color: #10182b; display: grid; place-items: center; flex: none; }
    .ico svg { width: 16px; height: 16px; }
    .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { display: none; width: 8px; height: 8px; border-radius: 50%; background: #e63946; flex: none; animation: b 1.4s infinite; }
    .live .dot { display: block; }
    @keyframes b { 50% { opacity: .25; } }
    /* Round radio icon launcher */
    .btn.round { width: 58px; height: 58px; padding: 0; justify-content: center; background: #ffc93c; color: #10182b; }
    .btn.round .ico { width: 34px; height: 34px; background: none; }
    .btn.round .ico svg { width: 30px; height: 30px; }
    .btn.round .txt { display: none; }
    .btn.round .dot { position: absolute; top: 4px; ${side === "right" ? "left" : "right"}: 4px; width: 12px; height: 12px; border: 2px solid #fff; }
    .btn.round.live::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid #ffc93c; animation: ring 1.8s infinite; }
    @keyframes ring { from { transform: scale(.9); opacity: .9; } to { transform: scale(1.25); opacity: 0; } }

    .panel {
      position: fixed; z-index: 2147483001; width: ${width}px; height: min(${fullH}px, calc(100vh - 24px));
      border-radius: ${layout === "bar" ? 16 : 20}px; overflow: hidden; background: #f4f1ea;
      box-shadow: 0 24px 60px -12px rgba(16,24,43,.45); border: 1px solid rgba(16,24,43,.08);
      opacity: 0; transform: translateY(12px) scale(.98); pointer-events: none; visibility: hidden;
      transition: opacity .18s, transform .18s, visibility 0s .18s;
    }
    .panel.open { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition-delay: 0s; }
    .popover { ${anchored} max-height: calc(100vh - ${bottom + 80}px); }
    .modal { left: 50%; top: 50%; translate: -50% -50%; }
    .back { position: fixed; inset: 0; z-index: 2147483000; background: rgba(16,24,43,.5); opacity: 0; visibility: hidden; transition: opacity .18s, visibility 0s .18s; }
    .back.open { opacity: 1; visibility: visible; transition-delay: 0s; }
    .inline { position: relative; width: 100%; max-width: ${width}px; height: ${fullH}px; opacity: 1; transform: none; pointer-events: auto;
              visibility: visible; box-shadow: none; border-radius: ${layout === "bar" ? 14 : 18}px; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
    @media (max-width: 480px) {
      .popover { left: 8px; right: 8px; width: auto; }
      .modal { width: calc(100vw - 16px); }
    }
    @media (prefers-reduced-motion: reduce) { .panel, .btn, .back { transition: none; } }
  </style>
  ${mode === "modal" ? `<div class="back"></div>` : ""}
  <div class="panel ${mode}" part="panel" ${mode === "inline" ? "" : `role="dialog" aria-label="FilRadio player"`}></div>
  <button class="btn ${launcher === "icon" ? "round" : ""}" part="button" type="button" aria-expanded="false" title="Listen to Philippine radio">
    <span class="ico">${ICON}</span><span class="dot"></span><span class="txt"></span>
  </button>`;

  const btn = root.querySelector(".btn");
  const panel = root.querySelector(".panel");
  const back = root.querySelector(".back");
  const txt = root.querySelector(".txt");
  if (launcher === "none") btn.style.display = "none";

  let frame = null, isOpen = false, state = { playing: false, station: "" };
  const paint = () => {
    btn.classList.toggle("live", state.playing);
    txt.textContent = isOpen ? "Hide" : state.playing && state.station ? state.station : label;
    btn.setAttribute("aria-expanded", String(isOpen));
    btn.setAttribute("aria-label", isOpen ? "Hide radio player" : state.playing ? `Now playing ${state.station}. Open radio player` : "Open radio player");
    btn.title = state.playing && state.station ? `Now playing: ${state.station}` : "Listen to Philippine radio";
  };

  function ensureFrame() {
    if (frame) return;
    const src = new URL("embed.html", base);
    src.searchParams.set("widget", "1");
    src.searchParams.set("layout", layout);
    if (mode !== "inline") src.searchParams.set("close", "1"); // the player shows its own close button
    for (const k of ["ref", "tagline", "theme"]) if (cfg[k]) src.searchParams.set(k, cfg[k]);
    frame = document.createElement("iframe");
    frame.src = src.href;
    frame.title = "FilRadio player";
    frame.allow = "autoplay; encrypted-media; web-share; clipboard-write";
    panel.appendChild(frame);
  }
  const api = {
    open() {
      ensureFrame(); isOpen = true;
      panel.classList.add("open"); back?.classList.add("open"); paint();
    },
    close() { // the radio keeps playing
      if (mode === "inline") return;
      isOpen = false;
      panel.classList.remove("open"); back?.classList.remove("open"); paint();
      if (mode === "modal") btn.focus({ preventScroll: true });
    },
    toggle() { isOpen ? api.close() : api.open(); },
    pause() { frame?.contentWindow?.postMessage({ type: "filradio-cmd", cmd: "pause" }, origin); },
    get playing() { return state.playing; },
    get station() { return state.station; },
  };

  btn.addEventListener("click", api.toggle);
  back?.addEventListener("click", api.close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) api.close(); });
  window.addEventListener("message", (e) => {
    if (e.origin !== origin || !frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (m && m.type === "filradio-close") return api.close();
    if (!m || m.type !== "filradio-state") return;
    state = { playing: !!m.playing, station: String(m.station || "").slice(0, 80) };
    paint();
    window.dispatchEvent(new CustomEvent("filradio:state", { detail: { ...state } }));
  });

  paint();
  window.FilRadio = api;
  const mount = () => {
    const target = mode === "inline" && cfg.target ? document.querySelector(cfg.target) : null;
    if (mode === "inline" && !target) { console.warn("FilRadio widget: data-target not found:", cfg.target); return; }
    (target || document.body).appendChild(host);
    if (mode === "inline") api.open();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
