// Static SEO pages, written into dist/ by tools/build.py (node tools/build_pages.mjs <dist>):
//   /station/<slug>/   one page per station that plays on FilRadio
//   /city/<slug>/      one page per place with 2+ stations
//   /stations/         hub: every city and every station, A to Z
// and the matching sitemap entries.
//
// Cheap to serve by design: plain HTML with inline CSS, no scripts, no web fonts, no calls to the chat or
// stats server. Cloudflare caches them like the rest of the site. Station logos load from the stations' own
// hosts. The "Listen live" button opens the app on that station (/?station=<key>).
//
// Page addresses never change once given: data/page-slugs.json keeps station key -> slug (commit it).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.resolve(process.argv[2] || path.join(ROOT, "dist"));
const SITE = "https://filradio.xyz";
const SLUGS_FILE = path.join(ROOT, "data", "page-slugs.json");
const TODAY = new Date().toISOString().slice(0, 10);

// ----- Shared station rules (same code the app runs) -----
const sandbox = { RegExp, Object, Math, String, Number, Array };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["js/places.js", "js/station-core.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
const { clean, norm, tidyName, classify, freqFull, findPlace, stationHome } = sandbox.FilCore;
const PLACES = sandbox.PH_PLACES;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const slugify = (s) => clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "") || "station";
const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

// ----- Stations, merged the same way the app merges them -----
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "stations.json"), "utf8")).d;
const byKey = new Map();
for (const s of raw) {
  if (!s.url) continue;
  const key = norm(s.n);
  if (!key || key.length > 60) continue;
  let st = byKey.get(key);
  if (!st) {
    const full = clean(s.n);
    const cls = classify(full, s.t || "");
    st = { key, name: tidyName(full), band: cls.band, num: cls.num, tags: [], state: clean(s.st), logo: safeUrl(s.f),
           site: safeUrl(s.hp), votes: 0, playable: false, on: false };
    byKey.set(key, st);
  }
  st.votes += s.v || 0;
  for (const t of String(s.t || "").split(",")) { const x = clean(t).toLowerCase(); if (x && x.length <= 30 && !st.tags.includes(x)) st.tags.push(x); }
  if (!st.logo) st.logo = safeUrl(s.f);
  if (!st.site) st.site = safeUrl(s.hp);
  if (!st.state && s.st) st.state = clean(s.st);
  // Plays inside FilRadio: an https stream, or an http one on a named host the app upgrades to https.
  if (/^https:/i.test(s.url) || /^http:\/\/(?!(\d+\.\d+\.\d+\.\d+|\[))/i.test(s.url)) st.playable = true;
  if (s.on === 1 || s.ok) st.on = true;
}

// Stable addresses: once a station has a page it keeps it (while it's in the data), even if it was off air
// at the last check, so Google never finds a page gone missing.
let slugs = {};
try { slugs = JSON.parse(fs.readFileSync(SLUGS_FILE, "utf8")); } catch {}
const stations = [...byKey.values()].filter((st) => st.playable && (st.on || slugs[st.key]));
for (const st of stations) {
  st.place = findPlace(st.state, st.name, st.tags.join(", ")) || stationHome(st.name);
  st.freq = freqFull(st);
}

// Places that share coordinates (Manila / Metro Manila / NCR, Paranaque / Parañaque) are one city page,
// named after the spelling most of its stations use.
const groups = new Map();
for (const st of stations) {
  if (!st.place) continue;
  const g = PLACES[st.place].join(",");
  if (!groups.has(g)) groups.set(g, { names: new Map(), list: [] });
  const grp = groups.get(g);
  grp.names.set(st.place, (grp.names.get(st.place) || 0) + 1);
  grp.list.push(st);
}
const cities = [];
for (const grp of groups.values()) {
  const name = [...grp.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
  const city = { name, slug: slugify(name), list: grp.list.sort((a, b) => b.votes - a.votes) };
  for (const st of grp.list) st.city = city;
  if (grp.list.length >= 2) cities.push(city);
}
cities.sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));
const cityPage = new Set(cities);

// ----- Page addresses (new stations get one; existing ones never change) -----
const taken = new Set(Object.values(slugs));
for (const st of [...stations].sort((a, b) => b.votes - a.votes)) {
  if (!slugs[st.key]) {
    let base = slugify(st.name), s = base, i = 2;
    while (taken.has(s)) s = `${base}-${i++}`;
    slugs[st.key] = s; taken.add(s);
  }
  st.slug = slugs[st.key];
}
fs.writeFileSync(SLUGS_FILE, JSON.stringify(Object.fromEntries(Object.entries(slugs).sort()), null, 1) + "\n");

