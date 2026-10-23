// v3.45 (22 Oct 2026): HOMEWORK — the coach's after-close read. Otto fills the numbers, Josh writes the lines; hand-in validates
// (10+ chars, a call, at least one buy/sell level), levels go on the Watcher for the next trading day, never blocks a card; status
// done / late / missed / pending for the Desk flag; 4:05 PM grade; Friday report card line + 20% weight; push reminders once.
// Run: deno test -A --no-check supabase/tests/v345_test.ts
const RealDate = Date; let NOW = RealDate.parse("2026-10-22T23:00:00Z");   // Thu 22 Oct 7:00 PM ET (after the close)
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");

let HW: any[] = [], WATCH: any[] = [], SET: Record<string, any> = {}, DESK: string[] = [], ACT: string[] = [], ACTS: any[] = [], PUSH: string[] = [];
let PX: Record<string, string> = { QQQ: "704.47", XOM: "178.23" };
let BARS: Record<string, any[]> = {};
let FETCHES: string[] = [];
let hwId = 1, wId = 1;
const J = (o: any) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
const q = (path: string, k: string) => { const m = new RegExp("[?&]" + k.replace(/[.>-]/g, "\\$&") + "=(\\w+)\\.([^&]+)").exec(path); return m ? [m[1], decodeURIComponent(m[2])] : null; };
const filt = (rows: any[], path: string) => {
  let out = rows;
  for (const k of ["for_day", "author", "status", "day", "id"]) {
    const all = [...path.matchAll(new RegExp("[?&]" + k + "=(\\w+)\\.([^&]+)", "g"))];
    for (const m of all) {
      const op = m[1], v = decodeURIComponent(m[2]);
      out = out.filter((r) => op === "eq" ? String(r[k]) === v : op === "gte" ? String(r[k]) >= v : op === "lte" ? String(r[k]) <= v : op === "neq" ? String(r[k]) !== v : true);
    }
  }
  if (/grade=is\.null/.test(path)) out = out.filter((r) => r.grade == null);
  if (/grade=not\.is\.null/.test(path)) out = out.filter((r) => r.grade != null);
  if (/order=for_day\.desc/.test(path)) out = [...out].sort((a, b) => b.for_day.localeCompare(a.for_day));
  const lim = /limit=(\d+)/.exec(path); if (lim) out = out.slice(0, +lim[1]);
  return out;
};
(globalThis as any).__OTTO_TEST__ = {
  db: (path: string, init: any = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (path.startsWith("otto_homework")) {
      if (m === "POST") {
        const rows = JSON.parse(init.body);
        const out = rows.map((r: any) => {
          const ex = HW.find((x) => x.for_day === r.for_day && x.author === r.author);
          if (ex) { Object.assign(ex, r); return { ...ex }; }
          const n = { id: hwId++, status: "draft", grade: null, data: null, handed_in_at: null, answers: {}, levels: [], call: null, ...r }; HW.push(n); return { ...n };
        });
        return Promise.resolve(out);
      }
      if (m === "PATCH") { const id = /id=eq\.(\d+)/.exec(path)?.[1]; HW.filter((r) => String(r.id) === id).forEach((r) => Object.assign(r, JSON.parse(init.body))); return Promise.resolve([]); }
      return Promise.resolve(filt(HW, path).map((r) => ({ ...r })));
    }
    if (path.startsWith("otto_watch")) {
      if (m === "POST") {
        const rows = JSON.parse(init.body);
        const out: any[] = [];
        for (const r of rows) { if (WATCH.some((x) => x.day === r.day && x.ticker === r.ticker && x.level === r.level && x.dir === r.dir)) continue; const n = { id: wId++, fired: {}, ...r }; WATCH.push(n); out.push(n); }
        return Promise.resolve(out);
      }
      return Promise.resolve(filt(WATCH, path));
    }
    if (path.startsWith("otto_settings")) {
      if (m === "POST") { const b = JSON.parse(init.body); SET[b.key] = b.value; return Promise.resolve([]); }
      const k = /key=eq\.([^&]+)/.exec(path)?.[1] || ""; return Promise.resolve(k in SET ? [{ value: SET[k] }] : []);
    }
    if (path.startsWith("otto_desk")) { if (m === "POST") DESK.push(JSON.parse(init.body).content || ""); return Promise.resolve([{ id: 1 }]); }
    if (path.startsWith("otto_activity")) { if (m === "POST") { const b = JSON.parse(init.body); ACT.push((Array.isArray(b) ? b[0] : b).text || ""); } return Promise.resolve([]); }
    if (path.startsWith("otto_actions")) return Promise.resolve(ACTS);
    return Promise.resolve([]);
  },
  call: (_s: string, tool: string, args: any) => {
    if (tool === "get_equity_quotes") return Promise.resolve(J({ data: { results: (args.symbols || []).filter((s: string) => PX[s]).map((s: string) => ({ quote: { symbol: s, last_trade_price: PX[s] } })) } }));
    if (tool === "get_equity_historicals") return Promise.resolve(J({ data: { results: (args.symbols || []).map((s: string) => ({ symbol: s, bars: BARS[s] || [] })) } }));
    return Promise.reject(new Error("unexpected tool " + tool));
  },
  brain: () => [], notify: (kind: string, title: string) => { PUSH.push(kind + "|" + title); }, extract: () => [],
};
const SCAN = { totalCount: 16, data: [
  { s: "TVC:US10Y", d: [4.961, 5.119, 1] }, { s: "NASDAQ:TLT", d: [81.74, 80.24, 1] }, { s: "SP:SPX", d: [7663.43, 7757.17, 1] }, { s: "NASDAQ:IXIC", d: [26008.86, 26702.86, 1] },
  { s: "AMEX:IWM", d: [276.67, 276.48, 1] }, { s: "NYMEX:CL1!", d: [99.47, 97.15, 1] }, { s: "NYSE:XOM", d: [175.6, 178.09, 1] }, { s: "NASDAQ:QQQ", d: [704.47, 725.2, 1] },
  { s: "COMEX:GC1!", d: [4060.4, 4150, 1] }, { s: "BITSTAMP:BTCUSD", d: [81412.36, 84023.24, 1] },
] };
const NASDAQ = (d: string) => ({ data: { rows: d === "2026-10-22"
  ? [{ symbol: "WDC", name: "Western Digital", time: "time-after-hours", marketCap: "$141,399,212,000" }, { symbol: "PG", name: "P&G", time: "time-pre-market", marketCap: "$364,564,087,000" }, { symbol: "BE", name: "Bloom", time: "time-after-hours", marketCap: "$30,000,000,000" }]
  : [{ symbol: "INTC", name: "Intel", time: "time-pre-market", marketCap: "$200,000,000,000" }] } });
