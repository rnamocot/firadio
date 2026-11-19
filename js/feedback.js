// FilRadio feedback pop-up: a short form (rating, message, optional contact) saved by the stats Worker
// and read on the private stats page. Opens from any ".fb-open" button, and asks by itself once:
// on a visitor's 3rd day of using FilRadio, a minute after a station starts playing.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const dlg = $("fbDlg");
  if (!dlg || !window.FilTraffic) return;
  const STATE = "filradio.feedback";
  const ASK_DAY = 3;          // ask on the 3rd different day of use
  const ASK_AFTER = 60e3;     // ...a minute after a station starts playing
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STATE) || "{}") || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(STATE, JSON.stringify(v)); } catch {} },
  };
  const form = $("fbForm"), msg = $("fbMsg"), err = $("fbErr"), send = $("fbSend");
  let rating = 0;

  // ---------- rating faces ----------
  const faces = [...dlg.querySelectorAll(".fb-face")];
  function setRating(n) {
    rating = n;
    faces.forEach((f) => f.setAttribute("aria-checked", String(Number(f.dataset.r) === n)));
  }
  faces.forEach((f) => f.addEventListener("click", () => setRating(rating === Number(f.dataset.r) ? 0 : Number(f.dataset.r))));

  // ---------- open / close ----------
  function open(auto) {
    if (dlg.open) return;
    form.hidden = false; $("fbDone").hidden = true; err.hidden = true;
    $("fbTitle").textContent = auto ? "Enjoying FilRadio?" : "Send feedback";
    const s = store.get(); s.asked = true; store.set(s);
    dlg.showModal();
    if (!auto) msg.focus();
  }
  const close = () => dlg.close();
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".fb-open");
    if (!b) return;
    e.preventDefault();
    $("creditPop")?.setAttribute("hidden", "");
    $("creditBtn")?.setAttribute("aria-expanded", "false");
    open(false);
  });
  $("fbClose").addEventListener("click", close);
  $("fbDoneBtn").addEventListener("click", close);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });

  // ---------- send ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = msg.value.trim();
    if (m.length < 3 && !rating) { showErr("Pick a face or write a short message."); return; }
    send.disabled = true; send.textContent = "Sending…"; err.hidden = true;
    try {
      const body = JSON.stringify({ r: rating, m, c: $("fbContact").value.trim(), p: (window.matchMedia("(max-width: 760px)").matches ? "phone" : "desktop"), hp: $("fbHp").value });
      const res = await fetch(`${window.FilTraffic.STATS}/feedback`, { method: "POST", body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? "Too many messages. Wait a minute and try again." : d.error || "Couldn't send. Try again in a moment.");
      form.reset(); setRating(0);
      const s = store.get(); s.sent = Date.now(); store.set(s);
      form.hidden = true; $("fbDone").hidden = false; $("fbDoneBtn").focus();
    } catch (x) {
      showErr(x.message === "Failed to fetch" ? "Couldn't reach FilRadio. Check your connection." : x.message);
    } finally { send.disabled = false; send.textContent = "Send"; }
  });
  function showErr(t) { err.textContent = t; err.hidden = false; }

  // ---------- one gentle ask ----------
  const s = store.get();
  const today = new Date().toISOString().slice(0, 10);
  if (s.day !== today) { s.day = today; s.days = (s.days || 0) + 1; store.set(s); }
  if (s.asked || s.sent || s.days < ASK_DAY) return;
  let timer = 0;
  const audio = $("audio");
  audio?.addEventListener("playing", () => {
    if (timer || store.get().asked) return;
    timer = setTimeout(() => {
      // Don't cover anything the listener is busy with.
      if (audio.paused || document.hidden || document.querySelector("dialog[open]")) { timer = 0; return; }
      open(true);
    }, ASK_AFTER);
  });
})();
