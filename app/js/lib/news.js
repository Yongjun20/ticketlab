// Market news kept on this phone: merge new headlines into the saved list, count them per day, spot your stocks.
// Pure: no screen, no storage.

export const KEEP_DAYS = 30; // older headlines are dropped so the saved list stays small

// Unix seconds → the day on your own clock, "2026-10-16"
export const dateKey = sec => new Date(sec * 1000).toLocaleDateString('en-CA');

// Saved list + the latest from the worker → one list, newest first, no repeats.
// A headline keeps the time it was first saved with. When a site gives no time, the time we first saw it stands in (guess: true).
export function mergeNews(saved, incoming, nowSec = Math.floor(Date.now() / 1000)) {
  const byLink = new Map(saved.map(n => [n.link, { ...n, tickers: n.tickers || [] }]));
  for (const n of incoming) {
    if (!n.title || !n.link) continue;
    const have = byLink.get(n.link);
    if (have) { have.tickers = [...new Set([...have.tickers, ...(n.tickers || [])])]; continue; } // same story again: only learn which stocks it is about
    const real = Number.isFinite(n.time) && n.time <= nowSec + 3600; // a time in the future is a mistake by the site
    byLink.set(n.link, { title: n.title, link: n.link, source: n.source, region: n.region, time: real ? n.time : nowSec, guess: !real, tickers: n.tickers || [] });
  }
  const oldest = nowSec - KEEP_DAYS * 86400;
  return [...byLink.values()].filter(n => n.time >= oldest).sort((a, b) => b.time - a.time);
}

// { '2026-10-16': 24, ... } for the dots on the calendar
export function countByDay(list) {
  const out = {};
  for (const n of list) out[dateKey(n.time)] = (out[dateKey(n.time)] || 0) + 1;
  return out;
}

// Which of your stocks does this headline talk about? Returns their tickers (a hint, not a promise). A stock matches on:
//  - its ticker as a whole word (VOO, AAPL)
//  - the first word of its name (Micron, Vanguard, Invesco), unless that word is too common
//  - an index named in its name (an S&P 500 fund matches "S&P 500", a Nasdaq-100 fund matches "Nasdaq")
const rxCache = new Map(); // each pattern is built once, not for every headline
const rx = (src, flags = '') => { const k = flags + '/' + src; let r = rxCache.get(k); if (!r) rxCache.set(k, (r = new RegExp(src, flags))); return r; };
const TOO_COMMON = new Set(['public', 'malayan', 'global', 'united', 'first', 'national', 'general', 'group', 'bank', 'holdings', 'international']);
const INDEX_IN_NAME = /S&P ?\d+|NASDAQ|Dow Jones|Russell ?\d+/i;
const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchStocks(title, stocks) {
  return stocks.filter(({ ticker, name }) => {
    if (/^[A-Z]{2,5}$/.test(ticker) && rx(`\\b${ticker}\\b`).test(title)) return true;
    const first = (name || '').split(/\s+/)[0].replace(/[^A-Za-z]/g, '');
    if (first.length >= 5 && !TOO_COMMON.has(first.toLowerCase()) && rx(`\\b${first}\\b`).test(title)) return true;
    const index = (name || '').match(INDEX_IN_NAME)?.[0];
    return !!index && rx(esc(index).replace(/ /g, '\\s?'), 'i').test(title);
  }).map(s => s.ticker);
}

// Month grid for the calendar: weeks start on Monday; null = an empty cell before the 1st
export function monthCells(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
}
