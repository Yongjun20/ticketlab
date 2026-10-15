// One stock: two lines you can read at a glance. Tap to smoothly open the details and Buy more / Sell.
import { openSheet } from '../store.js';
import { money, signed, signedPct, tone, qty, MARKET_NAME } from '../lib/format.js';

export default {
  name: 'StockCard',
  props: { row: { type: Object, required: true }, open: Boolean },
  emits: ['toggle'],
  template: `
    <article class="stock" :class="{ open }" :style="{ '--c': row.color }">
      <button type="button" class="stock-head" :aria-expanded="open" @click="$emit('toggle')">
        <span class="name"><b>{{ row.ticker }}</b><small>{{ row.q?.name || MARKET_NAME[row.market] || row.market }}</small><small>{{ qty(row.units) }} units</small></span>
        <span class="money">
          <b>{{ money(row.value ?? row.cost, row.market) }}</b>
          <small :class="tone(row.unreal)">{{ row.unreal != null ? signed(row.unreal, row.market) + ' (' + signedPct(row.unreal, row.cost) + ')' : 'No price yet' }}</small>
        </span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      <!-- Always here, folded to zero height; CSS unfolds it smoothly (no measuring, so no jump on phones) -->
      <div class="stock-more" :inert="open ? null : ''">
        <div class="stock-more-inner">
          <dl class="detail">
            <div><dt>Price now</dt><dd>{{ row.q ? money(row.q.price, row.market) : '—' }}
              <span v-if="row.q?.changePct != null" :class="tone(row.q.changePct)">{{ row.q.changePct > 0 ? '+' : '' }}{{ row.q.changePct.toFixed(2) }}% today</span></dd></div>
            <div><dt>Your average cost</dt><dd>{{ money(row.cost / row.units, row.market) }}</dd></div>
            <div><dt>Dividends a year</dt><dd><span v-if="row.estDiv" class="div">{{ money(row.estDiv, row.market) }}</span><template v-else>None</template></dd></div>
            <div><dt>Commission fees paid</dt><dd>{{ row.fees ? money(row.fees, row.market) : 'None' }}</dd></div>
            <div><dt>Share of your money</dt><dd>{{ row.share.toFixed(1) }}%</dd></div>
            <div><dt>Profit from selling</dt><dd><span v-if="row.realised" :class="tone(row.realised)">{{ signed(row.realised, row.market) }}</span><template v-else>None yet</template></dd></div>
          </dl>
          <div class="actions">
            <button type="button" class="btn" @click="openSheet({ action: 'buy', ticker: row.ticker, market: row.market })">Buy more</button>
            <button type="button" class="btn" @click="openSheet({ action: 'sell', ticker: row.ticker, market: row.market })">Sell</button>
          </div>
        </div>
      </div>
    </article>`,
  setup() {
    return { money, signed, signedPct, tone, qty, MARKET_NAME, openSheet };
  },
};