// ----- Page parts -----
const CSS = `:root{--paper:#f4f1ea;--panel:#fffdf8;--ink:#10182b;--text:#10182b;--muted:#5d6270;--line:#e6e0d2;--sun:#ffc93c;--fm:#2347d6;--am:#e4572e;--on:#14a37f;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#0b1020;--panel:#141b2e;--text:#eef0f5;--muted:#9aa2b5;--line:#232c44}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}main{max-width:760px;margin:0 auto;padding:16px 16px 48px}
.top{display:flex;align-items:center;gap:10px;padding:14px 16px;max-width:760px;margin:0 auto}
.top a{display:flex;align-items:center;gap:8px;text-decoration:none;font-weight:800;font-size:18px}.top img{border-radius:8px}
.crumbs{font-size:13px;color:var(--muted);margin:0 0 14px}.crumbs a{color:var(--muted)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:20px}
.head{display:flex;gap:16px;align-items:center}span.logo{display:block}span.logo svg{width:100%;height:100%;display:block}.logo{width:88px;height:88px;border-radius:16px;object-fit:cover;background:var(--line);flex:none}
h1{font-size:clamp(22px,5vw,30px);line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}h2{font-size:18px;margin:28px 0 10px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.chips li{font-size:13px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid var(--line)}
.chips .FM{background:var(--fm);color:#fff;border:0}.chips .AM{background:var(--am);color:#fff;border:0}.chips .Online{background:var(--on);color:#fff;border:0}
.play{display:inline-flex;align-items:center;gap:10px;margin:18px 0 4px;padding:14px 22px;border-radius:999px;background:var(--sun);color:#10182b;font-weight:800;font-size:17px;text-decoration:none}
.play:hover{filter:brightness(1.05)}.play svg{width:20px;height:20px}
p.lead{margin:14px 0 0}.muted{color:var(--muted);font-size:14px}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.list a{display:flex;flex-direction:column;padding:10px 12px;border-radius:14px;background:var(--panel);border:1px solid var(--line);text-decoration:none}
.list a b{font-size:15px}.list a span{font-size:13px;color:var(--muted)}.list a:hover{border-color:var(--sun)}
.cities{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}.cities a{display:block;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);text-decoration:none;font-size:14px}
footer{max-width:760px;margin:0 auto;padding:20px 16px 40px;font-size:13px;color:var(--muted)}footer a{color:var(--muted)}`;

const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`;

function page({ url, title, desc, body, jsonld, image }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${url}" />
<meta name="theme-color" content="#10182B" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="FilRadio" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${url}" />
<meta property="og:image" content="${esc(image || `${SITE}/og-image.png`)}" />
<meta name="twitter:card" content="summary_large_image" />
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="top"><a href="/"><img src="/icon.svg" alt="" width="32" height="32" />FilRadio</a></header>
<main>
${body}
</main>
<footer>FilRadio: free Philippine FM, AM and online radio on a map, for Pinoys at home and OFWs abroad.
<a href="/">Open the radio map</a> · <a href="/stations/">All stations</a> · <a href="/games/">Free games</a> · <a href="/add-station.html">Add your station</a> · <a href="/sitemap.html">Sitemap</a> · <a href="/privacy.html">Privacy</a></footer>
<img src="https://chat.filradio.xyz/pv?p=${encodeURIComponent(url)}" alt="" width="1" height="1" referrerpolicy="origin" style="position:absolute;left:-9999px" />
</body>
</html>
`;
}

