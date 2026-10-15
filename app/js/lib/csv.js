// CSV export and import: read files from Moomoo, Webull, your own sheets or this app, and write a CSV you can open in Excel.
// Pure: no database, no screen.
import { fromYahoo } from './markets.js';
import { DEFAULT_TAX } from './format.js';

export const EXPORT_COLS = ['Date', 'Action', 'Ticker', 'Market', 'Units', 'Price', 'Commission fees', 'Total', 'Type', 'Dividend tax %', 'Notes'];
export const csvCell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function tradesToCSV(txns) {
  const rows = [...txns].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0)).map(t => {
    if (t.action === 'dividend') return [t.date, 'Dividend', t.ticker, t.market, '', '', 0, +(t.amount || 0).toFixed(4), 'Dividend', 0, t.notes || ''];
    const sell = t.action === 'sell', fee = t.fee || 0;
    return [t.date, sell ? 'Sell' : 'Buy', t.ticker, t.market, t.units, t.price, fee,
      +(t.units * t.price + (sell ? -fee : fee)).toFixed(4), t.type === 'growth' ? 'Growth' : 'Dividend', t.divTax ?? 0, t.notes || ''];
  });
  return '﻿' + [EXPORT_COLS, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads it as UTF-8
}

// CSV text → rows of cells. Handles quotes, commas inside quotes, and comma / semicolon / tab files.
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const delim = [',', ';', '\t'].map(d => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

// "USD 1,234.50" → 1234.5, "@12.30" → 12.3, "(5.00)" → -5, "--" → NaN
export function parseNum(v) {
  const s = String(v ?? '').trim();
  const m = s.replace(/[,\s]/g, '').match(/-?\d*\.?\d+/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  return /^\(.*\)$/.test(s) ? -Math.abs(n) : n;
}

export const pad2 = n => String(n).padStart(2, '0');
export function isoDate(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += 2000;
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}
// Any date style → YYYY-MM-DD. order: 'dmy' (14/10/2026) or 'mdy' (10/14/2026) for slash dates.
export function parseDateCell(v, order = 'dmy') {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return isoDate(m[1], m[2], m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})\b/);
  if (m) return isoDate(m[1], m[2], m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return order === 'mdy' ? isoDate(m[3], m[1], m[2]) : isoDate(m[3], m[2], m[1]);
  const d = new Date(s.replace(/\s+[A-Z]{2,4}T?$/, '')); // "Oct 14, 2026", "14 Oct 2026 09:31"
  return isNaN(d) ? null : d.toLocaleDateString('en-CA');
}
// Looks through a date column: a first number above 12 means day/month, a second number above 12 means month/day
export function guessDateOrder(values) {
  let slash = false;
  for (const v of values) {
    const m = String(v).match(/(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m || /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v)) continue;
    slash = true;
    if (+m[1] > 12) return { order: 'dmy', ask: false };
    if (+m[2] > 12) return { order: 'mdy', ask: false };
  }
  return { order: 'dmy', ask: slash }; // can't tell from the data: ask, default day/month (Malaysia)
}

export function parseAction(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('sell') || s.includes('sold') || /^(s|short)$/.test(s)) return 'sell';
  if (s.includes('buy') || s.includes('bought') || s.includes('purchase') || /^(b|long)$/.test(s)) return 'buy';
  return null;
}

// Market / exchange / currency words → this app's market codes
export const MARKET_WORDS = [
  [/^(us|usa|usd|nasdaq|nyse|amex|arca|bats|otc|nms|nyq|ngm|ncm|pnk)$|nasdaq|nyse|united states/i, 'US'],
  [/^(my|mys|myr|rm|bursa|klse|myx|kls)$|bursa|malaysia|kuala lumpur/i, 'MY'],
  [/^(sg|sgx|ses|sgd)$|singapore/i, 'SG'],
  [/^(hk|hkex|hkg|sehk|hkd)$|hong kong/i, 'HK'],
  [/^(uk|gb|lse|lon|gbp|gbx)$|london/i, 'UK'],
  [/^(eu|eur|xetra|ger|fra|par|ams|mil)$|euronext|xetra|paris|frankfurt|amsterdam/i, 'EU'],
  [/crypto|^(btc|eth)$/i, 'CRYPTO'],
];
export const marketFromWord = v => { const s = String(v ?? '').trim(); return s ? (MARKET_WORDS.find(([re]) => re.test(s))?.[1] ?? null) : null; };

