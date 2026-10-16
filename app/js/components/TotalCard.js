// Total portfolio value, styled like a ringgit note: rolling-digit total, gain pill, ring + legend,
// exchange-rate chips, time of the prices, and a small reload button that spins while prices load.
import { ref, computed, watch, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, refresh, cash, shownTotal, shownMarket, CURRENCIES } from '../store.js';
import { money, pct, stamp } from '../lib/format.js';
import { ICONS } from '../lib/currencyIcons.js';
import Odometer from './Odometer.js';
import RingChart from './RingChart.js';

const FX = [['usdMyr', 'USD', 2], ['sgdMyr', 'SGD', 2], ['gbpMyr', 'GBP', 2], ['hkdMyr', 'HKD', 3], ['eurMyr', 'EUR', 2]];

export default {
  name: 'TotalCard',
  components: { Odometer, RingChart },
  template: `
    <section class="total-card" :class="{ waiting: !state.live.at }" aria-label="Total portfolio value">
      <div class="tc-top">
        <p class="tc-label">Total portfolio value</p>
        <div class="tc-tools">
        <div class="tc-cur" ref="curBox">
          <button type="button" class="tc-cur-btn" :aria-expanded="curOpen" aria-haspopup="listbox"
            :aria-label="'Showing amounts in ' + curName + '. Change currency'" :title="curName" @click="curOpen = !curOpen">
            <span class="cur-icon" v-html="ICONS[state.currency]"></span>
          </button>
          <Transition name="pop">
            <ul v-if="curOpen" class="tc-cur-menu" role="listbox" aria-label="Show amounts in">
              <li v-for="o in options" :key="o.key" role="presentation">
                <button type="button" role="option" class="cur-opt" :class="{ on: state.currency === o.key }" :aria-selected="state.currency === o.key" @click="choose(o.key)">
                  <span class="cur-icon" v-html="ICONS[o.key]"></span><span class="cur-name">{{ o.name }}</span>
                  <svg v-if="state.currency === o.key" class="cur-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
                </button>
              </li>
            </ul>
          </Transition>
        </div>
        <button type="button" class="tc-refresh" :class="{ spinning: state.loading }" @click="refresh(true)" aria-label="Refresh prices" title="Refresh prices">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
        </button>
        </div>
      </div>
      <p class="tc-worth"><Odometer :value="shownTotal(t.value)" :format="v => money(v, shownMarket())"/></p>
      <Transition name="pop">
        <p v-if="state.live.at" class="tc-pill" :class="t.profit >= 0 ? 'up' : 'down'">
          {{ t.profit >= 0 ? '▲' : '▼' }} {{ cash(Math.abs(t.profit), 'MY') }} · {{ pct(t.profit, t.cost) }} all time
        </p>
      </Transition>
      <div v-if="s.open.length && t.value > 0" class="tc-split"><RingChart :stocks="s.open"/></div>
      <div class="tc-foot">
        <div v-if="fx.length" class="fx-row" aria-label="Exchange rates to ringgit">
          <span v-for="f in fx" :key="f.label" class="fx">{{ f.label }} <b>{{ f.value }}</b></span>
        </div>
        <p class="tc-time">
          <span v-if="state.loading">Getting latest prices…</span>
          <span v-else-if="state.live.error" class="down">{{ state.live.error }}</span>
          <span v-else-if="state.live.at">{{ stamp(new Date(state.live.at)) }}{{ t.incomplete ? ', some prices missing' : '' }}</span>
        </p>
      </div>
    </section>`,
  setup() {
    const s = summary;
    const t = computed(() => summary.value.totals);
    const fx = computed(() => FX.filter(([k]) => state.live.rates?.[k]).map(([k, label, dp]) => ({ label, value: state.live.rates[k].toFixed(dp) })));
    // Currency menu: tap the little icon, pick one; tap outside or press Esc to close
    const curOpen = ref(false), curBox = ref(null);
    const options = [{ key: '', name: 'Mixed' }, ...CURRENCIES.map(([key, code]) => ({ key, name: code }))];
    const curName = computed(() => (state.currency ? options.find(o => o.key === state.currency).name : 'Mixed currencies'));
    const choose = key => { state.currency = key; curOpen.value = false; };
    const away = e => { if (curBox.value && !curBox.value.contains(e.target)) curOpen.value = false; };
    const esc = e => { if (e.key === 'Escape') curOpen.value = false; };
    watch(curOpen, open => {
      const act = open ? 'addEventListener' : 'removeEventListener';
      document[act]('pointerdown', away); document[act]('keydown', esc);
    });
    onBeforeUnmount(() => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); });

    return { state, s, t, fx, money, pct, stamp, refresh, cash, shownTotal, shownMarket, ICONS, curOpen, curBox, options, curName, choose };
  },
};
