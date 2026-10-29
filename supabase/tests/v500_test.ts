// v5.0 ROOMS (29 Oct 2026): every signed-in person gets a walled-off room — their own cards, Desk log, connections, Anthropic key.
// Nothing touches the network: Supabase is faked (an in-memory table per name, owner-aware), the Deno.serve handler is captured.
// Run: deno test -A --no-check supabase/tests/v500_test.ts
const HOUSE = "ottotrader@vinecreativestudio.com", JOSH = "josh@example.com", BABY = "babyj@example.com";
Deno.env.set("OTTO_TOKEN_KEY", "test-token-key-0123456789abcdef");
Deno.env.set("OTTO_ALLOWED_EMAILS", HOUSE);
Deno.env.set("ANTHROPIC_KEY", "sk-ant-house-key-for-tests");
Deno.env.set("SUPABASE_URL", "https://x.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");

const T: Record<string, any[]> = {};
const LOG: { m: string; path: string; body: any }[] = [];
let ID = 0;
function parse(path: string) { const [table, q = ""] = path.split("?"); return { table, params: new URLSearchParams(q) }; }
function matches(row: any, params: URLSearchParams) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    const have = k === "owner" ? (row.owner ?? HOUSE) : row[k];          // a row without owner is the house's (the SQL DEFAULT)
    if (v.startsWith("eq.")) { if (String(have) !== decodeURIComponent(v.slice(3))) return false; }
    else if (v.startsWith("in.(")) { if (!v.slice(4, -1).split(",").includes(String(have))) return false; }
    else if (v.startsWith("gte.")) { if (!(String(have) >= decodeURIComponent(v.slice(4)))) return false; }
  }
  return true;
}
async function fakeDb(path: string, init: RequestInit = {}) {
  const { table, params } = parse(path);
  const m = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  LOG.push({ m, path, body });
  const rows = T[table] ||= [];
  if (m === "GET") return rows.filter((r) => matches(r, params)).map((r) => ({ ...r }));
  if (m === "POST") {
    const keys = (params.get("on_conflict") || "").split(",").filter(Boolean);
    const out: any[] = [];
    for (const b of [].concat(body) as any[]) {
      const i = keys.length ? rows.findIndex((r) => keys.every((k) => String(r[k]) === String(b[k]))) : -1;
      if (i >= 0) { rows[i] = { ...rows[i], ...b }; out.push({ ...rows[i] }); }
      else { ++ID; const row = { id: b.id || (table === "otto_actions" ? crypto.randomUUID() : `id-${ID}`), created_at: new Date().toISOString(), ...b }; rows.push(row); out.push({ ...row }); }
    }
    return out;
  }
  if (m === "PATCH") { const hit = rows.filter((r) => matches(r, params)); hit.forEach((r) => Object.assign(r, body)); return hit.map((r) => ({ ...r })); }
  if (m === "DELETE") { const keep = rows.filter((r) => !matches(r, params)); const gone = rows.length - keep.length; T[table] = keep; return gone ? [{}] : []; }
  return [];
}
const CLAUDE_BODIES: any[] = [], MCP: string[] = [];
(globalThis as any).__OTTO_TEST__ = {
  db: fakeDb,
  call: (_s: string, tool: string, args: any) => {
    MCP.push(tool);
    const J = (o: any) => Promise.resolve({ content: [{ type: "text", text: JSON.stringify(o) }] });
    if (tool === "get_equity_quotes") return J({ data: { results: (args?.symbols || []).map((s: string) => ({ quote: { symbol: s, last_trade_price: "780.00" } })) } });
    if (tool === "get_accounts") return J({ data: { accounts: [{ account_number: "111222333", agentic_allowed: true }] } });
    if (tool === "get_portfolio") return J({ data: { total_value: "1000" } });
    if (tool === "get_option_quotes") return J({ data: { results: [{ quote: { ask_price: "3.60", delta: "0.45" } }] } });
    if (tool === "get_option_instruments") return J({ data: { instruments: [{ id: "opt-spy-781c", expiration_date: "2026-10-09", chain_symbol: "SPY" }] } });
    if (tool === "get_option_positions") return J({ data: { positions: [] } });
    if (tool === "get_equity_historicals") return Promise.reject(new Error("no bars in this test"));
    return Promise.reject(new Error("unexpected tool " + tool));
  },
  claude: (body: any) => { CLAUDE_BODIES.push(body); return Promise.reject(new Error("no Claude in tests")); },
  notify: () => {}, extract: () => [],
};
const FETCHES: string[] = [];
(globalThis as any).fetch = (u: any, init: any = {}) => {
  const s = String(u); FETCHES.push(s);
  if (s.startsWith("https://api.anthropic.com/v1/models")) {
    const key = init.headers?.["x-api-key"] || "";
    return Promise.resolve(new Response(key === "sk-ant-good-key-abcdefghijklmnop" ? JSON.stringify({ data: [] }) : JSON.stringify({ error: "bad" }), { status: key === "sk-ant-good-key-abcdefghijklmnop" ? 200 : 401 }));
  }
  if (s.includes("/auth/v1/invite")) return Promise.resolve(new Response(JSON.stringify({ id: "u-new" }), { status: 200 }));
  return Promise.reject(new Error("network disabled in tests: " + s.slice(0, 80)));
};
let HANDLER: any = null;
(Deno as any).serve = (h: any) => { HANDLER = h; return { finished: Promise.resolve() }; };
const M: any = await import("../otto-proxy.ts");

