// The app's shared state and actions. Components read `state` and call these functions.
import { reactive, computed, watch, markRaw } from './vendor/vue.esm-browser.prod.js';
import * as db from './lib/db.js';
import { buildHoldings, summarize } from './lib/holdings.js';
import { toYahoo, toMYR, RATE_KEY } from './lib/markets.js';
import { getMarketData, isFresh, keyOf, getFeed, getDividends, getMarkets, getNews } from './lib/prices.js';
import { mergeNews } from './lib/news.js';
import { buildEarned } from './lib/earned.js';
import { tradesToCSV, parseCSV, findHeaderRow, detectMapping, guessDateOrder, tradeKey } from './lib/csv.js';
import { today, money, CURRENCY } from './lib/format.js';
import { success, warn } from './lib/haptic.js';

export const state = reactive({
  ready: false,
  storageError: '',
  txns: [],
  live: { at: 0, key: '', prices: {}, rates: {}, error: '' },
  loading: false,
  tab: 0,            // 0 = Stocks, 1 = History
  tabPos: 0,         // follows your finger while swiping (0…1), drives the tab pill
  tabAnimate: false, // pill glides when true, follows the finger when false
  reinvest: null,    // the dividend being reinvested: { ev }
  sheet: null,       // the open trade form: { mode: 'add' | 'edit', action, ticker, market, trade }
  importJob: null,   // the file being imported
  toasts: [],
  glowId: null,      // the trade you just saved glows briefly
  divs: {},          // dividend history per stock, saved on this phone: { 'VOO': { at, history, calEx, calPay } }
  market: { at: 0, items: {}, loading: false, error: '' }, // oil, yields, indexes for the News tab's Summary
  news: [],          // headlines saved on this phone (newest first)
  newsAt: 0,         // when we last asked the worker
  newsLoading: false,
  newsError: '',
  theme: '',         // '' = follow the phone, or 'light' / 'dark' (the sun/moon button)
  hide: false,      // hide the three big numbers (the eye button on the total card)
  currency: '',      // '' = mixed (each stock in its own currency); otherwise a market key like 'MY' or 'US' to show everything in
});

// Pager registers these so the tab bar can drag the pages along with the pill
export const pagerApi = { drag: () => {}, drop: () => {} };

export const holdings = computed(() => buildHoldings(state.txns));
export const summary = computed(() => summarize(holdings.value, state.live));
// Dividends you earned (from each stock's past dividends and the units you held), with totals in ringgit
export const earned = computed(() => buildEarned(state.txns, state.divs, state.live.rates));

export async function load() {
  try {
    await db.open();
    state.txns = await db.all();
    await unifyKinds(); // one kind per stock, also for trades saved before this rule
  } catch (err) {
    state.storageError = err?.message || String(err);
  }
  state.ready = true;
  refresh();
  // News and market numbers can wait: first let the screen draw and the first taps run, then fetch them one after another
  idle(() => refreshNews().then(() => idle(refreshMarket)));
}

// Background loading (news, market numbers, dividends) starts when the browser is idle, 2.5 seconds after opening, AND you haven't
// touched the screen for 1.5 seconds, so a response never arrives in the middle of a swipe.
let touchedAt = 0;
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => { touchedAt = Date.now(); }, { capture: true, passive: true });
const bootAt = Date.now();
const whenCalm = (fn, quiet) => (Date.now() - touchedAt < quiet || Date.now() - bootAt < 2500 ? setTimeout(() => whenCalm(fn, quiet), 250) : fn()); // also never in the first 2.5 seconds after opening
export const idle = (fn, quiet = 1500, wait = 4000) => (window.requestIdleCallback ? requestIdleCallback(() => whenCalm(fn, quiet), { timeout: wait }) : setTimeout(() => whenCalm(fn, quiet), Math.min(wait, 1200))); // quiet: ms the screen must be untouched; wait: the longest to wait for an idle moment

// Prices for the stocks you hold + exchange rates (rates also feed History's month totals)
export async function refresh(force = false) {
  const symbols = holdings.value.filter(h => h.units > 0).map(h => toYahoo(h.ticker, h.market));
  if (!force && isFresh(state.live, keyOf(symbols))) return;
  state.loading = true;
  state.live = await getMarketData(symbols, state.live);
  state.loading = false;
  // dividend history for every stock you ever traded (the Earned view needs the ones you sold too)
  const traded = [...new Set(state.txns.filter(t => t.action !== 'dividend').map(t => toYahoo(t.ticker, t.market)))];
  idle(() => refreshDividends(traded));
}

