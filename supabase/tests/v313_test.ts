// Otto v3.13 test suite — replays the failures from Tue 6 Oct 2026 against the new code.
// Run: deno test -A supabase/tests/v313_test.ts
// Nothing here touches the network: Supabase, Robinhood/TradingView and Claude are faked.

/* ---------------- fake clock (pinned to 6 Oct 2026, moved by tests) ---------------- */
const RealDate = Date;
let NOW = RealDate.parse("2026-10-06T15:51:30Z"); // 11:51:30 AM ET — the SPY fill
class FakeDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); }
  static now() { return NOW; }
}
(globalThis as any).Date = FakeDate;
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };

/* ---------------- fake Supabase (PostgREST subset) ---------------- */
const T: Record<string, any[]> = { otto_actions: [], otto_desk: [], otto_settings: [], otto_trades: [], otto_watch: [], otto_feedback: [] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function parse(path: string) {
  const [table, q = ""] = path.split("?");
  const params = new URLSearchParams(q);
  return { table, params };
}
function matches(row: any, params: URLSearchParams) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    if (k === "or") {
      // or=(exit_lock.is.null,exit_lock.lt.ISO)
      const m = /^\(exit_lock\.is\.null,exit_lock\.lt\.(.+)\)$/.exec(v);
      if (m) { if (!(row.exit_lock == null || row.exit_lock < m[1])) return false; continue; }
      continue;
    }
    const val = (key: string) => {           // col, col->>key, col->key->>key2
      const m = /^(\w+)(?:->(\w+))?->>(\w+)$/.exec(key);
      if (!m) return row[key];
      const base = row[m[1]] || {}; const obj = m[2] ? (base[m[2]] || {}) : base; return obj[m[3]];
    };
    if (v === "is.null") { if (val(k) != null) return false; continue; }
    if (v.startsWith("neq.")) { if (String(val(k)) === v.slice(4)) return false; continue; }
    if (v.startsWith("eq.")) { const want = decodeURIComponent(v.slice(3)); const have = k === "exit->>state" ? row.exit?.state : val(k); if (String(have) !== want) return false; }
    else if (v.startsWith("gte.")) { if (!(String(row[k]) >= v.slice(4))) return false; }
    else if (v.startsWith("lte.")) { if (!(String(row[k]) <= v.slice(4))) return false; }
    else if (v.startsWith("lt.")) { if (!(String(row[k]) < v.slice(3))) return false; }
    else if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(","); const have = val(k); if (!set.includes(String(have))) return false; }
  }
  return true;
}
let ID = 0;
async function fakeDb(path: string, init: RequestInit = {}) {
  const { table, params } = parse(path);
  const method = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const rows = T[table] ||= [];
  await sleep(5); // let concurrent runs interleave, like the real network
  if (method === "GET") return rows.filter((r) => matches(r, params));
  if (method === "POST") {
    if (params.get("on_conflict")) {
      const keys = params.get("on_conflict")!.split(",");
      const ignore = /ignore-duplicates/.test(String((init.headers as any)?.prefer || ""));
      const made: any[] = [];
      for (const b of [].concat(body) as any[]) {
        const i = rows.findIndex((r) => keys.every((k) => String(r[k]) === String(b[k])));
        if (i >= 0) { if (!ignore) rows[i] = { ...rows[i], ...b }; }
        else { const row = { id: b.id || ++ID, created_at: new Date().toISOString(), fired: {}, ...b }; rows.push(row); made.push({ ...row }); }
      }
      return ignore ? made : null;
    }
    const out = [].concat(body).map((b: any) => ({ id: b.id || `id-${++ID}`, created_at: new Date().toISOString(), ...b }));
    rows.push(...out);
    return out;
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => matches(r, params));
    await sleep(3);
    // re-check after the await so the update is atomic per row, like Postgres
    const still = hit.filter((r) => matches(r, params));
    still.forEach((r) => Object.assign(r, body));
    return still.map((r) => ({ ...r }));
  }
  return [];
}

/* ---------------- fake Robinhood / TradingView ---------------- */
import { SPY_5M, NVDA_5M, toRh } from "./fixtures_2026-10-06.ts";
const FIX: Record<string, any> = { SPY: toRh("SPY", SPY_5M), NVDA: toRh("NVDA", NVDA_5M) };
const ACCT = "945257012";
const OPT = "opt-spy-781c-1009";
let orders: any[] = [];
let calls: { tool: string; args: any }[] = [];
let quote = { delta: "0.527", volume: 6911, open_interest: 2898 };
let callHook: ((tool: string, args: any) => any) | null = null;   // v3.16 tests: per-test Robinhood answers
async function fakeCall(service: string, tool: string, args: any) {
  calls.push({ tool, args });
  await sleep(4);
  const j = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
  if (callHook) { const h = callHook(tool, args); if (h) return j(h); }
  switch (tool) {
    case "get_accounts": return j({ data: { accounts: [{ account_number: ACCT, agentic_allowed: true }, { account_number: "650006166", agentic_allowed: false }] } });
    case "get_portfolio": return j({ data: { total_value: "1196.91" } });
    case "get_option_orders": {
      if (args.order_id) return j({ data: { orders: orders.filter((o) => o.id === args.order_id) } });
      return j({ data: { orders } });
    }
    case "place_option_order": {
      const working = orders.some((o) => ["queued", "confirmed"].includes(o.state) && o.legs[0].side === "sell");
      if (args.type === "stop_market" && working) throw new Error('API error 400: {"detail":"This order is invalid because you do not have enough contracts to close your position."}');
      const o = { id: "ord-" + (++ID), state: "confirmed", type: args.type, stop_price: args.stop_price, legs: args.legs.map((l: any) => ({ ...l })) };
      orders.push(o);
      return j({ data: { order: { id: o.id } } });
    }
    case "get_option_positions": return j({ data: { positions: [{ type: "long", quantity: "1", option_id: OPT }] } });
    case "get_option_instruments": return j({ data: { instruments: [{ id: OPT, expiration_date: "2026-10-09", chain_symbol: "SPY" }] } });
    case "get_option_quotes": return j({ data: { results: [{ quote }] } });
    case "review_option_order": return j({ ok: true, review: "fine" });
    case "get_earnings_calendar": return j({ data: { results: [] } });
    case "mcp-tv-create-alert": return j({ alert_id: 1000 + (++ID) });
    case "mcp-tv-get-economic-calendar": return j({ events: [] });
    case "get_realized_pnl": return j({ data: { data_points: [] } });
    case "get_equity_historicals": return j({ data: { results: (args.symbols || []).map((sy: string) => FIX[sy]).filter(Boolean) } });
    default: return j({});
  }
}

/* ---------------- fake Claude (SSE) ---------------- */
let claudeScript: ((body: any) => any[]) | null = null;
const claudeBodies: any[] = [];
function sse(events: any[]) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(enc.encode("data: " + JSON.stringify(e) + "\n\n")); c.close(); } }), { status: 200 });
}
const textReply = (t: string) => [
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } },
  { type: "message_delta", delta: { stop_reason: "end_turn" } }];
