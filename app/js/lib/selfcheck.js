// Self-checks for the money maths, symbols and CSV import/export.
// Runs when the app opens (problems show in the browser console) and in the Node test.
import { buildHoldings, summarize } from './holdings.js';
import { toYahoo, fromYahoo } from './markets.js';
import { parseCSV, parseNum, parseDateCell, guessDateOrder, cleanTicker, detectMapping, rowToTrade, tradesToCSV, tradeKey } from './csv.js';

export function runSelfChecks() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // Average cost: 100 @ 9, 100 @ 10, sell 50 @ 10.50 → 150 units, cost 1425, realised +50 (trades entered out of order)
  const [h] = buildHoldings([
    { id: 1, date: '2025-01-01', ticker: 'X', market: 'MY', action: 'buy', units: 100, price: 9 },
    { id: 3, date: '2025-03-01', ticker: 'X', market: 'MY', action: 'sell', units: 50, price: 10.5 },
    { id: 2, date: '2025-02-01', ticker: 'X', market: 'MY', action: 'buy', units: 100, price: 10 },
  ]);
  ok(h.units === 150 && near(h.cost, 1425) && near(h.realised, 50), 'average cost');

  // Dividends received: counted per stock, but never change units or cost
  const [d] = buildHoldings([
    { id: 1, date: '2025-01-01', ticker: 'Z', market: 'MY', action: 'buy', units: 100, price: 9 },
    { id: 2, date: '2025-02-01', ticker: 'Z', market: 'MY', action: 'dividend', amount: 30 },
    { id: 3, date: '2025-03-01', ticker: 'Z', market: 'MY', action: 'dividend', amount: 12.5 },
  ]);
  ok(d.units === 100 && near(d.cost, 900) && near(d.received, 42.5), 'dividends received');

  // Fees: buy 100 @ 9 + 10 → cost 910; sell 50 @ 10 + 5 → realised (10 − 9.10) × 50 − 5 = 40
  const [f] = buildHoldings([
    { id: 1, date: '2025-01-01', ticker: 'Y', market: 'MY', action: 'buy', units: 100, price: 9, fee: 10 },
    { id: 2, date: '2025-02-01', ticker: 'Y', market: 'MY', action: 'sell', units: 50, price: 10, fee: 5 },
  ]);
  ok(near(f.cost, 455) && near(f.realised, 40) && f.fees === 15, 'fees');

  // Totals in ringgit: 150 × RM9.98 + 10 × $341.27 × 4.08
  const s = summarize(
    buildHoldings([
      { id: 1, date: '2025-01-01', ticker: '1155', market: 'MY', action: 'buy', units: 150, price: 9.5 },
      { id: 2, date: '2025-01-02', ticker: 'AAPL', market: 'US', action: 'buy', units: 10, price: 200 },
    ]),
    { prices: { '1155.KL': { price: 9.98, divRate: 0.64, change: 0.02 }, AAPL: { price: 341.27, divRate: 1.06, change: 1 } }, rates: { usdMyr: 4.08 } },
  );
  ok(Math.abs(s.totals.value - (150 * 9.98 + 3412.7 * 4.08)) < 1e-6 && s.open[0].ticker === 'AAPL' && s.open[0].color, 'portfolio totals');

  // Symbols round-trip
  for (const [sym, type] of [['MU', 'EQUITY'], ['1155.KL', 'EQUITY'], ['D05.SI', 'EQUITY'], ['0700.HK', 'EQUITY'], ['HSBA.L', 'EQUITY'], ['MC.PA', 'EQUITY'], ['SAP.DE', 'EQUITY'], ['BTC-USD', 'CRYPTOCURRENCY']]) {
    const m = fromYahoo(sym, type);
    ok(m && toYahoo(m.ticker, m.market) === sym, `symbol ${sym}`);
  }
  ok(fromYahoo('MU.TO', 'EQUITY') === null, 'Toronto skipped');

  // CSV reading
  ok(JSON.stringify(parseCSV('a,b\r\n"x, 1","say ""hi"""\n')) === JSON.stringify([['a', 'b'], ['x, 1', 'say "hi"']]), 'csv quotes');
  ok(parseCSV('a;b\n1;2')[1][1] === '2', 'csv semicolon');
  ok(parseNum('USD 1,234.50') === 1234.5 && parseNum('@12.30') === 12.3 && parseNum('(5.00)') === -5 && isNaN(parseNum('--')), 'numbers');
  ok(parseDateCell('2026-10-14 22:31:05') === '2026-10-14' && parseDateCell('14/10/2026') === '2026-10-14'
    && parseDateCell('10/14/2026 09:31:05 EDT', 'mdy') === '2026-10-14' && parseDateCell('20261014') === '2026-10-14', 'dates');
  ok(guessDateOrder(['10/14/2026']).order === 'mdy' && guessDateOrder(['14/10/2026']).order === 'dmy' && guessDateOrder(['05/06/2026']).ask, 'date order');
  ok(cleanTicker('US.AAPL').ticker === 'AAPL' && cleanTicker('1155.KL').market === 'MY' && cleanTicker('HK.00700').ticker === '0700', 'tickers');

  // Webull-style file: filled row imported, cancelled row skipped
  const wb = parseCSV('Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time\n'
    + 'Micron,MU,Buy,Filled,10,10,@120.00,119.50,DAY,10/14/2026 09:30:00 EDT,10/14/2026 09:31:05 EDT\n'
    + 'Apple,AAPL,Sell,Cancelled,0,5,@300.00,,DAY,10/15/2026 10:00:00 EDT,\n');
  const wm = detectMapping(wb[0], wb.slice(1));
  const r1 = rowToTrade(wb[1], wm, { dateOrder: 'mdy' }), r2 = rowToTrade(wb[2], wm, { dateOrder: 'mdy' });
  ok(r1.trade?.ticker === 'MU' && r1.trade.units === 10 && r1.trade.price === 119.5 && r1.trade.date === '2026-10-14' && r1.trade.action === 'buy', 'webull row');
  ok(!!r2.skip, 'cancelled skipped');

  // Export → import gives the same trades back
  const sample = [
    { id: 1, date: '2026-01-06', ticker: '1155', market: 'MY', action: 'buy', type: 'dividend', units: 1000, price: 9, fee: 24.5, divTax: 0, notes: 'First, "big" buy' },
    { id: 2, date: '2026-03-14', ticker: 'AAPL', market: 'US', action: 'sell', type: 'growth', units: 2, price: 301.25, fee: 1.99, divTax: 30, notes: '' },
    { id: 3, date: '2026-04-20', ticker: '1155', market: 'MY', action: 'dividend', type: 'dividend', units: 0, price: 0, fee: 0, amount: 55.5, notes: '' },
  ];
  const back = parseCSV(tradesToCSV(sample));
  const bm = detectMapping(back[0], back.slice(1));
  const again = back.slice(1).map(r => rowToTrade(r, bm).trade);
  ok(again.every((t, i) => tradeKey(t) === tradeKey(sample[i]) && t.notes === sample[i].notes && t.type === sample[i].type && t.divTax === sample[i].divTax), 'export → import round trip');

  return fails;
}
