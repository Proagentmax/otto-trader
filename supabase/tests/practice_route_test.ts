// v3.35 practice cards: the REAL fn=act route (the one the app calls). A practice card is approved or rejected in our own database;
// no Robinhood order tool is ever called. Nothing touches the network: Supabase and Robinhood are faked, the Deno.serve handler is captured.
// Run: deno test -A --no-check supabase/tests/practice_route_test.ts
const ID = "41414141-4141-4141-8141-414141414141", ID2 = "42424242-4242-4242-8242-424242424242";
const mk = (id: string, status: string, ageMin = 1) => ({
  id, title: "PAPER — NVDA 225C", status, created_at: new Date(Date.now() - ageMin * 60e3).toISOString(), created_by: "watcher", summary: "", review: "", result: null,
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "opt-nvda", side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "2.10" } }],
  plan: { tv_symbol: "NASDAQ:NVDA", direction: "up", tp1: 226.4, stop: 223.9, entry_underlying: 224.8, origin: "jarvis" }, exit: { state: "planned", entry_limit: 2.1, qty: 1 }, checks: [], risk: {}, banner: null, outcome: { state: "loss", pnl_est: -50 },
});
let ROWS: any[] = [];
const rhCalls: string[] = [], dbWrites: string[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (m !== "GET") dbWrites.push(m + " " + path);
    if (path.startsWith("otto_actions?")) {
      const id = /id=eq\.([0-9a-f-]{36})/i.exec(path)?.[1];
      let rows = ROWS.filter((r) => !id || r.id === id);
      const st = /status=eq\.(\w+)/.exec(path)?.[1];
      if (st) rows = rows.filter((r) => r.status === st);
      if (m === "PATCH") { rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return Promise.resolve(rows.map((r) => ({ ...r }))); }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string) => {
    rhCalls.push(tool);
    const j = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
    if (tool === "get_option_quotes") return Promise.resolve(j({ data: { results: [{ quote: { ask_price: "2.25", delta: "0.33" } }] } }));
    if (tool === "get_equity_quotes") return Promise.resolve(j({ data: { results: [{ quote: { symbol: "NVDA", last_trade_price: "224.95" } }] } }));
    return Promise.reject(new Error("unexpected Robinhood tool: " + tool));
  },
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: any) => b64({ alg: "none" }) + "." + b64(claims) + ".x";
const GOOD = jwt({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" });
const act = (id: string, decision: string, token = GOOD) => HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=act", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ id, decision, why: { setup: "test setup in words", why_now: "test why now line", kills: "test kill line 123" }, why_not: "test why not line" }) }));
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }

Deno.test("v3.35 route fn=act: Approve on a practice card = paper_taken at the live ask; only quotes are read, no order tool, one DB write path", async () => {
  ROWS = [mk(ID, "paper_wait")]; rhCalls.length = 0; dbWrites.length = 0;
  const r = await act(ID, "approve"); const j = await r.json();
  assert(r.status === 200 && j.ok && j.action.status === "paper_taken", "taken: " + JSON.stringify(j).slice(0, 200));
  const pf = j.action.plan.paper_fill;
  assert(pf.ask === 2.25 && pf.delta === 0.33 && pf.underlying === 224.95, "fill " + JSON.stringify(pf));
  assert(j.action.outcome === null, "re-score from the tap");
  assert(rhCalls.every((t) => /^get_(option|equity)_quotes$/.test(t)) && rhCalls.length > 0, "only quote reads: " + rhCalls.join(","));
  assert(!rhCalls.some((t) => /place_|cancel_|exercise/.test(t)), "no order tool");
});
Deno.test("v3.35 route fn=act: Reject = rejected; an old practice card cannot be approved; a stranger is locked out; a live pending card still takes the old path", async () => {
  ROWS = [mk(ID, "paper_wait"), mk(ID2, "paper_wait", 30)]; rhCalls.length = 0;
  const r1 = await (await act(ID, "reject")).json();
  assert(r1.action.status === "rejected", "rejected: " + r1.action.status);
  const r2 = await (await act(ID2, "approve")).json();
  assert(r2.action.status === "expired", "late: " + r2.action.status);
  assert(rhCalls.length === 0, "no Robinhood call at all for reject / expire: " + rhCalls.join(","));
  ROWS = [mk(ID, "paper_wait")];
  const bad = await act(ID, "approve", jwt({ role: "authenticated", sub: "u2", email: "stranger@x.com" }));
  assert(bad.status === 403 && ROWS[0].status === "paper_wait", "stranger: " + bad.status);
  const anon = await HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=act", { method: "POST", body: JSON.stringify({ id: ID, decision: "approve" }) }));
  assert(anon.status === 401 && ROWS[0].status === "paper_wait", "no token: " + anon.status);
  ROWS = [mk(ID, "paper")];
  const safe = await (await act(ID, "approve")).json();
  assert(safe.action.status === "paper" && rhCalls.length === 0, "safety paper stays paper: " + safe.action.status);
});
Deno.test("v3.35 scoreRows carries who decided", async () => {
  const M = await import("../otto-proxy.ts");
  const rows = M.scoreRows([{ ...mk(ID, "paper_taken"), decided_by: "Josh", outcome: { state: "win", pnl_est: 80 } }], {});
  assert(rows[0].by === "Josh" && rows[0].status === "paper_taken" && rows[0].est === 80, JSON.stringify(rows[0]));
});
