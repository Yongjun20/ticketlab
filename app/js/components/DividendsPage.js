// Dividends: what you earned (Wallet / Reinvest) and what is coming up (ex-dividend dates).
import { ref, watch } from '../vendor/vue.esm-browser.prod.js';
import { state, refreshDividends, idle } from '../store.js';
import { toYahoo } from '../lib/markets.js';
import DividendCard from './DividendCard.js';
import EarnedDash from './EarnedDash.js';

const VIEWS = [['EARNED', 'Earned'], ['UPCOMING', 'Upcoming']];

export default {
  name: 'DividendsPage',
  components: { DividendCard, EarnedDash },
  template: `
    <div class="dividends-page">
      <h1 class="page-title">Dividends</h1>
      <div class="news-bar">
        <div class="chips" role="radiogroup" aria-label="Which dividends">
          <button v-for="[k, label] in VIEWS" :key="k" type="button" role="radio" class="chip" :aria-checked="view === k" @click="view = k">{{ label }}</button>
        </div>
      </div>
      <EarnedDash v-if="view === 'EARNED'"/>
      <DividendCard v-else/>
    </div>`,
  setup() {
    const view = ref('EARNED');
    // opening the tab: look again for stocks whose dividend info is missing or older than 12 hours
    watch(() => state.tab, t => {
      if (t === 3) idle(() => refreshDividends([...new Set(state.txns.filter(x => x.action !== 'dividend').map(x => toYahoo(x.ticker, x.market)))]), 600, 500);
    });
    return { view, VIEWS };
  },
};
