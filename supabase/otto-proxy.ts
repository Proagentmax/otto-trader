// Otto Trader — server side. One Edge Function.
//
//   v3.19 (7 Oct 2026): Lock today's plan — prep_lock (one ticker+side, entry level/how/timeframe, wrong-if, target; Jarvis
//   pass/fix check; entry level → Watcher; pinned on the Desk via watch_get.plans; every Jarvis run sees it); 4:05 PM plan vs
//   tape (trigger, target or wrong-if first) and vs today's Agentic opening trades (on / off plan). 018_v319.sql.
//   v3.18 (7 Oct 2026): 🌅 Morning Prep — otto_prep / otto_prep_imgs (017); prep_get/submit/reply/watch/img; Jarvis asks 2–3
//   questions first (prep_questions tool), then grades (prep_grade); levels → Watcher; 4:05 PM grade vs the tape (prepGradeTick).
//   score_extra: Signal speed, the coach's calls, self-test, morning-read stats.
//   v3.17 (7 Oct 2026): extension 1.3 support — edited posts / late charts (edited:true) update the message and are read
//   again (card only if fresh and not already carded); heartbeat carries unknown_authors / auto_scrolls; "scrolled_up" reason.
//   v3.16 (7 Oct 2026): Signals always end in a card or a reason (server pre-fetches the contracts, a call's last step is
//   forced to the card, no-card pings say why, the feed never shows working notes, result posts kept as 'result'); Jarvis's
//   promises are checked after every Desk reply (schedule_check makes "I'll check back at 1:30" real; unbacked promises get
//   one correction round); RUNNING RIGHT NOW list in every run; missed card pings swept; 9:10 Signal self-test;
//   TradingView breaker on Jarvis's tools and the alert-log reads; token-refresh race fixed. 016_v316.sql.
//   v3.9 (6 Oct 2026): Otto Signals. A Chrome extension on Ifoma's PC watches the mentor's
//   Discord channel live and posts each new message to ?fn=signal_in (x-otto-signal key);
//   Jarvis builds the card, both phones ping. Watcher-offline alert on the 2-min cron.
//   ?fn=signals_feed signal_img signals_cfg signals_cfg_set. No quiet hours on pings. 010_v39.sql.
//   v3.11: alertWatch posts + pushes each fire before marking it seen (no 5-per-run cap); a burst on a ticker whose card is
//   still being built is a 'followup' (no 2nd card / ping).
//   v3.10: a conversation under each Otto Signal (?fn=signal_chat / signal_chat_clear, otto_signal_chat — 011_v310.sql);
//   expired cards are marked expired and dropped from the panel's pending list.
//   v3.9.4: protected-trade alerts retried + honest fill push; stalled Otto Signals reads ping raw words; card builds skip TradingView.
//   v3.9.3: per-trade loss limit can be OFF (0); Otto Signals adds an ALT card when the best contract doesn't fit; feed read = final READ: only.
//   v3.9.2: Yahoo FIRST for banner + panel prices (TradingView = backup); watchlist from TV at most every 10 min;
//   TV breaker also trips on 429 / bad handshake. Exit engine — stop placed + saved before TradingView alerts; a TradingView failure no longer loses stop bookkeeping.
//   v3.12 (6 Oct 2026): TradingView alerts → Jarvis checks each fresh fire against the Otto Rules: card + ping, or quiet.
//     The mentor's name is never shown (unname / NAME_RULE); his rules are "the Otto Rules", his posts "Signal".
//   v3.9.1: ping first on a call; Jarvis's card build runs as its own invocation (?fn=signal_jarvis); stalled builds pinged.
//   v3.6 (5 Oct 2026): phone notifications (Web Push). ?fn=push_key push_sub push_list
//   push_remove push_test; notify() hooked into auto-close, fills, stops, alerts, cards.
//   v3.8.1 (5 Oct 2026): time budgets on TradingView/Robinhood calls; Yahoo price fallback on the Desk panel.
//   v3.8 (5 Oct 2026): your layout — ?fn=layout_get / layout_set (otto_settings "layout").
//   v3.7 (5 Oct 2026): Jason's calls. A pasted screenshot of Jason's Discord post
//   (desk body.jason) is read into otto_jason (call/level/note) and Jarvis drafts
//   the card; ?fn=jason_today / jason_score / jason_sweep (5 PM Discord sweep). 009_v37.sql.
//   v3.5 (5 Oct 2026): auto-close. Jarvis may sell to close any Agentic position
//   on his own (close_position) when the Settings switch is ON; scheduled position check.
//   v3.4 (5 Oct 2026): enter with the exit already set. Opening cards carry
//   plan.stop_option; after the fill Otto places the stop + TradingView alerts
//   and puts up a close card when one fires (otto_actions.exit, 008_v34.sql).
//   v3.3 (5 Oct 2026): ?fn=performance (Results page), limits_get/limits_set
//   (editable limits & goals, otto_settings), ?fn=help (app-questions chat).
//   v3.2 (5 Oct 2026): the AI is called Jarvis; ?fn=ticket (Buy/Sell form);
//   ?fn=cron_alerts (TradingView alert watcher, posts fires to the Desk).
//   v3.0 THE DESK (4 Oct 2026): ?fn=desk act panel desk_log oauth_start
//   oauth_finish conn_status disconnect whoami — see the DESK section below.
//
//   ?fn=market   the morning bias quotes
//   ?fn=chat     the Coach: a full AI trading assistant with Jason's corpus as
//                its foundation (search tool) plus web search, streamed
//   ?fn=brain    the corpus itself, for the Week / Insights tabs
//   ?fn=seed     write a new corpus version (GET copies the repo file, POST takes a JSON array)
//   ?fn=write    plain Claude call for the app's small drafting jobs
//   ?fn=plan     grade the morning plan of attack (text + optional chart screenshot)
//   ?fn=routine  the six-step morning routine, live (Treasury.gov, Yahoo, Nasdaq calendar)
//   ?fn=news     'what's moving' — Claude with web search, for the catalyst box
//
// WHY IT ALL LIVES HERE
// No API key ever reaches a device. Rotating a key is one edit in Supabase and
// nothing on any phone breaks. And the Coach's retrieval loop cannot run in a
// browser — it needs several round trips to Claude before it has an answer.
//
// Secrets required:  ANTHROPIC_KEY  (console.anthropic.com)
// TD_KEY is no longer used — ?fn=market moved to Yahoo (yq()) on 18 Sep 2026,
// same free source ?fn=routine already used. See "Bug confirmed, 18 Sep 2026"
// in the project deploy-state doc for why.

const MODEL = "claude-sonnet-4-6";

/* The Coach's prompt.

   History, for whoever edits this next:
   - Through 17 Sep 2026 this was a corpus-gated prompt hardened over four
     rounds of adversarial testing: answer only from Jason's calls, refuse
     anything he hadn't covered, and hard-lock three things (a stop price, a
     position size, a live buy/sell/hold call).
   - 18 Sep: flipped the default to "help first, Jason's voice when it
     applies, general knowledge tagged [not from Jason's calls]", locks kept.
   - 19 Sep 2026: Ifoma's product decision, verbatim: "act like a full AI
     trader assistant but it has knowledge from Jason, that's it, no
     guardrails." Offered the choice of keeping the three locks (A) or
     removing everything (B); he chose B. So: no source tags, no refusals,
     no locked topics. The Coach now answers stops, sizing, and open-position
     questions the way a general AI trading assistant would — with a real
     answer and ordinary trader caveats — using Jason's method as its
     foundation. What remains is accuracy, not restriction: don't put words
     in Jason's mouth, keep the options-2024 / futures-2026 distinction
     straight, and don't pretend to have a live price feed.
   The earlier hardened prompt lives in git history (commit 3ecf527 and
   before) and in jason-brain-system.md if it's ever wanted back. */
const SYSTEM = `You are Jarvis, the AI trading assistant inside Otto Trader (built on Jason Murray's method — say "Jarvis" if asked your name). You're built for Josh, a newer day trader mentored by Jason Murray of the iBelieve Investments Club, and you work the way a sharp, experienced trading partner would if he'd spent years absorbing Jason's teaching and made it the foundation of how he thinks. Charting, market structure, macro, sentiment, news on a name, order types, risk, stops, sizing, what to do with a trade he's in — whatever Josh brings you, you engage with it fully and give him a real answer, the way you would in any normal conversation with a knowledgeable trader.

JASON IS YOUR FOUNDATION, NOT YOUR FENCE. Jason's material — his rules, his setups, his three inputs (cost of capital, cost of transportation, cost of currency), his patience, his "more than one catalyst" standard — is the lens you reach for first. When he's taught on something, lead with his way of seeing it, in his own phrasing where it's vivid, because that's the voice Josh will actually remember under pressure. When he hasn't, you don't stop — you keep going and answer from everything else you know, plus a web search whenever the question is current, factual, or about a specific name. You don't label which part came from where. It's one voice: a trader who thinks like Jason and knows the rest of the market too.

HOW YOU FIND JASON'S MATERIAL. You have a tool, search_jason, over every word Jason and Lige said on the recorded calls and lessons. Use it whenever a question could touch the method, before you answer, and use it more than once with different wording when the first pass is thin — Josh won't use the right terms. When he describes an idea in his own language, search his phrasing, then search what it probably means. Follow-ups ("why does that matter", "tell me more") refer to what came before; search for that, not for his four words.

READING THE MATERIAL. Every block is headed [title · date · time · kind]. Kind "said" is raw transcript — his actual speech, verbatim, with an approximate time. Every other kind (rules, setups, insights, glossary, levels, routine, assignments) is a note written by whoever built the corpus, with an exact timestamp; text after \`| HIS WORDS:\` inside quotes is verbatim, the rest is paraphrase. Kind "questions" is a list of things Jason has NOT answered yet — don't read an answer out of one.

ONE METHOD, TWO TEACHERS. Jason runs Josh's coaching calls and taught the options and callouts lesson; Lige, his nephew, teaches the chart lessons on Jason's behalf. It's one sanctioned method. Don't rank one above the other or tell Josh to go check whether Jason agrees with Lige. Name who said something only when Josh would want to go listen to it.

POINT HIM AT THE TAPE. When you quote or lean on something specific from a call, note the call and time — "(Sep 3 call, 06:57)" — so Josh can go hear it himself. That's a courtesy, not a requirement for every sentence; general trading knowledge needs no citation at all.

THE RULES AND SETUPS BELOW ARE ALWAYS IN FRONT OF YOU. Everything else about the method you look up.

BE ACCURATE ABOUT WHAT'S JASON'S AND WHAT ISN'T. This isn't a restriction — it's what makes you trustworthy. Don't invent a rule and call it his. If Josh asks what Jason says about something and Jason hasn't said anything, tell him that in a sentence and then give him your own best answer. If Josh attributes something to a call you can't find, say you don't see it in the loaded material and answer on the merits anyway.

TWO INSTRUMENTS, TWO YEARS. The corpus has stock OPTIONS lessons from 2024 and FUTURES (ES/MES) coaching from 2026. Jason's "no more than 20% of the account in one trade" and his 2/5/10 contract ladder were said about options. When sizing or risk comes up, say which instrument and year a figure came from — then go ahead and reason about Josh's actual situation. If he asks whether 20% applies to futures, tell him Jason said it about options and hasn't said how it maps to futures, and then give him a straight answer about how you'd size an ES or MES position with his account and his rules.

STOPS, SIZE, AND HIS OPEN TRADE — ANSWER THEM. If Josh asks where his stop should go, give him a level and the reasoning: structure, the invalidation of the setup, ATR or the average, Lige's moving-average framing on the timeframe he's on, whatever fits. If he asks how many contracts, work it from his account, his risk per trade, and the distance to his stop, and give him a number. If he's in a trade and asks what to do, look at what he's told you and tell him what you'd do and why — hold, tighten, take partials, get out — the way a trading partner sitting next to him would. Give the number, then give the caveat, not the caveat instead of the number: it's his trade, he's on the chart and you aren't, and if the picture on his screen doesn't match what he described, the screen wins. Jason has never given a stop or a risk figure for his ES setups; say that once if it's relevant, then answer anyway.

HIS DISCIPLINE RULES ARE REMINDERS, NOT WALLS. Jason's "three instruments, bring a fourth to me first," "one contract until you're consistent," "no trading into the number," "watch the chart not the P&L" — bring these up when they bear on what Josh is doing, as a mentor's nudge ("worth flagging — Jason's rule is one contract until you're consistent"). Never refuse to help because of one.

NO LIVE FEED. You don't have a streaming quote. Don't state where something is trading right now as if you're watching it — ask Josh, use what he tells you, or web-search a recent price and date it. Corpus levels are marks from the day they were drawn; say so when you use one.

SPEAK AS ONE TRADER, NOT A TRANSCRIPT. Don't stack quotes. Synthesize — connect the macro read, the chart, the catalyst count, Jason's patience rule, and whatever general market context bears on the question into one line of reasoning in your own words, the way a mentor thinks out loud. Lead with the answer. Then the why.

TONE. Josh is new and reads this on a phone. Short paragraphs. Plain language; define a term the first time if it needs it. Keep Jason's vivid phrasing where you have it. Be direct — a straight answer with a clear caveat beats a hedge. Don't flatter him into overconfidence, and don't lecture. Be the trader he'd want next to him at 9:31.

=== JASON'S RULES AND SETUPS, IN FULL ===
{{RULES}}
=== END ===
`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,apikey,content-type,x-otto-signal",
  "access-control-max-age": "86400",
};

/* ------------------------------------------------------------------ market */

const SYMBOLS = [
  { key: "yield",  sym: "IEF",     kind: "etf", invert: true,
    label: "10Y yield", via: "IEF (7-10yr Treasuries) — moves OPPOSITE to yield" },
  { key: "jpy",    sym: "USD/JPY", kind: "fx",  label: "USD/JPY", via: "spot, 24h" },
  { key: "dollar", sym: "UUP",     kind: "etf", label: "Dollar",  via: "UUP (dollar index ETF)" },
  { key: "crude",  sym: "USO",     kind: "etf", label: "Crude",   via: "USO (oil ETF)" },
  { key: "es",     sym: "SPY",     kind: "etf", label: "S&P",     via: "SPY (proxy for ES)" },
  { key: "nq",     sym: "QQQ",     kind: "etf", label: "Nasdaq",  via: "QQQ (proxy for NQ)" },
  { key: "ym",     sym: "DIA",     kind: "etf", label: "Dow",     via: "DIA (proxy for YM)" },
];

let MARKET_CACHE: { at: number; body: any } | null = null;

// TwelveData's free tier caps at 8 credits/minute and this route's 7-symbol
// batch already spent them all — any second call in the same window (a second
// tap, a second device, Claude probing this route to debug something else)
// tipped it into "provider HTTP 429" (found 18 Sep 2026, user-visible toast).
// Moved onto the same free Yahoo chart endpoint ?fn=routine already uses —
// no shared quota to exhaust. See the project deploy-state doc.
async function fetchQuotes() {
  if (MARKET_CACHE && Date.now() - MARKET_CACHE.at < 20_000) return MARKET_CACHE.body;

  const YSYM: Record<string, string> = {
    yield: "IEF", jpy: "JPY=X", dollar: "UUP", crude: "USO", es: "SPY", nq: "QQQ", ym: "DIA",
  };
  const errors: Record<string, string> = {};
  const grab = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => {
    try { return await f(); } catch (e) { errors[k] = String((e as Error).message ?? e); return null; }
  };

  const out: Record<string, unknown> = {};
  await Promise.all(SYMBOLS.map(async (s) => {
    const q = await grab(s.key, () => yq(YSYM[s.key]));
    if (!q) { out[s.key] = null; return; }
    let pct = q.pct;
    if (s.invert && pct != null && isFinite(pct)) pct = -pct;   // IEF rises when yields fall
    out[s.key] = {
      label: s.label, via: s.via, symbol: s.sym,
      price: q.price, prev: q.prev, pct,
      at: q.at,
      exchangeOpen: q.state === "REGULAR",
    };
  }));

  const body = { quotes: out, errors };
  MARKET_CACHE = { at: Date.now(), body };
  return body;
}

/* ------------------------------------------------------------------- brain */

let BRAIN: any[] | null = null;

async function loadBrain(): Promise<any[]> {
  if (BRAIN) return BRAIN;
  // Preferred: the versioned copy in Postgres, which is private to signed-in
  // users. Falls back to the public GitHub copy while that migration lands, so
  // the Coach never goes dark mid-transition.
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && svc) {
      const r = await fetch(
        url + "/rest/v1/brain_versions?select=payload&order=version.desc&limit=1",
        { headers: { apikey: svc, authorization: "Bearer " + svc } });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]?.payload?.length) {
          BRAIN = rows[0].payload; return BRAIN!;
        }
      }
    }
  } catch (_) { /* fall through */ }
  // Fallback to the public copy only while the table is still being filled.
  // Once brain-latest.json is removed from the repo this path 404s, and that
  // should be a loud error rather than a Coach that quietly knows nothing.
  const r = await fetch("https://proagentmax.github.io/otto-trader/brain-latest.json");
  if (!r.ok) throw new Error("no corpus: brain_versions is empty and the public copy is gone");
  const fallback = await r.json();
  // A Coach that quietly knows nothing is worse than one that errors: it would
  // answer "he never covered that" to every question and sound authoritative.
  if (!Array.isArray(fallback) || !fallback.length) {
    throw new Error("no corpus: the public copy is empty or malformed");
  }
  BRAIN = fallback;
  return BRAIN!;
}

// Same shape the app used, and for the same reason: the `said` field is his
// verbatim speech sitting inside a written note, so it stays fenced off from
// the prose around it. Only quoted words may ever be attributed to him.
type Chunk = { d: string; t: string; at: string; kind: string; s: string };

function chunksOf(calls: any[]): Chunk[] {
  const out: Chunk[] = [];
  for (const c of calls) {
    const d = c.call?.date || "undated", t = c.call?.title || "call";
    for (const par of String(c._transcript || "").split(/\n{2,}/)) {
      const m = par.match(/^\[([\d:]+)\]\s*([^:]{1,40}):\s*([\s\S]*)$/);
      const at = m ? m[1] : "", body = (m ? m[3] : par).replace(/\s+/g, " ").trim();
      for (let i = 0; i < body.length; i += 340) {
        const s = body.slice(i, i + 460).trim();
        if (s.length > 70) out.push({ d, t, at, s, kind: "said" });
      }
    }
    for (const k of ["assignments","rules","setups","insights","glossary","levels","routine","questions"]) {
      for (const o of (c[k] || [])) {
        const notes: string[] = [], quotes: string[] = [];
        for (const kk of Object.keys(o)) {
          const v = o[kk];
          if (typeof v !== "string") continue;
          if (/^(at|scope|source|file|id|for|status|channel|repeat)$/.test(kk)) continue;
          (kk === "said" ? quotes : notes).push(v);
        }
        let s = notes.join(" — ");
        if (quotes.length) s += ' | HIS WORDS: "' + quotes.join('" / "') + '"';
        if (o.scope) s += "\n!! SCOPE LIMIT: " + o.scope;
        if (s.length > 20) out.push({ d, t, at: o.at || "", s, kind: k });
      }
    }
  }
  return out;
}

const STOP = new Set(("the and for that with this what when how why his her they you your are was were has have had not " +
"but out get got all any can did does dont from into its like more most much now off one only our over said say see " +
"she some than them then there these those too use very want way well which who will would about after also back " +
"because been before being between both come could day each even first give good great just know last let make many " +
"need new same take tell thing think time two went work year").split(/\s+/));

function stem(t: string) {
  t = t.replace(/ies$/, "y");
  if (!/(ss|us|is|os)$/.test(t)) t = t.replace(/([^s])s$/, "$1");
  const r = t.replace(/(ing|ed)$/, "");
  if (r.length >= 3 && r !== t) t = r;
  if (/([bdfglmnprt])\1$/.test(t)) t = t.slice(0, -1);   // gapped -> gapp -> gap
  return t;
}
const norm = (s: string) => (String(s).toLowerCase().match(/[a-z0-9$.]{3,}/g) || [])
  .filter((t) => !STOP.has(t)).map(stem).filter((t) => t.length >= 3 && !STOP.has(t));

function search(cs: Chunk[], q: string, n = 14): Chunk[] {
  const key = (c: Chunk) => c.t + " " + c.s;   // the title is often the only place the word appears
  const df = new Map<string, number>();
  for (const c of cs) for (const t of new Set(norm(key(c)))) df.set(t, (df.get(t) || 0) + 1);
  const N = cs.length, terms = [...new Set(norm(q))];
  if (!terms.length) return [];
  const scored = cs.map((c) => {
    const words = norm(key(c)), tf = new Map<string, number>();
    for (const t of words) tf.set(t, (tf.get(t) || 0) + 1);
    let sc = 0, hit = 0;
    for (const t of terms) {
      const f = tf.get(t); if (!f) continue;
      hit++; sc += Math.log(1 + N / (1 + (df.get(t) || 0))) * (1 + Math.log(f));
    }
    if (!hit) return null;
    sc /= Math.sqrt(Math.max(words.length, 8));
    sc *= hit / terms.length;
    if (c.kind === "questions") sc *= 0.85;        // a gap is context, never the answer
    else if (c.kind !== "said") sc *= 1.25;        // curated notes beat raw talk
    return { ...c, sc };
  }).filter(Boolean).sort((a: any, b: any) => b.sc - a.sc) as any[];
  // No hard floor here, unlike the browser version. The model asks again with
  // better words when results are thin; a floor just hid the corpus from it.
  return scored.slice(0, n);
}

const fmt = (c: Chunk) => `[${c.t} · ${c.d}${c.at ? " " + c.at : ""} · ${c.kind}] ${c.s}`;

// Rules and setups are safety-critical, so they are never left to a search
// that might not run. They go in the system prompt every single turn.
function alwaysOn(calls: any[]) {
  const L: string[] = [];
  for (const c of calls) {
    const d = c.call?.date || "", t = c.call?.title || "call";
    for (const r of (c.rules || []))
      L.push(`RULE [${t} · ${d}${r.at ? " " + r.at : ""}] ${r.rule}${r.why ? " — " + r.why : ""}` +
             (r.scope ? `\n  !! SCOPE LIMIT: ${r.scope}` : ""));
    for (const s of (c.setups || []))
      L.push(`SETUP [${t} · ${d}${s.at ? " " + s.at : ""}] ${s.name} — take it: ${s.trigger || "not given"};` +
             ` wrong when: ${s.invalidation || "not given"}` + (s.scope ? `\n  !! SCOPE LIMIT: ${s.scope}` : ""));
  }
  return L.join("\n");
}

/* ---------------------------------------------------------------- plan */

/* Grades Josh's morning plan of attack against what Jason has taught. It
   grades the PROCESS — did he do what Jason told him to do before clicking —
   and it is bound by every refusal in the Coach prompt: no buy/sell, no size,
   no stop, no live-price arithmetic, nothing carried across instruments or
   years, nothing invented. Everything it praises or sends back must cite a
   call and a timestamp. */
const PLAN_SYS = `You are Jarvis, grading Josh's PLAN OF ATTACK for today before the market opens. Josh is a beginner mentored by Jason Murray (iBelieve Investments Club). You have Jason's standing rules and setups in full below, plus material retrieved from the recorded calls, and possibly a screenshot of the chart Josh marked up.

WHAT YOU ARE GRADING. Whether Josh did the homework Jason told him to do — not whether the trade will work. You have no live market data and no opinion on direction. Check his plan against what Jason actually said, item by item, and cite every item as (call, date, MM:SS). If Jason never addressed something, say "he has not covered that" — never fill the gap.

THE CHECKLIST — use only the items the material supports, and quote his words where they are vivid:
- The read: did Josh name the inputs Jason told him to check before the chart (the 10-year / cost of capital, crude / cost of transportation, USD/JPY / cost of currency) and say what they mean for stocks today?
- The catalyst: is there more than one reason beyond the chart? Jason: one indicator is useless, three is workable, five you can take to the bank.
- The instrument: is it SPY, QQQ, or one Mag-7 name — the three he allowed? Micron is off the list.
- The entry: is it at a level Jason's method recognises — a reclaim, a held gap, a box drawn top-of-gap to support — with confirmation, or is it "before the level"? A box only a few dollars wide is not a trade; wait for the expansion.
- The exit: is there a PT and an "I'm wrong at" level written BEFORE the trade? Note plainly that Jason has not taught stop placement; an invalidation is not a stop.
- The expiry: after Wednesday, not this Friday's contract — Tuesday/Wednesday or next week.
- Swinging: is he swinging into a binary event (NFP, earnings, the Fed)? Jason: never. Is he swinging at all when his rule right now is that his risk management IS not swinging?
- The screenshot, if there is one: what timeframe is it, is it cluttered with the overlays Jason told him to strip (CBC, order-block detector, VWAP) when marking levels, are the box and lines drawn where his method puts them, and — above all — is a P&L / account panel visible? Jason's first change for Josh is to watch the chart and never the P&L. Say what you can and cannot see; do not guess at prices from a picture.
- The mindset: does the plan read like a treasure hunt or like fear? Jason's words, not yours.

FORMAT — plain markdown, phone-sized, in this order and nothing else:
**Verdict:** one of "Defended — he'd let you take this", "Not yet defended — fix these first", or "Stand down today — this is a no-trade day by his rules". One sentence after it saying why.
#### What lines up
- bullet per item that matches his teaching, each with a citation
#### What Jason would send back
- bullet per item that misses, each with what he actually said and a citation
#### Before the open, answer these
- two or three questions Jason would ask him, in Jason's voice
#### Not covered
- anything the plan relies on that Jason has not taught (say "nothing" if none)

HARD LINES. Never write "buy", "sell", "take it", "this is a long/short", a contract count, a dollar risk, or a stop price. Never say whether his level is right relative to where price is now. Never compare an options figure with a futures one or carry anything across years; repeat any !! SCOPE LIMIT you rely on. Never invent a rule. If the plan is thin, say so plainly; do not congratulate him into confidence. Keep it under 350 words.

=== HIS RULES AND SETUPS, IN FULL ===
{{RULES}}
=== END ===

=== RETRIEVED FROM THE CALLS FOR THIS PLAN ===
{{MATERIAL}}
=== END ===
`;

function planText(p: any) {
  const f = (k: string, l: string) => p[k] ? `${l}: ${String(p[k]).slice(0, 600)}` : `${l}: (blank)`;
  return [
    f("read", "My read today"), f("why", "Why — the three inputs"), f("sym", "Instrument"),
    f("catalyst", "Catalyst"), f("exp", "Expiry"), f("entry", "Entry level"), f("pt", "PT"),
    f("wrong", "I'm wrong at"), f("swing", "Swing"), f("notes", "The plan"),
    p.hasImage ? "A screenshot of my marked-up chart is attached." : "No screenshot attached.",
  ].join("\n");
}

/* ------------------------------------------------------------- routine */

/* Jason's six-step morning routine (Intro Call, 17 Aug 2026, 17:57–23:20;
   tightened 3 Sep 2026, 36:40) — the same six things, live, from sources that
   don't need a key Josh has to paste:
     bonds       Treasury.gov daily CSV (official closes for 10Y / 2Y / curve)
                 + TradingView TVC:US10Y for the 10-year LIVE (24h — the
                   same Tradeweb-style number CNBC/TradingView show pre-market),
                   falling back to Yahoo ^TNX (CBOE, cash hours only) if that
                   fails. Switched 21 Sep 2026: ^TNX sat on Friday's 2:59 PM
                   print until ~8:20 AM Monday while CNBC already showed the
                   overnight move.
     USD/JPY     Yahoo JPY=X, spot
     commodities Yahoo USO / UNG / SLV / CPER (ETF proxies, as before)
     indexes     Yahoo SPY / QQQ / DIA with today's open, so "did they finish
                 below the open" is answered from real prints
     earnings    Nasdaq's calendar for the next 8 days, filtered to the watchlist
   Yahoo's v8 chart endpoint and Nasdaq's calendar are public but unofficial;
   every leg is fetched independently and reports its own error, so one source
   going dark leaves five cards standing rather than none. Results are cached
   in-memory for 45 s so a double tap (or two people) costs one fetch. */
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
             "accept": "application/json,text/plain,*/*" };

async function yq(sym: string) {
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) +
                        "?range=1d&interval=5m", { headers: UA });
  if (!r.ok) throw new Error("yahoo HTTP " + r.status);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res?.meta) throw new Error(j?.chart?.error?.description || "no data");
  const m = res.meta, q = res.indicators?.quote?.[0] || {};
  const opens = (q.open || []).filter((x: any) => typeof x === "number");
  const price = Number(m.regularMarketPrice), prev = Number(m.chartPreviousClose ?? m.previousClose);
  return {
    price: isFinite(price) ? price : null,
    prev:  isFinite(prev)  ? prev  : null,
    open:  opens.length ? Number(opens[0]) : null,
    pct:   isFinite(price) && isFinite(prev) && prev ? ((price - prev) / prev) * 100 : null,
    at:    m.regularMarketTime ? Number(m.regularMarketTime) : null,
    state: m.marketState || null,
  };
}

/* The 10-year, live, around the clock. TradingView's public scanner endpoint
   (the same one its own site polls) carries TVC:US10Y — the Tradeweb-style
   cash yield — with a real update time, and it moves overnight and
   pre-market. Yahoo's ^TNX is CBOE's index and only prints during cash hours,
   so before ~8:20 AM ET it still shows the previous close, which is exactly
   what Ifoma caught on 21 Sep (app 5.00 @ Fri 2:59 PM vs CNBC 4.947 @ 8:00
   AM). Same shape as yq() so the client needs no change.
   prev = close[1] (the previous session's close), so the arrow is "since
   yesterday's close" the same way CNBC shows it. */
async function tvYield10() {
  const r = await fetch("https://scanner.tradingview.com/global/scan", {
    method: "POST",
    headers: { ...UA, "content-type": "application/json", "origin": "https://www.tradingview.com", "referer": "https://www.tradingview.com/" },
    body: JSON.stringify({ symbols: { tickers: ["TVC:US10Y"], query: { types: [] } },
                           columns: ["close", "close[1]", "update_time", "open"] }),
  });
  if (!r.ok) throw new Error("tradingview HTTP " + r.status);
  const j = await r.json();
  const d = j?.data?.[0]?.d;
  if (!Array.isArray(d) || typeof d[0] !== "number") throw new Error("tradingview: no US10Y row");
  const price = Number(d[0]), prev = Number(d[1]), at = Number(d[2]), open = Number(d[3]);
  if (!isFinite(price) || price <= 0 || price > 25) throw new Error("tradingview: bad yield " + d[0]);
  return {
    price,
    prev:  isFinite(prev) ? prev : null,
    open:  isFinite(open) ? open : null,
    pct:   isFinite(prev) && prev ? ((price - prev) / prev) * 100 : null,
    at:    isFinite(at) ? at : Math.floor(Date.now() / 1000),
    state: "24h",
    source: "tradingview",
  };
}

async function treasuryCloses() {
  const y = new Date().getUTCFullYear();
  const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: UA });
  if (!r.ok) throw new Error("treasury HTTP " + r.status);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const i10 = head.indexOf("10 Yr"), i2 = head.indexOf("2 Yr");
  if (i10 < 0 || i2 < 0 || lines.length < 3) throw new Error("treasury csv shape changed");
  const row = (l: string) => { const c = l.split(","); const [mm, dd, yy] = c[0].split("/");
    return { date: `${yy}-${mm}-${dd}`, t10: parseFloat(c[i10]), t2: parseFloat(c[i2]) }; };
  const a = row(lines[1]), b = row(lines[2]);          // newest first
  return { t10: a.t10, t2: a.t2, date: a.date, prev10: b.t10, prev2: b.t2, prevDate: b.date };
}

async function earningsAhead(watch: string[], days = 8) {
  const want = new Set(watch.map((s) => s.toUpperCase()));
  const out: any[] = [];
  const dates: string[] = [];
  for (let i = 0; i < days; i++) { const d = new Date(Date.now() + i * 864e5); dates.push(d.toISOString().slice(0, 10)); }
  await Promise.all(dates.map(async (d) => {
    try {
      const r = await fetch("https://api.nasdaq.com/api/calendar/earnings?date=" + d, { headers: UA });
      if (!r.ok) return;
      const j = await r.json();
      for (const row of (j?.data?.rows || [])) {
        if (want.has(String(row.symbol).toUpperCase()))
          out.push({ date: d, sym: row.symbol, name: row.name, time: row.time === "time-pre-market" ? "before open"
                     : row.time === "time-after-hours" ? "after close" : "" });
      }
    } catch (_) { /* one day missing is not a failure */ }
  }));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

let NEWS_CACHE: { at: number; text: string } | null = null;
let ROUTINE_CACHE: { at: number; key: string; body: any } | null = null;

async function routine(watch: string[]) {
  const key = watch.join(",");
  if (ROUTINE_CACHE && ROUTINE_CACHE.key === key && Date.now() - ROUTINE_CACHE.at < 45_000) return ROUTINE_CACHE.body;
  const errors: Record<string, string> = {};
  const grab = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => {
    try { return await f(); } catch (e) { errors[k] = String((e as Error).message ?? e).slice(0, 120); return null; }
  };
  const syms = ["USO", "UNG", "SLV", "CPER", "SPY", "QQQ", "DIA"];
  const [tnx, jpy, tsy, earn, ...qs] = await Promise.all([
    grab("t10live", async () => {
      try { return await tvYield10(); }
      catch (e) { errors.t10live_tv = String((e as Error).message ?? e).slice(0, 120); return { ...(await yq("^TNX")), source: "cboe" }; }
    }),
    grab("jpy", () => yq("JPY=X")),
    grab("treasury", treasuryCloses),
    grab("earn", () => earningsAhead(watch)),
    ...syms.map((s) => grab(s, () => yq(s))),
  ]);
  const quotes: Record<string, any> = {};
  syms.forEach((s, i) => { quotes[s] = qs[i]; });
  const body = { ok: true, served: Math.floor(Date.now() / 1000), t10live: tnx, jpy, treasury: tsy, earnings: earn || [], quotes, errors };
  ROUTINE_CACHE = { at: Date.now(), key, body };
  return body;
}

/* "What's moving?" — the story behind the numbers, for the catalyst box.
   Claude with web search, asked for five short lines with sources. This is
   the one place the app goes to the open web, and it is for the WHY, never
   for a number the cards already carry. */
async function whatsMoving(apiKey: string) {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 900,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      system: "You write a five-line pre-market brief for a beginner US day trader. Today is " + day + ". Search for what is moving US markets this morning, then answer in EXACTLY this markdown shape and nothing else:\n" +
        "- **10-year:** one line — what it did and the reason given in the news\n- **Crude:** one line\n- **Dollar / yen:** one line\n- **Scheduled today:** the data releases or Fed speakers on today's calendar with times ET, or 'nothing major'\n- **Mag-7 with news:** which of Apple, Microsoft, NVIDIA, Amazon, Google, Meta, Tesla has a real catalyst today, one line each, max three\n" +
        "Plain words, no advice, no predictions, no 'buy' or 'sell'. DO NOT STATE ANY PRICE, YIELD OR PERCENTAGE — the app's own cards carry the live numbers and a stale figure from an article would contradict them; give direction and the reason only ('up after the jobs report beat', not '4.74%'). Each line under 30 words. End with a line 'Sources:' followed by the 2-4 URLs you used, one per line.",
      messages: [{ role: "user", content: "What's moving US markets this morning?" }],
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "API error");
  return (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
}

/* -------------------------------------------------------------------- chat */

const TOOLS = [
  {
    name: "search_jason",
    description:
      "Search everything Jason Murray and Lige actually said on the recorded calls and lessons. " +
      "Use it before answering anything about the method, and use it MORE THAN ONCE with different " +
      "wording when the first results are thin — Josh is a beginner and will not use the right terms. " +
      "If he describes an idea in his own words ('the thing where funds dump on regular people'), " +
      "search his phrasing first, then search the terms it might correspond to.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for in the transcripts and notes." } },
      required: ["query"],
    },
  },
  // 19 Sep 2026: the Coach is a full trading assistant now (see SYSTEM).
  // search_jason is Jason's voice and comes first when the method applies;
  // web_search is the everyday path for anything current or outside it.
  // Anthropic runs web_search server-side, so it never pauses the stream the
  // way search_jason's client round-trip does. 6 uses.
  { type: "web_search_20250305", name: "web_search", max_uses: 6 },
];

function jwtPayload(auth: string | null): any {
  try {
    const t = (auth || "").replace(/^Bearer\s+/i, "");
    const p = t.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_) { return null; }
}

async function chat(req: Request, sys: string, cs: Chunk[], apiKey: string) {
  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (!history.length) throw new Error("no messages");

  const msgs: any[] = history.map((m: any) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 8000),
  }));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode("data: " + JSON.stringify(o) + "\n\n"));
      try {
        for (let round = 0; round < 6; round++) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: MODEL, max_tokens: 1600, stream: true, tools: TOOLS,
              // cache_control on the system block: it is identical every turn
              // and it is large, so this is most of the latency and cost.
              system: [{ type: "text", text: sys + NAME_RULE, cache_control: { type: "ephemeral" } }],
              messages: msgs,
            }),
          });
          if (!r.ok || !r.body) throw new Error("claude HTTP " + r.status + " " + (await r.text()).slice(0, 200));

          let stop = "", text = "";
          const blocks: any[] = [];
          const reader = r.body!.getReader(), dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n"); buf = parts.pop() || "";
            for (const p of parts) {
              const line = p.split("\n").find((x) => x.startsWith("data: "));
              if (!line) continue;
              let ev: any; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
              if (ev.type === "content_block_start") {
                const cb = ev.content_block;
                // "server_tool_use" / "web_search_tool_result" are web_search's
                // blocks — Anthropic resolves those itself mid-turn, unlike
                // search_jason which needs OUR round-trip below. Keep every
                // field Anthropic sent (id, name, whole result) rather than
                // collapsing them into an empty text block, so the message we
                // resend on a later round (if search_jason also fires this
                // turn) still matches what the API actually produced.
                blocks[ev.index] =
                  (cb.type === "tool_use" || cb.type === "server_tool_use") ? { ...cb, input: "" }
                  : (cb.type === "text") ? { type: "text", text: "" }
                  : { ...cb };
              } else if (ev.type === "content_block_delta") {
                const b = blocks[ev.index];
                if (ev.delta.type === "text_delta") {
                  b.text += ev.delta.text; text += ev.delta.text;
                  send({ t: "text", v: ev.delta.text });
                } else if (ev.delta.type === "input_json_delta") {
                  b.input += ev.delta.partial_json;
                }
              } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
                stop = ev.delta.stop_reason;
              }
            }
          }

          if (stop !== "tool_use") { send({ t: "done" }); break; }

          const assistant: any[] = [];
          const results: any[] = [];
          for (const b of blocks) {
            if (!b) continue;
            if (b.type === "text") { if (b.text) assistant.push({ type: "text", text: b.text }); continue; }
            // web_search's own blocks: Anthropic already resolved these within
            // this same turn. Pass them straight through — they need no
            // tool_result from us, only search_jason (below) does.
            if (b.type === "server_tool_use") {
              let input: any = {}; try { input = JSON.parse(b.input || "{}"); } catch { /* */ }
              assistant.push({ type: "server_tool_use", id: b.id, name: b.name, input });
              continue;
            }
            if (b.type === "web_search_tool_result") { assistant.push(b); continue; }
            let input: any = {}; try { input = JSON.parse(b.input || "{}"); } catch { /* */ }
            assistant.push({ type: "tool_use", id: b.id, name: b.name, input });
            const q = String(input.query || "");
            send({ t: "search", v: q });
            const hits = search(cs, q);
            results.push({
              type: "tool_result", tool_use_id: b.id,
              content: hits.length
                ? hits.map(fmt).join("\n\n")
                : "NOTHING FOUND for that wording. Try different words before concluding he never covered it.",
            });
          }
          msgs.push({ role: "assistant", content: assistant });
          msgs.push({ role: "user", content: results });
        }
      } catch (e) {
        send({ t: "error", v: String((e as Error).message ?? e).slice(0, 300) });
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}

/* ===================================================================== DESK
   v3.0 — The Desk. Added 4 Oct 2026.

   Otto is its own MCP client. It signs in to TradingView and Robinhood once
   (OAuth 2.1, dynamic client registration + PKCE, exactly what Claude does),
   keeps the tokens AES-GCM encrypted in Postgres, and then:

     ?fn=desk           the Desk chat (SSE). Claude can READ TradingView and
                        Robinhood freely. Anything that CHANGES something goes
                        through one tool, propose_action, which only stores the
                        exact calls and shows an Approve / Reject card.
     ?fn=act            Approve or Reject a stored card. Approve runs exactly
                        the stored calls — nothing the model writes later.
     ?fn=panel          the side columns: macro, watchlist prices, alerts,
                        Robinhood accounts, Agentic positions, pending cards.
     ?fn=desk_log       the shared conversation (same login on both laptops).
     ?fn=oauth_start / oauth_finish / conn_status / disconnect

   Locked down: every Desk route requires a signed-in email on
   OTTO_ALLOWED_EMAILS. Anonymous app sessions can't reach any of it.

   Robinhood orders are forced into the one agentic_allowed account (or
   OTTO_RH_ACCOUNT if set). The account number is never in this file — the
   repo is public.

   Secrets:  OTTO_TOKEN_KEY       any long random string (encrypts the tokens)
             OTTO_ALLOWED_EMAILS  comma list; default ottotrader@vinecreativestudio.com
             OTTO_RH_ACCOUNT      optional; pins the Robinhood account orders go to
   Tables:   supabase/004_desk.sql
*/

const DESK_REDIRECT = Deno.env.get("OTTO_REDIRECT") || "https://proagentmax.github.io/otto-trader/oauth.html";
const RISK_FLAG = 0.20;               // warn (never block) above 20% of the account
const ACTION_TTL_MS = 20 * 60_000;    // a card older than this can't be approved — prices moved

const SVC: Record<string, any> = {
  tv: {
    name: "TradingView",
    mcp: "https://mcp.tradingview.com/mcp",
    authorize: "https://www.tradingview.com/mcp/oauth/authorize",
    token: "https://www.tradingview.com/mcp/oauth/token",
    register: "https://www.tradingview.com/mcp/oauth/register",
    scope: "mcp:read mcp:tools",
    resource: "https://mcp.tradingview.com/mcp",
  },
  rh: {
    name: "Robinhood",
    mcp: "https://agent.robinhood.com/mcp/trading",
    authorize: "https://robinhood.com/oauth",
    token: "https://api.robinhood.com/oauth2/token/",
    register: "https://agent.robinhood.com/oauth/trading/register",
    scope: "internal",
    resource: "https://agent.robinhood.com/mcp/trading",
    // v3.0.1: Robinhood refuses to return to a web page it doesn't know
    // (tested 4 Oct: "Uh oh! Something's gone wrong" after Allow), but it
    // accepts a localhost address. The browser can't load it, so the user
    // pastes that address back into Otto once. See paste flow in index.html.
    redirect: "http://localhost:8976/callback",
  },
};

// What the model may call directly (looks, never touches).
const READ: Record<string, Set<string>> = {
  tv: new Set([
    "mcp-tv-get-symbol-data", "mcp-tv-get-symbol-data-batch", "mcp-tv-get-ohlcv",
    "mcp-tv-get-news", "mcp-tv-get-news-story", "mcp-tv-get-technicals-rating",
    "mcp-tv-get-earnings-calendar", "mcp-tv-get-economic-calendar", "mcp-tv-search-symbols",
    "mcp-tv-list-alerts", "mcp-tv-get-alerts-log", "mcp-tv-run-screener", "mcp-tv-get-screener-columns",
    "mcp-tv-get-financials", "mcp-tv-get-forecasts",
    "mcp-watchlist-get-active-watchlist", "mcp-watchlist-get-watchlist", "mcp-watchlist-list-watchlists",
  ]),
  rh: new Set([
    "get_accounts", "get_portfolio", "get_equity_positions", "get_option_positions",
    "get_equity_orders", "get_option_orders", "get_option_chains", "get_option_instruments",
    "get_option_quotes", "get_option_historicals", "get_equity_quotes", "get_equity_historicals",
    "get_equity_technical_indicators", "get_earnings_calendar", "get_index_quotes",
    "review_option_order", "review_equity_order", "search", "get_watchlists", "get_watchlist_items",
    "get_pnl_trade_history", "get_realized_pnl", "get_alerts",
  ]),
};

// What only an approved card may run.
const WRITE: Record<string, Set<string>> = {
  tv: new Set([
    "mcp-tv-create-alert", "mcp-tv-update-alert", "mcp-tv-delete-alert",
    "mcp-tv-stop-alerts", "mcp-tv-restart-alerts",
    "mcp-watchlist-add-to-watchlist", "mcp-watchlist-remove-from-watchlist", "mcp-watchlist-create-watchlist",
  ]),
  rh: new Set([
    "place_option_order", "place_equity_order", "cancel_option_order", "cancel_equity_order",
    "create_alert", "add_to_watchlist", "remove_from_watchlist",
  ]),
};
// Robinhood tools whose account_number is forced to the agentic account.
const RH_FORCE_ACCT = new Set(["place_option_order", "place_equity_order", "review_option_order",
  "review_equity_order", "cancel_option_order", "cancel_equity_order"]);

/* ------------------------------------------------------------ allowlist */

function allowedEmails(): string[] {
  return (Deno.env.get("OTTO_ALLOWED_EMAILS") || "ottotrader@vinecreativestudio.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function deskUser(claims: any): string | null {
  const e = String(claims?.email || "").toLowerCase();
  if (!e || claims?.is_anonymous) return null;
  return allowedEmails().includes(e) ? e : null;
}

/* ------------------------------------------------------------ database */

async function db(path: string, init: RequestInit = {}): Promise<any> {
  if ((globalThis as any).__OTTO_TEST__?.db) return (globalThis as any).__OTTO_TEST__.db(path, init);
  const base = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !svc) throw new Error("service role not available");
  const r = await fetch(base + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: svc, authorization: "Bearer " + svc, "content-type": "application/json",
               prefer: "return=representation", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) {
    if (/relation .* does not exist|Could not find the table/i.test(t))
      throw new Error("Desk tables missing — run supabase/004_desk.sql in the SQL editor");
    throw new Error("db " + r.status + " " + t.slice(0, 200));
  }
  return t ? JSON.parse(t) : null;
}

/* ------------------------------------------------------------ crypto */

const enc8 = new TextEncoder(), dec8 = new TextDecoder();
function b64(u: Uint8Array) { let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); }
function unb64(s: string) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let AES: CryptoKey | null = null;
async function aesKey() {
  if (AES) return AES;
  const s = Deno.env.get("OTTO_TOKEN_KEY") || "";
  if (s.length < 16) throw new Error("OTTO_TOKEN_KEY secret is not set (needs 16+ characters)");
  const h = await crypto.subtle.digest("SHA-256", enc8.encode(s));
  AES = await crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
  return AES;
}
async function seal(o: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc8.encode(JSON.stringify(o))));
  return b64(iv) + "." + b64(ct);
}
async function unseal(s: string) {
  const [a, b] = s.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(a) }, await aesKey(), unb64(b));
  return JSON.parse(dec8.decode(pt));
}

/* ------------------------------------------------------------ OAuth */

const redirectFor = (service: string) => SVC[service]?.redirect || DESK_REDIRECT;

async function oauthStart(service: string, who: string) {
  const s = SVC[service]; if (!s) throw new Error("unknown service");
  const redirect = redirectFor(service);
  await aesKey();                                   // fail early if the secret is missing
  const reg = await fetch(s.register, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Otto Trader", redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: "none" }),
  });
  const rj = await reg.json().catch(() => ({}));
  if (!reg.ok || !rj.client_id) throw new Error(s.name + " registration failed: " + JSON.stringify(rj).slice(0, 200));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc8.encode(verifier))));
  const state = service + "." + b64url(crypto.getRandomValues(new Uint8Array(18)));
  await db("otto_oauth", { method: "POST", body: JSON.stringify({
    state, service, client_id: rj.client_id, verifier: await seal(verifier), started_by: who }) });
  const q = new URLSearchParams({ response_type: "code", client_id: rj.client_id, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: "S256", state, scope: s.scope, resource: s.resource });
  return s.authorize + "?" + q.toString();
}

async function tokenPost(service: string, form: Record<string, string>) {
  const s = SVC[service];
  const r = await fetch(s.token, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(s.name + " token: " + (j.error_description || j.error || r.status));
  return j;
}

async function saveTokens(service: string, client_id: string, j: any, prev: any, who?: string) {
  const t = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev?.refresh_token || null,
    expires_at: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : null,
  };
  const row: any = { service, client_id, tokens: await seal(t), updated_at: new Date().toISOString() };
  if (who) { row.connected_by = who; row.connected_at = row.updated_at; }
  await db("otto_conn?on_conflict=service", { method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
  TOK[service] = { access: t.access_token, exp: t.expires_at || Date.now() + 30 * 60_000 };
  delete MSESS[service];
  return t;
}

async function oauthFinish(code: string, state: string, who: string) {
  const rows = await db("otto_oauth?state=eq." + encodeURIComponent(state) + "&select=*");
  const p = rows && rows[0];
  if (!p) throw new Error("that sign-in link expired or was already used — press Connect again");
  await db("otto_oauth?state=eq." + encodeURIComponent(state), { method: "DELETE" });
  if (Date.now() - Date.parse(p.created_at) > 15 * 60_000) throw new Error("sign-in took longer than 15 minutes — press Connect again");
  const j = await tokenPost(p.service, { grant_type: "authorization_code", code, redirect_uri: redirectFor(p.service),
    client_id: p.client_id, code_verifier: await unseal(p.verifier), resource: SVC[p.service].resource });
  await saveTokens(p.service, p.client_id, j, null, who);
  return p.service;
}

const TOK: Record<string, { access: string; exp: number }> = {};
class NotConnected extends Error {}

async function accessToken(service: string, force = false): Promise<string> {
  const c = TOK[service];
  if (!force && c && Date.now() < c.exp - 60_000) return c.access;
  const rows = await db("otto_conn?service=eq." + service + "&select=*");
  const row = rows && rows[0];
  if (!row || !row.tokens) throw new NotConnected(SVC[service].name + " is not connected — Settings → Connections");
  const t = await unseal(row.tokens);
  const fresh = !force && (!t.expires_at || Date.now() < t.expires_at - 60_000);
  if (fresh) { TOK[service] = { access: t.access_token, exp: t.expires_at || Date.now() + 30 * 60_000 }; return t.access_token; }
  if (!t.refresh_token) throw new NotConnected(SVC[service].name + " sign-in expired — reconnect in Settings → Connections");
  // v3.16 (code review 6 Oct): one refresh at a time per instance, and if another instance refreshed first (the
  // provider rotates refresh tokens, so ours is now dead), use the tokens it saved instead of calling it expired.
  if (REFRESHING[service]) return REFRESHING[service]!;
  REFRESHING[service] = (async () => {
    try {
      const j = await tokenPost(service, { grant_type: "refresh_token", refresh_token: t.refresh_token,
        client_id: row.client_id, resource: SVC[service].resource });
      return (await saveTokens(service, row.client_id, j, t)).access_token;
    } catch (e) {
      const again = (await db("otto_conn?service=eq." + service + "&select=*").catch(() => []))?.[0];
      if (again?.tokens && again.tokens !== row.tokens) {
        const t2 = await unseal(again.tokens).catch(() => null);
        if (t2?.access_token && (!t2.expires_at || Date.now() < t2.expires_at - 60_000)) {
          TOK[service] = { access: t2.access_token, exp: t2.expires_at || Date.now() + 30 * 60_000 };
          return t2.access_token;
        }
      }
      throw new NotConnected(SVC[service].name + " sign-in expired — reconnect in Settings → Connections (" + (e as Error).message + ")");
    } finally { delete REFRESHING[service]; }
  })();
  return REFRESHING[service]!;
}
const REFRESHING: Record<string, Promise<string> | undefined> = {};

/* ------------------------------------------------------------ MCP client
   Streamable HTTP: POST JSON-RPC, answer arrives as JSON or as an SSE stream. */

const MSESS: Record<string, { id: string | null; at: number; tools?: any[]; toolsAt?: number }> = {};
let RPC_ID = 1;

async function rpcOnce(service: string, method: string, params: any, token: string, sid: string | null, notify = false) {
  const id = notify ? undefined : RPC_ID++;
  const r = await fetch(SVC[service].mcp, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
               authorization: "Bearer " + token, "mcp-protocol-version": "2025-06-18",
               ...(sid ? { "mcp-session-id": sid } : {}) },
    body: JSON.stringify(notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
    // v3.8.1: a hung TradingView/Robinhood request used to hold the whole Desk panel open.
    signal: AbortSignal.timeout(method === "tools/call" ? 20_000 : 12_000),
  }).catch((e) => { throw new Error(SVC[service].name + (e?.name === "TimeoutError" ? " timed out" : " unreachable: " + String(e?.message || e).slice(0, 120))); });
  const newSid = r.headers.get("mcp-session-id");
  if (notify) { await r.body?.cancel(); return { status: r.status, sid: newSid, msg: null }; }
  if (!r.ok) { const t = await r.text(); return { status: r.status, sid: newSid, msg: null, err: t.slice(0, 300) }; }
  const ct = r.headers.get("content-type") || "";
  let msg: any = null;
  if (ct.includes("text/event-stream")) {
    const txt = await r.text();
    for (const ev of txt.split(/\r?\n\r?\n/)) {
      const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data) continue;
      try { const m = JSON.parse(data); if (m.id === id) msg = m; } catch { /* */ }
    }
  } else {
    msg = await r.json().catch(() => null);
  }
  return { status: r.status, sid: newSid, msg };
}

async function mcpSession(service: string, token: string) {
  const s = MSESS[service];
  if (s && Date.now() - s.at < 20 * 60_000) return s;
  const init = await rpcOnce(service, "initialize", {
    protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "otto-trader", version: "3.0.0" } }, token, null);
  if (init.status === 401) throw Object.assign(new Error("401"), { auth: true });
  if (!init.msg || init.msg.error) throw new Error(SVC[service].name + " initialize failed: " + (init.err || JSON.stringify(init.msg?.error)).slice(0, 200));
  const sess = { id: init.sid, at: Date.now() };
  await rpcOnce(service, "notifications/initialized", {}, token, init.sid, true);
  MSESS[service] = sess;
  return sess;
}

async function mcp(service: string, method: string, params: any): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await accessToken(service, attempt === 1);
    let sess;
    try { sess = await mcpSession(service, token); }
    catch (e: any) { if (e.auth && attempt === 0) { delete MSESS[service]; continue; } throw e; }
    const r = await rpcOnce(service, method, params, token, sess.id);
    if (r.status === 401 && attempt === 0) { delete MSESS[service]; continue; }       // refresh and retry
    if ((r.status === 404 || r.status === 400) && sess.id && attempt < 2) { delete MSESS[service]; continue; } // session gone
    if (!r.msg) throw new Error(SVC[service].name + " HTTP " + r.status + " " + (r.err || ""));
    if (r.msg.error) throw new Error(SVC[service].name + ": " + (r.msg.error.message || JSON.stringify(r.msg.error)).slice(0, 300));
    return r.msg.result;
  }
  throw new Error(SVC[service].name + " not reachable");
}

async function mcpTools(service: string) {
  const s = MSESS[service];
  if (s?.tools && Date.now() - (s.toolsAt || 0) < 15 * 60_000) return s.tools;
  const res = await mcp(service, "tools/list", {});
  const tools = res?.tools || [];
  if (MSESS[service]) { MSESS[service].tools = tools; MSESS[service].toolsAt = Date.now(); }
  return tools;
}

// Result content → text (and parsed JSON when the server sent JSON text).
function mcpText(res: any): string {
  if (!res) return "";
  if (res.structuredContent) return JSON.stringify(res.structuredContent);
  return (res.content || []).map((c: any) => c.type === "text" ? c.text : "[" + c.type + "]").join("\n");
}
function mcpJson(res: any): any {
  if (res?.structuredContent) return res.structuredContent;
  try { return JSON.parse(mcpText(res)); } catch { return null; }
}
// v3.13: test seam — undefined in production (only the Deno test suite sets it).
// v3.19.1: safety net (Supabase's documented fallback). Any promise that rejects with nobody listening
// is logged as "stray rejection" instead of shutting the worker down mid-reply.
let STRAY = 0;
globalThis.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
  ev.preventDefault();
  STRAY++;
  console.error("stray rejection (worker kept alive):", String((ev.reason as Error)?.message ?? ev.reason).slice(0, 300));
});
export const strayCount = () => STRAY;
const TEST: any = (globalThis as any).__OTTO_TEST__ || null;

async function call(service: string, tool: string, args: any) {
  if (TEST?.call) return TEST.call(service, tool, args);
  const res = await mcp(service, "tools/call", { name: tool, arguments: args || {} });
  if (res?.isError) throw new Error(mcpText(res).slice(0, 400) || "tool error");
  return res;
}

/* ------------------------------------------------------------ Robinhood account */

let AGENTIC: { n: string; at: number } | null = null;
async function agenticAccount(): Promise<string> {
  const pinned = Deno.env.get("OTTO_RH_ACCOUNT");
  if (pinned) return pinned;
  if (AGENTIC && Date.now() - AGENTIC.at < 30 * 60_000) return AGENTIC.n;
  const j = mcpJson(await call("rh", "get_accounts", {}));
  const found: string[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.account_number && o.agentic_allowed === true) found.push(String(o.account_number));
    Object.values(o).forEach(walk);
  };
  walk(j);
  const uniq = [...new Set(found)];
  if (uniq.length !== 1) throw new Error(uniq.length ? "more than one agentic account — set OTTO_RH_ACCOUNT" : "no agentic_allowed Robinhood account found");
  AGENTIC = { n: uniq[0], at: Date.now() };
  return uniq[0];
}
const mask = (n: string) => "••" + String(n).slice(-4);

/* ------------------------------------------------------------ risk */

function costOf(tool: string, a: any): { cost: number | null; note: string } {
  const q = Number(a.quantity), p = Number(a.price ?? a.limit_price);
  if (tool === "place_option_order") {
    const legs = Array.isArray(a.legs) ? a.legs : [];
    const opening = legs.some((l: any) => l.position_effect === "open");
    if (!opening) return { cost: 0, note: "closing order — no new risk" };
    const debit = legs.length === 1 ? legs[0].side === "buy" : a.direction === "debit";
    if (!debit) return { cost: null, note: "credit order — max loss depends on strikes; read the review below" };
    if (!(q > 0) || !(p > 0)) return { cost: null, note: "no limit price — cost unknown until fill" };
    return { cost: q * p * 100, note: `${q} × $${p.toFixed(2)} × 100` };
  }
  if (tool === "place_equity_order") {
    if (a.side !== "buy") return { cost: 0, note: "sell order" };
    if (Number(a.dollar_amount) > 0) return { cost: Number(a.dollar_amount), note: "dollar amount" };
    if (q > 0 && p > 0) return { cost: q * p, note: `${q} × $${p.toFixed(2)}` };
    return { cost: null, note: "market order — cost unknown until fill" };
  }
  return { cost: 0, note: "" };
}

/* ------------------------------------------------------------ propose / act */

export async function proposeAction(input: any, who: string, opts: { manual?: boolean; planExtra?: Record<string, unknown> } = {}) {
  const calls = Array.isArray(input.calls) ? input.calls.slice(0, 6) : [];
  if (!calls.length) throw new Error("no calls");
  // v3.1: an opening option order must carry its plan, so the scorecard can grade it.
  const opening = calls.some((c: any) => c.tool === "place_option_order" && (c.args?.legs || []).some((l: any) => l.position_effect === "open"));
  // v3.14: the server stamps where the idea came from (signal / desk / scanner / alert / watcher trigger) for the Scoreboard.
  const plan = input.plan && typeof input.plan === "object" ? { ...input.plan, ...(opening ? (opts.planExtra || {}) : {}),
    ...(opening && !opts.planExtra?.source ? { source: who === "signals" ? "signal" : who === "alert" ? "alert" : who === "otto" ? "manual" : "desk" } : {}) } : null;
  if (plan) plan.rules = cleanRules(plan.rules);
  // v3.21 (Ifoma, 7 Oct night): wrong-if is a 5-minute close on every new card; older cards keep 15.
  if (plan && opening) plan.wrong_tf = 5;
  // v3.4: ...and its exits. No exits, no card (Jarvis and the manual ticket alike).
  if (opening && (!plan || !plan.tv_symbol || !plan.direction || !plan.setup || plan.tp1 == null || plan.stop == null || !(Number(plan.stop_option) > 0))) {
    throw new Error("An opening option order needs its plan and exits: {tv_symbol (EXCHANGE:TICKER), direction ('up'|'down' on the underlying), setup, tp1, stop (underlying prices), stop_option (OPTION price for the protective stop, below the limit), entry_underlying?, expires? (YYYY-MM-DD)}. Add it and propose again.");
  }
  void opts;
  // v3.21 (Ifoma, 7 Oct night): one card per ticker + direction. 7 Oct 10:32 two QQQ put cards went up at once.
  if (opening && !opts.manual && plan) {
    const tk = String(plan.tv_symbol || "").split(":").pop()?.toUpperCase() || "";
    const recent = await db("otto_actions?select=id,title,status,plan,exit,created_at&order=created_at.desc&limit=40").catch(() => []);
    const dup = (recent || []).find((r: any) => r.plan && String(r.plan.tv_symbol || "").split(":").pop()?.toUpperCase() === tk &&
      r.plan.direction === plan.direction && Date.now() - Date.parse(r.created_at) < 15 * 60e3 &&
      (["pending", "running"].includes(r.status) || (r.status === "done" && ["waiting_fill", "armed"].includes(r.exit?.state))));
    if (dup) throw new Error(`A ${tk} ${plan.direction === "down" ? "puts" : "calls"} card is already up: "${dup.title}" (${dup.status === "done" ? "filled, trade open" : dup.status}). Don't make a second one — point them to that card.`);
  }
  const out: any[] = [];
  const review: string[] = [];
  let cost = 0, costKnown = true;
  const notes: string[] = [];
  for (const c of calls) {
    const service = c.service === "tv" || c.service === "rh" ? c.service : null;
    if (!service) throw new Error("service must be tv or rh");
    const tool = String(c.tool || "");
    if (!WRITE[service].has(tool)) throw new Error(`${tool} is not an approvable ${SVC[service].name} action`);
    const args = { ...(c.args || {}) };
    if (service === "rh" && RH_FORCE_ACCT.has(tool)) args.account_number = await agenticAccount();
    if (service === "rh" && (tool === "place_option_order" || tool === "place_equity_order")) {
      args.ref_id = crypto.randomUUID();
      const k = costOf(tool, args);
      if (k.cost === null) costKnown = false; else cost += k.cost;
      if (k.note) notes.push(k.note);
      // Robinhood's own pre-trade check, so the card shows what the broker says.
      try {
        const rv = { ...args }; delete rv.ref_id;
        const r = await call("rh", tool === "place_option_order" ? "review_option_order" : "review_equity_order", rv);
        review.push(mcpText(r).slice(0, 1500));
      } catch (e) { review.push("Robinhood review failed: " + (e as Error).message); }
    }
    // v3.12: Otto does the pinging — alerts it creates never push from TradingView's own app too (double pings).
    if (tool === "mcp-tv-create-alert" && args && typeof args === "object") { args.mobile_push = false; args.popup = false;
      if (args.name) args.name = unname(args.name); if (args.message) args.message = unname(args.message); }
    out.push({ service, tool, args });
  }
  const exit = opening ? exitSpec(out, plan) : null;
  let account_value: number | null = null, buying_power: number | null = null;
  if (out.some((c) => c.service === "rh" && c.tool.startsWith("place_"))) {
    try {
      const pj = mcpJson(await call("rh", "get_portfolio", { account_number: await agenticAccount() }));
      account_value = Number(pj?.data?.total_value ?? pj?.total_value) || null;
      const bpr = Number(pj?.data?.buying_power?.buying_power ?? pj?.data?.buying_power);
      buying_power = Number.isFinite(bpr) && bpr >= 0 ? bpr : null;
    } catch { /* shown as unknown */ }
  }
  // v3.20 (Ifoma, 7 Oct night: "fits" = fits buying power; nothing fits → red-banner card anyway).
  // A card over buying power while a contract that fits exists goes back to Jarvis with that contract named.
  const bpChecks: any[] = [];
  if (exit && costKnown && buying_power != null && cost > buying_power) {
    let fitLine = "";
    if (!opts.manual) {
      const sym = String(plan?.tv_symbol || "").split(":").pop() || "";
      const sl = await withTimeout(shortlistCached(sym, exit.direction === "down" ? "put" : "call"), 25_000, "shortlist").catch(() => null);
      const f = sl?.bestFit;
      if (f && f.cost <= buying_power && f.option_id !== exit.option_id)
        throw new Error(`Over buying power: this contract costs $${Math.round(cost)} and the Agentic account has $${buying_power.toFixed(2)}. ◆ ${f.label} fits (option_id ${f.option_id}, ask $${f.ask.toFixed(2)}, ≈$${f.cost}, δ ${f.delta.toFixed(2)}). Propose again with that contract (re-size stop_option for it).`);
      fitLine = !sl ? "" : sl.rows.some((r: SLRow) => r.fits && r.ask > 0) ? " Only far out-of-the-money contracts (delta under .15) fit — Otto doesn't offer those." : " No contract on the list fits.";
    }
    bpChecks.push({ ok: false, text: `Over buying power: costs $${Math.round(cost)}, the Agentic account has $${buying_power.toFixed(2)} — Robinhood will reject this order unless cash is added.${fitLine}` });
  }
  const pct = account_value && costKnown ? cost / account_value : null;
  const LIM = await getLimits().catch(() => LIMIT_DEFAULTS);
  const risk = {
    cost: costKnown ? cost : null, account_value, buying_power, pct, warn_pct: LIM.warn_pct,
    flag: pct !== null && pct > LIM.warn_pct / 100, notes, account: out.some((c) => c.service === "rh") ? mask(await agenticAccount().catch(() => "????")) : null,
  };
  let banner: any = null, checks: any[] = [];
  if (opening) {
    try { const b = await sentimentNow(); banner = { verdict: b.verdict, score: b.score, fresh: b.fresh, at: b.at }; } catch { /* */ }
    try { checks = await ruleChecks(out, plan, risk, banner); } catch (e) { checks = [{ ok: null, text: "Rule check failed: " + (e as Error).message }]; }
    const atStop = exit ? (exit.entry_limit - exit.stop_option) * 100 * exit.qty : null;
    try { checks = checks.concat(await limitChecks(risk.cost, atStop)); } catch { /* */ }
    checks = bpChecks.concat(checks);
  }
  const rows = await db("otto_actions", { method: "POST", body: JSON.stringify({
    title: unname(input.title || "Action").slice(0, 140),
    summary: unname(input.summary || "").slice(0, 4000),
    calls: out, risk, review: review.join("\n\n---\n\n"), status: "pending", created_by: who,
    plan: plan ? { ...plan, setup: String(plan.setup).toLowerCase().slice(0, 40) } : null, banner, checks,
    ...(exit ? { exit: { ...exit, state: "planned", log: [] } } : {}),
  }) });
  if (rows?.[0]?.status === "pending" && who !== "signals" && who !== "alert" && who !== "watcher") await markPinged([rows[0].id]), await notify("card", `🃏 Card waiting: ${String(rows[0].title).slice(0, 80)}`, "Tap to open the Desk and Approve or Reject (cards expire in 20 minutes).");
  return publicAction(rows[0]);
}

function publicAction(a: any) {
  // Never send the account number to the browser.
  const calls = (a.calls || []).map((c: any) => {
    const args = { ...c.args }; if (args.account_number) args.account_number = mask(args.account_number);
    return { ...c, args };
  });
  return { id: a.id, title: a.title, summary: a.summary, calls, risk: a.risk, review: a.review,
           status: a.status, result: a.result, created_at: a.created_at, created_by: a.created_by,
           decided_by: a.decided_by, decided_at: a.decided_at,
           plan: a.plan || null, banner: a.banner || null, checks: a.checks || [], order_id: a.order_id || null, outcome: a.outcome || null, exit: a.exit || null };
}

async function actOn(id: string, decision: string, who: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad id");
  const rows = await db("otto_actions?id=eq." + id + "&select=*");
  const a = rows && rows[0];
  if (!a) throw new Error("no such card");
  if (a.status !== "pending") return publicAction(a);
  const now = new Date().toISOString();
  if (decision !== "approve") {
    const r = await db("otto_actions?id=eq." + id + "&status=eq.pending", { method: "PATCH",
      body: JSON.stringify({ status: "rejected", decided_by: who, decided_at: now }) });
    return publicAction(r[0] || a);
  }
  if (Date.now() - Date.parse(a.created_at) > ACTION_TTL_MS) {
    const r = await db("otto_actions?id=eq." + id + "&status=eq.pending", { method: "PATCH",
      body: JSON.stringify({ status: "expired", decided_by: who, decided_at: now }) });
    return publicAction(r[0] || a);
  }
  // Claim it atomically so a double click (or both laptops) can't run it twice.
  const claimed = await db("otto_actions?id=eq." + id + "&status=eq.pending", { method: "PATCH",
    body: JSON.stringify({ status: "running", decided_by: who, decided_at: now }) });
  if (!claimed || !claimed.length) return publicAction((await db("otto_actions?id=eq." + id + "&select=*"))[0]);
  const results: any[] = [];
  let failed = false, orderId: string | null = null;
  for (const c of a.calls) {
    if (failed) { results.push({ tool: c.tool, ok: false, text: "skipped — an earlier step failed" }); continue; }
    try {
      const r = await call(c.service, c.tool, c.args);
      if (/^place_/.test(c.tool) && !orderId) {
        const j = mcpJson(r);
        orderId = j?.data?.order?.id || j?.data?.id || j?.order?.id || j?.id || null;
      }
      results.push({ tool: c.tool, ok: true, text: mcpText(r).slice(0, 2000) });
    } catch (e) {
      failed = true;
      results.push({ tool: c.tool, ok: false, text: (e as Error).message });
    }
  }
  const fin = await db("otto_actions?id=eq." + id, { method: "PATCH",
    body: JSON.stringify({ status: failed ? "failed" : "done", result: results, ...(orderId ? { order_id: String(orderId) } : {}) }) });
  await logDesk("system", "Otto", `${failed ? "✗" : "✓"} ${a.title} — ${failed ? "failed" : "done"} (approved by ${who})`, id);
  // v3.4: the entry is in — hand its exits to the exit engine.
  if (a.exit && a.exit.state === "planned") {
    const ex: any = { ...a.exit, state: failed ? "dead" : "waiting_fill", order_id: orderId ? String(orderId) : null };
    exitLog(ex, failed ? "Entry failed, exits not armed" : `Approved by ${who}; waiting for the fill`);
    await saveExit(id, ex).catch(() => {});
    if (!failed) background((async () => {
      await new Promise((r) => setTimeout(r, 4000));
      const rows = await db("otto_actions?id=eq." + id + "&select=*");
      if (rows?.[0]) await exitTick(rows[0]);
    })());
    return publicAction({ ...fin[0], exit: ex });
  }
  return publicAction(fin[0]);
}

/* ------------------------------------------------------------ shared log */

async function logDesk(role: string, author: string, content: string, action_id: string | null = null) {
  try {
    await db("otto_desk", { method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ role, author: author.slice(0, 40), content: (role === "user" ? content : unname(content)).slice(0, 20000), action_id }) });
  } catch { /* the log is a convenience; never break the chat over it */ }
}

/* ------------------------------------------------------------ panel */

const MACRO = [
  { k: "ten", sym: "TVC:US10Y", label: "10Y" },
  { k: "crude", sym: "NYMEX:CL1!", label: "Crude" },
  { k: "yen", sym: "FX:USDJPY", label: "USD/JPY" },
  { k: "spy", sym: "AMEX:SPY", label: "SPY" },
  { k: "qqq", sym: "NASDAQ:QQQ", label: "QQQ" },
];

// v3.8.1 (5 Oct 2026): every slow outside call gets a budget so one slow service
// (TradingView was taking 60 s+ per refresh) can't blank the rest of the Desk.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(label + " is slow right now (over " + Math.round(ms / 1000) + " s)")), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
// Circuit breaker for the Desk panel / banner: after a TradingView timeout, skip it
// for 2 minutes and go straight to the backups (Yahoo prices, cached watchlist).
let TV_SLOW_UNTIL = 0, WC_LAST = "";
const tvSlow = () => Date.now() < TV_SLOW_UNTIL;
function tvBudget<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  // v3.19.1 (7 Oct night): the call is already running when we get here. If we walk away from it
  // (breaker open), its later "TradingView timed out" had no handler — an unhandled rejection —
  // and Supabase shut the whole worker down ("event loop error"), killing every Desk/Signal run on it.
  p.catch(() => {});
  if (tvSlow()) return Promise.reject(new Error("TradingView is slow right now — using backups for a couple of minutes"));
  return withTimeout(p, ms, label).catch((e) => {
    if (/slow right now|timed out|HTTP 429|429|rate.?limit|bad handshake|unreachable/i.test(String(e?.message))) { TV_SLOW_UNTIL = Date.now() + 120_000; putSetting("tv_slow_until", TV_SLOW_UNTIL).catch(() => {}); }
    throw e;
  });
}
// Each request can land on a fresh server instance, so the breaker is shared through otto_settings.
async function tvSlowLoad() { try { const v = Number(await setting("tv_slow_until")); if (v > TV_SLOW_UNTIL) TV_SLOW_UNTIL = v; } catch { /* */ } }
// TradingView symbol → Yahoo symbol, for the price fallback.
function ySym(tv: string): string {
  const MAP: Record<string, string> = { "TVC:US10Y": "^TNX", "TVC:DXY": "DX-Y.NYB", "FX:USDJPY": "JPY=X", "NYMEX:CL1!": "CL=F",
    "CME_MINI:ES1!": "ES=F", "CME_MINI:NQ1!": "NQ=F", "CBOT_MINI:YM1!": "YM=F" };
  if (MAP[tv]) return MAP[tv];
  return (tv.split(":")[1] || tv).replace(/\./g, "-");
}
async function yahooQuotes(syms: string[]): Promise<Record<string, { close: number; change: number | null }>> {
  const out: Record<string, any> = {};
  await Promise.all(syms.map(async (s) => {
    try { const q = await withTimeout(yq(ySym(s)), 6000, "Yahoo"); if (q.price != null) out[s] = { close: q.price, change: q.pct }; } catch { /* leave it out */ }
  }));
  return out;
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; error: string }> {
  try { return { ok: true, v: await p }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function panel() {
  const conns = await db("otto_conn?select=service,connected_by,connected_at,updated_at").catch(() => []);
  const has = (s: string) => conns.some((c: any) => c.service === s);
  const out: any = { ok: true, at: Date.now(), conn: { tv: has("tv"), rh: has("rh") } };

  const tvPart = async () => {
    if (!has("tv")) return;
    await tvSlowLoad();
    // v3.9.2: ask TradingView for the watchlist at most every 10 minutes; use the saved copy in between.
    const wcFresh = await setting("watch_cache").catch(() => null);
    const wl: any = wcFresh?.syms?.length && wcFresh.at && Date.now() - Date.parse(wcFresh.at) < 10 * 60e3
      ? { ok: true, v: { name: wcFresh.name, symbols: wcFresh.syms } }
      : await settle(tvBudget((async () => mcpJson(await call("tv", "mcp-watchlist-get-active-watchlist", {})))(), 6000, "TradingView watchlist"));
    let wsyms: string[] = [];
    if (wl.ok) {
      const found: string[] = [];
      const walk = (o: any) => {
        if (typeof o === "string" && /^[A-Z0-9_]+:[A-Z0-9.!_\-]+$/.test(o)) found.push(o);
        else if (o && typeof o === "object") Object.values(o).forEach(walk);
      };
      walk(wl.v);
      wsyms = [...new Set(found)].slice(0, 30);
      out.watchlist_name = wl.v?.name || wl.v?.watchlist?.name || wl.v?.data?.name || null;
      const wk = JSON.stringify(wsyms);
      if (wsyms.length && (wk !== WC_LAST || !wcFresh?.at || Date.now() - Date.parse(wcFresh.at) >= 10 * 60e3)) { WC_LAST = wk; putSetting("watch_cache", { syms: wsyms, name: out.watchlist_name || null, at: new Date().toISOString() }).catch(() => {}); }
    } else {
      // TradingView slow: keep showing the last watchlist we saw, priced from Yahoo.
      const wc = await setting("watch_cache").catch(() => null);
      if (wc?.syms?.length) { wsyms = wc.syms.slice(0, 30); out.watchlist_name = wc.name; out.watchlist_note = "saved copy — " + wl.error; }
      else out.watchlist_error = wl.error;
    }
    const syms = [...new Set([...MACRO.map((m) => m.sym), ...wsyms])];
    // v3.1: quotesFor() falls back to OHLCV bars when the screener is rate-limited (429).
    out.macro = MACRO; out.watch = wsyms;
    // v3.9.2: prices from Yahoo first; TradingView only fills what Yahoo couldn't price.
    const [yq0, al] = await Promise.all([
      yahooQuotes(syms),
      settle(tvBudget((async () => mcpJson(await call("tv", "mcp-tv-list-alerts", { active: true })))(), 7000, "TradingView alerts")),
    ]);
    let qv: Record<string, any> = { ...yq0 };
    out.quotes_source = "yahoo";
    const missing = syms.filter((s) => !qv[s]);
    if (missing.length) {
      const q = await settle(tvBudget(quotesFor(missing), 7000, "TradingView prices"));
      if (q.ok && Object.keys(q.v).length) { qv = { ...qv, ...q.v }; out.quotes_source = "yahoo+tradingview"; }
      else if (!q.ok) out.quotes_note = `${missing.length} not on Yahoo; TradingView: ${q.error}`;
    }
    if (Object.keys(qv).length) out.quotes = { data: Object.entries(qv).map(([symbol, v]: any) => ({ symbol, close: v.close, change: v.change })) };
    if (al.ok) out.alerts = al.v; else out.alerts_error = al.error;
  };

  const rhPart = async () => {
    if (!has("rh")) return;
    const acct = await settle(agenticAccount());
    if (!acct.ok) { out.rh_error = acct.error; return; }
    const [pf, op, eq] = await Promise.all([
      settle((async () => mcpJson(await call("rh", "get_portfolio", { account_number: acct.v })))()),
      settle((async () => mcpJson(await call("rh", "get_option_positions", { account_number: acct.v, nonzero: true })))()),
      settle((async () => mcpJson(await call("rh", "get_equity_positions", { account_number: acct.v })))()),
    ]);
    out.agentic = {
      account: mask(acct.v),
      portfolio: pf.ok ? (pf.v?.data ?? pf.v) : null, portfolio_error: pf.ok ? null : pf.error,
      options: op.ok ? (op.v?.data?.positions ?? op.v) : null, options_error: op.ok ? null : op.error,
      equities: eq.ok ? (eq.v?.data ?? eq.v) : null, equities_error: eq.ok ? null : eq.error,
    };
  };

  await Promise.all([settle(withTimeout(tvPart(), 16000, "TradingView")), settle(withTimeout(rhPart(), 16000, "Robinhood").catch((e) => { out.rh_error ||= e.message; }))]);
  if (!out.quotes) {                      // TradingView not connected: fall back to the free quotes
    const fq = await settle(fetchQuotes());
    if (fq.ok) out.fallback_quotes = fq.v.quotes;
  }
  const pend = await settle(db("otto_actions?status=in.(pending,running)&order=created_at.desc&limit=20&select=*"));
  // v3.10: a pending card past its 20 minutes can't be approved — mark it expired so it stops showing as waiting.
  const stale = pend.ok ? pend.v.filter((a: any) => a.status === "pending" && Date.now() - Date.parse(a.created_at) > ACTION_TTL_MS) : [];
  if (stale.length) background(db("otto_actions?status=eq.pending&id=in.(" + stale.map((a: any) => a.id).join(",") + ")", { method: "PATCH",
    headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "expired", decided_by: "otto (20 min)", decided_at: new Date().toISOString() }) }));
  out.pending = pend.ok ? pend.v.filter((a: any) => !stale.includes(a)).slice(0, 10).map(publicAction) : [];
  out.card_ttl_min = ACTION_TTL_MS / 60000;
  out.auto_close = !!(await getLimits().catch(() => LIMIT_DEFAULTS)).auto_close;
  const ex = await settle(db("otto_actions?select=id,title,exit,created_at&exit->>state=in.(waiting_fill,armed,closed)&order=created_at.desc&limit=8"));
  out.exits = ex.ok ? ex.v.filter((r: any) => ["waiting_fill", "armed"].includes(r.exit.state) ||
    Date.now() - Date.parse(r.exit.closed_at || r.created_at) < 18 * 3600e3).slice(0, 5) : [];
  if (has("rh") && out.exits.some((r: any) => ["waiting_fill", "armed"].includes(r.exit.state))) background(exitsTick());
  return out;
}

/* ------------------------------------------------------------ the Desk chat */

/* v3.12 (Ifoma, 6 Oct): Otto may be sold later — the mentor's name is never shown to users. The brain keeps it
   internally; everything a user reads says "the Otto Rules" (his method / rules) and "Signal" (his Discord posts). */
const NAME_RULE = `\n\nNAMES — PRODUCT RULE (6 Oct 2026). Never write the names Jason, Jason Murray, or jmoney915 in anything Ifoma or Josh will read: replies, reads, card titles and summaries, TradingView alert names and messages. The method and its rules are "the Otto Rules" (e.g. "Otto Rules: no trades in the first 30 minutes"; cite as (Otto Rules, call date, MM:SS)). His Discord posts are "signals" ("the SPCX signal"). The person on the coaching calls is "the coach". Name a TradingView alert you create "Otto Rules MM/DD – TICKER LEVEL – note". You still know where the rules come from; just don't name him. Speak as yourself with the Otto Rules as your own playbook: never "he would / wouldn't", "he says", "ask him", "send it to him" or "get the coach on the phone" — say what the Otto Rules say and what you'd do.`;
// v3.13 (Ifoma, 6 Oct): guardrails flag, never block; Jarvis never claims to watch what nothing is watching.
const GUARD_RULE = `\n\nGUARDRAILS FLAG — THEY NEVER BLOCK (Ifoma, 6 Oct 2026). Ifoma and Josh make the final call on every trade. When a setup is real, ALWAYS build the card, even if it breaks a guardrail (max loss per trade, daily stop, weekly limit, size vs account, delta, expiry, first 30 minutes, banner). Never say "hard stop", "no card" or refuse a card because of a limit or size. The card shows a red banner naming each guardrail it breaks; in your reply say which ones in one line, and if a cheaper contract fits better, offer it as a second (ALT) card. Only skip a card when there is no setup.
WHAT RUNS ON ITS OWN — SAY ONLY THIS. You do not watch the market between messages. You run only when someone writes on the Desk, when the 👁 Watcher sees a trigger at a level on its list (the server checks every minute on 5- and 10-minute closes), when a TradingView alert Otto set fires (checked every 2 minutes), when Otto Signals catches a post, and on the open-position check (every few minutes while a trade is open). Never say "I'm watching", "watching every bar", "the card drops automatically", "I'll flag you at 1:30" or "I'll ping you" unless one of those mechanisms will actually do it. If they want a level watched, put it on the Watcher with add_watch_level (no card needed) and say so — that is how you'll see it. If you want to look again at a set time ("I'll check at 1:30"), call schedule_check first — then it's true. The server checks every reply for promises and makes you correct any that nothing backs.
HOUSE RULES. The House Rules block (below the clock) is their standing instructions. Follow them every time. When Ifoma or Josh gives a standing instruction ("from now on", "always", "next time", "in the future"), call save_house_rule with it in one plain sentence, then confirm in one line. Don't save one-off requests.
THE CLOCK. The CLOCK line is computed by the server and is always right about the date, weekday, time and whether the market is open. Tool timestamps are UTC unless they say ET. If you ever feel the market is closed, re-read the CLOCK line before saying so.
A PROTECTED TRADE'S STOP. On a trade Otto protects, a pending sell-to-close (pending_sell_quantity 1) is Otto's own stop order. It is not a stuck or "zombie" order — never tell anyone to cancel it unless they're closing the trade.`;

function unname(t: any): string {
  return String(t ?? "").replace(/(\bJason(?: Murray)?)[’‘`]s\b/g, "$1's")   // v3.16: curly apostrophes too
    .replace(/\bJason(?: Murray)?'s (?:rules|method)\b/g, "the Otto Rules").replace(/\bJason(?: Murray)?'s rule\b/g, "Otto Rule")
    .replace(/\bJason(?: Murray)?'s posts?\b/g, "the signal").replace(/\bJason(?: Murray)?'s calls\b/g, "the coaching calls")
    .replace(/\bJASON'S CALL\b/g, "SIGNAL").replace(/\bJason(?: Murray)?'s\b/g, "Otto Rules").replace(/\bJason(?: Murray)?\b/g, "Otto Rules")
    .replace(/\bjmoney915\b/gi, "").replace(/\bthe the Otto\b/g, "the Otto").replace(/Otto Rules Rules/g, "Otto Rules")
    .replace(/(^|[.!?:]\s+|\n)the (Otto|signal|coaching)/g, (_m, a, b) => a + "The " + b);
}
const SIG_LABEL = "Signal";   // v3.12: what users see instead of the mentor's name
const DESK_SYS = `You are Jarvis, the AI on the trading desk inside Otto Trader. If asked your name, you are Jarvis. Your judgment is the Otto Rules: Otto's own brain, built from a library of recorded coaching calls plus the trading playbook. You speak as yourself ("the Otto Rules say…", "my read…") — never as anyone's student, and never "he would / wouldn't". You sit between three things:
- The Otto Rules (the coaching-call library) — the judgment. Search it with search_jason (the tool's internal name).
- TradingView (Ifoma's paid account) — market data, watchlists, alerts. Tools named tv__…
- Robinhood — positions and orders. Tools named rh__…. Orders only ever go to the Robinhood Agentic account; the server enforces that, you don't pick the account.

You're talking with Ifoma (the trader; it's his money) and sometimes Josh (his son, learning alongside him, same login, same authority). Each message is prefixed with who wrote it when known. Talk like a trading partner at the next desk: direct, numbers first, caveat second. Short paragraphs. No hype, no congratulating; say plainly when a trade is a bad idea.

HOW ACTIONS WORK — THE ONE HARD RULE
You can READ anything with the tv__ and rh__ tools, as often as you need. You can NEVER change anything yourself — with ONE exception: when the desk context says Auto-close is ON, close_position sells to close a position in the Agentic account immediately, no card. Use it only to get OUT of a position when one of the card's own exits is met (wrong-if on the card's bar, TP1, 3:50 PM) — the server checks and refuses otherwise; for any other reason, including when they ask you to close, put up a close card with propose_action. Say why in one sentence, and never open, add or flip with it. To place, cancel, or change an order, or create/edit/delete an alert or watchlist entry, call propose_action with the exact calls. That puts an Approve / Reject card in front of them; nothing happens until a human clicks Approve. After proposing, say in one line what the card does — never say an order "is placed" or "went through" until you see the result (the app will post it).
- Before proposing an option order: get the chain (rh__get_option_chains → rh__get_option_instruments) for the real option_id, check the quote (rh__get_option_quotes), and use a limit price. The server runs Robinhood's review and computes the risk vs the Agentic account.
- One idea = one card. Several suggestions at once = several cards, each with its own title.
- Don't propose new TradingView alerts unless they ask, or they want a level watched (an alert is the only way you get woken at a level).
- Every OPENING option card must include plan {tv_symbol, direction, setup, tp1, stop, stop_option, entry_underlying, expires}. stop_option is the OPTION price that triggers the protective stop (below your limit price); size it so (limit − stop_option) × 100 × contracts stays inside their max loss per trade. Approving the card approves its exits too: once the buy fills, Otto itself places a stop_market sell-to-close at stop_option (re-placed every morning — Robinhood stop orders are day orders) and two TradingView alerts on the stock (wrong-if = plan.stop on a 5-minute close, TP1 on touch), and puts up a close card when one fires. So never propose a separate stop order or alerts for that trade, and only one single-leg buy per opening card. To close a protected trade early, include rh cancel_option_order for its stop_order_id (listed in the desk context) BEFORE the sell, in the same card. The server runs a rule check (first 30 minutes, delta 30–40, volume > OI, size, loss at the stop vs their max, daily stop, weekly limit, expiry, binary events, earnings, banner) and shows any broken guardrail as a red banner on the card; read its result back and mention the flags in one line. The card's check is the truth: don't call a check passed in your text when the card flags it.

THE SENTIMENT BANNER
The app shows a live banner built from Josh's Intermarket Sentiment Cheat Sheet on TradingView data (10Y, DXY, USD/JPY, crude, ES/NQ/YM). Its current verdict is in the desk context line. It is Josh's sheet, not the Otto Rules: where they disagree (the sheet trades the 9:30 opening range; the Otto Rules say no first 30 minutes unless the open goes off a pre-posted Signal level) say so and don't pick. Never attach Josh's sheet sizing ($15 / 15%) to anything — sizing is only the 20% check.

THE ORDER TICKET (put this in the card's summary, plain text)
Underlying / contract · Side / qty / type / limit · Max risk ($ and % of the account; ⚠ if over 20%) · Entry trigger · Stop / exit · Targets (TP1 / TP2 / runner) · Otto Rules basis (rule, call date, MM:SS) · Not from the Otto Rules (anything you added).
Every guardrail is a warning, never a block — they can still approve. The coach called ~40% of the account in one trade "crazy" (1 Oct 2026).

FETCH, DON'T ASSUME
Every price, position, and buying-power figure you state comes from a tool call in this conversation. Levels from a call are dated marks, never current prices — say the call date when you use one. If a connector isn't connected, say so in one line (Settings → Connections) and do what you can without it.

SAY WHEN THE OTTO RULES DON'T COVER SOMETHING
The calls have never taught a stop rule for these option trades beyond the entry-candle exit, never given a 2026 options sizing number, and never given a full exit plan beyond TP1/TP2/runners. When one of those decides the trade, give your best answer and label it as yours.

THE OTTO RULES (2026 stock options) — summary; search_jason for exact wording and timestamps
- Backdrop first: 10-year (cost of capital), crude (cost of transportation), USD/JPY (cost of currency). Rising rates → algorithms sell; restrictive rates → money hides in staples, health care, communications. Seasonality: September sell first; October rough early, strong late. Never swing into a binary event (NFP, earnings, Fed).
- Instruments: SPY, QQQ, one Mag-7 name. More than one catalyst; the chart is not a catalyst. 3+ indicators agreeing is workable, 5 you take to the bank. No trading inside a trap zone; a $3 box is not a trade.
- Entries: shorts at resistance, cover at support; longs the mirror ("where I'm covering, you're trying to enter", 1 Oct). Mark zones before the move. In this rate environment play rejections more than bounces. Daily double top or below a big unrecovered gap → scalps only. Never chase a missed fill. Not the first 30 minutes.
- Contract: delta 30–40, volume > open interest; at the money by default, up to two strikes out only if at the screen. After Wednesday don't buy this Friday's; use next week's while learning. Check theta as % of premium before swinging.
- Managing: TP at the first marked level, keep a runner, stop the runner if it doesn't come. Exit if price closes back through the open of the entry candle; on short-dated options the first red candle is the exit. Watch the chart, not the P&L. Weekly goals, not daily.
- Older frames (April 2024 options: 20% max, 2/5/10 contracts, spreads 60+ days; Aug 2026 ES futures: one contract) — never mix in without saying where they came from.

CHARTS
When they paste a chart, read it: timeframe, trend, the zones they drew, where price is vs those zones, and grade the idea against the method. Then check it against live data before any ticket.

OTTO RULES — STANDING RULES AND SETUPS (always in front of you):
{{RULES}}`;

const PROPOSE_TOOL = (writeHelp: string) => ({
  name: "propose_action",
  description: "Show the user an Approve / Reject card for one or more changes (orders, cancels, alerts, watchlist edits). " +
    "Nothing runs until a human clicks Approve. The server forces Robinhood orders into the Agentic account and adds the idempotency key — " +
    "leave account_number and ref_id out. Available actions and their arguments:\n" + writeHelp,
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short card title, e.g. 'Buy 1 SPY 760P 10/16 @ 2.15'" },
      summary: { type: "string", description: "The order ticket / what this does and why, plain text, newline-separated lines." },
      calls: {
        type: "array", minItems: 1, maxItems: 6,
        items: {
          type: "object",
          properties: {
            service: { type: "string", enum: ["tv", "rh"] },
            tool: { type: "string", description: "Exact tool name, e.g. place_option_order or mcp-tv-create-alert" },
            args: { type: "object", description: "Arguments for that tool" },
          },
          required: ["service", "tool", "args"],
        },
      },
      plan: {
        type: "object",
        description: "REQUIRED for an opening option order (the scorecard grades every idea on it): the trade plan on the UNDERLYING.",
        properties: {
          tv_symbol: { type: "string", description: "TradingView symbol of the underlying, EXCHANGE:TICKER, e.g. NASDAQ:NVDA" },
          direction: { type: "string", enum: ["up", "down"], description: "Your view on the underlying (calls = up, puts = down)" },
          setup: { type: "string", enum: ["rejection at resistance", "support bounce", "gap failure", "breakdown", "breakout", "trend continuation", "other"] },
          entry_underlying: { type: "number", description: "Underlying price at the entry trigger" },
          tp1: { type: "number", description: "TP1 on the underlying" },
          stop: { type: "number", description: "Underlying price that proves the idea wrong (your exit level) — Otto watches for a 5-minute close through it" },
          stop_option: { type: "number", description: "OPTION price (per share, below the limit) where Otto's protective stop_market sell-to-close triggers. Otto places it after the fill." },
          expires: { type: "string", description: "Option expiration YYYY-MM-DD" },
          signal_level: { type: "boolean", description: "true when the entry level came from a Signal posted before the open (the House Rule lets the open be traded off it)" },
          rules: { type: "array", items: { type: "string" }, maxItems: 6, description: "v3.15: ids of the PLAYBOOK book rules this card relies on (e.g. T-1, D-1, M-2). Every rule cited builds its own record on the scoreboard." },
        },
        required: ["tv_symbol", "direction", "setup", "tp1", "stop", "stop_option"],
      },
    },
    required: ["title", "summary", "calls"],
  },
});

function schemaLine(t: any) {
  const p = t.inputSchema?.properties || {};
  const req = new Set(t.inputSchema?.required || []);
  const fields = Object.keys(p).filter((k) => k !== "account_number" && k !== "ref_id")
    .map((k) => k + (req.has(k) ? "*" : "") + ":" + (p[k].type ? [].concat(p[k].type).filter((x: string) => x !== "null").join("|") : "any"));
  return `- ${t.name} (${fields.join(", ")})`;
}

async function deskTools() {
  const tools: any[] = [];
  const help: string[] = [];
  const status: Record<string, string> = {};
  for (const s of ["tv", "rh"]) {
    try {
      const list = await withTimeout(mcpTools(s), 10000, SVC[s].name);
      for (const t of list) {
        if (READ[s].has(t.name)) {
          tools.push({ name: `${s}__${t.name}`.slice(0, 64),
            description: (`[${SVC[s].name}] ` + (t.description || "")).slice(0, 900),
            input_schema: t.inputSchema && t.inputSchema.type === "object" ? t.inputSchema : { type: "object", properties: {} } });
        }
        if (WRITE[s].has(t.name)) help.push(`[${s}] ` + schemaLine(t));
      }
      status[s] = "connected";
    } catch (e) {
      status[s] = (e as Error).message;
    }
  }
  return { tools, help: help.join("\n") || "(no connector is connected yet)", status };
}

type DeskRun = { msgs: any[]; sys: string; tools: any[]; cs: Chunk[]; who: string; send: (o: any) => void; allowPropose: boolean; allowClose?: boolean; maxRounds?: number; deadline?: number; author?: string; planExtra?: Record<string, unknown>;
  mustCard?: boolean; dryRun?: boolean };   // v3.16: mustCard = a Signal call must end in a card; dryRun = the self-test (cards checked, not stored)
type DeskResult = { said: string; cards: string[]; timedOut?: boolean; outOfRounds?: boolean; did: string[]; failed: string[]; finalText: string; dry?: any[]; errors?: string[] };

// The tool loop, shared by the live Desk (streamed) and the 8:45 run (silent).
// v3.13: one Claude request, retried once on 429 / 5xx / overloaded, never past the run's deadline.
async function claudeFetch(body: any, deadline: number): Promise<Response> {
  if (TEST?.claude) return TEST.claude(body);
  const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left < 8000) throw new Error("out of time before Claude answered");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(left - 3000),
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (r.ok && r.body) return r;
    const t = (await r.text()).slice(0, 200);
    if (attempt === 0 && (r.status === 429 || r.status >= 500)) { await new Promise((z) => setTimeout(z, 3000)); continue; }
    throw new Error("claude HTTP " + r.status + " " + t);
  }
}
const RUN_BUDGET_MS = 118_000;            // Supabase stops a function at 150 s; leave room to save what was said.
const OUT_OF_TIME = "\n\n⚠ I ran out of time on that one (a data source was slow), so this answer may be incomplete. Ask again and I'll keep it tighter.";

export async function runDesk(o: DeskRun): Promise<DeskResult> {
  const { msgs, sys, tools, cs, who, send } = o;
  const deadline = o.deadline || Date.now() + RUN_BUDGET_MS;
  let said = "", finalText = "";
  const cards: string[] = [], did: string[] = [], failed: string[] = [], dry: any[] = [], errors: string[] = [];
  const done = (x: any = {}): DeskResult => ({ said, cards, did, failed, finalText, dry, errors, ...x });
  const maxR = o.maxRounds || 12;
  // v3.13: the clock and the House Rules ride in a second, uncached system block on EVERY run
  // (Desk, alert reads, Signals, position checks, the morning read).
  const live = marketClock().line + "\n\n" + await houseRulesText().catch(() => "") + "\n\n" + await playbookText().catch(() => "");
  for (let round = 0; round < maxR; round++) {
    if (Date.now() > deadline - 15000) { said += OUT_OF_TIME; send({ t: "text", v: OUT_OF_TIME }); return done({ timedOut: true }); }
    // v3.16: a Signal call must end in a card — on the last step (or when time is short) the card is the only move left.
    const force = o.mustCard && o.allowPropose && !cards.length && !dry.length && (round >= maxR - 2 || Date.now() > deadline - 50000)
      && tools.some((t: any) => t.name === "propose_action");
    finalText = "";
    let r: Response;
    try {
      r = await claudeFetch({
        model: MODEL, max_tokens: 2500, stream: true, tools, ...(force ? { tool_choice: { type: "tool", name: "propose_action" } } : {}),
        system: [{ type: "text", text: sys + NAME_RULE + GUARD_RULE, cache_control: { type: "ephemeral" } }, { type: "text", text: live }],
        messages: msgs,
      }, deadline);
    } catch (e) {
      if (said || /out of time|timed? ?out|abort/i.test(String((e as Error).message))) {
        said += OUT_OF_TIME; send({ t: "text", v: OUT_OF_TIME }); return done({ timedOut: true });
      }
      throw e;
    }
    let stop = "";
    const blocks: any[] = [];
    const reader = r.body!.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop() || "";
      for (const p of parts) {
        const line = p.split("\n").find((x) => x.startsWith("data: "));
        if (!line) continue;
        let ev: any; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === "content_block_start") {
          const cb = ev.content_block;
          blocks[ev.index] =
            (cb.type === "tool_use" || cb.type === "server_tool_use") ? { ...cb, input: "" }
            : (cb.type === "text") ? { type: "text", text: "" }
            : { ...cb };
        } else if (ev.type === "content_block_delta") {
          const b = blocks[ev.index];
          if (ev.delta.type === "text_delta") { b.text += ev.delta.text; said += ev.delta.text; finalText += ev.delta.text; send({ t: "text", v: unname(ev.delta.text) }); }
          else if (ev.delta.type === "input_json_delta") b.input += ev.delta.partial_json;
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stop = ev.delta.stop_reason;
        }
      }
    }
    if (stop !== "tool_use") return done();

    const assistant: any[] = [];
    const results: any[] = [];
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === "text") { if (b.text) assistant.push({ type: "text", text: b.text }); continue; }
      if (b.type === "server_tool_use") {
        let input: any = {}; try { input = JSON.parse(b.input || "{}"); } catch { /* */ }
        assistant.push({ type: "server_tool_use", id: b.id, name: b.name, input });
        continue;
      }
      if (b.type === "web_search_tool_result") { assistant.push(b); continue; }
      let input: any = {}; try { input = JSON.parse(b.input || "{}"); } catch { /* */ }
      assistant.push({ type: "tool_use", id: b.id, name: b.name, input });
      let content = "", isErr = false;
      try {
        if (b.name === "search_jason") {
          const q = String(input.query || "");
          send({ t: "tool", v: "Otto Rules: " + q });
          const hits = search(cs, q);
          content = hits.length ? hits.map(fmt).join("\n\n") : "NOTHING FOUND for that wording. Try different words.";
        } else if (b.name === "propose_action" && o.dryRun) {
          // v3.16 self-test: check the card the way the server would, store nothing.
          // v3.17: the same checks proposeAction makes (it takes price OR limit_price; args may arrive as a JSON string).
          const c0 = input?.calls?.[0] || {};
          let args: any = c0.args; if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
          const leg = args?.legs?.[0], pl = input?.plan || {};
          const miss = [!input?.title && "title", c0.tool !== "place_option_order" && `tool (got ${c0.tool})`, !leg?.option_id && "legs[0].option_id",
            !(Number(args?.price ?? args?.limit_price) > 0) && "price", !pl.tv_symbol && "plan.tv_symbol", !pl.direction && "plan.direction",
            !pl.setup && "plan.setup", pl.tp1 == null && "plan.tp1", pl.stop == null && "plan.stop", !(Number(pl.stop_option) > 0) && "plan.stop_option"].filter(Boolean);
          if (miss.length) throw new Error("card is missing " + miss.join(", "));
          dry.push(input);
          content = "SELF-TEST: card accepted (not stored). Write one line and stop.";
        } else if (b.name === "propose_action") {
          if (!o.allowPropose) throw new Error("no cards in this run");
          send({ t: "tool", v: "Preparing card: " + String(input.title || "") });
          const card = await proposeAction(input, who, { planExtra: o.planExtra });
          cards.push(card.id);
          send({ t: "action", v: card });
          content = `Card ${card.id} is on screen, status pending. Nothing has run. ` +
            `Risk: ${JSON.stringify(card.risk)}. Rule check: ${JSON.stringify(card.checks || [])}. Robinhood review: ${(card.review || "n/a").slice(0, 1500)}`;
        } else if (b.name === "option_shortlist") {
          const side = input.side === "put" ? "put" : "call";
          send({ t: "tool", v: `Contracts: ${String(input.ticker || "").toUpperCase()} ${side}s` });
          const sl = await withTimeout(shortlistCached(String(input.ticker || ""), side), 30_000, "shortlist");
          content = sl.text + "\n" + CONTRACT_RULE;
        } else if (b.name === "add_watch_level") {
          send({ t: "tool", v: `Watcher: ${String(input.ticker || "").toUpperCase()} ${input.level}` });
          const scan = who === "scanner";
          const row = await watchAdd({ ticker: input.ticker, level: Number(input.level), dir: input.dir, note: input.note,
            source: scan ? "scanner" : "desk", by: scan ? "Jarvis (scanner)" : `${o.author || "Desk"} via Jarvis` });
          if (row && !scan) await logDesk("system", "Otto", `👁 Watching ${row.ticker} ${Number(row.level)} ${row.dir === "up" ? "▲" : row.dir === "down" ? "▼" : "▲▼"} today (added by Jarvis for ${o.author || "the Desk"}).`);
          content = row ? (scan ? `Proposed: ${row.ticker} ${row.level} (${row.dir}). It shows in the Watcher panel for them to Add.`
            : `On the Watcher for ${row.day}: ${row.ticker} ${row.level} (${row.dir}). The server checks it every minute on 5- and 10-minute closes and wakes you on a trigger.`)
            : "Already on today's list.";
        } else if (b.name === "save_house_rule") {
          send({ t: "tool", v: "Saving a House Rule" });
          await houseRuleAdd(String(input.text || ""), `${o.author || "Desk"} via Jarvis`);
          content = "Saved. It's in Settings → House Rules and applies from the next message on.";
        } else if (b.name === "schedule_check") {
          send({ t: "tool", v: "Check-in at " + String(input.at || "") });
          const row = await checkAdd(String(input.at || ""), String(input.what || ""), `${o.author || o.who || "Desk"} via Jarvis`);
          content = `Scheduled #${row?.id ?? "?"}: at ${input.at} ET the server runs you again with that note and pings their phones. You may now say you'll check back then.`;
        } else if (b.name === "close_position") {
          if (!o.allowClose) throw new Error("auto-close isn't available in this run — use propose_action");
          send({ t: "tool", v: "Auto-close: " + String(input.reason || "").slice(0, 80) });
          const r = await closeNow(input, who);
          content = `DONE, no card needed: ${r.title}. Market sell sent (order ${r.order_id || "id not returned"}). It's posted on the Desk.`;
          send({ t: "tool", v: "Closed: " + r.title });
        } else {
          const m = /^(tv|rh)__(.+)$/.exec(b.name);
          if (!m || !READ[m[1]].has(m[2])) throw new Error("unknown tool " + b.name);
          const args = { ...input };
          if (m[1] === "rh" && RH_FORCE_ACCT.has(m[2])) args.account_number = await agenticAccount();
          send({ t: "tool", v: SVC[m[1]].name + ": " + m[2].replace(/^mcp-(tv|watchlist)-/, "") });
          const left = Math.max(5000, Math.min(45000, deadline - Date.now() - 20000));
          // v3.16 (code review 6 Oct): TradingView calls from Jarvis go through the shared breaker too.
          if (m[1] === "tv") await tvSlowLoad();
          const p = call(m[1], m[2], args);
          content = etAnnotate(mcpText(await (m[1] === "tv" ? tvBudget(p, left, "TradingView " + m[2]) : withTimeout(p, left, SVC[m[1]].name + " " + m[2]))).slice(0, 30000));
        }
      } catch (e) {
        isErr = true; content = "ERROR: " + (e as Error).message;
        errors.push(`${b.name}: ${String((e as Error).message).slice(0, 160)}`);
      }
      (isErr ? failed : did).push(b.name);
      results.push({ type: "tool_result", tool_use_id: b.id, content: content || "(empty)", ...(isErr ? { is_error: true } : {}) });
    }
    msgs.push({ role: "assistant", content: assistant });
    // v3.13: a one-line clock with every round of tool results, so a long turn never loses the time.
    const c = marketClock();
    msgs.push({ role: "user", content: [...results, { type: "text", text: `[clock: ${fmtMin(c.min)} ET ${dayName(c.date)} ${c.date}, market ${c.status === "open" ? "OPEN" : c.status === "pre" ? "PRE-MARKET" : "CLOSED"}]` }] });
  }
  return done({ outOfRounds: true });
}

// v3.9: the Desk's system prompt, tools and context line — shared by the live Desk and Otto Signals.
async function deskSetup() {
  const calls = await loadBrain();
  const cs = chunksOf(calls);
  const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
  const [dt, sent] = await Promise.all([deskTools(), settle(sentimentNow())]);
  const { tools: mcpToolDefs, help, status } = dt;
  const tools: any[] = [
    TOOLS[0],                                         // search_jason
    { type: "web_search_20250305", name: "web_search", max_uses: 4 },
    ...mcpToolDefs,
    PROPOSE_TOOL(help),
    SHORTLIST_TOOL,
  ];
  const LIMa = await getLimits().catch(() => LIMIT_DEFAULTS);
  if (LIMa.auto_close) tools.push(CLOSE_TOOL);
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const bn = sent.ok ? `Banner: ${sent.v.verdict} (score ${sent.v.score}, ${sent.v.fresh}/${sent.v.total} legs fresh; fired: ${sent.v.rows.filter((r: any) => r.fired).map((r: any) => "row " + r.row).join(", ") || "none"}).` : "Banner: unavailable.";
  const LIM = await getLimits().catch(() => LIMIT_DEFAULTS);
  const prot = await settle(db("otto_actions?select=title,exit&exit->>state=in.(waiting_fill,armed)&limit=5"));
  const protLine = prot.ok && prot.v.length ? " Protected trades (Otto runs their stop and alerts; to close one early, cancel_option_order its stop_order_id first, then sell, in one card): " +
    prot.v.map((r: any) => `${r.title} [${r.exit.state}${r.exit.stop_order_id ? `, stop_order_id ${r.exit.stop_order_id} at $${r.exit.stop_option}` : ""}, wrong-if ${r.exit.wrong_if}, TP1 ${r.exit.tp1}]`).join("; ") + "." : "";
  const jctx = await jasonContext().catch(() => "");
  const ctxLine = `[Desk context — ${now} ET. TradingView: ${status.tv}. Robinhood: ${status.rh}. ${bn} Their guardrails (Phase ${LIM.phase}; they FLAG, never block): max loss per trade at the stop ${LIM.max_trade_loss > 0 ? `$${LIM.max_trade_loss}${LIM.pct_mode && LIM.max_trade_pct > 0 ? ` (${LIM.max_trade_pct}% of the $${Math.round(LIM.account_value)} Agentic account)` : ""}` : "off"}, weekly loss limit $${LIM.weekly_loss}${LIM.pct_mode && LIM.weekly_pct > 0 ? ` (${LIM.weekly_pct}%)` : ""}, daily stop after ${LIM.daily_losses || "—"} losing trades or 2× the max loss, ${LIM.max_trades_day} trades/day, size flag over ${LIM.warn_pct}% of the account. Size ideas inside these when a contract allows it (set stop_option so the loss at the stop fits); when nothing fits, still make the card — it gets the red flag — and say so in one line.${protLine} Auto-close: ${LIM.auto_close ? "ON (close_position works 9:30–4:00 ET)" : "OFF (closes go on a card)"}.${jctx}]`;

  // v3.16: the exact list of what runs on its own, so Jarvis can only point at real things.
  const running = await runningNow().catch(() => "");
  const pl = await plansToday().catch(() => []);   // v3.19: today's locked plans — hold them to it
  const planLineCtx = pl.length ? "\nTODAY'S LOCKED PLANS (the trader's own; flag any card or trade that isn't this plan): " + pl.map((p: any) => `${p.author}: ${p.line}`).join(" | ") : "";
  return { cs, sys, tools, ctxLine: (running ? ctxLine + "\n" + running : ctxLine) + planLineCtx + "\n" + CONTRACT_RULE, autoClose: !!LIMa.auto_close };
}

export async function desk(req: Request, who: string, _apiKey: string) {
  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!history.length) throw new Error("no messages");
  const author = String(body.author || "Ifoma").slice(0, 30);
  const isJason = !!body.jason;                    // v3.7: a pasted Jason post

  let setup: Awaited<ReturnType<typeof deskSetup>>;
  try { setup = await deskSetup(); }
  catch (e) {   // v3.13: even a setup failure shows on the Desk
    await logDesk("system", "Otto", `⚠ Jarvis couldn't start on ${author}'s message (${String((e as Error).message).slice(0, 160)}). Send it again.`).catch(() => {});
    throw e;
  }
  const { cs, sys, tools, ctxLine, autoClose } = setup;
  const LIMa = { auto_close: autoClose };

  const msgs: any[] = history.map((m: any, i: number) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    let text = String(m.content || "").slice(0, 8000);
    if (role === "user" && m.author) text = `${String(m.author).slice(0, 30)}: ${text}`;
    if (i === history.length - 1 && role === "user") {
      text = ctxLine + "\n" + text;
      const img = m.image && typeof m.image.data === "string" && m.image.data.length > 100 && m.image.data.length < 6_000_000 ? m.image : null;
      if (img) return { role, content: [
        { type: "image", source: { type: "base64",
          media_type: /^image\/(jpeg|png|webp|gif)$/.test(img.media_type) ? img.media_type : "image/jpeg", data: img.data } },
        { type: "text", text }] };
    }
    return { role, content: text };
  });
  // The API wants alternating turns starting with the user.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  for (let i = msgs.length - 1; i > 0; i--) {
    if (msgs[i].role !== msgs[i - 1].role) continue;
    const toArr = (c: any) => typeof c === "string" ? [{ type: "text", text: c }] : c;
    msgs[i - 1].content = [...toArr(msgs[i - 1].content), ...toArr(msgs[i].content)];
    msgs.splice(i, 1);
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Error("last message must be from you");

  const last = history[history.length - 1];
  if (!isJason) await logDesk("user", author, String(last.content || "") + (last.image ? "\n[chart attached]" : ""));
  const lastImg = last.image && typeof last.image.data === "string" && last.image.data.length > 100 && last.image.data.length < 6_000_000 ? last.image : null;

  const encS = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => { try { ctrl.enqueue(encS.encode("data: " + JSON.stringify(o) + "\n\n")); } catch { /* client left */ } };
      let res: any = { said: "", cards: [] as string[] };
      let jrows: any[] = [];
      try {
        if (isJason) {
          // v3.7: read Jason's post first (vision, forced tool), save it, then hand Jarvis a structured prompt.
          send({ t: "tool", v: "Reading the signal" });
          const typed = String(last.content || "").replace(/^\(chart attached\)$/, "").trim();
          jrows = await jasonIntake(_apiKey, lastImg, typed && !lastImg ? typed : "", who, author);
          await logDesk("user", author, "📣 Signal (pasted)" + (jrows.length ? ":\n" + jrows.map((r: any) => `${r.posted_label || "?"} · ${r.words}`).join("\n") : " — nothing could be read from it") +
            (typed && lastImg ? "\n" + typed : ""));
          send({ t: "jason", v: jrows.length });
          const lm = msgs[msgs.length - 1];
          const prompt = ctxLine + "\n" + author + ": " + jasonPrompt(jrows, lastImg ? typed : "");
          if (typeof lm.content === "string") lm.content = prompt;
          else { const tb = lm.content.filter((b: any) => b.type === "text"); if (tb.length) tb[tb.length - 1].text = prompt; else lm.content.push({ type: "text", text: prompt }); }
        }
        const deskTools = [...tools, HOUSE_TOOL, WATCH_TOOL, CHECK_TOOL];
        const deskStart = Date.now();
        res = await runDesk({ msgs, sys, tools: deskTools, cs, who, send, allowPropose: true, allowClose: !!LIMa.auto_close, author });
        // v3.16: promises in the reply must be backed by something real — otherwise one correction round, shown under the reply.
        if (!res.timedOut && Date.now() - deskStart < RUN_BUDGET_MS - 45_000) {   // never let the check push the reply past the 150 s cut-off
          const fix = await enforcePromises(res, async (extra) => {
            const m2 = [...msgs, { role: "assistant", content: res.finalText || res.said || "(no text)" }, { role: "user", content: extra }];
            send({ t: "text", v: "\n\n" });
            const r2 = await runDesk({ msgs: m2, sys, tools: deskTools, cs, who, send, allowPropose: false, allowClose: false, author, maxRounds: 3,
              deadline: Math.min(Date.now() + 40_000, deskStart + RUN_BUDGET_MS + 10_000) });
            return { said: r2.said, did: r2.did };
          }).catch(() => ({ added: "", bad: [] as any[], fallback: false }));
          if (fix.bad.length && fix.added) {
            if (fix.fallback) send({ t: "text", v: fix.added });       // Jarvis's own fix was already streamed
            res.said = res.said.trim() + "\n\n" + fix.added;
          }
        }
        send({ t: "done" });
      } catch (e) {
        // v3.13: never go silent — the failure is posted on the Desk, not only to the open browser tab.
        const m = String((e as Error).message ?? e).slice(0, 300);
        send({ t: "error", v: m });
        await logDesk("system", "Otto", `⚠ Jarvis couldn't answer ${author}'s last message (${/429|rate/i.test(m) ? "a data source is rate-limiting" : /overload|5\d\d/.test(m) ? "Claude is overloaded" : "error"}: ${m.slice(0, 160)}). Send it again.`).catch(() => {});
      }
      if (isJason && res.cards.length) {
        // Link each card to the Jason call it came from (plan.jason_id, else the only open call).
        try {
          const acts = await db("otto_actions?select=id,plan&id=in.(" + res.cards.join(",") + ")");
          const open = jrows.filter((r: any) => r.kind === "call" && !r.late && !r.action_id);
          for (const a of acts) {
            const jid = Number(a.plan?.jason_id);
            const row = jrows.find((r: any) => r.id === jid) || (open.length === 1 ? open[0] : null);
            if (row) await db("otto_jason?id=eq." + row.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ action_id: a.id }) });
          }
        } catch { /* the card still works; it just isn't linked */ }
      }
      if (res.said.trim() || res.cards.length) await logDesk("assistant", "Jarvis", res.said.trim(), res.cards[res.cards.length - 1] || null);
      try { ctrl.close(); } catch { /* */ }
    },
  });
  return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-store" } });
}

/* ===================================================================== v3.1
   4 Oct 2026 — sentiment banner, rule check, journal, weekly review, scorecard,
   scheduled morning read. Everything here reads TradingView / Robinhood through
   the same MCP client as the Desk; nothing here can place or change anything.

   Data note (tested 4 Oct): TradingView's screener-backed tools (quotes batch,
   earnings calendar) were returning 429. OHLCV and the economic calendar were
   fine. So the banner runs on OHLCV bars only; quotes fall back to bars; and
   earnings come from Robinhood's earnings calendar instead of TradingView's. */

/* ------------------------------------------------------------ small helpers */

function etParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value || "";
  return { wd: g("weekday"), date: `${g("year")}-${g("month")}-${g("day")}`, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
const fmtMin = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
function etLabel(iso: string) {
  const p = etParts(new Date(iso));
  return `${p.wd} ${fmtMin(p.min)}`;
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
function fridayOf(date: string) { const wd = new Date(date + "T12:00:00Z").getUTCDay(); return addDays(date, (5 - wd + 7) % 7); }
function mondayOf(date: string) { const wd = new Date(date + "T12:00:00Z").getUTCDay(); return addDays(date, -((wd + 6) % 7)); }

/* ------------------------------------------------------------ v3.13 market clock
   6 Oct 2026: Jarvis read Robinhood/TradingView UTC timestamps as New York time and
   told Josh "the market is closed" at 12:28 PM, called Tuesday "Oct 7", and got
   expiry weekdays wrong. The clock is now computed here, in code, and handed to
   every Jarvis run; tool timestamps are converted to ET before he sees them. */
const NYSE_CLOSED = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
const NYSE_HALF = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);   // 1:00 PM ET close
const WD_LONG: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayName(date: string) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00Z").getUTCDay()]; }
function prettyDate(date: string) { const [y, m, d] = date.split("-").map(Number); return `${WD_LONG[dayName(date)]}, ${MON[m - 1]} ${d}, ${y}`; }
function isTradingDay(date: string) { return !["Sat", "Sun"].includes(dayName(date)) && !NYSE_CLOSED.has(date); }
function nextTradingDay(date: string) { let d = addDays(date, 1); while (!isTradingDay(d)) d = addDays(d, 1); return d; }
// The last trading day of the week that holds `date` (normally Friday; Thursday when Friday is a holiday).
function weekExpiry(date: string) { let f = fridayOf(date); while (!isTradingDay(f)) f = addDays(f, -1); return f; }
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
export function marketClock(d = new Date()) {
  const e = etParts(d);
  const closeMin = NYSE_HALF.has(e.date) ? 780 : 960;
  const trading = isTradingDay(e.date);
  let status: "open" | "pre" | "after" | "closed", text: string;
  if (!trading) {
    status = "closed";
    text = `CLOSED today (${NYSE_CLOSED.has(e.date) ? "market holiday" : "weekend"}). Next open: ${prettyDate(nextTradingDay(e.date))} 9:30 AM ET`;
  } else if (e.min < 570) {
    status = "pre"; text = `PRE-MARKET — the regular session opens at 9:30 AM ET (in ${hm(570 - e.min)}); options don't trade until then`;
  } else if (e.min < closeMin) {
    status = "open"; text = `OPEN — regular session 9:30 AM–${fmtMin(closeMin)} ET, ${hm(closeMin - e.min)} left` +
      (e.min < 600 ? `; inside the first 30 minutes (until 10:00 AM)` : "");
  } else {
    status = "after"; text = `CLOSED for the day at ${fmtMin(closeMin)} ET (after hours; options don't trade). Next open: ${prettyDate(nextTradingDay(e.date))} 9:30 AM ET`;
  }
  const thisExp = weekExpiry(e.date), nextExp = weekExpiry(addDays(e.date, 7));
  const line = `[CLOCK — computed by Otto, authoritative: it is ${prettyDate(e.date)}, ${fmtMin(e.min)} ET. Market: ${text}. ` +
    `This week's expiry Friday = ${prettyDate(thisExp)} (${thisExp}); next week's = ${prettyDate(nextExp)} (${nextExp}). ` +
    `Tool data shows times in UTC (ending in Z); Otto writes the ET time next to each one ("= 12:08 PM ET"). ` +
    `Use THIS line for today's date, the weekday and whether the market is open — never work them out from a tool timestamp.]`;
  return { ...e, status, closeMin, thisExp, nextExp, line };
}
// "2026-10-06T16:08:00Z" → "2026-10-06T16:08:00Z (= 12:08 PM ET)"; adds the date when the ET day differs from today.
export function etAnnotate(text: string, now = new Date()): string {
  if (!text) return text;
  const today = etParts(now).date;
  return text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]00:?00)(?![\w(])/g, (m) => {
    const t = Date.parse(m.replace(/([+-]00)(00)$/, "$1:$2"));
    if (!isFinite(t)) return m;
    const p = etParts(new Date(t));
    return `${m} (= ${p.date === today ? "" : `${dayName(p.date)} ${MON[Number(p.date.slice(5, 7)) - 1]} ${Number(p.date.slice(8))} `}${fmtMin(p.min)} ET)`;
  }).replace(/("(?:time|t|timestamp|bar_time|begins_at_epoch)"\s*:\s*)(1[6-9]\d{8})(?=[,}\s])/g, (m, k, n) => {
    const p = etParts(new Date(Number(n) * 1000));
    return `${k}${n} /* = ${p.date === today ? "" : `${dayName(p.date)} ${MON[Number(p.date.slice(5, 7)) - 1]} ${Number(p.date.slice(8))} `}${fmtMin(p.min)} ET */`;
  });
}

const CACHE: Record<string, { at: number; v: any }> = {};
async function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const c = CACHE[key];
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await f();
  CACHE[key] = { at: Date.now(), v };
  return v;
}

async function tvBars(sym: string, interval: string, count: number): Promise<any[]> {
  return cached(`bars|${sym}|${interval}|${count}`, interval === "1D" ? 10 * 60e3 : 60e3, async () => {
    const j = mcpJson(await call("tv", "mcp-tv-get-ohlcv", { symbol: sym, interval, count }));
    if (!j || j.success === false || !Array.isArray(j.bars)) throw new Error(`no bars for ${sym}: ${j?.error || "empty"}`);
    return j.bars;
  });
}

async function econEvents(from: string, to: string, minImp = 1): Promise<any[]> {
  return cached(`econ|${from}|${to}|${minImp}`, 30 * 60e3, async () => {
    const j = mcpJson(await call("tv", "mcp-tv-get-economic-calendar",
      { date_from: from, date_to: to + "T23:59:59Z", min_importance: minImp, countries: "US" }));
    return (j?.result || []).map((e: any) => ({ date: e.date, title: e.title, importance: e.importance,
      actual: e.actual, forecast: e.forecast, previous: e.previous, period: e.period }));
  });
}

// Robinhood's calendar (TradingView's is screener-backed and was rate-limited).
async function earningsMap(): Promise<Record<string, string>> {
  return cached("earnings", 6 * 3600e3, async () => {
    const out: Record<string, string> = {};
    const today = etParts().date;
    for (const start of [today, addDays(today, 31)]) {
      try {
        const j = mcpJson(await call("rh", "get_earnings_calendar", { start_date: start, days: 31, filter: "high_market_cap" }));
        for (const r of j?.data?.results || []) {
          if (r?.eps?.actual != null) continue;
          const d = r?.report?.date; if (!d || !r.symbol) continue;
          if (!out[r.symbol] || d < out[r.symbol]) out[r.symbol] = d + (r.report.timing ? " " + r.report.timing : "");
        }
      } catch { /* partial is fine */ }
    }
    return out;
  });
}

// Prices for a list of EXCHANGE:TICKER. Screener batch first; bars if it's rate-limited.
async function quotesFor(syms: string[]): Promise<Record<string, { close: number; change: number | null }>> {
  const key = "q|" + syms.slice().sort().join(",");
  return cached(key, 90e3, async () => {
    const out: Record<string, any> = {};
    try {
      const j = mcpJson(await call("tv", "mcp-tv-get-symbol-data-batch", { symbols: syms, columns: ["close", "change"] }));
      if (j && j.success !== false) {
        const walk = (o: any) => {
          if (!o || typeof o !== "object") return;
          if (Array.isArray(o)) { o.forEach(walk); return; }
          const s = o.symbol || o.ticker || o.s; const d = o.d && typeof o.d === "object" ? o.d : o;
          if (typeof s === "string" && d.close != null) out[s] = { close: Number(d.close), change: d.change != null ? Number(d.change) : null };
          Object.values(o).forEach((v) => { if (v && typeof v === "object") walk(v); });
        };
        walk(j);
      }
    } catch { /* fall through */ }
    const missing = syms.filter((s) => !out[s]);
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.all(missing.slice(i, i + 8).map(async (s) => {
        try {
          const b = await tvBars(s, "1D", 2);
          const last = b[b.length - 1], prev = b.length > 1 ? b[b.length - 2] : null;
          out[s] = { close: last.c, change: prev ? (last.c - prev.c) / prev.c * 100 : null };
        } catch { /* leave missing */ }
      }));
    }
    return out;
  });
}

/* ------------------------------------------------------------ the sentiment banner
   Josh's Intermarket Sentiment Cheat Sheet, same thresholds as the v2.4 bias card
   (BIAS_RULES in index.html), now on real TradingView series instead of ETF
   stand-ins. No sizing anywhere — Ifoma's decision, 4 Oct: verdict and reasons only. */

const LEGS = [
  { k: "yield", sym: "TVC:US10Y", label: "10Y" },
  { k: "dollar", sym: "TVC:DXY", label: "DXY" },
  { k: "jpy", sym: "FX:USDJPY", label: "USD/JPY" },
  { k: "crude", sym: "NYMEX:CL1!", label: "Crude" },
  { k: "es", sym: "CME_MINI:ES1!", label: "ES" },
  { k: "nq", sym: "CME_MINI:NQ1!", label: "NQ" },
  { k: "ym", sym: "CBOT_MINI:YM1!", label: "YM" },
];
const SENT_RULES = [
  { row: 1, leg: "yield", when: (p: number) => p >= 0.60, side: -1, label: "10Y spikes up", why: "Higher discount rates compress tech multiples." },
  { row: 2, leg: "yield", when: (p: number) => p <= -0.40, side: +1, label: "10Y falls", why: "Easing yields relieve valuation pressure." },
  { row: 3, leg: "jpy", when: (p: number) => p <= -0.40, side: -1, label: "USD/JPY dumps", why: "Yen strengthening: risk-off, carry-trade unwind." },
  { row: 4, leg: "jpy", when: (p: number) => p >= 0.15, side: +1, label: "USD/JPY grinds up", why: "Dollar firm vs yen: healthy liquidity." },
  { row: 5, leg: "dollar", when: (p: number) => p >= 0.40, side: -1, label: "DXY breaks up", why: "Strong dollar tightens conditions." },
  { row: 6, leg: "crude", when: (p: number) => p >= 2.00, side: -1, label: "Crude spikes", why: "Energy shock lifts yields." },
];
const FRESH_SEC = 45 * 60;
let SENT: { at: number; body: any } | null = null;

async function tvLeg(l: any) {
  const [d, m] = await Promise.all([tvBars(l.sym, "1D", 3), tvBars(l.sym, "15m", 8)]);
  const last = m[m.length - 1];
  const cur = d[d.length - 1];
  const prev = last.t >= cur.t && d.length > 1 ? d[d.length - 2].c : cur.c;
  const pct = prev ? (last.c - prev) / prev * 100 : null;
  const age = Math.max(0, Date.now() / 1000 - (last.t + 900));
  return { k: l.k, label: l.label, sym: l.sym, src: "tv", price: last.c, pct, age: Math.round(age), live: pct !== null && age <= FRESH_SEC,
    spark: m.map((b: any) => b.c) };
}

/* Yahoo backup, 5 Oct 2026 (v3.4.1). TradingView's bar feed refused every
   connection mid-morning ("tvws: dial: websocket: bad handshake") and the
   banner fell to "1 of 7 fresh → No read". Ifoma's call: TradingView stays
   first; a leg that fails (or is staler than Yahoo's) is filled from Yahoo.
   Accuracy rules:
   - The REAL instruments, never ETF stand-ins (the old IEF/UUP/USO path went
     stale outside stock hours): ^TNX, DX-Y.NYB, JPY=X, CL=F, ES=F, NQ=F, YM=F.
   - A leg's price, prior close and % change all come from ONE source.
     Checked live 5 Oct 12:02 ET: Yahoo's prior closes match TradingView's
     prior daily bar (ES 7777.25, CL 91.11, 10Y 5.277 vs 5.275).
   - age = now − Yahoo's regularMarketTime (the real last-trade time; it
     advances, unlike the TwelveData `at` bug of 25 Aug). Yahoo's futures and
     DXY run ~10 min behind, ^TNX ~15; TradingView's own bars are delayed 15+.
     Ifoma chose to COUNT a delayed leg, labelled with its age; the same
     45-minute FRESH_SEC gate still drops anything older.
   - Every refresh tries TradingView first, so legs switch back on their own. */
const YAHOO_SYM: Record<string, string> = {
  yield: "^TNX", dollar: "DX-Y.NYB", jpy: "JPY=X", crude: "CL=F", es: "ES=F", nq: "NQ=F", ym: "YM=F",
};
async function yahooLeg(l: any) {
  const ys = YAHOO_SYM[l.k];
  const res: any = await cached(`yleg|${ys}`, 60e3, async () => {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ys) +
                          "?range=1d&interval=15m", { headers: UA });
    if (!r.ok) throw new Error("yahoo HTTP " + r.status);
    const j = await r.json();
    const x = j?.chart?.result?.[0];
    if (!x?.meta) throw new Error(j?.chart?.error?.description || "yahoo: no data");
    return x;
  });
  const m = res.meta;
  const price = Number(m.regularMarketPrice), prev = Number(m.chartPreviousClose ?? m.previousClose);
  const t = Number(m.regularMarketTime);
  if (!isFinite(price) || !isFinite(prev) || !prev || !isFinite(t)) throw new Error("yahoo: incomplete quote for " + ys);
  const pct = (price - prev) / prev * 100;
  const age = Math.max(0, Date.now() / 1000 - t);
  const closes = (res.indicators?.quote?.[0]?.close || []).filter((c: any) => typeof c === "number");
  return { k: l.k, label: l.label, sym: "Yahoo " + ys, src: "yahoo", price, pct, age: Math.round(age), live: age <= FRESH_SEC,
    spark: closes.slice(-8) };
}

// v3.9.2 (Ifoma, 6 Oct): Yahoo FIRST for the banner, TradingView only as the backup.
// TradingView has been rate-limiting / dropping every day since 4 Oct and its bars are
// 15+ min delayed anyway; Yahoo has been as fresh and steadier.
async function legData(l: any) {
  let y: any = null, yErr = "";
  try { y = await withTimeout(yahooLeg(l), 6000, "Yahoo"); } catch (e) { yErr = String((e as Error).message ?? e).slice(0, 160); }
  if (y && y.live) return y;
  let tv: any = null, tvErr = "";
  try { tv = await tvBudget(tvLeg(l), 8000, "TradingView"); } catch (e) { tvErr = String((e as Error).message ?? e).slice(0, 160); }
  // TradingView only replaces Yahoo when Yahoo failed or TradingView is fresher.
  if (tv && (!y || tv.age < y.age)) return { ...tv, yahoo_error: yErr || (y ? `Yahoo quote ${Math.round(y.age / 60)} min old` : "") };
  if (y) return tvErr ? { ...y, tv_error: tvErr } : y;
  throw new Error(`Yahoo: ${yErr || "no data"} · TradingView: ${tvErr || "no data"}`);
}

async function sentimentNow(force = false, kind = "live"): Promise<any> {
  if (!force && SENT && Date.now() - SENT.at < 4 * 60e3) return SENT.body;
  await tvSlowLoad();
  const legs = await Promise.all(LEGS.map((l) => legData(l).catch((e) => ({ k: l.k, label: l.label, sym: l.sym, live: false, error: (e as Error).message }))));
  const by: Record<string, any> = Object.fromEntries(legs.map((l: any) => [l.k, l]));
  const fresh = legs.filter((l: any) => l.live).length;
  let score = 0;
  const rows: any[] = [];
  for (const r of SENT_RULES) {
    const l = by[r.leg];
    const fired = !!(l && l.live && r.when(l.pct));
    if (fired) score += r.side;
    rows.push({ row: r.row, label: r.label, why: r.why, fired, side: r.side, value: l?.pct ?? null, leg: r.leg });
  }
  const sgn = (v: number) => (v >= 0 ? 1 : -1);
  const idx = ["es", "nq", "ym"].map((k) => by[k]).filter((l) => l && l.live);
  const aligned = idx.length === 3 && idx.every((l) => Math.abs(l.pct) >= 0.25) && new Set(idx.map((l) => sgn(l.pct))).size === 1 ? sgn(idx[0].pct) : 0;
  const nq = by.nq, ym = by.ym;
  const diverged = !!(nq?.live && ym?.live && sgn(nq.pct) !== sgn(ym.pct) && Math.abs(nq.pct) >= 0.20 && Math.abs(ym.pct) >= 0.20);
  if (aligned) score += aligned * 2;
  rows.push({ row: 7, label: "ES, NQ and YM break together", why: "Broad institutional buying or selling.", fired: !!aligned, side: aligned, value: null });
  rows.push({ row: 8, label: "NQ vs YM divergence", why: "Rotation, not entry: whipsaw risk.", fired: diverged, side: 0, value: null });

  let verdict: string, tone: string, note: string;
  if (fresh < 2) { verdict = "No read"; tone = "none"; note = "Not enough fresh data from TradingView or the Yahoo backup. Futures and FX trade almost 24h; if this persists outside the weekend, both feeds may be down."; }
  else if (diverged) { verdict = "Choppy — stand aside"; tone = "chop"; note = "Nasdaq and Dow pulling opposite ways. Josh's sheet calls that rotation (row 8): scalp only or stand aside."; }
  else if (fresh >= 5 && score >= 3) { verdict = "Leaning long"; tone = "long"; note = "Macro tailwind and the indexes agree."; }
  else if (fresh >= 5 && score <= -3) { verdict = "Leaning short"; tone = "short"; note = "Macro headwind and the indexes agree."; }
  else if (score >= 2) { verdict = "Mildly long — small size"; tone = "long"; note = "Some tailwind, not conviction (Scenario 3: small targets)."; }
  else if (score <= -2) { verdict = "Mildly short — small size"; tone = "short"; note = "Some headwind, not conviction (Scenario 3: small targets)."; }
  else { verdict = "No edge"; tone = "none"; note = "Nothing lines up. Jason: no edge, no trade."; }

  const now = etParts();
  let calendar: any[] = [];
  try { calendar = await tvBudget(econEvents(now.date, now.date, 0), 5000, "TradingView calendar"); } catch { /* shown as unavailable */ }
  const nextHigh = calendar.find((e) => e.importance >= 1 && Date.parse(e.date) > Date.now()) || null;

  let window: string | null = null;
  if (!["Sat", "Sun"].includes(now.wd)) {
    if (now.min >= 570 && now.min < 600) window = "in";
    else if (now.min >= 525 && now.min < 570) window = "soon";
  }
  const dir = (l: any, bad: number) => !l?.live || l.pct == null ? "—" : (Math.sign(l.pct) === bad ? "headwind" : "tailwind");
  const jason = {
    capital: { label: "10-year (cost of capital)", pct: by.yield?.pct ?? null, read: dir(by.yield, 1) },
    transport: { label: "Crude (cost of transportation)", pct: by.crude?.pct ?? null, read: dir(by.crude, 1) },
    currency: { label: "USD/JPY (cost of currency)", pct: by.jpy?.pct ?? null, read: dir(by.jpy, -1) },
  };
  let news: any = null;
  try {
    const r = await db("otto_sentiment?kind=eq.auto&order=id.desc&limit=1&select=at,news");
    if (r?.[0]?.news && Date.now() - Date.parse(r[0].at) < 14 * 3600e3) news = { text: r[0].news, at: r[0].at };
  } catch { /* table may be missing until 005 runs */ }

  const backup = legs.filter((l: any) => l.src === "yahoo").length;
  const body = { ok: true, at: Date.now(), et: `${now.wd} ${fmtMin(now.min)}`, verdict, tone, score, fresh, total: LEGS.length, backup,
    note, legs: legs.map((l: any) => { const { spark, ...rest } = l; return { ...rest, spark }; }), rows, calendar, next_event: nextHigh,
    window, jason, news };
  SENT = { at: Date.now(), body };
  try {
    const last = await db("otto_sentiment?order=id.desc&limit=1&select=at");
    if (kind === "auto" || !last?.[0] || Date.now() - Date.parse(last[0].at) > 5 * 60e3) {
      await db("otto_sentiment", { method: "POST", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ kind, verdict, score, payload: { ...body, legs: body.legs.map((l: any) => ({ ...l, spark: undefined })) } }) });
    }
  } catch { /* history is a nice-to-have */ }
  return body;
}

/* ------------------------------------------------------------ Market (desktop) */

const MAG7 = ["NASDAQ:AAPL", "NASDAQ:MSFT", "NASDAQ:NVDA", "NASDAQ:AMZN", "NASDAQ:GOOGL", "NASDAQ:META", "NASDAQ:TSLA"];

async function marketDesk() {
  const now = etParts();
  const [sent, mag, week, earn, wl] = await Promise.all([
    settle(sentimentNow()),
    settle(quotesFor(MAG7)),
    settle(econEvents(now.date, addDays(now.date, 7), 0)),
    settle(earningsMap()),
    settle((async () => mcpJson(await call("tv", "mcp-watchlist-get-active-watchlist", {}))?.watchlist)()),
  ]);
  const watch: string[] = wl.ok ? (wl.v?.symbols || []) : [];
  const upcoming = earn.ok ? watch.map((s) => ({ sym: s, date: earn.v[s.split(":")[1]] })).filter((x) => x.date && x.date.slice(0, 10) <= addDays(now.date, 14)) : [];
  return {
    ok: true,
    sentiment: sent.ok ? sent.v : { error: sent.error },
    mag7: mag.ok ? MAG7.map((s) => ({ sym: s, ...(mag.v[s] || {}) })) : { error: mag.error },
    calendar_week: week.ok ? week.v : { error: week.error },
    earnings: earn.ok ? upcoming : { error: earn.error },
    watchlist: wl.ok ? { name: wl.v?.name, n: watch.length } : null,
  };
}

/* ------------------------------------------------------------ rule check */

export async function ruleChecks(out: any[], plan: any, risk: any, banner: any) {
  const checks: any[] = [];
  const add = (ok: boolean | null, text: string) => checks.push({ ok, text });
  const open = out.find((c) => c.tool === "place_option_order" && (c.args.legs || []).some((l: any) => l.position_effect === "open"));
  if (!open) return checks;
  const now = etParts();
  if (["Sat", "Sun"].includes(now.wd) || now.min < 570 || now.min >= 960) add(null, "Market closed now: this waits for the open (no entries in the first 30 minutes unless the open goes off a pre-posted Signal level)");
  else if (now.min < 600) {
    // House Rule (6 Oct): the open is fair game when price opens on / pushes off a Signal level posted before the open.
    if (plan?.signal_level === true) add(null, "Inside the first 30 minutes: OK by the House Rule (a pre-posted Signal level the open went off)");
    else add(false, "Inside the first 30 minutes (Otto Rules: wait until 10:00 unless the open goes off a pre-posted Signal level)");
  }
  else add(true, `Past the first 30 minutes (${fmtMin(now.min)} ET)`);

  const leg = open.args.legs.find((l: any) => l.position_effect === "open");
  let q: any = null, ins: any = null;
  try { ins = (mcpJson(await call("rh", "get_option_instruments", { ids: leg.option_id }))?.data?.instruments || [])[0] || null; } catch { /* */ }
  try { q = (mcpJson(await call("rh", "get_option_quotes", { instrument_ids: [leg.option_id] }))?.data?.results || [])[0]?.quote || null; } catch { /* */ }
  if (q?.delta != null) { const d = Math.abs(Number(q.delta)); add(d >= 0.30 && d <= 0.40, `Delta ${d.toFixed(2)} (Otto Rules: 0.30–0.40)`); }
  else add(null, "Delta: couldn't read the quote");
  if (q?.volume != null && q?.open_interest != null) add(Number(q.volume) > Number(q.open_interest), `Volume ${q.volume} vs open interest ${q.open_interest} (Otto Rules: volume > OI)`);
  else add(null, "Volume vs open interest: not available");
  if (risk?.pct != null) add(risk.pct <= (risk.warn_pct || 20) / 100, `${Math.round(risk.pct * 100)}% of the account (flag above ${risk.warn_pct || 20}%)`);
  else add(null, "Size vs account: unknown (no limit price)");

  const exp = ins?.expiration_date || null;
  if (exp) {
    const days = dayDiff(now.date, exp);
    if (days <= 0) add(false, "Expires today (0DTE)");
    else if (["Thu", "Fri"].includes(now.wd) && exp === fridayOf(now.date)) add(false, "This Friday's expiry after Wednesday (Otto Rules: use next week's)");
    else add(true, `Expiry ${exp} (${days} day${days === 1 ? "" : "s"})`);
    try {
      const ev = (await econEvents(now.date, exp, 1)).filter((e) => Date.parse(e.date) > Date.now());
      if (ev.length) add(false, `Binary event before expiry: ${ev.slice(0, 2).map((e) => `${e.title} ${etLabel(e.date)}`).join(", ")}`);
      else add(true, "No high-impact release before expiry");
    } catch { add(null, "Economic calendar: not available"); }
    const tk = String(plan?.tv_symbol || ins?.chain_symbol || "").split(":").pop();
    if (tk) {
      try {
        const e = (await earningsMap())[tk];
        if (e && e.slice(0, 10) <= exp) add(false, `${tk} reports earnings ${e}, before expiry`);
        else add(true, e ? `${tk} earnings ${e}, after expiry` : `No ${tk} earnings in the next 2 months`);
      } catch { add(null, "Earnings: couldn't check"); }
    }
  }
  if (banner?.verdict) {
    const v = banner.verdict;
    if (/choppy/i.test(v)) add(false, "Banner says choppy: scalp only, small");
    else if (plan?.direction && ((/long/i.test(v) && plan.direction === "down") || (/short/i.test(v) && plan.direction === "up"))) add(false, `Against the banner (${v})`);
    else add(true, `Banner: ${v}`);
  }
  return checks;
}

/* ------------------------------------------------------------ journal (auto-filled) */

async function allAccounts(): Promise<any[]> {
  return cached("accounts", 30 * 60e3, async () => {
    const j = mcpJson(await call("rh", "get_accounts", {}));
    return (j?.data?.accounts || []).filter((a: any) => a.account_number && !a.deactivated)
      .map((a: any) => ({ n: String(a.account_number), agentic: a.agentic_allowed === true,
        label: `${a.agentic_allowed ? "Agentic" : (a.nickname || "Individual")} ${mask(a.account_number)}` }));
  });
}

async function syncJournal(force = false) {
  if (!force && CACHE.journalSync && Date.now() - CACHE.journalSync.at < 2 * 60e3) return;
  CACHE.journalSync = { at: Date.now(), v: true };
  const since = addDays(etParts().date, -120);
  const fills: any[] = [];
  for (const a of await allAccounts()) {
    let cursor: string | undefined;
    for (let page = 0; page < 8; page++) {
      let j: any;
      try { j = mcpJson(await call("rh", "get_option_orders", { account_number: a.n, state: "filled", created_at_gte: since, ...(cursor ? { cursor } : {}) })); }
      catch { break; }
      for (const o of j?.data?.orders || []) {
        for (const l of o.legs || []) {
          for (const x of l.executions || []) {
            fills.push({ acct: a.label, order_id: o.id, agent: o.placed_agent, option_id: l.option_id, sym: o.chain_symbol,
              strike: Number(l.strike_price), type: l.option_type, exp: l.expiration_date, side: l.side, effect: l.position_effect,
              price: Number(x.price), qty: Number(x.quantity), ts: x.timestamp, mult: Number(o.trade_value_multiplier) || 100 });
          }
        }
      }
      cursor = j?.data?.next || j?.next || undefined;
      if (!cursor) break;
    }
  }
  fills.sort((a, b) => a.ts.localeCompare(b.ts));
  const trades: Record<string, any> = {};
  const lots: Record<string, any[]> = {};
  for (const f of fills) {
    const k = f.acct + "|" + f.option_id;
    if (f.effect === "open") {
      const id = (f.acct + "|" + f.option_id + "|" + f.order_id).replace(/\s/g, "");
      const t = trades[id] ||= { id, account: f.acct, symbol: f.sym, option_id: f.option_id,
        contract: `${f.sym} ${f.strike % 1 ? f.strike : Math.round(f.strike)}${f.type === "put" ? "P" : "C"} ${f.exp.slice(5).replace("-", "/")}`,
        exp: f.exp, side: f.side === "buy" ? "long" : "short", qty: 0, entry_cost: 0, exit_value: 0, closed_qty: 0,
        opened_at: f.ts, closed_at: null, open_order_id: f.order_id, agent: f.agent, mult: f.mult };
      t.qty += f.qty; t.entry_cost += f.price * f.qty;
      (lots[k] ||= []).push({ id, left: f.qty });
    } else {
      let left = f.qty;
      for (const lot of lots[k] || []) {
        if (left <= 0) break;
        const take = Math.min(lot.left, left); if (take <= 0) continue;
        lot.left -= take; left -= take;
        const t = trades[lot.id]; t.exit_value += f.price * take; t.closed_qty += take; t.closed_at = f.ts;
      }
    }
  }
  const today = etParts().date;
  const rows = Object.values(trades).map((t: any) => {
    let status = t.closed_qty >= t.qty ? "closed" : t.closed_qty > 0 ? "partial" : "open";
    if (status !== "closed" && t.exp < today) {            // expired worthless: the rest closes at 0
      t.closed_qty = t.qty; status = "expired"; t.closed_at = t.closed_at || t.exp + "T20:00:00Z";
    }
    const entry = t.entry_cost / t.qty;
    const exit = t.closed_qty ? t.exit_value / t.closed_qty : null;
    const pnl = t.closed_qty ? (t.side === "long" ? 1 : -1) * (t.exit_value - entry * t.closed_qty) * t.mult : null;
    return { id: t.id, account: t.account, symbol: t.symbol, contract: t.contract, option_id: t.option_id, side: t.side,
      qty: t.qty, entry: +entry.toFixed(4), exit: exit == null ? null : +exit.toFixed(4), pnl: pnl == null ? null : +pnl.toFixed(2),
      opened_at: t.opened_at, closed_at: status === "open" ? null : t.closed_at, status, open_order_id: t.open_order_id,
      agent: t.agent, updated_at: new Date().toISOString() };
  });
  if (!rows.length) return;
  // link to the Desk card that placed it
  try {
    const acts = await db("otto_actions?select=id,order_id&order_id=not.is.null&order=created_at.desc&limit=300");
    const byOrder: Record<string, string> = Object.fromEntries(acts.map((a: any) => [a.order_id, a.id]));
    rows.forEach((r: any) => { if (byOrder[r.open_order_id]) r.action_id = byOrder[r.open_order_id]; });
  } catch { /* */ }
  for (let i = 0; i < rows.length; i += 200) {
    await db("otto_trades?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 200)) });
  }
}

async function journal(force = false) {
  let syncErr: string | null = null;
  try { await syncJournal(force); } catch (e) { syncErr = (e as Error).message; }
  const rows = await db("otto_trades?select=*&order=opened_at.desc&limit=200");
  const ids = [...new Set(rows.map((r: any) => r.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=*&id=in.(" + ids.join(",") + ")") : [];
  return { ok: true, rows, actions: acts.map(publicAction), sync_error: syncErr };
}

/* ------------------------------------------------------------ weekly review */

function postHocChecks(t: any, a: any) {
  if (a?.checks?.length) return a.checks;
  const p = etParts(new Date(t.opened_at));
  return [p.min >= 570 && p.min < 600 ? { ok: false, text: "Opened inside the first 30 minutes" } : { ok: true, text: "Not in the first 30 minutes" }];
}

async function weeklyReview(apiKey: string, who = "Jarvis") {
  await syncJournal(true);
  const now = etParts();
  const ws = ["Sat", "Sun"].includes(now.wd) ? mondayOf(addDays(now.date, -2)) : mondayOf(now.date);
  const we = addDays(ws, 4);
  const all = await db("otto_trades?select=*&order=closed_at.desc&limit=400");
  const wk = all.filter((t: any) => t.pnl != null && t.closed_at && etParts(new Date(t.closed_at)).date >= ws && etParts(new Date(t.closed_at)).date <= we);
  const ids = [...new Set(wk.map((t: any) => t.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=*&id=in.(" + ids.join(",") + ")") : [];
  const actBy: Record<string, any> = Object.fromEntries(acts.map((a: any) => [a.id, a]));
  const items: any[] = wk.map((t: any) => ({ id: t.id, contract: t.contract, account: t.account, pnl: t.pnl, opened: t.opened_at, closed: t.closed_at,
    status: t.status, reason: t.reason || null, from_card: !!t.action_id, setup: actBy[t.action_id]?.plan?.setup || null,
    banner: actBy[t.action_id]?.banner?.verdict || null, checks: postHocChecks(t, actBy[t.action_id]) }));
  const wins = items.filter((t) => t.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 5);
  const losses = items.filter((t) => t.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5);
  const total = items.reduce((s, t) => s + t.pnl, 0);

  let pattern = "", one_thing = "", rules: any[] = [];
  if (items.length) {
    const calls = await loadBrain();
    const cs = chunksOf(calls);
    const seen = new Set<string>(); const hits: Chunk[] = [];
    for (const q of ["resistance support entry rejection bounce rates", "first 30 minutes gap trap", "size account percent", "exit entry candle runner TP1"])
      for (const h of search(cs, q, 6)) { const k = h.d + h.at + h.s.slice(0, 40); if (!seen.has(k)) { seen.add(k); hits.push(h); } }
    const sys = `You are Jarvis, writing Ifoma's Friday trade review on the Otto desk: direct, numbers first, no hype. Judge each trade against Jason Murray's method (material below). Cite Jason as (call date, MM:SS) only from the material given. Never invent a rule. Respond with JSON only: {"pattern": "2-4 sentences on what the winners and losers have in common", "one_thing": "one concrete thing to do differently next week", "rules": [{"rule": "short rule name", "followed": n, "broken": n}]}.\n\nJASON'S RULES:\n${alwaysOn(calls)}\n\nMATERIAL:\n${hits.slice(0, 18).map(fmt).join("\n\n")}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys + NAME_RULE,
        messages: [{ role: "user", content: `Week of ${ws}. Closed trades (P&L in $):\n${JSON.stringify(items, null, 1).slice(0, 40000)}` }] }),
    });
    const j = await r.json();
    const txt = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    try { const p = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); pattern = p.pattern || ""; one_thing = p.one_thing || ""; rules = p.rules || []; }
    catch { pattern = txt.slice(0, 1200); }
  } else {
    pattern = "No closed trades this week.";
  }
  const payload = { week_start: ws, week_end: we, total: +total.toFixed(2), n: items.length, wins, losses, pattern, one_thing, rules,
    missing_reasons: items.filter((t) => !t.reason).length };
  await db("otto_reviews?on_conflict=week_start", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ week_start: ws, payload, built_by: who, created_at: new Date().toISOString() }) });
  await logDesk("system", "Otto", `Weekly review for the week of ${ws} is ready (Review tab): ${items.length} closed trade${items.length === 1 ? "" : "s"}, ${total >= 0 ? "+" : "−"}$${Math.abs(total).toFixed(2)}.${one_thing ? " Next week: " + one_thing : ""}`);
  return payload;
}

/* ------------------------------------------------------------ scorecard
   Every opening option card is an idea, taken or not. An idea is scored on the
   UNDERLYING: did price touch TP1 before the stop, using 5-minute TradingView
   bars from the moment the card was made. Stop-first when one bar touches both
   (conservative). Passed ideas are labelled hypothetical everywhere. */

// v3.14: graded on Robinhood 5-minute bars (TradingView's were rate-limited), same day only (intraday House Rule).
async function evalIdea(a: any) {
  const p = a.plan || {}, ex = a.exit || {};
  const tp1 = Number(p.tp1), wrong = Number(p.stop);
  const tk = String(p.tv_symbol || "").split(":").pop();
  if (!tk || !isFinite(tp1) || !isFinite(wrong) || !p.direction) return { state: "unscored" };
  const created = Date.parse(a.created_at);
  if (Date.now() - created < 5 * 60e3) return { state: "pending" };
  const day = etParts(new Date(created)).date;
  const start = new Date(created - 10 * 60e3).toISOString(), end = nyIso(day, "4:00 PM") || undefined;
  let bars: Bar[];
  try { bars = (await rhBars([tk], "5minute", start, end && Date.parse(end) < Date.now() ? end : undefined))[tk.toUpperCase()] || []; }
  catch { return { state: "pending" }; }
  const dm = /Delta (\d?\.\d+)/.exec((a.checks || []).map((c: any) => c.text).join(" "));
  const g: any = gradeIdea({ created, direction: p.direction === "down" ? "down" : "up", tp1, wrong, entry: Number(p.entry_underlying) || null,
    delta: dm ? Number(dm[1]) : null, premium: Number(ex.entry_limit) || (a.risk?.cost ? a.risk.cost / 100 : null), tf: Number(p.wrong_tf || ex.wrong_tf) || 15 }, bars);
  return g.state === "open" ? { state: "pending" } : { ...g, at: g.at ? Math.round(g.at / 1000) : undefined };
}
// v3.14: grade a few open ideas every 5 minutes from the cron, so the Scoreboard is current without opening it.
async function scoreTick(budget = 6) {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const acts = await db(`otto_actions?select=*&created_at=gte.${since}&order=created_at.desc&limit=100`).catch(() => []);
  let n = 0;
  for (const a of acts) {
    if (n >= budget) break;
    if (!a.plan || (a.outcome && ["win", "loss", "scratch", "unscored"].includes(a.outcome.state))) continue;
    if (!(a.calls || []).some((c: any) => c.tool === "place_option_order" && (c.args?.legs || []).some((l: any) => l.position_effect === "open"))) continue;
    n++;
    const o = await evalIdea(a).catch(() => null);
    if (o && ["win", "loss", "scratch", "unscored"].includes(o.state))
      await db("otto_actions?id=eq." + a.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ outcome: o }) }).catch(() => {});
  }
  return { ok: true, graded: n };
}
async function scorecard() {
  const acts = await db("otto_actions?select=*&order=created_at.desc&limit=400");
  const ideas = acts.filter((a: any) => (a.calls || []).some((c: any) => c.tool === "place_option_order" &&
    (c.args?.legs || []).some((l: any) => l.position_effect === "open")));
  let budget = 12;                                   // keep one call bounded
  for (const a of ideas) {
    if (a.outcome && ["win", "loss", "scratch", "unscored"].includes(a.outcome.state)) continue;
    if (budget-- <= 0) break;
    const o = await evalIdea(a);
    a.outcome = o;
    if (["win", "loss", "scratch", "unscored"].includes(o.state)) {
      await db("otto_actions?id=eq." + a.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ outcome: o }) }).catch(() => {});
    }
  }
  const trades = await db("otto_trades?select=action_id,pnl&action_id=not.is.null");
  const pnlBy: Record<string, number> = {};
  trades.forEach((t: any) => { if (t.pnl != null) pnlBy[t.action_id] = (pnlBy[t.action_id] || 0) + Number(t.pnl); });
  const scored = (l: any[]) => l.filter((a) => a.outcome && ["win", "loss", "scratch"].includes(a.outcome.state));
  const agg = (l: any[]) => {
    const s = scored(l), w = s.filter((a) => a.outcome.state === "win").length, lo = s.filter((a) => a.outcome.state === "loss").length;
    return { n: l.length, scored: s.length, wins: w, losses: lo, hit: w + lo ? w / (w + lo) : null,
      avg_r: s.length ? s.reduce((x, a) => x + Number(a.outcome.r || 0), 0) / s.length : null };
  };
  const group = (key: (a: any) => string) => {
    const g: Record<string, any[]> = {};
    ideas.forEach((a: any) => (g[key(a) || "unlabelled"] ||= []).push(a));
    return Object.entries(g).map(([k, l]) => ({ key: k, ...agg(l) })).sort((a, b) => b.n - a.n);
  };
  const taken = ideas.filter((a: any) => a.status === "done");
  const passed = ideas.filter((a: any) => ["rejected", "expired"].includes(a.status));
  return {
    ok: true,
    since: ideas.length ? ideas[ideas.length - 1].created_at : null,
    all: agg(ideas), taken: { ...agg(taken), pnl: taken.reduce((s: number, a: any) => s + (pnlBy[a.id] || 0), 0) },
    passed: agg(passed),
    by_setup: group((a) => a.plan?.setup), by_verdict: group((a) => a.banner?.verdict),
    by_source: group((a) => srcOf(a)), by_trigger: group((a) => a.plan?.trigger ? (TRIG_LABEL[a.plan.trigger] || a.plan.trigger) : "not a Watcher trigger"),
    est: (() => { const s2 = scored(ideas).filter((a: any) => a.outcome.pnl_est != null);
      return { n: s2.length, total: s2.reduce((x: number, a: any) => x + Number(a.outcome.pnl_est), 0), per: s2.length ? Math.round(s2.reduce((x: number, a: any) => x + Number(a.outcome.pnl_est), 0) / s2.length) : null }; })(),
    proof: await (async () => { const st = await proofStart(); const today = marketClock().date; return { start: st, day: Math.max(0, Math.min(14, tradingDaysBetween(st, today))), of: 14 }; })(),
    recent: ideas.slice(0, 25).map((a: any) => ({ id: a.id, title: a.title, at: a.created_at, status: a.status, source: srcOf(a), trigger: a.plan?.trigger || null,
      setup: a.plan?.setup || null, verdict: a.banner?.verdict || null, outcome: a.outcome || null, pnl: pnlBy[a.id] ?? null })),
  };
}

/* ------------------------------------------------------------ scheduled runs
   pg_cron (005_v31.sql) calls ?fn=cron_morning on weekdays at 12:45 and 13:45
   UTC and ?fn=cron_weekly on Fridays at 20:30 and 21:30 UTC — both halves of
   daylight saving. The function itself checks New York time and skips the
   one that's an hour off. Authenticated by OTTO_CRON_SECRET, not by a user. */

async function morningRead(apiKey: string) {
  const sent = await sentimentNow(true, "auto");
  let news = "";
  try { news = await whatsMoving(apiKey); } catch { /* the read still runs */ }
  if (news) {
    try {
      const last = await db("otto_sentiment?kind=eq.auto&order=id.desc&limit=1&select=id");
      if (last?.[0]) await db("otto_sentiment?id=eq." + last[0].id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ news }) });
    } catch { /* */ }
    if (SENT) SENT.body.news = { text: news, at: new Date().toISOString() };
  }
  const calls = await loadBrain();
  const cs = chunksOf(calls);
  const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
  const { tools: mcpToolDefs } = await deskTools();
  const tools = [TOOLS[0], ...mcpToolDefs];
  const lite = { verdict: sent.verdict, score: sent.score, fresh: `${sent.fresh}/${sent.total}`,
    legs: sent.legs.map((l: any) => ({ leg: l.label, pct: l.pct == null ? null : +l.pct.toFixed(2), live: l.live })),
    fired: sent.rows.filter((r: any) => r.fired).map((r: any) => `row ${r.row}: ${r.label}`),
    calendar_today: sent.calendar.map((e: any) => `${etLabel(e.date)} ${e.title} (importance ${e.importance})`) };
  const prompt = `[Automatic 8:45 morning read — no one typed this. ${sent.et} ET.]
The live sentiment banner (Josh's intermarket sheet on TradingView data) says: ${JSON.stringify(lite)}
What's moving (web research just now): ${news.slice(0, 2500) || "unavailable"}

Write today's morning read for Ifoma and Josh (Workflow 1): one line each for the 10-year, crude, USD/JPY; any binary event today; SPY/QQQ and Mag-7 tone (fetch what you need); a bias that agrees with or explains any disagreement with the banner; and the 2–3 setups worth watching from the TradingView watchlist with the trigger level for each. Levels from the calls are dated marks — say the call date. Never name the coach. No order cards. Under 250 words.`;
  const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools, cs, who: "cron", send: () => {}, allowPropose: false, maxRounds: 8 });
  if (res.said.trim()) { await logDesk("assistant", "Jarvis · 8:45 auto", res.said.trim()); await notify("morning", "☀️ Morning read is ready", res.said.trim().slice(0, 200)); }
  return { ok: true, verdict: sent.verdict, words: res.said.split(/\s+/).length };
}

function cronAllowed(req: Request) {
  const s = Deno.env.get("OTTO_CRON_SECRET") || "";
  return s.length >= 16 && req.headers.get("x-otto-cron") === s;
}
function background(p: Promise<unknown>) {
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p.catch((e) => console.error("background", e))); else p.catch((e) => console.error("background", e));
}


/* ===================================================================== v3.2
   5 Oct 2026 — Jarvis rename, manual order ticket, TradingView alert watcher.

   Webhook note: the approved plan was a TradingView webhook. TradingView won't
   let an outside app put a webhook on an alert (it needs 2-factor on the
   account and has to be set by hand on every alert, 17 of them). Same result
   without any of that: every 2 minutes in market hours Otto reads TradingView's
   alert log and posts each new fire to the Desk with Jarvis's quick read. */

async function tvSymbolFor(ticker: string): Promise<string | null> {
  const t = ticker.toUpperCase().trim();
  return cached("tvsym|" + t, 7 * 864e5, async () => {
    try {
      const j = mcpJson(await call("tv", "mcp-tv-search-symbols", { query: t }));
      const list = j?.data?.symbols || j?.symbols || [];
      const ok = ["NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "ARCA", "CBOE", "BATS"];
      const hit = list.find((x: any) => String(x.symbol || "").split(":")[1] === t && ok.includes(String(x.exchange || "").toUpperCase()))
        || list.find((x: any) => String(x.symbol || "").split(":")[1] === t && String(x.currency_logoid || "").includes("US"));
      return hit ? String(hit.symbol) : null;
    } catch { return null; }
  });
}

// The Buy/Sell form on the Desk. Same card, same Approve, same checks as Jarvis's cards.
async function orderTicket(b: any, who: string, author: string) {
  const sym = String(b.symbol || "").toUpperCase().replace(/[^A-Z.]/g, "");
  const type = b.type === "put" ? "put" : "call";
  const exp = String(b.expiry || "");
  const strike = Number(b.strike), qty = Math.floor(Number(b.qty)), price = Number(b.price);
  const side = b.side === "sell_close" ? "sell_close" : "buy_open";
  if (!sym || !/^\d{4}-\d{2}-\d{2}$/.test(exp) || !(strike > 0) || !(qty >= 1) || !(price > 0)) throw new Error("Fill in ticker, expiry, strike, quantity and limit price");
  const ins = mcpJson(await call("rh", "get_option_instruments", { chain_symbol: sym, expiration_dates: exp, strike_price: strike.toFixed(4), type }));
  const inst = (ins?.data?.instruments || [])[0];
  if (!inst?.id) throw new Error(`No ${sym} ${strike} ${type} expiring ${exp} on Robinhood. Check the expiry date and strike.`);
  const label = `${sym} ${strike % 1 ? strike : Math.round(strike)}${type === "put" ? "P" : "C"} ${exp.slice(5).replace("-", "/")}`;
  const title = `${side === "buy_open" ? "Buy" : "Sell"} ${qty} ${label} @ ${price.toFixed(2)}`;
  let plan: any = null;
  if (side === "buy_open") {
    if (b.tp1 == null || b.tp1 === "" || b.stop == null || b.stop === "" || !(Number(b.stop_option) > 0))
      throw new Error("A buy needs its exits: TP1 and the wrong-if price (on the stock) and the stop on the option.");
    const tv = await tvSymbolFor(sym);
    if (!tv) throw new Error(`Couldn't find ${sym} on TradingView for the exit alerts.`);
    plan = { tv_symbol: tv, direction: type === "put" ? "down" : "up", setup: String(b.setup || "other"), tp1: Number(b.tp1), stop: Number(b.stop),
      stop_option: Number(b.stop_option), expires: exp, manual: true };
  }
  const summary = [
    `Underlying / contract   ${label}`,
    `Side / qty / type       ${side === "buy_open" ? "Buy to open" : "Sell to close"} · ${qty} · limit $${price.toFixed(2)}`,
    side === "buy_open" && plan ? `Plan                    TP1 ${plan.tp1} · wrong if ${plan.stop} · ${plan.setup}` : "",
    side === "buy_open" && plan ? `Exits (Otto sets them)  stop on the option at $${Number(plan.stop_option).toFixed(2)} · alerts at ${plan.stop} (5-min close) and ${plan.tp1}` : "",
    b.note ? `Why                     ${String(b.note).slice(0, 300)}` : "",
    `Source                  Order ticket, entered by ${author}`,
  ].filter(Boolean).join("\n");
  await logDesk("user", author, `Order ticket: ${title}${b.note ? " — " + String(b.note).slice(0, 300) : ""}`);
  const card = await proposeAction({ title, summary, plan,
    calls: [{ service: "rh", tool: "place_option_order", args: {
      legs: [{ option_id: inst.id, side: side === "buy_open" ? "buy" : "sell", position_effect: side === "buy_open" ? "open" : "close" }],
      quantity: String(qty), price: price.toFixed(2), type: "limit", time_in_force: "gfd" } }] }, who, { manual: true });
  const flags = (card.checks || []).filter((c: any) => c.ok === false).map((c: any) => c.text);
  await logDesk("assistant", "Jarvis", `Card from your order ticket.${flags.length ? " Rule check flags: " + flags.join("; ") + "." : ""} Nothing happens until you click Approve.`, card.id);
  return card;
}

// Alert watcher (cron, every 2 minutes in market hours).
/* v3.12 (Ifoma, 6 Oct): "what's the plan with all these alerts?" → Card or quiet.
   Every fire is posted to the TradingView Alerts tab (Desk rows by "TradingView", never the Jarvis chat).
   A FRESH fire (≤20 min old) of an alert that hasn't already been checked today goes to Jarvis, who checks it
   against the Otto Rules: a real setup → ONE card + ONE ping (several cards in one run → one bundled ping);
   not a setup → his reason, quietly. Late fires, repeats and the exit engine's own alerts never ping. */
const ALERT_FRESH_MS = 20 * 60e3;
async function alertWatch(apiKey: string) {
  await tvSlowLoad();
  const j = mcpJson(await tvBudget(call("tv", "mcp-tv-get-alerts-log", { days: 1, limit: 50 }), 15000, "TradingView alert log"));   // v3.16: breaker
  const events: any[] = j?.events || j?.data?.events || [];
  if (!events.length) return { ok: true, fired: 0 };
  // TradingView's log has a fire_id per fire; fall back to the old name|time key so nothing already seen repeats.
  const keyOf = (e: any) => [e.alert_id ?? e.id ?? e.name ?? "", e.fire_time ?? e.time ?? e.timestamp ?? e.fired_at ?? e.created ?? ""].join("|");
  const keys = events.map(keyOf);
  const seen = await db("otto_alert_fires?select=key&key=in.(" + encodeURIComponent(keys.map((k) => '"' + k.replace(/"/g, "") + '"').join(",")) + ")").catch(() => []);
  const have = new Set(seen.map((r: any) => r.key));
  const firedAt = (e: any) => Date.parse(e.fired_at || e.fire_time || e.time || e.timestamp || 0) || 0;
  const fresh = events.filter((e, i) => !have.has(keys[i])).sort((x, y) => firedAt(x) - firedAt(y));
  if (!fresh.length) return { ok: true, fired: 0 };
  const markSeen = (list: any[]) => db("otto_alert_fires?on_conflict=key", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(list.map((e) => ({ key: keyOf(e), payload: e }))) });
  // First run ever: just remember the backlog, don't flood the Desk.
  const any = await db("otto_alert_fires?select=key&limit=1").catch(() => [{}]);
  if (!any.length && fresh.length > 3) { await markSeen(fresh); return { ok: true, fired: 0, primed: fresh.length }; }
  // Which alerts Jarvis already checked today (one check — and at most one ping — per alert per day).
  const day = etParts().date;
  let memo: any = (await setting("alert_day").catch(() => null)) || {};
  if (memo.date !== day) memo = { date: day, done: {} };
  const hourAgo = Date.now() - 3600e3;
  let hourCount = Object.values(memo.done).filter((v: any) => v && v.at > hourAgo).length;
  const review: any[] = [];
  for (const e of fresh.slice(0, 25)) {
    const raw = String(e.name || e.alert_name || ""), sym = String(e.symbol || e.ticker || ""), msg = String(e.message || "");
    const id = String(e.tv_alert_id ?? e.alert_id ?? raw ?? sym);
    const age = Date.now() - (firedAt(e) || Date.now());
    let status = "";
    if (/^Otto ·/.test(raw)) status = "🛡️ trade protection — the exit engine handles it";
    else if (age > ALERT_FRESH_MS) status = `🔕 quiet — fired ${Math.round(age / 60e3)} min ago, too late to act on`;
    else if (memo.done[id]) status = "🔕 quiet — this alert was already checked today";
    else if (review.length >= 3 || hourCount >= 6) status = "🔕 quiet — too many alerts at once; Jarvis didn't check this one";
    else {
      status = "👀 Jarvis is checking it against the Otto Rules";
      memo.done[id] = { s: "review", at: Date.now() }; hourCount++;
      review.push({ id, name: unname(raw), symbol: sym, message: unname(msg), fired_at: e.fired_at || e.fire_time || null });
    }
    await logDesk("system", "TradingView", `🔔 ${unname(raw || sym)}${msg && msg !== raw ? "\n" + unname(msg) : ""}\n» ${status}`.slice(0, 600));
    await markSeen([e]).catch(() => {});
  }
  if (fresh.length > 25) await markSeen(fresh.slice(25)).catch(() => {});
  // Merge what alertJarvis finished meanwhile (it writes the same setting) before judging time-outs.
  const latest: any = await setting("alert_day").catch(() => null);
  if (latest?.date === day) for (const [k, v] of Object.entries(latest.done || {}) as any) if (v?.s && v.s !== "review") memo.done[k] = v;
  // A check that was cut off (server time limit) is closed out quietly after 5 minutes.
  for (const [k, v] of Object.entries(memo.done) as any) if (v?.s === "review" && Date.now() - v.at > 5 * 60e3) {
    memo.done[k] = { ...v, s: "timeout" };
    await logDesk("assistant", "Jarvis · alert read", `For: ${v.name || k}\nNo card — the check was cut off by the server's time limit. Ask Jarvis if you want a read on it.`);
  }
  if (review.length) for (const r of review) memo.done[r.id].name = r.name;
  await putSetting("alert_day", memo, "cron").catch(() => {});
  if (review.length && !(await kick("alert_jarvis", { fires: review }))) await alertJarvis(review);
  return { ok: true, fired: fresh.length, reviewing: review.length };
}

async function alertJarvis(fires: any[]) {
  const { cs, sys, tools, ctxLine } = await deskSetup();
  const runTools = tools.filter((t: any) => t.name !== "close_position" && !/^tv__/.test(String(t.name || "")));
  const results = await Promise.all(fires.slice(0, 3).map(async (f) => {
    const prompt = `${ctxLine}
[A TradingView alert just fired — no one typed this. Ifoma and Josh are not watching; you decide.] ${JSON.stringify(f).slice(0, 600)}
Is this a real setup under the Otto Rules RIGHT NOW? Search the rules for this level (give the call date), fetch the live price, option chain and quote with Robinhood, and check: did a 15-minute candle close through the level (not just a wick), the sentiment banner, the time of day (no first 30 minutes), earnings or a binary event, buying power, and whether we already hold it.
- Real setup → call propose_action ONCE with one opening option card (plan.setup "tradingview alert", the usual plan fields incl. stop_option; pick the contract with option_shortlist — ★ if it fits buying power, else ◆).
- Not a setup yet → no card.
Work quietly. When done, write a line that is exactly READ: and after it 2–3 short plain sentences: what the level is, where price is now, and why you made the card — or why not and what would make it one.
(Use Robinhood tools for prices, chains and quotes — TradingView tools are not available in this run.)`;
    try {
      const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: runTools, cs, who: "alert", send: () => {},
        allowPropose: true, allowClose: false, maxRounds: 8 });
      const raw = res.said.trim(), cut = raw.lastIndexOf("READ:");
      return { f, read: (cut >= 0 ? raw.slice(cut + 5) : raw).trim(), cards: res.cards, err: "" };
    } catch (e) { return { f, read: "", cards: [] as string[], err: String((e as Error).message || e).slice(0, 200) }; }
  }));
  const memo: any = (await setting("alert_day").catch(() => null)) || { done: {} };
  const made: { f: any; a: any }[] = [];
  for (const r of results) {
    const acts = r.cards.length ? await db("otto_actions?select=id,title&id=in.(" + r.cards.join(",") + ")").catch(() => []) : [];
    const head = `For: ${r.f.name || r.f.symbol}\n` + (r.err ? `No card — Jarvis hit an error checking it: ${r.err}` : (r.read || (acts.length ? "Card's up." : "No setup — no card.")));
    await logDesk("assistant", "Jarvis · alert read", head, acts[0]?.id || null);
    for (const a of acts.slice(1)) await logDesk("assistant", "Jarvis · alert read", `For: ${r.f.name || r.f.symbol}\nSecond card for this alert.`, a.id);
    for (const a of acts) made.push({ f: r.f, a });
    if (memo.done?.[r.f.id]) memo.done[r.f.id] = { ...memo.done[r.f.id], s: r.err ? "error" : acts.length ? "card" : "quiet" };
  }
  await putSetting("alert_day", memo, "cron").catch(() => {});
  // One ping for everything this run made.
  if (made.length) await markPinged(made.map((m) => m.a.id));
  if (made.length === 1) {
    const { f, a } = made[0];
    await notify("card", `🃏 ${String(f.symbol).split(":").pop()} card ready — level hit`, `${f.name}. ${String(a.title || "").slice(0, 90)}. Tap to Approve or Reject (expires in 20 min).`, "./#alerts");
  } else if (made.length > 1) {
    await notify("card", `🃏 ${made.length} cards ready: ${[...new Set(made.map((m) => String(m.f.symbol).split(":").pop()))].join(", ")}`,
      "TradingView levels hit and Jarvis found setups. Tap to Approve or Reject (expire in 20 min).", "./#alerts");
  }
  return { ok: true, cards: made.length };
}


/* ===================================================================== v3.4
   5 Oct 2026 — enter with the exit already set.

   An opening option card now carries plan.stop_option (the OPTION price that
   triggers the protective stop). Approving the card approves the entry AND its
   exits. Once the buy fills, Otto itself:
     1. places a stop_market sell-to-close at stop_option. Robinhood only allows
        stop_market as a day order, so Otto re-places it every morning at 9:30;
     2. sets two TradingView alerts on the stock: wrong-if (plan.stop) on a
        5-minute close (15 before v3.21), and TP1 on touch;
     3. when one of those alerts fires, puts up a close card (cancel the stop,
        then sell to close at market). Nothing sells without an Approve;
     4. when the position goes flat (stop filled, close card, or closed by
        hand), cancels any leftover stop and deletes the trade's alerts.
   State lives in otto_actions.exit (008_v34.sql). Driven by the 2-minute
   cron (cron_alerts), right after an Approve, and when the Desk panel loads. */

const EXIT_OPEN_ORDER = new Set(["queued", "confirmed", "unconfirmed", "partially_filled", "new", "pending_cancelled"]);
const EXIT_DEAD_ORDER = new Set(["cancelled", "rejected", "failed", "voided", "expired"]);

// v3.20 (8 Oct): Robinhood option price steps. $3.38 was rejected on 7 Oct ("Stop price does not satisfy
// the min tick value") and NVDA ran with no stop. Penny-program names: $0.01 under $3, $0.05 from $3 up;
// others: $0.05 / $0.10. Stops round UP (toward the entry), so the loss at the stop never grows.
export function optTick(price: number, coarse = false) { return price >= 3 ? (coarse ? 0.10 : 0.05) : (coarse ? 0.05 : 0.01); }
export function roundStopUp(price: number, coarse = false) {
  const t = optTick(price, coarse);
  let r = Math.round(Math.ceil(price / t - 1e-9) * t * 100) / 100;
  if (r >= 3 && price < 3) r = Math.round(Math.ceil(price / optTick(3, coarse) - 1e-9) * optTick(3, coarse) * 100) / 100;
  return r;
}
function exitSpec(out: any[], plan: any) {
  const opens = out.filter((c) => c.tool === "place_option_order" && (c.args.legs || []).some((l: any) => l.position_effect === "open"));
  if (opens.length !== 1) throw new Error("Exits work on one opening option order per card. Split it into separate cards.");
  const o = opens[0], legs = o.args.legs || [];
  if (legs.length !== 1 || legs[0].side !== "buy") throw new Error("Exits work on a single-leg buy to open (a long call or put).");
  const entry = Number(o.args.price), stopOpt = Number(plan.stop_option), qty = Math.floor(Number(o.args.quantity));
  if (!(qty >= 1)) throw new Error("quantity must be a whole number of contracts");
  if (!(entry > 0)) throw new Error("Use a limit price on the entry so the stop can be checked against it.");
  if (!(stopOpt > 0 && stopOpt < entry)) throw new Error(`plan.stop_option ($${stopOpt}) must be above 0 and below the entry limit ($${entry}).`);
  const stopR = roundStopUp(stopOpt);
  if (!(stopR < entry)) throw new Error(`plan.stop_option ($${stopOpt}) rounds to $${stopR.toFixed(2)} (Robinhood's price step), which is not below the entry limit ($${entry}). Set the stop lower.`);
  const dir = plan.direction === "down" ? "down" : "up";
  const tp1 = Number(plan.tp1), wrong = Number(plan.stop);
  if (!(tp1 > 0) || !(wrong > 0)) throw new Error("plan.tp1 and plan.stop must be prices on the underlying");
  if (dir === "up" ? !(tp1 > wrong) : !(tp1 < wrong)) throw new Error(`For a ${dir === "up" ? "call (up)" : "put (down)"} TP1 must be ${dir === "up" ? "above" : "below"} the wrong-if price.`);
  return { option_id: legs[0].option_id, qty, entry_limit: entry, stop_option: stopR,
    tv_symbol: String(plan.tv_symbol), direction: dir, wrong_if: wrong, tp1, expires: plan.expires || null, wrong_tf: Number(plan.wrong_tf) === 5 ? 5 : 15 };
}

async function saveExit(id: string, ex: any) {
  await db("otto_actions?id=eq." + id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ exit: ex }) });
}
function exitLog(ex: any, text: string) {
  ex.log = [...(ex.log || []), { at: new Date().toISOString(), text }].slice(-30);
}
const rthNow = () => { const e = etParts(); return !["Sat", "Sun"].includes(e.wd) && e.min >= 570 && e.min < 960; };
const orderIdOf = (j: any) => j?.data?.order?.id || j?.data?.id || j?.order?.id || j?.id || null;

async function optOrder(acct: string, id: string) {
  const j = mcpJson(await call("rh", "get_option_orders", { account_number: acct, order_id: id }));
  return (j?.data?.orders || j?.orders || [])[0] || null;
}
async function cardBusy(id: string | null | undefined) {
  if (!id) return false;
  return db("otto_actions?id=eq." + id + "&select=status").then((r: any) => ["pending", "running"].includes(r?.[0]?.status)).catch(() => false);
}

// v3.13: a sell-to-close already working on this option (Otto's own stop from an earlier run, or one set by hand).
async function workingSell(acct: string, ex: any, since: string): Promise<any | null> {
  const j = mcpJson(await call("rh", "get_option_orders", { account_number: acct, created_at_gte: since }));
  return (j?.data?.orders || j?.orders || []).find((o: any) => EXIT_OPEN_ORDER.has(o.state) &&
    (o.legs || []).some((l: any) => l.option_id === ex.option_id && l.side === "sell" && l.position_effect === "close")) || null;
}
async function placeStop(a: any, ex: any, acct: string) {
  const since = new Date(Date.parse(a.decided_at || a.created_at || new Date().toISOString()) - 60e3).toISOString();
  try {
    const w = await workingSell(acct, ex, since);
    if (w) {
      ex.stop_order_id = w.id; ex.stop_error = null;
      exitLog(ex, `Stop already working (order ${String(w.id).slice(0, 8)}, ${w.type || "stop"} ${w.stop_price ? "@ $" + Number(w.stop_price).toFixed(2) : ""}) — kept it`);
      return true;
    }
  } catch { /* fall through and place one */ }
  try {
    const r = await call("rh", "place_option_order", { account_number: acct,
      legs: [{ option_id: ex.option_id, side: "sell", position_effect: "close" }],
      quantity: String(ex.qty), type: "stop_market", stop_price: ex.stop_option.toFixed(2),
      time_in_force: "gfd", market_hours: "regular_hours", ref_id: crypto.randomUUID() });
    ex.stop_order_id = orderIdOf(mcpJson(r)); ex.stop_error = null;
    exitLog(ex, `Stop placed: sell to close at $${ex.stop_option.toFixed(2)} (day order)`);
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    // v3.20: a price-step rejection → one retry on the coarser step (non-penny names), rounded toward the entry.
    if (/min(imum)?\s*tick|tick value|increment/i.test(msg) && !ex.stop_coarse) {
      const c = roundStopUp(ex.stop_option, true);
      if (c < ex.entry_limit) {
        ex.stop_coarse = true; exitLog(ex, `Robinhood refused $${ex.stop_option.toFixed(2)} (price step) — moving the stop to $${c.toFixed(2)}`);
        ex.stop_option = c;
        return placeStop(a, ex, acct);
      }
    }
    // "not enough contracts to close" = a sell already holds the contract. Find it and keep it; no alarm.
    if (/enough contracts|pending|already/i.test(msg)) {
      try {
        const w = await workingSell(acct, ex, since);
        if (w) { ex.stop_order_id = w.id; ex.stop_error = null; exitLog(ex, `Stop already working (order ${String(w.id).slice(0, 8)}) — kept it`); return true; }
      } catch { /* report below */ }
    }
    ex.stop_error = msg.slice(0, 300);
    exitLog(ex, "Stop order FAILED: " + ex.stop_error);
    await logDesk("system", "Otto", `⚠ ${a.title}: the protective stop at $${ex.stop_option.toFixed(2)} could not be placed (${ex.stop_error}). This trade has NO stop working. Close it or set one by hand.`, a.id);
    await notify("no_stop", `⚠ No stop on ${a.title.replace(/^Buy\s+/i, "")}`, `The protective stop at $${ex.stop_option.toFixed(2)} couldn't be placed. Open the Desk.`);
    return false;
  }
}

async function armAlerts(a: any, ex: any, only?: ("wrong" | "tp1")[]) {
  const exp = ex.expires && /^\d{4}-\d{2}-\d{2}$/.test(ex.expires) ? ex.expires + "T21:00:00Z" : new Date(Date.now() + 14 * 864e5).toISOString();
  const tk = ex.tv_symbol.split(":").pop();
  const mk = async (kind: "wrong" | "tp1") => {
    const up = ex.direction === "up";
    const value = kind === "wrong" ? ex.wrong_if : ex.tp1;
    const type = kind === "wrong" ? (up ? "cross_down" : "cross_up") : (up ? "cross_up" : "cross_down");
    const res = kind === "wrong" ? String(ex.wrong_tf || 15) : "1";
    const args = { symbol: ex.tv_symbol,
      name: `Otto · ${tk} ${kind === "wrong" ? "WRONG IF" : "TP1"} ${value} · ${String(a.id).slice(0, 8)}`,
      message: `${tk} ${kind === "wrong" ? `closed a ${ex.wrong_tf || 15}-minute bar through your wrong-if` : "reached TP1"} ${value} (Otto trade: ${a.title})`,
      conditions: [{ type, frequency: kind === "wrong" ? "on_bar_close" : "on_first_fire", resolution: res,
        cross_interval: true, series: [{ type: "barset" }, { type: "value", value }] }],
      resolution: res, expiration: exp, popup: false, mobile_push: false, email: false };
    try {
      const j = mcpJson(await call("tv", "mcp-tv-create-alert", args));
      const id = j?.alert_id ?? j?.data?.alert_id ?? j?.alert?.alert_id ?? j?.tv_alert_id ?? j?.id ?? j?.data?.id ?? null;
      if (id == null) throw new Error("TradingView created the alert but returned no id: " + JSON.stringify(j).slice(0, 160));
      exitLog(ex, `Alert set: ${kind === "wrong" ? "wrong-if" : "TP1"} ${tk} ${value}`);
      return id;
    } catch (e) {
      const m = (e as Error).message;
      exitLog(ex, `Alert FAILED (${kind}): ${m.slice(0, 200)}`);
      ex.alert_error = /max_primitive_alerts_count_exceeded/.test(m) ? "TradingView alert limit reached (20) — delete an old alert" : m.slice(0, 200);
      return null;
    }
  };
  // v3.9.4: only (re)arm what's missing, keep what's already set.
  const want = only || ["wrong", "tp1"];
  const cur = ex.alerts || {};
  ex.alerts = { wrong: want.includes("wrong") ? await mk("wrong") : (cur.wrong ?? null), tp1: want.includes("tp1") ? await mk("tp1") : (cur.tp1 ?? null) };
  if (ex.alerts.wrong != null && ex.alerts.tp1 != null) ex.alert_error = null;
}

async function cleanupExit(ex: any, acct: string) {
  if (ex.stop_order_id) {
    try {
      const o = await optOrder(acct, ex.stop_order_id);
      if (o && EXIT_OPEN_ORDER.has(o.state)) { await call("rh", "cancel_option_order", { account_number: acct, order_id: ex.stop_order_id }); exitLog(ex, "Leftover stop cancelled"); }
    } catch (e) { exitLog(ex, "Couldn't cancel the leftover stop: " + (e as Error).message.slice(0, 150)); }
  }
  const ids = [ex.alerts?.wrong, ex.alerts?.tp1].filter((x) => x != null).map(Number);
  if (ids.length) {
    try { await call("tv", "mcp-tv-delete-alert", { alert_ids: ids }); exitLog(ex, "Trade alerts removed"); }
    catch (e) { exitLog(ex, "Couldn't remove the trade alerts: " + (e as Error).message.slice(0, 150)); }
  }
}

async function heldQty(acct: string, optionId: string) {
  const j = mcpJson(await call("rh", "get_option_positions", { account_number: acct, option_ids: optionId }));
  return (j?.data?.positions || []).filter((p: any) => p.type === "long").reduce((s: number, p: any) => s + Number(p.quantity || 0), 0);
}

/* v3.13: a lease so only ONE exit run works a trade at a time. On 6 Oct the 2-minute cron, the
   Approve click and the Desk panel all ran exitTick on the same fill at once: the first placed the
   stop, the others' stop orders were rejected ("not enough contracts") and raised false NO-stop
   alarms. The lease is an atomic UPDATE … WHERE exit_lock is null or stale (012_v313.sql). */
const EXIT_LEASE_MS = 90_000;
async function exitLease(id: string): Promise<any | null> {
  const stale = new Date(Date.now() - EXIT_LEASE_MS).toISOString();
  try {
    const rows = await db(`otto_actions?id=eq.${id}&or=(exit_lock.is.null,exit_lock.lt.${stale})&select=*`,
      { method: "PATCH", body: JSON.stringify({ exit_lock: new Date().toISOString() }) });
    return rows?.[0] || null;
  } catch (e) {
    // 012_v313.sql not run yet: keep the exit engine working (unlocked, as before) rather than stop it.
    if (/exit_lock/.test(String((e as Error).message))) return (await db(`otto_actions?id=eq.${id}&select=*`))?.[0] || null;
    throw e;
  }
}
export async function exitTick(a: any) {
  const fresh = await exitLease(a.id);
  if (!fresh) return { id: a.id, skipped: "another run is working this trade" };
  try { return await exitTickLocked(fresh); }
  finally { await db("otto_actions?id=eq." + a.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ exit_lock: null }) }).catch(() => {}); }
}
async function exitTickLocked(a: any) {
  const ex: any = { ...(a.exit || {}) };
  const acct = await agenticAccount();
  const today = etParts().date;

  if (ex.state === "waiting_fill") {
    let o: any = ex.order_id ? await optOrder(acct, ex.order_id) : null;
    if (!o) {
      const j = mcpJson(await call("rh", "get_option_orders", { account_number: acct, created_at_gte: a.decided_at || a.created_at }));
      o = (j?.data?.orders || []).find((x: any) => (x.legs || []).some((l: any) => l.option_id === ex.option_id && l.position_effect === "open")) || null;
      if (o) ex.order_id = o.id;
    }
    if (!o) return { id: a.id, state: ex.state, note: "entry order not found yet" };
    if (EXIT_DEAD_ORDER.has(o.state)) {
      ex.state = "dead"; exitLog(ex, `Entry ${o.state}, nothing to protect`);
      await saveExit(a.id, ex);
      await logDesk("system", "Otto", `${a.title}: the entry was ${o.state}, so no stop or alerts were set.`, a.id);
      return { id: a.id, state: ex.state };
    }
    if (o.state !== "filled") { await saveExit(a.id, ex); return { id: a.id, state: ex.state, order: o.state }; }
    const execs = (o.legs || [])[0]?.executions || [];
    const qf = execs.reduce((s: number, x: any) => s + Number(x.quantity), 0);
    ex.fill_price = qf ? execs.reduce((s: number, x: any) => s + Number(x.price) * Number(x.quantity), 0) / qf : Number(o.price);
    ex.qty = Math.floor(Number(o.processed_quantity || ex.qty));
    ex.state = "armed"; ex.armed_at = new Date().toISOString(); ex.fired = [];
    exitLog(ex, `Entry filled: ${ex.qty} @ $${ex.fill_price.toFixed(2)}`);
    // v3.9.2: the stop goes on (and is saved) BEFORE the TradingView alerts, so a slow or
    // failing TradingView can never delay the stop or lose its order id.
    let stopOk = false;
    if (rthNow()) { ex.stop_try_day = today; ex.stop_tries = 1; stopOk = await placeStop(a, ex, acct); }
    await saveExit(a.id, ex);
    await armAlerts(a, ex);
    await saveExit(a.id, ex);
    const loss = (ex.fill_price - ex.stop_option) * 100 * ex.qty;
    await logDesk("system", "Otto", `✓ ${a.title}: filled at $${ex.fill_price.toFixed(2)}. ` +
      (stopOk ? `Stop on at $${ex.stop_option.toFixed(2)} (about −$${loss.toFixed(0)} if it fills there). ` : rthNow() ? "" : "Stop goes on at 9:30 ET. ") +
      `Alerts: wrong-if ${ex.wrong_if} ${ex.alerts?.wrong != null ? "✓" : "✗"}, TP1 ${ex.tp1} ${ex.alerts?.tp1 != null ? "✓" : "✗"}.` +
      (ex.alert_error ? ` (${ex.alert_error})` : ""), a.id);
    await notify("fill", `✓ Filled: ${a.title.replace(/^Buy\s+/i, "")} @ $${ex.fill_price.toFixed(2)}`,
      (stopOk ? `Stop on at $${ex.stop_option.toFixed(2)} (about −$${loss.toFixed(0)}). ` : `Stop goes on at 9:30 ET. `) +
      (ex.alerts?.wrong != null && ex.alerts?.tp1 != null ? `Alerts set at ${ex.wrong_if} and ${ex.tp1}.`
        : `⚠ TradingView alerts NOT set (${ex.alerts?.wrong != null ? "" : "wrong-if " + ex.wrong_if + " "}${ex.alerts?.tp1 != null ? "" : "TP1 " + ex.tp1}) — Otto keeps retrying.${ex.alert_error ? " " + ex.alert_error : ""}`));
    return { id: a.id, state: ex.state };
  }
  if (ex.state !== "armed") return { id: a.id, state: ex.state };

  const held = await heldQty(acct, ex.option_id);
  if (held <= 0) {
    let how = "closed";
    if (ex.stop_order_id) { try { const s = await optOrder(acct, ex.stop_order_id); if (s?.state === "filled") how = "stopped out"; } catch { /* */ } }
    await cleanupExit(ex, acct);
    ex.state = "closed"; ex.closed_at = new Date().toISOString(); ex.closed_how = how;
    exitLog(ex, `Position flat (${how})`);
    await saveExit(a.id, ex);
    await logDesk("system", "Otto", `${a.title}: position is flat (${how}). Leftover stop and trade alerts cleaned up. Write the one-line reason in the Journal.`, a.id);
    if (how === "stopped out") await notify("stopped", `🛑 Stopped out: ${a.title.replace(/^Buy\s+/i, "")}`, `The $${Number(ex.stop_option).toFixed(2)} stop filled. Write the one-line reason in the Journal.`);
    return { id: a.id, state: ex.state };
  }
  if (held !== ex.qty) { exitLog(ex, `Holding ${held} now (was ${ex.qty})`); ex.qty = held; }

  // Keep the stop on during market hours (Robinhood's stop_market is a day order). At most 3 tries a day.
  if (rthNow()) {
    let need = !ex.stop_order_id;
    if (ex.stop_order_id) { try { const s = await optOrder(acct, ex.stop_order_id); need = !s || EXIT_DEAD_ORDER.has(s.state); } catch { need = false; } }
    if (ex.stop_try_day !== today) { ex.stop_try_day = today; ex.stop_tries = 0; }
    if (need && (ex.stop_tries || 0) < 3 && !(await cardBusy(ex.close_card))) {
      ex.stop_tries = (ex.stop_tries || 0) + 1; await placeStop(a, ex, acct);
      await saveExit(a.id, ex);                     // v3.9.2: remember the new stop's id even if TradingView fails next
    }
  }

  // v3.9.4: alerts that failed to set (TradingView down / 20-alert limit) are retried every 10 min, up to 6 times a day.
  const missing = (["wrong", "tp1"] as const).filter((k) => ex.alerts?.[k] == null);
  if (missing.length && (!ex.alert_retry_at || Date.now() - Date.parse(ex.alert_retry_at) > 10 * 60e3)) {
    if (ex.alert_try_day !== today) { ex.alert_try_day = today; ex.alert_tries = 0; }
    if ((ex.alert_tries || 0) < 6) {
      ex.alert_tries = (ex.alert_tries || 0) + 1; ex.alert_retry_at = new Date().toISOString();
      try { await armAlerts(a, ex, [...missing]); } catch { /* logged inside */ }
      const still = (["wrong", "tp1"] as const).filter((k) => ex.alerts?.[k] == null);
      if (!still.length) exitLog(ex, "Alerts set on retry");
      else if (!ex.alert_warned_day || ex.alert_warned_day !== today) {
        ex.alert_warned_day = today;
        await notify("trade_alert", `⚠ Alerts not set: ${a.title.replace(/^Buy\s+/i, "")}`,
          `Otto couldn't set the TradingView ${still.join(" + ")} alert${still.length > 1 ? "s" : ""}${ex.alert_error ? " — " + ex.alert_error : ""}. The stop is unaffected. Otto keeps retrying.`);
      }
      await saveExit(a.id, ex);
    }
  }

  // Did one of this trade's own alerts fire?
  const ids = [ex.alerts?.wrong, ex.alerts?.tp1].filter((x) => x != null).map(String);
  if (ids.length) {
    // v3.9.2: a TradingView outage here must not skip the save at the end of this tick.
    let j: any = null;
    try { j = mcpJson(await withTimeout(call("tv", "mcp-tv-get-alerts-log", { days: 1, limit: 100 }), 15000, "TradingView alert log")); ex.tv_check_error = null; }   // v3.16: own timeout, never skipped by the breaker (open trades)
    catch (e) {
      const m = String((e as Error).message || e).slice(0, 160);
      if (!ex.tv_check_error) exitLog(ex, "TradingView alert check failed (will keep retrying; the stop is unaffected): " + m);
      ex.tv_check_error = { at: new Date().toISOString(), m };
    }
    const evs = (j?.events || j?.data?.events || []).filter((e: any) => ids.includes(String(e.tv_alert_id ?? e.alert_id)) &&
      Date.parse(e.fired_at || e.fire_time || 0) > Date.parse(ex.armed_at));
    const key = (e: any) => String(e.fire_id ?? e.fired_at);
    const fresh = evs.filter((e: any) => !(ex.fired || []).includes(key(e)));
    if (fresh.length) {
      ex.fired = [...(ex.fired || []), ...fresh.map(key)].slice(-60);
      const recent = ex.close_at && Date.now() - Date.parse(ex.close_at) < 10 * 60_000;
      const LIMx = await getLimits().catch(() => LIMIT_DEFAULTS);
      if (LIMx.auto_close && rthNow() && !recent) {
        // v3.5: auto-close is on, so Jarvis decides and closes himself (no card).
        const wrong = fresh.some((e: any) => String(e.tv_alert_id ?? e.alert_id) === String(ex.alerts.wrong));
        const why = wrong ? `wrong-if ${ex.wrong_if} hit (${ex.wrong_tf || 15}-minute close)` : `TP1 ${ex.tp1} reached`;
        ex.close_at = new Date().toISOString();
        exitLog(ex, `${why} → Jarvis deciding (auto-close on)`);
        await notify("trade_alert", `🔔 ${a.title.replace(/^Buy\s+/i, "")}: ${wrong ? "wrong-if hit" : "TP1 reached"}`, `${why}. Jarvis is deciding now (auto-close is on).`);
        await saveExit(a.id, ex);
        // v3.21: the server confirms the card's rule on Robinhood bars and closes; otherwise it falls through to a close card.
        let closed = false;
        try {
          const chk = await exitRuleCheck({ ...a, exit: ex });
          if (chk.met) { await closeNow({ option_id: ex.option_id, reason: chk.why, rule_why: chk.why }, "rules", true); closed = true; }
          else exitLog(ex, `TradingView said ${why}, Robinhood bars don't confirm it yet (${chk.detail}) → close card instead`);
        } catch (e) { await logDesk("system", "Otto", `⚠ ${a.title}: ${why}, but the auto-close failed (${(e as Error).message.slice(0, 200)}). The stop is still working. Close by hand if needed.`, a.id); }
        if (closed) return { id: a.id, state: ex.state, held, auto: true };
        ex.close_at = null;
      }
      if (!(await cardBusy(ex.close_card)) && !recent) {
        const wrong = fresh.some((e: any) => String(e.tv_alert_id ?? e.alert_id) === String(ex.alerts.wrong));
        const why = wrong ? `wrong-if ${ex.wrong_if} hit (${ex.wrong_tf || 15}-minute close)` : `TP1 ${ex.tp1} reached`;
        let stopOpen = false;
        if (ex.stop_order_id) { try { const s = await optOrder(acct, ex.stop_order_id); stopOpen = !!s && EXIT_OPEN_ORDER.has(s.state); } catch { /* */ } }
        const calls: any[] = [];
        if (stopOpen) calls.push({ service: "rh", tool: "cancel_option_order", args: { order_id: ex.stop_order_id } });
        calls.push({ service: "rh", tool: "place_option_order", args: { legs: [{ option_id: ex.option_id, side: "sell", position_effect: "close" }],
          quantity: String(ex.qty), type: "market", time_in_force: "gfd" } });
        const card = await proposeAction({ title: `Close ${String(a.title).replace(/^Buy\s+/i, "")} (${wrong ? "wrong if hit" : "TP1"})`,
          summary: [`Why          ${why}`,
            `Plan         ${wrong ? "out: the idea is proven wrong" : "TP1: bank it (1 contract = no runner)"}`,
            `Order        ${stopOpen ? "cancel the $" + ex.stop_option.toFixed(2) + " stop, then " : ""}sell to close ${ex.qty} at market`,
            `If you skip  ${stopOpen ? "the stop stays on underneath" : "⚠ no stop is working on this trade"}`].join("\n"),
          calls }, "otto");
        ex.close_card = card.id; ex.close_at = new Date().toISOString();
        exitLog(ex, `${why} → close card ${String(card.id).slice(0, 8)}`);
        await notify("trade_alert", `🔔 ${a.title.replace(/^Buy\s+/i, "")}: ${wrong ? "wrong-if hit" : "TP1 reached"}`, `${why}. A close card is waiting for Approve.`);
        await logDesk("assistant", "Jarvis", `${a.title}: ${why}. Your plan says ${wrong ? "out" : "take it"}. The close card is up${stopOpen ? "; the stop stays on until someone approves it" : ""}.`, card.id);
      }
    }
  }
  await saveExit(a.id, ex);
  return { id: a.id, state: ex.state, held };
}

let EXIT_TICK_AT = 0;
async function exitsTick(force = false) {
  if (!force && Date.now() - EXIT_TICK_AT < 45_000) return { ok: true, skipped: "recent" };
  EXIT_TICK_AT = Date.now();
  const rows = await db("otto_actions?select=*&exit->>state=in.(waiting_fill,armed)&order=created_at.asc&limit=10");
  const out: any[] = [];
  for (const a of rows || []) {
    try { out.push(await exitTick(a)); } catch (e) { out.push({ id: a.id, error: (e as Error).message.slice(0, 200) }); }
  }
  return { ok: true, n: (rows || []).length, out };
}

/* ===================================================================== v3.7
   5 Oct 2026 — Jason's calls. Ifoma's decisions (approved mockup
   otto-v3.6-jason-calls-mockup.html):
   - Jason calls trades in Discord #platinum-chat (ALL CAPS, short bursts,
     usually pinged @Platinum Members). No bot. Josh screenshots a post and
     drops it on the Desk; Jarvis reads it and drafts the card right away;
     Ifoma/Josh Approve.
   - EVERY Jason post goes in, tagged or untagged, sorted call / level / note.
     Only calls get an order card. Late calls ("should have called it") get
     none. Jarvis and Josh decide direction.
   - A weekday 5 PM sweep (scheduled task driving Chrome on the Engineer PC,
     Discord search from:jmoney915) posts today's texts to ?fn=jason_sweep;
     anything not pasted is logged, the day is scored, a Desk note goes up.
   - Calls are dated ideas: they expire at the close, are scored, and NEVER
     go into the teaching brain (search_jason / alwaysOn don't read them).
   Table otto_jason (009_v37.sql). */

const J_KINDS = new Set(["call", "level", "note", "result"]);   // v3.16: + result

const JASON_TOOL = {
  name: "record_posts",
  description: "Record every message written by Jason (Discord name Jason, user jmoney915) that is visible. Skip everyone else (Josh, Lige [FLOW], bots).",
  input_schema: {
    type: "object",
    properties: {
      posts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            time: { type: "string", description: "Time shown on the post, e.g. '10:02 AM'. Continuation lines inherit the time Discord shows when hovered; if none is visible use the block's time. Empty string if no time is visible at all." },
            kind: { type: "string", enum: ["call", "level", "note", "result"], description: "call = a trade idea with a direction or a ticker called out to trade (e.g. 'SPCX LONG', 'APP', 'ZETA ENTRY 33.15', 'PUTS ON TSLA', 'SHORTED. SEE THE BREAK'). level = a price level/zone he is watching or reporting (e.g. 'AMD $630 HELD RESISTANCE', 'ORDER BLOCK SHIFTED UP' on a named ticker). result = how an earlier call worked out — a profit, a loss, a win/loss remark or a stat about it (e.g. '$1000 FOR 2 PUTS ON MU', 'NICE SHORT ON MU', 'STOPPED OUT ON TSLA', '90% OF THE TIME SHORTING MU AT THE OPEN'). note = commentary, lessons, answers, reactions." },
            ticker: { type: "string", description: "Stock/ETF ticker in caps, or empty string. Use the chart in the screenshot to find it if the text doesn't say." },
            direction: { type: "string", enum: ["long", "short", ""], description: "long = calls/up/long/buy; short = puts/down/short/sell. Empty if not stated or not a call." },
            late: { type: "boolean", description: "true when Jason says he called it late / should have called it / it already moved ('SHOULD HAVE CALLED IT OUT', 'IN CASE YOU MISSED IT' after the break still counts as NOT late unless he says he missed calling it)." },
            entry: { type: "number", description: "Entry price only if Jason states one (stock price). 0 if none." },
            level: { type: "number", description: "Key price level he states or that is clearly marked on his chart with a number. 0 if none." },
            option: { type: "string", description: "Strike/expiry/type only if Jason states it, e.g. '10/17 42C'. Empty if not stated." },
            words: { type: "string", description: "Jason's exact words, joined with ' / ' when one call spans several lines (e.g. 'SPCX LONG / BREAK HAPPENED IN CASE YOU MISSED IT'). Keep his caps. Drop the @Platinum Members ping text." },
            pinged: { type: "boolean", description: "true if the post pinged @Platinum Members." },
            chart: { type: "string", description: "If a chart image belongs to this post: one short line on what it shows (ticker, trend, levels drawn with numbers). Empty otherwise." },
            summary: { type: "string", description: "One plain line, e.g. 'SPCX: long on the breakout' or 'AMD: $630 resistance held'." },
          },
          required: ["time", "kind", "ticker", "direction", "late", "entry", "level", "option", "words", "pinged", "chart", "summary"],
        },
      },
    },
    required: ["posts"],
  },
};

const JASON_READ_SYS = `You read Jason Murray's posts from the iBelieve Investments Club Discord (#platinum-chat). Jason writes in ALL CAPS, in short bursts across several lines, and usually pings @Platinum Members when he calls something. A call is often just a ticker and a direction ("SPCX LONG"); levels are often only drawn on his chart screenshot. Record ONLY Jason's messages (display name Jason, username jmoney915). Group lines that belong to the same thought into one post (e.g. "SPCX LONG" + "BREAK HAPPENED IN CASE YOU MISSED IT" + the ping = one call). Never invent numbers: entry/level/option only when Jason wrote them or the chart labels them with a number. A message that is only a ping (@Platinum Members, @Josh) is not a post; fold it into the post it belongs to. If nothing from Jason is visible, return an empty list.`;

async function jasonExtract(apiKey: string, src: { image?: { media_type: string; data: string } | null; text?: string; day: string }) {
  const content: any[] = [];
  if (src.image) content.push({ type: "image", source: { type: "base64",
    media_type: /^image\/(jpeg|png|webp|gif)$/.test(src.image.media_type) ? src.image.media_type : "image/jpeg", data: src.image.data } });
  content.push({ type: "text", text: (src.image ? "Screenshot from Discord, " : "Discord messages, ") + `dated ${src.day} (New York time).` +
    (src.text ? "\n\n" + src.text.slice(0, 20000) : "") + "\n\nRecord Jason's posts." });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: JASON_READ_SYS, tools: [JASON_TOOL],
      tool_choice: { type: "tool", name: "record_posts" }, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error("reading the signal failed: claude HTTP " + r.status + " " + (await r.text()).slice(0, 160));
  const j = await r.json();
  const tu = (j.content || []).find((b: any) => b.type === "tool_use");
  const posts = Array.isArray(tu?.input?.posts) ? tu.input.posts : [];
  // A bare ping ("@💎・Platinum Members", "@Josh") is not a post.
  return posts.filter((p: any) => p && J_KINDS.has(p.kind) && String(p.words || "").trim() &&
    !/^\s*(@\S+(\s+Members)?[\s/]*)+$/i.test(String(p.words)));
}

// "10:02 AM" on a New York date → ISO. Tries EDT then EST and keeps the one
// whose New York clock reads back the same minute.
function nyIso(day: string, time: string): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?\s*$/i.exec(time || "");
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  let h = Number(m[1]) % 12; if ((m[3] || "").toUpperCase() === "PM") h += 12;
  if (!m[3] && Number(m[1]) === 12) h = 12;
  const want = h * 60 + Number(m[2]);
  for (const off of [4, 5]) {
    const d = new Date(`${day}T${String(h).padStart(2, "0")}:${m[2]}:00Z`);
    d.setUTCHours(d.getUTCHours() + off);
    const p = etParts(d);
    if (p.date === day && p.min === want) return d.toISOString();
  }
  return null;
}

const jNorm = (s: string) => String(s || "").toUpperCase().replace(/@\S+/g, "").replace(/[^A-Z0-9$.]+/g, " ").trim().slice(0, 90);

async function jasonSave(posts: any[], day: string, source: string, who: string) {
  const rows = posts.map((p: any) => {
    const at = nyIso(day, p.time);
    const hhmm = at ? fmtMin(etParts(new Date(at)).min) : "";
    const ticker = String(p.ticker || "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8) || null;
    return {
      day, posted_at: at, posted_label: hhmm || null, kind: p.kind,
      ticker, direction: ["long", "short"].includes(p.direction) ? p.direction : null,
      late: !!p.late, entry: Number(p.entry) > 0 ? Number(p.entry) : null, level: Number(p.level) > 0 ? Number(p.level) : null,
      option: String(p.option || "").slice(0, 40) || null, pinged: !!p.pinged,
      words: String(p.words).slice(0, 600), chart: String(p.chart || "").slice(0, 300) || null,
      summary: String(p.summary || "").slice(0, 200) || null, source, added_by: who,
      fp: `${day}|${hhmm}|${jNorm(p.words)}`,
    };
  });
  if (!rows.length) return { inserted: [] as any[], all: [] as any[] };
  // ignore-duplicates: a post already pasted (or swept) keeps its first row.
  const inserted = await db("otto_jason?on_conflict=fp&select=*", { method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows) });
  const fps = new Set(rows.map((r) => r.fp));
  const all = (await db(`otto_jason?select=*&day=eq.${day}&limit=200`).catch(() => inserted)).filter((r: any) => fps.has(r.fp));
  try { await watchFromSignals(inserted || []); } catch { /* the Watcher never breaks Signals */ }   // v3.14
  try { await linkResults(inserted || []); } catch { /* v3.16: results scoreboard link never breaks Signals */ }
  return { inserted, all };
}

const jLine = (r: any) => `#${r.id} ${r.posted_label || "?"} ${r.kind.toUpperCase()}${r.late ? " (LATE)" : ""}${r.ticker ? " " + r.ticker : ""}${r.direction ? " " + r.direction : ""}` +
  `${r.entry ? " entry $" + r.entry : ""}${r.level ? " level $" + r.level : ""}${r.option ? " option " + r.option : ""}: "${r.words}"${r.chart ? " [chart: " + r.chart + "]" : ""}`;

async function jasonTodayRows(day = etParts().date) {
  return await db(`otto_jason?select=*&day=eq.${day}&order=posted_at.asc.nullslast,id.asc&limit=80`).catch(() => []);
}

// One line for the Desk context, so Jarvis knows today's calls and levels in every turn.
async function jasonContext(): Promise<string> {
  const rows = await jasonTodayRows();
  if (!rows.length) return "";
  return ` Jason's posts today in Discord (dated ideas from his chat — they expire at today's close and are NOT method; use his levels as levels): ` +
    rows.slice(-25).map(jLine).join("; ") + ".";
}

// Called inside the Desk stream when Josh pastes a Jason post.
async function jasonIntake(apiKey: string, img: any, text: string, who: string, author: string) {
  const day = etParts().date;
  const posts = await jasonExtract(apiKey, { image: img, text, day });
  const { all } = await jasonSave(posts, day, "paste", author || who);
  return all;
}

function jasonPrompt(rows: any[], extra: string) {
  if (!rows.length) return `[Jason's post pasted — but no message from Jason could be read in it.] Say so in one line and ask for a clearer screenshot. ${extra}`;
  return `[📣 Jason's post, pasted from Discord #platinum-chat and read from the screenshot. These are saved in Otto's Jason feed.]
${rows.map(jLine).join("\n")}
${extra ? "Note from the desk: " + extra + "\n" : ""}
Handle each one:
- CALL (not late, not already carded): check it against the banner, Jason's rules (first 30 minutes, delta .30–.40, volume > open interest, expiry, binary events, earnings), our limits, and whether we already hold it. Give a 2–3 line take. Then propose_action ONE opening option order with plan + exits (the v3.4 rules), plan.setup = "jason call", plan.jason_id = the #id above. Use Jason's entry/level when he gave one. Everything he did NOT give (strike, expiry, entry, stop, TP1, wrong-if) is yours: say "Jarvis, not Jason" for those in your take. Size inside our limits.
- CALL marked LATE: no card. Say the move happened before the post and chasing breaks Jason's entry rules; offer to watch for a pullback to a level.
- LEVEL: one line on what it means for us; no card.
- NOTE: one line at most; no card.
Josh and Ifoma decide direction. If the banner or a rule argues against a call, say so plainly but still draft the card so they can decide.`;
}

/* ----- scoring: every call, carded or not, on Yahoo 5-minute bars, post → close */
async function yBars5(ticker: string): Promise<{ t: number; o: number; h: number; l: number; c: number }[]> {
  return cached(`yb5|${ticker}`, 5 * 60e3, async () => {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + "?range=5d&interval=5m", { headers: UA });
    if (!r.ok) throw new Error("yahoo HTTP " + r.status);
    const j = await r.json(); const x = j?.chart?.result?.[0];
    if (!x?.timestamp) throw new Error("no bars for " + ticker);
    const q = x.indicators?.quote?.[0] || {};
    return x.timestamp.map((t: number, i: number) => ({ t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] }))
      .filter((b: any) => [b.o, b.h, b.l, b.c].every((v) => typeof v === "number"));
  });
}

async function jasonScoreRow(r: any, actsById: Record<string, any>) {
  const a = r.action_id ? actsById[r.action_id] : null;
  const card = a ? { status: a.status, outcome: a.outcome?.state || null, r: a.outcome?.r ?? null } : null;
  if (r.kind !== "call" || !r.ticker || !r.posted_at) return { state: "unscored", why: !r.ticker ? "no ticker" : r.kind !== "call" ? "not a call" : "no time", card };
  const t0 = Date.parse(r.posted_at) / 1000;
  const bars = await yBars5(r.ticker);
  const close = Date.parse(nyIso(r.day, "4:00 PM") || "") / 1000;
  const day = bars.filter((b) => b.t + 300 > t0 && b.t < close);
  if (!day.length) return { state: "unscored", why: "no bars after the post", card };
  const ref = day[0].c;                     // close of the 5-min bar the post landed in
  const dir = r.direction === "short" ? -1 : 1;
  const after = day.slice(1);
  const hi = Math.max(ref, ...after.map((b) => b.h)), lo = Math.min(ref, ...after.map((b) => b.l));
  const last = (after[after.length - 1] || day[0]).c;
  const pct = (v: number) => +(((v - ref) / ref) * 100 * dir).toFixed(2);
  const close_pct = pct(last);
  return { state: close_pct > 0.05 ? "worked" : close_pct < -0.05 ? "failed" : "flat", ref: +ref.toFixed(2), close: +last.toFixed(2),
    close_pct, best_pct: dir > 0 ? pct(hi) : pct(lo), worst_pct: dir > 0 ? pct(lo) : pct(hi), card, assumed_long: !r.direction };
}

// Score finished days (or today after 4:05 PM). Bounded per call.
async function jasonScoreDue(budget = 15) {
  const now = etParts();
  const doneToday = !["Sat", "Sun"].includes(now.wd) && now.min >= 965;
  const rows = await db(`otto_jason?select=*&kind=eq.call&score=is.null&order=day.desc&limit=60`).catch(() => []);
  const due = rows.filter((r: any) => r.day < now.date || (r.day === now.date && doneToday) || ["Sat", "Sun"].includes(now.wd));
  if (!due.length) return 0;
  const ids = [...new Set(due.map((r: any) => r.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=id,status,outcome&id=in.(" + ids.join(",") + ")").catch(() => []) : [];
  const by: Record<string, any> = Object.fromEntries(acts.map((a: any) => [a.id, a]));
  let n = 0;
  for (const r of due.slice(0, budget)) {
    let s: any;
    try { s = await jasonScoreRow(r, by); } catch (e) { s = { state: "unscored", why: String((e as Error).message).slice(0, 120) }; }
    await db("otto_jason?id=eq." + r.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ score: s }) }).catch(() => {});
    n++;
  }
  return n;
}

async function jasonToday() {
  const day = etParts().date;
  const rows = await jasonTodayRows(day);
  const ids = [...new Set(rows.map((r: any) => r.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=id,status,title&id=in.(" + ids.join(",") + ")").catch(() => []) : [];
  const by: Record<string, any> = Object.fromEntries(acts.map((a: any) => [a.id, a]));
  return { ok: true, day, rows: rows.map((r: any) => ({ id: r.id, at: r.posted_at, label: r.posted_label, kind: r.kind, ticker: r.ticker,
    direction: r.direction, late: r.late, entry: r.entry, level: r.level, option: r.option, words: r.words, summary: r.summary,
    source: r.source, card: r.action_id && by[r.action_id] ? { id: r.action_id, status: by[r.action_id].status, title: by[r.action_id].title } : null,
    score: r.score || null })) };
}

// The banner at the time of a post, from otto_sentiment history.
async function bannerAt(iso: string): Promise<string | null> {
  const r = await db(`otto_sentiment?select=verdict,at&at=lte.${encodeURIComponent(iso)}&order=at.desc&limit=1`).catch(() => []);
  return r?.[0] && Date.parse(iso) - Date.parse(r[0].at) < 3 * 3600e3 ? r[0].verdict : null;
}

async function jasonScorecard() {
  await jasonScoreDue(10).catch(() => 0);
  const rows = await db("otto_jason?select=*&kind=eq.call&order=day.desc,posted_at.desc&limit=400").catch(() => []);
  const ids = [...new Set(rows.map((r: any) => r.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=id,status,outcome&id=in.(" + ids.join(",") + ")").catch(() => []) : [];
  const by: Record<string, any> = Object.fromEntries(acts.map((a: any) => [a.id, a]));
  const pnl: Record<string, number> = {};
  if (ids.length) (await db("otto_trades?select=action_id,pnl&action_id=in.(" + ids.join(",") + ")").catch(() => []))
    .forEach((t: any) => { if (t.pnl != null) pnl[t.action_id] = (pnl[t.action_id] || 0) + Number(t.pnl); });
  // banner tone at post time (cached per row in score.banner once known)
  for (const r of rows.slice(0, 60)) {
    if (r.score && r.score.banner === undefined && r.posted_at) {
      const v = await bannerAt(r.posted_at);
      r.score.banner = v;
      await db("otto_jason?id=eq." + r.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ score: r.score }) }).catch(() => {});
    }
  }
  const tone = (v: string | null) => !v ? null : /long/i.test(v) ? "long" : /short/i.test(v) ? "short" : "none";
  const scored = (l: any[]) => l.filter((r) => r.score && ["worked", "failed", "flat"].includes(r.score.state));
  const agg = (l: any[]) => { const s = scored(l), w = s.filter((r) => r.score.state === "worked").length;
    return { n: l.length, scored: s.length, worked: w, rate: s.length ? w / s.length : null,
      avg_close: s.length ? s.reduce((x, r) => x + r.score.close_pct, 0) / s.length : null,
      avg_best: s.length ? s.reduce((x, r) => x + r.score.best_pct, 0) / s.length : null }; };
  const minOf = (r: any) => r.posted_at ? etParts(new Date(r.posted_at)).min : -1;
  const fresh = rows.filter((r: any) => !r.late);
  const taken = rows.filter((r: any) => r.action_id && by[r.action_id]?.status === "done");
  const passed = rows.filter((r: any) => !(r.action_id && by[r.action_id]?.status === "done"));
  const cardWL = taken.map((r: any) => by[r.action_id]?.outcome?.state).filter((s: any) => s === "win" || s === "loss");
  const splits = [
    ["Posted 9:30–10:00 (first 30 min)", fresh.filter((r: any) => minOf(r) >= 570 && minOf(r) < 600)],
    ["Posted 10:00–11:00", fresh.filter((r: any) => minOf(r) >= 600 && minOf(r) < 660)],
    ["Posted 11:00–2:00", fresh.filter((r: any) => minOf(r) >= 660 && minOf(r) < 840)],
    ["Posted after 2:00", fresh.filter((r: any) => minOf(r) >= 840)],
    ["With the banner", fresh.filter((r: any) => { const t = tone(r.score?.banner); return t && t !== "none" && t === r.direction; })],
    ["Against the banner", fresh.filter((r: any) => { const t = tone(r.score?.banner); return t && t !== "none" && r.direction && t !== r.direction; })],
    ["Banner said No edge / No read", fresh.filter((r: any) => tone(r.score?.banner) === "none")],
    ["Late calls (\"should have called it\")", rows.filter((r: any) => r.late)],
  ].map(([k, l]: any) => ({ key: k, ...agg(l) }));
  return { ok: true, since: rows.length ? rows[rows.length - 1].day : null,
    all: agg(rows), fresh: agg(fresh), taken: { ...agg(taken), pnl: taken.reduce((s: number, r: any) => s + (pnl[r.action_id] || 0), 0),
      card_wins: cardWL.filter((s: any) => s === "win").length, card_losses: cardWL.filter((s: any) => s === "loss").length },
    passed: agg(passed), splits,
    recent: rows.slice(0, 20).map((r: any) => ({ day: r.day, label: r.posted_label, ticker: r.ticker, direction: r.direction, late: r.late,
      words: r.words, taken: !!(r.action_id && by[r.action_id]?.status === "done"), score: r.score || null })) };
}

// 5 PM sweep: the scheduled task reads today's Jason posts in Discord and sends the texts here.
async function jasonSweep(body: any, who: string) {
  const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : etParts().date;
  const posts = Array.isArray(body.posts) ? body.posts.slice(0, 200) : [];
  const before = await db(`otto_jason?select=id&day=eq.${day}`).catch(() => []);
  let found: any[] = [];
  if (posts.length) {
    const text = posts.map((p: any) => `[${String(p.time || "").slice(0, 12)}] Jason: ${String(p.text || "").slice(0, 600)}`).join("\n");
    found = await jasonExtract(apiKey, { text, day });
  }
  const { inserted } = await jasonSave(found, day, "sweep", "5 PM sweep");
  await jasonScoreDue(20).catch(() => 0);
  const rows = await jasonTodayRows(day);
  const calls = rows.filter((r: any) => r.kind === "call");
  const sc = (r: any) => !r.score ? "not scored yet" : r.score.state === "unscored" ? "not scored (" + (r.score.why || "?") + ")"
    : `${r.score.state}: ${r.score.close_pct >= 0 ? "+" : ""}${r.score.close_pct}% by the close, best ${r.score.best_pct >= 0 ? "+" : ""}${r.score.best_pct}%`;
  const note = `Discord sweep (${etLabel(new Date().toISOString())} ET, Jason only): ${rows.length} post${rows.length === 1 ? "" : "s"} today` +
    `${posts.length ? "" : " — the sweep found no Jason messages"}, ${before.length} already pasted, ${inserted.length} caught now.\n\n` +
    (calls.length ? "Today's calls, scored from the post to the close (5-min bars, in the called direction):\n" +
      calls.map((r: any) => `· ${r.posted_label || "?"} ${r.ticker || "?"} ${r.direction || ""}${r.late ? " (late)" : ""} — ${sc(r)}`).join("\n") : "No calls today.") +
    (inserted.length ? "\n\nCaught by the sweep (not pasted during the day):\n" + inserted.map((r: any) => `· ${r.posted_label || "?"} ${r.kind}: ${r.words}`).join("\n") : "");
  await logDesk("assistant", "Jarvis · Discord sweep", note);
  return { ok: true, day, read: posts.length, posts: rows.length, caught: inserted.length, by: who };
}

/* ===================================================================== v3.9
   6 Oct 2026 — Otto Signals: never miss a call from the mentor again.

   Ifoma's decisions (6 Oct):
   - A Chrome extension on Ifoma's PC keeps the mentor's Discord channel open in
     a minimized window and sends every NEW message from the mentor's account
     (matched on his Discord user id, not his display name) here, with any chart
     images. Nobody else's messages come over.
   - Jarvis builds a card for every post that names a ticker and implies a trade,
     even when the mentor gives no direction — Jarvis decides long or short and
     says why. Ifoma or Josh decide whether to Approve.
   - Both phones ping only when there's a call (card). No ping for chatter.
     No quiet hours.
   - Everything is kept permanently in otto_jason (the log). His levels are
     dated and expire at that day's close. Never part of the teaching brain.
   - If the watcher goes quiet in market hours, both phones get pinged.
   The mentor's name / Discord ids live in otto_settings "signals", so the
   feature isn't tied to Jason (Otto may be sold or shared later). */

const SIG_DEFAULT: any = { mentor: "Jason", author_id: "474721184903200819", author_name: "Jason",
  guild: "1135603258702958693", channel: "1139244584757637192", channel_name: "#💎┃platinum-chat" };
const SIG_FRESH_MS = 20 * 60e3;          // older than this when caught = log only, no card, no ping
const SIG_OFFLINE_MS = 5 * 60e3;

async function sigCfg(): Promise<any> {
  return { ...SIG_DEFAULT, ...((await setting("signals").catch(() => null)) || {}) };
}

async function signalsCfgSet(b: any, who: string) {
  const cur = await sigCfg();
  const txt = (v: any, n: number) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
  const id = (v: any) => String(v ?? "").replace(/\D/g, "").slice(0, 24);
  const next: any = { ...cur };
  if (b.mentor !== undefined && txt(b.mentor, 30)) next.mentor = txt(b.mentor, 30);
  if (b.author_name !== undefined) next.author_name = txt(b.author_name, 40);
  if (b.channel_name !== undefined) next.channel_name = txt(b.channel_name, 60);
  for (const k of ["author_id", "guild", "channel"]) if (b[k] !== undefined && id(b[k])) next[k] = id(b[k]);
  if (b.new_key || !next.key) next.key = b64u(crypto.getRandomValues(new Uint8Array(24)));
  next.updated_by = who; next.updated_at = new Date().toISOString();
  await putSetting("signals", next, who);
  return next;
}

const SIG_TOOL = { ...JASON_TOOL, description: "Record the mentor's NEW posts (every message given was written by the mentor)." };
const sigReadSys = (mentor: string) => `You read ${mentor}'s posts from his trading Discord. Every message you are given was written by ${mentor} (already filtered by his Discord account). He writes in short bursts, often ALL CAPS, across several lines, and usually pings his members when he calls something. A call is often just a ticker and a direction ("SPCX LONG"); levels are often only drawn on his chart screenshot. Group lines that belong to the same thought into one post (e.g. "SPCX LONG" + "BREAK HAPPENED IN CASE YOU MISSED IT" = one call). Record ONLY the messages under NEW; messages under EARLIER are context you may use to understand the new ones (which ticker he means, what the chart is), never record them again. Never invent numbers: entry/level/option only when he wrote them or the chart labels them with a number. A message that is only a ping (@Members, @someone) is not a post. Use the post's time exactly as given in [brackets].`;

async function sigExtract(apiKey: string, mentor: string, text: string, imgs: { mime: string; data: string }[], day: string) {
  if (TEST?.extract) return TEST.extract(text);
  const content: any[] = imgs.slice(0, 3).map((i) => ({ type: "image", source: { type: "base64",
    media_type: /^image\/(jpeg|png|webp|gif)$/.test(i.mime) ? i.mime : "image/jpeg", data: i.data } }));
  content.push({ type: "text", text: `Discord messages from ${mentor}, ${day} (New York time).${imgs.length ? " The image(s) above are charts attached to the NEW messages." : ""}\n\n${text.slice(0, 20000)}\n\nRecord ${mentor}'s NEW posts.` });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(75_000),         // v3.9.4: never hang the read
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: sigReadSys(mentor), tools: [SIG_TOOL],
      tool_choice: { type: "tool", name: "record_posts" }, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error("reading the post failed: claude HTTP " + r.status + " " + (await r.text()).slice(0, 160));
  const j = await r.json();
  const tu = (j.content || []).find((b: any) => b.type === "tool_use");
  const posts = Array.isArray(tu?.input?.posts) ? tu.input.posts : [];
  return posts.filter((p: any) => p && J_KINDS.has(p.kind) && String(p.words || "").trim() &&
    !/^\s*(@\S+(\s+Members)?[\s/]*)+$/i.test(String(p.words)));
}

const nyTime = (iso: string) => fmtMin(etParts(new Date(iso)).min);

// The extension calls this: heartbeats, and new messages from the mentor's account.
async function signalIn(req: Request) {
  const cfg = await sigCfg();
  const key = req.headers.get("x-otto-signal") || "";
  if (!cfg.key || key.length < 16 || key !== cfg.key) throw new Error("bad watcher key — copy a fresh pairing code from Otto → Settings → Otto Signals");
  const body = await req.json().catch(() => ({}));
  const pub = { mentor: cfg.mentor, author_id: cfg.author_id, author_name: cfg.author_name, guild: cfg.guild, channel: cfg.channel, channel_name: cfg.channel_name };

  if (body.kind === "beat") {
    const prev = (await setting("signal_beat").catch(() => null)) || {};
    const state = String(body.state || "ok").slice(0, 30);
    const now = new Date().toISOString();
    const beat = { at: now, state, detail: String(body.detail || "").slice(0, 200), ver: String(body.ver || "").slice(0, 20),
      seen: Number(body.seen) || 0, bad_since: state === "ok" ? null : (prev.bad_since || now),
      queue: Number(body.queue) || 0, queue_age: Number(body.queue_age) || 0, send_error: String(body.send_error || "").slice(0, 160),
      unknown_authors: Number(body.unknown_authors) || 0, auto_scrolls: Number(body.auto_scrolls) || 0,   // v3.17 / extension 1.3
      offline_sent: !!prev.offline_sent, last_msg_at: prev.last_msg_at || null };
    if (prev.offline_sent && state === "ok" && !(Number(body.queue_age) > SIG_OFFLINE_MS / 1000)) {
      beat.offline_sent = false;
      await notify("watcher", "✅ Otto Signals watcher is back", `Watching the signals again. Anything posted while it was down is picked up when the window catches up.`, "./#signals");
    }
    await putSetting("signal_beat", beat, "watcher");
    return { ok: true, cfg: pub };
  }

  if (body.kind !== "msgs") throw new Error("unknown kind");
  const list = (Array.isArray(body.msgs) ? body.msgs : []).slice(0, 30)
    .filter((m: any) => /^\d{5,24}$/.test(String(m.id || "")) && String(m.author_id || "") === cfg.author_id);
  const accepted = list.map((m: any) => String(m.id));
  if (!list.length) return { ok: true, new: 0, accepted, cfg: pub };
  const rows = list.map((m: any) => {
    const at = Date.parse(m.at) ? new Date(m.at).toISOString() : new Date().toISOString();
    const imgs = (Array.isArray(m.images) ? m.images : []).filter((i: any) => typeof i?.data === "string" && i.data.length > 100 && i.data.length < 7_000_000).slice(0, 4);
    return { msg_id: String(m.id), day: etParts(new Date(at)).date, posted_at: at, author: String(m.author || cfg.author_name).slice(0, 40),
      text: String(m.text || "").slice(0, 4000), imgs: imgs.length, channel: String(m.channel || cfg.channel).slice(0, 24), _imgs: imgs };
  });
  // v3.17 (extension 1.3): an edited post, or one whose chart loaded late, comes back with edited:true.
  // If we have it and something changed, update it and read the new version; if we never got it, it's new.
  const editIds = new Set(list.filter((m: any) => m.edited).map((m: any) => String(m.id)));
  let edited: any[] = [];
  if (editIds.size) {
    const have = await db("otto_signal_msgs?select=msg_id,text,imgs&msg_id=in.(" + [...editIds].join(",") + ")").catch(() => []);
    for (const h of have || []) {
      const r = rows.find((x: any) => x.msg_id === h.msg_id);
      const newText = r.text !== String(h.text || ""), newImgs = r._imgs.length > Number(h.imgs || 0);
      if (newText || newImgs) {
        await db("otto_signal_msgs?msg_id=eq." + h.msg_id, { method: "PATCH", headers: { prefer: "return=minimal" },
          body: JSON.stringify({ text: r.text, imgs: Math.max(r._imgs.length, Number(h.imgs || 0)) }) }).catch(() => {});
        edited.push({ msg_id: r.msg_id, posted_at: r.posted_at, text: (newText ? "[edited] " : "[chart added] ") + r.text, imgs: r._imgs.length, _imgs: newImgs ? r._imgs : [] });
      }
    }
    const haveIds = new Set((have || []).map((h: any) => h.msg_id));
    for (let i = rows.length - 1; i >= 0; i--) if (haveIds.has(rows[i].msg_id)) rows.splice(i, 1);   // the rest are new to us
  }
  const insNew = rows.length ? await db("otto_signal_msgs?on_conflict=msg_id&select=msg_id,posted_at,text,imgs", { method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(rows.map(({ _imgs, ...r }: any) => r)) }) : [];
  const ins = [...(insNew || []), ...edited.map(({ _imgs, ...r }: any) => r)];
  if (edited.length) rows.push(...edited);
  if (!ins?.length) return { ok: true, new: 0, accepted, cfg: pub };
  const fresh = new Set(ins.map((r: any) => r.msg_id));
  const imgRows = rows.filter((r: any) => fresh.has(r.msg_id)).flatMap((r: any) => r._imgs.map((i: any) => ({ msg_id: r.msg_id, mime: String(i.mime || "image/jpeg").slice(0, 30), data: i.data })));
  if (imgRows.length) await db("otto_signal_imgs", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(imgRows) }).catch(() => {});
  const batch = await db("otto_signal_batches", { method: "POST", body: JSON.stringify({ day: etParts().date, msg_ids: [...fresh], status: "reading" }) });
  const bid = batch?.[0]?.id;
  await db("otto_signal_msgs?msg_id=in.(" + [...fresh].join(",") + ")", { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ batch_id: bid }) }).catch(() => {});
  const prev = (await setting("signal_beat").catch(() => null)) || {};
  await putSetting("signal_beat", { ...prev, last_msg_at: new Date().toISOString() }, "watcher").catch(() => {});
  background(signalProcess(bid, ins, imgRows.map((i: any) => ({ mime: i.mime, data: i.data })), cfg));
  return { ok: true, new: ins.length, batch: bid, accepted, cfg: pub };
}

async function sigBatch(id: number, patch: any) {
  if (!id) return;
  if (patch && typeof patch.read === "string") patch = { ...patch, read: unname(patch.read) };
  await db("otto_signal_batches?id=eq." + id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(patch) }).catch(() => {});
}

function signalPrompt(cfg: any, rows: any[], carded: any[]) {
  return `[⚡ OTTO SIGNAL — ${cfg.mentor} just posted in Discord ${cfg.channel_name}. The watcher caught it live; nobody typed this. Ifoma and Josh are NOT watching the chat — your card and your read are how they hear about it, so be fast and complete.]
${rows.map(jLine).join("\n")}
${carded.length ? "Already carded today (do NOT make a second card for these unless he gives a new direction or a new entry): " + carded.map((r: any) => `${r.ticker} ${r.direction || ""} at ${r.posted_label || "?"}`).join("; ") + "\n" : ""}
Do this:
1. Every post that names a ticker and implies a trade — a CALL, or a LEVEL that held / broke / rejected — gets ONE opening option card via propose_action, even when ${cfg.mentor} gave no direction. Decide long (calls) or short (puts) yourself from his words, his chart, the banner and the price right now (fetch it). plan.setup = "otto signal", plan.jason_id = the #id above. Fill in everything he did NOT give — the contract (delta .30–.40, volume > open interest, a sensible expiry), limit, quantity inside our limits, TP1, wrong-if and stop_option — as precisely as you can. In the card summary say which parts are ${cfg.mentor}'s and which are yours.
2. A LATE post (he says he missed calling it / it already moved): still make the card, start the title with "LATE", and say plainly in the summary that chasing breaks his entry rules.
3. If the banner, one of his rules or our limits argue against it, say so in the card summary — but still make the card. Ifoma and Josh decide.
3b. ALTERNATIVE (Ifoma, 6 Oct): if your best contract costs more than the Agentic account's buying power right now, ALSO make ONE second card — the best contract that DOES fit the buying power (further out-of-the-money, or a different expiry), title starting "ALT —", and say in its summary why it's second-best (lower delta, less liquid, etc.). Never more than these two cards for one post.
4. A WATCH LIST or a conditional level ("AMD ABOVE 646", "SUPPORT $379 TSLA", "WATCH LIST THIS MORNING") is not a call yet: no card. Put the trigger levels in your read. The card comes when he says it triggered / broke / held, or calls it.
5. Commentary, chatter, or a chart with no tradeable call: no card.
Work quietly — don't narrate your lookups. When you're done, write the read for the Otto Signals feed, starting with a line that is exactly READ: — everything after that line is what Ifoma and Josh see. For each post, 1–3 short plain lines: what he said; for a card, your direction and WHY (and the ALT if there is one); and what would prove it wrong. No headers, no tables.`;
}

export async function signalProcess(bid: number, ins: any[], imgs: { mime: string; data: string }[], cfg: any) {
  const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
  try {
    ins.sort((a: any, b: any) => Date.parse(a.posted_at) - Date.parse(b.posted_at));
    const first = Date.parse(ins[0].posted_at), last = Date.parse(ins[ins.length - 1].posted_at);
    const day = etParts(new Date(last)).date;
    const fresh = Date.now() - last < SIG_FRESH_MS;
    const earlier = await db(`otto_signal_msgs?select=posted_at,text,imgs&posted_at=gte.${new Date(first - 45 * 60e3).toISOString()}&posted_at=lt.${new Date(first).toISOString()}&order=posted_at.asc&limit=12`).catch(() => []);
    const line = (r: any) => `[${nyTime(r.posted_at)}] ${r.text || "(no text)"}${r.imgs ? " [chart image attached]" : ""}`;
    const text = (earlier.length ? "EARLIER (already recorded — context only):\n" + earlier.map(line).join("\n") + "\n\n" : "") + "NEW:\n" + ins.map(line).join("\n");
    const posts = await sigExtract(apiKey, cfg.mentor, text, imgs, day);
    const { inserted, all } = await jasonSave(posts, day, "watcher", "Otto Signals");
    const ids = all.map((r: any) => r.id);
    // v3.9.2: judge EACH post — only posts that are new to the log AND posted in the last 20 min
    // can ping or get a card. Old posts in a catch-up batch (reload / PC wake) are logged only.
    const newIds = new Set((inserted || []).map((r: any) => r.id));
    const live = all.filter((r: any) => newIds.has(r.id) &&
      (r.posted_at ? Date.now() - Date.parse(r.posted_at) < SIG_FRESH_MS : fresh));
    const tradeable = live.filter((r: any) => r.ticker && (r.kind === "call" || r.kind === "level"));
    const freshImg = ins.some((m: any) => m.imgs && Date.now() - Date.parse(m.posted_at) < SIG_FRESH_MS);
    if (!live.length && !freshImg) { await sigBatch(bid, { rows: ids, status: all.length ? "caught_up" : "nothing", read: null }); return; }
    if (!tradeable.length && !freshImg) {
      await sigBatch(bid, { rows: ids, status: "chatter" });
      return;
    }
    // v3.11: is a card for the same ticker already being built (another burst a moment ago)? Then this burst is a
    // follow-up ("BREAK HAPPENED…"): no second card, no second ping. Ask about it in the signal's chat if needed.
    const building = await db(`otto_signal_batches?select=id,rows&status=eq.jarvis&id=neq.${bid}&created_at=gte.${new Date(Date.now() - 5 * 60e3).toISOString()}`).catch(() => []);
    const bRows = building.flatMap((x: any) => x.rows || []);
    const bTick = bRows.length ? new Set((await db("otto_jason?select=ticker&id=in.(" + bRows.join(",") + ")").catch(() => [])).map((r: any) => r.ticker).filter(Boolean)) : new Set();
    if (tradeable.length && tradeable.every((r: any) => bTick.has(r.ticker))) {
      await sigBatch(bid, { rows: ids, status: "followup", read: `Follow-up to the ${[...new Set(tradeable.map((r: any) => r.ticker))].join(", ")} call a moment ago — Jarvis's card for it covers this. Ask below if you want a different card.` });
      return;
    }
    await sigBatch(bid, { rows: ids, status: "jarvis" });
    // v3.9.1: ping FIRST for an outright call, so a call is never missed even if the card build dies.
    for (const r of tradeable.filter((r: any) => r.kind === "call")) {
      await notify("signal", `⚡ ${SIG_LABEL}: ${r.ticker}${r.direction ? " " + r.direction.toUpperCase() : ""}${r.late ? " (late)" : ""}`,
        `"${String(r.words).slice(0, 100)}" — Jarvis is building the card now.`, "./#signals");
    }
    // Jarvis gets his own invocation (own wall-clock budget): reading the post must not eat his time.
    if (!(await kickJarvis(bid))) await signalJarvis(bid);
  } catch (e) {
    const m = String((e as Error).message || e).slice(0, 300);
    await sigBatch(bid, { status: "error", error: m });
    await notify("signal", `⚡ ${SIG_LABEL} posted — Otto couldn't read it`, `${String(ins.map((r: any) => r.text).join(" / ")).slice(0, 120)} · ${m.slice(0, 80)}`, "./#signals");
  }
}

// v3.12: start a long job as its own run of this function (own wall-clock budget).
async function kick(fn: string, body: any): Promise<boolean> {
  const base = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), sec = Deno.env.get("OTTO_CRON_SECRET") || "";
  if (!base || !anon || sec.length < 16) return false;
  try {
    const r = await fetch(`${base}/functions/v1/otto-proxy?fn=${fn}`, { method: "POST",
      headers: { apikey: anon, authorization: "Bearer " + anon, "x-otto-cron": sec, "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    return r.status === 202;
  } catch { return false; }
}
// v3.9.1: start the card build as a separate run of this function.
async function kickJarvis(bid: number): Promise<boolean> {
  const base = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), sec = Deno.env.get("OTTO_CRON_SECRET") || "";
  if (!base || !anon || sec.length < 16) return false;
  try {
    const r = await fetch(`${base}/functions/v1/otto-proxy?fn=signal_jarvis&batch=${bid}`, { method: "POST",
      headers: { apikey: anon, authorization: "Bearer " + anon, "x-otto-cron": sec, "content-type": "application/json" }, body: "{}" });
    return r.status === 202;
  } catch { return false; }
}

export async function signalJarvis(bid: number) {
  const cfg = await sigCfg();
  const b = (await db("otto_signal_batches?select=*&id=eq." + bid))?.[0];
  if (!b || b.status !== "jarvis") return;
  let all: any[] = [];
  const t0 = Date.now();
  try {
    all = (b.rows || []).length ? await db("otto_jason?select=*&id=in.(" + b.rows.join(",") + ")&order=id.asc") : [];
    // v3.9.2: only posts saved by THIS batch and posted within 20 min of it go to Jarvis.
    const bAt = Date.parse(b.created_at);
    all = all.filter((r: any) => Date.parse(r.created_at) >= bAt - 5000 && (!r.posted_at || bAt - Date.parse(r.posted_at) < SIG_FRESH_MS));
    const ids = all.map((r: any) => r.id);
    const tradeable = all.filter((r: any) => r.ticker && (r.kind === "call" || r.kind === "level"));
    const day = all[0]?.day || etParts().date;
    const today = await jasonTodayRows(day);
    const tick = new Set(tradeable.map((r: any) => r.ticker));
    const carded = today.filter((r: any) => r.action_id && tick.has(r.ticker) && !ids.includes(r.id) &&
      r.posted_at && Date.now() - Date.parse(r.posted_at) < 90 * 60e3);
    // v3.16: the server fetches price, buying power and the near-the-money contracts first (MU, 6 Oct: Jarvis spent
    // every step paging the chain from $5 and never made the card).
    const [setup, pre] = await Promise.all([deskSetup(), signalPrefetch(tradeable.filter((r: any) => !carded.some((c: any) => c.ticker === r.ticker))).catch(() => "")]);
    const { cs, sys, tools, ctxLine } = setup;
    const preBlock = pre ? `\nPRE-FETCHED BY THE SERVER (live, use these — the option_id values are exact; don't page the chain again unless nothing here works):\n${pre}\n` +
      `Build the card from ★ (best by the rules). If ★ is over buying power, ◆ is your ALT (or your only card if there's no ★). Limit price = the ask or a cent under. Make the card in your FIRST or SECOND step — speed is the edge on a signal.\n` : "";
    const prompt = ctxLine + "\n" + signalPrompt(cfg, all, carded) + preBlock;
    const mustCard = tradeable.some((r: any) => r.kind === "call" && !carded.some((c: any) => c.ticker === r.ticker));
    let res: any = { said: "", cards: [] as string[], did: [], failed: [], finalText: "" };
    let err = "";
    try {
      // v3.9.4: no TradingView tools in a card build — TradingView has been slow/rate-limited and it ate Jarvis's
      // time. Prices, chains and quotes come from Robinhood; the banner (Yahoo) is in the context line.
      res = await runDesk({ msgs: [{ role: "user", content: prompt + "\n(Use Robinhood tools for prices, option chains and quotes — TradingView tools are not available in this run.)" }], sys,
        tools: tools.filter((t: any) => t.name !== "close_position" && !/^tv__/.test(String(t.name || ""))),
        cs, who: "signals", send: () => {}, allowPropose: true, allowClose: false, maxRounds: 8, mustCard, deadline: t0 + RUN_BUDGET_MS });
    } catch (e) { err = String((e as Error).message || e).slice(0, 300); }
    const acts = res.cards.length ? await db("otto_actions?select=id,title,plan&id=in.(" + res.cards.join(",") + ")").catch(() => []) : [];
    const open = tradeable.filter((r: any) => !r.action_id);
    for (const a of acts) {
      const row = all.find((r: any) => r.id === Number(a.plan?.jason_id)) || (open.length === 1 ? open[0] : null);
      if (row) { row.action_id = a.id; await db("otto_jason?id=eq." + row.id, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ action_id: a.id }) }).catch(() => {}); }
    }
    // v3.9.3: keep only the final read (after the last "READ:" line). v3.16: never show the working notes — if there
    // is no READ: line, the server writes a plain one.
    const rawRead = res.said.trim();
    const cut = rawRead.lastIndexOf("READ:");
    // Calls that should have a card and don't (not counting tickers already carded earlier today).
    const cardTicks = new Set([...all.filter((r: any) => r.action_id).map((r: any) => r.ticker),
      ...acts.flatMap((a: any) => tradeable.filter((r: any) => new RegExp("\\b" + r.ticker + "\\b").test(String(a.title || ""))).map((r: any) => r.ticker))]);
    const missing = tradeable.filter((r: any) => r.kind === "call" && !r.action_id && !cardTicks.has(r.ticker) && !carded.some((c: any) => c.ticker === r.ticker));
    const why = err ? "Jarvis hit an error: " + err.slice(0, 120)
      : res.timedOut ? "Jarvis ran out of time"
      : res.outOfRounds && !res.cards.length ? "Jarvis ran out of steps before the card"
      : (res.failed || []).includes("propose_action") ? "the card was rejected (bad contract or order details)"
      : "Jarvis decided against a card — see the read";
    let read = cut >= 0 ? rawRead.slice(cut + 5).trim() : readFallback(all, res.cards, missing.length ? why : "none needed");
    if (missing.length && cut >= 0) read += `\n\n⚠ No card for ${missing.map((r: any) => r.ticker).join(", ")}: ${why}.`;   // the feed tag says "no card" (status stays "done")
    const timing = { posted: all[0]?.posted_at || null, caught: b.created_at, card_ms: Date.now() - t0, cards: res.cards.length, total_ms: all[0]?.posted_at ? Date.now() - Date.parse(all[0].posted_at) : null };
    await sigBatch(bid, { status: err ? "error" : "done", read: read || null, cards: res.cards, error: err || (missing.length ? why : null), timing });
    if (acts.length) await markPinged(acts.map((a: any) => a.id));
    for (const a of acts) {
      const row = all.find((r: any) => r.action_id === a.id);
      await notify("signal", `🃏 Card ready: ${row?.ticker || ""} ${row?.direction ? row.direction.toUpperCase() : ""}`.trim(),
        `${String(a.title || "").slice(0, 100)} — from ${SIG_LABEL}: "${String(row?.words || "").slice(0, 70)}". Tap to Approve or Reject (expires in 20 min).`, "./#signals");
    }
    // v3.16: a call with no card is never silent again (6 Oct MU: status "done", nobody told).
    for (const r of missing) {
      await notify("signal", `⚠️ ${SIG_LABEL}: ${r.ticker}${r.direction ? " " + r.direction.toUpperCase() : ""} — NO card`, `"${String(r.words).slice(0, 80)}" — ${why}. Open Otto Signals and ask Jarvis for the card.`, "./#signals");
    }
    if (missing.length) await logDesk("system", "Otto", `⚠ ${SIG_LABEL} ${missing.map((r: any) => r.ticker).join(", ")}: no card — ${why}. Ask in the signal's chat for one.`);
  } catch (e) {
    const m = String((e as Error).message || e).slice(0, 300);
    await sigBatch(bid, { status: "error", error: m });
    if (all.some((r: any) => r.kind === "call")) await notify("signal", `⚠️ ${SIG_LABEL} called something — no card`, `${m.slice(0, 120)}. Open Otto Signals.`, "./#signals");
  }
}

// v3.9.1: a card build that stalls (Supabase cut it off) is marked failed and pinged.
async function signalStale() {
  const cut = new Date(Date.now() - 4 * 60e3).toISOString();
  const stuck = await db(`otto_signal_batches?select=id,rows,status,msg_ids,created_at&status=in.(reading,jarvis)&created_at=lt.${cut}&limit=10`).catch(() => []);
  const cfg = await sigCfg();
  for (const b of stuck) {
    await sigBatch(b.id, { status: "error", error: "Timed out — the server cut the run off before Jarvis finished." });
    // v3.9.4: stalled while still READING the post (nothing saved yet) → ping with his raw words so nothing is missed.
    if (b.status === "reading" && !(b.rows || []).length && Date.now() - Date.parse(b.created_at) < 60 * 60e3) {
      const msgs = (b.msg_ids || []).length ? await db("otto_signal_msgs?select=text,posted_at&msg_id=in.(" + b.msg_ids.join(",") + ")").catch(() => []) : [];
      const words = msgs.map((m: any) => m.text).filter(Boolean).join(" / ").slice(0, 160);
      await notify("signal", `⚡ ${SIG_LABEL} posted — Otto couldn't read it`, `${words || "(a chart, no text)"} — open Discord or Otto Signals.`, "./#signals");
      continue;
    }
    const rows = (b.rows || []).length ? await db("otto_jason?select=ticker,kind,words,action_id&id=in.(" + b.rows.join(",") + ")").catch(() => []) : [];
    const calls = rows.filter((r: any) => r.kind === "call" && !r.action_id);
    if (calls.length) await notify("signal", `⚠️ No card for ${calls.map((r: any) => r.ticker).filter(Boolean).join(", ") || "a call"}`,
      `Jarvis timed out building it. Open Otto Signals and ask Jarvis for the card.`, "./#signals");
  }
}

/* ---- v3.10 (6 Oct 2026): a conversation under each Otto Signal (Ifoma: "chat in Otto Signals,
   only to talk about the signal he dropped / the card Jarvis made"). Kept out of the main Desk
   chat. "Clear chats" hides every signal conversation (the signals, reads and cards stay). */
async function signalChat(b: any, who: string) {
  const bid = Number(b.batch_id), text = String(b.text || "").trim().slice(0, 2000), author = String(b.author || "Ifoma").slice(0, 30);
  if (!bid || !text) throw new Error("say what you want to ask");
  const batch = (await db(`otto_signal_batches?select=*&id=eq.${bid}`))?.[0];
  if (!batch) throw new Error("that signal wasn't found");
  const cfg = await sigCfg();
  const [msgs, rows, cards, hist] = await Promise.all([
    (batch.msg_ids || []).length ? db("otto_signal_msgs?select=posted_at,text&msg_id=in.(" + batch.msg_ids.join(",") + ")&order=posted_at.asc").catch(() => []) : [],
    (batch.rows || []).length ? db("otto_jason?select=*&id=in.(" + batch.rows.join(",") + ")").catch(() => []) : [],
    (batch.cards || []).length ? db("otto_actions?select=id,title,summary,status&id=in.(" + batch.cards.join(",") + ")").catch(() => []) : [],
    db(`otto_signal_chat?select=role,author,content&batch_id=eq.${bid}&cleared=eq.false&order=id.asc&limit=30`).catch(() => []),
  ]);
  await db("otto_signal_chat", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ batch_id: bid, role: "user", author, content: text }) });
  const { cs, sys, tools, ctxLine } = await deskSetup();
  const ctx = `[A conversation about ONE Otto Signal — stay on this signal only.
${cfg.mentor}'s message(s): ${msgs.map((m: any) => `[${nyTime(m.posted_at)}] ${m.text || "(chart)"}`).join(" / ") || "(none saved)"}
Posts read from it: ${rows.map(jLine).join("; ") || "(none)"}
Your read at the time: ${String(batch.read || "(none)").slice(0, 2500)}
Cards made for it: ${cards.map((c: any) => `"${c.title}" (${c.status}) — ${String(c.summary || "").slice(0, 400)}`).join(" | ") || "(none)"}
Answer questions about this signal and its card(s). If they ask for a change (strike, expiry, size, cheaper, puts instead of calls), make a NEW card with propose_action (plan.setup "otto signal", plan.jason_id = the post #id) — never say a card exists unless propose_action returned it. Use Robinhood for prices and chains (no TradingView here). Don't narrate your lookups: when done, write a line that is exactly ANSWER: and then your reply, short and plain.]`;
  const convo = hist.map((h: any) => `${h.role === "assistant" ? "Jarvis" : (h.author || "Ifoma")}: ${h.content}`).join("\n");
  const res = await runDesk({ msgs: [{ role: "user", content: `${ctxLine}\n${ctx}\n${convo ? "\nConversation so far:\n" + convo + "\n" : ""}\n${author}: ${text}` }], sys,
    tools: tools.filter((t: any) => t.name !== "close_position" && !/^tv__/.test(String(t.name || ""))),
    cs, who, send: () => {}, allowPropose: true, allowClose: false, maxRounds: 8 });
  const raw = res.said.trim(), cut = raw.lastIndexOf("ANSWER:");
  const answer = (cut >= 0 ? raw.slice(cut + 7) : raw).trim() || (res.cards.length ? "Card's up." : "(no answer)");
  await db("otto_signal_chat", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ batch_id: bid, role: "assistant", author: "Jarvis", content: unname(answer).slice(0, 8000), cards: res.cards }) });
  if (res.cards.length) await sigBatch(bid, { cards: [...(batch.cards || []), ...res.cards] });
  return { ok: true, answer, cards: res.cards };
}
async function signalChatClear(who: string) {
  await db("otto_signal_chat?cleared=eq.false", { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ cleared: true, cleared_by: who }) });
  return { ok: true };
}

// The Otto Signals tab: newest bursts first, each with the mentor's messages, the posts read from them, Jarvis's read and the cards.
async function signalsFeed(days = 2) {
  const cfg = await sigCfg();
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 14) * 86400e3).toISOString();
  const batches = await db(`otto_signal_batches?select=*&created_at=gte.${since}&order=id.desc&limit=80`).catch(() => []);
  const msgIds = batches.flatMap((b: any) => b.msg_ids || []);
  const rowIds = batches.flatMap((b: any) => b.rows || []);
  const [msgs, imgs, rows] = await Promise.all([
    msgIds.length ? db("otto_signal_msgs?select=msg_id,posted_at,text,imgs&msg_id=in.(" + msgIds.join(",") + ")").catch(() => []) : [],
    msgIds.length ? db("otto_signal_imgs?select=id,msg_id&msg_id=in.(" + msgIds.join(",") + ")").catch(() => []) : [],
    rowIds.length ? db("otto_jason?select=id,kind,ticker,direction,late,summary,words,action_id,score&id=in.(" + rowIds.join(",") + ")").catch(() => []) : [],
  ]);
  const chats = batches.length ? await db("otto_signal_chat?select=id,batch_id,role,author,content,cards,created_at&cleared=eq.false&batch_id=in.(" + batches.map((b: any) => b.id).join(",") + ")&order=id.asc").catch(() => []) : [];
  const actIds = [...new Set([...rows.map((r: any) => r.action_id), ...batches.flatMap((b: any) => b.cards || []), ...chats.flatMap((c: any) => c.cards || [])].filter(Boolean))];
  const acts = actIds.length ? await db("otto_actions?select=id,status,title&id=in.(" + actIds.join(",") + ")").catch(() => []) : [];
  const A: Record<string, any> = Object.fromEntries(acts.map((a: any) => [a.id, a]));
  const M: Record<string, any> = Object.fromEntries(msgs.map((m: any) => [m.msg_id, m]));
  const R: Record<string, any> = Object.fromEntries(rows.map((r: any) => [r.id, r]));
  const I: Record<string, number[]> = {};
  imgs.forEach((i: any) => (I[i.msg_id] = I[i.msg_id] || []).push(i.id));
  return { ok: true, mentor: SIG_LABEL, channel_name: cfg.channel_name, beat: await setting("signal_beat").catch(() => null),
    batches: batches.map((b: any) => ({ id: b.id, at: b.created_at, status: b.status, read: b.read, error: b.error,
      msgs: (b.msg_ids || []).map((id: string) => M[id]).filter(Boolean).sort((x: any, y: any) => Date.parse(x.posted_at) - Date.parse(y.posted_at))
        .map((m: any) => ({ id: m.msg_id, at: m.posted_at, text: m.text, imgs: I[m.msg_id] || [] })),
      posts: (b.rows || []).map((id: number) => R[id]).filter(Boolean).map((r: any) => ({ id: r.id, kind: r.kind, ticker: r.ticker,
        direction: r.direction, late: r.late, summary: r.summary || r.words, score: r.score || null,
        card: r.action_id && A[r.action_id] ? { id: r.action_id, status: A[r.action_id].status, title: A[r.action_id].title } : null })),
      cards: (b.cards || []).map((id: string) => A[id]).filter(Boolean).map((a: any) => ({ id: a.id, status: a.status, title: a.title })),
      chat: chats.filter((c: any) => c.batch_id === b.id).map((c: any) => ({ role: c.role, author: c.author, content: c.content, at: c.created_at,
        cards: (c.cards || []).map((id: string) => A[id]).filter(Boolean).map((a: any) => ({ id: a.id, status: a.status, title: a.title })) })) })) };
}

async function signalImg(id: number) {
  if (!id) throw new Error("no image id");
  const r = await db("otto_signal_imgs?select=mime,data&id=eq." + id);
  if (!r?.[0]) throw new Error("image not found");
  return { ok: true, mime: r[0].mime, data: r[0].data };
}

// On the 2-minute market-hours cron: ping both phones if the watcher has gone quiet.
async function watcherCheck() {
  const cfg = await sigCfg();
  if (!cfg.key) return;                                   // never paired: nothing to watch
  await signalStale().catch(() => {});
  const b = await setting("signal_beat").catch(() => null);
  if (!b?.at || b.offline_sent) return;
  const age = Date.now() - Date.parse(b.at);
  const badFor = b.bad_since ? Date.now() - Date.parse(b.bad_since) : 0;
  let why = "";
  if (b.queue_age > SIG_OFFLINE_MS / 1000) why = `${b.queue} signal post(s) are stuck in the watcher (can't send to Otto${b.send_error ? ": " + b.send_error : ""}).`;
  else if (age > SIG_OFFLINE_MS) why = `No check-in for ${Math.round(age / 60e3)} minutes — the PC may be asleep, Chrome closed, or the internet down.`;
  else if (badFor > SIG_OFFLINE_MS) why = ({ logged_out: "Discord is signed out in the watcher window.", wrong_channel: `The watcher window isn't on ${cfg.channel_name}.`,
    no_tab: "The Discord watcher window is closed.", paused: "The watcher is paused in the extension.",
    scrolled_up: "The Discord window is scrolled up, so new posts don't load (the extension keeps scrolling it down — check the window)." } as any)[b.state] || `The watcher reports "${b.state}".`;
  if (!why) return;
  await putSetting("signal_beat", { ...b, offline_sent: true }, "cron");
  await notify("watcher", "⚠️ Otto Signals watcher is OFFLINE", `${why} Signals are NOT being caught. Check Ifoma's PC.`, "./#signals");
}

/* ===================================================================== v3.5
   5 Oct 2026 — Jarvis can close positions on his own (auto-close).

   Ifoma's decisions: Jarvis may close ANY position in the Agentic account
   whenever he judges it, at market, with no Approve click; there's an on/off
   switch in Settings → Limits & goals (default ON). Guard rails that stay:
   closing only (it can't open, add or flip; shares can't go short), Agentic
   account only, regular market hours only, a one-sentence reason every time,
   and every auto-close is posted on the Desk and recorded as a done card.
   Jarvis gets the close_position tool on the Desk (when ON), on a scheduled
   position check (every review_min minutes while something is open), and
   when one of a protected trade's own alerts fires. */

const CLOSE_TOOL = {
  name: "close_position",
  description: "AUTO-CLOSE, no Approve card: immediately sells to close a position in the Robinhood Agentic account at market. " +
    "Works only while auto-close is ON in their settings and the market is open (9:30–4:00 ET); otherwise it errors and you use propose_action for a close card. " +
    "Closing only: it can never open, add to, flip, or short anything. Any working sell orders on that option (e.g. Otto's protective stop) are cancelled first. " +
    "v3.21: it only works when one of the card's OWN exits is met — wrong-if closed through on the card's bar (5-minute on new cards), TP1 reached, or 3:50 PM ET. The server checks that on Robinhood bars and refuses otherwise. " +
    "For any other reason (a feeling, a bounce, a binary event, someone asking you to close), put up a close card with propose_action instead — a person approves it. " +
    "Give the reason in one plain sentence; it is posted on the Desk.",
  input_schema: {
    type: "object",
    properties: {
      option_id: { type: "string", description: "Instrument id of the LONG option to close (from rh__get_option_positions)" },
      symbol: { type: "string", description: "Stock symbol, only to sell shares held in the Agentic account" },
      quantity: { type: "number", description: "Optional. Default = everything held." },
      reason: { type: "string", description: "One sentence: why it's closing now" },
    },
    required: ["reason"],
  },
};

/* v3.21 (Ifoma, 7 Oct night): early exits run only on the card's own rules, checked by the server on
   Robinhood 5-minute bars — wrong-if closed through (on the card's bar), TP1 touched, or 3:50 PM ET
   (intraday House Rule). Jarvis's own judgment ("the tape stopped working") is not a reason to auto-close:
   7 Oct, QQQ was closed 2 minutes after the fill over a bounce from before the entry. */
export async function exitRuleCheck(a: any, now = Date.now()): Promise<{ met: boolean; why: string; detail: string }> {
  const ex = a?.exit || {};
  if (!ex.option_id || !(Number(ex.wrong_if) > 0) || !(Number(ex.tp1) > 0)) return { met: false, why: "", detail: "no card plan on file for this position" };
  const tk = String(ex.tv_symbol || "").split(":").pop() || "";
  const up = ex.direction !== "down", tf = Number(ex.wrong_tf) === 5 ? 5 : 15;
  const since = Date.parse(ex.armed_at || a.decided_at || a.created_at || "") || now - 6 * 3600e3;
  const min = etParts(new Date(now)).min;
  if (min >= 950) return { met: true, why: "3:50 PM — intraday trades are flat by the close (House Rule)", detail: "" };
  let bars: Bar[] = [];
  try { bars = completedBars((await rhBars([tk], "5minute", new Date(since - 10 * 60e3).toISOString()))[tk.toUpperCase()] || [], 5, now); }
  catch (e) { return { met: false, why: "", detail: `couldn't read ${tk} bars (${String((e as Error).message).slice(0, 80)})` }; }
  const after = bars.filter((b) => b.t + 5 * 60e3 > since);
  const tp = after.find((b) => up ? b.h >= ex.tp1 : b.l <= ex.tp1);
  if (tp) return { met: true, why: `TP1 ${ex.tp1} reached (${tk} ${up ? "high" : "low"} ${up ? tp.h : tp.l} on the ${etLabel(new Date(tp.t).toISOString())} bar)`, detail: "" };
  let lastClose: number | null = null;
  for (const b of after) {
    const ends = tf === 5 || new Date(b.t + 5 * 60e3).getUTCMinutes() % tf === 0;
    if (!ends) continue;
    lastClose = b.c;
    if (up ? b.c < ex.wrong_if : b.c > ex.wrong_if)
      return { met: true, why: `wrong-if ${ex.wrong_if}: ${tk} closed a ${tf}-minute bar at ${b.c} (${etLabel(new Date(b.t + 5 * 60e3).toISOString())})`, detail: "" };
  }
  return { met: false, why: "", detail: `wrong-if ${ex.wrong_if} on a ${tf}-minute close not hit${lastClose != null ? ` (last ${tf}-min close ${lastClose})` : " (no completed bar yet)"}; TP1 ${ex.tp1} not reached; before 3:50 PM` };
}
async function armedTradeFor(optId: string) {
  const rows = await db("otto_actions?select=id,title,exit,decided_at,created_at&exit->>state=eq.armed&limit=20").catch(() => []);
  return (rows || []).find((r: any) => r.exit?.option_id === optId) || null;
}
async function closeNow(input: any, who: string, verified = false) {
  const L = await getLimits();
  if (!L.auto_close) throw new Error("Auto-close is OFF (Settings → Limits & goals). Use propose_action for a close card instead.");
  if (!rthNow()) throw new Error("Market is closed: auto-close only works 9:30 AM–4:00 PM ET. Use a close card.");
  const reason = String(input.reason || "").trim().slice(0, 400);
  if (reason.length < 8) throw new Error("Give the reason in one sentence; it goes on the Desk.");
  const acct = await agenticAccount();
  const calls: any[] = [], results: any[] = [];
  let title = "", orderId: string | null = null;
  if (input.symbol && !input.option_id) throw new Error("Shares have no card plan, so auto-close can't check a rule. Put up a close card with propose_action.");
  let ruleWhy = "";
  if (verified && input.rule_why) ruleWhy = String(input.rule_why);
  if (input.option_id && !verified) {
    const tr = await armedTradeFor(String(input.option_id));
    const chk = tr ? await exitRuleCheck(tr) : { met: false, why: "", detail: "no card plan on file for this position" };
    if (!chk.met) throw new Error(`Not closed — none of the card's exits is met: ${chk.detail}. Auto-close only runs on the card's own rules (wrong-if, TP1, 3:50 PM). If you still think it should come off, put up a close card with propose_action and say why in one line — a person decides.`);
    ruleWhy = chk.why;
  }
  if (input.option_id) {
    const optId = String(input.option_id);
    const pos = (mcpJson(await call("rh", "get_option_positions", { account_number: acct, option_ids: optId }))?.data?.positions || [])
      .filter((p: any) => p.type === "long");
    const held = pos.reduce((s: number, p: any) => s + Number(p.quantity || 0), 0);
    if (!(held > 0)) throw new Error("No long position in that option on the Agentic account.");
    const qty = input.quantity ? Math.min(held, Math.floor(Number(input.quantity))) : held;
    if (!(qty >= 1)) throw new Error("quantity must be at least 1 contract");
    // Free the contracts: cancel any working sell-to-close on this option (Otto's stop, a stale limit).
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    const oj = mcpJson(await call("rh", "get_option_orders", { account_number: acct, created_at_gte: since }));
    let cancelled = 0;
    for (const o of (oj?.data?.orders || [])) {
      if (EXIT_OPEN_ORDER.has(o.state) && (o.legs || []).some((l: any) => l.option_id === optId && l.position_effect === "close")) {
        try { await call("rh", "cancel_option_order", { account_number: acct, order_id: o.id }); cancelled++;
              calls.push({ service: "rh", tool: "cancel_option_order", args: { order_id: o.id } });
              results.push({ tool: "cancel_option_order", ok: true, text: "cancelled " + o.id }); }
        catch (e) { results.push({ tool: "cancel_option_order", ok: false, text: (e as Error).message.slice(0, 300) }); }
      }
    }
    if (cancelled) await new Promise((r) => setTimeout(r, 2000));
    const args = { account_number: acct, legs: [{ option_id: optId, side: "sell", position_effect: "close" }],
      quantity: String(qty), type: "market", time_in_force: "gfd", ref_id: crypto.randomUUID() };
    let r: any;
    try { r = await call("rh", "place_option_order", args); }
    catch (e) {                                   // a just-cancelled stop can hold the contracts for a moment
      await new Promise((res) => setTimeout(res, 3000));
      r = await call("rh", "place_option_order", { ...args, ref_id: crypto.randomUUID() });
      void e;
    }
    orderId = orderIdOf(mcpJson(r));
    calls.push({ service: "rh", tool: "place_option_order", args: { ...args, account_number: mask(acct) } });
    results.push({ tool: "place_option_order", ok: true, text: mcpText(r).slice(0, 1500) });
    title = `Auto-close ${qty} ${pos[0]?.chain_symbol || ""} option${qty > 1 ? "s" : ""} (exp ${pos[0]?.expiration_date || "?"})`;
  } else if (input.symbol) {
    const sym = String(input.symbol).toUpperCase().replace(/[^A-Z.]/g, "");
    const ej = mcpJson(await call("rh", "get_equity_positions", { account_number: acct }));
    const list: any[] = ej?.data?.positions || ej?.positions || ej?.data || [];
    const p = (Array.isArray(list) ? list : []).find((x: any) => String(x.symbol || x.ticker || "").toUpperCase() === sym);
    const held = Number(p?.quantity || 0);
    if (!(held > 0)) throw new Error(`No ${sym} shares in the Agentic account.`);
    const qty = input.quantity ? Math.min(held, Number(input.quantity)) : held;
    const args = { account_number: acct, symbol: sym, side: "sell", type: "market", quantity: String(qty), time_in_force: "gfd",
      market_hours: "regular_hours", ref_id: crypto.randomUUID() };
    const r = await call("rh", "place_equity_order", args);
    orderId = orderIdOf(mcpJson(r));
    calls.push({ service: "rh", tool: "place_equity_order", args: { ...args, account_number: mask(acct) } });
    results.push({ tool: "place_equity_order", ok: true, text: mcpText(r).slice(0, 1500) });
    title = `Auto-close ${qty} ${sym} shares`;
  } else throw new Error("Give option_id (for an option) or symbol (for shares).");

  const rows = await db("otto_actions", { method: "POST", body: JSON.stringify({
    title, summary: `Reason   ${ruleWhy ? "[card rule] " + ruleWhy + ". " : ""}${reason}\nOrder    sell to close at market (auto-close, no Approve)\nBy       ${who === "rules" ? "Otto (card rule, server-checked)" : "Jarvis, on " + who}`,
    calls, risk: { cost: 0, notes: ["closing order: no new risk"] }, review: "", status: "done", created_by: "Jarvis (auto)",
    decided_by: "auto-close", decided_at: new Date().toISOString(), result: results, ...(orderId ? { order_id: String(orderId) } : {}),
  }) });
  const id = rows?.[0]?.id || null;
  const by = who === "rules" ? "Otto closed (card rule)" : "Jarvis closed";
  const whyTxt = ruleWhy ? `${ruleWhy}${reason && reason !== ruleWhy ? " — " + reason : ""}` : reason;
  await logDesk("system", "Otto", `🤖 ${by}: ${title} at market. Why: ${whyTxt} (Auto-close is on; turn it off in Settings → Limits & goals.)`, id);
  await notify("auto_close", `🤖 ${by}: ${title.replace(/^Auto-close /, "")}`, `Sold at market. Why: ${whyTxt}`);
  return { ok: true, title, order_id: orderId, card: id };
}

// Scheduled / triggered check of everything open in the Agentic account.
export async function ruleSweep() {
  const armed = await db("otto_actions?select=id,title,exit,decided_at,created_at&exit->>state=eq.armed&limit=20").catch(() => []);
  const out: any[] = [];
  for (const a of armed || []) {
    try {
      const chk = await exitRuleCheck(a);
      if (!chk.met) continue;
      const r = await closeNow({ option_id: a.exit.option_id, reason: chk.why, rule_why: chk.why }, "rules", true);
      out.push({ id: a.id, closed: r.title, why: chk.why });
    } catch (e) { out.push({ id: a.id, error: (e as Error).message.slice(0, 200) }); }
  }
  return out;
}
async function positionReview(trigger: string | null = null) {
  const L = await getLimits();
  if (!L.auto_close || !rthNow()) return { ok: true, skipped: "off or market closed" };
  // v3.21: the card's own rules are checked on every call (cron minute or alert), by the server.
  const swept = await ruleSweep().catch((e) => [{ error: String((e as Error).message) }]);
  const every = Math.max(5, Number(L.review_min) || 15) * 60e3;
  if (!trigger) {
    const last = await db("otto_settings?key=eq.review_at&select=value").then((r: any) => Number(r?.[0]?.value?.at || 0)).catch(() => 0);
    if (Date.now() - last < every) return { ok: true, skipped: "recent" };
  }
  const acct = await agenticAccount();
  const [op, eq] = await Promise.all([
    settle((async () => mcpJson(await call("rh", "get_option_positions", { account_number: acct, nonzero: true })))()),
    settle((async () => mcpJson(await call("rh", "get_equity_positions", { account_number: acct })))()),
  ]);
  const opts = op.ok ? (op.v?.data?.positions || []).filter((p: any) => Number(p.quantity) > 0) : [];
  const eqRaw: any = eq.ok ? (eq.v?.data?.positions || eq.v?.positions || eq.v?.data || []) : [];
  const shares = (Array.isArray(eqRaw) ? eqRaw : []).filter((p: any) => Number(p.quantity) > 0);
  if (!opts.length && !shares.length) return { ok: true, skipped: "nothing open" };
  await db("otto_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: "review_at", value: { at: Date.now() }, updated_by: "cron", updated_at: new Date().toISOString() }) }).catch(() => {});
  const plans = await db("otto_actions?select=title,plan,exit&exit->>state=eq.armed&limit=10").catch(() => []);
  const calls = await loadBrain();
  const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
  const { tools: mcpToolDefs } = await deskTools();
  const prompt = `[Automatic position check — nobody typed this. ${trigger ? "TRIGGER: " + trigger : `Scheduled check (every ${Math.round(every / 60e3)} min).`}]
Open in the Agentic account — options: ${JSON.stringify(opts.map((p: any) => ({ option_id: p.option_id, symbol: p.chain_symbol, qty: p.quantity, avg: p.average_price, exp: p.expiration_date })))}; shares: ${JSON.stringify(shares.map((p: any) => ({ symbol: p.symbol, qty: p.quantity })))}.
Plans on file: ${JSON.stringify((plans || []).map((r: any) => ({ title: r.title, setup: r.plan?.setup, direction: r.exit?.direction, tp1: r.exit?.tp1, wrong_if: r.exit?.wrong_if, stop_option: r.exit?.stop_option, option_id: r.exit?.option_id })))}.
For each position: fetch the underlying's live price and recent 5-minute bars (and the option quote) and compare with its plan, the Otto Rules exits and the House Rules. You can't close anything: the server closes a trade on its card's own rules (wrong-if on the card's bar, TP1, 3:50 PM) by itself. If you'd get out for a reason that isn't one of those, write one short line per position saying so and why — Ifoma or Josh decide. Otherwise reply with exactly the single word HOLD and nothing else.${swept.length ? " Already handled by the server this minute: " + JSON.stringify(swept).slice(0, 400) : ""}`;
  const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: [TOOLS[0], ...mcpToolDefs], cs: chunksOf(calls),
    who: "auto-review", send: () => {}, allowPropose: false, allowClose: false, maxRounds: 8 });
  const said = res.said.trim();
  if (said && !/^HOLD\.?$/i.test(said)) await logDesk("assistant", "Jarvis · position check", said);
  return { ok: true, said: said.slice(0, 300) };
}

/* ===================================================================== v3.6
   5 Oct 2026 — phone notifications (Web Push, both phones).

   No third-party service and no extra secrets: the VAPID key pair is made on
   first use and kept in otto_settings ("push_vapid", service role only).
   Subscriptions live in otto_settings ("push_subs"), one per phone, each with
   its own choices. Messages are encrypted per RFC 8291 (aes128gcm) with
   WebCrypto and sent straight to Apple's / Google's push service.
   Quiet outside 9:00 AM–4:30 PM ET weekdays, except "no_stop" (a trade with
   no stop working), which always goes through. iPhone needs Otto opened from
   the home-screen icon (iOS 16.4+). */

const PUSH_KINDS: Record<string, { label: string; on: boolean; always?: boolean }> = {
  auto_close:  { label: "Jarvis closed a trade", on: true },
  no_stop:     { label: "A trade has NO stop working", on: true, always: true },
  fill:        { label: "Entry filled · stop on", on: true },
  stopped:     { label: "Stop filled (stopped out)", on: true },
  trade_alert: { label: "Your trade's wrong-if / TP1 hit", on: true },
  card:        { label: "A card is waiting for Approve", on: true },
    morning:     { label: "8:45 morning read is ready", on: false },
  signal:      { label: "Otto Signals: a call came in (card ready)", on: true, always: true },
  watcher:     { label: "Otto Signals watcher went offline / came back", on: true, always: true },
  daily:       { label: "5:15 PM daily recap is ready", on: true },
  checkin:     { label: "⏰ A check-in Jarvis scheduled", on: true },
};
const PUSH_SUB_URL = "https://proagentmax.github.io/otto-trader/";

const b64u = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
function cat(...a: Uint8Array[]) { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; }
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
const te = new TextEncoder();

/* ------------------------------------------------------------ v3.13 House Rules
   Standing instructions from Ifoma and Josh. Stored in otto_settings "house_rules", shown and edited in
   Settings → House Rules, loaded into every Jarvis run, and saved by Jarvis (save_house_rule) when
   someone gives a standing instruction on the Desk. */
const HOUSE_DEFAULTS = [
  "Intraday only: every trade is closed the same day. Don't hold overnight unless Ifoma or Josh says so for that trade.",
  "Trading the open: when a Signal level was posted before the open and price opens on it or pushes off it, it's a go before 10:00 AM. Otherwise no entries in the first 30 minutes.",
  "Read entries on the 5-minute and 10-minute charts, on candle closes, not wicks.",
  "Look for setups in both directions: calls on a break or a pullback that holds, puts on a rejection. Label a quick trade SCALP on the card.",
  "When a setup checks the boxes, build the card without asking first. Ask only if you can't see the data.",
  "On an open trade, warn early (lower highs, stalling near the wrong-if, the option bleeding) before the stop is anywhere close.",
  "Guardrails flag, never block: always show the card with the red banner; Ifoma and Josh decide.",
];
export async function houseRules(): Promise<{ id: string; text: string; by: string; at: string }[]> {
  return cached("house_rules", 30e3, async () => {
    const v = await setting("house_rules").catch(() => null);
    if (v && Array.isArray(v.rules)) return v.rules;
    return HOUSE_DEFAULTS.map((text, i) => ({ id: "d" + (i + 1), text, by: "Ifoma (6 Oct)", at: "2026-10-06T21:00:00Z" }));
  });
}
export async function houseRulesText(): Promise<string> {
  const r = await houseRules();
  return r.length ? "HOUSE RULES — their standing instructions; follow every one:\n" + r.map((x, i) => `${i + 1}. ${x.text}`).join("\n") : "";
}
async function houseRulesSet(body: any, who: string) {
  const list = (Array.isArray(body?.rules) ? body.rules : []).map((x: any) => ({
    id: String(x.id || crypto.randomUUID().slice(0, 8)), text: String(x.text || "").trim().slice(0, 400),
    by: String(x.by || body?.author || who.split("@")[0]).slice(0, 40), at: String(x.at || new Date().toISOString()) })).filter((x: any) => x.text);
  if (list.length > 40) throw new Error("40 rules max — remove some first");
  await putSetting("house_rules", { rules: list }, String(body?.author || who).slice(0, 60));
  delete CACHE.house_rules;
  return list;
}
export async function houseRuleAdd(text: string, by: string) {
  const t = String(text || "").trim().slice(0, 400);
  if (t.length < 8) throw new Error("rule text too short");
  const cur = await houseRules();
  if (cur.some((x) => x.text.toLowerCase() === t.toLowerCase())) return cur;
  const list = await houseRulesSet({ rules: [...cur, { text: t, by }], author: by }, by);
  await logDesk("system", "Otto", `📌 House rule saved (${by}): ${t}  — see or edit it in Settings → House Rules.`);
  return list;
}
const HOUSE_TOOL = {
  name: "save_house_rule",
  description: "Save a standing instruction from Ifoma or Josh to the House Rules (loaded into every future run). Use only for instructions meant to apply from now on, written as one plain sentence.",
  input_schema: { type: "object", properties: { text: { type: "string", description: "The rule, one plain sentence" } }, required: ["text"] },
};

async function setting(key: string): Promise<any> {
  const r = await db("otto_settings?key=eq." + key + "&select=value");
  return r?.[0]?.value ?? null;
}
async function putSetting(key: string, value: any, by = "otto") {
  await db("otto_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value, updated_by: by, updated_at: new Date().toISOString() }) });
}

/* ---- v3.8 (5 Oct 2026): the Desk layout Ifoma and Josh customize — side-tab
   order / names / hidden / landing tab, and side-card order / column / collapsed.
   Shared by both laptops. Validated loosely: keys and labels only, nothing runs. */
async function layoutSet(body: any, who: string) {
  const key = (v: any) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  const tabs = (Array.isArray(body.tabs) ? body.tabs : []).slice(0, 20).map((t: any) => ({
    k: key(t.k), l: String(t.l || "").replace(/[<>]/g, "").trim().slice(0, 18), hide: !!t.hide })).filter((t: any) => t.k);
  const side = (a: any) => (Array.isArray(a) ? a : []).slice(0, 30).map(key).filter(Boolean);
  const v = { v: 1, tabs, home: key(body.home) || "desk",
    cards: { left: side(body.cards?.left), right: side(body.cards?.right) },
    min: side(body.min), at: new Date().toISOString(), by: who };
  // Reset = empty lists; the app fills in its default order for anything not listed.
  if (body.reset) { v.tabs = []; v.home = "desk"; v.cards = { left: [], right: [] }; v.min = []; }
  await putSetting("layout", v, who);
  return v;
}

let VAPID: { pub: string; jwk: any } | null = null;
async function vapid() {
  if (VAPID) return VAPID;
  let v = await setting("push_vapid");
  if (!v?.pub || !v?.jwk) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    v = { pub: b64u(pub), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
    await putSetting("push_vapid", v, "setup");
    const again = await setting("push_vapid");                 // another copy may have won the race
    if (again?.pub) v = again;
  }
  VAPID = v;
  return v;
}

async function vapidAuth(endpoint: string) {
  const v = await vapid();
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: PUSH_SUB_URL })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

// RFC 8291 / 8188: one aes128gcm record.
async function encryptPush(sub: any, payload: Uint8Array) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);                   // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

async function sendPush(sub: any, msg: any) {
  const body = await encryptPush(sub, te.encode(JSON.stringify(msg).slice(0, 3000)));
  const r = await fetch(sub.endpoint, { method: "POST", headers: {
    authorization: await vapidAuth(sub.endpoint), "content-encoding": "aes128gcm", "content-type": "application/octet-stream",
    ttl: "3600", urgency: msg.kind === "morning" ? "normal" : "high" }, body });
  return r.status;
}

function quietNow() { const e = etParts(); return ["Sat", "Sun"].includes(e.wd) || e.min < 540 || e.min > 990; }

// The one call everything else uses. Never throws: a notification is a convenience.
async function notify(kind: string, title: string, body: string, url = "./#desk") {
  if (TEST?.notify) TEST.notify(kind, unname(title), unname(body));
  try {
    const K = PUSH_KINDS[kind]; if (!K) return;
    // v3.9: no quiet hours — Ifoma's call (6 Oct): Otto pings at any time.
    const subs: Record<string, any> = (await setting("push_subs")) || {};
    let changed = false;
    for (const [id, s] of Object.entries(subs)) {
      const want = s.prefs && kind in s.prefs ? !!s.prefs[kind] : K.on;
      if (!want) continue;
      try {
        const st = await sendPush(s.sub, { kind, title: unname(title).slice(0, 120), body: unname(body).slice(0, 300), url, tag: kind + "-" + Date.now() });
        if (st === 404 || st === 410) { delete subs[id]; changed = true; }
      } catch (e) { console.error("push", (e as Error).message); }
    }
    if (changed) await putSetting("push_subs", subs);
  } catch (e) { console.error("notify", (e as Error).message); }
}

async function pushSubscribe(b: any, who: string) {
  const sub = b?.subscription;
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error("bad subscription");
  const subs: Record<string, any> = (await setting("push_subs")) || {};
  const id = b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(sub.endpoint)))).slice(0, 16);
  const prefs: Record<string, boolean> = {};
  for (const k of Object.keys(PUSH_KINDS)) prefs[k] = b.prefs && k in b.prefs ? !!b.prefs[k] : (subs[id]?.prefs?.[k] ?? PUSH_KINDS[k].on);
  subs[id] = { sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    label: String(b.label || subs[id]?.label || "Phone").slice(0, 40), prefs, at: new Date().toISOString(), by: who };
  await putSetting("push_subs", subs, who);
  return { id, label: subs[id].label, prefs };
}
async function pushList(endpoint?: string) {
  const subs: Record<string, any> = (await setting("push_subs")) || {};
  const list = Object.entries(subs).map(([id, s]) => ({ id, label: s.label, at: s.at, prefs: s.prefs, mine: !!endpoint && s.sub.endpoint === endpoint }));
  return { kinds: PUSH_KINDS, list };
}
async function pushRemove(b: any) {
  const subs: Record<string, any> = (await setting("push_subs")) || {};
  for (const [id, s] of Object.entries(subs)) if (id === b.id || s.sub.endpoint === b.endpoint) delete subs[id];
  await putSetting("push_subs", subs);
  return { ok: true };
}
async function pushTest(b: any) {
  const subs: Record<string, any> = (await setting("push_subs")) || {};
  const hit = Object.values(subs).find((s: any) => s.sub.endpoint === b.endpoint) as any;
  if (!hit) throw new Error("This phone isn't turned on yet");
  const st = await sendPush(hit.sub, { kind: "test", title: "✓ Otto notifications work", body: `${hit.label}: this is what a Desk alert looks like.`, url: "./#desk", tag: "test" });
  if (st >= 300) throw new Error("Push service answered " + st);
  return { ok: true, status: st };
}

/* ===================================================================== v3.3
   5 Oct 2026 — Results page, editable limits & goals, Help chat.
   Limits live in otto_settings (007_v33.sql) so Ifoma and Josh change them in
   Settings with no code. They are warnings on cards, never blocks. */

// v3.13 (Ifoma, 6 Oct): limits are % of the Agentic account — 10% max loss per trade (at the stop),
// 20% weekly, a daily stop after 2 losing trades or 2× the max loss. All of them FLAG; none blocks.
const LIMIT_DEFAULTS: any = { phase: 1, max_trade_loss: 100, weekly_loss: 150, max_trades_day: 2, monthly_goal_pct: 5, warn_pct: 20, big_day: 500,
  auto_close: true, review_min: 15, max_trade_pct: 10, weekly_pct: 20, daily_losses: 2 };
async function agenticValue(): Promise<number | null> {
  return cached("agentic_value", 5 * 60e3, async () => {
    try {
      const pj = mcpJson(await call("rh", "get_portfolio", { account_number: await agenticAccount() }));
      return Number(pj?.data?.total_value ?? pj?.total_value) || null;
    } catch { return null; }
  });
}
export async function getLimits(): Promise<any> {
  return cached("limits", 30e3, async () => {
    let L: any;
    try {
      const r = await db("otto_settings?key=eq.limits&select=value,updated_by,updated_at");
      L = { ...LIMIT_DEFAULTS, ...(r?.[0]?.value || {}), _by: r?.[0]?.updated_by || null, _at: r?.[0]?.updated_at || null };
    } catch { L = { ...LIMIT_DEFAULTS }; }
    // % limits become today's dollars from the live account value; the stored $ stay as the fallback.
    const v = (Number(L.max_trade_pct) > 0 || Number(L.weekly_pct) > 0) ? await agenticValue() : null;
    L.account_value = v;
    if (v && Number(L.max_trade_pct) > 0) L.max_trade_loss = Math.round(v * L.max_trade_pct / 100);
    if (v && Number(L.weekly_pct) > 0) L.weekly_loss = Math.round(v * L.weekly_pct / 100);
    L.pct_mode = !!v;
    return L;
  });
}
async function setLimits(body: any, who: string) {
  const cur: any = await getLimits();
  const v: any = { ...cur, ...Object.fromEntries(Object.entries(body || {}).filter(([, x]) => x !== "" && x != null)) };
  const by = String(body?.author || "").trim().slice(0, 40) || who.split("@")[0];
  const num = (k: string, lo: number, hi: number) => {
    const n = Number(v[k]); if (!isFinite(n) || n < lo || n > hi) throw new Error(`${k.replace(/_/g, " ")} must be between ${lo} and ${hi}`); return n;
  };
  const value = { phase: num("phase", 1, 3), max_trade_loss: num("max_trade_loss", 0, 1e6), weekly_loss: num("weekly_loss", 1, 1e6),
    max_trades_day: num("max_trades_day", 1, 100), monthly_goal_pct: num("monthly_goal_pct", 0, 100), warn_pct: num("warn_pct", 1, 100),
    big_day: num("big_day", 1, 1e7), auto_close: v.auto_close === true || v.auto_close === "true", review_min: num("review_min", 5, 120),
    max_trade_pct: num("max_trade_pct", 0, 100), weekly_pct: num("weekly_pct", 0, 100), daily_losses: num("daily_losses", 0, 20) };
  await db("otto_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: "limits", value, updated_by: by + " (" + who + ")", updated_at: new Date().toISOString() }) });
  delete CACHE.limits;
  delete CACHE.agentic_value;
  await logDesk("system", "Otto", `Guardrails updated by ${by} (they flag, never block): max loss/trade ${value.max_trade_pct > 0 ? value.max_trade_pct + "% of the account" : value.max_trade_loss > 0 ? "$" + value.max_trade_loss : "off"}, weekly ${value.weekly_pct > 0 ? value.weekly_pct + "%" : "$" + value.weekly_loss}, daily stop after ${value.daily_losses || "—"} losing trades or 2× the max loss, ${value.max_trades_day} trades/day, goal ${value.monthly_goal_pct}%/month, warn over ${value.warn_pct}% of the account. Auto-close ${value.auto_close ? `ON (Jarvis can sell to close on his own; checks every ${value.review_min} min)` : "OFF (closes need an Approve)"}.`);
  return { ...value, _by: who, _at: new Date().toISOString() };
}

// Daily realized P&L, both accounts combined (Robinhood's own P&L numbers).
async function dailyPnl(): Promise<{ days: any[]; total_all: number | null; trades: number }> {
  return cached("dailypnl", 5 * 60e3, async () => {
    const by: Record<string, { pnl: number; trades: number }> = {};
    let totalAll = 0, gotAll = false, trades = 0;
    for (const a of await allAccounts()) {
      try {
        const j = mcpJson(await call("rh", "get_realized_pnl", { account_number: a.n, span: "3month", timezone: "America/New_York" }));
        for (const d of j?.data?.data_points || []) {
          if (d.realized_gain == null && !d.number_of_trades) continue;
          const day = etParts(new Date(Date.parse(d.start_time) + 6 * 3600e3)).date;
          const e = by[day] ||= { pnl: 0, trades: 0 };
          e.pnl += Number(d.realized_gain || 0); e.trades += Number(d.number_of_trades || 0); trades += Number(d.number_of_trades || 0);
        }
      } catch { /* one account failing shouldn't blank the page */ }
      try {
        const y = mcpJson(await call("rh", "get_realized_pnl", { account_number: a.n, span: "all" }));
        if (y?.data?.total_returns != null) { totalAll += Number(y.data.total_returns); gotAll = true; }
      } catch { /* */ }
    }
    const days = Object.entries(by).map(([date, v]) => ({ date, pnl: +v.pnl.toFixed(2), trades: v.trades })).sort((a, b) => a.date.localeCompare(b.date));
    return { days, total_all: gotAll ? +totalAll.toFixed(2) : null, trades };
  });
}

async function performance(apiKey: string, wantRead: boolean, fresh = false) {
  const L = await getLimits();
  if (fresh) delete CACHE["dailypnl"];
  const now = etParts();
  const [pnl, accts] = await Promise.all([dailyPnl(), allAccounts()]);
  const values = await Promise.all(accts.map(async (a) => {
    try { const p = mcpJson(await call("rh", "get_portfolio", { account_number: a.n })); return { label: a.label, value: Number(p?.data?.total_value || 0), cash: Number(p?.data?.cash || 0) }; }
    catch { return { label: a.label, value: null, cash: null }; }
  }));
  const combined = values.reduce((s, v) => s + (v.value || 0), 0);
  const days = pnl.days;
  const first = days.find((d) => d.trades > 0)?.date || null;
  // weeks (Mon–Fri, New York time)
  const weeks: Record<string, { pnl: number; trades: number }> = {};
  days.forEach((d) => { const w = mondayOf(d.date); const e = weeks[w] ||= { pnl: 0, trades: 0 }; e.pnl += d.pnl; e.trades += d.trades; });
  const thisWeek = mondayOf(now.date);
  if (!weeks[thisWeek]) weeks[thisWeek] = { pnl: 0, trades: 0 };
  const weekList = Object.entries(weeks).map(([week, v]) => ({ week, pnl: +v.pnl.toFixed(2), trades: v.trades })).sort((a, b) => a.week.localeCompare(b.week))
    .filter((w) => !first || w.week >= mondayOf(first));
  const traded = days.filter((d) => d.trades > 0 && d.pnl !== 0);
  const wins = traded.filter((d) => d.pnl > 0), losses = traded.filter((d) => d.pnl < 0);
  const big = traded.filter((d) => d.pnl <= -L.big_day).sort((a, b) => a.pnl - b.pnl);
  const sum = (l: any[]) => l.reduce((s, d) => s + d.pnl, 0);
  // weeks in a row (most recent completed weeks) without a big week
  let cleanWeeks = 0;
  for (const w of weekList.filter((w) => w.week < thisWeek).reverse()) { if (w.pnl > -L.big_day) cleanWeeks++; else break; }
  // this week / today, from the Journal (single-trade detail) and Robinhood orders
  let trades: any[] = [];
  try { await syncJournal(); trades = await db("otto_trades?select=*&order=opened_at.desc&limit=400"); } catch { /* */ }
  const inWeek = (t: string | null) => !!t && etParts(new Date(t)).date >= thisWeek;
  const weekTrades = trades.filter((t) => t.pnl != null && inWeek(t.closed_at));
  const worstThisWeek = weekTrades.reduce((m, t) => Math.min(m, Number(t.pnl)), 0);
  const tradesToday = trades.filter((t) => t.opened_at && etParts(new Date(t.opened_at)).date === now.date).length;
  const monthStart = now.date.slice(0, 8) + "01";
  const monthPnl = days.filter((d) => d.date >= monthStart).reduce((s, d) => s + d.pnl, 0);
  // how we trade (from the Journal)
  const closed = trades.filter((t) => t.pnl != null && (t.status === "closed" || t.status === "expired"));
  const cp: any = { calls: { n: 0, pnl: 0 }, puts: { n: 0, pnl: 0 } };
  const tick: Record<string, number> = {};
  closed.forEach((t) => { const k = / \d+(\.\d+)?P /.test(t.contract + " ") ? "puts" : "calls"; cp[k].n++; cp[k].pnl += Number(t.pnl); tick[t.symbol] = (tick[t.symbol] || 0) + Number(t.pnl); });
  const tickers = Object.entries(tick).map(([s, v]) => ({ s, pnl: +v.toFixed(2) })).sort((a, b) => b.pnl - a.pnl);
  // rules vs results (trades linked to a Desk card with a rule check)
  const ids = [...new Set(closed.map((t) => t.action_id).filter(Boolean))];
  const acts = ids.length ? await db("otto_actions?select=id,checks&id=in.(" + ids.join(",") + ")").catch(() => []) : [];
  const chk: Record<string, any[]> = Object.fromEntries(acts.map((a: any) => [a.id, a.checks || []]));
  const followed = closed.filter((t) => chk[t.action_id] && chk[t.action_id].every((c: any) => c.ok !== false));
  const broke = closed.filter((t) => chk[t.action_id] && chk[t.action_id].some((c: any) => c.ok === false));
  const overLimit = L.max_trade_loss > 0 ? closed.filter((t) => Number(t.pnl) < -L.max_trade_loss) : [];
  const out: any = {
    ok: true, limits: L, as_of: new Date().toISOString(), first_trade_day: first,
    accounts: values, combined: +combined.toFixed(2),
    realized: { since_start: pnl.total_all ?? +sum(days).toFixed(2), last_90d: +sum(days).toFixed(2), trades: pnl.trades },
    weeks: weekList,
    days: { winning: wins.length, losing: losses.length, avg_win: wins.length ? +(sum(wins) / wins.length).toFixed(2) : null,
      avg_loss: losses.length ? +(sum(losses) / losses.length).toFixed(2) : null },
    big_days: big.map((d) => ({ date: d.date, pnl: d.pnl, trades: d.trades })), big_total: +sum(big).toFixed(2),
    rest_total: +(sum(traded) - sum(big)).toFixed(2),
    goals: {
      week_pnl: +(weeks[thisWeek]?.pnl || 0).toFixed(2), worst_trade_week: +worstThisWeek.toFixed(2), trades_today: tradesToday,
      clean_weeks: cleanWeeks, month_pnl: +monthPnl.toFixed(2), month_goal: +(combined * L.monthly_goal_pct / 100).toFixed(2),
    },
    how: { calls: { n: cp.calls.n, pnl: +cp.calls.pnl.toFixed(2) }, puts: { n: cp.puts.n, pnl: +cp.puts.pnl.toFixed(2) },
      best: tickers[0] || null, worst: tickers.length > 1 ? tickers[tickers.length - 1] : null },
    rules: { followed: { n: followed.length, pnl: +sum(followed.map((t) => ({ pnl: Number(t.pnl) }))).toFixed(2) },
      broke: { n: broke.length, pnl: +sum(broke.map((t) => ({ pnl: Number(t.pnl) }))).toFixed(2) },
      over_limit: { n: overLimit.length, pnl: +sum(overLimit.map((t) => ({ pnl: Number(t.pnl) }))).toFixed(2) } },
  };
  // Jarvis's read — one short paragraph, cached per day and per change in the numbers
  const readKey = `read|${now.date}|${out.realized.since_start}|${out.goals.week_pnl}|${L.max_trade_loss}|${L.weekly_loss}`;
  if (CACHE[readKey]) out.read = CACHE[readKey].v;
  else if (wantRead && apiKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 300,
          system: "You are Jarvis on the Otto trading desk, writing the 2–3 sentence summary at the top of Ifoma and Josh's Results page. They trade as one team. Plain words, numbers first, no hype, no lecturing. Say where they are against their limits and the one thing that matters most. Never give sizing beyond their own limits.",
          messages: [{ role: "user", content: JSON.stringify({ realized_since_start: out.realized.since_start, combined_value: out.combined, weeks: out.weeks.slice(-8),
            big_days: out.big_days, rest_total: out.rest_total, days: out.days, goals: out.goals, limits: { phase: L.phase, max_trade_loss: L.max_trade_loss, weekly_loss: L.weekly_loss, max_trades_day: L.max_trades_day } }) }] }) });
      const j = await r.json();
      out.read = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      CACHE[readKey] = { at: Date.now(), v: out.read };
    } catch { /* page works without it */ }
  }
  return out;
}

// Limit checks that go on every opening card, next to the rule check.
export async function limitChecks(cost: number | null, atStop: number | null = null): Promise<any[]> {
  const L = await getLimits();
  const out: any[] = [];
  const cap = L.max_trade_loss > 0 ? `${L.pct_mode && L.max_trade_pct > 0 ? `your ${L.max_trade_pct}% max, $${L.max_trade_loss}` : `your max $${L.max_trade_loss}`}` : "";
  if (atStop != null) {
    out.push({ ok: L.max_trade_loss > 0 ? atStop <= L.max_trade_loss : null, guard: true,
      text: `Loss if the stop fills: about −$${atStop.toFixed(0)}${cap ? (atStop <= L.max_trade_loss ? ` (inside ${cap})` : ` — OVER ${cap}`) : " (no per-trade max set)"}. Option stops can fill lower on a fast move.` });
    if (cost != null) out.push({ ok: null, text: `Whole premium $${cost.toFixed(0)} (lost only if the option goes to zero)` });
  } else if (cost != null) out.push({ ok: L.max_trade_loss > 0 ? cost <= L.max_trade_loss : null, guard: true, text: `Most this trade can lose: $${cost.toFixed(0)}${cap ? (cost <= L.max_trade_loss ? ` (inside ${cap})` : ` — OVER ${cap}`) : " (no per-trade max set)"}` });
  // Daily stop: N losing trades today, or losses of 2× the max loss (Agentic account).
  try {
    const today = etParts().date;
    const t = await db("otto_trades?select=account,pnl,closed_at&closed_at=gte." + new Date(Date.now() - 864e5).toISOString());
    const mine = (t || []).filter((x: any) => /agentic/i.test(String(x.account || "")) && x.pnl != null && etParts(new Date(x.closed_at)).date === today);
    const losers = mine.filter((x: any) => Number(x.pnl) < 0).length, dayPnl = mine.reduce((s: number, x: any) => s + Number(x.pnl), 0);
    const nMax = Number(L.daily_losses) || 0, dMax = L.max_trade_loss > 0 ? 2 * L.max_trade_loss : 0;
    const hit = (nMax > 0 && losers >= nMax) || (dMax > 0 && dayPnl <= -dMax);
    out.push({ ok: !hit, guard: true, text: hit
      ? `DAILY STOP: ${losers} losing trade${losers === 1 ? "" : "s"} today, $${dayPnl.toFixed(0)} — your rule says done for the day`
      : `Today: ${losers} losing trade${losers === 1 ? "" : "s"}, $${dayPnl.toFixed(0)} (daily stop at ${nMax || "—"} losers${dMax ? ` or −$${dMax}` : ""})` });
  } catch { out.push({ ok: null, text: "Daily stop: couldn't read today's trades" }); }
  try {
    const p = await dailyPnl();
    const wk = mondayOf(etParts().date);
    const weekPnl = p.days.filter((d) => d.date >= wk).reduce((s, d) => s + d.pnl, 0);
    out.push({ ok: weekPnl > -L.weekly_loss, guard: true, text: weekPnl <= -L.weekly_loss
      ? `WEEKLY LIMIT hit ($${weekPnl.toFixed(0)} of −$${L.weekly_loss}${L.pct_mode && L.weekly_pct > 0 ? `, ${L.weekly_pct}%` : ""}): your rule says stop for the week`
      : `This week $${weekPnl.toFixed(0)} (stop at −$${L.weekly_loss})` });
  } catch { out.push({ ok: null, text: "Weekly P&L: couldn't read Robinhood" }); }
  try {
    const today = etParts().date;
    const t = await db("otto_trades?select=opened_at&opened_at=gte." + new Date(Date.now() - 864e5).toISOString());
    const n = t.filter((x: any) => etParts(new Date(x.opened_at)).date === today).length;
    out.push({ ok: n < L.max_trades_day, guard: true, text: `Trade ${n + 1} today (your max ${L.max_trades_day})` });
  } catch { /* */ }
  return out;
}

/* ===================================================================== v3.14
   6 Oct 2026 — the Watcher (Phase 1) and the Scoreboard upgrade (Phase 2).

   Why: on 6 Oct SPY pulled back to the 778.60 Signal level and the 10:30 5-minute bar
   closed green off it. Nobody was watching between messages, so the bounce came and
   went. Now the server watches: every minute 9:30–4:00 ET (pg_cron → ?fn=cron_watch)
   it reads Robinhood 5- and 10-minute bars for every level on today's list and checks
   three triggers IN CODE on completed bars:
     up   · break           previous close at/below the level, this close above it
     up   · pullback-hold   previous close above, this bar dipped to the level and closed green above it
     down · break           previous close at/above, this close below it
     down · rejection       previous close below, this bar reached the level and closed red below it
   A hit is claimed atomically (one card per level per direction per day), posted on the
   Desk, and handed to Jarvis in its own invocation (?fn=watch_jarvis) to decide whether
   it's a real setup; a card + ONE ping only when he makes one. Levels come from Signal
   posts (automatic), the Desk (Jarvis's add_watch_level tool or the panel) and the
   9:20 scanner on SPY/QQQ/Mag-7 (proposed — Ifoma or Josh tap Add). Levels expire at
   the close (each row belongs to one day). Ifoma's decisions, approved mockup
   otto-v3.14-watcher-mockup.html. Table otto_watch (013_v314.sql). */

export type Bar = { t: number; o: number; h: number; l: number; c: number };   // t = bar START, epoch ms
const WATCH_SCAN = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"];
const TRIG_LABEL: Record<string, string> = { break: "break-and-close", "pullback-hold": "pullback-and-hold", rejection: "rejection" };

// The trading day a new level belongs to: today until the close, then the next trading day.
function watchDay(now = new Date()) {
  const c = marketClock(now);
  return c.status === "after" || c.status === "closed" ? nextTradingDay(c.date) : c.date;
}

export function parseRhBars(j: any): Record<string, Bar[]> {
  const out: Record<string, Bar[]> = {};
  for (const r of (j?.data?.results || j?.results || [])) {
    out[String(r.symbol).toUpperCase()] = (r.bars || []).filter((b: any) => !b.interpolated).map((b: any) => ({
      t: Date.parse(b.begins_at), o: Number(b.open_price), h: Number(b.high_price), l: Number(b.low_price), c: Number(b.close_price) }))
      .filter((b: Bar) => [b.o, b.h, b.l, b.c].every((v) => isFinite(v) && v > 0));
  }
  return out;
}
// Robinhood bars for up to 10 symbols per call, cached ~45 s so one cron minute makes at most one call per batch.
async function rhBars(tickers: string[], interval: "5minute" | "10minute", startIso: string, endIso?: string): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = {};
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()))];
  for (let i = 0; i < uniq.length; i += 10) {
    const part = uniq.slice(i, i + 10);
    const key = `rhb|${interval}|${part.join(",")}|${startIso}|${endIso || ""}`;
    Object.assign(out, await cached(key, 45e3, async () =>
      parseRhBars(mcpJson(await call("rh", "get_equity_historicals", { symbols: part, interval, start_time: startIso, ...(endIso ? { end_time: endIso } : {}) })))));
  }
  return out;
}
// Only bars that have finished (start + length ≤ now).
export function completedBars(bars: Bar[], mins: number, now = Date.now()) { return bars.filter((b) => b.t + mins * 60e3 <= now); }
export const watchTol = (level: number) => Math.max(level * 0.00035, 0.02);

/** The trigger on the LAST completed bar, if any. earliestMin = ET minute a trigger bar must close at or after. */
export function evalLevel(level: number, d: "up" | "down", bars: Bar[], mins: number, o: { now?: number; earliestMin?: number; maxAgeMs?: number } = {}) {
  const now = o.now ?? Date.now();
  const done = completedBars(bars, mins, now);
  if (done.length < 2) return null;
  const b = done[done.length - 1], p = done[done.length - 2];
  const closeAt = b.t + mins * 60e3;
  if (now - closeAt > (o.maxAgeMs ?? (mins + 2) * 60e3)) return null;          // stale: a missed minute must not fire late
  if (etParts(new Date(closeAt)).min < (o.earliestMin ?? 600)) return null;
  const tol = watchTol(level);
  // A pullback / rejection needs price to have moved AWAY from the level first (≥ 3× tolerance since it last
  // crossed), so the bar right after a break doesn't count as a "retest".
  const prior = done.slice(0, -1);
  const awayFrom = (side: 1 | -1) => {
    let k = prior.length - 1; while (k >= 0 && side * (prior[k].c - level) > 0) k--;
    const run = prior.slice(k + 1);
    return run.length > 0 && Math.max(...run.map((x) => side * (x.c - level))) >= 3 * tol;
  };
  let trigger: string | null = null;
  if (d === "up") {
    if (p.c <= level && b.c > level) trigger = "break";
    else if (p.c > level && b.l <= level + tol && b.c > level && b.c > b.o && awayFrom(1)) trigger = "pullback-hold";
  } else {
    if (p.c >= level && b.c < level) trigger = "break";
    else if (p.c < level && b.h >= level - tol && b.c < level && b.c < b.o && awayFrom(-1)) trigger = "rejection";
  }
  return trigger ? { trigger, d, tf: mins, bar: b, prev: p, close_at: new Date(closeAt).toISOString() } : null;
}
// How many times today's 5-minute closes crossed the level — Jarvis is told when a level is chop.
export function crossings(level: number, bars: Bar[]) {
  let n = 0; for (let i = 1; i < bars.length; i++) if ((bars[i - 1].c - level) * (bars[i].c - level) < 0) n++; return n;
}

/* ------------------------------------------------------------ levels in */
async function watchRows(day = marketClock().date, statuses = "watching,proposed") {
  return await db(`otto_watch?select=*&day=eq.${day}&status=in.(${statuses})&order=created_at.asc&limit=200`).catch(() => []);
}
export async function watchAdd(x: { ticker: string; level: number; dir?: string; source: "signal" | "desk" | "scanner"; note?: string; source_ref?: string; by?: string; status?: string }) {
  const ticker = String(x.ticker || "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8);
  const level = Math.round(Number(x.level) * 100) / 100;
  if (!ticker || !(level > 0)) throw new Error("need a ticker and a price level");
  const dir = ["up", "down", "both"].includes(String(x.dir)) ? String(x.dir) : "both";
  const row = { day: watchDay(), ticker, level, dir, source: x.source, status: x.status || (x.source === "scanner" ? "proposed" : "watching"),
    note: String(x.note || "").slice(0, 200) || null, source_ref: x.source_ref || null, added_by: String(x.by || "").slice(0, 60) || null };
  const r = await db("otto_watch?on_conflict=day,ticker,level,dir&select=*", { method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([row]) });
  return r?.[0] || null;
}
// "SPY ABOVE 778.60 / SUPPORT 776 AND 775 / NVDA BELOW 240 PUTS" → levels with a side.
export function levelsFromWords(words: string, fallbackDir = "both"): { level: number; dir: string }[] {
  const out: { level: number; dir: string }[] = [];
  const W = String(words || "").toUpperCase().replace(/,/g, "");
  const re = /\b(ABOVE|OVER|BREAKS? ABOVE|RECLAIMS?|BELOW|UNDER|LOSES?|BREAKS? BELOW|SUPPORTS?|SUP|RESISTANCE|RES|LEVEL|AT)\s*(?:IS|OF|AT|=)?\s*\$?(\d{1,5}(?:\.\d{1,2})?)((?:\s*(?:AND|&|\/|,)\s*\$?\d{1,5}(?:\.\d{1,2})?)*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(W))) {
    const k = m[1];
    const dir = /ABOVE|OVER|RECLAIM/.test(k) ? "up" : /BELOW|UNDER|LOSE/.test(k) ? "down" : /SUP/.test(k) ? "up" : /RES/.test(k) ? "down" : fallbackDir;
    for (const n of [m[2], ...((m[3] || "").match(/\d{1,5}(?:\.\d{1,2})?/g) || [])]) {
      const v = Number(n); if (v > 0 && !out.some((o) => o.level === v && o.dir === dir)) out.push({ level: v, dir });
    }
  }
  return out;
}
// v3.14: every Signal post with a ticker and a price level goes on today's watch list (Ifoma, 6 Oct).
async function watchFromSignals(rows: any[]) {
  let n = 0;
  const c = marketClock();
  if (c.status === "after" || c.status === "closed") return 0;      // the 5 PM sweep must not seed tomorrow
  rows = (rows || []).filter((r: any) => !r?.day || r.day === c.date);
  for (const r of rows || []) {
    if (!r?.ticker || r.kind === "note" || r.kind === "result") continue;   // v3.16: LATE calls too — the pullback to his level is the second chance
    const fb = r.direction === "long" ? "up" : r.direction === "short" ? "down" : "both";
    const lv = levelsFromWords(String(r.words || ""), fb);
    if (!lv.length && Number(r.level) > 0) lv.push({ level: Number(r.level), dir: fb });
    for (const x of lv.slice(0, 4)) {
      try { if (await watchAdd({ ticker: r.ticker, level: x.level, dir: x.dir, source: "signal", note: String(r.summary || r.words || "").slice(0, 160), source_ref: String(r.id ?? ""), by: SIG_LABEL })) n++; }
      catch { /* a bad number never breaks Signals */ }
    }
  }
  return n;
}
const WATCH_TOOL = {
  name: "add_watch_level",
  description: "Put a price level on the Watcher's list for today. The server checks it every minute on 5- and 10-minute closes and wakes you with the trigger (break-and-close, pullback-and-hold, rejection) so you can build the card. Use when Ifoma or Josh ask you to watch a level, or when you want a level watched. Never say you're watching something you didn't add here.",
  input_schema: { type: "object", properties: {
    ticker: { type: "string" }, level: { type: "number" },
    dir: { type: "string", enum: ["up", "down", "both"], description: "up = calls side (break above / hold above), down = puts side (break below / rejection), both" },
    note: { type: "string", description: "one short line: why this level" } }, required: ["ticker", "level", "dir"] },
};

/* ------------------------------------------------------------ the minute tick */
export async function watchTick(now = Date.now()) {
  const c = marketClock(new Date(now));
  if (c.status !== "open") return { ok: true, skipped: c.status };
  const rows = (await watchRows(c.date, "watching")) as any[];
  if (!rows.length) return { ok: true, levels: 0 };
  const start = nyIso(c.date, "9:30 AM") || new Date(now - 7 * 3600e3).toISOString();
  const tickers = [...new Set(rows.map((r) => r.ticker))];
  const [b5, b10] = await Promise.all([rhBars(tickers, "5minute", start), rhBars(tickers, "10minute", start).catch(() => ({} as Record<string, Bar[]>))]);
  const hits: any[] = [];
  for (const r of rows) {
    const bars5 = b5[r.ticker] || [];
    const last = bars5[bars5.length - 1];
    const dirs: ("up" | "down")[] = r.dir === "both" ? ["up", "down"] : [r.dir];
    // House Rule: a Signal level posted before the open may trade the open; everything else waits for 10:00.
    const earliest = r.source === "signal" ? 575 : 600;
    for (const d of dirs) {
      const prev = r.fired?.[d];
      // One CARD per level per side per day. A fire Jarvis passed on (no card) re-arms after 15 minutes.
      if (prev && (prev.cards?.length || !prev.read || now - Date.parse(prev.at) < 15 * 60e3)) continue;
      const hit = evalLevel(Number(r.level), d, bars5, 5, { now, earliestMin: earliest }) ||
        evalLevel(Number(r.level), d, b10[r.ticker] || [], 10, { now, earliestMin: earliest });
      if (!hit) continue;
      const fire = { at: new Date(now).toISOString(), trigger: hit.trigger, tf: hit.tf, bar: hit.bar, close_at: hit.close_at,
        crossings: crossings(Number(r.level), completedBars(bars5, 5, now)) };
      // Claim it atomically: only one run can set fired.<d>.
      const cond = prev ? `fired->${d}->>at=eq.${encodeURIComponent(prev.at)}` : `fired->>${d}=is.null`;
      const claimed = await db(`otto_watch?id=eq.${r.id}&${cond}&select=*`, { method: "PATCH",
        body: JSON.stringify({ fired: { ...(r.fired || {}), [d]: { ...fire, ...(prev ? { passed: [...(prev.passed || []), { at: prev.at, trigger: prev.trigger }] } : {}) } } }) }).catch(() => []);
      if (!claimed?.length) continue;
      r.fired = claimed[0].fired;
      hits.push({ r, d, fire });
    }
    if (last) await db("otto_watch?id=eq." + r.id, { method: "PATCH", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ last: { price: last.c, at: new Date(last.t + 5 * 60e3).toISOString(), dist: +(last.c - Number(r.level)).toFixed(2) } }) }).catch(() => {});
  }
  for (const h of hits) {
    const b = h.fire.bar, side = h.d === "up" ? "calls side ▲" : "puts side ▼";
    await logDesk("assistant", "👁 Watcher", `${h.r.ticker} ${Number(h.r.level)} — ${TRIG_LABEL[h.fire.trigger]} (${side}) on the ${h.fire.tf}-minute bar that closed at ${etLabel(h.fire.close_at)} ET: ` +
      `O ${b.o.toFixed(2)} H ${b.h.toFixed(2)} L ${b.l.toFixed(2)} C ${b.c.toFixed(2)}.` +
      (h.fire.crossings >= 4 ? ` ⚠ It has crossed this level ${h.fire.crossings} times today (chop).` : "") + " Asking Jarvis for a card…");
    if (!(await kick("watch_jarvis", { id: h.r.id, d: h.d }))) background(watchJarvis(h.r.id, h.d));
  }
  return { ok: true, levels: rows.length, hits: hits.map((h) => `${h.r.ticker} ${h.r.level} ${h.d} ${h.fire.trigger}`) };
}

const SETUP_FOR: Record<string, string> = { "break|up": "breakout", "break|down": "breakdown", "pullback-hold|up": "support bounce", "rejection|down": "rejection at resistance" };
export async function watchJarvis(id: number, d: "up" | "down") {
  const r = (await db(`otto_watch?select=*&id=eq.${id}`))?.[0];
  const f = r?.fired?.[d];
  if (!r || !f || f.read) return { ok: true, skipped: true };
  const { cs, sys, tools, ctxLine } = await deskSetup();
  const runTools = tools.filter((t: any) => t.name !== "close_position" && !/^tv__/.test(String(t.name || "")));
  const b = f.bar;
  // v3.20: the server fetches the contracts first, so Jarvis doesn't spend his steps paging the chain.
  const pre = await withTimeout(shortlistCached(r.ticker, d === "up" ? "call" : "put"), 25_000, "shortlist")
    .then((x) => x.text, (e) => `(${r.ticker} contracts couldn't be pre-fetched: ${String((e as Error).message).slice(0, 100)} — call option_shortlist.)`);
  const prompt = `${ctxLine}
${pre}
[👁 WATCHER TRIGGER — no one typed this; Ifoma and Josh are away from the screen.]
${r.ticker} level ${Number(r.level)} (${r.source === "signal" ? "a Signal level" : r.source === "scanner" ? "a level the scanner found" : "a level added on the Desk"}${r.note ? ": " + r.note : ""}).
Trigger: ${TRIG_LABEL[f.trigger]} on the ${d === "up" ? "calls" : "puts"} side, on the ${f.tf}-minute bar that closed at ${etLabel(f.close_at)} ET — O ${b.o} H ${b.h} L ${b.l} C ${b.c}.${f.crossings >= 4 ? ` The 5-minute closes have crossed this level ${f.crossings} times today: treat it as chop unless the read is clear.` : ""}
Is this a real ${d === "up" ? "call" : "put"} setup RIGHT NOW under the Otto Rules and the House Rules? The contract list above is live (server-fetched); check the banner and any binary event.
- Real → call propose_action ONCE: one opening option card. Title starts with "SCALP · " when it's a quick trade. plan.setup "${SETUP_FOR[f.trigger + "|" + d] || "other"}", plan.direction "${d}", plan.signal_level ${r.source === "signal"}, TP1 at the next level, plan.stop (wrong-if) just beyond ${Number(r.level)}, stop_option sized for their max loss. If the best contract is over buying power or the max, make the cheaper ALT too, as usual. Guardrails flag, never block.
- Not real → no card.
Work quietly. Finish with a line that is exactly READ: and then 2 short plain sentences: what happened at the level and why you made the card — or why not.
(Robinhood tools only in this run.)`;
  let res = { said: "", cards: [] as string[] }, err = "";
  try {
    res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: runTools, cs, who: "watcher", send: () => {},
      allowPropose: true, allowClose: false, maxRounds: 8, planExtra: { source: r.source === "signal" ? "signal" : r.source, trigger: f.trigger, watch_id: r.id } });
  } catch (e) { err = String((e as Error).message || e).slice(0, 200); }
  const raw = res.said.trim(), cut = raw.lastIndexOf("READ:");
  const read = (cut >= 0 ? raw.slice(cut + 5) : raw).trim();
  const acts = res.cards.length ? await db("otto_actions?select=id,title&id=in.(" + res.cards.join(",") + ")").catch(() => []) : [];
  await db("otto_watch?id=eq." + r.id, { method: "PATCH", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ fired: { ...(r.fired || {}), [d]: { ...f, read: read || err || "no read", cards: res.cards, error: err || null } } }) }).catch(() => {});
  await logDesk("assistant", "Jarvis · watcher", `For: 👁 ${r.ticker} ${Number(r.level)} ${d === "up" ? "▲" : "▼"} ${TRIG_LABEL[f.trigger]}\n` +
    (err ? `No card — Jarvis hit an error checking it: ${err}` : (read || (acts.length ? "Card's up." : "No setup — no card."))), acts[0]?.id || null);
  if (acts.length) {
    await markPinged(acts.map((a: any) => a.id));
    await notify("card", `🃏 ${r.ticker} card ready — ${TRIG_LABEL[f.trigger]} at ${Number(r.level)}`,
      `${String(acts[0].title || "").slice(0, 90)}. Tap to Approve or Reject (expires in 20 min).`, "./#desk");
  }
  return { ok: true, cards: acts.length };
}

/* ------------------------------------------------------------ 9:20 scanner (SPY, QQQ, Mag-7) */
export async function watchScan(by = "scanner 9:20") {
  const { cs, sys, tools, ctxLine } = await deskSetup();
  const runTools = [...tools.filter((t: any) => t.name !== "close_position" && t.name !== "propose_action" && !/^tv__/.test(String(t.name || ""))), WATCH_TOOL];
  const prompt = `${ctxLine}
[🔎 Scanner — no one typed this.] Look at ${WATCH_SCAN.join(", ")}: yesterday's high/low/close, today's pre-market or intraday price (Robinhood quotes and 5-minute / daily bars), and the Otto Rules levels from the calls. Pick the 2–4 price levels most worth watching TODAY — a level price is likely to test, where a break, a pullback-hold or a rejection would be a real setup. For each, call add_watch_level once (dir up, down or both; note = one short reason). Skip levels already very far from price (over ~1.5%). No cards. Finish with one line: READ: which levels and why, in one sentence.
(Robinhood tools only.)`;
  const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: runTools, cs, who: "scanner", send: () => {},
    allowPropose: false, allowClose: false, maxRounds: 8 });
  const raw = res.said.trim(), cut = raw.lastIndexOf("READ:");
  const read = (cut >= 0 ? raw.slice(cut + 5) : raw).trim();
  const props = (await watchRows(watchDay(), "proposed")).filter((r: any) => r.source === "scanner");
  await logDesk("assistant", "Jarvis · scanner", `🔎 ${props.length ? `${props.length} level${props.length === 1 ? "" : "s"} proposed for the Watcher (tap Add in the 👁 Watcher panel): ` +
    props.map((r: any) => `${r.ticker} ${Number(r.level)}${r.dir === "up" ? " ▲" : r.dir === "down" ? " ▼" : " ▲▼"}`).join(", ") + "." : "No levels worth watching right now."}${read ? "\n" + read : ""}`);
  await putSetting("watch_scan_day", { day: marketClock().date, by }).catch(() => {});
  return { ok: true, proposed: props.length };
}

/* ------------------------------------------------------------ panel + edits */
export async function watchGet() {
  const day = watchDay();
  const rows = await db(`otto_watch?select=*&day=eq.${day}&status=neq.removed&order=created_at.asc&limit=200`).catch(() => []);
  // v3.18: pending ⏰ check-ins show as chips under the levels
  const checks = await db(`otto_checks?select=id,due_at,what,by&status=eq.pending&day=eq.${etParts().date}&order=due_at.asc&limit=10`).catch(() => []);
  const plans = await plansToday().catch(() => []);   // v3.19: pinned on the Desk
  return { ok: true, day, clock: marketClock().status, rows, plans, checks: (checks || []).map((c: any) => ({ ...c, label: fmtMin(etParts(new Date(c.due_at)).min) })) };
}
async function watchSet(b: any, who: string) {
  const by = String(b?.author || who.split("@")[0]).slice(0, 40);
  if (b?.add) {
    const r = await watchAdd({ ticker: b.add.ticker, level: b.add.level, dir: b.add.dir, source: "desk", note: b.add.note, by });
    if (r) await logDesk("system", "Otto", `👁 ${by} added ${r.ticker} ${Number(r.level)} ${r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "▲▼"} to the Watcher.`);
    return { ok: true, row: r };
  }
  const id = Number(b?.id);
  if (!id || !["watching", "removed"].includes(String(b?.status))) throw new Error("need id and status watching|removed");
  const r = (await db(`otto_watch?id=eq.${id}&select=*`, { method: "PATCH", body: JSON.stringify({ status: b.status }) }))?.[0];
  if (r && b.status === "watching") await logDesk("system", "Otto", `👁 ${by} added the scanner's ${r.ticker} ${Number(r.level)} to the Watcher.`);
  return { ok: true, row: r || null };
}

/* ------------------------------------------------------------ Scoreboard (Phase 2) on Robinhood bars
   Every opening card is graded on the underlying from the moment it was made: TP1 touched (win) before a
   close through the wrong-if on the card's own bar (5-min from v3.21, 15-min before) (loss); neither by 3:55 PM ET the same day = flat ("scratch",
   intraday-only House Rule). Dollars are an estimate for 1 contract (move × delta × 100, capped at the
   premium) — real P&L replaces it for cards that were taken. */
export function gradeIdea(o: { created: number; direction: "up" | "down"; tp1: number; wrong: number; entry?: number | null; delta?: number | null; premium?: number | null; tf?: number }, bars5: Bar[], now = Date.now()) {
  const tf = o.tf === 5 ? 5 : 15;               // v3.21: each card is graded on its own wrong-if bar (5-min from v3.21, 15 before)
  const day = etParts(new Date(o.created)).date;
  const endAt = Date.parse(nyIso(day, "3:55 PM") || "") || o.created + 6 * 3600e3;
  const after = bars5.filter((b) => b.t + 5 * 60e3 > o.created && b.t < endAt && b.t + 5 * 60e3 <= now);
  if (!after.length) return { state: now > endAt + 10 * 60e3 ? "unscored" : "open" };
  const entry = Number(o.entry) || after[0].o, up = o.direction === "up";
  const risk = Math.abs(entry - o.wrong) || null;
  const est = (exit: number) => {
    const move = (up ? exit - entry : entry - exit), dl = Math.abs(Number(o.delta) || 0.5);
    let v = move * dl * 100; if (o.premium) v = Math.max(v, -o.premium * 100);
    return Math.round(v);
  };
  const q: Bar[] = [];                         // 5-minute bars of the current 15-minute bucket
  for (const b of after) {
    if (up ? b.h >= o.tp1 : b.l <= o.tp1) return { state: "win", at: b.t, r: risk ? +(Math.abs(o.tp1 - entry) / risk).toFixed(2) : null, pnl_est: est(o.tp1), entry };
    q.push(b);
    const endsBucket = new Date(b.t + 5 * 60e3).getUTCMinutes() % tf === 0;
    if (endsBucket) {
      const close15 = q[q.length - 1].c; q.length = 0;
      if (up ? close15 < o.wrong : close15 > o.wrong) return { state: "loss", at: b.t, r: -1, pnl_est: est(close15), entry };
    }
  }
  if (now >= endAt) { const last = after[after.length - 1].c; return { state: "scratch", at: after[after.length - 1].t, r: risk ? +(((up ? last - entry : entry - last) / risk)).toFixed(2) : null, pnl_est: est(last), entry }; }
  return { state: "open" };
}

function srcOf(a: any) {
  const p = a.plan || {};
  if (p.source) return p.source;
  const w = String(a.created_by || "");
  return w === "signals" ? "signal" : w === "alert" ? "alert" : w === "watcher" ? "watcher" : /@/.test(w) ? "desk" : w || "desk";
}
async function proofStart(): Promise<string> {
  const v = await setting("proof_start").catch(() => null);
  if (v?.day) return v.day;
  const day = isTradingDay(marketClock().date) ? marketClock().date : nextTradingDay(marketClock().date);
  await putSetting("proof_start", { day }, "otto").catch(() => {});
  return day;
}
function tradingDaysBetween(a: string, b: string) { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isTradingDay(d)) n++; return n; }

/* ------------------------------------------------------------ Help chat
   App questions only, kept off the Desk. No tools, no account access. */
const HELP_SYS = `You are Otto Help, the in-app guide for Otto Trader. You answer questions about HOW THE APP WORKS — what a screen shows, what a button does, how to change a setting, what a term on the screen means. You do not give trading advice or market opinions: if someone asks whether to take a trade, what a stock will do, or anything about live prices or their positions, say in one line that that's a question for Jarvis on the Desk, and stop. Be short and concrete: name the exact screen and button. If you don't know or the app doesn't do something, say so plainly — never invent a feature.

THE APP (Otto Trader, desktop-first; phones get a stacked layout)
- Left rail: Desk, Market, Results, Journal, Review, Score, Calls, Classic (the older phone-style screens), Help, Settings.
- The Desk is locked to the Otto login (one shared login for Ifoma and Josh; they're one team). "At the desk" picker labels who is typing.
- Jarvis = the AI on the Desk. Built on Jason Murray's method (his recorded calls), plus live TradingView data and Robinhood. One shared conversation on every laptop.
- Sentiment banner (top of every Desk screen): Josh's Intermarket Sentiment Cheat Sheet on live TradingView data — 10Y yield, DXY, USD/JPY, crude, ES/NQ/YM futures. Verdicts: Leaning long / Mildly long — small size / No edge / Choppy — stand aside / Mildly short / Leaning short / No read. Chips show which rows of Josh's sheet fired. "Why this verdict?" explains. Refreshes every 5 minutes in market hours. It's Josh's sheet, not Jason's; it never sizes trades. The flag line shows where Josh's sheet and Jason disagree (Jason: don't trade the first 30 minutes).
- Cards: anything that would change something (an order, a cancel, an alert, a watchlist edit) appears as a card with Approve / Reject. Nothing runs until someone clicks Approve and confirms "Place this with real money?". Cards expire after 20 minutes (prices move) — ask again for a fresh one. A card shows: the ticket, max cost and % of the account, Robinhood's own pre-check ("review"), the rule check, and limit checks.
- Rule check: first 30 minutes, delta 0.30–0.40, volume > open interest, % of account vs the warn line, expiry (no this-Friday after Wednesday, no 0DTE), binary events (CPI/NFP/Fed etc.) before expiry, earnings before expiry, and whether it agrees with the banner. ✓ pass, ! flag, ? couldn't check. Flags are warnings; you can still approve.
- Limit checks: most the trade can lose vs "max loss per trade", this week's P&L vs the weekly loss limit, and trade count vs trades per day. Change them in Settings → Limits & goals. Warnings only.
- Order ticket (button next to "+ Chart" on the Desk): Buy to open / Sell to close, ticker, call/put, expiry, strike, contracts, limit price (per share — $2.10 means $210 per contract), setup, optional TP1 and "wrong if" price. It does NOT place the order; it makes a card. After Approve it is sent as a limit order good for the day: it fills only if price reaches the limit, otherwise it expires at the close. Robinhood may also ask for a confirm in its own app.
- Robinhood: two accounts. Individual (read-only to Otto: positions, history, P&L). Agentic (the only one Otto can trade in, only after Approve). Otto can't move or withdraw money. Options level 2: long calls/puts, covered calls, cash-secured puts; no spreads.
- TradingView alerts: during market hours Otto checks the alert log every 2 minutes; a fired alert posts to the Desk with a short read from Jarvis (in-app, not a phone push). Jarvis can't draw on TradingView charts.
- Calls page: every processed call with Jason (homework, rules, setups, insights, levels, glossary, questions for the next call). "TradingView levels" card → Copy script → TradingView Pine Editor → paste over everything → Save → Add to chart. Draws the last ~5 weeks of call levels on the ticker you're viewing (newest call orange, older gray). Re-copy after each call. Levels are dated marks, not live prices.
- Log a call (Review page): pick the call's transcript file (.vtt from Zoom); it's read into the brain and Jarvis proposes alerts for the new levels as a card.
- Market page: Josh's 8 rows live, Jason's six-step routine, Mag 7, what's moving, plan of attack, economic calendar, watchlist earnings.
- Results page: combined P&L for both accounts (Robinhood's realized numbers), account values, weekly bars with the weekly-limit line, Phase goals (weekly loss, biggest single loss this week, trades today, weeks in a row without a big week), big-loss days, how we trade (winning/losing days, calls vs puts, best/worst ticker), rules vs results, and a short read from Jarvis. Options today; stocks and futures will slot in later.
- Limits & goals (Settings): phase (1 stop the big losses / 2 prove the edge / 3 scale), max loss per trade ($), weekly loss limit ($), max trades per day, monthly goal (%), warn when a trade is over X% of the account, and what counts as a big-loss day ($). Starting values: $100, $150, 2, 5%, 20%, $500. Anyone on the Otto login can change them; the change is posted on the Desk.
- Journal: fills from both Robinhood accounts (last 120 days), round trips matched automatically; each trade asks for one line on why (Jason's rule). Desk card trades link to their ticket and rule check.
- Review: builds itself Friday after the close — biggest wins/losses, rules followed/broken, the pattern, one thing for next week. "Build this week now" runs it any time. "For Jason" packet drafts what to send him before the next call.
- Score: every opening card is tracked, taken or not, and graded on the underlying: did price reach TP1 before the "wrong if" price (5-minute bars; if one bar touches both it counts as a loss). R = result measured in units of the planned risk (+2R = made twice what you risked). Passed ideas are hypothetical.
- 8:45 morning read: every weekday at 8:45 ET Jarvis posts a read on the Desk automatically.
- Settings: sign in with the Otto email (6-digit code or paste the sign-in link), connect/disconnect TradingView and Robinhood (Robinhood: paste the "This site can't be reached" localhost address back into Otto once), Limits & goals, the older bias thresholds.
- "the call" = the coaching call with Jason; the day changes week to week. The 👁 Watcher card (Desk, left column) lists today's price levels; the server checks them every minute 9:30–4:00 ET on 5- and 10-minute closes for a break-and-close, a pullback-and-hold or a rejection, and Jarvis builds a card (one ping) when it's a real setup. Signal levels are added automatically; add your own by typing 'NVDA 242 up' in the card or telling Jarvis 'watch NVDA 242'; the 9:20 scanner proposes levels on SPY, QQQ and the Mag-7 that you tap Add on. Levels clear at the close. The Score tab is the 2-week proof run: every card graded win / loss / flat on the same day, by source and trigger. House Rules (Settings) are standing instructions Jarvis follows; guardrails (Settings → Limits) flag with a red banner and never block.`;

/* ===================================================================== v3.15
   7 Oct 2026 — Ifoma's decisions (mockup otto-v3.15-mockup-b.html, "ok go"):
   - PLAYBOOK, no approvals: book rules (Tharp: sizing/stops/expectancy; Douglas:
     discipline; McMillan: options) written in our own words, always loaded into
     every Jarvis run next to the House Rules (House Rules win any clash). Coaching
     calls keep flowing in as before. Cards cite the book rules they lean on
     (plan.rules), so every rule builds its own record.
   - The coaching material leads until a setup / rule has 20 graded trades; after
     that a losing one (average R below 0) is marked WEAK and Jarvis leans on it less.
   - 5:15 PM DAILY RECAP on the Desk + one ping (pg_cron otto-daily-*, 015).
   - FEEDBACK button: notes with screen / build / recent errors (otto_feedback, 015),
     read by the daily recap and (optionally) the nightly bug check. */

export const PLAYBOOK_BOOKS: { id: string; book: string; topic: string; text: string; why: string }[] = [
  { id: "T-1", book: "Tharp", topic: "Sizing & risk", text: "Before entering, decide the price that proves the idea wrong. The distance from entry to that point is 1R, the trade's unit of risk.", why: "Every result can then be measured in R, so setups at different prices can be compared." },
  { id: "T-2", book: "Tharp", topic: "Sizing & risk", text: "Size the trade so a 1R loss stays inside the max loss per trade. If one contract is too much, pick a cheaper contract or pass.", why: "Position size, not the entry, decides whether a bad streak hurts or wipes you out." },
  { id: "T-3", book: "Tharp", topic: "Measuring", text: "Judge a setup by its average R per trade (expectancy), not by its win rate.", why: "A 40% win rate pays if winners run 2R+ and losers stay at 1R." },
  { id: "T-4", book: "Tharp", topic: "Exits", text: "Know the reward in R before entering. A first target under 1R needs a very high win rate to pay.", why: "Small targets with full-size risk quietly lose money even when most trades win." },
  { id: "T-5", book: "Tharp", topic: "Measuring", text: "Don't change or drop a setup after a few trades. Judge it on 20 or more.", why: "Small samples are mostly noise." },
  { id: "T-6", book: "Tharp", topic: "Sizing & risk", text: "Never size up to win back a loss. Size follows the account and the rules, not recent results.", why: "Bigger size after losses turns a normal losing streak into a big one." },
  { id: "D-1", book: "Douglas", topic: "Discipline", text: "Accept the loss at the stop before the trade is approved.", why: "Risk accepted up front leaves nothing to defend when price moves against you." },
  { id: "D-2", book: "Douglas", topic: "Discipline", text: "Each trade is one of the next 20. One result doesn't prove or disprove the setup.", why: "Wins and losses arrive in random order even with a real edge." },
  { id: "D-3", book: "Douglas", topic: "Discipline", text: "Anything can happen on any one trade. Once in, follow the plan, not hope or fear.", why: "Mid-trade changes are where most avoidable losses come from." },
  { id: "D-4", book: "Douglas", topic: "Discipline", text: "After the daily stop is hit, flag any new trade that day, even an A setup.", why: "Trying to win the day back is how one bad day becomes a bad week." },
  { id: "D-5", book: "Douglas", topic: "Discipline", text: "Never take a trade to make back a loss. Every setup has to stand on its own.", why: "Revenge trades skip the checks that make a setup worth taking." },
  { id: "M-1", book: "McMillan", topic: "Contracts", text: "Avoid buying options right before a known event (earnings, CPI, the Fed) unless the event is the trade.", why: "Implied volatility usually drops after the event and takes premium with it." },
  { id: "M-2", book: "McMillan", topic: "Contracts", text: "For intraday buys, prefer at least 2 trading days to expiry.", why: "Time decay is steepest in the last day; a small stall costs a lot." },
  { id: "M-3", book: "McMillan", topic: "Contracts", text: "Check the bid-ask spread. If it is more than about 10% of the option price, choose a more liquid strike or pass.", why: "A wide spread is a loss paid on entry and again on exit." },
  { id: "M-4", book: "McMillan", topic: "Contracts", text: "Enter options with limit orders, never market orders.", why: "Option quotes move fast and market orders fill at the worst price on the screen." },
  { id: "M-5", book: "McMillan", topic: "Contracts", text: "When implied volatility is high for that name, options are expensive: favor closer strikes or skip.", why: "High IV means you pay extra for the same move." },
  { id: "M-6", book: "McMillan", topic: "Exits", text: "Know the move the underlying needs to reach TP1 and whether the option's delta makes that worth the premium.", why: "A move that is too small for the premium is a loss even when the direction is right." },
];
const BOOK_IDS = new Set(PLAYBOOK_BOOKS.map((r) => r.id));
const BOOK_NAME: Record<string, string> = { Tharp: "Van Tharp", Douglas: "Mark Douglas", McMillan: "Lawrence McMillan" };
export const WEAK_MIN = 20;

export function cleanRules(x: unknown): string[] {
  const a = Array.isArray(x) ? x : typeof x === "string" ? x.split(/[,\s]+/) : [];
  return [...new Set(a.map((v) => String(v || "").trim().toUpperCase()).filter((v) => BOOK_IDS.has(v)))].slice(0, 6);
}

const isOpening = (a: any) => (a.calls || []).some((c: any) => c.tool === "place_option_order" &&
  (c.args?.legs || []).some((l: any) => l.position_effect === "open"));
const GRADED = ["win", "loss", "scratch"];

// Pure: records per book rule, per setup and per Watcher trigger, plus the WEAK list.
export function playbookStats(ideas: any[]) {
  const rec: Record<string, { n: number; scored: number; wins: number; losses: number; scratch: number; sumR: number }> = {};
  const add = (k: string, a: any) => {
    const r = (rec[k] ||= { n: 0, scored: 0, wins: 0, losses: 0, scratch: 0, sumR: 0 });
    r.n++;
    const st = a.outcome?.state;
    if (GRADED.includes(st)) {
      r.scored++; r.sumR += Number(a.outcome.r || 0);
      if (st === "win") r.wins++; else if (st === "loss") r.losses++; else r.scratch++;
    }
  };
  for (const a of ideas) {
    for (const id of cleanRules(a.plan?.rules)) add(id, a);
    if (a.plan?.setup) add("setup:" + String(a.plan.setup).toLowerCase(), a);
    if (a.plan?.trigger) add("trigger:" + String(a.plan.trigger), a);
  }
  const out: Record<string, any> = {};
  const weak: { key: string; label: string; scored: number; avg_r: number }[] = [];
  for (const [k, r] of Object.entries(rec)) {
    const avg_r = r.scored ? r.sumR / r.scored : null;
    const isWeak = r.scored >= WEAK_MIN && avg_r !== null && avg_r < 0;
    out[k] = { n: r.n, scored: r.scored, wins: r.wins, losses: r.losses, scratch: r.scratch, avg_r, weak: isWeak, leads: r.scored >= WEAK_MIN ? "results" : "material" };
    if (isWeak) weak.push({ key: k, label: playbookLabel(k), scored: r.scored, avg_r: Math.round((avg_r as number) * 100) / 100 });
  }
  return { records: out, weak };
}
function playbookLabel(k: string) {
  if (k.startsWith("setup:")) return "Setup: " + k.slice(6);
  if (k.startsWith("trigger:")) return "Watcher trigger: " + (TRIG_LABEL[k.slice(8)] || k.slice(8));
  const b = PLAYBOOK_BOOKS.find((r) => r.id === k);
  return b ? `${k} ${b.text}` : k;
}

async function playbookIdeas() {
  const acts = await db("otto_actions?select=id,created_at,status,calls,plan,outcome&order=created_at.desc&limit=600");
  return (acts || []).filter(isOpening);
}

export async function playbookRefresh(reason = "refresh") {
  const st = playbookStats(await playbookIdeas());
  const prev = (await setting("playbook_stats")) || {};
  const before = new Set((prev.weak || []).map((w: any) => w.key));
  const after = new Set(st.weak.map((w) => w.key));
  const log: any[] = ((await setting("playbook_log")) || {}).items || [];
  const at = new Date().toISOString();
  for (const w of st.weak) if (!before.has(w.key)) log.unshift({ at, kind: "weak", text: `Marked weak after ${w.scored} graded trades (avg ${w.avg_r >= 0 ? "+" : ""}${w.avg_r}R): ${w.label}`, reason });
  for (const k of before) if (!after.has(k as string)) log.unshift({ at, kind: "unweak", text: `No longer weak: ${playbookLabel(k as string)}`, reason });
  if (!log.some((x) => x.kind === "books")) log.push({ at, kind: "books", text: `${PLAYBOOK_BOOKS.length} book rules loaded: Tharp ${PLAYBOOK_BOOKS.filter((r) => r.book === "Tharp").length}, Douglas ${PLAYBOOK_BOOKS.filter((r) => r.book === "Douglas").length}, McMillan ${PLAYBOOK_BOOKS.filter((r) => r.book === "McMillan").length}.` });
  await putSetting("playbook_stats", { ...st, at }, "otto");
  await putSetting("playbook_log", { items: log.slice(0, 60) }, "otto");
  delete CACHE.playbook_text;
  return st;
}

export async function playbookText(): Promise<string> {
  return cached("playbook_text", 5 * 60e3, async () => {
    const st = (await setting("playbook_stats").catch(() => null)) || { weak: [] };
    const lines = PLAYBOOK_BOOKS.map((r) => `${r.id} [${r.book}] ${r.text}`);
    const weak = (st.weak || []) as any[];
    return "OTTO PLAYBOOK — book rules (always in force, below the House Rules and the Otto Rules from the calls; " +
      "when they clash: House Rules first, then the call material until a setup has 20 graded trades, then whatever the results say). " +
      "On every opening card, list the ids you relied on in plan.rules (e.g. [\"T-1\",\"T-2\",\"M-2\"]).\n" + lines.join("\n") +
      (weak.length ? "\n\nRESULTS SAY WEAK (20+ graded trades, average R below 0) — lean on these less, and if a card still uses one, say so in its summary:\n" +
        weak.map((w) => `- ${w.label} (${w.scored} trades, ${w.avg_r}R avg)`).join("\n") : "");
  });
}

async function playbookGet() {
  let st = await setting("playbook_stats");
  if (!st || !st.at || Date.now() - Date.parse(st.at) > 60 * 60e3) st = await playbookRefresh("page open");
  let calls: any[] = [];
  try {
    calls = (await loadBrain()).map((c: any) => ({ date: c.call?.date || "", title: c.call?.title || "call",
      rules: (c.rules || []).map((r: any) => r.rule).filter(Boolean).slice(0, 40),
      setups: (c.setups || []).map((x: any) => ({ name: x.name, trigger: x.trigger || "" })).slice(0, 20) }));
  } catch { /* the page still shows the books */ }
  const log = ((await setting("playbook_log")) || {}).items || [];
  return { books: PLAYBOOK_BOOKS.map((r) => ({ ...r, author: BOOK_NAME[r.book] })), calls, stats: st, weak_min: WEAK_MIN, log: log.slice(0, 20) };
}

/* ---- feedback ---- */
async function feedbackAdd(body: any, who: string) {
  const kind = ["bug", "idea", "slow", "wrong"].includes(body?.kind) ? body.kind : "bug";
  const note = String(body?.note || "").trim().slice(0, 4000);
  if (note.length < 3) throw new Error("write a short note first");
  const row = { kind, note, author: String(body?.author || who.split("@")[0]).slice(0, 40), screen: String(body?.screen || "").slice(0, 60),
    build: String(body?.build || "").slice(0, 20), errors: Array.isArray(body?.errors) ? body.errors.slice(-5).map((e: any) => String(e).slice(0, 300)) : [],
    ua: String(body?.ua || "").slice(0, 200) };
  const r = await db("otto_feedback", { method: "POST", body: JSON.stringify(row) });
  return { id: r?.[0]?.id ?? null };
}
async function feedbackList(days = 14) {
  const since = new Date(Date.now() - Math.min(90, Math.max(1, days)) * 86400e3).toISOString();
  return await db("otto_feedback?select=id,created_at,kind,note,author,screen,build,errors&created_at=gte." + since + "&order=created_at.desc&limit=100");
}
async function feedbackDigest() {
  const items = await feedbackList(2);
  const errs = await db("otto_desk?select=created_at,author,content&created_at=gte." + new Date(Date.now() - 26 * 3600e3).toISOString() +
    "&content=like.*%E2%9A%A0*&order=id.desc&limit=30").catch(() => []);
  return { feedback: items, desk_warnings: (errs || []).map((r: any) => ({ at: r.created_at, author: r.author, text: String(r.content).slice(0, 300) })) };
}

/* ---- the 5:15 PM daily recap ---- */
const RECAP_SYS = `You are Jarvis on the Otto trading desk, writing the end-of-day recap for Ifoma and Josh. Plain words, numbers first, no hype, no lecturing, phone-sized. Use ONLY the data given; if something isn't in it, leave it out. Times are New York time.

FORMAT — markdown, exactly these headings, skip a heading only if it would be empty (except the first):
### Today in one line
### Trades and cards
(each trade: ticker/contract, entry → exit, result in $ and R if known, whether the plan was followed; then how many cards were made / approved / expired and why)
### What was discussed
(the 2–5 things that mattered in the Desk conversation — decisions, questions, rules saved)
### Worth fixing
(moments Otto or Jarvis got something wrong, was slow, repeated itself, or someone had to ask twice; plus the feedback notes left today)
### For tomorrow
(scheduled events from the calendar given, open positions, anything they said they'd do tomorrow)`;

async function claudeText(body: any, budgetMs = 90_000): Promise<string> {
  const r = await claudeFetch({ ...body, stream: true }, Date.now() + budgetMs);
  const reader = r.body!.getReader(), dec = new TextDecoder();
  let buf = "", out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try { const ev = JSON.parse(line.slice(6)); if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") out += ev.delta.text; } catch { /* */ }
    }
  }
  return out.trim();
}
const etHM = (iso: string) => { try { return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

export async function dailyRecap(force = false) {
  const c = marketClock();
  if (!force && !isTradingDay(c.date)) return { skipped: "not a trading day" };
  const done = await setting("daily_recap_day");
  if (!force && done?.day === c.date) return { skipped: "already done" };
  await putSetting("daily_recap_day", { day: c.date, at: new Date().toISOString() });
  const since = new Date(Date.now() - 14 * 3600e3).toISOString();
  const AL = "(" + ["TradingView", "Jarvis · alert read", "Jarvis · daily recap"].map((x) => '"' + x + '"').join(",") + ")";
  const rows = await db("otto_desk?select=created_at,role,author,content&created_at=gte." + since + "&author=not.in." + encodeURIComponent(AL) + "&order=id.asc&limit=300").catch(() => []);
  const acts = await db("otto_actions?select=title,status,created_by,created_at,plan,outcome,exit&created_at=gte." + since + "&order=created_at.asc&limit=60").catch(() => []);
  const trades = await db("otto_trades?select=*&order=closed_at.desc&limit=20").catch(() => []);
  const fb = await feedbackList(1).catch(() => []);
  let cal: any[] = [];
  try { const nx = nextTradingDay(c.date); cal = (await econEvents(nx, nx, 2)).slice(0, 8); } catch { /* optional */ }
  const convo = (rows || []).map((r: any) => `[${etHM(r.created_at)}] ${r.author}: ${String(r.content || "").replace(/\s+/g, " ").slice(0, 500)}`).join("\n").slice(-30000);
  if (!convo && !(acts || []).length) {
    await logDesk("assistant", "Jarvis · daily recap", `### Today in one line\nQuiet day: no Desk conversation and no cards.`);
    return { ok: true, quiet: true };
  }
  const data = [
    `DATE ${c.date} (${c.line || ""})`,
    `DESK CONVERSATION (today):\n${convo || "(none)"}`,
    `CARDS (today):\n${(acts || []).map((a: any) => `- ${etHM(a.created_at)} "${a.title}" status=${a.status} by=${a.created_by} setup=${a.plan?.setup || "-"} source=${a.plan?.source || "-"} rules=${(a.plan?.rules || []).join(",") || "-"} outcome=${a.outcome?.state || "-"}${a.outcome?.r != null ? " " + a.outcome.r + "R" : ""} exit=${a.exit?.state || "-"}`).join("\n") || "(none)"}`,
    `CLOSED TRADES (recent, from the journal):\n${(trades || []).filter((t: any) => t.closed_at && etParts(new Date(t.closed_at)).date === c.date).map((t: any) => JSON.stringify(t).slice(0, 300)).join("\n") || "(none today)"}`,
    `FEEDBACK NOTES (today):\n${(fb || []).map((f: any) => `- [${f.kind}] ${f.author}: ${f.note} (screen ${f.screen || "?"})`).join("\n") || "(none)"}`,
    `CALENDAR next trading day:\n${cal.map((e: any) => `- ${e.date} ${e.title} (importance ${e.importance})`).join("\n") || "(not available)"}`,
    await recapExtras(c.date).catch(() => ""),
  ].join("\n\n");
  const text = await claudeText({ model: MODEL, max_tokens: 1200, system: RECAP_SYS + NAME_RULE, messages: [{ role: "user", content: data }] });
  if (!text) throw new Error("empty recap");
  await logDesk("assistant", "Jarvis · daily recap", text);
  const first = text.split("\n").find((l) => l.trim() && !l.startsWith("#")) || "Tap to read it on the Desk.";
  await notify("daily", "🗒 Daily recap is ready", first.slice(0, 200));
  return { ok: true };
}

async function helpAnswer(body: any, apiKey: string) {
  const hist = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
    .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) }))
    .filter((m: any) => m.content);
  while (hist.length && hist[0].role !== "user") hist.shift();
  if (!hist.length || hist[hist.length - 1].role !== "user") throw new Error("ask a question");
  const L = await getLimits();
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700,
      system: [{ type: "text", text: HELP_SYS + NAME_RULE + `\n\nCURRENT LIMITS: ${JSON.stringify({ phase: L.phase, max_trade_loss: L.max_trade_loss, weekly_loss: L.weekly_loss, max_trades_day: L.max_trades_day, monthly_goal_pct: L.monthly_goal_pct, warn_pct: L.warn_pct, big_day: L.big_day })}`, cache_control: { type: "ephemeral" } }],
      messages: hist }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "API error");
  return (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
}

/* ============================================================ v3.16 (7 Oct 2026)
   Ifoma, 7 Oct: "make sure the listener … Jarvis is able to read it … capitalize on it" and "if he can't do
   something he says I can't do it; if he says I'm doing it, he does it."
   What 6 Oct showed: the coach's MU short (3:02 and 3:12 PM) got NO card and NO warning — Jarvis spent all 8
   steps paging MU's option chain (100 strikes a page from $5 up) and the batch was marked "done". At 12:02 Jarvis
   said "I'll flag you at 1:30" and at 12:17 "I'm watching" with nothing behind either.
   - optionShortlist(): the server fetches price, buying power and the contracts near the money (3 expiries,
     delta / volume vs OI / cost already checked) so a Signal card is one step, not eight.
   - Signal card builds MUST end in a card for a call (a forced final step), and any call that still has no card
     pings with the reason. The feed never shows Jarvis's working notes.
   - schedule_check: "I'll check back at 1:30" becomes a real, timed run.
   - promiseCheck(): every Desk reply is scanned for promises ("I'm watching", "I'll flag you", "I've set…");
     anything with nothing real behind it gets one automatic correction round.
   - signalSelfTest(): 9:10 ET every trading day — watcher heartbeat, reading a post, the shortlist and a dry-run
     card build, timed. ✅/❌ on the Desk; phones pinged only on ❌. */

/* ---------------------------------------------------------------- the contract shortlist */
type SLRow = { option_id: string; exp: string; strike: number; type: "call" | "put"; bid: number; ask: number; mark: number;
  delta: number; vol: number; oi: number; cost: number; fits: boolean; band: boolean; liq: boolean; label: string };
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function pickContracts(rows: SLRow[]) {
  const score = (r: SLRow) => Math.abs(Math.abs(r.delta) - 0.35);
  const good = rows.filter((r) => r.band && r.liq && r.ask > 0).sort((a, b) => score(a) - score(b) || b.vol - a.vol);
  const band = rows.filter((r) => r.band && r.ask > 0).sort((a, b) => score(a) - score(b) || b.vol - a.vol);
  const best = good[0] || band[0] || null;
  // The best contract that FITS buying power: in the delta band if one fits, otherwise the fitting contract
  // closest to the band from below (furthest-in-the-money that still fits), never under delta .15.
  const fit = rows.filter((r) => r.fits && r.ask > 0 && Math.abs(r.delta) >= 0.15);
  const fitBand = fit.filter((r) => r.band).sort((a, b) => (Number(b.liq) - Number(a.liq)) || score(a) - score(b));
  const fitBelow = fit.filter((r) => Math.abs(r.delta) < 0.30).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.vol - a.vol);
  const bestFit = fitBand[0] || fitBelow[0] || fit.sort((a, b) => score(a) - score(b))[0] || null;
  return { best, bestFit: bestFit && best && bestFit.option_id === best.option_id ? best : bestFit };
}

// v3.20: one shortlist per ticker/side for 90 s — the card check, the tool and the Watcher prefetch share it.
export function shortlistCached(ticker: string, side: "call" | "put") {
  const sym = String(ticker || "").toUpperCase().replace(/[^A-Z.]/g, "");
  return cached(`sl|${sym}|${side}`, 90e3, () => optionShortlist(sym, side));
}
export const SHORTLIST_TOOL = {
  name: "option_shortlist",
  description: "The server's contract list for an opening card: live price, Agentic buying power, and the calls or puts near the money for the next 3 expiries with bid/ask, delta, volume/OI and cost. ★ = best by the Otto Rules; ◆ = best that fits buying power. Use this INSTEAD of paging option chains yourself, before every opening card.",
  input_schema: { type: "object", properties: { ticker: { type: "string" }, side: { type: "string", enum: ["call", "put"] } }, required: ["ticker", "side"] },
};
export const CONTRACT_RULE = "CONTRACTS (v3.20): before any opening card call option_shortlist(ticker, side) — don't page option chains yourself. Card the ★ contract if it fits buying power, otherwise the ◆ one. If NOTHING fits, card the cheapest ★/◆ anyway (it gets a red banner) and say so in one line. The server refuses an opening card that's over buying power while a ◆ contract fits.";
export async function optionShortlist(ticker: string, side: "call" | "put") {
  const sym = String(ticker || "").toUpperCase().replace(/[^A-Z.]/g, "");
  if (!sym) throw new Error("no ticker");
  const acct = await agenticAccount();
  const [q, ch, pf] = await Promise.all([
    call("rh", "get_equity_quotes", { symbols: [sym] }).then(mcpJson),
    call("rh", "get_option_chains", { underlying_symbol: sym }).then(mcpJson),
    call("rh", "get_portfolio", { account_number: acct }).then(mcpJson).catch(() => null),
  ]);
  const qq = q?.data?.results?.[0]?.quote || {};
  const reg = num(qq.last_trade_price), ext = num(qq.last_non_reg_trade_price);
  const spot = ext && Date.parse(qq.venue_last_non_reg_trade_time || 0) > Date.parse(qq.venue_last_trade_time || 0) ? ext : reg;
  if (!(spot > 0)) throw new Error(`no price for ${sym}`);
  const bpRaw = Number(pf?.data?.buying_power?.buying_power ?? pf?.data?.buying_power);
  const bp = pf && Number.isFinite(bpRaw) ? bpRaw : null;
  const chain = (ch?.data?.chains || []).find((c: any) => c.symbol === sym && c.can_open_position !== false) || (ch?.data?.chains || [])[0];
  const today = etParts().date;
  const exps: string[] = (chain?.expiration_dates || []).filter((d: string) => d > today && d <= addDays(today, 21)).slice(0, 3);
  if (!exps.length) throw new Error(`no ${sym} expiries in the next 3 weeks`);
  const lo = spot * 0.94, hi = spot * 1.06;
  const near = async (exp: string) => {
    // Robinhood lists strikes 100 a page from the bottom; its cursor is base64("p=<strike>"), so start the page
    // just under the money instead of paging up from $5 (what ate Jarvis's steps on MU, 6 Oct).
    const args: any = { chain_symbol: sym, expiration_dates: exp, type: side, cursor: btoa("p=" + (lo - 0.01).toFixed(4)) };
    let list: any[] = [];
    try { list = mcpJson(await call("rh", "get_option_instruments", args))?.data?.instruments || []; } catch { /* fall back below */ }
    if (!list.some((i: any) => num(i.strike_price) >= lo && num(i.strike_price) <= hi)) {
      delete args.cursor;
      list = mcpJson(await call("rh", "get_option_instruments", args))?.data?.instruments || [];
    }
    const ok = list.filter((i: any) => i.tradability !== "untradable" && i.state !== "expired" && num(i.strike_price) >= lo && num(i.strike_price) <= hi);
    // 2 strikes in the money + 6 out of the money: delta ~.55 down to ~.15, so both the rules' pick and a cheaper fit are in view.
    const otm = (i: any) => side === "put" ? num(i.strike_price) <= spot : num(i.strike_price) >= spot;
    const dist = (a: any, b: any) => Math.abs(num(a.strike_price) - spot) - Math.abs(num(b.strike_price) - spot);
    return [...ok.filter((i: any) => !otm(i)).sort(dist).slice(0, 2), ...ok.filter(otm).sort(dist).slice(0, 6)];
  };
  const ins = (await Promise.all(exps.map((e) => near(e).catch(() => [])))).flat();
  if (!ins.length) throw new Error(`couldn't list ${sym} ${side}s near $${spot}`);
  const quotes: Record<string, any> = {};
  for (let i = 0; i < ins.length; i += 20) {
    const j = mcpJson(await call("rh", "get_option_quotes", { instrument_ids: ins.slice(i, i + 20).map((x: any) => x.id) }));
    for (const r of j?.data?.results || []) if (r?.quote?.instrument_id) quotes[r.quote.instrument_id] = r.quote;
  }
  const rows: SLRow[] = ins.map((i: any) => {
    const qo = quotes[i.id] || {};
    const ask = num(qo.ask_price), bid = num(qo.bid_price), mark = num(qo.mark_price) || (ask + bid) / 2;
    const delta = num(qo.delta), vol = num(qo.volume), oi = num(qo.open_interest), strike = num(i.strike_price);
    const cost = Math.round(ask * 100);
    return { option_id: i.id, exp: i.expiration_date, strike, type: side, bid, ask, mark, delta, vol, oi, cost,
      fits: bp != null ? cost <= bp : true, band: Math.abs(delta) >= 0.30 && Math.abs(delta) <= 0.40, liq: vol > oi,
      label: `${sym} ${strike % 1 ? strike : Math.round(strike)}${side === "put" ? "P" : "C"} ${String(i.expiration_date).slice(5).replace("-", "/")}` };
  }).sort((a: SLRow, b: SLRow) => a.exp.localeCompare(b.exp) || a.strike - b.strike);
  const { best, bestFit } = pickContracts(rows);
  const line = (r: SLRow) => `${r === best ? "★" : r === bestFit ? "◆" : " "} ${r.label}  option_id ${r.option_id}  bid ${r.bid.toFixed(2)} / ask ${r.ask.toFixed(2)}  δ ${r.delta.toFixed(2)}  vol ${r.vol} / OI ${r.oi}${r.liq ? "" : " (vol<OI)"}  ≈$${r.cost}${r.fits ? " fits" : " OVER buying power"}`;
  const text = `${sym} $${spot.toFixed(2)} · Agentic buying power ${bp != null ? "$" + bp.toFixed(2) : "unknown"} · ${side}s, expiries ${exps.join(", ")} (fetched ${fmtMin(etParts().min)} ET)\n` +
    rows.map(line).join("\n") +
    `\n★ = best by the Otto Rules (delta .30–.40, volume > OI)${best ? ": " + best.label : ": none in the band"}. ◆ = best that fits buying power${bestFit ? ": " + bestFit.label : ": NOTHING fits"}.`;
  return { sym, side, spot, bp, exps, rows, best, bestFit, text };
}

/* ---------------------------------------------------------------- what is really running right now */
export async function runningNow(): Promise<string> {
  const day = etParts().date;
  const [w, ch, prot, L, beat] = await Promise.all([
    db(`otto_watch?select=ticker,level,dir&day=eq.${day}&status=eq.watching&limit=30`).catch(() => []),
    db(`otto_checks?select=due_at,what&status=eq.pending&order=due_at.asc&limit=10`).catch(() => []),
    db("otto_actions?select=title,exit&exit->>state=eq.armed&limit=5").catch(() => []),
    getLimits().catch(() => LIMIT_DEFAULTS),
    setting("signal_beat").catch(() => null),
  ]);
  const beatOk = beat?.at && Date.now() - Date.parse(beat.at) < 3 * 60e3 && beat.state === "ok";
  return `RUNNING RIGHT NOW — the ONLY things that act without a message (anything else you'd have to do with a tool, now):
- 👁 Watcher levels today: ${(w || []).length ? w.map((r: any) => `${r.ticker} ${Number(r.level)} ${r.dir}`).join(", ") : "none"} (checked every minute on 5/10-min closes, 9:30–4:00).
- ⏰ Scheduled check-ins: ${(ch || []).length ? ch.map((c: any) => `${fmtMin(etParts(new Date(c.due_at)).min)} ET — ${String(c.what).slice(0, 60)}`).join("; ") : "none"}.
- 🛡 Protected trades: ${(prot || []).length ? prot.map((r: any) => `${r.title} (Robinhood stop at $${r.exit?.stop_option}, TradingView alerts wrong-if ${r.exit?.wrong_if} / TP1 ${r.exit?.tp1})`).join("; ") : "none"}.
- Auto-close: ${L.auto_close ? `ON — position check every ${Math.max(5, Number(L.review_min) || 15)} min while a trade is open (HOLD or CLOSE only)` : "OFF"}.
- TradingView alert fires read every 2 min. Otto Signals watcher: ${beatOk ? "on" : "NOT reporting — signals may be missed"}.
To make a new promise true: schedule_check (a timed look + ping) or add_watch_level (a price level). Otherwise say plainly you can't.`;
}

/* ---------------------------------------------------------------- schedule_check */
export const CHECK_TOOL = {
  name: "schedule_check",
  description: "Schedule a real check-in: at the given New York time today (market hours, up to 4:15 PM) the server runs you again with this note, you look at live data, post on the Desk and ping their phones. Use it whenever you'd say \"I'll check back / flag you / let you know at …\". Never promise a timed follow-up without calling this.",
  input_schema: { type: "object", properties: {
    at: { type: "string", description: "New York time today, e.g. \"1:30 PM\"" },
    what: { type: "string", description: "What to check and what to tell them, one or two lines (ticker, level, the condition)" } },
    required: ["at", "what"] },
};
export async function checkAdd(at: string, what: string, by: string) {
  const c = marketClock();
  const iso = nyIso(c.date, String(at || "").trim());
  if (!iso) throw new Error(`couldn't read the time "${at}" — use a New York time like 1:30 PM`);
  const t = Date.parse(iso), m = etParts(new Date(iso)).min;
  if (t <= Date.now() + 60e3) throw new Error("that time has passed (or is under a minute away)");
  if (!isTradingDay(c.date) || m > 975 || m < 540) throw new Error("check-ins run on a trading day between 9:00 AM and 4:15 PM ET");
  const open = await db(`otto_checks?select=id&status=eq.pending&day=eq.${c.date}`).catch(() => []);
  if ((open || []).length >= 10) throw new Error("10 check-ins are already waiting today");
  const row = (await db("otto_checks", { method: "POST", body: JSON.stringify({ day: c.date, due_at: iso, what: String(what || "").slice(0, 400), by: String(by).slice(0, 60), status: "pending" }) }))?.[0];
  await logDesk("system", "Otto", `⏰ Check-in set for ${fmtMin(m)} ET: ${String(what).slice(0, 200)} (Jarvis will look again then and ping you).`);
  return row;
}
export async function checksTick(now = Date.now()) {
  const due = await db(`otto_checks?select=*&status=eq.pending&due_at=lte.${new Date(now).toISOString()}&order=due_at.asc&limit=3`).catch(() => []);
  for (const r of due || []) {
    const claimed = await db(`otto_checks?id=eq.${r.id}&status=eq.pending&select=*`, { method: "PATCH", body: JSON.stringify({ status: "running" }) }).catch(() => []);
    if (!claimed?.length) continue;                                     // another run took it
    if (now - Date.parse(r.due_at) > 15 * 60e3) {                       // a missed minute is fine; an hour late is not a check-in
      await db(`otto_checks?id=eq.${r.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "missed" }) }).catch(() => {});
      await logDesk("system", "Otto", `⏰ The ${fmtMin(etParts(new Date(r.due_at)).min)} check-in didn't run on time (server was down). It was: ${String(r.what).slice(0, 200)}`);
      continue;
    }
    if (!(await kick("check_jarvis", { id: r.id }))) await checkJarvis(r.id);
  }
}
export async function checkJarvis(id: number) {
  const r = (await db(`otto_checks?select=*&id=eq.${id}`))?.[0];
  if (!r) return;
  try {
    const { cs, sys, tools, ctxLine } = await deskSetup();
    const prompt = `${ctxLine}\n[⏰ CHECK-IN — you scheduled this (asked by ${r.by}). Nobody typed this. Due ${fmtMin(etParts(new Date(r.due_at)).min)} ET.]\n${r.what}\nFetch what you need (live price, bars, the position), then write 1–4 plain lines for the Desk: what you see and what you'd do. A card only if there's a real setup or the plan says act. Don't promise anything you can't back with a tool.`;
    const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: [...tools.filter((t: any) => t.name !== "close_position"), WATCH_TOOL, CHECK_TOOL], cs,
      who: "checkin", send: () => {}, allowPropose: true, allowClose: false, maxRounds: 6 });
    const said = res.said.trim() || "Checked — nothing to add.";
    await logDesk("assistant", "Jarvis · check-in", said, res.cards[res.cards.length - 1] || null);
    await db(`otto_checks?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "done", result: unname(said).slice(0, 2000) }) }).catch(() => {});
    await notify("checkin", `⏰ Check-in: ${String(r.what).slice(0, 60)}`, unname(said).replace(/\s+/g, " ").slice(0, 200));
  } catch (e) {
    const m = String((e as Error).message || e).slice(0, 200);
    await db(`otto_checks?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "error", result: m }) }).catch(() => {});
    await logDesk("system", "Otto", `⏰ The check-in "${String(r.what).slice(0, 120)}" failed: ${m}`);
    await notify("checkin", "⏰ A check-in failed", `${String(r.what).slice(0, 80)} — ${m.slice(0, 100)}`);
  }
}

/* ---------------------------------------------------------------- promise checker */
// Sentences where Jarvis commits to doing something later, or says he already did something.
const WHEN_RE = /\b(at \d{1,2}(:\d{2})?\s*(am|pm)?|by \d{1,2}(:\d{2})?|in \d+ ?(min|mins|minutes|hours?)\b|this afternoon|later today|later on|before the close|at the close|at noon|at the open|tomorrow|first thing)\b|\b(if|when|once|as soon as|the moment)\b[^.!?]{0,80}\b(hits?|break(s|ing)?|cross(es)?|fills?|drops?|closes?|touch(es)?|reach(es)?|gets?|goes|triggers?|stuck|starts?|moves?|looks?|turns?|fades?|rolls? over)\b|\bbefore it\b/i;
const PROMISE_RES: { kind: "watch" | "later" | "done"; re: RegExp; needsWhen?: boolean }[] = [
  { kind: "watch", re: /\b(I'?m|I am) (watching|monitoring|keeping (an |a close )?eye on)\b(?! (what you|your point|how you))|\bI'?ll (keep )?(watch(ing)?|monitor(ing)?|keep (an |a close )?eye on)\b/i },
  // Notifying words are promises on their own ("I'll ping you").
  { kind: "later", re: /\bI'?ll (flag|ping|alert|notify|remind|check (back|in|again)|circle back)\b|\bI will (flag|ping|alert|notify|remind|check back)\b/i },
  // Other future actions are promises only with a time or a market condition ("I'll say something if it starts looking ugly").
  { kind: "later", needsWhen: true, re: /\bI'?ll (let you know|update you|message you|text you|tell you|get back to you|speak up|say something|close (it|this|the|your)|move (the|your) stop|cut it|take (it|profit))\b|\bI will (let you know|tell you|close)\b/i },
  { kind: "done", re: /\bI'?ve (set|placed|armed|scheduled|created) (up )?(a |an |the |your )?(\w+ )?(alert|stop|order|check|check-in|reminder|trigger|watch)\b|\bI'?ve added \w+( \d+(\.\d+)?)? to the (watch|Watcher)|\b(alert|stop order|order|check-in) (is|are) (now )?(set|armed|placed|live|scheduled)\b/i },
];
export function findPromises(text: string): { kind: string; sentence: string }[] {
  const out: { kind: string; sentence: string }[] = [];
  const sentences = String(text || "").replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    // An offer that waits for their next message is true by design ("tell me and I'll close it").
    if (/^(if|when) (you|they) (want|ask)|\b(tell me|ask me|say the word|let me know|just say|if you want|want me to|if you'd like|on your word|reply|once you approve|after you approve|when you approve)\b/i.test(s)) continue;
    if (/\b(can'?t|cannot|won'?t|not able|no way to|don'?t)\b.{0,30}\b(watch|monitor|ping|flag)/i.test(s)) continue;   // an honest "I can't"
    for (const p of PROMISE_RES) if (p.re.test(s) && (!p.needsWhen || WHEN_RE.test(s))) { out.push({ kind: p.kind, sentence: s.slice(0, 240) }); break; }
  }
  return out;
}
// Is there something real behind each promise? `did` = tools that SUCCEEDED in this reply; `failed` = tools that errored.
export function unbacked(promises: { kind: string; sentence: string }[], ctx: { did: string[]; failed: string[]; protectedTrade: boolean; autoClose: boolean; watchToday: string[] }) {
  const did = new Set(ctx.did);
  return promises.filter((p) => {
    const s = p.sentence;
    if (p.kind === "watch") {
      if (did.has("add_watch_level") || did.has("schedule_check")) return false;
      const tick = (s.match(/\b[A-Z]{2,5}\b/g) || []).find((t) => ctx.watchToday.includes(t));
      return !(tick && /level|break|hold|reject/i.test(s));                    // "I'm watching NVDA 242" with NVDA on the Watcher is true
    }
    if (p.kind === "later") {
      if (did.has("schedule_check") || did.has("add_watch_level") || did.has("propose_action")) return false;
      // Real today without a tool: a protected trade's stop / wrong-if / TP1 alerts, and auto-close's position check.
      if (ctx.protectedTrade && /\b(stop|wrong[- ]?if|tp ?1|target|alert)\b/i.test(s)) return false;
      if (ctx.protectedTrade && ctx.autoClose && /\bclose\b/i.test(s) && /\b(if|when)\b/i.test(s)) return false;
      return true;
    }
    // "done": a matching write must have worked in this reply. A card is NOT a placed order.
    if (/placed|order (is|are)/i.test(s)) return !(did.has("close_position"));
    if (/scheduled|check/i.test(s)) return !did.has("schedule_check");
    if (/alert|stop/i.test(s)) return !(ctx.protectedTrade || did.has("propose_action") || did.has("add_watch_level"));
    if (/saved/i.test(s)) return !did.has("save_house_rule");
    if (/closed/i.test(s)) return !did.has("close_position");
    return !(did.has("add_watch_level") || did.has("schedule_check") || did.has("propose_action") || did.has("save_house_rule") || did.has("close_position"));
  });
}
export async function promiseContext(did: string[], failed: string[]) {
  const day = etParts().date;
  const [prot, L, w] = await Promise.all([
    db("otto_actions?select=id&exit->>state=eq.armed&limit=1").catch(() => []),
    getLimits().catch(() => LIMIT_DEFAULTS),
    db(`otto_watch?select=ticker&day=eq.${day}&status=eq.watching&limit=50`).catch(() => []),
  ]);
  return { did, failed, protectedTrade: !!(prot || []).length, autoClose: !!L.auto_close, watchToday: [...new Set((w || []).map((r: any) => String(r.ticker)))] as string[] };
}
export const correctionPrompt = (bad: { sentence: string }[], ctx: any) =>
  `[OTTO SERVER CHECK — not from Ifoma or Josh] Your reply made ${bad.length === 1 ? "a promise" : "promises"} that nothing running backs:\n` +
  bad.map((b) => `- "${b.sentence}"`).join("\n") +
  `\nThis reply's tools that worked: ${ctx.did.join(", ") || "none"}${ctx.failed.length ? "; FAILED: " + ctx.failed.join(", ") : ""}. You do not watch the market between messages.\n` +
  `Fix it now, one way or the other: (a) make it real — schedule_check for a timed look, add_watch_level for a price level — then confirm in ONE line; or (b) take it back in ONE or TWO lines starting "Correction:", saying plainly what you can't do and what WILL alert them (the RUNNING RIGHT NOW list). No other text.`;
async function promiseTally(made: number, bad: number) {
  try {
    const day = etParts().date;
    const cur = (await setting("promise_day").catch(() => null)) || {};
    const v = cur.day === day ? cur : { day, made: 0, backed: 0, corrected: 0 };
    v.made += made; v.backed += made - bad; v.corrected += bad;
    await putSetting("promise_day", v, "jarvis");
  } catch { /* a tally never breaks the Desk */ }
}
// After a Desk run: check the final words; if anything is unbacked, one correction round (streamed after the reply).
export async function enforcePromises(r: { said: string; finalText: string; did: string[]; failed: string[] }, rerun: (extra: string) => Promise<{ said: string; did: string[] }>) {
  const promises = findPromises(r.finalText);
  if (!promises.length) return { added: "", bad: [] as any[], fallback: false };
  const ctx = await promiseContext(r.did, r.failed);
  const bad = unbacked(promises, ctx);
  await promiseTally(promises.length, bad.length);
  if (!bad.length) return { added: "", bad, fallback: false };
  const fix = await rerun(correctionPrompt(bad, ctx)).catch(() => null);
  let added = (fix?.said || "").trim(), fallback = false;
  // If the correction itself still promises without a tool, say it plainly ourselves.
  if (!added || unbacked(findPromises(added), { ...ctx, did: [...ctx.did, ...(fix?.did || [])] }).length) {
    added = "Correction: I can't watch the market between messages. What will actually alert you is in the Watcher, your trade's stop and alerts, and any ⏰ check-in on the Desk — ask me to set one if you want a timed look.";
    fallback = true;
  }
  return { added, bad, fallback };
}

/* ---------------------------------------------------------------- Signals: the pre-fetch, the read fallback, results */
export async function signalPrefetch(rows: any[]): Promise<string> {
  const calls = rows.filter((r: any) => r.ticker && (r.kind === "call" || r.kind === "level")).slice(0, 2);
  const parts = await Promise.all(calls.map(async (r: any) => {
    const sides: ("call" | "put")[] = r.direction === "long" ? ["call"] : r.direction === "short" ? ["put"] : ["call", "put"];
    const out = await Promise.all(sides.map((s) => withTimeout(optionShortlist(r.ticker, s), 25_000, "shortlist " + r.ticker).then((x) => x.text, (e) => `${r.ticker} ${s}s: couldn't pre-fetch (${String((e as Error).message).slice(0, 100)}) — look it up yourself.`)));
    return out.join("\n\n");
  }));
  return parts.filter(Boolean).join("\n\n");
}
export function readFallback(all: any[], cards: string[], why: string) {
  const posts = all.filter((r: any) => r.ticker).map((r: any) => `${r.ticker}${r.direction ? " " + r.direction : ""} ${r.kind} at ${r.posted_label || "?"}: "${String(r.words || "").slice(0, 120)}"`);
  return `${posts.join("\n") || "Signal post."}\n${cards.length ? "Card ready — open it on the Desk." : "No card: " + why}`;
}

/* ---------------------------------------------------------------- every card gets its ping (code review 6 Oct) */
// Signal / alert / Watcher cards ping after Jarvis's run ends. If the server cut the run off after the card was
// made, nobody was told. Every ping now marks the card; the minute timer pings any card still unmarked after 3 min.
export async function markPinged(ids: string[]) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return;
  await db("otto_actions?id=in.(" + list.join(",") + ")", { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ pinged_at: new Date().toISOString() }) }).catch(() => {});
}
export async function cardSweep(now = Date.now()) {
  const rows = await db(`otto_actions?select=id,title,created_by,created_at&status=eq.pending&pinged_at=is.null&created_at=gte.${new Date(now - 20 * 60e3).toISOString()}&created_at=lt.${new Date(now - 3 * 60e3).toISOString()}&limit=10`).catch(() => []);
  for (const a of rows || []) {
    const claimed = await db(`otto_actions?id=eq.${a.id}&pinged_at=is.null&select=id`, { method: "PATCH", body: JSON.stringify({ pinged_at: new Date(now).toISOString() }) }).catch(() => []);
    if (!claimed?.length) continue;
    await notify("card", `🃏 Card waiting: ${unname(String(a.title)).slice(0, 80)}`, "Its ping was missed (the run was cut off). Tap to Approve or Reject before it expires.");
  }
}

/* ---------------------------------------------------------------- Signal results ("$1000 for 2 PUTS ON MU") */
// v3.16: the coach's result posts are linked to his call of the same ticker that day, so his calls get a real
// scoreboard later (which calls work, how fast). Never a card, never a ping.
export async function linkResults(rows: any[]) {
  for (const r of rows || []) {
    if (r?.kind !== "result" || !r.ticker || r.result_for) continue;
    const callRow = (await db(`otto_jason?select=id&day=eq.${r.day}&ticker=eq.${encodeURIComponent(r.ticker)}&kind=eq.call&order=id.desc&limit=1`).catch(() => []))?.[0];
    if (callRow) await db(`otto_jason?id=eq.${r.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ result_for: callRow.id }) }).catch(() => {});
  }
}

/* ---------------------------------------------------------------- daily Signal self-test (9:10 ET) */
// Ifoma, 7 Oct: automatic every trading day; ✅/❌ on the Desk; phones pinged only on ❌.
// Tests each link a real signal uses, with a canned post — nothing is stored as a signal and no real card is made.
export async function signalSelfTest(force = false) {
  const c = marketClock();
  if (!force) {
    if (!isTradingDay(c.date)) return { ok: true, skipped: "not a trading day" };
    const s = await setting("selftest_day").catch(() => null);
    if (s?.day === c.date) return { ok: true, skipped: "already ran" };
    await putSetting("selftest_day", { day: c.date, at: new Date().toISOString() }, "cron").catch(() => {});
  }
  const t0 = Date.now(), steps: { name: string; ok: boolean; ms: number; note: string }[] = [];
  const step = async (name: string, f: () => Promise<string>) => {
    const t = Date.now();
    try { const note = await f(); steps.push({ name, ok: true, ms: Date.now() - t, note }); }
    catch (e) { steps.push({ name, ok: false, ms: Date.now() - t, note: String((e as Error).message || e).slice(0, 220) }); }
  };
  await step("Discord watcher heartbeat", async () => {
    const b = await setting("signal_beat").catch(() => null);
    if (!b?.at) throw new Error("never heard from the watcher");
    const age = Math.round((Date.now() - Date.parse(b.at)) / 1000);
    if (age > 180) throw new Error(`last heartbeat ${Math.round(age / 60)} min ago — is the Engineer PC awake?`);
    if (b.state !== "ok") throw new Error(`watcher says "${b.state}"${b.detail ? ": " + b.detail : ""}`);
    if (b.queue_age > 120) throw new Error(`${b.queue} post(s) stuck in the watcher's queue`);
    return `ok, ${age}s ago`;
  });
  let posts: any[] = [];
  await step("Reading a post", async () => {
    posts = await sigExtract(Deno.env.get("ANTHROPIC_KEY") || "", "the coach", `NEW:\n[${fmtMin(c.min)}] SPY LONG\n[${fmtMin(c.min)}] @Platinum Members`, [], c.date);
    const p = posts.find((x: any) => x.kind === "call" && x.ticker === "SPY");
    if (!p) throw new Error("the test post wasn't read as a SPY call");
    return "SPY call read";
  });
  let pre = "";
  await step("Contract shortlist", async () => {
    const sl = await withTimeout(optionShortlist("SPY", "call"), 30_000, "shortlist");
    pre = sl.text;
    if (!sl.rows.length) throw new Error("no SPY contracts listed");
    return `${sl.rows.length} contracts, best ${sl.best?.label || "none in band"}, fits ${sl.bestFit?.label || "nothing fits"}`;
  });
  await step("Jarvis builds the card (dry run)", async () => {
    if (!pre) throw new Error("skipped — no shortlist");
    const { cs, sys, tools, ctxLine } = await deskSetup();
    const prompt = `${ctxLine}\n[SELF-TEST — not a real signal. Make ONE opening card for "SPY LONG" from this list, using ◆ (fits buying power) or ★. It will NOT be stored.]\n${pre}`;
    const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: tools.filter((t: any) => t.name === "propose_action"), cs,
      who: "selftest", send: () => {}, allowPropose: true, allowClose: false, maxRounds: 3, mustCard: true, dryRun: true, deadline: Date.now() + 60_000 });
    if (!res.dry?.length) throw new Error(res.failed.includes("propose_action") ? "the card was malformed — " + (res.errors || []).slice(-1)[0] : "no card was made");
    return String(res.dry[0].title || "card ok").slice(0, 80);
  });
  const ok = steps.every((x) => x.ok), secs = Math.round((Date.now() - t0) / 1000);
  const text = `${ok ? "✅" : "❌"} Signal self-test ${fmtMin(c.min)} ET — ${ok ? `all good, post → card in ${secs}s` : "FAILED"}\n` +
    steps.map((x) => `${x.ok ? "✓" : "✗"} ${x.name} (${(x.ms / 1000).toFixed(1)}s): ${x.note}`).join("\n");
  await logDesk("system", "Otto", text);
  await putSetting("selftest_last", { at: new Date().toISOString(), ok, secs, steps }, "cron").catch(() => {});
  if (!ok) await notify("watcher", "❌ Signal self-test failed", steps.filter((x) => !x.ok).map((x) => `${x.name}: ${x.note}`).join(" · ").slice(0, 250), "./#desk");
  return { ok, secs, steps };
}

// v3.16: the recap reports Jarvis's promises (made / backed / corrected) and every Signal's post → card time.
export async function recapExtras(day: string) {
  const pr = await setting("promise_day").catch(() => null);
  const bs = await db(`otto_signal_batches?select=id,status,cards,timing,error&day=eq.${day}&order=id.asc&limit=40`).catch(() => []);
  const sig = (bs || []).filter((b: any) => b.timing).map((b: any) => `- batch ${b.id}: ${(b.cards || []).length} card(s), post → card ${b.timing.total_ms != null ? Math.round(b.timing.total_ms / 1000) + "s" : "?"}${b.error ? " — " + b.error : ""}`);
  const st = await setting("selftest_last").catch(() => null);
  return `JARVIS PROMISES (today): ${pr?.day === day ? `${pr.made} made, ${pr.backed} backed, ${pr.corrected} corrected by the server check` : "none checked"}\n` +
    `SIGNAL SELF-TEST: ${st?.at && etParts(new Date(st.at)).date === day ? (st.ok ? `passed (${st.secs}s)` : "FAILED") : "did not run"}\n` +
    `SIGNAL CARD TIMES (today):\n${sig.join("\n") || "(no signal cards built)"}\nPut one line in the recap: promises made/backed/corrected and the signal timings.`;
}

/* ============================================================ v3.18 (7 Oct 2026)
   Approved mockup otto-v3.18-mockup.html ("Yes, approved: build v3.18"; keep "Copy for coach").
   🌅 Morning Prep: Ifoma and Josh each post their morning sentiment read (charts + the notes they send the
   coach). Jarvis asks 2–3 clarifying questions FIRST, then grades (letter + process / levels / plan, strong /
   fix / missing, tied to the Otto Rules). Levels he reads come back with one-tap "+ Watcher". At 4:05 PM ET each
   read is graded against the tape (direction right / wrong / flat, levels touched). Plus the Score additions
   (signal speed, the coach's calls) — read-only views over data v3.16 already records. */

const PREP_AUTHORS = new Set(["Ifoma", "Josh"]);
const prepAuthor = (a: any) => PREP_AUTHORS.has(String(a)) ? String(a) : "Ifoma";

// One forced tool call; returns the tool input. Streams through claudeFetch (so tests and retries behave the same).
async function claudeTool(body: any, toolName: string, budgetMs = 90_000): Promise<any> {
  const r = await claudeFetch({ ...body, stream: true, tool_choice: { type: "tool", name: toolName } }, Date.now() + budgetMs);
  const reader = r.body!.getReader(), dec = new TextDecoder();
  let buf = "", json = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try { const ev = JSON.parse(line.slice(6)); if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") json += ev.delta.partial_json; } catch { /* */ }
    }
  }
  try { return JSON.parse(json || "{}"); } catch { throw new Error("Jarvis's answer couldn't be read — try again"); }
}

const PREP_LEVEL = { type: "object", properties: {
  ticker: { type: "string" }, level: { type: "number" }, dir: { type: "string", enum: ["up", "down", "both"], description: "up = calls side (break above / hold above), down = puts side (break below / rejection)" },
  note: { type: "string", description: "a few words: what the level is (gap top, order-block low…)" } }, required: ["ticker", "level", "dir"] };
const PREP_ASK_TOOL = { name: "prep_questions", description: "Ask the trader 2-3 clarifying questions about their morning read before grading it, and record what you read from it.",
  input_schema: { type: "object", properties: {
    questions: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" }, description: "Short, specific questions that make them sharper: what proves them wrong, which level is which, the catalyst, the target, the first-30-minutes plan. Never answer them yourself." },
    bias: { type: "string", enum: ["long", "short", "neutral"], description: "Their overall lean, as THEY wrote it (not yours)." },
    main: { type: "string", description: "The main ticker of the read, usually SPY." },
    levels: { type: "array", maxItems: 8, items: PREP_LEVEL, description: "Every price level they marked in the notes or on the charts (numbers only if written or clearly labelled)." } },
    required: ["questions", "bias", "main", "levels"] } };
const PREP_GRADE_TOOL = { name: "prep_grade", description: "Grade the morning read after their answers.",
  input_schema: { type: "object", properties: {
    letter: { type: "string", enum: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"] },
    process: { type: "integer", minimum: 0, maximum: 10 }, levels_score: { type: "integer", minimum: 0, maximum: 10 }, plan: { type: "integer", minimum: 0, maximum: 10 },
    strong: { type: "array", maxItems: 3, items: { type: "string" }, description: "What they did right, citing the Otto Rules (call date) or a Playbook rule id when it applies." },
    fix: { type: "array", maxItems: 3, items: { type: "string" }, description: "The most important things to fix today." },
    missing: { type: "array", maxItems: 3, items: { type: "string" }, description: "What the read leaves out (target, invalidation, catalyst, timing)." },
    levels: { type: "array", maxItems: 8, items: PREP_LEVEL, description: "The final list of their levels (corrected with their answers)." } },
    required: ["letter", "process", "levels_score", "plan", "strong", "fix", "missing", "levels"] } };

const PREP_SYS = (author: string) => `You are Jarvis, coaching ${author}'s MORNING SENTIMENT READ before the open, inside Otto Trader. Your job is to make them a sharper trader, not to hand them your own read.
- Judge their read against the Otto Rules (the coaching-call method below) and the live context line (clock, banner, prices). Quote rules in your own words with the call date when you use one.
- Be direct and specific, plain words, no jargon they haven't used. Short lines. Don't flatter; say what's weak.
- Never invent prices or levels. Levels come only from their notes or numbers clearly labelled on their charts.
- Their lean is THEIRS: grade the reasoning (inputs, levels, invalidation, catalyst, plan, timing), not whether you agree.
- Never write the coach's name.`;

async function prepContext(notes: string) {
  const calls = await loadBrain();
  const cs = chunksOf(calls);
  const hits = search(cs, notes, 8).map(fmt).join("\n\n").slice(0, 9000);
  const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
  const sent = await settle(sentimentNow());
  const banner = sent.ok ? `Banner: ${sent.v.verdict} (score ${sent.v.score}, ${sent.v.fresh}/${sent.v.total} legs fresh).` : "Banner: unavailable.";
  const live = marketClock().line + "\n" + banner + "\n\n" + await houseRulesText().catch(() => "") + "\n\n" + await playbookText().catch(() => "");
  return { sys, live, hits };
}
const prepImgs = async (id: number) => (await db(`otto_prep_imgs?select=mime,data&prep_id=eq.${id}&order=id.asc&limit=6`).catch(() => [])) || [];
const imgBlocks = (imgs: any[]) => imgs.slice(0, 6).map((i: any) => ({ type: "image", source: { type: "base64",
  media_type: /^image\/(jpeg|png|webp|gif)$/.test(i.mime) ? i.mime : "image/jpeg", data: i.data } }));

export async function prepSubmit(b: any) {
  const author = prepAuthor(b.author);
  const notes = String(b.notes || "").trim().slice(0, 6000);
  const imgs = (Array.isArray(b.images) ? b.images : []).filter((i: any) => typeof i?.data === "string" && i.data.length > 100 && i.data.length < 6_000_000).slice(0, 6);
  if (!notes && !imgs.length) throw new Error("Add your notes or a chart first.");
  const day = etParts().date;
  // One read per person per day: a new submit starts the conversation over.
  const old = (await db(`otto_prep?select=id&day=eq.${day}&author=eq.${author}`).catch(() => []))?.[0];
  if (old) {
    await db(`otto_prep_imgs?prep_id=eq.${old.id}`, { method: "DELETE", headers: { prefer: "return=minimal" } }).catch(() => {});
    await db(`otto_prep?id=eq.${old.id}`, { method: "DELETE", headers: { prefer: "return=minimal" } }).catch(() => {});
  }
  const row = (await db("otto_prep", { method: "POST", body: JSON.stringify({ day, author, notes, imgs: imgs.length, status: "asking", thread: [] }) }))?.[0];
  if (!row?.id) throw new Error("couldn't save the read");
  if (imgs.length) await db("otto_prep_imgs", { method: "POST", headers: { prefer: "return=minimal" },
    body: JSON.stringify(imgs.map((i: any) => ({ prep_id: row.id, mime: String(i.mime || "image/jpeg").slice(0, 30), data: i.data }))) });
  const { sys, live, hits } = await prepContext(notes);
  const content: any[] = [...imgBlocks(imgs), { type: "text", text: `${author}'s morning read (${imgs.length} chart${imgs.length === 1 ? "" : "s"} above).\n\nNOTES:\n${notes || "(no notes — read the charts)"}\n\nOTTO RULES THAT MATCH THE NOTES:\n${hits || "(none found)"}\n\nAsk your 2-3 questions now. Don't grade yet.` }];
  const a = await claudeTool({ model: MODEL, max_tokens: 1500, system: [{ type: "text", text: sys + NAME_RULE }, { type: "text", text: PREP_SYS(author) + "\n\n" + live }],
    tools: [PREP_ASK_TOOL], messages: [{ role: "user", content }] }, "prep_questions");
  const qs = (Array.isArray(a.questions) ? a.questions : []).map((q: any) => unname(String(q)).slice(0, 400)).filter(Boolean).slice(0, 3);
  if (!qs.length) throw new Error("Jarvis didn't ask anything — send it again");
  const thread = [{ role: "jarvis", at: new Date().toISOString(), kind: "questions", questions: qs }];
  const upd = { status: "asked", thread, bias: ["long", "short", "neutral"].includes(a.bias) ? a.bias : "neutral",
    main: String(a.main || "SPY").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8) || "SPY", levels: cleanLevels(a.levels) };
  await db(`otto_prep?id=eq.${row.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(upd) });
  return { ok: true, prep: { ...row, ...upd } };
}
function cleanLevels(l: any): any[] {
  return (Array.isArray(l) ? l : []).map((x: any) => ({ ticker: String(x?.ticker || "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8),
    level: Number(x?.level), dir: ["up", "down", "both"].includes(x?.dir) ? x.dir : "both", note: String(x?.note || "").slice(0, 80) }))
    .filter((x: any) => x.ticker && x.level > 0).slice(0, 8);
}

export async function prepReply(b: any) {
  const id = Number(b.id), text = String(b.text || "").trim().slice(0, 4000);
  if (!id || !text) throw new Error("nothing to send");
  const row = (await db(`otto_prep?select=*&id=eq.${id}`))?.[0];
  if (!row) throw new Error("that read wasn't found");
  const author = row.author;
  const thread: any[] = [...(row.thread || []), { role: "user", author, at: new Date().toISOString(), text }];
  const { sys, live, hits } = await prepContext(row.notes + "\n" + text);
  const imgs = await prepImgs(id);
  const convo = thread.map((t: any) => t.role === "user" ? `${t.author}: ${t.text}` : t.kind === "questions" ? `Jarvis asked:\n${t.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}`
    : t.kind === "grade" ? `Jarvis graded it ${t.grade?.letter}.` : `Jarvis: ${t.text}`).join("\n\n");
  const head = [...imgBlocks(imgs), { type: "text", text: `${author}'s morning read.\n\nNOTES:\n${row.notes || "(none)"}\n\nOTTO RULES THAT MATCH:\n${hits || "(none)"}\n\nCONVERSATION SO FAR:\n${convo}` }];
  const system = [{ type: "text", text: sys + NAME_RULE }, { type: "text", text: PREP_SYS(author) + "\n\n" + live }];
  let upd: any;
  if (row.status !== "graded") {
    const g = await claudeTool({ model: MODEL, max_tokens: 2000, system, tools: [PREP_GRADE_TOOL],
      messages: [{ role: "user", content: [...head, { type: "text", text: "They've answered. Grade the read now." }] }] }, "prep_grade");
    const L = (v: any) => (Array.isArray(v) ? v : []).map((s: any) => unname(String(s)).slice(0, 400)).filter(Boolean).slice(0, 3);
    const grade = { letter: String(g.letter || "C"), process: +g.process || 0, levels: +g.levels_score || 0, plan: +g.plan || 0, strong: L(g.strong), fix: L(g.fix), missing: L(g.missing) };
    const keep = new Map((row.levels || []).map((x: any) => [`${x.ticker}|${x.level}`, x]));
    const levels = cleanLevels(g.levels).map((x: any) => ({ ...x, ...(keep.get(`${x.ticker}|${x.level}`) as any || {}), dir: x.dir }));
    thread.push({ role: "jarvis", at: new Date().toISOString(), kind: "grade", grade });
    upd = { status: "graded", thread, grade, levels: levels.length ? levels : row.levels };
  } else {
    const t = await claudeText({ model: MODEL, max_tokens: 900, system, messages: [{ role: "user", content: [...head, { type: "text", text: "Answer their last message in a few short lines. Coach, don't re-grade." }] }] });
    thread.push({ role: "jarvis", at: new Date().toISOString(), kind: "text", text: unname(t).slice(0, 3000) });
    upd = { thread };
  }
  await db(`otto_prep?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(upd) });
  return { ok: true, prep: { ...row, ...upd } };
}

export async function prepWatch(b: any, who: string) {
  const id = Number(b.id), i = Number(b.idx);
  const row = (await db(`otto_prep?select=*&id=eq.${id}`))?.[0];
  if (!row) throw new Error("that read wasn't found");
  const levels = [...(row.levels || [])];
  const x = levels[i];
  if (!x) throw new Error("that level wasn't found");
  if (row.day !== etParts().date) throw new Error("levels can only be watched on the day of the read");
  const w = await watchAdd({ ticker: x.ticker, level: x.level, dir: x.dir, source: "desk", note: `${row.author}'s morning read${x.note ? ": " + x.note : ""}`, by: `${row.author} · Morning Prep` });
  levels[i] = { ...x, watched: true, watch_id: w?.id ?? null };
  await db(`otto_prep?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ levels }) });
  if (w) await logDesk("system", "Otto", `👁 Watching ${x.ticker} ${x.level} ${x.dir === "up" ? "▲" : x.dir === "down" ? "▼" : "▲▼"} today (from ${row.author}'s morning read).`);
  void who;
  return { ok: true, levels };
}

// 4:05 PM ET: grade today's reads against the tape (Robinhood 5-minute bars, 9:30–4:00).
export function gradeRead(bias: string, main: Bar[], levels: any[], barsBy: Record<string, Bar[]>) {
  if (!main.length) return null;
  const open = main[0].o, close = main[main.length - 1].c;
  const chg = (close - open) / open * 100;
  const flatDay = Math.abs(chg) < 0.15;
  const direction = bias === "neutral" ? (flatDay ? "right" : "wrong") : flatDay ? "flat" : ((chg > 0) === (bias === "long") ? "right" : "wrong");
  const lv = (levels || []).map((x: any) => {
    const bars = barsBy[x.ticker] || [];
    if (!bars.length) return { ...x, touched: null };
    const hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l));
    const touched = x.level <= hi && x.level >= lo;
    const first = bars[0].o, last = bars[bars.length - 1].c;
    const broke = touched && ((first > x.level && last < x.level) || (first < x.level && last > x.level));
    return { ticker: x.ticker, level: x.level, dir: x.dir, touched, broke };
  });
  const scored = lv.filter((x: any) => x.touched !== null);
  return { direction, chg: +chg.toFixed(2), open: +open.toFixed(2), close: +close.toFixed(2), levels: lv,
    touched: scored.filter((x: any) => x.touched).length, of: scored.length };
}
export async function prepGradeTick(force = false) {
  const c = marketClock();
  if (!force && (!isTradingDay(c.date) || c.min < 965)) return { ok: true, skipped: "after 4:05 PM on trading days" };
  const rows = await db(`otto_prep?select=id,author,bias,main,levels,result,plan&day=eq.${c.date}&result=is.null`).catch(() => []);
  if (!rows?.length) return { ok: true, graded: 0 };
  const start = nyIso(c.date, "9:30 AM")!, end = nyIso(c.date, "4:00 PM")!;
  const tickers = [...new Set(rows.flatMap((r: any) => [r.main || "SPY", ...(r.levels || []).map((x: any) => x.ticker), ...(r.plan ? [r.plan.ticker] : [])]))] as string[];
  const trades = rows.some((r: any) => r.plan) ? await openingTradesToday().catch(() => null) : null;   // v3.19
  const bars = await rhBars(tickers, "5minute", start, end);
  for (const t of Object.keys(bars)) bars[t] = bars[t].filter((b) => b.t >= Date.parse(start) && b.t < Date.parse(end));
  let n = 0;
  for (const r of rows) {
    const res: any = gradeRead(r.bias || "neutral", bars[(r.main || "SPY").toUpperCase()] || [], r.levels || [], bars);
    if (!res) continue;
    if (r.plan) res.plan = { ...planVsTape(r.plan, bars[r.plan.ticker] || []), ...(trades ? planAdherence(r.plan, trades) : { adherence: "unknown", traded: [] }) };   // v3.19
    await db(`otto_prep?id=eq.${r.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ result: res }) }).catch(() => {});
    n++;
  }
  return { ok: true, graded: n };
}

export async function prepGet(author: string) {
  const day = etParts().date;
  const a = prepAuthor(author);
  const today = (await db(`otto_prep?select=id,day,author,created_at,notes,imgs,status,thread,bias,main,levels,grade,result,plan&day=eq.${day}&author=eq.${a}`).catch(() => []))?.[0] || null;
  const hist = await db(`otto_prep?select=id,day,author,bias,main,levels,grade,result,notes,plan&order=day.desc&limit=60`).catch(() => []);
  const stats: Record<string, any> = {};
  for (const who of PREP_AUTHORS) {
    const mine = (hist || []).filter((r: any) => r.author === who && r.result).slice(0, 20);
    const right = mine.filter((r: any) => r.result.direction === "right").length;
    const lt = mine.reduce((s: number, r: any) => s + (r.result.touched || 0), 0), lof = mine.reduce((s: number, r: any) => s + (r.result.of || 0), 0);
    stats[who] = { n: mine.length, right, touched: lt, of: lof };
  }
  const imgs = today ? (await db(`otto_prep_imgs?select=id&prep_id=eq.${today.id}&order=id.asc`).catch(() => [])).map((x: any) => x.id) : [];
  return { ok: true, day, author: a, today: today ? { ...today, img_ids: imgs } : null,
    history: (hist || []).filter((r: any) => r.author === a).slice(0, 20).map((r: any) => ({ ...r, notes: String(r.notes || "").slice(0, 160) })), stats };
}
export async function prepImg(id: number) {
  const r = (await db(`otto_prep_imgs?select=mime,data&id=eq.${id}`))?.[0];
  if (!r) throw new Error("image not found");
  return { ok: true, mime: r.mime, data: r.data };
}

// Score page additions: Signal speed (v3.16 timings), the coach's calls (scored to the close), self-test.
export async function scoreExtra() {
  const since = new Date(Date.now() - 21 * 864e5).toISOString();
  const bs = await db(`otto_signal_batches?select=id,created_at,status,cards,timing,error,rows,msg_ids&created_at=gte.${since}&order=id.desc&limit=80`).catch(() => []);
  const rowIds = [...new Set((bs || []).flatMap((b: any) => b.rows || []))];
  const jr = rowIds.length ? await db(`otto_jason?select=id,ticker,direction,kind,words&id=in.(${rowIds.join(",")})`).catch(() => []) : [];
  const jById: Record<string, any> = Object.fromEntries((jr || []).map((r: any) => [r.id, r]));
  const speed = (bs || []).filter((b: any) => (b.rows || []).some((id: any) => ["call", "level"].includes(jById[id]?.kind) && jById[id]?.ticker)).slice(0, 12).map((b: any) => {
    const r = (b.rows || []).map((id: any) => jById[id]).find((x: any) => x && ["call", "level"].includes(x.kind)) || {};
    const t = b.timing || {};
    const posted = t.posted ? Date.parse(t.posted) : null, caught = Date.parse(b.created_at);
    return { at: t.posted || b.created_at, ticker: r.ticker, direction: r.direction, words: String(r.words || "").slice(0, 80),
      caught_s: posted ? Math.max(0, Math.round((caught - posted) / 1000)) : null, card_s: t.total_ms != null ? Math.round(t.total_ms / 1000) : null,
      cards: (b.cards || []).length, status: b.status, why: b.error || null, timed: !!b.timing };
  });
  const timed = speed.filter((s: any) => s.timed);
  const cardTimes = timed.filter((s: any) => s.cards && s.card_s != null).map((s: any) => s.card_s).sort((a: number, b: number) => a - b);
  const calls = await db(`otto_jason?select=id,ticker,direction,score,day&kind=eq.call&order=day.desc&limit=200`).catch(() => []);
  const results = await db(`otto_jason?select=result_for,words&kind=eq.result&order=id.desc&limit=100`).catch(() => []);
  const resBy: Record<string, string[]> = {};
  for (const r of results || []) if (r.result_for) (resBy[r.result_for] ||= []).push(String(r.words).slice(0, 60));
  const byT: Record<string, any> = {};
  for (const c of calls || []) {
    if (!c.ticker) continue;
    const t = (byT[c.ticker] ||= { ticker: c.ticker, n: 0, scored: 0, worked: 0, sum: 0, best: 0, results: [] as string[] });
    t.n++;
    if (c.score && c.score.state !== "unscored") { t.scored++; if (c.score.state === "worked") t.worked++; t.sum += +c.score.close_pct || 0; t.best += +c.score.best_pct || 0; }
    if (resBy[c.id]) t.results.push(...resBy[c.id]);
  }
  const coach = Object.values(byT).map((t: any) => ({ ticker: t.ticker, n: t.n, scored: t.scored, worked: t.worked,
    avg_close: t.scored ? +(t.sum / t.scored).toFixed(2) : null, avg_best: t.scored ? +(t.best / t.scored).toFixed(2) : null, results: t.results.slice(0, 3) }))
    .sort((a: any, b: any) => b.n - a.n).slice(0, 12);
  const st = await setting("selftest_last").catch(() => null);
  const prep = (await prepGet("Ifoma").catch(() => null))?.stats || null;
  return { ok: true, speed, median_card_s: cardTimes.length ? cardTimes[Math.floor(cardTimes.length / 2)] : null,
    timed_calls: timed.length, silent: timed.filter((s: any) => !s.cards && !s.why).length, coach, selftest: st, prep };
}

/* ============================================================ v3.19 (7 Oct 2026)
   Ifoma, after Josh's first read (B-: "pick ONE ticker, name the timeframe, no wrong-if"): "build" Lock today's plan.
   After the grade the trader locks four things — the one ticker + side, the entry trigger (level, how, timeframe),
   the wrong-if and the target. Jarvis checks just those (pass / fix, not a re-grade); locking pins the plan on the
   Desk all day and puts the entry level on the Watcher. At 4:05 PM the plan is checked against the tape (trigger hit?
   target or wrong-if first?) and against the Agentic account's opening trades today (on plan / off plan / none). */
const PLAN_CHECK_TOOL = { name: "plan_check", description: "Check a locked trading plan.",
  input_schema: { type: "object", properties: {
    ok: { type: "boolean", description: "true when the plan is complete and consistent: the wrong-if is on the losing side of the entry, the target on the winning side, the timeframe named, and it fits the Otto Rules." },
    fixes: { type: "array", maxItems: 3, items: { type: "string" }, description: "Only what must change, one short line each. Empty when ok." },
    note: { type: "string", description: "One short line for the pinned plan (e.g. risk:reward, or the Otto Rule it follows)." } }, required: ["ok", "fixes", "note"] } };

export function planValidate(p: any) {
  const ticker = String(p?.ticker || "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8);
  const side = p?.side === "puts" ? "puts" : p?.side === "calls" ? "calls" : "";
  const how = ["break", "hold", "reject"].includes(p?.how) ? p.how : "";
  const tf = ["5m", "10m", "15m"].includes(p?.tf) ? p.tf : "";
  const entry = Number(p?.entry), wrong = Number(p?.wrong_if), target = Number(p?.target);
  const miss: string[] = [];
  if (!ticker) miss.push("the ticker");
  if (!side) miss.push("calls or puts");
  if (!(entry > 0)) miss.push("the entry level");
  if (!how) miss.push("how it triggers (break / hold / reject)");
  if (!tf) miss.push("the candle timeframe");
  if (!(wrong > 0)) miss.push("the wrong-if price");
  if (!(target > 0)) miss.push("the target price");
  if (miss.length) return { ok: false, error: "Fill in " + miss.join(", ") + "." };
  // Calls: target above the entry, wrong-if below it. Puts: the mirror.
  const up = side === "calls";
  if (up ? !(target > entry && wrong < entry) : !(target < entry && wrong > entry))
    return { ok: false, error: up ? "For calls the target must be above the entry and the wrong-if below it." : "For puts the target must be below the entry and the wrong-if above it." };
  const rr = Math.abs(target - entry) / Math.abs(entry - wrong);
  return { ok: true, plan: { ticker, side, entry, how, tf, wrong_if: wrong, target, rr: +rr.toFixed(2), why: String(p?.why || "").slice(0, 300) } };
}
export const planLine = (p: any) => `${p.ticker} ${p.side} · entry ${p.how} ${p.entry} on a ${p.tf} close · wrong if ${p.wrong_if} · target ${p.target} · R:R ${p.rr}`;

export async function prepLock(b: any, who: string) {
  const id = Number(b.id);
  const row = (await db(`otto_prep?select=*&id=eq.${id}`))?.[0];
  if (!row) throw new Error("that read wasn't found");
  if (row.day !== etParts().date) throw new Error("a plan can only be locked on the day of the read");
  const v = planValidate(b);
  if (!v.ok) throw new Error(v.error);
  const plan: any = v.plan;
  let check: any = { ok: true, fixes: [], note: "" };
  try {
    const { sys, live, hits } = await prepContext(`${plan.ticker} ${plan.side} ${plan.how} ${plan.why}`);
    const g = row.grade ? `Jarvis's grade this morning: ${row.grade.letter}. Fix: ${(row.grade.fix || []).join(" | ")}` : "Not graded yet.";
    check = await claudeTool({ model: MODEL, max_tokens: 700, system: [{ type: "text", text: sys + NAME_RULE }, { type: "text", text: PREP_SYS(row.author) + "\n\n" + live }],
      tools: [PLAN_CHECK_TOOL], messages: [{ role: "user", content: `${row.author} is locking today's plan:\n${planLine(plan)}${plan.why ? "\nWhy: " + plan.why : ""}\n\n${g}\n\nOTTO RULES THAT MATCH:\n${hits || "(none)"}\n\nCheck ONLY this plan (not the whole read). Pass it unless something is missing, inconsistent or against the Otto Rules.` }] }, "plan_check", 45_000);
  } catch (e) { check = { ok: true, fixes: [], note: "", skipped: String((e as Error).message).slice(0, 120) }; }
  const fixes = (Array.isArray(check.fixes) ? check.fixes : []).map((x: any) => unname(String(x)).slice(0, 300)).filter(Boolean).slice(0, 3);
  if (!check.ok && fixes.length && !b.force) return { ok: true, locked: false, fixes, plan };
  const prev = row.plan || null;
  // A changed entry: the old plan level comes off the Watcher so it can't fire a card for a plan that no longer exists.
  const moved = !!prev && (Number(prev.entry) !== plan.entry || prev.ticker !== plan.ticker || prev.side !== plan.side);
  if (moved && prev.watch_id)   // only the plan's own level (one the plan added), never someone else's
    await db(`otto_watch?id=eq.${prev.watch_id}&added_by=eq.${encodeURIComponent(`${row.author} · plan`)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "removed" }) }).catch(() => {});
  const w = await watchAdd({ ticker: plan.ticker, level: plan.entry, dir: plan.side === "calls" ? "up" : "down", source: "desk",
    note: `${row.author}'s plan: ${plan.how} ${plan.entry} (${plan.tf}) · wrong if ${plan.wrong_if} · target ${plan.target}`, by: `${row.author} · plan` }).catch(() => null);
  const locked = { ...plan, note: unname(String(check.note || "")).slice(0, 200), fixes_overridden: !check.ok ? fixes : [], locked_at: new Date().toISOString(),
    by: String(b.author || row.author).slice(0, 30), watch_id: w?.id ?? (moved ? null : prev?.watch_id ?? null), changes: (prev?.changes || 0) + (prev ? 1 : 0) };
  await db(`otto_prep?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ plan: locked }) });
  await logDesk("system", "Otto", `📌 ${row.author} ${prev ? "changed" : "locked"} today's plan: ${planLine(locked)}${!check.ok ? " (locked over Jarvis's fixes)" : ""}`);
  void who;
  return { ok: true, locked: true, plan: locked };
}
export async function plansToday() {
  const rows = await db(`otto_prep?select=author,plan,result&day=eq.${etParts().date}&plan=not.is.null`).catch(() => []);
  return (rows || []).filter((r: any) => r.plan).map((r: any) => ({ author: r.author, ...r.plan, line: planLine(r.plan), result: r.result?.plan || null }));
}
// 4:05 PM: the plan against the tape and against the Agentic account's opening trades today.
export function planVsTape(plan: any, bars: Bar[]) {
  const up = plan.side === "calls";
  const hitEntry = (b: Bar) => plan.how === "break" ? (up ? b.c > plan.entry : b.c < plan.entry) : (b.l <= plan.entry && b.h >= plan.entry);
  const i = bars.findIndex(hitEntry);
  if (i < 0) return { trigger: false, outcome: "no trigger" };
  for (const b of bars.slice(i + 1)) {
    const tgt = up ? b.h >= plan.target : b.l <= plan.target, bad = up ? b.l <= plan.wrong_if : b.h >= plan.wrong_if;
    if (tgt && bad) return { trigger: true, trigger_at: bars[i].t, outcome: "both in one bar" };
    if (tgt) return { trigger: true, trigger_at: bars[i].t, outcome: "target" };
    if (bad) return { trigger: true, trigger_at: bars[i].t, outcome: "wrong-if" };
  }
  return { trigger: true, trigger_at: bars[i].t, outcome: "neither by the close" };
}
async function openingTradesToday() {
  const acct = await agenticAccount();
  const since = new Date(Date.parse(nyIso(etParts().date, "9:00 AM") || new Date().toISOString())).toISOString();
  const j = mcpJson(await call("rh", "get_option_orders", { account_number: acct, state: "filled", created_at_gte: since }));
  const out: { sym: string; type: string }[] = [];
  for (const o of j?.data?.orders || []) for (const l of o.legs || []) if (l.position_effect === "open") out.push({ sym: String(o.chain_symbol || "").toUpperCase(), type: l.option_type === "put" ? "puts" : "calls" });
  return out;
}
export function planAdherence(plan: any, trades: { sym: string; type: string }[]) {
  if (!trades.length) return { adherence: "no trade", traded: [] };
  const on = trades.filter((t) => t.sym === plan.ticker && t.type === plan.side);
  const traded = [...new Set(trades.map((t) => `${t.sym} ${t.type}`))];
  return { adherence: on.length === trades.length ? "on plan" : on.length ? "partly off plan" : "off plan", traded };
}

export const unnameForTest = (t: string) => unname(t);
export const signalInForTest = (req: Request) => signalIn(req);

/* --------------------------------------------------------------- transport */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b, null, 2), {
      status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
    });

  // Supabase has already verified the JWT's signature. What it does NOT check
  // is whether the caller is a real signed-in user or just anybody holding the
  // public anon key — and the anon key ships in the app, so without this the
  // published URL would let a stranger burn the market-data and Claude quotas.
  // v3.1 scheduled runs (pg_cron → pg_net). They carry the cron secret, not a user.
  const fn0 = new URL(req.url).searchParams.get("fn") || "";
  if (fn0 === "signal_in") {
    try { return json(await signalIn(req)); }
    catch (e) { const m = String((e as Error).message || e); return json({ ok: false, error: m }, /key/.test(m) ? 401 : 500); }
  }
  if (fn0 === "signal_jarvis") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    background(signalJarvis(Number(new URL(req.url).searchParams.get("batch") || 0)));
    return json({ ok: true, started: "jarvis" }, 202);
  }
  if (fn0 === "alert_jarvis") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const bj = await req.json().catch(() => ({}));
    background(alertJarvis(Array.isArray(bj.fires) ? bj.fires : []));
    return json({ ok: true, started: "alert_jarvis" }, 202);
  }
  // v3.14: the Watcher — every minute 9:30–4:00 ET; the 9:20 scanner; the Scoreboard every 5 minutes.
  if (fn0 === "cron_watch") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const c = marketClock();
    const force = new URL(req.url).searchParams.get("force") === "1";
    background((async () => {
      if (c.status === "open" || force) { try { await watchTick(); } catch (e) { console.error("watch", e); } }
      if (isTradingDay(c.date) && c.min >= 560 && c.min < 570) {
        const s = await setting("watch_scan_day").catch(() => null);
        if (s?.day !== c.date) { await putSetting("watch_scan_day", { day: c.date, by: "starting" }).catch(() => {}); try { await watchScan(); } catch (e) { console.error("scan", e); } }
      }
      if (isTradingDay(c.date) && c.min >= 575 && c.min <= 975 && c.min % 5 === 0) { try { await scoreTick(); } catch (e) { console.error("score", e); } }
      // v3.16: scheduled check-ins, missed card pings, and the 9:10 Signal self-test.
      if (isTradingDay(c.date) && c.min >= 540 && c.min <= 980) {
        try { await checksTick(); } catch (e) { console.error("checks", e); }
        try { await cardSweep(); } catch (e) { console.error("sweep", e); }
      }
      if (isTradingDay(c.date) && c.min >= 550 && c.min < 560) { try { await signalSelfTest(); } catch (e) { console.error("selftest", e); } }
      if (isTradingDay(c.date) && c.min >= 965 && c.min <= 980 && c.min % 5 === 0) { try { await prepGradeTick(); } catch (e) { console.error("prep grade", e); } }   // v3.18
    })());
    return json({ ok: true, started: "watch", clock: c.status }, 202);
  }
  if (fn0 === "check_jarvis") {      // v3.16: a scheduled check-in, as its own run
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const bj = await req.json().catch(() => ({}));
    background(checkJarvis(Number(bj.id)));
    return json({ ok: true, started: "check_jarvis" }, 202);
  }
  if (fn0 === "watch_jarvis") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const bj = await req.json().catch(() => ({}));
    background(watchJarvis(Number(bj.id), bj.d === "down" ? "down" : "up"));
    return json({ ok: true, started: "watch_jarvis" }, 202);
  }
  if (fn0 === "cron_alerts") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const et = etParts();
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && (["Sat", "Sun"].includes(et.wd) || et.min < 540 || et.min > 990)) return json({ ok: true, skipped: et });
    background((async () => {
      try { await watcherCheck(); } catch (e) { console.error("watcher", e); }
      try { await exitsTick(true); } catch (e) { console.error("exits", e); }
      try { await positionReview(); } catch (e) { console.error("review", e); }
      await alertWatch(Deno.env.get("ANTHROPIC_KEY") || "");
    })());
    return json({ ok: true, started: "alerts" }, 202);
  }
  // v3.15: the 5:15 PM daily recap (pg_cron otto-daily-edt/est, 015).
  if (fn0 === "cron_daily") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const et = etParts();
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && (et.min < 1020 || et.min > 1080)) return json({ ok: true, skipped: et });
    background(dailyRecap(force));
    return json({ ok: true, started: "daily" }, 202);
  }
  // v3.15: read-only feedback digest for the nightly bug check. Off unless the OTTO_DIGEST_KEY secret is set.
  if (fn0 === "feedback_digest") {
    const k = Deno.env.get("OTTO_DIGEST_KEY") || "";
    if (k.length < 16 || req.headers.get("x-otto-digest") !== k) return json({ ok: false, error: "not found" }, 404);
    return json({ ok: true, ...(await feedbackDigest()) });
  }
  if (fn0 === "cron_morning" || fn0 === "cron_weekly") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
    const et = etParts();
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (fn0 === "cron_morning") {
      // fires at 12:45 and 13:45 UTC; only the one that lands at 8:45 New York runs
      if (!force && (["Sat", "Sun"].includes(et.wd) || Math.abs(et.min - 525) > 20)) return json({ ok: true, skipped: et });
      background(morningRead(apiKey));
      return json({ ok: true, started: "morning" }, 202);
    }
    if (!force && (et.wd !== "Fri" || Math.abs(et.min - 990) > 20)) return json({ ok: true, skipped: et });
    background((async () => { await weeklyReview(apiKey, "Jarvis (Friday auto)"); await playbookRefresh("Friday review").catch((e) => console.error("playbook", e)); })());
    return json({ ok: true, started: "weekly" }, 202);
  }

  const claims = jwtPayload(req.headers.get("authorization"));
  if (!claims || claims.role !== "authenticated" || !claims.sub) {
    return json({ ok: false, error: "sign in required" }, 401);
  }

  const fn = new URL(req.url).searchParams.get("fn") || "market";

  try {
    // ---- The Desk (v3.0). Locked to OTTO_ALLOWED_EMAILS, never anonymous.
    if (fn === "whoami") {
      return json({ ok: true, email: claims.email || null, anonymous: !!claims.is_anonymous, desk: !!deskUser(claims) });
    }
    if (["desk", "act", "panel", "desk_log", "oauth_start", "oauth_finish", "conn_status", "disconnect",
         "sentiment", "market_desk", "journal", "trade_reason", "review_get", "review_build", "score", "morning_now", "ticket", "limits_get", "limits_set", "house_rules_get", "house_rules_set", "watch_get", "watch_set", "watch_scan", "performance", "help", "jason_today", "jason_sweep", "jason_score",
         "push_key", "push_sub", "push_list", "push_remove", "push_test", "layout_get", "layout_set",
         "signals_feed", "signal_img", "signals_cfg", "signals_cfg_set", "signal_chat", "signal_chat_clear", "selftest_now",
         "playbook_get", "feedback_add", "feedback_list", "daily_now",
         "prep_get", "prep_submit", "prep_reply", "prep_watch", "prep_img", "score_extra", "check_cancel", "prep_lock"].includes(fn)) {
      const who = deskUser(claims);
      if (!who) return json({ ok: false, locked: true,
        error: "The Desk is locked to the Otto login. Sign in with the Otto email (Settings → Sign in)." }, 403);
      const body = req.method === "POST" && fn !== "desk" ? await req.json().catch(() => ({})) : {};

      if (fn === "desk") {
        const apiKey = Deno.env.get("ANTHROPIC_KEY");
        if (!apiKey) return json({ ok: false, error: "ANTHROPIC_KEY secret is not set" }, 500);
        return await desk(req, who, apiKey);
      }
      if (fn === "act") return json({ ok: true, action: await actOn(String(body.id || ""), String(body.decision || ""), who) });
      if (fn === "panel") return json(await panel());
      // ---- v3.1
      if (fn === "sentiment") return json(await sentimentNow(new URL(req.url).searchParams.get("force") === "1"));
      if (fn === "market_desk") return json(await marketDesk());
      if (fn === "journal") return json(await journal(new URL(req.url).searchParams.get("force") === "1"));
      if (fn === "trade_reason") {
        const id = String(body.id || ""), reason = String(body.reason || "").trim().slice(0, 600);
        if (!id) return json({ ok: false, error: "id required" }, 400);
        const r = await db("otto_trades?id=eq." + encodeURIComponent(id), { method: "PATCH",
          body: JSON.stringify({ reason: reason || null, reason_by: who, reason_at: new Date().toISOString() }) });
        return json({ ok: true, row: r?.[0] || null });
      }
      if (fn === "review_get") {
        const r = await db("otto_reviews?select=*&order=week_start.desc&limit=8");
        return json({ ok: true, reviews: r });
      }
      if (fn === "review_build") {
        const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
        return json({ ok: true, review: await weeklyReview(apiKey, who) });
      }
      if (fn === "score") return json(await scorecard());
      // ---- v3.7 Jason's calls
      if (fn === "jason_today") return json(await jasonToday());
      if (fn === "jason_score") return json(await jasonScorecard());
      if (fn === "jason_sweep") return json(await jasonSweep(body, who));
      // ---- v3.8 your layout: one shared layout for the Desk (otto_settings "layout")
      if (fn === "signals_feed") return json(await signalsFeed(Number(new URL(req.url).searchParams.get("days") || 2)));
      if (fn === "signal_img") return json(await signalImg(Number(new URL(req.url).searchParams.get("id") || 0)));
      if (fn === "signals_cfg") return json({ ok: true, cfg: await sigCfg(), beat: await setting("signal_beat") });
      if (fn === "signals_cfg_set") return json({ ok: true, cfg: await signalsCfgSet(body, who) });
      if (fn === "signal_chat") return json(await signalChat(body, who));
      if (fn === "signal_chat_clear") return json(await signalChatClear(who));
      if (fn === "layout_get") return json({ ok: true, layout: await setting("layout") });
      if (fn === "layout_set") return json({ ok: true, layout: await layoutSet(body, who) });
      if (fn === "limits_get") return json({ ok: true, limits: await getLimits() });
      if (fn === "house_rules_get") return json({ ok: true, rules: await houseRules() });
      if (fn === "watch_get") return json(await watchGet());
      if (fn === "watch_set") return json(await watchSet(body, who));
      if (fn === "check_cancel") {      // v3.18: ✕ on a ⏰ chip
        const r = (await db(`otto_checks?id=eq.${Number(body.id) || 0}&status=eq.pending&select=what`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }).catch(() => []))?.[0];
        if (r) await logDesk("system", "Otto", `⏰ Check-in cancelled by ${String(body.author || "the Desk").slice(0, 30)}: ${String(r.what).slice(0, 160)}`);
        return json({ ok: true, cancelled: !!r });
      }
      if (fn === "watch_scan") { background(watchScan(String(body?.author || who.split("@")[0]) + " (Scan now)")); return json({ ok: true, started: "scan" }); }
      if (fn === "house_rules_set") {
        const list = await houseRulesSet(body, who);
        await logDesk("system", "Otto", `📌 House Rules updated by ${String(body?.author || who.split("@")[0]).slice(0, 40)} (${list.length} rule${list.length === 1 ? "" : "s"}). Jarvis follows them from the next message on.`);
        return json({ ok: true, rules: list });
      }
      if (fn === "playbook_get") return json({ ok: true, ...(await playbookGet()) });
      // v3.18: Morning Prep + Score additions
      if (fn === "prep_get") return json(await prepGet(new URL(req.url).searchParams.get("author") || "Ifoma"));
      if (fn === "prep_submit") return json(await prepSubmit(body));
      if (fn === "prep_reply") return json(await prepReply(body));
      if (fn === "prep_watch") return json(await prepWatch(body, who));
      if (fn === "prep_lock") return json(await prepLock(body, who));
      if (fn === "prep_img") return json(await prepImg(Number(new URL(req.url).searchParams.get("id") || 0)));
      if (fn === "score_extra") return json(await scoreExtra());
      if (fn === "feedback_add") return json({ ok: true, ...(await feedbackAdd(body, who)) });
      if (fn === "feedback_list") return json({ ok: true, items: await feedbackList(Number(new URL(req.url).searchParams.get("days")) || 14) });
      if (fn === "daily_now") { background(dailyRecap(true)); return json({ ok: true, started: true }); }
      if (fn === "push_key") return json({ ok: true, key: (await vapid()).pub });
      if (fn === "push_sub") return json({ ok: true, ...(await pushSubscribe(body, who)) });
      if (fn === "push_list") return json({ ok: true, ...(await pushList(String(body?.endpoint || ""))) });
      if (fn === "push_remove") return json(await pushRemove(body));
      if (fn === "push_test") return json(await pushTest(body));
      if (fn === "limits_set") return json({ ok: true, limits: await setLimits(body, who) });
      if (fn === "performance") return json(await performance(Deno.env.get("ANTHROPIC_KEY") || "", new URL(req.url).searchParams.get("read") !== "0", new URL(req.url).searchParams.get("fresh") === "1"));
      if (fn === "help") return json({ ok: true, text: await helpAnswer(body, Deno.env.get("ANTHROPIC_KEY") || "") });
      if (fn === "ticket") return json({ ok: true, action: await orderTicket(body, who, String(body.author || "Ifoma").slice(0, 30)) });
      if (fn === "selftest_now") return json(await signalSelfTest(true));     // v3.16: run the Signal self-test on demand
      if (fn === "morning_now") {
        const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
        background(morningRead(apiKey));
        return json({ ok: true, started: true });
      }
      if (fn === "desk_log") {
        const since = Number(new URL(req.url).searchParams.get("since")) || 0;
        // v3.12: alert rows live in their own tab, so the first load fetches chat and alerts separately —
        // a busy alert day never pushes the conversation out of view.
        const cols = "otto_desk?select=id,created_at,role,author,content,action_id";
        const AL = "(" + ["TradingView", "Jarvis · alert read"].map((x) => '"' + x + '"').join(",") + ")";
        const rows = since ? await db(cols + "&id=gt." + since + "&order=id.asc&limit=100")
          : [...await db(cols + "&author=not.in." + encodeURIComponent(AL) + "&order=id.desc&limit=80"),
             ...await db(cols + "&author=in." + encodeURIComponent(AL) + "&order=id.desc&limit=60")];
        const list = since ? rows : rows.sort((x: any, y: any) => x.id - y.id);
        const extra = (new URL(req.url).searchParams.get("acts") || "").split(",")
          .filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 30);
        const ids = [...new Set([...list.map((r: any) => r.action_id).filter(Boolean), ...extra])];
        const acts = ids.length ? await db("otto_actions?select=*&id=in.(" + ids.join(",") + ")") : [];
        return json({ ok: true, rows: list, actions: acts.map(publicAction) });
      }
      if (fn === "oauth_start") {
        const service = String(body.service || "");
        return json({ ok: true, url: await oauthStart(service, who), paste: !!SVC[service]?.redirect });
      }
      if (fn === "oauth_finish") {
        const service = await oauthFinish(String(body.code || ""), String(body.state || ""), who);
        let tools = 0, warn = null;
        try { tools = (await mcpTools(service)).length; } catch (e) { warn = (e as Error).message; }
        await logDesk("system", "Otto", `${SVC[service].name} connected by ${who}`);
        return json({ ok: true, service, name: SVC[service].name, tools, warn });
      }
      if (fn === "conn_status") {
        const rows = await db("otto_conn?select=service,connected_by,connected_at,updated_at");
        return json({ ok: true, conn: rows });
      }
      if (fn === "disconnect") {
        const s = String(body.service || "");
        if (!SVC[s]) return json({ ok: false, error: "unknown service" }, 400);
        await db("otto_conn?service=eq." + s, { method: "DELETE" });
        delete TOK[s]; delete MSESS[s];
        return json({ ok: true });
      }
    }

    if (fn === "market") {
      const { quotes, errors } = await fetchQuotes();
      return json({ ok: true, source: "yahoo", served: Math.floor(Date.now() / 1000),
        quotes, errors });
    }

    if (fn === "brain") {
      return json({ ok: true, calls: await loadBrain() });
    }

    // One-shot: copy the corpus out of the public repo into Postgres, so
    // Jason's transcripts stop being readable by anyone with the URL. Run once,
    // then delete brain-latest.json from the repo. Idempotent — re-running just
    // writes another version row, and the newest wins.
    if (fn === "seed") {
      const base = Deno.env.get("SUPABASE_URL");
      const svc  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!base || !svc) return json({ ok: false, error: "service role not available" }, 500);

      // POST a JSON array of week files to seed directly; GET still copies the
      // public repo file, for as long as that file exists.
      let payload: any = null;
      if (req.method === "POST") {
        payload = await req.json().catch(() => null);
      } else {
        const src = await fetch("https://proagentmax.github.io/otto-trader/brain-latest.json");
        if (!src.ok) return json({ ok: false, error: "public copy not reachable (already deleted?)" }, 502);
        payload = await src.json();
      }
      if (!Array.isArray(payload) || !payload.length) {
        return json({ ok: false, error: "that did not look like a corpus" }, 502);
      }

      const ins = await fetch(base + "/rest/v1/brain_versions", {
        method: "POST",
        headers: { apikey: svc, authorization: "Bearer " + svc,
                   "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ notes: req.method === "POST" ? "seeded by POST" : "seeded from the public repo copy", payload }),
      });
      if (!ins.ok) return json({ ok: false, error: "insert failed: " + (await ins.text()).slice(0, 200) }, 502);
      const row = await ins.json();
      BRAIN = null;                                   // drop the cached copy
      return json({ ok: true, seeded: payload.length,
                    version: Array.isArray(row) && row[0] ? row[0].version : null });
    }

    // A plain, non-streaming Claude call for the app's smaller jobs: drafting
    // Josh's email to Jason, and reading a raw .vtt into a week file. Same key,
    // same place, so there is still nothing to configure on a device.
    if (fn === "write") {
      const apiKey = Deno.env.get("ANTHROPIC_KEY");
      if (!apiKey) return json({ ok: false, error: "ANTHROPIC_KEY secret is not set" }, 500);
      const b = await req.json().catch(() => ({}));
      if (!b.system || !b.user) return json({ ok: false, error: "system and user required" }, 400);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey,
                   "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: Math.min(Number(b.max_tokens) || 1200, 8000),
          system: String(b.system).slice(0, 60000),
          messages: [{ role: "user", content: String(b.user).slice(0, 200000) }],
        }),
      });
      const j = await r.json();
      if (j.error) return json({ ok: false, error: j.error.message || "API error" }, 502);
      return json({ ok: true, text: (j.content || []).filter((c: any) => c.type === "text")
                                    .map((c: any) => c.text).join("") });
    }

    // The morning plan of attack, graded. Non-streaming, optionally with a
    // chart screenshot (base64). Same corpus, same refusals as the Coach.
    if (fn === "plan") {
      const apiKey = Deno.env.get("ANTHROPIC_KEY");
      if (!apiKey) return json({ ok: false, error: "ANTHROPIC_KEY secret is not set" }, 500);
      const b = await req.json().catch(() => ({}));
      const plan = (b && b.plan) || {};
      if (!plan.sym && !plan.notes) return json({ ok: false, error: "plan is empty" }, 400);
      const img = b.image && typeof b.image.data === "string" && b.image.data.length > 100 ? b.image : null;
      if (img && img.data.length > 6_000_000) return json({ ok: false, error: "image too large" }, 400);
      const calls = await loadBrain();
      const cs = chunksOf(calls);
      // three searches, deliberately different wording — the plan's own words,
      // the entry mechanics, and the standing risk rules — merged and deduped
      const queries = [
        `${plan.sym || ""} ${plan.notes || ""} ${plan.why || ""}`.slice(0, 400),
        `${plan.sym || ""} entry level reclaim box gap confirmation first red candle expansion`,
        "swing binary event NFP earnings expiry Friday Tuesday P&L chart catalyst indicators mindset",
      ];
      const seen = new Set<string>(); const hits: Chunk[] = [];
      for (const q of queries) for (const h of search(cs, q, 10)) {
        const k = h.d + "|" + h.at + "|" + h.s.slice(0, 50);
        if (!seen.has(k)) { seen.add(k); hits.push(h); }
      }
      const sys = PLAN_SYS.replace("{{RULES}}", alwaysOn(calls))
                          .replace("{{MATERIAL}}", hits.slice(0, 24).map(fmt).join("\n\n"));
      const content: any[] = [];
      if (img) content.push({ type: "image", source: { type: "base64",
        media_type: /^image\/(jpeg|png|webp|gif)$/.test(img.media_type) ? img.media_type : "image/jpeg", data: img.data } });
      content.push({ type: "text", text: planText({ ...plan, hasImage: !!img }) });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1500,
          system: [{ type: "text", text: sys + NAME_RULE, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
        }),
      });
      const j = await r.json();
      if (j.error) return json({ ok: false, error: j.error.message || "API error" }, 502);
      return json({ ok: true, text: (j.content || []).filter((c: any) => c.type === "text")
                                    .map((c: any) => c.text).join(""), retrieved: hits.length });
    }

    // Jason's six-step routine, live, no key on the device. ?watch=WMT,TGT,... for step 5.
    if (fn === "routine") {
      const watch = (new URL(req.url).searchParams.get("watch") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25);
      return json(await routine(watch));
    }

    // The story behind the numbers — Claude with web search, cached 10 minutes.
    if (fn === "news") {
      const apiKey = Deno.env.get("ANTHROPIC_KEY");
      if (!apiKey) return json({ ok: false, error: "ANTHROPIC_KEY secret is not set" }, 500);
      if (NEWS_CACHE && Date.now() - NEWS_CACHE.at < 600_000) return json({ ok: true, text: NEWS_CACHE.text, at: NEWS_CACHE.at, cached: true });
      const text = await whatsMoving(apiKey);
      NEWS_CACHE = { at: Date.now(), text };
      return json({ ok: true, text, at: NEWS_CACHE.at });
    }

    if (fn === "chat") {
      const apiKey = Deno.env.get("ANTHROPIC_KEY");
      if (!apiKey) return json({ ok: false, error: "ANTHROPIC_KEY secret is not set" }, 500);
      const calls = await loadBrain();
      const sys = SYSTEM.replace("{{RULES}}", alwaysOn(calls));
      return await chat(req, sys, chunksOf(calls), apiKey);
    }

    return json({ ok: false, error: "unknown fn" }, 400);
  } catch (e) {
    // Never fabricate. The app is built to say "not enough" rather than guess.
    return json({ ok: false, error: String((e as Error).message ?? e).slice(0, 300) }, 502);
  }
});

// test hooks (v3.20)
export const placeStopForTest = placeStop;
export const deskSetupForTest = deskSetup;

export const closeNowForTest = closeNow;
