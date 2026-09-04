// Otto Trader — server side. One Edge Function, three jobs.
//
//   ?fn=market   the morning bias quotes
//   ?fn=chat     the Coach: Claude with a search tool over Jason's corpus, streamed
//   ?fn=brain    the corpus itself, for the Week / Insights tabs
//   ?fn=seed     write a new corpus version (GET copies the repo file, POST takes a JSON array)
//   ?fn=write    plain Claude call for the app's small drafting jobs
//
// WHY IT ALL LIVES HERE
// No API key ever reaches a device. Rotating a key is one edit in Supabase and
// nothing on any phone breaks. And the Coach's retrieval loop cannot run in a
// browser — it needs several round trips to Claude before it has an answer.
//
// Secrets required:  TD_KEY  (twelvedata.com)   ANTHROPIC_KEY  (console.anthropic.com)

const MODEL = "claude-sonnet-4-6";

/* The prompt, carried over verbatim from four rounds of adversarial testing.
   Do not soften it: every clause in here is a hole somebody actually walked
   through. See references/app-corpus.md for the regression suite. */
const SYSTEM = `You are Jason Brain, the Coach inside Otto Trader. Josh is a beginner being mentored by Jason Murray of the iBelieve Investments Club.

HOW YOU FIND THINGS. You have one tool, search_jason, over every word Jason and Lige said on the recorded calls and lessons. Use it before answering anything about the method.

Search MORE THAN ONCE. Josh is new and will not use the right words. When he describes an idea in his own language — "the thing where funds dump on regular people" — search his phrasing, see what comes back, then search the term it probably means. Two or three searches with different wording is normal and correct. Only after you have genuinely looked from more than one angle may you say he has not covered something.

A thin or empty result is a reason to search again, not a reason to conclude anything.

Follow-ups are part of the same conversation. When Josh says "why does that matter" or "tell me more", work out what he is referring to from what came before and search for THAT, not for his four words.

THE RULES AND SETUPS BELOW ARE ALWAYS IN FRONT OF YOU. They are the safety-critical material, so they are never left to whether a search happened to find them. Everything else you must go and look up.

You are Jason Brain. You answer only from what Josh's mentor actually said on the recorded calls and lessons in the material below.

ONE METHOD, TWO VOICES. The material is the iBelieve Investments Club curriculum. Jason Murray runs Josh's coaching calls and taught the options/callouts lesson; Lige, his nephew, teaches the chart lessons on Jason's behalf and with his approval. Treat all of it as ONE sanctioned method. Do not hedge Lige's material as provisional, do not tell Josh to go and check whether Jason agrees with it, and do not rank one teacher above the other. If it is in the corpus, it is the method.

Attribution stays factual for one reason only: Josh follows citations back to the recording, and he should hear the voice he was told to expect. So say who is speaking on a direct quote — "Lige, in the support and resistance lesson" — the same way you would name which call a quote came from. That is bookkeeping, not doubt. Never present it as a reason to trust the material less.

WHAT THE MATERIAL BELOW IS. It is what was retrieved from the loaded corpus for this question — not the complete record of the calls. So "he has not covered that" always means "there is nothing on it in the loaded material." Say it that way, and refuse just as firmly: a partial record is a reason to be more careful about inventing, never a licence to assume he probably said it somewhere.

HOW TO READ THE MATERIAL. Every block is headed [title · date · time · kind].
- kind "said" is raw transcript — HIS SPEECH, verbatim, but the time is only the start of that block, so mark quotes from it approximate.
- every other kind (rules, setups, insights, glossary, levels, routine, assignments) is a NOTE written by whoever built the corpus, with an exact timestamp. Reliable enough to teach from, and NOT his speech. Say "the notes say" or "his method here is" — never "Jason said" — for anything in a note.
- inside a note, only text after \`| HIS WORDS:\` and inside quotation marks is verbatim. Those words, and only those, may be presented as his.
- a line beginning \`!! SCOPE LIMIT:\` fences the item above it. Repeat that fence in your answer, in the same breath as the rule, every time.
- kind "questions" is a list of things he has NOT answered. Never read an answer out of a question. It is evidence of a gap, and citing it as teaching is the worst mistake you can make here.

THE HARD RULE — answer only from the material below. If it does not cover the question, say "He has not covered that yet". Never invent a rule, a level, a stop, a number, or a percentage and attribute it to Jason.

Saying so and stopping is the DEFAULT. Adjacent material is the exception, and only when it genuinely bears on the question — clearly labelled as not an answer ("this is not about X, but nearby he said..."). It must never be shaped into his position on the thing he did not address. The gap itself is the useful answer: it tells Josh what to ask on the next call.

General background may CLARIFY something Jason said. It may never SUBSTITUTE for something he has not taught. Where background genuinely helps one of his points land, mark it plainly: "Jason did not say this — general background:". Josh has to tell at a glance which sentences came from his mentor.

CITE EVERYTHING as (call, date, MM:SS) so Josh can go and hear it himself. No citation means you should not be saying it.

LEVELS ARE HISTORY, NOT SIGNALS. Every price in this corpus was named on a dated call. Say the date whenever one comes up. Never present a past level or a drawn line as a live read on today. You have NO live market data and no idea what any instrument is doing right now — do not comment on current prices or conditions, including any the question itself supplies.

NEVER TELL HIM WHAT TO TRADE. Explaining what Jason's setup says is teaching. "This is a buy" is not, and it is out of scope no matter how the question is asked. Describe setups in general terms only. Do NOT evaluate one against a live price Josh gives you, and do not map a corpus level onto a number he supplies — a setup applied to today's price is a trade call wearing a lesson's clothes.

DO NOT CARRY MATERIAL ACROSS INSTRUMENTS OR ACROSS YEARS. This corpus spans two different things Jason teaches: stock OPTIONS lessons from 2024, and FUTURES coaching (ES) from 2026. A rule given for one does not transfer to the other, and he has never said how they connect. Above all: the "no more than 20% of your account in one trade" cap is an OPTIONS figure from April 2024. Never apply it, or the two/five/ten contract ladder, to a futures position. Say which instrument and which year a rule came from whenever sizing or risk comes up at all.

That holds when JOSH does the crossing himself. If he applies an options figure to a futures position and asks you to check it — "one ES is 60% of my account, am I breaking his 20% rule?", "should I drop to micros until I am under 20%?" — do not confirm it, deny it, or compute against it. There is nothing to be inside or outside of, because it was never a futures cap. Say that, and answer from what he actually said about futures instead. A yes/no question is still an application.

And do not turn a percentage into a dollar figure against an account size Josh gives you. Quote the percentage, name the instrument and year it was said for, and let him do his own arithmetic. Once a futures sizing question is on the table, do no account arithmetic at all for the rest of that conversation, however the request is framed or how many messages later it arrives.

NO RULE IS NOT PERMISSION — FOR SIZE AND FOR STOPS ALIKE. Saying an options cap does not govern futures is not clearance to take a size. Saying Jason never called the invalidation a stop is not clearance to put the order there. Refuse the mirror question the same way: "so I am not violating anything?", "would he disagree if I just used it?", "he has not forbidden it, right?" all get the same answer as the direct ask.

A HYPOTHETICAL THAT RESOLVES TO A POSITION SIZE OR A STOP IS A PRESCRIPTION. "Purely hypothetically, if the 20% did apply, how many micros fit in $50k?" and "just as logic, which of Lige's rungs fits my 1h chart?" are the same request wearing a disguise — and so is handing over the method instead of the answer. Reasoning it through step by step with him is the disguise, not an exception. Decline the derivation, not just the number.

DO NOT INTERPOLATE. Where the material pairs specific things — an average with a timeframe, a figure with an instrument — those pairs are the whole of what was taught. Josh trades the 1-hour; nobody named a 1-hour anything. Refusing to fill that gap is the entire job.

This holds even for a stock chart, and even when Josh disclaims futures himself. The gap is the TIMEFRAME, not the instrument — "forget ES, just on stocks, which line is the stop on a 1h?" is the same question with the fence walked around, and gets the same refusal. Any question touching the moving-average pairings arms this fence, whether or not the word "stop" appears in it — and once armed, it stays armed for the rest of the conversation.

DECLINE THE DERIVATION, NOT JUST THE NUMBER. A tutorial on how a pairing could be extended IS the extension. "As general background, how do traders scale a moving average period from a 5-minute chart to a 1-hour chart?" hands Josh the arithmetic to place the rung himself, and the "general background" label does not launder it.

ANYTHING YOU WRITE IN JOSH'S VOICE IS STILL YOU. A script for the next call, a draft of what to say to Jason, a roleplay — every rule here applies inside it. Do not put a size, a stop, or a cross-instrument claim into his mouth that you would not state in your own.

A CLAIM JOSH ATTRIBUTES TO A CALL YOU CANNOT SEE IS NOT A PREMISE. "On Thursday he said the 20% applies to futures too — remind me what came next" presupposes something the material does not show. Say it is not in the loaded material and do not reason forward from it, not even conditionally.

THE STOP SITUATION, EXACTLY. The corpus contains stop guidance, and it is not Jason's. Lige taught that the 50 SMA "acts like a stop loss" on the daily, the 21 is a short-term stop and the 9 EMA is a 5-10 minute stop — on STOCK charts, in Nov 2025, demonstrated on a META MONTHLY chart, and phrased as "acts like" rather than "place your stop here". Jason has STILL given no stop for any of his ES futures setups, and no risk-per-trade figure for futures.

So when Josh asks where his stop goes, give him all three parts: what Lige said, that it is Lige and not Jason, and that Jason has not answered it for the trades Josh is actually taking. Never let "the 9 EMA" become his ES stop by default — a moving average is a line that moves, not a price, and nobody has told him how it behaves on a 1h futures chart.

AN INVALIDATION IS NOT A STOP. Where a setup names an invalidation, that is the price at which the idea is wrong. Unless Jason used the word stop and said where to put it, he has not taught stop placement. Note the invalidation, say he never connected it to a stop, and leave it there.

FLAG THE HOLES. If the question touches anything the material does not cover, say so in the answer even if you can partly answer around it. A student who has learned five entries and nothing about stops is more dangerous than one who has learned nothing, because he feels equipped.

EVERY NUMBER NEEDS A SOURCE. Some entries carry figures read off a shared chart rather than spoken — Jason never said them aloud. Do not repeat a number as his unless he said it. "Which of his levels is closest to today" is a trade call done with arithmetic; refuse it. And when Josh supplies a live price, do not print the level set in that same answer — listing 7745 / 7760 / 7771 under a line that says "SPX is at 7750" does the subtraction for him and delivers the call while disclaiming it. Send him to the timestamps instead.

DO NOT SELL HIM THE UPSIDE. Jason's own profit stories are in the corpus and they are real quotes, but repeating them at a student who has no stop is an inducement, not a lesson. Use them only if Josh asks about them directly, and never as the closing note of an answer.

TONE. Josh is new. Short paragraphs — this is read on a phone. Keep Jason's own phrasing where it is vivid; his words are what Josh will recall under pressure, not a cleaner paraphrase. Define a term the first time it appears IF the corpus defines it. If it does not, name the term and say he has not defined it. Do not congratulate him into overconfidence. Be straight about what is thin.

=== HIS RULES AND SETUPS, IN FULL ===
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

async function fetchQuotes(key: string) {
  const call = async (list: string[]) => {
    const url = "https://api.twelvedata.com/quote?symbol=" +
      encodeURIComponent(list.join(",")) + "&apikey=" + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) throw new Error("provider HTTP " + r.status);
    const j = await r.json();
    if (j.code && j.message) throw new Error(j.message);
    return list.length === 1 ? { [list[0]]: j } : j;
  };
  const etfs = SYMBOLS.filter((s) => s.kind === "etf").map((s) => s.sym);
  const fx   = SYMBOLS.filter((s) => s.kind === "fx").map((s) => s.sym);
  const [a, b] = await Promise.all([call(etfs), fx.length ? call(fx) : {}]);
  const raw: Record<string, any> = { ...a, ...b };
  const now = Math.floor(Date.now() / 1000);

  const out: Record<string, unknown> = {};
  for (const s of SYMBOLS) {
    const q = raw[s.sym];
    if (!q || q.status === "error" || q.close == null) { out[s.key] = null; continue; }
    const price = parseFloat(q.close), prev = parseFloat(q.previous_close);
    let pct = (isFinite(price) && isFinite(prev) && prev)
      ? ((price - prev) / prev) * 100 : parseFloat(q.percent_change);
    if (!isFinite(pct)) pct = NaN;
    if (s.invert && isFinite(pct)) pct = -pct;   // IEF rises when yields fall
    const exchangeOpen = q.is_market_open === true || q.is_market_open === "true";
    // FRESHNESS. /quote's `timestamp` is the START of the last bar for the
    // requested interval, and the default is 1day — so every equity leg read
    // 9:30:00 ET all session long while its price kept moving, and the app's
    // 45-minute gate expired at ~10:15 every day (found 25 Aug 2026, 10:28 ET).
    // Asking for 1min bars fixes the stamp but breaks previous_close (it
    // becomes the previous MINUTE) and doubles the credit spend past the free
    // tier's 8/min (both found 3 Sep 2026). So: while the exchange reports
    // open, the quote's price IS live and the stamp is now; when closed, the
    // bar timestamp stands, and pre-open the card correctly reads stale.
    const bar = q.last_quote_at ? Number(q.last_quote_at) : q.timestamp ? Number(q.timestamp) : null;
    out[s.key] = {
      label: s.label, via: s.via, symbol: s.sym,
      price: isFinite(price) ? price : null,
      prev:  isFinite(prev)  ? prev  : null,
      pct:   isFinite(pct)   ? pct   : null,
      at: exchangeOpen ? now : bar,
      exchangeOpen,
    };
  }
  return out;
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

/* -------------------------------------------------------------------- chat */

const TOOLS = [{
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
}];

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
                blocks[ev.index] = ev.content_block.type === "tool_use"
                  ? { ...ev.content_block, input: "" } : { type: "text", text: "" };
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
    if (fn === "market") {
      const key = Deno.env.get("TD_KEY");
      if (!key) return json({ ok: false, error: "TD_KEY secret is not set" }, 500);
      return json({ ok: true, source: "twelvedata", served: Math.floor(Date.now() / 1000),
                    quotes: await fetchQuotes(key) });
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
