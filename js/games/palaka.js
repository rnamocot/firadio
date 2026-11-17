// Talon, Palaka! Hold to charge, let go to jump from lily pad to lily pad.
FilGames.register("palaka", (api) => {
  const { rnd, lerp } = api;
  const G = 2400, CHARGE_S = 0.95;
  let W, H, WATER, pads, flies, frog, onPad, jump, state, chargeT, standT, combo, t = 0;

  function size() { W = api.W; H = api.H; WATER = Math.round(H * 0.66); }
  const padX = (p) => p.base + Math.sin(t * p.sp + p.ph) * p.amp;

  function addPad() {
    const prev = pads[pads.length - 1];
    const lvl = Math.min(1, api.score / 40);
    const w = rnd(lerp(80, 46, lvl), lerp(118, 70, lvl));
    const gap = rnd(lerp(70, 110, lvl), lerp(170, 250, lvl));
    const x = prev.base + prev.w / 2 + gap + w / 2;
    const n = pads.length;
    const moving = n > 8 && Math.random() < lerp(0.15, 0.4, lvl);
    const sink = n > 14 && !moving && Math.random() < lerp(0.15, 0.35, lvl);
    pads.push({ x, base: x, w, amp: moving ? rnd(16, 34) : 0, ph: rnd(0, 6.28), sp: rnd(1.1, 2), sink, sunk: 0, flower: moving });
    if (Math.random() < 0.35) flies.push({ x: (prev.base + x) / 2 + rnd(-20, 20), y: WATER - rnd(70, 120), ph: rnd(0, 6.28), got: false });
  }

  function land(p) {
    const perfect = Math.abs(frog.x - padX(p)) / (p.w / 2) < 0.28;
    combo = perfect ? combo + 1 : 0;
    const pts = 1 + (perfect ? Math.min(combo, 5) : 0);
    api.add(pts, frog.x, WATER - 70, perfect ? (combo > 1 ? `Perfect x${combo}  +${pts}` : `Perfect! +${pts}`) : "+1", perfect);
    onPad = p; standT = 0; frog.y = WATER; frog.squash = 1;
    api.ring(frog.x, WATER, perfect ? 7 : 4);
    state = "stand";
    while (pads.length && padX(pads[0]) < api.cam - 200) pads.shift();
    while (flies.length && flies[0].x < api.cam - 200) flies.shift();
    while (pads[pads.length - 1].base < api.cam + W * 2) addPad();
  }
  function splash() {
    state = "dead";
    api.shake(10);
    api.burst(frog.x, WATER, 22, ["#9fd8ff", "#9fd8ff", "#ffffff"], 160, 1200, 3);
    api.ring(frog.x, WATER, 10);
    api.over("Splash! Your score");
  }

  // ---------- drawing ----------
  function palm(ctx, x, y, h, lean) {
    ctx.strokeStyle = "#1d2440"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 14, y - h * 0.6, x + lean * 22, y - h); ctx.stroke();
    ctx.lineWidth = 4;
    const tx = x + lean * 22, ty = y - h;
    for (const [dx, dy] of [[-30, 8], [30, 10], [-20, -12], [24, -10], [0, -18]]) {
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + dx * 0.5, ty + dy - 12, tx + dx, ty + dy + 8); ctx.stroke();
    }
  }
  function hut(ctx, x, y) {
    ctx.fillStyle = "#1d2440";
    ctx.fillRect(x - 18, y - 22, 36, 22);
    ctx.beginPath(); ctx.moveTo(x - 28, y - 20); ctx.lineTo(x, y - 44); ctx.lineTo(x + 28, y - 20); ctx.fill();
    ctx.fillStyle = "rgba(255, 201, 60, .8)"; ctx.fillRect(x - 5, y - 16, 10, 9);
  }
  function drawScene(ctx) {
    const cam = api.cam;
    let g = ctx.createLinearGradient(0, 0, 0, WATER);
    g.addColorStop(0, "#1b2850"); g.addColorStop(0.55, "#c25a5a"); g.addColorStop(1, "#ffc93c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, WATER);
    ctx.fillStyle = "rgba(255, 236, 170, .95)"; ctx.beginPath(); ctx.arc(W * 0.7, WATER - 30, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    for (let i = 0; i < 18; i++) ctx.fillRect(((i * 97.3 - cam * 0.05) % W + W) % W, (i * 37) % (WATER * 0.35), 1.5, 1.5);
    const off1 = -cam * 0.08;
    ctx.fillStyle = "#3a3060"; ctx.beginPath(); ctx.moveTo(0, WATER);
    for (let x = -40; x <= W + 40; x += 40) { const wx = x - off1; ctx.lineTo(x, WATER - 40 - Math.sin(wx * 0.01) * 18 - Math.sin(wx * 0.023) * 10); }
    ctx.lineTo(W, WATER); ctx.fill();
    const vx = ((W * 0.3 + off1) % (W * 2) + W * 2) % (W * 2) - W * 0.4;
    ctx.fillStyle = "#2e2752";
    ctx.beginPath(); ctx.moveTo(vx - 140, WATER - 20); ctx.lineTo(vx - 14, WATER - 150); ctx.quadraticCurveTo(vx, WATER - 156, vx + 14, WATER - 150); ctx.lineTo(vx + 140, WATER - 20); ctx.fill();
    const off2 = -cam * 0.35;
    for (let i = -1; i < 6; i++) {
      const seg = 230, x = ((i * seg + off2) % (seg * 6) + seg * 6) % (seg * 6) - seg;
      palm(ctx, x, WATER - 6, 70 + (i % 3) * 14, i % 2 ? 1 : -1);
      if (i % 3 === 0) hut(ctx, x + 80, WATER - 6);
    }
    ctx.fillStyle = "#1d2440"; ctx.fillRect(0, WATER - 8, W, 8);
    g = ctx.createLinearGradient(0, WATER, 0, H);
    g.addColorStop(0, "#2b6f8f"); g.addColorStop(1, "#10304a");
    ctx.fillStyle = g; ctx.fillRect(0, WATER, W, H - WATER);
    ctx.fillStyle = "rgba(255, 220, 140, .25)";
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.7 - 40 + Math.sin(t * 2 + i) * 8, WATER + 8 + i * 12, 80 - i * 10, 3);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = WATER + 18 + (i * 29) % Math.max(1, H - WATER - 20);
      const x = ((i * 131 - cam + Math.sin(t + i) * 10) % (W + 80) + W + 80) % (W + 80) - 40;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + (i % 3) * 10, y); ctx.stroke();
    }
  }
  function drawPad(ctx, p) {
    const x = padX(p) - api.cam, y = WATER + 4 + p.sunk * 10;
    if (x < -p.w || x > W + p.w) return;
    ctx.save();
    ctx.globalAlpha = 1 - p.sunk * 0.6;
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x, y + 6, p.w / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.sink ? (p.sunk > 0 ? "#a39a3c" : "#7f9b3a") : "#3f9a4a";
    ctx.beginPath(); ctx.ellipse(x, y, p.w / 2, 10, 0, 0.18, Math.PI * 2 - 0.18); ctx.lineTo(x, y); ctx.fill();
    ctx.strokeStyle = p.sink ? "#5b6b22" : "#2b6e35"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - 1, p.w / 2 - 8, 6, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    if (p.flower) {
      ctx.fillStyle = "#ff8fb1";
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x - p.w / 4 + Math.cos(i * 1.26) * 4, y - 6 + Math.sin(i * 1.26) * 2, 4, 6, i * 1.26, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#ffc93c"; ctx.beginPath(); ctx.arc(x - p.w / 4, y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawFly(ctx, f) {
    if (f.got) return;
    const x = f.x - api.cam, y = f.y + Math.sin(t * 6 + f.ph) * 6;
    if (x < -20 || x > W + 20) return;
    const flap = Math.sin(t * 40) * 3;
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.beginPath(); ctx.ellipse(x - 4, y - 4, 5, 3 + flap * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 4, y - 4, 5, 3 - flap * 0.3, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1d2440"; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 201, 60, .35)"; ctx.beginPath(); ctx.arc(x, y, 9 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawFrog(ctx) {
    const x = frog.x - api.cam, y = frog.y;
    const c = state === "charge" ? Math.min(1, chargeT / CHARGE_S) : 0;
    const air = state === "jump";
    const sq = c * 0.28 + frog.squash * 0.2;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(frog.rot); ctx.scale(1 + sq * 0.6, 1 - sq);
    if (state === "charge") ctx.translate(Math.sin(t * 60) * c * 1.2, 0);
    ctx.fillStyle = "#2f8f3e";
    if (air) {
      ctx.beginPath(); ctx.ellipse(-16, -8, 14, 5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-26, -2, 8, 3, 0.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(-12, -6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(12, -6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#4cbf5a"; ctx.beginPath(); ctx.ellipse(0, -16, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9f2a6"; ctx.beginPath(); ctx.ellipse(4, -10, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f8f3e";
    if (air) { ctx.beginPath(); ctx.ellipse(16, -10, 9, 3.5, -0.4, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(6, -6, 4, 6); ctx.fillRect(-2, -6, 4, 6); }
    for (const ex of [-6, 8]) {
      ctx.fillStyle = "#4cbf5a"; ctx.beginPath(); ctx.arc(ex, -28, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -29, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#10182b"; ctx.beginPath(); ctx.arc(ex + 1.5, -29, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#1d5e2a"; ctx.lineWidth = 1.8; ctx.beginPath();
    if (air) ctx.arc(8, -17, 2.5, 0, Math.PI * 2); else ctx.arc(4, -19, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 120, 140, .5)";
    ctx.beginPath(); ctx.arc(-9, -18, 2.5, 0, Math.PI * 2); ctx.arc(15, -18, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (state === "charge") {
      const bw = 54, bx = x - bw / 2, by = y - 62;
      ctx.fillStyle = "rgba(16, 24, 43, .7)"; api.rr(bx - 3, by - 3, bw + 6, 12, 6); ctx.fill();
      ctx.fillStyle = c >= 1 ? "#e63946" : "#ffc93c"; api.rr(bx, by, bw * c, 6, 3); ctx.fill();
    }
  }

  const m = {
    hint: ["Hold to charge, let go to jump", "Land near the middle for Perfect combos. Catch flies!"],
    hintY: () => WATER + 70,
    reset() {
      size();
      t = 0; combo = 0; standT = 0; chargeT = 0;
      pads = []; flies = [];
      const first = { x: 90, w: 110, base: 90, amp: 0, ph: 0, sp: 0, sink: false, sunk: 0, flower: false };
      pads.push(first); onPad = first;
      frog = { x: first.x, y: WATER, rot: 0, squash: 0 };
      api.cam = frog.x - W * 0.28;
      while (pads.length < 6) addPad();
      state = "stand";
    },
    resize() { const k = WATER; size(); if (frog) frog.y += WATER - k; },
    idle(dt) { t += dt; },
    down() {
      if (state === "stand") { state = "charge"; chargeT = 0; }
    },
    up() {
      if (state !== "charge") return;
      const c = Math.min(1, chargeT / CHARGE_S);
      const T = 0.42 + c * 0.3, R = 40 + c * 300;
      jump = { T, x0: frog.x, vx: R / T, vy0: -G * T / 2, t: 0, from: onPad };
      api.action();
      state = "jump"; onPad = null;
      api.vibrate(8);
    },
    step(dt) {
      t += dt;
      if (state === "charge") chargeT += dt;
      if ((state === "stand" || state === "charge") && onPad) {
        frog.x = padX(onPad);
        if (onPad.sink && api.playing && (api.score > 0 || state === "charge")) {
          standT += dt;
          onPad.sunk = Math.min(1, standT / 1.6);
          if (onPad.sunk >= 1) state = "sink";
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
            f.got = true;
            api.add(1, f.x, f.y - 16, "Fly! +1", true);
            api.burst(f.x, f.y, 8, ["#ffc93c"], 90, 600, 2);
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
      api.cam = lerp(api.cam, frog.x - W * 0.28, Math.min(1, dt * 4));
    },
    draw(ctx) {
      drawScene(ctx);
      for (const p of pads) drawPad(ctx, p);
      for (const f of flies) drawFly(ctx, f);
      if (state !== "dead" || frog.y < WATER) drawFrog(ctx);
    },
  };
  return m;
});