// Dividend dates and amounts for the stocks you hold. Asked again after 12 hours, or when you add a new stock.
export async function refreshDividends(symbols) {
  const stale = symbols.filter(s => !(state.divs[s] && Date.now() - state.divs[s].at < 12 * 3600 * 1000)).slice(0, 20);
  if (!stale.length) return;
  try {
    const got = await getDividends(stale);
    const next = { ...state.divs };
    for (const s of stale) if (got[s]) next[s] = { ...got[s], at: Date.now() };
    state.divs = next;
    try { localStorage.setItem('divs', JSON.stringify(next)); } catch {}
  } catch { /* offline or worker not updated yet: the Dividend dates card just stays empty */ }
}

// Market news: ask the worker, add what's new to the saved list. Done at most every 10 minutes unless you press refresh.
export async function refreshNews(force = false) {
  if (state.newsLoading || (!force && Date.now() - state.newsAt < 10 * 60 * 1000)) return;
  state.newsLoading = true;
  // the general feeds, and each of your stocks' own headlines (up to your 8 biggest), at the same time
  const own = summary.value.open.slice(0, 8);
  const [feed, ...perStock] = await Promise.allSettled([
    getFeed(),
    ...own.map(r => getNews(toYahoo(r.ticker, r.market)).then(list => list.map(n => ({
      title: n.title, link: n.link, source: n.publisher || 'Yahoo Finance', region: 'STOCK', time: n.time, tickers: [r.ticker],
    })))),
  ]);
  const items = [...(feed.status === 'fulfilled' ? feed.value.items : []), ...perStock.flatMap(p => (p.status === 'fulfilled' ? p.value : []))];
  if (items.length) { state.news = markRaw(mergeNews(state.news, items)); saveNews(); state.newsAt = Date.now(); }
  state.newsError = feed.status !== 'fulfilled' ? 'News isn’t available right now. Showing what is saved on this phone.'
    : !feed.value.items.length ? 'No headlines came back. Try again in a moment.'
    : feed.value.failed.length ? `Couldn’t reach ${feed.value.failed.join(', ')} just now.` : '';
  state.newsLoading = false;
}

// Oil, yields and indexes: asked at most every 5 minutes; the last numbers stay on screen when offline
export async function refreshMarket(force = false) {
  const m = state.market;
  if (m.loading || (!force && Date.now() - m.at < 5 * 60 * 1000)) return;
  m.loading = true;
  try {
    m.items = await getMarkets();
    m.at = Date.now(); m.error = '';
    try { localStorage.setItem('market', JSON.stringify({ at: m.at, items: m.items })); } catch {}
  } catch {
    m.error = 'Market numbers aren’t available right now.';
  }
  m.loading = false;
}
function saveNews() {
  try { localStorage.setItem('news', JSON.stringify(state.news)); } catch {
    try { state.news = markRaw(state.news.slice(0, 600)); localStorage.setItem('news', JSON.stringify(state.news)); } catch {} // storage full: keep the newest
  }
}
function loadNews() {
  try {
    const list = JSON.parse(localStorage.getItem('news') || '[]');
    return Array.isArray(list) ? list.filter(n => n.source !== 'BBC').map(n => (n.region === 'WORLD' ? { ...n, region: 'US' } : n)) : []; // the first version also had BBC, and called US news "World"
  } catch { return []; }
}
state.news = markRaw(loadNews()); // headlines never change once saved, so Vue doesn't need to watch each one
try { const saved = JSON.parse(localStorage.getItem('market') || 'null'); if (saved?.items) { state.market.items = saved.items; state.market.at = 0; } } catch {} // shown at once, then updated
try { state.divs = JSON.parse(localStorage.getItem('divs') || '{}') || {}; } catch { state.divs = {}; }

// A little message above the tab bar. With an action ({ label, run }) it also shows a button and stays a bit longer.
export function toast(msg, action = null) {
  const id = Math.random();
  state.toasts.push({ id, msg, action });
  setTimeout(() => dismissToast(id), action ? 6000 : 2400);
}
export function dismissToast(id) {
  const i = state.toasts.findIndex(t => t.id === id);
  if (i >= 0) state.toasts.splice(i, 1);
}

function glow(id) {
  state.glowId = id;
  setTimeout(() => { if (state.glowId === id) state.glowId = null; }, 1800);
}

