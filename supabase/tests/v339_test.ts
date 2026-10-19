// v3.39 (18 Oct 2026): the journal-sync key fix, the server's only word on LIVE / PAPER, the position-check fact check,
// the one-week VWAP rule and the Baby J override tag, Winston max_open from the tab. Pure functions + one faked route.
// Run: deno test -A --no-check supabase/tests/v339_test.ts
const TABLES: Record<string, any[]> = { otto_actions: [], otto_desk: [], otto_activity: [], otto_settings: [] };
let PATCHES: any[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase(), t = path.split("?")[0];
    const body = init.body ? JSON.parse(init.body) : null;
    if (t === "otto_actions" && m === "PATCH") { PATCHES.push(body); const id = /id=eq\.([^&]+)/.exec(path)?.[1]; const row = TABLES.otto_actions.find((r) => r.id === id); if (row && !(/status=eq\.pending/.test(path) && row.status !== "pending")) Object.assign(row, body); return Promise.resolve(row ? [row] : []); }
    if (t === "otto_actions" && m === "GET") { const id = /id=eq\.([^&]+)/.exec(path)?.[1]; return Promise.resolve(TABLES.otto_actions.filter((r) => !id || r.id === id)); }
    if (m !== "GET") { (TABLES[t] ||= []).push(body); return Promise.resolve(null); }
    if (t === "otto_settings") { const key = /key=eq\.(\w+)/.exec(path)?.[1]; const row = TABLES.otto_settings.find((s) => s.key === key); return Promise.resolve(row ? [row] : []); }
    return Promise.resolve([]);
  },
  call: () => Promise.reject(new Error("no market data in this test")),
  brain: () => [], notify: () => {}, extract: () => [],
};
const M: any = await import("../otto-proxy.ts");
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("FAIL: " + msg); };
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`); };

Deno.test("v3.39 stampTitle: the server's word is the only LIVE / PAPER word in a title", () => {
  eq(M.stampTitle("SCALP · PAPER · CRWV 69C 10/23 @ 1.78 — bounce off 64.44", false), "LIVE — SCALP · CRWV 69C 10/23 @ 1.78 — bounce off 64.44", "inner PAPER stripped on a live card");
  eq(M.stampTitle("PAPER — SCALP · PAPER · SPY 767P 10/19 @ 1.58", true), "PAPER — SCALP · SPY 767P 10/19 @ 1.58", "inner PAPER stripped on a paper card too");
  eq(M.stampTitle("LIVE: Buy 1 X", true), "PAPER — Buy 1 X", "v3.30 case still holds");
  eq(M.stampTitle("Paper · SCALP · Buy 1 X", false), "LIVE — SCALP · Buy 1 X", "v3.30 variant still holds");
  eq(M.stampTitle("Buy 1 TSLA 375C 10/19 @ 1.88 (Coach Signal #225)", true), "PAPER — Buy 1 TSLA 375C 10/19 @ 1.88 (Coach Signal #225)", "a clean title is untouched");
  eq(M.stampTitle("OLIVE 10C · practice run", false), "LIVE — OLIVE 10C · practice run", "words containing live/practice are not touched");
});

Deno.test("v3.39 statusWords: Jarvis's Desk line says the card's real status", () => {
  const live = [{ title: "LIVE — SCALP · CRWV 69C", status: "pending" }];
  const out = M.statusWords("price already ran 85¢ past 64.44, so this is a chase, not an entry. Card is up as PAPER so you can watch it.", live);
  assert(/Card is up as LIVE/.test(out) && !/PAPER/.test(out), "PAPER became LIVE: " + out);
  assert(/approving it sends a real order/.test(out), "a warning line is added on a live card");
  const paper = [{ title: "PAPER — Buy 1 X", status: "paper_wait" }];
  eq(M.statusWords("Card's up as LIVE.", paper), "Card's up as PAPER.", "the other direction");
  eq(M.statusWords("No setup — no card.", []), "No setup — no card.", "no card = no change");
});

Deno.test("v3.39 numberCheck: above / below claims are checked against the numbers in the sentence", () => {
  const t = "CRWV gapped down hard at the open — stock is at 64.67, well below the wrong-if of 64.30. The 9:35 AM bar closed at 65.30, both below the plan's support level of 64.44.";
  const out = M.numberCheck(t);
  assert(/Fact check/.test(out) && /64.67 is ABOVE 64.30/.test(out) && /65.30 is ABOVE 64.44/.test(out), "both false claims caught: " + out);
  eq(M.numberCheck("TSLA stock $364.41, above the wrong-if $363.88. Option mark $1.64 vs fill $2.03."), "TSLA stock $364.41, above the wrong-if $363.88. Option mark $1.64 vs fill $2.03.", "true claims pass untouched");
  eq(M.numberCheck("Down $39 (19%) below the fill of $2.03"), "Down $39 (19%) below the fill of $2.03", "a dollar P&L vs a price is not compared (different magnitudes)");
  eq(M.numberCheck("HOLD"), "HOLD", "nothing to check");
});

const bars = (closes: number[], t0 = 0) => closes.map((c, i) => ({ t: t0 + i * 5 * 60e3, o: c, h: c + 0.2, l: c - 0.2, c }));
Deno.test("v3.39 vwapBlock: a long is blocked only when the stock AND SPY are both under VWAP", () => {
  const now = 10 * 5 * 60e3 + 1;
  const down = bars([100, 99, 98, 97, 96, 95, 94, 93, 92, 91]), up = bars([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  assert(M.vwapBlock(1, "TSLA", down, down, now), "both under VWAP → blocked");
  eq(M.vwapBlock(1, "TSLA", down, up, now), null, "stock under, SPY over → allowed");
  eq(M.vwapBlock(1, "TSLA", up, down, now), null, "stock over, SPY under → allowed");
  eq(M.vwapBlock(-1, "TSLA", down, down, now), null, "a short is never blocked by this rule");
  eq(M.vwapBlock(1, "TSLA", null, down, now), null, "no data → no block");
  const why = M.vwapBlock(1, "TSLA", down, down, now);
  assert(/TSLA 91.00 is below its VWAP/.test(why) && /SPY 91.00 is below its VWAP/.test(why) && /one rule/.test(why), "the reason names both: " + why);
});

Deno.test("v3.39 Approve on a card Baby J flagged weak → override tag + one Desk line (no market data = no VWAP block)", async () => {
  TABLES.otto_actions = [{ id: "11111111-1111-4111-8111-111111111111", status: "pending", title: "LIVE — SCALP · TSLA 372.5C", created_at: new Date().toISOString(),
    plan: { direction: "up", tv_symbol: "NASDAQ:TSLA", weak: "price already ran $1.63 past 363 on a Choppy banner day — a chase" }, exit: { state: "planned", direction: "up" }, calls: [], checks: [] }];
  TABLES.otto_desk = []; TABLES.otto_activity = []; PATCHES = [];
  const r = await M.__test_actOn?.("11111111-1111-4111-8111-111111111111", "approve", "josh@otto");
  const row = TABLES.otto_actions[0];
  assert(row.plan.override === true && /chase/.test(row.plan.override_read), "override tagged on the card: " + JSON.stringify(row.plan));
  assert(TABLES.otto_desk.some((d) => d.author === "Jarvis" && /Logging it as an override by josh/.test(d.content)), "one Desk line by Jarvis: " + JSON.stringify(TABLES.otto_desk));
  assert(TABLES.otto_activity.some((a) => /Override: josh approved/.test(a.text)), "activity row");
  assert(row.status === "done" || row.status === "failed", "the order path still ran (no calls = done): " + row.status + " " + JSON.stringify(r).slice(0, 100));
});