const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (email: string) => b64({ alg: "none" }) + "." + b64({ role: "authenticated", sub: "u-" + email, email }) + ".x";
const route = async (fn: string, email: string, body: any = {}, method = "POST") =>
  await HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=" + fn, { method, headers: { authorization: "Bearer " + jwt(email), "content-type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
const rj = async (fn: string, email: string, body: any = {}, method = "POST") => { const r = await route(fn, email, body, method); return { status: r.status, ...(await r.json()) }; };
function assert(c: unknown, msg: string) { if (!c) throw new Error("ASSERT: " + msg); }
const reset = () => {
  for (const k of Object.keys(T)) delete T[k];
  LOG.length = 0; FETCHES.length = 0; CLAUDE_BODIES.length = 0; MCP.length = 0; ID = 0;
  T.otto_settings = [{ key: "limits", value: { size_cap_on: false, kill_on: false, live_coach_call: true, live_coach_level: true, live_jarvis: true } }];
  M.clearCacheForTest?.();
  T.otto_users = [
    { email: HOUSE, name: "Otto (house)", role: "owner", status: "active" },
    { email: JOSH, name: "Josh", role: "member", status: "active" },
    { email: BABY, name: "Baby J", role: "member", status: "invited" },
    { email: "gone@example.com", name: "Gone", role: "member", status: "off" },
  ];
};
const inRoom = <T>(email: string, f: () => Promise<T>) => M.roomRunForTest(email, f);
const watchCard = () => ({ title: "Add MU to the watchlist", summary: "a non-opening card", calls: [{ service: "tv", tool: "mcp-watchlist-add-to-watchlist", args: { symbols: ["NASDAQ:MU"] } }] });

Deno.test("v5.0 owner(): HOUSE outside any room; the room's email inside; nested awaits keep it", async () => {
  reset();
  assert(M.ownerForTest() === HOUSE, "default is the house");
  const seen = await inRoom(JOSH, async () => { await new Promise((r) => setTimeout(r, 2)); return M.ownerForTest(); });
  assert(seen === JOSH, "inside the room after an await: " + seen);
  assert(M.ownerForTest() === HOUSE, "back to the house after the run");
});

