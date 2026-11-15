# Live Chat: Full Build Record and Porting Guide

Everything built for the FilRadio listener chat, written so the same chat can be rebuilt in another
app (MyTindahan). Covers what it does, how it works, every limit and rule, the exact files, and a
checklist of what to change when porting.

Source of truth (copy these files as the starting point):

| Part | File in FilRadio | Size |
| --- | --- | --- |
| Chat server (Worker + Durable Object) | `chat-worker/src/index.js` | ~400 lines |
| Word filter | `chat-worker/src/filter.js` | ~130 lines |
| Worker config | `chat-worker/wrangler.toml`, `chat-worker/package.json` | |
| Browser client | `js/chat.js` | ~420 lines, no dependencies |
| Markup | `index.html` lines ~493 to 539 (panel + button), icon symbols `i-chat`, `i-close`, `i-send`, `i-edit`, `i-flag`, `i-onair`, `i-pabati`, `i-down` in the SVG sprite | |
| Styles | `css/style.css` lines ~1514 to 1735 ("Global chat" block) | |
| CSP | `<meta http-equiv="Content-Security-Policy">` in `index.html` (`connect-src` must allow the chat host) | |

Full path on this machine: `D:\ZENDZ LEADS\filradio\`.

---

## 1. What was built (in order)

| Commit | Step |
| --- | --- |
| `ff18171` | First version: global chat on a Cloudflare Worker + Durable Object, word filter, rate limits, strikes, mutes, reports, admin endpoint |
| `45000e5` | Locked the Worker to one address (`chat.filradio.xyz`): no `workers.dev`, no preview URLs |
| `c2c7ea4` | Full architecture written into README |
| `dd31021` | Yellow "Chat" pill button, cleaner dark panel, easy name change (tap name or "Change name") |
| `9024176` | Typing indicator, "New messages" jump button, grouping of consecutive messages, "listening to" station tag, unique names (no impersonation) |
| `e59c8a2` | Country flags next to names (with opt-out), Pabati (shout-out) highlighted messages limited to 1 per 10 min |
| `cea1f17` | One-time "Chat with other listeners here" hint, live online count pushed on join/leave |

---

## 2. Architecture

```
Browser (js/chat.js)
   |  wss://chat.filradio.xyz/ws?name=...&flag=0   (only while the chat panel is open)
   v
Cloudflare Worker (edge, stateless)          <- cheap checks, never wakes the room
   - path must be /ws, GET, Upgrade: websocket
   - Origin must be in allowlist
   - query string <= 120 chars
   - rate limit: 10 connects / minute / IP   (Workers Rate Limiting binding, free)
   - hash IP: SHA-256(IP_SALT | IP), first 12 bytes  -> header X-Who
   - country (request.cf.country)                    -> header X-Country
   v
Durable Object "ChatRoom" (one instance, idFromName("global"))
   - holds all WebSockets (Hibernation API: idle sockets cost nothing)
   - per-socket state in serializeAttachment()
   - storage (SQLite-backed, free plan): msgs, u:<hash>, words, cleanAt
   - single alarm: daily clean-up + delayed online-count push
```

### Why this design

- The website is static on cheap shared hosting (Hostinger) which rate-limits easily. The chat runs
  **entirely on Cloudflare**, so chat traffic never touches the web host.
- **Workers Free plan**: if someone floods it, the chat just pauses until the daily quota resets. You
  are never billed. Keep the account on the free plan to keep that guarantee.
- **Durable Object + WebSocket Hibernation**: one object is the room. Between messages it sleeps;
  connected-but-idle users cost nothing.
- **Keep-alive is free**: `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"))`
  makes Cloudflare answer `ping` without waking the object. Client pings every 50 s.
- **Connect only when open**: the client opens the socket only when the panel is opened, and closes
  it 60 s after the panel closes or the tab is hidden. Visitors who never open chat generate zero
  chat traffic.
- **All rules are on the server.** The client mirrors some limits (send cooldown, max length) only
  for nicer UX; editing the page can't bypass anything.

---

## 3. Features (user-facing)