const toolReply = (name: string, input: any) => [
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu" + (++ID), name, input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
  { type: "message_delta", delta: { stop_reason: "tool_use" } }];

const pings: { kind: string; title: string; body: string }[] = [];
let extractHook: ((text: string) => any[]) | null = null;
(globalThis as any).__OTTO_TEST__ = {
  db: fakeDb, call: fakeCall,
  notify: (kind: string, title: string, body: string) => pings.push({ kind, title, body }),
  extract: (text: string) => (extractHook ? extractHook(text) : []),
  claude: async (body: any) => { claudeBodies.push(body); if (!claudeScript) return sse(textReply("ok")); const ev = claudeScript(body); if (ev instanceof Error) throw ev; return sse(ev); },
};
(globalThis as any).fetch = (u: any) => /brain-latest\.json/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify([{ call: { date: "2026-10-01", title: "t" }, rules: [], setups: [], levels: [], _transcript: "x" }]))) : Promise.reject(new Error("network disabled in tests"));
(Deno as any).serve = () => ({ finished: Promise.resolve() });

const M = await import("../otto-proxy.ts");

function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
function reset() {
  T.otto_actions = []; T.otto_desk = []; T.otto_settings = []; T.otto_trades = []; T.otto_watch = [];
  T.otto_checks = []; T.otto_jason = []; T.otto_signal_batches = []; T.otto_signal_msgs = []; T.otto_signal_imgs = [];
  orders = []; calls = []; claudeBodies.length = 0; claudeScript = null; callHook = null; extractHook = null; pings.length = 0;
  quote = { delta: "0.527", volume: 6911, open_interest: 2898 };
}
const deskText = () => T.otto_desk.map((r) => `[${r.author}] ${r.content}`).join("\n");

/* =============================== 1. CLOCK =============================== */
Deno.test("clock: 12:28 PM ET Tuesday is OPEN, Tuesday Oct 6, this Friday = Oct 9", () => {
  const c = M.marketClock(new RealDate("2026-10-06T16:28:00Z") as any);
  assert(c.status === "open", "status " + c.status);
  assert(c.line.includes("Tuesday, Oct 6, 2026, 12:28 PM ET"), c.line);
  assert(c.line.includes("3h 32m left"), c.line);
  assert(c.thisExp === "2026-10-09" && c.nextExp === "2026-10-16", c.thisExp + " " + c.nextExp);
  assert(!/Oct 7/.test(c.line), "never Oct 7");
});
Deno.test("clock: pre-market, first 30 minutes, after hours, weekend, holiday, half day", () => {
  assert(M.marketClock(new RealDate("2026-10-06T11:13:00Z") as any).status === "pre", "7:13 AM is pre-market");
  const f30 = M.marketClock(new RealDate("2026-10-06T13:40:00Z") as any);
  assert(f30.status === "open" && f30.line.includes("first 30 minutes"), f30.line);
  const after = M.marketClock(new RealDate("2026-10-06T20:30:00Z") as any);
  assert(after.status === "after" && after.line.includes("Wednesday, Oct 7"), after.line);
  const sat = M.marketClock(new RealDate("2026-10-10T15:00:00Z") as any);
  assert(sat.status === "closed" && sat.line.includes("Monday, Oct 12"), sat.line);
  const tg = M.marketClock(new RealDate("2026-11-26T15:00:00Z") as any);
  assert(tg.status === "closed" && tg.line.includes("holiday"), tg.line);
  const half = M.marketClock(new RealDate("2026-11-27T18:30:00Z") as any); // 1:30 PM ET on the half day
  assert(half.status === "after", "half day closes at 1 PM: " + half.status);
  const gf = M.marketClock(new RealDate("2027-03-24T15:00:00Z") as any); // Good Friday week → Thursday expiry
  assert(gf.thisExp === "2027-03-25", "Good Friday week expiry " + gf.thisExp);
});
Deno.test("clock: Robinhood UTC timestamps get their ET time written next to them", () => {
  const out = M.etAnnotate(`{"updated_at":"2026-10-06T16:08:00Z","begins_at":"2026-10-06T14:35:00.000000Z","prev":"2026-10-05T20:00:00+00:00","time":1759761300}`,
    new RealDate("2026-10-06T16:30:00Z") as any);
  assert(out.includes("16:08:00Z (= 12:08 PM ET)"), out);
  assert(out.includes("(= 10:35 AM ET)"), out);
  assert(out.includes("(= Mon Oct 5 4:00 PM ET)"), out);
  assert(/1759761300 \/\* = .*ET \*\//.test(out), out);
});

/* =============================== 2. EXIT ENGINE =============================== */
function filledTrade() {
  orders.push({ id: "entry-1", state: "filled", processed_quantity: "1", price: "3.50",
    legs: [{ option_id: OPT, side: "buy", position_effect: "open", executions: [{ price: "3.44", quantity: "1" }] }] });
  const a = { id: "card-spy", title: "Buy 1 SPY 781C 10/9 @ $3.50", status: "done", decided_at: "2026-10-06T15:51:20Z", created_at: "2026-10-06T15:51:00Z",
    exit: { state: "waiting_fill", order_id: "entry-1", option_id: OPT, qty: 1, entry_limit: 3.5, stop_option: 2.0, tv_symbol: "AMEX:SPY", direction: "up", wrong_if: 778.6, tp1: 784.5, log: [] } };
  T.otto_actions.push(a);
  return a;
}
Deno.test("exits: 3 runs on the same fill at once (cron + Approve + panel) → ONE stop, no false NO-stop alarm", async () => {
  reset(); setNow("2026-10-06T15:51:35Z");
  const a = filledTrade();
  const res = await Promise.all([M.exitTick({ ...a }), M.exitTick({ ...a }), M.exitTick({ ...a })]);
  const stops = calls.filter((c) => c.tool === "place_option_order" && c.args.type === "stop_market");
  assert(stops.length === 1, "stop orders placed: " + stops.length);
  assert(!/NO stop/.test(deskText()), "false alarm on the Desk:\n" + deskText());
  assert((deskText().match(/filled at \$3\.44/g) || []).length === 1, "one fill message:\n" + deskText());
  assert(res.filter((r: any) => r.skipped).length === 2, "two runs skipped: " + JSON.stringify(res));
  assert(T.otto_actions[0].exit.state === "armed" && T.otto_actions[0].exit.stop_order_id, "armed with a stop id");
  assert(T.otto_actions[0].exit_lock === null, "lock released");
});
Deno.test("exits: a stop already working is adopted, never re-placed or alarmed", async () => {
  reset(); setNow("2026-10-06T15:52:00Z");
  const a = filledTrade();
  orders.push({ id: "stop-existing", state: "confirmed", type: "stop_market", stop_price: "2.00", legs: [{ option_id: OPT, side: "sell", position_effect: "close" }] });
  await M.exitTick({ ...a });
  const stops = calls.filter((c) => c.tool === "place_option_order" && c.args.type === "stop_market");
  assert(stops.length === 0, "no second stop");
  assert(T.otto_actions[0].exit.stop_order_id === "stop-existing", "adopted " + T.otto_actions[0].exit.stop_order_id);
  assert(!/NO stop/.test(deskText()), deskText());
  assert(/Stop on at \$2\.00/.test(deskText()), "fill message says the stop is on:\n" + deskText());
});
Deno.test("exits: a crashed run's stale lock (>90 s) doesn't freeze the trade", async () => {
  reset(); setNow("2026-10-06T15:55:00Z");
  const a = filledTrade();
  T.otto_actions[0].exit_lock = "2026-10-06T15:50:00.000Z";
  const r: any = await M.exitTick({ ...a });
  assert(!r.skipped && T.otto_actions[0].exit.state === "armed", JSON.stringify(r));
});

/* =============================== 3. GUARDRAILS =============================== */
const spyCard = () => ({
  title: "Buy 1 SPY 781C 10/9 @ $3.50", summary: "test",
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: OPT, side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "3.50", time_in_force: "gfd" } }],
  plan: { tv_symbol: "AMEX:SPY", direction: "up", setup: "trend continuation", tp1: 784.5, stop: 778.6, stop_option: 2.0, expires: "2026-10-09" },
});
Deno.test("guardrails: today's SPY card ($144 at the stop on a $1,197 account) is BUILT with a red flag, not blocked", async () => {
  reset(); setNow("2026-10-06T15:51:00Z");
  const card: any = await M.proposeAction(spyCard(), "ottotrader@vinecreativestudio.com");
  assert(card && card.status === "pending", "card created");
  const flags = card.checks.filter((c: any) => c.ok === false).map((c: any) => c.text);
  assert(flags.some((t: string) => /OVER your 10% max, \$120/.test(t)), "loss-at-stop flag: " + JSON.stringify(flags));
  assert(flags.some((t: string) => /Delta 0\.53/.test(t)), "delta flagged: " + JSON.stringify(flags));
  assert(!card.checks.some((c: any) => /Jason/.test(c.text)), "no name in checks");
});
Deno.test("guardrails: daily stop after 2 losing Agentic trades — flagged, still built", async () => {
  reset(); setNow("2026-10-06T17:30:00Z");
  T.otto_trades.push({ id: "t1", account: "Agentic ••7012", pnl: -53, closed_at: "2026-10-06T16:29:00Z" },
    { id: "t2", account: "Agentic ••7012", pnl: -20, closed_at: "2026-10-06T17:00:00Z" },
    { id: "t3", account: "Individual ••6166", pnl: -500, closed_at: "2026-10-06T17:00:00Z" });
  const c: any[] = await M.limitChecks(100, 50);
  const d = c.find((x) => /DAILY STOP/.test(x.text));
  assert(d && d.ok === false, JSON.stringify(c));
  assert(/2 losing trades today, \$-73/.test(d.text), d.text);
});
Deno.test("guardrails: first 30 minutes is fine (not red) on a pre-posted Signal level", async () => {
  reset(); setNow("2026-10-06T13:35:00Z");
  const out = [{ tool: "place_option_order", args: { legs: [{ option_id: OPT, side: "buy", position_effect: "open" }] } }];
  const a = await M.ruleChecks(out, { signal_level: true, direction: "up" }, {}, null);
  const b = await M.ruleChecks(out, { direction: "up" }, {}, null);
  assert(a.find((x: any) => /first 30/.test(x.text)).ok === null, JSON.stringify(a[0]));
  assert(b.find((x: any) => /first 30/.test(x.text)).ok === false, JSON.stringify(b[0]));
});

