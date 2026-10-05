// Otto Trader — server side. One Edge Function.
//
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
  "access-control-allow-headers": "authorization,apikey,content-type",
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
              system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
              messages: msgs,
            }),
          });
          if (!r.ok || !r.body) throw new Error("claude HTTP " + r.status + " " + (await r.text()).slice(0, 200));

          let stop = "", text = "";
          const blocks: any[] = [];
          const reader = r.body.getReader(), dec = new TextDecoder();
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
  try {
    const j = await tokenPost(service, { grant_type: "refresh_token", refresh_token: t.refresh_token,
      client_id: row.client_id, resource: SVC[service].resource });
    return (await saveTokens(service, row.client_id, j, t)).access_token;
  } catch (e) {
    throw new NotConnected(SVC[service].name + " sign-in expired — reconnect in Settings → Connections (" + (e as Error).message + ")");
  }
}

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
  });
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
async function call(service: string, tool: string, args: any) {
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

async function proposeAction(input: any, who: string, opts: { manual?: boolean } = {}) {
  const calls = Array.isArray(input.calls) ? input.calls.slice(0, 6) : [];
  if (!calls.length) throw new Error("no calls");
  // v3.1: an opening option order must carry its plan, so the scorecard can grade it.
  const opening = calls.some((c: any) => c.tool === "place_option_order" && (c.args?.legs || []).some((l: any) => l.position_effect === "open"));
  const plan = input.plan && typeof input.plan === "object" ? input.plan : null;
  // v3.4: ...and its exits. No exits, no card (Jarvis and the manual ticket alike).
  if (opening && (!plan || !plan.tv_symbol || !plan.direction || !plan.setup || plan.tp1 == null || plan.stop == null || !(Number(plan.stop_option) > 0))) {
    throw new Error("An opening option order needs its plan and exits: {tv_symbol (EXCHANGE:TICKER), direction ('up'|'down' on the underlying), setup, tp1, stop (underlying prices), stop_option (OPTION price for the protective stop, below the limit), entry_underlying?, expires? (YYYY-MM-DD)}. Add it and propose again.");
  }
  void opts;
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
    out.push({ service, tool, args });
  }
  const exit = opening ? exitSpec(out, plan) : null;
  let account_value: number | null = null;
  if (out.some((c) => c.service === "rh" && c.tool.startsWith("place_"))) {
    try {
      const pj = mcpJson(await call("rh", "get_portfolio", { account_number: await agenticAccount() }));
      account_value = Number(pj?.data?.total_value ?? pj?.total_value) || null;
    } catch { /* shown as unknown */ }
  }
  const pct = account_value && costKnown ? cost / account_value : null;
  const LIM = await getLimits().catch(() => LIMIT_DEFAULTS);
  const risk = {
    cost: costKnown ? cost : null, account_value, pct, warn_pct: LIM.warn_pct,
    flag: pct !== null && pct > LIM.warn_pct / 100, notes, account: out.some((c) => c.service === "rh") ? mask(await agenticAccount().catch(() => "????")) : null,
  };
  let banner: any = null, checks: any[] = [];
  if (opening) {
    try { const b = await sentimentNow(); banner = { verdict: b.verdict, score: b.score, fresh: b.fresh, at: b.at }; } catch { /* */ }
    try { checks = await ruleChecks(out, plan, risk, banner); } catch (e) { checks = [{ ok: null, text: "Rule check failed: " + (e as Error).message }]; }
    try { checks = checks.concat(await limitChecks(risk.cost)); } catch { /* */ }
    if (exit) {
      const atStop = (exit.entry_limit - exit.stop_option) * 100 * exit.qty;
      checks.push({ ok: atStop <= LIM.max_trade_loss, text: `If the stop fills at $${exit.stop_option.toFixed(2)}: about −$${atStop.toFixed(0)} (limit $${LIM.max_trade_loss}). Option stops can fill lower on a fast move.` });
    }
  }
  const rows = await db("otto_actions", { method: "POST", body: JSON.stringify({
    title: String(input.title || "Action").slice(0, 140),
    summary: String(input.summary || "").slice(0, 4000),
    calls: out, risk, review: review.join("\n\n---\n\n"), status: "pending", created_by: who,
    plan: plan ? { ...plan, setup: String(plan.setup).toLowerCase().slice(0, 40) } : null, banner, checks,
    ...(exit ? { exit: { ...exit, state: "planned", log: [] } } : {}),
  }) });
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
      body: JSON.stringify({ role, author: author.slice(0, 40), content: content.slice(0, 20000), action_id }) });
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

