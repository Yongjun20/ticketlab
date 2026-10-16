// The app's shared state and actions. Components read `state` and call these functions.
import { reactive, computed, watch } from './vendor/vue.esm-browser.prod.js';
import * as db from './lib/db.js';
import { buildHoldings, summarize } from './lib/holdings.js';
import { toYahoo, toMYR, RATE_KEY } from './lib/markets.js';
import { getMarketData, isFresh, keyOf } from './lib/prices.js';
import { tradesToCSV, parseCSV, findHeaderRow, detectMapping, guessDateOrder, tradeKey } from './lib/csv.js';
import { today, money } from './lib/format.js';

export const state = reactive({
  ready: false,
  storageError: '',
  txns: [],
  live: { at: 0, key: '', prices: {}, rates: {}, error: '' },
  loading: false,
  tab: 0,            // 0 = Stocks, 1 = History
  tabPos: 0,         // follows your finger while swiping (0…1), drives the tab pill
  tabAnimate: false, // pill glides when true, follows the finger when false
  sheet: null,       // the open trade form: { mode: 'add' | 'edit', action, ticker, market, trade }
  importJob: null,   // the file being imported
  toasts: [],
  glowId: null,      // the trade you just saved glows briefly
  currency: '',      // '' = mixed (each stock in its own currency); otherwise a market key like 'MY' or 'US' to show everything in
});

// Pager registers these so the tab bar can drag the pages along with the pill
export const pagerApi = { drag: () => {}, drop: () => {} };

export const holdings = computed(() => buildHoldings(state.txns));
export const summary = computed(() => summarize(holdings.value, state.live));

export async function load() {
  try {
    await db.open();
    state.txns = await db.all();
  } catch (err) {
    state.storageError = err?.message || String(err);
  }
  state.ready = true;
  refresh();
}

// Prices for the stocks you hold + exchange rates (rates also feed History's month totals)
export async function refresh(force = false) {
  const symbols = holdings.value.filter(h => h.units > 0).map(h => toYahoo(h.ticker, h.market));
  if (!force && isFresh(state.live, keyOf(symbols))) return;
  state.loading = true;
  state.live = await getMarketData(symbols, state.live);
  state.loading = false;
}

export function toast(msg) {
  const id = Math.random();
  state.toasts.push({ id, msg });
  setTimeout(() => {
    const i = state.toasts.findIndex(t => t.id === id);
    if (i >= 0) state.toasts.splice(i, 1);
  }, 2400);
}

function glow(id) {
  state.glowId = id;
  setTimeout(() => { if (state.glowId === id) state.glowId = null; }, 1800);
}

export async function saveTrade(trade, id = null) {
  if (id) await db.put({ ...trade, id });
  else id = await db.add(trade);
  state.txns = await db.all();
  glow(id);
  refresh();
  return id;
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

export async function importTrades(list) {
  for (const t of list) await db.add(t);
  state.txns = await db.all();
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
export const cash = (v, market) => { const x = inShown(v, market); return money(x.v, x.market); };
export const cashSigned = (v, market) => (v > 0 ? '+' : v < 0 ? '−' : '') + cash(Math.abs(v), market);
export const shownTotal = v => inShown(v, 'MY').v;                  // a ringgit total as a number in the chosen currency
export const shownMarket = () => inShown(0, 'MY').market;           // the market whose symbol goes with shownTotal

// "Last export" note
const remember = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
export const lastExport = reactive({ date: remember.get('lastExport') });
state.currency = CURRENCIES.some(([m]) => m === remember.get('currency')) ? remember.get('currency') : '';
watch(() => state.currency, c => remember.set('currency', c));

export async function exportCSV() {
  if (!state.txns.length) return toast('No trades to export yet');
  const name = `divtracker-trades-${today()}.csv`;
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
