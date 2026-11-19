// FilRadio global chat: one Cloudflare Durable Object holds the room.
// Runs on Cloudflare (not Hostinger). WebSocket Hibernation means idle listeners cost nothing.
import { DurableObject } from "cloudflare:workers";
import { check, tidy, reserved } from "./filter.js";
import { Stats, GAMES } from "./stats.js";
export { Stats };

const ORIGINS = ["https://filradio.xyz", "https://www.filradio.xyz", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5500", "http://127.0.0.1:5500"];

const LIMITS = {
  maxLen: 200,             // characters per message
  nameLen: 20,
  history: 50,             // messages a newcomer sees
  maxAgeMs: 6 * 3600e3,    // messages auto-delete after 6 hours
  gapMs: 4000,             // 1 message every 4 s per person
  perMin: 8,               // and at most 8 per minute
  socketsPerIp: 2,
  socketsTotal: 400,       // whole room; protects the free plan
  roomPer10s: 40,          // whole room message cap (flood guard)
  strikes: 3,              // blocked messages within strikeWindow -> mute
  strikeWindowMs: 3600e3,
  muteMs: [30 * 60e3, 24 * 3600e3, 7 * 24 * 3600e3], // 1st, 2nd, 3rd+ mute
  reportsToHide: 3,        // distinct people reporting a message removes it
  reportsPerHour: 10,
  framesPer10s: 20,        // any frames (junk included); more = bot, socket is dropped
  typingGapMs: 3000,       // "is typing" relayed at most once every 3 s per person
  stationLen: 40,          // "listening to" station name
  pabatiGapMs: 10 * 60e3,  // 1 pabati (shout-out) every 10 minutes per person
  presenceGapMs: 10e3,     // "X online" pushed on join/leave at most once every 10 s (whole room)
  wordLen: 30,             // longest word allowed (stops pasted gibberish walls)
  emojis: 15,              // most emojis in one message
  reactGapMs: 600,         // reactions: at most 1 every 0.6 s per person
  reactsPerMin: 30,        // and 30 per minute
  pokeSameMs: 30e3,        // kalabit / scratch: the same person at most once every 30 s
  pokesPerMin: 4,          // and at most 4 pokes a minute in total
  pokeBackMs: 5 * 60e3,    // "poke back" works for 5 minutes after being poked
};
const POKES = 2;           // 0 = kalabit (poke), 1 = cat scratch
const REACTIONS = 6;       // the client owns the emoji list (like, love, haha, wow, sad, angry); the server only counts 0..5

const SEC_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
const deny = (status, text = "") => new Response(text, { status, headers: SEC_HEADERS });

const REASONS = {
  language: "Message blocked: no swearing, sexual or hateful words.",
  links: "Message blocked: links aren't allowed.",
  contact: "Message blocked: no phone numbers, emails or handles.",
};

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanName(raw) {
  const n = tidy(String(raw || "")).replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, LIMITS.nameLen).trim();
  return n.length >= 2 ? n : "";
}
const guestName = () => `Listener${Math.floor(1000 + Math.random() * 9000)}`;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
    // Everything below is answered at the edge without waking the chat room.
    if (url.pathname === "/admin") {
      if (!(await allowed(env.ADMIN_LIMIT, ip))) return deny(429);
      return adminProxy(req, env);
    }
    if (url.pathname === "/pv") return pageView(req, env, url, ip);
    if (url.pathname === "/stats" || url.pathname === "/stats/login") return statsReport(req, env, ctx, url, ip);
    if (["/hit", "/count", "/live", "/top", "/game/top", "/game/tops", "/game/score", "/game/play", "/feedback"].includes(url.pathname)) return statsRoute(req, env, ctx, url, ip);
    if (url.pathname !== "/ws" || req.method !== "GET") return deny(404);
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) return deny(403);
    if ((req.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return deny(426);
    if (url.search.length > 120) return deny(414);
    // Reconnect storms / scripted connects: max 10 connects a minute per IP.
    if (!(await allowed(env.CONNECT_LIMIT, ip))) return deny(429);

    const h = await hashIp(ip, env.IP_SALT || "filradio");
    const fwd = new Request(req);
    fwd.headers.set("X-Who", h);
    // Country from Cloudflare (2 letters only; nothing else about the visitor is kept).
    const cc = String(req.cf?.country || "").toUpperCase();
    fwd.headers.set("X-Country", /^[A-Z]{2}$/.test(cc) && !["XX", "T1"].includes(cc) ? cc : "");
    return env.ROOM.get(env.ROOM.idFromName("global")).fetch(fwd);
  },
};

