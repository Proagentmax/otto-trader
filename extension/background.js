/* Otto Signals Watcher — background.
   Collects the mentor's new messages from the Discord tab, waits for his burst
   to finish (he posts a call over several quick lines), shrinks any chart
   images, and sends the burst to Otto. Every minute it tells Otto it's alive,
   so Otto can ping both phones if the watcher goes quiet.
   v1.3: edits / late charts arrive as {edited:true} with a new key (id#e<hash>); the Discord tab also nudges the
   check-in every minute (Chrome can hold back the alarm on an idle PC); scrolled-up and unknown-author counts
   travel in the heartbeat. */
const VER = "1.3.0";
const QUIET_MS = 12000;     // send once he's been quiet this long…
const MAX_WAIT_MS = 30000;  // …or this long after the first new line, whichever comes first

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
