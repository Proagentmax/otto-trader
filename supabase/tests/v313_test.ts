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
    if (v === "not.is.null") { if (val(k) == null) return false; continue; }
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
  T.otto_checks = []; T.otto_jason = []; T.otto_prep = []; T.otto_prep_imgs = []; T.otto_signal_batches = []; T.otto_signal_msgs = []; T.otto_signal_imgs = [];
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

/* =============================== v3.18 MORNING PREP + SCORE EXTRA =============================== */
Deno.test("prep: submit → Jarvis asks 2–3 questions first (no grade yet) and reads the levels", async () => {
  reset(); setNow("2026-10-07T12:41:00Z");   // 8:41 AM ET
  let sawImage = false;
  claudeScript = (body: any) => {
    sawImage = JSON.stringify(body.messages).includes('"type":"image"');
    assert(body.tool_choice?.name === "prep_questions", "forced questions tool");
    return toolReply("prep_questions", { questions: ["What makes 783.40 a rejection?", "778.60: open or order-block low?", "NVDA catalyst?"], bias: "short", main: "SPY",
      levels: [{ ticker: "SPY", level: 783.4, dir: "down", note: "gap top" }, { ticker: "spy", level: 778.6, dir: "down" }, { ticker: "", level: 5 }] });
  };
  const r: any = await M.prepSubmit({ author: "Ifoma", notes: "Leaning short. SPY 783.40 gap top, 778.60 support.", images: [{ mime: "image/jpeg", data: "x".repeat(200) }] });
  assert(sawImage, "the chart goes to Jarvis");
  assert(r.prep.status === "asked" && r.prep.thread[0].questions.length === 3 && !r.prep.grade, JSON.stringify(r.prep));
  assert(r.prep.levels.length === 2 && r.prep.levels[1].ticker === "SPY" && r.prep.bias === "short", JSON.stringify(r.prep.levels));
  assert(T.otto_prep_imgs.length === 1, "image stored");
});
Deno.test("prep: the answer → a grade (letter, scores, strong/fix/missing); a later message is coaching, not a re-grade", async () => {
  reset(); setNow("2026-10-07T12:46:00Z");
  T.otto_prep.push({ id: 31, day: "2026-10-07", author: "Ifoma", notes: "Leaning short", status: "asked", thread: [{ role: "jarvis", kind: "questions", questions: ["q1", "q2"] }],
    bias: "short", main: "SPY", levels: [{ ticker: "SPY", level: 783.4, dir: "down", note: "gap top" }] });
  claudeScript = (body: any) => body.tool_choice?.name === "prep_grade"
    ? toolReply("prep_grade", { letter: "B+", process: 8, levels_score: 9, plan: 7, strong: ["Short at resistance — Otto Rules, 1 Oct"], fix: ["NVDA has no catalyst"], missing: ["target"],
        levels: [{ ticker: "SPY", level: 783.4, dir: "down", note: "gap top" }, { ticker: "SPY", level: 776, dir: "down", note: "next support" }] })
    : textReply("776 is your cover zone.");
  const g: any = await M.prepReply({ id: 31, text: "1) close above 783.40 = wrong 2) order-block low" });
  assert(g.prep.status === "graded" && g.prep.grade.letter === "B+" && g.prep.grade.fix[0] === "NVDA has no catalyst" && g.prep.levels.length === 2, JSON.stringify(g.prep));
  T.otto_prep[0] = { ...T.otto_prep[0], ...g.prep };
  const f: any = await M.prepReply({ id: 31, text: "where do I cover?" });
  assert(f.prep.thread.at(-1).kind === "text" && /776/.test(f.prep.thread.at(-1).text) && T.otto_prep[0].grade.letter === "B+", JSON.stringify(f.prep.thread.at(-1)));
});
Deno.test("prep: + Watcher puts the level on today's Watcher (and only on the day of the read)", async () => {
  reset(); setNow("2026-10-07T12:50:00Z");
  T.otto_prep.push({ id: 32, day: "2026-10-07", author: "Josh", status: "graded", levels: [{ ticker: "SPY", level: 778.6, dir: "down", note: "ob low" }] });
  const r: any = await M.prepWatch({ id: 32, idx: 0 }, "x");
  assert(r.levels[0].watched && T.otto_watch.some((w) => w.ticker === "SPY" && Number(w.level) === 778.6 && w.dir === "down"), JSON.stringify(T.otto_watch));
  assert(/Josh's morning read/.test(deskText()), deskText());
  T.otto_prep[0].day = "2026-10-06";
  let e = ""; try { await M.prepWatch({ id: 32, idx: 0 }, "x"); } catch (x) { e = (x as Error).message; }
  assert(/day of the read/.test(e), e);
});
Deno.test("prep grade at 4:05 (real 6 Oct SPY bars): a long read off 778.60 is RIGHT; 778.60 was touched", async () => {
  reset(); setNow("2026-10-06T20:05:30Z");
  T.otto_prep.push({ id: 33, day: "2026-10-06", author: "Ifoma", bias: "long", main: "SPY", levels: [{ ticker: "SPY", level: 778.6, dir: "up" }, { ticker: "SPY", level: 790, dir: "up" }], result: null });
  const r: any = await M.prepGradeTick(false);
  const res = T.otto_prep[0].result;
  assert(r.graded === 1 && res && ["right", "wrong", "flat"].includes(res.direction), JSON.stringify(res));
  assert(res.levels[0].touched === true && res.levels[1].touched === false && res.of === 2, JSON.stringify(res.levels));
});
Deno.test("prep grade: neutral on a flat day is right; a short on an up day is wrong", () => {
  const bar = (o: number, c: number) => ({ t: 0, o, h: Math.max(o, c), l: Math.min(o, c), c });
  assert(M.gradeRead("neutral", [bar(100, 100.05)], [], {})!.direction === "right", "flat");
  assert(M.gradeRead("short", [bar(100, 101)], [], {})!.direction === "wrong", "short on up day");
  assert(M.gradeRead("long", [bar(100, 100.1)], [], {})!.direction === "flat", "long on a flat day");
});
Deno.test("score extra: Signal speed from v3.16 timings + the coach's calls scoreboard", async () => {
  reset(); setNow("2026-10-07T20:30:00Z");
  T.otto_jason.push({ id: 1, ticker: "MU", direction: "short", kind: "call", words: "SHORTED", day: "2026-10-06", score: { state: "worked", close_pct: 1.9, best_pct: 2.6 } });
  T.otto_jason.push({ id: 2, kind: "result", result_for: 1, words: "$1000 FOR 2 PUTS ON MU" });
  T.otto_signal_batches.push({ id: 9, created_at: "2026-10-07T14:02:05Z", status: "done", cards: ["c"], rows: [1], timing: { posted: "2026-10-07T14:02:01Z", total_ms: 41000 } });
  const r: any = await M.scoreExtra();
  assert(r.speed[0].caught_s === 4 && r.speed[0].card_s === 41 && r.median_card_s === 41, JSON.stringify(r.speed));
  assert(r.coach[0].ticker === "MU" && r.coach[0].worked === 1 && /1000/.test(r.coach[0].results[0]), JSON.stringify(r.coach));
});

/* =============================== v3.19 LOCK TODAY'S PLAN =============================== */
const PLAN = { ticker: "spy", side: "puts", entry: 783.4, how: "reject", tf: "5m", wrong_if: 784.5, target: 778.6, why: "gap top rejection" };
Deno.test("plan: the four lines must be complete and on the right sides (calls up, puts down)", () => {
  const ok: any = M.planValidate(PLAN);
  assert(ok.ok && ok.plan.ticker === "SPY" && ok.plan.rr === 4.36, JSON.stringify(ok));
  assert(/the candle timeframe/.test((M.planValidate({ ...PLAN, tf: "" }) as any).error), "timeframe required");
  assert(/wrong-if price/.test((M.planValidate({ ...PLAN, wrong_if: "" }) as any).error), "wrong-if required");
  assert(/For puts/.test((M.planValidate({ ...PLAN, target: 790 }) as any).error), "puts target above entry is refused");
  assert(/For calls/.test((M.planValidate({ ...PLAN, side: "calls" }) as any).error), "calls with a target below is refused");
  assert((M.planValidate({ ...PLAN, side: "calls", wrong_if: 782, target: 790 }) as any).ok, "a good calls plan passes");
});
Deno.test("plan lock: Jarvis passes it → entry goes on the Watcher, plan saved, Desk line posted", async () => {
  reset(); setNow("2026-10-07T13:05:00Z");
  T.otto_prep.push({ id: 41, day: "2026-10-07", author: "Josh", status: "graded", grade: { letter: "B-", fix: ["pick ONE ticker"] }, levels: [] });
  claudeScript = (body: any) => { assert(body.tool_choice?.name === "plan_check", "forced plan_check"); return toolReply("plan_check", { ok: true, fixes: [], note: "R:R 4.4 — short at resistance" }); };
  const r: any = await M.prepLock({ id: 41, ...PLAN }, "x");
  assert(r.locked && T.otto_prep[0].plan.ticker === "SPY" && T.otto_prep[0].plan.note && T.otto_prep[0].plan.changes === 0, JSON.stringify(r));
  assert(T.otto_watch.some((w) => w.ticker === "SPY" && Number(w.level) === 783.4 && w.dir === "down"), JSON.stringify(T.otto_watch));
  assert(/📌 Josh locked today's plan: SPY puts/.test(deskText()), deskText());
  const pl: any[] = await M.plansToday();
  assert(pl.length === 1 && pl[0].author === "Josh" && /wrong if 784.5/.test(pl[0].line), JSON.stringify(pl));
});
Deno.test("plan lock: Jarvis wants fixes → NOT locked; 'Lock anyway' locks it and keeps the fixes on record; a change counts", async () => {
  reset(); setNow("2026-10-07T13:05:00Z");
  T.otto_prep.push({ id: 42, day: "2026-10-07", author: "Josh", status: "graded", levels: [] });
  claudeScript = () => toolReply("plan_check", { ok: false, fixes: ["Wrong-if is only 1.10 away on a 5m chart — that's noise"], note: "" });
  const a: any = await M.prepLock({ id: 42, ...PLAN }, "x");
  assert(!a.locked && a.fixes.length === 1 && !T.otto_prep[0].plan && !T.otto_watch.length, JSON.stringify(a));
  const b: any = await M.prepLock({ id: 42, ...PLAN, force: true }, "x");
  assert(b.locked && T.otto_prep[0].plan.fixes_overridden.length === 1 && /over Jarvis's fixes/.test(deskText()), JSON.stringify(b));
  claudeScript = () => toolReply("plan_check", { ok: true, fixes: [], note: "" });
  await M.prepLock({ id: 42, ...PLAN, wrong_if: 785.2 }, "x");
  assert(T.otto_prep[0].plan.changes === 1 && /Josh changed today's plan/.test(deskText()), JSON.stringify(T.otto_prep[0].plan));
  await M.prepLock({ id: 42, ...PLAN, entry: 783.9, wrong_if: 785.2 }, "x");
  const live = T.otto_watch.filter((w) => w.status === "watching").map((w) => Number(w.level));
  assert(live.length === 1 && live[0] === 783.9 && T.otto_prep[0].plan.changes === 2, "a moved entry takes the old level off the Watcher: " + JSON.stringify(T.otto_watch));
});
Deno.test("plan lock: refused on another day; Jarvis down → still locks (check skipped, never blocks)", async () => {
  reset(); setNow("2026-10-07T13:05:00Z");
  T.otto_prep.push({ id: 43, day: "2026-10-06", author: "Ifoma", status: "graded", levels: [] });
  let e = ""; try { await M.prepLock({ id: 43, ...PLAN }, "x"); } catch (x) { e = (x as Error).message; }
  assert(/day of the read/.test(e), e);
  T.otto_prep[0].day = "2026-10-07";
  claudeScript = () => new Error("overloaded") as any;
  const r: any = await M.prepLock({ id: 43, ...PLAN }, "x");
  assert(r.locked && T.otto_prep[0].plan, JSON.stringify(r));
});
Deno.test("plan vs tape: trigger then target / wrong-if / both / no trigger", () => {
  const b = (t: number, o: number, h: number, l: number, c: number) => ({ t, o, h, l, c });
  const p = { side: "puts", how: "reject", entry: 783.4, wrong_if: 784.5, target: 778.6 };
  assert(M.planVsTape(p, [b(1, 782, 783, 781, 782)]).outcome === "no trigger", "never reached");
  assert(M.planVsTape(p, [b(1, 783, 783.6, 782.8, 783), b(2, 783, 783, 778.5, 779)]).outcome === "target", "target");
  assert(M.planVsTape(p, [b(1, 783, 783.6, 782.8, 783), b(2, 783, 784.6, 782, 784)]).outcome === "wrong-if", "wrong-if");
  assert(M.planVsTape(p, [b(1, 783, 783.6, 782.8, 783), b(2, 783, 785, 778, 780)]).outcome === "both in one bar", "both");
  const c = { side: "calls", how: "break", entry: 780, wrong_if: 779, target: 783 };
  assert(M.planVsTape(c, [b(1, 779, 780.5, 779, 779.8)]).outcome === "no trigger", "a wick isn't a break — needs the close");
  assert(M.planVsTape(c, [b(1, 779, 780.5, 779, 780.3), b(2, 780, 781, 780, 781)]).outcome === "neither by the close", "neither");
});
Deno.test("plan adherence: no trade / on plan / partly off / off plan", () => {
  const p = { ticker: "SPY", side: "puts" };
  assert(M.planAdherence(p, []).adherence === "no trade", "none");
  assert(M.planAdherence(p, [{ sym: "SPY", type: "puts" }]).adherence === "on plan", "on");
  assert(M.planAdherence(p, [{ sym: "SPY", type: "puts" }, { sym: "NVDA", type: "calls" }]).adherence === "partly off plan", "partly");
  const off: any = M.planAdherence(p, [{ sym: "SPY", type: "calls" }]);
  assert(off.adherence === "off plan" && off.traded[0] === "SPY calls", JSON.stringify(off));
});
Deno.test("plan at 4:05 (real 6 Oct bars): the plan is graded with the read, against the Agentic account's opening trades", async () => {
  reset(); setNow("2026-10-06T20:05:30Z");
  T.otto_prep.push({ id: 44, day: "2026-10-06", author: "Josh", bias: "long", main: "SPY", levels: [], result: null,
    plan: { ticker: "SPY", side: "calls", entry: 778.6, how: "hold", tf: "5m", wrong_if: 777.5, target: 781, rr: 2.18 } });
  callHook = (tool, args) => tool === "get_option_orders" && args.state === "filled"
    ? { data: { orders: [{ chain_symbol: "SPY", legs: [{ position_effect: "open", option_type: "call" }] }, { chain_symbol: "SPY", legs: [{ position_effect: "close", option_type: "call" }] }] } } : null;
  const r: any = await M.prepGradeTick(false);
  const res = T.otto_prep[0].result;
  assert(r.graded === 1 && res.plan && typeof res.plan.trigger === "boolean" && res.plan.adherence === "on plan", JSON.stringify(res.plan));
});
Deno.test("plans: the Desk context carries today's locked plans", async () => {
  reset(); setNow("2026-10-07T14:00:00Z");
  T.otto_prep.push({ id: 45, day: "2026-10-07", author: "Josh", plan: { ticker: "SPY", side: "puts", entry: 783.4, how: "reject", tf: "5m", wrong_if: 784.5, target: 778.6, rr: 4.36 } });
  const w: any = await M.watchGet();
  assert(w.plans?.length === 1 && w.plans[0].author === "Josh", JSON.stringify(w.plans));
});

/* ======================= v3.19.1 — TradingView timeout must not crash the worker ======================= */
// 7 Oct: 100+ "event loop error: TradingView timed out" in the Supabase logs. With the breaker open,
// tvBudget walked away from a TradingView call that was already running; when it later failed nobody
// was listening, and Supabase shut the worker down — killing Josh's Desk replies and Signal runs with it.
Deno.test("v3.19.1: breaker open + TradingView fails later → no stray rejection, Desk reply and a Robinhood run both finish", async () => {
  reset();
  const saved = (globalThis as any).__OTTO_TEST__.call;
  (globalThis as any).__OTTO_TEST__.call = async (service: string, tool: string, args: any) => {
    if (service === "tv") { await sleep(150); throw new Error("TradingView timed out"); }
    if (tool === "get_equity_quotes") { await sleep(400); return { content: [{ type: "text", text: JSON.stringify({ data: { results: [{ quote: { last_trade_price: "236.76" } }] } }) }] }; }
    return fakeCall(service, tool, args);
  };
  try {
    T.otto_settings.push({ key: "tv_slow_until", value: Date.now() + 3600_000 });
    const before = (M as any).strayCount();
    claudeScript = (body: any) => {
      const n = body.messages.length;
      if (n === 1) return JSON.stringify(body.messages[0]).includes("JOSH") ? toolReply("tv__mcp-tv-get-ohlcv", { symbol: "NASDAQ:NVDA", interval: "5", count: 3 }) : toolReply("rh__get_equity_quotes", { symbols: ["NVDA"] });
      return textReply(JSON.stringify(body.messages[n - 1]).includes("236.76") ? "RH-DONE" : "JOSH-REPLY");
    };
    const go = (who: string, t: string) => M.runDesk({ msgs: [{ role: "user", content: t }], sys: "S", tools: [], cs: [], who, send: () => {}, allowPropose: false });
    const [a, b] = await Promise.all([go("josh", "JOSH: check nvda"), go("signals", "SIGNAL: card")]);
    await sleep(500);   // the abandoned TradingView call fails in here
    assert(String(a.said).includes("JOSH-REPLY"), "Josh got no reply: " + a.said);
    assert(String(b.said).includes("RH-DONE"), "Robinhood run cut off: " + b.said);
    assert((M as any).strayCount() === before, "a TradingView failure went unhandled");
  } finally { (globalThis as any).__OTTO_TEST__.call = saved; }
});
Deno.test("v3.19.1: the stray-rejection safety net is installed", async () => {
  const src = await Deno.readTextFile(new URL("../otto-proxy.ts", import.meta.url));
  assert(/addEventListener\("unhandledrejection"[\s\S]{0,80}preventDefault\(\)/.test(src), "safety net missing");
  assert(/function tvBudget[\s\S]{0,600}p\.catch\(\(\) => \{\}\);[\s\S]{0,40}if \(tvSlow\(\)\)/.test(src), "tvBudget must handle the call before the breaker check");
});

/* ======================= v3.20 — contracts the account can take; stops on Robinhood's price steps ======================= */
// Synthetic chains built from 7 Oct's real numbers (MU ~1,080, QQQ ~756, NVDA ~237; Agentic buying power ~$1,121).
function fakeChain(sym: string, spot: number, step: number, premAtm: number, bp: number) {
  const exps = ["2026-10-09", "2026-10-16", "2026-10-23"];
  const strikes: number[] = []; for (let k = Math.round(spot / step) * step - 6 * step; k <= spot + 6 * step; k += step) strikes.push(+k.toFixed(2));
  const ins: any[] = [];
  for (const e of exps) for (const ty of ["call", "put"]) for (const k of strikes) ins.push({ id: `${sym}-${e}-${ty}-${k}`, strike_price: String(k), expiration_date: e, type: ty, tradability: "tradable", state: "active" });
  const q = (id: string) => {
    const [, e, ty, ks] = id.split("-").length > 4 ? [id.split("-")[0], id.split("-").slice(1, 4).join("-"), id.split("-")[4], id.split("-")[5]] : ["", "", "", ""];
    const k = Number(ks), m = ty === "call" ? (spot - k) / spot : (k - spot) / spot;          // moneyness
    const dlt = Math.max(0.05, Math.min(0.95, 0.5 + m * 12)), ask = Math.max(0.05, premAtm * Math.exp(m * 18) * (e === "2026-10-09" ? 0.7 : e === "2026-10-23" ? 1.3 : 1));
    return { instrument_id: id, ask_price: ask.toFixed(2), bid_price: (ask * 0.98).toFixed(2), mark_price: (ask * 0.99).toFixed(2), delta: (ty === "put" ? -dlt : dlt).toFixed(3), volume: 900, open_interest: 600 };
  };
  return (tool: string, args: any) => {
    if (tool === "get_equity_quotes") return { data: { results: [{ quote: { last_trade_price: String(spot) } }] } };
    if (tool === "get_option_chains") return { data: { chains: [{ symbol: sym, can_open_position: true, expiration_dates: exps }] } };
    if (tool === "get_portfolio") return { data: { total_value: "1121.64", buying_power: { buying_power: String(bp) } } };
    if (tool === "get_option_instruments") return { data: { instruments: ins.filter((i) => i.expiration_date === args.expiration_dates && i.type === args.type) } };
    if (tool === "get_option_quotes") return { data: { results: (args.instrument_ids || [args.instrument_id]).filter(Boolean).map((id: string) => ({ quote: q(id) })) } };
    return null;
  };
}
const optCard = (sym: string, id: string, price: number, dir: "up" | "down", stopOpt: number, tp1: number, stop: number) => ({
  title: `Buy 1 ${sym}`, summary: "t",
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: id, side: "buy", position_effect: "open" }], type: "limit", price, quantity: "1", time_in_force: "gfd" } }],
  plan: { tv_symbol: `NASDAQ:${sym}`, direction: dir, setup: "breakdown", tp1, stop, stop_option: stopOpt, entry_underlying: stop },
});
let v320clock = 0;
const v320reset = () => { reset(); v320clock += 10; setNow(new RealDate(RealDate.parse("2026-10-06T16:00:00Z") + v320clock * 60e3).toISOString()); };

