// Markets: your ticker ↔ Yahoo's symbol, London pence, and converting to ringgit.

// Your ticker → Yahoo's symbol (1155 → 1155.KL)
export function toYahoo(ticker, market) {
  const t = String(ticker).toUpperCase();
  const add = sfx => (t.endsWith(sfx) ? t : t + sfx);
  switch (market) {
    case 'MY': return add('.KL');
    case 'SG': return add('.SI');
    case 'HK': return add('.HK');
    case 'UK': return add('.L');
    case 'EU': return t.includes('.') ? t : t + '.PA'; // Paris unless you type the exchange (SAP.DE)
    case 'CRYPTO': return add('-USD');
    default: return t;
  }
}

// Yahoo's symbol → your ticker + market (MU → MU/US, 1155.KL → 1155/MY). null = a market this app doesn't track.
export function fromYahoo(symbol, type) {
  const s = String(symbol).toUpperCase();
  const cut = n => s.slice(0, -n);
  if (type === 'CRYPTOCURRENCY') return s.endsWith('-USD') ? { ticker: cut(4), market: 'CRYPTO' } : null;
  if (s.endsWith('.KL')) return { ticker: cut(3), market: 'MY' };
  if (s.endsWith('.SI')) return { ticker: cut(3), market: 'SG' };
  if (s.endsWith('.HK')) return { ticker: cut(3), market: 'HK' };
  if (s.endsWith('.L')) return { ticker: cut(2), market: 'UK' };
  if (s.endsWith('.PA')) return { ticker: cut(3), market: 'EU' };
  if (/\.(DE|AS|MI|MC|BR|LS)$/.test(s)) return { ticker: s, market: 'EU' };
  if (!s.includes('.')) return { ticker: s, market: 'US' };
  return null;
}

// London prices come in pence (GBp); convert to pounds so they match what you type
export const fixPence = q =>
  q?.currency === 'GBp'
    ? { ...q, price: q.price / 100, divRate: (q.divRate ?? 0) / 100, change: (q.change ?? 0) / 100, currency: 'GBP' }
    : q;

export const RATE_KEY = { US: 'usdMyr', CRYPTO: 'usdMyr', SG: 'sgdMyr', UK: 'gbpMyr', HK: 'hkdMyr', EU: 'eurMyr' };

// Amount in a market's currency → ringgit. null when that exchange rate hasn't loaded.
export function toMYR(v, market, rates) {
  if (market === 'MY') return v;
  const r = rates?.[RATE_KEY[market]];
  return r ? v * r : null;
}
