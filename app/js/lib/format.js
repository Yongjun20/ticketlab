// Formatting helpers: money, percentages, dates. No screen or database code here.

export const CURRENCY = { MY: 'RM', US: '$', SG: 'S$', HK: 'HK$', UK: '£', EU: '€', CRYPTO: '$' };
export const MARKET_NAME = { MY: 'Malaysia', US: 'US', SG: 'Singapore', HK: 'Hong Kong', UK: 'UK', EU: 'Europe', CRYPTO: 'Crypto' };
export const DEFAULT_TAX = { US: 30 }; // withholding tax on dividends, % (US stocks held by Malaysians)

export const num = v => (+v || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v, market) => `${CURRENCY[market] ?? ''}${num(v)}`;
export const signed = (v, market) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v), market);
export const pct = (v, base, dp = 2) => (base ? `${Math.abs((v / base) * 100).toFixed(dp)}%` : `${(0).toFixed(dp)}%`);
export const signedPct = (v, base, dp = 1) => (base ? `${v >= 0 ? '+' : '−'}${pct(v, base, dp)}` : '');
export const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
export const qty = v => (+v || 0).toLocaleString('en', { maximumFractionDigits: 8 });

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
export const niceDate = d => new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const monthName = d => new Date(d + 'T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export const stamp = d =>
  `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
