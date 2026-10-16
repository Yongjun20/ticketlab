// Reinvest a dividend: confirm the price and the units, then a Buy is added (dated the ex-date) and your units go up.
// Units start as the amount ÷ today's price; change them to match what your broker really gave you.
import { reactive, ref, computed, watch } from '../vendor/vue.esm-browser.prod.js';
import { state, reinvestDividend } from '../store.js';
import { toYahoo } from '../lib/markets.js';
import { money, qty } from '../lib/format.js';
import BottomSheet from './BottomSheet.js';

export default {
  name: 'ReinvestSheet',
  components: { BottomSheet },
  template: `
    <BottomSheet :open="!!state.reinvest" title="Reinvest dividend" @close="close">
      <form v-if="ev" class="form" novalidate @submit.prevent="save">
        <p class="total">{{ ev.ticker }} · ex {{ ev.date }}: you earned {{ money(ev.amount, ev.market) }} after tax.</p>
        <div class="two">
          <div class="field"><label for="r-price">Price per unit</label><input id="r-price" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" v-model="f.price" @input="priceTyped"></div>
          <div class="field"><label for="r-units">Units bought</label><input id="r-units" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="0" v-model="f.units" @input="edited = true"></div>
        </div>
        <p class="hint">Units = amount ÷ price. Change them to match your broker. A Buy is added to History, dated the ex-date.</p>
        <Transition name="shake"><p v-if="error" :key="error" class="error" role="alert">{{ error }}</p></Transition>
        <button type="submit" class="save" :disabled="busy">Reinvest {{ f.units ? qty(+f.units) + ' units' : '' }}</button>
      </form>
    </BottomSheet>`,
  setup() {
    const f = reactive({ price: '', units: '' }), error = ref(''), busy = ref(false), edited = ref(false);
    const ev = computed(() => state.reinvest?.ev ?? null);
    // each time it opens: the price starts at today's price, the units at amount ÷ price
    watch(() => state.reinvest?.ev.key, key => {
      if (!key) return;
      const e = ev.value, live = state.live.prices[toYahoo(e.ticker, e.market)]?.price;
      f.price = live ? +live.toFixed(4) : '';
      f.units = live ? +(e.amount / live).toFixed(6) : '';
      edited.value = false; error.value = ''; busy.value = false;
    });
    const priceTyped = () => { const p = parseFloat(f.price); if (!edited.value && p > 0) f.units = +(ev.value.amount / p).toFixed(6); };
    const close = () => { state.reinvest = null; };
    async function save() {
      const units = parseFloat(f.units), price = parseFloat(f.price);
      if (!(units > 0) || !(price > 0)) return (error.value = 'Enter the price and the number of units.');
      busy.value = true;
      await reinvestDividend(ev.value, { units, price });
      state.reinvest = null;
    }
    return { state, ev, f, error, busy, edited, money, qty, priceTyped, close, save };
  },
};
