// "Add your station" page: checks the form, tests the stream in this browser, and turns the answers
// into an email to FilRadio (mailto) or text to copy. Nothing is sent to any server from this page.
(() => {
  const TO = "zendzdev@gmail.com";
  const $ = (id) => document.getElementById(id);
  const form = $("addForm"), err = $("formErr"), testStatus = $("testStatus");
  const f = (n) => form.elements[n];
  const val = (n) => String(f(n).value || "").replace(/\s+/g, " ").trim();
  const https = (s) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(s);

  // Frequency only matters for FM/AM.
  const freqWrap = $("freqWrap");
  const syncBand = () => { freqWrap.hidden = f("band").value === "Online"; };
  f("band").addEventListener("change", syncBand);
  syncBand();

  function check() {
    const band = f("band").value, freq = val("freq").replace(",", ".");
    if (!val("name")) return ["name", "Please enter the station name."];
    if (band === "FM" && !(+freq >= 87.5 && +freq <= 108)) return ["freq", "FM frequency should be between 87.5 and 108, for example 97.3."];
    if (band === "AM" && !(+freq >= 530 && +freq <= 1710)) return ["freq", "AM frequency should be in kHz, between 530 and 1710, for example 666."];
    if (!val("stream")) return ["stream", "Please paste your stream link."];
    if (!https(val("stream"))) return ["stream", "The stream link must start with https://"];
    if (/facebook\.com|fb\.watch|youtube\.com|youtu\.be/i.test(val("stream"))) return ["stream", "Facebook and YouTube links can't be played here. Please send the direct stream link from your streaming provider."];
    if (!val("city") || !val("province")) return [val("city") ? "province" : "city", "Please enter the city and province."];
    if (val("logo") && !https(val("logo"))) return ["logo", "The logo link must start with https:// (or attach the logo to the email instead)."];
    if (val("site") && !/^https?:\/\//i.test(val("site"))) return ["site", "The website link should start with https://"];
    if (!val("contact")) return ["contact", "Please enter your name."];
    if (!f("ok").checked) return ["ok", "Please confirm you work for the station or have its permission."];
    return null;
  }

  function details() {
    const band = f("band").value, freq = val("freq");
    return [
      "FilRadio station request",
      "",
      `Station name: ${val("name")}`,
      `Band: ${band}${band !== "Online" && freq ? ` ${freq} ${band === "FM" ? "MHz" : "kHz"}` : ""}`,
      `Stream link: ${val("stream")}`,
      `City: ${val("city")}`,
      `Province: ${val("province")}`,
      `Logo: ${val("logo") || "(attached)"}`,
      `Website / Facebook: ${val("site") || "-"}`,
      `What we play: ${val("tags") || "-"}`,
      `Contact: ${val("contact")}${val("role") ? `, ${val("role")}` : ""}`,
      `Stream test on this page: ${tested || "not tested"}`,
      "",
      "I work for this station or have its permission to list the stream on FilRadio.",
    ].join("\n");
  }

  function showErr(res) {
    err.hidden = !res;
    if (!res) return;
    err.textContent = res[1];
    const el = f(res[0]);
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = check();
    showErr(res);
    if (res) return;
    const subject = `FilRadio station request: ${val("name")}`;
    location.href = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(details())}`;
  });

  $("copyBtn").addEventListener("click", async () => {
    const res = check();
    showErr(res);
    if (res) return;
    const text = `To: ${TO}\n\n${details()}`;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    $("copyBtn").textContent = "Copied";
    setTimeout(() => { $("copyBtn").textContent = "Copy details"; }, 2000);
  });
  form.addEventListener("input", () => { if (!err.hidden) err.hidden = true; });

  // Test stream: plays a few seconds in this browser, the same way FilRadio would.
  let audio = null, tested = "", stopT = 0;
  const setTest = (msg, cls) => { testStatus.textContent = msg; testStatus.className = `status ${cls || ""}`; };
  function stopTest() {
    clearTimeout(stopT);
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; }
    $("testBtn").textContent = "Test stream";
  }
  $("testBtn").addEventListener("click", () => {
    if (audio) { stopTest(); setTest(""); return; }
    const url = val("stream");
    if (!https(url)) { setTest("Paste a link that starts with https:// first.", "err"); return; }
    if (/\.m3u8(\?|$)/i.test(url)) { setTest("HLS (.m3u8) links can't be tested here, but FilRadio can play them. Send it anyway.", ""); tested = "HLS, not testable on the page"; return; }
    setTest("Connecting…");
    audio = new Audio();
    audio.preload = "none";
    const a = audio;
    const fail = setTimeout(() => { if (a === audio) { stopTest(); tested = "did not play"; setTest("No sound after 12 seconds. Check the link with your streaming provider.", "err"); } }, 12000);
    a.addEventListener("playing", () => {
      clearTimeout(fail);
      tested = "played OK";
      setTest("It plays. Your stream works on FilRadio.", "ok");
      $("testBtn").textContent = "Stop";
      stopT = setTimeout(() => { if (a === audio) stopTest(); }, 15000);
    });
    a.addEventListener("error", () => {
      clearTimeout(fail);
      if (a !== audio) return;
      stopTest(); tested = "did not play";
      setTest("This link didn't play. It may be a web page, not a direct stream, or the stream is off air.", "err");
    });
    a.src = url;
    a.play().catch(() => {});
    $("testBtn").textContent = "Stop";
  });
  f("stream").addEventListener("input", () => { tested = ""; if (audio) stopTest(); setTest(""); });
})();