const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + url })),
});
const crumbHtml = (items) => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([n, u], i) => (i < items.length - 1 ? `<a href="${u}">${esc(n)}</a>` : esc(n))).join(" › ")}</nav>`;
const bandLabel = (st) => (st.band === "Online" ? "Online radio" : `${st.band} radio`);
const stationLine = (st) => [st.band === "Online" ? "Online" : st.freq ? `${st.band} ${st.freq}` : st.band, st.city?.name].filter(Boolean).join(" · ");
const card = (st) => `<li><a href="/station/${st.slug}/"><b>${esc(st.name)}</b><span>${esc(stationLine(st))}</span></a></li>`;

function write(rel, html) {
  const dir = path.join(DIST, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

// ----- Station pages -----
for (const st of stations) {
  const city = st.city;
  const where = city ? city.name : "";
  const genres = st.tags.filter((t) => !/^(fm|am|radio|philippines|pinoy|filipino|ph)$/.test(t)).slice(0, 5);
  const title = `${st.name}${where && !st.name.toLowerCase().includes(where.toLowerCase()) ? ` ${where}` : ""}, Listen Live Online | FilRadio`;
  const desc = `Listen to ${st.name} live and free on FilRadio. ${st.band === "Online" ? "Online radio" : `${st.band}${st.freq ? ` ${st.freq}` : ""} radio`}${where ? ` from ${where}` : " from the Philippines"}${genres.length ? `: ${genres.slice(0, 3).join(", ")}` : ""}. Works anywhere, for Pinoys at home and abroad.`;
  const trail = [["FilRadio", "/"], ["Stations", "/stations/"], ...(cityPage.has(city) ? [[`${where} radio`, `/city/${city.slug}/`]] : []), [st.name, `/station/${st.slug}/`]];
  const near = cityPage.has(city) ? city.list.filter((x) => x !== st).slice(0, 12) : [];
  const similar = stations.filter((x) => x !== st && x.band === st.band && !near.includes(x) && (genres[0] ? x.tags.includes(genres[0]) : true))
    .sort((a, b) => b.votes - a.votes).slice(0, 8);
  const facts = [
    `<li class="${st.band}">${esc(st.band === "Online" ? "Online" : st.band)}${st.freq ? ` ${esc(st.freq)}` : ""}</li>`,
    where ? `<li>${esc(where)}</li>` : "",
    ...genres.map((g) => `<li>${esc(titleCase(g))}</li>`),
  ].join("");
  const body = `${crumbHtml(trail)}
<article class="card">
<div class="head">
${st.logo ? `<img class="logo" src="${esc(st.logo)}" alt="${esc(st.name)} logo" width="88" height="88" referrerpolicy="no-referrer" />` : `<img class="logo" src="/icon.svg" alt="" width="88" height="88" />`}
<div><h1>${esc(st.name)}</h1><ul class="chips">${facts}</ul></div>
</div>
<a class="play" href="/?station=${encodeURIComponent(st.key)}" rel="nofollow">${PLAY_ICON}Listen live on FilRadio</a>
<p class="lead">${esc(st.name)} is ${st.band === "Online" ? "an online radio station" : `an ${st.band} radio station${st.freq ? ` on ${st.freq}` : ""}`}${where ? ` in ${esc(where)}` : " in the Philippines"}. Tap <b>Listen live</b> to play it free in your browser, on your phone or computer, at home or abroad. No app or sign-up needed.</p>
${st.site ? `<p class="muted">Station website: <a href="${esc(st.site)}" rel="nofollow noopener" target="_blank">${esc(st.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 60))}</a></p>` : ""}
</article>
${near.length ? `<h2>More radio stations in ${esc(where)}</h2><ul class="list">${near.map(card).join("")}</ul>` : ""}
${similar.length ? `<h2>Similar ${esc(bandLabel(st))} stations</h2><ul class="list">${similar.map(card).join("")}</ul>` : ""}
<p class="muted" style="margin-top:28px"><a href="/stations/">Browse all Philippine radio stations</a></p>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "RadioStation", "@id": `${SITE}/station/${st.slug}/#station`, name: st.name, url: `${SITE}/station/${st.slug}/`,
        ...(st.logo ? { logo: st.logo, image: st.logo } : {}), ...(st.site ? { sameAs: [st.site] } : {}),
        ...(genres.length ? { genre: genres } : {}),
        address: { "@type": "PostalAddress", addressCountry: "PH", ...(where ? { addressLocality: where } : {}) } },
      crumbs(trail),
    ],
  };
  write(`station/${st.slug}`, page({ url: `/station/${st.slug}/`, title, desc, body, jsonld }));
}

