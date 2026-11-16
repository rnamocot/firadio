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
import { DurableObject } from "cloudflare:workers";

const KEY_RE = /^(src|loc|cc|dev|os)-[a-z]{1,12}(-[a-z]{1,12})?$/;
const MAX_KEYS = 200;
const PER_IP_DAY = 30;

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

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.nets = new Map(); // hashed IP -> visits counted today (memory only, never stored)
    this.day = "";
    ctx.blockConcurrencyWhile(async () => {
      this.counts = (await ctx.storage.get("counts")) || {}; // counted here
      this.base = (await ctx.storage.get("base")) || {};     // totals imported from Abacus
    });
  }

  total(k) { return (this.counts[k] || 0) + (this.base[k] || 0); }

  all() {
    const o = { ...this.base };
    for (const [k, v] of Object.entries(this.counts)) o[k] = (o[k] || 0) + v;
    return o;
  }

  async fetch(req) {
    const path = new URL(req.url).pathname;

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
      if (b.action === "stats") return Response.json({ ok: true, counts: this.counts, base: this.base });
      return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  }
}