(globalThis as any).fetch = (u: any) => {
  const s = String(u); FETCHES.push(s);
  if (s.includes("scanner.tradingview.com")) return Promise.resolve(new Response(JSON.stringify(SCAN), { status: 200 }));
  if (s.includes("api.nasdaq.com")) return Promise.resolve(new Response(JSON.stringify(NASDAQ(/date=([\d-]+)/.exec(s)![1])), { status: 200 }));
  return Promise.reject(new Error("network disabled in tests: " + s.slice(0, 80)));
};
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const GOOD = b64({ alg: "none" }) + "." + b64({ role: "authenticated", sub: "u1", email: "ottotrader@vinecreativestudio.com" }) + ".x";
const route = async (fn: string, body: any = {}, qs = "") => (await HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn + qs, { method: "POST", headers: { authorization: "Bearer " + GOOD, "content-type": "application/json" }, body: JSON.stringify(body) }))).json();
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const reset = (iso = "2026-10-22T23:00:00Z") => { (M as any).clearCacheForTest?.(); HW = []; WATCH = []; SET = {}; DESK = []; ACT = []; ACTS = []; PUSH = []; FETCHES = []; BARS = {}; hwId = 1; wId = 1; setNow(iso); };
const GOODHW = { author: "Josh", call: "bearish",
  answers: { bonds: "Yields falling hard, Treasuries bid — defensive.", indexes: "Nasdaq the laggard, Russell holding up.", oil: "Oil up, XOM down — dislocation, maybe XOM bounce.",
    cross: "Gold, copper and bitcoin all red.", call: "Defensive tape, AI spending worries, QQQ under the gap.", earnings: "WDC tonight — cloud storage guidance matters most.",
    qqq: "Gap resistance 727, support 707, break goes to 700.", odd: "" },
  levels: [{ ticker: "QQQ", level: 707, dir: "down" }, { ticker: "XOM", level: 174, dir: "up" }] };

