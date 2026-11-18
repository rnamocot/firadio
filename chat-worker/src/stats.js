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

// Most played: each counted live ping adds one "listen" (about 2 minutes of play) to that station's total
// for the day. Only station totals per day are kept (no ids, no networks), for TOP_DAYS days.
// A tab scores at most once per TOP_GAP, so pinging faster than the app does earns nothing extra.
const TOP_DAYS = 30;
const TOP_N = 30;
const TOP_GAP = 100e3;
const TOP_KEEP_ROWS = 50000;   // hard cap on stored (station, day) rows

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

// ----- Mini games: leaderboards and play counts -----
// One row per game and name, keeping that name's best score. Names pass the chat word filter and the
// staff-name check. A score must fit the actions and time it took (each game sends both, checked against
// the per-game limits below), so typing a big number into the console doesn't work without also faking
// a believable game. Play counts (one per game start) sort the games menu by what people play most.
export const GAMES = {
  palaka:  { perAction: 8, msPerAction: 350 },  // 1 + up to 5 combo + flies per jump
  jeepney: { perSec: 3 },
  kite:    { perSec: 4 },
  taho:    { perSec: 7 },
  tumbang: { perAction: 4, msPerAction: 500 },  // 1 + streak bonus per throw
  sungka:  { perAction: 15 },                   // stored shells, +10 for a cleared board
  tuner:   { perSec: 3 },
  rene:    { perAction: 6, msPerAction: 400 },  // swish 3, x2 on fire, per shot
  tinikling: { perAction: 2, msPerAction: 400 }, // Perfect 2 per jump; a jump lasts 0.42 s
  dama:    { perAction: 8, msPerAction: 500 },  // captures 1/3, crown 2, win 5 x level (max 30); 12+ moves a board
  trivia:  { perAction: 4, msPerAction: 900 },  // up to 3 + 1 speed bonus per answer; 1.4 s reveal after each
};
const GAME_TOP = 10;
const GAME_KEEP = 300;          // rows kept per game; the lowest are pruned
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
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS gscores (g TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, score INTEGER NOT NULL, t INTEGER NOT NULL, who TEXT NOT NULL, PRIMARY KEY (g, name))");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS gplays (g TEXT PRIMARY KEY, n INTEGER NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS splays (st TEXT NOT NULL, d TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (st, d))");
      // One-time move of the first (Palaka-only) leaderboard into the per-game table.
      if (!(await ctx.storage.get("gscoresMoved"))) {
        ctx.storage.sql.exec("INSERT OR IGNORE INTO gscores (g, name, score, t, who) SELECT 'palaka', name, score, t, who FROM scores");
        await ctx.storage.put("gscoresMoved", true);
      }
    });
    this.pruned = 0;
    this.gameSaves = new Map(); // hashed IP -> [timestamps] (memory only)
  }

  gameTop(g) {
    return this.ctx.storage.sql.exec("SELECT name AS n, score AS s FROM gscores WHERE g = ? ORDER BY score DESC, t ASC LIMIT ?", g, GAME_TOP).toArray();
  }

  /** Every game's #1 and how many times each game has been started. */
  gameTops() {
    const sql = this.ctx.storage.sql, tops = {}, plays = {};
    for (const g of Object.keys(GAMES)) tops[g] = this.gameTop(g)[0] || null;
    for (const r of sql.exec("SELECT g, n FROM gplays").toArray()) if (r.g in GAMES) plays[r.g] = r.n;
    return { tops, plays };
  }

  gamePlay(g) {
    if (!(g in GAMES)) return false;
    this.ctx.storage.sql.exec("INSERT INTO gplays (g, n) VALUES (?, 1) ON CONFLICT(g) DO UPDATE SET n = n + 1", g);
    return true;
  }

  gameSave(b, who) {
    const now = Date.now();
    const recent = (this.gameSaves.get(who) || []).filter((x) => now - x < 3600e3);
    if (recent.length >= GAME_PER_HOUR) return { error: "Too many scores saved. Try again later.", status: 429 };
    const name = gameName(b.n);
    if (!name) return { error: "Please pick another name (2 to 20 letters, no bad words).", status: 400 };
    const g = typeof b.g === "string" && b.g in GAMES ? b.g : (b.g == null ? "palaka" : "");
    if (!g) return { error: "Unknown game.", status: 400 };
    const rule = GAMES[g];
    const score = b.s, acts = b.j, ms = b.d;
    const ok = [score, acts, ms].every(Number.isInteger) && score >= 1 && score <= GAME_MAX
      && acts >= 1 && ms <= 6 * 3600e3
      && (!rule.perAction || score <= acts * rule.perAction)
      && (!rule.msPerAction || ms >= acts * rule.msPerAction)
      && (!rule.perSec || score <= (ms / 1000) * rule.perSec + 3);
    if (!ok) return { error: "That score couldn't be checked.", status: 400 };
    recent.push(now); this.gameSaves.set(who, recent);
    if (this.gameSaves.size > 5000) this.gameSaves.clear();
    const sql = this.ctx.storage.sql;
    const had = sql.exec("SELECT score FROM gscores WHERE g = ? AND name = ?", g, name).toArray()[0];
    if (!had || score > had.score) sql.exec("INSERT OR REPLACE INTO gscores (g, name, score, t, who) VALUES (?, ?, ?, ?, ?)", g, name, score, now, who);
    const count = sql.exec("SELECT count(*) AS c FROM gscores WHERE g = ?", g).one().c;
    if (count > GAME_KEEP) sql.exec("DELETE FROM gscores WHERE g = ? AND name IN (SELECT name FROM gscores WHERE g = ? ORDER BY score ASC, t DESC LIMIT ?)", g, g, count - GAME_KEEP);
    const best = Math.max(score, had?.score || 0);
    const rank = sql.exec("SELECT count(*) AS c FROM gscores WHERE g = ? AND score > ?", g, best).one().c + 1;
    return { g, name, best, rank, top: this.gameTop(g) };
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
    const prev = sql.exec("SELECT st, t FROM live WHERE id = ?", b.id).toArray()[0];
    if (!prev) {
      const mine = sql.exec("SELECT count(*) AS c FROM live WHERE who = ? AND t >= ?", who, now - LIVE_WINDOW).one().c;
      const all = sql.exec("SELECT count(*) AS c FROM live").one().c;
      if (mine >= LIVE_PER_NET || all >= LIVE_MAX) return this.liveCount(b.s, b.id); // not counted, still answered
    }
    // A new tab, or the regular 2-minute ping: one listen for this station. A station switch scores at the
    // next regular ping, so flipping between stations quickly doesn't add anything.
    if (!prev || now - prev.t >= TOP_GAP) this.addListen(b.s, now);
    sql.exec("INSERT OR REPLACE INTO live (id, st, who, t) VALUES (?, ?, ?, ?)", b.id, b.s, who, now);
    return this.liveCount(b.s, b.id);
  }

  addListen(st, now) {
    const sql = this.ctx.storage.sql;
    const d = new Date(now).toISOString().slice(0, 10);
    if (d !== this.topDay) { // once a day: drop days that no longer count
      this.topDay = d;
      sql.exec("DELETE FROM splays WHERE d < ?", new Date(now - TOP_DAYS * 864e5).toISOString().slice(0, 10));
    }
    const exists = sql.exec("SELECT 1 FROM splays WHERE st = ? AND d = ?", st, d).toArray().length > 0;
    if (!exists && sql.exec("SELECT count(*) AS c FROM splays").one().c >= TOP_KEEP_ROWS) return;
    sql.exec("INSERT INTO splays (st, d, n) VALUES (?, ?, 1) ON CONFLICT(st, d) DO UPDATE SET n = n + 1", st, d);
  }

  /** Most played stations over the last TOP_DAYS days: [{ s: station key, n: listens }]. */
  topStations() {
    const from = new Date(Date.now() - TOP_DAYS * 864e5).toISOString().slice(0, 10);
    return this.ctx.storage.sql.exec(
      "SELECT st AS s, sum(n) AS n FROM splays WHERE d >= ? GROUP BY st ORDER BY n DESC LIMIT ?", from, TOP_N).toArray();
  }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname;

    if (path === "/top") return Response.json({ days: TOP_DAYS, top: this.topStations() });

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

    if (path === "/game/top") {
      const g = url.searchParams.get("g") || "palaka";
      return g in GAMES ? Response.json({ top: this.gameTop(g) }) : Response.json({ error: "unknown game" }, { status: 400 });
    }
    if (path === "/game/tops") return Response.json(this.gameTops());
    if (path === "/game/play" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      return this.gamePlay(b.g) ? Response.json({ ok: true }) : Response.json({ error: "unknown game" }, { status: 400 });
    }
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
        const g = String(b.g || "palaka");
        this.ctx.storage.sql.exec("DELETE FROM gscores WHERE g = ? AND name = ?", g, String(b.name || ""));
        return Response.json({ ok: true, top: this.gameTop(g) });
      }
      if (b.action === "stats") return Response.json({ ok: true, counts: this.counts, base: this.base });
      return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  }
}
