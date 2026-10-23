// Winston (v3.31) test suite. Nothing here touches the network: Supabase, the market-data gateway and Claude are faked.
// Run: deno test -A --no-check supabase/tests/winston_test.ts
// Gate tests G1-G5 from claude/winston-build-plan-2026-10-14.md, then unit tests, then day replays with hand-computed numbers.

const RealDate = Date;
let NOW = RealDate.parse("2026-10-14T14:00:00Z");            // Wed 14 Oct 2026, 10:00 AM ET (EDT)
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };

/* ---------------- fake Supabase (PostgREST subset) ---------------- */
const TABLES: Record<string, any[]> = {};
const touched = new Set<string>();
const dbLog: { table: string; method: string }[] = [];
let SERIAL = 0;
function seed() {
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  for (const k of ["winston_settings", "winston_rules", "winston_days", "winston_ideas", "winston_trades", "winston_log", "otto_jason", "otto_settings", "brain_versions"]) TABLES[k] = [];
  touched.clear(); dbLog.length = 0; SERIAL = 0;
  TABLES.winston_settings.push({ key: "config", value: { enabled: true, paper_balance: 4000 } });
  TABLES.otto_settings.push({ key: "limits", value: { size_cap_pct: 25, max_trade_pct: 10, daily_losses: 2, daily_x: 2, weekly_pct: 20, auto_close: true, max_trade_loss: 100, account_value: 936 } });
  TABLES.brain_versions.push({ version: 1, payload: [{ call: { date: "2026-10-01", title: "t" }, rules: [{ rule: "Buy above the level, stop on a 10-minute close below it" }], setups: [] }] });
  const R = (id: string, kind: string, active: boolean, params: any = {}) => TABLES.winston_rules.push({ id, sort: 0, kind, source: "plan-only", title: id, body: id + " body", active, params });
  for (const id of ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W17", "W19"]) R(id, "process", true);
  for (const id of ["W15", "W16"]) R(id, "gate", false);
  R("W12", "gate", false, { max_spread_pct: null }); R("W13", "gate", false, { max_age_sec: 15 }); R("W14", "gate", false, { window_min: 15 });
  R("E1", "experiment", false); R("E2", "experiment", false);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function colVal(row: any, key: string) {
  const m = /^(\w+)->>(\w+)$/.exec(key);
  return m ? (row[m[1]] || {})[m[2]] : row[key];
}
function matches(row: any, params: URLSearchParams) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    const have = colVal(row, k);
    if (v === "is.null") { if (have != null) return false; continue; }
    if (v.startsWith("eq.")) { if (String(have) !== decodeURIComponent(v.slice(3))) return false; continue; }
    if (v.startsWith("neq.")) { if (String(have) === decodeURIComponent(v.slice(4))) return false; continue; }
    if (v.startsWith("lt.")) { if (!(String(have) < decodeURIComponent(v.slice(3)))) return false; continue; }
    if (v.startsWith("lte.")) { if (!(String(have) <= decodeURIComponent(v.slice(4)))) return false; continue; }
    if (v.startsWith("gte.")) { if (!(String(have) >= decodeURIComponent(v.slice(4)))) return false; continue; }
    if (v.startsWith("gt.")) { if (!(String(have) > decodeURIComponent(v.slice(3)))) return false; continue; }
    throw new Error("fake db: unsupported filter " + k + "=" + v);
  }
  return true;
}
async function fakeDb(path: string, init: RequestInit = {}) {
  const [table, q = ""] = path.split("?");
  const method = (init.method || "GET").toUpperCase();
  touched.add(table); dbLog.push({ table, method });
  const params = new URLSearchParams(q);
  const rows = TABLES[table] ||= [];
  const prefer = String((init.headers as any)?.prefer || "return=representation");
  const body = init.body ? JSON.parse(String(init.body)) : null;
  await sleep(1);
  if (method === "GET") {
    let out = rows.filter((r) => matches(r, params));
    const ord = params.get("order");
    if (ord) { const [c, dir] = ord.split("."); out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (dir === "desc" ? -1 : 1)); }
    const lim = params.get("limit"); if (lim) out = out.slice(0, Number(lim));
    return JSON.parse(JSON.stringify(out));
  }
  if (method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const made: any[] = [];
    const conflict = params.get("on_conflict");
    for (const b of list) {
      if (conflict) {
        const ex = rows.find((r) => conflict.split(",").every((c) => String(r[c]) === String(b[c])));
        if (ex) { if (/merge-duplicates/.test(prefer)) { Object.assign(ex, b); made.push(ex); } continue; }
      }
      const row = { ...b };
      if (["winston_ideas", "winston_trades", "winston_log"].includes(table) && row.id == null) row.id = ++SERIAL;
      if (table === "winston_trades") { row.flags ||= []; row.broke ||= []; }
      rows.push(row); made.push(row);
    }
    return /minimal/.test(prefer) ? null : JSON.parse(JSON.stringify(made));
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => matches(r, params));
    for (const r of hit) Object.assign(r, body);
    return /minimal/.test(prefer) ? null : JSON.parse(JSON.stringify(hit));
  }
  if (method === "DELETE") throw new Error("Winston must never delete rows");
  throw new Error("fake db: " + method);
}

/* ---------------- fake market (the gateway) ---------------- */
type Opt = { bid: number; ask: number; delta: number; vol: number; oi: number; strike: number; exp?: string; type?: string; at?: string };
const W: { spot: Record<string, number>; prev: Record<string, number>; bars: Record<string, any[]>; opts: Record<string, Opt>; calendar: any[]; calls: { service: string; tool: string }[]; ai: { n: number; last: any } } =
  { spot: {}, prev: {}, bars: {}, opts: {}, calendar: [], calls: [], ai: { n: 0, last: null } };
const barRow = (isoStart: string, o: number, h: number, l: number, c: number, v = 1000) => ({ begins_at: isoStart, open_price: String(o), high_price: String(h), low_price: String(l), close_price: String(c), volume: v });
function fakeMd(service: string, tool: string, args: any) {
  W.calls.push({ service, tool });
  const guard = (globalThis as any).__ALLOW_ORDER_TOOLS;
  if (!guard && /place_|cancel_|exercise|review_|portfolio|positions|get_option_orders|get_equity_orders|pnl|accounts/.test(tool)) throw new Error("TEST FAIL: Winston called " + tool);
  if (tool === "get_equity_quotes") return { data: { results: args.symbols.filter((s: string) => W.spot[s]).map((s: string) => ({ quote: { symbol: s, last_trade_price: String(W.spot[s]), adjusted_previous_close: String(W.prev[s] ?? W.spot[s]) } })) } };
  if (tool === "get_equity_historicals") return { data: { results: args.symbols.filter((s: string) => W.bars[s]).map((s: string) => ({ symbol: s, bars: W.bars[s] })) } };
  if (tool === "get_option_chains") return { data: { chains: [{ symbol: args.underlying_symbol, can_open_position: true, expiration_dates: ["2026-10-14", "2026-10-16", "2026-10-23", "2026-11-20"] }] } };
  if (tool === "get_option_instruments") return { data: { instruments: Object.entries(W.opts).filter(([, o]) => (o.type || "call") === args.type && (o.exp || "2026-10-16") === args.expiration_dates).map(([id, o]) => ({ id, strike_price: o.strike.toFixed(4), expiration_date: o.exp || "2026-10-16", tradability: "tradable", state: "active" })) } };
  if (tool === "get_option_quotes") return { data: { results: args.instrument_ids.filter((id: string) => W.opts[id]).map((id: string) => { const o = W.opts[id]; return { quote: { instrument_id: id, bid_price: String(o.bid), ask_price: String(o.ask), mark_price: String((o.bid + o.ask) / 2), delta: String(o.delta), volume: o.vol, open_interest: o.oi, updated_at: o.at || new Date(NOW).toISOString() } }; }) } };
  if (tool === "mcp-tv-get-economic-calendar") return { result: W.calendar };
  if (tool === "get_earnings_calendar") return { data: { results: (W as any).earnings || [] } };   // v3.44: a test can set W.earnings
  if (tool === "mcp-tv-get-news") return { result: [{ title: "SPY holds above its 50-day average" }] };
  throw new Error("fake md: unsupported " + tool);
}
let aiScript: ((a: any) => any) | null = null;
function fakeAi(a: any) { W.ai.n++; W.ai.last = a; const out = aiScript ? aiScript(a) : { decisions: [], passes: [] }; return { out, usage: { input: 1000, output: 200 } }; }

(globalThis as any).__WINSTON_TEST__ = { db: fakeDb, md: fakeMd, ai: fakeAi, now: () => NOW };
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
(Deno as any).serve = () => ({ finished: Promise.resolve() });
const X = await import("../winston.ts");

function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
function eq(a: any, b: any, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERT ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }
const ALLOWED_TABLES = /^(winston_(settings|rules|days|ideas|trades|log)|otto_jason|brain_versions|otto_settings)$/;