- **Floating pill button** bottom right ("Chat", yellow, bounces twice a few seconds after load).
  When open it becomes a round close button. Chat is never opened automatically (would cover the
  screen on phones and connect every visitor).
- **One-time hint** above the button after 6 s ("Chat with other listeners here"), hidden after 9 s,
  never shown again on that device (`localStorage` key `filradio-chat-hint`). Skipped when the URL
  has `?shot` (screenshots).
- **Dark panel in both themes**: header with title and live "N online" with a green LED, one-line
  rules, message list, typing line, status note, "Chatting as <name> / Change name", input bar.
- **Random guest name** on first visit (`Listener1234`). First-timers get a 10 s tip explaining how
  to change it. Name saved in `localStorage` (`filradio-chat-name`, `filradio-chat-name-set`).
- **Change name**: tap your name or "Change name"; inline form with Save (Enter) / Cancel (Esc).
  2 to 20 letters/numbers, filtered, must be unique.
- **Unique names**: a name used by another person right now (or seen in visible history) can't be
  taken. On connect, digits are appended (`maria117`); on rename, an error is shown.
- **Messages**: oldest top, newest bottom, server timestamps, 24 h `HH:MM` time, coloured names
  (hue from a hash of the name), "you" tag and highlighted edge on your own messages.
- **Grouping**: same person within 2 minutes shows the name once (class `cont`).
- **Smart scroll**: if you scrolled up, new messages don't yank you down; a "New messages" button
  appears instead. Your own messages always scroll to the end.
- **Typing indicator**: "Ana is typing…", "Ana and Ben are typing…", "3 people are typing…". Hidden
  after ~5.5 s without news or when that person's message arrives.
- **Character counter** appears when 40 or fewer characters are left; turns red at 10.
- **Send cooldown**: send button disabled for 4 s after sending (matches the server rule) and until
  any server "slow down" time passes.
- **Report**: flag button on others' messages (hover on desktop, always faintly visible on touch).
  3 reports from different people remove the message.
- **Context tag** ("listening to"): if the user is playing a station, its name is attached to the
  message and shown with an on-air icon. Server filters it and silently drops it if it breaks a rule.
- **Country flag** next to names, from Cloudflare's `request.cf.country` (2 letters only). Real flag
  SVGs from `flag-icons@7.2.3` on jsDelivr (~1 KB each, lazy, cached by service worker); falls back
  to a 2-letter badge. Hover shows the country name via `Intl.DisplayNames`. Users can turn it off
  ("Show my country flag", `localStorage` `filradio-chat-flag`).
- **Reactions (like Facebook)**: hover a message (always visible on phones) and tap the smiley to pick 👍 ❤️ 😂 😮 😢 😡. One per person per message; pick another to change it, the same one to remove it. A pill under the message shows the top 3 and the total, outlined yellow if one is yours. Max 1 reaction every 0.6 s and 30 per minute per person; muted people can't react. Others only see counts, never who reacted.
- **Pabati (shout-out)**: megaphone button toggles pabati mode; the next message is sent as a
  highlighted card with a "Pabati" tag. Limited to 1 per person every 10 minutes (server enforced).
  If refused, the text is restored in the input and the user is told when they can send the next one.
- **Errors keep your text**: when a message is blocked, a duplicate, or a refused pabati, the text is
  put back in the input so it isn't lost.
- **Reconnect**: exponential backoff 2 s, 4 s, 8 s ... up to 60 s, 6 tries, then "Chat is offline.
  Tap to retry." Close code 4000 shows "Chat is open in another tab."
- **Esc** closes the panel (unless the name form is focused).
- **Accessibility**: `aria-live` on list and typing line, `role="status"` on notes, `aria-expanded`
  on the button, `aria-pressed` on pabati, labelled buttons, `prefers-reduced-motion` respected.

---

## 4. Message protocol (JSON over WebSocket)

