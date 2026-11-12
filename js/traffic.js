// FilRadio traffic sources: classifies where a visit came from, using only aggregate counters.
// Nothing personal is stored or sent: just "+1" on a named counter, once per device per day.
// Shared by the app (counting) and stats.html (reporting).
(() => {
  "use strict";

  const COUNTER = "https://abacus.jasoncameron.dev";
  const NS = "webtarsier-filradio"; // counter namespace; renaming it would reset all counts

  // Order = order shown on the stats page.
  const SOURCES = [
    ["facebook", "Facebook"],
    ["messenger", "Messenger"],
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
    ["x", "X / Twitter"],
    ["youtube", "YouTube"],
    ["threads", "Threads"],
    ["reddit", "Reddit"],
    ["viber", "Viber"],
    ["whatsapp", "WhatsApp"],
    ["telegram", "Telegram"],
    ["google", "Google search"],
    ["bing", "Bing"],
    ["search-other", "Other search engines"],
    ["ads", "Ads (Google / Meta)"],
    ["other-sites", "Other websites"],
    ["app", "Installed app"],
    ["direct", "Direct / typed / bookmark"],
  ];
  const PLACES = [["ph", "In the Philippines"], ["abroad", "Abroad (OFWs & others)"]];
  const DEVICES = [["mobile", "Phone"], ["tablet", "Tablet"], ["desktop", "Desktop / laptop"]];
  const SYSTEMS = [["ios", "iPhone / iPad"], ["android", "Android"], ["windows", "Windows"], ["mac", "Mac"], ["chromeos", "Chromebook"], ["linux", "Linux"], ["other", "Other"]];

  function classify() {
    const url = new URL(location.href);
    const q = url.searchParams;
    const ua = navigator.userAgent;
    const ref = (() => { try { return document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch { return ""; } })();

    // Opened from the installed app
    if (q.get("source") === "pwa" || matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "app";

    // Ad clicks
    if (q.has("gclid") || q.has("gbraid") || q.has("wbraid") || /^(cpc|paid|ppc)$/i.test(q.get("utm_medium") || "")) return "ads";

    // Explicit campaign tags, e.g. filradio.xyz/?utm_source=facebook
    const utm = (q.get("utm_source") || q.get("ref") || "").toLowerCase();
    if (utm) {
      if (/^(fb|facebook)/.test(utm)) return "facebook";
      if (/messenger/.test(utm)) return "messenger";
      if (/^(ig|instagram)/.test(utm)) return "instagram";
      if (/tiktok/.test(utm)) return "tiktok";
      if (/^(x|twitter)$/.test(utm)) return "x";
      if (/youtube|^yt$/.test(utm)) return "youtube";
      if (/viber/.test(utm)) return "viber";
      if (/whatsapp|^wa$/.test(utm)) return "whatsapp";
      if (/telegram/.test(utm)) return "telegram";
    }

    // In-app browsers (they often hide the referrer)
    if (/FBAN\/Messenger|MessengerForiOS|Orca-Android|FB_IAB\/MESSENGER/i.test(ua)) return "messenger";
    if (/Instagram/i.test(ua)) return "instagram";
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "facebook";
    if (/musical_ly|BytedanceWebview|TikTok|trill/i.test(ua)) return "tiktok";
    if (/Viber/i.test(ua)) return "viber";
    if (/Telegram/i.test(ua)) return "telegram";
    if (/WhatsApp/i.test(ua)) return "whatsapp";
    if (/Threads|Barcelona/i.test(ua)) return "threads";
    if (q.has("fbclid")) return "facebook";

    // Referring site
    if (ref && ref !== location.hostname) {
      if (/(^|\.)messenger\.com$|^lm\.facebook\.com$/.test(ref)) return "messenger";
      if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(ref)) return "facebook";
      if (/(^|\.)instagram\.com$/.test(ref)) return "instagram";
      if (/(^|\.)tiktok\.com$/.test(ref)) return "tiktok";
      if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(ref)) return "x";
      if (/(^|\.)(youtube\.com|youtu\.be)$/.test(ref)) return "youtube";
      if (/(^|\.)threads\.(net|com)$/.test(ref)) return "threads";
      if (/(^|\.)reddit\.com$/.test(ref)) return "reddit";
      if (/(^|\.)google\.[a-z.]+$/.test(ref)) return "google";
      if (/(^|\.)bing\.com$/.test(ref)) return "bing";
      if (/(^|\.)(yahoo\.|duckduckgo\.com|ecosia\.org|search\.brave\.com|yandex\.|baidu\.com|naver\.com)/.test(ref)) return "search-other";
      return "other-sites";
    }
    return "direct";
  }

  function place() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Manila" ? "ph" : "abroad"; } catch { return "ph"; }
  }

  function device() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "tablet";
    if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
    return "desktop";
  }

  function system() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/CrOS/i.test(ua)) return "chromeos";
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
    if (/Linux/i.test(ua)) return "linux";
    return "other";
  }

  // Remove tracking parameters from the address bar after reading them (cleaner shared links).
  function tidyUrl() {
    try {
      const url = new URL(location.href);
      let changed = false;
      for (const k of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$|gbraid$|wbraid$|igshid$|ref$|source$|m$)/.test(k)) { url.searchParams.delete(k); changed = true; }
      }
      if (changed) history.replaceState(history.state, "", url.pathname + (url.search || "") + url.hash);
    } catch {}
  }

  window.FilTraffic = { COUNTER, NS, SOURCES, PLACES, DEVICES, SYSTEMS, classify, place, device, system, tidyUrl };
})();