// "US.AAPL" → AAPL/US, "1155.KL" → 1155/MY, "HK.00700" → 0700/HK
export function cleanTicker(raw, market) {
  let t = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const pre = t.match(/^(US|HK|SG|MY)\.(.+)$/);
  if (pre) { t = pre[2]; market = market || pre[1]; }
  if (/\.|-USD$/.test(t)) { const y = fromYahoo(t, t.endsWith('-USD') ? 'CRYPTOCURRENCY' : 'EQUITY'); if (y) { t = y.ticker; market = market || y.market; } }
  if (market === 'HK' && /^\d+$/.test(t)) t = t.replace(/^0+/, '').padStart(4, '0');
  return { ticker: t, market };
}

export const norm = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const FEE_WORDS = ['commission', 'fee', 'stampduty', 'stamp', 'clearing', 'levy', 'charge', 'sst', 'gst', 'brokerage', 'platform', 'secfee', 'taf', 'settlement'];
export const isFeeHeader = h => FEE_WORDS.some(w => h.includes(w)) && !/dividend|rate|currency|ccy|percent|withholding|date|time/.test(h);
export const TOTAL_FEE_NAMES = ['commissionfees', 'totalfee', 'totalfees', 'fees', 'fee', 'totalcharges', 'charges', 'totalcommission'];

// Our fields and the column names different brokers use for them, best match first
export const IMPORT_FIELDS = [
  { key: 'date', label: 'Date', need: true, names: ['tradedate', 'filledtime', 'filltime', 'executiontime', 'executiondate', 'transactiondate', 'tradetime', 'dealtime', 'date', 'datetime', 'time', 'ordertime', 'orderdate', 'placedtime', 'createdtime', 'settlementdate'] },
  { key: 'action', label: 'Buy or sell', names: ['side', 'action', 'direction', 'buysell', 'bs', 'tradeside', 'transactiontype', 'transaction', 'tradetype', 'type'], values: v => parseAction(v) != null },
  { key: 'ticker', label: 'Stock code', need: true, names: ['symbol', 'ticker', 'stockcode', 'code', 'securitycode', 'counter', 'instrument', 'tickersymbol', 'stock'] },
  { key: 'units', label: 'Units', need: true, names: ['fillqty', 'filledqty', 'filledquantity', 'filled', 'executedqty', 'dealqty', 'tradedqty', 'quantity', 'qty', 'units', 'shares', 'volume', 'totalqty'] },
  { key: 'price', label: 'Price per unit', names: ['fillprice', 'filledprice', 'avgprice', 'averageprice', 'avgfillprice', 'executionprice', 'tradeprice', 'dealprice', 'price', 'unitprice', 'orderprice'] },
  { key: 'amount', label: 'Total amount', names: ['fillamount', 'filledamount', 'tradeamount', 'grossamount', 'amount', 'total', 'tradevalue', 'value', 'netamount', 'consideration', 'turnover'] },
  { key: 'market', label: 'Market', names: ['market', 'exchange', 'region', 'marketcode', 'country'] },
  { key: 'currency', label: 'Currency', names: ['currency', 'ccy', 'tradecurrency', 'settlementcurrency'] },
  { key: 'status', label: 'Order status', names: ['status', 'orderstatus', 'state'] },
  { key: 'type', label: 'Dividend or growth', names: ['type', 'stocktype', 'kind'], values: v => /^(dividend|growth)$/i.test(String(v).trim()) },
  { key: 'tax', label: 'Dividend tax %', names: ['dividendtax', 'divtax', 'withholdingtax'] },
  { key: 'notes', label: 'Notes', names: ['notes', 'note', 'remark', 'remarks', 'memo', 'comment', 'name', 'stockname', 'securityname', 'description'] },
];
export const KNOWN_NAMES = new Set(IMPORT_FIELDS.flatMap(f => f.names));