| Direction | Message | Meaning |
| --- | --- | --- |
| C -> S | `{t:"msg", text, st?, g?}` | Send. `st` = context tag (max 40, filtered). `g:1` = pabati |
| C -> S | `{t:"typing"}` | Typing (client sends max every 4 s; server relays max every 3 s, never stored) |
| C -> S | `{t:"name", name}` | Change name |
| C -> S | `{t:"flag", on}` | Show/hide own country flag on new messages |
| C -> S | `{t:"report", id}` | Report a message |
| C -> S | `{t:"react", id, e}` | React: `e` = 0..5, `-1` removes. The client owns the emoji list; the server only counts positions |
| C -> S | `ping` (plain text) | Keep-alive, auto-answered `pong` by Cloudflare |
| S -> C | `{t:"init", name, online, muted, msgs, mr}` | On connect: final name, count, mute end, last 50 messages (each with `r` counts if reacted), `mr` = `{msgId: your reaction}` |
| S -> C | `{t:"msg", m:{id,n,x,ts,s?,c?,g?}, online}` | New message (`s` context tag, `c` country, `g` pabati) |
| S -> C | `{t:"typing", n}` | Someone else is typing |
| S -> C | `{t:"react", id, r}` | New counts for a message, `r` = 6 numbers (sent to everyone) |
| S -> C | `{t:"reacted", id, e}` | Your own pick (sent to all your tabs) |
| S -> C | `{t:"online", n}` | Online count changed |
| S -> C | `{t:"del", id}` / `{t:"clear"}` | Message removed / room wiped |
| S -> C | `{t:"err", code, msg, until}` | `slow`, `busy`, `blocked`, `dupe`, `long`, `muted`, `name`, `pabati` |
| S -> C | `{t:"reported", id}` / `{t:"name", name}` | Acknowledgements |

Connect URL query: `?name=<saved name>` and `?flag=0` if flags are off.

Other users only ever receive `id, n, x, ts` (+ `s, c, g`). The IP hash and report list never leave
the server (`pub()` function strips them).

How the client knows a message is its own: it remembers `lastSent` text; when a `msg` arrives with
its name and that exact text, the id is added to the `mine` set.

---

## 5. Limits (`LIMITS` at the top of `chat-worker/src/index.js`)

| Limit | Value |
| --- | --- |
| Message length | 200 chars (raw frame > 1000 bytes closes the socket, code 1009) |
| Spam walls | words over 30 letters (`wordLen`) or more than 15 emojis (`emojis`) refused with `err` code `long`, no strike, text given back; `tidy()` shortens any 1 to 12 character chunk repeated 5+ times to 4 repeats (`hahaha…`, `lol lol…`, emoji runs); cut by code points so emojis never split; client shows a note when a paste is cut at 200 |
| Name | 2 to 20 letters/numbers/space/`_ . -` |
| Per person | 1 message / 4 s, max 8 / minute, no exact repeat of the previous message |
| Whole room | 40 messages / 10 s ("Chat is very busy") |
| Any frames (junk too) | > 20 per 10 s = bot: socket closed (1008) + strike |
| Connections | 2 tabs per person (oldest closed with code 4000), 400 per room (503 "Room full") |
| Edge connects | 10 / minute / IP (`CONNECT_LIMIT`) |
| Admin attempts | 5 / minute / IP (`ADMIN_LIMIT`), token >= 24 chars, timing-safe compare |
| History | last 50 messages, auto-deleted after 6 hours |
| Typing relay | max once / 3 s per person; muted people never shown |
| Context tag | 40 chars, filtered |
| Pabati | 1 per 10 minutes per person (stored in the person record as `g`) |
| Reactions | 1 per person per message; 1 every 0.6 s and 30 / minute per person (`reactGapMs`, `reactsPerMin`); muted people can't react; each one is a storage write, so keep these limits |
| Online count push | only on join/leave, only if changed, max once / 10 s per room; a skipped change is sent when the window ends (via the alarm) |
| Reports | 10 per person per hour; can't report yourself or twice |

---

## 6. Moderation model

- Each blocked message = 1 strike, shown as "warning 1 of 3".
- **3 strikes within 1 hour -> mute**: 30 min, then 24 h, then 7 days (and every later one).
  All their visible messages are removed for everyone at mute time.
