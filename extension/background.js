/* Otto Signals Watcher — background.
   Collects the mentor's new messages from the Discord tab, waits for his burst
   to finish (he posts a call over several quick lines), shrinks any chart
   images, and sends the burst to Otto. Every minute it tells Otto it's alive,
   so Otto can ping both phones if the watcher goes quiet.
   v1.3: edits / late charts arrive as {edited:true} with a new key (id#e<hash>); the Discord tab also nudges the
   check-in every minute (Chrome can hold back the alarm on an idle PC); scrolled-up and unknown-author counts
   travel in the heartbeat. */
const VER = "1.5.0";
const QUIET_MS = 3000;      // v1.3.1 (13 Oct): was 12 s. Send once he's been quiet this long…
const MAX_WAIT_MS = 8000;   // v1.3.1: was 30 s. …or this long after the first new line, whichever comes first

const store = {
  get: (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v[k]))),
  set: (o) => new Promise((r) => chrome.storage.local.set(o, r)),
};

function decodePair(code) {
  const j = JSON.parse(atob(String(code || "").trim()));
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(j.u) || !j.a || !j.k) throw new Error("That isn't an Otto pairing code.");
  return { u: j.u, a: j.a, k: j.k };
}

async function otto(body) {
  const pair = await store.get("pair");
  if (!pair) throw new Error("not paired");
  const r = await fetch(pair.u + "/functions/v1/otto-proxy?fn=signal_in", {
    method: "POST",
    headers: { apikey: pair.a, authorization: "Bearer " + pair.a, "content-type": "application/json", "x-otto-signal": pair.k },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false, error: "HTTP " + r.status }));
  if (!r.ok || !j.ok) throw new Error(j.error || "HTTP " + r.status);
  if (j.cfg) await store.set({ cfg: j.cfg });
  return j;
}

// Chart screenshots: shrink to 1600px JPEG so they travel fast.
async function shrink(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("image HTTP " + r.status);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const out = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const buf = new Uint8Array(await out.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: "image/jpeg", data: btoa(s) };
}

let flushTimer = null;
// v1.3: an edit is its own item, keyed by the id plus a hash of what changed.
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const keyOf = (m) => m.edited ? `${m.id}#e${hash(String(m.text || "") + "|" + (m.imageUrls || []).map((u) => String(u).split("?")[0]).join(","))}` : m.id;
async function queueMsgs(msgs) {
  const sent = new Set((await store.get("sent")) || []);
  let q = (await store.get("queue")) || [];
  const fresh = msgs.map((m) => ({ ...m, key: keyOf(m) })).filter((m) => !sent.has(m.key)).map((m) => ({ ...m, queuedAt: Date.now() }));
  // A newer version of a message still waiting to go replaces the older one.
  q = q.filter((x) => !fresh.some((m) => m.id === x.id));
  if (!fresh.length) return;
  const now = Date.now();
  await store.set({ queue: q.concat(fresh), lastAdd: now, firstAdd: q.length ? (await store.get("firstAdd")) || now : now });
  schedule();
}
async function schedule() {
  clearTimeout(flushTimer);
  const q = (await store.get("queue")) || [];
  if (!q.length) return;
  const last = (await store.get("lastAdd")) || 0, first = (await store.get("firstAdd")) || 0;
  const retryAt = (await store.get("retryAt")) || 0;
  const wait = Math.max(0, Math.min(last + QUIET_MS, first + MAX_WAIT_MS) - Date.now(), retryAt - Date.now());
  flushTimer = setTimeout(flush, wait);
}
let flushing = false;
const CHUNK = 20;            // v1.1: send at most 20 at a time, newest first, so a backlog never pushes out the live call
async function flush() {
  if (flushing) return;
  const all = (await store.get("queue")) || [];
  if (!all.length) return;
  const retryAt = (await store.get("retryAt")) || 0;
  if (Date.now() < retryAt) { schedule(); return; }
  const q = all.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, CHUNK);
  flushing = true;
  try {
    const msgs = [];
    for (const m of q) {
      const images = [];
      for (const u of (m.imageUrls || []).slice(0, 3)) { try { images.push(await shrink(u)); } catch (e) { /* send the words anyway */ } }
      msgs.push({ id: m.id, at: m.at, author: m.author, author_id: m.author_id, channel: m.channel, text: m.text, images, ...(m.edited ? { edited: true } : {}) });
    }
    const j = await otto({ kind: "msgs", msgs });
    // Only what Otto confirms it received is marked sent; anything else stays queued and is retried.
    const ok = new Set(Array.isArray(j.accepted) ? j.accepted.map(String) : q.map((m) => m.id));
    const done = q.filter((m) => ok.has(m.id)).map((m) => m.key || m.id);
    const sent = ((await store.get("sent")) || []).concat(done).slice(-3000);
    const left = ((await store.get("queue")) || []).filter((m) => !done.includes(m.key || m.id));
    await store.set({ sent, queue: left, fails: 0, retryAt: 0, firstAdd: left.length ? Date.now() : 0, lastAdd: 0, lastSend: { at: Date.now(), n: done.length, ok: true } });
  } catch (e) {
    const fails = ((await store.get("fails")) || 0) + 1;     // back off: 5s, 10s, 20s … max 2 min
    await store.set({ fails, retryAt: Date.now() + Math.min(120000, 5000 * 2 ** (fails - 1)),
      lastSend: { at: Date.now(), n: q.length, ok: false, error: String(e.message || e) } });
  }
  flushing = false;
  schedule();
}

