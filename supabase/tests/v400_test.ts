// v4.0 (23 Oct 2026): MARKET READ — the coach's CNBC pass as one `market_read` route. Mechanical verdict (DEFENSIVE /
// RISK-ON / NEUTRAL soft·firm), dislocation scan (oil/XOM, oil/CVX, gold/NEM, copper/FCX), seven tiles, six lines, "—" for
// anything missing, cached 10 minutes. Run: deno test -A --no-check supabase/tests/v400_test.ts
const RealDate = Date; let NOW = RealDate.parse("2026-10-23T13:42:00Z");   // Fri 23 Oct 9:42 AM ET, market open
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");

let PX: Record<string, number | null> = {};
let YCALLS = 0;
(globalThis as any).__OTTO_TEST__ = {
  db: async (path: string) => (path.startsWith("otto_sentiment") ? [] : []),
  yahoo: async (sym: string) => { YCALLS++; const p = PX[sym]; return { sym, price: p == null ? null : 100 + p, pct: p, hi: p == null ? null : 101, lo: p == null ? null : 99, age: 60, spark: p == null ? [] : [100, 100.2, 100 + p], days: p == null ? [] : [{ d: "Mon", pct: 0.4 }, { d: "Tue", pct: -0.8 }] }; },
};
(globalThis as any).fetch = async (url: string) => { throw new Error("no network in tests: " + String(url).slice(0, 60)); };
const M: any = await import("../otto-proxy.ts");
const { assertEquals, assert } = await import("https://deno.land/std@0.224.0/assert/mod.ts");
const Q = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, p]) => [k, { sym: k, price: p == null ? null : 100, pct: p, hi: null, lo: null, age: 0, spark: [], days: [] }]));

Deno.test("verdict: DEFENSIVE = Nasdaq ≤ −1% and TLT ≥ +0.2%", () => {
  const v = M.mrVerdict(Q({ qqq: -1.4, tlt: 0.3, spy: -0.9, dia: -0.2, hg: -0.5, btc: -1 }));
  assertEquals(v.key, "def"); assert(/Puts, not calls/.test(v.why));
});
Deno.test("verdict: RISK-ON needs Nasdaq ≥ +0.5%, TLT ≤ −0.2% AND copper/BTC green", () => {
  assertEquals(M.mrVerdict(Q({ qqq: 0.8, tlt: -0.3, hg: 0.4, btc: 1.2, spy: 0.5, dia: 0.2 })).key, "on");
  assertEquals(M.mrVerdict(Q({ qqq: 0.8, tlt: -0.3, hg: -0.4, btc: 1.2, spy: 0.5, dia: 0.2 })).key, "neu_firm", "copper red blocks risk-on");
  assertEquals(M.mrVerdict(Q({ qqq: 0.8, tlt: -0.3, hg: null, btc: 1.2, spy: 0.5, dia: 0.2 })).key, "on", "a missing leg is skipped, not guessed");
});
Deno.test("verdict: NEUTRAL soft when the index average is red, firm otherwise; No read without QQQ or TLT", () => {
  assertEquals(M.mrVerdict(Q({ qqq: -0.1, tlt: -0.2, spy: -0.3, dia: 0.1 })).key, "neu_soft");
  assertEquals(M.mrVerdict(Q({ qqq: 0.2, tlt: 0.1, spy: 0.3, dia: 0.1 })).key, "neu_firm");
  assertEquals(M.mrVerdict(Q({ qqq: null, tlt: 0.1 })).key, "none");
  assertEquals(M.mrVerdict(Q({ qqq: -2, tlt: null })).key, "none", "bonds missing = no verdict even on a −2% Nasdaq");
});
Deno.test("dislocations: both ≥0.3% and opposite signs, four pairs only", () => {
  const d = M.mrDislocations(Q({ cl: 1.4, xom: -0.6, cvx: 0.5, gc: -2.0, nem: 0.4, hg: -0.2, fcx: 1.0 }));
  assertEquals(d.map((x: any) => x.label), ["Oil vs XOM", "Gold vs NEM"]);   // CVX agrees; copper too small
  assert(/correlation that should be there isn't/.test(d[0].text) && /not a card/.test(d[0].text));
  assertEquals(M.mrDislocations(Q({ cl: 1.4, xom: 0.2 })).length, 0, "0.2% is under the 0.3% bar");
});
Deno.test("tiles: seven in the coach's order, leader/laggard, oil agree/disagree, '—' when missing", () => {
  const t = M.mrTiles(Q({ tlt: 0.3, spy: -0.9, qqq: -2.1, dia: -0.2, iwm: -0.1, cl: 1.4, xom: -0.6, dxy: 0.2, jpy: -0.4, gc: -2, hg: -1, btc: -3 }), [{ date: new Date(NOW + 3600e3).toISOString(), title: "Michigan", importance: 0 }], "open");
  assertEquals(t.map((x: any) => x.k), ["bonds", "indexes", "oil", "dollar", "gold", "crypto", "calendar"]);
  assertEquals(t[0].sub, "bought"); assertEquals(t[1].leader, "Russell"); assertEquals(t[1].laggard, "Nasdaq"); assertEquals(t[2].sub, "disagree");
  assertEquals(t[6].next.title, "Michigan"); assert(/22 Oct call/.test(t[0].ref));
  const e = M.mrTiles(Q({}), [], "pre");
  assertEquals(e[0].sub, "—"); assertEquals(e[0].price, null); assertEquals(e[2].sub, "—");
});
Deno.test("lines: six instrument lines + the verdict, numbers formatted, nothing invented", () => {
  const Qs = Q({ tlt: -0.21, spy: -1.18, qqq: -0.1, dia: 0.4, cl: 1.4, xom: 0.59, dxy: 0.2, jpy: 0.1, gc: -0.03, hg: null, btc: 0.21 });
  const L = M.mrLines(M.mrTiles(Qs, [], "open"), M.mrVerdict(Qs));
  assertEquals(L.length, 7); assert(/^Bonds: TLT -0\.21%/.test(L[0])); assert(/copper —/.test(L[4])); assert(/^Verdict: Neutral · soft/.test(L[6]));
});
Deno.test("route: market_read builds from the stubbed quotes, 15 symbols, cached 10 minutes, force refreshes", async () => {
  PX = { TLT: -0.21, QQQ: -0.1, SPY: -1.18, DIA: 0.4, IWM: 0.2, "CL=F": 1.4, XOM: 0.59, CVX: 0.3, "DX-Y.NYB": 0.2, "JPY=X": 0.1, "GC=F": -0.03, NEM: 0.1, "HG=F": null, FCX: 0.5, "BTC-USD": 0.21 };
  YCALLS = 0;
  const r = await M.marketReadForTest();
  assertEquals(YCALLS, 15); assertEquals(r.ok, true); assertEquals(r.session, "open"); assertEquals(r.verdict.key, "neu_soft"); assertEquals(r.tiles.length, 7); assertEquals(r.fresh, 14);
  assertEquals(r.tiles[4].copper.pct, null, "copper missing shows null, never a guess");
  const r2 = await M.marketReadForTest(); assertEquals(YCALLS, 15, "second call inside 10 min is served from cache");
  NOW += 11 * 60e3; await M.marketReadForTest(); assertEquals(YCALLS, 30, "refreshes after 10 minutes");
  PX.QQQ = -1.5; PX.TLT = 0.4; const r3 = await M.marketReadForTest(true); assertEquals(r3.verdict.key, "def");
});
