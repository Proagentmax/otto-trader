// v3.38 (16 Oct 2026): the Pop Quiz (quiz_list / quiz_grade routes) and the "Working on" line in the coach's weekly log.
// Nothing touches the network: Supabase and Claude are faked; the Deno.serve handler is captured for the routes.
// Run: deno test -A --no-check supabase/tests/v338_test.ts
// v3.40: pin the clock to Fri 16 Oct 2026, 5 PM ET. The coach-log week is computed from the real clock (Mon-Fri = this week),
// so with the real date these fixtures (12-16 Oct) only passed on a weekend and blocked the deploy every Monday to Friday.
const RealDate = Date; const PINNED_NOW = RealDate.parse("2026-10-16T21:00:00Z");
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(PINNED_NOW); } static now() { return PINNED_NOW; } }
(globalThis as any).Date = FakeDate;
const SETTINGS: Record<string, any> = {};
let ACTIVITY: any[] = [];
let CLAUDE_REPLY: any = null; let CLAUDE_CALLS: any[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase(), t = path.split("?")[0];
    if (m !== "GET") {
      const body = init.body ? JSON.parse(init.body) : null;
      if (t === "otto_settings" && body?.key) SETTINGS[body.key] = body.value;
      if (t === "otto_activity") ACTIVITY.push(body);
      return Promise.resolve(null);
    }
    if (t === "otto_settings") { const key = /key=eq\.(\w+)/.exec(path)?.[1]; return Promise.resolve(key && SETTINGS[key] != null ? [{ key, value: SETTINGS[key] }] : []); }
    return Promise.resolve([]);
  },
  call: () => Promise.reject(new Error("no market data in this test")),
  brain: () => [{ call: { date: "2026-10-15", title: "Impromptu Zoom Meeting" }, rules: [{ rule: "When it retests and fails, that's where you add — not where you leave." }], setups: [],
    _transcript: "[05:50] Coach: When it retests and fails, that's where you add. You do not get out on the bounce; the bounce back to the level is the add, the exit is an indecision candle followed by no new high, or a ten minute close back through the entry candle's open. That is the whole exit rule and it never changes.\n\n[21:19] Coach: That's the part where we sell to. Sell at the first top wick on the chart and keep the runners to the next level up; the first batch always comes off at the first wick, every single time, no exceptions on that.\n\n[36:41] Coach: If the opening price is below previous close you are in a chop zone and you do not hold anything after the daily move is done; a small account only risks profit overnight and nothing else, ever." }],
  notify: () => {}, extract: () => [],
};
(globalThis as any).fetch = (u: any, init: any) => {
  if (/api\.anthropic\.com/.test(String(u))) { CLAUDE_CALLS.push(JSON.parse(init.body)); return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(CLAUDE_REPLY) }] }), { status: 200 })); }
  return Promise.reject(new Error("network disabled in tests: " + String(u).slice(0, 80)));
};
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
Deno.env.set("ANTHROPIC_KEY", "test-key");
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: any) => b64({ alg: "none" }) + "." + b64(claims) + ".x";
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("ASSERT: " + msg); };
const eq = (a: any, b: any, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERT ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const desk = { role: "authenticated", sub: "u2", email: "ottotrader@vinecreativestudio.com" };
const req = (fn: string, claims: any, body?: any) => HANDLER(new Request("https://x.supabase.co/functions/v1/otto-proxy?fn=" + fn, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + jwt(claims), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));

Deno.test("v3.38 quizScore: ok = 1, half = 0.5, no = 0", () => {
  eq(M.quizScore([{ grade: "ok" }, { grade: "ok" }, { grade: "no" }, { grade: "ok" }, { grade: "half" }]), 3.5, "3.5 / 5");
  eq(M.quizScore([]), 0, "empty");
  eq(M.QUIZ_QUESTIONS.length, 5, "five fixed questions");
  eq(M.QUIZ_QUESTIONS.map((q: any) => q.id), ["picture", "sell_to", "add_exit", "confirm", "regime"], "ids in the coach's order");
});

Deno.test("v3.38 fn=quiz_list: locked to the Desk login; returns the five questions and the history (no answers)", async () => {
  assert(HANDLER, "handler captured");
  eq((await req("quiz_list", { role: "authenticated", sub: "u1", email: "stranger@example.com" })).status, 403, "stranger locked out");
  SETTINGS.quiz_history = { rows: [{ at: "2026-10-14T20:00:00Z", day: "2026-10-14", by: "Josh", ticker: "GOOGL", score: 2.5, max: 5, answers: { picture: "secret" }, grades: [], fixes: ["a"], weakest: "Where do you ADD, and where do you get OUT?" }] };
  const j = await (await req("quiz_list", desk)).json();
  eq([j.ok, j.questions.length, j.questions[0].id, typeof j.questions[0].coach], [true, 5, "picture", "string"], "questions");
  eq([j.rows.length, j.rows[0].ticker, j.rows[0].score, j.rows[0].weakest, "answers" in j.rows[0]], [1, "GOOGL", 2.5, "Where do you ADD, and where do you get OUT?", false], "history rows without the answers");
});

Deno.test("v3.38 fn=quiz_grade: grades only from the brain, cites call + time, saves history (by = the desk picker), activity line; bad input refused", async () => {
  SETTINGS.quiz_history = { rows: [{ at: "2026-10-14T20:00:00Z", day: "2026-10-14", by: "Josh", ticker: "GOOGL", score: 2.5, max: 5, weakest: "old" }] };
  ACTIVITY = []; CLAUDE_CALLS = [];
  CLAUDE_REPLY = { grades: [
    { id: "picture", grade: "ok", note: "Right structure.", source: "15 Oct 2026, 08:40" },
    { id: "sell_to", grade: "ok", note: "Two sell-to levels in order.", source: "15 Oct 2026, 21:19" },
    { id: "add_exit", grade: "no", note: "That's the fear exit — Jason says the retest that fails is the add.", source: "15 Oct 2026, 05:50" },
    { id: "confirm", grade: "ok", note: "Yes.", source: "House Rule 5" },
    { id: "regime", grade: "half", note: "Right call, half the reason.", source: "15 Oct 2026, 36:41" }], fixes: ["The exit: retest-and-fail is an ADD.", "Chop rule, second half."] };
  assert((await req("quiz_grade", desk, { ticker: "", answers: { picture: "x" } })).status >= 500, "no ticker refused");
  assert((await req("quiz_grade", desk, { ticker: "AMZN", answers: {} })).status >= 500, "no answers refused");
  eq(CLAUDE_CALLS.length, 0, "no Jarvis call on bad input");
  const r = await (await req("quiz_grade", desk, { ticker: "amzn", by: "Josh", answers: { picture: "Weekly double top at 262.", sell_to: "252.95 then 254.04", add_exit: "Get out if it bounces back to 250.45.", confirm: "10-minute close above 250.45", regime: "chop, no overnight" } })).json();
  eq([r.ok, r.ticker, r.score, r.max, r.by, r.grades.length, r.weakest], [true, "AMZN", 3.5, 5, "Josh", 5, "Where do you ADD, and where do you get OUT?"], "graded: " + JSON.stringify(r).slice(0, 200));
  eq(r.grades[2].grade, "no", "the fear exit graded no");
  assert(!/Jason/.test(r.grades[2].note) && /says the retest that fails is the add/.test(r.grades[2].note), "the coach's name never reaches the app (NAME_RULE): " + r.grades[2].note);
  eq(r.fixes.length, 2, "two fixes");
  eq(CLAUDE_CALLS.length, 1, "one Jarvis call");
  const sys = CLAUDE_CALLS[0].system, user = CLAUDE_CALLS[0].messages[0].content;
  assert(/retests and fails, that's where you add/.test(sys) && /chop zone/.test(sys), "the brain material (transcript chunks) is in the prompt");
  assert(/Grade ONLY from that material/.test(sys) && /never invent a citation/.test(sys), "grading rule");
  assert(/Q3 \[add_exit\][\s\S]*Josh: Get out if it bounces back to 250\.45\./.test(user), "Josh's answers go in order");
  eq([SETTINGS.quiz_history.rows.length, SETTINGS.quiz_history.rows[0].ticker, SETTINGS.quiz_history.rows[1].ticker], [2, "AMZN", "GOOGL"], "history: newest first, old kept");
  eq(SETTINGS.quiz_history.rows[0].answers.add_exit, "Get out if it bounces back to 250.45.", "answers saved with the row");
  assert(ACTIVITY.some((a) => a.kind === "change" && /Pop quiz: AMZN 3\.5\/5/.test(a.text) && a.who === "Josh"), "activity line: " + JSON.stringify(ACTIVITY));
  // a grade the model got wrong in shape falls back to "half", missing ids filled
  CLAUDE_REPLY = { grades: [{ id: "picture", grade: "great", note: "x" }], fixes: "not an array" };
  const r2 = await (await req("quiz_grade", desk, { ticker: "SPY", answers: { picture: "y" } })).json();
  eq([r2.grades.length, r2.grades[0].grade, r2.grades[1].grade, r2.grades[1].note, r2.fixes.length, r2.score, r2.by], [5, "half", "half", "No answer given.", 0, 2.5, "ottotrader"], "shape-proofed; by falls back to the login");
  // not JSON at all -> plain error, nothing saved
  CLAUDE_REPLY = "sorry"; const before = SETTINGS.quiz_history.rows.length;
  const r3 = await req("quiz_grade", desk, { ticker: "SPY", answers: { picture: "y" } });
  eq([r3.status >= 500, SETTINGS.quiz_history.rows.length], [true, before], "no grade -> error, history untouched");
  assert(/did not return a grade/.test((await r3.json()).error), "plain message");
});

Deno.test("v3.38 coach log: the weakest quiz question this week becomes the 'Working on' line; none without quizzes", async () => {
  SETTINGS.quiz_history = { rows: [
    { at: "2026-10-16T13:00:00Z", day: "2026-10-16", ticker: "AMZN", score: 3.5, weakest: "Where do you ADD, and where do you get OUT?" },
    { at: "2026-10-14T20:00:00Z", day: "2026-10-14", ticker: "GOOGL", score: 2.5, weakest: "Where do you ADD, and where do you get OUT?" },
    { at: "2026-10-13T20:00:00Z", day: "2026-10-13", ticker: "SPY", score: 2, weakest: "Trend or chop today — and do you hold overnight?" },
    { at: "2026-10-06T20:00:00Z", day: "2026-10-06", ticker: "SPY", score: 1, weakest: "What's the big picture on the weekly and daily?" }] };
  const t = M.coachLogText("2026-10-13", "2026-10-17", [], { working: "Where do you ADD, and where do you get OUT?" });
  assert(/Working on \(from this week's pop quizzes\): Where do you ADD, and where do you get OUT\?/.test(t), "working line: " + t);
  assert(!/Working on/.test(M.coachLogText("2026-10-13", "2026-10-17", [], {})), "no line without a quiz");
  // the route builds it from quiz_history for the week (Mon-Fri window) — the 6 Oct row is outside and ignored
  const j = await (await req("coach_log&build=1", desk)).json();
  assert(j.ok && /Working on \(from this week's pop quizzes\): Where do you ADD, and where do you get OUT\?/.test(j.text), "route picks the most common weakest question this week: " + (j.text.match(/Working on[^\n]*/) || ["(none)"])[0]);
});