// ----- City pages -----
for (const city of cities) {
  const fm = city.list.filter((s) => s.band === "FM").length, am = city.list.filter((s) => s.band === "AM").length;
  const title = `${city.name} Radio Stations, Listen Live FM & AM Online | FilRadio`;
  const desc = `Listen to ${city.list.length} radio stations from ${city.name} live and free: ${city.list.slice(0, 3).map((s) => s.name).join(", ")} and more. FM, AM and online radio on FilRadio.`;
  const trail = [["FilRadio", "/"], ["Stations", "/stations/"], [`${city.name} radio`, `/city/${city.slug}/`]];
  const others = cities.filter((c) => c !== city).slice(0, 24);
  const body = `${crumbHtml(trail)}
<h1>${esc(city.name)} radio stations, live</h1>
<p>${city.list.length} stations from ${esc(city.name)}${fm || am ? ` (${[fm && `${fm} FM`, am && `${am} AM`].filter(Boolean).join(", ")})` : ""} you can play free on FilRadio, anywhere in the world. Tap a station, then <b>Listen live</b>.</p>
<ul class="list">${city.list.map(card).join("")}</ul>
<a class="play" href="/" >${PLAY_ICON}Open the radio map</a>
<h2>Radio in other places</h2><ul class="cities">${others.map((c) => `<li><a href="/city/${c.slug}/">${esc(c.name)}</a></li>`).join("")}</ul>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: `${city.name} radio stations`, url: `${SITE}/city/${city.slug}/`,
      mainEntity: { "@type": "ItemList", itemListElement: city.list.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/station/${s.slug}/`, name: s.name })) } },
    crumbs(trail)] };
  write(`city/${city.slug}`, page({ url: `/city/${city.slug}/`, title, desc, body, jsonld }));
}

// ----- Hub -----
{
  const az = [...stations].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const title = "All Philippine Radio Stations, Listen Live FM, AM & Online | FilRadio";
  const desc = `Browse ${stations.length} Philippine radio stations you can play live and free: FM, AM and online radio from Luzon, Visayas and Mindanao, by city or A to Z.`;
  const trail = [["FilRadio", "/"], ["Stations", "/stations/"]];
  const body = `${crumbHtml(trail)}
<h1>Philippine radio stations</h1>
<p>${stations.length} FM, AM and online stations that play free on FilRadio. Pick a city or a station, or <a href="/">open the radio map</a>.</p>
<h2>By city and province</h2><ul class="cities">${[...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<li><a href="/city/${c.slug}/">${esc(c.name)} (${c.list.length})</a></li>`).join("")}</ul>
<h2>All stations, A to Z</h2><ul class="list">${az.map(card).join("")}</ul>`;
  write("stations", page({ url: "/stations/", title, desc, body, jsonld: { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: "Philippine radio stations", url: `${SITE}/stations/` }, crumbs(trail)] } }));
}

// ----- Game pages: /games/ and /games/<slug>/ (the Play button opens the app on that game: /?game=<id>) -----
// Titles, art and how-to come from the GAMES list in js/game.js, so the pages always match the games menu.
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const gm = gameSrc.match(/const GAMES = (\[[\s\S]*?\n  \]);/);
if (!gm) throw new Error("GAMES list not found in js/game.js");
const GAMES = vm.runInNewContext(gm[1]);
// A few lines each about what the game is, for people (and search engines) who haven't played it.
const GAME_ABOUT = {
  palaka: "Help a little frog hop across the river from lily pad to lily pad. Time each jump, land in the middle for Perfect combos and snap up flies for bonus points.",
  jeepney: "Drive a Filipino jeepney down the street and stop right beside waving passengers. Every fare buys you more time, so brake at the right moment.",
  kite: "Fly a saranggola (Filipino kite) over a fiesta town. Rise and drift past birds and electric wires, and collect banderitas along the way.",
  taho: "Catch falling sago and arnibal in your taho cup while dodging pebbles. A quick, simple game inspired by the morning taho vendor.",
  tumbang: "The classic Filipino street game: throw your tsinelas to knock down the can. Time the aim and power, and watch the wind.",
  sungka: "A solo take on sungka, the Filipino shell board game. Sow shells pit by pit into your store, chain free moves and clear the board.",
  tuner: "Turn the dial of an old radio and find the hidden station in the static. Follow the signal meter and hold steady to lock it in.",
  tinikling: "The Philippine bamboo dance as a rhythm game. Two bamboo poles tap open on the beat and clap shut; jump at the right moment so they close under your feet. Clap at the top of your jump for a Perfect, and keep up as the tempo rises.",
  dama: "Filipino checkers, the bottle cap game from the sari-sari store, against the computer. Men move and capture forward, captures are a must, and a cap that reaches the far row is flipped into a dama that flies across the board. Win a board to face a smarter computer.",
  trivia: "A quiz about the Philippines for the whole family: Filipino food, places, history, culture, Tagalog words and famous Pinoys. Easy questions first, harder ones later. Answer fast for a bonus, and ten right in a row wins back a life.",
  rene: "Street basketball on a barangay court at dusk. Pull back to aim, let go to shoot, and sink as many baskets as you can before the clock runs out. Swishes add time; three in a row puts you on fire for double points.",
};
const gameSlug = (g) => slugify(g.title);
const stripTags = (h) => String(h).replace(/<[^>]+>/g, "");
const gamePages = [];
for (const g of GAMES) {
  const slug = gameSlug(g), url = `/games/${slug}/`;
  gamePages.push(url);
  const about = GAME_ABOUT[g.id] || g.tag;
  const title = `${g.title} Free Online Game, Play in Your Browser | FilRadio`;
  const desc = `Play ${g.title} free online: ${g.tag.toLowerCase()}. ${stripTags(g.how)} No download, works on phone and computer.`.slice(0, 300);
  const trail = [["FilRadio", "/"], ["Games", "/games/"], [g.title, url]];
  const others = GAMES.filter((x) => x !== g);
  const body = `${crumbHtml(trail)}