async function allowed(limiter, key) {
  if (!limiter) return true;
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}

async function adminProxy(req, env) {
  const token = env.ADMIN_TOKEN || "";
  const ok = token.length >= 24 && (await sameSecret(req.headers.get("Authorization") || "", `Bearer ${token}`));
  if (!ok || req.method !== "POST") return deny(403);
  if (Number(req.headers.get("Content-Length") || 0) > 10000) return deny(413);
  const body = await req.text();
  if (body.length > 10000) return deny(413);
  // "stats…" actions go to the visitor counter, everything else to the chat room.
  const isStats = /"action"\s*:\s*"stats/.test(body);
  const stub = isStats ? env.STATS.get(env.STATS.idFromName("filradio")) : env.ROOM.get(env.ROOM.idFromName("global"));
  return stub.fetch(new Request(isStats ? "https://stats/admin" : "https://room/admin", { method: "POST", body }));
}

// ----- page views: a 1x1 image on every page, /pv?p=/station/x/ (see stats.js) -----
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const BOTS = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python|node-fetch|axios|go-http/i;
async function pageView(req, env, url, ip) {
  const pixel = () => new Response(PIXEL, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (req.method !== "GET" || url.search.length > 140) return pixel();
  // Only views from our own pages (the browser sends the page's origin as the referrer), and no bots.
  let from = "";
  try { from = new URL(req.headers.get("Referer") || "").origin; } catch {}
  if (!ORIGINS.includes(from) || BOTS.test(req.headers.get("User-Agent") || "")) return pixel();
  if (!(await allowed(env.PV_LIMIT, ip))) return pixel();
  const who = await hashIp(ip, env.IP_SALT || "filradio");
  const p = (url.searchParams.get("p") || "").toLowerCase();
  const stub = env.STATS.get(env.STATS.idFromName("filradio"));
  await stub.fetch(new Request(`https://stats/pv?p=${encodeURIComponent(p)}`, { headers: { "X-Who": who } })).catch(() => {});
  return pixel();
}

// ----- private traffic report: sign in with STATS_USER / STATS_PASS (worker secrets) -----
// POST /stats/login {u, p} -> { token } valid SESSION_DAYS; GET /stats?days=N with "Authorization: Bearer <token>".
// Tokens are signed with the password, so changing STATS_PASS signs everyone out.
const SESSION_DAYS = 14;
async function sign(env, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${env.STATS_USER}|${env.STATS_PASS}|${env.IP_SALT || ""}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function statsReport(req, env, ctx, url, ip) {
  const origin = req.headers.get("Origin") || "";
  const cors = ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Max-Age": "86400", Vary: "Origin" }
    : {};
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.STATS_USER || !env.STATS_PASS || env.STATS_PASS.length < 8) return json({ error: "The stats login is not set up yet." }, 503);

  if (url.pathname === "/stats/login") {
    if (req.method !== "POST") return deny(405);
    if (!(await allowed(env.ADMIN_LIMIT, ip))) return json({ error: "Too many tries. Wait a minute and try again." }, 429);
    const body = await req.text();
    if (body.length > 400) return deny(413);
    let b = {};
    try { b = JSON.parse(body); } catch {}
    const [okU, okP] = await Promise.all([sameSecret(String(b.u || ""), env.STATS_USER), sameSecret(String(b.p || ""), env.STATS_PASS)]);
    if (!okU || !okP) return json({ error: "Wrong username or password." }, 401);
    const exp = String(Date.now() + SESSION_DAYS * 864e5);
    return json({ token: `${exp}.${await sign(env, exp)}` });
  }

  if (req.method !== "GET") return deny(405);
  const [exp, sig] = (req.headers.get("Authorization") || "").replace(/^Bearer /, "").split(".");
  if (!/^\d{13}$/.test(exp || "") || Number(exp) < Date.now() || !(await sameSecret(sig || "", await sign(env, exp)))) {
    return json({ error: "Please sign in again." }, 401);
  }
  if (!(await allowed(env.READ_LIMIT, ip))) return json({ error: "Too many requests. Wait a minute." }, 429);
  const d = Number(url.searchParams.get("days"));
  const days = [1, 7, 30, 90, 365].includes(d) ? d : 0;
  // Signed-in reads are cached for a minute at the edge (the key is never served without the check above).
  const key = new Request(`${url.origin}/__cache/stats-report?days=${days}`);
  let r = await caches.default.match(key);
  if (!r) {
    const fresh = await env.STATS.get(env.STATS.idFromName("filradio")).fetch(new Request(`https://stats/stats?days=${days}`));
    r = new Response(fresh.body, fresh);
    r.headers.set("Cache-Control", "public, max-age=60");
    if (fresh.ok) ctx.waitUntil(caches.default.put(key, r.clone()));
  }
  const res = new Response(r.body, r);
  for (const [k, v] of Object.entries({ ...cors, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })) res.headers.set(k, v);
  return res;
}

// ----- visitor counter + traffic report (see stats.js) -----
async function statsRoute(req, env, ctx, url, ip) {
  const origin = req.headers.get("Origin") || "";
  const okOrigin = ORIGINS.includes(origin);
  const cors = okOrigin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
  const stub = env.STATS.get(env.STATS.idFromName("filradio"));
  const out = (r, extra = {}) => {
    const res = new Response(r.body, r);
    for (const [k, v] of Object.entries({ ...cors, "X-Content-Type-Options": "nosniff", ...extra })) res.headers.set(k, v);
    return res;
  };

  if (url.pathname === "/hit") {
    // Counting: only from the site, small body, max 6 a minute per IP (one per device per day is normal).
    if (req.method !== "POST" || !okOrigin) return deny(403);
    if (Number(req.headers.get("Content-Length") || 0) > 300) return deny(413);
    if (!(await allowed(env.HIT_LIMIT, ip))) return deny(429);
    const body = await req.text();
    if (body.length > 300) return deny(413);
    const who = await hashIp(ip, env.IP_SALT || "filradio");
    return out(await stub.fetch(new Request("https://stats/hit", { method: "POST", body, headers: { "X-Who": who } })), { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/live" && req.method === "POST") {
    // Live-listener ping: every 2 minutes per playing tab. Same checks as /hit, roomier limit.
    if (!okOrigin) return deny(403);
    if (Number(req.headers.get("Content-Length") || 0) > 200) return deny(413);
    if (!(await allowed(env.LIVE_LIMIT, ip))) return deny(429);
    const body = await req.text();
    if (body.length > 200) return deny(413);
    const who = await hashIp(ip, env.IP_SALT || "filradio");
    return out(await stub.fetch(new Request("https://stats/live", { method: "POST", body, headers: { "X-Who": who } })), { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/game/score") {
    // Mini game leaderboard save: from the site only, tiny body, max 6 a minute per IP.
    if (req.method !== "POST" || !okOrigin) return deny(403);
    if (Number(req.headers.get("Content-Length") || 0) > 200) return deny(413);
    if (!(await allowed(env.GAME_LIMIT, ip))) return deny(429);
    const body = await req.text();
    if (body.length > 200) return deny(413);
    const who = await hashIp(ip, env.IP_SALT || "filradio");
    const r = await stub.fetch(new Request("https://stats/game/score", { method: "POST", body, headers: { "X-Who": who } }));
    if (r.ok) { // the new score shows right away
      let g = "palaka";
      try { const b = JSON.parse(body); if (b.g in GAMES) g = b.g; } catch {}
      ctx.waitUntil(Promise.all([`/game/top?g=${g}`, "/game/tops"].map((p) => caches.default.delete(new Request(`${url.origin}/__cache${p}`)))));
    }
    return out(r, { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/feedback") {
    // Feedback form: from the site only, small body, max 3 a minute per IP (and a daily cap per network in the counter).
    if (req.method !== "POST" || !okOrigin) return deny(403);
    if (Number(req.headers.get("Content-Length") || 0) > 2000) return deny(413);
    if (!(await allowed(env.FEEDBACK_LIMIT, ip))) return deny(429);
    const body = await req.text();
    if (body.length > 2000) return deny(413);
    const who = await hashIp(ip, env.IP_SALT || "filradio");
    return out(await stub.fetch(new Request("https://stats/feedback", { method: "POST", body, headers: { "X-Who": who } })), { "Cache-Control": "no-store" });
  }

  if (url.pathname === "/game/play") {
    // One count per game start (sorts the games menu by what people play most).
    if (req.method !== "POST" || !okOrigin) return deny(403);
    if (Number(req.headers.get("Content-Length") || 0) > 60) return deny(413);
    if (!(await allowed(env.PLAY_LIMIT, ip))) return deny(429);
    const body = await req.text();
    if (body.length > 60) return deny(413);
    return out(await stub.fetch(new Request("https://stats/game/play", { method: "POST", body })), { "Cache-Control": "no-store" });
  }

  if (req.method !== "GET") return deny(405);
  if (!(await allowed(env.READ_LIMIT, ip))) return deny(429);
  // Reads are cached at the edge (60 s, live count 30 s): repeat views and refreshes never wake the counter.
  const cache = caches.default;
  // Only the game id is kept from the query string, so junk parameters can't bust the cache.
  const gq = url.pathname === "/game/top" ? `?g=${url.searchParams.get("g") in GAMES ? url.searchParams.get("g") : "palaka"}` : "";
  const key = new Request(`${url.origin}/__cache${url.pathname}${gq}`);
  let r = await cache.match(key);
  if (!r) {
    const fresh = await stub.fetch(new Request(`https://stats${url.pathname}${gq}`));
    r = new Response(fresh.body, fresh);
    // Most played changes slowly: 10 minutes at the edge, so it costs almost nothing.
    r.headers.set("Cache-Control", `public, max-age=${url.pathname === "/top" ? 600 : ["/live", "/game/top", "/game/tops"].includes(url.pathname) ? 30 : 60}`);
    if (fresh.ok) ctx.waitUntil(cache.put(key, r.clone()));
  }
  return out(r);
}

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.msgs = [];
    this.words = [];
    this.roomTimes = [];
    this.lastPresence = 0;
    this.lastCount = 0;
    // "ping" -> "pong" is answered by Cloudflare without waking this object (free keep-alive).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.msgs = (await ctx.storage.get("msgs")) || [];
      this.words = (await ctx.storage.get("words")) || [];
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/admin") return this.admin(await req.json().catch(() => ({})));

    const h = req.headers.get("X-Who");
    if (!h) return deny(400);
    if (this.ctx.getWebSockets().length >= LIMITS.socketsTotal) return deny(503, "Room full");
    // Too many tabs from one person: drop their oldest connection.
    const mine = this.ctx.getWebSockets(h);
    if (mine.length >= LIMITS.socketsPerIp) try { mine[0].close(4000, "Opened in another tab"); } catch {}

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [h]);

    let name = cleanName(url.searchParams.get("name"));
    if (!name || check(name) || reserved(name)) name = guestName();
    // Someone else is using this name right now: add digits so nobody can pose as them.
    for (let i = 0; i < 5 && this.nameTaken(name, h); i++) name = `${name.slice(0, 16)}${Math.floor(10 + Math.random() * 990)}`;
    if (this.nameTaken(name, h)) name = guestName();
    const c = req.headers.get("X-Country") || "";
    server.serializeAttachment({ h, name, sent: [], fr: [], c, fl: url.searchParams.get("flag") !== "0" });

    this.prune();
    const user = await this.user(h);
    server.send(JSON.stringify({
      t: "init", name, online: this.ctx.getWebSockets().length,
      muted: user.until > Date.now() ? user.until : 0,
      msgs: this.msgs.map(pub),
      // This person's own reactions, so their picks show highlighted after a reload.
      mr: Object.fromEntries(this.msgs.filter((x) => x.re && h in x.re).map((x) => [x.id, x.re[h]])),
    }));
    await this.presence({ joined: server });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (!a) return ws.close(1008, "Bad session");
    // Flood guard: too many frames of any kind = bot. Drop it and count a strike.
    const now = Date.now();
    a.fr = (a.fr || []).filter((t) => now - t < 10e3);
    a.fr.push(now);
    ws.serializeAttachment(a);
    if (a.fr.length > LIMITS.framesPer10s) {
      await this.strike(null, a.h);
      return ws.close(1008, "Too many messages");
    }
    if (typeof data !== "string" || data.length > 1000) return ws.close(1009, "Too big");
    let m;
    try { m = JSON.parse(data); } catch { return ws.close(1003, "Bad data"); }
    if (!m || typeof m !== "object" || typeof m.t !== "string") return ws.close(1003, "Bad data");

    if (m.t === "msg") return this.onMessage(ws, a, m);
    if (m.t === "typing") return this.onTyping(ws, a, now);
    if (m.t === "flag") { a.fl = !!m.on; ws.serializeAttachment(a); return; }
    if (m.t === "report") return this.onReport(ws, a, String(m.id || ""));
    if (m.t === "react") return this.onReact(ws, a, String(m.id || ""), m.e);
    if (m.t === "poke") return this.onPoke(ws, a, m);
    if (m.t === "pokes") { a.np = m.on === false; ws.serializeAttachment(a); return; }
    if (m.t === "name" && typeof m.name === "string") {
      const n = cleanName(m.name);
      if (!n) return err(ws, "name", "Name must be 2 to 20 letters or numbers.");
      const why = check(n);
      if (why) { await this.strike(ws, a.h); return err(ws, "name", "That name isn't allowed."); }
      if (reserved(n)) return err(ws, "name", "That name is reserved for the FilRadio team. Pick another.");
      if (this.nameTaken(n, a.h)) return err(ws, "name", "Someone else is using that name right now. Try another.");
      a.name = n; ws.serializeAttachment(a);
      ws.send(JSON.stringify({ t: "name", name: n }));
    }
  }

  async onMessage(ws, a, m) {
    const now = Date.now();
    const user = await this.user(a.h);
    if (user.until > now) return err(ws, "muted", "You're muted for breaking the chat rules.", user.until);

    // Per-person rate limit
    a.sent = a.sent.filter((t) => now - t < 60e3);
    const last = a.sent[a.sent.length - 1] || 0;
    if (now - last < LIMITS.gapMs) return err(ws, "slow", "Slow down a little.", last + LIMITS.gapMs);
    if (a.sent.length >= LIMITS.perMin) return err(ws, "slow", "Too many messages. Take a short break.", a.sent[0] + 60e3);
    // Whole-room flood guard
    this.roomTimes = this.roomTimes.filter((t) => now - t < 10e3);
    if (this.roomTimes.length >= LIMITS.roomPer10s) return err(ws, "busy", "Chat is very busy. Try again in a few seconds.", now + 5000);

    if (typeof m.text !== "string") return;
    // Cut by characters, not UTF-16 units, so an emoji is never split in half.
    const text = [...tidy(m.text)].slice(0, LIMITS.maxLen).join("").trim();
    if (!text) return;
    // Spam walls: very long "words" and emoji floods are refused (no warning, text is given back).
    if (text.split(" ").some((w) => [...w].length > LIMITS.wordLen)) return err(ws, "long", `Words longer than ${LIMITS.wordLen} letters aren't allowed.`);
    if ((text.match(/\p{Extended_Pictographic}/gu) || []).length > LIMITS.emojis) return err(ws, "long", `Too many emojis. Use ${LIMITS.emojis} or fewer.`);
    const why = check(text, this.words);
    if (why) {
      const muted = await this.strike(ws, a.h);
      if (!muted) err(ws, "blocked", `${REASONS[why]} (warning ${user.strikes.length + 1} of ${LIMITS.strikes})`);
      return;
    }
    // Same message twice in a row = spam
    if (a.lastText && a.lastText === text.toLowerCase()) return err(ws, "dupe", "You already sent that.");
    // Pabati (shout-out): highlighted, so only 1 every 10 minutes per person (kept with their record).
    const pabati = m.g === 1 || m.g === true;
    if (pabati && now - (user.g || 0) < LIMITS.pabatiGapMs) {
      return err(ws, "pabati", "You can send 1 pabati every 10 minutes.", user.g + LIMITS.pabatiGapMs);
    }

    a.sent.push(now); a.lastText = text.toLowerCase();
    ws.serializeAttachment(a);
    this.roomTimes.push(now);

    // Optional "listening to" station; dropped silently if it breaks any rule.
    let s = "";
    if (typeof m.st === "string") {
      s = tidy(m.st).replace(/[^\p{L}\p{N} .,&'()+\-/:!]/gu, "").slice(0, LIMITS.stationLen).trim();
      if (s && check(s, this.words)) s = "";
    }

    const msg = { id: crypto.randomUUID().slice(0, 12), n: a.name, x: text, ts: now, h: a.h, rep: [] };
    if (s) msg.s = s;
    if (a.c && a.fl !== false) msg.c = a.c;
    if (pabati) {
      msg.g = 1;
      user.g = now;
      await this.ctx.storage.put(`u:${a.h}`, user);
      await this.scheduleCleanup();
    }
    this.msgs.push(msg);
    this.prune();
    await this.ctx.storage.put("msgs", this.msgs);
    this.lastCount = this.ctx.getWebSockets().length;
    this.broadcast({ t: "msg", m: pub(msg), online: this.lastCount });
  }

  // "is typing": relayed to everyone else, never stored. Throttled; muted people are skipped.
  async onTyping(ws, a, now) {
    if (now - (a.ty || 0) < LIMITS.typingGapMs) return;
    a.ty = now; ws.serializeAttachment(a);
    if ((await this.user(a.h)).until > now) return;
    const s = JSON.stringify({ t: "typing", n: a.name });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) try { other.send(s); } catch {}
  }

  /** True if a different person is using this name now, or posted with it in the visible history. */
  nameTaken(name, h) {
    const n = name.toLowerCase();
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment();
      if (a && a.h !== h && a.name.toLowerCase() === n) return true;
    }
    return this.msgs.some((x) => x.h !== h && x.n.toLowerCase() === n);
  }

  // Reactions (like Facebook): one per person per message; picking the same one again removes it.
  // Stored on the message as { hash: index }; others only ever see the counts.
  async onReact(ws, a, id, e) {
    const now = Date.now();
    if (!Number.isInteger(e) || e < -1 || e >= REACTIONS) return;
    const msg = this.msgs.find((x) => x.id === id);
    if (!msg) return;
    const user = await this.user(a.h);
    if (user.until > now) return err(ws, "muted", "You're muted for breaking the chat rules.", user.until);
    a.rx = (a.rx || []).filter((t) => now - t < 60e3);
    if (now - (a.rx[a.rx.length - 1] || 0) < LIMITS.reactGapMs || a.rx.length >= LIMITS.reactsPerMin) {
      return err(ws, "react", "Slow down with the reactions a little.");
    }
    const re = msg.re || (msg.re = {});
    if (e === -1) { if (!(a.h in re)) return; delete re[a.h]; }
    else { if (re[a.h] === e) return; re[a.h] = e; }
    a.rx.push(now); ws.serializeAttachment(a);
    await this.ctx.storage.put("msgs", this.msgs);
    // Tell all of this person's tabs which one they picked, then everyone the new counts.
    const mineMsg = JSON.stringify({ t: "reacted", id, e });
    for (const s of this.ctx.getWebSockets(a.h)) try { s.send(mineMsg); } catch {}
    this.broadcast({ t: "react", id, r: rxCounts(re) });
  }

  // Kalabit (poke) / cat scratch: a short animation on the other person's screen and a line in the chat
  // for everyone. Never stored. The target is picked through one of their messages (or "back" = whoever
  // poked you last). Only people who are online and haven't turned pokes off can be poked.
  async onPoke(ws, a, m) {
    const now = Date.now();
    const k = Number.isInteger(m.k) && m.k >= 0 && m.k < POKES ? m.k : 0;
    let target = "";
    if (m.back) target = a.pb && now - (a.pbt || 0) < LIMITS.pokeBackMs ? a.pb : "";
    else target = this.msgs.find((x) => x.id === String(m.id || ""))?.h || "";
    if (!target) return err(ws, "poke", m.back ? "Too late to poke back. Find their message to poke them." : "That message is gone.");
    if (target === a.h) return err(ws, "poke", "You can't poke yourself.");
    const user = await this.user(a.h);
    if (user.until > now) return err(ws, "muted", "You're muted for breaking the chat rules.", user.until);
    const theirs = this.ctx.getWebSockets(target).filter((s) => s.readyState === 1);
    if (!theirs.length) return err(ws, "poke", "They've left the chat.");
    const ta = theirs[0].deserializeAttachment() || {};
    if (theirs.every((s) => (s.deserializeAttachment() || {}).np)) return err(ws, "poke", `${ta.name || "They"} turned pokes off.`);
    a.pk = (a.pk || []).filter((p) => now - p.t < 60e3);
    if (a.pk.length >= LIMITS.pokesPerMin) return err(ws, "poke", "That's a lot of pokes. Wait a minute.");
    if (a.pk.some((p) => p.h === target && now - p.t < LIMITS.pokeSameMs)) return err(ws, "poke", `Give ${ta.name || "them"} a moment before poking again.`);
    a.pk.push({ h: target, t: now }); ws.serializeAttachment(a);
    const toThem = JSON.stringify({ t: "poked", n: a.name, k });
    for (const s of theirs) {
      const sa = s.deserializeAttachment() || {};
      if (sa.np) continue;
      sa.pb = a.h; sa.pbt = now; s.serializeAttachment(sa);
      try { s.send(toThem); } catch {}
    }
    this.broadcast({ t: "pokeline", a: a.name, b: ta.name || "", k });
  }

  async onReport(ws, a, id) {
    const now = Date.now();
    a.reps = (a.reps || []).filter((t) => now - t < 3600e3);
    if (a.reps.length >= LIMITS.reportsPerHour) return err(ws, "slow", "You've sent a lot of reports. Thank you, try again later.");
    const msg = this.msgs.find((x) => x.id === id);
    if (!msg || msg.h === a.h || msg.rep.includes(a.h)) return;
    a.reps.push(now); ws.serializeAttachment(a);
    msg.rep.push(a.h);
    ws.send(JSON.stringify({ t: "reported", id }));
    if (msg.rep.length >= LIMITS.reportsToHide) {
      await this.remove(id);
      await this.strike(null, msg.h);
    } else {
      await this.ctx.storage.put("msgs", this.msgs);
    }
  }

  // ----- strikes & mutes (stored per hashed IP; never the IP itself) -----
  async user(h) {
    const u = (await this.ctx.storage.get(`u:${h}`)) || { strikes: [], mutes: 0, until: 0 };
    u.strikes = u.strikes.filter((t) => Date.now() - t < LIMITS.strikeWindowMs);
    return u;
  }

  /** Adds a strike. Returns true if the person is now muted. */
  async strike(ws, h) {
    const now = Date.now();
    const u = await this.user(h);
    u.strikes.push(now);
    let muted = false;
    if (u.strikes.length >= LIMITS.strikes) {
      u.until = now + LIMITS.muteMs[Math.min(u.mutes, LIMITS.muteMs.length - 1)];
      u.mutes++; u.strikes = []; muted = true;
      // Remove everything they posted
      const theirs = this.msgs.filter((x) => x.h === h).map((x) => x.id);
      for (const id of theirs) await this.remove(id, false);
      await this.ctx.storage.put("msgs", this.msgs);
      for (const s of this.ctx.getWebSockets(h)) err(s, "muted", "You've been muted for breaking the chat rules.", u.until);
    }
    // Keep the record for a while after the mute ends, so repeat offenders get longer mutes.
    await this.ctx.storage.put(`u:${h}`, u);
    await this.scheduleCleanup();
    return muted;
  }

  async remove(id, save = true) {
    const before = this.msgs.length;
    this.msgs = this.msgs.filter((x) => x.id !== id);
    if (this.msgs.length === before) return;
    if (save) await this.ctx.storage.put("msgs", this.msgs);
    this.broadcast({ t: "del", id });
  }

  // One alarm slot serves two jobs: the daily clean-up and the follow-up online count.
  async armAlarm(at) {
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || at < cur) await this.ctx.storage.setAlarm(at);
  }

  async scheduleCleanup() {
    let at = await this.ctx.storage.get("cleanAt");
    if (!at) { at = Date.now() + 86400e3; await this.ctx.storage.put("cleanAt", at); }
    await this.armAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    // Follow-up online count (a change was skipped by the 10 s limit).
    this.lastPresence = 0;
    await this.presence();
    // Daily clean-up: forget people whose last mute/strike/pabati is older than 30 days.
    const cleanAt = await this.ctx.storage.get("cleanAt");
    if (cleanAt && now >= cleanAt) {
      const old = now - 30 * 86400e3;
      const users = await this.ctx.storage.list({ prefix: "u:" });
      const stale = [...users].filter(([, u]) => u.until < old && !u.strikes.some((t) => t > old) && !((u.g || 0) > old)).map(([k]) => k);
      for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
      if (users.size > stale.length) await this.ctx.storage.put("cleanAt", now + 86400e3);
      else await this.ctx.storage.delete("cleanAt");
    }
    const next = await this.ctx.storage.get("cleanAt");
    if (next) await this.armAlarm(next);
  }

  prune() {
    const cut = Date.now() - LIMITS.maxAgeMs;
    this.msgs = this.msgs.filter((x) => x.ts > cut).slice(-LIMITS.history);
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) try { ws.send(s); } catch {}
  }

  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {} await this.presence({ left: ws }); }
  async webSocketError(ws) { try { ws.close(1011, "error"); } catch {} await this.presence({ left: ws }); }

  // Push the online count when people join or leave: at most once every 10 s for the whole room,
  // only if the number changed, never stored. A change inside the 10 s window is sent when the
  // window ends (one alarm), so the count never stays wrong.
  async presence({ joined = null, left = null } = {}) {
    const now = Date.now();
    const open = this.ctx.getWebSockets().filter((s) => s !== left && s.readyState === 1);
    if (open.length === this.lastCount) return;
    if (now - this.lastPresence < LIMITS.presenceGapMs) return this.armAlarm(this.lastPresence + LIMITS.presenceGapMs);
    this.lastPresence = now;
    this.lastCount = open.length;
    const msg = JSON.stringify({ t: "online", n: open.length });
    for (const s of open) if (s !== joined) try { s.send(msg); } catch {}
  }

  // ----- admin: POST /admin with Authorization: Bearer <ADMIN_TOKEN> -----
  async admin(b) {
    const ok = (o) => Response.json({ ok: true, ...o });
    switch (b.action) {
      case "list": return ok({ msgs: this.msgs.map((x) => ({ ...pub(x), reports: x.rep.length })), words: this.words });
      case "clear":
        this.msgs = []; await this.ctx.storage.put("msgs", []);
        this.broadcast({ t: "clear" }); return ok({});
      case "del": await this.remove(String(b.id)); return ok({});
      case "ban": {
        const msg = this.msgs.find((x) => x.id === String(b.id));
        if (!msg) return ok({ found: false });
        const u = await this.user(msg.h);
        u.until = Date.now() + (Number(b.hours) || 24) * 3600e3; u.mutes++;
        await this.ctx.storage.put(`u:${msg.h}`, u);
        for (const id of this.msgs.filter((x) => x.h === msg.h).map((x) => x.id)) await this.remove(id, false);
        await this.ctx.storage.put("msgs", this.msgs);
        for (const s of this.ctx.getWebSockets(msg.h)) err(s, "muted", "You've been muted by a moderator.", u.until);
        return ok({ until: u.until });
      }
      case "addword": case "delword": {
        const w = String(b.word || "").toLowerCase().trim();
        if (!w) return ok({});
        this.words = this.words.filter((x) => x !== w);
        if (b.action === "addword") this.words.push(w);
        await this.ctx.storage.put("words", this.words);
        return ok({ words: this.words });
      }
      default: return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  }
}

// What other people see (never the hashed IP or report list).
const pub = (x) => ({ id: x.id, n: x.n, x: x.x, ts: x.ts, ...(x.s && { s: x.s }), ...(x.c && { c: x.c }), ...(x.g && { g: 1 }),
  ...(x.re && Object.keys(x.re).length && { r: rxCounts(x.re) }) });
/** { hash: index } -> [count per reaction] */
function rxCounts(re) {
  const r = new Array(REACTIONS).fill(0);
  for (const v of Object.values(re)) if (v >= 0 && v < REACTIONS) r[v]++;
  return r;
}
function err(ws, code, msg, until = 0) {
  try { ws.send(JSON.stringify({ t: "err", code, msg, until })); } catch {}
}