Deno.test("v3.20: stop prices round UP to Robinhood's step — the 7 Oct $3.38 becomes $3.40 and the loss at the stop shrinks", () => {
  assert(M.roundStopUp(3.38) === 3.4, "3.38 → " + M.roundStopUp(3.38));
  assert(M.roundStopUp(2.61) === 2.61 && M.roundStopUp(2.605) === 2.61, "pennies under $3");
  assert(M.roundStopUp(4.7) === 4.7 && M.roundStopUp(16.83) === 16.85, "nickels from $3");
  assert(M.roundStopUp(3.43, true) === 3.5 && M.roundStopUp(1.83, true) === 1.85, "coarse steps for non-penny names");
  for (let i = 0; i < 20000; i++) {                 // property check: on the step, never below the input, less than one step above it
    const p = Math.round((0.05 + Math.random() * 60) * 1000) / 1000, coarse = Math.random() < 0.5;
    const r = M.roundStopUp(p, coarse), t = M.optTick(r, coarse);
    assert(r >= p - 1e-9, `${p} → ${r} went DOWN (bigger loss)`);
    assert(Math.abs(Math.round(r / t) * t - r) < 1e-6, `${p} → ${r} not on the $${t} step`);
    assert(r - p < M.optTick(p, coarse) + M.optTick(r, coarse) + 1e-9, `${p} → ${r} moved more than a step`);
  }
});

