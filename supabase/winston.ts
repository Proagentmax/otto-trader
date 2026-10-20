// Winston — Otto's paper-only autonomous trader (v3.31, built 14 Oct 2026).
//
// WHAT THIS FILE IS NOT: it contains no order-placing code, no Robinhood or TradingView sign-in, no token handling.
// Every outbound call goes through `safeFetch`, which only reaches (1) Anthropic and (2) this project's own Supabase.
// Market data comes from the read-only gateway inside otto-proxy (?fn=winston_data), which holds the allow-list.
// Winston's money is a paper balance in his own tables. He never reads Josh + Baby J's cards, trades, desk chat or the
// live account (`dbGuard` enforces the table wall in code; the tests enforce it again).
//
// Source of truth for the rules is the table `winston_rules` (edit rows, no deploy). Nothing here is proven to make money;
// the point is to collect honest data (fills at ask in / bid out, stop-first on ties, double-spread view).

/* ------------------------------------------------------------------ plumbing */

const T: any = (globalThis as any).__WINSTON_TEST__ || null;
const MODEL = "claude-sonnet-4-6";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,apikey,content-type,x-otto-cron",
  "access-control-max-age": "86400",
};

const nowMs = () => (T?.now ? T.now() : Date.now());
const nowDate = () => new Date(nowMs());
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- the wall: the only tables this function may touch ----
const OWN_TABLE = /^winston_(settings|rules|days|ideas|trades|log)$/;
export function dbGuard(path: string, method = "GET") {
  const [table, qs = ""] = String(path).split("?");
  const m = method.toUpperCase();
  if (OWN_TABLE.test(table)) return;
  if (m === "GET" && (table === "otto_jason" || table === "brain_versions")) return;                         // coach posts + coach calls, read only
  if (m === "GET" && table === "otto_settings" && /(^|&)key=eq\.limits(&|$)/.test(qs)) return;              // the limit percentages, read only
  throw new Error("wall: Winston may not touch " + table);
}