Deno.test("v5.0 (a) a member's card insert carries owner; a list query filters by owner; the house's list never shows it", async () => {
  reset();
  const card: any = await inRoom(JOSH, () => M.proposeAction(watchCard(), JOSH, { manual: true }));
  assert(card && card.id, "card made: " + JSON.stringify(card).slice(0, 120));
  const ins = LOG.find((l) => l.m === "POST" && l.path === "otto_actions");
  assert(ins && ins.body.owner === JOSH, "insert carries owner: " + JSON.stringify(ins?.body?.owner));
  const house: any = await inRoom(HOUSE, () => M.proposeAction(watchCard(), HOUSE, { manual: true }));
  assert(house.id !== card.id && T.otto_actions.length === 2, "two cards in the table");
  // a list route (the Scoreboard) asks for the room's rows only
  LOG.length = 0;
  await rj("score", JOSH, {}, "GET");
  const lists = LOG.filter((l) => l.m === "GET" && l.path.startsWith("otto_actions?"));
  assert(lists.length > 0 && lists.every((l) => l.path.startsWith("otto_actions?owner=eq." + encodeURIComponent(JOSH) + "&")), "list queries carry owner=eq.: " + lists.map((l) => l.path).join(" | "));
  const mine = await inRoom(JOSH, () => fakeDb("otto_actions?owner=eq." + encodeURIComponent(JOSH) + "&select=id&status=eq.pending"));
  const theirs = await inRoom(HOUSE, () => fakeDb("otto_actions?owner=eq." + encodeURIComponent(HOUSE) + "&select=id&status=eq.pending"));
  assert(mine.length === 1 && mine[0].id === card.id, "josh sees only his card");
  assert(theirs.length === 1 && theirs[0].id === house.id, "the house sees only its card");
  // the real route: desk_log for Josh asks for Josh's rows only
  LOG.length = 0;
  const r = await rj("desk_log", JOSH, {}, "GET");
  assert(r.ok === true, "desk_log ok: " + JSON.stringify(r).slice(0, 200));
  const deskReads = LOG.filter((l) => l.m === "GET" && l.path.startsWith("otto_desk?"));
  assert(deskReads.length >= 1 && deskReads.every((l) => l.path.includes("owner=eq." + encodeURIComponent(JOSH))), "desk log reads are Josh's: " + deskReads.map((l) => l.path).join(" | "));
});

Deno.test("v5.0 (b) accessToken: owner A never gets owner B's token; cron (no room) gets the house's", async () => {
  reset();
  const tok = async (access: string) => await M.sealForTest({ access_token: access, refresh_token: "r", expires_at: Date.now() + 3600e3 });
  T.otto_conn = [
    { owner: HOUSE, service: "rh", client_id: "c1", tokens: await tok("house-rh-token") },
    { owner: JOSH, service: "rh", client_id: "c2", tokens: await tok("josh-rh-token") },
  ];
  const josh = await inRoom(JOSH, () => M.accessTokenForTest("rh"));
  const house = await inRoom(HOUSE, () => M.accessTokenForTest("rh"));
  const cron = await M.accessTokenForTest("rh");
  assert(josh === "josh-rh-token", "josh: " + josh);
  assert(house === "house-rh-token" && cron === "house-rh-token", "house + cron: " + house + " " + cron);
  // the cache is per room too: Josh again (cached) is still Josh's
  const again = await inRoom(JOSH, () => M.accessTokenForTest("rh"));
  assert(again === "josh-rh-token", "cached per room");
  // Baby J has no row → not connected, never someone else's
  let err = "";
  try { await inRoom(BABY, () => M.accessTokenForTest("rh")); } catch (e) { err = (e as Error).message; }
  assert(/not connected/.test(err), "baby j: " + err);
  // conn_status over the route is the room's rows only
  const cs = await rj("conn_status", JOSH, {}, "GET");
  assert(cs.ok && cs.conn.length === 1 && cs.conn[0].service === "rh", "conn_status: " + JSON.stringify(cs.conn));
});