Deno.test("v3.20: the NVDA 237.5P card from 7 Oct gets a $3.40 stop on the card itself (not $3.38)", async () => {
  v320reset();
  callHook = fakeChain("NVDA", 236.73, 2.5, 4.53, 1151.73);
  const c: any = await M.proposeAction(optCard("NVDA", "NVDA-2026-10-16-put-237.5", 4.55, "down", 3.38, 235, 237), "watcher");
  assert(c.exit.stop_option === 3.4, "stop on the card: " + c.exit.stop_option);
  assert(!c.checks.some((x: any) => /buying power/i.test(x.text)), "fits buying power — no BP flag");
});

Deno.test("v3.20: Robinhood refuses a nickel stop (non-penny name) → Otto retries once on the dime step, toward the entry", async () => {
  v320reset();
  const tries: string[] = [];
  callHook = (tool: string, args: any) => {
    if (tool === "place_option_order" && args.type === "stop_market") {
      tries.push(args.stop_price);
      if (Number(args.stop_price) * 100 % 10 !== 0) throw new Error('API error 400: {"detail":"Stop price does not satisfy the min tick value."}');
    }
    return null;
  };
  const a = { id: "a1", title: "Buy 1 X", decided_at: new Date().toISOString() };
  const ex: any = { option_id: OPT, qty: 1, entry_limit: 4.55, stop_option: 3.45, log: [] };
  const ok = await (M as any).placeStopForTest(a, ex, ACCT);
  assert(ok === true, "stop placed after retry; log: " + JSON.stringify(ex.log));
  assert(tries.join(",") === "3.45,3.50", "tries " + tries.join(","));
  assert(ex.stop_option === 3.5 && ex.stop_option < ex.entry_limit, "stop moved up to 3.50");
});