// A stock has ONE kind (Growth or Dividend) for all its trades, so nothing is ever mixed.
// setKind: the kind you chose now goes on every trade of that stock. unifyKinds: for data that is already mixed, the latest trade decides.
async function setKind(ticker, market, kind) {
  let changed = false;
  for (const t of state.txns) {
    if (t.ticker !== ticker || t.market !== market || t.action === 'dividend' || t.type === kind) continue;
    await db.put({ ...t, type: kind });
    changed = true;
  }
  if (changed) state.txns = await db.all();
}
// Change a stock's kind from its pop-out: every trade of the stock follows
export async function setStockKind(ticker, market, kind) {
  await setKind(ticker, market, kind);
  toast(`${ticker} is now a ${kind === 'growth' ? 'Growth' : 'Dividend'} stock`);
}

export async function unifyKinds() {
  const latest = new Map();
  [...state.txns].filter(t => t.action === 'buy' || t.action === 'sell').sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
    .forEach(t => latest.set(`${t.market}:${t.ticker}`, t.type));
  let changed = false;
  for (const t of state.txns) {
    const kind = latest.get(`${t.market}:${t.ticker}`);
    if (!kind || t.action === 'dividend' || t.type === kind) continue;
    await db.put({ ...t, type: kind });
    changed = true;
  }
  if (changed) state.txns = await db.all();
}

export async function saveTrade(trade, id = null) {
  if (id) await db.put({ ...trade, id });
  else id = await db.add(trade);
  state.txns = await db.all();
  if ((trade.action === 'buy' || trade.action === 'sell') && trade.type) await setKind(trade.ticker, trade.market, trade.type);
  glow(id);
  refresh();
  success();
  return id;
}

// Reinvest a dividend: a Buy that adds units (dated the ex-date), plus a record that remembers which dividend it came from
export async function reinvestDividend(ev, { units, price }) {
  const kind = holdings.value.find(h => h.ticker === ev.ticker && h.market === ev.market)?.type || 'dividend';
  const buyId = await db.add({ date: ev.date, ticker: ev.ticker, market: ev.market, action: 'buy', type: kind, units, price, fee: 0, divTax: ev.tax, notes: `Dividend reinvested (ex ${ev.date})` });
  await db.add({ date: ev.date, ticker: ev.ticker, market: ev.market, action: 'dividend', type: 'dividend', auto: true, evKey: ev.key, linkId: buyId,
    units: ev.units, price: ev.perShare, fee: 0, amount: ev.net, notes: 'Reinvested' });
  state.txns = await db.all();
  refresh();
  toast(`Reinvested: +${+units.toFixed(4)} ${ev.ticker}`);
}

// Back to the Wallet: the reinvest Buy and the record are removed
export async function undoReinvest(ev) {
  if (ev.buyId != null) await db.del(ev.buyId);
  if (ev.recordId != null) await db.del(ev.recordId);
  state.txns = await db.all();
  refresh();
  toast(`${ev.ticker} dividend is back in your Wallet`);
}

export async function deleteTrade(id) {
  await db.del(id);
  state.txns = state.txns.filter(t => t.id !== id);
}

// Delete several trades in one go (History's Select mode)
export async function deleteTrades(ids) {
  for (const id of ids) await db.del(id);
  const gone = new Set(ids);
  state.txns = state.txns.filter(t => !gone.has(t.id));
}

// Delete trades, and offer "Undo" for a few seconds: undo puts back exactly the same records
export async function deleteWithUndo(trades) {
  const saved = trades.map(t => JSON.parse(JSON.stringify(t)));
  await deleteTrades(saved.map(t => t.id));
  warn();
  const n = saved.length, s = n === 1 ? '' : 's';
  toast(`Deleted ${n} trade${s}`, {
    label: 'Undo',
    run: async () => {
      for (const t of saved) await db.put(t); // same id, so it lands exactly where it was
      state.txns = await db.all();
      refresh();
      toast(`Restored ${n} trade${s}`);
    },
  });
}

export async function importTrades(list) {
  const own = new Map(); // a stock you already have keeps its kind, whatever the file says
  for (const t of state.txns) if (t.action !== 'dividend' && t.type) own.set(`${t.market}:${t.ticker}`, t.type);
  for (const t of list) await db.add(t.action === 'dividend' || !own.has(`${t.market}:${t.ticker}`) ? t : { ...t, type: own.get(`${t.market}:${t.ticker}`) });
  state.txns = await db.all();
  await unifyKinds();
  refresh();
}

export async function loadExample() {
  await importTrades([
    { date: '2025-01-06', ticker: '1155', market: 'MY', action: 'buy', type: 'dividend', units: 100, price: 9.0, fee: 12.5, divTax: 0, notes: 'Example' },
    { date: '2025-02-10', ticker: '1155', market: 'MY', action: 'buy', type: 'dividend', units: 100, price: 10.0, fee: 12.5, divTax: 0, notes: 'Example' },
    { date: '2025-03-14', ticker: '1155', market: 'MY', action: 'sell', type: 'dividend', units: 50, price: 10.5, fee: 8, divTax: 0, notes: 'Example' },
  ]);
  toast('Added 3 example trades');
}

