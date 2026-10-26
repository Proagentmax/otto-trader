/* Otto Ears — records one tab's audio in ~60 s standalone pieces (each piece is its own valid file, so each can be transcribed alone). */
const PIECE_MS = 60000;
let stream = null, rec = null, timer = null, session = "", seq = 0, startedAt = 0, stopping = false, ctx = null;
const toB64 = (blob) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] || ""); f.onerror = rej; f.readAsDataURL(blob); });
function pickMime() { for (const t of ["audio/webm;codecs=opus", "audio/webm"]) if (MediaRecorder.isTypeSupported(t)) return t; return ""; }
function piece() {
  if (!stream || stopping) return;
  const mime = pickMime(); const parts = [];
  rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    const blob = new Blob(parts, { type: mime || "audio/webm" }); const mySeq = ++seq;
    if (blob.size > 2000) { try { chrome.runtime.sendMessage({ target: "background", type: "ears-chunk", session, seq: mySeq, min: Math.round((Date.now() - startedAt) / 60000), mime: mime || "audio/webm", audio: await toB64(blob), final: stopping }); } catch (e) { chrome.runtime.sendMessage({ target: "background", type: "ears-error", error: "could not send audio: " + e.message }); } }
    if (!stopping) piece();
  };
  rec.start(); timer = setTimeout(() => { try { rec.stop(); } catch (e) {} }, PIECE_MS);
}
// IMPORTANT: this listener must NOT be async and must ignore every message not meant for it. Chrome counts a returned Promise as
// "I answered", so an async listener here answered the popup's other messages with undefined and broke pairing (26 Oct, v1.4.0).
chrome.runtime.onMessage.addListener((m) => {
  if (!m || m.target !== "offscreen") return false;
  run(m);
  return false;
});
async function run(m) {
  if (m.type === "ears-go") {
    try {
      session = m.session; seq = 0; stopping = false; startedAt = Date.now();
      const src = { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: m.streamId } };
      // v1.4.5: ask for audio + video exactly like Chrome's own sample and keep only the audio (Chrome rejects audio-only with "Invalid capture
      // constraints", and a stream id is single-use, so the fallback gets a FRESH id from the background — see ears-retry).
      if (m.mode === "audio") stream = await navigator.mediaDevices.getUserMedia({ audio: src });
      else { const both = await navigator.mediaDevices.getUserMedia({ audio: src, video: src }); both.getVideoTracks().forEach((t) => { t.stop(); both.removeTrack(t); }); stream = both; }
      ctx = new AudioContext(); ctx.createMediaStreamSource(stream).connect(ctx.destination);   // capturing mutes the tab — play it back so the call stays audible
      piece();
    } catch (e) { chrome.runtime.sendMessage({ target: "background", type: m.mode === "audio" ? "ears-error" : "ears-retry", error: "could not listen to that tab: " + String(e.name || "Error") + " — " + (e.message || e) }); }
  }
  if (m.type === "ears-stop") {
    stopping = true; clearTimeout(timer);
    try { if (rec && rec.state === "recording") rec.stop(); } catch (e) {}
    setTimeout(() => { try { stream && stream.getTracks().forEach((t) => t.stop()); ctx && ctx.close(); } catch (e) {} stream = null; }, 1200);
  }
}