Deno.test("v3.20: a card over buying power goes back to Jarvis when a contract that fits exists (QQQ 756C, 7 Oct)", async () => {
  v320reset();
  callHook = fakeChain("QQQ", 756.11, 1, 8.29, 706.69);
  let err = "";
  try { await M.proposeAction(optCard("QQQ", "QQQ-2026-10-16-call-756", 8.29, "up", 7.9, 759, 755.5), "watcher"); } catch (e) { err = (e as Error).message; }
  assert(/Over buying power: this contract costs \$829/.test(err) && /◆ QQQ \d+C/.test(err) && /option_id QQQ-/.test(err), "bounced with the fitting contract named: " + err);
  assert(!T.otto_actions.length, "no card stored");
});

Deno.test("v3.20: nothing fits → the card is still built, with a red 'over buying power' banner (Ifoma's rule)", async () => {
  v320reset();
  callHook = fakeChain("MU", 1080.7, 5, 17.9, 120);     // even the cheapest MU contract is over $120
  const c: any = await M.proposeAction(optCard("MU", "MU-2026-10-09-call-1080", 17.9, "up", 16.8, 1090, 1079.5), "signals");
  assert(c.status === "pending", "card built");
  assert(c.checks[0].ok === false && /Over buying power: costs \$1790/.test(c.checks[0].text) && /No contract on the list fits/.test(c.checks[0].text), JSON.stringify(c.checks[0]));
});

