// Stocks page: pull down to refresh, the total card, quick facts and your stock cards.
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, refresh, openSheet, loadExample, cash, cashSigned, earned } from '../store.js';
import { tone } from '../lib/format.js';
import TotalCard from './TotalCard.js';
import GroupCard from './GroupCard.js';

const PULL_TO_REFRESH = 64; // px you need to pull before letting go refreshes

export default {
  name: 'StocksPage',
  components: { TotalCard, GroupCard },
  template: `
    <div class="stocks-page" @touchstart.passive="pullStart" @touchmove.passive="pullMove" @touchend="pullEnd" @touchcancel="pullEnd">
      <div class="ptr" :class="{ dragging: pulling, armed: pull >= PULL }" :style="{ height: ptrHeight + 'px' }" aria-hidden="true">
        <span class="ptr-icon" :class="{ spin: state.loading && !pulling }" :style="{ transform: 'rotate(' + pull * 4 + 'deg)', opacity: Math.min(ptrHeight / 44, 1) }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
        </span>
        <span class="ptr-text">{{ state.loading && !pulling ? 'Refreshing…' : pull >= PULL ? 'Let go to refresh' : 'Pull to refresh' }}</span>
      </div>

      <div v-if="!state.txns.length" class="empty">
        <div class="empty-coin" aria-hidden="true">RM</div>
        <h2>Add your first stock</h2>
        <p>Save a trade and you'll see what it's worth, your profit and the dividends it pays you.</p>
        <button type="button" class="btn dark" @click="openSheet()">Add a trade</button>
        <button type="button" class="text-btn" @click="loadExample">Try it with example trades</button>
      </div>

      <template v-else>
        <TotalCard/>
        <ul class="facts">
          <li><span>Dividends received</span><b class="div">{{ gotDividends > 0 ? cash(gotDividends, 'MY') : 'None yet' }}</b></li>
          <li><span>You put in</span><b>{{ cash(t.cost, 'MY') }}</b></li>
          <li><span>Profit from selling</span><b :class="tone(t.realised)">{{ cashSigned(t.realised, 'MY') }}</b></li>
          <li><span>Commission fees paid</span><b>{{ cash(t.fees, 'MY') }}</b></li>
        </ul>

        <template v-if="!s.open.length">
          <h2 class="section-title">Your stocks</h2>
          <p class="note">You've sold everything. Your past stocks are below.</p>
        </template>
        <GroupCard v-for="g in groups" :key="g.key" :title="g.title" :kind="g.key" :rows="g.rows" :open-key="openKey" @toggle="k => (openKey = openKey === k ? null : k)"/>

        <template v-if="s.closed.length">
          <h2 class="section-title">Sold</h2>
          <div class="panel">
            <div v-for="r in s.closed" :key="r.key" class="sold-row">
              <div><b>{{ r.ticker }}</b><p>All sold{{ r.fees ? ', fees ' + cash(r.fees, r.market) : '' }}</p></div>
              <div class="amount" :class="tone(r.realised)">{{ cashSigned(r.realised, r.market) }}<p>profit</p></div>
            </div>
          </div>
        </template>
      </template>
    </div>`,
  setup() {
    const s = summary;
    const t = computed(() => summary.value.totals);
    const openKey = ref(null);

    // Pull to refresh: only when you're already at the top of the page
    const pull = ref(0), pulling = ref(false);
    let startY = null;
    const pullStart = e => { startY = window.scrollY <= 0 && !state.sheet ? e.touches[0].clientY : null; };
    const pullMove = e => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      pulling.value = dy > 4;
      pull.value = dy > 0 ? Math.min(dy * 0.45, 96) : 0; // resists the further you pull
    };
    const pullEnd = () => {
      if (pull.value >= PULL_TO_REFRESH) { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10); refresh(true); }
      pull.value = 0; pulling.value = false; startY = null;
    };
    const ptrHeight = computed(() => (pulling.value ? pull.value : state.loading && state.live.at ? 44 : 0));

    // what you earned from dividends (worked out from the dividend history), or what you recorded by hand if that isn't loaded yet
    const gotDividends = computed(() => (earned.value.events.length ? earned.value.totals.all : t.value.received));
    // your stocks in two tidy groups (a stock with no kind saved counts as a dividend stock); each group keeps the biggest first
    const groups = computed(() => [['growth', 'Growth stocks'], ['dividend', 'Dividend stocks']]
      .map(([key, title]) => {
        const rows = summary.value.open.filter(r => (r.type === 'growth') === (key === 'growth'));
        return { key, title, rows, total: rows.reduce((sum, r) => sum + (r.valueMYR ?? 0), 0) };
      })
      .filter(g => g.rows.length));
    return { state, s, t, gotDividends, groups, openKey, cash, cashSigned, tone, openSheet, loadExample, pull, pulling, ptrHeight, pullStart, pullMove, pullEnd, PULL: PULL_TO_REFRESH };
  },
};
