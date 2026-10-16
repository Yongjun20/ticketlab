// One group of stocks (Dividend stocks or Growth stocks): a summary card on top (value, profit / loss, money put in, dividends earned,
// profit from selling), then its stock cards. Tap a stock for its details.
import { computed } from '../vendor/vue.esm-browser.prod.js';
import { state, earned, cash, cashSigned, masked } from '../store.js';
import { toMYR } from '../lib/markets.js';
import { signedPct, tone } from '../lib/format.js';
import StockCard from './StockCard.js';

export default {
  name: 'GroupCard',
  components: { StockCard },
  props: { title: String, kind: String, rows: { type: Array, required: true }, openKey: String },
  emits: ['toggle'],
  template: `
    <section class="group" :class="'group-' + kind" :aria-label="title">
      <header class="gc-head">
        <p class="gc-label">{{ title }} · {{ rows.length }} stock{{ rows.length === 1 ? '' : 's' }}</p>
        <p class="gc-value">{{ state.hide ? masked('MY') : cash(sum.value, 'MY') }}</p>
        <p class="gc-pl" :class="tone(sum.pl)"><span>{{ cashSigned(sum.pl, 'MY') }}</span><span>{{ signedPct(sum.pl, sum.cost) }}</span></p>
        <dl class="gc-stats">
          <div><dt>Put in</dt><dd>{{ cash(sum.cost, 'MY') }}</dd></div>
          <div><dt>Dividends</dt><dd class="div">{{ cash(sum.divs, 'MY') }}</dd></div>
          <div><dt>Sold profit</dt><dd :class="tone(sum.real)">{{ cashSigned(sum.real, 'MY') }}</dd></div>
        </dl>
      </header>
      <TransitionGroup name="list" tag="div" class="stocks">
        <StockCard v-for="r in rows" :key="r.key" :row="r" :open="openKey === r.key" @toggle="$emit('toggle', r.key)"/>
      </TransitionGroup>
    </section>`,
  setup(props) {
    // all in ringgit (the amounts then follow the currency picker)
    const sum = computed(() => {
      const rates = state.live.rates, mine = new Set(props.rows.map(r => r.market + ':' + r.ticker));
      let value = 0, cost = 0, real = 0;
      for (const r of props.rows) {
        const v = r.valueMYR, c = toMYR(r.cost, r.market, rates);
        if (v == null || c == null) continue; // an exchange rate that hasn't loaded yet: left out for now
        value += v; cost += c; real += toMYR(r.realised, r.market, rates) ?? 0;
      }
      const divs = earned.value.stocks.filter(e => mine.has(e.market + ':' + e.ticker)).reduce((a, e) => a + e.earnedMYR, 0);
      return { value, cost, real, divs, pl: value - cost };
    });
    return { state, sum, cash, cashSigned, masked, signedPct, tone };
  },
};
