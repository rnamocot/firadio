// FilRadio install guide: step-by-step, illustrated, per platform.
// Opens from the Install buttons when the browser has no built-in install prompt
// (iPhone/iPad, Safari, Firefox) and from the "How to install" link.
(() => {
  "use strict";

  const SUN = "#ffc93c", INK = "#10182b", RED = "#e63946", PAPER = "#f4f1ea";
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);

  // ---------- Illustration helpers (SVG, 280×170) ----------
  const ring = (cx, cy, r = 13) =>
    `<circle class="hl" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${SUN}" stroke-width="3"/>
     <circle class="hl-pulse" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${SUN}" stroke-width="2"/>`;
  const cursor = (x, y) =>
    `<path d="M${x} ${y}l0 15 4-3.6 2.8 6 2.4-1.1-2.8-5.9 5.4-.4Z" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
  const tap = (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="${INK}" opacity=".18"/><circle cx="${x}" cy="${y}" r="3.5" fill="${INK}" opacity=".45"/>`;
  const logo = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s / 512})"><rect width="512" height="512" rx="120" fill="${INK}"/>
     <g transform="translate(256 256)" fill="${SUN}">${[0, 90, 180, 270].map((a) => `<rect x="-15" y="-196" width="30" height="100" rx="15" transform="rotate(${a})"/>`).join("")}
     ${[45, 135, 225, 315].map((a) => `<rect x="-13" y="-160" width="26" height="56" rx="13" transform="rotate(${a})"/>`).join("")}
     <circle r="70"/><circle r="24" fill="${INK}"/></g><circle cx="426" cy="86" r="22" fill="${RED}"/></g>`;
  const miniMap = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bcd3ec"/>
     <path d="M${x + w * 0.52} ${y + h * 0.12}c10 8 6 22 14 30s4 18-4 24 6 16 16 22-2 20 6 28" stroke="#e8e1cf" stroke-width="${Math.max(6, w / 22)}" fill="none" stroke-linecap="round"/>
     ${[[0.55, 0.3], [0.62, 0.55], [0.68, 0.8], [0.48, 0.65]].map(([px, py]) => `<circle cx="${x + w * px}" cy="${y + h * py}" r="4.5" fill="${INK}" stroke="${SUN}" stroke-width="2"/>`).join("")}`;
  const svg = (inner) => `<svg viewBox="0 0 280 170" role="img" aria-hidden="true">${inner}</svg>`;

  // Desktop browser window
  const desktop = (extra = "", addr = "webtarsier.com") => svg(`
    <rect x="10" y="10" width="260" height="150" rx="10" fill="#fff" stroke="#d9d3c4"/>
    <path d="M10 20a10 10 0 0 1 10-10h240a10 10 0 0 1 10 10v12H10Z" fill="#ebe6da"/>
    <circle cx="22" cy="21" r="3" fill="#ff5f57"/><circle cx="32" cy="21" r="3" fill="#febc2e"/><circle cx="42" cy="21" r="3" fill="#28c840"/>
    <rect x="54" y="13" width="74" height="19" rx="6" fill="#fff"/>${logo(59, 17, 11)}<text x="74" y="26" font-size="8" font-family="system-ui" fill="#333">FilRadio</text>
    <rect x="18" y="36" width="244" height="18" rx="9" fill="#f1eee6"/>
    <text x="40" y="48.5" font-size="8.5" font-family="system-ui" fill="#444">🔒 ${addr}</text>
    <g transform="translate(232 40)" fill="none" stroke="#555" stroke-width="1.4" stroke-linecap="round"><rect x="0" y="0" width="12" height="9" rx="1.5"/><path d="M6 2.2v4.6M4 5l2 2 2-2M3.5 11h5"/></g>
    <circle cx="254" cy="45" r="1" fill="#555"/><circle cx="254" cy="42" r="1" fill="#555"/><circle cx="254" cy="48" r="1" fill="#555"/>
    ${miniMap(10.5, 58, 259, 101.5)}
    <rect x="18" y="66" width="70" height="86" rx="7" fill="#fffdf8"/>${logo(24, 72, 12)}
    <rect x="40" y="74" width="34" height="5" rx="2.5" fill="${INK}"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="24" y="${92 + i * 14}" width="10" height="10" rx="3" fill="${INK}"/><rect x="38" y="${94 + i * 14}" width="${40 - i * 5}" height="4" rx="2" fill="#bbb"/>`).join("")}
    ${extra}`);

  // Phone frame (Android: address bar on top; iOS: Safari bar at bottom)
  const phone = (screen, os) => svg(`
    <rect x="90" y="4" width="100" height="162" rx="16" fill="${INK}"/>
    <rect x="95" y="9" width="90" height="152" rx="12" fill="#fff"/>
    ${os === "ios" ? `<rect x="125" y="12" width="30" height="7" rx="3.5" fill="${INK}"/>` : `<circle cx="140" cy="15" r="2.5" fill="${INK}"/>`}
    <g clip-path="url(#scr-${os})"><defs><clipPath id="scr-${os}"><rect x="95" y="9" width="90" height="152" rx="12"/></clipPath></defs>${screen}</g>`);

  const androidBar = (hlMenu) => `
    <rect x="95" y="22" width="90" height="17" fill="#f1eee6"/>
    <rect x="99" y="25" width="68" height="11" rx="5.5" fill="#fff"/><text x="104" y="33" font-size="6" font-family="system-ui" fill="#444">webtarsier.com</text>
    <circle cx="177" cy="27.5" r=".9" fill="#444"/><circle cx="177" cy="30.5" r=".9" fill="#444"/><circle cx="177" cy="33.5" r=".9" fill="#444"/>
    ${hlMenu ? ring(177, 30.5, 7) : ""}`;
  const iosBar = (hlShare) => `
    <rect x="95" y="138" width="90" height="23" fill="#f6f4ef"/>
    <rect x="101" y="125" width="78" height="11" rx="5.5" fill="#fff" stroke="#e1dccf"/><text x="122" y="133" font-size="6" font-family="system-ui" fill="#444">webtarsier.com</text>
    <g fill="none" stroke="#0a84ff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M106 146l-3 3 3 3M116 146l3 3-3 3"/>
      <path d="M137 151.5h-2.5v-6h2M143 145.5h2v6h-10M140 141v7M137.8 143.2l2.2-2.2 2.2 2.2"/>
      <rect x="156" y="144" width="7" height="8" rx="1.5"/><rect x="170" y="144" width="7" height="7" rx="1.5"/><rect x="172" y="142" width="7" height="7" rx="1.5"/>
    </g>
    ${hlShare ? ring(140, 147, 8) : ""}`;
  const appScreen = `${miniMap(95, 39, 90, 84)}<rect x="99" y="96" width="82" height="24" rx="8" fill="#fffdf8"/>
    <rect x="103" y="100" width="12" height="12" rx="3" fill="${INK}"/><rect x="119" y="102" width="40" height="4" rx="2" fill="${INK}"/><rect x="119" y="109" width="28" height="3" rx="1.5" fill="#bbb"/>`;

  // ---------- Content ----------
  const GUIDES = {
    desktop: {
      label: "Desktop & laptop",
      note: "Windows, macOS, Linux and ChromeOS. Works in Chrome and Microsoft Edge.",
      steps: [
        { title: "Open FilRadio in Chrome or Edge", text: "Go to <b>webtarsier.com</b> in Google Chrome or Microsoft Edge.", art: desktop() },
        { title: "Click the install icon", text: "At the right end of the address bar, click the <b>Install</b> icon (a screen with a down arrow). No icon? Open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b>. In Edge: <b>⋯</b> → <b>Apps</b> → <b>Install this site as an app</b>.",
          art: desktop(ring(238, 44.5, 11) + cursor(240, 47)) },
        { title: "Confirm “Install”", text: "FilRadio opens in its own window and is added to your Start menu, Applications folder or Dock, like any other app.",
          art: desktop(`<rect x="150" y="58" width="112" height="62" rx="8" fill="#fff" stroke="#d9d3c4"/>
            <text x="160" y="73" font-size="8.5" font-weight="700" font-family="system-ui" fill="${INK}">Install app?</text>${logo(160, 79, 14)}
            <text x="178" y="88" font-size="7.5" font-family="system-ui" fill="#333">FilRadio</text>
            <rect x="160" y="100" width="44" height="13" rx="6.5" fill="#1a73e8"/><text x="171" y="109" font-size="7" font-family="system-ui" fill="#fff">Install</text>
            <text x="214" y="109" font-size="7" font-family="system-ui" fill="#1a73e8">Cancel</text>
            ${ring(182, 106.5, 16)}${cursor(186, 109)}`) },
      ],
      extra: "<b>Safari on Mac</b> (macOS Sonoma or newer): <b>File</b> → <b>Add to Dock</b>. <b>Firefox</b> doesn't install web apps; use Chrome or Edge.",
    },
    android: {
      label: "Android",
      note: "Phones and tablets. Works in Chrome, Edge and Samsung Internet.",
      steps: [
        { title: "Open FilRadio in Chrome", text: "Go to <b>webtarsier.com</b> in Chrome. If an <b>Install app</b> banner pops up, just tap it.", art: phone(androidBar(false) + appScreen, "android") },
        { title: "Tap ⋮ → Add to Home screen", text: "Tap the <b>⋮</b> menu at the top right, then <b>Add to Home screen</b> (or <b>Install app</b>). In Samsung Internet: <b>≡</b> → <b>Add page to</b> → <b>Home screen</b>.",
          art: phone(androidBar(true) + appScreen + `<rect x="118" y="36" width="66" height="62" rx="5" fill="#fff" stroke="#ddd"/>
            ${["New tab", "Bookmarks", "Add to Home screen", "Settings"].map((t, i) => `<text x="122" y="${49 + i * 14}" font-size="5.4" font-family="system-ui" fill="${i === 2 ? INK : "#555"}" font-weight="${i === 2 ? 700 : 400}">${t}</text>`).join("")}
            <rect x="119" y="70" width="64" height="11" rx="3" fill="${SUN}" opacity=".35"/>${tap(170, 75)}`, "android") },
        { title: "Tap Install", text: "Confirm with <b>Install</b>. FilRadio appears on your home screen and app drawer, and opens full-screen like a normal app.",
          art: phone(appScreen + `<rect x="95" y="9" width="90" height="152" fill="#000" opacity=".35"/>
            <rect x="101" y="60" width="78" height="56" rx="8" fill="#fff"/><text x="108" y="74" font-size="7" font-weight="700" font-family="system-ui" fill="${INK}">Install app</text>
            ${logo(108, 79, 13)}<text x="125" y="88" font-size="6.5" font-family="system-ui" fill="#333">FilRadio</text>
            <text x="128" y="108" font-size="6.5" font-family="system-ui" fill="#1a73e8">Cancel</text><text x="156" y="108" font-size="6.5" font-weight="700" font-family="system-ui" fill="#1a73e8">Install</text>
            ${ring(165, 106, 11)}${tap(165, 106)}`, "android") },
      ],
      extra: "Android tablets work the same way. On some phones the option is called <b>Install app</b> instead of <b>Add to Home screen</b>.",
    },
    ios: {
      label: "iPhone & iPad",
      note: "Use Safari. On iOS 16.4 or newer you can also use Chrome or Edge from their Share menu.",
      steps: [
        { title: "Tap the Share button", text: "Open <b>webtarsier.com</b> in Safari and tap <b>Share</b> (the square with an arrow pointing up). It's at the bottom on iPhone and at the top right on iPad.",
          art: phone(appScreen.replace(/y="39"/, 'y="20"') + iosBar(true), "ios") },
        { title: "Choose “Add to Home Screen”", text: "Scroll down the share sheet and tap <b>Add to Home Screen</b>.",
          art: phone(appScreen + `<rect x="95" y="9" width="90" height="152" fill="#000" opacity=".3"/>
            <rect x="95" y="62" width="90" height="99" rx="10" fill="#f2f2f7"/>
            <rect x="100" y="68" width="80" height="18" rx="5" fill="#fff"/>${logo(103, 71, 12)}<text x="119" y="79" font-size="6" font-weight="700" font-family="system-ui" fill="${INK}">FilRadio</text>
            ${["Copy", "Add to Bookmarks", "Add to Home Screen", "Find on Page"].map((t, i) => `<rect x="100" y="${91 + i * 16}" width="80" height="14" rx="4" fill="${i === 2 ? "#fff6dc" : "#fff"}"/><text x="105" y="${100.5 + i * 16}" font-size="5.8" font-family="system-ui" fill="${INK}" font-weight="${i === 2 ? 700 : 400}">${t}</text>`).join("")}
            <rect x="168" y="126" width="7" height="7" rx="1.5" fill="none" stroke="${INK}" stroke-width=".9"/><path d="M171.5 127.8v3.4M169.8 129.5h3.4" stroke="${INK}" stroke-width=".9"/>
            ${tap(150, 130)}`, "ios") },
        { title: "Tap “Add”", text: "Tap <b>Add</b> at the top right. Open FilRadio from your Home Screen for the full-screen app, with lock-screen controls and CarPlay audio.",
          art: phone(`<rect x="95" y="9" width="90" height="152" fill="#f2f2f7"/>
            <text x="100" y="32" font-size="6" font-family="system-ui" fill="#0a84ff">Cancel</text>
            <text x="120" y="32" font-size="6" font-weight="700" font-family="system-ui" fill="${INK}">Add to Home</text>
            <text x="170" y="32" font-size="6.5" font-weight="700" font-family="system-ui" fill="#0a84ff">Add</text>${ring(175, 30, 9)}${tap(175, 30)}
            <rect x="100" y="40" width="80" height="34" rx="6" fill="#fff"/>${logo(105, 45, 24)}
            <text x="135" y="56" font-size="6.5" font-family="system-ui" fill="${INK}">FilRadio</text><rect x="135" y="61" width="38" height="3" rx="1.5" fill="#ccc"/>
            <rect x="95" y="96" width="90" height="65" fill="#2a3557"/>
            ${[0, 1, 2, 3].map((i) => `<rect x="${102 + i * 20}" y="104" width="14" height="14" rx="4" fill="${["#5ac8fa", "#ff9f0a", "#30d158", "#bf5af2"][i]}"/>`).join("")}
            ${logo(102, 124, 14)}<text x="100" y="146" font-size="4.6" font-family="system-ui" fill="#fff">FilRadio</text>`, "ios") },
      ],
      extra: "On iPad, the Share button is in the top toolbar next to the address bar. The other steps are the same.",
    },
  };

  // ---------- Dialog ----------
  const dlg = document.createElement("dialog");
  dlg.className = "guide";
  dlg.setAttribute("aria-labelledby", "guideTitle");
  dlg.innerHTML = `
    <div class="guide-card">
      <header class="guide-head">
        <img src="icon.svg" alt="" width="44" height="44">
        <div><h2 id="guideTitle">Install FilRadio</h2><p>Free, no app store, about 10 seconds. Works like a normal app.</p></div>
        <button class="ibtn ghost guide-close" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button>
      </header>
      <div class="guide-tabs" role="tablist">
        ${Object.entries(GUIDES).map(([k, g]) => `<button role="tab" data-g="${k}">${g.label}</button>`).join("")}
      </div>
      <div class="guide-body"></div>
      <footer class="guide-foot">
        <button class="guide-now" hidden><svg class="i"><use href="#i-install"/></svg>Install now</button>
        <span>You can remove it anytime like any other app.</span>
      </footer>
    </div>`;
  document.body.appendChild(dlg);

  const body = dlg.querySelector(".guide-body");
  function show(key) {
    const g = GUIDES[key];
    dlg.querySelectorAll(".guide-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.g === key)));
    body.innerHTML = `<p class="guide-note">${g.note}</p>
      <ol class="guide-steps">${g.steps.map((s, i) => `
        <li style="--i:${i}"><div class="guide-art">${s.art}</div>
          <div class="guide-text"><span class="guide-n">${i + 1}</span><h3>${s.title}</h3><p>${s.text}</p></div></li>`).join("")}
      </ol><p class="guide-extra">${g.extra}</p>`;
  }
  dlg.querySelector(".guide-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-g]");
    if (b) show(b.dataset.g);
  });
  dlg.querySelector(".guide-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  window.FilGuide = {
    open({ canPrompt = false, onPrompt } = {}) {
      show(isIOS ? "ios" : isAndroid ? "android" : "desktop");
      const now = dlg.querySelector(".guide-now");
      now.hidden = !canPrompt;
      now.onclick = () => { dlg.close(); onPrompt && onPrompt(); };
      dlg.showModal();
    },
  };
})();