Deno.test("v5.0 (c) deskUserAsync: allow-list = owner; active member = member; invited → active on first entry; off and unknown refused", async () => {
  reset();
  const claims = (email: string, anon = false) => ({ email, is_anonymous: anon });
  const o = await M.deskUserAsyncForTest(claims(HOUSE));
  assert(o && o.email === HOUSE && o.role === "owner", "house is owner: " + JSON.stringify(o));
  const j = await M.deskUserAsyncForTest(claims("Josh@Example.com"));
  assert(j && j.email === JOSH && j.role === "member", "josh is a member (lower-cased): " + JSON.stringify(j));
  const b = await M.deskUserAsyncForTest(claims(BABY));
  assert(b && b.role === "member", "invited gets in");
  await new Promise((r) => setTimeout(r, 5));
  const row = T.otto_users.find((u) => u.email === BABY);
  assert(row.status === "active" && row.first_seen && row.last_seen, "first entry activates: " + JSON.stringify(row));
  assert((await M.deskUserAsyncForTest(claims("gone@example.com"))) === null, "off is refused");
  assert((await M.deskUserAsyncForTest(claims("stranger@example.com"))) === null, "unknown is refused");
  assert((await M.deskUserAsyncForTest(claims(JOSH, true))) === null, "anonymous is refused");
  // over the route: a stranger is locked out, an off user too, Josh is in with role + house flags
  const s = await rj("whoami", "stranger@example.com", {}, "GET");
  assert(s.ok && s.desk === false, "stranger whoami desk=false");
  const l = await rj("panel", "gone@example.com", {}, "GET");
  assert(l.status === 403 && l.locked === true, "off user locked: " + JSON.stringify(l));
  const w = await rj("whoami", JOSH, {}, "GET");
  assert(w.desk === true && w.role === "member" && w.house === false && w.has_key === false && w.model === "claude-sonnet-4-6" && w.name === "Josh", "josh whoami: " + JSON.stringify(w));
  const h = await rj("whoami", HOUSE, {}, "GET");
  assert(h.desk === true && h.role === "owner" && h.house === true && h.has_key === true, "house whoami: " + JSON.stringify(h));
});

Deno.test("v5.0 (d) roomKey: the house gets the env key; a member without a key gets NoKey; with a key, their own + their model", async () => {
  reset();
  const h = await inRoom(HOUSE, () => M.roomKeyForTest());
  assert(h.key === "sk-ant-house-key-for-tests" && h.source === "house" && h.model === "claude-sonnet-4-6", "house: " + JSON.stringify({ ...h, key: "…" }));
  let err: any = null;
  try { await inRoom(JOSH, () => M.roomKeyForTest()); } catch (e) { err = e; }
  assert(err instanceof M.NoKeyForTest && /Settings → Your AI key/.test(err.message), "josh has no key: " + err?.message);
  // the Desk route says so plainly (no_key) instead of a 502
  const d = await rj("desk", JOSH, { messages: [{ role: "user", content: "hi" }] });
  assert(d.status === 400 && d.no_key === true && d.ok === false, "desk no_key: " + JSON.stringify(d));
  // key_set with a good key seals it; the key itself is never in the response or the table in the clear
  const ks = await rj("key_set", JOSH, { key: "sk-ant-good-key-abcdefghijklmnop" });
  assert(ks.ok === true && ks.key_last4 === "mnop" && !JSON.stringify(ks).includes("good-key"), "key_set: " + JSON.stringify(ks));
  const row = T.otto_users.find((u) => u.email === JOSH);
  assert(row.anthropic_key && !row.anthropic_key.includes("good-key") && row.key_last4 === "mnop" && row.key_ok_at, "sealed at rest");
  const ms = await rj("model_set", JOSH, { model: "claude-opus-5-5" });
  assert(ms.ok === true && ms.model === "claude-opus-5-5", "model_set");
  const bad = await rj("model_set", JOSH, { model: "gpt-9" });
  assert(bad.ok === false, "model not on the list is refused");
  const k = await inRoom(JOSH, () => M.roomKeyForTest());
  assert(k.key === "sk-ant-good-key-abcdefghijklmnop" && k.source === "room" && k.model === "claude-opus-5-5", "josh's own key + model");
  // a bad key is refused by Anthropic → nothing stored
  const kb = await rj("key_set", BABY, { key: "sk-ant-bad-key-abcdefghijklmnop" });
  assert(kb.ok === false && /rejected/.test(kb.error) && !T.otto_users.find((u) => u.email === BABY).anthropic_key, "bad key: " + JSON.stringify(kb));
  // key_clear
  const kc = await rj("key_clear", JOSH, {});
  assert(kc.ok === true && T.otto_users.find((u) => u.email === JOSH).anthropic_key === null, "cleared");
  // me: the fields the Settings page needs, never the key
  const me = await rj("me", JOSH, {}, "GET");
  assert(me.ok && me.role === "member" && me.has_key === false && Array.isArray(me.allowed_models) && me.allowed_models.length === 4 && Array.isArray(me.conn) && !("anthropic_key" in me), "me: " + JSON.stringify(me).slice(0, 300));
});

