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
  async function openGame(from) {
    from.classList.add("loading");
    try { await load(); window.FilGame.open(); window.dataLayer?.push({ event: "game_open", game_from: from.id }); }
    catch {}
    from.classList.remove("loading");
  }
  btn.addEventListener("click", () => openGame(btn));

  // Chat footer: "Bored? Play Talon, Palaka!" with the current top scorer.
  const chatGame = document.getElementById("chatGame"), chatPanel = document.getElementById("chatPanel");
  const topLine = document.getElementById("chatGameTop");
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://chat.filradio.xyz";
  const showTop = (top) => { if (top && top[0] && topLine) topLine.textContent = `\u{1F451} Top score: ${top[0].s} by ${top[0].n}. Can you beat it?`; };
  window.addEventListener("filgame:top", (e) => showTop(e.detail));
  let fetched = 0;
  async function refreshTop() {
    if (window.FilGame) { window.FilGame.loadTop(); return; }
    if (Date.now() - fetched < 60e3) return;
    fetched = Date.now();
    try { const r = await fetch(`${API}/game/top`); if (r.ok) showTop((await r.json()).top); } catch {}
  }
  if (chatGame) {
    chatGame.addEventListener("click", () => openGame(chatGame));
    if (chatPanel) {
      new MutationObserver(() => { if (!chatPanel.hidden) refreshTop(); }).observe(chatPanel, { attributes: true, attributeFilter: ["hidden"] });
      if (!chatPanel.hidden) refreshTop();
    }
  }
  // Preload quietly when the pointer heads for the button.
  btn.addEventListener("pointerenter", () => { load().catch(() => {}); }, { once: true });
  document.getElementById("gameClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
})();
