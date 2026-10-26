const $ = (s) => document.querySelector(s);
const ask = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (v) => r(v || { ok: false, error: "The extension did not answer — reload it at chrome://extensions." })));
const ago = (t) => { if (!t) return "never"; const s = (Date.now() - t) / 1000; return s < 90 ? Math.round(s) + "s ago" : Math.round(s / 60) + " min ago"; };
const WHY = { ok: "Watching", paused: "Paused", no_tab: "No Discord window open", logged_out: "Discord is signed out", wrong_channel: "Discord is on a different channel", unpaired: "Not paired", stale: "Discord tab not reporting", scrolled_up: "Discord scrolled up (fixing it)" };
async function draw() {
  const s = await ask({ type: "state" });
  $("#pairBox").style.display = s.pair ? "none" : "block";
  $("#repair").style.display = s.pair ? "block" : "none";
  $("#pause").textContent = s.paused ? "Resume" : "Pause";
  const o = s.overall || {}, ok = o.state === "ok" && s.lastBeat && s.lastBeat.ok;
  $("#sub").textContent = s.cfg ? `Watching ${s.cfg.mentor} in ${s.cfg.channel_name}` : "Discord watcher";
  $("#st").innerHTML =
    `<div class="row"><span><span class="dot ${ok ? "ok" : "bad"}"></span>${WHY[o.state] || o.state || "—"}</span><span class="mut">${o.seen ? o.seen + " msgs on screen" : ""}</span></div>` +
    `<div class="row"><span>Otto check-in</span><span class="${s.lastBeat && !s.lastBeat.ok ? "err" : "mut"}">${s.lastBeat ? (s.lastBeat.ok ? ago(s.lastBeat.at) : "failed: " + s.lastBeat.error) : "never"}</span></div>` +
    `<div class="row"><span>Last post sent</span><span class="${s.lastSend && !s.lastSend.ok ? "err" : "mut"}">${s.lastSend ? (s.lastSend.ok ? ago(s.lastSend.at) + " (" + s.lastSend.n + ")" : "failed: " + s.lastSend.error) : "none yet"}</span></div>` +
    (s.queue ? `<div class="row"><span>Waiting to send</span><span>${s.queue}</span></div>` : "");
}
$("#pair").onclick = async () => { $("#msg").textContent = "Checking with Otto…"; const r = await ask({ type: "pair", code: $("#code").value });
  $("#msg").textContent = r.ok ? "" : r.error; draw(); };
$("#repair").onclick = () => { $("#pairBox").style.display = "block"; };
$("#open").onclick = async () => { const r = await ask({ type: "open" }); $("#msg").textContent = r.ok ? "" : r.error; };
$("#pause").onclick = async () => { const s = await ask({ type: "state" }); await ask({ type: "pause", on: !s.paused }); draw(); };
$("#beat").onclick = async () => { await ask({ type: "beat" }); draw(); };
draw(); setInterval(draw, 3000);

// v1.4.0 Ears
const clk = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
async function drawEars() {
  const r = await ask({ target: "background", type: "ears-state" }); const e = (r && r.ears) || {};
  $("#earsGo").style.display = e.on ? "none" : "block"; $("#earsHint").style.display = e.on ? "none" : "block"; $("#earsLive").style.display = e.on ? "block" : "none";
  if (e.on) { $("#earsClk").textContent = clk(Date.now() - e.startedAt); $("#earsN").textContent = e.sent || 0; $("#earsLv").textContent = e.levels || 0; $("#earsMode").textContent = e.mode === "auto" ? "Automatic (armed at once)" : "Draft (you tap Arm)"; }
  const R = e.result; $("#earsDone").style.display = (!e.on && R) ? "block" : "none";
  if (!e.on && R) { $("#earsDoneTxt").innerHTML = `<b>Stopped after ${R.minutes} min.</b> ${R.levels} level${R.levels === 1 ? "" : "s"} heard — <b>${R.waiting} waiting for your Arm</b>${R.armed ? `, ${R.armed} armed` : ""}${R.dismissed ? `, ${R.dismissed} dismissed` : ""}${R.skipped ? `, ${R.skipped} skipped` : ""}.<div class="mut">The levels are on the Desk as 🎧 posts (Arm / Dismiss there). Winston reads the armed ones on his next check.</div>`; $("#earsOpen").textContent = R.waiting ? "Open the Desk to Arm" : "Open the Desk"; }
  $("#earsErr").textContent = e.err ? (/starting tab capture/i.test(e.err) ? e.err + " — if this is a file on your PC: chrome://extensions → Otto Signals → Details → turn on \"Allow access to file URLs\", then try again." : e.err) + (e.lost ? ` · ${e.lost} piece(s) lost` : "") : (e.lost ? `${e.lost} piece(s) could not be sent` : "");
}
$("#earsGo").onclick = async () => {
  $("#earsErr").textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { $("#earsErr").textContent = "No tab found."; return; }
  // v1.4.4: the BACKGROUND asks Chrome for the tab's audio (Chrome's own sample does it there; a popup can close mid-request and cancel it).
  const r = await ask({ target: "background", type: "ears-start", tabId: tab.id });
  if (!r || !r.ok) $("#earsErr").textContent = (r && r.error) || "Could not start."; drawEars();
};
$("#earsStop").onclick = async () => { await ask({ target: "background", type: "ears-stop" }); drawEars(); };
drawEars(); setInterval(drawEars, 1000);
$("#earsOpen").onclick = async () => { await ask({ target: "background", type: "ears-open-desk" }); };
