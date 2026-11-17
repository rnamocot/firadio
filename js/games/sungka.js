// Sungka Solo: tap a pit to pick up its shells and sow them one by one toward your store (and around again).
// Each shell that drops into the store scores 1. If the last shell lands in the store, the move is free.
// Clear every pit for a +10 bonus and a fuller board. Out of moves ends the game.
FilGames.register("sungka", (api) => {
  const N = 7;
  let W, H, pits, moves, level, anim, t = 0, dead, layout, flash;

  function size() {
    W = api.W; H = api.H;
    const vertical = W < 480;
    const top = 178, bottom = H - 24;
    if (vertical) {
      const bw = Math.min(150, W * 0.42), cx = W / 2;
      const r = Math.min(30, (bottom - top - 110) / N / 2 - 4);
      const storeY = bottom - 50;
      layout = {
        vertical, board: [cx - bw / 2, top, bw, bottom - top], r,
        store: [cx, storeY, bw * 0.38, 40],
        pit: (i) => [cx, storeY - 70 - i * (r * 2 + 8)],
      };
    } else {
      const bh = Math.min(170, H * 0.36), cy = (top + bottom) / 2;
      const r = Math.min(32, (W - 150) / N / 2 - 5);
      const storeX = 56;
      layout = {
        vertical, board: [16, cy - bh / 2, W - 32, bh], r,
        store: [storeX, cy, 34, bh * 0.38],
        pit: (i) => [storeX + 70 + i * (r * 2 + 10), cy],
      };
    }
  }
  function deal() {
    level++;
    const total = 14 + level * 6;
    pits = Array(N).fill(0);
    for (let i = 0; i < total; i++) pits[Math.floor(Math.random() * N)]++;
    moves = Math.max(6, 11 - Math.floor(level / 2));
  }

  function sow(i) {
    let n = pits[i];
    if (!n || anim || dead) return;
    pits[i] = 0;
    const path = [];
    let p = i;               // pit index; -1 = the store; after the store, sowing wraps to the far pit
    while (n-- > 0) {
      p -= 1;
      if (p < -1) p = N - 1;
      path.push(p);
    }
    anim = { path, k: 0, tick: 0, from: i };
    api.action();
  }
  function finishMove(lastInStore) {
    if (pits.every((x) => x === 0)) {
      api.add(10, W / 2, 170, "Board cleared! +10", true);
      api.burst(W / 2, H / 2, 24, ["#ffc93c", "#fff", "#b07cf0"], 200, 600, 3);
      deal();
      return;
    }
    if (lastInStore) { flash = { text: "Libre! Free move", life: 1.2 }; return; }
    moves--;
    if (moves <= 0) { dead = true; api.over("Out of moves! Shells stored"); }
  }

  function shells(ctx, x, y, n, r) {
    for (let k = 0; k < Math.min(n, 14); k++) {
      const a = k * 2.4, d = Math.sqrt(k) * r * 0.22;
      ctx.fillStyle = k % 3 ? "#f5ecd9" : "#e9d8b8";
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 4.5, 3.2, a, 0, 7); ctx.fill();
    }
  }

  return {
    hint: ["Tap a pit to sow its shells", "Last shell in your store = free move"],
    hintY: () => 132,
    reset() { size(); level = 0; t = 0; dead = false; anim = null; flash = null; deal(); },
    resize() { size(); },
    idle(dt) { t += dt; },
    down(x, y, key) {
      if (key || anim || dead) return;
      for (let i = 0; i < N; i++) {
        const [px, py] = layout.pit(i);
        if (Math.hypot(x - px, y - py) < layout.r + 8 && pits[i]) { sow(i); return; }
      }
    },
    step(dt) {
      t += dt;
      if (flash && (flash.life -= dt) <= 0) flash = null;
      if (!anim) return;
      anim.tick += dt;
      while (anim && anim.tick >= 0.11) {
        anim.tick -= 0.11;
        const p = anim.path[anim.k++];
        if (p === -1) {
          const [sx, sy] = layout.store;
          api.add(1, sx, sy - 30, "+1", false);
        } else pits[p]++;
        if (anim.k >= anim.path.length) { const last = p === -1; anim = null; finishMove(last); }
      }
    },
    draw(ctx) {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.5, Math.max(W, H));
      g.addColorStop(0, "#3b2a4f"); g.addColorStop(1, "#151027");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // capiz window pattern in the back
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 26) for (let y = 0; y < H; y += 26) ctx.strokeRect(x + 2, y + 2, 22, 22);
      // board
      const [bx, by, bw, bh] = layout.board;
      const wood = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      wood.addColorStop(0, "#8a5a2b"); wood.addColorStop(1, "#5e3a1a");
      ctx.fillStyle = wood; api.rr(bx, by, bw, bh, 26); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2; api.rr(bx + 5, by + 5, bw - 10, bh - 10, 22); ctx.stroke();
      // store
      const [sx, sy, srx, sry] = layout.store;
      ctx.fillStyle = "#2e1b0c"; ctx.beginPath(); ctx.ellipse(sx, sy, srx, sry, 0, 0, 7); ctx.fill();
      shells(ctx, sx, sy, Math.min(14, api.score), Math.min(srx, sry) * 1.6);
      api.text("STORE", sx, sy + (layout.vertical ? sry + 18 : sry + 20), 11, "#ffc93c", 800);
      // pits
      for (let i = 0; i < N; i++) {
        const [px, py] = layout.pit(i), r = layout.r;
        const can = pits[i] > 0 && !anim && !dead;
        ctx.fillStyle = "#2e1b0c"; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        if (can) { ctx.strokeStyle = `rgba(255,201,60,${0.35 + Math.sin(t * 4 + i) * 0.2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.stroke(); }
        if (anim && anim.from === i) { ctx.strokeStyle = "#b07cf0"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.stroke(); }
        shells(ctx, px, py, pits[i], r);
        ctx.font = "700 12px 'Share Tech Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#ffc93c";
        if (layout.vertical) ctx.fillText(String(pits[i]), px + r + 16, py + 4); else ctx.fillText(String(pits[i]), px, py + r + 16);
      }
      // sowing direction arrow
      ctx.fillStyle = "rgba(255,201,60,.35)";
      if (layout.vertical) { const [px, py] = layout.pit(N - 1); api.text("↓ toward store", px, py - layout.r - 14, 11, "rgba(255,201,60,.8)", 700); }
      else { const [px, py] = layout.pit(N - 1); api.text("← toward store", px - 40, py - layout.r - 14, 11, "rgba(255,201,60,.8)", 700); }
      if (flash) { ctx.globalAlpha = Math.min(1, flash.life * 2); api.text(flash.text, W / 2, H * 0.5 - 4, 18, "#b07cf0", 800); ctx.globalAlpha = 1; }
    },
    hud(ctx) {
      api.text(`Moves ${moves}`, 16, 30, 14, moves <= 2 ? "#ff8f99" : "#fff", 800, "left");
      api.text(`Board ${level}`, W - 16, 30, 14, "#fff", 800, "right");
    },
  };
});
