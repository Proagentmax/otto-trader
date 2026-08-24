# Otto Trader data proxy

A single Cloudflare Worker that feeds the Market tab's morning bias.

**This folder is not part of the app.** GitHub Pages serves it harmlessly, but
the Worker is deployed separately at Cloudflare. Nothing secret lives in this
file — the API key is a Cloudflare secret, never in the repo and never in the
browser.

## Why a proxy at all

Otto Trader has no server, so before this every data call came from Josh's
phone. That meant:

- only providers that allow cross-origin browser calls could be used, and
- any paid API key would sit in localStorage on a phone.

The Worker holds the key, adds the CORS headers, and normalises the provider's
response. **Changing data provider is an edit to `fetchTwelveData` and nothing
else** — the app never learns where the numbers came from.

## Deploy

1. dash.cloudflare.com → Workers & Pages → Create → Worker
2. Paste `otto-proxy.js`, Deploy
3. Settings → Variables:
   - **Secret** `TD_KEY` = twelvedata.com API key (free tier)
   - **Variable** `ALLOW` = `https://proagentmax.github.io`
4. Copy the Worker URL into Otto Trader → Settings → Data proxy

Free tier: 100,000 requests/day. One morning run is one request.

## What it returns

```json
{ "ok": true, "source": "twelvedata", "served": 1787600000,
  "quotes": {
    "yield":  { "label": "10Y yield", "via": "IEF …", "pct": 0.42, "at": 1787599920 },
    "jpy":    { "label": "USD/JPY",   "pct": -0.31,   "at": 1787599980 },
    "dollar": { … }, "crude": { … }, "es": { … }, "nq": { … }, "ym": { … } } }
```

Every quote carries its **own timestamp**. That is the point: the app shows the
age of each input and refuses to publish a verdict when too many are stale.
Josh's original complaint was data two days behind — a bias engine that hides
staleness behind a confident label would be that same bug wearing a green badge.

## Instrument choices

Twelve Data's free plan covers real-time **US ETFs** and real-time **forex**.
Indices, commodities and futures are paid ($79/mo). So:

| Sheet wants | We use | Note |
|---|---|---|
| US10Y | `IEF` | 7-10yr Treasury ETF. Moves **opposite** to yield — the Worker flips the sign so `yield.pct` reads as the yield's direction |
| USD/JPY | `USD/JPY` | real spot, 24h |
| DXY | `UUP` | dollar index ETF |
| Crude | `USO` | oil ETF |
| ES / NQ / YM | `SPY` / `QQQ` / `DIA` | ETF proxies |

**The known limit:** ETFs are quiet before 9:30 ET. Only the forex leg is
genuinely live at 8:45am. Whether the free plan returns pre-market ETF prints is
the one thing to check on the first live run — the per-quote timestamps will
show it immediately. If they do not, the honest options are to run the bias at
the open rather than at 8:45, or to pay for futures.