/* =============================== 4. JARVIS RUNS =============================== */
const run = (o: any) => M.runDesk({ msgs: [{ role: "user", content: "hi" }], sys: "SYS", tools: [], cs: [], who: "t", send: () => {}, allowPropose: false, ...o });
Deno.test("jarvis: every run carries the clock, the guardrail rule and the House Rules", async () => {
  reset(); setNow("2026-10-06T16:28:00Z");
  await run({});
  const sys = claudeBodies[0].system;
  assert(sys[1].text.includes("Tuesday, Oct 6, 2026, 12:28 PM ET") && sys[1].text.includes("OPEN"), sys[1].text.slice(0, 300));
  assert(sys[1].text.includes("HOUSE RULES") && sys[1].text.includes("Intraday only"), "house rules present");
  assert(/NEVER BLOCK/.test(sys[0].text) && /Never say "I'm watching"/.test(sys[0].text), "guard rule present");
  assert(sys[0].cache_control && !sys[1].cache_control, "clock block is outside the cache");
});
Deno.test("jarvis: tool results get ET times and a clock line every round", async () => {
  reset(); setNow("2026-10-06T16:28:00Z");
  let n = 0;
  claudeScript = () => (n++ === 0 ? toolReply("rh__get_option_orders", {}) : textReply("done"));
  // allow the tool through the read allowlist
  orders.push({ id: "x", state: "filled", updated_at: "2026-10-06T16:11:00Z", legs: [] });
  await run({});
  const second = claudeBodies[1].messages.at(-1).content;
  const tr = second.find((b: any) => b.type === "tool_result");
  assert(/16:11:00Z \(= 12:11 PM ET\)/.test(tr.content), tr.content.slice(0, 300));
  assert(second.some((b: any) => b.type === "text" && /clock: 12:28 PM ET Tue 2026-10-06, market OPEN/.test(b.text)), JSON.stringify(second.at(-1)));
});
Deno.test("jarvis: a slow turn ends with a visible out-of-time note instead of silence", async () => {
  reset(); setNow("2026-10-06T14:03:00Z");
  claudeScript = () => { NOW += 60_000; return toolReply("rh__get_option_orders", {}); }; // every round eats a minute
  const r: any = await run({});
  assert(r.timedOut && /ran out of time/.test(r.said), JSON.stringify(r));
});
Deno.test("jarvis: a standing instruction is saved to the House Rules", async () => {
  reset(); setNow("2026-10-06T16:51:00Z");
  let n = 0;
  claudeScript = () => (n++ === 0 ? toolReply("save_house_rule", { text: "Watch 5m and 10m candles for entries." }) : textReply("Saved."));
  await run({ author: "Josh" });
  const list = await M.houseRules();
  assert(list.some((r: any) => /5m and 10m/.test(r.text) && /Josh/.test(r.by)), JSON.stringify(list.slice(-1)));
  assert(/House rule saved/.test(deskText()), deskText());
});
Deno.test("jarvis: Desk failure is posted on the Desk (no more silent 10:03–10:06)", async () => {
  reset(); setNow("2026-10-06T14:03:54Z");
  claudeScript = () => new Error("claude HTTP 529 overloaded") as any;
  const req = new Request("https://x/?fn=desk", { method: "POST", body: JSON.stringify({ author: "Josh", messages: [{ role: "user", content: "Any setups on the other MAG7 and QQQ" }] }) });
  const res = await M.desk(req, "ottotrader@vinecreativestudio.com", "k");
  await res.text();
  assert(/Jarvis couldn't answer Josh's last message \(Claude is overloaded/.test(deskText()), deskText());
});

/* =============================== 5. ROUTES =============================== */
// Added after the first v3.13 deploy: house_rules_get answered "unknown fn" because it was
// missing from the Desk route allow-list. Every route the Desk block handles must be listed.
Deno.test("routes: every Desk route is in the signed-in allow-list", async () => {
  const src = await Deno.readTextFile(new URL("../otto-proxy.ts", import.meta.url));
  const i = src.indexOf('if (["desk", "act", "panel"');
  const list = src.slice(i, src.indexOf("].includes(fn)", i));
  const allowed = new Set([...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  const blockEnd = src.indexOf('if (fn === "market")', i);
  const handled = [...src.slice(i, blockEnd).matchAll(/fn === "([a-z_]+)"/g)].map((m) => m[1]);
  const missing = handled.filter((f) => !allowed.has(f));
  assert(missing.length === 0, "routes handled but not allowed: " + missing.join(", "));
});


/* =============================== v3.14 WATCHER + SCOREBOARD =============================== */
const at = (hhmmss: string) => RealDate.parse(`2026-10-06T${hhmmss}Z`);
const spyBars = () => M.parseRhBars({ data: { results: [FIX.SPY] } }).SPY;
const nvdaBars = () => M.parseRhBars({ data: { results: [FIX.NVDA] } }).NVDA;
function replay(level: number, d: "up" | "down", bars: any[], earliest: number, from = "13:31:00", to = "15:30:00", rearm = true) {
  const hits: string[] = []; let firedAt = 0;
  for (let t = at(from); t <= at(to); t += 60e3) {
    if (firedAt && (!rearm || t - firedAt < 15 * 60e3)) continue;
    const h = M.evalLevel(level, d, bars, 5, { now: t, earliestMin: earliest });
    if (h) { hits.push(`${new RealDate(t).toISOString().slice(11, 16)} ${h.trigger}`); firedAt = t; }
  }
  return hits;
}
Deno.test("watcher replay, real 6 Oct bars: SPY 778.60 Signal level — break at 9:45, then the 10:30 pullback-and-hold", () => {
  const hits = replay(778.60, "up", spyBars(), 575);
  // 13:45Z = 9:45 ET (the 9:40 bar closed 778.65 over 778.60); 14:35Z = 10:35 ET (the 10:30 bar: low 778.565, closed green 779.18).
  assert(hits[0] === "13:45 break", JSON.stringify(hits));
  assert(hits.includes("14:35 pullback-hold"), JSON.stringify(hits));
});
Deno.test("watcher replay: the bar right after a break is NOT a pullback (price must move away first)", () => {
  const hits = replay(778.60, "up", spyBars(), 575, "13:46:00", "14:20:00", false);
  assert(!hits.some((h) => /pullback/.test(h)), JSON.stringify(hits));
});
Deno.test("watcher replay: a Desk level waits until 10:00 — first trigger is the 10:35 pullback-and-hold", () => {
  const hits = replay(778.60, "up", spyBars(), 600);
  assert(hits[0] === "14:35 pullback-hold", JSON.stringify(hits));
});
Deno.test("watcher replay: NVDA 242 is flagged as chop (many crossings)", () => {
  const n = M.crossings(242, nvdaBars());
  assert(n === 6, "crossings " + n);   // 9:30–11:30 ET closes crossed 242 six times (≥ 4 = chop warning)
});
Deno.test("watcher: stale bars never fire late (a missed cron minute)", () => {
  const h = M.evalLevel(778.60, "up", spyBars(), 5, { now: at("13:55:00"), earliestMin: 575 });
  assert(h === null, JSON.stringify(h));
});
Deno.test("watcher: Signal words become levels with a side", () => {
  const a = M.levelsFromWords("SPY ABOVE 778.60 GO / SUPPORT 776 AND 775");
  assert(JSON.stringify(a) === JSON.stringify([{ level: 778.6, dir: "up" }, { level: 776, dir: "up" }, { level: 775, dir: "up" }]), JSON.stringify(a));
  const b = M.levelsFromWords("NVDA BELOW 240 PUTS", "down");
  assert(b.length === 1 && b[0].level === 240 && b[0].dir === "down", JSON.stringify(b));
  assert(M.levelsFromWords("AMD PLAYING OUT").length === 0, "no numbers, no levels");
});
Deno.test("watcher tick: two overlapping cron runs fire ONE trigger; Desk line posted; Jarvis asked", async () => {
  reset(); setNow("2026-10-06T13:45:30Z");
  T.otto_watch.push({ id: 7, day: "2026-10-06", ticker: "SPY", level: 778.6, dir: "up", source: "signal", status: "watching", fired: {} });
  claudeScript = () => textReply("Checked it. READ: SPY broke 778.60 on the 9:40 bar. No card — first 30 minutes and the banner is mixed.");
  const [a, b] = await Promise.all([M.watchTick(NOW), M.watchTick(NOW)]);
  const hits = [...(a.hits || []), ...(b.hits || [])];
  assert(hits.length === 1 && /SPY 778.6 up break/.test(hits[0]), JSON.stringify([a, b]));
  await sleep(150);
  assert(/👁 Watcher\] SPY 778.6 — break-and-close/.test(deskText()), deskText());
  assert(/Jarvis · watcher\] For: 👁 SPY 778.6 ▲ break-and-close\nSPY broke 778.60/.test(deskText()), deskText());
  assert(T.otto_watch[0].fired.up.read && !T.otto_watch[0].fired.up.cards.length, JSON.stringify(T.otto_watch[0].fired));
});
Deno.test("watcher tick: a passed trigger re-arms after 15 min and the 10:30 bounce fires", async () => {
  reset(); setNow("2026-10-06T14:35:20Z");
  T.otto_watch.push({ id: 8, day: "2026-10-06", ticker: "SPY", level: 778.6, dir: "up", source: "signal", status: "watching",
    fired: { up: { at: "2026-10-06T13:45:30.000Z", trigger: "break", read: "no card", cards: [] } } });
  claudeScript = () => textReply("READ: Held 778.60 and closed green. No card in this test.");
  const r: any = await M.watchTick(NOW);
  assert(r.hits?.[0] === "SPY 778.6 up pullback-hold", JSON.stringify(r));
  assert(T.otto_watch[0].fired.up.passed?.[0]?.trigger === "break", JSON.stringify(T.otto_watch[0].fired));
});
Deno.test("watcher tick: a level that already produced a card never fires again that day", async () => {
  reset(); setNow("2026-10-06T14:35:20Z");
  T.otto_watch.push({ id: 9, day: "2026-10-06", ticker: "SPY", level: 778.6, dir: "up", source: "signal", status: "watching",
    fired: { up: { at: "2026-10-06T13:45:30.000Z", trigger: "break", read: "card", cards: ["c1"] } } });
  const r: any = await M.watchTick(NOW);
  assert(!(r.hits || []).length, JSON.stringify(r));
});
Deno.test("scoreboard: the 10:35 SPY call idea is a WIN (TP1 780.50 touched 10:55); the mirror put is a LOSS on the 15-min close", () => {
  const win: any = M.gradeIdea({ created: at("14:35:40"), direction: "up", tp1: 780.5, wrong: 778.4, delta: 0.52, premium: 3.6 }, spyBars(), at("15:30:00"));
  assert(win.state === "win" && new RealDate(win.at).toISOString().slice(11, 16) === "14:55", JSON.stringify(win));
  assert(win.pnl_est > 0, JSON.stringify(win));
  const loss: any = M.gradeIdea({ created: at("14:35:40"), direction: "down", tp1: 778.0, wrong: 780.0, delta: 0.5, premium: 3.0 }, spyBars(), at("15:30:00"));
  assert(loss.state === "loss" && loss.pnl_est < 0 && loss.pnl_est >= -300, JSON.stringify(loss));
});
Deno.test("scoreboard: cards carry their source and Watcher trigger", async () => {
  reset(); setNow("2026-10-06T14:35:40Z");
  const c1: any = await M.proposeAction(spyCard(), "watcher", { planExtra: { source: "signal", trigger: "pullback-hold", watch_id: 8 } });
  const c2: any = await M.proposeAction(spyCard(), "ottotrader@vinecreativestudio.com");
  assert(c1.plan.source === "signal" && c1.plan.trigger === "pullback-hold" && c1.plan.watch_id === 8, JSON.stringify(c1.plan));
  assert(c2.plan.source === "desk" && !c2.plan.trigger, JSON.stringify(c2.plan));
});

/* =============================== v3.15 PLAYBOOK + DAILY RECAP + FEEDBACK =============================== */
const idea = (rules: string[], state: string, r: number, setup = "support bounce", trigger?: string) => ({
  id: "i" + (++ID), created_at: new Date().toISOString(), status: "done",
  calls: [{ tool: "place_option_order", args: { legs: [{ position_effect: "open" }] } }],
  plan: { setup, rules, ...(trigger ? { trigger } : {}) }, outcome: { state, r } });
Deno.test("playbook: cleanRules keeps only real book ids, max 6", () => {
  const r = M.cleanRules(["t-1", "T-2", "X-9", "D-1", "M-2", "T-3", "T-4", "T-5", "T-1"]);
  assert(JSON.stringify(r) === JSON.stringify(["T-1", "T-2", "D-1", "M-2", "T-3", "T-4"]), JSON.stringify(r));
  assert(M.cleanRules("T-1, D-4").join() === "T-1,D-4" && M.cleanRules(null).length === 0, "string / null");
});
Deno.test("playbook: a rule is WEAK only after 20 graded trades with average R below 0", () => {
  const ideas: any[] = [];
  for (let i = 0; i < 19; i++) ideas.push(idea(["T-1"], i < 5 ? "win" : "loss", i < 5 ? 1 : -1, "breakout", "break"));
  let st: any = M.playbookStats(ideas);
  assert(st.records["T-1"].scored === 19 && !st.records["T-1"].weak && st.records["T-1"].leads === "material", JSON.stringify(st.records["T-1"]));
  ideas.push(idea(["T-1"], "loss", -1, "breakout", "break"));
  st = M.playbookStats(ideas);
  assert(st.records["T-1"].weak && st.records["setup:breakout"].weak && st.records["trigger:break"].weak, JSON.stringify(st.records));
  assert(st.weak.length === 3 && st.weak.some((w: any) => /T-1/.test(w.label)), JSON.stringify(st.weak));
  // a winning rule with 20 trades leads on results but is not weak
  const good = Array.from({ length: 20 }, (_, i) => idea(["M-2"], i % 2 ? "win" : "loss", i % 2 ? 2 : -1));
  const g: any = M.playbookStats(good).records["M-2"];
  assert(!g.weak && g.leads === "results" && g.avg_r > 0, JSON.stringify(g));
});
Deno.test("playbook: every Jarvis run gets the book rules and the weak list; cards keep their rule ids", async () => {
  reset(); T.otto_settings = [];
  for (let i = 0; i < 20; i++) T.otto_actions.push(idea(["D-1"], "loss", -1));
  await M.playbookRefresh("test");
  const txt = await M.playbookText();
  assert(/T-1 \[Tharp\]/.test(txt) && /M-6 \[McMillan\]/.test(txt) && /RESULTS SAY WEAK[\s\S]*D-1/.test(txt), txt.slice(0, 400));
  T.otto_actions = [];
  const card: any = await M.proposeAction({ ...spyCard(), plan: { ...spyCard().plan, rules: ["T-1", "nope", "m-2"] } }, "ottotrader@vinecreativestudio.com");
  assert(JSON.stringify(card.plan.rules) === '["T-1","M-2"]', JSON.stringify(card.plan));
  const log = T.otto_settings.find((r: any) => r.key === "playbook_log")?.value?.items || [];
  assert(log.some((x: any) => x.kind === "weak") && log.some((x: any) => x.kind === "books"), JSON.stringify(log));
});
Deno.test("daily recap: posts one Desk note and runs once per trading day", async () => {
  reset(); T.otto_settings = []; T.otto_feedback = []; setNow("2026-10-06T21:15:30Z"); // 5:15 PM ET
  T.otto_desk.push({ id: 1, created_at: "2026-10-06T14:40:00Z", role: "user", author: "Josh", content: "Should I move the stop up?" });
  T.otto_feedback.push({ id: 1, created_at: "2026-10-06T19:00:00Z", kind: "bug", note: "NVDA card said Friday expiry", author: "Josh", screen: "Desk" });
  claudeScript = (body: any) => { assert(/Should I move the stop up/.test(body.messages[0].content) && /NVDA card said Friday/.test(body.messages[0].content), "recap input"); return textReply("### Today in one line\nOne question about the stop."); };
  await M.dailyRecap(false);
  const notes = T.otto_desk.filter((r) => r.author === "Jarvis · daily recap");
  assert(notes.length === 1 && /Today in one line/.test(notes[0].content), deskText());
  const again: any = await M.dailyRecap(false);
  assert(again.skipped === "already done" && T.otto_desk.filter((r) => r.author === "Jarvis · daily recap").length === 1, JSON.stringify(again));
});

/* =============================== v3.16 SIGNALS + HONEST JARVIS (replays of 6 Oct) =============================== */
// A fake Robinhood for MU at $1,053.77 with $1,140.82 buying power (the 3:12 PM "SHORTED. SEE THE BREAK" moment).
const MU_SPOT = 1053.77, BP = 1140.82;
const MU_EXPS = ["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"];
function muHook(spot = MU_SPOT, sym = "MU") {
  const strikes: number[] = []; for (let k = 5; k <= 2000; k += 5) strikes.push(k);
  const inst = (exp: string, type: string, k: number) => ({ id: `${sym}-${exp}-${type}-${k}`, chain_symbol: sym, expiration_date: exp, strike_price: k.toFixed(4), type, state: "active", tradability: "tradable" });
  return (tool: string, args: any) => {
    if (tool === "get_equity_quotes") return { data: { results: [{ quote: { symbol: sym, last_trade_price: String(spot), venue_last_trade_time: new Date().toISOString() } }] } };
    if (tool === "get_option_chains") return { data: { chains: [{ symbol: sym, can_open_position: true, expiration_dates: MU_EXPS }] } };
    if (tool === "get_portfolio") return { data: { total_value: String(BP), buying_power: { buying_power: String(BP) } } };
    if (tool === "get_option_instruments" && args.chain_symbol) {
      // Like Robinhood: 100 strikes a page from the bottom; the cursor is base64("p=<strike>").
      const from = args.cursor ? Number(atob(args.cursor).slice(2)) : 0;
      const list = strikes.filter((k) => k > from).slice(0, 100).map((k) => inst(args.expiration_dates, args.type, k));
      return { data: { instruments: list } };
    }
    if (tool === "get_option_quotes") {
      return { data: { results: (args.instrument_ids || []).map((id: string) => {
        const [, exp, type, ks] = id.split("-").length === 4 ? id.split("-") : [null, id.split("-").slice(1, 4).join("-"), id.split("-")[4], id.split("-")[5]];
        const k = Number(ks), m = (k - spot) * (type === "put" ? 1 : -1), t = 1 + MU_EXPS.indexOf(exp) * 0.25;
        const delta = Math.max(0.03, Math.min(0.97, 0.5 + m / 90)) * (type === "put" ? -1 : 1);
        const ask = Math.max(0.3, (20 + m * 0.55) * t);
        return { quote: { instrument_id: id, ask_price: ask.toFixed(2), bid_price: (ask - 0.3).toFixed(2), mark_price: (ask - 0.15).toFixed(2), delta: delta.toFixed(3), volume: 3000, open_interest: 1500 } };
      }) } };
    }
    return null;
  };
}
const optIdIn = (body: any) => { const t = JSON.stringify(body.messages); const m = /option_id (MU-[0-9-]+-put-\d+)/.exec(t); return m?.[1]; };

Deno.test("shortlist: MU puts start at the money (cursor), not at $5; ★ by the rules, ◆ fits $1,140 buying power", async () => {
  reset(); setNow("2026-10-06T19:12:55Z"); callHook = muHook();
  const sl: any = await M.optionShortlist("MU", "put");
  const inst = calls.filter((c) => c.tool === "get_option_instruments");
  assert(inst.length === 3 && inst.every((c) => c.args.cursor && Number(atob(c.args.cursor).slice(2)) > 980), JSON.stringify(inst.map((c) => c.args)));
  assert(sl.exps.join() === "2026-10-07,2026-10-09,2026-10-12", sl.exps.join());
  assert(sl.rows.every((r: any) => r.strike > 990 && r.strike < 1120), "near the money only");
  assert(sl.best && Math.abs(sl.best.delta) >= 0.3 && Math.abs(sl.best.delta) <= 0.4, JSON.stringify(sl.best));
  assert(sl.bestFit && sl.bestFit.cost <= BP, JSON.stringify(sl.bestFit));
  assert(/★/.test(sl.text) && /◆|fits/.test(sl.text) && /buying power \$1140\.82/.test(sl.text), sl.text.slice(0, 400));
});
Deno.test("pickContracts: when nothing in the delta band fits, ◆ is the closest affordable contract below the band", () => {
  const row = (k: number, d: number, cost: number) => ({ option_id: "o" + k, exp: "2026-10-09", strike: k, type: "put", bid: 1, ask: cost / 100, mark: 1, delta: -d, vol: 10, oi: 5, cost, fits: cost <= 1140, band: d >= .3 && d <= .4, liq: true, label: "MU " + k });
  const { best, bestFit } = M.pickContracts([row(1040, .44, 2300), row(1030, .36, 1700), row(1020, .29, 1200), row(1010, .24, 900), row(990, .12, 300)] as any);
  assert(best.strike === 1030 && bestFit.strike === 1010, JSON.stringify({ best, bestFit }));
});

// Replays batch #8 (6 Oct, 3:12 PM): a live MU short call. Jarvis keeps browsing; the last step is forced to the card.
function seedMuBatch(words = "SHORTED. SEE THE BREAK / OR MISS IT") {
  T.otto_jason.push({ id: 801, created_at: "2026-10-06T19:12:54Z", day: "2026-10-06", posted_at: "2026-10-06T19:12:40Z", posted_label: "3:12 PM", kind: "call", ticker: "MU", direction: "short", late: false, words, source: "watcher" });
  T.otto_signal_batches.push({ id: 8, created_at: "2026-10-06T19:12:54Z", day: "2026-10-06", msg_ids: ["m1"], rows: [801], status: "jarvis" });
}
Deno.test("signal replay (MU 3:12 PM): the server pre-fetches the contracts and the call ALWAYS ends in a card + ping", async () => {
  reset(); setNow("2026-10-06T19:12:55Z"); callHook = muHook(); seedMuBatch();
  let forced = false;
  claudeScript = (body: any) => {
    assert(/PRE-FETCHED BY THE SERVER/.test(JSON.stringify(body.messages[0])), "prefetch in the prompt");
    if (body.tool_choice?.name === "propose_action") {
      forced = true;
      const id = optIdIn(body);
      return toolReply("propose_action", { title: "Buy 1 MU 1020P 10/7 @ 10.00", summary: "test", plan: { tv_symbol: "NASDAQ:MU", direction: "down", setup: "otto signal", jason_id: 801, tp1: 1040, stop: 1060, stop_option: 6, expires: "2026-10-07" },
        calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: id, side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "10.00", time_in_force: "gfd" } }] });
    }
    return toolReply("rh__get_option_instruments", { chain_symbol: "MU", expiration_dates: "2026-10-16", type: "put" });   // the 6 Oct habit
  };
  await M.signalJarvis(8);
  const b = T.otto_signal_batches[0];
  assert(forced, "last step forced to propose_action");
  assert(b.status === "done" && b.cards.length === 1, JSON.stringify(b));
  assert(T.otto_jason[0].action_id === b.cards[0], "card linked to the call");
  assert(!/enormous|Let me/.test(b.read || ""), "no working notes in the feed: " + b.read);
  assert(pings.some((p) => /Card ready: MU SHORT/.test(p.title)), JSON.stringify(pings));
  assert(b.timing && b.timing.cards === 1, JSON.stringify(b.timing));
  assert(T.otto_actions[0].pinged_at, "card marked pinged");
});
Deno.test("signal replay: a call that ends with NO card pings the reason (6 Oct MU was silent)", async () => {
  reset(); setNow("2026-10-06T19:12:55Z"); callHook = muHook(); seedMuBatch();
  claudeScript = () => textReply("MU is up $21 past the level, chasing.\nREAD: MU short signal. Not building a card — it already ran.");
  await M.signalJarvis(8);
  const b = T.otto_signal_batches[0];
  assert(b.status === "done" && !b.cards.length && /No card for MU/.test(b.read), JSON.stringify(b));
  assert(pings.some((p) => /MU SHORT — NO card/.test(p.title) && /decided against/.test(p.body)), JSON.stringify(pings));
  assert(/no card — Jarvis decided against/.test(deskText()), deskText());
});
Deno.test("signal replay: ran out of steps with no READ line → plain server read, never the working notes", async () => {
  reset(); setNow("2026-10-06T19:12:55Z"); callHook = muHook(); seedMuBatch();
  claudeScript = (body: any) => body.tool_choice ? textReply("The chain response is enormous.") : toolReply("rh__get_option_quotes", { instrument_ids: [] });
  await M.signalJarvis(8);
  const b = T.otto_signal_batches[0];
  assert(!/enormous/.test(b.read) && /MU short call at 3:12 PM/.test(b.read) && /ran out of steps|decided/.test(b.read), b.read);
  assert(pings.some((p) => /NO card/.test(p.title)), JSON.stringify(pings));
});
Deno.test("signal results: '$1000 for 2 PUTS ON MU' is a result, linked to his MU call, no card, no ping", async () => {
  reset(); setNow("2026-10-06T19:40:00Z");
  T.otto_jason.push({ id: 801, day: "2026-10-06", kind: "call", ticker: "MU", direction: "short", words: "SHORTED" });
  T.otto_jason.push({ id: 802, day: "2026-10-06", kind: "result", ticker: "MU", words: "$1000 FOR 2 PUTS ON MU" });
  await M.linkResults([T.otto_jason[1]]);
  assert(T.otto_jason[1].result_for === 801, JSON.stringify(T.otto_jason[1]));
});