async function settle<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; error: string }> {
  try { return { ok: true, v: await p }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function panel() {
  const conns = await db("otto_conn?select=service,connected_by,connected_at,updated_at").catch(() => []);
  const has = (s: string) => conns.some((c: any) => c.service === s);
  const out: any = { ok: true, at: Date.now(), conn: { tv: has("tv"), rh: has("rh") } };

  const tvPart = async () => {
    if (!has("tv")) return;
    const wl = await settle((async () => mcpJson(await call("tv", "mcp-watchlist-get-active-watchlist", {})))());
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
    } else out.watchlist_error = wl.error;
    const syms = [...new Set([...MACRO.map((m) => m.sym), ...wsyms])];
    // v3.1: quotesFor() falls back to OHLCV bars when the screener is rate-limited (429).
    const q = await settle(quotesFor(syms));
    if (q.ok) out.quotes = { data: Object.entries(q.v).map(([symbol, v]: any) => ({ symbol, close: v.close, change: v.change })) };
    else out.quotes_error = q.error;
    out.macro = MACRO; out.watch = wsyms;
    const al = await settle((async () => mcpJson(await call("tv", "mcp-tv-list-alerts", { active: true })))());
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

  await Promise.all([settle(tvPart()), settle(rhPart())]);
  if (!out.quotes) {                      // TradingView not connected: fall back to the free quotes
    const fq = await settle(fetchQuotes());
    if (fq.ok) out.fallback_quotes = fq.v.quotes;
  }
  const pend = await settle(db("otto_actions?status=in.(pending,running)&order=created_at.desc&limit=10&select=*"));
  out.pending = pend.ok ? pend.v.map(publicAction) : [];
  const ex = await settle(db("otto_actions?select=id,title,exit,created_at&exit->>state=in.(waiting_fill,armed,closed,dead)&order=created_at.desc&limit=8"));
  out.exits = ex.ok ? ex.v.filter((r: any) => ["waiting_fill", "armed"].includes(r.exit.state) ||
    Date.now() - Date.parse(r.exit.closed_at || r.created_at) < 18 * 3600e3).slice(0, 5) : [];
  if (has("rh") && out.exits.some((r: any) => ["waiting_fill", "armed"].includes(r.exit.state))) background(exitsTick());
  return out;
}

/* ------------------------------------------------------------ the Desk chat */

const DESK_SYS = `You are Jarvis, the AI on the trading desk inside Otto Trader. If asked your name, you are Jarvis; your judgment is built on Jason Murray's method (his mentorship calls). You sit between three things:
- Jason Murray's method (his recorded mentorship calls) — the judgment. Search it with search_jason.
- TradingView (Ifoma's paid account) — market data, watchlists, alerts. Tools named tv__…
- Robinhood — positions and orders. Tools named rh__…. Orders only ever go to the Robinhood Agentic account; the server enforces that, you don't pick the account.

You're talking with Ifoma (the trader; it's his money) and sometimes Josh (his son, learning alongside him, same login, same authority). Each message is prefixed with who wrote it when known. Talk like a trading partner at the next desk: direct, numbers first, caveat second. Short paragraphs. No hype, no congratulating; say plainly when a trade is a bad idea.

HOW ACTIONS WORK — THE ONE HARD RULE
You can READ anything with the tv__ and rh__ tools, as often as you need. You can NEVER change anything yourself. To place, cancel, or change an order, or create/edit/delete an alert or watchlist entry, call propose_action with the exact calls. That puts an Approve / Reject card in front of them; nothing happens until a human clicks Approve. After proposing, say in one line what the card does — never say an order "is placed" or "went through" until you see the result (the app will post it).
- Before proposing an option order: get the chain (rh__get_option_chains → rh__get_option_instruments) for the real option_id, check the quote (rh__get_option_quotes), and use a limit price. The server runs Robinhood's review and computes the risk vs the Agentic account.
- One idea = one card. Several suggestions at once = several cards, each with its own title.
- Don't propose new TradingView alerts or Jason-level alerts unless they explicitly ask for one. For now the desk shows prices only.
- Every OPENING option card must include plan {tv_symbol, direction, setup, tp1, stop, stop_option, entry_underlying, expires}. stop_option is the OPTION price that triggers the protective stop (below your limit price); size it so (limit − stop_option) × 100 × contracts stays inside their max loss per trade. Approving the card approves its exits too: once the buy fills, Otto itself places a stop_market sell-to-close at stop_option (re-placed every morning — Robinhood stop orders are day orders) and two TradingView alerts on the stock (wrong-if = plan.stop on a 15-minute close, TP1 on touch), and puts up a close card when one fires. So never propose a separate stop order or alerts for that trade, and only one single-leg buy per opening card. To close a protected trade early, include rh cancel_option_order for its stop_order_id (listed in the desk context) BEFORE the sell, in the same card. The server runs a rule check (first 30 minutes, delta 30–40, volume > OI, 20%, expiry, binary events, earnings, banner) and shows it on the card; read its result back and mention any failed check in one line.

THE SENTIMENT BANNER
The app shows a live banner built from Josh's Intermarket Sentiment Cheat Sheet on TradingView data (10Y, DXY, USD/JPY, crude, ES/NQ/YM). Its current verdict is in the desk context line. It is Josh's sheet, not Jason's: where it disagrees with Jason (Josh's sheet trades the 9:30 opening range; Jason says no first 30 minutes) say so and don't pick. Never attach Josh's sheet sizing ($15 / 15%) to anything — sizing is only the 20% check.

THE ORDER TICKET (put this in the card's summary, plain text)
Underlying / contract · Side / qty / type / limit · Max risk ($ and % of the account; ⚠ if over 20%) · Entry trigger · Stop / exit · Targets (TP1 / TP2 / runner) · Jason basis (rule, call date, MM:SS) · Not from Jason (anything you added).
Over 20% of the account is a warning, never a block — they can still approve. Jason called ~40% of the account in one trade "crazy" (1 Oct 2026).

FETCH, DON'T ASSUME
Every price, position, and buying-power figure you state comes from a tool call in this conversation. Jason's levels are dated marks from a call, never current prices — say the call date when you use one. If a connector isn't connected, say so in one line (Settings → Connections) and do what you can without it.

SAY WHEN JASON HASN'T COVERED SOMETHING
He has never taught a stop rule for these option trades beyond the entry-candle exit, never given a 2026 options sizing number, and never given a full exit plan beyond TP1/TP2/runners. When one of those decides the trade, give your best answer and label it as yours.

JASON'S METHOD (2026 stock options) — summary; search_jason for exact wording and timestamps
- Backdrop first: 10-year (cost of capital), crude (cost of transportation), USD/JPY (cost of currency). Rising rates → algorithms sell; restrictive rates → money hides in staples, health care, communications. Seasonality: September sell first; October rough early, strong late. Never swing into a binary event (NFP, earnings, Fed).
- Instruments: SPY, QQQ, one Mag-7 name. More than one catalyst; the chart is not a catalyst. 3+ indicators agreeing is workable, 5 you take to the bank. No trading inside a trap zone; a $3 box is not a trade.
- Entries: shorts at resistance, cover at support; longs the mirror ("where I'm covering, you're trying to enter", 1 Oct). Mark zones before the move. In this rate environment play rejections more than bounces. Daily double top or below a big unrecovered gap → scalps only. Never chase a missed fill. Not the first 30 minutes.
- Contract: delta 30–40, volume > open interest; at the money by default, up to two strikes out only if at the screen. After Wednesday don't buy this Friday's; use next week's while learning. Check theta as % of premium before swinging.
- Managing: TP at the first marked level, keep a runner, stop the runner if it doesn't come. Exit if price closes back through the open of the entry candle; on short-dated options the first red candle is the exit. Watch the chart, not the P&L. Weekly goals, not daily.
- Older frames (April 2024 options: 20% max, 2/5/10 contracts, spreads 60+ days; Aug 2026 ES futures: one contract) — never mix in without saying where they came from.

CHARTS
When they paste a chart, read it: timeframe, trend, the zones they drew, where price is vs those zones, and grade the idea against the method. Then check it against live data before any ticket.

JASON'S STANDING RULES AND SETUPS (always in front of you):
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
          stop: { type: "number", description: "Underlying price that proves the idea wrong (your exit level) — Otto alerts on a 15-minute close through it" },
          stop_option: { type: "number", description: "OPTION price (per share, below the limit) where Otto's protective stop_market sell-to-close triggers. Otto places it after the fill." },
          expires: { type: "string", description: "Option expiration YYYY-MM-DD" },
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
      const list = await mcpTools(s);
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

type DeskRun = { msgs: any[]; sys: string; tools: any[]; cs: Chunk[]; who: string; send: (o: any) => void; allowPropose: boolean; maxRounds?: number };

// The tool loop, shared by the live Desk (streamed) and the 8:45 run (silent).
async function runDesk(o: DeskRun): Promise<{ said: string; cards: string[] }> {
  const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
  const { msgs, sys, tools, cs, who, send } = o;
  let said = "";
  const cards: string[] = [];
  for (let round = 0; round < (o.maxRounds || 12); round++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 2500, stream: true, tools,
        system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
        messages: msgs,
      }),
    });
    if (!r.ok || !r.body) throw new Error("claude HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    let stop = "";
    const blocks: any[] = [];
    const reader = r.body.getReader(), dec = new TextDecoder();
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
          if (ev.delta.type === "text_delta") { b.text += ev.delta.text; said += ev.delta.text; send({ t: "text", v: ev.delta.text }); }
          else if (ev.delta.type === "input_json_delta") b.input += ev.delta.partial_json;
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stop = ev.delta.stop_reason;
        }
      }
    }
    if (stop !== "tool_use") break;

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
          send({ t: "tool", v: "Jason: " + q });
          const hits = search(cs, q);
          content = hits.length ? hits.map(fmt).join("\n\n") : "NOTHING FOUND for that wording. Try different words.";
        } else if (b.name === "propose_action") {
          if (!o.allowPropose) throw new Error("no cards in this run");
          send({ t: "tool", v: "Preparing card: " + String(input.title || "") });
          const card = await proposeAction(input, who);
          cards.push(card.id);
          send({ t: "action", v: card });
          content = `Card ${card.id} is on screen, status pending. Nothing has run. ` +
            `Risk: ${JSON.stringify(card.risk)}. Rule check: ${JSON.stringify(card.checks || [])}. Robinhood review: ${(card.review || "n/a").slice(0, 1500)}`;
        } else {
          const m = /^(tv|rh)__(.+)$/.exec(b.name);
          if (!m || !READ[m[1]].has(m[2])) throw new Error("unknown tool " + b.name);
          const args = { ...input };
          if (m[1] === "rh" && RH_FORCE_ACCT.has(m[2])) args.account_number = await agenticAccount();
          send({ t: "tool", v: SVC[m[1]].name + ": " + m[2].replace(/^mcp-(tv|watchlist)-/, "") });
          content = mcpText(await call(m[1], m[2], args)).slice(0, 30000);
        }
      } catch (e) {
        isErr = true; content = "ERROR: " + (e as Error).message;
      }
      results.push({ type: "tool_result", tool_use_id: b.id, content: content || "(empty)", ...(isErr ? { is_error: true } : {}) });
    }
    msgs.push({ role: "assistant", content: assistant });
    msgs.push({ role: "user", content: results });
  }
  return { said, cards };
}

async function desk(req: Request, who: string, _apiKey: string) {
  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!history.length) throw new Error("no messages");
  const author = String(body.author || "Ifoma").slice(0, 30);

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
  ];
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const bn = sent.ok ? `Banner: ${sent.v.verdict} (score ${sent.v.score}, ${sent.v.fresh}/${sent.v.total} legs fresh; fired: ${sent.v.rows.filter((r: any) => r.fired).map((r: any) => "row " + r.row).join(", ") || "none"}).` : "Banner: unavailable.";
  const LIM = await getLimits().catch(() => LIMIT_DEFAULTS);
  const prot = await settle(db("otto_actions?select=title,exit&exit->>state=in.(waiting_fill,armed)&limit=5"));
  const protLine = prot.ok && prot.v.length ? " Protected trades (Otto runs their stop and alerts; to close one early, cancel_option_order its stop_order_id first, then sell, in one card): " +
    prot.v.map((r: any) => `${r.title} [${r.exit.state}${r.exit.stop_order_id ? `, stop_order_id ${r.exit.stop_order_id} at $${r.exit.stop_option}` : ""}, wrong-if ${r.exit.wrong_if}, TP1 ${r.exit.tp1}]`).join("; ") + "." : "";
  const ctxLine = `[Desk context — ${now} ET. TradingView: ${status.tv}. Robinhood: ${status.rh}. ${bn} Their own limits (Phase ${LIM.phase}): max loss per trade $${LIM.max_trade_loss}, weekly loss limit $${LIM.weekly_loss}, ${LIM.max_trades_day} trades/day, warn over ${LIM.warn_pct}% of the account — size ideas inside these and say so when an idea would break one.${protLine}]`;

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
  await logDesk("user", author, String(last.content || "") + (last.image ? "\n[chart attached]" : ""));

  const encS = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => { try { ctrl.enqueue(encS.encode("data: " + JSON.stringify(o) + "\n\n")); } catch { /* client left */ } };
      let res = { said: "", cards: [] as string[] };
      try {
        res = await runDesk({ msgs, sys, tools, cs, who, send, allowPropose: true });
        send({ t: "done" });
      } catch (e) {
        send({ t: "error", v: String((e as Error).message ?? e).slice(0, 300) });
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

async function legData(l: any) {
  let tv: any = null, tvErr = "";
  try { tv = await tvLeg(l); } catch (e) { tvErr = String((e as Error).message ?? e).slice(0, 160); }
  if (tv && tv.live) return tv;
  let y: any = null, yErr = "";
  try { y = await yahooLeg(l); } catch (e) { yErr = String((e as Error).message ?? e).slice(0, 160); }
  // Yahoo only replaces TradingView when TradingView failed or Yahoo is fresher.
  if (y && (!tv || y.age < tv.age)) return { ...y, tv_error: tvErr || (tv ? `TradingView bar ${Math.round(tv.age / 60)} min old` : "") };
  if (tv) return yErr ? { ...tv, yahoo_error: yErr } : tv;
  throw new Error(`TradingView: ${tvErr || "no data"} · Yahoo: ${yErr || "no data"}`);
}

async function sentimentNow(force = false, kind = "live"): Promise<any> {
  if (!force && SENT && Date.now() - SENT.at < 4 * 60e3) return SENT.body;
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
  try { calendar = await econEvents(now.date, now.date, 0); } catch { /* shown as unavailable */ }
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

async function ruleChecks(out: any[], plan: any, risk: any, banner: any) {
  const checks: any[] = [];
  const add = (ok: boolean | null, text: string) => checks.push({ ok, text });
  const open = out.find((c) => c.tool === "place_option_order" && (c.args.legs || []).some((l: any) => l.position_effect === "open"));
  if (!open) return checks;
  const now = etParts();
  if (["Sat", "Sun"].includes(now.wd) || now.min < 570 || now.min >= 960) add(null, "Market closed now: this waits for the open, and Jason says not the first 30 minutes");
  else if (now.min < 600) add(false, "Inside the first 30 minutes (Jason: stand down until 10:00)");
  else add(true, `Past the first 30 minutes (${fmtMin(now.min)} ET)`);

  const leg = open.args.legs.find((l: any) => l.position_effect === "open");
  let q: any = null, ins: any = null;
  try { ins = (mcpJson(await call("rh", "get_option_instruments", { ids: leg.option_id }))?.data?.instruments || [])[0] || null; } catch { /* */ }
  try { q = (mcpJson(await call("rh", "get_option_quotes", { instrument_ids: [leg.option_id] }))?.data?.results || [])[0]?.quote || null; } catch { /* */ }
  if (q?.delta != null) { const d = Math.abs(Number(q.delta)); add(d >= 0.30 && d <= 0.40, `Delta ${d.toFixed(2)} (Jason: 0.30–0.40)`); }
  else add(null, "Delta: couldn't read the quote");
  if (q?.volume != null && q?.open_interest != null) add(Number(q.volume) > Number(q.open_interest), `Volume ${q.volume} vs open interest ${q.open_interest} (Jason: volume > OI)`);
  else add(null, "Volume vs open interest: not available");
  if (risk?.pct != null) add(risk.pct <= (risk.warn_pct || 20) / 100, `${Math.round(risk.pct * 100)}% of the account (flag above ${risk.warn_pct || 20}%)`);
  else add(null, "Size vs account: unknown (no limit price)");

  const exp = ins?.expiration_date || null;
  if (exp) {
    const days = dayDiff(now.date, exp);
    if (days <= 0) add(false, "Expires today (0DTE)");
    else if (["Thu", "Fri"].includes(now.wd) && exp === fridayOf(now.date)) add(false, "This Friday's expiry after Wednesday (Jason: use next week's)");
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
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys,
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

async function evalIdea(a: any) {
  const p = a.plan || {};
  const tp1 = Number(p.tp1), stop = Number(p.stop);
  if (!p.tv_symbol || !isFinite(tp1) || !isFinite(stop) || !p.direction) return { state: "unscored" };
  const created = Date.parse(a.created_at);
  if (Date.now() - created < 10 * 60e3) return { state: "pending" };
  let bars: any[];
  try { bars = await tvBars(p.tv_symbol, "5m", 1500); } catch { return { state: "pending" }; }
  const after = bars.filter((b) => b.t * 1000 >= created - 5 * 60e3);
  if (!after.length) return { state: "pending" };
  const entry = Number(p.entry_underlying) || after[0].o;
  const risk = Math.abs(entry - stop), reward = Math.abs(tp1 - entry);
  if (!risk) return { state: "unscored" };
  const down = p.direction === "down";
  for (const b of after) {
    const hitStop = down ? b.h >= stop : b.l <= stop;
    const hitTp = down ? b.l <= tp1 : b.h >= tp1;
    if (hitStop) return { state: "loss", r: -1, at: b.t };
    if (hitTp) return { state: "win", r: +(reward / risk).toFixed(2), at: b.t };
  }
  const deadline = Math.min(Date.parse((p.expires || "2999-01-01") + "T20:00:00Z"), created + 7 * 864e5);
  if (Date.now() > deadline) {
    const last = after[after.length - 1].c;
    return { state: "scratch", r: +(((down ? entry - last : last - entry) / risk)).toFixed(2), at: after[after.length - 1].t };
  }
  return { state: "open" };
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
    recent: ideas.slice(0, 25).map((a: any) => ({ id: a.id, title: a.title, at: a.created_at, status: a.status,
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

Write today's morning read for Ifoma and Josh (Workflow 1): one line each for the 10-year, crude, USD/JPY; any binary event today; SPY/QQQ and Mag-7 tone (fetch what you need); a bias that agrees with or explains any disagreement with the banner; and the 2–3 setups worth watching from the TradingView watchlist with the trigger level for each. Jason's levels are dated marks — say the call date. No order cards. Under 250 words.`;
  const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools, cs, who: "cron", send: () => {}, allowPropose: false, maxRounds: 8 });
  if (res.said.trim()) await logDesk("assistant", "Jarvis · 8:45 auto", res.said.trim());
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
    side === "buy_open" && plan ? `Exits (Otto sets them)  stop on the option at $${Number(plan.stop_option).toFixed(2)} · alerts at ${plan.stop} (15-min close) and ${plan.tp1}` : "",
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
async function alertWatch(apiKey: string) {
  const j = mcpJson(await call("tv", "mcp-tv-get-alerts-log", { days: 1, limit: 50 }));
  const events: any[] = j?.events || j?.data?.events || [];
  if (!events.length) return { ok: true, fired: 0 };
  const keyOf = (e: any) => [e.alert_id ?? e.id ?? e.name ?? "", e.fire_time ?? e.time ?? e.timestamp ?? e.fired_at ?? e.created ?? ""].join("|");
  const keys = events.map(keyOf);
  const seen = await db("otto_alert_fires?select=key&key=in.(" + encodeURIComponent(keys.map((k) => '"' + k.replace(/"/g, "") + '"').join(",")) + ")").catch(() => []);
  const have = new Set(seen.map((r: any) => r.key));
  const fresh = events.filter((e, i) => !have.has(keys[i]));
  if (!fresh.length) return { ok: true, fired: 0 };
  await db("otto_alert_fires?on_conflict=key", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(fresh.map((e) => ({ key: keyOf(e), payload: e }))) });
  // First run ever: just remember the backlog, don't flood the Desk.
  const total = await db("otto_alert_fires?select=key&limit=60");
  if (total.length <= fresh.length && fresh.length > 3) return { ok: true, fired: 0, primed: fresh.length };
  const recentReads = await db("otto_desk?select=id&author=eq.Jarvis%20%C2%B7%20alert%20read&created_at=gte." + new Date(Date.now() - 3600e3).toISOString()).catch(() => []);
  let reads = recentReads.length;
  for (const e of fresh.slice(0, 5)) {
    const name = e.name || e.alert_name || "", sym = e.symbol || e.ticker || "", msg = e.message || "";
    const line = `🔔 TradingView alert fired: ${name || sym}${msg && msg !== name ? " — " + msg : ""}`;
    await logDesk("system", "TradingView", line.slice(0, 500));
    if (/^Otto ·/.test(name)) continue;           // v3.4: the exit engine handles its own alerts
    if (reads >= 6) continue;                     // cap the reads, never the log lines
    reads++;
    const calls = await loadBrain();
    const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
    const { tools: mcpToolDefs } = await deskTools();
    const prompt = `[A TradingView alert just fired — no one typed this.] ${JSON.stringify({ name, symbol: sym, message: msg }).slice(0, 600)}
In 3–4 short sentences for Ifoma and Josh: what this level is (search Jason's calls; give the call date), where price is right now (fetch it), what it means against the current banner, and what to watch next. No cards.`;
    const res = await runDesk({ msgs: [{ role: "user", content: prompt }], sys, tools: [TOOLS[0], ...mcpToolDefs], cs: chunksOf(calls),
      who: "alert", send: () => {}, allowPropose: false, maxRounds: 5 });
    if (res.said.trim()) await logDesk("assistant", "Jarvis · alert read", res.said.trim());
  }
  return { ok: true, fired: fresh.length };
}


/* ===================================================================== v3.4
   5 Oct 2026 — enter with the exit already set.

   An opening option card now carries plan.stop_option (the OPTION price that
   triggers the protective stop). Approving the card approves the entry AND its
   exits. Once the buy fills, Otto itself:
     1. places a stop_market sell-to-close at stop_option. Robinhood only allows
        stop_market as a day order, so Otto re-places it every morning at 9:30;
     2. sets two TradingView alerts on the stock: wrong-if (plan.stop) on a
        15-minute close, and TP1 on touch;
     3. when one of those alerts fires, puts up a close card (cancel the stop,
        then sell to close at market). Nothing sells without an Approve;
     4. when the position goes flat (stop filled, close card, or closed by
        hand), cancels any leftover stop and deletes the trade's alerts.
   State lives in otto_actions.exit (008_v34.sql). Driven by the 2-minute
   cron (cron_alerts), right after an Approve, and when the Desk panel loads. */

const EXIT_OPEN_ORDER = new Set(["queued", "confirmed", "unconfirmed", "partially_filled", "new", "pending_cancelled"]);
const EXIT_DEAD_ORDER = new Set(["cancelled", "rejected", "failed", "voided", "expired"]);

function exitSpec(out: any[], plan: any) {
  const opens = out.filter((c) => c.tool === "place_option_order" && (c.args.legs || []).some((l: any) => l.position_effect === "open"));
  if (opens.length !== 1) throw new Error("Exits work on one opening option order per card. Split it into separate cards.");
  const o = opens[0], legs = o.args.legs || [];
  if (legs.length !== 1 || legs[0].side !== "buy") throw new Error("Exits work on a single-leg buy to open (a long call or put).");
  const entry = Number(o.args.price), stopOpt = Number(plan.stop_option), qty = Math.floor(Number(o.args.quantity));
  if (!(qty >= 1)) throw new Error("quantity must be a whole number of contracts");
  if (!(entry > 0)) throw new Error("Use a limit price on the entry so the stop can be checked against it.");
  if (!(stopOpt > 0 && stopOpt < entry)) throw new Error(`plan.stop_option ($${stopOpt}) must be above 0 and below the entry limit ($${entry}).`);
  const dir = plan.direction === "down" ? "down" : "up";
  const tp1 = Number(plan.tp1), wrong = Number(plan.stop);
  if (!(tp1 > 0) || !(wrong > 0)) throw new Error("plan.tp1 and plan.stop must be prices on the underlying");
  if (dir === "up" ? !(tp1 > wrong) : !(tp1 < wrong)) throw new Error(`For a ${dir === "up" ? "call (up)" : "put (down)"} TP1 must be ${dir === "up" ? "above" : "below"} the wrong-if price.`);
  return { option_id: legs[0].option_id, qty, entry_limit: entry, stop_option: Math.round(stopOpt * 100) / 100,
    tv_symbol: String(plan.tv_symbol), direction: dir, wrong_if: wrong, tp1, expires: plan.expires || null };
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

async function placeStop(a: any, ex: any, acct: string) {
  try {
    const r = await call("rh", "place_option_order", { account_number: acct,
      legs: [{ option_id: ex.option_id, side: "sell", position_effect: "close" }],
      quantity: String(ex.qty), type: "stop_market", stop_price: ex.stop_option.toFixed(2),
      time_in_force: "gfd", market_hours: "regular_hours", ref_id: crypto.randomUUID() });
    ex.stop_order_id = orderIdOf(mcpJson(r)); ex.stop_error = null;
    exitLog(ex, `Stop placed: sell to close at $${ex.stop_option.toFixed(2)} (day order)`);
    return true;
  } catch (e) {
    ex.stop_error = (e as Error).message.slice(0, 300);
    exitLog(ex, "Stop order FAILED: " + ex.stop_error);
    await logDesk("system", "Otto", `⚠ ${a.title}: the protective stop at $${ex.stop_option.toFixed(2)} could not be placed (${ex.stop_error}). This trade has NO stop working. Close it or set one by hand.`, a.id);
    return false;
  }
}

async function armAlerts(a: any, ex: any) {
  const exp = ex.expires && /^\d{4}-\d{2}-\d{2}$/.test(ex.expires) ? ex.expires + "T21:00:00Z" : new Date(Date.now() + 14 * 864e5).toISOString();
  const tk = ex.tv_symbol.split(":").pop();
  const mk = async (kind: "wrong" | "tp1") => {
    const up = ex.direction === "up";
    const value = kind === "wrong" ? ex.wrong_if : ex.tp1;
    const type = kind === "wrong" ? (up ? "cross_down" : "cross_up") : (up ? "cross_up" : "cross_down");
    const res = kind === "wrong" ? "15" : "1";
    const args = { symbol: ex.tv_symbol,
      name: `Otto · ${tk} ${kind === "wrong" ? "WRONG IF" : "TP1"} ${value} · ${String(a.id).slice(0, 8)}`,
      message: `${tk} ${kind === "wrong" ? "closed a 15-minute bar through your wrong-if" : "reached TP1"} ${value} (Otto trade: ${a.title})`,
      conditions: [{ type, frequency: kind === "wrong" ? "on_bar_close" : "on_first_fire", resolution: res,
        cross_interval: true, series: [{ type: "barset" }, { type: "value", value }] }],
      resolution: res, expiration: exp, popup: false, mobile_push: false, email: false };
    try {
      const j = mcpJson(await call("tv", "mcp-tv-create-alert", args));
      const id = j?.alert_id ?? j?.data?.alert_id ?? null;
      exitLog(ex, `Alert set: ${kind === "wrong" ? "wrong-if" : "TP1"} ${tk} ${value}`);
      return id;
    } catch (e) {
      const m = (e as Error).message;
      exitLog(ex, `Alert FAILED (${kind}): ${m.slice(0, 200)}`);
      ex.alert_error = /max_primitive_alerts_count_exceeded/.test(m) ? "TradingView alert limit reached (20) — delete an old alert" : m.slice(0, 200);
      return null;
    }
  };
  ex.alerts = { wrong: await mk("wrong"), tp1: await mk("tp1") };
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

async function exitTick(a: any) {
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
    await armAlerts(a, ex);
    let stopOk = false;
    if (rthNow()) { ex.stop_try_day = today; ex.stop_tries = 1; stopOk = await placeStop(a, ex, acct); }
    await saveExit(a.id, ex);
    const loss = (ex.fill_price - ex.stop_option) * 100 * ex.qty;
    await logDesk("system", "Otto", `✓ ${a.title}: filled at $${ex.fill_price.toFixed(2)}. ` +
      (stopOk ? `Stop on at $${ex.stop_option.toFixed(2)} (about −$${loss.toFixed(0)} if it fills there). ` : rthNow() ? "" : "Stop goes on at 9:30 ET. ") +
      `Alerts: wrong-if ${ex.wrong_if} ${ex.alerts?.wrong != null ? "✓" : "✗"}, TP1 ${ex.tp1} ${ex.alerts?.tp1 != null ? "✓" : "✗"}.` +
      (ex.alert_error ? ` (${ex.alert_error})` : ""), a.id);
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
    return { id: a.id, state: ex.state };
  }
  if (held !== ex.qty) { exitLog(ex, `Holding ${held} now (was ${ex.qty})`); ex.qty = held; }

  // Keep the stop on during market hours (Robinhood's stop_market is a day order). At most 3 tries a day.
  if (rthNow()) {
    let need = !ex.stop_order_id;
    if (ex.stop_order_id) { try { const s = await optOrder(acct, ex.stop_order_id); need = !s || EXIT_DEAD_ORDER.has(s.state); } catch { need = false; } }
    if (ex.stop_try_day !== today) { ex.stop_try_day = today; ex.stop_tries = 0; }
    if (need && (ex.stop_tries || 0) < 3 && !(await cardBusy(ex.close_card))) { ex.stop_tries = (ex.stop_tries || 0) + 1; await placeStop(a, ex, acct); }
  }

  // Did one of this trade's own alerts fire?
  const ids = [ex.alerts?.wrong, ex.alerts?.tp1].filter((x) => x != null).map(String);
  if (ids.length) {
    const j = mcpJson(await call("tv", "mcp-tv-get-alerts-log", { days: 1, limit: 100 }));
    const evs = (j?.events || j?.data?.events || []).filter((e: any) => ids.includes(String(e.tv_alert_id ?? e.alert_id)) &&
      Date.parse(e.fired_at || e.fire_time || 0) > Date.parse(ex.armed_at));
    const key = (e: any) => String(e.fire_id ?? e.fired_at);
    const fresh = evs.filter((e: any) => !(ex.fired || []).includes(key(e)));
    if (fresh.length) {
      ex.fired = [...(ex.fired || []), ...fresh.map(key)].slice(-60);
      const recent = ex.close_at && Date.now() - Date.parse(ex.close_at) < 10 * 60_000;
      if (!(await cardBusy(ex.close_card)) && !recent) {
        const wrong = fresh.some((e: any) => String(e.tv_alert_id ?? e.alert_id) === String(ex.alerts.wrong));
        const why = wrong ? `wrong-if ${ex.wrong_if} hit (15-minute close)` : `TP1 ${ex.tp1} reached`;
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

/* ===================================================================== v3.3
   5 Oct 2026 — Results page, editable limits & goals, Help chat.
   Limits live in otto_settings (007_v33.sql) so Ifoma and Josh change them in
   Settings with no code. They are warnings on cards, never blocks. */

const LIMIT_DEFAULTS = { phase: 1, max_trade_loss: 100, weekly_loss: 150, max_trades_day: 2, monthly_goal_pct: 5, warn_pct: 20, big_day: 500 };
async function getLimits(): Promise<any> {
  return cached("limits", 30e3, async () => {
    try {
      const r = await db("otto_settings?key=eq.limits&select=value,updated_by,updated_at");
      return { ...LIMIT_DEFAULTS, ...(r?.[0]?.value || {}), _by: r?.[0]?.updated_by || null, _at: r?.[0]?.updated_at || null };
    } catch { return { ...LIMIT_DEFAULTS }; }
  });
}
async function setLimits(body: any, who: string) {
  const cur: any = await getLimits();
  const v: any = { ...cur, ...Object.fromEntries(Object.entries(body || {}).filter(([, x]) => x !== "" && x != null)) };
  const by = String(body?.author || "").trim().slice(0, 40) || who.split("@")[0];
  const num = (k: string, lo: number, hi: number) => {
    const n = Number(v[k]); if (!isFinite(n) || n < lo || n > hi) throw new Error(`${k.replace(/_/g, " ")} must be between ${lo} and ${hi}`); return n;
  };
  const value = { phase: num("phase", 1, 3), max_trade_loss: num("max_trade_loss", 1, 1e6), weekly_loss: num("weekly_loss", 1, 1e6),
    max_trades_day: num("max_trades_day", 1, 100), monthly_goal_pct: num("monthly_goal_pct", 0, 100), warn_pct: num("warn_pct", 1, 100),
    big_day: num("big_day", 1, 1e7) };
  await db("otto_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: "limits", value, updated_by: by + " (" + who + ")", updated_at: new Date().toISOString() }) });
  delete CACHE.limits;
  await logDesk("system", "Otto", `Limits updated by ${by}: max loss/trade $${value.max_trade_loss}, weekly loss limit $${value.weekly_loss}, ${value.max_trades_day} trades/day, goal ${value.monthly_goal_pct}%/month, warn over ${value.warn_pct}% of the account.`);
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
  const overLimit = closed.filter((t) => Number(t.pnl) < -L.max_trade_loss);
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
async function limitChecks(cost: number | null): Promise<any[]> {
  const L = await getLimits();
  const out: any[] = [];
  if (cost != null) out.push({ ok: cost <= L.max_trade_loss, text: `Most this trade can lose: $${cost.toFixed(0)} (your limit $${L.max_trade_loss})` });
  try {
    const p = await dailyPnl();
    const wk = mondayOf(etParts().date);
    const weekPnl = p.days.filter((d) => d.date >= wk).reduce((s, d) => s + d.pnl, 0);
    out.push({ ok: weekPnl > -L.weekly_loss, text: weekPnl <= -L.weekly_loss
      ? `Weekly limit hit ($${weekPnl.toFixed(0)} of −$${L.weekly_loss}): stop for the week`
      : `This week $${weekPnl.toFixed(0)} (stop at −$${L.weekly_loss})` });
  } catch { out.push({ ok: null, text: "Weekly P&L: couldn't read Robinhood" }); }
  try {
    const today = etParts().date;
    const t = await db("otto_trades?select=opened_at&opened_at=gte." + new Date(Date.now() - 864e5).toISOString());
    const n = t.filter((x: any) => etParts(new Date(x.opened_at)).date === today).length;
    out.push({ ok: n < L.max_trades_day, text: `Trade ${n + 1} today (limit ${L.max_trades_day})` });
  } catch { /* */ }
  return out;
}

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
- "the call" = the coaching call with Jason; the day changes week to week.`;

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
      system: [{ type: "text", text: HELP_SYS + `\n\nCURRENT LIMITS: ${JSON.stringify({ phase: L.phase, max_trade_loss: L.max_trade_loss, weekly_loss: L.weekly_loss, max_trades_day: L.max_trades_day, monthly_goal_pct: L.monthly_goal_pct, warn_pct: L.warn_pct, big_day: L.big_day })}`, cache_control: { type: "ephemeral" } }],
      messages: hist }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "API error");
  return (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
}

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
  if (fn0 === "cron_alerts") {
    if (!cronAllowed(req)) return json({ ok: false, error: "bad cron secret" }, 401);
    const et = etParts();
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && (["Sat", "Sun"].includes(et.wd) || et.min < 540 || et.min > 990)) return json({ ok: true, skipped: et });
    background((async () => {
      try { await exitsTick(true); } catch (e) { console.error("exits", e); }
      await alertWatch(Deno.env.get("ANTHROPIC_KEY") || "");
    })());
    return json({ ok: true, started: "alerts" }, 202);
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
    background(weeklyReview(apiKey, "Jarvis (Friday auto)"));
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
         "sentiment", "market_desk", "journal", "trade_reason", "review_get", "review_build", "score", "morning_now", "ticket", "limits_get", "limits_set", "performance", "help"].includes(fn)) {
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
      if (fn === "limits_get") return json({ ok: true, limits: await getLimits() });
      if (fn === "limits_set") return json({ ok: true, limits: await setLimits(body, who) });
      if (fn === "performance") return json(await performance(Deno.env.get("ANTHROPIC_KEY") || "", new URL(req.url).searchParams.get("read") !== "0", new URL(req.url).searchParams.get("fresh") === "1"));
      if (fn === "help") return json({ ok: true, text: await helpAnswer(body, Deno.env.get("ANTHROPIC_KEY") || "") });
      if (fn === "ticket") return json({ ok: true, action: await orderTicket(body, who, String(body.author || "Ifoma").slice(0, 30)) });
      if (fn === "morning_now") {
        const apiKey = Deno.env.get("ANTHROPIC_KEY") || "";
        background(morningRead(apiKey));
        return json({ ok: true, started: true });
      }
      if (fn === "desk_log") {
        const since = Number(new URL(req.url).searchParams.get("since")) || 0;
        const rows = await db("otto_desk?select=id,created_at,role,author,content,action_id" +
          (since ? "&id=gt." + since + "&order=id.asc&limit=100" : "&order=id.desc&limit=60"));
        const list = since ? rows : rows.reverse();
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
          system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
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
