import { check, tidy, reserved } from "./filter.js";
// FilRadio visitor counter + anonymous traffic report (replaces the Abacus counters).
// Its own Durable Object, so visitor counts never wake the chat room.
//
// Cheap by design:
// - a visitor sends ONE request per device per day (POST /hit) to be counted;
// - the footer number is re-read at most once an hour per device (GET /count);
// - the stats page makes ONE request (GET /stats) instead of 80;
// - reads are cached at the Cloudflare edge for 60 s, so refreshes don't reach this object.
//
// Abuse limits: Origin allowlist, edge rate limits, key format checks, at most 5 keys per hit
// (one per group), a cap on how many different keys can ever exist, and at most PER_IP_DAY
// counted visits per network per day (mobile carriers share IPs, so this is generous).
// It also counts live listeners (POST /live, GET /live), see below.
import { DurableObject } from "cloudflare:workers";

const KEY_RE = /^(src|loc|cc|dev|os)-[a-z]{1,12}(-[a-z]{1,12})?$/;
const MAX_KEYS = 200;
const PER_IP_DAY = 30;

// Live listeners: a playing tab pings POST /live every 2 minutes with a random tab id and the
// station key. Anyone seen in the last LIVE_WINDOW counts as "listening now". Rows are deleted
// once stale, so the table only ever holds the current listeners (nothing kept long term).
const LIVE_WINDOW = 200e3;
const LIVE_PER_NET = 60;   // max listeners counted from one network (mobile carriers share IPs)
const LIVE_MAX = 20000;    // hard cap on rows
const ID_RE = /^[a-f0-9]{16}$/;
const ST_RE = /^[a-z0-9]{1,60}$/;

/** Validates the keys a visitor sends: at most one per group, known format only. */
export function cleanKeys(k) {
  if (!Array.isArray(k) || k.length > 5) return null;
  const groups = new Set();
  for (const x of k) {
    if (typeof x !== "string" || !KEY_RE.test(x)) return null;
    const g = x.slice(0, x.indexOf("-"));
    if (groups.has(g)) return null;
    groups.add(g);
  }
  return k;
}

// ----- Mini game leaderboard ("Talon, Palaka!") -----
// One row per name, keeping that name's best score. Names pass the chat word filter and the
// staff-name check. A score must fit the jumps and time it took (the game sends both), so typing
// a big number into the console doesn't work without also faking a believable game.
const GAME_TOP = 10;
const GAME_KEEP = 300;          // rows kept; the lowest are pruned
const GAME_MAX = 5000;          // highest score accepted
const GAME_PER_HOUR = 20;       // saves per network per hour

