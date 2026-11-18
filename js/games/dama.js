// Dama: Pinoy checkers with bottle caps, against the computer. 8x8 board, 12 caps each.
// Filipino rules: men move and capture diagonally forward only, captures are a must, a capture chain must be
// finished, and a man that reaches the far row becomes a dama (a flipped cap) that flies any distance and
// captures from afar. Win a board to climb a level (the computer thinks deeper); lose a board and the run ends.
// Score: +1 per man taken, +3 per dama taken, +2 for crowning a dama, win bonus 5 x level (max 30).
// The computer runs here in the browser (alpha-beta search with a time budget); no server calls.
FilGames.register("dama", (api) => {
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ME = 1, CPU = -1;
  const fwd = (side) => (side === ME ? -1 : 1);
  const lastRow = (side) => (side === ME ? 0 : 7);
  const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const sgn = Math.sign;

  // ---------- rules ----------
  function capturesFrom(b, sq, out) {
    const p = b[sq], side = sgn(p), king = Math.abs(p) === 2;
    const free = (q) => b[q] === 0 || q === sq; // the moving cap has left its square
    const rec = (r, c, path, caps) => {
      let more = false;
      for (const [dr, dc] of DIRS) {
        if (king) {
          let rr = r + dr, cc = c + dc;
          while (inb(rr, cc) && free(rr * 8 + cc)) { rr += dr; cc += dc; }
          if (!inb(rr, cc)) continue;
          const q = rr * 8 + cc;
          if (sgn(b[q]) !== -side || caps.includes(q)) continue;
          let lr = rr + dr, lc = cc + dc;
          while (inb(lr, lc) && free(lr * 8 + lc)) {
            more = true;
            rec(lr, lc, [...path, lr * 8 + lc], [...caps, q]);
            lr += dr; lc += dc;
          }
        } else {
          if (dr !== fwd(side)) continue;
          const lr = r + 2 * dr, lc = c + 2 * dc;
          if (!inb(lr, lc)) continue;
          const q = (r + dr) * 8 + c + dc;
          if (sgn(b[q]) !== -side || caps.includes(q) || !free(lr * 8 + lc)) continue;
          more = true;
          rec(lr, lc, [...path, lr * 8 + lc], [...caps, q]);
        }
      }
      if (!more && caps.length) out.push(mk(b, sq, path, caps));
    };
    rec(sq >> 3, sq & 7, [], []);
  }
  function mk(b, from, path, caps) {
    const p = b[from], to = path[path.length - 1];
    return { from, path, caps, promote: Math.abs(p) === 1 && (to >> 3) === lastRow(sgn(p)) };
  }
  function moves(b, side) {
    const caps = [];
    for (let sq = 0; sq < 64; sq++) if (sgn(b[sq]) === side) capturesFrom(b, sq, caps);
    if (caps.length) return caps;
    const out = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (sgn(p) !== side) continue;
      const r = sq >> 3, c = sq & 7;
      for (const [dr, dc] of DIRS) {
        if (Math.abs(p) === 1) {
          if (dr !== fwd(side)) continue;
          const rr = r + dr, cc = c + dc;
          if (inb(rr, cc) && b[rr * 8 + cc] === 0) out.push(mk(b, sq, [rr * 8 + cc], []));
        } else {
          let rr = r + dr, cc = c + dc;
          while (inb(rr, cc) && b[rr * 8 + cc] === 0) { out.push(mk(b, sq, [rr * 8 + cc], [])); rr += dr; cc += dc; }
        }
      }
    }
    return out;
  }
  function apply(b, m) {
    const nb = b.slice(), p = nb[m.from];
    nb[m.from] = 0;
    for (const q of m.caps) nb[q] = 0;
    nb[m.path[m.path.length - 1]] = m.promote ? 2 * sgn(p) : p;
    return nb;
  }

  // ---------- the computer ----------
  const STOP = {};
  let deadline = 0, nodes = 0;
  function evaluate(b) { // from ME's side
    let s = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p) continue;
      const r = sq >> 3, c = sq & 7, side = sgn(p);
      let v;
      if (Math.abs(p) === 2) v = 260 + (c > 1 && c < 6 && r > 1 && r < 6 ? 8 : 0);
      else {
        const adv = side === ME ? 7 - r : r;
        v = 100 + adv * 5 + (c > 1 && c < 6 ? 4 : 0) + (adv === 0 ? 6 : 0);
      }
      s += v * side;
    }
    return s;
  }
  function negamax(b, side, depth, alpha, beta, ply) {
    if ((++nodes & 255) === 0 && performance.now() > deadline) throw STOP;
    const ms = moves(b, side);
    if (!ms.length) return -100000 + ply;
    const forced = ms[0].caps.length > 0;
    if (depth <= 0 && (!forced || depth < -6)) return evaluate(b) * side;
    if (forced) ms.sort((x, y) => y.caps.length - x.caps.length);
    let best = -Infinity;
    for (const m of ms) {
      const v = -negamax(apply(b, m), -side, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function think(b, lvl) {
    const ms = moves(b, CPU);
    if (ms.length === 1) return ms[0];
    const randomChance = [0, 0.35, 0.15, 0.05][lvl] || 0;
    if (Math.random() < randomChance) return ms[Math.floor(Math.random() * ms.length)];
    const maxDepth = [0, 1, 2, 3, 4, 5, 6][lvl] || 9;
    const noise = lvl <= 2 ? 30 : lvl <= 4 ? 10 : 0;
    deadline = performance.now() + (lvl >= 6 ? 650 : 350);
    let pick = ms[0];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let best = -Infinity, top = [];
        for (const m of ms) {
          const v = -negamax(apply(b, m), ME, d - 1, -Infinity, Infinity, 1) + api.rnd(-noise, noise);
          if (v > best + 0.5) { best = v; top = [m]; } else if (v > best - 0.5) top.push(m);
        }
        pick = top[Math.floor(Math.random() * top.length)];
      } catch (e) { if (e !== STOP) throw e; break; }
    }
    return pick;
  }

  // ---------- state ----------
  let W, H, s, bx, by;
  let board, turn, level, legal, sel, partial, anim, banner, lastMove, quiet, plies, aiWait, t = 0, done;

  function size() {
    W = api.W; H = api.H;
    const top = 120, foot = 40;
    s = Math.floor(Math.max(24, Math.min((W - 20) / 8, (H - top - foot) / 8, 64)));
    bx = Math.round((W - 8 * s) / 2);
    by = Math.round(top + Math.max(0, (H - top - foot - 8 * s) / 2));
  }
  function newBoard() {
    board = new Array(64).fill(0);
    for (let sq = 0; sq < 64; sq++) {
      const r = sq >> 3, c = sq & 7;
      if ((r + c) % 2 === 1) board[sq] = r < 3 ? CPU : r > 4 ? ME : 0;
    }
    turn = ME; sel = -1; partial = []; anim = null; banner = null; lastMove = null;
    quiet = 0; plies = 0; aiWait = 0;
    legal = moves(board, ME);
  }
  const center = (sq) => [bx + (sq & 7) * s + s / 2, by + (sq >> 3) * s + s / 2];
  const count = (side) => board.reduce((n, p) => n + (sgn(p) === side ? 1 : 0), 0);
  const movable = () => new Set(legal.map((m) => m.from));
  const candidates = () => legal.filter((m) => m.from === sel && partial.every((q, i) => m.path[i] === q));

  function start(m, side) {
    const piece = board[m.from];
    board = board.slice(); board[m.from] = 0;
    anim = { m, side, piece, k: 0, t: 0, at: m.from, dur: hopDur(m.from, m.path[0]) };
    sel = -1; partial = [];
  }
  function hopDur(a, b) { return 0.09 + 0.035 * Math.abs((a >> 3) - (b >> 3)); }
  function hopDone() {
    const { m, side } = anim;
    const to = m.path[anim.k];
    if (m.caps[anim.k] != null) {
      const q = m.caps[anim.k], [cx, cy] = center(q), v = board[q];
      board[q] = 0;
      if (side === ME) {
        const pts = Math.abs(v) === 2 ? 3 : 1;
        api.add(pts, cx, cy - 6, Math.abs(v) === 2 ? "Dama! +3" : "+1", pts > 1);
        api.burst(cx, cy, 10, ["#2c6fd1", "#fff", "#ffc93c"], 120, 500, 3);
      } else {
        api.burst(cx, cy, 10, ["#d8343f", "#fff"], 120, 500, 3);
        api.shake(5); api.vibrate(25);
      }
    }
    anim.at = to; anim.k++; anim.t = 0;
    if (anim.k < m.path.length) { anim.dur = hopDur(to, m.path[anim.k]); return; }
    // move finished
    board[to] = m.promote ? 2 * side : anim.piece;
    const [tx, ty] = center(to);
    if (m.promote) {
      api.ring(tx, ty, 4, "rgba(255,201,60,.9)");
      if (side === ME) api.add(2, tx, ty - 20, "Crowned! +2", true);
    }
    quiet = m.caps.length || Math.abs(anim.piece) === 1 ? 0 : quiet + 1;
    plies++;
    lastMove = { from: m.from, to };
    anim = null;
    turn = -side; aiWait = 0;
    legal = moves(board, turn);
    if (!legal.length) {
      if (turn === CPU) win();
      else { done = true; api.over(count(ME) ? "Blocked, no moves left! Score" : "All your caps were taken! Score"); }
    } else if (quiet >= 30 || plies >= 200) {
      banner = { text: "Tabla! It's a draw", sub: `Replay level ${level}`, life: 2, next: () => newBoard() };
    } else if (turn === ME && new Set(legal.map((x) => x.from)).size === 1) sel = legal[0].from;
  }
  function win() {
    const bonus = Math.min(30, 5 * level);
    api.add(bonus, W / 2, by + 4 * s - 20, `Panalo! +${bonus}`, true);
    api.burst(W / 2, by + 4 * s, 30, ["#ffc93c", "#fff", "#d8343f"], 220, 600, 3.5);
    api.vibrate([20, 40, 20]);
    banner = { text: "Panalo! You win", sub: `Next: level ${level + 1}`, life: 2.2, next: () => { level++; newBoard(); } };
  }

  // ---------- drawing ----------
  function cap(ctx, x, y, R, side, king, alpha = 1) {
    ctx.globalAlpha = alpha;
    const base = side === ME ? ["#ff6b6b", "#d8343f", "#8e1b24"] : ["#7fb2ff", "#2c6fd1", "#173f80"];
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + R * 0.22, R * 0.98, R * 0.9, 0, 0, 7); ctx.fill();
    // crimped edge
    ctx.beginPath();
    for (let i = 0; i <= 42; i++) {
      const a = (i / 42) * Math.PI * 2, rr = i % 2 ? R * 0.9 : R;
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    if (king) { g.addColorStop(0, "#f4f4f2"); g.addColorStop(0.6, "#c9cbd0"); g.addColorStop(1, "#8b8f98"); }
    else { g.addColorStop(0, base[0]); g.addColorStop(0.6, base[1]); g.addColorStop(1, base[2]); }
    ctx.fillStyle = g; ctx.fill();
    if (king) {
      // a flipped cap shows its liner, colored by side, with a crown
      ctx.fillStyle = base[1]; ctx.beginPath(); ctx.arc(x, y, R * 0.7, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(x, y, R * 0.7, 0, 7); ctx.arc(x, y, R * 0.6, 0, 7, true); ctx.fill();
      const k = R * 0.42;
      ctx.fillStyle = "#ffc93c"; ctx.strokeStyle = "#7a5200"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - k, y + k * 0.55); ctx.lineTo(x - k, y - k * 0.45); ctx.lineTo(x - k * 0.5, y + k * 0.05);
      ctx.lineTo(x, y - k * 0.7); ctx.lineTo(x + k * 0.5, y + k * 0.05); ctx.lineTo(x + k, y - k * 0.45);
      ctx.lineTo(x + k, y + k * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, R * 0.66, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); ctx.ellipse(x - R * 0.28, y - R * 0.32, R * 0.28, R * 0.14, -0.6, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return {
    hint: ["Tap a red cap, then tap where to go", "Captures are a must. Reach the far row for a dama"],
    hintY: () => by + 4 * s - 4,
    reset() { size(); level = 1; t = 0; done = false; newBoard(); },
    resize() { size(); },
    idle(dt) { t += dt; },
    down(x, y, key) {
      if (key || turn !== ME || anim || banner || done || !api.playing) return;
      const c = Math.floor((x - bx) / s), r = Math.floor((y - by) / s);
      if (!inb(r, c)) { if (!partial.length) sel = -1; return; }
      const sq = r * 8 + c;
      if (sel >= 0) {
        const cand = candidates(), nexts = cand.map((m) => m.path[partial.length]);
        if (nexts.includes(sq)) {
          partial.push(sq);
          const left = cand.filter((m) => m.path[partial.length - 1] === sq);
          if (left.length === 1) { api.action(); start(left[0], ME); }
          return;
        }
      }
      if (movable().has(sq)) { sel = sq; partial = []; return; }
      if (!partial.length) sel = -1;
    },
    step(dt) {
      t += dt;
      if (banner) {
        if ((banner.life -= dt) <= 0) { const n = banner.next; banner = null; n(); }
        return;
      }
      if (anim) {
        anim.t += dt;
        while (anim && anim.t >= anim.dur) { anim.t -= anim.dur; hopDone(); }
        return;
      }
      if (turn === CPU && !done && api.playing) {
        aiWait += dt;
        if (aiWait >= 0.45) start(think(board, level), CPU);
      }
    },
    draw(ctx) {
      // a wooden table under a sari-sari store light
      const g = ctx.createRadialGradient(W / 2, by + 4 * s, 30, W / 2, H / 2, Math.max(W, H) * 0.8);
      g.addColorStop(0, "#5a3a22"); g.addColorStop(1, "#1d120b");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
      for (let y = 8; y < H; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + 6, W * 0.7, y - 6, W, y + 2); ctx.stroke(); }
      // board on cardboard
      ctx.fillStyle = "rgba(0,0,0,.4)"; api.rr(bx - 8, by - 4, 8 * s + 16, 8 * s + 16, 10); ctx.fill();
      ctx.fillStyle = "#c79a5b"; api.rr(bx - 8, by - 8, 8 * s + 16, 8 * s + 16, 10); ctx.fill();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#6e4527" : "#ecd9b0";
        ctx.fillRect(bx + c * s, by + r * s, s, s);
      }
      if (lastMove) {
        ctx.fillStyle = "rgba(255,201,60,.22)";
        for (const q of [lastMove.from, lastMove.to]) ctx.fillRect(bx + (q & 7) * s, by + (q >> 3) * s, s, s);
      }
      const R = s * 0.4;
      const mov = turn === ME && !anim && !banner && !done ? movable() : new Set();
      const forced = legal.length && legal[0].caps.length > 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p) continue;
        const [x, y] = center(sq);
        if (mov.has(sq) && sq !== sel && api.playing) {
          ctx.strokeStyle = forced ? `rgba(255,120,90,${0.55 + Math.sin(t * 6) * 0.3})` : `rgba(255,201,60,${0.35 + Math.sin(t * 4) * 0.2})`;
          ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, R + 4, 0, 7); ctx.stroke();
        }
        cap(ctx, x, y, R, sgn(p), Math.abs(p) === 2, sq === sel && partial.length ? 0.35 : 1);
      }
      if (sel >= 0) {
        const [x, y] = center(sel);
        ctx.strokeStyle = "#ffc93c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R + 4, 0, 7); ctx.stroke();
        if (partial.length) {
          ctx.strokeStyle = "rgba(255,201,60,.8)"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.moveTo(x, y);
          for (const q of partial) ctx.lineTo(...center(q));
          ctx.stroke(); ctx.setLineDash([]);
          const [ex, ey] = center(partial[partial.length - 1]);
          cap(ctx, ex, ey, R, ME, Math.abs(board[sel]) === 2);
        }
        for (const m of candidates()) {
          const [nx, ny] = center(m.path[partial.length]);
          ctx.fillStyle = m.caps.length ? "rgba(255,120,90,.85)" : "rgba(255,201,60,.85)";
          ctx.beginPath(); ctx.arc(nx, ny, s * 0.14 + Math.sin(t * 5) * 1.5, 0, 7); ctx.fill();
        }
      }
      if (anim) {
        const a = center(anim.at), b = center(anim.m.path[anim.k]), k = anim.t / anim.dur;
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const lift = anim.m.caps.length ? Math.sin(k * Math.PI) * s * 0.35 : 0;
        cap(ctx, api.lerp(a[0], b[0], ease), api.lerp(a[1], b[1], ease) - lift, R * (1 + lift / s * 0.4), anim.side, Math.abs(anim.piece) === 2);
      }
      // status line under the board
      const sy = by + 8 * s + 28;
      if (sy < H - 4 && !banner && !done && api.playing) {
        const msg = turn === CPU || (anim && anim.side === CPU) ? "Computer is thinking…" : forced ? "Capture is a must!" : "Your turn";
        api.text(msg, W / 2, sy, 14, turn === ME && forced ? "#ff9a7a" : "rgba(255,255,255,.85)", 700);
      }
      if (banner) {
        const a = Math.min(1, banner.life * 2.5, (2.2 - banner.life) * 5 + 0.2);
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = "rgba(16,24,43,.75)"; api.rr(W / 2 - 130, by + 4 * s - 42, 260, 76, 18); ctx.fill();
        api.text(banner.text, W / 2, by + 4 * s - 8, 24, "#ffc93c", 800);
        api.text(banner.sub, W / 2, by + 4 * s + 20, 13, "#fff", 600);
        ctx.globalAlpha = 1;
      }
    },
    hud(ctx) {
      api.text(`Level ${level}`, 16, 30, 14, "#fff", 800, "left");
      const r = 7, x = W - 16;
      api.text(String(count(CPU)), x, 30, 14, "#fff", 800, "right");
      cap(ctx, x - 30, 25, r, CPU, false);
      api.text(String(count(ME)), x - 46, 30, 14, "#fff", 800, "right");
      cap(ctx, x - 76, 25, r, ME, false);
    },
  };
});