async function db(path: string, init: RequestInit = {}): Promise<any> {
  dbGuard(path, init.method || "GET");
  if (T?.db) return T.db(path, init);
  const base = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !svc) throw new Error("service role not available");
  const r = await safeFetch(base + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: svc, authorization: "Bearer " + svc, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error("db " + r.status + " " + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

export function hostAllowed(url: string): boolean {
  try {
    const h = new URL(url).host;
    const sb = Deno.env.get("SUPABASE_URL");
    return h === "api.anthropic.com" || (!!sb && h === new URL(sb).host);
  } catch { return false; }
}
async function safeFetch(url: string, init?: RequestInit) {
  if (!hostAllowed(url)) throw new Error("wall: Winston may not call " + url.slice(0, 60));
  return await fetch(url, init);
}

// Market data only, through otto-proxy's read-only gateway (it refuses account, order and write tools).
async function md(service: "rh" | "tv", tool: string, args: any = {}): Promise<any> {
  if (T?.md) return T.md(service, tool, args);
  const base = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), sec = Deno.env.get("OTTO_CRON_SECRET");
  if (!base || !anon || !sec) throw new Error("market-data gateway not configured");
  const r = await safeFetch(base + "/functions/v1/otto-proxy?fn=winston_data", {
    method: "POST",
    headers: { apikey: anon, authorization: "Bearer " + anon, "x-otto-cron": sec, "content-type": "application/json" },
    body: JSON.stringify({ service, tool, args }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: "HTTP " + r.status }));
  if (!j.ok) throw new Error(String(j.error || "gateway error").slice(0, 200));
  return j.data;
}

/* ------------------------------------------------------------------ New York clock */

export function etParts(d = nowDate()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value || "";
  return { wd: g("weekday"), date: `${g("year")}-${g("month")}-${g("day")}`, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
const NYSE_CLOSED = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
const NYSE_HALF = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);
export const addDays = (date: string, n: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00Z").getUTCDay()];
export const isTradingDay = (date: string) => !["Sat", "Sun"].includes(dayName(date)) && !NYSE_CLOSED.has(date);
export const mondayOf = (date: string) => { const wd = new Date(date + "T12:00:00Z").getUTCDay(); return addDays(date, -((wd + 6) % 7)); };
export function marketClock(d = nowDate()) {
  const e = etParts(d);
  const closeMin = NYSE_HALF.has(e.date) ? 780 : 960;
  const trading = isTradingDay(e.date);
  const status: "open" | "pre" | "after" | "closed" = !trading ? "closed" : e.min < 570 ? "pre" : e.min < closeMin ? "open" : "after";
  return { ...e, status, closeMin, trading };
}
export const fmtMin = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
// The UTC instant of an ET wall-clock time (handles daylight saving by checking both offsets).
export function etToUtcMs(date: string, min: number): number {
  const [y, m, d] = date.split("-").map(Number);
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, Math.floor(min / 60) + off, min % 60);
    const p = etParts(new Date(t));
    if (p.date === date && p.min === min) return t;
  }
  return Date.UTC(y, m - 1, d, Math.floor(min / 60) + 5, min % 60);
}

/* ------------------------------------------------------------------ config, limits, rules */

// v3.36 (16 Oct 2026) DATA MODE (Ifoma 15 Oct: "make him relaxed, not reckless, so we see where the holes are"). mode "data": the soft
// gates (W3 same ticker, W12-W15, W20-W23) STAMP the trade instead of blocking it, the contract picker has a loose third tier, the time
// exit has a floor, and limits_override lets Winston drop the live daily stop without touching Josh's limits. mode "strict" = v3.31 behaviour.
export const CONFIG_DEFAULTS: any = { enabled: true, paper_balance: 4000, own_idea_from_min: 600, coach_idea_from_min: 571,
  last_entry_min: 930, default_time_exit_min: 180, flat_min: 950, max_open: 1, mode: "strict", min_time_exit_min: 0, limits_override: {},
  universe: ["SPY", "QQQ", "NVDA", "TSLA", "AAPL", "MSFT", "META", "AMZN", "GOOGL", "AMD", "PLTR", "MU"] };
export const isDataMode = (cfg: any) => String(cfg?.mode || "strict") === "data";
export async function getConfig() {
  const r = await db("winston_settings?key=eq.config&select=value").catch(() => null);
  const v = r?.[0]?.value || {};
  const c = { ...CONFIG_DEFAULTS, ...v };
  c.paper_balance = num(c.paper_balance) > 0 ? num(c.paper_balance) : 4000;
  c.limits_override = c.limits_override && typeof c.limits_override === "object" ? c.limits_override : {};
  c.universe = (Array.isArray(c.universe) ? c.universe : CONFIG_DEFAULTS.universe).map((s: any) => String(s).toUpperCase().replace(/[^A-Z.]/g, "")).filter(Boolean).slice(0, 20);
  return c;
}

// Percentages and switches only, read from the live limits row, applied to HIS paper balance — never to the live account.
export const LIMIT_DEFAULTS: any = { size_cap_on: true, size_cap_pct: 25, max_loss_on: true, max_trade_pct: 10, daily_on: true, daily_losses: 2,
  daily_x: 2, weekly_on: true, weekly_pct: 20, kill_on: true, kill_daily: true, kill_weekly: true };
const LIMIT_KEYS = Object.keys(LIMIT_DEFAULTS);
export async function getLimits(override: any = null) {
  const r = await db("otto_settings?key=eq.limits&select=value").catch(() => null);
  const v = r?.[0]?.value || {};
  return applyLimits(v, override);
}
// Pure: the live limits row, then Winston's own override on top (v3.36; e.g. { daily_on: false } so his daily stop is off while Josh's stays on).
export function applyLimits(v: any, override: any = null) {
  const out: any = { ...LIMIT_DEFAULTS };
  for (const src of [v || {}, override || {}]) {
    for (const k of LIMIT_KEYS) {
      if (src[k] === undefined || src[k] === null) continue;
      if (typeof LIMIT_DEFAULTS[k] === "boolean") out[k] = !!src[k];
      else if (Number.isFinite(Number(src[k]))) out[k] = Number(src[k]);
    }
  }
  return out;
}

export type Rule = { id: string; kind: string; source: string; book_ref?: string; title: string; body: string; active: boolean; params: any };
export async function getRules(): Promise<Rule[]> {
  return (await db("winston_rules?select=*&order=sort.asc")) || [];
}
const ruleOn = (rules: Rule[], id: string) => !!rules.find((r) => r.id === id && r.active);
const ruleParams = (rules: Rule[], id: string) => rules.find((r) => r.id === id)?.params || {};

/* ------------------------------------------------------------------ the paper broker (pure) */

export type Q = { bid: number; ask: number; mid: number; mark: number; delta: number; vol: number; oi: number; at: number | null };
export function parseOptionQuote(r: any): Q | null {
  const q = r?.quote || r;
  if (!q) return null;
  const bid = num(q.bid_price), ask = num(q.ask_price);
  const at = Date.parse(q.updated_at || q.last_trade_time || "") || null;
  return { bid, ask, mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : num(q.mark_price), mark: num(q.mark_price), delta: num(q.delta), vol: num(q.volume), oi: num(q.open_interest), at };
}
// Entry fills at the ASK, exit at the BID (rule W10). A one-sided or crossed quote is not tradable.
export function entryFill(q: Q | null): { ok: true; bid: number; ask: number; mid: number; fill: number } | { ok: false; why: string } {
  if (!q) return { ok: false, why: "no quote" };
  if (!(q.ask > 0) || !(q.bid > 0)) return { ok: false, why: "one-sided quote (no bid or no ask)" };
  if (q.ask < q.bid) return { ok: false, why: "crossed quote" };
  return { ok: true, bid: q.bid, ask: q.ask, mid: (q.bid + q.ask) / 2, fill: q.ask };
}
export function exitFill(q: Q | null): { bid: number; ask: number; mid: number; fill: number } {
  const bid = Math.max(0, q?.bid || 0), ask = q?.ask || 0;
  return { bid, ask, mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : bid, fill: bid };
}
// Dollars for `qty` contracts. realistic = ask in, bid out. mid = mid in, mid out. double = same trade with twice the spread cost (rule W11).
export function tradeMoney(t: { entry_ask: number; entry_mid: number; exit_bid: number; exit_mid: number; qty?: number }, plannedLoss: number) {
  const qty = t.qty || 1;
  const realistic = round2((t.exit_bid - t.entry_ask) * 100 * qty);
  const mid = round2((t.exit_mid - t.entry_mid) * 100 * qty);
  const spread = round2(mid - realistic);
  return { pnl_realistic: realistic, pnl_mid: mid, spread_cost: spread, pnl_double: round2(mid - 2 * spread),
    r_multiple: plannedLoss > 0 ? round2(realistic / plannedLoss) : null };
}

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export function parseBars(j: any): Record<string, Bar[]> {
  const out: Record<string, Bar[]> = {};
  for (const r of (j?.data?.results || j?.results || [])) {
    out[String(r.symbol).toUpperCase()] = (r.bars || []).filter((b: any) => !b.interpolated).map((b: any) => ({
      t: Date.parse(b.begins_at), o: num(b.open_price), h: num(b.high_price), l: num(b.low_price), c: num(b.close_price), v: num(b.volume) }))
      .filter((b: Bar) => [b.o, b.h, b.l, b.c].every((v) => isFinite(v) && v > 0) && isFinite(b.t));
  }
  return out;
}
export const completedBars = (bars: Bar[], mins: number, now = nowMs()) => bars.filter((b) => b.t + mins * 60e3 <= now);

// Exits are the plan's own rules, checked on COMPLETED 10-minute bars of the underlying, first trigger in time order wins.
//   wrong-if = a 10-minute CLOSE through the level; target = the level touched (high/low).
//   If both happen inside one bar, the stop is assumed to hit first and the trade is flagged (rule W8).
export function evalBars(plan: { dir: "up" | "down"; wrong_if_level: number; target_level: number }, bars: Bar[], enteredAtMs: number, now = nowMs()) {
  const done = completedBars(bars, 10, now).filter((b) => b.t >= enteredAtMs).sort((a, b) => a.t - b.t);
  for (const b of done) {
    const stop = plan.dir === "up" ? b.c < plan.wrong_if_level : b.c > plan.wrong_if_level;
    const tgt = plan.dir === "up" ? b.h >= plan.target_level : b.l <= plan.target_level;
    if (stop && tgt) return { reason: "wrong_if", flags: ["both_hit_same_bar_stop_first"], bar: b };
    if (stop) return { reason: "wrong_if", flags: [] as string[], bar: b };
    if (tgt) return { reason: "target", flags: [] as string[], bar: b };
  }
  return null;
}

// v3.32: the target is a TOUCH, so while a trade is open the still-forming 10-minute bar counts too (the stop stays a completed-bar CLOSE).
// Only bars that began at or after the entry count (the entry bar itself is skipped, same as evalBars), and only the unfinished bar is read here.
export function intrabarTarget(plan: { dir: "up" | "down"; target_level: number }, bars: Bar[], enteredAtMs: number, now = nowMs()): Bar | null {
  const done = new Set(completedBars(bars, 10, now).map((b) => b.t));
  for (const b of bars) {
    if (done.has(b.t) || b.t < enteredAtMs || b.t > now) continue;
    if (plan.dir === "up" ? b.h >= plan.target_level : b.l <= plan.target_level) return b;
  }
  return null;
}

/* ------------------------------------------------------------------ contract choice (pure) */

export type Row = { id: string; exp: string; strike: number; type: string; bid: number; ask: number; delta: number; vol: number; oi: number; label: string };
// Otto's own contract rule: delta .30–.40 and volume above open interest; the one that fits the cap. Never shrink the stop to fit (W2): if
// nothing fits the size cap and the cash, the idea is passed.
export function pickContract(rows: Row[], capUsd: number, cashUsd: number, loose = false) {
  const ok = rows.filter((r) => r.bid > 0 && r.ask >= r.bid && r.ask * 100 <= capUsd && r.ask * 100 <= cashUsd);
  if (!ok.length) return { row: null as Row | null, by: "none", why: rows.length ? "nothing fits the size cap / cash (cap $" + Math.round(Math.min(capUsd, cashUsd)) + ")" : "no tradable contracts", flags: [] as string[] };
  const dist = (r: Row) => Math.abs(Math.abs(r.delta) - 0.35);
  const band = ok.filter((r) => Math.abs(r.delta) >= 0.30 && Math.abs(r.delta) <= 0.40 && r.vol > r.oi).sort((a, b) => dist(a) - dist(b) || b.vol - a.vol);
  if (band.length) return { row: band[0], by: "band", why: "", flags: [] as string[] };
  const near = ok.filter((r) => Math.abs(r.delta) >= 0.20 && Math.abs(r.delta) <= 0.50 && r.vol > r.oi).sort((a, b) => dist(a) - dist(b) || b.vol - a.vol);
  if (near.length) return { row: near[0], by: "near", why: "", flags: [] as string[] };
  // v3.36 data mode: a third, loose tier. Delta .15-.60 with a two-sided quote; volume vs open interest becomes a STAMP, not a wall.
  // 15 Oct: 6 of 9 passed ideas (incl. the coach's DHI call) died on "volume > OI" — the gate is now scored instead of trusted.
  if (loose) {
    const wide = ok.filter((r) => Math.abs(r.delta) >= 0.15 && Math.abs(r.delta) <= 0.60).sort((a, b) => dist(a) - dist(b) || b.vol - a.vol);
    if (wide.length) {
      const r = wide[0], flags: string[] = [];
      if (!(r.vol > r.oi)) flags.push("picker:volume_not_above_oi");
      if (Math.abs(r.delta) < 0.20 || Math.abs(r.delta) > 0.50) flags.push("picker:delta_outside_20_50");
      return { row: r, by: "loose", why: "", flags };
    }
  }
  return { row: null, by: "none", why: loose ? "no contract with delta .15-.60 and a two-sided quote fits" : "no contract with delta .20-.50 and volume above open interest fits", flags: [] as string[] };
}

/* ------------------------------------------------------------------ plan checks + gates (pure) */

export type Decision = { ticker: string; side: "call" | "put"; source: string; thesis: string; wrong_if_level: number; target_level: number;
  time_exit_min?: number; experiment?: string | null; cites: { type: string; ref?: string; note?: string }[]; rule_ids?: string[] };

// Levels must make sense against the live price (call: wrong-if below, target above; put: the reverse). Returns the reason it is bad, or null.
export function planProblem(d: Decision, spot: number): string | null {
  if (!d.ticker || !["call", "put"].includes(d.side)) return "missing ticker or side";
  if (![d.wrong_if_level, d.target_level, spot].every((v) => Number.isFinite(v) && v > 0)) return "missing wrong-if or target level (W1)";
  if (d.side === "call" && !(d.wrong_if_level < spot && spot < d.target_level)) return `call needs wrong-if ${d.wrong_if_level} below ${spot} and target ${d.target_level} above`;
  if (d.side === "put" && !(d.target_level < spot && spot < d.wrong_if_level)) return `put needs target ${d.target_level} below ${spot} and wrong-if ${d.wrong_if_level} above`;
  const risk = Math.abs(spot - d.wrong_if_level), reward = Math.abs(d.target_level - spot);
  if (risk / spot < 0.0005) return "wrong-if is too close to the price to mean anything";
  if (reward < risk * 0.5) return "target is less than half the risk";
  if (!Array.isArray(d.cites) || !d.cites.length) return "no source cited (W6)";
  const te = d.time_exit_min;
  if (te != null && !(te >= 10 && te <= 330)) return "time exit out of range";
  return null;
}
// Estimated option price at the wrong-if (delta × move). It only SIZES the risk check; the actual exit is the 10-minute-close rule.
export function riskEstimate(ask: number, delta: number, spot: number, wrongIf: number) {
  const est = Math.max(0.01, round2(ask - Math.abs(delta) * Math.abs(spot - wrongIf)));
  return { stop_option: est, planned_loss: round2(Math.min(ask, ask - est) * 100) };
}

export type Equity = { equity: number; cash: number; day_pnl: number; day_losses: number; week_pnl: number; week_start_equity: number };
export function limitsState(L: any, e: Equity) {
  const capUsd = L.size_cap_on && L.size_cap_pct > 0 ? round2(e.equity * L.size_cap_pct / 100) : Infinity;
  const maxLossUsd = L.max_loss_on && L.max_trade_pct > 0 ? round2(e.equity * L.max_trade_pct / 100) : Infinity;
  let locked: { why: string; until: string } | null = null;
  if (L.kill_on) {
    const dailyHit = L.daily_on && L.kill_daily && ((L.daily_losses > 0 && e.day_losses >= L.daily_losses) || (L.daily_x > 0 && isFinite(maxLossUsd) && e.day_pnl <= -L.daily_x * maxLossUsd));
    const weeklyHit = L.weekly_on && L.kill_weekly && L.weekly_pct > 0 && e.week_pnl <= -(L.weekly_pct / 100) * e.week_start_equity;
    if (weeklyHit) locked = { why: `weekly loss limit (${L.weekly_pct}%) reached`, until: "next week" };
    else if (dailyHit) locked = { why: `daily stop reached (${e.day_losses} losing trade${e.day_losses === 1 ? "" : "s"}, ${e.day_pnl < 0 ? "-" : ""}$${Math.abs(round2(e.day_pnl))})`, until: "tomorrow" };
  }
  return { capUsd, maxLossUsd, locked };
}

export type GateCtx = { rules: Rule[]; d: Decision; cap: number; maxLoss: number; planned_loss: number; cost: number; cash: number; stop_option: number; ask: number;
  openCount: number; maxOpen: number; tickerTakenToday: boolean; sameTickerOpen: boolean; spreadPct: number; quoteAgeSec: number | null; blackout: string | null;
  coachCall: boolean; etMin: number; lastEntryMin: number; ownFromMin: number; coachFromMin: number;
  // v3.36 — the coach's 15 Oct rules and the data-mode switch. All optional so the v3.31 callers and tests still work.
  dataMode?: boolean; reentryBeyondExit?: string | null; atCoachLevel?: string | null; indexDisagree?: string | null; thesisWrong?: string | null; coachResultAfter?: string | null };
export type GateHit = { rule: string; why: string; soft: boolean };
// HARD gates always block: the plan itself (W1), risk and size (W2), cash, the max open count and the time windows.
// SOFT gates (W3, W12-W15, W20-W23) block in strict mode; in data mode they STAMP the trade (flags) so the report can score each gate.
const SOFT = new Set(["W3", "W12", "W13", "W14", "W15", "W20", "W21", "W22", "W23", "fact"]);
export function runGatesAll(c: GateCtx): GateHit[] {
  const R = c.rules, hits: GateHit[] = [];
  const hit = (rule: string, why: string) => hits.push({ rule, why, soft: !!c.dataMode && SOFT.has(rule) });
  if (ruleOn(R, "W1")) {
    const d = c.d;
    if (!(d.wrong_if_level > 0) || !(d.target_level > 0) || !(c.stop_option > 0) || !(c.cost > 0) || !(c.ask > 0)) hit("W1", "plan is missing a stop, target, size or price");
  }
  if (ruleOn(R, "W2")) {
    if (c.stop_option >= c.ask) hit("W2", "stop is not below the entry");
    if (c.planned_loss > c.maxLoss) hit("W2", `planned loss $${c.planned_loss} is over the max loss per trade $${c.maxLoss} — skipped, not shrunk`);
    if (c.cost > c.cap) hit("W2", `cost $${c.cost} is over the size cap $${c.cap}`);
  }
  if (c.cost > c.cash) hit("cash", `cost $${c.cost} is more than the paper cash $${round2(c.cash)}`);
  if (ruleOn(R, "W3") && c.sameTickerOpen) hit("W3", "already in this ticker (no adding, no averaging)");
  if (c.openCount >= c.maxOpen) hit("max_open", `already holding ${c.openCount} position${c.openCount === 1 ? "" : "s"} (max ${c.maxOpen})`);
  if (c.etMin > c.lastEntryMin) hit("time", "too late in the day for a new entry");
  if (c.etMin < (c.coachCall ? c.coachFromMin : c.ownFromMin)) hit("time", c.coachCall ? "before the coach-idea window opens" : "own ideas wait until 10:00 (no entry just because the market opened)");
  if (ruleOn(R, "W12")) {
    const mx = ruleParams(R, "W12").max_spread_pct;
    if (mx != null && c.spreadPct > mx) hit("W12", `spread ${c.spreadPct.toFixed(1)}% is wider than ${mx}%`);
  }
  if (ruleOn(R, "W13")) {
    const mx = ruleParams(R, "W13").max_age_sec ?? 15;
    if (c.quoteAgeSec == null || c.quoteAgeSec > mx) hit("W13", c.quoteAgeSec == null ? "quote has no timestamp" : `quote is ${Math.round(c.quoteAgeSec)}s old`);
  }
  if (ruleOn(R, "W14") && c.blackout && !c.coachCall) hit("W14", "event blackout: " + c.blackout);
  if (ruleOn(R, "W15") && c.tickerTakenToday) hit("W15", "one idea per ticker per day — already traded today");
  // v3.36 — the coach, 15 Oct 2026
  if (ruleOn(R, "W20") && c.reentryBeyondExit) hit("W20", c.reentryBeyondExit);           // let price come to you: no re-entry chasing past the last exit
  if (ruleOn(R, "W21") && c.atCoachLevel) hit("W21", c.atCoachLevel);                     // don't buy at the sell-to
  if (ruleOn(R, "W23") && c.indexDisagree) hit("W23", c.indexDisagree);                   // index agreement
  if (c.thesisWrong) hit("fact", c.thesisWrong);                                            // the thesis contradicts the quote (price vs VWAP)
  if (c.coachResultAfter) hit("fact", c.coachResultAfter);                                 // the coach already sold / trimmed after the cited post
  return hits;
}
// Returns the first HARD reason to pass (with the rule id), or null when nothing blocks. Soft stamps come from runGatesAll.
export function runGates(c: GateCtx): { rule: string; why: string } | null {
  const h = runGatesAll(c).find((x) => !x.soft);
  return h ? { rule: h.rule, why: h.why } : null;
}

/* ------------------------------------------------------------------ v3.36: the coach's 15 Oct reads (pure) */

// W20 "Let price come to you": a closed trade today on the same ticker+side, and the new entry is further along in the trade's direction
// than where that trade got out (call: higher; put: lower). 15 Oct: SPY 767.26 → 768.53 → 770.22, three buys in 40 minutes.
export function reentryBeyondExit(side: "call" | "put", spot: number, closedToday: { ticker: string; side: string; exit_under: number | null }[], ticker: string): string | null {
  const same = closedToday.filter((t) => String(t.ticker).toUpperCase() === ticker && t.side === side && num(t.exit_under) > 0);
  if (!same.length) return null;
  const last = same[same.length - 1];
  const beyond = side === "call" ? spot > num(last.exit_under) : spot < num(last.exit_under);
  return beyond ? `re-entry ${side === "call" ? "above" : "below"} the last exit on ${ticker} (${num(last.exit_under)}) — chasing, not letting price come to you` : null;
}
// W21 "Don't buy at the sell-to": a coach level post today for this ticker within $0.50 of the entry price, on the side where it is a target, not an entry.
// A call entered at a level the coach named is buying where he sells (SPY 770 on 15 Oct). Direction-less or opposite-direction level posts count; a level
// with the SAME direction as the trade (his "above X" buy line) does not.
export function atCoachLevel(side: "call" | "put", spot: number, posts: { ticker?: string; kind?: string; level?: any; direction?: string | null }[], ticker: string, band = 0.5): string | null {
  for (const p of posts) {
    if (p.kind !== "level" || String(p.ticker || "").toUpperCase() !== ticker || !(num(p.level) > 0)) continue;
    const same = (side === "call" && p.direction === "long") || (side === "put" && p.direction === "short");
    if (same) continue;
    if (Math.abs(spot - num(p.level)) <= band) return `entry at ${spot} is within $${band} of the coach's ${num(p.level)} level — that is where he sells to, not where he buys`;
  }
  return null;
}
// W23 index agreement: SPY above its VWAP with rising closes says no shorts in index names; below and falling says no longs.
export type IndexRead = { above_vwap: boolean; rising: boolean; falling: boolean; vwap: number; last: number } | null;
export function indexRead(spyBars: Bar[], now = nowMs()): IndexRead {
  const d = completedBars(spyBars, 10, now);
  if (d.length < 3) return null;
  const c = d.slice(-3).map((b) => b.c), vwap = vwapOf(d), last = c[2];
  return { above_vwap: last > vwap, rising: c[0] < c[1] && c[1] < c[2], falling: c[0] > c[1] && c[1] > c[2], vwap: round2(vwap), last };
}
export function indexDisagree(side: "call" | "put", idx: IndexRead): string | null {
  if (!idx) return null;
  if (side === "put" && idx.above_vwap && idx.rising) return `SPY is above its VWAP (${idx.vwap}) and making higher closes — a short fights the index`;
  if (side === "call" && !idx.above_vwap && idx.falling) return `SPY is below its VWAP (${idx.vwap}) and making lower closes — a long fights the index`;
  return null;
}
// Fact check: a thesis that says "below VWAP" while price is above it (or the reverse) is a wrong fact (NVDA/QQQ 15 Oct: "below VWAP (720.91)" at 723.7).
// v3.41: the claim must be about THIS ticker. A thesis that says "TSLA is above VWAP … SPY is below VWAP" was stamped as a
// wrong fact on TSLA (19 Oct, the day's only winner) because the whole text was searched. Now each sentence/clause is read on its
// own: a clause that names another ticker (SPY, QQQ, another symbol) is skipped; a clause with no ticker is taken to be about ours.
export function thesisVwapWrong(thesis: string, spot: number, vwap: number | null | undefined, ticker = ""): string | null {
  if (!(num(vwap) > 0) || !(spot > 0)) return null;
  const me = String(ticker || "").toUpperCase();
  const clauses = String(thesis || "").split(/(?<=[.;!?])\s+|\s+[—–]\s+|\s+(?:while|whereas|but|and|;)\s+(?=[A-Z]{2,5}\b)/).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) {
    const names = (c.match(/\b[A-Z]{2,5}\b/g) || []).filter((w) => !["VWAP", "ORB", "EMA", "SMA", "RSI", "TP", "HOD", "LOD", "ET", "AM", "PM", "OI", "IV", "ATR", "OB", "NY", "CBC"].includes(w));
    if (names.length && me && !names.includes(me)) continue;            // about another name (SPY, QQQ, …) — not our fact
    if (/\b(below|under|beneath)\s+(the\s+)?(session\s+|day\s+)?vwap/i.test(c) && spot > num(vwap)) return `thesis says below VWAP but price ${spot} is above VWAP ${round2(num(vwap))}`;
    if (/\b(above|over|reclaimed)\s+(the\s+)?(session\s+|day\s+)?vwap/i.test(c) && spot < num(vwap)) return `thesis says above VWAP but price ${spot} is below VWAP ${round2(num(vwap))}`;
  }
  return null;
}
// A `result` post after the cited post, same ticker, saying he sold / trimmed / stopped: the idea is his EXIT, not a fresh entry (SPY #206/#207/#208, 15 Oct).
export function coachResultAfter(citedId: number, ticker: string, posts: { id: any; ticker?: string; kind?: string; words?: string }[]): string | null {
  for (const p of posts) {
    if (num(p.id) <= citedId || p.kind !== "result" || String(p.ticker || "").toUpperCase() !== ticker) continue;
    if (/\b(sold|sell|selling|trim|trimmed|took profit|taking profit|stopped|closed out)\b/i.test(String(p.words || ""))) return `coach post ${p.id} after the cited one says he sold/trimmed ${ticker} — that was his exit, not a new entry`;
  }
  return null;
}
// W22 the coach's exit: an indecision bar (body ≤ 25% of its range) followed by a bar that fails to make a new high (longs) / new low (shorts), on completed
// 10-minute bars after the entry. Returns the bar that fails, or null. "Indecision followed by a lower high — easy sell" (15 Oct, 30:30-31:40).
export function coachExit(plan: { dir: "up" | "down" }, bars: Bar[], enteredAtMs: number, now = nowMs()): Bar | null {
  const d = completedBars(bars, 10, now).filter((b) => b.t >= enteredAtMs).sort((a, b) => a.t - b.t);
  for (let i = 0; i + 1 < d.length; i++) {
    const a = d[i], b = d[i + 1], range = a.h - a.l;
    if (!(range > 0) || Math.abs(a.c - a.o) > 0.25 * range) continue;
    if (plan.dir === "up" ? b.h <= a.h : b.l >= a.l) return b;
  }
  return null;
}
// MFE / MAE: how far the underlying went for and against the trade (completed bars after entry), in price and in R via the plan's delta and planned loss.
export function excursion(plan: { dir: "up" | "down"; delta?: number; planned_loss?: number }, bars: Bar[], enteredAtMs: number, entryUnder: number, now = nowMs()) {
  const d = completedBars(bars, 10, now).filter((b) => b.t >= enteredAtMs);
  if (!d.length || !(entryUnder > 0)) return null;
  const hi = Math.max(...d.map((b) => b.h)), lo = Math.min(...d.map((b) => b.l));
  const mfe = round2(plan.dir === "up" ? hi - entryUnder : entryUnder - lo), mae = round2(plan.dir === "up" ? entryUnder - lo : hi - entryUnder);
  const perR = num(plan.planned_loss) > 0 && num(plan.delta) ? Math.abs(num(plan.delta)) * 100 / num(plan.planned_loss) : 0;
  return { mfe_under: mfe, mae_under: mae, mfe_r: perR ? round2(mfe * perR) : null, mae_r: perR ? round2(mae * perR) : null, bars: d.length };
}

