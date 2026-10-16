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
//   GET /news?symbol=MU
//     → [ { "title": "…", "publisher": "Reuters", "link": "https://…", "time": 1792054703 }, ... ]   (up to 4, newest first)
//   GET /feed
//     → { "items": [ { "title": "…", "link": "https://…", "source": "CNBC", "region": "US", "time": 1792054703 }, ... ],
//         "failed": ["FMT"] }   (market news from public RSS feeds; "time" is null when a feed gives no date)
//   GET /dividends?symbols=VOO,1155.KL
//     → { "VOO": { "history": [ { "ex": 1790000000, "amount": 1.823 }, ... ],   past ex-dividend dates (unix) and amount per share, oldest first
//                  "calEx": 1792000000 | null,  "calPay": 1793000000 | null },    Yahoo's calendar: an ex-dividend date and a pay date, when it has them
//         "AAPL": null }
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
const NEWS_LIMIT = 4;

// Public RSS feeds (lists of the latest headlines that the sites publish on purpose): Malaysian news and US stock news only
const FEEDS = [
  { source: 'Bernama', region: 'MY', url: 'https://www.bernama.com/en/rssfeed.php', stripCategory: true },
  { source: 'Malay Mail', region: 'MY', url: 'https://www.malaymail.com/feed/rss/money' },
  { source: 'FMT', region: 'MY', url: 'https://www.freemalaysiatoday.com/category/business/feed' },
  { source: 'CNBC', region: 'US', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { source: 'MarketWatch', region: 'US', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
];
const PER_FEED = 30;
const DIV_MAX_SYMBOLS = 20; // each symbol costs two outgoing requests; the free plan allows 50 per call

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

// Latest headlines that Yahoo says are about this symbol
async function news(symbol) {
  const res = await fetch(`${SEARCH}?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=12&listsCount=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cf: { cacheTtl: 600, cacheEverything: true }, // news: reuse for 10 minutes
  });
  if (!res.ok) return [];
  return ((await res.json()).news || [])
    .filter(n => n.title && /^https:\/\//.test(n.link || '') && (n.relatedTickers || []).includes(symbol))
    .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
    .slice(0, NEWS_LIMIT)
    .map(n => ({ title: n.title, publisher: n.publisher || '', link: n.link, time: n.providerPublishTime }));
}

// RSS text → [{ title, link, time }]. Plain text matching is enough for RSS; no XML library needed.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const field = (xml, tag) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1];

export function parseFeed(text, { stripCategory = false } = {}) {
  const out = [];
  for (const item of text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    let title = decode(field(item, 'title') || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (stripCategory) title = title.replace(/^[A-Za-z &]+ : /, ''); // Bernama starts titles with "General : "
    const link = decode(field(item, 'link') || '').trim();
    const when = Date.parse(decode(field(item, 'pubDate') || field(item, 'dc:date') || ''));
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, time: Number.isFinite(when) ? Math.round(when / 1000) : null });
  }
  return out;
}

// Every feed at once; a feed that is down is skipped and named in "failed"
async function feed() {
  const results = await Promise.all(FEEDS.map(async f => {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 600, cacheEverything: true } });
      if (!res.ok) return null;
      return parseFeed(await res.text(), f).slice(0, PER_FEED).map(i => ({ ...i, source: f.source, region: f.region }));
    } catch {
      return null;
    }
  }));
  return { items: results.flat().filter(Boolean), failed: FEEDS.filter((_, i) => !results[i]).map(f => f.source) };
}

// Yahoo's calendar needs a cookie + "crumb". Fetch them once and keep them for an hour.
let session = null;
async function yahooSession(force = false) {
  if (!force && session && Date.now() - session.at < 3600 * 1000) return session;
  const r0 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
  const cookies = r0.headers.getSetCookie?.() ?? [r0.headers.get('set-cookie')].filter(Boolean);
  const cookie = cookies.map(c => c.split(';')[0]).join('; ');
  const crumb = await (await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookie } })).text();
  if (!crumb || crumb.length > 40 || /</.test(crumb)) throw new Error('no crumb');
  return (session = { cookie, crumb, at: Date.now() });
}

// Next ex-dividend date and pay date from Yahoo's calendar (many stocks and funds have none)
async function calendar(symbol, retry = true) {
  const sess = await yahooSession();
  const res = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents&crumb=${encodeURIComponent(sess.crumb)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: sess.cookie } });
  if (res.status === 401 && retry) { await yahooSession(true); return calendar(symbol, false); } // crumb expired
  if (!res.ok) return {};
  const ce = (await res.json()).quoteSummary?.result?.[0]?.calendarEvents;
  return { calEx: ce?.exDividendDate?.raw ?? null, calPay: ce?.dividendDate?.raw ?? null };
}

async function dividendsFor(symbol) {
  try {
    const res = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?range=3y&interval=3mo&events=div`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cf: { cacheTtl: 6 * 3600, cacheEverything: true }, // dividends change rarely
    });
    if (!res.ok) return null;
    const result = (await res.json()).chart?.result?.[0];
    const scale = result?.meta?.currency === 'GBp' ? 100 : 1; // London prices are in pence
    const history = Object.values(result?.events?.dividends ?? {})
      .sort((a, b) => a.date - b.date).slice(-40)
      .map(d => ({ ex: d.date, amount: round(d.amount / scale, 6) }));
    const cal = await calendar(symbol).catch(() => ({})); // no calendar? the history is still useful
    return { history, calEx: cal.calEx ?? null, calPay: cal.calPay ?? null };
  } catch {
    return null;
  }
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

    if (url.pathname === '/news') {
      const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
      if (!SYMBOL_RE.test(symbol)) return json({ error: 'Add a symbol, for example /news?symbol=MU' }, 400);
      try { return json(await news(symbol)); } catch { return json([]); }
    }

    if (url.pathname === '/dividends') {
      const symbols = [...new Set(
        (url.searchParams.get('symbols') || '').toUpperCase().split(',').map(s => s.trim()).filter(s => SYMBOL_RE.test(s)),
      )].slice(0, DIV_MAX_SYMBOLS);
      if (!symbols.length) return json({ error: 'Add symbols, for example /dividends?symbols=VOO,1155.KL' }, 400);
      const list = await Promise.all(symbols.map(dividendsFor));
      return json(Object.fromEntries(symbols.map((s, i) => [s, list[i]])));
    }

    if (url.pathname === '/feed') {
      try { return json(await feed()); } catch { return json({ items: [], failed: FEEDS.map(f => f.source) }); }
    }

    return json({ error: 'Unknown path.', routes: ['/price?symbols=AAPL,1155.KL', '/rate', '/search?q=micron', '/news?symbol=MU', '/feed', '/dividends?symbols=VOO'] }, 404);
  },
};
