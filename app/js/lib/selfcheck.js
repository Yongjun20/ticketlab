// Self-checks for the money maths, symbols and CSV import/export.
// Runs when the app opens (problems show in the browser console) and in the Node test.
import { buildHoldings, summarize } from './holdings.js';
import { toYahoo, fromYahoo } from './markets.js';
import { analyse, shortDate, daysUntil, perShare } from './dividends.js';
import { mergeNews, countByDay, matchStocks, monthCells, dateKey } from './news.js';
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

  // News: merge keeps first-seen times, drops repeats and mistakes in the future, counts per day, spots your stocks, builds the calendar
  const now = Math.floor(new Date('2026-10-16T12:00:00').getTime() / 1000);
  const n1 = mergeNews([], [{ title: 'A', link: 'x1', source: 'CNBC', region: 'WORLD', time: now - 3600 }, { title: 'B', link: 'x2', source: 'Bernama', region: 'MY', time: null }, { title: 'C', link: 'x3', source: 'FMT', region: 'MY', time: now + 999999 }], now);
  const n2 = mergeNews(n1, [{ title: 'A', link: 'x1', time: 5 }, { title: 'D', link: 'x4', source: 'BBC', region: 'US', time: now - 90 * 86400 - 10 }], now);
  ok(n1.length === 3 && n1[0].time >= n1[1].time && n1.find(n => n.link === 'x2').guess && n1.find(n => n.link === 'x3').time === now, 'news merge');
  ok(n2.length === 3 && n2.find(n => n.link === 'x1').time === now - 3600, 'news keeps first time, drops repeats and very old');
  ok(countByDay(n1)[dateKey(now)] === 3, 'news per day');
  const mine = [{ ticker: 'MU', name: 'Micron Technology, Inc.' }, { ticker: '1295', name: 'Public Bank Berhad' }, { ticker: 'VOO', name: 'Vanguard S&P 500 ETF' }, { ticker: 'QQQM', name: 'Invesco NASDAQ 100 ETF' }];
  ok(matchStocks('Micron soars on AI demand', mine).join() === 'MU' && !matchStocks('Public holiday announced', mine).length && matchStocks('VOO hits a record', mine).join() === 'VOO', 'news matches ticker and name');
  ok(matchStocks('Why the S&P 500 fell today', mine).join() === 'VOO' && matchStocks('Nasdaq futures sink premarket', mine).join() === 'QQQM' && !matchStocks('Fed holds rates', mine).length, 'news matches index funds');
  const t1 = mergeNews([], [{ title: 'Z', link: 'z1', source: 'Yahoo', region: 'STOCK', time: now - 60, tickers: ['VOO'] }], now);
  const t2 = mergeNews(t1, [{ title: 'Z', link: 'z1', time: now - 60, tickers: ['QQQM'] }, { title: 'Y', link: 'z2', source: 'CNBC', region: 'US', time: now - 120 }], now);
  ok(t2.length === 2 && t2[0].tickers.join() === 'VOO,QQQM' && t2[1].tickers.length === 0 && t1[0].tickers.join() === 'VOO', 'news remembers which stocks a headline is about');
  const cal = monthCells(2026, 9); // October 2026 starts on a Thursday: 3 empty cells, 31 days
  ok(cal.length === 34 && cal[2] === null && cal[3] === '2026-10-01' && cal.at(-1) === '2026-10-31', 'calendar cells');

  // Dividend dates: a quarterly fund gets its next ex-date estimated one gap later; Yahoo's future date wins; a stock that stopped paying gets none
  const D = s => Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000), t0 = D('2026-10-16');
  const q = analyse({ history: [{ ex: D('2026-03-27'), amount: 1.872 }, { ex: D('2025-12-22'), amount: 1.771 }, { ex: D('2026-06-26'), amount: 1.962 }, { ex: D('2026-09-28'), amount: 1.823 }] }, t0);
  ok(q.freq === 'Quarterly' && q.last.amount === 1.823 && q.next.estimated && shortDate(q.next.ex).endsWith('Dec 2026') && near(q.pastYear, 1.771 + 1.872 + 1.962 + 1.823), 'dividend estimate');
  const c = analyse({ history: [{ ex: D('2026-03-12'), amount: 0.33 }, { ex: D('2026-09-23'), amount: 0.31 }], calEx: D('2027-03-10'), calPay: D('2027-04-01') }, t0);
  ok(c.freq === 'Twice a year' && !c.next.estimated && shortDate(c.next.ex) === '10 Mar 2027' && c.pay.past === false, 'dividend calendar date wins');
  ok(analyse({ history: [{ ex: D('2023-01-05'), amount: 0.1 }, { ex: D('2023-04-05'), amount: 0.1 }] }, t0).next === null && analyse({ history: [] }, t0) === null, 'no estimate once a stock stopped paying');
  ok(daysUntil(D('2026-10-19'), t0) === 3 && perShare(0.31, 'RM') === 'RM0.310' && perShare(24.5, '$') === '$24.50', 'dividend helpers');

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