Deno.test("v3.45 validate: every required line needs 10+ characters, a call, and at least one complete buy/sell level", () => {
  const v = M.hkValidate({ answers: { bonds: "short" }, levels: [{ ticker: "QQQ", level: 707 }] });
  assert(!v.ok, "not ok");
  assert(v.errors.some((e: string) => /Bonds first/.test(e)) && v.errors.some((e: string) => /pick bullish/.test(e)), "errors " + v.errors.join(" | "));
  assert(v.errors.some((e: string) => /at least one level/.test(e)) && v.errors.some((e: string) => /every row needs/.test(e)), "level errors");
  assert(!v.errors.some((e: string) => /Is-but/.test(e)), "the odd step is optional");
  const g = M.hkValidate(GOODHW);
  assert(g.ok && g.levels.length === 2 && g.call === "bearish", "good " + g.errors.join(" | "));
});
Deno.test("v3.45 hw_get after Thursday's close: homework is for Friday, numbers + earnings are filled, the start day is recorded", async () => {
  reset();
  const j = await route("hw_get", {}, "&author=Josh");
  assert(j.ok && j.for_day === "2026-10-23" && j.read_day === "2026-10-22", "days " + j.for_day + " " + j.read_day);
  assert(j.due === "2026-10-23T13:00:00.000Z" || j.due === "2026-10-23T13:00:00Z", "due 9:00 AM ET " + j.due);
  const xom = j.data.market.rows.find((r: any) => r.label === "XOM"), us10 = j.data.market.rows.find((r: any) => r.label === "US 10Y");
  assert(xom.pct < 0 && us10.price === 4.961 && us10.chg === -0.158, "rows " + JSON.stringify([xom, us10]));
  assert(j.data.market.mismatch === true, "oil up / XOM down = mismatch");
  assert(j.data.market.rows.find((r: any) => r.label === "CVX").price === null, "a missing row stays unknown, never invented");
  assert(j.data.earnings[0].sym === "WDC" && j.data.earnings.some((e: any) => e.sym === "INTC" && e.when === "before the open"), "earnings " + JSON.stringify(j.data.earnings));
  assert(!j.data.earnings.some((e: any) => e.sym === "PG"), "PG reported this MORNING — not tonight's list");
  assert(SET.homework_since?.day === "2026-10-23", "since " + JSON.stringify(SET.homework_since));
  assert(j.steps.length === 9 && j.min === 10, "steps");
});
Deno.test("v3.45 Friday night's homework is for Monday (weekend skipped)", async () => {
  reset("2026-10-23T23:30:00Z");
  const j = await route("hw_get", {}, "&author=Josh");
  assert(j.for_day === "2026-10-26" && j.read_day === "2026-10-23", "monday " + j.for_day);
});
Deno.test("v3.45 hw_submit: refuses an incomplete read and writes nothing", async () => {
  reset();
  const j = await route("hw_submit", { author: "Josh", answers: { bonds: "red" }, levels: [] });
  assert(j.ok === false && j.errors.length >= 7, "errors " + JSON.stringify(j));
  assert(HW.length === 0 && WATCH.length === 0 && DESK.length === 0, "nothing written");
});
Deno.test("v3.45 hw_submit: hands in, snapshots the numbers, puts both levels on Friday's Watcher, posts one Desk line", async () => {
  reset();
  const j = await route("hw_submit", GOODHW);
  assert(j.ok && j.added.length === 2 && !j.skipped.length && !j.late, "submit " + JSON.stringify(j).slice(0, 300));
  const r = HW[0];
  assert(r.status === "handed_in" && r.for_day === "2026-10-23" && r.call === "bearish" && r.data.market.rows.length === 16, "row");
  assert(WATCH.length === 2 && WATCH.every((w) => w.day === "2026-10-23" && w.added_by === "Josh · Homework" && w.status === "watching"), "watch " + JSON.stringify(WATCH));
  assert(WATCH.find((w) => w.ticker === "QQQ").dir === "down" && WATCH.find((w) => w.ticker === "XOM").dir === "up", "sides");
  assert(r.levels.every((x: any) => x.watch_id), "watch ids kept");
  assert(DESK.length === 1 && /📓 Josh handed in the homework for Friday, Oct 23: BEARISH/.test(DESK[0]) && /QQQ 707 ▼, XOM 174 ▲/.test(DESK[0]), "desk " + DESK[0]);
  // re-submit: no duplicate Watcher rows, first hand-in time kept, desk says updated
  const first = r.handed_in_at; setNow("2026-10-23T00:30:00Z");
  const j2 = await route("hw_submit", { ...GOODHW, levels: [...GOODHW.levels, { ticker: "NVDA", level: 999, dir: "up" }] });
  assert(j2.ok && WATCH.length === 3 && j2.added.length === 1 && j2.added[0] === "NVDA 999 ▲" && !j2.skipped.length, "only the new level is added " + JSON.stringify(j2));
  assert(HW[0].handed_in_at === first && /updated/.test(DESK[1]), "update keeps the first time");
});
Deno.test("v3.45 a level the Watcher refuses (>10% from price) is reported, not silently dropped", async () => {
  reset(); PX = { QQQ: "704.47", XOM: "178.23" };
  const j = await route("hw_submit", { ...GOODHW, levels: [{ ticker: "QQQ", level: 900, dir: "up" }, { ticker: "XOM", level: 174, dir: "up" }] });
  assert(j.ok && j.added.length === 1 && j.skipped.length === 1 && /QQQ 900/.test(j.skipped[0]), "skipped " + JSON.stringify(j));
  assert(HW[0].levels.find((x: any) => x.ticker === "QQQ").refused, "refusal stored");
  assert(/not added: QQQ 900/.test(DESK[0]), "desk says so " + DESK[0]);
});
Deno.test("v3.45 hw_save keeps a draft (half-typed rows too) and does not hand in", async () => {
  reset();
  const j = await route("hw_save", { author: "Josh", answers: { bonds: "Yields down" }, levels: [{ ticker: "QQ" }] });
  assert(j.ok && HW.length === 1 && HW[0].status === "draft" && HW[0].levels.length === 1 && WATCH.length === 0 && DESK.length === 0, "draft " + JSON.stringify(HW));
});
Deno.test("v3.45 status: done on time / late / missed / pending, weekend and before-start never flag", async () => {
  reset(); await route("hw_get", {}, "&author=Josh");     // since = Fri 23 Oct
  setNow("2026-10-23T12:30:00Z");                          // Fri 8:30 AM, nothing handed in
  let s = await M.hkStatus("2026-10-23");
  assert(s.applies && s.pending && !s.missed, "pending " + JSON.stringify(s));
  setNow("2026-10-23T13:30:00Z");                          // Fri 9:30 AM
  s = await M.hkStatus("2026-10-23");
  assert(s.missed && !s.done, "missed " + JSON.stringify(s));
  await route("hw_submit", GOODHW);                       // handed in late (Fri 9:30 AM: hkForDay = Fri during the session)
  s = await M.hkStatus("2026-10-23");
  assert(s.late && !s.done && !s.missed && s.call === "bearish" && s.levels.length === 2, "late " + JSON.stringify(s));
  HW[0].handed_in_at = "2026-10-23T12:00:00Z";
  s = await M.hkStatus("2026-10-23");
  assert(s.done && !s.late, "done");
  assert(!(await M.hkStatus("2026-10-24")).applies, "Saturday");
  assert(!(await M.hkStatus("2026-10-22")).applies, "before homework existed");
});
Deno.test("v3.45 watch_get carries the homework status for the Desk banner + card tag", async () => {
  reset(); SET.homework_since = { day: "2026-10-23" }; setNow("2026-10-23T14:00:00Z");
  const j = await route("watch_get");
  assert(j.ok && j.homework && j.homework.missed === true, "homework " + JSON.stringify(j.homework));
});
Deno.test("v3.45 4:05 PM grade: bearish + QQQ down = right; levels touched; a Watcher level that fired counts as used", async () => {
  reset(); SET.homework_since = { day: "2026-10-23" };
  HW = [{ id: 7, for_day: "2026-10-23", author: "Josh", status: "handed_in", handed_in_at: "2026-10-23T00:00:00Z", call: "bearish", grade: null,
    levels: [{ ticker: "QQQ", level: 707, dir: "down" }, { ticker: "XOM", level: 174, dir: "up" }] }];
  WATCH = [{ id: 1, day: "2026-10-23", ticker: "QQQ", level: 707, dir: "down", fired: { down: { at: "x" } } }, { id: 2, day: "2026-10-23", ticker: "XOM", level: 174, dir: "up", fired: {} }];
  const t0 = RealDate.parse("2026-10-23T13:30:00Z");
  const bar = (i: number, o: number, h: number, l: number, c: number) => ({ begins_at: new RealDate(t0 + i * 300e3).toISOString(), open_price: o, high_price: h, low_price: l, close_price: c });
  BARS = { QQQ: [bar(0, 712, 713, 709, 710), bar(40, 706, 707.5, 703.8, 704)], XOM: [bar(0, 176, 177, 175.5, 176.5), bar(40, 178, 179, 177.8, 178.5)] };
  setNow("2026-10-23T20:06:00Z");
  const r = await M.hkGradeTick();
  assert(r.graded === 1, "graded " + JSON.stringify(r));
  const g = HW[0].grade;
  assert(g.direction === "right" && g.call === "bearish", "direction " + JSON.stringify(g));
  const q = g.levels.find((x: any) => x.ticker === "QQQ"), x = g.levels.find((y: any) => y.ticker === "XOM");
  assert(q.touched && q.fired && !x.touched && !x.fired && g.used === 1 && g.touched === 1 && g.of === 2, "levels " + JSON.stringify(g.levels));
  assert((await M.hkGradeTick()).graded === 0, "graded once");
});
Deno.test("v3.45 report card: homework is 20% once a night counts (late = half); without homework the 40/30/30 grade is unchanged", async () => {
  const base = { answered: 8, offered: 10, good_whys: 5, whys: 10, rule_followed: true };
  assert(M.letterGrade(base).score === Math.round((0.4 * 0.8 + 0.3 * 0.5 + 0.3) * 100), "unchanged");
  assert(M.letterGrade({ ...base, homework: 1 }).score === Math.round((0.32 * 0.8 + 0.24 * 0.5 + 0.24 + 0.2) * 100), "with homework");
  assert(M.letterGrade({ ...base, homework: 0 }).score < M.letterGrade(base).score, "skipping costs");
  reset(); SET.homework_since = { day: "2026-10-19" };
  HW = [{ for_day: "2026-10-19", author: "Josh", status: "handed_in", handed_in_at: "2026-10-19T00:00:00Z", grade: { direction: "right", touched: 1, of: 2, used: 1 } },
        { for_day: "2026-10-20", author: "Josh", status: "handed_in", handed_in_at: "2026-10-20T14:00:00Z", grade: { direction: "wrong", touched: 0, of: 1, used: 0 } },
        { for_day: "2026-10-22", author: "Josh", status: "draft" }];
  setNow("2026-10-23T21:00:00Z");
  const w = await M.hkWeek("2026-10-19", "2026-10-23");
  assert(w.nights === 5 && w.done === 1 && w.late === 1 && w.missed === 3 && w.right === 1 && w.judged === 2 && w.touched === 1 && w.of === 3, "week " + JSON.stringify(w));
  assert(Math.abs(w.ratio - 0.3) < 1e-9, "ratio " + w.ratio);
  assert(w.missed_days.includes("2026-10-22"), "a draft is not a hand-in");
});
Deno.test("v3.45 reminders: 8:30 PM once if not handed in, none once handed in, none during the session", async () => {
  reset(); setNow("2026-10-23T00:31:00Z");   // Thu 8:31 PM ET
  assert((await M.hkRemindTick()).sent === "pm" && PUSH.length === 1 && /homework\|📓 Homework not handed in/.test(PUSH[0]), "pm " + PUSH.join());
  assert((await M.hkRemindTick()).skipped === "sent" && PUSH.length === 1, "once");
  reset(); setNow("2026-10-23T00:31:00Z"); await route("hw_submit", GOODHW);
  assert((await M.hkRemindTick()).skipped === "handed in" && PUSH.length === 0, "handed in");
  reset(); setNow("2026-10-23T12:03:00Z");   // Fri 8:03 AM
  assert((await M.hkRemindTick()).sent === "am", "am");
  reset(); setNow("2026-10-23T15:00:00Z");
  assert((await M.hkRemindTick()).skipped === "not a reminder window", "session");
});
Deno.test("v3.45 pure helpers: bias, rows, mismatch, earnings pick", () => {
  assert(M.hkBias("slightly bullish") === "long" && M.hkBias("bearish") === "short" && M.hkBias(null) === "neutral", "bias");
  const rows = M.hkRows({ data: [{ s: "NYMEX:CL1!", d: [100, 99] }, { s: "NYSE:XOM", d: [101, 100] }] });
  assert(M.hkMismatch(rows) === false, "both up = no mismatch");
  const e = M.hkPickEarnings([{ symbol: "A", time: "time-after-hours", marketCap: "$1,000" }, { symbol: "B", time: "time-after-hours", marketCap: "$9,000" }, { symbol: "C", time: "time-pre-market", marketCap: "$5" }], "after");
  assert(e.length === 2 && e[0].sym === "B", "pick " + JSON.stringify(e));
});