Deno.test("v3.20: Ifoma's own ticket over buying power is never bounced — only flagged", async () => {
  v320reset();
  callHook = fakeChain("MU", 1076.8, 5, 30.2, 1121.64);
  const c: any = await M.proposeAction(optCard("MU", "MU-2026-10-16-put-1075", 30.2, "down", 26, 1074, 1082), "ottotrader@vinecreativestudio.com", { manual: true });
  assert(c.status === "pending" && /Over buying power/.test(c.checks[0].text), "flagged, not bounced");
});

Deno.test("v3.20: Watcher trigger → contracts pre-fetched into the prompt; Jarvis's oversized card bounces and the ◆ card is built", async () => {
  v320reset();
  const fit = fakeChain("MU", 1076.84, 5, 15, 1121.64);
  const seen: string[] = [];
  callHook = (tool: string, args: any) => { seen.push(tool); return fit(tool, args); };
  T.otto_watch.push({ id: 77, day: "2026-10-06", ticker: "MU", level: 1080, dir: "down", source: "signal", status: "watching",
    fired: { down: { trigger: "break-close", tf: 5, close_at: new Date().toISOString(), bar: { o: 1081.08, h: 1081.2, l: 1076.61, c: 1076.84 } } } });
  let firstPrompt = "", round = 0, picked = "";
  claudeScript = (body: any) => {
    round++;
    if (round === 1) { firstPrompt = JSON.stringify(body.messages[0]);
      const m = /◆ = best that fits buying power: MU (\d+(?:\.\d+)?)P (\d\d)\/(\d\d)/.exec(firstPrompt); picked = m ? `MU-2026-${m[2]}-${m[3]}-put-${m[1]}` : "";
      return toolReply("propose_action", optCard("MU", "MU-2026-10-16-put-1075", 30.2, "down", 26, 1074, 1082)); }   // the 7 Oct oversized pick
    const last = JSON.stringify(body.messages[body.messages.length - 1]);
    if (round === 2) { const m = /option_id (MU-[^ ,]+), ask \$([\d.]+)/.exec(last); assert(m, "bounce names a contract: " + last.slice(0, 400));
      const ask = Number(m![2]); return toolReply("propose_action", optCard("MU", m![1], ask, "down", +(ask * 0.85).toFixed(2), 1074, 1082)); }
    return textReply("READ: MU rejected 1080. Card is the ◆ contract that fits.");
  };
  await M.watchJarvis(77, "down");
  assert(/◆ = best that fits buying power: MU/.test(firstPrompt), "shortlist pre-fetched into the Watcher prompt: " + firstPrompt.slice(-700) + " ROUND " + round + " DESK " + deskText().slice(-400));
  assert(T.otto_actions.length === 1, "one card: " + T.otto_actions.length);
  const leg = T.otto_actions[0].calls[0].args.legs[0].option_id;
  assert(leg === picked, `card uses the ◆ contract ${picked}, got ${leg}`);
  assert(T.otto_actions[0].risk.cost <= 1121.64, "card fits buying power: " + T.otto_actions[0].risk.cost);
});

