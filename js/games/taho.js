// Taho Catch: drag (or arrow keys) to move the cup. Sago +1, arnibal +2, a full cup +3 bonus.
// Pebbles cost a life; three and you're out. Things fall faster as the score climbs.
FilGames.register("taho", (api) => {
  const { rnd, lerp } = api;
  let W, H, CY, cx, target, dir, items, next, lives, fill, t = 0, dead, hitT, moved;

  function size() { W = api.W; H = api.H; CY = Math.round(H * 0.86); }
  const lvl = () => Math.min(1, api.score / 60);

  function spawn() {
    const r = Math.random(), L = lvl();
    const k = r < lerp(0.18, 0.32, L) ? "rock" : r < 0.45 ? "arnibal" : "sago";
    items.push({ k, x: rnd(30, W - 30), y: 120, vy: rnd(lerp(150, 260, L), lerp(210, 380, L)), rot: rnd(0, 6), spin: rnd(-3, 3) });
    next = rnd(lerp(0.65, 0.32, L), lerp(1.0, 0.55, L));
  }

  function drawCup(ctx) {
    const w = 64, h = 70, x = cx - w / 2, y = CY - h;
    // taho layers inside the cup
    const level = fill / 10;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + w - 4, y + 6); ctx.lineTo(x + w - 10, CY); ctx.lineTo(x + 10, CY); ctx.closePath(); ctx.clip();
    ctx.fillStyle = "#f5ecd9"; ctx.fillRect(x, CY - h * 0.55, w, h);                             // silken tofu
    ctx.fillStyle = "rgba(196, 120, 40, .85)"; ctx.fillRect(x, CY - h * 0.55 - level * h * 0.35, w, level * h * 0.35); // arnibal
    ctx.fillStyle = "#6b3e1e";
    for (let i = 0; i < Math.round(level * 12); i++) { ctx.beginPath(); ctx.arc(x + 12 + (i * 17) % (w - 24), CY - h * 0.6 - ((i * 7) % 14), 4, 0, 7); ctx.fill(); }
    ctx.restore();
    // clear cup
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, CY); ctx.lineTo(x + w - 10, CY); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, CY); ctx.lineTo(x + w - 10, CY); ctx.lineTo(x + w, y); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)"; api.rr(x - 4, y - 4, w + 8, 6, 3); ctx.fill();
    if (hitT > 0) { ctx.fillStyle = `rgba(230,57,70,${hitT})`; ctx.beginPath(); ctx.arc(cx, CY - 35, 46, 0, 7); ctx.fill(); }
  }
  function drawItem(ctx, it) {
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    if (it.k === "sago") {
      ctx.fillStyle = "#5a3418"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.fill();
    } else if (it.k === "arnibal") {
      ctx.fillStyle = "#d4882c"; ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(11, 4, 0, 11); ctx.quadraticCurveTo(-11, 4, 0, -13); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(-3, 2, 3, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = "#7d8597"; ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-4, -11); ctx.lineTo(9, -8); ctx.lineTo(12, 4); ctx.lineTo(3, 11); ctx.lineTo(-9, 8); ctx.fill();
      ctx.fillStyle = "#5c6378"; ctx.beginPath(); ctx.arc(3, 2, 4, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  return {
    hint: ["Drag to move the cup", "Catch sago and arnibal. Dodge the pebbles!"],
    hintY: () => H * 0.55,
    reset() {
      size();
      cx = target = W / 2; dir = 0; items = []; next = 0.8; lives = 3; fill = 0; t = 0; dead = false; hitT = 0; moved = false;
    },
    resize() { size(); cx = target = Math.min(cx, W - 34); },
    idle(dt) { t += dt; },
    down(x, y, key) { if (!key) target = x; if (!moved) { moved = true; api.action(); } },
    move(x, y, held) { if (held || matchMedia("(pointer: fine)").matches) { target = x; if (!moved) { moved = true; api.action(); } } },
    key(code, isDown) {
      if (code === "ArrowLeft") dir = isDown ? -1 : dir === -1 ? 0 : dir;
      if (code === "ArrowRight") dir = isDown ? 1 : dir === 1 ? 0 : dir;
      if (isDown && !moved) { moved = true; api.action(); }
    },
    step(dt) {
      t += dt;
      hitT = Math.max(0, hitT - dt * 2);
      if (dead) return;
      if (dir) target = cx + dir * 600 * dt;
      target = Math.max(34, Math.min(W - 34, target));
      cx = lerp(cx, target, Math.min(1, dt * 14));
      if (moved && (next -= dt) <= 0) spawn(); // nothing falls until the first move
      for (const it of items) {
        it.y += it.vy * dt; it.rot += it.spin * dt;
        if (!it.done && it.y > CY - 74 && it.y < CY - 30 && Math.abs(it.x - cx) < 36) {
          it.done = true;
          if (it.k === "rock") {
            lives--; hitT = 1; api.shake(8); api.vibrate([25, 30, 25]);
            api.pop(cx, CY - 100, lives ? "Ouch! Pebble" : "Last pebble!", false);
            if (lives <= 0) { dead = true; api.over("Game over! Your score"); }
          } else {
            const pts = it.k === "arnibal" ? 2 : 1;
            api.add(pts, cx, CY - 96, `+${pts}`, pts === 2);
            api.burst(it.x, CY - 70, 6, it.k === "arnibal" ? ["#d4882c", "#fff"] : ["#5a3418", "#f5ecd9"], 80, 500, 2);
            fill++;
            if (fill >= 10) { fill = 0; api.add(3, cx, CY - 130, "Full cup! +3", true); api.burst(cx, CY - 80, 16, ["#ffc93c", "#fff", "#d4882c"], 160, 700, 3); }
          }
        }
      }
      items = items.filter((it) => !it.done && it.y < H + 30);
    },
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#ffd89b"); g.addColorStop(0.6, "#ffe9c7"); g.addColorStop(1, "#e9d5b5");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // morning street: houses and a sun
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(W * 0.18, H * 0.26, 34, 0, 7); ctx.fill();
      for (let i = 0; i < Math.ceil(W / 80) + 1; i++) {
        const hx = i * 80, hh = 70 + (i * 37) % 50;
        ctx.fillStyle = ["#f4a261", "#e9c46a", "#90be6d", "#f28482"][i % 4];
        ctx.globalAlpha = 0.35; ctx.fillRect(hx + 4, H * 0.62 - hh, 72, hh); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#c9b38f"; ctx.fillRect(0, CY + 2, W, H - CY);
      // magtataho: pole and two buckets swaying along the top
      const vx = W / 2 + Math.sin(t * 0.7) * W * 0.3, vy = 112;
      ctx.strokeStyle = "#7a4a2a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(vx - 60, vy - 6); ctx.lineTo(vx + 60, vy - 6); ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.strokeStyle = "rgba(122,74,42,.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(vx + s * 56, vy - 6); ctx.lineTo(vx + s * 48, vy + 8); ctx.moveTo(vx + s * 56, vy - 6); ctx.lineTo(vx + s * 64, vy + 8); ctx.stroke();
        ctx.fillStyle = "#c0c6d0"; api.rr(vx + s * 56 - 14, vy + 6, 28, 22, 4); ctx.fill();
        ctx.fillStyle = "#e63946"; ctx.fillRect(vx + s * 56 - 14, vy + 12, 28, 4);
      }
      api.text("Tahoooo!", vx, vy - 18, 12, "#fff", 800);
      for (const it of items) drawItem(ctx, it);
      drawCup(ctx);
    },
    hud(ctx) {
      for (let i = 0; i < 3; i++) {
        const x = 18 + i * 26, y = 20;
        ctx.globalAlpha = i < lives ? 1 : 0.25;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 20); ctx.lineTo(x + 14, y + 20); ctx.lineTo(x + 18, y); ctx.fill();
        ctx.fillStyle = "#d4882c"; ctx.fillRect(x + 3, y + 8, 12, 6);
      }
      ctx.globalAlpha = 1;
    },
  };
});