/* ------------------------------------------------------------------ audit + stats (pure) */

export function auditTrade(t: any, closeEtMin: number | null, flatMin: number): { followed: boolean; broke: string[] } {
  const broke: string[] = [];
  const p = t.plan || {};
  if (!(p.wrong_if_level > 0) || !(p.target_level > 0) || !(p.stop_option > 0)) broke.push("W1: plan was incomplete at entry");
  if (t.exit_reason === "flat_close" && closeEtMin != null && closeEtMin > flatMin + 15) broke.push("W3: held past the flat-by time");
  if (t.exit_reason === "kill") broke.push("kill: closed by the kill switch");
  return { followed: broke.length === 0, broke };
}

export function computeStats(trades: any[]) {
  const closed = trades.filter((t) => t.status === "closed");
  const main = closed.filter((t) => !t.experiment);
  const sum = (a: any[], k: string) => round2(a.reduce((s, t) => s + num(t[k]), 0));
  const wins = main.filter((t) => num(t.pnl_realistic) > 0), losses = main.filter((t) => num(t.pnl_realistic) < 0);
  const gw = wins.reduce((s, t) => s + num(t.pnl_realistic), 0), gl = Math.abs(losses.reduce((s, t) => s + num(t.pnl_realistic), 0));
  const rs = main.map((t) => t.r_multiple).filter((r) => r != null).map(Number);
  const byDay: Record<string, number> = {};
  for (const t of main) byDay[t.day] = round2((byDay[t.day] || 0) + num(t.pnl_realistic));
  let streak = 0, longest = 0;
  for (const t of [...main].sort((a, b) => String(a.closed_at).localeCompare(String(b.closed_at)))) {
    if (num(t.pnl_realistic) < 0) { streak++; longest = Math.max(longest, streak); } else streak = 0;
  }
  return {
    trades: main.length, experiments: closed.length - main.length, wins: wins.length, losses: losses.length,
    pnl_realistic: sum(main, "pnl_realistic"), pnl_mid: sum(main, "pnl_mid"), pnl_double: sum(main, "pnl_double"), spread_cost: sum(main, "spread_cost"),
    expectancy_r: rs.length ? round2(rs.reduce((s, r) => s + r, 0) / rs.length) : null,
    profit_factor: gl > 0 ? round2(gw / gl) : null,
    worst_day: Object.keys(byDay).length ? Math.min(...Object.values(byDay)) : null,
    longest_losing_streak: longest,
    rule_breaks: main.filter((t) => t.followed_rules === false).length,
    experiment_pnl_realistic: sum(closed.filter((t) => t.experiment), "pnl_realistic"),
    note: main.length < 30 ? `Only ${main.length} trade${main.length === 1 ? "" : "s"}: a first look, not proof. No accuracy % before about 30 outcomes per setup type.` : "30+ trades: still a first read. Promotion needs your decision (W18 is not decided).",
  };
}

/* ------------------------------------------------------------------ settings + logging helpers */