Deno.test("v3.20: Desk — Jarvis has option_shortlist and every run carries the contract rule", async () => {
  v320reset();
  callHook = fakeChain("NVDA", 236.73, 2.5, 4.53, 1151.73);
  let toolNames: string[] = [], sysCtx = "", round = 0, toolResult = "";
  claudeScript = (body: any) => {
    round++;
    if (round === 1) { toolNames = (body.tools || []).map((t: any) => t.name); sysCtx = JSON.stringify(body.messages[0]); return toolReply("option_shortlist", { ticker: "NVDA", side: "put" }); }
    toolResult = JSON.stringify(body.messages[body.messages.length - 1]); return textReply("ok");
  };
  const { ctxLine, tools, cs, sys } = await (M as any).deskSetupForTest();
  await M.runDesk({ msgs: [{ role: "user", content: ctxLine + "\nJOSH: nvda puts?" }], sys, tools, cs, who: "josh", send: () => {}, allowPropose: true });
  assert(toolNames.includes("option_shortlist"), "tool offered: " + toolNames.join(","));
  assert(/CONTRACTS \(v3\.20\)/.test(sysCtx), "rule in the context line");
  assert(/★ = best by the Otto Rules/.test(toolResult) && /NVDA 2\d\d(\.5)?P/.test(toolResult), "shortlist came back: " + toolResult.slice(0, 300));
});
