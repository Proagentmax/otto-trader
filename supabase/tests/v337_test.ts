// v3.37 (16 Oct 2026): the "did you chase?" check, the coach's weekly trade log, and the log_practice_trade tool.
// Nothing touches the network: Supabase and Robinhood are faked; the Deno.serve handler is captured for the fn=coach_log route.
// Run: deno test -A --no-check supabase/tests/v337_test.ts
let ROWS: Record<string, any[]> = {};
const writes: { m: string; path: string; body: any }[] = [];
const tableOf = (path: string) => path.split("?")[0];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase(), t = tableOf(path);
    if (m !== "GET") { writes.push({ m, path, body: init.body ? JSON.parse(init.body) : null }); if (t === "otto_settings") { ROWS.otto_settings = [JSON.parse(init.body)]; } return Promise.resolve(null); }
    let rows = ROWS[t] || [];
    const st = /status=eq\.(\w+)/.exec(path)?.[1]; if (st) rows = rows.filter((r) => r.status === st);
    const kind = /kind=eq\.(\w+)/.exec(path)?.[1]; if (kind) rows = rows.filter((r) => r.kind === kind);
    const key = /key=eq\.(\w+)/.exec(path)?.[1]; if (key) rows = rows.filter((r) => r.key === key);
    return Promise.resolve(rows.map((r) => ({ ...r })));
  },
  call: (_s: string, tool: string, args: any) => {
    const j = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
    if (tool === "get_equity_historicals") return Promise.resolve(j({ data: { results: args.symbols.map((s: string) => ({ symbol: s, bars: [
      { begins_at: "2026-10-15T13:30:00Z", open_price: "250.0", high_price: "250.6", low_price: "249.6", close_price: "250.2" },
      { begins_at: "2026-10-15T13:35:00Z", open_price: "250.2", high_price: "250.9", low_price: "250.0", close_price: "250.7" },
      { begins_at: "2026-10-15T13:40:00Z", open_price: "250.7", high_price: "251.4", low_price: "250.5", close_price: "251.2" }] })) } }));
    if (tool === "get_accounts") return Promise.resolve(j({ data: { accounts: [] } }));
    return Promise.reject(new Error("unexpected tool: " + tool));
  },
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: any) => b64({ alg: "none" }) + "." + b64(claims) + ".x";
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("ASSERT: " + msg); };
const eq = (a: any, b: any, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERT ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };

Deno.test("v3.37 chaseChecks: the AMZN 15 Oct case — entry 252.13 on a 250.45 level is chasing; at the level is fine; early is neutral; VWAP with/against", () => {
  const bars = [{ t: 0, o: 250, h: 250.6, l: 249.6, c: 250.2 }, { t: 300e3, o: 250.2, h: 250.9, l: 250.0, c: 250.7 }, { t: 600e3, o: 250.7, h: 251.4, l: 250.5, c: 251.2 }];
  const now = 2_000_000;
  const chase = M.chaseChecks({ direction: "up", entry_underlying: 252.13, level: 250.45 }, bars, now);
  eq(chase.length, 2, "level row + VWAP row");
  assert(chase[0].ok === false && /chasing/.test(chase[0].text) && /retest of 250.45/.test(chase[0].text), "flags the chase and names the retest: " + chase[0].text);
  assert(chase[1].ok === true && /above it/.test(chase[1].text) && /rising/.test(chase[1].text), "price above a rising VWAP agrees with a long: " + chase[1].text);
  const at = M.chaseChecks({ direction: "up", entry_underlying: 250.6, level: 250.45 }, null, now);
  assert(at.length === 1 && at[0].ok === true && /not chasing/.test(at[0].text), "$0.15 past the level is at the level");
  const early = M.chaseChecks({ direction: "up", entry_underlying: 250.1, level: 250.45 }, null, now);
  assert(early[0].ok === null && /early/.test(early[0].text), "below the level = not confirmed yet");
  const sh = M.chaseChecks({ direction: "down", entry_underlying: 249.0, level: 250.45 }, bars, now);
  assert(sh[0].ok === false && /chasing/.test(sh[0].text), "a put well below the level is chasing too");
  assert(sh[1].ok === true && /with a short/.test(sh[1].text) && /rising/.test(sh[1].text), "price below VWAP agrees with a short; the rising closes are shown so Josh sees the tension: " + sh[1].text);
  eq(M.chaseChecks({ direction: "up", entry_underlying: 250, level: 0 }, bars.slice(0, 1), now), [], "no level and one bar: nothing to say");
  eq(M.chaseChecks({ entry_underlying: 250, level: 249 }, null, now), [], "no direction: nothing");
});
Deno.test("v3.37 coachLogText: the coach's format — per trade entry/exit/result, level, VWAP, overnight, why; totals; empty week", () => {
  const items = [
    { day: "2026-10-14", who: "Josh", source: "LIVE · Otto card", ticker: "GOOGL", contract: "GOOGL 347.5P 10/16", side: "long", entry: 1.1, exit: 1.42, pnl: 32, entry_time: "10:20 AM", exit_time: "10:50 AM", level: 351.23, vwap: 350.1, why: "break of the gap bottom", overnight: "no (day trade)" },
    { day: "2026-10-15", who: "Josh", source: "OWN · TradingView paper", ticker: "AMZN", contract: "AMZN 255C 10/21", side: "long", entry: 2.56, exit: 2.3, pnl: -26, entry_time: "10:12 AM", exit_time: "10:40 AM", level: 250.45, vwap: null, why: "gap fill to 252.95", overnight: "no (as logged)" },
  ];
  const t = M.coachLogText("2026-10-13", "2026-10-17", items, { ranges: "SPY 768 (10-15), SPY 764 (10-15)" });
  assert(/TRADE LOG — week of 2026-10-13 to 2026-10-17/.test(t), "header");
  assert(/2 trades · 1 wins \/ 1 losses · net \+\$6/.test(t), "totals: " + t.split("\n")[1]);
  assert(/Levels watched this week: SPY 768/.test(t), "ranges line");
  assert(/GOOGL GOOGL 347\.5P 10\/16 LONG \(LIVE · Otto card\)/.test(t), "trade line");
  assert(/Entry: 10:20 AM @ 1\.1    Exit: 10:50 AM @ 1\.42    Result: \+\$32/.test(t), "entry/exit/result line");
  assert(/Level: 351\.23    VWAP at entry: 350\.1    Overnight: no \(day trade\)/.test(t), "level/vwap/overnight line");
  assert(/VWAP at entry: n\/a/.test(t), "no VWAP shows n/a, never a made-up number");
  assert(/Why: gap fill to 252\.95/.test(t), "why in Josh's words");
  const empty = M.coachLogText("2026-10-13", "2026-10-17", [], {});
  assert(/No trades this week\./.test(empty) && /0 trades · 0 wins \/ 0 losses · net \+\$0/.test(empty), "empty week");
});
Deno.test("v3.37 fn=coach_log route: locked to the Desk login; builds from live fills + approved practice cards + logged trades; cached until &build=1", async () => {
  assert(HANDLER, "handler captured");
  const req = (claims: any, q = "") => HANDLER(new Request("https://x.supabase.co/functions/v1/otto-proxy?fn=coach_log" + q, { headers: { authorization: "Bearer " + jwt(claims) } }));
  const r1 = await req({ role: "authenticated", sub: "u1", email: "stranger@example.com" });
  eq(r1.status, 403, "a stranger is locked out");
  const desk = { role: "authenticated", sub: "u2", email: "ottotrader@vinecreativestudio.com" };
  ROWS = {
    otto_trades: [{ id: "a|b|c", symbol: "GOOGL", contract: "GOOGL 347.5P 10/16", side: "long", entry: 1.1, exit: 1.42, pnl: 32, opened_at: "2026-10-14T14:20:00Z", closed_at: "2026-10-14T14:50:00Z", status: "closed", agent: "agentic", action_id: null, reason: "break of the gap bottom" }],
    otto_actions: [{ id: "41414141-4141-4141-8141-414141414141", title: "PRACTICE — AMZN 255C 10/21", status: "paper_taken", created_at: "2026-10-15T14:05:00Z", decided_at: "2026-10-15T14:12:00Z", decided_by: "Josh",
      plan: { tv_symbol: "NASDAQ:AMZN", direction: "up", level: 250.45, stop: 249.9, tp1: 252.95, paper_fill: { ask: 2.56, at: "2026-10-15T14:12:00Z" } }, outcome: { state: "win", r: 1.2, pnl_est: 40 }, summary: "AMZN gap fill to 252.95\nmore" }],
    otto_activity: [{ day: "2026-10-15", at: "2026-10-15T15:30:00Z", kind: "trade", who: "Josh", data: { practice_log: { ticker: "NVDA", contract: "NVDA 220C 10/16", side: "long", entry: 2.1, exit: 2.4, pnl: 30, entry_time: "11:00 AM", exit_time: "11:25 AM", level: 218.1, why: "hammer into VWAP", platform: "TradingView paper" } } }],
    otto_watch: [{ ticker: "SPY", level: 768, day: "2026-10-15" }],
    otto_settings: [],
  };
  const r2 = await req(desk, "&build=1");
  eq(r2.status, 200, "desk user ok");
  const j = await r2.json();
  eq(j.n, 3, "three trades from three sources");
  assert(/LIVE · Otto card/.test(j.text) && /PRACTICE · approved on Otto/.test(j.text) && /OWN · TradingView paper/.test(j.text), "all three sources named: " + j.text);
  assert(/VWAP at entry: 250\.(5|6)\d*/.test(j.text) || /VWAP at entry: 250\.\d+/.test(j.text), "VWAP computed from the 5-minute bars for the live and practice trades: " + (j.text.match(/VWAP at entry: [^ ]+/g) || []).join(","));
  assert(/Level: 250\.45/.test(j.text) && /Level: 218\.1/.test(j.text), "levels carried");
  assert(/scored win \(1\.2R\)/.test(j.text), "practice outcome noted");
  assert(/Levels watched this week: SPY 768/.test(j.text), "watcher marks");
  assert(writes.some((w) => w.path.startsWith("otto_settings") && w.body?.key === "coach_log"), "saved to otto_settings.coach_log");
  const r3 = await (await req(desk)).json();
  eq(r3.built_at, j.built_at, "without build=1 the saved copy is returned");
});
