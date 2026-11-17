// Radio Tuner: drag the dial (or arrow keys) to find the hidden station in the static.
// The signal meter rises as you get close; hold steady on the station to lock it in.
// Faster finds earn a time bonus; the clock gets shorter and the station narrower as you go.
FilGames.register("tuner", (api) => {
  const { rnd, lerp } = api;
  const LO = 88, HI = 108;
  const NAMES = ["Kanto FM", "Himig Probinsya", "Tsismis Radyo", "Kape't Kanta", "Biyaheng OPM", "Sayaw Hits", "Balita Tanghali",
    "Harana Nights", "Tambayan Radyo", "Jeepney Jams", "Barrio Beats", "Sari-Sari Songs", "Tanghalian FM", "Pasada Radyo"];
  let W, H, f, target, tol, lockT, timeLeft, timeMax, found, dragX, dir, t = 0, dead, reveal, noise;

  function size() { W = api.W; H = api.H; }
  function next() {
    found++;
    tol = lerp(0.22, 0.08, Math.min(1, found / 14));
    timeMax = lerp(16, 8, Math.min(1, found / 14));
    timeLeft = timeMax;
    do { target = Math.round(rnd(LO + 0.5, HI - 0.5) * 10) / 10; } while (Math.abs(target - f) < 3);
    lockT = 0;
  }
  const strength = () => Math.max(0, 1 - Math.abs(f - target) / 2.2);
  const dialX = (fr) => 30 + ((fr - LO) / (HI - LO)) * (W - 60);

  return {
    hint: ["Drag the dial to find the station", "Hold steady on the signal to lock it in"],
    hintY: () => H - 74,
    reset() {
      size();
      f = 98; found = -1; t = 0; dead = false; dir = 0; dragX = null; reveal = null;
      noise = Array.from({ length: 60 }, () => [Math.random(), Math.random()]);
      next();
    },
    resize() { size(); },
    idle(dt) { t += dt; },
    down(x, y, key) { if (!key) { dragX = x; api.action(); } },
    move(x, y, held) { if (!held || dragX == null || dead) return; f = Math.max(LO, Math.min(HI, f + (x - dragX) * (20 / Math.max(300, W * 1.4)))); dragX = x; },
    up() { dragX = null; },
    key(code, isDown) {
      if (code === "ArrowLeft") dir = isDown ? -1 : dir === -1 ? 0 : dir;
      if (code === "ArrowRight") dir = isDown ? 1 : dir === 1 ? 0 : dir;
      if (isDown) api.action();
    },
    step(dt) {
      t += dt;
      if (reveal && (reveal.life -= dt) <= 0) reveal = null;
      if (dead) return;
      if (dir) f = Math.max(LO, Math.min(HI, f + dir * 3 * dt));
      if (!api.actions) return;
      timeLeft -= dt;
      if (Math.abs(f - target) <= tol) {
        lockT += dt;
        if (lockT >= 1) {
          const bonus = Math.ceil((timeLeft / timeMax) * 5);
          const name = NAMES[found % NAMES.length];
          api.add(1 + bonus, W / 2, H * 0.3, `${target.toFixed(1)} ${name}! +${1 + bonus}`, true);
          api.burst(dialX(target), H * 0.74, 16, ["#ffc93c", "#fff", "#4cbf5a"], 160, 700, 2.5);
          api.vibrate(15);
          reveal = { text: name, freq: target, life: 1.4 };
          next();
        }
      } else lockT = Math.max(0, lockT - dt * 2);
      if (timeLeft <= 0) { dead = true; api.over("Signal lost! Your score"); }
    },
    draw(ctx) {
      const s = strength();
      ctx.fillStyle = "#10172a"; ctx.fillRect(0, 0, W, H);
      // radio body
      const bx = 14, by = 128, bw = W - 28, bh = H - 150;
      const body = ctx.createLinearGradient(0, by, 0, by + bh);
      body.addColorStop(0, "#7a4a2a"); body.addColorStop(1, "#4a2a14");
      ctx.fillStyle = body; api.rr(bx, by, bw, bh, 22); ctx.fill();
      // speaker grille
      ctx.fillStyle = "rgba(0,0,0,.35)";
      const gy = by + 20, gh = bh * 0.3;
      for (let y = gy; y < gy + gh; y += 9) for (let x = bx + 24; x < bx + bw - 24; x += 9) ctx.fillRect(x, y, 5, 5);
      // LCD
      const ly = gy + gh + 14, lh = Math.min(120, bh * 0.28);
      ctx.fillStyle = "#0b1020"; api.rr(bx + 18, ly, bw - 36, lh, 14); ctx.fill();
      ctx.save(); ctx.beginPath(); api.rr(bx + 18, ly, bw - 36, lh, 14); ctx.clip();
      // static
      ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - s)})`;
      for (const [a, b] of noise) { const nx = bx + 18 + ((a + t * 3.7 * b) % 1) * (bw - 36), ny = ly + ((b + t * 2.3) % 1) * lh; ctx.fillRect(nx, ny, 2, 2); }
      // waveform: noisy far away, clean sine when tuned
      ctx.strokeStyle = s > 0.9 ? "#4cbf5a" : "#ffc93c"; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= bw - 36; x += 4) {
        const yy = ly + lh * 0.62 + Math.sin(x * 0.08 + t * 10) * 12 * s + (Math.random() - 0.5) * 26 * (1 - s);
        x ? ctx.lineTo(bx + 18 + x, yy) : ctx.moveTo(bx + 18 + x, yy);
      }
      ctx.stroke();
      ctx.restore();
      ctx.font = "800 34px 'Share Tech Mono', monospace"; ctx.textAlign = "left"; ctx.fillStyle = "#ffc93c";
      ctx.fillText(`${f.toFixed(1)}`, bx + 34, ly + 40);
      ctx.font = "700 13px 'Share Tech Mono', monospace"; ctx.fillStyle = "rgba(255,201,60,.7)"; ctx.fillText("MHz FM", bx + 34 + ctx.measureText("000.0").width * 2.6, ly + 40);
      // signal meter
      for (let i = 0; i < 5; i++) {
        const on = s > i / 5 + 0.05;
        ctx.fillStyle = on ? (i >= 4 ? "#4cbf5a" : "#ffc93c") : "rgba(255,255,255,.15)";
        ctx.fillRect(bx + bw - 60 + i * 8, ly + 40 - i * 5, 5, 8 + i * 5);
      }
      if (reveal) { ctx.globalAlpha = Math.min(1, reveal.life); api.text(`\u{1F3B5} ${reveal.text}`, W / 2, ly + lh - 10, 14, "#4cbf5a", 800); ctx.globalAlpha = 1; }
      // dial
      const dy = ly + lh + 30;
      ctx.fillStyle = "#e8dcc4"; api.rr(bx + 14, dy - 20, bw - 28, 56, 12); ctx.fill();
      ctx.strokeStyle = "#4a2a14"; ctx.fillStyle = "#4a2a14"; ctx.lineWidth = 1.5; ctx.font = "600 11px 'Share Tech Mono', monospace"; ctx.textAlign = "center";
      for (let fr = LO; fr <= HI; fr += 1) {
        const x = dialX(fr), big = fr % 4 === 0;
        ctx.beginPath(); ctx.moveTo(x, dy - 12); ctx.lineTo(x, dy - (big ? 0 : 6)); ctx.stroke();
        if (big) ctx.fillText(String(fr), x, dy + 14);
      }
      // lock ring
      if (lockT > 0) { ctx.strokeStyle = "#4cbf5a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(dialX(f), dy - 4, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, lockT)); ctx.stroke(); }
      const nx = dialX(f);
      ctx.fillStyle = "#e63946"; ctx.fillRect(nx - 1.5, dy - 24, 3, 46);
      ctx.beginPath(); ctx.arc(nx, dy - 24, 5, 0, 7); ctx.fill();
      // knob hint
      api.text("←  drag  →", W / 2, dy + 60, 12, "rgba(255,255,255,.6)", 700);
    },
    hud(ctx) {
      const bw = Math.min(240, W * 0.55), bx = (W - bw) / 2, by = 116;
      ctx.fillStyle = "rgba(16,24,43,.6)"; api.rr(bx - 4, by - 4, bw + 8, 14, 7); ctx.fill();
      const k = Math.max(0, timeLeft / timeMax);
      ctx.fillStyle = k < 0.25 ? "#e63946" : "#4cbf5a"; api.rr(bx, by, bw * k, 6, 3); ctx.fill();
    },
  };
});