- **3 reports** from different people remove a message and give the sender a strike.
- A rude name on rename = strike. A rude name on connect silently becomes `Listener1234`.
- Bot-like frame flooding = strike + disconnect.
- People are tracked by **salted IP hash**, never the IP. Record `u:<hash>` = `{strikes[], mutes, until, g}`.
- Daily alarm forgets records 30 days after their last strike/mute/pabati.

### Admin endpoint

`POST https://chat.<domain>/admin` with `Authorization: Bearer <ADMIN_TOKEN>`:

```sh
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"list"}'                           # messages + report counts + extra words
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"del","id":"MSG_ID"}'              # delete one message
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"ban","id":"MSG_ID","hours":168}'  # mute sender, remove their messages
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"addword","word":"newword"}'       # block a word live (no redeploy)
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"delword","word":"newword"}'
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"clear"}'                          # wipe the room
```

---

## 7. Word filter (`chat-worker/src/filter.js`)

Exports `check(text, extraWords) -> "" | "language" | "links" | "contact"`, `tidy(text)`, `normalize(text)`.

- **Lists** (English, Tagalog, Bisaya):
  - `SUBSTR`: matched anywhere inside a word (`fucking`, `putanginamo`). Only words that never occur inside innocent words.
  - `EXACT`: whole word only (`ass` vs class, `rape` vs grape, `tite` vs appetite, `puta`, `gago`, `bobo`).
  - `PHRASES`: multi-word (`tang ina`, `kill yourself`, `send nudes`, `dm me`, `add me`, `free money`, `link in bio`).
  - Extra words added live through `addword` (stored in the Durable Object).
- **Normalisation before matching**: NFKC/NFKD, accents and zalgo removed, zero-width chars removed,
  leetspeak (`0>o 1>i 3>e 4>a 5>s 7>t @>a $>s`...), Cyrillic/Greek look-alikes, separators inside
  words (`f.u.c.k`, `f*ck`, `sh_it`), runs of single letters joined (`p u t a`), repeated letters
  collapsed (`fuuuck`), and a no-spaces check for long unmistakable words (`SQUASH`, with a
  `NO_SQUASH` exception list to avoid false hits across word boundaries).
- **Spam blocking**: links (`http`, `www.`, `x.com/.ph/.xyz/...`, "dot com"), emails, phone numbers
  (7+ digits, `09xx`, `+63`), `@handles`.
- **tidy()**: trims, strips control/zero-width chars, shortens `loooooool`, tones down ALL CAPS
  (> 70% capitals over 10+ letters).
- Also covers spelling variants of sexual words (`belat`, `eyot`, `eut`, `iyut`, `s*x`, `seggs`;
  `8080` is caught because leetspeak turns it into "bobo"), sexual requests ("sex video", "eut tayo")
  and threats ("papatayin kita", "papatyon tika", "i will kill").
- Verified innocent words that pass: petition, therapist, leche flan, ilagay, bilateral, appetite,
  competitive, Sussex, grapes, analysis, "mata ng ina", belated, peyote, "nood tayo",
  "hayop sa galing", "papatayin ko ang ilaw".
- Watch for Tagalog words that look bad but are normal: `nood` (watch), `hayop` (also praise),
  `jutay` (Bisaya: small), `kayat` (Ilocano: want). These were deliberately left out.
- False positive fix: move the word from `SUBSTR` to `EXACT`, or add it to `NO_SQUASH`, redeploy.

---

## 8. Client design notes (`js/chat.js`)

- Plain IIFE, no libraries, no build step. Looks up elements by id; exits quietly if the markup is missing.
- `LOCAL` check: on `localhost`/`127.0.0.1` it connects to `ws://localhost:8787/ws`, otherwise prod `wss://`.
- All `localStorage` access wrapped in try/catch (private mode safe).
- Everything rendered with `textContent` / `createElement` (no `innerHTML` with user data, so no XSS).
  The only `innerHTML` is static SVG icon markup.
