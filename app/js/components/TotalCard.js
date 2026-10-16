// Total portfolio value, styled like a ringgit note: rolling-digit total, gain pill, ring + legend,
// exchange-rate chips, time of the prices, and a small reload button that spins while prices load.
import { ref, computed, watch, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, refresh, cash, masked, shownTotal, shownMarket, CURRENCIES, isNight, toggleTheme } from '../store.js';
import { tap } from '../lib/haptic.js';
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
        <button type="button" class="theme-switch" :class="{ night: swNight, dragging: swX !== null }" :style="swX !== null ? { '--kx': swX + 'px' } : null" role="switch" :aria-checked="night" aria-label="Night mode"
          @click="flip" @pointerdown="swDown" @pointermove="swMove" @pointerup="swUp" @pointercancel="swUp">
          <svg class="ts-icon ts-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></svg>
          <svg class="ts-icon ts-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.6A7.4 7.4 0 0 1 9.4 4.9 7.6 7.6 0 1 0 17.5 14.6z"/><path d="m19 3.4.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/></svg>
          <span class="ts-knob"></span>
        </button>
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
      <div class="tc-worth-row">
        <p class="tc-worth">
          <Odometer v-if="!state.hide" :value="shownTotal(t.value)" :format="v => money(v, shownMarket())"/>
          <span v-else class="tc-masked">{{ masked('MY') }}</span>
        </p>
        <button type="button" class="eye" :aria-pressed="state.hide" :aria-label="state.hide ? 'Show the big numbers' : 'Hide the big numbers'" @click="state.hide = !state.hide">
          <svg v-if="!state.hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
        </button>
      </div>
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

    const night = computed(() => (state.theme ? state.theme === 'dark' : isNight()));
    // The switch: tap it, or slide the knob (it follows your finger and settles on the nearer side; right = day, left = night)
    const REACH = 32; // how far the knob travels, in px
    const swX = ref(null), swNight = computed(() => (swX.value === null ? night.value : swX.value < REACH / 2));
    let swStart = null, swFrom = 0, swMoved = false;
    const swDown = e => { swStart = e.clientX; swFrom = night.value ? 0 : REACH; swMoved = false; try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} };
    const swMove = e => {
      if (swStart === null) return;
      const dx = e.clientX - swStart;
      if (!swMoved && Math.abs(dx) < 4) return;
      if (!swMoved) tap();
      swMoved = true;
      swX.value = Math.max(0, Math.min(REACH, swFrom + dx));
    };
    const swUp = () => {
      if (swStart === null) return;
      swStart = null;
      if (swMoved && swX.value !== null) {
        const wantNight = swX.value < REACH / 2;
        if (wantNight !== night.value) { tap(); state.theme = wantNight ? 'dark' : 'light'; }
        setTimeout(() => { swMoved = false; }, 80); // the click that follows a drag is not a tap
      }
      swX.value = null;
    };
    const flip = () => { if (swMoved) return; tap(); toggleTheme(); };
    return { night, swX, swNight, swDown, swMove, swUp, flip, state, s, t, fx, money, pct, stamp, refresh, cash, masked, shownTotal, shownMarket, ICONS, curOpen, curBox, options, curName, choose };
  },
};
