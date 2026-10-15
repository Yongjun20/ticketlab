// Divtracker price Worker (Cloudflare Workers).
// Fetches live prices, last-12-month dividends and MYR exchange rates from Yahoo Finance,
// and adds the CORS header so the Divtracker page is allowed to read the answer.
//
//   GET /price?symbols=AAPL,1155.KL
//     → { "AAPL":    { "price": 341.27, "currency": "USD", "change": 0.3, "changePct": 0.09,
//                      "name": "Apple Inc.", "divRate": 1.05, "divYield": 0.0031 },
//         "1155.KL": { ... } }
//   GET /rate
//     → { "usdMyr": 4.08, "sgdMyr": 3.19, "gbpMyr": 5.42, "hkdMyr": 0.52, "eurMyr": 4.57 }
//   GET /search?q=micron
//     → [ { "symbol": "MU", "name": "Micron Technology, Inc.", "exchange": "NMS", "type": "EQUITY",
//           "price": 120.5, "currency": "USD", "changePct": 1.2 }, ... ]
//
// Symbols Yahoo doesn't know are left out of the answer, so the page treats them as "no price".

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const MAX_SYMBOLS = 45; // free plan allows 50 outgoing requests per call
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,20}$/;
const FX = { usdMyr: 'MYR=X', sgdMyr: 'SGDMYR=X', gbpMyr: 'GBPMYR=X', hkdMyr: 'HKDMYR=X', eurMyr: 'EURMYR=X' };
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'CRYPTOCURRENCY']); // skip futures, funds, indexes
const SEARCH_LIMIT = 8;

const round = (v, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

async function quote(symbol) {
  try {
    const res = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?range=1y&interval=1mo&events=div`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cf: { cacheTtl: 300, cacheEverything: true }, // Cloudflare reuses Yahoo's answer for 5 minutes
    });
    if (!res.ok) return null;
    const result = (await res.json()).chart?.result?.[0];
    const meta = result?.meta;
    if (typeof meta?.regularMarketPrice !== 'number') return null;

    // Dividend per share paid in the last 12 months (TTM)
    const since = Date.now() / 1000 - YEAR_SECONDS;
    const divRate = Object.values(result.events?.dividends ?? {})
      .filter(d => d.date >= since)
      .reduce((sum, d) => sum + d.amount, 0);

    const price = meta.regularMarketPrice;
    return {
      price,
      currency: meta.currency,
      change: meta.fulldayChange ?? null,
      changePct: meta.fulldayChangePercent ?? meta.regularMarketChangePercent ?? null,
      name: meta.longName || meta.shortName || symbol,
      divRate: round(divRate),
      divYield: price ? round(divRate / price, 6) : 0,
    };
  } catch {
    return null;
  }
}

// Name → matching symbols, each with its live price
async function search(q) {
  const res = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cf: { cacheTtl: 3600, cacheEverything: true }, // names rarely change: cache 1 hour
  });
  if (!res.ok) return [];
  const hits = ((await res.json()).quotes || [])
    .filter(x => SEARCH_TYPES.has(x.quoteType) && x.symbol && !x.symbol.includes('='))
    .slice(0, SEARCH_LIMIT);
  const quotes = await Promise.all(hits.map(x => quote(x.symbol)));
  return hits.map((x, i) => ({
    symbol: x.symbol,
    name: quotes[i]?.name || x.longname || x.shortname || x.symbol,
    exchange: x.exchDisp || x.exchange,
    type: x.quoteType,
    price: quotes[i]?.price ?? null,
    currency: quotes[i]?.currency ?? null,
    changePct: quotes[i]?.changePct ?? null,
  }));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Only GET is supported.' }, 405);
    const url = new URL(request.url);

    if (url.pathname === '/price') {
      const symbols = [...new Set(
        (url.searchParams.get('symbols') || '').toUpperCase().split(',').map(s => s.trim()).filter(s => SYMBOL_RE.test(s)),
      )].slice(0, MAX_SYMBOLS);
      if (!symbols.length) return json({ error: 'Add symbols, for example /price?symbols=AAPL,1155.KL' }, 400);

      const quotes = await Promise.all(symbols.map(quote));
      const out = {};
      symbols.forEach((s, i) => { if (quotes[i]) out[s] = quotes[i]; });
      return json(out);
    }

    if (url.pathname === '/rate') {
      const keys = Object.keys(FX);
      const quotes = await Promise.all(keys.map(k => quote(FX[k])));
      const out = {};
      keys.forEach((k, i) => { if (quotes[i]) out[k] = quotes[i].price; });
      return json(out);
    }

    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
      if (q.length < 2) return json({ error: 'Type at least 2 letters, for example /search?q=micron' }, 400);
      try { return json(await search(q)); } catch { return json([]); }
    }

    return json({ error: 'Unknown path.', routes: ['/price?symbols=AAPL,1155.KL', '/rate', '/search?q=micron'] }, 404);
  },
};
