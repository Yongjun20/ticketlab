// One stock: two lines you can read at a glance. Tap to smoothly open the details and Buy more / Sell.
import { ref, watch } from '../vendor/vue.esm-browser.prod.js';
import { openSheet, cash, cashSigned, setStockKind } from '../store.js';
import { toYahoo } from '../lib/markets.js';
import { getNews } from '../lib/prices.js';
import { signedPct, tone, qty, ago, MARKET_NAME } from '../lib/format.js';

export default {
  name: 'StockCard',
  props: { row: { type: Object, required: true }, open: Boolean },
  emits: ['toggle'],
  template: `
    <article class="stock" :class="{ open }" :style="{ '--c': row.color }">
      <button type="button" class="stock-head" :aria-expanded="open" @click="$emit('toggle')">
        <span class="name"><b>{{ row.ticker }}</b><small>{{ row.q?.name || MARKET_NAME[row.market] || row.market }}</small><small>{{ qty(row.units) }} units</small></span>
        <span class="money">
          <b>{{ cash(row.value ?? row.cost, row.market) }}</b>
          <small :class="tone(row.unreal)">{{ row.unreal != null ? cashSigned(row.unreal, row.market) + ' (' + signedPct(row.unreal, row.cost) + ')' : 'No price yet' }}</small>
        </span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      <!-- Always here, folded to zero height; CSS unfolds it smoothly (no measuring, so no jump on phones) -->
      <div class="stock-more" :inert="open ? null : ''">
        <div class="stock-more-inner">
          <dl class="detail">
            <div><dt>Price now</dt><dd>{{ row.q ? cash(row.q.price, row.market) : '—' }}
              <span v-if="row.q?.changePct != null" :class="tone(row.q.changePct)">{{ row.q.changePct > 0 ? '+' : '' }}{{ row.q.changePct.toFixed(2) }}% today</span></dd></div>
            <div><dt>Your average cost</dt><dd>{{ cash(row.cost / row.units, row.market) }}</dd></div>
            <div><dt>Dividends a year</dt><dd><span v-if="row.estDiv" class="div">{{ cash(row.estDiv, row.market) }}</span><template v-else>None</template></dd></div>
            <div><dt>Commission fees paid</dt><dd>{{ row.fees ? cash(row.fees, row.market) : 'None' }}</dd></div>
            <div><dt>Share of your money</dt><dd>{{ row.share.toFixed(1) }}%</dd></div>
            <div><dt>Profit from selling</dt><dd><span v-if="row.realised" :class="tone(row.realised)">{{ cashSigned(row.realised, row.market) }}</span><template v-else>None yet</template></dd></div>
            <div class="kind-cell"><dt>Kind of stock</dt>
              <dd>
                <button type="button" class="tag tag-btn" :class="row.type === 'growth' ? 'tag-growth' : 'tag-div'" aria-haspopup="listbox" :aria-expanded="kindOpen" @click="kindOpen = !kindOpen">
                  {{ row.type === 'growth' ? 'Growth' : 'Dividend' }}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <ul v-if="kindOpen" class="kind-menu" role="listbox" aria-label="Kind of stock">
                  <li><button type="button" role="option" :aria-selected="row.type === 'growth'" @click="chooseKind('growth')">Growth stock<span v-if="row.type === 'growth'" aria-hidden="true">✓</span></button></li>
                  <li><button type="button" role="option" :aria-selected="row.type !== 'growth'" @click="chooseKind('dividend')">Dividend stock<span v-if="row.type !== 'growth'" aria-hidden="true">✓</span></button></li>
                </ul>
              </dd></div>
          </dl>
          <div class="news" aria-live="polite">
            <h3>News</h3>
            <p v-if="news === null && !newsFailed" class="news-note">Loading headlines…</p>
            <p v-else-if="newsFailed" class="news-note">News isn’t available right now.</p>
            <p v-else-if="!news.length" class="news-note">No recent news.</p>
            <ul v-else>
              <li v-for="n in news" :key="n.link"><a :href="n.link" target="_blank" rel="noopener noreferrer"><span class="news-title">{{ n.title }}</span>
                <small>{{ n.publisher }}{{ n.publisher ? ' · ' : '' }}{{ ago(n.time) }}</small></a></li>
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="btn" @click="openSheet({ action: 'buy', ticker: row.ticker, market: row.market })">Buy more</button>
            <button type="button" class="btn" @click="openSheet({ action: 'sell', ticker: row.ticker, market: row.market })">Sell</button>
          </div>
        </div>
      </div>
    </article>`,
  setup(props) {
    // the pop-down for the kind of stock: picking one changes every trade of the stock
    const kindOpen = ref(false);
    watch(() => props.open, () => { kindOpen.value = false; });
    const chooseKind = k => { kindOpen.value = false; if ((props.row.type === 'growth') !== (k === 'growth')) setStockKind(props.row.ticker, props.row.market, k); };
    // Headlines load the first time you open the card
    const news = ref(null), newsFailed = ref(false);
    watch(() => props.open, async isOpen => {
      if (!isOpen || news.value) return;
      newsFailed.value = false;
      try { news.value = await getNews(toYahoo(props.row.ticker, props.row.market)); } catch { newsFailed.value = true; }
    });
    return { cash, cashSigned, kindOpen, chooseKind, signedPct, tone, qty, ago, MARKET_NAME, openSheet, news, newsFailed };
  },
};
