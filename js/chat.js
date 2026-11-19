// FilRadio global chat (client). Connects only while the chat panel is open, so visitors who
// never open it cost nothing. All rules (rate limits, word filter, mutes) are enforced on the server.
(() => {
  "use strict";

  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const URL_WS = LOCAL ? "ws://localhost:8787/ws" : "wss://chat.filradio.xyz/ws";
  const NAME_KEY = "filradio-chat-name";
  const IDLE_CLOSE_MS = 60e3;   // disconnect a minute after the panel closes / tab is hidden
  const PING_MS = 50e3;         // keep-alive (answered by Cloudflare without waking the room)
  const GAP_MS = 4000;          // matches the server's 1 message / 4 s
  const TYPING_SEND_MS = 4000;  // send "typing" at most once every 4 s
  const TYPING_SHOW_MS = 5500;  // hide someone's "typing" after this long without news
  const GROUP_MS = 120e3;       // same person within 2 min = one group (name shown once)
  const MAX_LEN = 200;

  const $ = (id) => document.getElementById(id);
  const btn = $("chatBtn"), panel = $("chatPanel");
  if (!btn || !panel) return;
  const list = $("chatList"), form = $("chatForm"), input = $("chatInput"), send = $("chatSend");
  const note = $("chatNote"), online = $("chatOnline"), nameBtn = $("chatName"), nameForm = $("chatNameForm"), nameInput = $("chatNameInput"), renameBtn = $("chatRename");
  const typingEl = $("chatTyping"), jump = $("chatJump"), count = $("chatCount");
  const pabatiBtn = $("chatPabati"), flagOpt = $("chatFlagOpt"), pokeOpt = $("chatPokeOpt");
  const FLAG_KEY = "filradio-chat-flag", POKE_KEY = "filradio-chat-pokes";
  // Kalabit (poke) and cat scratch: [menu label, line in the chat, what the poked person sees]
  const POKES = [
    { e: "👉", label: "Kalabit", line: (a, b) => `${a} kinalabit si ${b}`, you: (a) => `${a} kinalabit ka!` },
    { e: "🐱", label: "Cat scratch", line: (a, b) => `${a} scratched ${b}`, you: (a) => `${a} scratched you! Meow!` },
  ];
  // Real flag images (open-source flag-icons, ~1 KB SVG each, from jsDelivr; cached by the browser
  // and the service worker). Falls back to a 2-letter badge if an image can't load.
  const FLAG_URL = (c) => `https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/${c.toLowerCase()}.svg`;
  const regionNames = (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }); } catch { return null; } })();
  let pabatiOn = false;

  let ws = null, open = false, retry = 0, retryT = 0, idleT = 0, pingT = 0, noteT = 0, cooldownT = 0, typingT = 0;
  let myName = "", lastSent = "", mutedUntil = 0, nextSend = 0, lastTyping = 0;
  const mine = new Set(), reported = new Set();
  // Reactions, like Facebook. The order must match the server (it only counts positions 0..5).
  const RX = ["👍", "❤️", "😂", "😮", "😢", "😡"];
  const RX_NAMES = ["Like", "Love", "Haha", "Wow", "Sad", "Angry"];
  const myRx = new Map(); // message id -> my reaction index
  let pickFor = null;     // the message whose reaction picker is open
  const typers = new Map(); // name -> time to hide

  const store = {
    get: () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } },
    set: (v) => { try { localStorage.setItem(NAME_KEY, v); } catch {} },
    named: () => { try { return localStorage.getItem(NAME_KEY + "-set") === "1"; } catch { return true; } },
    setNamed: () => { try { localStorage.setItem(NAME_KEY + "-set", "1"); } catch {} },
  };

  // ---------- connection ----------
  function connect() {
    if (ws && ws.readyState <= 1) return;
    clearTimeout(retryT);
    setNote("Connecting…");
    const u = new URL(URL_WS);
    const saved = store.get();
    if (saved) u.searchParams.set("name", saved);
    if (!showFlag()) u.searchParams.set("flag", "0");
    ws = new WebSocket(u);
    ws.onopen = () => { retry = 0; clearInterval(pingT); pingT = setInterval(() => ws?.readyState === 1 && ws.send("ping"), PING_MS); };
    ws.onmessage = (e) => { if (e.data !== "pong") try { onData(JSON.parse(e.data)); } catch {} };
    ws.onclose = (e) => {
      clearInterval(pingT);
      ws = null;
      panel.classList.remove("live");
      typers.clear(); renderTyping();
      setSendable();
      if (!open || document.hidden) return;
      if (e.code === 4000) return setNote("Chat is open in another tab.", 0, true);
      if (retry >= 6) return setNote("Chat is offline. Tap to retry.", 0, true);
      const wait = Math.min(60e3, 2000 * 2 ** retry++);
      setNote("Reconnecting…");
      retryT = setTimeout(connect, wait);
    };
  }

  function disconnect() {
    clearTimeout(retryT); clearInterval(pingT);
    if (ws) { ws.onclose = null; try { ws.close(1000); } catch {} ws = null; }
  }

  const sendJson = (o) => { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); };

  function onData(d) {
    switch (d.t) {
      case "init":
        myName = d.name; nameBtn.textContent = myName;
        if (!store.get()) store.set(myName);
        mutedUntil = d.muted || 0;
        myRx.clear();
        for (const [id, e] of Object.entries(d.mr || {})) myRx.set(id, e);
        pickFor = null;
        list.replaceChildren(...d.msgs.map(row));
        if (!d.msgs.length) list.append(emptyRow());
        regroupAll();
        setOnline(d.online);
        setNote("");
        // First-timers get a hint on how to pick their own name.
        if (!store.named()) setNote(`You're ${myName}. Tap "Change name" below to pick your own.`, 10000);
        if (!allowPokes()) sendJson({ t: "pokes", on: false });
        setSendable();
        scrollEnd();
        break;
      case "msg": {
        list.querySelector(".chat-empty")?.remove();
        if (d.m.n === myName && d.m.x === lastSent) { mine.add(d.m.id); lastSent = ""; }
        const atEnd = isAtEnd();
        const li = row(d.m);
        list.append(li);
        regroup(li);
        while (list.children.length > 80) { list.firstChild.remove(); regroup(list.firstChild); }
        typers.delete(d.m.n); renderTyping();
        setOnline(d.online);
        if (atEnd || mine.has(d.m.id)) scrollEnd();
        else jump.hidden = false;
        if (d.m.g) tada(li);
        break;
      }
      case "online":
        setOnline(d.n);
        break;
      case "typing":
        if (d.n && d.n !== myName) { typers.set(d.n, Date.now() + TYPING_SHOW_MS); renderTyping(); }
        break;
      case "del": {
        const li = list.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
        if (li) { if (pickFor === li) pickFor = null; const next = li.nextElementSibling; li.remove(); regroup(next); }
        break;
      }
      case "clear":
        pickFor = null;
        list.replaceChildren(emptyRow());
        break;
      case "react": {
        const li = list.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
        if (li) { li._r = d.r; renderRx(li); }
        break;
      }
      case "reacted": {
        if (d.e === -1) myRx.delete(d.id); else myRx.set(d.id, d.e);
        const li = list.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
        if (li) renderRx(li);
        break;
      }
      case "reported":
        markReported(d.id);
        break;
      case "poked":
        if (allowPokes()) poked(d.n, d.k);
        break;
      case "pokeline": {
        const p = POKES[d.k] || POKES[0];
        const li = document.createElement("li");
        li.className = "chat-sys";
        li.textContent = `${p.e} ${d.b === myName ? p.you(d.a).replace(/!.*$/, "") : p.line(d.a, d.b)}`;
        const atEnd = isAtEnd();
        list.querySelector(".chat-empty")?.remove();
        list.append(li);
        while (list.children.length > 80) { list.firstChild.remove(); regroup(list.firstChild); }
        if (atEnd) scrollEnd();
        break;
      }
      case "name":
        myName = d.name; store.set(myName); store.setNamed(); nameBtn.textContent = myName;
        setNote(`Name changed to ${myName}.`, 3000);
        break;
      case "err":
        if (d.code === "muted") { mutedUntil = d.until; setSendable(); }
        if (d.code === "slow" || d.code === "busy") nextSend = Math.max(nextSend, d.until || 0);
        if (d.code === "blocked" || d.code === "dupe" || d.code === "pabati" || d.code === "long") { input.value = lastSent; lastSent = ""; updateCount(); }
        if (d.code === "pabati") {
          setPabati(true);
          d.msg += d.until ? ` You can send the next one at ${fmtTime(d.until)}, or send it as a normal message.` : "";
        }
        setNote(d.msg, d.code === "muted" ? 0 : 5000, false, true);
        setSendable();
        break;
    }
  }

  // ---------- rendering ----------
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  function row(m) {
    const li = document.createElement("li");
    li.className = "chat-msg";
    li.dataset.id = m.id;
    li.dataset.n = m.n;
    li.dataset.ts = m.ts;
    const isMine = mine.has(m.id);
    if (isMine) li.classList.add("me");
    if (m.g) li.classList.add("pabati");
    const head = document.createElement("div");
    head.className = "chat-meta";
    const other = !isMine && m.n !== myName;
    const who = document.createElement(other ? "button" : "b");
    who.textContent = m.n;
    who.style.setProperty("--hue", hue(m.n));
    if (other) {
      who.type = "button";
      who.className = "chat-who";
      who.title = `Kalabit or scratch ${m.n}`;
      who.setAttribute("aria-label", `${m.n}: kalabit or scratch`);
      who.addEventListener("click", (e) => { e.stopPropagation(); togglePoke(li); });
    }
    const when = document.createElement("time");
    when.textContent = fmtTime(m.ts);
    if (m.g) { const tag = document.createElement("span"); tag.className = "chat-pb"; tag.textContent = "Pabati"; head.append(tag); }
    head.append(who);
    if (m.c && /^[A-Z]{2}$/.test(m.c)) head.append(flagEl(m.c));
    head.append(when);
    if (isMine) { const you = document.createElement("span"); you.className = "chat-tag"; you.textContent = "you"; head.append(you); }
    if (m.s) {
      const st = document.createElement("button");
      st.type = "button";
      st.className = "chat-st";
      // Moving bars while the message is fresh (they were most likely still listening).
      if (Date.now() - m.ts < 15 * 60e3) st.classList.add("live");
      st.title = `Listening to ${m.s}. Tap to play it too.`;
      st.setAttribute("aria-label", `${m.n} is listening to ${m.s}. Play it`);
      st.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      st.append(m.s);
      st.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.FilApp?.playByName(m.s)) setNote(`Couldn't find ${m.s} in the station list.`, 3000, false, true);
      });
      head.append(st);
    }
    if (isMine || m.n === myName) li.classList.add("noflag");
    const rb = document.createElement("button");
    rb.type = "button";
    rb.className = "chat-react";
    rb.title = "React";
    rb.setAttribute("aria-label", `React to message from ${m.n}`);
    rb.setAttribute("aria-expanded", "false");
    rb.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-react"/></svg>';
    rb.addEventListener("click", (e) => { e.stopPropagation(); togglePicker(li); });
    li.append(rb);
    if (!isMine && m.n !== myName) {
      const flag = document.createElement("button");
      flag.type = "button";
      flag.className = "chat-flag";
      flag.title = "Report this message";
      flag.setAttribute("aria-label", `Report message from ${m.n}`);
      flag.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-flag"/></svg>';
      if (reported.has(m.id)) flag.disabled = true;
      flag.addEventListener("click", () => {
        sendJson({ t: "report", id: m.id });
        reported.add(m.id); markReported(m.id);
      });
      li.append(flag);
    }
    const p = document.createElement("p");
    p.textContent = m.x;
    const rx = document.createElement("button");
    rx.type = "button";
    rx.className = "chat-rx";
    rx.hidden = true;
    rx.addEventListener("click", (e) => { e.stopPropagation(); togglePicker(li); });
    li.append(head, p, rx);
    li._r = m.r || null;
    renderRx(li);
    return li;
  }

  // Consecutive messages from the same person within 2 minutes show the name only once.
  function regroup(li) {
    if (!li || !li.classList.contains("chat-msg")) return;
    const prev = li.previousElementSibling;
    const same = prev?.classList.contains("chat-msg") && !prev.classList.contains("pabati") && !li.classList.contains("pabati")
      && prev.dataset.n === li.dataset.n && li.dataset.ts - prev.dataset.ts < GROUP_MS;
    li.classList.toggle("cont", !!same);
  }
  function regroupAll() { for (const li of list.children) regroup(li); }

  function markReported(id) {
    const f = list.querySelector(`[data-id="${CSS.escape(id)}"] .chat-flag`);
    if (f) { f.disabled = true; f.title = "Reported. Thank you."; }
  }

  // Summary pill under a message: top 3 reactions and the total, highlighted if one is yours.
  function renderRx(li) {
    const el = li.querySelector(".chat-rx");
    if (!el) return;
    const r = li._r || [];
    const total = r.reduce((a, b) => a + b, 0);
    el.hidden = !total;
    if (!total) return;
    const mineIdx = myRx.get(li.dataset.id);
    const top = r.map((n, i) => [n, i]).filter(([n]) => n).sort((a, b) => b[0] - a[0]).slice(0, 3);
    el.classList.toggle("mine", mineIdx !== undefined);
    el.replaceChildren(...top.map(([, i]) => { const s = document.createElement("span"); s.className = "rx-e"; s.textContent = RX[i]; return s; }),
      Object.assign(document.createElement("span"), { className: "rx-n", textContent: String(total) }));
    const parts = r.map((n, i) => (n ? `${RX[i]} ${n}` : "")).filter(Boolean);
    el.title = parts.join("   ") + (mineIdx !== undefined ? `\nYou: ${RX[mineIdx]} ${RX_NAMES[mineIdx]}` : "");
    el.setAttribute("aria-label", `Reactions: ${r.map((n, i) => (n ? `${n} ${RX_NAMES[i]}` : "")).filter(Boolean).join(", ")}.${mineIdx !== undefined ? ` You reacted ${RX_NAMES[mineIdx]}.` : ""} Tap to react.`);
  }

  function closePicker() {
    if (!pickFor) return;
    pickFor.querySelector(".chat-pick")?.remove();
    pickFor.querySelector(".chat-react")?.setAttribute("aria-expanded", "false");
    pickFor = null;
  }

  function togglePicker(li) {
    const same = pickFor === li;
    closePicker();
    if (same) return;
    if (ws?.readyState !== 1) return setNote("Not connected. Try again in a moment.", 3000, false, true);
    if (mutedUntil > Date.now()) return setNote(`You're muted until ${fmtTime(mutedUntil)}.`, 3000, false, true);
    const id = li.dataset.id;
    const cur = myRx.get(id);
    const box = document.createElement("div");
    box.className = "chat-pick";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Pick a reaction");
    RX.forEach((emo, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = emo;
      b.title = cur === i ? `${RX_NAMES[i]} (tap to remove)` : RX_NAMES[i];
      b.setAttribute("aria-label", RX_NAMES[i]);
      b.setAttribute("aria-pressed", String(cur === i));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        sendJson({ t: "react", id, e: cur === i ? -1 : i });
        closePicker();
      });
      box.append(b);
    });
    li.append(box);
    li.querySelector(".chat-react")?.setAttribute("aria-expanded", "true");
    pickFor = li;
    box.scrollIntoView({ block: "nearest" });
    box.firstChild.focus({ preventScroll: true });
  }

  document.addEventListener("click", (e) => { if (pickFor && !pickFor.contains(e.target)) closePicker(); });

  // ---------- kalabit (poke) & cat scratch ----------
  function allowPokes() { try { return localStorage.getItem(POKE_KEY) !== "0"; } catch { return true; } }

  function togglePoke(li) {
    const same = pickFor === li && li.querySelector(".chat-pokepick");
    closePicker();
    if (same) return;
    if (ws?.readyState !== 1) return setNote("Not connected. Try again in a moment.", 3000, false, true);
    if (mutedUntil > Date.now()) return setNote(`You're muted until ${fmtTime(mutedUntil)}.`, 3000, false, true);
    const box = document.createElement("div");
    box.className = "chat-pick chat-pokepick";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", `Poke ${li.dataset.n}`);
    POKES.forEach((p, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span aria-hidden="true">${p.e}</span>`;
      b.append(p.label);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        sendJson({ t: "poke", id: li.dataset.id, k });
        closePicker();
      });
      box.append(b);
    });
    li.append(box);
    pickFor = li;
    box.scrollIntoView({ block: "nearest" });
    box.firstChild.focus({ preventScroll: true });
  }

  // Someone poked or scratched me: a short effect (none with "reduce motion") and a bubble to poke back.
  let bubbleT = 0;
  function poked(name, k) {
    const p = POKES[k] || POKES[0];
    if (!reduceMotion.matches && !document.hidden) (k === 1 ? scratchFx : pokeFx)();
    if (!open) btn.classList.add("poked");
    document.querySelector(".poke-bubble")?.remove();
    clearTimeout(bubbleT);
    const b = document.createElement("div");
    b.className = "poke-bubble";
    b.setAttribute("role", "status");
    const t = document.createElement("span");
    t.textContent = `${p.e} ${p.you(name)}`;
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = k === 1 ? "Scratch back" : "Kalabit back";
    back.addEventListener("click", () => { sendJson({ t: "poke", back: 1, k }); b.remove(); });
    const x = document.createElement("button");
    x.type = "button"; x.className = "pb-x"; x.textContent = "✕"; x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => b.remove());
    b.append(t, back, x);
    document.body.append(b);
    bubbleT = setTimeout(() => b.remove(), 7000);
  }

  function fxLayer(cls, ms) {
    const layer = document.createElement("div");
    layer.className = `poke-fx ${cls}`;
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    setTimeout(() => layer.remove(), ms);
    return layer;
  }
  // Kalabit: a finger slides in, taps twice, and the chat (or its button) gives a little shake.
  function pokeFx() {
    const layer = fxLayer("fx-poke", 1600);
    const f = document.createElement("span");
    f.className = "fx-finger"; f.textContent = "👉";
    layer.append(f);
    f.animate([
      { transform: "translate(-120px, 0) rotate(-8deg)", opacity: 0 },
      { transform: "translate(0, 0) rotate(0)", opacity: 1, offset: 0.3 },
      { transform: "translate(22px, 0) scale(.9)", offset: 0.42 },
      { transform: "translate(0, 0)", offset: 0.54 },
      { transform: "translate(22px, 0) scale(.9)", offset: 0.66 },
      { transform: "translate(0, 0)", opacity: 1, offset: 0.8 },
      { transform: "translate(-60px, 0)", opacity: 0 },
    ], { duration: 1500, easing: "ease-out", fill: "forwards" });
    const target = open ? panel : btn;
    setTimeout(() => target.animate?.([
      { transform: "translateX(0)" }, { transform: "translateX(-6px) rotate(-1deg)" }, { transform: "translateX(6px) rotate(1deg)" },
      { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" },
    ], { duration: 420, composite: "add" }), 520);
  }
  // Cat scratch: a paw swipes across and leaves three scratch marks that fade away.
  function scratchFx() {
    const layer = fxLayer("fx-scratch", 1900);
    for (let i = 0; i < 3; i++) {
      const s = document.createElement("i");
      s.className = "fx-mark";
      s.style.top = `${38 + i * 7}%`;
      layer.append(s);
      s.animate([
        { transform: "rotate(-24deg) scaleX(0)", opacity: 1 },
        { transform: "rotate(-24deg) scaleX(1)", opacity: 1, offset: 0.25 },
        { transform: "rotate(-24deg) scaleX(1)", opacity: 1, offset: 0.7 },
        { transform: "rotate(-24deg) scaleX(1)", opacity: 0 },
      ], { duration: 1700, delay: i * 70, easing: "ease-out", fill: "both" });
    }
    const paw = document.createElement("span");
    paw.className = "fx-paw"; paw.textContent = "🐾";
    layer.append(paw);
    paw.animate([
      { transform: "translate(-30vw, -12vh) rotate(-20deg)", opacity: 0 },
      { transform: "translate(0, 0) rotate(-20deg)", opacity: 1, offset: 0.35 },
      { transform: "translate(30vw, 12vh) rotate(-20deg)", opacity: 0 },
    ], { duration: 900, easing: "ease-in", fill: "forwards" });
    const meow = document.createElement("span");
    meow.className = "fx-meow"; meow.textContent = "Meow! 🐱";
    layer.append(meow);
  }

  function emptyRow() {
    const li = document.createElement("li");
    li.className = "chat-empty";
    li.textContent = "No messages yet. Say hi to fellow listeners!";
    return li;
  }

  function renderTyping() {
    clearTimeout(typingT);
    const now = Date.now();
    for (const [n, until] of typers) if (until <= now) typers.delete(n);
    const names = [...typers.keys()];
    typingEl.textContent = !names.length ? ""
      : names.length === 1 ? `${names[0]} is typing…`
      : names.length === 2 ? `${names[0]} and ${names[1]} are typing…`
      : `${names.length} people are typing…`;
    typingEl.classList.toggle("on", names.length > 0);
    if (names.length) typingT = setTimeout(renderTyping, Math.min(...typers.values()) - now + 50);
  }

  function flagEl(c) {
    const name = regionNames?.of(c) || c;
    const img = document.createElement("img");
    img.className = "chat-flagimg";
    img.src = FLAG_URL(c);
    img.alt = name; img.title = name;
    img.width = 16; img.height = 12;
    img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      const s = document.createElement("span");
      s.className = "chat-cc"; s.textContent = c; s.title = name;
      img.replaceWith(s);
    };
    return img;
  }

  function showFlag() { try { return localStorage.getItem(FLAG_KEY) !== "0"; } catch { return true; } }

  // Pabati (shout-out) mode: the next message is sent as a highlighted greeting.
  function setPabati(on) {
    pabatiOn = on;
    pabatiBtn.setAttribute("aria-pressed", String(on));
    form.classList.toggle("pabati", on);
    setSendable();
  }

  function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  const isAtEnd = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  // Tada for a new pabati: the row pops and confetti in the flag's colours bursts from it.
  // Only for live messages (not the history on open), only when the row is on screen.
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function tada(li) {
    li.classList.add("pb-new");
    setTimeout(() => li.classList.remove("pb-new"), 1600);
    if (reduceMotion.matches || panel.hidden || document.hidden || !li.animate) return;
    const r = li.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (!r.width || r.bottom < box.top || r.top > box.bottom) return;
    const layer = document.createElement("div");
    layer.className = "pb-confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const colors = ["#fcd116", "#ce1126", "#0038a8", "#ffffff", "#fcd116"];
    const x0 = r.left + r.width / 2, y0 = r.top + Math.min(r.height / 2, 24);
    for (let i = 0; i < 36; i++) {
      const c = document.createElement("i");
      c.style.background = colors[i % colors.length];
      c.style.left = `${x0}px`; c.style.top = `${y0}px`;
      if (i % 3 === 0) c.style.borderRadius = "50%";
      layer.append(c);
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 110;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v - 50;
      c.animate([
        { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random() * 540 - 270}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 120}px)) rotate(${Math.random() * 720 - 360}deg) scale(.6)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    }
    setTimeout(() => layer.remove(), 1800);
  }

  function scrollEnd() { list.scrollTop = list.scrollHeight; jump.hidden = true; }
  function setOnline(n) { if (n) online.textContent = `${n} online`; panel.classList.add("live"); }

  function setNote(text, ms = 0, retryable = false, warn = false) {
    clearTimeout(noteT);
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle("warn", warn);
    note.classList.toggle("retry", retryable);
    if (ms) noteT = setTimeout(() => { note.hidden = true; }, ms);
  }

  function setSendable() {
    const now = Date.now();
    const muted = mutedUntil > now;
    const connected = ws?.readyState === 1;
    input.disabled = muted || !connected;
    input.placeholder = muted ? `Muted until ${fmtTime(mutedUntil)}` : !connected ? "Offline" : pabatiOn ? "Pabati po kay… (who are you greeting?)" : "Type a message…";
    send.disabled = input.disabled || now < nextSend || !input.value.trim();
    clearTimeout(cooldownT);
    const wake = Math.max(muted ? mutedUntil : 0, nextSend);
    if (wake > now) cooldownT = setTimeout(setSendable, Math.min(wake - now + 50, 2 ** 31 - 1));
  }

  function updateCount() {
    const left = MAX_LEN - input.value.length;
    count.hidden = left > 40;
    count.textContent = String(left);
    count.classList.toggle("low", left <= 10);
  }

  // The station this listener is playing right now (shown next to their message).
  function currentStation() {
    const player = $("player");
    if (!player || player.hidden || !player.classList.contains("live")) return "";
    return ($("pName")?.textContent || "").trim().slice(0, 40);
  }

  // ---------- panel ----------
  function setOpen(v) {
    open = v;
    panel.hidden = !v;
    if (!v) setFull(false);
    btn.setAttribute("aria-expanded", String(v));
    document.documentElement.classList.toggle("chat-open", v);
    clearTimeout(idleT);
    if (v) { btn.classList.remove("poked"); connect(); setTimeout(() => input.focus({ preventScroll: true }), 50); }
    else idleT = setTimeout(disconnect, IDLE_CLOSE_MS);
  }

  btn.addEventListener("click", () => { hideHint(); setOpen(!open); });

  // One-time hint for first-time visitors (stored on the device, never shown again).
  const hint = $("chatHint");
  const HINT_KEY = "filradio-chat-hint";
  function hideHint() { if (hint) hint.hidden = true; }
  setTimeout(() => {
    if (!hint || open || /[?&]shot(=|&|$)/.test(location.search)) return;
    try { if (localStorage.getItem(HINT_KEY)) return; localStorage.setItem(HINT_KEY, "1"); } catch { return; }
    hint.hidden = false;
    setTimeout(hideHint, 9000);
  }, 6000);
  hint?.addEventListener("click", () => { hideHint(); setOpen(true); });
  // Full screen toggle: the real Fullscreen API where the browser has it (desktop, Android); otherwise
  // (iPhone) the panel just fills the window. Pressing Esc out of real full screen also turns it off.
  function fullToggle(el, btn) {
    let real = false;
    const sync = () => {
      const on = el.classList.contains("is-full");
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
      btn.title = on ? "Exit full screen" : "Full screen";
      btn.querySelector("use")?.setAttribute("href", on ? "#i-unfull" : "#i-full");
      window.dispatchEvent(new Event("resize"));
    };
    async function set(on) {
      if (on === el.classList.contains("is-full")) return;
      el.classList.toggle("is-full", on);
      sync();
      if (on && el.requestFullscreen && !document.fullscreenElement) {
        try { await el.requestFullscreen({ navigationUI: "hide" }); real = true; } catch {}
      } else if (!on && real) {
        real = false;
        if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
      }
    }
    document.addEventListener("fullscreenchange", () => { if (real && document.fullscreenElement !== el) { real = false; set(false); } });
    btn.addEventListener("click", () => set(!el.classList.contains("is-full")));
    return set;
  }
  const setFull = $("chatFull") ? fullToggle(panel, $("chatFull")) : () => {};
  $("chatClose").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open || nameForm.contains(document.activeElement)) return;
    if (pickFor) { const rb = pickFor.querySelector(".chat-react"); closePicker(); rb?.focus({ preventScroll: true }); return; }
    setOpen(false);
  });
  note.addEventListener("click", () => { if (note.classList.contains("retry")) { retry = 0; connect(); } });
  jump.addEventListener("click", scrollEnd);
  list.addEventListener("scroll", () => { if (!jump.hidden && isAtEnd()) jump.hidden = true; }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    clearTimeout(idleT);
    if (document.hidden) idleT = setTimeout(disconnect, IDLE_CLOSE_MS);
    else if (open) connect();
  });

  input.addEventListener("input", () => {
    setSendable();
    updateCount();
    const now = Date.now();
    if (input.value.trim() && now - lastTyping > TYPING_SEND_MS && mutedUntil <= now) {
      lastTyping = now;
      sendJson({ t: "typing" });
    }
  });
  // A paste longer than the box allows is cut by the browser; say so instead of cutting silently.
  input.addEventListener("paste", (e) => {
    const pasted = e.clipboardData?.getData("text") || "";
    const room = MAX_LEN - input.value.length + (input.selectionEnd - input.selectionStart);
    if (pasted.length > room) setNote(`Messages are limited to ${MAX_LEN} characters, so your paste was cut.`, 4000, false, true);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text || send.disabled || ws?.readyState !== 1) return;
    const msg = { t: "msg", text };
    const st = currentStation();
    if (st) msg.st = st;
    if (pabatiOn) { msg.g = 1; setPabati(false); }
    sendJson(msg);
    lastSent = text;
    lastTyping = 0;
    input.value = "";
    updateCount();
    nextSend = Date.now() + GAP_MS;
    setSendable();
  });

  // Change display name: tap your name or "Change name", type, Save (Enter) or Cancel (Esc).
  const you = panel.querySelector(".chat-you");
  function openName() {
    you.classList.add("editing");
    nameForm.hidden = false;
    nameInput.value = myName;
    nameInput.focus(); nameInput.select();
  }
  function closeName() {
    you.classList.remove("editing");
    nameForm.hidden = true;
    renameBtn.focus({ preventScroll: true });
  }
  pabatiBtn.addEventListener("click", () => { setPabati(!pabatiOn); input.focus(); });
  flagOpt.checked = showFlag();
  flagOpt.addEventListener("change", () => {
    try { localStorage.setItem(FLAG_KEY, flagOpt.checked ? "1" : "0"); } catch {}
    sendJson({ t: "flag", on: flagOpt.checked });
    setNote(flagOpt.checked ? "Your country flag will show on new messages." : "Your country flag is hidden.", 3000);
  });
  pokeOpt.checked = allowPokes();
  pokeOpt.addEventListener("change", () => {
    try { localStorage.setItem(POKE_KEY, pokeOpt.checked ? "1" : "0"); } catch {}
    sendJson({ t: "pokes", on: pokeOpt.checked });
    setNote(pokeOpt.checked ? "Others can kalabit and scratch you." : "Kalabit and scratches are off.", 3000);
  });
  nameBtn.addEventListener("click", openName);
  renameBtn.addEventListener("click", openName);
  $("chatNameCancel").addEventListener("click", closeName);
  nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = nameInput.value.replace(/\s+/g, " ").trim();
    if (n.length < 2) return setNote("Name must be 2 to 20 letters or numbers.", 4000, false, true);
    if (ws?.readyState !== 1) return setNote("Not connected. Try again in a moment.", 4000, false, true);
    if (n !== myName) sendJson({ t: "name", name: n });
    closeName();
  });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeName(); } });
})();