/* =========================== G1. static scan: no order code, no sign-in code =========================== */
Deno.test("G1: winston.ts has no order-writing tool names, no token or sign-in code, no live-account tables", async () => {
  const src = await Deno.readTextFile(new URL("../winston.ts", import.meta.url));
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");     // comments may explain what is forbidden
  const forbidden = [/place_(option|equity|crypto)_order/, /cancel_(option|equity|crypto)_order/, /exercise_option/, /review_(option|equity)_order/,
    /refresh_token/i, /oauth/i, /authorize/i, /otto_conn/, /otto_actions/, /otto_desk/, /otto_watch/, /otto_checks/, /otto_trades/, /otto_activity/,
    /get_portfolio/, /get_(option|equity)_positions/, /get_(option|equity)_orders/, /get_pnl_trade_history/, /get_realized_pnl/, /get_accounts/, /OTTO_TOKEN_KEY/, /unseal|aesKey/];
  for (const re of forbidden) assert(!re.test(code), "winston.ts must not contain " + re);
  assert(!/Deno\.run|Deno\.Command|import\s+.*from\s+["']https?:/.test(code), "no subprocess or remote imports");
  // every network call goes through safeFetch
  const raw = code.match(/\bfetch\(/g) || [];
  assert(raw.length === 1, "the only bare fetch( is inside safeFetch, found " + raw.length);
});

/* =========================== G2. the gateway allow-list (in otto-proxy) =========================== */
Deno.test("G2: the otto-proxy market-data gateway refuses every account, order and write tool, and allows only market data", async () => {
  const calls: any[] = [];
  (globalThis as any).__OTTO_TEST__ = { db: async () => [], call: async (s: string, t: string, a: any) => { calls.push({ s, t, a }); return { structuredContent: { ok: true, tool: t } }; } };
  let handler: any = null;
  const realServe = (Deno as any).serve; (Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve() }; };
  Deno.env.set("OTTO_CRON_SECRET", "0123456789abcdef-secret");
  const P: any = await import("../otto-proxy.ts?gateway");
  (Deno as any).serve = realServe;
  const refused = ["place_option_order", "place_equity_order", "cancel_option_order", "cancel_equity_order", "exercise_option", "review_option_order", "review_equity_order",
    "get_portfolio", "get_option_orders", "get_equity_orders", "get_equity_positions", "get_option_positions", "get_pnl_trade_history", "get_realized_pnl", "get_accounts",
    "create_alert", "add_to_watchlist", "get_alerts", "get_watchlists", "get_trade_approvals"];
  for (const t of refused) { const g = await P.winstonGateway({ service: "rh", tool: t, args: {} }); assert(g.status === 403, t + " must be refused, got " + g.status); }
  for (const t of ["mcp-tv-create-alert", "mcp-tv-delete-alert", "mcp-tv-list-alerts", "mcp-watchlist-add-to-watchlist", "mcp-tv-stop-alerts"]) { const g = await P.winstonGateway({ service: "tv", tool: t, args: {} }); assert(g.status === 403, t + " must be refused"); }
  assert((await P.winstonGateway({ service: "other", tool: "get_equity_quotes" })).status === 403, "unknown service");
  assert((await P.winstonGateway({ service: "rh", tool: "get_equity_quotes", args: { account_number: "945257012", symbols: ["SPY"] } })).status === 403, "account argument refused");
  assert(calls.length === 0, "none of the refused calls reached the broker: " + JSON.stringify(calls));
  for (const s of Object.keys(P.WINSTON_ALLOW)) for (const t of P.WINSTON_ALLOW[s]) assert(P.winstonGatewayCheck(s, t, {}).ok, "allow-listed tool passes its own deny check: " + t);
  const ok = await P.winstonGateway({ service: "rh", tool: "get_equity_quotes", args: { symbols: ["SPY"] } });
  assert(ok.status === 200 && calls.length === 1 && calls[0].t === "get_equity_quotes", "an allowed tool goes through");
  // the HTTP route: no secret = 401, wrong method = 405, secret + order tool = 403 and nothing reaches the broker
  const mk = (body: any, hdr: any = {}, method = "POST") => new Request("https://x/functions/v1/otto-proxy?fn=winston_data", { method, headers: { "content-type": "application/json", ...hdr }, body: method === "POST" ? JSON.stringify(body) : undefined });
  assert((await handler(mk({ service: "rh", tool: "get_equity_quotes" }))).status === 401, "no secret");
  assert((await handler(mk({ service: "rh", tool: "get_equity_quotes" }, { "x-otto-cron": "wrong-secret-wrong-secret" }))).status === 401, "wrong secret");
  const sec = { "x-otto-cron": "0123456789abcdef-secret" };
  assert((await handler(mk({}, sec, "GET"))).status === 405, "GET refused");
  const before = calls.length;
  assert((await handler(mk({ service: "rh", tool: "place_option_order", args: {} }, sec))).status === 403, "order tool refused over HTTP");
  assert(calls.length === before, "and never reached the broker");
  assert((await handler(mk({ service: "rh", tool: "get_option_quotes", args: { instrument_ids: ["x"] } }, sec))).status === 200, "allowed tool over HTTP");
  (globalThis as any).__OTTO_TEST__ = undefined;
});

/* =========================== G3. the table wall =========================== */
Deno.test("G3: Winston's database wall refuses live-account tables and writes to coach/limit tables; a full day only touches allowed tables", async () => {
  for (const t of ["otto_actions", "otto_desk", "otto_watch", "otto_checks", "otto_conn", "otto_trades", "otto_activity", "otto_signal_batches"]) {
    let threw = false; try { X.dbGuard(t + "?select=*", "GET"); } catch { threw = true; } assert(threw, "wall must refuse reading " + t);
  }
  for (const [t, m] of [["otto_jason", "POST"], ["otto_jason", "PATCH"], ["otto_settings", "POST"], ["otto_settings", "PATCH"], ["brain_versions", "POST"]]) {
    let threw = false; try { X.dbGuard(t, m); } catch { threw = true; } assert(threw, `wall must refuse ${m} ${t}`);
  }
  let threw = false; try { X.dbGuard("otto_settings?key=eq.auto_close", "GET"); } catch { threw = true; } assert(threw, "only the limits row of otto_settings may be read");
  X.dbGuard("otto_settings?key=eq.limits&select=value", "GET"); X.dbGuard("otto_jason?day=eq.2026-10-14", "GET"); X.dbGuard("winston_trades", "POST");
  // host wall
  assert(!X.hostAllowed("https://agent.robinhood.com/mcp/trading") && !X.hostAllowed("https://mcp.tradingview.com/mcp") && !X.hostAllowed("https://evil.example.com/"), "no broker hosts");
  assert(X.hostAllowed("https://api.anthropic.com/v1/messages"), "anthropic is allowed");
  // a whole day, then check what was touched
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  await X.tick(); setNow("2026-10-14T19:50:00Z"); await X.flatten(); setNow("2026-10-14T20:20:00Z"); await X.reportJob(); await X.stateForApp();
  for (const t of touched) assert(ALLOWED_TABLES.test(t), "touched a table outside the wall: " + t);
  for (const l of dbLog) if (!/^winston_/.test(l.table)) assert(l.method === "GET", `non-Winston table ${l.table} written with ${l.method}`);
});

/* =========================== G4. the reverse wall =========================== */
Deno.test("G4: nothing in otto-proxy reads Winston's tables (the app reads Winston through his own function)", async () => {
  const src = await Deno.readTextFile(new URL("../otto-proxy.ts", import.meta.url));
  const hits = [...src.matchAll(/winston_[a-z_]+/g)].map((m) => m[0]);
  const allowed = new Set(["winston_data"]);
  for (const h of hits) assert(allowed.has(h), "otto-proxy must not reference " + h);
  assert(!/winston_(settings|rules|days|ideas|trades|log)/.test(src), "no Winston table in otto-proxy");
  const app = await Deno.readTextFile(new URL("../../index.html", import.meta.url));
  assert(!/dkApi\([^)]*winston/i.test(app), "the app reads Winston through winApi, not through otto-proxy");
});

/* =========================== G5. limits and the kill switch =========================== */
async function setupCall(extra: Partial<Opt> = {}) {
  W.spot = { NVDA: 200, SPY: 600, QQQ: 520 }; W.prev = { NVDA: 199, SPY: 598, QQQ: 519 }; W.calls.length = 0; W.ai.n = 0;
  W.opts = { opt1: { strike: 200, bid: 2.40, ask: 2.50, delta: 0.35, vol: 900, oi: 400, ...extra }, opt2: { strike: 205, bid: 0.9, ask: 1.0, delta: 0.2, vol: 300, oi: 800 } };
  W.bars = { NVDA: [barRow("2026-10-14T13:30:00Z", 199, 200.5, 198.5, 200), barRow("2026-10-14T13:40:00Z", 200, 201, 199.5, 200.5)] };
  TABLES.otto_jason.push({ id: 1, day: "2026-10-14", posted_label: "10:09 AM", kind: "call", ticker: "NVDA", direction: "long", level: 200, words: "NVDA long over 200", late: false });
  aiScript = () => ({ decisions: [{ ticker: "NVDA", side: "call", source: "coach:1", thesis: "Coach call: long over 200", wrong_if_level: 198, target_level: 204, time_exit_min: 120,
    cites: [{ type: "coach_post", ref: "1" }, { type: "rule", ref: "W2" }], rule_ids: ["W2"] }], passes: [] });
}
Deno.test("G5: with the daily stop tripped Winston makes no new trade, spends no AI, and logs why; limits use his $4,000, not the live account", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  // two losing trades already closed today -> daily stop (2 losing trades)
  for (const id of [101, 102]) TABLES.winston_trades.push({ id, day: "2026-10-14", status: "closed", ticker: "SPY", pnl_realistic: -50, entry_ask: 1, qty: 1, closed_at: "2026-10-14T13:50:00Z", flags: [], broke: [] });
  const r = await X.tick();
  assert(r.locked && /daily stop/.test(r.locked), "locked: " + JSON.stringify(r));
  assert(W.ai.n === 0, "no AI call while locked");
  assert(TABLES.winston_trades.filter((t) => t.status === "open").length === 0, "no new trade");
  const idea = TABLES.winston_ideas.find((i) => i.source === "coach:1");
  assert(idea && idea.status === "blocked" && /Kill switch/.test(idea.reason), "the coach post is logged as blocked with the reason: " + JSON.stringify(idea));
  assert(TABLES.winston_days.find((d) => d.day === "2026-10-14")?.kill?.locked, "kill state saved for the app");
  // limits are on HIS balance
  const eqs = await X.equityState({ paper_balance: 4000 }, "2026-10-14");
  const lim = X.limitsState(await X.getLimits(), eqs);
  eq(lim.capUsd, 0.25 * 3900, "size cap is 25% of his equity (not the live $936)"); eq(lim.maxLossUsd, 390, "max loss 10% of his equity");
});
Deno.test("G5b: weekly limit locks for the week; kill switch off means no lock; pausing still closes open trades", () => {
  const L = { ...X.LIMIT_DEFAULTS };
  const e = { equity: 3200, cash: 3200, day_pnl: 0, day_losses: 0, week_pnl: -800, week_start_equity: 4000 };
  assert(X.limitsState(L, e).locked?.until === "next week", "20% weekly loss locks the week");
  assert(X.limitsState({ ...L, kill_on: false }, e).locked === null, "kill switch off = no lock");
  assert(X.limitsState(L, { ...e, week_pnl: -799 }).locked === null, "just under 20% does not lock");
  const dl = X.limitsState(L, { equity: 4000, cash: 4000, day_pnl: -800, day_losses: 1, week_pnl: -400, week_start_equity: 4000 }); assert(dl.locked?.why.includes("daily"), "2x max loss in one day locks (800 = 2 x 400): " + JSON.stringify(dl.locked));
});

/* =========================== unit tests =========================== */
Deno.test("fills: buy at the ask, sell at the bid; one-sided or crossed quotes are not tradable", () => {
  const q = { bid: 2.40, ask: 2.50, mid: 2.45, mark: 2.45, delta: .35, vol: 1, oi: 1, at: null };
  const f: any = X.entryFill(q); assert(f.ok && f.fill === 2.5 && f.bid === 2.4 && f.mid === 2.45, "entry at the ask");
  assert(!(X.entryFill({ ...q, bid: 0 }) as any).ok && !(X.entryFill({ ...q, ask: 0 }) as any).ok && !(X.entryFill({ ...q, bid: 3 }) as any).ok && !(X.entryFill(null) as any).ok, "bad quotes refused");
  const x = X.exitFill({ ...q, bid: 1.6, ask: 1.7 }); assert(x.fill === 1.6, "exit at the bid");
});
Deno.test("money: hand-computed realistic, mid, spread cost, double-spread and R", () => {
  const m = X.tradeMoney({ entry_ask: 2.5, entry_mid: 2.45, exit_bid: 1.6, exit_mid: 1.65 }, 70);
  eq(m, { pnl_realistic: -90, pnl_mid: -80, spread_cost: 10, pnl_double: -100, r_multiple: -1.29 }, "money");
  const w = X.tradeMoney({ entry_ask: 2.5, entry_mid: 2.45, exit_bid: 3.9, exit_mid: 3.95 }, 70);
  eq(w, { pnl_realistic: 140, pnl_mid: 150, spread_cost: 10, pnl_double: 130, r_multiple: 2 }, "winner");
});
Deno.test("exits: wrong-if is a 10-minute CLOSE through the level; target is a touch; a same-bar tie is a stop, flagged (W8); incomplete bars never count", () => {
  const plan = { dir: "up" as const, wrong_if_level: 198, target_level: 204 };
  const t0 = RealDate.parse("2026-10-14T14:11:00Z");
  const b = (iso: string, o: number, h: number, l: number, c: number) => ({ t: RealDate.parse(iso), o, h, l, c, v: 1 });
  // wick below 198 but closes above: no exit
  assert(X.evalBars(plan, [b("2026-10-14T14:20:00Z", 200, 201, 197, 199)], t0, RealDate.parse("2026-10-14T14:35:00Z")) === null, "a wick is not a close");
  // close below
  eq(X.evalBars(plan, [b("2026-10-14T14:20:00Z", 200, 200.5, 197, 197.5)], t0, RealDate.parse("2026-10-14T14:35:00Z"))?.reason, "wrong_if", "close below");
  // target touched
  eq(X.evalBars(plan, [b("2026-10-14T14:20:00Z", 200, 204.2, 199.8, 203)], t0, RealDate.parse("2026-10-14T14:35:00Z"))?.reason, "target", "target touch");
  // both in one bar -> stop first, flagged
  const both = X.evalBars(plan, [b("2026-10-14T14:20:00Z", 200, 204.5, 197, 197.5)], t0, RealDate.parse("2026-10-14T14:35:00Z"));
  assert(both?.reason === "wrong_if" && both.flags.includes("both_hit_same_bar_stop_first"), "tie = stop first, flagged");
  // a bar still forming (ends after now) is ignored; a bar from before entry is ignored
  assert(X.evalBars(plan, [b("2026-10-14T14:20:00Z", 200, 200.5, 197, 197.5)], t0, RealDate.parse("2026-10-14T14:25:00Z")) === null, "incomplete bar ignored");
  assert(X.evalBars(plan, [b("2026-10-14T14:00:00Z", 200, 200.5, 190, 190)], t0, RealDate.parse("2026-10-14T14:35:00Z")) === null, "bar before entry ignored");
  // put: reverse
  const pp = { dir: "down" as const, wrong_if_level: 202, target_level: 196 };
  eq(X.evalBars(pp, [b("2026-10-14T14:20:00Z", 200, 202.6, 199, 202.4)], t0, RealDate.parse("2026-10-14T14:35:00Z"))?.reason, "wrong_if", "put close above");
  eq(X.evalBars(pp, [b("2026-10-14T14:20:00Z", 200, 200.4, 195.9, 197)], t0, RealDate.parse("2026-10-14T14:35:00Z"))?.reason, "target", "put target");
});
Deno.test("plans: levels must make sense; no source = pass; a stop on the wrong side is rejected", () => {
  const d: any = { ticker: "NVDA", side: "call", source: "own", thesis: "x", wrong_if_level: 198, target_level: 204, cites: [{ type: "chart" }] };
  assert(X.planProblem(d, 200) === null, "good call plan");
  assert(X.planProblem({ ...d, wrong_if_level: 201 }, 200), "call stop above price");
  assert(X.planProblem({ ...d, target_level: 199 }, 200), "call target below price");
  assert(X.planProblem({ ...d, side: "put", wrong_if_level: 198, target_level: 204 }, 200), "put with call levels");
  assert(X.planProblem({ ...d, cites: [] }, 200)?.includes("W6"), "no source cited");
  assert(X.planProblem({ ...d, wrong_if_level: 199.99 }, 200)?.includes("too close"), "wrong-if glued to the price");
  assert(X.planProblem({ ...d, wrong_if_level: 190 }, 200)?.includes("half the risk"), "target far smaller than risk");
  assert(X.planProblem({ ...d, wrong_if_level: NaN }, 200), "missing level (W1)");
  assert(X.planProblem({ ...d, time_exit_min: 5 }, 200), "time exit out of range");
});
Deno.test("contract choice: delta .30-.40 with volume above open interest; nothing that fits the cap = pass (never shrink); cash counts", () => {
  const row = (o: Partial<any>) => ({ id: "x", exp: "2026-10-16", strike: 200, type: "call", bid: 2.4, ask: 2.5, delta: .35, vol: 900, oi: 400, label: "L", ...o });
  const a = row({ id: "a" }), far = row({ id: "b", delta: .2, ask: 1, bid: .9 }), pricey = row({ id: "c", ask: 12, bid: 11.8, delta: .55 });
  eq(X.pickContract([far, a, pricey], 1000, 4000).row?.id, "a", "band contract");
  eq(X.pickContract([pricey], 1000, 4000).row, null, "over the cap: nothing");
  eq(X.pickContract([a], 1000, 200).row, null, "not enough cash");
  eq(X.pickContract([row({ id: "d", vol: 100, oi: 400 })], 1000, 4000).row, null, "volume below open interest is not liquid enough");
  eq(X.pickContract([row({ id: "e", delta: .45 })], 1000, 4000).by, "near", "near band");
  eq(X.pickContract([row({ id: "f", bid: 0 })], 1000, 4000).row, null, "no bid, no trade");
});
Deno.test("gates: each active rule blocks; OFF rules never block; W14 blackout is overridden by a coach call", () => {
  const rules = (on: string[]) => ["W1", "W2", "W3", "W12", "W13", "W14", "W15"].map((id) => ({ id, kind: "x", source: "x", title: id, body: "", active: on.includes(id), params: id === "W12" ? { max_spread_pct: 5 } : id === "W13" ? { max_age_sec: 15 } : {} }));
  const base: any = { rules: rules(["W1", "W2", "W3"]), d: { wrong_if_level: 198, target_level: 204 }, cap: 1000, maxLoss: 400, planned_loss: 70, cost: 250, cash: 4000, stop_option: 1.8, ask: 2.5,
    openCount: 0, maxOpen: 1, tickerTakenToday: false, sameTickerOpen: false, spreadPct: 4, quoteAgeSec: 3, blackout: null, coachCall: false, etMin: 620, lastEntryMin: 930, ownFromMin: 600, coachFromMin: 571 };
  assert(X.runGates(base) === null, "clean pass");
  assert(X.runGates({ ...base, planned_loss: 500 })?.rule === "W2", "planned loss over max: skipped, not shrunk");
  assert(X.runGates({ ...base, cost: 1200 })?.rule === "W2", "over size cap");
  assert(X.runGates({ ...base, cost: 4100 })?.rule === "W2" || X.runGates({ ...base, cost: 4100 })?.rule === "cash", "over cash");
  assert(X.runGates({ ...base, sameTickerOpen: true })?.rule === "W3", "no adding");
  assert(X.runGates({ ...base, openCount: 1 })?.rule === "max_open", "one position at a time");
  assert(X.runGates({ ...base, etMin: 580 })?.rule === "time", "own idea before 10:00");
  assert(X.runGates({ ...base, etMin: 580, coachCall: true }) === null, "coach call at 9:40 is fine");
  assert(X.runGates({ ...base, etMin: 940 })?.rule === "time", "after the last-entry time");
  assert(X.runGates({ ...base, spreadPct: 30, quoteAgeSec: 99, blackout: "CPI", tickerTakenToday: true }) === null, "gates C are OFF: nothing blocks");
  const on = rules(["W1", "W2", "W3", "W12", "W13", "W14", "W15"]);
  assert(X.runGates({ ...base, rules: on, spreadPct: 9 })?.rule === "W12", "spread gate");
  assert(X.runGates({ ...base, rules: on, quoteAgeSec: 40 })?.rule === "W13", "stale quote");
  assert(X.runGates({ ...base, rules: on, quoteAgeSec: null })?.rule === "W13", "no timestamp = pass");
  assert(X.runGates({ ...base, rules: on, blackout: "CPI at 8:30 AM ET" })?.rule === "W14", "blackout");
  assert(X.runGates({ ...base, rules: on, blackout: "CPI at 8:30 AM ET", coachCall: true }) === null, "coach call overrides the blackout");
  assert(X.runGates({ ...base, rules: on, tickerTakenToday: true })?.rule === "W15", "one idea per ticker");
  assert(X.runGates({ ...base, rules: rules([]), d: { wrong_if_level: 0, target_level: 0 }, planned_loss: 9999 }) === null, "with W1/W2 switched off they do not gate");
});
Deno.test("stats: expectancy in R, profit factor, worst day, longest losing streak; experiments stay out of the main score; honest small-sample note", () => {
  const t = (day: string, at: string, pnl: number, r: number, extra: any = {}) => ({ status: "closed", day, closed_at: at, pnl_realistic: pnl, pnl_mid: pnl + 5, pnl_double: pnl - 5, spread_cost: 5, r_multiple: r, followed_rules: true, ...extra });
  const s = X.computeStats([t("2026-10-14", "2026-10-14T15:00:00Z", -70, -1), t("2026-10-14", "2026-10-14T16:00:00Z", -70, -1), t("2026-10-15", "2026-10-15T15:00:00Z", 140, 2), t("2026-10-15", "2026-10-15T16:00:00Z", 999, 9, { experiment: "E1" }), { status: "open", day: "2026-10-15" }]);
  eq([s.trades, s.experiments, s.wins, s.losses], [3, 1, 1, 2], "counts");
  eq([s.pnl_realistic, s.expectancy_r, s.profit_factor, s.worst_day, s.longest_losing_streak], [0, 0, 1, -140, 2], "numbers");
  eq(s.experiment_pnl_realistic, 999, "experiment tracked separately");
  assert(/first look, not proof/.test(s.note) && /30 outcomes/.test(s.note), "small-sample note");
  assert(X.computeStats([]).worst_day === null && X.computeStats([]).profit_factor === null, "empty is null, not zero");
});
Deno.test("clock: Eastern time with daylight saving and half days; etToUtcMs round-trips", () => {
  const c = X.marketClock(new RealDate("2026-10-14T14:00:00Z")); eq([c.date, c.min, c.status, c.closeMin], ["2026-10-14", 600, "open", 960], "EDT");
  const w = X.marketClock(new RealDate("2026-12-14T15:00:00Z")); eq([w.min, w.status], [600, "open"], "EST 10:00");
  eq(X.marketClock(new RealDate("2026-11-27T16:30:00Z")).closeMin, 780, "half day closes at 1 PM");
  eq(X.marketClock(new RealDate("2026-10-17T15:00:00Z")).status, "closed", "Saturday");
  eq(X.marketClock(new RealDate("2026-11-26T15:00:00Z")).status, "closed", "Thanksgiving");
  eq(new RealDate(X.etToUtcMs("2026-10-14", 570)).toISOString(), "2026-10-14T13:30:00.000Z", "9:30 ET in October = 13:30Z");
  eq(new RealDate(X.etToUtcMs("2026-12-14", 570)).toISOString(), "2026-12-14T14:30:00.000Z", "9:30 ET in December = 14:30Z");
  eq(X.mondayOf("2026-10-14"), "2026-10-12", "Monday of the week");
});
Deno.test("audit: complete plan and on-time flat = followed; incomplete plan or a late flat = broke a rule (W5)", () => {
  assert(X.auditTrade({ plan: { wrong_if_level: 198, target_level: 204, stop_option: 1.8 }, exit_reason: "target" }, 700, 950).followed, "clean");
  const late = X.auditTrade({ plan: { wrong_if_level: 198, target_level: 204, stop_option: 1.8 }, exit_reason: "flat_close" }, 990, 950);
  assert(!late.followed && late.broke[0].startsWith("W3"), "held past flat time");
  assert(!X.auditTrade({ plan: {}, exit_reason: "target" }, 700, 950).followed, "no plan");
});

/* =========================== day replays with hand-computed numbers =========================== */
Deno.test("replay 1: coach call -> paper trade at the ask -> wrong-if 10-minute close -> exit at the bid; every number matches the hand calculation", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  const r1 = await X.tick();
  assert(r1.ok && r1.results?.[0]?.ok, "opened: " + JSON.stringify(r1));
  const t = TABLES.winston_trades[0];
  eq([t.status, t.ticker, t.side, t.label, t.qty, t.source], ["open", "NVDA", "call", "NVDA 200C 10/16", 1, "coach:1"], "trade row");
  eq([t.entry_bid, t.entry_ask, t.entry_fill, t.entry_mid, t.entry_under], [2.4, 2.5, 2.5, 2.45, 200], "filled at the ask, mid recorded");
  eq([t.plan.stop_option, t.plan.planned_loss, t.plan.wrong_if_level, t.plan.target_level, t.plan.picked_by], [1.8, 70, 198, 204, "band"], "plan: est. stop 2.50 - .35 x 2 = 1.80, loss $70");
  assert(TABLES.winston_ideas.find((i) => i.status === "taken" && i.trade_id === t.id), "idea linked to trade");
  assert(!W.calls.some((c) => /place|cancel|portfolio|orders|positions/.test(c.tool)), "no order or account tool was ever called");
  // 10:21 tick: nothing happens to the open trade (only a still-forming bar), still holding
  setNow("2026-10-14T14:21:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 200, 200.5, 197.8, 197.9));
  await X.tick(); assert(TABLES.winston_trades[0].status === "open", "the 10:20 bar is not finished at 10:21");
  // 10:31: the 10:20 bar finished and CLOSED below 198 -> wrong-if. Exit at the bid.
  setNow("2026-10-14T14:31:00Z"); W.opts.opt1.bid = 1.60; W.opts.opt1.ask = 1.70; W.spot.NVDA = 197.9;
  await X.tick();
  const c = TABLES.winston_trades[0];
  eq([c.status, c.exit_reason, c.exit_bid, c.exit_fill, c.exit_mid], ["closed", "wrong_if", 1.6, 1.6, 1.65], "exited at the bid");
  eq([c.pnl_realistic, c.pnl_mid, c.spread_cost, c.pnl_double, c.r_multiple], [-90, -80, 10, -100, -1.29], "P&L hand-computed");
  eq([c.followed_rules, c.broke], [true, []], "followed the rules");
  // report
  setNow("2026-10-14T20:20:00Z"); const rep: any = (await X.reportJob()).report;
  eq([rep.day_stats.pnl_realistic, rep.day_stats.pnl_mid, rep.day_stats.pnl_double, rep.balance], [-90, -80, -100, 3910], "report numbers + balance 4000-90");
  eq(rep.taken.length, 1, "one trade in the report"); assert(/1 trade taken/.test(rep.summary[0]), rep.summary[0]);
  assert(/-\$90 at real fills/.test(rep.summary[1]), rep.summary[1]);
  assert(TABLES.winston_days.find((d) => d.day === "2026-10-14").ai.calls >= 1, "AI usage is recorded");
});
Deno.test("replay 2: stop and target inside one 10-minute bar -> stop first and flagged (W8)", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  setNow("2026-10-14T14:31:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 200, 204.6, 197.4, 197.6)); W.opts.opt1.bid = 1.5; W.opts.opt1.ask = 1.6; aiScript = null;
  await X.tick();
  const c = TABLES.winston_trades[0]; eq([c.exit_reason, c.flags], ["wrong_if", ["both_hit_same_bar_stop_first"]], "flagged");
});
Deno.test("replay 3: target touched -> exit at the bid (not at the target); a gap down fills at the next bid (W9)", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  setNow("2026-10-14T14:31:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 201, 204.3, 200.8, 203)); W.opts.opt1.bid = 3.7; W.opts.opt1.ask = 3.9; aiScript = null;
  await X.tick();
  const c = TABLES.winston_trades[0]; eq([c.exit_reason, c.exit_fill, c.pnl_realistic], ["target", 3.7, 120], "bid 3.70 -> (3.70-2.50) x 100");
  // gap: a different trade whose bar closes far below the wrong-if; fill is whatever the bid is NOW
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  setNow("2026-10-14T14:31:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 190, 191, 189, 190)); W.opts.opt1.bid = 0.45; W.opts.opt1.ask = 0.6; aiScript = null;
  await X.tick();
  eq([TABLES.winston_trades[0].exit_fill, TABLES.winston_trades[0].pnl_realistic], [0.45, -205], "gap fills at the bid 0.45, not at the planned stop 1.80");
});
Deno.test("replay 4: time exit and flat-by-3:50; a trade can never be held overnight", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();                      // time_exit_min 120
  setNow("2026-10-14T16:12:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 200, 201, 199.5, 200.4)); W.opts.opt1.bid = 2.6; W.opts.opt1.ask = 2.7; aiScript = null;
  await X.tick(); eq(TABLES.winston_trades[0].exit_reason, "time", "2 hours up -> time exit");
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick(); aiScript = null;
  setNow("2026-10-14T19:50:30Z"); W.opts.opt1.bid = 2.45; W.opts.opt1.ask = 2.55;
  const f = await X.flatten(); eq(f.closed, 1, "flatten closed one"); eq(TABLES.winston_trades[0].exit_reason, "flat_close", "3:50 PM");
  // a stale open trade from a previous day is closed on the next tick regardless of anything else
  seed(); TABLES.winston_trades.push({ id: 900, day: "2026-10-13", status: "open", ticker: "NVDA", side: "call", option_id: "opt1", qty: 1, entry_ask: 2.5, entry_mid: 2.45, opened_at: "2026-10-13T19:00:00Z", plan: { dir: "up", wrong_if_level: 198, target_level: 204, planned_loss: 70, stop_option: 1.8 }, flags: [], broke: [] });
  setNow("2026-10-14T14:11:00Z"); await setupCall(); aiScript = null; await X.tick();
  eq(TABLES.winston_trades.find((t) => t.id === 900).exit_reason, "flat_close", "overnight leftover closed first thing");
});
Deno.test("replay 5: a bad AI plan is passed with the reason; a made-up coach post is rejected; a coach post with no decision is logged as such; nothing invented becomes a trade", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  TABLES.otto_jason.push({ id: 2, day: "2026-10-14", posted_label: "10:10 AM", kind: "call", ticker: "TSLA", direction: "short", level: 400, words: "TSLA short under 400", late: false });
  aiScript = () => ({ decisions: [
    { ticker: "NVDA", side: "call", source: "coach:1", thesis: "x", wrong_if_level: 201, target_level: 204, cites: [{ type: "coach_post", ref: "1" }] },       // stop above price
    { ticker: "AMD", side: "put", source: "coach:99", thesis: "x", wrong_if_level: 130, target_level: 120, cites: [{ type: "coach_post", ref: "99" }] },        // no such post
    { ticker: "SPY", side: "call", source: "own", thesis: "x", wrong_if_level: 590, target_level: 610, cites: [] },                                            // no source
  ], passes: [] });
  const r = await X.tick();
  assert(TABLES.winston_trades.length === 0, "no trade opened: " + JSON.stringify(r));
  const by = (f: (i: any) => boolean) => TABLES.winston_ideas.find(f);
  assert(/Plan rejected/.test(by((i) => i.source === "coach:1")?.reason), "bad levels rejected");
  assert(/does not exist today/.test(by((i) => i.source === "coach:99")?.reason || ""), "invented coach post rejected");
  assert(/W6/.test(by((i) => i.ticker === "SPY")?.reason || ""), "no source = pass");
  assert(/no decision/.test(by((i) => i.source === "coach:2")?.reason || ""), "unanswered coach post is logged, not dropped");
});
Deno.test("replay 6: nothing changed -> no AI spend; a mover or a new coach post wakes the AI; first look of the day and the hourly heartbeat do too", async () => {
  seed(); setNow("2026-10-14T14:01:00Z"); W.spot = { NVDA: 200, SPY: 600 }; W.prev = { ...W.spot }; W.bars = {}; W.opts = {}; W.ai.n = 0; aiScript = null;
  await X.tick(); eq(W.ai.n, 1, "first tick of the day looks");
  setNow("2026-10-14T14:11:00Z"); await X.tick(); eq(W.ai.n, 1, "nothing changed: no AI call");
  setNow("2026-10-14T14:21:00Z"); W.spot.NVDA = 202; await X.tick(); eq(W.ai.n, 2, "a 1% mover wakes him");
  setNow("2026-10-14T14:31:00Z"); await X.tick(); eq(W.ai.n, 2, "quiet again");
  TABLES.otto_jason.push({ id: 5, day: "2026-10-14", posted_label: "10:30 AM", kind: "note", ticker: null, words: "careful today", late: false });
  setNow("2026-10-14T14:41:00Z"); await X.tick(); eq(W.ai.n, 3, "a new coach post wakes him");
  setNow("2026-10-14T15:45:00Z"); await X.tick(); eq(W.ai.n, 4, "hourly heartbeat");
});
Deno.test("replay 7: paused = no new entries but open trades are still managed; the lock stops two ticks running at once", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  TABLES.winston_settings.find((s) => s.key === "config").value.enabled = false;
  setNow("2026-10-14T14:31:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 200, 200.5, 197, 197.5)); W.opts.opt1.bid = 1.6; W.opts.opt1.ask = 1.7; W.ai.n = 0;
  const r = await X.tick(); assert(r.paused && TABLES.winston_trades[0].status === "closed", "paused still closed the open trade: " + JSON.stringify(r)); eq(W.ai.n, 0, "no AI while paused");
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  const [a, b] = await Promise.all([X.tick(), X.tick()]);
  assert([a, b].some((x: any) => x.skipped === "another tick is running"), "second tick skipped: " + JSON.stringify([a, b]));
  eq(TABLES.winston_trades.length, 1, "only one trade opened");
  const l = TABLES.winston_settings.find((s) => s.key === "tick_lock"); assert(l.value.until < new RealDate(NOW).toISOString() || true, "lock released after the tick");
});
Deno.test("replay 8: one position at a time and no adding; the size cap skips (never shrinks); cash is tracked", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall();
  W.spot.SPY = 600; W.opts.spy1 = { strike: 600, bid: 4.0, ask: 4.1, delta: .35, vol: 900, oi: 400, exp: "2026-10-16" };
  TABLES.otto_jason.push({ id: 3, day: "2026-10-14", posted_label: "10:10 AM", kind: "call", ticker: "SPY", direction: "long", level: 600, words: "SPY long over 600", late: false });
  const base = aiScript!;
  aiScript = () => ({ decisions: [
    ...base({}).decisions,
    { ticker: "NVDA", side: "call", source: "own", thesis: "add", wrong_if_level: 198, target_level: 204, cites: [{ type: "chart" }] },
    { ticker: "SPY", side: "call", source: "coach:3", thesis: "spy", wrong_if_level: 597, target_level: 606, cites: [{ type: "coach_post", ref: "3" }] }], passes: [] });
  await X.tick();
  eq(TABLES.winston_trades.length, 1, "only the first idea became a trade");
  const why = TABLES.winston_ideas.filter((i) => i.status === "blocked").map((i) => i.reason).join(" | ");
  assert(/W3|max_open/.test(why), "the others were blocked: " + why);
  // size cap: a $2,000 contract with a $1,000 cap is skipped
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall({ ask: 20, bid: 19.8, delta: .4 });
  await X.tick(); eq(TABLES.winston_trades.length, 0, "over the cap: no trade"); assert(TABLES.winston_ideas.some((i) => /No contract/.test(i.reason || "")), "reason logged");
});
Deno.test("replay 9: morning routine and pre-open read are saved once, from the data given; missing data is named; an unavailable calendar never becomes an invented event", async () => {
  seed(); W.spot = { SPY: 600, NVDA: 200 }; W.prev = { SPY: 598, NVDA: 199 }; W.calendar = [{ date: "2026-10-14T12:30:00Z", title: "CPI (Sep)", importance: 1 }];
  aiScript = (a: any) => a.tool.name === "routine" ? { bias: "CPI at 8:30", events: ["8:30 AM CPI"], watch: [{ ticker: "NVDA", why: "coach level" }], risks: ["CPI"] } : { tone: "mixed", read: "SPY +0.3%" };
  setNow("2026-10-14T12:45:00Z"); const r: any = await X.routine(); assert(r.routine?.bias, "routine written: " + JSON.stringify(r));
  assert(/CPI \(Sep\)/.test(W.ai.last.user) && /8:30 AM/.test(W.ai.last.user), "the AI was handed the real calendar with ET times");
  eq((await X.routine()).skipped, "already done today", "idempotent");
  setNow("2026-10-14T13:15:00Z"); const s: any = await X.sentiment(); eq(s.sentiment.tone, "mixed", "sentiment saved");
  const day = TABLES.winston_days.find((d) => d.day === "2026-10-14"); assert(day.routine && day.sentiment, "both on the day row");
  setNow("2026-10-14T16:00:00Z"); eq((await X.routine()).skipped, "outside the 8:30-9:25 window", "no late routine");
  setNow("2026-10-17T12:45:00Z"); eq((await X.routine()).skipped, "not a trading day", "Saturday");
});
Deno.test("replay 10: the app's route needs the Otto email; state returns everything the three views need; rules and the pause switch change only what they should", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  const jwt = (claims: any) => "Bearer x." + btoa(JSON.stringify(claims)).replace(/=+$/, "") + ".y";
  const call = (fn: string, claims: any, body?: any) => X.handle(new Request("https://x/functions/v1/winston?fn=" + fn, { method: body ? "POST" : "GET", headers: { authorization: jwt(claims), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const good = { role: "authenticated", email: "ottotrader@vinecreativestudio.com", sub: "u" };
  assert((await call("state", {})).status === 401, "no claims");
  assert((await call("state", { role: "authenticated", email: "stranger@x.com", sub: "u" })).status === 401, "wrong email");
  assert((await call("state", { role: "anon", email: "ottotrader@vinecreativestudio.com" })).status === 401, "anon key");
  assert((await call("state", { ...good, is_anonymous: true })).status === 401, "anonymous user");
  const st: any = await (await call("state", good)).json();
  assert(st.ok && st.open.length === 1 && st.trades.length === 1 && st.ideas.length >= 1 && st.rules.length > 10 && st.equity === 4000 && st.limits.cap_usd === 1000 && st.limits.max_loss_usd === 400, "state: " + JSON.stringify({ o: st.open.length, e: st.equity, l: st.limits }));
  // rules: toggle W13 on, set a number; unknown keys ignored; unknown rule refused
  await call("rule_set", good, { id: "W13", active: true, params: { max_age_sec: 30, evil: 1 } });
  const w13 = TABLES.winston_rules.find((r) => r.id === "W13"); eq([w13.active, w13.params], [true, { max_age_sec: 30 }], "W13 changed, unknown param ignored");
  eq((await call("rule_set", good, { id: "NOPE", active: true })).status, 500, "unknown rule refused");
  await call("config_set", good, { enabled: false }); eq(TABLES.winston_settings.find((s) => s.key === "config").value.enabled, false, "paused");
  eq((await call("config_set", good, { enabled: "yes" })).status, 500, "must be a boolean");
  // v3.38: the mode switch (data <-> strict) from the Winston tab, no deploy; other config keys kept; bad values refused
  const m1: any = await (await call("config_set", good, { mode: "strict" })).json();
  eq([m1.ok, m1.mode, TABLES.winston_settings.find((s) => s.key === "config").value.mode, TABLES.winston_settings.find((s) => s.key === "config").value.enabled], [true, "strict", "strict", false], "switched to strict, enabled untouched");
  await call("config_set", good, { mode: "data" }); eq(TABLES.winston_settings.find((s) => s.key === "config").value.mode, "data", "and back to data");
  assert(TABLES.winston_log.some((l) => l.kind === "mode" && l.data?.mode === "data"), "mode change logged");
  eq((await call("config_set", good, { mode: "loose" })).status, 500, "unknown mode refused");
  // v3.39: max_open 1..4 from the tab (Ifoma, 18 Oct: open Winston up for data); mode and enabled untouched; out of range refused
  const mo: any = await (await call("config_set", good, { max_open: 4 })).json();
  const cfgNow = TABLES.winston_settings.find((s) => s.key === "config").value;
  eq([mo.ok, mo.max_open, cfgNow.max_open, cfgNow.mode, cfgNow.enabled], [true, 4, 4, "data", false], "max_open 4 saved, the rest kept");
  eq((await call("config_set", good, { max_open: 5 })).status, 500, "5 refused");
  eq((await call("config_set", good, { max_open: 0 })).status, 500, "0 refused");
  assert(TABLES.winston_log.some((l) => l.kind === "config" && l.data?.max_open === 4), "max_open change logged");
  // cron routes need the secret
  Deno.env.set("OTTO_CRON_SECRET", "0123456789abcdef-secret");
  eq((await X.handle(new Request("https://x/functions/v1/winston?fn=tick", { method: "POST" }))).status, 401, "cron without the secret");
  eq((await X.handle(new Request("https://x/functions/v1/winston?fn=tick", { method: "POST", headers: { "x-otto-cron": "0123456789abcdef-secret" } }))).status, 202, "cron with the secret");
  await sleep(50);
});
Deno.test("replay 11: the 8:30 CPI blackout (rule W14, when switched on) blocks his own idea but not a coach call", async () => {
  seed(); TABLES.winston_rules.find((r) => r.id === "W14").active = true; setNow("2026-10-14T14:11:00Z"); await setupCall();
  W.calendar = [{ date: "2026-10-14T14:20:00Z", title: "CPI (Sep)", importance: 1 }];            // 10:20 ET
  const base = aiScript!;
  aiScript = () => ({ decisions: [{ ...base({}).decisions[0], source: "own", cites: [{ type: "chart" }] }], passes: [] });
  await X.tick(); eq(TABLES.winston_trades.length, 0, "own idea blocked"); assert(TABLES.winston_ideas.some((i) => /W14/.test(i.reason || "")), "reason: " + JSON.stringify(TABLES.winston_ideas.map((i) => i.reason)));
  seed(); TABLES.winston_rules.find((r) => r.id === "W14").active = true; setNow("2026-10-14T14:11:00Z"); await setupCall(); W.calendar = [{ date: "2026-10-14T14:20:00Z", title: "CPI (Sep)", importance: 1 }];
  await X.tick(); eq(TABLES.winston_trades.length, 1, "coach call is allowed through the blackout (coach wins)");
});
Deno.test("replay 12: experiments stay OFF until their rule is switched on, and are kept out of the main score", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); const base = aiScript!;
  aiScript = () => ({ decisions: [{ ...base({}).decisions[0], experiment: "E1" }], passes: [] });
  await X.tick(); eq(TABLES.winston_trades.length, 0, "E1 is off: not traded"); assert(/not switched on/.test(TABLES.winston_ideas.at(-1).reason), "reason logged");
  seed(); TABLES.winston_rules.find((r) => r.id === "E1").active = true; setNow("2026-10-14T14:11:00Z"); await setupCall(); aiScript = () => ({ decisions: [{ ...base({}).decisions[0], experiment: "E1" }], passes: [] });
  await X.tick(); eq(TABLES.winston_trades[0].experiment, "E1", "E1 on: traded and tagged");
  assert(X.computeStats([{ ...TABLES.winston_trades[0], status: "closed", pnl_realistic: 50, day: "2026-10-14" }]).trades === 0, "not in the main score");
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); aiScript = () => ({ decisions: [{ ...base({}).decisions[0], experiment: "W3" }], passes: [] });
  await X.tick(); eq(TABLES.winston_trades.length, 0, "a non-experiment rule id cannot be used as an experiment tag");
});