Deno.test("v5.0 (e) invite / users / user_off are admin-only; an invite writes the row and calls Supabase auth; off users are refused", async () => {
  reset();
  const no = await rj("invite", JOSH, { email: "new@example.com", name: "New" });
  assert(no.status === 403 && /admin/.test(no.error), "member can't invite: " + JSON.stringify(no));
  assert((await rj("users", JOSH, {}, "GET")).status === 403, "member can't list users");
  assert((await rj("user_off", JOSH, { email: BABY })).status === 403, "member can't switch anyone off");
  const inv = await rj("invite", HOUSE, { email: "New@Example.com", name: "New Person" });
  assert(inv.ok === true && inv.email === "new@example.com" && inv.status === "invited" && inv.auth === 200, "invite: " + JSON.stringify(inv));
  const row = T.otto_users.find((u) => u.email === "new@example.com");
  assert(row && row.status === "invited" && row.invited_by === HOUSE && row.name === "New Person" && row.invited_at, "row: " + JSON.stringify(row));
  const call = FETCHES.find((s) => s.includes("/auth/v1/invite"));
  assert(call && call.startsWith("https://x.supabase.co/auth/v1/invite?redirect_to=") && /vinespaces\.github\.io/.test(decodeURIComponent(call)), "auth invite call: " + call);
  const us = await rj("users", HOUSE, {}, "GET");
  assert(us.ok && us.users.length === 5 && us.users.every((u: any) => !("anthropic_key" in u) && "has_key" in u && Array.isArray(u.conn)), "users list without keys: " + JSON.stringify(us).slice(0, 200));
  const off = await rj("user_off", HOUSE, { email: "new@example.com" });
  assert(off.ok === true && off.status === "off" && T.otto_users.find((u) => u.email === "new@example.com").status === "off", "off");
  assert((await rj("panel", "new@example.com", {}, "GET")).status === 403, "an off user is refused at the door");
  assert((await rj("user_off", HOUSE, { email: HOUSE })).ok === false, "the house can't switch itself off");
});