<article class="card">
<div class="head"><span class="logo" style="background:none">${g.art}</span><div><h1>${esc(g.title)}</h1><ul class="chips"><li>Free</li><li>Browser game</li><li>Top 10 leaderboard</li></ul></div></div>
<a class="play" href="/?game=${encodeURIComponent(g.id)}" rel="nofollow">${PLAY_ICON}Play free now</a>
<p class="lead">${esc(about)}</p>
<h2>How to play</h2><p>${g.how}</p>
<p class="muted">Play it on FilRadio while you listen to Philippine radio live. No download or sign-up. Set a high score and put your name on the leaderboard.</p>
</article>
<h2>More free games</h2><ul class="list">${others.map((x) => `<li><a href="/games/${gameSlug(x)}/"><b>${esc(x.title)}</b><span>${esc(x.tag)}</span></a></li>`).join("")}</ul>
<p class="muted" style="margin-top:28px"><a href="/stations/">Listen to Philippine radio stations</a></p>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "VideoGame", name: g.title, url: SITE + url, description: about, genre: "Casual", gamePlatform: "Web browser",
      applicationCategory: "Game", operatingSystem: "Any", inLanguage: "en",
      offers: { "@type": "Offer", price: "0", priceCurrency: "PHP" }, publisher: { "@type": "Organization", name: "FilRadio", url: SITE } },
    crumbs(trail)] };
  write(`games/${slug}`, page({ url, title, desc, body, jsonld }));
}
{
  const trail = [["FilRadio", "/"], ["Games", "/games/"]];
  const body = `${crumbHtml(trail)}
<h1>Free Filipino mini games</h1>
<p>${GAMES.length} free games to play in your browser while the radio plays: Pinoy classics like tumbang preso and sungka, plus quick arcade games. No download, no sign-up, each with a top 10 leaderboard.</p>
<ul class="list">${GAMES.map((g) => `<li><a href="/games/${gameSlug(g)}/"><b>${esc(g.title)}</b><span>${esc(g.tag)}</span></a></li>`).join("")}</ul>
<a class="play" href="/">${PLAY_ICON}Open FilRadio</a>`;
  write("games", page({ url: "/games/", title: "Free Filipino Mini Games Online, Play in Your Browser | FilRadio",
    desc: `Play ${GAMES.length} free Filipino mini games online: ${GAMES.map((g) => g.title).join(", ")}. No download, works on phone and computer.`.slice(0, 300),
    body, jsonld: { "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", name: "Free Filipino mini games", url: `${SITE}/games/` }, crumbs(trail)] } }));
  gamePages.unshift("/games/");
}

