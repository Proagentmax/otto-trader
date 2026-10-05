// Otto Trader — server side. One Edge Function.
//
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
const SYSTEM = `You are Jason Brain, the AI trading assistant inside Otto Trader. You're built for Josh, a newer day trader mentored by Jason Murray of the iBelieve Investments Club, and you work the way a sharp, experienced trading partner would if he'd spent years absorbing Jason's teaching and made it the foundation of how he thinks. Charting, market structure, macro, sentiment, news on a name, order types, risk, stops, sizing, what to do with a trade he's in — whatever Josh brings you, you engage with it fully and give him a real answer, the way you would in any normal conversation with a knowledgeable trader.

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
const PLAN_SYS = `You are Jason Brain, grading Josh's PLAN OF ATTACK for today before the market opens. Josh is a beginner mentored by Jason Murray (iBelieve Investments Club). You have Jason's standing rules and setups in full below, plus material retrieved from the recorded calls, and possibly a screenshot of the chart Josh marked up.

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

async function proposeAction(input: any, who: string) {
  const calls = Array.isArray(input.calls) ? input.calls.slice(0, 6) : [];
  if (!calls.length) throw new Error("no calls");
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
  let account_value: number | null = null;
  if (out.some((c) => c.service === "rh" && c.tool.startsWith("place_"))) {
    try {
      const pj = mcpJson(await call("rh", "get_portfolio", { account_number: await agenticAccount() }));
      account_value = Number(pj?.data?.total_value ?? pj?.total_value) || null;
    } catch { /* shown as unknown */ }
  }
  const pct = account_value && costKnown ? cost / account_value : null;
  const risk = {
    cost: costKnown ? cost : null, account_value, pct,
    flag: pct !== null && pct > RISK_FLAG, notes, account: out.some((c) => c.service === "rh") ? mask(await agenticAccount().catch(() => "????")) : null,
  };
  const rows = await db("otto_actions", { method: "POST", body: JSON.stringify({
    title: String(input.title || "Action").slice(0, 140),
    summary: String(input.summary || "").slice(0, 4000),
    calls: out, risk, review: review.join("\n\n---\n\n"), status: "pending", created_by: who,
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
           decided_by: a.decided_by, decided_at: a.decided_at };
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
  let failed = false;
  for (const c of a.calls) {
    if (failed) { results.push({ tool: c.tool, ok: false, text: "skipped — an earlier step failed" }); continue; }
    try {
      const r = await call(c.service, c.tool, c.args);
      results.push({ tool: c.tool, ok: true, text: mcpText(r).slice(0, 2000) });
    } catch (e) {
      failed = true;
      results.push({ tool: c.tool, ok: false, text: (e as Error).message });
    }
  }
  const fin = await db("otto_actions?id=eq." + id, { method: "PATCH",
    body: JSON.stringify({ status: failed ? "failed" : "done", result: results }) });
  await logDesk("system", "Otto", `${failed ? "✗" : "✓"} ${a.title} — ${failed ? "failed" : "done"} (approved by ${who})`, id);
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
    const q = await settle((async () => mcpJson(await call("tv", "mcp-tv-get-symbol-data-batch",
      { symbols: syms, columns: ["name", "description", "close", "change", "change_abs"] })))());
    if (q.ok) out.quotes = q.v; else out.quotes_error = q.error;
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
  return out;
}

/* ------------------------------------------------------------ the Desk chat */

const DESK_SYS = `You are Otto, the trading desk inside Otto Trader. You sit between three things:
- Jason Murray's method (his recorded mentorship calls) — the judgment. Search it with search_jason.
- TradingView (Ifoma's paid account) — market data, watchlists, alerts. Tools named tv__…
- Robinhood — positions and orders. Tools named rh__…. Orders only ever go to the Robinhood Agentic account; the server enforces that, you don't pick the account.

You're talking with Ifoma (the trader; it's his money) and sometimes Josh (his son, learning alongside him, same login, same authority). Each message is prefixed with who wrote it when known. Talk like a trading partner at the next desk: direct, numbers first, caveat second. Short paragraphs. No hype, no congratulating; say plainly when a trade is a bad idea.

HOW ACTIONS WORK — THE ONE HARD RULE
You can READ anything with the tv__ and rh__ tools, as often as you need. You can NEVER change anything yourself. To place, cancel, or change an order, or create/edit/delete an alert or watchlist entry, call propose_action with the exact calls. That puts an Approve / Reject card in front of them; nothing happens until a human clicks Approve. After proposing, say in one line what the card does — never say an order "is placed" or "went through" until you see the result (the app will post it).
- Before proposing an option order: get the chain (rh__get_option_chains → rh__get_option_instruments) for the real option_id, check the quote (rh__get_option_quotes), and use a limit price. The server runs Robinhood's review and computes the risk vs the Agentic account.
- One idea = one card. Several suggestions at once = several cards, each with its own title.
- Don't propose new TradingView alerts or Jason-level alerts unless they explicitly ask for one. For now the desk shows prices only.

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

async function desk(req: Request, who: string, apiKey: string) {
  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!history.length) throw new Error("no messages");
  const author = String(body.author || "Ifoma").slice(0, 30);

  const calls = await loadBrain();
  const cs = chunksOf(calls);
  const sys = DESK_SYS.replace("{{RULES}}", alwaysOn(calls));
  const { tools: mcpToolDefs, help, status } = await deskTools();
  const tools: any[] = [
    TOOLS[0],                                         // search_jason
    { type: "web_search_20250305", name: "web_search", max_uses: 4 },
    ...mcpToolDefs,
    PROPOSE_TOOL(help),
  ];
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ctxLine = `[Desk context — ${now} ET. TradingView: ${status.tv}. Robinhood: ${status.rh}.]`;

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
      const send = (o: unknown) => ctrl.enqueue(encS.encode("data: " + JSON.stringify(o) + "\n\n"));
      let said = "";
      const cards: string[] = [];
      try {
        for (let round = 0; round < 12; round++) {
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
                send({ t: "tool", v: "Preparing card: " + String(input.title || "") });
                const card = await proposeAction(input, who);
                cards.push(card.id);
                send({ t: "action", v: card });
                content = `Card ${card.id} is on screen, status pending. Nothing has run. ` +
                  `Risk computed by the server: ${JSON.stringify(card.risk)}. Robinhood review: ${(card.review || "n/a").slice(0, 1500)}`;
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
        send({ t: "done" });
      } catch (e) {
        send({ t: "error", v: String((e as Error).message ?? e).slice(0, 300) });
      }
      if (said.trim() || cards.length) await logDesk("assistant", "Otto", said.trim(), cards[cards.length - 1] || null);
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-store" } });
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
    if (["desk", "act", "panel", "desk_log", "oauth_start", "oauth_finish", "conn_status", "disconnect"].includes(fn)) {
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
