// v3.43 (21 Oct 2026): Close Now on PRACTICE trades. The practice trade shows as IN A TRADE with a live option price; Josh can close it;
// the practice book counts his sell at the live bid; the rule's grade is kept as a what-if; nothing is ever sent to Robinhood;
// no readable bid = refuse; the live Close Now path is untouched. Nothing touches the network.
// Run: deno test -A --no-check supabase/tests/v343_test.ts
// Clock pinned to Wed 21 Oct 2026, 11:00 AM ET (market open), moved by tests.
const RealDate = Date; let NOW = RealDate.parse("2026-10-21T15:00:00Z");
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");
const ID = "61616161-6161-4161-8161-616161616161", ID2 = "62626262-6262-4262-8262-626262626262";
const mk = (id: string, extra: any = {}, pfAt = "2026-10-21T14:42:00Z") => ({
  id, title: "PRACTICE — TSLA 420C 10/23", status: "paper_taken", created_at: "2026-10-21T14:40:00Z", decided_at: pfAt, decided_by: "Josh", created_by: "watcher", summary: "", review: "", result: null,
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "opt-tsla", side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "4.10" } }],
  plan: { tv_symbol: "NASDAQ:TSLA", direction: "up", tp1: 424, stop: 417.5, wrong_tf: 5, entry_underlying: 419.8, practice: true, paper_fill: { ask: 4.1, delta: 0.45, underlying: 419.9, at: pfAt, by: "Josh" } },
  exit: { state: "planned", entry_limit: 4.1, qty: 1 }, checks: [], risk: {}, banner: null, outcome: null, ...extra,
});
let BARS: any[] | null = null;
let ROWS: any[] = [], DESK: string[] = [], ACTIVITY: string[] = [], BID: string | null = "4.48";
const rhCalls: string[] = [], writes: string[] = [];
const J = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (path.startsWith("otto_actions?")) {
      const id = /id=eq\.([0-9a-f-]{36})/i.exec(path)?.[1];
      let rows = ROWS.filter((r) => !id || r.id === id);
      const st = /status=eq\.(\w+)/.exec(path)?.[1]; if (st) rows = rows.filter((r) => r.status === st);
      if (/outcome->>practice_close=is\.null/.test(path)) rows = rows.filter((r) => !r.outcome?.practice_close);
      if (/outcome->>practice_close=eq\.true/.test(path)) rows = rows.filter((r) => r.outcome?.practice_close === true);
      const gte = /created_at=gte\.([^&]+)/.exec(path)?.[1]; if (gte) rows = rows.filter((r) => r.created_at >= decodeURIComponent(gte));
      if (m === "PATCH") { writes.push(path); rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return Promise.resolve(rows.map((r) => ({ ...r }))); }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }
    if (path.startsWith("otto_desk")) { if (m === "POST") DESK.push(JSON.parse(init.body).content || ""); return Promise.resolve([{ id: 1 }]); }
    if (path.startsWith("otto_activity")) { if (m === "POST") { const b = JSON.parse(init.body), row = Array.isArray(b) ? b[0] : b; ACTIVITY.push(row.text || ""); return Promise.resolve([row]); } return Promise.resolve([]); }
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string) => {
    rhCalls.push(tool);
    if (tool === "get_option_quotes") { if (BID === "throw") return Promise.reject(new Error("quote down")); return Promise.resolve(J({ data: { results: [{ quote: BID === null ? { ask_price: "4.60" } : { bid_price: BID, ask_price: "4.60", updated_at: "2026-10-21T14:59:50Z" } }] } })); }
    if (tool === "get_option_positions") return Promise.resolve(J({ data: { positions: [] } }));
    if (tool === "get_equity_historicals") return BARS ? Promise.resolve(J({ data: { results: [{ symbol: "TSLA", bars: BARS }] } })) : Promise.reject(new Error("no bars in tests"));
    return Promise.reject(new Error("unexpected Robinhood tool: " + tool));
  },
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const GOOD = b64({ alg: "none" }) + "." + b64({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" }) + ".x";
const route = (fn: string, body: any = {}) => HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn, { method: "POST", headers: { authorization: "Bearer " + GOOD, "content-type": "application/json" }, body: JSON.stringify(body) })).then((r: any) => r.json());
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const reset = (rows: any[] = [], bid: string | null = "4.48") => { BARS = null; (M as any).clearCacheForTest?.(); ROWS = rows; BID = bid; DESK = []; ACTIVITY = []; rhCalls.length = 0; writes.length = 0; setNow("2026-10-21T15:00:00Z"); };
const noOrderTool = () => !rhCalls.some((t) => /place_|cancel_|exercise|review_/.test(t));

