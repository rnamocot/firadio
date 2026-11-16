// widget.html: pick widget options, see the real widget on this page, copy the snippet.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("opts");
  const SRC = new URL("widget.js", location.href).href.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//, "https://filradio.xyz/");
  const LOCAL_SRC = new URL("widget.js", location.href).href; // the preview uses this server's copy
  const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function options() {
    const f = new FormData(form);
    const o = {
      mode: f.get("mode"), launcher: f.get("launcher"), layout: f.get("layout"), size: f.get("size"),
      position: f.get("position"), theme: f.get("theme"),
      tagline: String(f.get("tagline") || "").trim(), label: String(f.get("label") || "").trim(),
      ref: String(f.get("ref") || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
    };
    if (o.mode === "inline") { o.launcher = "none"; o.target = "#filradio-box"; }
    return o;
  }

  // Only attributes that differ from the widget's defaults go into the snippet.
  function dataAttrs(o) {
    const d = {};
    if (o.mode !== "popover") d.mode = o.mode;
    if (o.target) d.target = o.target;
    if (o.mode !== "inline" && o.launcher !== "pill") d.launcher = o.launcher;
    if (o.layout !== (o.mode === "inline" ? "compact" : "full")) d.layout = o.layout;
    if (o.size !== "md") d.size = o.size;
    if (o.mode !== "inline" && o.position !== "right") d.position = o.position;
    if (o.theme !== "auto") d.theme = o.theme;
    if (o.tagline) d.tagline = o.tagline;
    if (o.label && o.launcher === "pill") d.label = o.label;
    if (o.ref) d.ref = o.ref;
    return d;
  }

  function code(o) {
    const d = dataAttrs(o);
    const lines = Object.entries(d).map(([k, v]) => `\n        data-${k}="${attr(v)}"`).join("");
    const box = o.mode === "inline" ? `<div id="filradio-box"></div>\n\n` : "";
    return `${box}<script src="${SRC}"${lines}\n        defer></script>`;
  }

  // Rebuild the live widget on this page with the chosen options (the widget allows one per page).
  function preview(o) {
    document.getElementById("filradio-widget")?.remove();
    document.querySelector("script[data-fr-preview]")?.remove();
    delete window.FilRadio;
    const stage = $("stage");
    stage.classList.toggle("has-inline", o.mode === "inline");
    stage.innerHTML = o.mode === "inline" ? `<div id="filradio-box"></div>`
      : o.launcher === "none" ? `<button type="button" class="copy" id="ownBtn">📻 Your own button</button>`
      : "The radio button is in the corner of this page. Tap it.";
    $("ownBtn")?.addEventListener("click", () => window.FilRadio?.toggle());
    const s = document.createElement("script");
    s.src = LOCAL_SRC + "?p=" + Date.now(); // fresh run each time
    s.dataset.frPreview = "";
    for (const [k, v] of Object.entries(dataAttrs(o))) s.dataset[k] = v;
    document.body.appendChild(s);
  }

  function update() {
    const o = options();
    $("launcherSet").hidden = o.mode === "inline";
    $("positionSet").hidden = o.mode === "inline";
    $("labelField").hidden = o.mode === "inline" || o.launcher !== "pill";
    $("code").textContent = code(o);
    $("apiBox").hidden = o.launcher !== "none" || o.mode === "inline";
    $("where").innerHTML = o.mode === "inline"
      ? "Put the <code>&lt;div&gt;</code> where the player should appear, and the script just before <code>&lt;/body&gt;</code>."
      : "Paste it just before <code>&lt;/body&gt;</code>.";
    preview(o);
  }

  let t = 0;
  form.addEventListener("change", update);
  form.addEventListener("input", (e) => { if (e.target.type === "text" || !e.target.type) { clearTimeout(t); t = setTimeout(update, 500); } });
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("code").textContent); $("copy").textContent = "Copied ✓"; }
    catch { $("copy").textContent = "Select the code and copy it"; }
    setTimeout(() => ($("copy").textContent = "Copy code"), 2000);
  });
  update();
})();
