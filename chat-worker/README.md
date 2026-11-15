# FilRadio chat server

Runs on **Cloudflare Workers + one Durable Object**, not on Hostinger. The website stays static.
Keep the Cloudflare account on the **Workers Free plan**: if anyone ever floods it, the chat simply
pauses until the daily quota resets. You are never billed.

## Deploy (one time)

```bash
cd chat-worker
npm install
npx wrangler login                          # opens the browser, log in to the Cloudflare account that has filradio.xyz
npx wrangler secret put IP_SALT             # paste any long random text (scrambles IPs)
npx wrangler secret put ADMIN_TOKEN         # paste a long random password, at least 24 characters (for moderation)
npx wrangler deploy
```

`wrangler deploy` creates `chat.filradio.xyz` automatically (the domain is already on Cloudflare).
Then rebuild and upload the site as usual (`python tools/build.py`).

Local testing: `npx wrangler dev --port 8787` in this folder, and serve the site on `http://localhost:5173`.
The page connects to `ws://localhost:8787` automatically when opened from localhost.

## Protection built in

| Layer | Rule |
|---|---|
| Edge (before the room wakes up) | Only filradio.xyz may connect. Max 10 connects per minute per IP. Admin: 5 tries per minute, timing-safe check. |
| Connection | Max 2 tabs per person, 400 people in the room. Chat connects only while the panel is open and disconnects 1 minute after closing it. Keep-alive pings are answered by Cloudflare for free. |
| Messages | 200 characters max. 1 message every 4 s, 8 per minute. No repeats. Words over 30 letters and more than 15 emojis refused; `hahaha…` / `lol lol…` / emoji runs shortened. Room-wide cap of 40 messages per 10 s. |
| Bots | More than 20 frames in 10 s, malformed data or oversized frames: socket dropped and a strike given. |
| Filter | English, Tagalog and Bisaya swearing, sexual words, slurs and threats. Catches `f.u.c.k`, `fuuuck`, `sh1t`, `p u t a`, look-alike letters. Blocks links, emails, phone numbers and @handles. Bad names become `Listener1234`. |
| Auto-removal | Each blocked message is a warning. 3 warnings in an hour: muted 30 min, then 24 h, then 7 days, and all their messages are removed. 3 reports from different people remove a message and give its sender a warning. Messages auto-delete after 6 hours. |
| Privacy | Only a salted hash of the IP is stored, never the IP. Records are forgotten 30 days after the last warning. |

## Moderation

Send POST requests with your admin token:

```bash
T="your-admin-token"
A="https://chat.filradio.xyz/admin"
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"list"}'                    # messages + report counts
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"del","id":"MSG_ID"}'       # delete one message
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"ban","id":"MSG_ID","hours":168}'  # mute the sender, remove their messages
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"addword","word":"newbadword"}'    # block a new word right away
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"delword","word":"newbadword"}'
curl -X POST $A -H "Authorization: Bearer $T" -d '{"action":"clear"}'                   # wipe the chat
```

Change limits in `LIMITS` at the top of `src/index.js`, and words in `src/filter.js`, then run `npx wrangler deploy`.

## Optional extra shield (free)

In the Cloudflare dashboard for filradio.xyz: **Security > WAF > Rate limiting rules**, add one rule:
hostname equals `chat.filradio.xyz`, 20 requests per 10 seconds per IP, action Block for 1 hour.
This rule runs before the Worker, so blocked requests don't use any Worker quota.
Turning on **Security > Bots > Bot Fight Mode** also helps for the whole site.
