// Dividend dates, at the top of the Stocks page: for each stock you hold, the next ex-dividend date (the last day to buy
// before the dividend is decided), the pay date when known, and the last dividend per share. Dates with "est." are worked out
// from how often the stock paid before; Yahoo has no calendar date for them.
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, cash } from '../store.js';
import { toYahoo } from '../lib/markets.js';
import { CURRENCY } from '../lib/format.js';
import { analyse, shortDate, daysUntil, whenWords, perShare } from '../lib/dividends.js';


export default {
  name: 'DividendCard',
  props: { limit: { type: Number, default: 0 } }, // how many stocks to show before "Show all" (0 = all)
  template: `
    <section v-if="rows.length" class="divs" aria-label="Dividend dates">
      <p class="hint">Ex-dividend is the last day to own the stock before the dividend is decided: buy before it to get paid.</p>
      <ul class="divs-list">
        <li v-for="r in shown" :key="r.key" class="dv">
          <div class="dv-top">
            <span class="dv-name"><b>{{ r.ticker }}</b><small v-if="r.d.freq">{{ r.d.freq }}</small></span>
            <span v-if="r.d.next" class="dv-ex"><b>{{ shortDate(r.d.next.ex) }}</b><small>Ex-dividend · {{ whenWords(r.days) }}<template v-if="r.d.next.estimated"> · est.</template></small></span>
            <span v-else class="dv-ex"><b>No date</b><small>Ex-dividend · no recent dividend</small></span>
          </div>
          <p class="dv-line">Last dividend <b>{{ perShare(r.d.last.amount, r.symbol) }}</b> per share <span class="dv-sub">(ex {{ shortDate(r.d.last.ex) }})</span></p>
          <p class="dv-line dv-sub">Past 12 months <b>{{ perShare(r.d.pastYear, r.symbol) }}</b> per share
            <template v-if="r.d.pay"> · {{ r.d.pay.past ? 'Paid' : 'Pays' }} <b>{{ shortDate(r.d.pay.at) }}</b></template>
            <template v-if="r.mine"> · about <b>{{ r.mine }}</b> for your {{ r.units }} units</template></p>
        </li>
      </ul>
      <button v-if="limit && rows.length > limit" type="button" class="more-news" @click="all = !all">{{ all ? 'Show fewer' : 'Show all ' + rows.length }}</button>
    </section>
    <div v-else class="empty div-empty">
      <h2>No dividend dates yet</h2>
      <p>{{ summary.open.length ? 'Getting your stocks’ dividend history…' : 'Add a stock and its dividend dates will show here.' }}</p>
    </div>`,
  setup(props) {
    const all = ref(false);
    const now = () => Math.floor(Date.now() / 1000);
    // one row per stock you hold that has dividend history; soonest ex-dividend date first
    const rows = computed(() => summary.value.open.map(r => {
      const key = toYahoo(r.ticker, r.market), saved = state.divs[key];
      const d = saved && analyse(saved, now());
      if (!d) return null;
      return {
        key, ticker: r.ticker, d, symbol: CURRENCY[r.market] ?? '', units: r.units,
        days: d.next ? daysUntil(d.next.ex, now()) : null,
        mine: d.last.amount * r.units > 0 ? cash(d.last.amount * r.units, r.market) : '', // what the last dividend would pay on your units, before tax
      };
    }).filter(Boolean).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9)));
    const shown = computed(() => (all.value || !props.limit ? rows.value : rows.value.slice(0, props.limit)));
    return { rows, shown, all, summary, shortDate, whenWords, perShare };
  },
};
