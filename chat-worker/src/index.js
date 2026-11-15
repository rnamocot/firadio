// FilRadio global chat: one Cloudflare Durable Object holds the room.
// Runs on Cloudflare (not Hostinger). WebSocket Hibernation means idle listeners cost nothing.
import { DurableObject } from "cloudflare:workers";
import { check, tidy } from "./filter.js";

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
};

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
  async fetch(req, env) {
    const url = new URL(req.url);
    const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
    // Everything below is answered at the edge without waking the chat room.
    if (url.pathname === "/admin") {
      if (!(await allowed(env.ADMIN_LIMIT, ip))) return deny(429);
      return adminProxy(req, env);
    }
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
  if (Number(req.headers.get("Content-Length") || 0) > 2000) return deny(413);
  return env.ROOM.get(env.ROOM.idFromName("global")).fetch(new Request("https://room/admin", { method: "POST", body: await req.text() }));
}

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.msgs = [];
    this.words = [];
    this.roomTimes = [];
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
    if (!name || check(name)) name = guestName();
    server.serializeAttachment({ h, name, sent: [], fr: [] });

    this.prune();
    const user = await this.user(h);
    server.send(JSON.stringify({
      t: "init", name, online: this.ctx.getWebSockets().length,
      muted: user.until > Date.now() ? user.until : 0,
      msgs: this.msgs.map(pub),
    }));
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
    if (m.t === "report") return this.onReport(ws, a, String(m.id || ""));
    if (m.t === "name" && typeof m.name === "string") {
      const n = cleanName(m.name);
      if (!n) return err(ws, "name", "Name must be 2 to 20 letters or numbers.");
      const why = check(n);
      if (why) { await this.strike(ws, a.h); return err(ws, "name", "That name isn't allowed."); }
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
    const text = tidy(m.text).slice(0, LIMITS.maxLen);
    if (!text) return;
    const why = check(text, this.words);
    if (why) {
      const muted = await this.strike(ws, a.h);
      if (!muted) err(ws, "blocked", `${REASONS[why]} (warning ${user.strikes.length + 1} of ${LIMITS.strikes})`);
      return;
    }
    // Same message twice in a row = spam
    if (a.lastText && a.lastText === text.toLowerCase()) return err(ws, "dupe", "You already sent that.");

    a.sent.push(now); a.lastText = text.toLowerCase();
    ws.serializeAttachment(a);
    this.roomTimes.push(now);

    const msg = { id: crypto.randomUUID().slice(0, 12), n: a.name, x: text, ts: now, h: a.h, rep: [] };
    this.msgs.push(msg);
    this.prune();
    await this.ctx.storage.put("msgs", this.msgs);
    this.broadcast({ t: "msg", m: pub(msg), online: this.ctx.getWebSockets().length });
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
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + 86400e3);
    return muted;
  }

  async remove(id, save = true) {
    const before = this.msgs.length;
    this.msgs = this.msgs.filter((x) => x.id !== id);
    if (this.msgs.length === before) return;
    if (save) await this.ctx.storage.put("msgs", this.msgs);
    this.broadcast({ t: "del", id });
  }

  // Daily clean-up: forget people whose last mute ended more than 30 days ago.
  async alarm() {
    const old = Date.now() - 30 * 86400e3;
    const users = await this.ctx.storage.list({ prefix: "u:" });
    const stale = [...users].filter(([, u]) => u.until < old && !u.strikes.some((t) => t > old)).map(([k]) => k);
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    if (users.size > stale.length) await this.ctx.storage.setAlarm(Date.now() + 86400e3);
  }

  prune() {
    const cut = Date.now() - LIMITS.maxAgeMs;
    this.msgs = this.msgs.filter((x) => x.ts > cut).slice(-LIMITS.history);
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) try { ws.send(s); } catch {}
  }

  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {} }
  async webSocketError(ws) { try { ws.close(1011, "error"); } catch {} }

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
const pub = (x) => ({ id: x.id, n: x.n, x: x.x, ts: x.ts });
function err(ws, code, msg, until = 0) {
  try { ws.send(JSON.stringify({ t: "err", code, msg, until })); } catch {}
}
