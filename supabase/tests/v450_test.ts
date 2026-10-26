// v4.5 (26 Oct 2026): this week's callouts — the seed posts them on the Desk; one tap arms them on the Watcher; the 8:45 read carries them Tue–Fri.
// Run: deno test -A --no-check supabase/tests/v450_test.ts
const RealDate = Date; let NOW = RealDate.parse("2026-10-26T15:00:00Z");
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");
let WATCH: any[] = [], SET: Record<string, any> = {}, DESK: string[] = [], ACT: string[] = [], BRAINROWS: any[] = [], SEEDS: any[] = [];
let PX: Record<string, string> = { MU: "900", NVDA: "214", AAPL: "345", AMZN: "250", TSLA: "387", SPY: "760", PLTR: "194", AMD: "520", INTC: "89", SKHY: "140", MSFT: "520", GOOGL: "330", META: "640", NOC: "560", PANW: "390", TXN: "286", DLTR: "125", XOM: "180", FCX: "66", VZ: "44" };
let wId = 1;
const J = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (path.startsWith("otto_watch")) {
      if (m === "POST") {
        const out: any[] = [];
        for (const r of JSON.parse(init.body)) { if (WATCH.some((x) => x.day === r.day && x.ticker === r.ticker && x.level === r.level && x.dir === r.dir)) continue; const n = { id: wId++, fired: {}, ...r }; WATCH.push(n); out.push(n); }
        return Promise.resolve(out);
      }
      return Promise.resolve(WATCH.map((r) => ({ ...r })));
    }
    if (path.startsWith("otto_settings")) {
      if (m === "POST") { const b = JSON.parse(init.body); SET[b.key] = b.value; return Promise.resolve([]); }
      const k = /key=eq\.([^&]+)/.exec(path)?.[1] || ""; return Promise.resolve(k in SET ? [{ value: SET[k] }] : []);
    }
    if (path.startsWith("otto_desk")) { if (m === "POST") DESK.push(JSON.parse(init.body).content || ""); return Promise.resolve([{ id: 1 }]); }
    if (path.startsWith("otto_activity")) { if (m === "POST") { const b = JSON.parse(init.body); ACT.push((Array.isArray(b) ? b[0] : b).text || ""); } return Promise.resolve([]); }
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string, args: any) => {
    if (tool === "get_equity_quotes") return Promise.resolve(J({ data: { results: (args.symbols || []).filter((s: string) => PX[s]).map((s: string) => ({ quote: { symbol: s, last_trade_price: PX[s] } })) } }));
    return Promise.reject(new Error("unexpected tool " + tool));
  },
  brain: () => BRAINROWS, notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any, init: any) => {
  const s = String(u);
  if (s.includes("/rest/v1/brain_versions")) { SEEDS.push(JSON.parse(init.body)); return Promise.resolve(new Response(JSON.stringify([{ version: 10 }]), { status: 201 })); }
  return Promise.reject(new Error("network disabled in tests: " + s.slice(0, 80)));
};
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const GOOD = b64({ alg: "none" }) + "." + b64({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" }) + ".x";
const route = async (fn: string, body: any = {}, qs = "") => (await HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn + qs, { method: "POST", headers: { authorization: "Bearer " + GOOD, "content-type": "application/json" }, body: JSON.stringify(body) }))).json();
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const reset = (iso = "2026-10-26T15:00:00Z") => { (M as any).clearCacheForTest?.(); WATCH = []; SET = {}; DESK = []; ACT = []; SEEDS = []; wId = 1; setNow(iso); };
const dropBrain = async () => { Deno.env.set("SUPABASE_URL", "https://x.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc"); await route("seed", [{ call: { date: "2000-01-01" }, levels: [] }]); DESK.length = 0; };   // the seed route clears the cached brain
const CALL = { call: { date: "2026-10-26", title: "Monday group call", mentor: "x" }, levels: [
  { instrument: "MU", value: "920", meaning: "needs a move above 920 for real movement; 928 = 200 EMA next", scope: "week" },
  { instrument: "MU", value: "880", meaning: "support; anything below 880 negates the morning move", scope: "week" },
  { instrument: "AMD", value: "510", meaning: "below 510 the move is negated", scope: "week" },
  { instrument: "TSLA", value: "383", meaning: "flip zone long", scope: "week" },
  { instrument: "NVDA", value: "215", meaning: "resistance / first sell order block", scope: "week" },
  { instrument: "US 10Y", value: "5.0", meaning: "above 5% keeps pressure on stocks", scope: "week" },
  { instrument: "MU", value: "920", meaning: "duplicate", scope: "week" },
  { instrument: "PLTR", value: "900", meaning: "far away typo", scope: "week" },
] };
const OLD = { call: { date: "2026-10-22", title: "Thursday 1:1" }, levels: [{ instrument: "AAPL", value: "300", meaning: "old" }] };