// ----- /sitemap.html: every station FilRadio lists (with or without its own page), searchable, plus the site's pages -----
{
  const all = [...byKey.values()].filter((st) => st.playable)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  for (const st of all) {
    if (!st.freq) st.freq = freqFull(st);
    if (st.place === undefined) st.place = findPlace(st.state, st.name, st.tags.join(", ")) || stationHome(st.name);
  }
  const count = (b) => all.filter((st) => st.band === b).length;
  const where = (st) => st.city?.name || st.place || "";
  const row = (st) => {
    const href = st.slug ? `/station/${st.slug}/` : `/?station=${encodeURIComponent(st.key)}`;
    const band = st.band === "Online" ? "Online" : st.freq ? `${st.band} ${st.freq}` : st.band;
    const find = `${st.name} ${band} ${where(st)} ${st.tags.join(" ")}`.toLowerCase();
    return `<li data-f="${esc(find)}"><a href="${href}"${st.slug ? "" : ' rel="nofollow"'}><b>${esc(st.name)}</b><span>${esc([band, where(st)].filter(Boolean).join(" · "))}</span></a></li>`;
  };
  const trail = [["FilRadio", "/"], ["Sitemap", "/sitemap.html"]];
  const body = `${crumbHtml(trail)}
<h1>FilRadio sitemap: all radio stations</h1>
<p>Every station on FilRadio: <b>${all.length}</b> in all (${count("FM")} FM, ${count("AM")} AM, ${count("Online")} online). We add new stations every week. Can't find yours? <a href="/add-station.html">Ask us to add it</a>.</p>
<p><label for="q" class="muted">Search the list</label><br /><input id="q" type="search" placeholder="Station, frequency or city, e.g. Love Radio, 90.7, Cebu" autocomplete="off" style="width:100%;font:inherit;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--text);margin-top:6px" /></p>
<p class="muted" id="n" aria-live="polite"></p>
<ul class="list" id="all">${all.map(row).join("")}</ul>
<p class="muted" id="none" hidden>No station matches that. <a href="/add-station.html">Ask us to add it</a> and we'll look for its stream.</p>
<h2>More pages</h2>
<ul class="cities">
<li><a href="/">Radio map</a></li><li><a href="/stations/">Stations by city</a></li><li><a href="/games/">Free games</a></li>
<li><a href="/add-station.html">Add your station</a></li><li><a href="/privacy.html">Privacy</a></li>
</ul>
<h2>Cities and provinces</h2><ul class="cities">${[...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<li><a href="/city/${c.slug}/">${esc(c.name)}</a></li>`).join("")}</ul>
<script>(function(){var q=document.getElementById("q"),li=[].slice.call(document.querySelectorAll("#all li")),n=document.getElementById("n"),none=document.getElementById("none");
function go(){var t=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean),c=0;li.forEach(function(x){var f=x.getAttribute("data-f"),ok=t.every(function(w){return f.indexOf(w)>-1});x.hidden=!ok;if(ok)c++});
n.textContent=t.length?c+" of "+li.length+" stations match":"";none.hidden=c>0}q.addEventListener("input",go);if(location.hash.length>1){q.value=decodeURIComponent(location.hash.slice(1));go()}})();</script>`;
  fs.writeFileSync(path.join(DIST, "sitemap.html"), page({
    url: "/sitemap.html", title: "Sitemap: All Philippine Radio Stations on FilRadio (FM, AM, Online)",
    desc: `Search all ${all.length} Philippine FM, AM and online radio stations on FilRadio, A to Z, with frequency and city. New stations are added every week.`,
    body, jsonld: { "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", name: "FilRadio sitemap", url: `${SITE}/sitemap.html` }, crumbs(trail)] },
  }));
}

// ----- Sitemap: keep the site's own pages, add these -----
const smPath = path.join(DIST, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8").replace(/\s*<url>\s*<loc>https:\/\/filradio\.xyz\/(station\/|city\/|stations\/|games\/|sitemap\.html)[\s\S]*?<\/url>/g, "");
const entry = (u, pri) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${pri}</priority>\n  </url>\n`;
const extra = gamePages.map((u) => entry(u, u === "/games/" ? "0.7" : "0.6")).join("") + entry("/stations/", "0.8") + entry("/sitemap.html", "0.7") + cities.map((c) => entry(`/city/${c.slug}/`, "0.7")).join("") + stations.map((s) => entry(`/station/${s.slug}/`, "0.6")).join("");
sm = sm.replace("</urlset>", extra + "</urlset>");
fs.writeFileSync(smPath, sm);

console.log(`SEO pages: ${stations.length} stations, ${cities.length} cities, ${GAMES.length} games, hubs; sitemap ${(sm.match(/<loc>/g) || []).length} URLs`);
