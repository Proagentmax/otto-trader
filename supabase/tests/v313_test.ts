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
const T: Record<string, any[]> = { otto_actions: [], otto_desk: [], otto_settings: [], otto_trades: [] };
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
    if (v.startsWith("eq.")) { const want = v.slice(3); const have = k.includes("->>") ? row.exit?.[k.split("->>")[1]] : row[k]; if (String(have) !== want) return false; }
    else if (v.startsWith("gte.")) { if (!(String(row[k]) >= v.slice(4))) return false; }
    else if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(","); const have = k.includes("->>") ? row.exit?.[k.split("->>")[1]] : row[k]; if (!set.includes(String(have))) return false; }
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
      const key = params.get("on_conflict")!;
      for (const b of [].concat(body)) { const i = rows.findIndex((r) => r[key] === (b as any)[key]); if (i >= 0) rows[i] = { ...rows[i], ...(b as any) }; else rows.push({ ...(b as any) }); }
      return null;
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
const ACCT = "945257012";
const OPT = "opt-spy-781c-1009";
let orders: any[] = [];
let calls: { tool: string; args: any }[] = [];
let quote = { delta: "0.527", volume: 6911, open_interest: 2898 };
async function fakeCall(service: string, tool: string, args: any) {
  calls.push({ tool, args });
  await sleep(4);
  const j = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
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

(globalThis as any).__OTTO_TEST__ = {
  db: fakeDb, call: fakeCall,
  claude: async (body: any) => { claudeBodies.push(body); if (!claudeScript) return sse(textReply("ok")); const ev = claudeScript(body); if (ev instanceof Error) throw ev; return sse(ev); },
};
(globalThis as any).fetch = (u: any) => /brain-latest\.json/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify([{ call: { date: "2026-10-01", title: "t" }, rules: [], setups: [], levels: [], _transcript: "x" }]))) : Promise.reject(new Error("network disabled in tests"));
(Deno as any).serve = () => ({ finished: Promise.resolve() });

const M = await import("../otto-proxy.ts");

function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
function reset() {
  T.otto_actions = []; T.otto_desk = []; T.otto_settings = []; T.otto_trades = [];
  orders = []; calls = []; claudeBodies.length = 0; claudeScript = null;
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
