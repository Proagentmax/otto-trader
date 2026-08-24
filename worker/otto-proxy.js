/* Otto Trader data proxy — Cloudflare Worker, free tier.
 *
 * WHY THIS EXISTS
 * Otto Trader is a static PWA with no server, so every data call was made from
 * Josh's phone. That capped us at providers which allow cross-origin browser
 * calls, and it meant any paid API key would sit in localStorage on a phone.
 * This Worker fixes both: it holds the key server-side, adds the CORS headers
 * the browser needs, and normalises whatever the provider returns so the app
 * never learns the provider's shape. Swapping data sources is then an edit to
 * ONE function in here, not a change to the app.
 *
 * DEPLOY
 *   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   2. Paste this file, Deploy.
 *   3. Settings -> Variables -> add a SECRET (not a plain variable):
 *        TD_KEY   = your twelvedata.com API key (free tier is fine)
 *   4. Settings -> Variables -> add a plain variable:
 *        ALLOW    = https://proagentmax.github.io
 *   5. Copy the worker URL into Otto Trader -> Settings -> Data proxy.
 *
 * Free tier is 100,000 requests a day. One morning run is one request.
 */

const SYMBOLS = [
  // Every input the intermarket sheet needs, as instruments the free tier
  // actually covers. Twelve Data's free plan gives real-time US ETFs and
  // real-time forex; indices, commodities and futures are paid. So the yield,
  // dollar and crude legs ride on ETF proxies rather than ^TNX / DXY / CL=F.
  { key: 'yield',  sym: 'IEF',     kind: 'etf', invert: true,
    label: '10Y yield',  via: 'IEF (7-10yr Treasuries) — moves OPPOSITE to yield' },
  { key: 'jpy',    sym: 'USD/JPY', kind: 'fx',  label: 'USD/JPY', via: 'spot' },
  { key: 'dollar', sym: 'UUP',     kind: 'etf', label: 'Dollar',  via: 'UUP (dollar index ETF)' },
  { key: 'crude',  sym: 'USO',     kind: 'etf', label: 'Crude',   via: 'USO (oil ETF)' },
  { key: 'es',     sym: 'SPY',     kind: 'etf', label: 'S&P',     via: 'SPY (proxy for ES)' },
  { key: 'nq',     sym: 'QQQ',     kind: 'etf', label: 'Nasdaq',  via: 'QQQ (proxy for NQ)' },
  { key: 'ym',     sym: 'DIA',     kind: 'etf', label: 'Dow',     via: 'DIA (proxy for YM)' },
];

/* ---------- the only provider-specific code in the file ---------- */

async function fetchTwelveData(key) {
  const etfs = SYMBOLS.filter(s => s.kind === 'etf').map(s => s.sym);
  const fx   = SYMBOLS.filter(s => s.kind === 'fx').map(s => s.sym);

  const call = async list => {
    const url = 'https://api.twelvedata.com/quote?symbol=' +
      encodeURIComponent(list.join(',')) + '&apikey=' + encodeURIComponent(key);
    const r = await fetch(url, { cf: { cacheTtl: 45 } });
    if (!r.ok) throw new Error('provider HTTP ' + r.status);
    const j = await r.json();
    if (j.code && j.message) throw new Error(j.message);       // rate limit, bad key
    // one symbol returns a bare object, many return a map keyed by symbol
    return list.length === 1 ? { [list[0]]: j } : j;
  };

  const [a, b] = await Promise.all([call(etfs), fx.length ? call(fx) : {}]);
  const raw = Object.assign({}, a, b);

  const out = {};
  for (const s of SYMBOLS) {
    const q = raw[s.sym];
    if (!q || q.status === 'error' || q.close == null) { out[s.key] = null; continue; }
    const price = parseFloat(q.close);
    const prev  = parseFloat(q.previous_close);
    let pct = (isFinite(price) && isFinite(prev) && prev) ? ((price - prev) / prev) * 100
                                                         : parseFloat(q.percent_change);
    if (!isFinite(pct)) pct = null;
    // IEF rises when yields fall, so flip it and report the yield's direction
    if (s.invert && pct != null) pct = -pct;
    out[s.key] = {
      label: s.label, via: s.via, symbol: s.sym,
      price: isFinite(price) ? price : null,
      prev:  isFinite(prev)  ? prev  : null,
      pct,
      // seconds since epoch, from the provider — the app decides what is stale
      at: q.timestamp ? Number(q.timestamp) : null,
      exchangeOpen: q.is_market_open === true || q.is_market_open === 'true',
    };
  }
  return out;
}

/* ---------- transport ---------- */

function cors(origin, allow) {
  const ok = !allow || allow.split(',').map(s => s.trim()).includes(origin);
  return {
    'access-control-allow-origin': ok ? (origin || '*') : allow.split(',')[0].trim(),
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const head = cors(origin, env.ALLOW);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    if (request.method !== 'GET')     return new Response('GET only', { status: 405, headers: head });

    const json = (body, status) => new Response(JSON.stringify(body, null, 2), {
      status: status || 200,
      headers: Object.assign({ 'content-type': 'application/json',
                               'cache-control': 'no-store' }, head),
    });

    if (!env.TD_KEY) {
      return json({ error: 'TD_KEY secret is not set on this Worker' }, 500);
    }

    try {
      const quotes = await fetchTwelveData(env.TD_KEY);
      return json({
        ok: true,
        source: 'twelvedata',
        served: Math.floor(Date.now() / 1000),
        quotes,
      });
    } catch (e) {
      // Never fabricate a quote on failure. The app is built to say
      // "not enough fresh data" rather than compute a verdict from nothing.
      return json({ ok: false, error: String(e.message || e) }, 502);
    }
  },
};
