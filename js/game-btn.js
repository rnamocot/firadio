// Play button for the mini game: loads js/game.js on the first tap only, so the game costs nothing until it's used.
(() => {
  const btn = document.getElementById("gameBtn"), dlg = document.getElementById("gameDlg");
  if (!btn || !dlg) return;
  const v = (document.querySelector('script[src*="game-btn.js"]')?.src.match(/\?v=(\d+)/) || [])[1] || "1";
  let loading = null;
  function load() {
    if (window.FilGame) return Promise.resolve();
    return loading || (loading = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = `js/game.js?v=${v}`;
      s.onload = ok; s.onerror = () => { loading = null; fail(); };
      document.head.append(s);
    }));
  }
  btn.addEventListener("click", async () => {
    btn.classList.add("loading");
    try { await load(); window.FilGame.open(); window.dataLayer?.push({ event: "game_open" }); }
    catch {}
    btn.classList.remove("loading");
  });
  // Preload quietly when the pointer heads for the button.
  btn.addEventListener("pointerenter", () => { load().catch(() => {}); }, { once: true });
  document.getElementById("gameClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
})();