async function putSetting(key: string, value: any) {
  await db("winston_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value, updated_at: nowDate().toISOString() }) });
}
async function getSetting(key: string) { const r = await db("winston_settings?key=eq." + key + "&select=value"); return r?.[0]?.value ?? null; }
async function wlog(kind: string, data: any) { try { await db("winston_log", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ kind, data }) }); } catch { /* logging never stops a tick */ } }

// One tick at a time (two cron firings, or a slow AI call, must not trade twice).
async function takeLock(name: string, ms: number): Promise<boolean> {
  await db("winston_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ key: name, value: { until: "1970-01-01T00:00:00.000Z" } }) });
  const until = new Date(nowMs() + ms).toISOString();
  const got = await db(`winston_settings?key=eq.${name}&value->>until=lt.${encodeURIComponent(nowDate().toISOString())}`, {
    method: "PATCH", body: JSON.stringify({ value: { until }, updated_at: nowDate().toISOString() }) });
  return Array.isArray(got) && got.length === 1;
}
async function freeLock(name: string) { await db(`winston_settings?key=eq.${name}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ value: { until: "1970-01-01T00:00:00.000Z" } }) }).catch(() => {}); }

/* ------------------------------------------------------------------ AI */

async function aiJson(system: string, user: string, tool: { name: string; description: string; input_schema: any }, maxTokens = 3000): Promise<{ out: any; usage: { input: number; output: number } }> {
  if (T?.ai) return T.ai({ system, user, tool });
  const key = Deno.env.get("ANTHROPIC_KEY") || "";
  if (!key) throw new Error("ANTHROPIC_KEY is not set");
  const r = await safeFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name }, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (j.error) throw new Error(String(j.error.message || "AI error").slice(0, 200));
  const blk = (j.content || []).find((c: any) => c.type === "tool_use" && c.name === tool.name);
  if (!blk) throw new Error("AI gave no structured answer");
  return { out: blk.input, usage: { input: num(j.usage?.input_tokens), output: num(j.usage?.output_tokens) } };
}
async function addAiCost(day: string, usage: { input: number; output: number }) {
  const r = await db(`winston_days?day=eq.${day}&select=ai`);
  const a = r?.[0]?.ai || { calls: 0, input_tokens: 0, output_tokens: 0 };
  const ai = { calls: num(a.calls) + 1, input_tokens: num(a.input_tokens) + usage.input, output_tokens: num(a.output_tokens) + usage.output };
  await db("winston_days?on_conflict=day", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ day, ai, updated_at: nowDate().toISOString() }) });
}

// v3.40 brain reader. Three fixes in one place:
//  1. Newest calls first, whatever order they were stored in. The seed arrays are newest first, so slice(-4) used to take the four OLDEST calls.
//  2. THIS WEEK'S CALLOUTS: the `levels` of any call dated within the last 7 days (they expire by themselves; every line carries its date).
//  3. The `rules` lines are the coach's standing best practices (the Playbook). They are advisory, carry their id when they have one,
//     and 20 per call get through at up to 420 characters each (it was 14 at 260).
const BRAIN_SKIP = /^(at|scope|source|file|id|for|status|channel|repeat|tag|on)$/;
const brainLine = (o: any) => Object.entries(o || {}).filter(([k, v]) => typeof v === "string" && !BRAIN_SKIP.test(k)).map(([, v]) => v as string).join(" \u2014 ").replace(/\s+/g, " ").trim();
export function buildBrainText(calls: any[], now: number): string {
  const sorted = (Array.isArray(calls) ? calls : []).filter((c) => c && typeof c === "object")
    .sort((a, b) => String(b?.call?.date || "").localeCompare(String(a?.call?.date || "")));
  const week: string[] = [];
  for (const c of sorted) {
    const d = String(c?.call?.date || ""), t = Date.parse(d + "T12:00:00Z");
    if (!isFinite(t) || now - t > 7 * 86400000 || t - now > 86400000) continue;
    for (const o of (c.levels || []).slice(0, 60)) { const s = brainLine(o); if (s) week.push(`[callout ${d}${o?.at ? " " + o.at : ""}] ${s.slice(0, 260)}`); }
  }
  const lines: string[] = [];
  for (const c of sorted.slice(0, 4)) {
    const d = c?.call?.date || "undated";
    for (const k of ["rules", "setups", "insights"]) for (const o of (c[k] || []).slice(0, k === "rules" ? 20 : 14)) {
      const t = brainLine(o);
      if (t) lines.push(`[call ${d}, ${k}${o?.id ? " " + o.id : ""}] ${t.slice(0, k === "rules" ? 420 : 260)}`);
    }
  }
  const parts: string[] = [];
  if (week.length) parts.push("THIS WEEK'S COACH CALLOUTS (dated marks and views from his newest sessions; they go stale when the week ends; never treat one as a live price):\n" + week.join("\n").slice(0, 7500));
  if (lines.length) parts.push("RULES, SETUPS AND INSIGHTS FROM HIS LATEST CALLS (the 'rules' lines are his standing best practices: ADVISORY, they inform your judgment and never override the HARD RULES or your rule list; when you lean on one, cite it as a brain line with its id if it has one):\n" + lines.join("\n").slice(0, 10000));
  return parts.join("\n\n");
}
let BRAIN_TXT: string | null = null, BRAIN_AT = 0;
export function resetBrainCache() { BRAIN_TXT = null; BRAIN_AT = 0; }
export async function brainExcerpt(): Promise<string> {
  if (BRAIN_TXT != null && nowMs() - BRAIN_AT < 600000) return BRAIN_TXT;      // refresh every 10 minutes so a new seed is picked up
  try {
    const r = await db("brain_versions?select=payload&order=version.desc&limit=1");
    BRAIN_TXT = buildBrainText(r?.[0]?.payload || [], nowMs());
  } catch { BRAIN_TXT = ""; }
  BRAIN_AT = nowMs();
  return BRAIN_TXT;
}

const DECIDE_TOOL = {
  name: "decide",
  description: "Report your decisions for this check: ideas to trade (with levels) and ideas you are passing on, each with the sources you leaned on.",
  input_schema: {
    type: "object",
    properties: {
      decisions: { type: "array", maxItems: 3, items: { type: "object", properties: {
        ticker: { type: "string" }, side: { type: "string", enum: ["call", "put"] },
        source: { type: "string", description: "'own' or 'coach:<post id>' — only a post id from the list" },
        thesis: { type: "string", description: "one or two plain sentences" },
        wrong_if_level: { type: "number", description: "underlying price: a 10-minute CLOSE through this means the idea is wrong" },
        target_level: { type: "number", description: "underlying price target" },
        time_exit_min: { type: "number", description: "minutes to hold at most (10-330)" },
        experiment: { type: "string", description: "E1 or E2 only if that experiment rule is active and this is that setup" },
        rule_ids: { type: "array", items: { type: "string" } },
        cites: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["rule", "coach_post", "brain", "news", "chart", "calendar"] }, ref: { type: "string" }, note: { type: "string" } }, required: ["type"] } },
      }, required: ["ticker", "side", "source", "thesis", "wrong_if_level", "target_level", "cites"] } },
      passes: { type: "array", items: { type: "object", properties: { ticker: { type: "string" }, source: { type: "string" }, reason: { type: "string" },
        rule_ids: { type: "array", items: { type: "string" } }, cites: { type: "array", items: { type: "object", properties: { type: { type: "string" }, ref: { type: "string" }, note: { type: "string" } } } } }, required: ["reason"] } },
      notes: { type: "string", description: "one or two sentences on the tape, if useful" },
    },
    required: ["decisions", "passes"],
  },
};

const SYSTEM = `You are Winston, a paper-only (pretend-money) options day trader inside Otto Trader. You trade one contract at a time with a $4,000 paper account.
You may trade what the coach names (his posts are listed with ids) and ideas you originate yourself from the brain, the chart snapshot, the calendar and the news you are shown.
HARD RULES:
- Use ONLY the facts in the message. Never state a price, level, news item or coach statement that is not there. If you are not sure, pass and say why.
- Every decision and every pass cites what it leaned on (a rule id, a coach post id, a brain line, a headline, the chart). No source = pass.
- Levels are on the UNDERLYING stock. wrong_if_level: a 10-minute candle CLOSE through it means the idea is wrong. target_level: price target. For a call: wrong-if below the price, target above. For a put: reverse.
- You decide the idea and the levels; code picks the contract, the fills and the exits. You cannot place orders.
- Obey the active rules listed. The coach's calls win over book rules. Rules marked OFF are not in force.
- Passing is fine. Prefer fewer, clearer ideas. Do not repeat an idea you already took or passed today unless something changed.
- Plain words, no hype. You never see anything Josh or Baby J do.`;

/* ------------------------------------------------------------------ market snapshot */

function quoteSpot(q: any): number {
  const reg = num(q?.last_trade_price), ext = num(q?.last_non_reg_trade_price);
  return ext && Date.parse(q?.venue_last_non_reg_trade_time || "") > Date.parse(q?.venue_last_trade_time || "") ? ext : reg;
}
async function equityQuotes(symbols: string[]): Promise<Record<string, { spot: number; prev: number }>> {
  const out: Record<string, { spot: number; prev: number }> = {};
  const uniq = [...new Set(symbols)];
  for (let i = 0; i < uniq.length; i += 20) {
    const j = await md("rh", "get_equity_quotes", { symbols: uniq.slice(i, i + 20) });
    for (const r of j?.data?.results || []) {
      const q = r?.quote || {};
      const s = String(q.symbol || r.symbol || "").toUpperCase();
      if (s && quoteSpot(q) > 0) out[s] = { spot: quoteSpot(q), prev: num(q.adjusted_previous_close || q.previous_close) };
    }
  }
  return out;
}
async function bars10(symbols: string[], date: string): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = {};
  const start = new Date(etToUtcMs(date, 570)).toISOString();
  const uniq = [...new Set(symbols)];
  for (let i = 0; i < uniq.length; i += 10) Object.assign(out, parseBars(await md("rh", "get_equity_historicals", { symbols: uniq.slice(i, i + 10), interval: "10minute", start_time: start })));
  return out;
}
const vwapOf = (b: Bar[]) => { let pv = 0, v = 0; for (const x of b) { const w = x.v > 0 ? x.v : 1; pv += w * (x.h + x.l + x.c) / 3; v += w; } return v ? pv / v : 0; };
function barsSummary(b: Bar[], now: number) {
  const d = completedBars(b, 10, now);
  if (!d.length) return null;
  return { day_open: d[0].o, day_high: Math.max(...d.map((x) => x.h)), day_low: Math.min(...d.map((x) => x.l)), vwap: round2(vwapOf(d)),
    last_close: d[d.length - 1].c, last_bars: d.slice(-8).map((x) => [fmtMin(etParts(new Date(x.t)).min), x.o, x.h, x.l, x.c]) };
}

/* ------------------------------------------------------------------ equity from the trade book */

export async function equityState(cfg: any, day: string): Promise<Equity & { open: any[] }> {
  const all: any[] = (await db("winston_trades?select=id,day,status,ticker,pnl_realistic,entry_ask,qty,closed_at&order=id.asc")) || [];
  const closed = all.filter((t) => t.status === "closed");
  const open = all.filter((t) => t.status === "open");
  const pnl = (a: any[]) => round2(a.reduce((s, t) => s + num(t.pnl_realistic), 0));
  const equity = round2(cfg.paper_balance + pnl(closed));
  const openCost = round2(open.reduce((s, t) => s + num(t.entry_ask) * 100 * (t.qty || 1), 0));
  const dayClosed = closed.filter((t) => t.day === day);
  const mon = mondayOf(day);
  const weekClosed = closed.filter((t) => t.day >= mon && t.day <= day);
  const beforeWeek = closed.filter((t) => t.day < mon);
  return { equity, cash: round2(equity - openCost), day_pnl: pnl(dayClosed), day_losses: dayClosed.filter((t) => num(t.pnl_realistic) < 0).length,
    week_pnl: pnl(weekClosed), week_start_equity: round2(cfg.paper_balance + pnl(beforeWeek)), open: open };
}

/* ------------------------------------------------------------------ opening and closing paper trades */

async function optionRows(sym: string, side: "call" | "put", spot: number, date: string): Promise<Row[]> {
  const ch = await md("rh", "get_option_chains", { underlying_symbol: sym });
  const chain = (ch?.data?.chains || []).find((c: any) => c.symbol === sym && c.can_open_position !== false) || (ch?.data?.chains || [])[0];
  const exps: string[] = (chain?.expiration_dates || []).filter((d: string) => d > date && d <= addDays(date, 10)).slice(0, 2);
  if (!exps.length) return [];
  const lo = spot * 0.95, hi = spot * 1.05;
  const ins: any[] = [];
  for (const exp of exps) {
    const args: any = { chain_symbol: sym, expiration_dates: exp, type: side, cursor: btoa("p=" + (lo - 0.01).toFixed(4)) };
    let list: any[] = [];
    try { list = (await md("rh", "get_option_instruments", args))?.data?.instruments || []; } catch { /* fall back below */ }
    if (!list.some((i: any) => num(i.strike_price) >= lo && num(i.strike_price) <= hi)) { delete args.cursor; list = (await md("rh", "get_option_instruments", args))?.data?.instruments || []; }
    const ok = list.filter((i: any) => i.tradability !== "untradable" && i.state !== "expired" && num(i.strike_price) >= lo && num(i.strike_price) <= hi);
    const otm = (i: any) => side === "put" ? num(i.strike_price) <= spot : num(i.strike_price) >= spot;
    const dist = (a: any, b: any) => Math.abs(num(a.strike_price) - spot) - Math.abs(num(b.strike_price) - spot);
    ins.push(...ok.filter((i: any) => !otm(i)).sort(dist).slice(0, 1), ...ok.filter(otm).sort(dist).slice(0, 6));
  }
  const quotes: Record<string, Q> = {};
  for (let i = 0; i < ins.length; i += 20) {
    const j = await md("rh", "get_option_quotes", { instrument_ids: ins.slice(i, i + 20).map((x: any) => x.id) });
    for (const r of j?.data?.results || []) { const id = r?.quote?.instrument_id; const q = parseOptionQuote(r); if (id && q) quotes[id] = q; }
  }
  return ins.filter((i: any) => quotes[i.id]).map((i: any) => {
    const q = quotes[i.id], strike = num(i.strike_price);
    return { id: i.id, exp: i.expiration_date, strike, type: side, bid: q.bid, ask: q.ask, delta: q.delta, vol: q.vol, oi: q.oi,
      label: `${sym} ${strike % 1 ? strike : Math.round(strike)}${side === "put" ? "P" : "C"} ${String(i.expiration_date).slice(5).replace("-", "/")}` };
  });
}
async function freshOptionQuote(id: string): Promise<Q | null> {
  const j = await md("rh", "get_option_quotes", { instrument_ids: [id] });
  return parseOptionQuote((j?.data?.results || [])[0]);
}

async function recordIdea(day: string, d: Partial<Decision> & { ticker?: string; side?: string; source?: string }, status: "taken" | "passed" | "blocked", reason: string, plan: any = null, tradeId: number | null = null) {
  const row = { day, ticker: d.ticker ? String(d.ticker).toUpperCase() : null, side: d.side === "call" || d.side === "put" ? d.side : null, source: d.source || "own",
    status, reason: String(reason || "").slice(0, 600), rule_ids: (d.rule_ids || []).map(String).slice(0, 12), cites: d.cites || [], plan, trade_id: tradeId, experiment: d.experiment || null };
  const r = await db("winston_ideas", { method: "POST", body: JSON.stringify(row) });
  return r?.[0]?.id ?? null;
}

type Ctx = { cfg: any; L: any; rules: Rule[]; day: string; min: number; eq: Awaited<ReturnType<typeof equityState>>; lim: ReturnType<typeof limitsState>;
  posts?: any[]; index?: IndexRead; vwaps?: Record<string, number> };   // v3.36: today's coach posts, the SPY read and each focus ticker's VWAP

// Turn one decision into a paper trade, or a passed/blocked idea with the reason. Never throws past this point.
export async function tryOpen(ctx: Ctx, d: Decision, spot: number, coachCall: boolean, blackout: string | null = null): Promise<{ opened: boolean; why: string; tradeId?: number }> {
  const { cfg, rules, day, min, eq, lim } = ctx;
  d.ticker = String(d.ticker).toUpperCase().replace(/[^A-Z.]/g, "");
  const bad = planProblem(d, spot);
  if (bad) { await recordIdea(day, d, "passed", "Plan rejected: " + bad); return { opened: false, why: bad }; }
  if (d.experiment && !(/^E\d+$/.test(String(d.experiment)) && ruleOn(rules, d.experiment))) { await recordIdea(day, d, "passed", `Experiment ${d.experiment} is not switched on`); return { opened: false, why: "experiment off" }; }
  const dayTrades = (await db(`winston_trades?day=eq.${day}&select=ticker,side,status,exit_under`)) || [];
  const openNow = eq.open.length;
  const dataMode = isDataMode(cfg);
  let rows: Row[];
  try { rows = await optionRows(d.ticker, d.side, spot, day); } catch (e) { const m = "Could not read the option chain: " + String((e as Error).message).slice(0, 120); await recordIdea(day, d, "blocked", m); return { opened: false, why: m }; }
  const pick = pickContract(rows, lim.capUsd, eq.cash, dataMode);
  if (!pick.row) { const m = "No contract: " + pick.why; await recordIdea(day, d, "passed", m, null); return { opened: false, why: m }; }
  const row = pick.row;
  // Fresh quote right before the fill (W10): the price he pays is the ask NOW, not the one from the chain scan.
  let q: Q | null; try { q = await freshOptionQuote(row.id); } catch { q = null; }
  const ef = entryFill(q);
  if (!ef.ok) { await recordIdea(day, d, "blocked", "No fill: " + ef.why); return { opened: false, why: ef.why }; }
  const cost = round2(ef.fill * 100);
  const risk = riskEstimate(ef.fill, q!.delta || row.delta, spot, d.wrong_if_level);
  // v3.36: the coach's 15 Oct reads. In data mode they stamp; in strict mode they block (when the rule is on).
  const closedToday = dayTrades.filter((t: any) => t.status === "closed");
  const citedId = d.source.startsWith("coach:") ? num(d.source.slice(6)) : 0;
  const hits = runGatesAll({ rules, d, cap: lim.capUsd, maxLoss: lim.maxLossUsd, planned_loss: risk.planned_loss, cost, cash: eq.cash, stop_option: risk.stop_option, ask: ef.fill,
    openCount: openNow, maxOpen: num(cfg.max_open) || 1, tickerTakenToday: dayTrades.some((t: any) => String(t.ticker).toUpperCase() === d.ticker),
    sameTickerOpen: eq.open.some((t: any) => String(t.ticker || "").toUpperCase() === d.ticker) || false,
    spreadPct: ef.mid > 0 ? (ef.ask - ef.bid) / ef.mid * 100 : 999, quoteAgeSec: q!.at ? (nowMs() - q!.at) / 1000 : null, blackout, coachCall,
    etMin: min, lastEntryMin: num(cfg.last_entry_min), ownFromMin: num(cfg.own_idea_from_min), coachFromMin: num(cfg.coach_idea_from_min),
    dataMode, reentryBeyondExit: reentryBeyondExit(d.side, spot, closedToday, d.ticker), atCoachLevel: atCoachLevel(d.side, spot, ctx.posts || [], d.ticker),
    indexDisagree: d.ticker === "SPY" && d.side === "call" ? null : indexDisagree(d.side, ctx.index ?? null),
    thesisWrong: thesisVwapWrong(d.thesis, spot, ctx.vwaps?.[d.ticker], d.ticker), coachResultAfter: citedId ? coachResultAfter(citedId, d.ticker, ctx.posts || []) : null });
  const gate = hits.find((h) => !h.soft);
  if (gate) { await recordIdea(day, d, "blocked", `${gate.rule}: ${gate.why}`); return { opened: false, why: gate.rule + ": " + gate.why }; }
  const stamps = [...pick.flags, ...hits.filter((h) => h.soft).map((h) => `${h.rule}: ${h.why}`)];
  const timeExit = Math.max(d.time_exit_min || num(cfg.default_time_exit_min) || 180, num(cfg.min_time_exit_min) || 0);
  const plan = { dir: d.side === "call" ? "up" : "down", wrong_if_level: d.wrong_if_level, target_level: d.target_level, time_exit_min: timeExit,
    stop_option: risk.stop_option, planned_loss: risk.planned_loss, thesis: String(d.thesis || "").slice(0, 400), picked_by: pick.by, delta: q!.delta || row.delta,
    contract: { exp: row.exp, strike: row.strike }, last_mark: { bid: ef.bid, ask: ef.ask, under: spot, at: new Date(nowMs()).toISOString() },
    mode: dataMode ? "data" : "strict", stamps, index: ctx.index ?? null, vwap_at_entry: ctx.vwaps?.[d.ticker] ?? null };
  const ideaId = await recordIdea(day, d, "taken", (stamps.length ? "[stamped: " + stamps.map((s) => s.split(":")[0]).join(", ") + "] " : "") + (d.thesis || "taken"), plan);
  const t = await db("winston_trades", { method: "POST", body: JSON.stringify({ day, opened_at: new Date(nowMs()).toISOString(), status: "open", ticker: d.ticker, side: d.side, option_id: row.id, label: row.label, qty: 1,
    source: d.source || "own", idea_id: ideaId, experiment: d.experiment || null, plan, entry_bid: ef.bid, entry_ask: ef.ask, entry_mid: round2(ef.mid * 1000) / 1000, entry_fill: ef.fill, entry_under: spot,
    flags: stamps.map((s) => "stamp:" + s.split(":")[0].replace(/\s+/g, "_")) }) });
  const id = t?.[0]?.id;
  if (ideaId && id) await db(`winston_ideas?id=eq.${ideaId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ trade_id: id }) });
  await wlog("open", { id, label: row.label, fill: ef.fill, source: d.source });
  eq.open.push({ id, ticker: d.ticker, entry_ask: ef.fill, qty: 1, status: "open" });
  eq.cash = round2(eq.cash - cost);
  return { opened: true, why: "opened", tradeId: id };
}

