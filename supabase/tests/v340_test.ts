// v3.40 test suite: Winston's brain reader (newest calls first, this week's callouts, the coach's rules as advisory best practices).
// Run: deno test -A --no-check supabase/tests/v340_test.ts
// Nothing here touches the network. Part 1 = unit tests, part 2 = the cache, part 3 = the REAL Monday 19 Oct week file read through the same code.

let NOW = Date.parse("2026-10-20T14:00:00Z");                 // Tue 20 Oct 2026, 10:00 AM ET
let BRAIN: any[] = [];
let DB_READS = 0;
(globalThis as any).__WINSTON_TEST__ = {
  db: async (path: string) => { if (path.startsWith("brain_versions")) { DB_READS++; return [{ payload: BRAIN }]; } return []; },
  md: () => { throw new Error("market data must not be touched by the brain reader"); },
  ai: () => { throw new Error("AI must not be touched by the brain reader"); },
  now: () => NOW,
};
(globalThis as any).fetch = (u: any) => Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
(Deno as any).serve = () => ({ finished: Promise.resolve() });
const X = await import("../winston.ts");

function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const call = (date: string, extra: any = {}) => ({ call: { date, title: "t " + date }, rules: [], setups: [], insights: [], levels: [], ...extra });

/* ---------- part 1: unit ---------- */
Deno.test("N1: the four NEWEST calls are read whatever order the array is stored in (the old slice(-4) took the oldest when stored newest-first)", () => {
  const dates = ["2026-10-19", "2026-10-15", "2026-10-08", "2026-10-01", "2026-09-24", "2026-09-17"];
  const mk = () => dates.map((d) => call(d, { rules: [{ rule: "rule of " + d }] }));
  for (const arr of [mk(), mk().reverse()]) {
    const t = X.buildBrainText(arr, NOW);
    for (const d of dates.slice(0, 4)) assert(t.includes("rule of " + d), "newest call missing " + d);
    for (const d of dates.slice(4)) assert(!t.includes("rule of " + d), "old call leaked " + d);
    assert(t.indexOf("rule of 2026-10-19") < t.indexOf("rule of 2026-10-15"), "newest should come first");
  }
});

Deno.test("N2: callouts come from `levels` of calls dated in the last 7 days only, each line carries its date and time; they expire by themselves", () => {
  const lv = [{ instrument: "NVDA", value: "218.70 up", meaning: "WATCH longs only above 218.70", at: "06:11", scope: "SCOPE-SHOULD-NOT-SHOW" }];
  const arr = [call("2026-10-19", { levels: lv }), call("2026-10-12", { levels: [{ instrument: "OLD", value: "1", meaning: "too old", at: "01:00" }] }), call("2026-10-30", { levels: [{ instrument: "FUT", value: "1", meaning: "future", at: "01:00" }] })];
  const t = X.buildBrainText(arr, NOW);
  assert(t.includes("[callout 2026-10-19 06:11] NVDA — 218.70 up — WATCH longs only above 218.70"), "callout line wrong: " + t.slice(0, 300));
  assert(!t.includes("too old") && !t.includes("OLD —"), "an 8-day-old callout was shown");
  assert(!t.includes("future"), "a callout dated in the future was shown");
  assert(!t.includes("SCOPE-SHOULD-NOT-SHOW"), "scope text leaked into the line");
  assert(t.startsWith("THIS WEEK'S COACH CALLOUTS"), "callouts block should lead");
  const later = X.buildBrainText(arr, Date.parse("2026-10-27T12:00:00Z"));          // 8 days after the 19th
  assert(!later.includes("THIS WEEK'S COACH CALLOUTS") && !later.includes("NVDA"), "callouts must expire after 7 days");
});

Deno.test("N3: rules carry their id into the line, 20 per call get through, setups and insights stay at 14, bad entries cannot crash it", () => {
  const rules = Array.from({ length: 25 }, (_, i) => ({ id: "PB-" + i, rule: "r" + i, why: "w", at: "00:01", scope: "nope" }));
  const setups = Array.from({ length: 20 }, (_, i) => ({ name: "s" + i, trigger: "t" }));
  const arr: any[] = [call("2026-10-19", { rules, setups }), null, "junk", 5, { call: null }, { rules: "not an array" }];
  const t = X.buildBrainText(arr as any, NOW);
  assert(t.includes("[call 2026-10-19, rules PB-0] r0 — w"), "id/line wrong");
  assert(t.includes("PB-19]") && !t.includes("PB-20]"), "rules cap should be 20");
  assert((t.match(/\[call 2026-10-19, setups\]/g) || []).length === 14, "setups cap should stay 14");
  assert(!t.includes("nope"), "scope leaked");
  assert(t.includes("ADVISORY"), "the advisory warning must be in the header");
  assert(X.buildBrainText([] as any, NOW) === "" && X.buildBrainText(null as any, NOW) === "", "empty brain should give an empty string");
});