Deno.test("promises: yesterday's exact lines are caught; honest lines are not", () => {
  const said = "Stop is protected at $2.00 ✅. I'll flag you at 1:30 if it's still stuck. Watch the chart, not the P&L.\nNo flag from me yet. I'm watching. You don't need to do anything.\nI can't watch between messages, so set an alert.";
  const p = M.findPromises(said);
  assert(p.length === 2 && p[0].kind === "later" && p[1].kind === "watch", JSON.stringify(p));
  const ctx = { did: [], failed: [], protectedTrade: true, autoClose: true, watchToday: [] };
  assert(M.unbacked(p, ctx).length === 2, "both unbacked with nothing scheduled");
  assert(M.unbacked(p, { ...ctx, did: ["schedule_check"] }).length === 0, "a check-in backs both");
  const stop = M.findPromises("If SPY closes under 778.60 the wrong-if alert fires and I'll close it via auto-close.");
  assert(stop.length === 1 && M.unbacked(stop, ctx).length === 0, "protected trade + auto-close backs that one");
  assert(!M.findPromises("Tell me and I'll close it at market on the first print.").length, "an offer waiting on them is fine");
  const honest = ["I'll tell you why: the 15-minute candle closed through.", "I'll move on to NVDA next.", "I'll close with the key levels: 242 and 245.",
    "I'm tracking with you — that's a fair read.", "I've added context below.", "Your stop is set at 1.20 in the plan.", "Robinhood says the order is working.",
    "Once you approve, I'll post the fill.", "I'll let you know what I find in a sec."];
  for (const h of honest) assert(!M.findPromises(h).length, "false positive: " + h);
  const real = ["I'm watching.", "If anything starts looking ugly I'll say something before it becomes a problem.", "I'll ping you when SPY hits 784.50.",
    "I'll check back in 20 minutes.", "I've set an alert at 778.60."];
  for (const r of real) assert(M.findPromises(r).length === 1, "missed: " + r);
  const placed = M.findPromises("I've placed the order for 1 SPY 781C.");
  assert(M.unbacked(placed, { ...ctx, did: ["propose_action"] }).length === 1, "a card is not a placed order");
});
Deno.test("desk (12:02 PM replay): 'I'll flag you at 1:30' → server check → Jarvis schedules a real 1:30 check-in", async () => {
  reset(); setNow("2026-10-06T16:02:00Z");
  let n = 0;
  claudeScript = (body: any) => {
    n++;
    const last = JSON.stringify(body.messages.at(-1));
    if (/OTTO SERVER CHECK/.test(last)) return toolReply("schedule_check", { at: "1:30 PM", what: "SPY 781C: still stuck under 784.50 TP1? Tell Ifoma." });
    if (/Scheduled #/.test(last)) return textReply("Set — I'll check back at 1:30 PM ET and ping you.");
    return textReply("Holding. I'll flag you at 1:30 if it's still stuck. I'm watching.");
  };
  const req = new Request("https://x/?fn=desk", { method: "POST", body: JSON.stringify({ author: "Ifoma", messages: [{ role: "user", content: "anything I should do on SPY?" }] }) });
  const res = await M.desk(req, "ottotrader@vinecreativestudio.com", "k");
  const streamed = await res.text();
  assert(n === 3, "reply, correction, confirmation: " + n);
  assert(T.otto_checks.length === 1 && /2026-10-06T17:30:00/.test(T.otto_checks[0].due_at), JSON.stringify(T.otto_checks));
  assert(/⏰ Check-in set for 1:30 PM ET/.test(deskText()), deskText());
  assert(/I'll check back at 1:30 PM/.test(streamed), "the fix is streamed under the reply");
  const pr = T.otto_settings.find((r: any) => r.key === "promise_day")?.value;
  assert(pr && pr.made === 2 && pr.corrected === 2, JSON.stringify(pr));
});
Deno.test("desk: a promise Jarvis won't back gets the plain server correction", async () => {
  reset(); setNow("2026-10-06T16:17:00Z");
  claudeScript = () => textReply("No flag from me yet. I'm watching. You don't need to do anything.");
  const req = new Request("https://x/?fn=desk", { method: "POST", body: JSON.stringify({ author: "Ifoma", messages: [{ role: "user", content: "ok?" }] }) });
  const res = await M.desk(req, "ottotrader@vinecreativestudio.com", "k");
  const streamed = await res.text();
  assert(/Correction: I can't watch the market between messages/.test(streamed), streamed.slice(-400));
  assert(/Correction: I can't watch/.test(deskText()), deskText());
});
Deno.test("check-ins: due at 1:30 → Jarvis runs, posts on the Desk, pings; never twice", async () => {
  reset(); setNow("2026-10-06T17:30:20Z");
  T.otto_checks.push({ id: 5, day: "2026-10-06", due_at: "2026-10-06T17:30:00.000Z", what: "SPY 781C still stuck?", by: "Ifoma via Jarvis", status: "pending" });
  claudeScript = () => textReply("SPY 782.10, still under TP1 784.50. Plan says hold; the stop is working.");
  await Promise.all([M.checksTick(NOW), M.checksTick(NOW)]);
  await sleep(50);
  assert(T.otto_checks[0].status === "done", JSON.stringify(T.otto_checks[0]));
  assert(T.otto_desk.filter((r) => r.author === "Jarvis · check-in").length === 1, deskText());
  assert(pings.filter((p) => p.kind === "checkin").length === 1, JSON.stringify(pings));
});
Deno.test("check-ins: a time that has passed or is after 4:15 is refused (Jarvis must say so)", async () => {
  reset(); setNow("2026-10-06T16:02:00Z");
  let e1 = "", e2 = "";
  try { await M.checkAdd("11:30 AM", "x", "t"); } catch (e) { e1 = (e as Error).message; }
  try { await M.checkAdd("5:00 PM", "x", "t"); } catch (e) { e2 = (e as Error).message; }
  assert(/passed/.test(e1) && /4:15/.test(e2), e1 + " | " + e2);
});
Deno.test("missed pings: a Signal card whose run was cut off is pinged after 3 min, once", async () => {
  reset(); setNow("2026-10-06T19:16:00Z");
  T.otto_actions.push({ id: "a1", title: "Buy 1 MU 1020P", status: "pending", created_by: "signals", created_at: "2026-10-06T19:12:30Z", pinged_at: null });
  await M.cardSweep(NOW); await M.cardSweep(NOW);
  assert(pings.filter((p) => /Card waiting: Buy 1 MU/.test(p.title)).length === 1, JSON.stringify(pings));
});
Deno.test("self-test: 9:10 AM — heartbeat, read, shortlist, dry-run card → ✅ on the Desk, no ping, no card stored", async () => {
  reset(); setNow("2026-10-07T13:10:00Z"); callHook = muHook(781.2, "SPY");
  T.otto_settings.push({ key: "signal_beat", value: { at: "2026-10-07T13:09:30Z", state: "ok", queue: 0, queue_age: 0 } });
  extractHook = () => [{ kind: "call", ticker: "SPY", direction: "long", words: "SPY LONG", time: "9:10 AM" }];
  claudeScript = (body: any) => {
    const t = JSON.stringify(body.messages);
    const m = /option_id (SPY-[0-9-]+-call-\d+)/.exec(t);
    return /SELF-TEST: card accepted/.test(t) ? textReply("ok") : toolReply("propose_action", { title: "TEST Buy 1 SPY", summary: "t", plan: { tv_symbol: "AMEX:SPY", direction: "up", setup: "otto signal", tp1: 784, stop: 779, stop_option: 1.5 },
      calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: m?.[1], side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "3.00", time_in_force: "gfd" } }] });
  };
  const r: any = await M.signalSelfTest(false);
  assert(r.ok, JSON.stringify(r.steps));
  assert(/✅ Signal self-test 9:10 AM/.test(deskText()), deskText());
  assert(!T.otto_actions.length && !pings.length, "nothing stored, nobody pinged");
  const again: any = await M.signalSelfTest(false);
  assert(again.skipped === "already ran", JSON.stringify(again));
});
Deno.test("self-test: a sleeping Engineer PC fails the test and pings", async () => {
  reset(); setNow("2026-10-07T13:10:00Z"); callHook = muHook(781.2, "SPY");
  T.otto_settings.push({ key: "signal_beat", value: { at: "2026-10-07T12:40:00Z", state: "ok" } });
  extractHook = () => [{ kind: "call", ticker: "SPY", direction: "long", words: "SPY LONG", time: "9:10 AM" }];
  claudeScript = () => textReply("no");
  const r: any = await M.signalSelfTest(true);
  assert(!r.ok && /Engineer PC awake/.test(r.steps[0].note), JSON.stringify(r.steps));
  assert(pings.some((p) => /self-test failed/.test(p.title)), JSON.stringify(pings));
});
Deno.test("names: curly apostrophes don't leak the coach's name; streamed text is filtered too", async () => {
  const out = M.unnameForTest("held Jason’s 778.60 trigger level");
  assert(!/Jason/.test(out), out);
});

/* =============================== v3.17: extension 1.3 edits =============================== */
Deno.test("edits (ext 1.3): an edited post updates the message and is read again; an unchanged re-send is ignored", async () => {
  reset(); setNow("2026-10-06T19:12:50Z"); callHook = muHook();
  T.otto_settings.push({ key: "signals", value: { key: "k".repeat(20) } });
  const seenTexts: string[] = [];
  extractHook = (text: string) => { seenTexts.push(text); return /1020P/.test(text) ? [{ kind: "call", ticker: "MU", direction: "short", words: "MU SHORT 1020P", time: "3:12 PM" }] : [{ kind: "note", ticker: "MU", words: "MU", time: "3:12 PM" }]; };
  claudeScript = () => textReply("READ: MU short, see the card chat.");
  const post = (msgs: any[]) => M.signalInForTest(new Request("https://x/?fn=signal_in", { method: "POST", headers: { "x-otto-signal": "k".repeat(20) },
    body: JSON.stringify({ kind: "msgs", msgs }) }));
  const id = "1424790000000000001", base = { id, at: "2026-10-06T19:12:40.000Z", author: "Jason", author_id: "474721184903200819", channel: "1139244584757637192" };
  const a: any = await post([{ ...base, text: "MU" }]);
  await sleep(120);
  const b: any = await post([{ ...base, text: "MU SHORT 1020P", edited: true }]);
  await sleep(200);
  const c: any = await post([{ ...base, text: "MU SHORT 1020P", edited: true }]);
  assert(a.new === 1 && b.new === 1 && c.new === 0, JSON.stringify([a, b, c]));
  assert(T.otto_signal_msgs.find((m) => m.msg_id === id).text === "MU SHORT 1020P", JSON.stringify(T.otto_signal_msgs));
  assert(seenTexts.some((t) => /\[edited\] MU SHORT 1020P/.test(t)), seenTexts.join(" || "));
  assert(T.otto_jason.some((r) => r.kind === "call" && r.words === "MU SHORT 1020P"), JSON.stringify(T.otto_jason));
});
Deno.test("edits (ext 1.3): an 'edit' for a post we never got is treated as new", async () => {
  reset(); setNow("2026-10-06T19:12:50Z");
  T.otto_settings.push({ key: "signals", value: { key: "k".repeat(20) } });
  extractHook = () => [];
  const r: any = await M.signalInForTest(new Request("https://x/?fn=signal_in", { method: "POST", headers: { "x-otto-signal": "k".repeat(20) },
    body: JSON.stringify({ kind: "msgs", msgs: [{ id: "1424790000000000002", at: "2026-10-06T19:12:40.000Z", author: "Jason", author_id: "474721184903200819", text: "NVDA", edited: true }] }) }));
  assert(r.new === 1 && T.otto_signal_msgs.length === 1, JSON.stringify(r));
});
Deno.test("self-test dry run: accepts limit_price and string args like the real card path; names what's missing", async () => {
  reset(); setNow("2026-10-07T13:10:00Z");
  let n = 0;
  claudeScript = () => n++ === 0
    ? toolReply("propose_action", { title: "T", summary: "s", plan: { tv_symbol: "AMEX:SPY", direction: "up", setup: "otto signal", tp1: 1, stop: 1 },
        calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "x", side: "buy", position_effect: "open" }], quantity: "1", limit_price: "3" } }] })
    : n === 2 ? toolReply("propose_action", { title: "T", summary: "s", plan: { tv_symbol: "AMEX:SPY", direction: "up", setup: "otto signal", tp1: 1, stop: 1, stop_option: 1.5 },
        calls: [{ service: "rh", tool: "place_option_order", args: JSON.stringify({ legs: [{ option_id: "x", side: "buy", position_effect: "open" }], quantity: "1", limit_price: "3" }) }] })
    : textReply("ok");
  const r: any = await M.runDesk({ msgs: [{ role: "user", content: "x" }], sys: "S", tools: [{ name: "propose_action" }], cs: [], who: "selftest", send: () => {}, allowPropose: true, dryRun: true, maxRounds: 3 });
  assert(/missing plan\.stop_option/.test(r.errors[0]) && r.dry.length === 1, JSON.stringify(r.errors));
});
