// Dividend dates and amounts per share, worked out from a stock's past dividends (+ Yahoo's calendar when it has one).
// Pure: no screen, no storage. All dates are Unix seconds and are shown as UTC days, which is how exchanges publish them.

const DAY = 86400;

// history: [{ ex, amount }] oldest first; calEx / calPay: Yahoo's calendar dates or null
export function analyse({ history = [], calEx = null, calPay = null }, now = Math.floor(Date.now() / 1000)) {
  const hist = [...history].sort((a, b) => a.ex - b.ex);
  if (!hist.length) return null;
  const last = hist.at(-1);

  // how often it pays: the middle gap between past ex-dividend dates
  const gaps = hist.slice(1).map((h, i) => (h.ex - hist[i].ex) / DAY).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  const freq = gap == null ? '' : gap <= 45 ? 'Monthly' : gap <= 135 ? 'Quarterly' : gap <= 270 ? 'Twice a year' : 'Once a year';

  const pastYear = hist.filter(h => h.ex >= now - 365 * DAY).reduce((sum, h) => sum + h.amount, 0);

  // next ex-dividend date: Yahoo's if it is today or later; otherwise last date + the usual gap (an estimate)
  let next = null;
  if (calEx && calEx >= now - DAY) next = { ex: calEx, estimated: false };
  else if (gap && now - last.ex < gap * DAY * 1.5 + 30 * DAY) { // a stock that stopped paying gets no estimate
    let ex = last.ex + gap * DAY;
    for (let i = 0; ex < now - DAY && i < 3; i++) ex += gap * DAY;
    next = { ex, estimated: true };
  }

  // pay date: only when Yahoo gives one that belongs to the latest dividend
  const pay = calPay && calPay >= last.ex ? { at: calPay, past: calPay < now - DAY } : null;
  return { last, freq, pastYear, next, pay };
}

// "28 Sep 2026" (UTC day)
export const shortDate = sec => new Date(sec * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// whole days from today to that day (negative = past)
const utcDay = sec => Math.floor(sec / DAY);
export const daysUntil = (sec, now = Math.floor(Date.now() / 1000)) => utcDay(sec) - utcDay(now);

// "today", "tomorrow", "in 12 days", "3 days ago"
export function whenWords(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// Amount per share with enough decimals to be useful: RM0.310, $1.823, $24.50
export const perShare = (amount, symbol) => `${symbol}${amount < 10 ? amount.toFixed(3) : amount.toFixed(2)}`;
