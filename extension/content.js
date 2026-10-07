/* Otto Signals Watcher — runs inside discord.com.
   Reads ONLY what's on screen in the mentor's channel: no Discord API calls,
   no token, no clicking, no posting. Every new message whose author is the
   mentor's Discord account (matched by user id, not display name) goes to the
   extension's background, which sends it to Otto.
   v1.3 (7 Oct 2026): edited posts and late-loading charts are re-sent; a reply carries the message it
   answers; a scrolled-up channel is scrolled back to the newest post (scroll only — still no clicking)
   and reported; posts whose author can't be confirmed are counted. */
(() => {
  const VER = "1.3.0";
  let cfg = null, paused = false;
  const seen = new Map();            // message id -> { mentor, sig, at }
  const MAX_AGE_MS = 12 * 3600e3;    // older than this on screen = ignore (yesterday's chat)
  const EDIT_WINDOW_MS = 2 * 3600e3; // his posts are re-checked for edits / late charts this long
  const unknownIds = new Set(); let upSince = 0, autoScrolls = 0;

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
      return { id: u ? u.dataset.userId : "", name: (head.innerText || "").trim(), noId: !u };
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

  // v1.3: his words (without Discord's "(edited)" tag) plus, for a reply, the message he answered.
  function textOf(li, id) {
    const c = li.querySelector("#message-content-" + id);
    let t = c ? c.innerText.replace(/\s*\(edited\)\s*$/i, "").trim() : "";
    const rc = li.querySelector("#message-reply-context-" + id);
    if (rc) {
      const q = (rc.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
      if (q) t = `↪ replying to: "${q}"\n${t}`;
    }
    return t;
  }
  const strip = (u) => String(u).split("?")[0];          // attachment links carry changing signatures

  function scan() {
    if (!cfg || paused || where() !== "ok") return;
    const items = document.querySelectorAll(`li[id^="chat-messages-${cfg.channel}-"]`);
    const out = [];
    for (const li of items) {
      const id = li.id.split("-").pop();
      const at = snowTime(id);
      const prev = seen.get(id);
      if (prev && !prev.mentor) continue;
      if (!at || Date.now() - at > MAX_AGE_MS) { if (!prev) seen.set(id, { mentor: false }); continue; }
      if (!prev) {
        const a = authorOf(li);
        if (!a.id) {                               // header not rendered yet — try again next scan
          if (a.noId && cfg.author_name && a.name === cfg.author_name) unknownIds.add(id);   // his name, but no id to confirm it
          continue;
        }
        if (a.id !== cfg.author_id) { seen.set(id, { mentor: false }); continue; }
        const text = textOf(li, id), imgs = imagesOf(li, id);
        seen.set(id, { mentor: true, sig: text + "|" + imgs.map(strip).join(","), at, author: a.name });
        out.push({ id, at: new Date(at).toISOString(), author: a.name, author_id: a.id, channel: cfg.channel, text, imageUrls: imgs });
        continue;
      }
      // v1.3: one of his posts we already sent — did he edit it, or did its chart finish loading?
      if (Date.now() - at > EDIT_WINDOW_MS) continue;
      const text = textOf(li, id), imgs = imagesOf(li, id);
      const sig = text + "|" + imgs.map(strip).join(",");
      if (sig === prev.sig || (!text && !imgs.length)) continue;
      prev.sig = sig;
      out.push({ id, at: new Date(at).toISOString(), author: prev.author, author_id: cfg.author_id, channel: cfg.channel, text, imageUrls: imgs, edited: true });
    }
    if (out.length) send({ type: "msgs", msgs: out });
  }

  // v1.3: a channel scrolled up stops rendering new posts. Find the chat scroller; if it has been away from the
  // bottom for a minute, scroll it back down (no clicking) and report it either way.
  function scroller() {
    const ol = document.querySelector('ol[data-list-id="chat-messages"]');
    if (!ol) return null;
    for (let el = ol.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 4 && /scroll/i.test(el.className || "")) return el;
    return null;
  }
  function checkScroll() {
    if (!cfg || paused || where() !== "ok") { upSince = 0; return false; }
    const sc = scroller();
    const jump = [...document.querySelectorAll('[class*="jumpToPresent"], [class*="jumpTo"]')].some((e) => /jump to present/i.test(e.innerText || ""));
    const up = jump || (sc ? sc.scrollHeight - sc.scrollTop - sc.clientHeight > 400 : false);
    if (!up) { upSince = 0; return false; }
    if (!upSince) upSince = Date.now();
    if (sc && Date.now() - upSince > 60e3) { sc.scrollTop = sc.scrollHeight; autoScrolls++; upSince = Date.now(); }
    return true;
  }

  function status() {
    const items = cfg ? document.querySelectorAll(`li[id^="chat-messages-${cfg.channel}-"]`).length : 0;
    const w = where(), up = w === "ok" && checkScroll();
    send({ type: "status", state: paused ? "paused" : up ? "scrolled_up" : w, seen: items, ver: VER, url: location.pathname,
      unknown_authors: unknownIds.size, auto_scrolls: autoScrolls });
  }

  async function hello() {
    const r = await send({ type: "hello" });
    if (r) { cfg = r.cfg || null; paused = !!r.paused; }
  }

  let t = null;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 400); });
  (async () => {
    await hello();
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan(); status();
    setInterval(scan, 3000);
    setInterval(async () => { await hello(); status(); }, 30000);
    // v1.3: a second check-in path. Chrome can hold back the background's 1-minute timer when the PC is idle
    // (the 5:39 AM "offline" on 7 Oct); the open Discord tab nudges it too. The background skips duplicates.
    setInterval(() => send({ type: "beat_nudge" }), 60000);
  })();
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === "cfg") { cfg = m.cfg; paused = !!m.paused; scan(); status(); } });
})();
