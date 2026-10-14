// v3.34 Scoreboard: the `score` route now also returns `rows` (every opening option card, compact) so the app can total each day.
// Run: deno test -A --no-check supabase/tests/scoreboard_test.ts
// Nothing touches the network: Supabase is faked and the Deno.serve handler is captured and called directly.

const open = [{ tool: "place_option_order", args: { legs: [{ position_effect: "open" }] } }];
const act = (id: string, status: string, outcome: any, at: string, extra: any = {}) =>
  ({ id, title: "PAPER — " + id, created_at: at, status, calls: open, outcome, created_by: "signals", plan: {}, banner: {}, ...extra });
const ACTS: any[] = [
  act("p-win", "paper", { state: "win", r: 1.5, pnl_est: 106 }, "2026-10-14T16:21:00Z"),
  act("p-loss", "paper", { state: "loss", r: -1, pnl_est: -41 }, "2026-10-14T13:45:00Z"),
  act("rej", "rejected", { state: "loss", r: -1, pnl_est: -13 }, "2026-10-14T15:15:00Z"),
  act("live-win", "done", { state: "win", r: 1, pnl_est: 70 }, "2026-10-13T14:00:00Z", { created_by: "josh@x.com" }),
  act("pend", "paper", { state: "unscored" }, "2026-10-14T18:00:00Z"),
  { id: "not-idea", title: "close card", created_at: "2026-10-14T17:00:00Z", status: "done", calls: [{ tool: "place_option_order", args: { legs: [{ position_effect: "close" }] } }], outcome: null, plan: {}, banner: {} },
];
const TRADES = [{ action_id: "live-win", pnl: 52.5 }, { action_id: "live-win", pnl: 10 }];
const calls: string[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    calls.push((init.method || "GET") + " " + path.split("?")[0]);
    if (path.startsWith("otto_actions?")) return Promise.resolve(ACTS);
    if (path.startsWith("otto_trades?")) return Promise.resolve(TRADES);
    return Promise.resolve([]);
  },
  call: () => Promise.reject(new Error("no market calls expected")),
  brain: () => [], notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M = await import("../otto-proxy.ts");

const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: any) => b64({ alg: "none" }) + "." + b64(claims) + ".x";
const GOOD = jwt({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" });
const req = (fn: string, token = GOOD) => new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn, { headers: { authorization: "Bearer " + token } });
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }

Deno.test("v3.34 scoreRows: compact, one row per opening card, real and estimated dollars kept apart", () => {
  const pnlBy: Record<string, number> = { "live-win": 62.5 };
  const rows = M.scoreRows(ACTS.slice(0, 5), pnlBy);
  assert(rows.length === 5, "5 rows");
  const by = Object.fromEntries(rows.map((r: any) => [r.id, r]));
  assert(by["p-win"].est === 106 && by["p-win"].pnl === null && by["p-win"].status === "paper", "paper win keeps est, no real pnl");
  assert(by["live-win"].pnl === 62.5 && by["live-win"].status === "done", "real pnl comes from trades");
  assert(by["rej"].status === "rejected" && by["rej"].est === -13, "rejected card is present (the app leaves it out of totals)");
  assert(by["pend"].est === null && by["pend"].state === "unscored", "unscored has no dollars");
  assert(by["p-win"].source === "signal", "source label");
  assert(M.scoreRows([], {}).length === 0 && M.scoreRows(null as any, {}).length === 0, "empty and null are safe");
  const many = Array.from({ length: 450 }, (_, i) => act("i" + i, "paper", null, "2026-10-14T13:00:00Z"));
  assert(M.scoreRows(many, {}).length === 400, "capped at 400");
});

Deno.test("v3.34 route fn=score returns rows next to the old fields; read-only; signed-in Desk only", async () => {
  const r = await HANDLER(req("score"));
  assert(r.status === 200, "200 got " + r.status);
  const j = await r.json();
  assert(j.ok === true, "ok");
  assert(Array.isArray(j.rows) && j.rows.length === 5, "rows has the 5 opening cards, not the close card, got " + (j.rows || []).length);
  assert(j.rows.find((x: any) => x.id === "live-win").pnl === 62.5, "two trades summed to 62.5");
  assert(j.all && j.taken && Array.isArray(j.recent) && j.proof, "old fields still there");
  assert(j.recent.length === 5 && j.recent[0].id, "recent unchanged");
  // (the route already seeds the one-time proof_start setting and patches outcomes it scores; that is old behaviour, not new)
  assert(!calls.some((c) => /^(POST|PATCH|DELETE) otto_(actions|trades)/.test(c)), "no writes to cards or trades: " + calls.join(","));
  assert(!calls.some((c) => c.startsWith("DELETE")), "no deletes: " + calls.join(","));
  const bad = await HANDLER(req("score", jwt({ role: "authenticated", sub: "u2", email: "stranger@x.com" })));
  assert(bad.status === 403, "a stranger is locked out, got " + bad.status);
  const anon = await HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=score"));
  assert(anon.status === 401, "no token = 401, got " + anon.status);
});