export async function closeTrade(t: any, reason: string, flags: string[] = [], bars: Bar[] | null = null) {
  let q: Q | null = null;
  try { q = await freshOptionQuote(t.option_id); } catch { /* use the last mark below */ }
  let ex = exitFill(q);
  if (!q || !(ex.bid >= 0) || (q.bid <= 0 && q.ask <= 0)) {          // no quote at all: close at the last mark's bid and say so
    const lm = t.plan?.last_mark || {};
    ex = { bid: num(lm.bid), ask: num(lm.ask), mid: num(lm.bid), fill: num(lm.bid) };
    flags = [...flags, "no_exit_quote_used_last_mark"];
  }
  const money = tradeMoney({ entry_ask: num(t.entry_ask), entry_mid: num(t.entry_mid), exit_bid: ex.bid, exit_mid: ex.mid, qty: t.qty || 1 }, num(t.plan?.planned_loss));
  const closedAt = new Date(nowMs());
  const audit = auditTrade({ ...t, exit_reason: reason }, etParts(closedAt).min, num(t.plan?.flat_min) || 950);
  // v3.36: how far the underlying went for / against the trade (MFE / MAE), kept in the plan so the report can say whether a time-exit ever reached +1R.
  const exc = bars ? excursion({ dir: t.plan?.dir, delta: t.plan?.delta, planned_loss: t.plan?.planned_loss }, bars, Date.parse(t.opened_at), num(t.entry_under), nowMs()) : null;
  const under = bars && bars.length ? bars[bars.length - 1].c : num(t.plan?.last_mark?.under) || null;
  const patch = { status: "closed", closed_at: closedAt.toISOString(), exit_bid: ex.bid, exit_ask: ex.ask, exit_mid: round2(ex.mid * 1000) / 1000, exit_fill: ex.fill, exit_reason: reason,
    exit_under: under, ...money, followed_rules: audit.followed, broke: audit.broke, flags: [...new Set([...(t.flags || []), ...flags])],
    plan: { ...(t.plan || {}), excursion: exc } };
  await db(`winston_trades?id=eq.${t.id}&status=eq.open`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(patch) });
  await wlog("close", { id: t.id, reason, pnl: money.pnl_realistic, flags: patch.flags });
  return { ...t, ...patch };
}

