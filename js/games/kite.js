// Saranggola: hold to rise, let go to drift down. Dodge birds, rival kites and storm clouds;
// grab banderitas (+1) and earn +1 for every obstacle you pass. Touching the rooftops ends the flight.
FilGames.register("kite", (api) => {
  const { rnd, lerp } = api;
  let started, W, H, GROUND, KX, ky, vy, lift, obs, flags, nextObs, nextFlag, dist, t = 0, dead, tail;
  const COLORS = ["#e63946", "#ffc93c", "#2347d6", "#4cbf5a", "#ff8fb1", "#b07cf0"];

  function size() { W = api.W; H = api.H; GROUND = Math.round(H * 0.84); KX = Math.round(W * 0.3); }
  const speed = () => lerp(150, 270, Math.min(1, api.score / 50));

  function spawnObs() {
    const lvl = Math.min(1, api.score / 40);
    const r = Math.random();
    const y = rnd(H * 0.2, GROUND - 60);
    if (r < 0.5) obs.push({ k: "bird", x: W + 40, y, base: y, r: 14, ph: rnd(0, 6), amp: rnd(20, 50), passed: false });
    else if (r < 0.8) obs.push({ k: "kite", x: W + 40, y, base: y, r: 20, ph: rnd(0, 6), amp: rnd(30, 70), c: COLORS[(Math.random() * 6) | 0], passed: false });
    else obs.push({ k: "cloud", x: W + 80, y: rnd(H * 0.22, H * 0.55), r: 34, ph: 0, amp: 0, passed: false });
    nextObs = rnd(lerp(1.5, 0.75, lvl), lerp(2.3, 1.3, lvl));
  }
  function spawnFlag() {
    flags.push({ x: W + 30, y: rnd(H * 0.2, GROUND - 80), c: COLORS[(Math.random() * 6) | 0], got: false });
    nextFlag = rnd(1.2, 2.6);
  }
  const oy = (o) => o.base == null ? o.y : o.base + Math.sin(t * (o.k === "bird" ? 3 : 1.4) + o.ph) * o.amp;

  function crash() {
    dead = true;
    api.shake(10);
    api.burst(KX, ky, 18, ["#e63946", "#ffc93c", "#fff"], 170, 900, 3);
    api.over("Snagged! Your score");
  }

  function drawKite(ctx, x, y, c, rot, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(16, 0); ctx.lineTo(0, 30); ctx.lineTo(-16, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(16, 0); ctx.lineTo(0, 0); ctx.fill();
    ctx.strokeStyle = "#5b3a1e"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 30); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.restore();
  }

  return {
    hint: ["Hold to rise, let go to drift", "Dodge birds and kites. Grab the banderitas!"],
    hintY: () => H * 0.62,
    reset() {
      size();
      ky = H * 0.45; vy = 0; lift = false; obs = []; flags = []; dist = 0; t = 0; dead = false;
      nextObs = 1.6; nextFlag = 0.8; tail = []; started = false;
    },
    resize() { size(); },
    idle(dt) { t += dt; ky = H * 0.45 + Math.sin(t * 2) * 8; },
    down() { lift = true; started = true; api.action(); },
    up() { lift = false; },
    step(dt) {
      t += dt;
      if (dead) { vy += 900 * dt; ky = Math.min(GROUND + 40, ky + vy * dt); return; }
      if (!started) { ky = H * 0.45 + Math.sin(t * 2) * 8; return; } // hovers until the first touch
      vy += (lift ? -1500 : 900) * dt;
      vy = Math.max(-380, Math.min(320, vy));
      ky += vy * dt;
      if (ky < 70) { ky = 70; vy = Math.max(0, vy); }
      const sp = speed();
      dist += sp * dt;
      if ((nextObs -= dt) <= 0) spawnObs();
      if ((nextFlag -= dt) <= 0) spawnFlag();
      for (const o of obs) {
        o.x -= sp * dt * (o.k === "cloud" ? 0.7 : o.k === "bird" ? 1.25 : 1);
        if (Math.hypot(o.x - KX, oy(o) - ky) < o.r + 12) { crash(); return; }
        if (!o.passed && o.x < KX - 30) { o.passed = true; api.add(1, KX, ky - 50, "+1", false); }
      }
      obs = obs.filter((o) => o.x > -80);
      for (const f of flags) {
        f.x -= sp * dt;
        if (!f.got && Math.hypot(f.x - KX, f.y - ky) < 26) {
          f.got = true;
          api.add(1, f.x, f.y - 20, "Banderita! +1", true);
          api.burst(f.x, f.y, 10, [f.c, "#fff"], 110, 500, 2.5);
        }
      }
      flags = flags.filter((f) => f.x > -30 && !f.got);
      if (ky > GROUND - 28) crash();
    },
    draw(ctx) {
      let g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#3d8be0"); g.addColorStop(0.75, "#a9dcf5"); g.addColorStop(1, "#fbe3a1");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // sun + soft clouds
      ctx.fillStyle = "rgba(255,240,180,.9)"; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.14, 30, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 190 - dist * 0.15) % (W + 160) + W + 160) % (W + 160) - 80, cy = H * 0.12 + (i * 53) % (H * 0.3);
        ctx.beginPath(); ctx.ellipse(cx, cy, 34, 11, 0, 0, 7); ctx.ellipse(cx + 20, cy - 7, 20, 11, 0, 0, 7); ctx.fill();
      }
      // fiesta town (parallax): houses, church tower, banderitas strings
      const seg = 70, off = -(dist * 0.5) % seg;
      for (let i = -1; i < W / seg + 2; i++) {
        const id = Math.floor((dist * 0.5) / seg) + i, hx = off + i * seg, hh = 36 + (Math.abs(id * 31) % 4) * 10;
        ctx.fillStyle = ["#f4a261", "#e9c46a", "#e76f51", "#f28482"][Math.abs(id) % 4];
        ctx.fillRect(hx + 6, GROUND - hh, seg - 12, hh);
        ctx.fillStyle = "#7a4a2a"; ctx.beginPath(); ctx.moveTo(hx + 2, GROUND - hh); ctx.lineTo(hx + seg / 2, GROUND - hh - 18); ctx.lineTo(hx + seg - 2, GROUND - hh); ctx.fill();
        if (Math.abs(id) % 9 === 4) { // church bell tower
          ctx.fillStyle = "#e8e0cf"; ctx.fillRect(hx + 18, GROUND - hh - 70, 26, 70);
          ctx.fillStyle = "#7a4a2a"; ctx.beginPath(); ctx.moveTo(hx + 14, GROUND - hh - 70); ctx.lineTo(hx + 31, GROUND - hh - 96); ctx.lineTo(hx + 48, GROUND - hh - 70); ctx.fill();
        }
      }
      ctx.fillStyle = "#6a994e"; ctx.fillRect(0, GROUND, W, H - GROUND);
      // banderitas strings above the roofs
      for (let i = -1; i < W / 140 + 2; i++) {
        const a = -(dist * 0.5) % 140 + i * 140;
        for (let k = 0; k < 7; k++) {
          const fx = a + k * 20, fy = GROUND - 70 + Math.sin(k / 6 * Math.PI) * 14;
          ctx.fillStyle = COLORS[k % 6]; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 12, fy); ctx.lineTo(fx + 6, fy + 11); ctx.fill();
        }
      }
      // collectible banderitas
      for (const f of flags) {
        ctx.save(); ctx.translate(f.x, f.y + Math.sin(t * 4 + f.x) * 3);
        ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
        ctx.fillStyle = f.c; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(0, 10); ctx.fill();
        ctx.restore();
      }
      // obstacles
      for (const o of obs) {
        const y = oy(o);
        if (o.k === "bird") {
          const f = Math.sin(t * 14 + o.ph) * 8;
          ctx.strokeStyle = "#1d2440"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(o.x - 14, y - f); ctx.quadraticCurveTo(o.x - 6, y - 8, o.x, y); ctx.quadraticCurveTo(o.x + 6, y - 8, o.x + 14, y - f); ctx.stroke();
        } else if (o.k === "kite") {
          drawKite(ctx, o.x, y, o.c, Math.sin(t * 2 + o.ph) * 0.3, 0.9);
          ctx.strokeStyle = "rgba(16,24,43,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o.x, y + 26); ctx.lineTo(o.x + 60, GROUND); ctx.stroke();
        } else {
          ctx.fillStyle = "#5c6378";
          ctx.beginPath(); ctx.arc(o.x - 18, y + 4, 22, 0, 7); ctx.arc(o.x + 8, y - 8, 26, 0, 7); ctx.arc(o.x + 28, y + 6, 18, 0, 7); ctx.fill();
          if (Math.sin(t * 7 + o.x) > 0.8) { ctx.strokeStyle = "#ffc93c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x, y + 24); ctx.lineTo(o.x - 6, y + 38); ctx.lineTo(o.x + 4, y + 38); ctx.lineTo(o.x - 4, y + 54); ctx.stroke(); }
        }
      }
      // our kite: string to the kid below, wavy tail
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(KX, ky + 20); ctx.quadraticCurveTo(KX - 40, (ky + H) / 2 + 30, KX - 90, H + 10); ctx.stroke();
      tail.unshift({ x: KX, y: ky + 30 }); if (tail.length > 14) tail.pop();
      ctx.strokeStyle = "#e63946"; ctx.lineWidth = 2; ctx.beginPath();
      tail.forEach((p, i) => { const tx = p.x - i * 5, ty = p.y + Math.sin(t * 9 - i * 0.7) * 4; i ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty); });
      ctx.stroke();
      tail.forEach((p, i) => { if (i % 4 === 3) { ctx.fillStyle = i % 8 === 3 ? "#ffc93c" : "#2347d6"; ctx.fillRect(p.x - i * 5 - 3, p.y + Math.sin(t * 9 - i * 0.7) * 4 - 3, 6, 6); } });
      drawKite(ctx, KX, ky, "#e63946", Math.max(-0.4, Math.min(0.4, vy / 900)) + (dead ? t * 6 : 0), 1.1);
    },
  };
});
