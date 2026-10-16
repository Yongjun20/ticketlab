// Dividends you earned, worked out from each stock's past dividends and the units you held on the day.
// Each dividend can be kept as cash ("Wallet") or reinvested (a Buy that adds units). Pure: no screen, no storage.
import { toYahoo, toMYR } from './markets.js';
import { DEFAULT_TAX } from './format.js';

const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dateOfUnix = sec => new Date(sec * 1000).toISOString().slice(0, 10);
const MATCH_DAYS = 25; // a dividend you recorded by hand this soon after the ex-date counts as the same dividend

// txns: all your records. divs: { 'VOO': { history: [{ ex, amount }] } } (what the worker sends). rates: live exchange rates.
export function buildEarned(txns, divs, rates, now = Date.now() / 1000) {
  const trades = txns.filter(t => t.action === 'buy' || t.action === 'sell');
  const manual = txns.filter(t => t.action === 'dividend' && !t.auto).sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  const decided = new Map(txns.filter(t => t.action === 'dividend' && t.auto).map(t => [t.evKey, t])); // dividends you chose to reinvest
  const byId = new Map(txns.map(t => [t.id, t]));
  const usedManual = new Set(), events = [];

  const stocks = new Map();
  for (const t of trades) stocks.set(`${t.market}:${t.ticker}`, { ticker: t.ticker, market: t.market });
  for (const st of stocks.values()) {
    const data = divs[toYahoo(st.ticker, st.market)];
    if (!data?.history?.length) continue;
    const mine = trades.filter(t => t.ticker === st.ticker && t.market === st.market).sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
    const tax = [...mine].reverse().find(t => t.divTax != null)?.divTax ?? DEFAULT_TAX[st.market] ?? 0; // withholding tax %
    for (const h of data.history) {
      const ex = dateOfUnix(h.ex);
      if (ex <= mine[0].date) continue; // you must own it before the ex-date
      const units = Math.max(0, mine.filter(t => t.date < ex).reduce((u, t) => u + (t.action === 'buy' ? t.units : -t.units), 0));
      if (units < 1e-9) continue;
      const gross = units * h.amount, net = gross * (1 - tax / 100), key = `${st.market}:${st.ticker}:${ex}`;
      const hand = manual.find(m => !usedManual.has(m.id) && m.ticker === st.ticker && m.market === st.market && m.date >= ex && m.date <= addDays(ex, MATCH_DAYS));
      if (hand) usedManual.add(hand.id);
      const ev = { key, ticker: st.ticker, market: st.market, date: ex, perShare: h.amount, units, gross, tax, net,
        source: hand ? 'manual' : 'auto', amount: hand ? hand.amount : net, reinvest: false, recordId: null, buyId: null, unitsAdded: 0 };
      const dec = decided.get(key);
      if (dec && byId.has(dec.linkId)) Object.assign(ev, { reinvest: true, recordId: dec.id, buyId: dec.linkId, unitsAdded: byId.get(dec.linkId).units });
      events.push(ev);
    }
  }
  // dividends you recorded that match no dividend in the history still count
  for (const m of manual) {
    if (usedManual.has(m.id)) continue;
    events.push({ key: 'm' + m.id, ticker: m.ticker, market: m.market, date: m.date, perShare: null, units: null, gross: m.amount, tax: 0, net: m.amount,
      source: 'manual', amount: m.amount, reinvest: false, recordId: m.id, buyId: null, unitsAdded: 0 });
  }
  events.sort((a, b) => b.date.localeCompare(a.date) || a.ticker.localeCompare(b.ticker));

  // totals in ringgit (a stock whose exchange rate isn't known yet is left out and flagged)
  const year = String(new Date(now * 1000).getUTCFullYear());
  const totals = { all: 0, year: 0, wallet: 0, reinvested: 0, missingRate: false };
  const per = new Map();
  for (const e of events) {
    const myr = toMYR(e.amount, e.market, rates);
    if (myr == null) { totals.missingRate = true; continue; }
    totals.all += myr;
    if (e.date.startsWith(year)) totals.year += myr;
    if (e.reinvest) totals.reinvested += myr; else totals.wallet += myr;
    const p = per.get(`${e.market}:${e.ticker}`) || { ticker: e.ticker, market: e.market, earned: 0, earnedMYR: 0, reinvestedMYR: 0, unitsAdded: 0 };
    p.earned += e.amount; p.earnedMYR += myr;
    if (e.reinvest) { p.reinvestedMYR += myr; p.unitsAdded += e.unitsAdded; }
    per.set(`${e.market}:${e.ticker}`, p);
  }
  return { events, totals, stocks: [...per.values()].sort((a, b) => b.earnedMYR - a.earnedMYR) };
}