/* ------------------------------------------------------------------ managing open trades */

export async function manageOpen(cfg: any, day: string, min: number, closeMin: number, opt: { intrabar?: boolean } = {}): Promise<{ closed: number }> {
  const open: any[] = (await db("winston_trades?status=eq.open&select=*&order=id.asc")) || [];
  if (!open.length) return { closed: 0 };
  let rules: Rule[] = []; try { rules = await getRules(); } catch { /* no rules = no coach exit */ }
  const w22 = ruleOn(rules, "W22");
  const flatMin = Math.min(num(cfg.flat_min) || 950, closeMin - 10);
  let closed = 0;
  let bars: Record<string, Bar[]> = {};
  try { bars = await bars10(open.map((t) => String(t.ticker)), day); } catch (e) { await wlog("bars_error", { msg: String((e as Error).message).slice(0, 160) }); }
  for (const t of open) {
    t.plan = { ...(t.plan || {}), flat_min: flatMin };
    const entered = Date.parse(t.opened_at);
    const ev = bars[String(t.ticker).toUpperCase()] ? evalBars({ dir: t.plan.dir, wrong_if_level: num(t.plan.wrong_if_level), target_level: num(t.plan.target_level) }, bars[String(t.ticker).toUpperCase()], entered) : null;
    let reason: string | null = null, flags: string[] = [];
    const tb = bars[String(t.ticker).toUpperCase()] || null;
    if (ev) { reason = ev.reason; flags = ev.flags; }
    else if (opt.intrabar && tb && intrabarTarget({ dir: t.plan.dir, target_level: num(t.plan.target_level) }, tb, entered)) { reason = "target"; flags = ["intrabar_touch"]; }
    else if (min >= flatMin || t.day !== day) reason = "flat_close";
    else if (w22 && tb && coachExit({ dir: t.plan.dir }, tb, entered)) { reason = "coach_exit"; flags = ["W22_indecision_then_no_new_high"]; }   // v3.36
    else if (nowMs() >= entered + num(t.plan.time_exit_min || 180) * 60e3) reason = "time";
    if (reason) { await closeTrade(t, reason, flags, tb); closed++; continue; }
    try {                                                    // still open: remember the latest mark for the app
      const q = await freshOptionQuote(t.option_id);
      const under = (bars[String(t.ticker).toUpperCase()] || []).slice(-1)[0]?.c;
      if (q) await db(`winston_trades?id=eq.${t.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ plan: { ...t.plan, last_mark: { bid: q.bid, ask: q.ask, under: under || null, at: new Date(nowMs()).toISOString() } } }) });
    } catch { /* a missed mark is fine */ }
  }
  return { closed };
}

/* ------------------------------------------------------------------ the 10-minute check */

async function coachPostsToday(day: string): Promise<any[]> {
  return (await db(`otto_jason?day=eq.${day}&select=id,posted_label,kind,ticker,direction,entry,level,option,words,late&order=id.asc&limit=60`)) || [];
}
async function econBlackout(day: string, min: number, windowMin: number): Promise<string | null> {
  try {
    const j = await md("tv", "mcp-tv-get-economic-calendar", { date_from: day, date_to: day + "T23:59:59Z", min_importance: 1, countries: "US" });
    for (const e of j?.result || []) {
      if (!/CPI|consumer price|nonfarm|payroll|FOMC|fed (interest|rate)|interest rate decision|employment (change|report)/i.test(String(e.title || ""))) continue;
      const at = Date.parse(e.date); if (!isFinite(at)) continue;
      const em = etParts(new Date(at)).min;
      if (Math.abs(em - min) <= windowMin) return `${e.title} at ${fmtMin(em)} ET`;
    }
  } catch { /* no calendar = no blackout known */ }
  return null;
}

export async function tick(opts: { force?: boolean } = {}): Promise<any> {
  const cfg = await getConfig();
  const c = marketClock();
  if (!opts.force && !(c.status === "open" && c.min >= 571 && c.min <= c.closeMin - 1)) return { ok: true, skipped: "market not open", clock: c.status };
  if (!(await takeLock("tick_lock", 4 * 60e3))) return { ok: true, skipped: "another tick is running" };
  try {
    const day = c.date;
    await beat("tick");
    await db("winston_days?on_conflict=day", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ day, start_balance: cfg.paper_balance }) });
    const mgd = await manageOpen(cfg, day, c.min, c.closeMin);                      // 1. exits first, always (even when paused or locked)
    if (!cfg.enabled) return { ok: true, paused: true, closed: mgd.closed };
    const L = await getLimits(cfg.limits_override), rules = await getRules();
    const eq = await equityState(cfg, day);
    const lim = limitsState(L, eq);
    if (lim.locked) { await db(`winston_days?day=eq.${day}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ kill: { locked: true, ...lim.locked, at: new Date(nowMs()).toISOString() } }) }); }
    const ctx: Ctx = { cfg, L, rules, day, min: c.min, eq, lim, posts: [], index: null, vwaps: {} };

    // 2. what changed since the last look?
    const st = (await getSetting("tick_state")) || {};
    const lastDay = st.day === day;
    const posts = await coachPostsToday(day);
    ctx.posts = posts;
    const lastId = lastDay ? num(st.last_jason_id) : 0;
    const newPosts = posts.filter((p) => num(p.id) > lastId);
    const universe = [...new Set<string>([...posts.map((p) => String(p.ticker || "").toUpperCase()).filter(Boolean), ...cfg.universe])].slice(0, 24);
    const quotes = await equityQuotes(universe);
    const lastSnap: Record<string, number> = lastDay ? (st.snap || {}) : {};
    const movers = universe.filter((s) => quotes[s] && lastSnap[s] && Math.abs(quotes[s].spot - lastSnap[s]) / lastSnap[s] >= 0.006);
    const heartbeat = !lastDay || nowMs() - num(st.last_ai_ms) >= 60 * 60e3;
    const changed = newPosts.length > 0 || movers.length > 0 || heartbeat;
    const snap: Record<string, number> = {}; for (const s of universe) if (quotes[s]) snap[s] = quotes[s].spot;
    if (!changed) { await putSetting("tick_state", { ...st, day, snap: lastDay ? { ...lastSnap } : snap, last_jason_id: Math.max(lastId, ...posts.map((p) => num(p.id)), 0) }); return { ok: true, skipped: "nothing changed", closed: mgd.closed }; }

    // 3. coach posts that count as actionable ideas (a call, or a level with a direction)
    const actionable = newPosts.filter((p) => p.ticker && (p.kind === "call" || (p.kind === "level" && p.direction)));
    if (lim.locked) {                                                               // locked: log every actionable coach post as blocked, no AI spend
      for (const p of actionable) await recordIdea(day, { ticker: p.ticker, side: p.direction === "short" ? "put" : "call", source: "coach:" + p.id }, "blocked", "Kill switch: " + lim.locked.why);
      await putSetting("tick_state", { day, snap, last_jason_id: Math.max(lastId, ...posts.map((p) => num(p.id)), 0), last_ai_ms: num(st.last_ai_ms) });
      return { ok: true, locked: lim.locked.why, closed: mgd.closed };
    }
    if (c.min > num(cfg.last_entry_min)) { await putSetting("tick_state", { ...st, day, snap, last_jason_id: Math.max(lastId, ...posts.map((p) => num(p.id)), 0) }); return { ok: true, skipped: "past the last-entry time", closed: mgd.closed }; }

    // 4. snapshot for the AI
    const focus = [...new Set<string>([...actionable.map((p) => String(p.ticker).toUpperCase()), ...movers, ...cfg.universe.slice(0, 6)])].filter((s) => quotes[s]).slice(0, 10);
    let bars: Record<string, Bar[]> = {};
    try { bars = await bars10([...new Set(["SPY", ...focus])], day); } catch { /* the AI is told there are no bars */ }
    const nowT = nowMs();
    const snapshot = focus.map((s) => ({ ticker: s, price: quotes[s].spot, prev_close: quotes[s].prev, day: barsSummary(bars[s] || [], nowT) }));
    ctx.index = indexRead(bars.SPY || [], nowT);                                                       // v3.36 W23
    ctx.vwaps = Object.fromEntries(snapshot.map((x) => [x.ticker, num(x.day?.vwap)]).filter(([, v]) => num(v) > 0));   // v3.36 fact check
    const dayRow = ((await db(`winston_days?day=eq.${day}&select=routine,sentiment`)) || [])[0] || {};
    const todays = (await db(`winston_ideas?day=eq.${day}&select=ticker,side,status,reason,source&order=id.asc&limit=60`)) || [];
    const brain = await brainExcerpt();
    const ruleText = rules.map((r) => `${r.id} [${r.active ? "ON" : "OFF"}; ${r.source}] ${r.title}: ${r.body}`).join("\n");
    const user = `It is ${fmtMin(c.min)} ET on ${day}. Winston's paper balance is $${eq.equity} ($${eq.cash} cash). Size cap $${isFinite(lim.capUsd) ? lim.capUsd : "none"} per contract; max planned loss per trade $${isFinite(lim.maxLossUsd) ? lim.maxLossUsd : "none"}. Open positions: ${eq.open.length ? eq.open.map((t: any) => t.ticker).join(", ") : "none"}.
RULES:\n${ruleText}
COACH POSTS TODAY (his exact words; NEW = since your last look):\n${posts.length ? posts.map((p) => `[id ${p.id}${num(p.id) > lastId ? " NEW" : ""}] ${p.posted_label || ""} ${p.kind}${p.ticker ? " " + p.ticker : ""}${p.direction ? " " + p.direction : ""}${p.level ? " level " + p.level : ""}${p.entry ? " entry " + p.entry : ""}${p.late ? " (late)" : ""}: "${String(p.words || "").slice(0, 300)}"`).join("\n") : "none yet"}
BRAIN (the coach's calls, summarised):\n${brain || "unavailable"}
TODAY'S ROUTINE NOTES: ${JSON.stringify(dayRow.routine || null).slice(0, 2500)}\nSENTIMENT: ${JSON.stringify(dayRow.sentiment || null).slice(0, 1200)}
ALREADY DECIDED TODAY: ${JSON.stringify(todays).slice(0, 3000)}
CHART SNAPSHOT (10-minute bars, ET times; each bar is [time, open, high, low, close]): ${JSON.stringify(snapshot)}
SPY READ (W23): ${ctx.index ? `last ${ctx.index.last} vs VWAP ${ctx.index.vwap} — ${ctx.index.above_vwap ? "above" : "below"} VWAP, closes ${ctx.index.rising ? "rising" : ctx.index.falling ? "falling" : "mixed"}` : "unavailable"}
READ THE COACH'S POST KINDS: a "result" post (sold, trimmed, took profit, stopped) is his EXIT on that name, not a fresh entry — a tail like "and play the bounce" after a sale is not a new buy unless he gives a new level. A "level" post names where he SELLS TO or buys from; do not enter a call within $0.50 of a level he sells into (W21). Let price come to you (W20): no re-entry on a name above where the last trade got out.
Decide now. Act on NEW coach posts (take or pass, with a reason) and on any idea of your own that the chart and brain support.`;
    let out: any, usage = { input: 0, output: 0 };
    try { const r = await aiJson(SYSTEM, user, DECIDE_TOOL); out = r.out; usage = r.usage; } catch (e) { await wlog("ai_error", { msg: String((e as Error).message).slice(0, 200) }); return { ok: false, error: "AI: " + String((e as Error).message).slice(0, 120), closed: mgd.closed }; }
    await addAiCost(day, usage).catch(() => {});

    // 5. validate and act (code decides; the AI only proposes)
    const postById = new Map(posts.map((p) => [String(p.id), p]));
    const blackout = ruleOn(rules, "W14") ? await econBlackout(day, c.min, num(ruleParams(rules, "W14").window_min) || 15) : null;
    const handled = new Set<string>();
    const results: any[] = [];
    for (const raw of (Array.isArray(out?.decisions) ? out.decisions : []).slice(0, 3)) {
      const d: Decision = { ticker: String(raw.ticker || ""), side: raw.side, source: String(raw.source || "own"), thesis: String(raw.thesis || ""), wrong_if_level: num(raw.wrong_if_level),
        target_level: num(raw.target_level), time_exit_min: raw.time_exit_min != null ? num(raw.time_exit_min) : undefined, experiment: raw.experiment || null,
        cites: Array.isArray(raw.cites) ? raw.cites.slice(0, 8) : [], rule_ids: (Array.isArray(raw.rule_ids) ? raw.rule_ids : []).map(String).filter((id: string) => rules.some((r) => r.id === id)) };
      d.ticker = d.ticker.toUpperCase().replace(/[^A-Z.]/g, "");
      let coach = false;
      if (d.source.startsWith("coach:")) {
        const p = postById.get(d.source.slice(6));
        if (!p) { await recordIdea(day, d, "passed", "Cited a coach post that does not exist today — rejected"); results.push({ t: d.ticker, ok: false }); continue; }
        coach = true; handled.add(String(p.id));
        if (p.ticker && String(p.ticker).toUpperCase() !== d.ticker) { await recordIdea(day, d, "passed", "Coach post is about " + p.ticker + ", not " + d.ticker); continue; }
      } else d.source = "own";
      const spot = quotes[d.ticker]?.spot;
      if (!spot) { await recordIdea(day, d, "passed", "No live price for " + d.ticker); continue; }
      const r = await tryOpen(ctx, d, spot, coach, blackout);
      results.push({ t: d.ticker, ok: r.opened, why: r.why });
    }
    for (const p of (Array.isArray(out?.passes) ? out.passes : []).slice(0, 12)) {
      const src = String(p.source || "own");
      if (src.startsWith("coach:")) handled.add(src.slice(6));
      await recordIdea(day, { ticker: p.ticker, source: src.startsWith("coach:") && postById.has(src.slice(6)) ? src : "own", rule_ids: (p.rule_ids || []).filter((id: string) => rules.some((r) => r.id === id)), cites: Array.isArray(p.cites) ? p.cites.slice(0, 6) : [] },
        "passed", String(p.reason || "no reason given"));
    }
    for (const p of actionable) if (!handled.has(String(p.id))) await recordIdea(day, { ticker: p.ticker, side: p.direction === "short" ? "put" : "call", source: "coach:" + p.id }, "passed", "Winston gave no decision on this post");
    await putSetting("tick_state", { day, snap, last_jason_id: Math.max(lastId, ...posts.map((p) => num(p.id)), 0), last_ai_ms: nowMs() });
    return { ok: true, closed: mgd.closed, results, notes: out?.notes || null };
  } finally { await freeLock("tick_lock"); }
}

