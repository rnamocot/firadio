# WebTarsier FilRadio

Listen to Philippine FM, AM and online radio on a 3D map, at home or abroad. Tap a pin and it plays live.

**Live:** https://filradio.xyz/

![WebTarsier FilRadio](og-image.png)

## Features

- **Map that starts in fast 2D**; tap 3D for terrain, globe and buildings (loaded only on demand, choice remembered). Station clusters are drawn as the FilRadio sun
- **600+ stations** from [radio-browser.info](https://www.radio-browser.info/), merged and de-duplicated, with backup streams
- **Location search**: type a city or province (Cebu, Davao, Bohol…) to list stations within 45 km, nearest first; or tap *near me*
- **For OFWs**: streams work from any country; visitors abroad get a welcome note
- **Mobile app layout**: floating search, bottom sheet, tab bar, full-screen Now Playing with a tuning dial
- **Lock-screen and car controls** via the Media Session API (audio works over CarPlay / Android Auto)
- **Installable PWA** with an illustrated install guide for desktop, Android and iPhone/iPad
- **Works offline** for the app itself and the last station list (radio streams and new map areas need internet)
- **SEO**: meta tags, Open Graph / Twitter cards with app screenshots, JSON-LD, image sitemap, robots.txt
- **Visitor counter** (Abacus, one count per device per day)

## Safety and server load

- Station list is fetched once and cached for 6 hours per device; after a failed fetch the app waits 60 s before retrying and uses the cached list
- radio-browser "click" votes are sent at most once per station per device per day
- Next/previous is throttled; only one stream connection is open at a time; stream fallbacks are bounded
- Visitor counter: one hit per device per day, never from localhost
- Content-Security-Policy, no inline event handlers, all station text escaped, only http(s) links allowed

## Speed

- All scripts are `defer`; hls.js loads only when an HLS station is played
- Map pixel ratio is capped on high-density phones; off-screen list rows use `content-visibility`
- Preconnect to map tiles, station API and CDN; service worker caches the app shell and libraries

## Run locally

Static site, no build step:

```sh
python -m http.server 5173
# open http://localhost:5173
```

## Deploy

Upload the whole folder to the web root of `filradio.xyz`. HTTPS is required for install and for most streams.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page, SEO tags, CSP, branded SVG icon set |
| `css/style.css` | Design system, desktop + mobile layouts, motion |
| `js/app.js` | Data, band detection, map, player, location search, mobile shell, PWA, counter |
| `js/install-guide.js` | Illustrated install guide |
| `js/places.js` | Philippine places gazetteer used to pin stations |
| `sw.js`, `manifest.webmanifest` | PWA |
| `icons/` | App icons and fallback radio artwork |
| `screenshots/`, `og-image.png` | Install dialog screenshots and social preview |

WebTarsier FilRadio · Created by [Ren](https://www.renienamocot.com/).