Deno.test("v5.0 saveTokens/oauth: the connection row carries the room and upserts on owner,service; a state from another room is refused", async () => {
  reset();
  T.otto_oauth = [{ state: "rh.abc", service: "rh", client_id: "c9", verifier: await M.sealForTest("v"), started_by: HOUSE, owner: HOUSE, created_at: new Date().toISOString() }];
  const r = await rj("oauth_finish", JOSH, { code: "x", state: "rh.abc" });
  assert(r.ok === false && /another login/.test(r.error), "josh can't finish the house's sign-in: " + JSON.stringify(r));
  assert(T.otto_oauth.length === 0, "the state row is one-shot either way");
  const d = await rj("disconnect", JOSH, { service: "rh" });
  assert(d.ok === true, "disconnect ok");
  const del = LOG.find((l) => l.m === "DELETE" && l.path.startsWith("otto_conn?"));
  assert(del && del.path.includes("owner=eq." + encodeURIComponent(JOSH)) && del.path.includes("service=eq.rh"), "disconnect scoped: " + del?.path);
});

const spyCard = () => ({
  title: "Buy 1 SPY 781C 10/9 @ $3.50", summary: "test",
  calls: [{ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: "opt-spy-781c", side: "buy", position_effect: "open" }], quantity: "1", type: "limit", price: "3.50", time_in_force: "gfd" } }],
  plan: { tv_symbol: "AMEX:SPY", direction: "up", setup: "trend continuation", tp1: 784.5, stop: 778.6, stop_option: 2.0, expires: "2026-10-09", entry_underlying: 780 },
});
const isWrite = (t: string) => /^(place|cancel)_/.test(t);

Deno.test("v5.0 paper-only (a): a member's idea is a PRACTICE card (even the manual ticket); Approve fills at the ask and never calls a Robinhood write; the house's same idea goes LIVE", async () => {
  reset();
  const card: any = await inRoom(JOSH, () => M.proposeAction(spyCard(), JOSH, { manual: true }));
  assert(card.status === "paper_wait" && /^PAPER — /.test(card.title) && (card.checks || []).some((c: any) => c.practice && /PRACTICE · Rooms are paper-only/.test(c.text)), "practice card: " + JSON.stringify({ s: card.status, t: card.title, c: card.checks }).slice(0, 300));
  assert(card.plan?.practice === true, "plan.practice");
  MCP.length = 0;
  const ok: any = await inRoom(JOSH, () => M.actOnForTest(card.id, "approve", JOSH, { setup: "trend continuation above the box", why_now: "it just reclaimed the level", kills: "a 5-min close under 778.6" }));
  assert(ok.status === "paper_taken" && ok.plan?.paper_fill?.ask === 3.6, "pretend fill at the ask: " + JSON.stringify({ s: ok.status, f: ok.plan?.paper_fill }));
  assert(!MCP.some(isWrite), "no Robinhood write on approve: " + MCP.join(","));
  assert(T.otto_actions.find((a) => a.id === card.id).owner === JOSH, "josh's card");
  // the practice book for the room: $5,000, started now, the house's book untouched
  const book = await inRoom(JOSH, () => M.practiceBook());
  assert(book.start === 5000 && book.since, "josh's book: " + JSON.stringify(book));
  const map = T.otto_settings.find((r) => r.key === "practice_by_owner")?.value;
  assert(map && map[JOSH]?.start === 5000 && !T.otto_settings.find((r) => r.key === "practice_book"), "practice_by_owner only");
  assert((await inRoom(HOUSE, () => M.practiceBook())).start === 4000, "the house's book is still $4,000");
  // the hard guard: even a malformed / pending card in a member's room can never place — the write path throws
  T.otto_actions.push({ id: "99999999-9999-4999-8999-999999999999", owner: JOSH, title: "LIVE — sneaky", status: "pending", created_at: new Date().toISOString(), created_by: JOSH, summary: "", review: "", calls: spyCard().calls, plan: spyCard().plan, exit: { state: "planned", entry_limit: 3.5, qty: 1 }, checks: [], risk: {} });
  MCP.length = 0;
  let err = "";
  try { await inRoom(JOSH, () => M.actOnForTest("99999999-9999-4999-8999-999999999999", "approve", JOSH, { setup: "x y z words here", why_now: "reclaimed just now", kills: "a close under the box" })); } catch (e) { err = (e as Error).message; }
  const sneaky = T.otto_actions.find((a) => a.id === "99999999-9999-4999-8999-999999999999");
  assert(!MCP.some(isWrite) && (/paper-only/.test(err) || /paper-only/.test(JSON.stringify(sneaky))), "guard held: err=" + err + " status=" + sneaky.status);
  // a member's close / cancel card is refused outright; Close Now on a live id is refused; auto-close throws
  let e2 = "";
  try { await inRoom(JOSH, () => M.proposeAction({ title: "Cancel it", calls: [{ service: "rh", tool: "cancel_option_order", args: { order_id: "o1" } }] }, JOSH, { manual: true })); } catch (e) { e2 = (e as Error).message; }
  assert(/paper-only/.test(e2), "cancel card refused: " + e2);
  const cb = await inRoom(JOSH, () => M.closeByButton({ option_id: "opt-spy-781c", author: "Josh" }, JOSH));
  assert(cb.ok === false && /paper-only/.test(cb.error), "close now on a live id refused: " + JSON.stringify(cb));
  // the house: the same idea, same settings → a LIVE pending card
  const house: any = await inRoom(HOUSE, () => M.proposeAction(spyCard(), HOUSE, { manual: true }));
  assert(house.status === "pending" && /^LIVE — /.test(house.title), "house card is live: " + house.status + " " + house.title);
});

