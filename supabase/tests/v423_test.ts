// v4.2.3 (26 Oct 2026): the seven end-of-day findings of Fri 23 Oct (claude/day-review-2026-10-23.md) + the tightened weak flag.
// 1 duplicate twin not counted in the coach log / report card · 2 honest wording on rule-scored practice trades · 3 full titles in the
// override list · 4 the model sees `expired` · 5 a practice trade stopped by its rule posts one Desk line · 7 no-option_id outcomes are
// tagged "est. (no contract)" · weak: plan.weak only means No Edge / Choppy / chase (server guard), and only that counts as an override.
// Run: deno test -A --no-check supabase/tests/v423_test.ts     Nothing touches the network.
const RealDate = Date; let NOW = RealDate.parse("2026-10-21T15:00:00Z");
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");
const ID = "71717171-7171-4171-8171-717171717171", ID2 = "72727272-7272-4272-8272-727272727272", ID3 = "73737373-7373-4373-8373-737373737373";
const mk = (id: string, extra: any = {}, pfAt = "2026-10-21T14:42:00Z") => ({
  id, title: "PRACTICE — TSLA 420C 10/23 bounce off the 419.5 shelf", status: "paper_taken", created_at: "2026-10-21T14:40:00Z", decided_at: pfAt, decided_by: "Josh", created_by: "watcher", summary: "Bounce off 419.5", review: "", result: null,
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "opt-tsla", side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "4.10" } }],
  plan: { tv_symbol: "NASDAQ:TSLA", direction: "up", tp1: 424, stop: 417.5, wrong_tf: 5, entry_underlying: 419.8, practice: true, paper_fill: { ask: 4.1, delta: 0.45, underlying: 419.9, at: pfAt, by: "Josh" } },
  exit: { state: "planned", entry_limit: 4.1, qty: 1 }, checks: [], risk: {}, banner: null, outcome: null, ...extra,
});
let BARS: any[] | null = null;
let ROWS: any[] = [], DESK: string[] = [], SETTINGS: Record<string, any> = {};
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
      if (m === "PATCH") { rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return Promise.resolve(rows.map((r) => ({ ...r }))); }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }
    if (path.startsWith("otto_settings?key=eq.")) { const k = /key=eq\.([^&]+)/.exec(path)![1]; return Promise.resolve(SETTINGS[k] != null ? [{ value: SETTINGS[k] }] : []); }
    if (path.startsWith("otto_settings")) { if (m !== "GET") { try { const b = JSON.parse(init.body); const row = Array.isArray(b) ? b[0] : b; if (row?.key) SETTINGS[row.key] = row.value; } catch { /* */ } } return Promise.resolve([]); }
    if (path.startsWith("otto_desk")) { if (m === "POST") DESK.push(JSON.parse(init.body).content || ""); return Promise.resolve([{ id: 1 }]); }
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string) => {
    if (tool === "get_option_quotes") return Promise.resolve(J({ data: { results: [{ quote: { bid_price: "4.48", ask_price: "4.60" } }] } }));
    if (tool === "get_option_positions") return Promise.resolve(J({ data: { positions: [] } }));
    if (tool === "get_equity_historicals") return BARS ? Promise.resolve(J({ data: { results: [{ symbol: "TSLA", bars: BARS }] } })) : Promise.reject(new Error("no bars in tests"));
    return Promise.reject(new Error("unexpected Robinhood tool: " + tool));
  },
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
(Deno as any).serve = (_h: any) => ({ finished: Promise.resolve() });
const M: any = await import("../otto-proxy.ts");
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const bar = (begins: string, o: number, h: number, l: number, c: number) => ({ begins_at: begins, open_price: String(o), high_price: String(h), low_price: String(l), close_price: String(c), interpolated: false });
const reset = (rows: any[] = []) => { BARS = null; (M as any).clearCacheForTest?.(); ROWS = rows; DESK = []; SETTINGS = {}; NOW = RealDate.parse("2026-10-21T15:00:00Z"); };

