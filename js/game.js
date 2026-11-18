// FilRadio mini games: the shared shell (games menu, start screen, score, effects, game over, leaderboard).
// Each game lives in js/games/<id>.js and is downloaded only when someone picks it. Everything runs
// in the browser; the only server call is the optional top-10 leaderboard on the chat worker (edge-cached).
// The animation loop runs only while the game window is open and the tab is visible.
window.FilGame = (() => {
  const $ = (id) => document.getElementById(id);
  const dlg = $("gameDlg"), canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
  const menuEl = $("gameMenu"), startEl = $("gameStart"), overEl = $("gameOver");
  const V = (document.querySelector('script[src*="game-btn.js"]')?.src.match(/\?v=(\d+)/) || [])[1] || "1";
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://chat.filradio.xyz";
  const NAME_KEY = "filradio.game.name";

  const GAMES = [
    { id: "palaka", title: "Talon, Palaka!", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="pabg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a8fb5"/><stop offset="1" stop-color="#1d4f68"/></linearGradient><linearGradient id="pagl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="pash" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><radialGradient id="pab" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#9be7a6"/><stop offset=".55" stop-color="#4cbf5a"/><stop offset="1" stop-color="#257a33"/></radialGradient><radialGradient id="pap" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#7fcf72"/><stop offset=".55" stop-color="#3f9a4a"/><stop offset="1" stop-color="#22602b"/></radialGradient><radialGradient id="pae" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#f2f2f2"/><stop offset="1" stop-color="#b9c4cc"/></radialGradient><clipPath id="pacl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#pacl)"><rect width="48" height="48" rx="12" fill="url(#pabg)"/><path d="M0 30h48v18H0z" fill="#174458" opacity=".55"/><ellipse cx="24" cy="39" rx="18" ry="4" fill="url(#pash)"/><ellipse cx="24" cy="36" rx="17" ry="5" fill="url(#pap)"/><ellipse cx="24" cy="27" rx="12" ry="9" fill="url(#pab)"/><ellipse cx="26" cy="31" rx="7" ry="3.6" fill="#d8f7c0"/><circle cx="18" cy="18" r="5" fill="url(#pab)"/><circle cx="30" cy="18" r="5" fill="url(#pab)"/><circle cx="18" cy="17" r="3.4" fill="url(#pae)"/><circle cx="30" cy="17" r="3.4" fill="url(#pae)"/><circle cx="19" cy="17.3" r="1.7" fill="#10182b"/><circle cx="31" cy="17.3" r="1.7" fill="#10182b"/><circle cx="19.6" cy="16.6" r=".6" fill="#fff"/><circle cx="31.6" cy="16.6" r=".6" fill="#fff"/><path d="M20 26q4 3 8 0" stroke="#1d5e2a" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="19" cy="22.5" rx="4" ry="2" fill="#fff" opacity="0.45"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#pagl)"/></g></svg>', color: "#4cbf5a", tag: "Hop the frog across the river",
      how: "<b>Hold</b> to charge, <b>let go</b> to jump. Land in the middle for Perfect combos and catch flies for bonus points." },
    { id: "jeepney", title: "Jeepney Dash", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="jebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc8f2"/><stop offset="1" stop-color="#3d8bd0"/></linearGradient><linearGradient id="jegl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="jesh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="jebd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#d9dde3"/><stop offset="1" stop-color="#9aa3b0"/></linearGradient><linearGradient id="jehd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f7"/><stop offset=".5" stop-color="#c9ced6"/><stop offset="1" stop-color="#8f97a5"/></linearGradient><radialGradient id="jew" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#555b68"/><stop offset=".55" stop-color="#1d2027"/><stop offset="1" stop-color="#08090c"/></radialGradient><linearGradient id="jerd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b505c"/><stop offset="1" stop-color="#2a2d35"/></linearGradient><clipPath id="jecl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#jecl)"><rect width="48" height="48" rx="12" fill="url(#jebg)"/><rect x="0" y="37" width="48" height="11" fill="url(#jerd)"/><ellipse cx="25" cy="39" rx="20" ry="3.5" fill="url(#jesh)"/><rect x="6" y="14" width="30" height="20" rx="3.5" fill="url(#jebd)"/><rect x="33" y="20" width="10" height="14" rx="3" fill="url(#jehd)"/><rect x="9" y="5" width="20" height="8" rx="2" fill="#1b2340"/><rect x="9" y="5" width="20" height="3" rx="1.5" fill="#2f3b66"/><rect x="12" y="8.6" width="14" height="2" rx="1" fill="#ffc93c"/><rect x="9" y="17" width="5" height="6" rx="1.2" fill="#1d2440"/><rect x="16" y="17" width="5" height="6" rx="1.2" fill="#1d2440"/><rect x="23" y="17" width="5" height="6" rx="1.2" fill="#1d2440"/><rect x="9.6" y="17.6" width="2" height="2.4" rx=".6" fill="#7fb6e8" opacity=".7"/><rect x="16.6" y="17.6" width="2" height="2.4" rx=".6" fill="#7fb6e8" opacity=".7"/><rect x="23.6" y="17.6" width="2" height="2.4" rx=".6" fill="#7fb6e8" opacity=".7"/><rect x="6" y="26" width="37" height="3" fill="#e63946"/><rect x="6" y="26" width="37" height="1" fill="#ff7a84"/><rect x="6" y="29" width="37" height="2" fill="#ffc93c"/><circle cx="13" cy="35" r="4.6" fill="url(#jew)"/><circle cx="36" cy="35" r="4.6" fill="url(#jew)"/><circle cx="13" cy="35" r="1.9" fill="#d5dae2"/><circle cx="36" cy="35" r="1.9" fill="#d5dae2"/><ellipse cx="14" cy="16" rx="6" ry="1.2" fill="#fff" opacity="0.55"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#jegl)"/></g></svg>', color: "#e63946", tag: "Pick up passengers before time runs out",
      how: "<b>Hold</b> to brake, <b>let go</b> to drive. Stop right beside waving passengers. Every fare adds time." },
    { id: "kite", title: "Saranggola", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="kibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb3f2"/><stop offset="1" stop-color="#2a6fc4"/></linearGradient><linearGradient id="kigl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="kish" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="kir" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a84"/><stop offset=".5" stop-color="#e63946"/><stop offset="1" stop-color="#a51d29"/></linearGradient><linearGradient id="kib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f8cff"/><stop offset=".5" stop-color="#2347d6"/><stop offset="1" stop-color="#132c94"/></linearGradient><linearGradient id="kig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc06a"/><stop offset="1" stop-color="#4f7a36"/></linearGradient><clipPath id="kicl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#kicl)"><rect width="48" height="48" rx="12" fill="url(#kibg)"/><circle cx="38" cy="10" r="5" fill="#fff6c8"/><circle cx="38" cy="10" r="8" fill="#fff6c8" opacity=".25"/><path d="M0 40l6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4v8H0z" fill="url(#kig)"/><path d="M23 9l10 12-10 16-10-16z" fill="#0b1a3a" opacity=".22"/><path d="M22 6l10 12-10 16-10-16z" fill="url(#kir)"/><path d="M22 6l10 12H22z" fill="url(#kib)"/><path d="M22 18h-10l10 16z" fill="#000" opacity=".12"/><path d="M22 6v28M12 18h20" stroke="#5b3a1e" stroke-width="1"/><path d="M22 34q-4 4 0 7t0 7" stroke="#ffc93c" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M22 7.5l2.5 3" stroke="#fff" stroke-width="1.6" opacity=".8" stroke-linecap="round"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#kigl)"/></g></svg>', color: "#3d7bff", tag: "Fly your kite over the fiesta",
      how: "<b>Hold</b> to rise, <b>let go</b> to drift down. Dodge the birds and wires, grab the banderitas." },
    { id: "taho", title: "Taho Catch", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="tabg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2b0"/><stop offset="1" stop-color="#e9b46a"/></linearGradient><linearGradient id="tagl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="tash" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="tat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset=".5" stop-color="#f5ecd9"/><stop offset="1" stop-color="#d9c7a3"/></linearGradient><linearGradient id="taa" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0a64a"/><stop offset=".5" stop-color="#d4882c"/><stop offset="1" stop-color="#9a5a12"/></linearGradient><radialGradient id="tas" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#9a6a43"/><stop offset=".55" stop-color="#5a3418"/><stop offset="1" stop-color="#2b1608"/></radialGradient><linearGradient id="tac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/></linearGradient><clipPath id="tacl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#tacl)"><rect width="48" height="48" rx="12" fill="url(#tabg)"/><ellipse cx="24" cy="43" rx="13" ry="3" fill="url(#tash)"/><path d="M13.4 24h21.2l-1.6 18H15z" fill="url(#tat)"/><path d="M13 19h22l-.5 6h-21z" fill="url(#taa)"/><circle cx="18" cy="17" r="2.7" fill="url(#tas)"/><circle cx="24" cy="16" r="2.7" fill="url(#tas)"/><circle cx="30" cy="17.5" r="2.7" fill="url(#tas)"/><circle cx="21" cy="21" r="2.5" fill="url(#tas)"/><circle cx="27" cy="21" r="2.5" fill="url(#tas)"/><path d="M12 12l3 30h18l3-30z" fill="#fff" opacity=".22"/><path d="M14.5 13l2.6 27" stroke="#fff" stroke-width="2.2" opacity=".75" stroke-linecap="round"/><path d="M12 12l3 30h18l3-30" stroke="#fff" stroke-width="1.4" fill="none" opacity=".9"/><path d="M10.5 12h27" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M10.5 12h27" stroke="#d6dbe3" stroke-width="1" stroke-linecap="round" transform="translate(0 1.4)"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#tagl)"/></g></svg>', color: "#c98a3c", tag: "Catch the sago, dodge the pebbles",
      how: "<b>Drag</b> or use the <b>arrow keys</b> to move the cup. Sago +1, arnibal +2. Three pebbles and you're out." },
    { id: "tumbang", title: "Tumbang Preso", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="tubg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a07f"/><stop offset="1" stop-color="#c4573c"/></linearGradient><linearGradient id="tugl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="tush" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="tuc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8594"/><stop offset=".5" stop-color="#e8ecf1"/><stop offset="1" stop-color="#8b93a1"/></linearGradient><linearGradient id="turb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a51d29"/><stop offset=".5" stop-color="#ff5c68"/><stop offset="1" stop-color="#a51d29"/></linearGradient><linearGradient id="tus" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8cff"/><stop offset=".5" stop-color="#2347d6"/><stop offset="1" stop-color="#132c94"/></linearGradient><linearGradient id="tug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a39280"/><stop offset="1" stop-color="#76654f"/></linearGradient><clipPath id="tucl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#tucl)"><rect width="48" height="48" rx="12" fill="url(#tubg)"/><path d="M0 36h48v12H0z" fill="url(#tug)"/><ellipse cx="31" cy="37" rx="9" ry="2.5" fill="url(#tush)"/><rect x="24" y="16" width="13" height="20" rx="2" fill="url(#tuc)"/><rect x="24" y="21" width="13" height="7" fill="url(#turb)"/><rect x="24" y="24" width="13" height="1.6" fill="#ffc93c"/><ellipse cx="30.5" cy="16" rx="6.5" ry="2" fill="#c9ced6"/><ellipse cx="30.5" cy="16" rx="4.5" ry="1.1" fill="#8b93a1"/><rect x="26.5" y="17" width="1.5" height="18" rx=".7" fill="#fff" opacity=".7"/><g transform="rotate(-25 13 18)"><rect x="4" y="16.6" width="18" height="6" rx="3" fill="#0e1f6e"/><rect x="4" y="15" width="18" height="6" rx="3" fill="url(#tus)"/><rect x="6" y="15.6" width="12" height="1.6" rx=".8" fill="#fff" opacity=".45"/><path d="M11 15l3-4 3 4" stroke="#ff5c68" stroke-width="1.8" fill="none" stroke-linecap="round"/></g><path d="M6 30q6-10 16-12" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2" fill="none" opacity=".8"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#tugl)"/></g></svg>', color: "#ff8f3c", tag: "Knock down the can with your tsinelas",
      how: "<b>Hold</b> to set the power while the aim swings, <b>let go</b> to throw. Watch the wind. Three misses and you're out." },
    { id: "sungka", title: "Sungka Solo", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="subg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#56407a"/><stop offset="1" stop-color="#2a1d3f"/></linearGradient><linearGradient id="sugl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="sush" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="suw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c08850"/><stop offset=".5" stop-color="#8a5a2b"/><stop offset="1" stop-color="#5a3816"/></linearGradient><radialGradient id="suh" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#120a04"/><stop offset=".55" stop-color="#1e1208"/><stop offset="1" stop-color="#4a2e16"/></radialGradient><radialGradient id="sush" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f5ecd9"/><stop offset="1" stop-color="#c9b48c"/></radialGradient><clipPath id="sucl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#sucl)"><rect width="48" height="48" rx="12" fill="url(#subg)"/><ellipse cx="24" cy="36" rx="21" ry="4" fill="url(#sush)"/><rect x="5" y="17" width="38" height="18" rx="9" fill="#3f2710"/><rect x="5" y="14" width="38" height="18" rx="9" fill="url(#suw)"/><rect x="9" y="15" width="30" height="3" rx="1.5" fill="#fff" opacity=".22"/><ellipse cx="11" cy="23" rx="4" ry="6" fill="url(#suh)"/><circle cx="19" cy="23" r="3.3" fill="url(#suh)"/><circle cx="27" cy="23" r="3.3" fill="url(#suh)"/><circle cx="35" cy="23" r="3.3" fill="url(#suh)"/><ellipse cx="11" cy="21.6" rx="1.7" ry="1.2" fill="url(#sush)"/><ellipse cx="11" cy="25.4" rx="1.7" ry="1.2" fill="url(#sush)"/><ellipse cx="19" cy="23.4" rx="1.6" ry="1.1" fill="url(#sush)"/><ellipse cx="27" cy="22.4" rx="1.6" ry="1.1" fill="url(#sush)"/><ellipse cx="27.5" cy="24.8" rx="1.6" ry="1.1" fill="url(#sush)"/><ellipse cx="35" cy="23.4" rx="1.6" ry="1.1" fill="url(#sush)"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#sugl)"/></g></svg>', color: "#b07cf0", tag: "Sow the shells into your store",
      how: "<b>Tap a pit</b> to sow its shells one by one toward your store. Last shell in your store = free move. Clear the board for a bonus." },
    { id: "rene", title: "Rene, Shoot mo Bola!", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="rebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3d8f"/><stop offset="1" stop-color="#e0784a"/></linearGradient><linearGradient id="regl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="reb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffb15c"/><stop offset=".6" stop-color="#f07b1d"/><stop offset="1" stop-color="#b2500c"/></radialGradient><clipPath id="recl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#recl)"><rect width="48" height="48" rx="12" fill="url(#rebg)"/><rect x="0" y="40" width="48" height="8" fill="#3d5873"/><rect x="30" y="6" width="3" height="16" fill="#f4f6fa"/><rect x="33" y="8" width="2" height="34" fill="#3a4256"/><path d="M14 18h16" stroke="#f07b1d" stroke-width="2.4" stroke-linecap="round"/><path d="M15 19l2 9M19 19l1 9M23 19l0 9M27 19l-1 9M29 19l-2 9M16 23h12M17 27h10" stroke="#fff" stroke-width=".9" opacity=".9"/><path d="M8 38q4-22 14-24" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2" fill="none" opacity=".8"/><circle cx="12" cy="31" r="7.5" fill="url(#reb)"/><path d="M4.5 31h15M12 23.5v15" stroke="#4a2208" stroke-width="1"/><path d="M6.6 25.6q3.4 5.4 0 10.8M17.4 25.6q-3.4 5.4 0 10.8" stroke="#4a2208" stroke-width="1" fill="none"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#regl)"/></g></svg>', color: "#f07b1d", tag: "Street basketball on the barangay court",
      how: "<b>Drag back</b> from anywhere to aim, <b>let go</b> to shoot. Swish = +3 and extra time. Three in a row and you're on fire: double points." },
    { id: "tinikling", title: "Tinikling", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="tkbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2350"/><stop offset="1" stop-color="#5a3b5e"/></linearGradient><linearGradient id="tkgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="tkb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e58a"/><stop offset=".5" stop-color="#a9bd52"/><stop offset="1" stop-color="#6f8130"/></linearGradient><clipPath id="tkcl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#tkcl)"><rect width="48" height="48" rx="12" fill="url(#tkbg)"/><rect x="0" y="34" width="48" height="14" fill="#6b4425"/><circle cx="10" cy="8" r="2.4" fill="#ffc93c"/><circle cx="24" cy="11" r="2.4" fill="#e63946"/><circle cx="38" cy="8" r="2.4" fill="#4cbf5a"/><rect x="3" y="31" width="42" height="4" rx="2" fill="url(#tkb)"/><path d="M20 26l-2 5M28 26l2 5" stroke="#c8262f" stroke-width="3" stroke-linecap="round"/><path d="M18 31h-3M30 31h3" stroke="#b07246" stroke-width="2.4" stroke-linecap="round"/><path d="M18 14h12l1 12H17z" fill="#f3ead6" stroke="#2b1a10" stroke-width=".8"/><path d="M18 16l-7 2M30 16l7 2" stroke="#f3ead6" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="10" r="3.6" fill="#b07246" stroke="#2b1a10" stroke-width=".8"/><path d="M20.4 9a3.6 3.6 0 0 1 7.2 0z" fill="#17161b"/><rect x="3" y="37" width="42" height="5" rx="2.5" fill="url(#tkb)"/><path d="M16 37v5M30 37v5" stroke="#5e6d24" stroke-width=".8"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#tkgl)"/></g></svg>', color: "#a9bd52", tag: "Dance the bamboo, don't get caught",
      how: "<b>Tap</b> (or Space) to jump when the bamboo poles clap shut. Watch the beat track: gold dots are claps. Clap at the top of your jump for a Perfect. It speeds up!" },
    { id: "dama", title: "Dama", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="dmbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4527"/><stop offset="1" stop-color="#2a170c"/></linearGradient><linearGradient id="dmgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="dmr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".6" stop-color="#d8343f"/><stop offset="1" stop-color="#8e1b24"/></radialGradient><radialGradient id="dmb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7fb2ff"/><stop offset=".6" stop-color="#2c6fd1"/><stop offset="1" stop-color="#173f80"/></radialGradient><clipPath id="dmcl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#dmcl)"><rect width="48" height="48" rx="12" fill="url(#dmbg)"/><rect x="6" y="9" width="36" height="32" rx="3" fill="#c79a5b"/><rect x="8" y="11" width="8" height="7" fill="#ecd9b0"/><rect x="16" y="11" width="8" height="7" fill="#6e4527"/><rect x="24" y="11" width="8" height="7" fill="#ecd9b0"/><rect x="32" y="11" width="8" height="7" fill="#6e4527"/><rect x="8" y="18" width="8" height="7" fill="#6e4527"/><rect x="16" y="18" width="8" height="7" fill="#ecd9b0"/><rect x="24" y="18" width="8" height="7" fill="#6e4527"/><rect x="32" y="18" width="8" height="7" fill="#ecd9b0"/><rect x="8" y="25" width="8" height="7" fill="#ecd9b0"/><rect x="16" y="25" width="8" height="7" fill="#6e4527"/><rect x="24" y="25" width="8" height="7" fill="#ecd9b0"/><rect x="32" y="25" width="8" height="7" fill="#6e4527"/><rect x="8" y="32" width="8" height="7" fill="#6e4527"/><rect x="16" y="32" width="8" height="7" fill="#ecd9b0"/><rect x="24" y="32" width="8" height="7" fill="#6e4527"/><rect x="32" y="32" width="8" height="7" fill="#ecd9b0"/><circle cx="20" cy="14.5" r="3.3" fill="url(#dmb)" stroke="#173f80" stroke-width=".8" stroke-dasharray="1 .8"/><circle cx="36" cy="14.5" r="3.3" fill="url(#dmb)" stroke="#173f80" stroke-width=".8" stroke-dasharray="1 .8"/><circle cx="28" cy="21.5" r="3.3" fill="url(#dmb)" stroke="#173f80" stroke-width=".8" stroke-dasharray="1 .8"/><circle cx="12" cy="35.5" r="3.3" fill="url(#dmr)" stroke="#8e1b24" stroke-width=".8" stroke-dasharray="1 .8"/><circle cx="28" cy="35.5" r="3.3" fill="url(#dmr)" stroke="#8e1b24" stroke-width=".8" stroke-dasharray="1 .8"/><circle cx="20" cy="28.5" r="3.6" fill="#d8343f" stroke="#c9cbd0" stroke-width="1.2"/><path d="M17.8 29.8v-2.6l1.1 1.1 1.1-1.8 1.1 1.8 1.1-1.1v2.6z" fill="#ffc93c"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#dmgl)"/></g></svg>', color: "#d8343f", tag: "Pinoy checkers with bottle caps",
      how: "<b>Tap a red cap</b>, then tap where to go. Captures are a must. Reach the far row to crown a dama that flies across the board. Beat the computer to level up!" },
    { id: "tuner", title: "Radio Tuner", art: '<svg viewBox="0 0 48 48"><defs><linearGradient id="tnbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26304f"/><stop offset="1" stop-color="#0b1020"/></linearGradient><linearGradient id="tngl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="tnsh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="tnb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8693e"/><stop offset=".5" stop-color="#7a4a2a"/><stop offset="1" stop-color="#4a2a14"/></linearGradient><linearGradient id="tnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e2"/><stop offset=".5" stop-color="#e8dcc4"/><stop offset="1" stop-color="#bfae8c"/></linearGradient><radialGradient id="tnk" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#f2f4f7"/><stop offset=".55" stop-color="#b0b6c0"/><stop offset="1" stop-color="#5c6378"/></radialGradient><clipPath id="tncl"><rect width="48" height="48" rx="12"/></clipPath></defs><g clip-path="url(#tncl)"><rect width="48" height="48" rx="12" fill="url(#tnbg)"/><ellipse cx="24" cy="41" rx="18" ry="3" fill="url(#tnsh)"/><rect x="6" y="14" width="36" height="28" rx="6" fill="#3a2010"/><rect x="6" y="11" width="36" height="28" rx="6" fill="url(#tnb)"/><rect x="9" y="12" width="30" height="2.4" rx="1.2" fill="#fff" opacity=".25"/><rect x="10" y="15" width="28" height="9" rx="2" fill="#0b1020"/><path d="M12 21q2-4 4 0t4 0 4 0 4 0 4 0 4 0" stroke="#ffc93c" stroke-width="1.4" fill="none"/><rect x="10" y="15" width="28" height="3" rx="1.5" fill="#fff" opacity=".08"/><rect x="10" y="28" width="21" height="7" rx="2" fill="url(#tnd)"/><path d="M13 28v3M17 28v2M21 28v3M25 28v2M29 28v3" stroke="#4a2a14" stroke-width=".8"/><rect x="22" y="26.5" width="1.6" height="10" rx=".8" fill="#e63946"/><circle cx="36.5" cy="31.5" r="3.6" fill="url(#tnk)"/><path d="M14 11l-4-7" stroke="#d5dae2" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="4" r="1.4" fill="#e63946"/><path d="M0 12a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v8q-24 7-48 0z" fill="url(#tngl)"/></g></svg>', color: "#ffc93c", tag: "Find the hidden station in the static",
      how: "<b>Drag</b> the dial or use the <b>arrow keys</b>. Follow the signal meter and hold steady on the station to lock it in." },
  ];
  const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));

  // ---------- small helpers ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const bestKey = (id) => (id === "palaka" ? "filradio.game.best" : `filradio.game.best.${id}`);
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, Math.max(0, w), h, r) : ctx.rect(x, y, Math.max(0, w), h); }

  // ---------- leaderboards ----------
  const tops = {};        // id -> { list, at }
  let champs = {}, plays = {}, champsAt = 0;
  async function loadTop(id, force) {
    const c = tops[id];
    if (!force && c && Date.now() - c.at < 30e3) return c.list;
    try {
      const r = await fetch(`${API}/game/top?g=${id}`);
      if (r.ok) { tops[id] = { list: (await r.json()).top || [], at: Date.now() }; champs[id] = tops[id].list[0] || null; announce(); }
    } catch {}
    return tops[id]?.list || [];
  }
  async function loadChamps(force) {
    if (!force && Date.now() - champsAt < 30e3) return champs;
    try {
      const r = await fetch(`${API}/game/tops`);
      if (r.ok) { const d = await r.json(); champs = d.tops || {}; plays = d.plays || {}; champsAt = Date.now(); announce(); }
    } catch {}
    return champs;
  }
  function announce() { window.dispatchEvent(new CustomEvent("filgame:tops", { detail: { tops: champs, plays } })); renderMenu(); }
  const fmtPlays = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  // Most played first (ties keep the original order).
  const sorted = () => GAMES.map((g, i) => [g, i]).sort((a, b) => (plays[b[0].id] || 0) - (plays[a[0].id] || 0) || a[1] - b[1]).map(([g]) => g);
  const topOf = (id) => tops[id]?.list || [];
  const listHtml = (rows, mine, from = 1) => rows.length
    ? rows.map((e, i) => `<li class="${mine && e.n.toLowerCase() === mine.toLowerCase() ? "me" : ""}"><span>${i + from}</span><b>${esc(e.n)}</b><em>${e.s}</em></li>`).join("")
    : `<li class="empty">No scores yet. Be the first!</li>`;

  // ---------- state ----------
  let W = 360, H = 560, DPR = 1;
  let phase = "menu";     // menu | intro | play | over
  let game = null, mod = null, score = 0, best = 0, run = { acts: 0, t0: 0, ms: 0 };
  let parts = [], pops = [], shake = 0, t = 0, last = 0, raf = 0, held = false;
  const mods = {}, factories = {};

  const api = {
    get W() { return W; }, get H() { return H; }, get t() { return t; }, get score() { return score; },
    get playing() { return phase === "play"; },
    get actions() { return run.acts; },
    cam: 0,
    rnd, lerp, rr,
    add(n, x, y, text, gold) { if (phase !== "play") return; score += n; if (x != null) api.pop(x, y, text || `+${n}`, gold); },
    action() { if (phase !== "play") return; if (!run.t0) run.t0 = performance.now(); run.acts++; },
    over(label) { if (phase === "play") endRound(label); },
    pop(x, y, text, gold) { pops.push({ x, y, text, gold, life: 1 }); },
    burst(x, y, n = 12, colors = ["#ffc93c", "#fff"], speed = 160, grav = 900, size = 3) {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-speed, speed), vy: rnd(-speed * 1.6, speed * 0.3), g: grav, life: rnd(0.6, 1), c: colors[i % colors.length], r: rnd(size * 0.6, size * 1.3) });
    },
    ring(x, y, n = 4, color = "rgba(255,255,255,.7)") { for (let i = 0; i < n; i++) parts.push({ ring: true, x, y, r: 6 + i * 3, life: 1 - i * 0.08, c: color }); },
    shake(n) { shake = Math.max(shake, n); },
    vibrate(p) { navigator.vibrate?.(p); },
    text(str, x, y, size = 16, color = "#fff", weight = 800, align = "center") {
      ctx.font = `${weight} ${size}px Archivo, system-ui, sans-serif`; ctx.textAlign = align;
      ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = "rgba(16,24,43,.7)"; ctx.strokeText(str, x, y);
      ctx.fillStyle = color; ctx.fillText(str, x, y);
    },
  };

  window.FilGames = { register(id, factory) { factories[id] = factory; } };
  const loading = {};
  function loadGame(id) {
    if (factories[id]) return Promise.resolve();
    return loading[id] || (loading[id] = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = `js/games/${id}.js?v=${V}`;
      s.onload = () => (factories[id] ? ok() : fail());
      s.onerror = () => { delete loading[id]; fail(); };
      document.head.append(s);
    }));
  }

  // ---------- sizes ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    const oW = W, oH = H;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (mod && (oW !== W || oH !== H)) mod.resize?.(W, H, oW, oH);
  }

  // ---------- screens ----------
  function setHead(title, sub, back) {
    $("gameTitle").textContent = title;
    $("gameSub").textContent = sub;
    $("gameBack").hidden = !back;
  }
  // Talon, Palaka! is the featured game at the top; the rest read like a radio countdown chart (most played at No. 1).
  const FEATURED = "palaka";
  const metaHtml = (g) => {
    const c = champs[g.id], n = plays[g.id] || 0;
    return `${c ? `<span class="gm-top">TOP</span> ${esc(c.n)} <em>${c.s}</em>` : `<span class="gm-top dim">TOP</span> open, be the first`}${n ? ` <i>· ${fmtPlays(n)} ${n === 1 ? "play" : "plays"}</i>` : ""}`;
  };
  function renderMenu() {
    if (!menuEl) return;
    const f = byId[FEATURED];
    menuEl.querySelector(".gm-feature").innerHTML = `
      <span class="gm-ribbon"><span>Featured game</span></span>
      <span class="gm-art big" aria-hidden="true">${f.art}</span>
      <span class="gm-ftxt">
        <b>${esc(f.title)}</b><small>${esc(f.tag)}</small>
        <span class="gm-meta">${metaHtml(f)}</span>
        <span class="gm-play">Play now <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg></span>
      </span>`;
    menuEl.querySelector(".gm-feature").dataset.g = f.id;
    const list = sorted().filter((g) => g.id !== FEATURED);
    const top = Math.max(0, ...GAMES.map((g) => plays[g.id] || 0));
    const any = list.some((g) => plays[g.id]);
    menuEl.querySelector(".gm-lcd b").textContent = any ? "Most played this week" : "Pick a game";
    menuEl.querySelector(".gm-grid").innerHTML = list.map((g, i) => {
      const c = champs[g.id], n = plays[g.id] || 0, first = any && i === 0 && n === top;
      return `<button type="button" class="gm-row${first ? " first" : ""}" data-g="${g.id}" style="--gc:${g.color}">
        <span class="gm-rank">${String(i + 1).padStart(2, "0")}</span>
        ${first ? `<span class="gm-no1"><span>Most played</span></span>` : ""}
        <span class="gm-art" aria-hidden="true">${g.art}</span>
        <span class="gm-txt"><b>${esc(g.title)}</b><small>${esc(g.tag)}</small></span>
        <span class="gm-meta">
          <span>${c ? `<span class="gm-top">TOP</span> ${esc(c.n)} <em>${c.s}</em>` : `<span class="gm-top dim">TOP</span> Be the first`}</span>
          <span class="gm-plays">${n ? `${fmtPlays(n)} ${n === 1 ? "play" : "plays"}` : "No plays yet"}</span>
        </span>
      </button>`;
    }).join("");
  }

  menuEl.addEventListener("click", (e) => {
    const b = e.target.closest(".gm-row, .gm-feature");
    if (b) pick(b.dataset.g);
  });
  function showMenu() {
    phase = "menu";
    shareEl.hidden = true;
    held = false;
    startEl.hidden = true; overEl.hidden = true; menuEl.hidden = false;
    setHead("Games", "Free games to play while the radio plays", false);
    renderMenu();
    loadChamps();
    menuEl.querySelector(".gm-feature")?.focus({ preventScroll: true });
  }
  async function pick(id) {
    const g = byId[id];
    if (!g) return;
    const card = menuEl.querySelector(`[data-g="${id}"]`);
    card?.classList.add("loading");
    try { await loadGame(id); } catch { card?.classList.remove("loading"); return; }
    card?.classList.remove("loading");
    game = g;
    mod = mods[id] || (mods[id] = factories[id](api));
    best = +store.get(bestKey(id)) || 0;
    menuEl.hidden = true;
    setHead(g.title, g.tag, true);
    showIntro();
    window.dataLayer?.push({ event: "game_pick", game_id: id });
  }
  function newRound() {
    shareEl.hidden = true;
    score = 0; parts = []; pops = []; shake = 0; api.cam = 0; held = false;
    run = { acts: 0, t0: 0, ms: 0 };
    mod.reset();
    overEl.hidden = true;
  }
  function renderStart() {
    if (!game) return;
    const list = topOf(game.id), champ = list[0];
    $("gsChampName").textContent = champ ? champ.n : "No one yet";
    $("gsChampScore").textContent = champ ? `${champ.s} points` : "Be the first top scorer!";
    $("gsTop").innerHTML = list.length > 1 ? listHtml(list.slice(1, 5), "", 2) : "";
    $("gsTop").hidden = list.length < 2;
    $("gsHow").innerHTML = game.how;
    $("gsMine").textContent = best ? `Your best: ${best}` : "";
    startEl.style.setProperty("--gc", game.color);
  }
  function showIntro() {
    newRound();
    phase = "intro";
    renderStart();
    startEl.hidden = false;
    $("gsGo").focus({ preventScroll: true });
    loadTop(game.id, true).then(renderStart);
  }
  function begin() {
    if (phase !== "intro") return;
    startEl.hidden = true;
    phase = "play";
    canvas.focus({ preventScroll: true });
    window.dataLayer?.push({ event: "game_start", game_id: game.id });
    plays[game.id] = (plays[game.id] || 0) + 1;
    fetch(`${API}/game/play`, { method: "POST", body: JSON.stringify({ g: game.id }), keepalive: true }).catch(() => {});
  }
  function endRound(label) {
    phase = "over";
    held = false;
    run.ms = Math.round(performance.now() - (run.t0 || performance.now()));
    api.vibrate([30, 40, 30]);
    const isBest = score > best;
    if (isBest) { best = score; store.set(bestKey(game.id), String(best)); }
    $("goLabel").textContent = label || "Game over! Your score";
    $("goScore").textContent = score;
    $("goBest").textContent = isBest && score > 0 ? "New best score!" : `Best: ${best}`;
    $("goBest").classList.toggle("new", isBest && score > 0);
    $("goMsg").textContent = ""; $("goMsg").className = "go-msg";
    $("goSave").hidden = true;
    $("goTop").innerHTML = listHtml(topOf(game.id), "");
    const id = game.id, final = score;
    loadTop(id, true).then((list) => {
      if (phase !== "over" || game.id !== id) return;
      $("goTop").innerHTML = listHtml(list, "");
      if (final > 0 && (list.length < 10 || final > list[list.length - 1].s)) {
        $("goSave").hidden = false;
        $("goName").value = store.get(NAME_KEY) || store.get("filradio-chat-name") || "";
        $("goMsg").textContent = list.length && final > list[0].s ? "New top score! Save it with your name:" : "You made the top 10! Save it with your name:";
        $("goMsg").className = "go-msg ok";
      }
    });
    setTimeout(() => { if (phase === "over") { overEl.hidden = false; $("goAgain").focus({ preventScroll: true }); } }, 700);
    window.dataLayer?.push({ event: "game_over", game_id: id, game_score: score });
  }

  $("goSave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("goName").value.replace(/\s+/g, " ").trim();
    const msg = $("goMsg");
    if (name.length < 2) { msg.textContent = "Type a name (at least 2 letters)."; msg.className = "go-msg err"; return; }
    const btn = $("goSave").querySelector("button");
    btn.disabled = true; msg.textContent = "Saving…"; msg.className = "go-msg";
    const id = game.id;
    try {
      const r = await fetch(`${API}/game/score`, { method: "POST", body: JSON.stringify({ g: id, n: name, s: score, j: run.acts, d: run.ms }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save the score. Try again.");
      store.set(NAME_KEY, d.name);
      tops[id] = { list: d.top || [], at: Date.now() };
      champs[id] = tops[id].list[0] || null;
      announce();
      $("goTop").innerHTML = listHtml(tops[id].list, d.name);
      $("goSave").hidden = true;
      msg.textContent = d.rank === 1 ? `You're the top scorer, ${d.name}!` : d.rank <= 10 ? `You're #${d.rank} on the leaderboard!` : `Saved. Your best: ${d.best}`;
      msg.className = "go-msg ok";
      window.dataLayer?.push({ event: "game_score_saved", game_id: id, game_score: score, game_rank: d.rank });
    } catch (err) {
      msg.textContent = err.message || "Couldn't save the score. Try again."; msg.className = "go-msg err";
    }
    btn.disabled = false;
  });
  $("gsGo").addEventListener("click", begin);

  // ---------- share a game (or your score) ----------
  const shareEl = $("gameShare");
  function shareInfo(withScore) {
    const url = `https://filradio.xyz/?game=${game.id}&utm_source=share&utm_medium=game`;
    const text = withScore && score > 0
      ? `I scored ${score} in ${game.title} on FilRadio. Can you beat me?`
      : `Play ${game.title} free on FilRadio while you listen to Philippine radio!`;
    return { url, text, title: `${game.title} · FilRadio` };
  }
  function openShare(withScore) {
    const d = shareInfo(withScore), u = encodeURIComponent(d.url), t = encodeURIComponent(`${d.text} ${d.url}`);
    $("gshTitle").textContent = withScore && score > 0 ? `Share your ${score} points` : `Share ${game.title}`;
    $("gshFb").href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    $("gshMsg").href = `fb-messenger://share/?link=${u}`;
    $("gshMsg").hidden = !matchMedia("(pointer: coarse)").matches; // the Messenger app link only works on phones
    $("gshViber").href = `viber://forward?text=${t}`;
    $("gshWa").href = `https://wa.me/?text=${t}`;
    $("gshX").href = `https://x.com/intent/post?text=${encodeURIComponent(d.text)}&url=${u}`;
    $("gshCopy").textContent = "Copy link";
    $("gshCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(`${d.text} ${d.url}`); }
      catch { const ta = Object.assign(document.createElement("textarea"), { value: `${d.text} ${d.url}` }); document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      $("gshCopy").textContent = "Copied!";
    };
    $("gshMore").hidden = !navigator.share;
    $("gshMore").onclick = () => { navigator.share(d).catch(() => {}); };
    shareEl.hidden = false;
    $("gshClose").focus({ preventScroll: true });
    window.dataLayer?.push({ event: "game_share_open", game_id: game.id, with_score: !!(withScore && score > 0) });
  }
  $("gsShare").addEventListener("click", () => openShare(false));
  $("goShare").addEventListener("click", () => openShare(true));
  $("gshClose").addEventListener("click", () => { shareEl.hidden = true; });
  shareEl.addEventListener("click", (e) => { if (e.target === shareEl || e.target.closest("a")) shareEl.hidden = true; });
  $("goAgain").addEventListener("click", () => { newRound(); phase = "play"; canvas.focus({ preventScroll: true }); });
  for (const id of ["gsBack", "goMenu", "gameBack"]) $(id)?.addEventListener("click", showMenu);

  // ---------- input ----------
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    if (phase === "intro") { begin(); return; }
    if (phase !== "play") return;
    held = true;
    mod.down?.(...pos(e));
  });
  canvas.addEventListener("pointermove", (e) => { if (phase === "play") mod.move?.(...pos(e), held); });
  const up = (e) => { if (!held) return; held = false; if (phase === "play") mod.up?.(...pos(e)); };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const ONE = new Set(["Space", "ArrowUp", "Enter"]), ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowDown"]);
  dlg.addEventListener("keydown", (e) => {
    if (e.target.closest("button, input")) return;
    if (ONE.has(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      if (phase === "intro") { begin(); return; }
      if (phase === "play" && !held) { held = true; mod.down?.(W / 2, H / 2, true); }
    } else if (ARROWS.has(e.code) && phase === "play") { e.preventDefault(); mod.key?.(e.code, true); }
  });
  dlg.addEventListener("keyup", (e) => {
    if (e.target.closest("button, input")) return;
    if (ONE.has(e.code)) { e.preventDefault(); if (held) { held = false; if (phase === "play") mod.up?.(W / 2, H / 2, true); } }
    else if (ARROWS.has(e.code) && phase === "play") mod.key?.(e.code, false);
  });

  // ---------- loop ----------
  function step(dt) {
    t += dt;
    if (mod && (phase === "play" || phase === "over")) mod.step(dt);
    else if (mod && phase === "intro") mod.idle?.(dt);
    for (const p of parts) {
      p.life -= dt * (p.ring ? 1.4 : 1);
      if (p.ring) p.r += 40 * dt; else { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) { p.life -= dt * 0.9; p.y -= 30 * dt; }
    pops = pops.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt * 30);
  }
  function drawEffects() {
    const cx = api.cam || 0;
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.ring) { ctx.strokeStyle = p.c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x - cx, p.y + 4, p.r * 1.8, p.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x - cx, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      api.text(p.text, p.x - cx, p.y, p.gold ? 17 : 15, p.gold ? "#ffc93c" : "#fff");
    }
    ctx.globalAlpha = 1;
  }
  function drawHud() {
    if (phase === "intro" || phase === "menu") return;
    ctx.textAlign = "center";
    ctx.font = "800 44px 'Share Tech Mono', ui-monospace, monospace";
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(16,24,43,.55)";
    ctx.strokeText(String(score), W / 2, 58); ctx.fillStyle = "#fff"; ctx.fillText(String(score), W / 2, 58);
    ctx.font = "600 12px Archivo, system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillText(`BEST ${best}`, W / 2, 78);
    const champ = topOf(game.id)[0];
    if (champ) {
      const label = `TOP ${champ.s} · ${champ.n}`;
      ctx.font = "700 12px Archivo, system-ui, sans-serif";
      const w = ctx.measureText(label).width + 34;
      ctx.fillStyle = "rgba(16, 24, 43, .55)"; rr(W / 2 - w / 2, 88, w, 22, 11); ctx.fill();
      ctx.fillStyle = "#ffc93c"; ctx.fillText("\u{1F451}", W / 2 - w / 2 + 13, 103.5);
      ctx.fillText(label, W / 2 + 8, 103.5);
    }
    // First-time hint until the first move of the round
    if (phase === "play" && !run.acts && mod.hint) {
      const hy = mod.hintY?.() ?? H * 0.8;
      ctx.font = "800 16px Archivo, system-ui, sans-serif";
      let w = ctx.measureText(mod.hint[0]).width;
      ctx.font = "500 12.5px Archivo, system-ui, sans-serif";
      if (mod.hint[1]) w = Math.max(w, ctx.measureText(mod.hint[1]).width);
      ctx.fillStyle = "rgba(16, 24, 43, .62)"; rr(W / 2 - w / 2 - 14, hy - 22, w + 28, mod.hint[1] ? 54 : 32, 14); ctx.fill();
      ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
      api.text(mod.hint[0], W / 2, hy, 16, "#fff");
      if (mod.hint[1]) api.text(mod.hint[1], W / 2, hy + 22, 12.5, "rgba(255,255,255,.9)", 500);
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    if (!mod || phase === "menu") {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1b2850"); g.addColorStop(1, "#10172a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    if (shake) ctx.translate(rnd(-shake, shake) * 0.4, rnd(-shake, shake) * 0.4);
    mod.draw(ctx);
    drawEffects();
    ctx.restore();
    if (phase !== "intro") mod.hud?.(ctx);
    drawHud();
  }
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    raf = requestAnimationFrame(frame); // scheduled first, so one bad frame can't stop the game
    try { step(dt); draw(); } catch (e) { console.error(e); }
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (dlg.open) start(); });
  window.addEventListener("resize", () => { if (dlg.open) resize(); });
  dlg.addEventListener("close", () => { stop(); held = false; });

  renderMenu();
  return {
    loadChamps,
    open(id) {
      if (!dlg.open) dlg.showModal();
      resize();
      if (id && byId[id]) pick(id);
      else if (phase === "play" && mod) { /* resume the round in progress */ }
      else showMenu();
      draw();
      start();
    },
  };
})();
