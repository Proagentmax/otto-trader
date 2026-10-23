// v3.41 (20 Oct 2026): the WHY GATE (Approve needs three lines, Reject one, Close Now one after the fill), the $4,000 PRACTICE BOOK
// (practice cards ignore the live size cap; offered / answered / expired counted), honest card wording, the Friday report card.
// Nothing touches the network: Supabase and Robinhood are faked, the Deno.serve handler is captured and called directly.
// Run: deno test -A --no-check supabase/tests/v341_test.ts
const ID = "51515151-5151-4151-8151-515151515151", ID2 = "52525252-5252-4252-8252-525252525252", CLOSE = "53535353-5353-4353-8353-535353535353";
const mk = (id: string, status: string, ageMin = 1, extra: any = {}) => ({
  id, title: "PRACTICE — TSLA 377.5C 10/23", status, created_at: new Date(Date.now() - ageMin * 60e3).toISOString(), created_by: "watcher", summary: "", review: "", result: null,
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "opt-tsla", side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "7.40" } }],
  plan: { tv_symbol: "NASDAQ:TSLA", direction: "up", tp1: 367.5, stop: 362.5, entry_underlying: 364.18, origin: "coach_call", practice: true }, exit: { state: "planned", entry_limit: 7.4, qty: 1, option_id: "opt-tsla" },
  checks: [{ ok: null, practice: true, text: "PRACTICE · Over the size cap for LIVE" }], risk: {}, banner: null, outcome: null, ...extra,
});
let ROWS: any[] = [], SETTINGS: Record<string, any> = {}, DESK: string[] = [], ACTIVITY: string[] = [];
const rhCalls: string[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (path.startsWith("otto_actions?")) {
      const id = /id=eq\.([0-9a-f-]{36})/i.exec(path)?.[1];
      let rows = ROWS.filter((r) => !id || r.id === id);
      const st = /status=eq\.(\w+)/.exec(path)?.[1];
      if (st) rows = rows.filter((r) => r.status === st);
      const opt = /exit->>option_id=eq\.([\w-]+)/.exec(path)?.[1];
      if (opt) rows = rows.filter((r) => r.exit?.option_id === opt);
      if (m === "PATCH") { rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return Promise.resolve(rows.map((r) => ({ ...r }))); }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }
    if (path.startsWith("otto_settings?")) {
      const key = /key=eq\.(\w+)/.exec(path)?.[1];
      if (m === "POST") { const b = JSON.parse(init.body); SETTINGS[b.key] = b.value; return Promise.resolve([]); }
      return Promise.resolve(key && SETTINGS[key] !== undefined ? [{ key, value: SETTINGS[key] }] : []);
    }
    if (path.startsWith("otto_desk")) { if (m === "POST") DESK.push(JSON.parse(init.body).content || ""); return Promise.resolve([{ id: 1 }]); }
    if (path.startsWith("otto_activity")) { if (m === "POST") ACTIVITY.push(JSON.parse(init.body).text || ""); return Promise.resolve([]); }
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string) => {
    rhCalls.push(tool);
    const j = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
    if (tool === "get_option_quotes") return Promise.resolve(j({ data: { results: [{ quote: { ask_price: "7.40", delta: "0.41" } }] } }));
    if (tool === "get_equity_quotes") return Promise.resolve(j({ data: { results: [{ quote: { symbol: "TSLA", last_trade_price: "364.20" } }] } }));
    return Promise.reject(new Error("unexpected Robinhood tool: " + tool));
  },
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: any) => b64({ alg: "none" }) + "." + b64(claims) + ".x";
const GOOD = jwt({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" });
const post = (fn: string, body: any) => HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn, { method: "POST", headers: { authorization: "Bearer " + GOOD, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = (fn: string) => HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn, { headers: { authorization: "Bearer " + GOOD } }));
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const WHY = { setup: "Coach's all-clear above 363, 5-min close 364.18 over it", why_now: "first close over the level, waiting = buying above the fill", kills: "TSLA 5-min close under 362.50" };

Deno.test("v3.41 whyGate: three lines to approve, one to reject, each at least 10 characters; cleaned and capped", () => {
  const a = M.whyGate(WHY, "approve");
  assert(a.setup.startsWith("Coach's") && a.kills === "TSLA 5-min close under 362.50" && a.at, JSON.stringify(a));
  let e = ""; try { M.whyGate({ setup: "ok", why_now: WHY.why_now, kills: WHY.kills }, "approve"); } catch (x) { e = (x as Error).message; }
  assert(/Why gate: fill in setup/.test(e), "short setup refused: " + e);
  e = ""; try { M.whyGate(null, "approve"); } catch (x) { e = (x as Error).message; }
  assert(/setup, why now, what kills it/.test(e), "all three named: " + e);
  e = ""; try { M.whyGate("not now", "reject"); } catch (x) { e = (x as Error).message; }
  assert(/say why not/.test(e), "'not now' is not a why: " + e);
  assert(M.whyGate("   chase — ran   $1.18 past the level ", "reject").why_not === "chase — ran $1.18 past the level", "whitespace cleaned");
  assert(M.whyGate({ why_not: "x".repeat(900) }, "reject").why_not.length === 400, "capped at 400");
  assert(M.WHY_MIN === 10, "minimum is 10");
});

Deno.test("v3.41 route fn=act: Approve on a practice card WITHOUT a why is refused and nothing is written; WITH a why it is taken and the why is stored", async () => {
  ROWS = [mk(ID, "paper_wait")]; rhCalls.length = 0;
  const r1 = await post("act", { id: ID, decision: "approve" });
  const j1 = await r1.json();
  assert(!j1.ok && /Why gate/.test(String(j1.error)), "refused: " + JSON.stringify(j1).slice(0, 160));
  assert(ROWS[0].status === "paper_wait" && rhCalls.length === 0, "nothing written, no quote read before the gate");
  const r2 = await post("act", { id: ID, decision: "approve", why: WHY });
  const j2 = await r2.json();
  assert(j2.ok && j2.action.status === "paper_taken", "taken: " + JSON.stringify(j2).slice(0, 160));
  assert(j2.action.plan.josh_why.setup === WHY.setup && j2.action.plan.josh_why.kills === WHY.kills && j2.action.plan.paper_fill.ask === 7.4, "why stored next to the fill: " + JSON.stringify(j2.action.plan).slice(0, 300));
  assert(!rhCalls.some((t) => /place_/.test(t)), "no order tool");
});

Deno.test("v3.41 route fn=act: Reject needs one line (why_not); stored on the card; a practice card past 20 minutes still expires on approve", async () => {
  ROWS = [mk(ID, "paper_wait"), mk(ID2, "paper_wait", 30)];
  const bad = await (await post("act", { id: ID, decision: "reject" })).json();
  assert(!bad.ok && /say why not/.test(String(bad.error)) && ROWS[0].status === "paper_wait", "reject without a why refused");
  const ok = await (await post("act", { id: ID, decision: "reject", why_not: "chase — ran $1.18 past the level" })).json();
  assert(ok.ok && ok.action.status === "rejected" && ok.action.plan.josh_reject_why.why_not === "chase — ran $1.18 past the level", JSON.stringify(ok.action.plan).slice(0, 200));
  const late = await (await post("act", { id: ID2, decision: "approve", why: WHY })).json();
  assert(late.action.status === "expired", "late approve expires: " + late.action.status);
});

Deno.test("v3.41 route fn=why_out: the line after Close Now lands on the close card and on the entry card for that option; too short is refused", async () => {
  ROWS = [mk(ID, "done", 40), { id: CLOSE, title: "Close TSLA 377.5C — done", status: "done", created_at: new Date().toISOString(), plan: { origin: "close_now" }, exit: null, calls: [], checks: [] }];
  ACTIVITY.length = 0;
  const short = await (await post("why_out", { id: CLOSE, text: "meh" })).json();
  assert(!short.ok && /at least 10/.test(short.error), "short refused");
  const r = await (await post("why_out", { id: CLOSE, option_id: "opt-tsla", text: "wrong-if 363.88 about to close under; not riding it to the stop" })).json();
  assert(r.ok && r.cards.length === 2 && r.cards.includes(CLOSE) && r.cards.includes(ID), "both cards stamped: " + JSON.stringify(r));
  assert(ROWS[0].plan.josh_exit_why.text.startsWith("wrong-if 363.88") && ROWS[1].plan.josh_exit_why.by === "ottotrader", "stored with who");
  assert(ACTIVITY.some((t) => /Why out \(ottotrader\)/.test(t)), "activity row");
  const none = await (await post("why_out", { id: "54545454-5454-4454-8454-545454545454", text: "a line long enough" })).json();
  assert(!none.ok && /No card found/.test(none.error), "unknown card");
});

Deno.test("v3.41 practice book: offered / answered / expired / balance / overrides from cards since the book started; scoreRows carries the whys", () => {
  const since = "2026-10-20T20:05:00Z";
  const at = (h: number) => new Date(Date.parse(since) + h * 3600e3).toISOString();
  const cards = [
    mk("a", "paper_taken", 1, { created_at: at(14), outcome: { state: "win", pnl_est: 105 }, plan: { practice: true, josh_why: WHY, override: true, override_read: "chase" } }),
    mk("b", "rejected", 1, { created_at: at(15), outcome: { state: "win", pnl_est: 53 }, plan: { practice: true, josh_reject_why: { why_not: "chase — ran past the level" } } }),
    mk("c", "expired", 1, { created_at: at(16), outcome: { state: "scratch", pnl_est: 33 }, plan: { practice: true } }),
    mk("d", "paper_taken", 1, { created_at: at(17), outcome: { state: "loss", pnl_est: -10 }, plan: { practice: true, josh_why: WHY } }),
    mk("e", "paper_taken", 1, { created_at: at(18), outcome: { state: "pending" }, plan: { practice: true, josh_why: WHY } }),
    mk("old", "paper_taken", 1, { created_at: "2026-10-19T14:16:00Z", outcome: { state: "win", pnl_est: 158 }, plan: { practice: true } }),   // Monday 19 Oct: before the book — history only
    { id: "live", title: "LIVE — SPY 766P", status: "done", created_at: at(20), calls: mk("x", "done").calls, plan: { origin: "coach_call" }, checks: [], outcome: { state: "win", pnl_est: 40 } },
    mk("dup", "paper_taken", 1, { created_at: at(17.001), outcome: { state: "loss", pnl_est: -15 }, plan: { practice: true, josh_why: WHY, duplicate_of: "d" } }),   // v3.45: the 22 Oct META twin — voided, never counted
  ];
  const st = M.practiceStats(cards, { start: 4000, since });
  assert(st.offered === 5 && st.answered === 4 && st.taken === 3 && st.rejected === 1 && st.expired === 1, "counts: " + JSON.stringify(st));
  assert(st.balance === 4095 && st.scoring === 1 && st.whys === 4, "balance 4000 + 105 − 10 (pending not counted): " + JSON.stringify(st));
  assert(st.overrides.n === 1 && st.overrides.wins === 1 && st.overrides.est === 105, "override line: " + JSON.stringify(st.overrides));
  const none = M.practiceStats(cards, { start: 4000, since: null });
  assert(none.offered === 0 && none.balance === 4000, "no start date = nothing counted yet");
  const rows = M.scoreRows(cards, {});
  const a = rows.find((r: any) => r.id === "a"), b = rows.find((r: any) => r.id === "b"), l = rows.find((r: any) => r.id === "live");
  assert(a.practice === true && a.override === true && a.why.kills === WHY.kills && b.why_not.startsWith("chase") && l.practice === false && l.why === null, "rows carry practice/override/why: " + JSON.stringify([a, b, l]).slice(0, 400));
  assert(M.isPracticeCard({ status: "rejected", plan: {}, checks: [{ practice: true }] }) && !M.isPracticeCard({ status: "rejected", plan: {}, checks: [] }), "older practice cards are known by their check row");
});

Deno.test("v3.41 report card grade: 40% answered, 30% whys naming a level and a kill, 30% last week's rule; a good why has numbers in setup and kill", () => {
  assert(M.goodWhy(WHY) && !M.goodWhy({ setup: "looked good", why_now: "felt right", kills: "if it drops" }) && M.goodWhy({ why_not: "chase — ran past 363" }), "goodWhy");
  const g = M.letterGrade({ answered: 5, offered: 6, good_whys: 4, whys: 5, rule_followed: true });
  assert(g.score === 87 && g.letter === "A−", "5/6 answered, 4/5 good, rule followed → " + JSON.stringify(g));
  const z = M.letterGrade({ answered: 0, offered: 4, good_whys: 0, whys: 0, rule_followed: false });
  assert(z.letter === "F" && z.score === 0, "Monday 19 Oct would have been an F: " + JSON.stringify(z));
  const q = M.letterGrade({ answered: 0, offered: 0, good_whys: 0, whys: 0, rule_followed: null });
  assert(q.score === 85 && q.letter === "B+", "no cards offered, rule unknown: nothing to fail on → " + JSON.stringify(q));
});

Deno.test("v3.41 report card: built from the cards and fills (no model key → the standing rule); posted text has the grade, the counts, the rule; saved for Monday's read", async () => {
  const since = "2026-10-19T00:00:00Z";
  SETTINGS = { practice_book: { start: 4000, since } };
  ROWS = [
    mk("a", "paper_taken", 1, { outcome: { state: "win", pnl_est: 105 }, plan: { practice: true, josh_why: WHY, tv_symbol: "NASDAQ:TSLA", origin: "coach_call" } }),
    mk("b", "rejected", 1, { outcome: { state: "win", pnl_est: 53 }, plan: { practice: true, josh_reject_why: { why_not: "chase past 768.86" } } }),
    mk("c", "expired", 1, { outcome: { state: "scratch", pnl_est: 33 }, plan: { practice: true } }),
  ];
  const r = await (await get("report_card&build=1")).json();
  assert(r.ok && r.stats.offered === 3 && r.stats.answered === 2 && r.stats.expired === 1, "counts: " + JSON.stringify(r.stats));
  assert(/Report card — week of /.test(r.text) && /Grade: [A-F]/.test(r.text) && /3 offered, 2 answered \(1 taken, 1 rejected\), 1 expired — expired counts against you/.test(r.text), r.text);
  assert(/Practice book: \$4,000 → \$4,105/.test(r.text), "balance line: " + r.text);
  assert(r.rule === M.REPORT_RULE_DEFAULT && /One rule for next week: Answer every card/.test(r.text), "no model = standing rule: " + r.rule);
  assert(/Your whys: 2 written, 2 named a level and a kill/.test(r.text), "whys line: " + r.text);
  assert(SETTINGS.report_card_last?.grade === r.grade, "saved for the Monday read");
  const cached = await (await get("report_card")).json();
  assert(cached.built_at === r.built_at, "without build=1 the saved one comes back");
});

Deno.test("v3.41 Desk wording: an auto-rejected card names the one real reason; the prompt says the only unapprovable card is a kill-switch card", async () => {
  const src = await Deno.readTextFile(new URL("../otto-proxy.ts", import.meta.url));
  assert(/📄 Auto-rejected — \$\{String\(paper\)/.test(src), "Desk line");
  assert(!/It's shown and scored; it can't be approved\./.test(src), "old line gone");
  assert(/HONEST CARD STATUS \(v3\.41\)/.test(src) && /Never say "paper cards can't be approved"/.test(src), "prompt rule");
  assert(/"why_out", "report_card"/.test(src), "routes allowed");
});
