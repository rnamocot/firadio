// Tumbang Preso: the aim swings up and down; hold to lock it and build power, let go to throw your tsinelas.
// Knock the can down for points (streaks add a bonus). The wind changes every round. Three misses and you're out.
FilGames.register("tumbang", (api) => {
  const { rnd, lerp } = api;
  let gen = 0, W, H, GY, PX, canX, wind, angle, aimT, power, holding, shoe, can, lives, streak, round, t = 0, dead, armT;

  function size() { W = api.W; H = api.H; GY = Math.round(H * 0.8); PX = Math.round(Math.max(46, W * 0.13)); }
  function newRound() {
    const L = Math.min(1, round / 12);
    canX = PX + lerp(W * 0.42, W * 0.6, Math.random()) + L * W * 0.18;
    canX = Math.min(canX, W - 40);
    wind = Math.round(rnd(-1, 1) * lerp(40, 220, L));
    can = { x: canX, y: GY, vx: 0, vy: 0, rot: 0, down: false };
    shoe = null;
  }

  function drawShoe(ctx, x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = "#2347d6"; api.rr(-16, -5, 32, 10, 5); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(-14, -1, 28, 2);
    ctx.strokeStyle = "#e63946"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(4, -11); ctx.lineTo(10, -5); ctx.stroke();
    ctx.restore();
  }
  function drawCan(ctx) {
    ctx.save(); ctx.translate(can.x, can.y); ctx.rotate(can.rot);
    ctx.fillStyle = "#b9c0cb"; api.rr(-11, -34, 22, 34, 4); ctx.fill();
    ctx.fillStyle = "#e63946"; ctx.fillRect(-11, -26, 22, 14);
    ctx.fillStyle = "#ffc93c"; ctx.fillRect(-11, -20, 22, 3);
    ctx.fillStyle = "#8b93a1"; ctx.beginPath(); ctx.ellipse(0, -34, 11, 3, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function kid(ctx, x, y, throwing) {
    ctx.fillStyle = "#2b2f3a"; ctx.fillRect(x - 6, y - 22, 5, 22); ctx.fillRect(x + 1, y - 22, 5, 22);
    ctx.fillStyle = "#ff8f3c"; api.rr(x - 10, y - 48, 20, 28, 6); ctx.fill();
    ctx.fillStyle = "#c68642"; ctx.beginPath(); ctx.arc(x, y - 57, 9, 0, 7); ctx.fill();
    ctx.fillStyle = "#2b2f3a"; ctx.beginPath(); ctx.arc(x, y - 60, 9, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#c68642"; ctx.lineWidth = 4; ctx.lineCap = "round";
    const a = throwing ? -0.3 : -angle - 0.2;
    ctx.beginPath(); ctx.moveTo(x + 6, y - 42); ctx.lineTo(x + 6 + Math.cos(a) * 18, y - 42 + Math.sin(a) * 18); ctx.stroke();
  }

  return {
    hint: ["Hold to lock the aim and power up", "Let go to throw. Watch the wind!"],
    hintY: () => H * 0.42,
    reset() {
      size();
      gen++;
      lives = 3; streak = 0; round = 0; t = 0; dead = false; aimT = 0; power = 0; holding = false; angle = 0.6; armT = 0;
      newRound();
    },
    resize() { const k = canX / (W || 1); size(); canX = Math.min(W - 40, k * W); if (can && !can.down) { can.x = canX; can.y = GY; } },
    idle(dt) { t += dt; aimT += dt; angle = 0.25 + (Math.sin(aimT * 2.2) * 0.5 + 0.5) * 0.95; },
    down() { if (!shoe && !dead) { holding = true; power = 0; } },
    up() {
      if (!holding || shoe || dead) return;
      holding = false;
      const v = lerp(320, 880, power);
      shoe = { x: PX + 10, y: GY - 50, vx: Math.cos(angle) * v, vy: -Math.sin(angle) * v, rot: 0, done: false };
      armT = 0.25;
      api.action();
      api.vibrate(8);
    },
    step(dt) {
      t += dt; armT = Math.max(0, armT - dt);
      if (!holding && !shoe) { aimT += dt * lerp(1, 1.7, Math.min(1, round / 15)); angle = 0.25 + (Math.sin(aimT * 2.2) * 0.5 + 0.5) * 0.95; }
      if (holding) power = Math.min(1, power + dt / 1.1);
      if (shoe && !shoe.done) {
        shoe.vx += wind * dt; shoe.vy += 900 * dt;
        shoe.x += shoe.vx * dt; shoe.y += shoe.vy * dt; shoe.rot += 12 * dt;
        if (!can.down && Math.abs(shoe.x - can.x) < 18 && shoe.y > can.y - 38 && shoe.y < can.y + 2) {
          can.down = true; can.vx = shoe.vx * 0.5 + 120; can.vy = -380; shoe.done = true;
          streak++; round++;
          const pts = 1 + Math.min(streak - 1, 3);
          api.add(pts, can.x, can.y - 70, streak > 1 ? `Tumba! x${streak}  +${pts}` : "Tumba! +1", streak > 1);
          api.burst(can.x, can.y - 20, 14, ["#e63946", "#ffc93c", "#fff"], 150, 900, 2.5);
          api.shake(5);
          const g1 = gen; setTimeout(() => { if (!dead && g1 === gen) newRound(); }, 900);
        } else if (shoe.y > GY || shoe.x > W + 40 || shoe.x < -40) {
          shoe.done = true; streak = 0; lives--;
          api.pop(Math.min(W - 60, Math.max(60, shoe.x)), GY - 60, lives ? "Mintis!" : "Last tsinelas!", false);
          api.vibrate([20, 30, 20]);
          const g2 = gen;
          if (lives <= 0) { dead = true; setTimeout(() => { if (g2 === gen) api.over("Game over! Cans knocked"); }, 300); }
          else setTimeout(() => { if (g2 === gen && !dead && shoe?.done && !can.down) shoe = null; }, 500);
        }
      }
      if (can.down) { can.vy += 900 * dt; can.x += can.vx * dt; can.y = Math.min(GY, can.y + can.vy * dt); can.rot += 9 * dt; }
    },
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, GY);
      g.addColorStop(0, "#2c3e7a"); g.addColorStop(0.6, "#e07a5f"); g.addColorStop(1, "#f2cc8f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GY);
      // houses
      for (let i = 0; i < Math.ceil(W / 90) + 1; i++) {
        const hx = i * 90, hh = 80 + (i * 41) % 60;
        ctx.fillStyle = "rgba(29,36,64,.55)"; ctx.fillRect(hx + 6, GY - hh - 10, 78, hh);
        ctx.fillStyle = "rgba(255,201,60,.6)"; ctx.fillRect(hx + 20, GY - hh + 10, 12, 12); ctx.fillRect(hx + 52, GY - hh + 30, 12, 12);
      }
      // street
      ctx.fillStyle = "#8d7b68"; ctx.fillRect(0, GY, W, H - GY);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PX + 26, GY + 8); ctx.lineTo(PX + 26, H); ctx.stroke(); ctx.setLineDash([]);
      // wind sock
      const wx = W - 46, wy = 140;
      ctx.fillStyle = "#6b5b4b"; ctx.fillRect(wx, wy, 3, 46);
      const wl = Math.min(1, Math.abs(wind) / 220), sgn = Math.sign(wind) || 1;
      ctx.fillStyle = "#e63946";
      ctx.beginPath(); ctx.moveTo(wx + 2, wy); ctx.lineTo(wx + 2 + sgn * (10 + wl * 30), wy + 4 + (1 - wl) * 10 + Math.sin(t * 8) * 2); ctx.lineTo(wx + 2 + sgn * (10 + wl * 30), wy + 12 + (1 - wl) * 10 + Math.sin(t * 8) * 2); ctx.lineTo(wx + 2, wy + 16); ctx.fill();
      api.text(wind === 0 ? "No wind" : `Wind ${wind > 0 ? "→" : "←"} ${Math.abs(Math.round(wind / 22))}`, wx - 10, wy + 64, 12, "#fff", 700);
      // the can (on its circle) and the taya guarding it
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(canX, GY + 4, 26, 6, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.85; kid(ctx, canX + 46, GY, true); ctx.globalAlpha = 1;
      drawCan(ctx);
      // thrower + aim
      kid(ctx, PX, GY, armT > 0);
      if (!shoe && !dead) {
        const len = 44 + power * 40;
        const ax = PX + 10, ay = GY - 50;
        ctx.strokeStyle = holding ? "#ffc93c" : "rgba(255,255,255,.85)"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(angle) * len, ay - Math.sin(angle) * len); ctx.stroke(); ctx.setLineDash([]);
        drawShoe(ctx, ax + 4, ay + 4, -angle);
        if (holding) {
          ctx.fillStyle = "rgba(16,24,43,.7)"; api.rr(PX - 28, GY - 104, 62, 12, 6); ctx.fill();
          ctx.fillStyle = power >= 1 ? "#e63946" : "#ffc93c"; api.rr(PX - 25, GY - 101, 56 * power, 6, 3); ctx.fill();
        }
      }
      if (shoe && !shoe.done) drawShoe(ctx, shoe.x, shoe.y, shoe.rot);
    },
    hud(ctx) {
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < lives ? 1 : 0.25; drawShoe(ctx, 26 + i * 36, 30, -0.2); }
      ctx.globalAlpha = 1;
    },
  };
});
