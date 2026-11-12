# FilRadio

Listen to Philippine FM, AM and online radio stations on a 3D map. Tap a pin and it plays live.

**Live:** https://webtarsier.com/

## Features

- 3D globe map (MapLibre GL) with terrain and 3D buildings, with a 2D toggle
- 600+ Philippine stations from [radio-browser.info](https://www.radio-browser.info/)
- Stations placed by city from their names (`js/places.js`); unplaced ones shown as grey pins near Manila
- FM / AM / Online filter and search
- Mobile app layout: bottom sheet, tab bar, full-screen Now Playing with tuning dial
- Lock-screen / car controls via the Media Session API (works over CarPlay and Android Auto audio)
- Installable PWA (manifest + service worker)
- SEO: meta tags, Open Graph / Twitter cards, JSON-LD, sitemap, robots.txt

## Run locally

It is a static site with no build step:

```sh
python -m http.server 5173
# open http://localhost:5173
```

## Deploy

Upload the whole folder to the web root of `webtarsier.com` (HTTPS is required for installing as an app).

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page, SEO tags, branded SVG icon set |
| `css/style.css` | Design system, desktop + mobile layouts, motion |
| `js/app.js` | Data loading, band detection, map, player, mobile shell, PWA install |
| `js/places.js` | Philippine places gazetteer used to pin stations |
| `sw.js`, `manifest.webmanifest` | PWA |
| `icons/` | App icons and fallback radio artwork |

Created by [Ren](https://www.renienamocot.com/).
