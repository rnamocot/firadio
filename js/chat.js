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

  const $ = (id) => document.getElementById(id);
  const btn = $("chatBtn"), panel = $("chatPanel");
  if (!btn || !panel) return;
  const list = $("chatList"), form = $("chatForm"), input = $("chatInput"), send = $("chatSend");
  const note = $("chatNote"), online = $("chatOnline"), nameBtn = $("chatName"), nameForm = $("chatNameForm"), nameInput = $("chatNameInput");

  let ws = null, open = false, retry = 0, retryT = 0, idleT = 0, pingT = 0, noteT = 0, cooldownT = 0;
  let myName = "", lastSent = "", mutedUntil = 0, nextSend = 0;
  const mine = new Set(), reported = new Set();

  const store = {
    get: () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } },
    set: (v) => { try { localStorage.setItem(NAME_KEY, v); } catch {} },
  };

  // ---------- connection ----------
  function connect() {
    if (ws && ws.readyState <= 1) return;
    clearTimeout(retryT);
    setNote("Connecting…");
    const u = new URL(URL_WS);
    const saved = store.get();
    if (saved) u.searchParams.set("name", saved);
    ws = new WebSocket(u);
    ws.onopen = () => { retry = 0; clearInterval(pingT); pingT = setInterval(() => ws?.readyState === 1 && ws.send("ping"), PING_MS); };
    ws.onmessage = (e) => { if (e.data !== "pong") try { onData(JSON.parse(e.data)); } catch {} };
    ws.onclose = (e) => {
      clearInterval(pingT);
      ws = null;
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

  function onData(d) {
    switch (d.t) {
      case "init":
        myName = d.name; nameBtn.textContent = myName;
        if (!store.get()) store.set(myName);
        mutedUntil = d.muted || 0;
        list.replaceChildren(...d.msgs.map(row));
        if (!d.msgs.length) list.append(emptyRow());
        setOnline(d.online);
        setNote("");
        setSendable();
        scrollEnd(true);
        break;
      case "msg": {
        list.querySelector(".chat-empty")?.remove();
        if (d.m.n === myName && d.m.x === lastSent) { mine.add(d.m.id); lastSent = ""; }
        const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        list.append(row(d.m));
        while (list.children.length > 80) list.firstChild.remove();
        setOnline(d.online);
        scrollEnd(atEnd || mine.has(d.m.id));
        break;
      }
      case "del":
        list.querySelector(`[data-id="${CSS.escape(d.id)}"]`)?.remove();
        break;
      case "clear":
        list.replaceChildren(emptyRow());
        break;
      case "reported":
        markReported(d.id);
        break;
      case "name":
        myName = d.name; store.set(myName); nameBtn.textContent = myName;
        setNote("Name saved.", 2500);
        break;
      case "err":
        if (d.code === "muted") { mutedUntil = d.until; setSendable(); }
        if (d.code === "slow" || d.code === "busy") nextSend = Math.max(nextSend, d.until || 0);
        if (d.code === "blocked" || d.code === "dupe") { input.value = lastSent; lastSent = ""; }
        setNote(d.msg, d.code === "muted" ? 0 : 5000, false, true);
        setSendable();
        break;
    }
  }

  // ---------- rendering ----------
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  function row(m) {
    const li = document.createElement("li");
    li.className = "chat-msg";
    li.dataset.id = m.id;
    if (mine.has(m.id)) li.classList.add("me");
    const head = document.createElement("div");
    head.className = "chat-meta";
    const who = document.createElement("b");
    who.textContent = m.n;
    who.style.setProperty("--hue", hue(m.n));
    const when = document.createElement("time");
    when.textContent = fmtTime(m.ts);
    head.append(who, when);
    if (!mine.has(m.id) && m.n !== myName) {
      const flag = document.createElement("button");
      flag.type = "button";
      flag.className = "chat-flag";
      flag.title = "Report this message";
      flag.setAttribute("aria-label", `Report message from ${m.n}`);
      flag.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-flag"/></svg>';
      if (reported.has(m.id)) flag.disabled = true;
      flag.addEventListener("click", () => {
        if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "report", id: m.id }));
        reported.add(m.id); markReported(m.id);
      });
      head.append(flag);
    }
    const p = document.createElement("p");
    p.textContent = m.x;
    li.append(head, p);
    return li;
  }

  function markReported(id) {
    const f = list.querySelector(`[data-id="${CSS.escape(id)}"] .chat-flag`);
    if (f) { f.disabled = true; f.title = "Reported. Thank you."; }
  }

  function emptyRow() {
    const li = document.createElement("li");
    li.className = "chat-empty";
    li.textContent = "No messages yet. Say hi to fellow listeners!";
    return li;
  }

  function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function scrollEnd(force) { if (force) list.scrollTop = list.scrollHeight; }
  function setOnline(n) { if (n) online.textContent = `${n} online`; }

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
    input.placeholder = muted ? `Muted until ${fmtTime(mutedUntil)}` : connected ? "Say something nice…" : "Not connected";
    send.disabled = input.disabled || now < nextSend || !input.value.trim();
    clearTimeout(cooldownT);
    const wake = Math.max(muted ? mutedUntil : 0, nextSend);
    if (wake > now) cooldownT = setTimeout(setSendable, Math.min(wake - now + 50, 2 ** 31 - 1));
  }

  // ---------- panel ----------
  function setOpen(v) {
    open = v;
    panel.hidden = !v;
    btn.setAttribute("aria-expanded", String(v));
    document.documentElement.classList.toggle("chat-open", v);
    clearTimeout(idleT);
    if (v) { connect(); setTimeout(() => input.focus({ preventScroll: true }), 50); }
    else idleT = setTimeout(disconnect, IDLE_CLOSE_MS);
  }

  btn.addEventListener("click", () => setOpen(!open));
  $("chatClose").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open && !nameForm.contains(document.activeElement)) setOpen(false); });
  note.addEventListener("click", () => { if (note.classList.contains("retry")) { retry = 0; connect(); } });

  document.addEventListener("visibilitychange", () => {
    clearTimeout(idleT);
    if (document.hidden) idleT = setTimeout(disconnect, IDLE_CLOSE_MS);
    else if (open) connect();
  });

  input.addEventListener("input", setSendable);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text || send.disabled || ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ t: "msg", text }));
    lastSent = text;
    input.value = "";
    nextSend = Date.now() + GAP_MS;
    setSendable();
  });

  // Change display name
  nameBtn.addEventListener("click", () => {
    nameForm.hidden = false; nameBtn.hidden = true;
    nameInput.value = myName; nameInput.focus(); nameInput.select();
  });
  const closeName = () => { nameForm.hidden = true; nameBtn.hidden = false; };
  nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = nameInput.value.trim();
    if (n && n !== myName && ws?.readyState === 1) ws.send(JSON.stringify({ t: "name", name: n }));
    closeName();
  });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeName(); } });
  nameInput.addEventListener("blur", () => setTimeout(closeName, 150));
})();