function gameName(raw) {
  const n = tidy(String(raw || "")).replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").slice(0, 20).trim();
  if (n.length < 2 || check(n) || reserved(n)) return "";
  return n;
}

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.nets = new Map(); // hashed IP -> visits counted today (memory only, never stored)
    this.day = "";
    ctx.blockConcurrencyWhile(async () => {
      this.counts = (await ctx.storage.get("counts")) || {}; // counted here
      this.base = (await ctx.storage.get("base")) || {};     // totals imported from Abacus
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS live (id TEXT PRIMARY KEY, st TEXT NOT NULL, who TEXT NOT NULL, t INTEGER NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS scores (name TEXT PRIMARY KEY COLLATE NOCASE, score INTEGER NOT NULL, t INTEGER NOT NULL, who TEXT NOT NULL)");
    });
    this.pruned = 0;
    this.gameSaves = new Map(); // hashed IP -> [timestamps] (memory only)
  }

  gameTop() {
    return this.ctx.storage.sql.exec("SELECT name AS n, score AS s FROM scores ORDER BY score DESC, t ASC LIMIT ?", GAME_TOP).toArray();
  }

  gameSave(b, who) {
    const now = Date.now();
    const recent = (this.gameSaves.get(who) || []).filter((x) => now - x < 3600e3);
    if (recent.length >= GAME_PER_HOUR) return { error: "Too many scores saved. Try again later.", status: 429 };
    const name = gameName(b.n);
    if (!name) return { error: "Please pick another name (2 to 20 letters, no bad words).", status: 400 };
    const score = b.s, jumps = b.j, ms = b.d;
    const ok = [score, jumps, ms].every(Number.isInteger) && score >= 1 && score <= GAME_MAX
      && jumps >= 1 && score <= jumps * 8 && ms >= jumps * 350 && ms <= 6 * 3600e3;
    if (!ok) return { error: "That score couldn't be checked.", status: 400 };
    recent.push(now); this.gameSaves.set(who, recent);
    if (this.gameSaves.size > 5000) this.gameSaves.clear();
    const sql = this.ctx.storage.sql;
    const had = sql.exec("SELECT score FROM scores WHERE name = ?", name).toArray()[0];
    if (!had || score > had.score) sql.exec("INSERT OR REPLACE INTO scores (name, score, t, who) VALUES (?, ?, ?, ?)", name, score, now, who);
    const count = sql.exec("SELECT count(*) AS c FROM scores").one().c;
    if (count > GAME_KEEP) sql.exec("DELETE FROM scores WHERE name IN (SELECT name FROM scores ORDER BY score ASC, t DESC LIMIT ?)", count - GAME_KEEP);
    const best = Math.max(score, had?.score || 0);
    const rank = sql.exec("SELECT count(*) AS c FROM scores WHERE score > ?", best).one().c + 1;
    return { name, best, rank, top: this.gameTop() };
  }

  total(k) { return (this.counts[k] || 0) + (this.base[k] || 0); }

  all() {
    const o = { ...this.base };
    for (const [k, v] of Object.entries(this.counts)) o[k] = (o[k] || 0) + v;
    return o;
  }

  /** Listeners right now, and how many others are on station `st` (excluding tab `id`). */
  liveCount(st = "", id = "") {
    const row = this.ctx.storage.sql.exec(
      "SELECT count(*) AS n, coalesce(sum(st = ? AND id != ?), 0) AS here FROM live WHERE t >= ?",
      st, id, Date.now() - LIVE_WINDOW).one();
    return { n: row.n, here: row.here };
  }

  live(b, who) {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    if (now - this.pruned > 60e3) { this.pruned = now; sql.exec("DELETE FROM live WHERE t < ?", now - LIVE_WINDOW); }
    if (!ID_RE.test(b.id || "")) return null;
    if (b.end) { sql.exec("DELETE FROM live WHERE id = ?", b.id); return this.liveCount(); }
    if (!ST_RE.test(b.s || "")) return null;
    const known = sql.exec("SELECT 1 FROM live WHERE id = ?", b.id).toArray().length > 0;
    if (!known) {
      const mine = sql.exec("SELECT count(*) AS c FROM live WHERE who = ? AND t >= ?", who, now - LIVE_WINDOW).one().c;
      const all = sql.exec("SELECT count(*) AS c FROM live").one().c;
      if (mine >= LIVE_PER_NET || all >= LIVE_MAX) return this.liveCount(b.s, b.id); // not counted, still answered
    }
    sql.exec("INSERT OR REPLACE INTO live (id, st, who, t) VALUES (?, ?, ?, ?)", b.id, b.s, who, now);
    return this.liveCount(b.s, b.id);
  }

  async fetch(req) {
    const path = new URL(req.url).pathname;

    if (path === "/live") {
      if (req.method === "GET") return Response.json({ n: this.liveCount().n });
      const out = this.live(await req.json().catch(() => ({})), req.headers.get("X-Who") || "");
      return out ? Response.json(out) : Response.json({ error: "bad ping" }, { status: 400 });
    }

    if (path === "/hit") {
      const keys = cleanKeys((await req.json().catch(() => ({}))).k);
      if (!keys) return Response.json({ error: "bad keys" }, { status: 400 });
      const today = new Date().toISOString().slice(0, 10);
      if (today !== this.day) { this.day = today; this.nets.clear(); }
      const h = req.headers.get("X-Who") || "";
      const n = (this.nets.get(h) || 0) + 1;
      this.nets.set(h, n);
      if (n <= PER_IP_DAY) {
        let size = Object.keys(this.counts).length;
        for (const k of ["visits", ...keys]) {
          if (!(k in this.counts)) { if (size >= MAX_KEYS) continue; size++; }
          this.counts[k] = (this.counts[k] || 0) + 1;
        }
        await this.ctx.storage.put("counts", this.counts); // one write per counted visit
      }
      return Response.json({ visits: this.total("visits") });
    }

    if (path === "/game/top") return Response.json({ top: this.gameTop() });
    if (path === "/game/score" && req.method === "POST") {
      const r = this.gameSave(await req.json().catch(() => ({})), req.headers.get("X-Who") || "");
      const { status = 200, ...body } = r;
      return Response.json(body, { status });
    }

    if (path === "/count") return Response.json({ visits: this.total("visits") });
    if (path === "/stats") return Response.json({ counts: this.all() });

    // Admin (reached only through the token-checked /admin proxy in index.js).
    if (path === "/admin") {
      const b = await req.json().catch(() => ({}));
      if (b.action === "statsbase") {
        // Sets the imported starting totals (replaces any earlier import, so it is safe to run again).
        const base = {};
        for (const [k, v] of Object.entries(b.counts || {})) {
          if ((k === "visits" || KEY_RE.test(k)) && Number.isInteger(v) && v >= 0 && v < 1e9) base[k] = v;
        }
        if (Object.keys(base).length > MAX_KEYS) return Response.json({ ok: false, error: "too many keys" }, { status: 400 });
        this.base = base;
        await this.ctx.storage.put("base", base);
        return Response.json({ ok: true, keys: Object.keys(base).length, visits: this.total("visits") });
      }
      if (b.action === "statsgamedel") { // remove a name from the game leaderboard
        this.ctx.storage.sql.exec("DELETE FROM scores WHERE name = ?", String(b.name || ""));
        return Response.json({ ok: true, top: this.gameTop() });
      }
      if (b.action === "stats") return Response.json({ ok: true, counts: this.counts, base: this.base });
      return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  }
}
