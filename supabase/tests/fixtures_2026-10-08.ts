// Robinhood Agentic ••7012 option orders, Thu 8 Oct 2026 (get_option_orders, trimmed to the fields Otto reads).
const L = (option_id: string, side: string, eff: string, strike: string, type: string, exp: string, fills: [string, string][] = []) =>
  ({ option_id, side, position_effect: eff, strike_price: strike, option_type: type, expiration_date: exp,
     ...(fills.length ? { executions: fills.map(([price, ts]) => ({ price, quantity: "1.00000", timestamp: ts })) } : {}) });
const O = (id: string, sym: string, state: string, type: string, price: string, created: string, updated: string, leg: any, extra: any = {}) =>
  ({ id, chain_symbol: sym, state, type, price, quantity: "1.00000", processed_quantity: state === "filled" ? "1.00000" : "0.00000",
     created_at: created, updated_at: updated, last_transaction_at: null, legs: [leg], ...extra });
const NV = "2e6f4718-7cdb-4d2a-a132-8a683571c45a", PL = "30373f6b-8db8-47a1-8600-20ed5aef1e40", TS = "2f2b3e91-c834-41f1-a2cc-08b6a8dbe1d3",
  QQ = "c69baf70-35bc-454f-a089-7f6adb717c9d", TL = "4b0d0ed3-b9ea-46d3-af93-72685509d6f8";
export const OPT_IDS = { NV, PL, TS, QQ, TL };
export const ORDERS_1008 = [
  O("tsla-buy", "TSLA", "cancelled", "limit", "3.70", "2026-10-08T17:06:34Z", "2026-10-08T17:08:20Z", L(TL, "buy", "open", "365.0000", "put", "2026-10-14")),
  O("qqq-sell", "QQQ", "filled", "limit", "2.72", "2026-10-08T15:52:31Z", "2026-10-08T15:52:32Z", L(QQ, "sell", "close", "751.0000", "put", "2026-10-12", [["2.82", "2026-10-08T15:52:32Z"]])),
  O("qqq-stop", "QQQ", "cancelled", "market", "", "2026-10-08T15:05:18Z", "2026-10-08T15:52:31Z", L(QQ, "sell", "close", "751.0000", "put", "2026-10-12"), { stop_price: "1.84" }),
  O("qqq-buy", "QQQ", "filled", "limit", "2.58", "2026-10-08T15:05:13Z", "2026-10-08T15:05:13Z", L(QQ, "buy", "open", "751.0000", "put", "2026-10-12", [["2.58", "2026-10-08T15:05:13Z"]])),
  O("tsm-sell", "TSM", "filled", "market", "", "2026-10-08T14:38:49Z", "2026-10-08T14:38:49Z", L(TS, "sell", "close", "472.5000", "call", "2026-10-09", [["1.91", "2026-10-08T14:38:49Z"]])),
  O("tsm-stop", "TSM", "cancelled", "market", "", "2026-10-08T14:09:37Z", "2026-10-08T14:38:48Z", L(TS, "sell", "close", "472.5000", "call", "2026-10-09"), { stop_price: "0.47" }),
  O("tsm-buy", "TSM", "filled", "limit", "1.57", "2026-10-08T14:06:32Z", "2026-10-08T14:08:58Z", L(TS, "buy", "open", "472.5000", "call", "2026-10-09", [["1.57", "2026-10-08T14:08:57Z"]])),
  O("pltr-sell", "PLTR", "filled", "market", "", "2026-10-08T13:56:04Z", "2026-10-08T13:56:05Z", L(PL, "sell", "close", "202.5000", "call", "2026-10-09", [["1.87", "2026-10-08T13:56:04Z"]])),
  O("pltr-stop", "PLTR", "cancelled", "market", "", "2026-10-08T13:50:45Z", "2026-10-08T13:56:03Z", L(PL, "sell", "close", "202.5000", "call", "2026-10-09"), { stop_price: "0.94" }),
  O("pltr-buy", "PLTR", "filled", "limit", "1.88", "2026-10-08T13:50:41Z", "2026-10-08T13:50:42Z", L(PL, "buy", "open", "202.5000", "call", "2026-10-09", [["1.74", "2026-10-08T13:50:42Z"]])),
  O("nvda-sell", "NVDA", "filled", "market", "", "2026-10-08T13:36:05Z", "2026-10-08T13:36:05Z", L(NV, "sell", "close", "240.0000", "call", "2026-10-12", [["0.60", "2026-10-08T13:36:05Z"]])),
  O("nvda-stop", "NVDA", "cancelled", "market", "", "2026-10-08T13:36:00Z", "2026-10-08T13:36:03Z", L(NV, "sell", "close", "240.0000", "call", "2026-10-12"), { stop_price: "0.48" }),
  O("nvda-buy", "NVDA", "filled", "limit", "1.60", "2026-10-08T13:28:39Z", "2026-10-08T13:30:01Z", L(NV, "buy", "open", "240.0000", "call", "2026-10-12", [["0.86", "2026-10-08T13:30:00Z"]])),
];
/** Only the orders that existed by `iso` (and their state then: a later fill/cancel hasn't happened yet). */
export function ordersAt(iso: string) {
  return ORDERS_1008.filter((o) => o.created_at <= iso).map((o) => {
    if (o.updated_at <= iso) return o;
    // not resolved yet at that time: working, no executions
    return { ...o, state: "confirmed", processed_quantity: "0.00000", legs: o.legs.map((l: any) => { const { executions: _e, ...rest } = l; return rest; }) };
  });
}

// Robinhood 5-minute bars, 8 Oct 2026 (begins_at UTC → [open, high, low, close]).
const B = (rows: [string, number, number, number, number][]) => rows.map(([t, o, h, l, c]) => ({ begins_at: `2026-10-08T${t}:00Z`, open_price: String(o), high_price: String(h), low_price: String(l), close_price: String(c) }));
export const BARS_1008: Record<string, any[]> = {
  NVDA: B([["13:30", 234.88, 235.2, 233.87, 234.545], ["13:35", 234.53, 234.69, 234.04, 234.66]]),
  PLTR: B([["13:30", 199.04, 203.46, 197.3, 203.165], ["13:35", 203.1465, 204.44, 198.35, 199.405], ["13:40", 199.4, 200.0999, 197.0, 199.275],
    ["13:45", 199.27, 200.7, 198.5, 199.9094], ["13:50", 199.88, 201.66, 199.32, 199.3296], ["13:55", 199.41, 201.3099, 198.65, 201.2199], ["14:00", 201.1325, 201.6627, 200.1171, 201.41]]),
  TSM: B([["14:00", 466.8, 468.39, 466.73, 468.27], ["14:05", 468.19, 469.2793, 468.135, 469.05], ["14:10", 469.07, 469.07, 467.72, 467.9],
    ["14:15", 467.8675, 468.457, 467.73, 468.415], ["14:20", 468.4865, 469.4999, 468.25, 469.4999], ["14:25", 469.39, 471.1231, 469.39, 470.44],
    ["14:30", 470.44, 470.54, 469.4, 469.6], ["14:35", 469.495, 470.26, 469.42, 469.885], ["14:40", 469.94, 470.0, 469.06, 469.12]]),
  TSLA: B([["17:00", 371.2178, 371.44, 370.44, 370.77], ["17:05", 370.72, 371.02, 370.2901, 370.3695]]),
};