export function openSheet(opts = {}) {
  state.sheet = { mode: opts.trade ? 'edit' : 'add', action: 'buy', ticker: '', market: null, ...opts, key: Date.now() };
}

// Import: read a CSV / Excel file and open the check screen (ImportSheet)
async function readExcel(file) {
  if (!window.XLSX) await new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', onload: res, onerror: rej });
    document.head.appendChild(s);
  });
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
    .map(r => r.map(c => String(c).trim())).filter(r => r.some(Boolean));
}

export async function importFile(file) {
  try {
    const rows = /\.xlsx?$/i.test(file.name) ? await readExcel(file) : parseCSV(await file.text());
    if (rows.length < 2) return toast('That file has no rows to import.');
    const h = findHeaderRow(rows);
    const header = rows[h], body = rows.slice(h + 1).filter(r => r.length > 1);
    const map = detectMapping(header, body);
    const guess = guessDateOrder(map.date != null ? body.map(r => r[map.date]) : []);
    state.importJob = { fileName: file.name, header, rows: body, map, dateOrder: guess.order, askDate: guess.ask,
      defaultMarket: 'US', existing: new Set(state.txns.map(tradeKey)) };
  } catch {
    toast('Couldn’t read that file. Save it as CSV and try again.');
  }
}

// Show amounts in the currency chosen in the top banner. Mixed (''): each stock keeps its own currency, totals are in ringgit.
export const CURRENCIES = [['MY', 'MYR'], ['US', 'USD'], ['SG', 'SGD'], ['HK', 'HKD'], ['UK', 'GBP'], ['EU', 'EUR']];
function inShown(v, market) {
  const to = state.currency;
  if (!to || to === market) return { v, market };
  const myr = toMYR(v, market, state.live.rates);
  const rate = to === 'MY' ? 1 : state.live.rates?.[RATE_KEY[to]];
  return myr == null || !rate ? { v, market } : { v: myr / rate, market: to }; // no exchange rate yet: leave it as it is
}
// The eye hides only the three big numbers (the total, and the value on the Growth and Dividend group cards): they show as dots
export const masked = market => `${CURRENCY[inShown(0, market).market] ?? ''}••••`;
export const cash = (v, market) => { const x = inShown(v, market); return money(x.v, x.market); };
export const cashSigned = (v, market) => (v > 0 ? '+' : v < 0 ? '−' : '') + cash(Math.abs(v), market);
export const shownTotal = v => inShown(v, 'MY').v;                  // a ringgit total as a number in the chosen currency
export const shownMarket = () => inShown(0, 'MY').market;           // the market whose symbol goes with shownTotal

// "Last export" note
const remember = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
export const lastExport = reactive({ date: remember.get('lastExport') });
state.currency = CURRENCIES.some(([m]) => m === remember.get('currency')) ? remember.get('currency') : '';
watch(() => state.currency, c => remember.set('currency', c));
state.hide = remember.get('hide') === '1';
watch(() => state.hide, h => remember.set('hide', h ? '1' : '0'));

// Day / night: '' follows the phone until the sun/moon button is tapped, then your choice is remembered
const BAR = ['#EEF2F6', '#0E1626']; // the phone's top bar colour: day, night
const systemDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };
export const isNight = () => state.theme ? state.theme === 'dark' : systemDark();
function applyTheme(t) {
  const root = document.documentElement;
  if (t) root.dataset.theme = t; else delete root.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => { m.content = t ? BAR[t === 'dark' ? 1 : 0] : BAR[i] ?? BAR[0]; });
}
state.theme = ['light', 'dark'].includes(remember.get('theme')) ? remember.get('theme') : '';
applyTheme(state.theme);
watch(() => state.theme, t => { remember.set('theme', t); applyTheme(t); });
export const toggleTheme = () => { state.theme = isNight() ? 'light' : 'dark'; };

export async function exportCSV() {
  if (!state.txns.length) return toast('No trades to export yet');
  const name = `tickerhub-trades-${today()}.csv`;
  const file = new File([tradesToCSV(state.txns)], name, { type: 'text/csv' });
  try {
    // Phones: share sheet (Save to Files / Drive / WhatsApp). PC: normal download.
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    remember.set('lastExport', today());
    lastExport.date = today();
    toast(`Exported ${state.txns.length} trades`);
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Export didn’t work. Try again.');
  }
}