- Keeps max 80 rows in the DOM.
- Constants at the top mirror the server: `GAP_MS 4000`, `MAX_LEN 200`, `TYPING_SEND_MS 4000`,
  `TYPING_SHOW_MS 5500`, `GROUP_MS 120000`, `IDLE_CLOSE_MS 60000`, `PING_MS 50000`.
- `setSendable()` is the single place that decides input/send disabled state and placeholder text
  (offline, muted until HH:MM, pabati prompt), and schedules itself to re-run when a cooldown ends.

## 9. Styling notes (`css/style.css` chat block)

- Panel has its own colour tokens (`--c-bg #10172a`, `--c-bg2`, `--c-line`, `--c-text`, `--c-dim`,
  `--c-sun #ffc93c`, `--c-ok`, `--c-bad`) so it looks the same in light and dark site themes.
- Desktop/landscape: floating card above the pill at bottom right. Phones (`max-width: 760px`):
  a sheet 8 px from each edge, sitting above the bottom dock (`--tab-h`), up to 560 px tall
  (`100dvh` aware). `html.chat-open` hides the pill on phones (the panel has its own close button)
  and lets the rest of the page react. The pill moves up when the mini player is showing (`:has()`).
- `.chat-msg.me` yellow name and edge, `.chat-msg.cont` hides the meta row, `.chat-msg.pabati`
  yellow-tinted card with bolder text, `.chat-form.pabati` yellow input border while pabati mode is on.
- Pill nudge animation `fab-nudge`, panel entry `chat-in`, hint `rise-hint`, typing dots `typing-dot`.
- `@media (hover: none)` keeps the report flag faintly visible on touch screens.
- `prefers-reduced-motion` disables the pill bounce and panel animation.

---

## 10. Hosting and deploy

`chat-worker/wrangler.toml` essentials:

```toml
name = "filradio-chat"
main = "src/index.js"
compatibility_date = "2026-10-01"
workers_dev = false
preview_urls = false
routes = [{ pattern = "chat.filradio.xyz", custom_domain = true }]

[[durable_objects.bindings]]
name = "ROOM"
class_name = "ChatRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["ChatRoom"]   # SQLite DOs work on the free plan

[[ratelimits]]
name = "CONNECT_LIMIT"
namespace_id = "7101"
simple = { limit = 10, period = 60 }

[[ratelimits]]
name = "ADMIN_LIMIT"
namespace_id = "7102"
simple = { limit = 5, period = 60 }

[observability]
enabled = false
```

Deploy:

```sh
cd chat-worker
npm install
npx wrangler login
npx wrangler secret put IP_SALT       # any long random text
npx wrangler secret put ADMIN_TOKEN   # random, 24+ chars
npx wrangler deploy                   # creates the custom domain automatically
```

- Local dev: `npx wrangler dev --port 8787`; secrets in `chat-worker/.dev.vars` (git-ignored),
  upload all at once with `npx wrangler secret bulk .dev.vars`.
- New Cloudflare account: open **Workers & Pages** once in the dashboard first (error 10063 otherwise).
- Domain must be on Cloudflare DNS for `custom_domain = true` to work.
- Site CSP `connect-src` must include `wss://chat.<domain>` (and `ws://localhost:8787` for dev).
- Don't let any Cloudflare cache rule match the chat hostname.
- Optional free extra shield: WAF rate-limiting rule on the chat hostname, 20 req / 10 s per IP,
  block 1 h (runs before the Worker, uses no Worker quota). Bot Fight Mode helps too.
- Health check: `curl https://chat.<domain>/` returns 404 = Worker alive.

---

## 11. Gotchas we hit

- Keep the Worker reachable at **one** address only (`workers_dev = false`, `preview_urls = false`),
  otherwise the Origin check is the only thing protecting extra URLs.
- `webSocketClose`: reply with `ws.close(code === 1005 ? 1000 : code)`; 1005 can't be sent back.
- Don't store per-socket state in memory only: the object hibernates. Use `serializeAttachment()`.
- Online count pushes are throttled (once / 10 s) or join/leave bursts become a storm of writes;
  the alarm sends the final number so it never stays wrong.
