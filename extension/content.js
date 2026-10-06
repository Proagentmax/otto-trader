/* Otto Signals Watcher — runs inside discord.com.
   Reads ONLY what's on screen in the mentor's channel: no Discord API calls,
   no token, no clicking, no posting. Every new message whose author is the
   mentor's Discord account (matched by user id, not display name) goes to the
   extension's background, which sends it to Otto. */
(() => {
  const VER = "1.0.0";
  let cfg = null, paused = false;
  const seen = new Set();            // message ids already handled in this tab
  const MAX_AGE_MS = 12 * 3600e3;    // older than this on screen = ignore (yesterday's chat)

  const send = (m) => { try { return chrome.runtime.sendMessage(m); } catch (e) { return Promise.resolve(null); } };

  // Discord message ids are "snowflakes": the post time is built into the id.
  const snowTime = (id) => { try { return Number((BigInt(id) >> 22n) + 1420070400000n); } catch (e) { return 0; } };

  function where() {
    const p = location.pathname;
    if (/^\/(login|register)/.test(p)) return "logged_out";
    if (!cfg) return "unpaired";
    if (p.startsWith(`/channels/${cfg.guild}/${cfg.channel}`)) return "ok";
    return "wrong_channel";
  }

  // The author of a message: its own header, or (for a continuation line) the nearest header above it.
  function authorOf(li) {
    for (let el = li; el; el = el.previousElementSibling) {
      if (!el.id || !el.id.startsWith("chat-messages-")) continue;
      const id = el.id.split("-").pop();
      const head = el.querySelector("#message-username-" + id);
      if (!head) continue;
      const imgs = el.querySelectorAll("img");
      for (const im of imgs) {
        // A reply shows the QUOTED person's avatar first — skip it, or Josh replying to Jason would read as Jason.
        if (im.closest('[id^="message-reply-context-"]')) continue;
        const m = /\/(?:avatars|users)\/(\d{5,})\//.exec(im.src || "");
        if (m) return { id: m[1], name: (head.innerText || "").trim() };
      }
      const u = el.querySelector("[data-user-id]");
      return { id: u ? u.dataset.userId : "", name: (head.innerText || "").trim() };
    }
    return { id: "", name: "" };
  }

  function imagesOf(li, id) {
    const acc = li.querySelector("#message-accessories-" + id);
    if (!acc) return [];
    const urls = new Set();
    acc.querySelectorAll('a[href*="/attachments/"]').forEach((a) => urls.add(a.href));
    acc.querySelectorAll('img[src*="/attachments/"]').forEach((im) => { if (!urls.size) urls.add(im.src); });
    return [...urls].filter((u) => !/\.(mp4|mov|webm|pdf|zip)(\?|$)/i.test(u)).slice(0, 4);
  }

  function scan() {
    if (!cfg || paused || where() !== "ok") return;
    const items = document.querySelectorAll(`li[id^="chat-messages-${cfg.channel}-"]`);
    const out = [];
    for (const li of items) {
      const id = li.id.split("-").pop();
      if (seen.has(id)) continue;
      const at = snowTime(id);
      if (!at || Date.now() - at > MAX_AGE_MS) { seen.add(id); continue; }
      const a = authorOf(li);
      if (!a.id) continue;                       // header not rendered yet — try again next scan
      seen.add(id);
      if (a.id !== cfg.author_id) continue;      // only the mentor
      const c = li.querySelector("#message-content-" + id);
      out.push({ id, at: new Date(at).toISOString(), author: a.name, author_id: a.id, channel: cfg.channel,
        text: c ? c.innerText.trim() : "", imageUrls: imagesOf(li, id) });
    }
    if (out.length) send({ type: "msgs", msgs: out });
  }

  function status() {
    const items = cfg ? document.querySelectorAll(`li[id^="chat-messages-${cfg.channel}-"]`).length : 0;
    send({ type: "status", state: paused ? "paused" : where(), seen: items, ver: VER, url: location.pathname });
  }

  async function hello() {
    const r = await send({ type: "hello" });
    if (r) { cfg = r.cfg || null; paused = !!r.paused; }
  }

  let t = null;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 400); });
  (async () => {
    await hello();
    obs.observe(document.body, { childList: true, subtree: true });
    scan(); status();
    setInterval(scan, 3000);
    setInterval(async () => { await hello(); status(); }, 30000);
  })();
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "cfg") { cfg = m.cfg; paused = !!m.paused; scan(); status(); } });
})();
