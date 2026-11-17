// Tinikling: the bamboo dance. Two poles tap open on the beat and clap shut. Tap (or Space) to jump so your
// feet are off the ground when they close. Jump so the clap comes at the top of your jump for a Perfect (+2),
// any clean jump is +1. Get caught three times and the dance is over. The tempo rises as you go, and some
// measures are shorter or longer, so you have to watch the beat track instead of tapping blindly.
FilGames.register("tinikling", (api) => {
  const { rnd, lerp } = api;
  const JUMP_T = 0.42;              // seconds in the air
  const CLEAR = 8;                  // feet must be this high (x scale) to clear the shutting poles
  let W, H, S, FY, cx, beats, bt, bpm, cleared, lives, streak, jump, caught, stumble, t = 0, gen = 0, dead, lastBeat, tapFx;

  function size() { W = api.W; H = api.H; S = Math.min(W / 360, H / 600); FY = Math.round(H * 0.74); cx = W / 2; }

  // ---------- the beat pattern ----------
  // beats[i] is "o" (poles tap the floor apart) or "c" (poles clap together) at beat time i.
  function measure() {
    const r = Math.random();
    if (cleared >= 8 && r < 0.25) return ["o", "c"];            // quick measure
    if (cleared >= 4 && r > 0.8) return ["o", "o", "o", "c"];   // long measure
    return ["o", "o", "c"];                                      // the classic tap, tap, clap
  }
  function fill() { while (beats.length < Math.floor(bt) + 12) beats.push(...measure()); }
  const kind = (i) => (i < 0 ? "o" : beats[i] || "o");
  const ease = (x) => x * x * (3 - 2 * x);
  // How far apart the poles are (0 = shut, 1 = open). They move quickly near each beat and rest open
  // in between, like real tinikling: slide in fast for the clap, spring back out after it.
  function gapAt(b) {
    const i = Math.floor(b), f = b - i;
    const now = kind(i), next = kind(i + 1);
    let g = 1;
    if (now === "c") g = Math.min(g, ease(Math.min(1, f / 0.3)));
    if (next === "c") g = Math.min(g, 1 - ease(Math.max(0, (f - 0.7) / 0.3)));
    return g;
  }
  const height = () => (jump >= 0 ? Math.sin(Math.min(1, jump / JUMP_T) * Math.PI) * 54 * S : 0);

  // ---------- drawing helpers (outlined shapes, like the other games' people) ----------
  const LINE = "#2b1a10", SKIN = "#b07246", SKIN_D = "#8a5532";
  function limb(ctx, pts, w0, w1, fill) {
    for (const [col, extra] of [[LINE, 2.2 * S], [fill, 0]]) {
      ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.lineWidth = lerp(w0, w1, i / Math.max(1, pts.length - 2)) + extra;
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
      }
    }
  }
  function bamboo(ctx, y, thick, x0, x1, shade) {
    const g = ctx.createLinearGradient(0, y - thick / 2, 0, y + thick / 2);
    g.addColorStop(0, shade ? "#b9c96a" : "#d9e58a"); g.addColorStop(0.5, shade ? "#8fa244" : "#a9bd52"); g.addColorStop(1, shade ? "#5e6d24" : "#6f8130");
    ctx.fillStyle = g; api.rr(x0, y - thick / 2, x1 - x0, thick, thick / 2); ctx.fill();
    ctx.strokeStyle = "rgba(60,70,20,.6)"; ctx.lineWidth = 1.2;
    for (let x = x0 + 40 * S; x < x1 - 10; x += 46 * S) { ctx.beginPath(); ctx.moveTo(x, y - thick / 2); ctx.lineTo(x, y + thick / 2); ctx.stroke(); }
  }
  // a pole holder kneeling at one end (darker, so the dancer stands out)
  function holder(ctx, x, y, dir, bob) {
    const s = S;
    ctx.save(); ctx.globalAlpha = 0.92;
    limb(ctx, [[x - dir * 4 * s, y - 2 * s], [x - dir * 2 * s, y - 14 * s], [x - dir * 16 * s, y - 14 * s]], 9 * s, 8 * s, "#7a1f2a");
    ctx.fillStyle = "#e9dcc0"; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(x - 10 * s, y - 14 * s); ctx.lineTo(x + 10 * s, y - 14 * s); ctx.lineTo(x + 8 * s, y - 46 * s + bob); ctx.lineTo(x - 8 * s, y - 46 * s + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
    limb(ctx, [[x + dir * 4 * s, y - 40 * s + bob], [x + dir * 12 * s, y - 24 * s], [x + dir * 22 * s, y - 10 * s]], 6 * s, 5.5 * s, SKIN_D);
    ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.arc(x, y - 54 * s + bob, 8 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#17161b"; ctx.beginPath(); ctx.arc(x, y - 57 * s + bob, 8 * s, Math.PI, 0); ctx.fill();
    ctx.restore();
  }
  // the dancer: barong tagalog, red trousers rolled up, barefoot, arms out to the sides
  function dancer(ctx, x, h, tilt) {
    const s = S, fy = FY - h, air = h > 2 * s;
    const knee = air ? 14 * s : 3 * s, spread = air ? 9 * s : 6 * s;
    const hipY = fy - 50 * s + (air ? 8 * s : 0), shY = hipY - 34 * s, headY = shY - 15 * s;
    ctx.save(); ctx.translate(x, fy); ctx.rotate(tilt); ctx.translate(-x, -fy);
    // legs (knees come up in the air)
    for (const d of [-1, 1]) {
      const foot = [x + d * spread, fy - (air ? 6 * s : 0)], kneeP = [x + d * (spread + 3 * s) + knee * 0.3, hipY + 24 * s - (air ? 4 * s : 0)];
      limb(ctx, [[x + d * 5 * s, hipY + 4 * s], kneeP, foot], 10 * s, 8 * s, "#c8262f");
      limb(ctx, [[foot[0], foot[1] - 5 * s], foot], 6 * s, 6 * s, SKIN); // rolled-up ankle
      ctx.fillStyle = SKIN; ctx.strokeStyle = LINE; ctx.lineWidth = 1.1 * s;
      ctx.beginPath(); ctx.ellipse(foot[0] + d * 2 * s, foot[1] + 1 * s, 6 * s, 2.6 * s, 0, 0, 7); ctx.fill(); ctx.stroke(); // bare foot
    }
    // arms out to the sides, swaying with the beat
    const sway = Math.sin(bt * Math.PI) * 4 * s;
    for (const d of [-1, 1]) limb(ctx, [[x + d * 9 * s, shY + 4 * s], [x + d * 24 * s, shY + 10 * s - sway * d], [x + d * 36 * s, shY + 2 * s - sway * d]], 7 * s, 5.5 * s, "#f3ead6");
    for (const d of [-1, 1]) { ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x + d * 38 * s, shY + 2 * s - sway * d, 3.2 * s, 0, 7); ctx.fill(); ctx.stroke(); }
    // barong: sheer cream shirt worn untucked, with embroidery down the front
    ctx.fillStyle = "#f3ead6"; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(x - 11 * s, shY); ctx.lineTo(x + 11 * s, shY); ctx.lineTo(x + 14 * s, hipY + 10 * s); ctx.lineTo(x - 14 * s, hipY + 10 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(160,130,80,.8)"; ctx.lineWidth = 1 * s;
    for (let i = 0; i < 6; i++) { const yy = shY + 6 * s + i * 7 * s; ctx.beginPath(); ctx.moveTo(x - 5 * s, yy); ctx.quadraticCurveTo(x, yy + 3 * s, x + 5 * s, yy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x, shY + 2 * s); ctx.lineTo(x, hipY + 8 * s); ctx.stroke();
    // neck, head, hair
    limb(ctx, [[x, shY + 1 * s], [x, headY + 7 * s]], 6.5 * s, 6.5 * s, SKIN_D);
    ctx.fillStyle = SKIN; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.ellipse(x, headY, 8.5 * s, 10 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#17161b"; ctx.beginPath(); ctx.ellipse(x, headY - 5 * s, 9 * s, 6 * s, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 9 * s, headY - 6 * s, 18 * s, 3 * s);
    ctx.fillStyle = "#17161b"; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * 3.2 * s, headY + 0.5 * s, 1 * s, 0, 7); ctx.fill(); }
    ctx.strokeStyle = LINE; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.arc(x, headY + 4 * s, 3 * s, 0.2, Math.PI - 0.2); ctx.stroke(); // smile
    ctx.restore();
  }

  function onClap(i) {
    // the poles just shut on beat i: clean if the dancer was in the air
    if (caught === i) return;
    const h = height();
    if (h > CLEAR * S) {
      cleared++; streak++;
      const top = jump >= 0 && Math.abs(jump - JUMP_T / 2) < 0.07;
      const pts = top ? 2 : 1;
      api.add(pts, cx, FY - 120 * S, top ? (streak >= 5 ? `Perfect! ${streak} in a row` : "Perfect! +2") : "Ayos! +1", top);
      if (top) api.ring(cx, FY, 3, "rgba(255,201,60,.8)");
      bpm = Math.min(168, 84 + cleared * 3);
    }
  }
  function getCaught(i) {
    caught = i; lives--; streak = 0; stumble = 0.6;
    api.shake(7); api.vibrate([30, 40, 30]);
    api.burst(cx, FY - 4 * S, 10, ["#d9e58a", "#fff"], 120, 600, 2.5);
    api.pop(cx, FY - 120 * S, lives > 0 ? "Naipit! Caught!" : "Naipit!", false);
    if (lives <= 0) { dead = true; const g1 = gen; setTimeout(() => { if (g1 === gen) api.over("Caught! Claps cleared"); }, 600); }
  }

  return {
    hint: ["Tap to jump when the bamboo closes", "Jump on the beat. Perfect = clap at the top of your jump"],
    hintY: () => H * 0.3,
    reset() {
      size(); gen++;
      beats = ["o", "o", "o", "o", "o", "c"]; bt = 0; bpm = 84; cleared = 0; lives = 3; streak = 0;
      jump = -1; caught = -1; stumble = 0; t = 0; dead = false; lastBeat = 0; tapFx = 0;
      fill();
    },
    resize() { size(); },
    idle(dt) { t += dt; bt += dt * 1.0; fill(); },
    down() {
      if (dead || jump >= 0) return;
      jump = 0; api.action(); api.vibrate(6);
    },
    step(dt) {
      t += dt; stumble = Math.max(0, stumble - dt); tapFx = Math.max(0, tapFx - dt * 4);
      if (jump >= 0) { jump += dt; if (jump >= JUMP_T) jump = -1; }
      if (dead) return;
      const prev = bt;
      bt += dt * bpm / 60;
      fill();
      // every beat crossed this frame: claps score, taps just thump the floor
      for (let i = Math.floor(prev) + 1; i <= Math.floor(bt); i++) {
        if (kind(i) === "c") { onClap(i); api.shake(2); } else tapFx = 1;
        lastBeat = i;
      }
      // caught: the poles are nearly shut on the dancer's feet while they're on the floor
      const near = Math.round(bt);
      if (kind(near) === "c" && caught !== near && gapAt(bt) < 0.22 && height() <= CLEAR * S) getCaught(near);
    },
    draw(ctx) {
      // night fiesta: sky, parol lanterns, bahay kubo, wooden stage
      const sky = ctx.createLinearGradient(0, 0, 0, FY);
      sky.addColorStop(0, "#0f1838"); sky.addColorStop(0.7, "#2c2a5c"); sky.addColorStop(1, "#5a3b5e");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H * 0.14); ctx.quadraticCurveTo(W / 2, H * 0.24, W, H * 0.14); ctx.stroke();
      const lc = ["#ffc93c", "#e63946", "#4cbf5a", "#3d7bff"];
      for (let i = 1; i < 9; i++) {
        const k = i / 9, lx = W * k, ly = H * 0.14 + Math.sin(k * Math.PI) * H * 0.1;
        ctx.fillStyle = lc[i % 4]; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3 + i);
        ctx.beginPath(); ctx.arc(lx, ly + 10 * S, 14 * S, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(lx, ly + 10 * S); ctx.rotate(Math.PI / 4); // a little parol (star lantern)
        ctx.fillStyle = lc[i % 4]; ctx.fillRect(-5 * S, -5 * S, 10 * S, 10 * S); ctx.restore();
        ctx.save(); ctx.translate(lx, ly + 10 * S); ctx.fillStyle = lc[(i + 1) % 4]; ctx.fillRect(-5 * S, -5 * S, 10 * S, 10 * S); ctx.restore();
      }
      // bahay kubo on the left
      const hx = W * 0.08, hy = FY - 40 * S;
      ctx.fillStyle = "rgba(20,16,30,.8)";
      ctx.beginPath(); ctx.moveTo(hx - 10 * S, hy - 50 * S); ctx.lineTo(hx + 45 * S, hy - 95 * S); ctx.lineTo(hx + 100 * S, hy - 50 * S); ctx.fill();
      ctx.fillRect(hx, hy - 50 * S, 90 * S, 50 * S);
      ctx.fillStyle = "rgba(255,190,90,.55)"; ctx.fillRect(hx + 30 * S, hy - 36 * S, 22 * S, 18 * S);
      // stage
      const st = ctx.createLinearGradient(0, FY - 40 * S, 0, H);
      st.addColorStop(0, "#8a5a32"); st.addColorStop(1, "#4e2f17");
      ctx.fillStyle = st; ctx.fillRect(0, FY - 40 * S, W, H - FY + 40 * S);
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
      for (let y = FY - 40 * S + 14 * S; y < H; y += 16 * S) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // poles: back one (shorter in perspective), the dancer, then the front one
      const g = gapAt(bt), x0 = W * 0.1, x1 = W * 0.9;
      const backY = FY - 4 * S - g * 26 * S, frontY = FY + 8 * S + g * 30 * S;
      const bob = tapFx * 2 * S;
      holder(ctx, x0 - 8 * S, FY + 30 * S, 1, bob); holder(ctx, x1 + 8 * S, FY + 30 * S, -1, bob);
      bamboo(ctx, backY, 9 * S, x0, x1, true);
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(cx, FY + 2 * S, 20 * S - height() * 0.15, 4 * S, 0, 0, 7); ctx.fill();
      const tilt = stumble > 0 ? Math.sin(stumble * 30) * 0.15 : 0;
      dancer(ctx, cx, height(), tilt);
      bamboo(ctx, frontY, 11 * S, x0, x1, false);
      if (stumble > 0.3) { ctx.fillStyle = `rgba(230,57,70,${(stumble - 0.3) * 0.6})`; ctx.fillRect(0, 0, W, H); }
    },
    hud(ctx) {
      // lives as little bamboo sticks
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < lives ? 1 : 0.25; bamboo(ctx, 26 + i * 0, 7, 14 + i * 30, 38 + i * 30, false); }
      ctx.globalAlpha = 1;
      api.text(`${Math.round(bpm)} BPM`, W - 14, 30, 12, "#ffc93c", 700, "right");
      // beat track: upcoming beats slide left into the marker; claps are the big gold dots
      const ty = 92 * Math.max(0.8, S), tx = W / 2 - 110 * S, span = 220 * S, per = span / 5;
      ctx.fillStyle = "rgba(16,24,43,.55)"; api.rr(tx - 14 * S, ty - 13 * S, span + 28 * S, 26 * S, 13 * S); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, 9 * S, 0, 7); ctx.stroke();
      for (let i = Math.floor(bt); i < Math.floor(bt) + 7; i++) {
        const x = tx + (i - bt) * per;
        if (x < tx - 10 * S || x > tx + span + 6 * S) continue;
        const c = kind(i) === "c";
        ctx.fillStyle = c ? "#ffc93c" : "rgba(255,255,255,.75)";
        ctx.beginPath(); ctx.arc(x, ty, c ? 7 * S : 3.5 * S, 0, 7); ctx.fill();
      }
    },
  };
});