/* ------------------------------------------------------------------ v3.32: the one-minute watch (only while a trade is open) */

async function beat(kind: string, extra: any = {}) {
  await putSetting("heartbeat", { at: new Date(nowMs()).toISOString(), kind, ...extra }).catch(() => {});
}
// Runs every minute from cron but does nothing unless a trade is open. No AI, no new entries: it only refreshes the mark and applies the same exit rules,
// plus the intrabar target touch. It shares the tick lock so it never runs at the same moment as a tick or the flatten.
export async function watch(opts: { force?: boolean } = {}): Promise<any> {
  const c = marketClock();
  if (!opts.force && !(c.status === "open" && c.min >= 571 && c.min <= c.closeMin - 1)) return { ok: true, skipped: "market not open" };
  const open: any[] = (await db("winston_trades?status=eq.open&select=id&limit=1")) || [];
  if (!open.length) { await beat("watch", { open: 0 }); return { ok: true, skipped: "no open trade" }; }
  if (!(await takeLock("tick_lock", 90e3))) return { ok: true, skipped: "a tick is running" };
  try {
    const cfg = await getConfig();
    const mgd = await manageOpen(cfg, c.date, c.min, c.closeMin, { intrabar: true });
    await beat("watch", { open: 1, closed: mgd.closed });
    return { ok: true, closed: mgd.closed };
  } finally { await freeLock("tick_lock"); }
}

// Read-only, for the app: a fresh quote and the latest 10-minute bars for each open trade. Writes nothing.
export async function liveForApp() {
  const c = marketClock();
  const open: any[] = (await db("winston_trades?status=eq.open&select=id,ticker,option_id,entry_ask,qty,opened_at,plan&order=id.asc&limit=3")) || [];
  const out: any[] = [];
  let bars: Record<string, Bar[]> = {};
  try { if (open.length) bars = await bars10(open.map((t) => String(t.ticker)), c.date); } catch { /* chart unavailable */ }
  for (const t of open) {
    let q: Q | null = null;
    try { q = await freshOptionQuote(t.option_id); } catch { /* estimate unavailable */ }
    const b = (bars[String(t.ticker).toUpperCase()] || []).slice(-40);
    const bid = q && q.bid > 0 ? q.bid : null;
    out.push({ id: t.id, ticker: t.ticker, bid: bid, ask: q?.ask ?? null, under: b.length ? b[b.length - 1].c : null,
      est_pnl: bid != null ? round2((bid - num(t.entry_ask)) * 100 * (t.qty || 1)) : null, at: new Date(nowMs()).toISOString(), bars: b.map((x) => [x.t, x.o, x.h, x.l, x.c]) });
  }
  return { ok: true, clock: { day: c.date, status: c.status, min: c.min }, live: out };
}

/* ------------------------------------------------------------------ routines, flatten, report */

const ROUTINE_TOOL = { name: "routine", description: "Write the morning plan.", input_schema: { type: "object", properties: {
  bias: { type: "string", description: "one or two sentences on the likely tone today, only from the data given" },
  events: { type: "array", items: { type: "string" }, description: "scheduled events today with ET times, only from the calendar given" },
  watch: { type: "array", maxItems: 6, items: { type: "object", properties: { ticker: { type: "string" }, why: { type: "string" }, level: { type: "string" } }, required: ["ticker", "why"] } },
  risks: { type: "array", items: { type: "string" } } }, required: ["bias", "events", "watch", "risks"] } };
const SENT_TOOL = { name: "sentiment", description: "Write the pre-open read.", input_schema: { type: "object", properties: {
  tone: { type: "string", enum: ["risk_on", "risk_off", "mixed", "unclear"] }, read: { type: "string", description: "two or three sentences, only from the data given" } }, required: ["tone", "read"] } };

export async function routine(opts: { force?: boolean } = {}) {
  const cfg = await getConfig(), c = marketClock();
  if (!c.trading && !opts.force) return { ok: true, skipped: "not a trading day" };
  if (!opts.force && !(c.min >= 510 && c.min <= 565)) return { ok: true, skipped: "outside the 8:30-9:25 window" };
  const have = ((await db(`winston_days?day=eq.${c.date}&select=routine`)) || [])[0]?.routine;
  if (have && !opts.force) return { ok: true, skipped: "already done today" };
  const data: any = { calendar: null, earnings: null, news: {}, quotes: null };
  try { data.calendar = ((await md("tv", "mcp-tv-get-economic-calendar", { date_from: c.date, date_to: c.date + "T23:59:59Z", min_importance: 1, countries: "US" }))?.result || []).slice(0, 25).map((e: any) => ({ at: fmtMin(etParts(new Date(e.date)).min), title: e.title, importance: e.importance })); } catch { /* unavailable */ }
  try { const q = await equityQuotes(cfg.universe); data.quotes = Object.fromEntries(Object.entries(q).map(([s, v]) => [s, { price: v.spot, prev_close: v.prev }])); } catch { /* unavailable */ }
  try { data.earnings = ((await md("rh", "get_earnings_calendar", { start_date: c.date, days: 2, filter: "high_market_cap" }))?.data?.results || []).slice(0, 25).map((r: any) => ({ symbol: r.symbol, date: r.report?.date, timing: r.report?.timing })); } catch { /* unavailable */ }
  const TVSYM: Record<string, string> = { SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ", NVDA: "NASDAQ:NVDA", TSLA: "NASDAQ:TSLA", AAPL: "NASDAQ:AAPL", MSFT: "NASDAQ:MSFT",
    META: "NASDAQ:META", AMZN: "NASDAQ:AMZN", GOOGL: "NASDAQ:GOOGL", AMD: "NASDAQ:AMD", PLTR: "NASDAQ:PLTR", MU: "NASDAQ:MU" };
  for (const s of [...new Set(["SPY", ...cfg.universe])].filter((x) => TVSYM[x]).slice(0, 4)) {
    try { const n = await md("tv", "mcp-tv-get-news", { symbol: TVSYM[s], limit: 4 }); data.news[s] = (n?.result || n?.headlines || n?.data || []).slice(0, 4).map((h: any) => String(h.title || "").slice(0, 140)).filter(Boolean); } catch { /* unavailable */ }
  }
  const brain = await brainExcerpt();
  const { out, usage } = await aiJson(SYSTEM, `Morning routine for ${c.date}. Use ONLY this data; if something is missing, say it is unavailable.\nDATA: ${JSON.stringify(data).slice(0, 14000)}\nBRAIN (coach calls): ${brain || "unavailable"}\nWrite the day's plan: bias, scheduled events (ET), up to 6 names to watch with why, and risks.`, ROUTINE_TOOL, 1800);
  await db("winston_days?on_conflict=day", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ day: c.date, start_balance: cfg.paper_balance, routine: { ...out, data_missing: Object.entries(data).filter(([, v]) => v == null).map(([k]) => k) }, updated_at: new Date(nowMs()).toISOString() }) });
  await addAiCost(c.date, usage).catch(() => {});
  return { ok: true, routine: out };
}
export async function sentiment(opts: { force?: boolean } = {}) {
  const cfg = await getConfig(), c = marketClock();
  if (!c.trading && !opts.force) return { ok: true, skipped: "not a trading day" };
  if (!opts.force && !(c.min >= 550 && c.min <= 569)) return { ok: true, skipped: "outside the 9:10-9:29 window" };
  const have = ((await db(`winston_days?day=eq.${c.date}&select=sentiment`)) || [])[0]?.sentiment;
  if (have && !opts.force) return { ok: true, skipped: "already done today" };
  let q: any = {}; try { q = await equityQuotes(["SPY", "QQQ", ...cfg.universe]); } catch { /* unavailable */ }
  const data = Object.fromEntries(Object.entries(q).map(([s, v]: any) => [s, { price: v.spot, prev_close: v.prev, change_pct: v.prev ? round2((v.spot - v.prev) / v.prev * 100) : null }]));
  const { out, usage } = await aiJson(SYSTEM, `Pre-open read for ${c.date}, ${fmtMin(c.min)} ET. Use ONLY this data (pre-market moves vs the previous close): ${JSON.stringify(data)}. Say the tone and why in two or three sentences.`, SENT_TOOL, 800);
  await db("winston_days?on_conflict=day", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ day: c.date, sentiment: out, updated_at: new Date(nowMs()).toISOString() }) });
  await addAiCost(c.date, usage).catch(() => {});
  return { ok: true, sentiment: out };
}

