/* Otto Signals Watcher — background.
   Collects the mentor's new messages from the Discord tab, waits for his burst
   to finish (he posts a call over several quick lines), shrinks any chart
   images, and sends the burst to Otto. Every minute it tells Otto it's alive,
   so Otto can ping both phones if the watcher goes quiet. */
const VER = "1.0.0";
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
async function queueMsgs(msgs) {
  const sent = new Set((await store.get("sent")) || []);
  const q = (await store.get("queue")) || [];
  const have = new Set(q.map((m) => m.id));
  const fresh = msgs.filter((m) => !sent.has(m.id) && !have.has(m.id));
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
  const wait = Math.max(0, Math.min(last + QUIET_MS, first + MAX_WAIT_MS) - Date.now());
  flushTimer = setTimeout(flush, wait);
}
let flushing = false;
async function flush() {
  if (flushing) return;
  const q = (await store.get("queue")) || [];
  if (!q.length) return;
  flushing = true;
  try {
    const msgs = [];
    for (const m of q) {
      const images = [];
      for (const u of (m.imageUrls || []).slice(0, 3)) { try { images.push(await shrink(u)); } catch (e) { /* send the words anyway */ } }
      msgs.push({ id: m.id, at: m.at, author: m.author, author_id: m.author_id, channel: m.channel, text: m.text, images });
    }
    await otto({ kind: "msgs", msgs });
    const sent = ((await store.get("sent")) || []).concat(q.map((m) => m.id)).slice(-3000);
    const left = ((await store.get("queue")) || []).filter((m) => !q.some((x) => x.id === m.id));
    await store.set({ sent, queue: left, lastSend: { at: Date.now(), n: q.length, ok: true } });
  } catch (e) {
    await store.set({ lastSend: { at: Date.now(), n: q.length, ok: false, error: String(e.message || e) } });
  }
  flushing = false;
  schedule();
}

// Tab health: the content script reports every 30s per Discord tab.
async function onStatus(tabId, s) {
  const st = (await store.get("tabs")) || {};
  st[tabId] = { ...s, at: Date.now() };
  await store.set({ tabs: st });
  if (s.state === "ok") chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});  // Chrome must never put the watcher tab to sleep
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
  if (other.includes("wrong_channel")) return { state: "wrong_channel", detail: "Discord is open on a different channel" };
  if (other.includes("unpaired")) return { state: "unpaired", detail: "paste the pairing code" };
  return { state: "stale", detail: "the Discord tab isn't reporting (asleep or still loading)" };
}
async function beat() {
  const o = await overall();
  try { await otto({ kind: "beat", ver: VER, ...o }); await store.set({ lastBeat: { at: Date.now(), ok: true, ...o } }); }
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
    if (m.type === "open") {
      const cfg = await store.get("cfg");
      if (!cfg) return reply({ ok: false, error: "Pair with Otto first." });
      const w = await chrome.windows.create({ url: `https://discord.com/channels/${cfg.guild}/${cfg.channel}`, type: "normal", width: 1000, height: 820, focused: true });
      if (w.tabs && w.tabs[0]) chrome.tabs.update(w.tabs[0].id, { autoDiscardable: false }).catch(() => {});
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
chrome.runtime.onInstalled.addListener(beat);
chrome.tabs.onRemoved.addListener(async (id) => { const st = (await store.get("tabs")) || {}; delete st[id]; await store.set({ tabs: st }); });
