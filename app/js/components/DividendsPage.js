// Dividends: when each stock you hold goes ex-dividend, when it pays, and what it paid per share last time.
import { watch } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, refreshDividends, idle } from '../store.js';
import { toYahoo } from '../lib/markets.js';
import DividendCard from './DividendCard.js';

export default {
  name: 'DividendsPage',
  components: { DividendCard },
  template: `
    <div class="dividends-page">
      <h1 class="page-title">Dividends</h1>
      <DividendCard/>
    </div>`,
  setup() {
    // opening the tab: look again for stocks whose dividend info is missing or older than 12 hours
    watch(() => state.tab, t => { if (t === 3) idle(() => refreshDividends(summary.value.open.map(r => toYahoo(r.ticker, r.market))), 600, 500); });
    return {};
  },
};