Deno.test("v3.43 trade_live: an open practice trade shows with the live sell price and a PRACTICE flag; real list untouched", async () => {
  reset([mk(ID)]);
  const j = await route("trade_live");
  const t = j.trades.find((x: any) => x.practice);
  assert(j.ok && t && t.option_id === "P:" + ID && t.card_id === ID, "row " + JSON.stringify(j).slice(0, 300));
  assert(t.entry === 4.1 && t.bid === 4.48 && t.est_pnl === 38 && t.qty === 1, "numbers " + JSON.stringify([t.entry, t.bid, t.est_pnl]));
  assert(t.plan && t.plan.wrong_if === 417.5 && t.plan.tp1 === 424 && t.plan.tf === 5 && t.plan.dir === "up", "plan " + JSON.stringify(t.plan));
  assert(t.label === "TSLA 420C 10/23", "label " + t.label);
  assert(noOrderTool(), "no order tool: " + rhCalls.join(","));
});
Deno.test("v3.43 trade_live: not shown once scored by rule, once closed by hand, from another day, or when never taken", async () => {
  reset([mk(ID, { outcome: { state: "win", pnl_est: 90 } }), mk(ID2, { outcome: { state: "loss", pnl_est: -10, practice_close: true } }),
    { ...mk("63636363-6363-4363-8363-636363636363"), status: "paper_wait" }, mk("64646464-6464-4464-8464-646464646464", {}, "2026-10-20T14:42:00Z")]);
  const j = await route("trade_live");
  assert(j.ok && j.trades.filter((x: any) => x.practice).length === 0, "none: " + JSON.stringify(j.trades.map((x: any) => x.option_id)));
});
Deno.test("v3.43 trade_live: no bid or a failing quote still lists the trade with unavailable numbers", async () => {
  reset([mk(ID)], null);
  let t = (await route("trade_live")).trades.find((x: any) => x.practice);
  assert(t && t.bid === null && t.est_pnl === null, "no bid " + JSON.stringify(t));
  reset([mk(ID)], "throw");
  t = (await route("trade_live")).trades.find((x: any) => x.practice);
  assert(t && t.bid === null && t.est_pnl === null && /quote down/.test(t.quote_error), "throw " + JSON.stringify(t));
});
Deno.test("v3.43 Close Now (practice): sells at the live bid, writes HIS result, keeps a what-if slot, Desk + Activity lines, no Robinhood order tool", async () => {
  reset([mk(ID)]);
  const r = await route("close_now", { option_id: "P:" + ID, author: "Josh" });
  assert(r.ok && r.practice && r.state === "filled" && r.fill_px === 4.48 && r.entry_px === 4.1 && r.pnl === 38 && r.by === "Josh" && r.card === ID, "result " + JSON.stringify(r));
  const o = ROWS[0].outcome;
  assert(o.state === "win" && o.pnl_est === 38 && o.practice_close === true && o.exit_px === 4.48 && o.entry_px === 4.1 && o.closed_by === "Josh" && o.rule_grade.state === "pending", "outcome " + JSON.stringify(o));
  assert(ROWS[0].status === "paper_taken", "status stays paper_taken (no new status, no SQL)");
  assert(DESK.some((d) => /Josh closed the practice trade/.test(d) && /Nothing was sent to Robinhood/.test(d)), "desk " + DESK.join("|"));
  assert(ACTIVITY.some((a) => /Closed by Josh \(Close Now, practice\)/.test(a)), "activity " + ACTIVITY.join("|"));
  assert(noOrderTool() && rhCalls.every((t) => t === "get_option_quotes"), "only a quote read: " + rhCalls.join(","));
  // the practice book counts it
  const st = M.practiceStats(ROWS, { start: 4000, since: "2026-10-20T12:01:03Z" });
  assert(st.balance === 4038 && st.taken === 1, "book " + JSON.stringify(st));
  // and it is no longer listed as open
  assert((await route("trade_live")).trades.filter((x: any) => x.practice).length === 0, "gone from IN A TRADE");
});
Deno.test("v3.43 Close Now (practice): a loss and a scratch are scored by the sign of his sell", async () => {
  reset([mk(ID)], "3.40");
  let r = await route("close_now", { option_id: "P:" + ID, author: "Josh" });
  assert(r.ok && r.pnl === -70 && ROWS[0].outcome.state === "loss", "loss " + JSON.stringify(r));
  reset([mk(ID)], "4.10");
  r = await route("close_now", { option_id: "P:" + ID, author: "Josh" });
  assert(r.ok && r.pnl === 0 && ROWS[0].outcome.state === "scratch", "scratch " + JSON.stringify(r));
});
Deno.test("v3.43 Close Now (practice) refuses with a plain reason, writes nothing: no bid, quote error, market closed, already closed, unknown, bad id", async () => {
  reset([mk(ID)], null);
  let r = await route("close_now", { option_id: "P:" + ID });
  assert(!r.ok && /Price unavailable/.test(r.error) && /still open/.test(r.error) && ROWS[0].outcome === null && writes.length === 0, "no bid " + JSON.stringify(r));
  reset([mk(ID)], "throw");
  r = await route("close_now", { option_id: "P:" + ID });
  assert(!r.ok && /Price unavailable/.test(r.error) && ROWS[0].outcome === null, "throw " + JSON.stringify(r));
  reset([mk(ID)]); setNow("2026-10-21T21:00:00Z");
  r = await route("close_now", { option_id: "P:" + ID });
  assert(!r.ok && /Market is closed/.test(r.error) && ROWS[0].outcome === null && rhCalls.length === 0, "closed " + JSON.stringify(r));
  reset([mk(ID, { outcome: { state: "win", pnl_est: 90 } })]);
  r = await route("close_now", { option_id: "P:" + ID });
  assert(!r.ok && /already closed/.test(r.error) && ROWS[0].outcome.pnl_est === 90, "scored " + JSON.stringify(r));
  reset([mk(ID)]);
  r = await route("close_now", { option_id: "P:" + ID2 });
  assert(!r.ok && /not found/.test(r.error), "unknown " + JSON.stringify(r));
  r = await route("close_now", { option_id: "P:not-an-id" });
  assert(!r.ok && /not found/.test(r.error), "bad id " + JSON.stringify(r));
  reset([{ ...mk(ID), status: "paper_wait" }]);
  r = await route("close_now", { option_id: "P:" + ID });
  assert(!r.ok && /not found/.test(r.error), "not taken " + JSON.stringify(r));
});
Deno.test("v3.43 Close Now (practice): a second tap while one is running closes it once", async () => {
  reset([mk(ID)]);
  const [a, b] = await Promise.all([route("close_now", { option_id: "P:" + ID, author: "Josh" }), route("close_now", { option_id: "P:" + ID, author: "Josh" })]);
  assert([a, b].filter((x: any) => x.ok).length === 1, "exactly one: " + JSON.stringify([a, b]));
  assert(ACTIVITY.filter((x) => /Close Now, practice/.test(x)).length === 1, "one activity line");
});
const bar = (begins: string, o: number, h: number, l: number, c: number) => ({ begins_at: begins, open_price: String(o), high_price: String(h), low_price: String(l), close_price: String(c), interpolated: false });
Deno.test("v3.43 scoreTick: keeps a hand close as HIS result and fills the rule's what-if beside it; an untouched practice card is still graded as before", async () => {
  // the stock hit the 424 target at 14:45: the rule would have said WIN
  const hit = [bar("2026-10-21T14:40:00Z", 419.8, 420.1, 419.5, 419.9), bar("2026-10-21T14:45:00Z", 419.9, 424.6, 419.7, 424.2), bar("2026-10-21T14:50:00Z", 424.2, 424.9, 423.5, 424.0)];
  reset([mk(ID, { outcome: { state: "loss", pnl_est: -70, practice_close: true, closed_by: "Josh", rule_grade: { state: "pending" } } }), mk(ID2)]);
  BARS = hit;
  const r = await M.scoreTick(6);
  const hand = ROWS[0].outcome, plain = ROWS[1].outcome;
  assert(hand.practice_close === true && hand.state === "loss" && hand.pnl_est === -70 && hand.closed_by === "Josh", "his result kept " + JSON.stringify(hand));
  assert(hand.rule_grade.state === "win" && hand.rule_grade.pnl_est > 0, "what-if filled " + JSON.stringify(hand.rule_grade));
  assert(plain && plain.state === "win" && !plain.practice_close, "untouched card graded as before " + JSON.stringify(plain));
  // running it again changes nothing
  const before = JSON.stringify(ROWS[0].outcome); await M.scoreTick(6);
  assert(JSON.stringify(ROWS[0].outcome) === before, "idempotent");
  assert(r.ok, "tick ok");
});
Deno.test("v3.43 scoreTick race: a hand close that lands while the rule is being graded is NOT overwritten", async () => {
  reset([mk(ID)]);
  BARS = [bar("2026-10-21T14:40:00Z", 419.8, 420.1, 419.5, 419.9), bar("2026-10-21T14:45:00Z", 419.9, 424.6, 419.7, 424.2)];
  // the card looks open when scoreTick reads it; Josh's close lands before the rule's PATCH
  const realDb = (globalThis as any).__OTTO_TEST__.db; let first = true;
  (globalThis as any).__OTTO_TEST__.db = (path: string, init: any = {}) => {
    const out = realDb(path, init);
    if (first && path.startsWith("otto_actions?") && (init.method || "GET") === "GET" && /created_at=gte/.test(path)) {
      first = false; return out.then((rows: any[]) => { ROWS[0].outcome = { state: "loss", pnl_est: -70, practice_close: true, closed_by: "Josh", rule_grade: { state: "pending" } }; return rows; });
    }
    return out;
  };
  try { await M.scoreTick(6); } finally { (globalThis as any).__OTTO_TEST__.db = realDb; }
  assert(ROWS[0].outcome.practice_close === true && ROWS[0].outcome.state === "loss" && ROWS[0].outcome.pnl_est === -70, "his close survived " + JSON.stringify(ROWS[0].outcome));
});
Deno.test("v3.43 scoreRows + coach log carry the hand close and the what-if", () => {
  const rows = M.scoreRows([mk(ID, { outcome: { state: "win", pnl_est: 38, practice_close: true, closed_by: "Josh", rule_grade: { state: "loss", pnl_est: -50 } } }), mk(ID2, { outcome: { state: "win", pnl_est: 90 } })], {});
  assert(rows[0].hand_close === "Josh" && rows[0].rule_state === "loss" && rows[0].rule_est === -50 && rows[0].est === 38 && rows[0].state === "win", "row0 " + JSON.stringify(rows[0]));
  assert(rows[1].hand_close === null && rows[1].rule_state === null, "row1 untouched " + JSON.stringify(rows[1]));
  const pend = M.scoreRows([mk(ID, { outcome: { state: "win", pnl_est: 38, practice_close: true, closed_by: "Josh", rule_grade: { state: "pending" } } })], {});
  assert(pend[0].rule_state === null, "pending what-if is null");
});
Deno.test("v3.43 the live Close Now path is untouched: a real option id never goes to the practice code", async () => {
  reset([mk(ID)]);
  const r = await route("close_now", { option_id: "real-option-id", author: "Josh" });
  assert(!r.ok && !/practice/i.test(r.error || ""), "went the live way: " + JSON.stringify(r).slice(0, 200));
  assert(ROWS[0].outcome === null && !ACTIVITY.some((a) => /practice/.test(a)), "practice card untouched");
});