export async function flatten(opts: { force?: boolean } = {}) {
  const cfg = await getConfig(), c = marketClock();
  if (!opts.force && !(c.trading && c.min >= Math.min(num(cfg.flat_min) || 950, c.closeMin - 10) && c.min <= c.closeMin + 5)) return { ok: true, skipped: "not flatten time" };
  if (!(await takeLock("tick_lock", 3 * 60e3))) return { ok: true, skipped: "a tick is running; it will flatten" };
  try {
    const open: any[] = (await db("winston_trades?status=eq.open&select=*")) || [];
    for (const t of open) { t.plan = { ...(t.plan || {}), flat_min: Math.min(num(cfg.flat_min) || 950, c.closeMin - 10) }; await closeTrade(t, "flat_close"); }
    return { ok: true, closed: open.length };
  } finally { await freeLock("tick_lock"); }
}

export async function buildReport(day: string, cfg: any) {
  const trades: any[] = (await db("winston_trades?select=*&order=id.asc")) || [];
  const today = trades.filter((t) => t.day === day);
  const ideas: any[] = (await db(`winston_ideas?day=eq.${day}&select=*&order=id.asc`)) || [];
  const row = ((await db(`winston_days?day=eq.${day}&select=*`)) || [])[0] || {};
  const eqAll = await equityState(cfg, day);
  const stats = computeStats(trades);
  const dayStats = computeStats(today);
  const taken = today.map((t) => ({ id: t.id, label: t.label, source: t.source, experiment: t.experiment, status: t.status, opened_at: t.opened_at, closed_at: t.closed_at,
    entry: { bid: t.entry_bid, ask: t.entry_ask, fill: t.entry_fill }, exit: { bid: t.exit_bid, ask: t.exit_ask, fill: t.exit_fill }, exit_reason: t.exit_reason,
    pnl_realistic: t.pnl_realistic, pnl_mid: t.pnl_mid, spread_cost: t.spread_cost, pnl_double: t.pnl_double, r: t.r_multiple, followed_rules: t.followed_rules, broke: t.broke, flags: t.flags,
    thesis: t.plan?.thesis, wrong_if: t.plan?.wrong_if_level, target: t.plan?.target_level, stamps: t.plan?.stamps || [], excursion: t.plan?.excursion || null, mode: t.plan?.mode || "strict" }));
  const passed = ideas.filter((i) => i.status !== "taken").map((i) => ({ ticker: i.ticker, side: i.side, source: i.source, status: i.status, reason: i.reason, rule_ids: i.rule_ids }));
  // v3.36: what stopped him, counted; and what the soft gates stamped on the trades he did take (so each gate can be scored over time).
  const passedBy: Record<string, number> = {};
  for (const p of passed) { const k = String(p.reason || "").replace(/\d+(\.\d+)?/g, "#").slice(0, 70); passedBy[k] = (passedBy[k] || 0) + 1; }
  const stampStats: Record<string, { n: number; pnl: number; wins: number }> = {};
  for (const t of today) for (const f of (t.flags || []).filter((x: string) => String(x).startsWith("stamp:"))) {
    const st = stampStats[f] || (stampStats[f] = { n: 0, pnl: 0, wins: 0 }); st.n++; st.pnl = round2(st.pnl + num(t.pnl_realistic)); if (num(t.pnl_realistic) > 0) st.wins++;
  }
  const lines: string[] = [];
  lines.push(`${taken.length} trade${taken.length === 1 ? "" : "s"} taken, ${passed.length} idea${passed.length === 1 ? "" : "s"} passed or blocked.`);
  lines.push(`Today: ${dayStats.pnl_realistic >= 0 ? "+" : "-"}$${Math.abs(dayStats.pnl_realistic)} at real fills (ask in, bid out); $${dayStats.pnl_mid} at mid; $${dayStats.pnl_double} if the spread cost were doubled.`);
  const stillOpen = today.filter((t) => t.status === "open").length;
  if (stillOpen) lines.push(`WARNING: ${stillOpen} trade(s) still open at the report. They should have been flat by 3:50 PM.`);
  const report = { day, built_at: new Date(nowMs()).toISOString(), summary: lines, taken, passed, day_stats: dayStats, all_time: stats, balance: eqAll.equity, start_balance: row.start_balance ?? cfg.paper_balance,
    ai: row.ai || null, routine_done: !!row.routine, sentiment_done: !!row.sentiment, kill: row.kill || null, coach_posts_seen: ideas.filter((i) => String(i.source).startsWith("coach:")).length,
    passed_by_reason: passedBy, stamp_stats: stampStats, mode: isDataMode(cfg) ? "data" : "strict",
    balance_note: "balance = paper start + every closed trade since day one (all days), not today's P&L alone" };
  await db("winston_days?on_conflict=day", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ day, report, end_balance: eqAll.equity, updated_at: new Date(nowMs()).toISOString() }) });
  return report;
}
export async function reportJob(opts: { force?: boolean } = {}) {
  const cfg = await getConfig(), c = marketClock();
  if (!opts.force && !(c.trading && c.min >= c.closeMin + 10 && c.min <= c.closeMin + 90)) return { ok: true, skipped: "not report time" };
  return { ok: true, report: await buildReport(c.date, cfg) };
}

/* ------------------------------------------------------------------ the app's read route */

const allowedEmails = () => (Deno.env.get("OTTO_ALLOWED_EMAILS") || "ottotrader@vinecreativestudio.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export function jwtPayload(auth: string | null): any {
  try { const t = (auth || "").replace(/^Bearer\s+/i, ""); return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
}
export function deskUser(claims: any): string | null {
  const e = String(claims?.email || "").toLowerCase();
  if (!e || claims?.is_anonymous || claims?.role !== "authenticated") return null;
  return allowedEmails().includes(e) ? e : null;
}
export async function stateForApp() {
  const cfg = await getConfig(), c = marketClock(), day = c.date;
  const hb = await getSetting("heartbeat").catch(() => null);
  const [rules, trades, ideas, days, L] = await Promise.all([
    getRules(),
    db("winston_trades?select=*&order=id.desc&limit=400"),
    db("winston_ideas?select=*&order=id.desc&limit=200"),
    db("winston_days?select=day,start_balance,end_balance,report,routine,sentiment,ai,kill&order=day.desc&limit=60"),
    getLimits(),
  ]);
  const eq = await equityState(cfg, day);
  const lim = limitsState(L, eq);
  const all = (trades || []).slice().reverse();
  const curve = (days || []).slice().reverse().map((d: any) => ({ day: d.day, end: d.end_balance }));
  return { ok: true, clock: { day, status: c.status, min: c.min }, config: cfg, limits: { ...L, cap_usd: isFinite(lim.capUsd) ? lim.capUsd : null, max_loss_usd: isFinite(lim.maxLossUsd) ? lim.maxLossUsd : null, locked: lim.locked },
    equity: eq.equity, cash: eq.cash, day_pnl: eq.day_pnl, week_pnl: eq.week_pnl, open: (trades || []).filter((t: any) => t.status === "open"), trades: trades || [], ideas: ideas || [],
    heartbeat: hb || null, days: days || [], today: (days || []).find((d: any) => d.day === day) || null, stats: computeStats(all), rules, curve };
}
export async function setRule(body: any) {
  const id = String(body?.id || "");
  const rules = await getRules();
  if (!rules.some((r) => r.id === id)) throw new Error("no such rule");
  const patch: any = { updated_at: new Date(nowMs()).toISOString() };
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.params && typeof body.params === "object") {
    const cur = rules.find((r) => r.id === id)!.params || {}, np: any = { ...cur };
    for (const [k, v] of Object.entries(body.params)) if (k in cur && (v === null || Number.isFinite(Number(v)))) np[k] = v === null ? null : Number(v);
    patch.params = np;
  }
  await db(`winston_rules?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(patch) });
  await wlog("rule_set", { id, patch });
  return { ok: true };
}
export async function setEnabled(body: any) {
  const cfg = await getConfig();
  // v3.38: the same route also flips data / strict mode from the tab (Ifoma approved the mockup's "Switch to strict" button).
  if (body?.mode === "data" || body?.mode === "strict") {
    await putSetting("config", { ...cfg, mode: body.mode });
    await wlog("mode", { mode: body.mode });
    return { ok: true, mode: body.mode, enabled: cfg.enabled };
  }
  // v3.39 (Ifoma, 18 Oct): open Winston up for data — max_open 1..4 from the tab / a Desk call. Everything else stays.
  if (body?.max_open != null) {
    const n = Math.round(Number(body.max_open));
    if (!(n >= 1 && n <= 4)) throw new Error("max_open must be 1 to 4");
    await putSetting("config", { ...cfg, max_open: n });
    await wlog("config", { max_open: n });
    return { ok: true, max_open: n, enabled: cfg.enabled };
  }
  if (typeof body?.enabled !== "boolean") throw new Error("enabled must be true or false");
  await putSetting("config", { ...cfg, enabled: body.enabled });
  await wlog("enabled", { enabled: body.enabled });
  return { ok: true, enabled: body.enabled };
}

/* ------------------------------------------------------------------ HTTP */

function cronAllowed(req: Request) {
  const s = Deno.env.get("OTTO_CRON_SECRET") || "";
  return s.length >= 16 && req.headers.get("x-otto-cron") === s;
}
function background(p: Promise<unknown>) {
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p.catch((e) => console.error("winston background", e))); else p.catch((e) => console.error("winston background", e));
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
  const u = new URL(req.url);
  const fn = u.searchParams.get("fn") || "state";
  const force = u.searchParams.get("force") === "1";
  const CRON: Record<string, (o: any) => Promise<any>> = { tick, watch, routine, sentiment, flatten, report: reportJob };
  if (CRON[fn]) {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    background(CRON[fn]({ force }).then((r) => (fn === "watch" && r?.skipped ? null : wlog("cron_" + fn, r))).catch((e) => wlog("cron_" + fn + "_error", { msg: String((e as Error).message).slice(0, 200) })));
    return json({ ok: true, started: fn }, 202);
  }
  const claims = jwtPayload(req.headers.get("authorization"));
  if (!deskUser(claims)) return json({ ok: false, error: "sign in with the Otto email" }, 401);
  try {
    if (fn === "state") return json(await stateForApp());
    if (fn === "live") return json(await liveForApp());
    if (fn === "rule_set" && req.method === "POST") return json(await setRule(await req.json().catch(() => ({}))));
    if (fn === "config_set" && req.method === "POST") return json(await setEnabled(await req.json().catch(() => ({}))));
    return json({ ok: false, error: "unknown route" }, 404);
  } catch (e) { return json({ ok: false, error: String((e as Error).message || e).slice(0, 300) }, 500); }
}

if (!T) Deno.serve(handle);