Deno.test("v4.5 callouts: the newest call is chosen by date, whatever the array order", () => {
  assert(M.newestCall([OLD, CALL]).call.date === "2026-10-26" && M.newestCall([CALL, OLD]).call.date === "2026-10-26", "newest");
  assert(M.newestCall([]) === null && M.newestCall(null) === null, "empty");
});
Deno.test("v4.5 callouts: sides read from the words; non-stocks and duplicates dropped", () => {
  const lv = M.calloutLevels(CALL);
  const f = (t: string, l: number) => lv.find((x: any) => x.ticker === t && x.level === l);
  assert(f("MU", 920).dir === "up", "move above = up");
  assert(f("MU", 880).dir === "both", "support = either way");
  assert(f("AMD", 510).dir === "down", "below … negated = down");
  assert(f("TSLA", 383).dir === "up", "flip zone long = up");
  assert(f("NVDA", 215).dir === "both", "resistance = either way");
  assert(!lv.some((x: any) => x.ticker === "US 10Y" || /10Y/.test(x.ticker)), "US 10Y is not a stock");
  assert(lv.filter((x: any) => x.ticker === "MU" && x.level === 920).length === 1, "duplicate dropped");
});
Deno.test("v4.5 callouts text: grouped by ticker, dated, says how many", () => {
  const t = M.calloutsText(CALL);
  assert(/^📣 This week's callouts — Monday group call \(2026-10-26\)/.test(t), "head " + t.slice(0, 80));
  assert(/MU: 920 ▲/.test(t) && /880/.test(t) && /AMD: 510 ▼/.test(t), "body " + t);
  assert(/6 levels\./.test(t), "count " + t);
  assert(M.calloutsText({ call: { date: "2026-10-26" }, levels: [] }) === "", "no levels = no post");
});
Deno.test("v4.5 seed: a successful seed posts the callouts on the Desk once; a bad corpus posts nothing", async () => {
  reset();
  Deno.env.set("SUPABASE_URL", "https://x.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
  const j = await route("seed", [OLD, CALL]);
  assert(j.ok && j.seeded === 2 && j.callouts === true, "seed " + JSON.stringify(j));
  assert(DESK.length === 1 && /^📣 This week's callouts/.test(DESK[0]) && /2026-10-26/.test(DESK[0]) && !/AAPL/.test(DESK[0]), "desk " + DESK[0]?.slice(0, 120));
  reset();
  const j2 = await route("seed", [{ call: { date: "2026-10-27", title: "no levels" }, levels: [] }]);
  assert(j2.ok && j2.callouts === false && DESK.length === 0, "nothing to post " + JSON.stringify(j2));
});
Deno.test("v4.5 arm_callouts: puts the levels on today's Watcher with their sides; skips what is far from price or not a stock; says so on the Desk; a second tap adds nothing", async () => {
  reset(); BRAINROWS = [OLD, CALL]; await dropBrain();
  const j = await route("arm_callouts", { author: "Ifoma" });
  assert(j.ok && j.armed === 5 && j.skipped === 1 && j.total === 6, "counts " + JSON.stringify(j));       // 6 stock levels: MU920, MU880, AMD510, TSLA383, NVDA215, PLTR900(far)
  assert(WATCH.length === 5 && WATCH.every((w) => w.day === "2026-10-26" && w.added_by === "Ifoma · Callouts" && w.status === "watching" && w.source === "desk"), "rows " + JSON.stringify(WATCH.map((w) => w.ticker + w.level + w.status)));
  assert(WATCH.find((w) => w.ticker === "AMD").dir === "down" && WATCH.find((w) => w.ticker === "MU" && w.level === 920).dir === "up", "sides");
  assert(!WATCH.some((w) => w.ticker === "PLTR"), "the 900 typo was refused (>10% from price)");
  assert(DESK.length === 1 && /armed 5 of 6 callouts from 2026-10-26/.test(DESK[0]), "desk " + DESK[0]);
  const j2 = await route("arm_callouts", { author: "Ifoma" });
  assert(WATCH.length === 5 && j2.armed === 0, "idempotent " + JSON.stringify(j2));
});
Deno.test("v4.5 arm_callouts: no levels in the newest call = a plain error, nothing written", async () => {
  reset(); BRAINROWS = [{ call: { date: "2026-10-27" }, levels: [] }]; await dropBrain();
  const r = await route("arm_callouts", {});
  assert(r.ok === false && /No callouts/.test(r.error || ""), "error " + JSON.stringify(r));
  assert(WATCH.length === 0, "nothing written");
});
Deno.test("v4.5 static: the Desk page shows the Arm button on callouts posts only, and the app is 4.5.0", async () => {
  const html = await Deno.readTextFile(new URL("../../index.html", import.meta.url));
  assert(/data-arm-callouts/.test(html) && /arm_callouts/.test(html), "button wired");
  assert(/\^📣 This week's callouts/.test(html), "only on callouts posts");
  assert(/const BUILD="4\.5\.0"/.test(html), "BUILD");
  const sw = await Deno.readTextFile(new URL("../../sw.js", import.meta.url));
  assert(/otto-v4\.5\.0/.test(sw), "sw version");
});
