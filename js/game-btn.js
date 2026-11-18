// Games button (above the chat bubble) and the chat footer's "Bored? Play a game!" strip.
// js/game.js (the games shell) loads on the first tap only, so games cost nothing until they're used.
(() => {
  const btn = document.getElementById("gameBtn"), dlg = document.getElementById("gameDlg");
  if (!btn || !dlg) return;
  const v = (document.querySelector('script[src*="game-btn.js"]')?.src.match(/\?v=(\d+)/) || [])[1] || "1";
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://chat.filradio.xyz";
  const TITLES = { palaka: "Talon, Palaka!", jeepney: "Jeepney Dash", kite: "Saranggola", taho: "Taho Catch", tumbang: "Tumbang Preso", sungka: "Sungka Solo", tuner: "Radio Tuner", rene: "Rene, Shoot mo Bola!", tinikling: "Tinikling", dama: "Dama" };
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
  async function openGames(from) {
    from.classList.add("loading");
    try { await load(); window.FilGame.open(); window.dataLayer?.push({ event: "game_open", game_from: from.id }); }
    catch {}
    from.classList.remove("loading");
  }
  btn.addEventListener("click", () => openGames(btn));

  // Shared game links (filradio.xyz/?game=palaka) open straight into that game's start screen.
  const shared = new URLSearchParams(location.search).get("game");
  if (shared && TITLES[shared]) {
    const go = async () => {
      try { await load(); window.FilGame.open(shared); window.dataLayer?.push({ event: "game_open", game_from: "shared_link", game_id: shared }); } catch {}
      try { const u = new URL(location.href); u.searchParams.delete("game"); history.replaceState(history.state, "", u); } catch {}
    };
    if (document.readyState === "complete") setTimeout(go, 800); else addEventListener("load", () => setTimeout(go, 800), { once: true });
  }
  btn.addEventListener("pointerenter", () => { load().catch(() => {}); }, { once: true });
  // Full screen toggle: the real Fullscreen API where the browser has it (desktop, Android); otherwise
  // (iPhone) the panel just fills the window. Pressing Esc out of real full screen also turns it off.
  function fullToggle(el, btn) {
    let real = false;
    const sync = () => {
      const on = el.classList.contains("is-full");
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
      btn.title = on ? "Exit full screen" : "Full screen";
      btn.querySelector("use")?.setAttribute("href", on ? "#i-unfull" : "#i-full");
      window.dispatchEvent(new Event("resize"));
    };
    async function set(on) {
      if (on === el.classList.contains("is-full")) return;
      el.classList.toggle("is-full", on);
      sync();
      if (on && el.requestFullscreen && !document.fullscreenElement) {
        try { await el.requestFullscreen({ navigationUI: "hide" }); real = true; } catch {}
      } else if (!on && real) {
        real = false;
        if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
      }
    }
    document.addEventListener("fullscreenchange", () => { if (real && document.fullscreenElement !== el) { real = false; set(false); } });
    btn.addEventListener("click", () => set(!el.classList.contains("is-full")));
    return set;
  }
  const fullBtn = document.getElementById("gameFull");
  const setFull = fullBtn ? fullToggle(dlg, fullBtn) : () => {};
  // Phones already get the whole screen; without the Fullscreen API (iPhone) the button would do nothing there.
  if (fullBtn && !dlg.requestFullscreen) fullBtn.hidden = matchMedia("(max-width: 760px) and (min-height: 501px), (max-width: 480px)").matches;
  dlg.addEventListener("close", () => setFull(false));
  document.getElementById("gameClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // Chat footer: one game's current top scorer (a different game each time the chat opens).
  const chatGame = document.getElementById("chatGame"), chatPanel = document.getElementById("chatPanel");
  const topLine = document.getElementById("chatGameTop");
  let turn = Math.floor(Math.random() * 7);
  function showTops(d) {
    const champs = Object.entries(d?.tops || {}).filter(([g, c]) => c && TITLES[g]);
    if (!champs.length || !topLine) return;
    const [g, c] = champs[turn++ % champs.length];
    topLine.textContent = `\u{1F451} ${c.n} leads ${TITLES[g]} with ${c.s}. Can you beat it?`;
  }
  window.addEventListener("filgame:tops", (e) => showTops(e.detail));
  let fetched = 0;
  async function refresh() {
    if (window.FilGame) { window.FilGame.loadChamps(true); return; }
    if (Date.now() - fetched < 60e3) return;
    fetched = Date.now();
    try { const r = await fetch(`${API}/game/tops`); if (r.ok) showTops(await r.json()); } catch {}
  }
  if (chatGame) {
    chatGame.addEventListener("click", () => openGames(chatGame));
    if (chatPanel) {
      new MutationObserver(() => { if (!chatPanel.hidden) refresh(); }).observe(chatPanel, { attributes: true, attributeFilter: ["hidden"] });
      if (!chatPanel.hidden) refresh();
    }
  }
})();