/* ---------- part 2: the cache ---------- */
Deno.test("N4: brainExcerpt reads once, serves the cache for 10 minutes, then picks up a new seed; resetBrainCache forces a re-read", async () => {
  X.resetBrainCache(); DB_READS = 0;
  BRAIN = [call("2026-10-19", { rules: [{ rule: "first seed rule" }] })];
  const a = await X.brainExcerpt(); assert(a.includes("first seed rule") && DB_READS === 1, "first read");
  BRAIN = [call("2026-10-19", { rules: [{ rule: "second seed rule" }] })];
  NOW += 5 * 60000; const b = await X.brainExcerpt(); assert(b === a && DB_READS === 1, "should still be cached at 5 minutes");
  NOW += 6 * 60000; const c = await X.brainExcerpt(); assert(c.includes("second seed rule") && DB_READS === 2, "should refresh after 10 minutes");
  BRAIN = [call("2026-10-19", { rules: [{ rule: "third seed rule" }] })];
  X.resetBrainCache(); const d = await X.brainExcerpt(); assert(d.includes("third seed rule") && DB_READS === 3, "reset should force a read");
});

/* ---------- part 3: the REAL files ---------- */
// The Monday week file is the coach's material and is NOT kept in the public repo. These two tests read it when WEEK_FILE points at it
// (Claude ran them that way before shipping) and skip with a note when it is not there, so the deploy gate never depends on a private file.
async function readJsonOrNull(path: string) { try { return JSON.parse(await Deno.readTextFile(path)); } catch (e) { if (e instanceof Deno.errors.NotFound) return null; throw e; } }
Deno.test("N5: the real Monday 19 Oct week file + the real 1 Oct file, read the way Winston reads them", async () => {
  const wk = await readJsonOrNull(Deno.env.get("WEEK_FILE") || "week-2026-10-19.json");
  if (!wk) { console.log("N5 skipped: set WEEK_FILE to the private Monday week file to run it"); return; }
  const old = JSON.parse(await Deno.readTextFile("week-latest.json"));
  const arr = [old, wk];                                                          // stored oldest-first on purpose
  const t = X.buildBrainText(arr, NOW);
  const callouts = t.split("\n").filter((l) => l.startsWith("[callout 2026-10-19"));
  assert(callouts.length === wk.levels.length, `all ${wk.levels.length} callouts must survive the cap, got ${callouts.length}`);
  assert(callouts.some((l) => l.includes("NVDA") && l.includes("218.70") && l.includes("214.13")), "NVDA callout");
  assert(callouts.some((l) => l.includes("VIX")), "VIX callout");
  assert(!callouts.some((l) => /1 Oct 2026|2026-10-01/.test(l)), "1 Oct levels are 18 days old and must not show");
  const rl = t.split("\n").filter((l) => l.startsWith("[call 2026-10-19, rules PB-1019-"));
  assert(rl.length === 16, "all 16 Playbook rules from Monday must reach Winston, got " + rl.length);
  assert(t.includes("[call 2026-10-01, rules]"), "the 1 Oct rules are still inside the 4-call window");
  assert(t.indexOf("[call 2026-10-19, rules PB-1019-01]") < t.indexOf("[call 2026-10-01, rules]"), "Monday should come before 1 Oct");
  assert(!/SCOPE LIMIT|Dated mark from the 19 Oct/.test(t), "scope text must not appear in Winston's lines");
  const insights = t.split("\n").filter((l) => l.startsWith("[call 2026-10-19, insights]"));
  assert(insights.length === wk.insights.length, "insights count");
  console.log("brain text size:", t.length, "chars, about", Math.round(t.length / 4), "tokens; callouts", callouts.length, "rules", rl.length);
  const later = X.buildBrainText(arr, Date.parse("2026-10-28T14:00:00Z"));
  assert(!later.includes("[callout") && later.includes("PB-1019-01"), "after the week the callouts go and the rules stay");
});

Deno.test("N6: every line stays inside its length cap (nothing is cut mid-sentence by accident)", async () => {
  const wk = await readJsonOrNull(Deno.env.get("WEEK_FILE") || "week-2026-10-19.json");
  if (!wk) { console.log("N6 skipped: set WEEK_FILE to the private Monday week file to run it"); return; }
  const t = X.buildBrainText([wk], NOW);
  for (const l of t.split("\n")) if (l.startsWith("[callout")) assert(l.length <= 280, "callout line over the cap: " + l.slice(0, 80));
  const lv = wk.levels.map((o: any) => `${o.instrument} — ${o.value} — ${o.meaning}`);
  for (const s of lv) assert(s.length <= 260, "a callout would be truncated: " + s.slice(0, 60));
  for (const r of wk.rules) assert(`${r.rule} — ${r.why} — ${r.said}`.length <= 420, "a rule would be truncated: " + r.id);
  for (const r of wk.insights) assert(`${r.title} — ${r.body}${r.said ? " — " + r.said : ""}`.length <= 260, "an insight would be truncated: " + r.title);
});
