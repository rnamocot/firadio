// Jeepney Dash: hold to brake, let go to drive. Stop beside waving passengers to pick them up.
// Every fare adds time; passing someone by costs time. After a few fares, red "no stopping" zones appear.
FilGames.register("jeepney", (api) => {
  const { rnd, lerp } = api;
  let started, W, H, ROAD, JX, LEN, x, v, braking, time, people, zones, nextAt, nextZone, t = 0, dead, whistleT;
  const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  const SHIRT = ["#e63946", "#2347d6", "#0e9f8e", "#ffc93c", "#b07cf0", "#ff8f3c", "#4cbf5a"];

  function size() {
    W = api.W; H = api.H;
    ROAD = Math.round(H * 0.74);
    LEN = Math.min(190, Math.max(130, W * 0.42));
    JX = Math.max(LEN * 0.55 + 10, W * 0.36);
  }
  const door = () => x + JX - LEN * 0.42; // world x of the rear door
  const vmax = () => lerp(240, 360, Math.min(1, api.score / 40));

  function spawnPerson() {
    people.push({ x: nextAt, state: "wait", skin: SKIN[(Math.random() * 4) | 0], shirt: SHIRT[(Math.random() * 7) | 0], ph: rnd(0, 6), walk: 0 });
    nextAt += rnd(lerp(300, 420, Math.min(1, api.score / 30)), lerp(520, 760, Math.min(1, api.score / 30)));
    // Keep people out of no-stopping zones
    for (const z of zones) if (nextAt > z.a - 60 && nextAt < z.b + 60) nextAt = z.b + 90;
  }
  function spawnZone() {
    const a = nextZone, b = a + rnd(160, 260);
    zones.push({ a, b, hit: false });
    nextZone = b + rnd(700, 1300);
  }

  // ---------- drawing ----------
  function scene(ctx) {
    let g = ctx.createLinearGradient(0, 0, 0, ROAD);
    g.addColorStop(0, "#5aa9e6"); g.addColorStop(0.7, "#bfe3f7"); g.addColorStop(1, "#ffe7b0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, ROAD);
    // clouds
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 260 - x * 0.05 + t * 6) % (W + 200) + W + 200) % (W + 200) - 100, cy = 130 + i * 37 % 90;
      ctx.beginPath(); ctx.ellipse(cx, cy, 40, 14, 0, 0, 7); ctx.ellipse(cx + 26, cy - 8, 26, 14, 0, 0, 7); ctx.fill();
    }
    // far buildings
    const side = ROAD - 34;
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.5 : 0.22, seg = layer ? 90 : 120;
      const off = -(x * par) % seg;
      for (let i = -1; i < W / seg + 2; i++) {
        const id = Math.floor((x * par) / seg) + i;
        const h = (layer ? 70 : 120) + ((id * 7919) % 5) * (layer ? 18 : 22);
        const bx = off + i * seg;
        ctx.fillStyle = layer ? ["#f4a261", "#e9c46a", "#e76f51", "#90be6d", "#f28482"][Math.abs(id) % 5] : "#9db4c8";
        ctx.fillRect(bx + 4, side - h, seg - 10, h);
        if (layer) {
          ctx.fillStyle = "rgba(255,255,255,.55)";
          for (let wy = side - h + 12; wy < side - 18; wy += 20) for (let wx = bx + 12; wx < bx + seg - 20; wx += 18) ctx.fillRect(wx, wy, 9, 11);
          if (Math.abs(id) % 3 === 0) { ctx.fillStyle = "#e63946"; ctx.fillRect(bx + 8, side - 26, seg - 18, 10); } // sari-sari awning
        }
      }
    }
    // power line
    ctx.strokeStyle = "rgba(16,24,43,.5)"; ctx.lineWidth = 1.5;
    const pole = 260, po = -(x * 0.8) % pole;
    for (let i = -1; i < W / pole + 2; i++) { ctx.fillStyle = "#6b5b4b"; ctx.fillRect(po + i * pole, side - 150, 5, 150); }
    ctx.beginPath();
    for (let i = -1; i < W / pole + 2; i++) { const a = po + i * pole; ctx.moveTo(a, side - 140); ctx.quadraticCurveTo(a + pole / 2, side - 118, a + pole, side - 140); }
    ctx.stroke();
    // sidewalk + curb
    ctx.fillStyle = "#c9c2b4"; ctx.fillRect(0, side, W, ROAD - side - 8);
    ctx.fillStyle = "#8f8778"; ctx.fillRect(0, ROAD - 8, W, 8);
    // no-stopping zones (red curb)
    for (const z of zones) {
      const a = z.a - x, b = z.b - x;
      if (b < 0 || a > W) continue;
      for (let s = a; s < b; s += 20) { ctx.fillStyle = (Math.floor((s - a) / 20) % 2) ? "#fff" : "#e63946"; ctx.fillRect(s, ROAD - 8, Math.min(20, b - s), 8); }
      api.text("BAWAL TUMIGIL", (a + b) / 2, side + 16, 11, "#fff", 800);
    }
    // road
    g = ctx.createLinearGradient(0, ROAD, 0, H);
    g.addColorStop(0, "#3b3f4a"); g.addColorStop(1, "#22252d");
    ctx.fillStyle = g; ctx.fillRect(0, ROAD, W, H - ROAD);
    ctx.fillStyle = "#ffc93c";
    const dash = 70, d0 = -(x % dash);
    for (let i = -1; i < W / dash + 2; i++) ctx.fillRect(d0 + i * dash, ROAD + (H - ROAD) * 0.55, 36, 5);
  }
  function person(ctx, p) {
    const px = p.x - x, base = ROAD - 34 + 6;
    if (px < -30 || px > W + 30 || p.state === "in") return;
    ctx.save();
    ctx.translate(px, base);
    if (p.state === "board") ctx.globalAlpha = Math.max(0, 1 - p.walk);
    const bob = p.state === "walk" ? Math.abs(Math.sin(t * 12)) * 2 : 0;
    ctx.fillStyle = "#2b2f3a"; ctx.fillRect(-6, -18 - bob, 5, 18); ctx.fillRect(1, -18 - bob, 5, 18);       // legs
    ctx.fillStyle = p.shirt; api.rr(-9, -40 - bob, 18, 24, 5); ctx.fill();                                   // body
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, -48 - bob, 8, 0, 7); ctx.fill();                      // head
    ctx.fillStyle = "#2b2f3a"; ctx.beginPath(); ctx.arc(0, -51 - bob, 8, Math.PI, 0); ctx.fill();              // hair
    ctx.strokeStyle = p.skin; ctx.lineWidth = 4; ctx.lineCap = "round";
    if (p.state === "wait") { // waving
      const a = -2.2 + Math.sin(t * 8 + p.ph) * 0.5;
      ctx.beginPath(); ctx.moveTo(7, -36); ctx.lineTo(7 + Math.cos(a) * 14, -36 + Math.sin(a) * 14); ctx.stroke();
      if (Math.sin(t * 3 + p.ph) > 0) api.text("Para!", 0, -66, 11, "#fff", 800);
    } else if (p.state === "mad") {
      ctx.beginPath(); ctx.moveTo(7, -36); ctx.lineTo(16, -50); ctx.stroke();
    }
    ctx.restore();
  }
  function jeep(ctx) {
    const y = ROAD + 4, x0 = JX - LEN / 2, bodyH = LEN * 0.36, roof = y - bodyH - 26;
    ctx.save();
    const tilt = braking && v > 20 ? 0.025 : 0;
    ctx.translate(JX, y); ctx.rotate(tilt); ctx.translate(-JX, -y);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(JX, y + 2, LEN * 0.52, 7, 0, 0, 7); ctx.fill();
    // body
    ctx.fillStyle = "#d9dde3"; api.rr(x0, y - bodyH - 14, LEN * 0.82, bodyH, 8); ctx.fill();
    ctx.fillStyle = "#c9ced6"; api.rr(x0 + LEN * 0.78, y - bodyH * 0.72 - 14, LEN * 0.22, bodyH * 0.72, 8); ctx.fill(); // hood
    // stripes
    ctx.fillStyle = "#e63946"; ctx.fillRect(x0 + 4, y - 30, LEN * 0.94, 6);
    ctx.fillStyle = "#ffc93c"; ctx.fillRect(x0 + 4, y - 24, LEN * 0.94, 4);
    ctx.fillStyle = "#2347d6"; ctx.fillRect(x0 + 4, y - 20, LEN * 0.94, 3);
    // windows
    ctx.fillStyle = "#1d2440";
    const wy = y - bodyH - 6, wh = bodyH * 0.38;
    for (let i = 0; i < 5; i++) api.rr(x0 + 8 + i * LEN * 0.14, wy, LEN * 0.11, wh, 3), ctx.fill();
    ctx.fillStyle = "#9fd8ff"; api.rr(x0 + LEN * 0.82, y - bodyH * 0.72 - 8, LEN * 0.1, wh * 0.9, 3); ctx.fill(); // windshield
    // roof sign
    ctx.fillStyle = "#10172a"; api.rr(x0 + LEN * 0.12, roof, LEN * 0.56, 18, 4); ctx.fill();
    ctx.font = "800 11px Archivo, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffc93c";
    ctx.fillText("FILRADIO", x0 + LEN * 0.4, roof + 13);
    ctx.fillStyle = "#b0b6c0"; ctx.fillRect(x0 + 6, roof + 18, LEN * 0.74, 4);
    // chrome horse on the hood
    ctx.fillStyle = "#e8ecf1"; ctx.beginPath(); ctx.moveTo(x0 + LEN * 0.93, y - bodyH * 0.72 - 14); ctx.lineTo(x0 + LEN * 0.98, y - bodyH * 0.72 - 24); ctx.lineTo(x0 + LEN * 0.99, y - bodyH * 0.72 - 14); ctx.fill();
    // rear door opening
    ctx.fillStyle = "#3b3f4a"; ctx.fillRect(x0 + 2, y - bodyH * 0.7 - 10, 8, bodyH * 0.6);
    // bumper + lights
    ctx.fillStyle = "#e8ecf1"; ctx.fillRect(x0 + LEN - 6, y - 16, 10, 8);
    ctx.fillStyle = braking ? "#ff2e3f" : "#7a1d26"; ctx.fillRect(x0 - 3, y - 22, 5, 7);
    // wheels
    for (const wx of [x0 + LEN * 0.2, x0 + LEN * 0.82]) {
      ctx.fillStyle = "#14161c"; ctx.beginPath(); ctx.arc(wx, y - 6, 13, 0, 7); ctx.fill();
      ctx.fillStyle = "#c9ced6"; ctx.beginPath(); ctx.arc(wx, y - 6, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = "#14161c"; ctx.lineWidth = 2; const a = (x / 13) % 6.28;
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 6, y - 6 + Math.sin(a) * 6); ctx.lineTo(wx - Math.cos(a) * 6, y - 6 - Math.sin(a) * 6); ctx.stroke();
    }
    ctx.restore();
    // speed lines
    if (v > 200) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const ly = y - 20 - i * 14; ctx.beginPath(); ctx.moveTo(x0 - 20 - (t * 400 + i * 30) % 40, ly); ctx.lineTo(x0 - 50 - (t * 400 + i * 30) % 40, ly); ctx.stroke(); } }
  }

  return {
    hint: ["Hold to brake, let go to drive", "Stop beside waving passengers. Each fare adds time!"],
    hintY: () => H * 0.36,
    reset() {
      size();
      started = false; x = 0; v = 0; braking = false; time = 20; dead = false; t = 0; whistleT = 0;
      people = []; zones = [];
      nextAt = W * 0.95; nextZone = 2600;
      for (let i = 0; i < 3; i++) spawnPerson();
    },
    resize() { size(); },
    idle(dt) { t += dt; },
    down() { braking = true; started = true; api.action(); },
    up() { braking = false; },
    step(dt) {
      t += dt;
      if (dead) { v = Math.max(0, v - 600 * dt); x += v * dt; return; }
      if (!started) return; // parked until the first touch
      // drive
      if (braking) v = Math.max(0, v - 560 * dt); else v = Math.min(vmax(), v + 240 * dt);
      x += v * dt;
      time -= dt;
      // spawn ahead
      while (nextAt < x + W * 1.6) spawnPerson();
      if (api.score >= 5) while (nextZone < x + W * 1.6) spawnZone();
      // passengers
      const d = door();
      for (const p of people) {
        if (p.state === "wait") {
          const dx = p.x - d;
          if (Math.abs(dx) < 26 && v < 45) {
            const perfect = Math.abs(dx) < 11 && v < 14;
            p.state = "board"; p.walk = 0;
            api.add(perfect ? 2 : 1, d, ROAD - 110, perfect ? "Para po! +2" : "+1 fare", perfect);
            time = Math.min(30, time + (perfect ? 4 : 3));
            api.burst(d, ROAD - 60, perfect ? 14 : 8, ["#ffc93c", "#4cbf5a", "#fff"], 120, 700, 2.5);
            api.vibrate(10);
          } else if (dx < -40) {
            p.state = "mad";
            time -= 1.5;
            api.pop(p.x, ROAD - 100, "Lagpas! -1.5s", false);
          }
        } else if (p.state === "board") {
          p.walk += dt * 2.5;
          p.x = lerp(p.x, d, 0.25);
          if (p.walk >= 1) p.state = "in";
        }
      }
      people = people.filter((p) => p.x > x - 80 && p.state !== "in");
      // no-stopping zones: stopping inside one gets you whistled at
      whistleT = Math.max(0, whistleT - dt);
      for (const z of zones) {
        const jx = x + JX;
        if (!z.hit && jx > z.a && jx < z.b && v < 25) {
          z.hit = true; time -= 3; whistleT = 1.2;
          api.pop(JX + 40, ROAD - 130, "Prrrt! Bawal! -3s", false);
          api.shake(6); api.vibrate([20, 30, 20]);
        }
      }
      zones = zones.filter((z) => z.b > x - 50);
      if (time <= 0) { time = 0; dead = true; braking = false; api.over("Time's up! Fares collected"); }
    },
    draw(ctx) {
      scene(ctx);
      for (const p of people) person(ctx, p);
      jeep(ctx);
      if (whistleT > 0) api.text("\u{1F46E}", JX + 60, ROAD - 150, 30, "#fff", 400);
    },
    hud(ctx) {
      const bw = Math.min(260, W * 0.6), bx = (W - bw) / 2, by = 118;
      ctx.fillStyle = "rgba(16,24,43,.6)"; api.rr(bx - 4, by - 4, bw + 8, 16, 8); ctx.fill();
      const k = Math.max(0, time / 30);
      ctx.fillStyle = k < 0.2 ? "#e63946" : k < 0.45 ? "#ffc93c" : "#4cbf5a";
      api.rr(bx, by, bw * k, 8, 4); ctx.fill();
      api.text(`${Math.ceil(time)}s`, bx + bw + 22, by + 9, 12, "#fff", 700);
    },
  };
});