Deno.test("v4.2.3 weak guard: only No Edge / Choppy / chase survives; ordinary doubt is dropped", () => {
  assert(M.weakGuard("Thin room to TP1 for the premium") === undefined, "thin room is not weak");
  assert(M.weakGuard("Binary event at 2 PM") === undefined, "binary event is not weak");
  assert(M.weakGuard("") === undefined && M.weakGuard(null) === undefined && M.weakGuard(12) === undefined, "empty / wrong type");
  assert(M.weakGuard("Choppy banner — the 5-minute closes have crossed the level 4 times") !== undefined, "choppy kept");
  assert(M.weakGuard("The read is No Edge today") !== undefined, "no edge kept");
  assert(M.weakGuard("The confirmation bar already ran well past the level — this is a chase") !== undefined, "chase kept");
  assert(M.weakGuard("x".repeat(400) + " chase").length === 240, "capped at 240");
});
Deno.test("v4.2.3 override read: a dropped weak text is not an override; a failed chase check still is", () => {
  assert(M.overrideRead({ plan: { weak: "Thin room to TP1" }, checks: [] }) === "", "no override on thin room");
  assert(/chop/i.test(M.overrideRead({ plan: { weak: "Choppy banner" }, checks: [] })), "choppy is an override");
  assert(/chas/i.test(M.overrideRead({ plan: {}, checks: [{ ok: false, text: "Chasing: entry 1.2% past the level" }] })), "chase check is an override");
  assert(M.overrideRead({ plan: {}, checks: [{ ok: true, text: "Chase check passed" }] }) === "", "a passed chase check is not");
});
Deno.test("v4.2.3 fix 2 + 7: practice note never says a bare 'scored win' next to a negative result; no-contract tag rides along", () => {
  assert(M.practiceNote({ state: "win", r: 0.37, pnl_est: -29 }) === "scored by its rule at the card price: win (0.37R); at your fill: −$29", M.practiceNote({ state: "win", r: 0.37, pnl_est: -29 }));
  assert(M.practiceNote({ state: "loss", r: -1, pnl_est: -27 }) === "scored loss (-1R)", M.practiceNote({ state: "loss", r: -1, pnl_est: -27 }));
  assert(M.practiceNote({ state: "win", r: 1.2, pnl_est: 80 }) === "scored win (1.2R)", "plain win");
  assert(M.practiceNote({ state: "loss", pnl_est: -168, est_no_contract: true }) === "scored loss · est. (no contract)", M.practiceNote({ state: "loss", pnl_est: -168, est_no_contract: true }));
  assert(M.practiceNote({ state: "pending" }) === undefined && M.practiceNote(null) === undefined, "pending / none");
});
Deno.test("v4.2.3 fix 7: hasNoContract spots an opening leg with no option_id (AAPL 355C, 23 Oct)", () => {
  assert(M.hasNoContract(mk(ID)) === false, "real contract");
  const bad = mk(ID); bad.calls[0].args.legs[0] = { side: "buy", position_effect: "open" };
  assert(M.hasNoContract(bad) === true, "no option_id");
  assert(M.hasNoContract({ calls: [{ tool: "place_option_order", args: { legs: [{ side: "sell", position_effect: "close" }] } }] }) === false, "a close leg alone is not an opening card");
});
Deno.test("v4.2.3 fix 5: a practice trade stopped by its own rule posts ONE Desk line; a second tick adds nothing", async () => {
  reset([mk(ID)]);
  // 5-minute close under the 417.5 wrong-if at 14:50
  BARS = [bar("2026-10-21T14:40:00Z", 419.8, 420.1, 419.5, 419.9), bar("2026-10-21T14:45:00Z", 419.9, 420.0, 417.9, 418.0), bar("2026-10-21T14:50:00Z", 418.0, 418.2, 416.8, 417.0), bar("2026-10-21T14:55:00Z", 417.0, 417.4, 416.5, 416.9)];
  await M.scoreTick(6);
  assert(ROWS[0].outcome?.state === "loss", "scored loss " + JSON.stringify(ROWS[0].outcome));
  const lines = DESK.filter((t) => t.startsWith("⏹ Practice trade"));
  assert(lines.length === 1, "one Desk line: " + JSON.stringify(DESK));
  assert(/TSLA 420C 10\/23/.test(lines[0]) && /stopped by its rule — 5-min close under 417\.5/.test(lines[0]) && /scored −\$\d+/.test(lines[0]) && /Nothing was sent to Robinhood/.test(lines[0]), lines[0]);
  await M.scoreTick(6);
  assert(DESK.filter((t) => t.startsWith("⏹ Practice trade")).length === 1, "no second line");
});
Deno.test("v4.2.3 fix 5: a no-contract card's rule stop says est. (no contract) on the Desk and tags the outcome", async () => {
  const bad = mk(ID); bad.calls[0].args.legs[0] = { side: "buy", position_effect: "open" };
  reset([bad]);
  BARS = [bar("2026-10-21T14:40:00Z", 419.8, 420.1, 419.5, 419.9), bar("2026-10-21T14:45:00Z", 419.9, 420.0, 417.9, 418.0), bar("2026-10-21T14:50:00Z", 418.0, 418.2, 416.8, 417.0), bar("2026-10-21T14:55:00Z", 417.0, 417.4, 416.5, 416.9)];
  await M.scoreTick(6);
  assert(ROWS[0].outcome?.est_no_contract === true, "tagged " + JSON.stringify(ROWS[0].outcome));
  assert(DESK.some((t) => t.startsWith("⏹ Practice trade") && /est\. \(no contract\)/.test(t)), JSON.stringify(DESK));
  const rows = M.scoreRows(ROWS, {});
  assert(rows[0].est_no_contract === true, "scoreRows carries the tag");
});
Deno.test("v4.2.3 fix 5: a live (done) card scored by the rule posts no practice line", async () => {
  reset([mk(ID, { status: "done" })]);
  BARS = [bar("2026-10-21T14:40:00Z", 419.8, 420.1, 419.5, 419.9), bar("2026-10-21T14:45:00Z", 419.9, 420.0, 417.9, 418.0), bar("2026-10-21T14:50:00Z", 418.0, 418.2, 416.8, 417.0), bar("2026-10-21T14:55:00Z", 417.0, 417.4, 416.5, 416.9)];
  await M.scoreTick(6);
  assert(ROWS[0].outcome?.state === "loss" && !DESK.some((t) => t.startsWith("⏹ Practice trade")), JSON.stringify(DESK));
});
Deno.test("v4.2.3 fix 1 + 2 + 3 + 7: coach log skips the duplicate twin and words rule-scored trades honestly; report card lists full titles and skips the twin", async () => {
  const twin = mk(ID2, { title: "PRACTICE — META 632.5P 10/24 twin", plan: { ...mk(ID2).plan, duplicate_of: ID, override: true, override_read: "Choppy" }, outcome: { state: "loss", pnl_est: -15 } });
  const win = mk(ID, { title: "PRACTICE — NVDA 215P 10/28 breakdown under the 212.5 shelf then retest", plan: { ...mk(ID).plan, override: true, override_read: "Choppy banner" }, outcome: { state: "win", r: 0.37, pnl_est: -29 } });
  const est = mk(ID3, { title: "PRACTICE — AAPL 355C 10/24 continuation", plan: { ...mk(ID3).plan, override: true, override_read: "chase" }, outcome: { state: "loss", pnl_est: -168, est_no_contract: true } });
  reset([win, twin, est]);
  const log = await M.coachLog(true);
  assert(log.n === 2, "twin skipped: " + log.n);
  assert(/scored by its rule at the card price: win \(0\.37R\); at your fill: −\$29/.test(log.text), log.text);
  assert(!/Result -\$29[^\n]*\n[^\n]*Note: scored win/.test(log.text), "no bare scored win next to a loss");
  assert(/est\. \(no contract\)/.test(log.text), "no-contract tag in the log");
  const rc = await M.reportCard("", true);
  assert(rc.overrides === 2, "report card overrides skip the twin: " + rc.overrides);
  assert(/NVDA 215P 10\/28 breakdown under the 212\./.test(rc.text) && !/NVDA 215P 10\/28 breakdown u \(/.test(rc.text), "practiceLabel (40 chars, like Close Now), not 28: " + rc.text);
  assert(/AAPL 355C 10\/24 continuation \(loss, est\. no contract\)/.test(rc.text), rc.text);
  assert(!/632\.5P/.test(rc.text), "twin not listed");
});
