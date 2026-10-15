// Live prices, exchange rates and stock search, through your Cloudflare Worker.
import { fixPence } from './markets.js';

import { WORKER_URL } from '../config.js';
export const PRICE_TTL = 5 * 60 * 1000; // reuse prices for 5 minutes

export const keyOf = symbols => [...symbols].sort().join(',');
export const isFresh = (live, key) => !!live.at && key === live.key && Date.now() - live.at < PRICE_TTL;

export async function getMarketData(symbols, previous) {
  const key = keyOf(symbols);
  try {
    const [prices, rates] = await Promise.all([
      symbols.length ? fetch(`${WORKER_URL}/price?symbols=${encodeURIComponent(key)}`).then(r => r.json()) : {},
      fetch(`${WORKER_URL}/rate`).then(r => r.json()),
    ]);
    for (const k in prices) prices[k] = fixPence(prices[k]);
    return { at: Date.now(), key, prices, rates, error: '' };
  } catch {
    return { ...previous, error: 'Prices could not load. Check your internet and pull down to try again.' };
  }
}

export const searchStocks = q => fetch(`${WORKER_URL}/search?q=${encodeURIComponent(q)}`).then(r => r.json());
