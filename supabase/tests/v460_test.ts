// v4.6 (26 Oct 2026): EARS — live call audio → Whisper → levels → Desk draft / auto-arm.
// Run: deno test -A --no-check supabase/tests/v460_test.ts
const RealDate = Date; let NOW = RealDate.parse("2026-10-26T15:00:00Z");
class FakeDate extends RealDate { constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;
const setNow = (iso: string) => { NOW = RealDate.parse(iso); };
Deno.env.set("OTTO_RH_ACCOUNT", "945257012");
let WATCH: any[] = [], SET: Record<string, any> = {}, DESK: string[] = [], ACT: string[] = [], BRAINROWS: any[] = [], SEEDS: any[] = [];
let PX: Record<string, string> = { MU: "900", NVDA: "214", AAPL: "345", AMZN: "250", TSLA: "387", SPY: "760", PLTR: "194", AMD: "520", INTC: "89", SKHY: "140", MSFT: "520", GOOGL: "330", META: "640", NOC: "560", PANW: "390", TXN: "286", DLTR: "125", XOM: "180", FCX: "66", VZ: "44" };
let wId = 1; let TRANS: string[] = [], SAY: string[] = [], LEV: any[][] = [], BOOM = false;
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
      if (m === "PATCH") { const id = Number(/id=eq\.(\d+)/.exec(path)?.[1]); const w = WATCH.find((x) => x.id === id); if (w) Object.assign(w, JSON.parse(init.body)); return Promise.resolve([]); }
      const t = /ticker=eq\.([A-Z.]+)/.exec(path)?.[1], lv = /level=eq\.([\d.]+)/.exec(path)?.[1];
      return Promise.resolve(WATCH.filter((r) => (!t || r.ticker === t) && (!lv || r.level === Number(lv)) && (!/status=eq\.watching/.test(path) || r.status === "watching")).map((r) => ({ ...r })));
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
  transcribe: (a: string) => { TRANS.push(a); if (BOOM) throw new Error("transcription failed: OpenAI HTTP 401"); return Promise.resolve(SAY.shift() ?? ""); },
  earsExtract: (t: string) => Promise.resolve(LEV.shift() ?? []),
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
const reset = (iso = "2026-10-26T15:00:00Z") => { (M as any).clearCacheForTest?.(); WATCH = []; SET = {}; DESK = []; ACT = []; SEEDS = []; wId = 1; TRANS = []; SAY = []; LEV = []; BOOM = false; setNow(iso); };
const dropBrain = async () => { Deno.env.set("SUPABASE_URL", "https://x.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc"); await route("seed", [{ call: { date: "2000-01-01" }, levels: [] }]); DESK.length = 0; };   // the seed route clears the cached brain

const AUD = "A".repeat(400);
const chunk = (session: string, seq: number, min = seq) => ({ kind: "chunk", session, seq, min, audio: AUD, mime: "audio/webm" });
const L = (i: string, v: string, m: string) => ({ instrument: i, value: v, meaning: m });

Deno.test("v4.6 ears: a chunk is transcribed, the spoken levels become a DRAFT Desk post, nothing is armed", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s1" });
  SAY = ["PLTR needs to reclaim one seventy one fifty and support is one sixty eight"];
  LEV = [[L("PLTR", "171.5", "needs to reclaim 171.5"), L("PLTR", "168", "support, lose it and it's 164")]];
  const r = await M.earsIn(chunk("s1", 1));
  assert(r.new === 2 && r.mode === "draft", "2 new draft: " + JSON.stringify(r));
  assert(WATCH.length === 0, "draft arms nothing");
  const post = DESK.find((d) => d.startsWith("🎧 Ears heard 2 new levels"))!;
  assert(post && /DRAFT/.test(post) && /PLTR 171.5 ▲/.test(post) && /PLTR 168/.test(post), "post: " + post);
  assert(TRANS.length === 1, "audio sent to the transcriber");
});
Deno.test("v4.6 ears: Arm puts every draft on the Watcher (only drafts), dismiss clears the rest", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s2" });
  SAY = ["one", "two two two two"].map((x) => x + " spoken words here"); LEV = [[L("NVDA", "217", "above 217 we go")], [L("SPY", "778", "sell point"), L("AMD", "515", "break of 515")]];
  await M.earsIn(chunk("s2", 1)); await M.earsIn(chunk("s2", 2));
  const a = await route("ears_arm", { author: "Ifoma" });
  assert(a.armed === 3 && WATCH.length === 3, "armed 3: " + JSON.stringify(a));
  assert(WATCH.every((w) => w.added_by === "Ifoma · Callouts" && w.source === "desk"), "marked as Callouts");
  assert((await route("ears_arm", {})).total === 0, "second tap arms nothing more");
  assert(DESK.some((d) => /Ifoma armed 3 of 3 Ears levels/.test(d)), "desk line");
  SAY = ["third chunk with words in it"]; LEV = [[L("TSLA", "383", "flip zone long")]];
  await M.earsIn(chunk("s2", 3));
  const d = await route("ears_dismiss", { author: "Ifoma" });
  assert(d.dismissed === 1 && WATCH.length === 3, "dismissed, not armed");
});
Deno.test("v4.6 ears: Automatic mode arms at once and says so; switching back to Draft works; remove takes a level off", async () => {
  reset(); assert((await route("ears_mode", {})).mode === "draft", "default draft");
  assert((await route("ears_mode", { mode: "auto", author: "Ifoma" })).mode === "auto", "set auto");
  await M.earsIn({ kind: "start", session: "s3" });
  SAY = ["AMD break of one sixty down at one fifty six"]; LEV = [[L("AMD", "525", "break of 525 up"), L("AMD", "505", "below 505 it is lost")]];
  const r = await M.earsIn(chunk("s3", 1));
  assert(r.mode === "auto" && WATCH.length === 2, "auto-armed 2: " + WATCH.length);
  assert(DESK.some((d) => /AUTO-ARMED/.test(d)), "post says AUTO-ARMED");
  const rm = await route("ears_remove", { author: "Ifoma", ticker: "AMD", level: 505 });
  assert(rm.removed === 1 && WATCH.find((w) => w.level === 505).status === "removed", "removed");
  assert((await route("ears_mode", { mode: "draft" })).mode === "draft", "back to draft");
});
Deno.test("v4.6 ears: a retried chunk (same seq) is not transcribed or posted twice", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s4" });
  SAY = ["NVDA above two seventeen is the line"]; LEV = [[L("NVDA", "217", "above 217")]];
  await M.earsIn(chunk("s4", 5)); const again = await M.earsIn(chunk("s4", 5));
  assert(again.dup && TRANS.length === 1 && DESK.filter((d) => d.startsWith("🎧 Ears heard")).length === 1, "no double");
});
Deno.test("v4.6 ears: the same level heard again, silence, and Whisper's silence-hallucinations add nothing", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s5" });
  SAY = ["MU needs to hold nine twenty today"]; LEV = [[L("MU", "920", "needs to hold 920")]]; await M.earsIn(chunk("s5", 1));
  SAY = ["and again MU nine twenty is the line"]; LEV = [[L("MU", "920", "the line")]]; const r2 = await M.earsIn(chunk("s5", 2));
  assert(r2.new === 0, "duplicate level ignored");
  SAY = ["Thank you."]; LEV = [[L("MU", "100", "hallucinated")]]; const r3 = await M.earsIn(chunk("s5", 3));
  assert(r3.new === 0 && LEV.length === 1, "silence junk never reaches the extractor");
  assert(M.earsClean("") === "" && M.earsClean("you") === "" && M.earsClean("PLTR holds 171.5 here") !== "", "earsClean");
});
Deno.test("v4.6 ears: non-stocks and nonsense are dropped by the same rules as the callouts; far levels are skipped on arm", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s6" });
  SAY = ["ten year yield five percent and PLTR nine hundred"]; LEV = [[L("US 10Y", "5.0", "above 5"), L("PLTR", "900", "typo far away"), L("INTC", "89", "support")]];
  const r = await M.earsIn(chunk("s6", 1)); assert(r.new === 2, "10Y dropped: " + r.new);
  const a = await route("ears_arm", { author: "Ifoma" });
  assert(a.armed === 1 && a.skipped === 1, "PLTR 900 is >10% from 194 → skipped: " + JSON.stringify(a));
});
Deno.test("v4.6 ears: stop posts one summary, and a second stop does not repeat it", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s7" });
  SAY = ["AAPL support three forty here"]; LEV = [[L("AAPL", "340", "support")]]; await M.earsIn(chunk("s7", 1));
  setNow("2026-10-26T15:41:00Z");
  const e = await M.earsIn({ kind: "stop", session: "s7" }); await M.earsIn({ kind: "stop", session: "s7" });
  assert(e.ended && DESK.filter((d) => d.startsWith("🎧 Ears: listening ended")).length === 1, "one summary");
  assert(/1 level heard — 0 armed, 1 waiting/.test(DESK.find((d) => d.startsWith("🎧 Ears: listening"))!), "counts");
});
Deno.test("v4.6 ears: a transcription failure surfaces as an error (the extension retries) and changes nothing", async () => {
  reset(); await M.earsIn({ kind: "start", session: "s8" }); BOOM = true;
  let err = ""; try { await M.earsIn(chunk("s8", 1)); } catch (e) { err = String((e as Error).message); }
  assert(/OpenAI HTTP 401/.test(err), "error text: " + err);
  const st = (await route("ears_state", {})).state; assert(st.chunks === 0 && st.levels.length === 0, "state untouched");
  let bad = ""; try { await M.earsIn({ kind: "chunk", session: "s8", seq: 2, audio: "x" }); } catch (e) { bad = String((e as Error).message); }
  assert(/bad audio size/.test(bad), "tiny audio refused");
});
Deno.test("v4.6 ears: the public route needs the watcher's pairing key", async () => {
  reset(); SET["signals"] = { key: "k".repeat(32) };
  const call = (key: string) => HANDLER(new Request("https://x.test/functions/v1/otto-proxy?fn=ears", { method: "POST", headers: { "x-otto-signal": key, "content-type": "application/json", authorization: "Bearer anon" }, body: JSON.stringify({ kind: "start", session: "s9" }) }));
  assert((await call("wrong".repeat(5))).status === 401, "wrong key refused");
  const ok = await call("k".repeat(32)); assert(ok.status === 200 && (await ok.json()).ok, "right key accepted");
});
Deno.test("v4.6 static: the Desk renders Ears posts with Arm / Dismiss / Remove / mode switch; the extension has the capture permissions and files", async () => {
  const U = (p: string) => new URL("../../" + p, import.meta.url);
  const html = await Deno.readTextFile(U("index.html"));
  for (const k of ["^🎧 Ears heard", "data-ears-arm", "data-ears-skip", "data-ears-rm", "data-ears-mode", '"ears_arm"', '"ears_dismiss"', '"ears_remove"', '"ears_mode"']) assert(html.includes(k), "index.html has " + k);
  const mf = JSON.parse(await Deno.readTextFile(U("extension/manifest.json")));
  for (const p of ["tabCapture", "offscreen", "activeTab"]) assert(mf.permissions.includes(p), "permission " + p);
  assert(mf.version === "1.4.0" && !mf.permissions.includes("<all_urls>"), "version, no broad host");
  const bg = await Deno.readTextFile(U("extension/background.js")), off = await Deno.readTextFile(U("extension/offscreen.js")), pop = await Deno.readTextFile(U("extension/popup.js"));
  assert(/fn=ears/.test(bg) && /x-otto-signal/.test(bg) && /ears-chunk/.test(bg) && /PIECE_MS = 60000/.test(off) && /chromeMediaSource: "tab"/.test(off) && /ctx\.destination/.test(off), "capture pieces of 60 s, tab audio stays audible");
  assert(/tabCapture\.getMediaStreamId/.test(pop) && (await Deno.readTextFile(U("extension/offscreen.html"))).includes("offscreen.js"), "popup starts it from a click");
});