// Tab health: the content script reports every 30s per Discord tab.
async function onStatus(tabId, s) {
  const st = (await store.get("tabs")) || {};
  st[tabId] = { ...s, at: Date.now() };
  await store.set({ tabs: st });
  if (s.state === "ok" || s.state === "scrolled_up") chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});  // Chrome must never put the watcher tab to sleep
}
async function overall() {
  if (await store.get("paused")) return { state: "paused", detail: "paused in the extension" };
  const st = (await store.get("tabs")) || {};
  const live = Object.entries(st).filter(([, s]) => Date.now() - s.at < 180e3);
  const ok = live.find(([, s]) => s.state === "ok");
  if (ok) return { state: "ok", seen: ok[1].seen, detail: "" };
  const tabs = await chrome.tabs.query({ url: "https://discord.com/*" }).catch(() => []);
  if (!tabs.length) return { state: "no_tab", detail: "no Discord tab open" };
  const other = live.map(([, s]) => s.state);
  if (other.includes("logged_out")) return { state: "logged_out", detail: "Discord is signed out" };
  if (other.includes("scrolled_up")) return { state: "scrolled_up", detail: "the Discord window is scrolled up (scrolling it back down)" };
  if (other.includes("wrong_channel")) return { state: "wrong_channel", detail: "Discord is open on a different channel" };
  if (other.includes("unpaired")) return { state: "unpaired", detail: "paste the pairing code" };
  return { state: "stale", detail: "the Discord tab isn't reporting (asleep or still loading)" };
}
// v1.2: New York market hours (weekdays 9:00–4:30), for reopening a closed watcher window.
function marketHours() {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t) => (f.find((x) => x.type === t) || {}).value || "";
  const m = Number(g("hour")) % 24 * 60 + Number(g("minute"));
  return !["Sat", "Sun"].includes(g("weekday")) && m >= 540 && m <= 990;
}
async function openWatcher(minimized) {
  const cfg = await store.get("cfg");
  if (!cfg) return false;
  const w = await chrome.windows.create({ url: `https://discord.com/channels/${cfg.guild}/${cfg.channel}`, type: "normal", width: 1000, height: 820,
    focused: !minimized, ...(minimized ? { state: "minimized" } : {}) }).catch(() => null);
  if (w && w.tabs && w.tabs[0]) chrome.tabs.update(w.tabs[0].id, { autoDiscardable: false }).catch(() => {});
  return !!w;
}
let beatAt = 0;
async function beat(nudge = false) {
  if (nudge && Date.now() - beatAt < 45000) return;      // v1.3: the tab's nudge only fills a gap the alarm left
  beatAt = Date.now();
  let o = await overall();
  // v1.2 (Ifoma OK'd 6 Oct): the watcher window was closed during market hours → reopen it, minimized.
  if (o.state === "no_tab" && marketHours() && (await store.get("pair")) && !(await store.get("paused"))) {
    const last = (await store.get("reopenAt")) || 0;
    if (Date.now() - last > 5 * 60e3) { await store.set({ reopenAt: Date.now() }); if (await openWatcher(true)) o = { state: "stale", detail: "watcher window was closed — reopened it (minimized)" }; }
  }
  const q = (await store.get("queue")) || [];
  const ls = (await store.get("lastSend")) || {};
  const oldestQ = q.length ? Math.min(...q.map((m) => (m.queuedAt || Date.now()))) : Date.now();
  const st = (await store.get("tabs")) || {};
  const tabs = Object.values(st).filter((s) => Date.now() - s.at < 180e3);
  const extra = { queue: q.length, queue_age: Math.round((Date.now() - oldestQ) / 1000), send_error: ls.ok === false ? ls.error : "",
    unknown_authors: tabs.reduce((n, s) => n + (Number(s.unknown_authors) || 0), 0), auto_scrolls: tabs.reduce((n, s) => n + (Number(s.auto_scrolls) || 0), 0) };
  try { await otto({ kind: "beat", ver: VER, ...o, ...extra }); await store.set({ lastBeat: { at: Date.now(), ok: true, ...o } }); }
  catch (e) { await store.set({ lastBeat: { at: Date.now(), ok: false, error: String(e.message || e), ...o } }); }
  schedule();
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && m.target === "background" && String(m.type).startsWith("ears")) { earsMsg(m).then(reply); return true; }
  (async () => {
    if (m.type === "hello") return reply({ cfg: (await store.get("pair")) ? await store.get("cfg") : null, paused: !!(await store.get("paused")) });
    if (m.type === "msgs") { await queueMsgs(m.msgs || []); return reply({ ok: true }); }
    if (m.type === "status" && sender.tab) { await onStatus(sender.tab.id, m); return reply({ ok: true }); }
    if (m.type === "pair") {
      try { const p = decodePair(m.code); await store.set({ pair: p }); await beat(); const lb = await store.get("lastBeat");
        if (!lb.ok) throw new Error(lb.error); await pushCfg(); return reply({ ok: true }); }
      catch (e) { return reply({ ok: false, error: String(e.message || e) }); }
    }
    if (m.type === "pause") { await store.set({ paused: !!m.on }); await pushCfg(); await beat(); return reply({ ok: true }); }
    if (m.type === "beat") { await beat(); return reply({ ok: true }); }
    if (m.type === "beat_nudge") { await beat(true); flush(); return reply({ ok: true }); }
    if (m.type === "open") {
      if (!(await store.get("cfg"))) return reply({ ok: false, error: "Pair with Otto first." });
      await openWatcher(false);
      return reply({ ok: true });
    }
    if (m.type === "state") return reply({ pair: !!(await store.get("pair")), cfg: await store.get("cfg"), paused: !!(await store.get("paused")),
      lastBeat: await store.get("lastBeat"), lastSend: await store.get("lastSend"), queue: ((await store.get("queue")) || []).length, overall: await overall() });
    reply({ ok: false });
  })();
  return true;
});
async function pushCfg() {
  const cfg = await store.get("cfg"), paused = !!(await store.get("paused"));
  const tabs = await chrome.tabs.query({ url: "https://discord.com/*" }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: "cfg", cfg, paused }).catch(() => {});
}