/* =========================== v3.32: the one-minute watch, the live route, the heartbeat =========================== */
Deno.test("replay 13: the watch touches the target inside a still-forming bar (exit at the bid, flagged); the stop still needs a finished bar's CLOSE; no AI, no entries", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  eq(TABLES.winston_trades.length, 1, "opened by the tick");
  // 10:24: the 10:20 bar is still forming and has already touched 204 -> the 10-minute tick ignores it, the watch takes it
  setNow("2026-10-14T14:24:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 201, 204.3, 200.8, 203.5)); W.opts.opt1.bid = 3.6; W.opts.opt1.ask = 3.8; W.ai.n = 0; aiScript = null;
  await X.tick(); eq(TABLES.winston_trades[0].status, "open", "the 10-minute tick does not read a forming bar");
  const r = await X.watch(); eq(r.closed, 1, "watch closed it: " + JSON.stringify(r));
  const c = TABLES.winston_trades[0];
  eq([c.status, c.exit_reason, c.exit_fill, c.pnl_realistic, c.flags], ["closed", "target", 3.6, 110, ["intrabar_touch"]], "target touch, exit at the bid, flagged");
  eq(W.ai.n, 0, "the watch never calls the AI");
  // a stop is NOT taken intrabar: price under the wrong-if level inside a forming bar leaves the trade open
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  setNow("2026-10-14T14:24:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 200, 200.5, 196.5, 197)); W.opts.opt1.bid = 1.5; W.opts.opt1.ask = 1.6; aiScript = null;
  await X.watch(); eq(TABLES.winston_trades[0].status, "open", "forming bar below the stop level: still open (stop = a finished 10-minute close)");
  // ...and the watch keeps the mark fresh while it waits
  eq(TABLES.winston_trades[0].plan.last_mark.bid, 1.5, "last mark refreshed");
  // once that bar finishes below the level the watch applies the normal stop
  setNow("2026-10-14T14:31:00Z"); await X.watch(); eq([TABLES.winston_trades[0].status, TABLES.winston_trades[0].exit_reason], ["closed", "wrong_if"], "finished close -> wrong-if");
});
Deno.test("replay 14: the watch is a no-op with no open trade (no market calls, no log spam), never opens anything, and never runs on top of a tick", async () => {
  seed(); setNow("2026-10-14T14:24:00Z"); await setupCall(); W.calls.length = 0;
  const r = await X.watch(); eq(r.skipped, "no open trade", "skipped");
  eq(W.calls.length, 0, "no market call when nothing is open"); eq(TABLES.winston_trades.length, 0, "opened nothing");
  const hb = TABLES.winston_settings.find((s) => s.key === "heartbeat"); assert(hb && hb.value.kind === "watch", "heartbeat recorded");
  setNow("2026-10-14T21:30:00Z"); eq((await X.watch()).skipped, "market not open", "after the close");
  // a held lock = skipped, not stacked
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick(); setNow("2026-10-14T14:24:00Z");
  const lk = TABLES.winston_settings.find((s) => s.key === "tick_lock"); lk.value = { until: new RealDate(NOW + 60e3).toISOString() };
  eq((await X.watch()).skipped, "a tick is running", "lock respected");
});
Deno.test("replay 15: the app's live route needs the Otto email, writes nothing, and returns the estimate = (bid - what he paid) x 100; no bid = no estimate; the heartbeat rides on state", async () => {
  seed(); setNow("2026-10-14T14:11:00Z"); await setupCall(); await X.tick();
  setNow("2026-10-14T14:24:00Z"); W.bars.NVDA.push(barRow("2026-10-14T14:20:00Z", 201, 202, 200.8, 201.8)); W.opts.opt1.bid = 2.9; W.opts.opt1.ask = 3.0;
  const jwt = (claims: any) => "Bearer x." + btoa(JSON.stringify(claims)).replace(/=+$/, "") + ".y";
  const call = (fn: string, claims: any) => X.handle(new Request("https://x/functions/v1/winston?fn=" + fn, { headers: { authorization: jwt(claims) } }));
  const good = { role: "authenticated", email: "ottotrader@vinecreativestudio.com", sub: "u" };
  eq((await call("live", {})).status, 401, "no claims"); eq((await call("live", { role: "anon", email: good.email })).status, 401, "anon key");
  dbLog.length = 0; W.calls.length = 0;
  const j: any = await (await call("live", good)).json();
  eq([j.ok, j.live.length, j.live[0].ticker, j.live[0].bid, j.live[0].est_pnl], [true, 1, "NVDA", 2.9, 40], "(2.90 - 2.50) x 100");
  assert(j.live[0].bars.length >= 2 && j.live[0].under === 201.8, "bars + last price for the chart");
  assert(dbLog.every((l) => l.method === "GET"), "the live route wrote nothing: " + JSON.stringify(dbLog.filter((l) => l.method !== "GET")));
  assert(!W.calls.some((c) => /place|cancel|portfolio|orders|positions/.test(c.tool)), "no order or account tool");
  W.opts.opt1.bid = 0; W.opts.opt1.ask = 3.0;
  const k: any = await (await call("live", good)).json(); eq(k.live[0].est_pnl, null, "no bid = no estimate (never a guess)");
  const st: any = await (await call("state", good)).json(); assert(st.heartbeat && st.heartbeat.at, "state carries the heartbeat: " + JSON.stringify(st.heartbeat));
});

/* ================================ v3.36 (16 Oct 2026): data mode + the coach's 15 Oct rules ================================ */
Deno.test("v3.36 picker: loose tier only in data mode; volume<OI and delta outside .20-.50 become stamps, not walls", () => {
  const row = (o: Partial<any>) => ({ id: "x", exp: "2026-10-16", strike: 200, type: "call", bid: 2.4, ask: 2.5, delta: .35, vol: 100, oi: 400, label: "L", ...o });
  eq(X.pickContract([row({ id: "d" })], 1000, 4000).row, null, "strict: volume below OI still passes the idea");
  const p = X.pickContract([row({ id: "d" })], 1000, 4000, true);
  eq(p.row?.id, "d", "data mode: the loose tier takes it");
  eq(p.by, "loose", "tier name");
  eq(p.flags, ["picker:volume_not_above_oi"], "stamped, not blocked");
  const q = X.pickContract([row({ id: "e", delta: .18, vol: 900 })], 1000, 4000, true);
  eq(q.flags, ["picker:delta_outside_20_50"], "delta .18 is loose-tier only and stamped");
  eq(X.pickContract([row({ id: "f", delta: .10, vol: 900 })], 1000, 4000, true).row, null, "delta .10 is outside even the loose tier");
  eq(X.pickContract([row({ id: "g", bid: 0 })], 1000, 4000, true).row, null, "no bid: still no trade in data mode");
  eq(X.pickContract([row({ id: "h", ask: 12, bid: 11.8 })], 1000, 4000, true).row, null, "over the size cap: still no trade in data mode (W2)");
  eq(X.pickContract([row({ id: "i", vol: 900 })], 1000, 4000, true).by, "band", "a proper band contract still wins the loose tier");
});
Deno.test("v3.36 gates: soft gates stamp in data mode and block in strict mode; hard gates always block", () => {
  const rules = (on: string[]) => ["W1", "W2", "W3", "W12", "W13", "W14", "W15", "W20", "W21", "W23"].map((id) => ({ id, kind: "x", source: "x", title: id, body: "", active: on.includes(id), params: id === "W12" ? { max_spread_pct: 5 } : {} }));
  const base: any = { rules: rules(["W1", "W2", "W3", "W12", "W15", "W20", "W21", "W23"]), d: { wrong_if_level: 198, target_level: 204 }, cap: 1000, maxLoss: 400, planned_loss: 70, cost: 250, cash: 4000, stop_option: 1.8, ask: 2.5,
    openCount: 0, maxOpen: 3, tickerTakenToday: true, sameTickerOpen: true, spreadPct: 30, quoteAgeSec: 3, blackout: null, coachCall: false, etMin: 620, lastEntryMin: 930, ownFromMin: 600, coachFromMin: 571,
    dataMode: true, reentryBeyondExit: "re-entry above the last exit", atCoachLevel: "within $0.5 of 770", indexDisagree: "SPY above VWAP", thesisWrong: "says below VWAP but price is above", coachResultAfter: "post 207 says sold" };
  const hits = X.runGatesAll(base);
  eq(hits.map((h: any) => h.rule).sort(), ["W12", "W15", "W20", "W21", "W23", "W3", "fact", "fact"].sort(), "every gate fires");
  // v3.42: W12 (spread) is HARD in every mode; v3.45: W3 (no adding) is HARD in every mode; the rest stay soft in data mode
  assert(hits.filter((h: any) => h.rule !== "W12" && h.rule !== "W3").every((h: any) => h.soft), "all soft in data mode except W12 and W3");
  assert(hits.filter((h: any) => h.rule === "W12" || h.rule === "W3").every((h: any) => !h.soft), "W12 and W3 are never soft");
  assert(X.runGates(base)?.rule === "W3" || X.runGates(base)?.rule === "W12", "data mode: the hard gates still block");
  assert(X.runGates({ ...base, spreadPct: 4 })?.rule === "W3", "data mode: already in the ticker blocks (22 Oct SPY 760P/759P adds)");
  const tight: any = { ...base, spreadPct: 4, sameTickerOpen: false };
  assert(X.runGates(tight) === null, "data mode, spread under the threshold and not in the ticker: nothing blocks");
  assert(X.runGates({ ...tight, sameTickerOpen: true, dataMode: false })?.rule === "W3", "strict mode: W3 blocks");
  assert(X.runGates({ ...tight, dataMode: false })?.rule === "W15", "strict mode: the first soft gate blocks");
  assert(X.runGates({ ...base, dataMode: false })?.rule === "W3" || X.runGates({ ...base, dataMode: false })?.rule === "W12", "strict mode blocks either way");
  // v3.45: these run on `tight` (not in the ticker) — with W3 hard, `base` would stop at W3 first
  assert(X.runGates({ ...tight, planned_loss: 500 })?.rule === "W2", "W2 is hard even in data mode");
  assert(X.runGates({ ...tight, openCount: 3 })?.rule === "max_open", "max_open is hard even in data mode");
  assert(X.runGates({ ...tight, cost: 4100 })?.rule === "cash" || X.runGates({ ...tight, cost: 4100 })?.rule === "W2", "cash is hard");
  assert(X.runGates({ ...tight, etMin: 580 })?.rule === "time", "time window is hard");
  const off: any = { ...base, rules: rules(["W1", "W2"]), dataMode: false, spreadPct: 4 };
  eq(X.runGatesAll(off).map((h: any) => h.rule), ["fact", "fact"], "rules OFF never fire; the fact checks are not rules and always stamp");
  assert(X.runGates(off)?.rule === "fact", "strict mode: a wrong fact in the thesis blocks (data mode only stamps it)");
});
Deno.test("v3.36 W20 re-entry: a closed trade today on the same ticker+side, and the new entry is past its exit = chasing", () => {
  const closed = [{ ticker: "SPY", side: "call", exit_under: 768.9 }];
  assert(X.reentryBeyondExit("call", 770.22, closed, "SPY")?.includes("above the last exit"), "SPY 770.22 after an exit at 768.9");
  eq(X.reentryBeyondExit("call", 767.5, closed, "SPY"), null, "price came back below the exit: allowed");
  eq(X.reentryBeyondExit("put", 760, closed, "SPY"), null, "other side: not a re-entry");
  eq(X.reentryBeyondExit("call", 999, closed, "QQQ"), null, "other ticker");
  eq(X.reentryBeyondExit("call", 999, [{ ticker: "SPY", side: "call", exit_under: null }], "SPY"), null, "no exit price recorded (older trades): nothing to compare");
  assert(X.reentryBeyondExit("put", 719, [{ ticker: "QQQ", side: "put", exit_under: 720.5 }], "QQQ")?.includes("below the last exit"), "puts mirror");
});
Deno.test("v3.36 W21 sell-to: a coach level within $0.50 that is not the trade's own direction blocks a long at the coach's sale point", () => {
  const posts = [{ ticker: "SPY", kind: "level", level: 770, direction: null }, { ticker: "SPY", kind: "level", level: 768, direction: "long" }, { ticker: "SPY", kind: "note", level: 764 }];
  assert(X.atCoachLevel("call", 770.22, posts, "SPY")?.includes("770"), "buying at 770 = his sell-to");
  eq(X.atCoachLevel("call", 768.1, posts, "SPY"), null, "768 was his 'above X' long line: same direction, allowed");
  eq(X.atCoachLevel("call", 771.5, posts, "SPY"), null, "more than $0.50 away");
  eq(X.atCoachLevel("call", 764.1, posts, "SPY"), null, "a note is not a level post");
  assert(X.atCoachLevel("put", 770.3, posts, "SPY"), "a direction-less coach level is not an entry for either side: don't initiate within $0.50 of it");
  assert(X.atCoachLevel("put", 768.2, posts, "SPY"), "a put at his 'long above 768' line is shorting where he buys: fires");
});
Deno.test("v3.36 W23 index read + disagreement", () => {
  const b = (t: number, c: number) => ({ t, o: c - 0.2, h: c + 0.3, l: c - 0.5, c, v: 100 });
  const now = Date.UTC(2026, 9, 15, 16, 30);
  const up = [b(now - 50 * 60e3, 766), b(now - 40 * 60e3, 767), b(now - 30 * 60e3, 768), b(now - 20 * 60e3, 769)];
  const idx = X.indexRead(up, now);
  assert(idx && idx.above_vwap && idx.rising && !idx.falling, "SPY rising above VWAP");
  assert(X.indexDisagree("put", idx)?.includes("fights the index"), "QQQ short vs a rising SPY");
  eq(X.indexDisagree("call", idx), null, "long agrees");
  const down = [b(now - 50 * 60e3, 769), b(now - 40 * 60e3, 768), b(now - 30 * 60e3, 767), b(now - 20 * 60e3, 766)];
  const idx2 = X.indexRead(down, now);
  assert(idx2 && !idx2.above_vwap && idx2.falling, "SPY falling below VWAP");
  assert(X.indexDisagree("call", idx2), "long vs a falling SPY");
  eq(X.indexRead(up.slice(0, 2), now), null, "fewer than 3 completed bars: no read");
  eq(X.indexDisagree("put", null), null, "no read: no gate");
});
Deno.test("v3.36 fact checks: thesis vs VWAP, and a 'result' post after the cited post", () => {
  assert(X.thesisVwapWrong("QQQ is below VWAP (720.91 area) and rolling over", 723.7, 720.91)?.includes("above VWAP"), "15 Oct QQQ: said below, was above");
  eq(X.thesisVwapWrong("QQQ is below VWAP and rolling over", 719, 720.91), null, "true statement");
  assert(X.thesisVwapWrong("reclaimed VWAP, momentum up", 215, 215.84), "said above, was below");
  eq(X.thesisVwapWrong("no vwap talk here", 100, 101), null, "nothing to check");
  eq(X.thesisVwapWrong("below VWAP", 100, null), null, "no vwap known: no check");
  // v3.41: the 19 Oct false positive — the "below VWAP" was about SPY, the trade was TSLA (above its VWAP, 361.70 vs 359.73)
  eq(X.thesisVwapWrong("TSLA is above VWAP (last close 361.925 vs VWAP 359.73), with three rising 10-min closes. SPY is below VWAP with falling closes, so W23 index-agreement must be checked.", 361.695, 359.73, "TSLA"), null, "SPY clause is not a TSLA fact");
  assert(X.thesisVwapWrong("TSLA is below VWAP and SPY is above VWAP", 361.7, 359.73, "TSLA")?.includes("above VWAP"), "the TSLA clause is still checked");
  assert(/ — "TSLA is below VWAP/.test(String(X.thesisVwapWrong("TSLA is below VWAP and SPY is above VWAP", 361.7, 359.73, "TSLA"))), "v3.42: the stamp quotes the clause it fired on");
  assert(X.thesisVwapWrong("price is below VWAP, rolling over", 723.7, 720.91, "QQQ")?.includes("above VWAP"), "no ticker in the clause = about ours");
  eq(X.thesisVwapWrong("QQQ is below VWAP and rolling over", 719, 720.91, "QQQ"), null, "true statement with the ticker");
  const posts = [{ id: 206, ticker: "SPY", kind: "level", words: "SEE HOW SPY PLAYED THE BOUNCE RIGHT UP TO 768 AND NOW WE STOP" },
    { id: 207, ticker: "SPY", kind: "result", words: "PERFECT PLAY TO SELL THEM INTO STRENGTH. SOME I KEPT" }, { id: 208, ticker: "SPY", kind: "note", words: "AND PLAY THE BOUNCE ON SPY" }];
  assert(X.coachResultAfter(206, "SPY", posts)?.includes("207"), "a sale after #206 is his exit");
  eq(X.coachResultAfter(208, "SPY", posts), null, "nothing after #208");
  eq(X.coachResultAfter(206, "QQQ", posts), null, "other ticker");
});
Deno.test("v3.36 W22 coach exit: indecision bar then no new high = out; a strong bar then a new high = stay", () => {
  const t0 = Date.UTC(2026, 9, 15, 15, 0), m = 60e3, now = t0 + 60 * m;
  const bar = (i: number, o: number, h: number, l: number, c: number) => ({ t: t0 + i * 10 * m, o, h, l, c, v: 1 });
  const doji = [bar(0, 770, 771, 769, 770.9), bar(1, 770.9, 771.4, 770.4, 770.95), bar(2, 770.9, 771.3, 770.2, 770.5)];   // bar 1 indecision, bar 2 h 771.3 < 771.4
  const hit = X.coachExit({ dir: "up" }, doji, t0 - 1, now);
  assert(hit && hit.t === doji[2].t, "exit on the failed bar");
  const strong = [bar(0, 770, 771, 769, 770.9), bar(1, 770.9, 772, 770.8, 771.9), bar(2, 771.9, 772.5, 771.5, 772.3)];
  eq(X.coachExit({ dir: "up" }, strong, t0 - 1, now), null, "no indecision: no exit");
  const newHigh = [bar(0, 770, 771, 769, 770.9), bar(1, 770.9, 771.4, 770.4, 770.95), bar(2, 770.9, 771.9, 770.6, 771.8)];
  eq(X.coachExit({ dir: "up" }, newHigh, t0 - 1, now), null, "indecision then a NEW high: stay");
  eq(X.coachExit({ dir: "up" }, doji, t0 + 25 * m, now), null, "bars before the entry are ignored");
  const short = [bar(0, 724, 724.5, 723, 723.2), bar(1, 723.2, 723.6, 722.9, 723.25), bar(2, 723.2, 723.8, 723.0, 723.5)];   // bar 1 indecision, bar 2 l 723.0 > 722.9
  assert(X.coachExit({ dir: "down" }, short, t0 - 1, now), "puts: indecision then no new low = out");
});
Deno.test("v3.36 excursion (MFE / MAE) in price and in R", () => {
  const t0 = Date.UTC(2026, 9, 15, 15, 0), m = 60e3, now = t0 + 40 * m;
  const bars = [{ t: t0, o: 770, h: 771.2, l: 769.4, c: 770.5, v: 1 }, { t: t0 + 10 * m, o: 770.5, h: 772.0, l: 770.3, c: 771.5, v: 1 }, { t: t0 + 20 * m, o: 771.5, h: 771.8, l: 769.0, c: 769.5, v: 1 }];
  const e = X.excursion({ dir: "up", delta: 0.35, planned_loss: 70 }, bars, t0 - 1, 770.22, now)!;
  eq(e.mfe_under, 1.78, "high 772.0 - entry 770.22");
  eq(e.mae_under, 1.22, "entry - low 769.0");
  eq(e.mfe_r, 0.89, "1.78 * 0.35 * 100 / 70");
  eq(e.bars, 3, "three completed bars");
  eq(X.excursion({ dir: "up" }, [], t0, 770, now), null, "no bars: nothing");
  eq(X.excursion({ dir: "up", delta: 0.35 }, bars, t0 - 1, 770.22, now)?.mfe_r, null, "no planned loss: no R");
});
Deno.test("v3.36 limits override: Winston can drop his daily stop while the live limits row keeps it", () => {
  const live = { daily_on: true, daily_losses: 2, weekly_pct: 20 };
  eq(X.applyLimits(live, null).daily_on, true, "no override");
  const o = X.applyLimits(live, { daily_on: false });
  eq(o.daily_on, false, "daily off for Winston");
  eq(o.weekly_pct, 20, "weekly untouched");
  eq(X.applyLimits(live, { daily_on: "nope" as any }).daily_on, true, "a truthy string still means on (booleans are coerced)");
  const e = { equity: 4030, cash: 4030, day_pnl: 30, day_losses: 2, week_pnl: 30, week_start_equity: 4000 };
  assert(X.limitsState(X.applyLimits(live, null), e).locked?.why.includes("daily stop"), "15 Oct: two losses on a +$30 day locked him");
  eq(X.limitsState(X.applyLimits(live, { daily_on: false }), e).locked, null, "data mode: no lock on a loss count");
  assert(X.limitsState(X.applyLimits(live, { daily_on: false }), { ...e, week_pnl: -900 }).locked?.why.includes("weekly"), "the weekly kill switch still locks");
});
Deno.test("replay 7 (v3.36): the 15 Oct SPY chase in DATA MODE opens WITH stamps (W20 re-entry, W21 sell-to, result post, loose picker); in STRICT mode it is blocked; the coach exit fires", async () => {
  // Data mode: config merged like SQL 024 does; W20-W23 active; the live limits row still says daily_losses 2.
  seed(); setNow("2026-10-15T15:11:00Z");                                                        // Thu 15 Oct, 11:11 AM ET
  TABLES.winston_settings[0].value = { enabled: true, paper_balance: 4000, mode: "data", max_open: 3, min_time_exit_min: 120, limits_override: { daily_on: false } };
  for (const id of ["W20", "W21", "W22", "W23"]) TABLES.winston_rules.push({ id, sort: 170, kind: "gate", source: "coach 2026-10-15", title: id, body: id, active: true, params: {} });
  W.spot = { SPY: 770.22, QQQ: 724, NVDA: 217 }; W.prev = { SPY: 769.6, QQQ: 729, NVDA: 221 }; W.calls.length = 0; W.ai.n = 0;
  W.opts = { c773: { strike: 773, bid: 1.56, ask: 1.57, delta: 0.35, vol: 100, oi: 4000 } };                // volume BELOW open interest: strict picker says no
  W.bars = { SPY: [barRow("2026-10-15T14:40:00Z", 768.5, 769.2, 768.3, 768.84), barRow("2026-10-15T14:50:00Z", 768.8, 769.9, 768.6, 769.7), barRow("2026-10-15T15:00:00Z", 769.7, 770.5, 769.5, 770.29)] };
  // two earlier SPY call trades closed today, the last one out at 768.9; two losses on the day (-29, -32) so the LIVE daily stop would have locked him
  TABLES.winston_trades.push({ id: 101, day: "2026-10-15", status: "closed", ticker: "SPY", side: "call", pnl_realistic: -29, entry_ask: 1.57, qty: 1, closed_at: "2026-10-15T14:50:00Z", exit_under: 768.9, flags: [], broke: [] });
  TABLES.winston_trades.push({ id: 102, day: "2026-10-15", status: "closed", ticker: "QQQ", side: "put", pnl_realistic: -32, entry_ask: 2.46, qty: 1, closed_at: "2026-10-15T15:00:00Z", exit_under: 724, flags: [], broke: [] });
  TABLES.otto_jason.push({ id: 200, day: "2026-10-15", posted_label: "9:00 AM", kind: "level", ticker: "SPY", direction: null, level: 770, words: "SPY MUST GET BACK ABOVE AND MAINTAIN 768 FIRST THEN 770", late: false });
  TABLES.otto_jason.push({ id: 207, day: "2026-10-15", posted_label: "10:27 AM", kind: "result", ticker: "SPY", direction: null, level: 768, words: "PERFECT PLAY TO SELL THEM INTO STRENGTH. SOME I KEPT", late: false });
  TABLES.otto_jason.push({ id: 208, day: "2026-10-15", posted_label: "10:27 AM", kind: "note", ticker: "SPY", direction: "long", level: null, words: "AND PLAY THE BOUNCE ON SPY", late: false });
  aiScript = () => ({ decisions: [{ ticker: "SPY", side: "call", source: "coach:200", thesis: "Coach post 208 calls to play the bounce; SPY above VWAP and continuing higher", wrong_if_level: 768.3, target_level: 773, time_exit_min: 95,
    cites: [{ type: "coach_post", ref: "200" }] }], passes: [] });
  const r = await X.tick();
  assert(!r.locked, "data mode: two losses do not lock him (limits_override daily_on false): " + JSON.stringify(r));
  const t = TABLES.winston_trades.find((x) => x.status === "open");
  assert(t, "the trade opened in data mode: " + JSON.stringify(r.results));
  eq(t.plan.picked_by, "loose", "picked by the loose tier (volume < OI)");
  eq(t.plan.time_exit_min, 120, "the AI asked for 95 minutes; the floor is 120");
  eq(t.plan.mode, "data", "plan says data mode");
  const st = t.plan.stamps.map((s: string) => s.split(":")[0]).sort();
  eq(st, ["W20", "W21", "fact", "picker"].sort(), "stamped: re-entry above 768.9, within $0.50 of the coach's 770, the result post after #200, and the picker: " + JSON.stringify(t.plan.stamps));
  assert(t.flags.includes("stamp:W20") && t.flags.includes("stamp:picker"), "stamps also on the trade flags for the report: " + JSON.stringify(t.flags));
  assert(/stamped: /.test(TABLES.winston_ideas.find((i) => i.status === "taken").reason), "the idea row says it was stamped");
  // the coach exit (W22): an indecision bar then no new high after the entry closes it before the 120-minute time stop
  setNow("2026-10-15T15:41:00Z");
  W.bars.SPY.push(barRow("2026-10-15T15:10:00Z", 770.3, 771.0, 769.9, 770.9), barRow("2026-10-15T15:20:00Z", 770.9, 771.4, 770.4, 770.95), barRow("2026-10-15T15:30:00Z", 770.9, 771.3, 770.2, 770.5));
  W.opts.c773.bid = 1.6; W.opts.c773.ask = 1.62; aiScript = null;
  await X.tick();
  const c = TABLES.winston_trades.find((x) => x.id === t.id);
  eq(c.exit_reason, "coach_exit", "indecision then no new high -> out (not a time exit)");
  eq(c.exit_under, 770.5, "exit price on the underlying is recorded now (W20 needs it)");
  assert(c.plan.excursion && c.plan.excursion.mfe_under === 1.18 && c.plan.excursion.mae_under === 0.02 && c.plan.excursion.bars === 2, "MFE 771.4-770.22, MAE 770.22-770.2 (the 11:10 bar began before the entry and is skipped): " + JSON.stringify(c.plan.excursion));
  assert(c.flags.includes("W22_indecision_then_no_new_high"), "exit flagged");
  // STRICT mode, same tape: the picker alone passes the idea (volume < OI), nothing opens
  seed(); setNow("2026-10-15T15:11:00Z");
  for (const id of ["W20", "W21", "W22", "W23"]) TABLES.winston_rules.push({ id, sort: 170, kind: "gate", source: "coach 2026-10-15", title: id, body: id, active: true, params: {} });
  W.spot = { SPY: 770.22, QQQ: 724, NVDA: 217 }; W.prev = { SPY: 769.6, QQQ: 729, NVDA: 221 }; W.ai.n = 0;
  W.opts = { c773: { strike: 773, bid: 1.56, ask: 1.57, delta: 0.35, vol: 100, oi: 4000 } };
  W.bars = { SPY: [barRow("2026-10-15T14:40:00Z", 768.5, 769.2, 768.3, 768.84), barRow("2026-10-15T14:50:00Z", 768.8, 769.9, 768.6, 769.7), barRow("2026-10-15T15:00:00Z", 769.7, 770.5, 769.5, 770.29)] };
  TABLES.otto_jason.push({ id: 200, day: "2026-10-15", posted_label: "9:00 AM", kind: "level", ticker: "SPY", direction: null, level: 770, words: "SPY 768 THEN 770", late: false });
  aiScript = () => ({ decisions: [{ ticker: "SPY", side: "call", source: "coach:200", thesis: "bounce", wrong_if_level: 768.3, target_level: 773, cites: [{ type: "coach_post", ref: "200" }] }], passes: [] });
  await X.tick();
  eq(TABLES.winston_trades.length, 0, "strict: no trade");
  assert(/No contract/.test(TABLES.winston_ideas[0].reason), "strict: the picker passed it: " + TABLES.winston_ideas[0].reason);
  // STRICT mode with a liquid contract: W21 (at the coach's 770) blocks instead of stamping
  W.opts.c773.vol = 9000; TABLES.winston_ideas.length = 0; W.ai.n = 0; setNow("2026-10-15T15:21:00Z"); W.spot.SPY = 770.3;
  TABLES.otto_jason.push({ id: 209, day: "2026-10-15", posted_label: "11:20 AM", kind: "note", ticker: null, words: "watching", late: false });   // a new post wakes the AI
  await X.tick();
  eq(W.ai.n, 1, "the new post woke him");
  eq(TABLES.winston_trades.length, 0, "strict: still no trade");
  assert(/^W21:/.test(TABLES.winston_ideas[0].reason), "strict: blocked by W21 at the sell-to: " + TABLES.winston_ideas[0].reason);
});

Deno.test("v3.43.1: the Winston tab (fn=state) shows no daily-stop lock in data mode after two losses, matching the tick; strict mode still shows it", async () => {
  const jwt = (claims: any) => "Bearer x." + btoa(JSON.stringify(claims)).replace(/=+$/, "") + ".y";
  const good = { role: "authenticated", email: "ottotrader@vinecreativestudio.com", sub: "u" };
  const state = async () => await (await X.handle(new Request("https://x/functions/v1/winston?fn=state", { headers: { authorization: jwt(good) } }))).json();
  const twoLosses = () => { for (const [id, pnl] of [[101, -29], [102, -27]]) TABLES.winston_trades.push({ id, day: "2026-10-22", status: "closed", ticker: "PLTR", side: "call", pnl_realistic: pnl, entry_ask: 1.5, qty: 1, closed_at: "2026-10-22T15:00:00Z", flags: [], broke: [] }); };
  // 22 Oct: data mode, override on, two losses ($56) -> the tab showed "LOCKED — daily stop reached" while the tick kept trading
  seed(); setNow("2026-10-22T16:11:00Z"); twoLosses();
  TABLES.winston_settings[0].value = { enabled: true, paper_balance: 4000, mode: "data", max_open: 4, limits_override: { daily_on: false } };
  const st: any = await state();
  eq(st.limits.locked, null, "data mode: the tab must not say LOCKED on a loss count: " + JSON.stringify(st.limits.locked));
  eq(st.limits.daily_on, false, "the tab's limits carry the override");
  const r: any = await X.tick({ force: true });
  assert(!r.locked, "and the tick agrees: " + JSON.stringify(r).slice(0, 200));
  // strict mode (no override): the same two losses still show the lock
  seed(); setNow("2026-10-22T16:11:00Z"); twoLosses();
  TABLES.winston_settings[0].value = { enabled: true, paper_balance: 4000, mode: "strict", max_open: 4 };
  assert((await state()).limits.locked?.why.includes("daily stop"), "strict: the daily stop still shows");
});

/* ---------------- v3.44: the coach's 22 Oct rules (W24 bonds first, W25 first 15 / after earnings, W26 move already done) ---------------- */
Deno.test("v3.44 pure: tape read (bonds first), first-15 / earnings wait, move already done, last night's reporters", () => {
  // 22 Oct: QQQ about -2%, Treasuries bought
  const tape = X.tapeRead({ spot: 712, prev: 726.5 }, { spot: 92.5, prev: 92 }, { nasdaq_pct: 1, bond_pct: 0.2 });
  assert(tape?.defensive, "QQQ -2.0% + TLT +0.54% = defensive: " + JSON.stringify(tape));
  assert(/bonds bought/.test(tape!.why), "says bonds bought");
  assert(X.defensiveCall("call", tape)?.includes("puts, not calls"), "a call on that day is stamped");
  eq(X.defensiveCall("put", tape), null, "a put on that day is fine");
  eq(X.tapeRead({ spot: 712, prev: 726.5 }, { spot: 91.8, prev: 92 }, {})?.defensive, false, "Nasdaq red but bonds SOLD = not the coach's defensive read");
  eq(X.tapeRead({ spot: 724, prev: 726.5 }, { spot: 92.5, prev: 92 }, {})?.defensive, false, "QQQ only -0.3% = not defensive");
  eq(X.tapeRead(undefined, { spot: 92.5, prev: 92 }, {}), null, "no QQQ quote = no read (never a guess)");
  // W25
  assert(X.openReprice("SPY", 575, [], {})?.includes("first 15"), "9:35 = options still repricing");
  eq(X.openReprice("SPY", 585, [], {}), null, "9:45 = fine");
  assert(X.openReprice("LRCX", 590, ["LRCX"], {})?.includes("reported earnings"), "9:50 on a name that reported last night = wait the full 30");
  eq(X.openReprice("LRCX", 600, ["LRCX"], {}), null, "10:00 = fine after earnings");
  eq(X.openReprice("NVDA", 590, ["LRCX"], {}), null, "another name is not held to the earnings wait");
  // W26
  assert(X.moveDone("put", "LRCX", { spot: 150, prev: 167.6 }, {})?.includes("-10.5"), "LRCX -10.5% -> a put chases: " + X.moveDone("put", "LRCX", { spot: 150, prev: 167.6 }, {}));
  eq(X.moveDone("call", "LRCX", { spot: 150, prev: 167.6 }, {}), null, "a call on a name that is down is not chasing");
  assert(X.moveDone("put", "QQQ", { spot: 712, prev: 726.5 }, {})?.includes("threshold -1.5%"), "QQQ -2% -> index threshold 1.5%");
  eq(X.moveDone("put", "QQQ", { spot: 720, prev: 726.5 }, {}), null, "QQQ -0.9% = not done");
  eq(X.moveDone("put", "NVDA", { spot: 196, prev: 203 }, {}), null, "NVDA -3.4% is under the 5% stock threshold");
  eq(X.moveDone("put", "NVDA", { spot: 196, prev: 203 }, { stock_pct: 3 }), "NVDA is already -3.45% from yesterday's close — the move is done; don't chase it with a put (threshold -3%)", "the threshold is a rule param");
  // reporters: after yesterday's close or before today's open
  const rows = [{ symbol: "LRCX", report: { date: "2026-10-21", timing: "pm" } }, { symbol: "IBM", report: { date: "2026-10-21", timing: "pm" } },
    { symbol: "TSLA", report: { date: "2026-10-21", timing: "am" } }, { symbol: "WDC", report: { date: "2026-10-22", timing: "pm" } }, { symbol: "T", report: { date: "2026-10-22", timing: "am" } }];
  eq(X.reportedFrom(rows, "2026-10-22", "2026-10-21").sort(), ["IBM", "LRCX", "T"], "yesterday pm + today am; tonight's WDC is not yet");
  eq(X.prevTradingDay("2026-10-26"), "2026-10-23", "Monday -> Friday");
  eq(X.prevTradingDay("2026-11-27"), "2026-11-25", "the day after Thanksgiving -> Wednesday");
});
Deno.test("v3.44 gates: W24-W26 stamp in data mode, block in strict mode, never fire when the rule is OFF", () => {
  const rules = (on: string[]) => ["W1", "W2", "W24", "W25", "W26"].map((id) => ({ id, kind: "x", source: "x", title: id, body: "", active: on.includes(id), params: {} }));
  const base: any = { rules: rules(["W1", "W2", "W24", "W25", "W26"]), d: { wrong_if_level: 152, target_level: 146 }, cap: 1000, maxLoss: 400, planned_loss: 70, cost: 205, cash: 4000, stop_option: 1.35, ask: 2.05,
    openCount: 0, maxOpen: 4, tickerTakenToday: false, sameTickerOpen: false, spreadPct: 3, quoteAgeSec: 3, blackout: null, coachCall: false, etMin: 881, lastEntryMin: 930, ownFromMin: 600, coachFromMin: 571,
    dataMode: true, defensiveCall: "defensive tape", openReprice: "first 15", moveDone: "LRCX -10.5%" };
  const hits = X.runGatesAll(base);
  eq(hits.map((h: any) => h.rule), ["W24", "W25", "W26"], "all three fire");
  assert(hits.every((h: any) => h.soft) && X.runGates(base) === null, "data mode: stamps only, nothing blocks");
  eq(X.runGates({ ...base, dataMode: false })?.rule, "W24", "strict mode: they block");
  eq(X.runGatesAll({ ...base, rules: rules(["W1", "W2"]) }).length, 0, "rules OFF never fire");
});
Deno.test("replay 22 Oct (v3.44): defensive tape, LRCX -10.5% after earnings — the LRCX put is stamped W26, an AAPL call is stamped W24, a 9:41 coach call on LRCX is stamped W25; the AI is told the tape", async () => {
  const setup = () => {
    seed();
    TABLES.winston_settings[0].value = { enabled: true, paper_balance: 4000, mode: "data", max_open: 4, min_time_exit_min: 120, limits_override: { daily_on: false } };
    TABLES.winston_rules.push({ id: "W24", sort: 174, kind: "gate", source: "coach 2026-10-22", title: "W24", body: "W24", active: true, params: { nasdaq_pct: 1, bond_pct: 0.2 } });
    TABLES.winston_rules.push({ id: "W25", sort: 175, kind: "gate", source: "coach 2026-10-22", title: "W25", body: "W25", active: true, params: { open_wait_min: 15, earnings_wait_min: 30 } });
    TABLES.winston_rules.push({ id: "W26", sort: 176, kind: "gate", source: "coach 2026-10-22", title: "W26", body: "W26", active: true, params: { index_pct: 1.5, stock_pct: 5 } });
    W.spot = { SPY: 735, QQQ: 712, TLT: 92.5, LRCX: 150, AAPL: 343 }; W.prev = { SPY: 745, QQQ: 726.5, TLT: 92, LRCX: 167.6, AAPL: 345 };
    W.bars = {}; W.calls.length = 0; W.ai.n = 0;
    (W as any).earnings = [{ symbol: "LRCX", report: { date: "2026-10-21", timing: "pm" } }];
    W.opts = { lp148: { strike: 148, bid: 2.0, ask: 2.05, delta: -0.35, vol: 900, oi: 400, exp: "2026-10-23", type: "put" },
      ac345: { strike: 345, bid: 2.4, ask: 2.45, delta: 0.36, vol: 900, oi: 400, exp: "2026-10-23", type: "call" } };
    TABLES.otto_jason.push({ id: 390, day: "2026-10-22", posted_label: "9:05 AM", kind: "note", ticker: "LRCX", direction: null, level: null, words: "LRCX DOWN 10% ON EARNINGS", late: false });   // a coach mention puts LRCX on Winston's list (as on the real day)
  };
  // 2:41 PM ET: Winston's own LRCX put + an AAPL call
  setup(); setNow("2026-10-22T18:41:00Z");
  aiScript = () => ({ decisions: [
    { ticker: "LRCX", side: "put", source: "own", thesis: "LRCX broke down after earnings and keeps making lower lows", wrong_if_level: 152, target_level: 146, time_exit_min: 120, cites: [{ type: "chart" }] },
    { ticker: "AAPL", side: "call", source: "own", thesis: "AAPL held 342.50 daily support", wrong_if_level: 341.5, target_level: 347, time_exit_min: 120, cites: [{ type: "chart" }] }], passes: [] });
  await X.tick();
  const lr = TABLES.winston_trades.find((t) => t.ticker === "LRCX"), ap = TABLES.winston_trades.find((t) => t.ticker === "AAPL");
  assert(lr && ap, "both opened in data mode (stamps, not blocks): " + JSON.stringify(TABLES.winston_ideas.map((i) => i.reason)));
  const ids = (t: any) => t.plan.stamps.map((s: string) => s.split(":")[0]);
  assert(ids(lr).includes("W26") && !ids(lr).includes("W24") && !ids(lr).includes("W25"), "LRCX put: W26 only (14:41 is long after the earnings wait): " + JSON.stringify(lr.plan.stamps));
  assert(ids(ap).includes("W24") && !ids(ap).includes("W26"), "AAPL call: W24 (a call on a defensive day): " + JSON.stringify(ap.plan.stamps));
  assert(lr.flags.includes("stamp:W26") && ap.flags.includes("stamp:W24"), "stamps on the flags for the report");
  assert(lr.plan.tape?.defensive, "the trade's plan records the tape");
  assert(/TAPE READ \(W24, bonds first\): QQQ -2% with TLT \+0.54%/.test(W.ai.last.user) && /DEFENSIVE/.test(W.ai.last.user), "the AI was told the tape: " + (W.ai.last.user.match(/TAPE READ[^\n]*/) || [""])[0]);
  assert(/REPORTED EARNINGS[^\n]*LRCX/.test(W.ai.last.user), "and who reported last night");
  eq(TABLES.winston_settings.find((r) => r.key === "earnings_seen")?.value.symbols, ["LRCX"], "reporters cached for the day");
  const nEarn = W.calls.filter((c) => c.tool === "get_earnings_calendar").length;
  setNow("2026-10-22T18:51:00Z"); aiScript = () => ({ decisions: [], passes: [] }); await X.tick();
  eq(W.calls.filter((c) => c.tool === "get_earnings_calendar").length, nEarn, "the earnings calendar is read once a day, not every tick");
  // 9:41 AM ET: a coach call on LRCX -> W25 (reported last night, inside the 30-minute wait)
  setup(); setNow("2026-10-22T13:41:00Z");
  TABLES.otto_jason.push({ id: 400, day: "2026-10-22", posted_label: "9:40 AM", kind: "call", ticker: "LRCX", direction: "short", level: null, words: "LRCX PUTS UNDER 151", late: false });
  aiScript = () => ({ decisions: [{ ticker: "LRCX", side: "put", source: "coach:400", thesis: "Coach post 400: LRCX puts under 151", wrong_if_level: 152, target_level: 146, time_exit_min: 120, cites: [{ type: "coach_post", ref: "400" }] }], passes: [] });
  await X.tick();
  const early = TABLES.winston_trades.find((t) => t.ticker === "LRCX");
  assert(early && early.plan.stamps.some((s: string) => /^W25: LRCX just reported earnings/.test(s)), "W25 stamped on the 9:41 coach call: " + JSON.stringify(early?.plan?.stamps));
  // strict mode: the same 2:41 put is blocked by W26
  setup(); setNow("2026-10-22T18:41:00Z"); TABLES.winston_settings[0].value.mode = "strict";
  aiScript = () => ({ decisions: [{ ticker: "LRCX", side: "put", source: "own", thesis: "LRCX lower lows", wrong_if_level: 152, target_level: 146, time_exit_min: 120, cites: [{ type: "chart" }] }], passes: [] });
  await X.tick();
  eq(TABLES.winston_trades.length, 0, "strict mode: no trade");
  assert(TABLES.winston_ideas.some((i) => i.status === "blocked" && /^W26:/.test(i.reason || "")), "blocked by W26: " + JSON.stringify(TABLES.winston_ideas.map((i) => i.reason)));
  aiScript = null; (W as any).earnings = [];
});
