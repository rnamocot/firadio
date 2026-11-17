// "Talon, Palaka!" (Jump, frog!): a one-button mini game to play while listening.
// Hold to charge, let go to jump from lily pad to lily pad across the river.
// Runs entirely in the browser (no server), is loaded only when someone opens it, and the
// animation loop stops whenever the game is closed or the tab is hidden. Best score stays on the device.
window.FilGame = (() => {
  const $ = (id) => document.getElementById(id);
  const dlg = $("gameDlg"), canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
  const over = $("gameOver"), BEST_KEY = "filradio.game.best", NAME_KEY = "filradio.game.name";
  let best = 0;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch {}

  // ---------- leaderboard (top 10 on the chat server; reads are edge-cached) ----------
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://chat.filradio.xyz";
  let top = [], topAt = 0;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  async function loadTop(force) {
    if (!force && Date.now() - topAt < 30e3) return top;
    try {
      const r = await fetch(`${API}/game/top`);
      if (r.ok) { top = (await r.json()).top || []; topAt = Date.now(); window.dispatchEvent(new CustomEvent("filgame:top", { detail: top })); }
    } catch {}
    return top;
  }
  const qualifies = (sc) => sc > 0 && (top.length < 10 || sc > top[top.length - 1].s);
  function renderTop(mine) {
    const ol = $("goTop");
    ol.innerHTML = top.length
      ? top.map((e, i) => `<li class="${mine && e.n.toLowerCase() === mine.toLowerCase() ? "me" : ""}"><span>${i + 1}</span><b>${esc(e.n)}</b><em>${e.s}</em></li>`).join("")
      : `<li class="empty">No scores yet. Be the first!</li>`;
  }
  function savedName() {
    try { return localStorage.getItem(NAME_KEY) || localStorage.getItem("filradio-chat-name") || ""; } catch { return ""; }
  }
  let run = { jumps: 0, t0: 0, ms: 0 };
  $("goSave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("goName").value.replace(/\s+/g, " ").trim();
    const msg = $("goMsg");
    if (name.length < 2) { msg.textContent = "Type a name (at least 2 letters)."; msg.className = "go-msg err"; return; }
    const btn = $("goSave").querySelector("button");
    btn.disabled = true; msg.textContent = "Saving…"; msg.className = "go-msg";
    try {
      const r = await fetch(`${API}/game/score`, { method: "POST", body: JSON.stringify({ n: name, s: score, j: run.jumps, d: run.ms }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save the score. Try again.");
      try { localStorage.setItem(NAME_KEY, d.name); } catch {}
      top = d.top || top; topAt = Date.now();
      window.dispatchEvent(new CustomEvent("filgame:top", { detail: top }));
      renderTop(d.name);
      $("goSave").hidden = true;
      msg.textContent = d.rank === 1 ? `You're the top scorer, ${d.name}!` : d.rank <= 10 ? `You're #${d.rank} on the leaderboard!` : `Saved. Your best: ${d.best}`;
      msg.className = "go-msg ok";
      window.dataLayer?.push({ event: "game_score_saved", game_score: score, game_rank: d.rank });
    } catch (err) {
      msg.textContent = err.message || "Couldn't save the score. Try again."; msg.className = "go-msg err";
    }
    btn.disabled = false;
  });

  // ---------- sizes ----------
  let W = 360, H = 560, DPR = 1, WATER = 380;
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    WATER = Math.round(H * 0.66);
  }

  // ---------- state ----------
  const G = 2400;            // gravity, px/s²
  const CHARGE_S = 0.95;     // seconds to full power
  let state = "ready";       // ready | charge | jump | sink | over
  let pads = [], flies = [], parts = [], pops = [];
  let frog, cam, score, combo, charge, chargeT, jumpT, jump, onPad, standT, t, last, raf = 0, shake = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;

  function reset() {
    score = 0; combo = 0; charge = 0; standT = 0; t = 0; shake = 0;
    pads = []; flies = []; parts = []; pops = [];
    const first = { x: 90, w: 110, base: 90, amp: 0, ph: 0, sp: 0, sink: false, sunk: 0, flower: false };
    pads.push(first);
    onPad = first;
    frog = { x: first.x, y: WATER, vx: 0, vy: 0, rot: 0, squash: 0 };
    cam = frog.x - W * 0.28;
    while (pads.length < 6) addPad();
    state = "ready";
    over.hidden = true;
    run = { jumps: 0, t0: 0, ms: 0 };
  }

  // Difficulty grows with the score: smaller pads, wider gaps, then drifting and sinking pads.
  function addPad() {
    const prev = pads[pads.length - 1];
    const lvl = Math.min(1, score / 40);
    const w = rnd(lerp(80, 46, lvl), lerp(118, 70, lvl));
    const gap = rnd(lerp(70, 110, lvl), lerp(170, 250, lvl));
    const x = prev.base + prev.w / 2 + gap + w / 2;
    const n = pads.length;
    const moving = n > 8 && Math.random() < lerp(0.15, 0.4, lvl);
    const sink = n > 14 && !moving && Math.random() < lerp(0.15, 0.35, lvl);
    pads.push({ x, base: x, w, amp: moving ? rnd(16, 34) : 0, ph: rnd(0, 6.28), sp: rnd(1.1, 2), sink, sunk: 0, flower: moving });
    // A fly over some gaps: catch it mid-jump for a bonus point.
    if (Math.random() < 0.35) flies.push({ x: (prev.base + x) / 2 + rnd(-20, 20), y: WATER - rnd(70, 120), ph: rnd(0, 6.28), got: false });
  }

  // ---------- input: hold to charge, release to jump ----------
  function press() {
    if (state === "over") return;
    if (state === "ready" || state === "stand") { state = "charge"; chargeT = 0; }
  }
  function release() {
    if (state !== "charge") return;
    charge = Math.min(1, chargeT / CHARGE_S);
    const T = 0.42 + charge * 0.3;              // flight time
    const R = 40 + charge * 300;                // distance
    jump = { T, x0: frog.x, vx: R / T, vy0: -G * T / 2, t: 0, from: onPad };
    if (!run.t0) run.t0 = performance.now();
    run.jumps++;
    state = "jump";
    onPad = null;
    window.navigator.vibrate?.(8);
  }

  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); press(); });
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const isKey = (e) => e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter";
  dlg.addEventListener("keydown", (e) => {
    if (!isKey(e) || e.target.closest("button")) return;
    e.preventDefault();
    if (!e.repeat) press();
  });
  dlg.addEventListener("keyup", (e) => { if (isKey(e) && !e.target.closest("button")) { e.preventDefault(); release(); } });

  // ---------- update ----------
  function padX(p) { return p.base + Math.sin(t * p.sp + p.ph) * p.amp; }

  function land(p) {
    const off = Math.abs(frog.x - padX(p)) / (p.w / 2);
    const perfect = off < 0.28;
    combo = perfect ? combo + 1 : 0;
    const pts = 1 + (perfect ? Math.min(combo, 5) : 0);
    score += pts;
    pops.push({ x: frog.x, y: WATER - 70, text: perfect ? (combo > 1 ? `Perfect x${combo}  +${pts}` : `Perfect! +${pts}`) : "+1", life: 1, gold: perfect });
    onPad = p; standT = 0;
    frog.y = WATER; frog.squash = 1;
    ring(frog.x, WATER, perfect ? 7 : 4);
    state = "stand";
    while (pads.length && padX(pads[0]) < cam - 200) pads.shift();
    while (flies.length && flies[0].x < cam - 200) flies.shift();
    while (pads[pads.length - 1].base < cam + W * 2) addPad();
  }

  function splash() {
    state = "over";
    shake = 10;
    for (let i = 0; i < 22; i++) parts.push({ x: frog.x, y: WATER, vx: rnd(-160, 160), vy: rnd(-420, -160), life: rnd(0.6, 1), c: i % 3 ? "#9fd8ff" : "#ffffff", r: rnd(2, 4) });
    ring(frog.x, WATER, 10);
    window.navigator.vibrate?.([30, 40, 30]);
    const isBest = score > best;
    if (isBest) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch {} }
    run.ms = Math.round(performance.now() - (run.t0 || performance.now()));
    $("goScore").textContent = score;
    $("goBest").textContent = isBest && score > 0 ? "New best score!" : `Best: ${best}`;
    $("goBest").classList.toggle("new", isBest && score > 0);
    $("goMsg").textContent = ""; $("goMsg").className = "go-msg";
    $("goSave").hidden = true;
    renderTop("");
    const finalScore = score;
    loadTop(true).then(() => {
      renderTop("");
      if (state === "over" && score === finalScore && qualifies(finalScore)) {
        $("goSave").hidden = false;
        $("goName").value = savedName();
        $("goMsg").textContent = top.length && finalScore > top[0].s ? "New top score! Save it with your name:" : "You made the top 10! Save it with your name:";
        $("goMsg").className = "go-msg ok";
      }
    });
    setTimeout(() => { if (state === "over") { over.hidden = false; $("goAgain").focus({ preventScroll: true }); } }, 650);
    window.dataLayer?.push({ event: "game_over", game_score: score });
  }

  function ring(x, y, n) { for (let i = 0; i < n; i++) parts.push({ ring: true, x, y, r: 6 + i * 3, life: 1 - i * 0.08 }); }

  function step(dt) {
    t += dt;
    if (state === "charge") chargeT += dt;
    if (state === "stand" || state === "ready" || state === "charge") {
      if (onPad) {
        frog.x = padX(onPad);
        if (onPad.sink && state !== "ready") {
          standT += dt;
          onPad.sunk = Math.min(1, standT / 1.6);
          if (onPad.sunk >= 1) { state = "sink"; }
        }
      }
    }
    if (state === "sink") { frog.y += 60 * dt; if (frog.y > WATER + 10) splash(); }
    if (state === "jump") {
      jump.t += dt;
      const k = Math.min(jump.t, jump.T);
      frog.x = jump.x0 + jump.vx * k;
      frog.y = WATER + jump.vy0 * k + 0.5 * G * k * k;
      frog.rot = Math.atan2(jump.vy0 + G * k, jump.vx) * 0.35;
      for (const f of flies) {
        if (!f.got && Math.hypot(f.x - frog.x, f.y + Math.sin(t * 6 + f.ph) * 6 - (frog.y - 14)) < 26) {
          f.got = true; score += 1;
          pops.push({ x: f.x, y: f.y - 16, text: "Fly! +1", life: 1, gold: true });
          for (let i = 0; i < 8; i++) parts.push({ x: f.x, y: f.y, vx: rnd(-90, 90), vy: rnd(-120, 40), life: 0.6, c: "#ffc93c", r: 2 });
        }
      }
      if (jump.t >= jump.T) {
        frog.rot = 0;
        const hit = pads.find((p) => p.sunk < 1 && Math.abs(frog.x - padX(p)) <= p.w / 2 + 6);
        if (hit && hit === jump.from) { onPad = hit; frog.y = WATER; frog.squash = 1; state = "stand"; } // too short: no points
        else if (hit) land(hit); else splash();
      }
    }
    frog.squash = Math.max(0, frog.squash - dt * 5);
    const target = frog.x - W * 0.28;
    cam = lerp(cam, target, Math.min(1, dt * 4));
    for (const p of parts) {
      p.life -= dt * (p.ring ? 1.4 : 1);
      if (p.ring) p.r += 40 * dt;
      else { p.vy += G * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) { p.life -= dt * 0.9; p.y -= 30 * dt; }
    pops = pops.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt * 30);
  }

  // ---------- drawing ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, WATER);
    g.addColorStop(0, "#1b2850"); g.addColorStop(0.55, "#c25a5a"); g.addColorStop(1, "#ffc93c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, WATER);
    // sun
    ctx.fillStyle = "rgba(255, 236, 170, .95)";
    ctx.beginPath(); ctx.arc(W * 0.7, WATER - 30, 46, 0, Math.PI * 2); ctx.fill();
    // stars at the top
    ctx.fillStyle = "rgba(255,255,255,.6)";
    for (let i = 0; i < 18; i++) { const sx = ((i * 97.3 - cam * 0.05) % W + W) % W, sy = (i * 37) % (WATER * 0.35); ctx.fillRect(sx, sy, 1.5, 1.5); }
    // far volcano and hills (slow parallax)
    const off1 = -cam * 0.08;
    ctx.fillStyle = "#3a3060";
    ctx.beginPath(); ctx.moveTo(0, WATER);
    for (let x = -40; x <= W + 40; x += 40) { const wx = x - off1; ctx.lineTo(x, WATER - 40 - Math.sin(wx * 0.01) * 18 - Math.sin(wx * 0.023) * 10); }
    ctx.lineTo(W, WATER); ctx.fill();
    const vx = ((W * 0.3 + off1) % (W * 2) + W * 2) % (W * 2) - W * 0.4;
    ctx.fillStyle = "#2e2752";
    ctx.beginPath(); ctx.moveTo(vx - 140, WATER - 20); ctx.lineTo(vx - 14, WATER - 150); ctx.quadraticCurveTo(vx, WATER - 156, vx + 14, WATER - 150); ctx.lineTo(vx + 140, WATER - 20); ctx.fill();
    // palms and a nipa hut (mid parallax)
    const off2 = -cam * 0.35;
    for (let i = -1; i < 6; i++) {
      const seg = 230, x = ((i * seg + off2) % (seg * 6) + seg * 6) % (seg * 6) - seg;
      palm(x, WATER - 6, 70 + (i % 3) * 14, i % 2 ? 1 : -1);
      if (i % 3 === 0) hut(x + 80, WATER - 6);
    }
    // shore line
    ctx.fillStyle = "#1d2440"; ctx.fillRect(0, WATER - 8, W, 8);
  }
  function palm(x, y, h, lean) {
    ctx.strokeStyle = "#1d2440"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 14, y - h * 0.6, x + lean * 22, y - h); ctx.stroke();
    ctx.lineWidth = 4;
    const tx = x + lean * 22, ty = y - h;
    for (const [dx, dy] of [[-30, 8], [30, 10], [-20, -12], [24, -10], [0, -18]]) {
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + dx * 0.5, ty + dy - 12, tx + dx, ty + dy + 8); ctx.stroke();
    }
  }
  function hut(x, y) {
    ctx.fillStyle = "#1d2440";
    ctx.fillRect(x - 18, y - 22, 36, 22);
    ctx.beginPath(); ctx.moveTo(x - 28, y - 20); ctx.lineTo(x, y - 44); ctx.lineTo(x + 28, y - 20); ctx.fill();
    ctx.fillStyle = "rgba(255, 201, 60, .8)"; ctx.fillRect(x - 5, y - 16, 10, 9);
  }
  function drawWater() {
    const g = ctx.createLinearGradient(0, WATER, 0, H);
    g.addColorStop(0, "#2b6f8f"); g.addColorStop(1, "#10304a");
    ctx.fillStyle = g; ctx.fillRect(0, WATER, W, H - WATER);
    // sun reflection
    ctx.fillStyle = "rgba(255, 220, 140, .25)";
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.7 - 40 + Math.sin(t * 2 + i) * 8, WATER + 8 + i * 12, 80 - i * 10, 3);
    // ripples
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = WATER + 18 + (i * 29) % (H - WATER - 20);
      const x = ((i * 131 - cam * 1 + Math.sin(t + i) * 10) % (W + 80) + W + 80) % (W + 80) - 40;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + (i % 3) * 10, y); ctx.stroke();
    }
  }
  function drawPad(p) {
    const x = padX(p) - cam, y = WATER + 4 + p.sunk * 10;
    if (x < -p.w || x > W + p.w) return;
    ctx.save();
    ctx.globalAlpha = 1 - p.sunk * 0.6;
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(x, y + 6, p.w / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.sink ? (p.sunk > 0 ? "#a39a3c" : "#7f9b3a") : "#3f9a4a";
    ctx.beginPath(); ctx.ellipse(x, y, p.w / 2, 10, 0, 0.18, Math.PI * 2 - 0.18); ctx.lineTo(x, y); ctx.fill();
    ctx.strokeStyle = p.sink ? "#5b6b22" : "#2b6e35"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - 1, p.w / 2 - 8, 6, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    if (p.flower) { // drifting pads carry a pink lotus
      ctx.fillStyle = "#ff8fb1";
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x - p.w / 4 + Math.cos(i * 1.26) * 4, y - 6 + Math.sin(i * 1.26) * 2, 4, 6, i * 1.26, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#ffc93c"; ctx.beginPath(); ctx.arc(x - p.w / 4, y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawFly(f) {
    if (f.got) return;
    const x = f.x - cam, y = f.y + Math.sin(t * 6 + f.ph) * 6;
    if (x < -20 || x > W + 20) return;
    ctx.fillStyle = "rgba(255,255,255,.7)";
    const flap = Math.sin(t * 40) * 3;
    ctx.beginPath(); ctx.ellipse(x - 4, y - 4, 5, 3 + flap * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 4, y - 4, 5, 3 - flap * 0.3, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1d2440"; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 201, 60, .35)"; ctx.beginPath(); ctx.arc(x, y, 9 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawFrog() {
    const x = frog.x - cam, y = frog.y;
    const c = state === "charge" ? Math.min(1, chargeT / CHARGE_S) : 0;
    const air = state === "jump";
    const sq = c * 0.28 + frog.squash * 0.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(frog.rot);
    ctx.scale(1 + sq * 0.6, 1 - sq);
    if (state === "charge") ctx.translate(Math.sin(t * 60) * c * 1.2, 0);
    // back legs
    ctx.fillStyle = "#2f8f3e";
    if (air) {
      ctx.beginPath(); ctx.ellipse(-16, -8, 14, 5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-26, -2, 8, 3, 0.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(-12, -6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(12, -6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // body
    ctx.fillStyle = "#4cbf5a";
    ctx.beginPath(); ctx.ellipse(0, -16, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9f2a6";
    ctx.beginPath(); ctx.ellipse(4, -10, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    // front legs
    ctx.fillStyle = "#2f8f3e";
    if (air) { ctx.beginPath(); ctx.ellipse(16, -10, 9, 3.5, -0.4, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(6, -6, 4, 6); ctx.fillRect(-2, -6, 4, 6); }
    // eyes
    for (const ex of [-6, 8]) {
      ctx.fillStyle = "#4cbf5a"; ctx.beginPath(); ctx.arc(ex, -28, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -29, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#10182b"; ctx.beginPath(); ctx.arc(ex + 1.5, -29, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // smile, or an "o" in the air
    ctx.strokeStyle = "#1d5e2a"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (air) ctx.arc(8, -17, 2.5, 0, Math.PI * 2); else ctx.arc(4, -19, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // cheeks
    ctx.fillStyle = "rgba(255, 120, 140, .5)";
    ctx.beginPath(); ctx.arc(-9, -18, 2.5, 0, Math.PI * 2); ctx.arc(15, -18, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // power meter
    if (state === "charge") {
      const bw = 54, bx = x - bw / 2, by = y - 62;
      ctx.fillStyle = "rgba(16, 24, 43, .7)"; roundRect(bx - 3, by - 3, bw + 6, 12, 6); ctx.fill();
      ctx.fillStyle = c >= 1 ? "#e63946" : "#ffc93c"; roundRect(bx, by, bw * c, 6, 3); ctx.fill();
    }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, Math.max(0, w), h, r) : ctx.rect(x, y, Math.max(0, w), h); }
  function drawParts() {
    for (const p of parts) {
      const x = p.x - cam;
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.ring) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, p.y + 4, p.r * 1.8, p.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.font = `800 ${p.gold ? 17 : 15}px Archivo, system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(16,24,43,.8)"; ctx.strokeText(p.text, p.x - cam, p.y);
      ctx.fillStyle = p.gold ? "#ffc93c" : "#fff"; ctx.fillText(p.text, p.x - cam, p.y);
    }
    ctx.globalAlpha = 1;
  }
  function drawHud() {
    ctx.textAlign = "center";
    ctx.font = "800 44px 'Share Tech Mono', ui-monospace, monospace";
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(16,24,43,.55)";
    ctx.strokeText(String(score), W / 2, 58); ctx.fillStyle = "#fff"; ctx.fillText(String(score), W / 2, 58);
    ctx.font = "600 12px Archivo, system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(`BEST ${best}`, W / 2, 78);
    if (top[0]) {
      const label = `TOP ${top[0].s} · ${top[0].n}`;
      ctx.font = "700 12px Archivo, system-ui, sans-serif";
      const w = ctx.measureText(label).width + 34;
      ctx.fillStyle = "rgba(16, 24, 43, .55)"; roundRect(W / 2 - w / 2, 88, w, 22, 11); ctx.fill();
      ctx.fillStyle = "#ffc93c"; ctx.fillText("\u{1F451}", W / 2 - w / 2 + 13, 103.5);
      ctx.fillText(label, W / 2 + 8, 103.5);
    }
    if (state === "ready") {
      const a = 0.6 + Math.sin(t * 4) * 0.4;
      ctx.globalAlpha = a;
      ctx.font = "800 16px Archivo, system-ui, sans-serif"; ctx.fillStyle = "#fff";
      ctx.fillText("Hold to charge, let go to jump", W / 2, WATER + 70);
      ctx.font = "500 12.5px Archivo, system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.fillText("Land near the middle for Perfect combos. Catch flies!", W / 2, WATER + 92);
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    ctx.save();
    if (shake) ctx.translate(rnd(-shake, shake) * 0.4, rnd(-shake, shake) * 0.4);
    drawSky(); drawWater();
    for (const p of pads) drawPad(p);
    for (const f of flies) drawFly(f);
    if (state !== "over" || frog.y < WATER) drawFrog();
    drawParts();
    ctx.restore();
    drawHud();
  }

  // ---------- loop (only while open and visible) ----------
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    step(dt); draw();
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (dlg.open) start(); });
  window.addEventListener("resize", () => { if (dlg.open) { const k = WATER; resize(); frog.y += WATER - k; } });
  dlg.addEventListener("close", stop);

  $("goAgain").addEventListener("click", () => { reset(); canvas.focus({ preventScroll: true }); });

  return {
    loadTop,
    open() {
      if (!dlg.open) dlg.showModal();
      resize();
      loadTop();
      if (!frog || state === "over") reset();
      else frog.y = WATER;
      start();
      canvas.focus({ preventScroll: true });
    },
  };
})();