// The header is the row (in the first 20) with the most column names we recognise
export function findHeaderRow(rows) {
  let best = 0, bestScore = -1;
  rows.slice(0, 20).forEach((r, i) => {
    const score = r.map(norm).filter(h => KNOWN_NAMES.has(h) || isFeeHeader(h)).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

// Header → { date: 0, ticker: 2, ..., fees: [7, 8] }. Exact names first, then names that contain ours.
export function detectMapping(header, rows) {
  const H = header.map(norm), used = new Set(), map = {};
  const sample = i => rows.slice(0, 30).map(r => r[i] ?? '').filter(Boolean);
  const fits = (f, i) => !f.values || (sample(i).length > 0 && sample(i).filter(f.values).length >= sample(i).length * 0.6);
  for (const f of IMPORT_FIELDS) {
    let idx = -1;
    for (const n of f.names) {
      idx = H.findIndex((h, j) => h === n && !used.has(j) && fits(f, j));
      if (idx >= 0) break;
    }
    if (idx < 0) for (const n of f.names) {
      if (n.length < 4) continue;
      idx = H.findIndex((h, j) => h.includes(n) && !used.has(j) && !isFeeHeader(h) && fits(f, j));
      if (idx >= 0) break;
    }
    if (idx >= 0) { map[f.key] = idx; used.add(idx); }
  }
  const total = H.findIndex((h, j) => !used.has(j) && TOTAL_FEE_NAMES.includes(h));
  map.fees = total >= 0 ? [total] : H.map((h, j) => (!used.has(j) && isFeeHeader(h) ? j : -1)).filter(j => j >= 0);
  return map;
}

export const SKIP_STATUS = /cancel|reject|fail|expire|withdraw|unfilled|pending|void/i;
// One CSV row → { trade } or { skip: 'reason' }
export function rowToTrade(row, map, { dateOrder = 'dmy', defaultMarket = 'US' } = {}) {
  const get = k => (map[k] != null && map[k] >= 0 ? row[map[k]] ?? '' : '');
  if (map.status != null && SKIP_STATUS.test(get('status'))) return { skip: 'Cancelled or not filled' };
  const date = parseDateCell(get('date'), dateOrder);
  if (!date) return { skip: 'No date' };
  if (!get('ticker')) return { skip: 'No stock code' };
  if (/^\s*dividends?\s*$/i.test(get('action'))) { // a dividend you received (this app's own export writes these)
    const paid = Math.abs(parseNum(get('amount')));
    if (!(paid > 0)) return { skip: 'Dividend with no amount' };
    let m = marketFromWord(get('market')) || marketFromWord(get('currency'));
    const c = cleanTicker(get('ticker'), m);
    m = c.market || (/^\d{4}$/.test(c.ticker) ? 'MY' : defaultMarket);
    return { trade: { date, ticker: c.ticker, market: m, action: 'dividend', type: 'dividend', units: 0, price: 0, fee: 0, amount: +paid.toFixed(4), notes: get('notes') } };
  }
  const unitsRaw = parseNum(get('units'));
  let action = map.action != null ? parseAction(get('action')) : (unitsRaw < 0 ? 'sell' : 'buy');
  if (!action && unitsRaw < 0) action = 'sell';
  if (!action) return { skip: 'Not a buy or sell (e.g. dividend, deposit)' };
  const units = Math.abs(unitsRaw);
  if (!(units > 0)) return { skip: 'No units (order not filled)' };
  let price = Math.abs(parseNum(get('price')));
  const amount = Math.abs(parseNum(get('amount')));
  if (!(price > 0) && amount > 0) price = amount / units;
  if (!(price >= 0) || isNaN(price)) return { skip: 'No price' };
  const fee = (map.fees || []).reduce((s, i) => s + (Math.abs(parseNum(row[i])) || 0), 0);
  let market = marketFromWord(get('market')) || marketFromWord(get('currency'));
  const t = cleanTicker(get('ticker'), market);
  market = t.market || (/^\d{4}$/.test(t.ticker) ? 'MY' : defaultMarket); // 4-digit codes are Bursa
  const tax = parseNum(get('tax'));
  return { trade: {
    date, ticker: t.ticker, market, action,
    type: /growth/i.test(get('type')) ? 'growth' : 'dividend',
    units, price: +price.toFixed(6), fee: +fee.toFixed(4),
    divTax: tax >= 0 && tax <= 100 ? tax : DEFAULT_TAX[market] ?? 0,
    notes: get('notes'),
  } };
}
// Same date, stock, side, units, price and fees = the same trade
export const tradeKey = t => [t.date, t.ticker, t.market, t.action, +t.units, (+t.price).toFixed(4), (+(t.fee || 0)).toFixed(2), t.action === 'dividend' ? (+t.amount).toFixed(4) : ''].join('|');
