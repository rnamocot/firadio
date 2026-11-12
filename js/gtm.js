// Google Tag Manager / GA4 bootstrap (kept in a file so the page's Content-Security-Policy allows it).
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
gtag("js", new Date());
window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

// Don't count local development visits.
if (!/^(localhost|127\.|\[::1\])/.test(location.hostname) && location.protocol !== "file:") {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtm.js?id=GTM-T9857DVX";
  document.head.appendChild(s);
}
