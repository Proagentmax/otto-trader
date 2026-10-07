const $ = (s) => document.querySelector(s);
const ask = (m) => new Promise((r) => chrome.runtime.sendMessage(m, r));
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
