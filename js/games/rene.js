// Rene, Shoot mo Bola!: barangay-court basketball. Drag back from anywhere to aim (like a slingshot), let go
// to shoot. 45 seconds on the clock: a basket is +2, a swish (nothing but net) is +3 and adds time, and three
// baskets in a row put you "on fire" for double points. From 6 points on, the ring starts to slide.
// Keyboard: arrows aim (left/right) and set power (up/down), Space shoots.
FilGames.register("rene", (api) => {
  const { rnd, lerp } = api;
  const TIME = 45, BONUS = 2, MAX_CLOCK = 60;
  let W, H, S, GY, BR, home, rim, ball, aim, drag, clock, streak, made, t = 0, gen = 0, net = 0, flash = 0, dead, shotT = -1;

  function size() {
    W = api.W; H = api.H; S = Math.min(W / 360, H / 600);
    GY = Math.round(H * 0.84);
    BR = Math.max(10, 13 * S);
    const px = Math.max(44, W * 0.17);
    home = { px, x: px + 13 * S, y: GY - 137 * S }; // feet at px; the ball in the hands above the forehead
  }
  // The ring: its centre (x, y), half width, and how far it slides.
  function placeRim(first) {
    const lvl = Math.min(1, made / 14);
    rim = {
      bx: lerp(W * 0.68, W * 0.8, Math.random()), y: lerp(H * 0.4, H * 0.3, Math.random() * (0.4 + lvl * 0.6)),
      hw: 24 * S, amp: made >= 3 ? lerp(10, 70, lvl) * S : 0, sp: lerp(0.9, 1.8, lvl), ph: first ? 0 : rnd(0, 6),
    };
    rim.x = rim.bx;
  }
  function newBall() {
    ball = { x: home.x, y: home.y, vx: 0, vy: 0, rot: 0, live: false, touched: false, scored: false, t: 0, floorT: 0 };
  }
  const g = () => 1500 * S;
  const vFor = (a, p) => lerp(520, 1180, p) * Math.sqrt(S);
  const front = () => ({ x: rim.x - rim.hw, y: rim.y });
  const back = () => ({ x: rim.x + rim.hw, y: rim.y });
  const board = () => ({ x: rim.x + rim.hw + 6 * S, top: rim.y - 70 * S, bot: rim.y + 14 * S });

  function shoot() {
    if (ball.live || dead) return;
    const v = vFor(aim.a, aim.p);
    ball.vx = Math.cos(aim.a) * v; ball.vy = -Math.sin(aim.a) * v;
    ball.live = true; ball.t = 0; shotT = 0;
    api.action(); api.vibrate(8);
  }
  function bounceOff(p, rest) {
    const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy), min = BR + 2.5 * S;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny;
    ball.x = p.x + nx * min; ball.y = p.y + ny * min;
    if (dot < 0) { ball.vx -= (1 + rest) * dot * nx; ball.vy -= (1 + rest) * dot * ny; ball.vx *= 0.92; }
    ball.touched = true;
    return true;
  }
  function score() {
    ball.scored = true; made++; streak++;
    const fire = streak >= 3, swish = !ball.touched;
    const pts = (swish ? 3 : 2) * (fire ? 2 : 1);
    api.add(pts, rim.x, rim.y - 40 * S, `${swish ? "Swish!" : "Shoot!"}${fire ? " x2" : ""}  +${pts}`, swish || fire);
    if (swish) { clock = Math.min(MAX_CLOCK, clock + BONUS); api.pop(rim.x, rim.y - 66 * S, `+${BONUS}s`, false); }
    api.burst(rim.x, rim.y + 10 * S, fire ? 20 : 12, fire ? ["#ff5c2b", "#ffc93c", "#fff"] : ["#ffc93c", "#fff"], 150, 700, 2.6);
    api.shake(fire ? 6 : 3);
    net = 1; flash = fire ? 1 : 0.5;
  }
  function endShot() {
    if (!ball.scored) { if (streak >= 3) api.pop(W / 2, H * 0.22, "Lamig na!", false); streak = 0; }
    const g1 = gen;
    if (ball.scored) setTimeout(() => { if (g1 === gen && !dead) placeRim(); }, 120);
    newBall();
  }

  // ---------- drawing ----------
  function drawBall(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const gr = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, "#ffb15c"); gr.addColorStop(0.6, "#f07b1d"); gr.addColorStop(1, "#b2500c");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#4a2208"; ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.85, 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();
    ctx.restore();
  }
  // The shooter: a street-ball player seen 3/4 from the side, facing the ring. Outlined shapes with soft
  // shading. Crouches as you pull back; on release he jumps and follows through (arm up, wrist flicked).
  const SKIN = "#b07246", SKIN_L = "#c98a5a", SKIN_D = "#8a5532", LINE = "#3b2213", HAIR = "#141318";
  const JER = "#e63946", JER_D = "#b3202d", SHO = "#2347d6", SHO_D = "#16308f";
  // a limb as a tapered, outlined capsule chain
  function limb(ctx, pts, w0, w1, fill) {
    for (const [col, extra] of [[LINE, 2.4 * S], [fill, 0]]) {
      ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 0; i < pts.length - 1; i++) {
        const k = i / Math.max(1, pts.length - 2);
        ctx.lineWidth = lerp(w0, w1, k) + extra;
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
      }
    }
  }
  function poly(ctx, pts, fill, line = LINE) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1.2 * S; ctx.lineJoin = "round"; ctx.stroke();
  }
  function sneaker(ctx, x, y) {
    const s = S;
    poly(ctx, [[x - 6 * s, y - 2 * s], [x - 6 * s, y - 10 * s], [x + 1 * s, y - 11 * s], [x + 4 * s, y - 7 * s], [x + 12 * s, y - 5 * s], [x + 13 * s, y - 2 * s]], "#f4f6fa");
    ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 5 * s); ctx.quadraticCurveTo(x + 3 * s, y - 9 * s, x + 8 * s, y - 5 * s); ctx.lineTo(x + 3 * s, y - 4 * s); ctx.fill();
    ctx.fillStyle = "#1d2440"; api.rr(x - 6.5 * s, y - 2.5 * s, 20 * s, 3 * s, 1.5 * s); ctx.fill();
  }
  // where the hands hold the ball (above and in front of the forehead), for a feet position and crouch
  const holdAt = (x, bend) => ({ x: x + 13 * S, y: GY - 137 * S + bend });
  // x = feet centre; crouch 0..1 (pull strength); jt = seconds since the shot (or -1 while holding the ball)
  function drawPlayer(ctx, x, crouch, jt) {
    const s = S, shooting = jt >= 0 && jt < 0.7;
    const jump = shooting ? Math.max(0, Math.sin(Math.min(1, jt / 0.55) * Math.PI)) * 18 * s : 0;
    const bend = shooting ? 0 : crouch * 10 * s;
    const fy = GY - jump;
    const hipY = fy - 64 * s + bend, shY = fy - 100 * s + bend, headY = fy - 114 * s + bend;
    const footB = [x - 7 * s, fy], footF = [x + 7 * s, fy];
    const kneeB = [x - 4 * s + bend * 0.9, fy - 34 * s + bend * 0.35], kneeF = [x + 10 * s + bend * 0.9, fy - 34 * s + bend * 0.35];
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 2 * s, GY + 2 * s, Math.max(8 * s, 20 * s - jump * 0.4), 4 * s, 0, 0, 7); ctx.fill();
    // back leg (darker), sock, shoe
    limb(ctx, [[x - 3 * s, hipY + 4 * s], kneeB, [footB[0] + 1 * s, fy - 9 * s]], 11 * s, 8.5 * s, SKIN_D);
    limb(ctx, [[footB[0] + 1 * s, fy - 14 * s], [footB[0] + 1 * s, fy - 9 * s]], 9 * s, 9 * s, "#dfe3ea");
    sneaker(ctx, footB[0], fy);
    // back (guide) arm behind the body: shoulder -> elbow out to the side
    const hold = holdAt(x, bend);
    const shB = [x - 6 * s, shY + 3 * s], shF = [x + 7 * s, shY + 3 * s];
    if (!shooting) limb(ctx, [shB, [x - 13 * s, shY - 12 * s], [hold.x - BR * 0.95, hold.y + 1 * s]], 8 * s, 6.5 * s, SKIN_D);
    else limb(ctx, [shB, [x - 6 * s, shY - 22 * s], [x + 2 * s, shY - 36 * s]], 8 * s, 6.5 * s, SKIN_D);
    // shorts: long, loose, with a side stripe; one hem per leg
    poly(ctx, [[x - 13 * s, hipY - 2 * s], [x + 13 * s, hipY - 2 * s], [x + 18 * s + bend * 0.8, hipY + 26 * s], [x + 3 * s + bend * 0.8, hipY + 28 * s],
               [x + 1 * s + bend * 0.6, hipY + 20 * s], [x - 1 * s + bend * 0.6, hipY + 28 * s], [x - 13 * s + bend * 0.6, hipY + 26 * s]], SHO);
    ctx.fillStyle = SHO_D; ctx.beginPath(); ctx.moveTo(x - 13 * s, hipY - 2 * s); ctx.lineTo(x - 6 * s, hipY - 2 * s); ctx.lineTo(x - 7 * s + bend * 0.6, hipY + 26 * s); ctx.lineTo(x - 13 * s + bend * 0.6, hipY + 26 * s); ctx.fill();
    ctx.fillStyle = "#ffc93c"; ctx.beginPath(); ctx.moveTo(x + 10 * s, hipY - 1 * s); ctx.lineTo(x + 12.5 * s, hipY - 1 * s); ctx.lineTo(x + 16 * s + bend * 0.8, hipY + 25 * s); ctx.lineTo(x + 13.5 * s + bend * 0.8, hipY + 25 * s); ctx.fill();
    // front leg below the shorts, sock, shoe
    limb(ctx, [[x + 9 * s + bend * 0.8, hipY + 22 * s], kneeF, [footF[0] + 1 * s, fy - 9 * s]], 10.5 * s, 8.5 * s, SKIN);
    ctx.fillStyle = SKIN_L; ctx.beginPath(); ctx.ellipse(kneeF[0] + 1 * s, kneeF[1], 2.2 * s, 3.2 * s, 0, 0, 7); ctx.fill(); // knee light
    limb(ctx, [[footF[0] + 1 * s, fy - 15 * s], [footF[0] + 1 * s, fy - 9 * s]], 9.5 * s, 9.5 * s, "#f4f6fa");
    sneaker(ctx, footF[0], fy);
    // shoulders (skin) under the tank top
    ctx.fillStyle = SKIN; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
    for (const p of [shB, shF]) { ctx.beginPath(); ctx.arc(p[0], p[1], 5.5 * s, 0, 7); ctx.fill(); ctx.stroke(); }
    // tank-top jersey: tapered, with armholes, neck trim, name and number
    poly(ctx, [[x - 9 * s, shY - 1 * s], [x - 3 * s, shY + 4 * s], [x + 4 * s, shY + 4 * s], [x + 10 * s, shY - 1 * s], [x + 13 * s, shY + 9 * s],
               [x + 14 * s, hipY + 2 * s], [x - 13 * s, hipY + 2 * s], [x - 12 * s, shY + 9 * s]], JER);
    ctx.fillStyle = JER_D; ctx.beginPath(); ctx.moveTo(x - 12 * s, shY + 9 * s); ctx.lineTo(x - 6 * s, shY + 8 * s); ctx.lineTo(x - 6 * s, hipY + 2 * s); ctx.lineTo(x - 13 * s, hipY + 2 * s); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(x - 6 * s, shY + 1.5 * s); ctx.quadraticCurveTo(x + 0.5 * s, shY + 8 * s, x + 7 * s, shY + 1.5 * s); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = `800 ${6 * s}px Archivo, system-ui, sans-serif`; ctx.fillText("RENE", x + 1.5 * s, shY + 16 * s);
    ctx.font = `900 ${12 * s}px Archivo, system-ui, sans-serif`; ctx.fillText("23", x + 1.5 * s, shY + 28 * s);
    // neck and head, 3/4 view facing right
    limb(ctx, [[x + 1 * s, shY + 1 * s], [x + 2 * s, headY + 7 * s]], 7 * s, 7 * s, SKIN_D);
    const hg = ctx.createRadialGradient(x + 4 * s, headY - 3 * s, 1 * s, x + 2 * s, headY, 11 * s);
    hg.addColorStop(0, SKIN_L); hg.addColorStop(1, SKIN);
    ctx.fillStyle = hg; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); // skull + jaw
    ctx.moveTo(x - 6 * s, headY - 2 * s);
    ctx.bezierCurveTo(x - 7 * s, headY - 13 * s, x + 10 * s, headY - 14 * s, x + 10 * s, headY - 3 * s);
    ctx.lineTo(x + 11.5 * s, headY + 1 * s); ctx.lineTo(x + 10 * s, headY + 2 * s); // nose
    ctx.quadraticCurveTo(x + 10 * s, headY + 8 * s, x + 6 * s, headY + 9.5 * s); // chin
    ctx.quadraticCurveTo(x - 1 * s, headY + 10 * s, x - 4 * s, headY + 5 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.ellipse(x - 2 * s, headY + 1 * s, 2 * s, 3 * s, 0, 0, 7); ctx.fill(); ctx.stroke(); // ear
    ctx.fillStyle = HAIR; ctx.beginPath(); // short fade
    ctx.moveTo(x - 6.5 * s, headY - 1 * s); ctx.bezierCurveTo(x - 8 * s, headY - 14 * s, x + 9 * s, headY - 15 * s, x + 9.5 * s, headY - 5 * s);
    ctx.lineTo(x + 3 * s, headY - 7 * s); ctx.lineTo(x - 0.5 * s, headY - 4 * s); ctx.lineTo(x - 3 * s, headY - 1 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffc93c"; ctx.beginPath(); // headband
    ctx.moveTo(x - 6.6 * s, headY - 4 * s); ctx.lineTo(x + 9.8 * s, headY - 6.5 * s); ctx.lineTo(x + 10 * s, headY - 3.6 * s); ctx.lineTo(x - 6.4 * s, headY - 1 * s); ctx.fill();
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1.3 * s; ctx.beginPath(); ctx.moveTo(x + 4.5 * s, headY - 2.2 * s); ctx.lineTo(x + 8.5 * s, headY - 2.8 * s); ctx.stroke(); // brow
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x + 7 * s, headY, 1.7 * s, 1.2 * s, 0, 0, 7); ctx.fill(); // eye looking up at the ring
    ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(x + 7.6 * s, headY - 0.3 * s, 0.85 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = LINE; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.moveTo(x + 6 * s, headY + 6 * s); ctx.lineTo(x + 8.6 * s, headY + 5.6 * s); ctx.stroke(); // mouth
    if (!shooting) {
      // the ball sits in the hands; the shooting hand is under it, the guide hand on its side
      drawBall(ctx, hold.x, hold.y, BR, 0.3);
      limb(ctx, [shF, [x + 17 * s, shY - 10 * s], [hold.x + 2 * s, hold.y + BR * 0.85]], 8.5 * s, 7 * s, SKIN);
      ctx.fillStyle = SKIN; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
      ctx.beginPath(); ctx.ellipse(hold.x + 3 * s, hold.y + BR * 0.75, 4.2 * s, 3 * s, -0.3, 0, 7); ctx.fill(); ctx.stroke(); // shooting hand
      ctx.beginPath(); ctx.ellipse(hold.x - BR * 0.9, hold.y + 1 * s, 2.8 * s, 4.2 * s, 0.2, 0, 7); ctx.fill(); ctx.stroke(); // guide hand
    } else {
      // follow-through: arm straight up toward the ring, wrist flicked down ("goose neck")
      const k = Math.min(1, jt / 0.18);
      const elbow = [x + 14 * s, shY - lerp(10, 22, k) * s], wrist = [x + 18 * s, shY - lerp(18, 44, k) * s];
      limb(ctx, [shF, elbow, wrist], 8.5 * s, 7 * s, SKIN);
      ctx.fillStyle = SKIN; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
      ctx.beginPath(); ctx.ellipse(wrist[0] + 3 * s, wrist[1] + 2.5 * k * s, 3 * s, 4.4 * s, -0.6, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
  function drawHoopBack(ctx) {
    const b = board(), poleX = b.x + 26 * S;
    ctx.fillStyle = "#3a4256"; ctx.fillRect(poleX, b.top + 20 * S, 8 * S, GY - b.top - 20 * S);
    ctx.fillRect(b.x, b.top + 30 * S, poleX - b.x + 4 * S, 5 * S);
    ctx.fillStyle = "#f4f6fa"; api.rr(b.x, b.top, 8 * S, b.bot - b.top, 2 * S); ctx.fill();
    ctx.fillStyle = "#c9d2df"; ctx.fillRect(b.x + 5 * S, b.top, 3 * S, b.bot - b.top);
    ctx.strokeStyle = "#e63946"; ctx.lineWidth = 2 * S; ctx.strokeRect(b.x + 1 * S, rim.y - 34 * S, 6 * S, 26 * S);
    // back half of the ring
    ctx.strokeStyle = "#c4561b"; ctx.lineWidth = 3.5 * S;
    ctx.beginPath(); ctx.ellipse(rim.x, rim.y, rim.hw, 6 * S, 0, Math.PI, 0); ctx.stroke();
  }
  function drawHoopFront(ctx) {
    // net (sways after a basket)
    const sway = Math.sin(t * 30) * net * 5 * S, depth = 34 * S * (1 + net * 0.25);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.4;
    for (let i = 0; i <= 6; i++) {
      const x0 = rim.x - rim.hw + (i / 6) * rim.hw * 2, x1 = rim.x - rim.hw * 0.55 + (i / 6) * rim.hw * 1.1 + sway;
      ctx.beginPath(); ctx.moveTo(x0, rim.y + 2 * S); ctx.lineTo(x1, rim.y + depth); ctx.stroke();
    }
    for (let j = 1; j <= 3; j++) {
      const k = j / 3, half = lerp(rim.hw, rim.hw * 0.55, k);
      ctx.beginPath(); ctx.moveTo(rim.x - half + sway * k, rim.y + depth * k); ctx.lineTo(rim.x + half + sway * k, rim.y + depth * k); ctx.stroke();
    }
    ctx.strokeStyle = flash > 0 ? "#ffb15c" : "#f07b1d"; ctx.lineWidth = 3.5 * S;
    ctx.beginPath(); ctx.ellipse(rim.x, rim.y, rim.hw, 6 * S, 0, 0, Math.PI); ctx.stroke();
  }

  return {
    hint: ["Drag back to aim, let go to shoot", "Swish = +3 and more time. 3 in a row = on fire!"],
    hintY: () => H * 0.6,
    reset() {
      size(); gen++;
      clock = TIME; streak = 0; made = 0; t = 0; net = 0; flash = 0; dead = false; shotT = -1;
      aim = { a: 1.0, p: 0.55 }; drag = null;
      placeRim(true); newBall();
    },
    resize(nW, nH, oW, oH) {
      const kx = rim ? rim.bx / (oW || 1) : 0.75, ky = rim ? rim.y / (oH || 1) : 0.35;
      size();
      if (rim) { rim.bx = kx * W; rim.y = ky * H; rim.hw = 24 * S; }
      if (ball && !ball.live) { ball.x = home.x; ball.y = home.y; }
    },
    idle(dt) { t += dt; net = Math.max(0, net - dt); if (rim) rim.x = rim.bx; },
    down(x, y, kb) { if (dead || ball.live) return; drag = kb ? null : { x, y }; },
    move(x, y) {
      if (!drag || ball.live) return;
      // pulling down-left shoots up-right (screen y grows downward)
      const dx = drag.x - x, dy = y - drag.y, d = Math.hypot(dx, dy);
      if (d < 6) return;
      aim.a = Math.max(0.2, Math.min(1.45, Math.atan2(dy, dx)));
      aim.p = Math.min(1, d / (170 * S));
    },
    up() { drag = null; shoot(); },
    key(code, down) {
      if (!down || ball.live) return;
      if (code === "ArrowLeft") aim.a = Math.min(1.45, aim.a + 0.04);
      if (code === "ArrowRight") aim.a = Math.max(0.2, aim.a - 0.04);
      if (code === "ArrowUp") aim.p = Math.min(1, aim.p + 0.03);
      if (code === "ArrowDown") aim.p = Math.max(0, aim.p - 0.03);
    },
    step(dt) {
      t += dt; net = Math.max(0, net - dt * 1.4); flash = Math.max(0, flash - dt * 2);
      if (shotT >= 0) { shotT += dt; if (shotT > 0.7) shotT = -1; }
      if (!dead) {
        clock -= dt;
        if (clock <= 0) {
          clock = 0; dead = true;
          const g1 = gen;
          // a ball already in the air still counts (buzzer beater)
          setTimeout(() => { if (g1 === gen) api.over("Time! Points scored"); }, ball.live ? 1400 : 300);
        }
      }
      rim.x = rim.bx + Math.sin(t * rim.sp + rim.ph) * rim.amp;
      if (!ball.live) return;
      // small sub-steps so a fast ball can't pass through the ring
      const n = 4, h = dt / n;
      for (let i = 0; i < n && ball.live; i++) {
        const py = ball.y;
        ball.vy += g() * h; ball.x += ball.vx * h; ball.y += ball.vy * h; ball.rot += ball.vx * h * 0.02;
        ball.t += h;
        bounceOff(front(), 0.55); bounceOff(back(), 0.55);
        const b = board();
        if (ball.x + BR > b.x && ball.x < b.x + 8 * S && ball.y > b.top && ball.y < b.bot && ball.vx > 0) {
          ball.x = b.x - BR; ball.vx *= -0.6; ball.touched = true;
        }
        // through the ring, going down
        if (!ball.scored && py < rim.y && ball.y >= rim.y && ball.vy > 0 && Math.abs(ball.x - rim.x) < rim.hw - BR * 0.35) score();
        if (ball.y + BR > GY) {
          ball.y = GY - BR; ball.vy *= -0.55; ball.vx *= 0.8;
          if (Math.abs(ball.vy) < 60) ball.floorT += h;
        }
        if (ball.x > W + 60 || ball.x < -60 || ball.floorT > 0.25 || ball.t > 3.2 || (ball.scored && ball.y > rim.y + 90 * S)) endShot();
      }
    },
    draw(ctx) {
      // dusk sky, houses, court
      const sky = ctx.createLinearGradient(0, 0, 0, GY);
      sky.addColorStop(0, "#1f2a5a"); sky.addColorStop(0.55, "#7b4f8f"); sky.addColorStop(1, "#f29e6b");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);
      ctx.fillStyle = "rgba(255,240,200,.85)"; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.12, 14 * S, 0, 7); ctx.fill();
      for (let i = 0; i < Math.ceil(W / 80) + 1; i++) {
        const hx = i * 80, hh = (70 + (i * 37) % 50) * S;
        ctx.fillStyle = "rgba(23,28,52,.75)"; ctx.fillRect(hx + 4, GY - hh - 26 * S, 72, hh);
        ctx.beginPath(); ctx.moveTo(hx, GY - hh - 26 * S); ctx.lineTo(hx + 40, GY - hh - 46 * S); ctx.lineTo(hx + 80, GY - hh - 26 * S); ctx.fill();
        ctx.fillStyle = "rgba(255,201,60,.55)"; ctx.fillRect(hx + 18, GY - hh, 10 * S, 10 * S); ctx.fillRect(hx + 48, GY - hh + 18 * S, 10 * S, 10 * S);
      }
      // banderitas across the court
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H * 0.08); ctx.quadraticCurveTo(W / 2, H * 0.16, W, H * 0.08); ctx.stroke();
      const flags = ["#e63946", "#ffc93c", "#2347d6", "#4cbf5a"];
      for (let i = 1; i < 12; i++) {
        const k = i / 12, fx = W * k, fy = H * 0.08 + Math.sin(k * Math.PI) * H * 0.04 + Math.sin(t * 3 + i) * 1.5;
        ctx.fillStyle = flags[i % 4]; ctx.beginPath(); ctx.moveTo(fx - 6, fy); ctx.lineTo(fx + 6, fy); ctx.lineTo(fx, fy + 11); ctx.fill();
      }
      // court floor + painted lines
      const fl = ctx.createLinearGradient(0, GY, 0, H);
      fl.addColorStop(0, "#5e7f9c"); fl.addColorStop(1, "#3d5873");
      ctx.fillStyle = fl; ctx.fillRect(0, GY, W, H - GY);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GY + 3); ctx.lineTo(W, GY + 3); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(W * 0.82, GY + 4, W * 0.42, 14 * S, 0, Math.PI * 0.5, Math.PI * 1.02); ctx.stroke();
      drawHoopBack(ctx);
      // player and the ball
      drawPlayer(ctx, home.px, ball.live ? 0 : aim.p, shotT);
      if (!ball.live && !dead) {
        // a short dotted guide: enough to aim, not enough to be easy
        const v = vFor(aim.a, aim.p), vx = Math.cos(aim.a) * v, vy = -Math.sin(aim.a) * v;
        ctx.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 1; i <= 6; i++) {
          const tt = i * 0.045, x = home.x + vx * tt, y = home.y + vy * tt + 0.5 * g() * tt * tt;
          ctx.globalAlpha = 1 - i / 7; ctx.beginPath(); ctx.arc(x, y, 3 * S, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // power meter under the shooter's feet
        ctx.fillStyle = "rgba(16,24,43,.65)"; api.rr(home.px - 30 * S, GY + 14 * S, 60 * S, 8 * S, 4 * S); ctx.fill();
        ctx.fillStyle = aim.p > 0.92 ? "#e63946" : "#ffc93c"; api.rr(home.px - 28 * S, GY + 16 * S, 56 * S * aim.p, 4 * S, 2 * S); ctx.fill();
      }
      if (ball.live) drawBall(ctx, ball.x, ball.y, BR, ball.rot); // a held ball is drawn in the shooter's hands
      drawHoopFront(ctx);
      if (streak >= 3) { // on fire
        ctx.globalAlpha = 0.25 + Math.sin(t * 10) * 0.1; ctx.fillStyle = "#ff5c2b";
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BR * 1.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
    },
    hud(ctx) {
      const secs = Math.ceil(clock), low = clock <= 10;
      ctx.fillStyle = "rgba(16,24,43,.75)"; api.rr(12, 14, 74, 30, 10); ctx.fill();
      api.text(`0:${String(Math.max(0, secs)).padStart(2, "0")}`, 49, 36, 18, low && Math.sin(t * 12) > 0 ? "#ff5c68" : "#ffc93c", 800);
      if (streak >= 3) api.text("ON FIRE! x2", 100, 36, 14, "#ff7a3c", 800, "left");
      else if (streak > 0) api.text(`${streak} in a row`, 100, 36, 12, "#fff", 700, "left");
    },
  };
});