chrome.alarms.create("beat", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "beat") { beat(); flush(); } });
chrome.runtime.onStartup.addListener(beat);
// v1.2: after an update, already-open Discord tabs still run the OLD reader (it can't reach the new
// extension → "stale"). Refresh them so the new reader loads. (Happened 6 Oct after the 1.1.0 update.)
chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason === "update") {
    const tabs = await chrome.tabs.query({ url: "https://discord.com/*" }).catch(() => []);
    for (const t of tabs) chrome.tabs.reload(t.id).catch(() => {});
  }
  beat();
});
chrome.tabs.onRemoved.addListener(async (id) => { const st = (await store.get("tabs")) || {}; delete st[id]; await store.set({ tabs: st }); });


/* ===== v1.4.0 EARS (26 Oct 2026): listen to ONE tab's audio during the coach's live call.
   offscreen.js records the tab in ~60 s pieces; each piece goes to Otto (?fn=ears) which transcribes it and posts any
   levels he said on the Desk. Pieces are sent one at a time, in order, with retries. */
const EARS_URL = (p) => p.u + "/functions/v1/otto-proxy?fn=ears";
let earsQ = [], earsBusy = false;
async function earsStatus(patch) { const s = (await store.get("ears")) || {}; const n = { ...s, ...patch }; await store.set({ ears: n }); return n; }
async function earsPost(body) {
  const pair = await store.get("pair"); if (!pair) throw new Error("not paired — paste the pairing code first");
  const r = await fetch(EARS_URL(pair), { method: "POST", headers: { apikey: pair.a, authorization: "Bearer " + pair.a, "content-type": "application/json", "x-otto-signal": pair.k }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, error: "HTTP " + r.status }));
  if (!r.ok || !j.ok) throw new Error(j.error || "HTTP " + r.status);
  return j;
}
async function earsDrain() {
  if (earsBusy) return; earsBusy = true;
  try {
    while (earsQ.length) {
      const item = earsQ[0];
      try { const j = await earsPost(item); earsQ.shift();
        if (item.kind === "chunk") { const s = (await store.get("ears")) || {}; await earsStatus({ sent: (s.sent || 0) + 1, levels: j.levels ?? s.levels, mode: j.mode || s.mode, err: "" }); }
        else if (item.kind === "start" && j.mode) await earsStatus({ mode: j.mode });
        else if (item.kind === "stop") await earsStatus({ result: { levels: j.levels || 0, armed: j.armed || 0, waiting: j.waiting || 0, dismissed: j.dismissed || 0, skipped: j.skipped || 0, minutes: j.minutes || 0 } });
      }
      catch (e) { item.tries = (item.tries || 0) + 1; await earsStatus({ err: String(e.message || e).slice(0, 160) });
        if (item.tries >= 4 && item.kind === "chunk") { earsQ.shift(); const s = (await store.get("ears")) || {}; await earsStatus({ lost: (s.lost || 0) + 1 }); continue; }   // give up on one piece, keep the call going
        if (item.tries >= 8) { earsQ.shift(); continue; }
        await new Promise((r) => setTimeout(r, 4000)); }
    }
  } finally { earsBusy = false; }
}
async function earsStart(tabId) {
  const s = (await store.get("ears")) || {};
  if (s.on) return { ok: false, error: "Already listening." };
  const streamId = await new Promise((res) => chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => res(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : { id })));
  if (!streamId.id) return { ok: false, error: "Chrome would not share this tab: " + streamId.error };
  const session = "e" + Date.now().toString(36);
  await store.set({ ears: { on: true, session, tabId, startedAt: Date.now(), sent: 0, lost: 0, levels: 0, mode: s.mode || "draft", err: "", result: null } });
  if (!(await chrome.offscreen.hasDocument().catch(() => false)))
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA"], justification: "Record the call tab's audio so Otto can hear the coach's levels." });
  earsQ.push({ kind: "start", session });
  chrome.runtime.sendMessage({ target: "offscreen", type: "ears-go", streamId: streamId.id, session, mode: "both" });
  earsDrain();
  return { ok: true, session };
}
async function earsStop(why) {
  const s = (await store.get("ears")) || {}; if (!s.on) return { ok: true };
  chrome.runtime.sendMessage({ target: "offscreen", type: "ears-stop" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));          // let the last piece arrive
  await store.set({ ears: { ...s, on: false, endedAt: Date.now(), why: why || "" } });
  earsQ.push({ kind: "stop", session: s.session }); await earsDrain();
  chrome.offscreen.closeDocument().catch(() => {});
  return { ok: true };
}
async function earsMsg(m) {
  try {
    if (m.type === "ears-start") return await earsStart(m.tabId);
    if (m.type === "ears-stop") return await earsStop("stopped");
    if (m.type === "ears-chunk") { const s = (await store.get("ears")) || {}; if (!s.on && !m.final) return { ok: false };
      earsQ.push({ kind: "chunk", session: m.session, seq: m.seq, min: m.min, mime: m.mime, audio: m.audio }); earsDrain(); return { ok: true }; }
    if (m.type === "ears-retry") {   // the first way of asking failed: try audio-only with a FRESH stream id, once
      const s = (await store.get("ears")) || {}; if (!s.on) return { ok: false };
      const id = await new Promise((res) => chrome.tabCapture.getMediaStreamId({ targetTabId: s.tabId }, (x) => res(chrome.runtime.lastError ? null : x)));
      if (!id) { await earsStatus({ err: String(m.error || "").slice(0, 200), on: false }); chrome.offscreen.closeDocument().catch(() => {}); return { ok: false }; }
      await earsStatus({ firstErr: String(m.error || "").slice(0, 200) });
      chrome.runtime.sendMessage({ target: "offscreen", type: "ears-go", streamId: id, session: s.session, mode: "audio" }); return { ok: true };
    }
    if (m.type === "ears-error") { await earsStatus({ err: String(m.error || "").slice(0, 160) + (((await store.get("ears")) || {}).firstErr ? " | first try: " + ((await store.get("ears")) || {}).firstErr : ""), on: false }); chrome.offscreen.closeDocument().catch(() => {}); return { ok: true }; }
    if (m.type === "ears-state") return { ok: true, ears: (await store.get("ears")) || {} };
    if (m.type === "ears-open-desk") { await chrome.tabs.create({ url: "https://proagentmax.github.io/otto-trader/#desk" }); return { ok: true }; }
  } catch (e) { await earsStatus({ err: String(e.message || e).slice(0, 160) }); return { ok: false, error: String(e.message || e) }; }
  return { ok: false };
}
chrome.tabs.onRemoved.addListener(async (id) => { const s = (await store.get("ears")) || {}; if (s.on && s.tabId === id) earsStop("the tab was closed"); });