Deno.test("v5.0 paper-only (b): the tick visits a member room with an open practice trade, skips one without, and runs the house first", async () => {
  reset();
  T.otto_users.push({ email: "two@example.com", name: "Two", role: "member", status: "active" });
  const mk = (id: string, own: string, outcome: any = null) => ({ id, owner: own, title: "PAPER — SPY 781C", status: "paper_taken", created_at: new Date(Date.now() - 3600e3).toISOString(),
    calls: spyCard().calls, plan: { ...spyCard().plan, practice: true, paper_fill: { ask: 3.6, at: new Date(Date.now() - 3600e3).toISOString() } }, outcome });
  T.otto_actions = [
    mk("a1111111-1111-4111-8111-111111111111", JOSH),                                             // open → visited
    mk("a2222222-2222-4222-8222-222222222222", "two@example.com", { state: "win", pnl_est: 40 }),   // finished → skipped
    mk("a3333333-3333-4333-8333-333333333333", HOUSE),
  ];
  LOG.length = 0;
  const r = await M.scoreTickRooms();
  assert(r.visited.length === 1 && r.visited[0] === JOSH && r.skipped.length === 1 && r.skipped[0] === "two@example.com", "visited/skipped: " + JSON.stringify(r));
  const reads = LOG.filter((l) => l.m === "GET" && l.path.startsWith("otto_actions?"));
  const joshFull = reads.filter((l) => l.path.includes("owner=eq." + encodeURIComponent(JOSH)) && l.path.includes("select=*"));
  const twoFull = reads.filter((l) => l.path.includes("owner=eq.two%40example.com") && l.path.includes("select=*"));
  assert(joshFull.length === 1 && twoFull.length === 0, "the full tick ran for Josh only: " + reads.map((l) => l.path).join(" | "));
  assert(!reads.some((l) => l.path.includes("owner=eq." + encodeURIComponent(HOUSE))), "the rooms pass never touches the house's rows");
  assert(M.ownerForTest() === HOUSE, "back in the house afterwards");
  // the cron's own order: house tick, then rooms (the house pass carries no room)
  assert(T.otto_users.filter((u) => u.status === "active" && u.role === "member").length === 2, "two active members in the list");
  const r2 = await M.scoreTickRooms();
  assert(r2.visited.length === 1, "round-robin: a second pass still finds Josh's open trade");
  // BABY (invited, not active) is never visited
  assert(!r.visited.includes(BABY) && !r.skipped.includes(BABY) && !r2.visited.includes(BABY), "invited rooms are not visited");
});