- One alarm slot per Durable Object: `armAlarm()` only moves it earlier, so clean-up and presence share it.
- Tag sockets with the IP hash (`acceptWebSocket(server, [h])`) so `getWebSockets(h)` finds one
  person's tabs for the 2-tab limit and for muting.
- Clients behind the same IP (family Wi-Fi, mobile carrier NAT) share limits and mutes. Acceptable
  for an anonymous chat; with logged-in users, key by user id instead.
- No em dashes in FilRadio's visible text (project rule), so chat strings use colons/commas.

---

## 12. Porting checklist for MyTindahan

Copy `chat-worker/` and `js/chat.js`, the markup block, the CSS block and the needed SVG icons, then:

**Must change**
- [ ] `wrangler.toml`: `name` (e.g. `mytindahan-chat`), `routes` pattern (`chat.<mytindahan domain>`),
      new rate-limit `namespace_id`s (unique per account, e.g. `7201`, `7202`).
- [ ] `ORIGINS` in `src/index.js`: the MyTindahan site origin(s) + local dev ports.
- [ ] `URL_WS` in `js/chat.js`: production `wss://chat.<domain>/ws`.
- [ ] New secrets `IP_SALT` and `ADMIN_TOKEN` (don't reuse FilRadio's).
- [ ] `localStorage` keys: `filradio-chat-*` -> `mytindahan-chat-*`.
- [ ] Guest name `Listener1234` (`guestName()` server side) and texts: "Listener chat",
      "fellow listeners", rules line, hint text, placeholder "e.g. JuanFromDubai".
- [ ] CSP `connect-src` on the MyTindahan page.
- [ ] Panel colour tokens to match MyTindahan branding.

**Decide (app-specific)**
- [ ] **Rooms**: FilRadio has one global room (`idFromName("global")`). For per-store or
      per-barangay chat, pass a room id in the URL (`/ws?room=<storeId>`), validate it in the
      Worker, and use `env.ROOM.idFromName(room)`. Each room is its own Durable Object with its
      own history and limits; the admin endpoint then needs a `room` field too.
- [ ] **Identity**: if MyTindahan has logins, verify the session/JWT in the Worker and send the
      user id as `X-Who` instead of the IP hash. Names can then come from the account, and mutes
      follow the account rather than the network.
- [ ] **Context tag** (`st`): FilRadio sends the playing station. For MyTindahan it could be the
      product or store being viewed, or removed entirely (`currentStation()` in the client).
- [ ] **Pabati**: keep as a shout-out, rename (e.g. "Promo" for store owners), or remove
      (`g` field, `pabatiGapMs`, button `#chatPabati`).
- [ ] **Country flags**: keep if users are abroad (OFWs), otherwise drop (`X-Country`, `c` field, `flagEl`).
- [ ] **Filter lists**: phone numbers and links are blocked. A store chat may need to allow
      them (e.g. for store owners or verified accounts). Make that a per-role exception in
      `onMessage` instead of deleting the rule.
- [ ] **History/retention**: 50 messages, 6 hours. A store chat may want longer (raise `history`
      and `maxAgeMs`; storage of `msgs` is one array, so for hundreds+ of messages switch to the
      SQLite API `ctx.storage.sql` with a messages table).
- [ ] **Privacy policy**: mention chat, what's stored (name, text, salted IP hash or user id,
      country code), and retention.

**Test before launch**
- [ ] Two browsers: messages, typing, online count, grouping, own-message styling.
- [ ] Third tab closes the oldest ("open in another tab").
- [ ] Send 2 messages within 4 s (cooldown), 9 in a minute, same text twice.
- [ ] Blocked words incl. `f.u.c.k`, `p u t a`, `sh1t`; links; `0917...` numbers; `@handle`.
- [ ] 3 blocked messages -> muted, messages removed for others.
- [ ] 3 reports from 3 different IPs remove a message.
- [ ] Rename to a taken name and to a rude name.
- [ ] Close panel, wait 60 s, socket closes (DevTools > Network > WS).
- [ ] Admin `list`, `del`, `ban`, `addword`, `clear`.
- [ ] Origin not in allowlist gets 403; `curl` to `/` gets 404.
