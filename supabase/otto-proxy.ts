// Otto Trader data proxy — Supabase Edge Function (Deno).
//
// Same job as a Cloudflare Worker, on the account Ifoma already has: hold the
// market-data key server-side, add the CORS headers the browser needs, and
// normalise the provider's response so the app never learns the provider's
// shape. Swapping data sources is an edit to fetchQuotes() and nothing else.
//
// DEPLOY (all in the browser, no CLI)
//   1. Supabase Dashboard -> Edge Functions -> Deploy a new function -> Via Editor
//   2. Name it  otto-proxy  , paste this file, Deploy
//   3. Edge Functions -> Secrets -> add   TD_KEY = your twelvedata.com key
//   4. URL is  https://<project>.supabase.co/functions/v1/otto-proxy
//      Paste that into Otto Trader -> Settings -> Data proxy,
//      and your project's anon key into Proxy key.
//
// The anon key is public by design and safe in a browser. TD_KEY is not, and
// never leaves Supabase.
//
// Free tier: 500,000 invocations a month. One morning run is one invocation.

const SYMBOLS = [
  // Twelve Data's free plan covers real-time US ETFs and real-time forex;
  // indices, commodities and futures are paid. So the yield, dollar and crude
  // legs ride on ETF proxies rather than ^TNX / DXY / CL=F.
  { key: "yield",  sym: "IEF",     kind: "etf", invert: true,
    label: "10Y yield", via: "IEF (7-10yr Treasuries) — moves OPPOSITE to yield" },
  { key: "jpy",    sym: "USD/JPY", kind: "fx",  label: "USD/JPY", via: "spot, 24h" },
  { key: "dollar", sym: "UUP",     kind: "etf", label: "Dollar",  via: "UUP (dollar index ETF)" },
  { key: "crude",  sym: "USO",     kind: "etf", label: "Crude",   via: "USO (oil ETF)" },
  { key: "es",     sym: "SPY",     kind: "etf", label: "S&P",     via: "SPY (proxy for ES)" },
  { key: "nq",     sym: "QQQ",     kind: "etf", label: "Nasdaq",  via: "QQQ (proxy for NQ)" },
  { key: "ym",     sym: "DIA",     kind: "etf", label: "Dow",     via: "DIA (proxy for YM)" },
];

// ---- the only provider-specific code in the file ----
async function fetchQuotes(key: string) {
  const call = async (list: string[]) => {
    const url = "https://api.twelvedata.com/quote?symbol=" +
      encodeURIComponent(list.join(",")) + "&apikey=" + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) throw new Error("provider HTTP " + r.status);
    const j = await r.json();
    if (j.code && j.message) throw new Error(j.message);      // rate limit, bad key
    return list.length === 1 ? { [list[0]]: j } : j;          // one symbol returns a bare object
  };

  const etfs = SYMBOLS.filter((s) => s.kind === "etf").map((s) => s.sym);
  const fx   = SYMBOLS.filter((s) => s.kind === "fx").map((s) => s.sym);
  const [a, b] = await Promise.all([call(etfs), fx.length ? call(fx) : {}]);
  const raw: Record<string, any> = { ...a, ...b };

  const out: Record<string, unknown> = {};
  for (const s of SYMBOLS) {
    const q = raw[s.sym];
    if (!q || q.status === "error" || q.close == null) { out[s.key] = null; continue; }
    const price = parseFloat(q.close);
    const prev  = parseFloat(q.previous_close);
    let pct = (isFinite(price) && isFinite(prev) && prev)
      ? ((price - prev) / prev) * 100
      : parseFloat(q.percent_change);
    if (!isFinite(pct)) pct = NaN;
    // IEF rises when yields fall, so flip it — yield.pct reads as the yield's direction
    if (s.invert && isFinite(pct)) pct = -pct;
    out[s.key] = {
      label: s.label, via: s.via, symbol: s.sym,
      price: isFinite(price) ? price : null,
      prev:  isFinite(prev)  ? prev  : null,
      pct:   isFinite(pct)   ? pct   : null,
      at: q.timestamp ? Number(q.timestamp) : null,   // the app decides what is stale
      exchangeOpen: q.is_market_open === true || q.is_market_open === "true",
    };
  }
  return out;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "authorization,apikey,content-type",
  "access-control-max-age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
    });

  const key = Deno.env.get("TD_KEY");
  if (!key) return json({ ok: false, error: "TD_KEY secret is not set on this function" }, 500);

  try {
    return json({
      ok: true,
      source: "twelvedata",
      served: Math.floor(Date.now() / 1000),
      quotes: await fetchQuotes(key),
    });
  } catch (e) {
    // Never fabricate a quote on failure. The app says "not enough fresh data"
    // rather than computing a verdict from nothing.
    return json({ ok: false, error: String((e as Error).message ?? e) }, 502);
  }
});
