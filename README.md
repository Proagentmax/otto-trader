# Otto Trader

A local-first PWA. No server, no build step. Every file here is static.

## Deploy

Push this folder to a repo, then turn on GitHub Pages
(Settings → Pages → Source: Deploy from a branch → `main` / `root`).
HTTPS is required for the service worker and for install-to-home-screen;
GitHub Pages gives you that automatically.

Works from a project page (`user.github.io/repo/`) as well as a root
domain — every path in the app is relative.

## Publishing a new call

Replace `week-latest.json`, commit, push. It reaches every installed
device on next launch. That file is produced by the `trading-call-intake`
skill from a Zoom transcript.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app — markup, styles, logic |
| `week-latest.json` | The call the app auto-loads on first run |
| `sw.js` | Service worker. Network-first for HTML so updates always land |
| `manifest.webmanifest` | Install metadata |
| `icon-*.png` | App icons, including a maskable one for Android |
| `.nojekyll` | Stops GitHub Pages hiding files that start with `_` |

## Keys

Both API keys live in the user's own browser and are never committed.
Each device is configured separately.
