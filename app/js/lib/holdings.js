// Average-cost maths and portfolio totals. Pure: no database, no screen.
import { toYahoo, toMYR } from './markets.js';

// Ringgit-note colours (RM1 blue, RM100 purple, RM20 orange, RM50 teal), then quiet extras. No red/green: those mean down/up.
export const NOTE_COLOURS = ['#2F6DB5', '#7B4BA8', '#E08A2E', '#2E8C8C', '#8A6D3B', '#5B7083', '#B05F9E', '#4C8BC9'];

// Trades are replayed in date order, so entering an old trade later still gives the right answer.
export function buildHoldings(txns) {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  const map = new Map(), paid = new Map(); // paid: dividends you actually received, per stock
  for (const t of sorted) {
    const key = `${t.market}:${t.ticker}`;
    if (t.action === 'dividend') { paid.set(key, (paid.get(key) || 0) + (t.amount || 0)); continue; } // cash in, no change to units or cost
    let h = map.get(key);
    if (!h) map.set(key, (h = { ticker: t.ticker, market: t.market, type: t.type, units: 0, cost: 0, realised: 0, divTax: 0, fees: 0 }));
    if (t.type) h.type = t.type; // the kind of stock you chose on your latest trade of it
    if (t.divTax != null) h.divTax = t.divTax; // latest trade's tax % wins
    const fee = t.fee || 0; // commission fees (stamp duty + platform); older trades have none
    h.fees += fee;
    if (t.action === 'buy') {
      h.cost += t.units * t.price + fee; // buy fees become part of what the shares cost you
      h.units += t.units;
    } else {
      const sold = Math.min(t.units, h.units);
      const avg = h.units ? h.cost / h.units : 0;
      h.realised += (t.price - avg) * sold - fee; // sell fees come off the profit
      h.cost -= avg * sold;
      h.units -= sold;
      if (h.units < 1e-9) { h.units = 0; h.cost = 0; } // clear floating-point dust
    }
  }
  return [...map.entries()].map(([key, h]) => ({ ...h, received: paid.get(key) || 0 }));
}

// Holdings + live prices → everything the Stocks page shows, with totals in ringgit.
// Stocks with no price yet count at cost.
// ponytail: realised P/L uses today's exchange rate, not the rate on the sell date. Store the rate per trade if that matters.
export function summarize(holdings, live) {
  const rates = live.rates || {};
  const rows = holdings.map(h => {
    const q = h.units ? live.prices?.[toYahoo(h.ticker, h.market)] : null;
    const value = q ? q.price * h.units : null;
    return {
      ...h, q, value,
      key: `${h.market}:${h.ticker}`,
      unreal: value != null ? value - h.cost : null,
      estDiv: q ? q.divRate * h.units * (1 - h.divTax / 100) : null, // after withholding tax
      dayChange: q?.change != null ? q.change * h.units : 0,
      valueMYR: toMYR(value ?? h.cost, h.market, rates),
    };
  });
  const t = { value: 0, cost: 0, realised: 0, dividends: 0, received: 0, today: 0, fees: 0, incomplete: false };
  for (const r of rows) {
    if (r.valueMYR == null) { t.incomplete = true; continue; }
    if (r.units && r.value == null) t.incomplete = true;
    t.fees += toMYR(r.fees, r.market, rates);
    t.value += r.valueMYR;
    t.cost += toMYR(r.cost, r.market, rates);
    t.realised += toMYR(r.realised, r.market, rates);
    t.dividends += toMYR(r.estDiv || 0, r.market, rates);
    t.received += toMYR(r.received || 0, r.market, rates);
    t.today += toMYR(r.dayChange, r.market, rates);
  }
  t.profit = t.value - t.cost + t.realised;
  const open = rows.filter(r => r.units).sort((a, b) => (b.valueMYR ?? 0) - (a.valueMYR ?? 0));
  open.forEach((r, i) => {
    r.color = NOTE_COLOURS[i % NOTE_COLOURS.length];
    r.share = t.value ? ((r.valueMYR ?? 0) / t.value) * 100 : 0;
  });
  return { rows, open, closed: rows.filter(r => !r.units), totals: t };
}
