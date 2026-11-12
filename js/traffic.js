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

  // Country from the device time zone (no location permission, nothing personal).
  // Main OFW destinations + common countries; anything else counts as "other".
  const COUNTRIES = [
    ["ph", "Philippines"], ["sa", "Saudi Arabia"], ["ae", "United Arab Emirates"], ["qa", "Qatar"], ["kw", "Kuwait"],
    ["om", "Oman"], ["bh", "Bahrain"], ["il", "Israel"], ["jo", "Jordan"], ["lb", "Lebanon"],
    ["hk", "Hong Kong"], ["mo", "Macau"], ["sg", "Singapore"], ["my", "Malaysia"], ["bn", "Brunei"], ["tw", "Taiwan"],
    ["jp", "Japan"], ["kr", "South Korea"], ["cn", "China"], ["th", "Thailand"], ["vn", "Vietnam"], ["id", "Indonesia"],
    ["in", "India"], ["us", "United States"], ["ca", "Canada"], ["mx", "Mexico"], ["gb", "United Kingdom"],
    ["ie", "Ireland"], ["it", "Italy"], ["es", "Spain"], ["fr", "France"], ["de", "Germany"], ["nl", "Netherlands"],
    ["be", "Belgium"], ["ch", "Switzerland"], ["at", "Austria"], ["no", "Norway"], ["se", "Sweden"], ["dk", "Denmark"],
    ["fi", "Finland"], ["pl", "Poland"], ["cy", "Cyprus"], ["gr", "Greece"], ["au", "Australia"], ["nz", "New Zealand"],
    ["gu", "Guam"], ["mp", "Northern Mariana Islands"], ["pg", "Papua New Guinea"], ["other", "Other countries"],
  ];
  const TZ = {
    "Asia/Manila": "ph", "Asia/Riyadh": "sa", "Asia/Dubai": "ae", "Asia/Qatar": "qa", "Asia/Kuwait": "kw",
    "Asia/Muscat": "om", "Asia/Bahrain": "bh", "Asia/Jerusalem": "il", "Asia/Tel_Aviv": "il", "Asia/Amman": "jo",
    "Asia/Beirut": "lb", "Asia/Hong_Kong": "hk", "Asia/Macau": "mo", "Asia/Singapore": "sg",
    "Asia/Kuala_Lumpur": "my", "Asia/Kuching": "my", "Asia/Brunei": "bn", "Asia/Taipei": "tw", "Asia/Tokyo": "jp",
    "Asia/Seoul": "kr", "Asia/Shanghai": "cn", "Asia/Chongqing": "cn", "Asia/Urumqi": "cn", "Asia/Bangkok": "th",
    "Asia/Ho_Chi_Minh": "vn", "Asia/Saigon": "vn", "Asia/Jakarta": "id", "Asia/Makassar": "id", "Asia/Jayapura": "id",
    "Asia/Kolkata": "in", "Asia/Calcutta": "in", "Pacific/Guam": "gu", "Pacific/Saipan": "mp",
    "Pacific/Port_Moresby": "pg", "Pacific/Auckland": "nz", "Pacific/Honolulu": "us",
    "Europe/London": "gb", "Europe/Dublin": "ie", "Europe/Rome": "it", "Europe/Madrid": "es", "Atlantic/Canary": "es",
    "Europe/Paris": "fr", "Europe/Berlin": "de", "Europe/Amsterdam": "nl", "Europe/Brussels": "be", "Europe/Zurich": "ch",
    "Europe/Vienna": "at", "Europe/Oslo": "no", "Europe/Stockholm": "se", "Europe/Copenhagen": "dk",
    "Europe/Helsinki": "fi", "Europe/Warsaw": "pl", "Asia/Nicosia": "cy", "Europe/Nicosia": "cy", "Europe/Athens": "gr",
    "America/Mexico_City": "mx", "America/Cancun": "mx", "America/Tijuana": "mx", "America/Monterrey": "mx",
  };
  const CANADA = /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns|Montreal|Calgary|Moncton|Whitehorse|Yellowknife|Iqaluit|Glace_Bay|Goose_Bay|Swift_Current|Dawson_Creek|Fort_Nelson)$/;
  function country() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    if (TZ[tz]) return TZ[tz];
    if (CANADA.test(tz)) return "ca";
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/|Kentucky\/|North_Dakota\/|Juneau|Sitka|Nome|Adak|Menominee)/.test(tz)) return "us";
    if (/^Australia\//.test(tz)) return "au";
    return "other";
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

  window.FilTraffic = { COUNTER, NS, SOURCES, PLACES, DEVICES, SYSTEMS, COUNTRIES, classify, place, device, system, country, tidyUrl };
})();
