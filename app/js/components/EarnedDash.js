// Dividends you earned: totals, each stock, and each dividend with a Wallet / Reinvest switch.
//   Wallet   = you kept the cash.   Reinvest = it bought more units (a Buy appears in History).
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, earned, cash, undoReinvest } from '../store.js';
import { CURRENCY, qty } from '../lib/format.js';
import { perShare } from '../lib/dividends.js';

const SHOWN = 8;
const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default {
  name: 'EarnedDash',
  template: `
    <div class="earn">
      <template v-if="e.events.length">
        <section class="earn-tiles" aria-label="Dividends earned">
          <div class="et big"><small>Earned, all time</small><b>{{ cash(e.totals.all, 'MY') }}</b></div>
          <div class="et"><small>This year</small><b>{{ cash(e.totals.year, 'MY') }}</b></div>
          <div class="et"><small>Wallet</small><b>{{ cash(e.totals.wallet, 'MY') }}</b></div>
          <div class="et"><small>Reinvested</small><b>{{ cash(e.totals.reinvested, 'MY') }}</b></div>
        </section>
        <p v-if="e.totals.missingRate" class="news-warn">Some amounts wait for an exchange rate and aren't counted yet.</p>

        <h2 class="section-title">By stock</h2>
        <ul class="earn-stocks">
          <li v-for="s in e.stocks" :key="s.ticker + s.market">
            <span class="es-name"><b>{{ s.ticker }}</b><small v-if="s.unitsAdded">+{{ qty(s.unitsAdded) }} units reinvested</small></span>
            <b>{{ cash(s.earned, s.market) }}</b>
          </li>
        </ul>

        <h2 class="section-title">Each dividend</h2>
        <ul class="earn-events">
          <li v-for="v in shown" :key="v.key" class="ev">
            <div class="ev-top"><span class="ev-name"><b>{{ v.ticker }}</b><small>{{ dm(v.date) }}</small></span><b class="ev-net">{{ cash(v.amount, v.market) }}</b></div>
            <p class="ev-line">{{ line(v) }}</p>
            <div v-if="v.source === 'auto'" class="seg" role="radiogroup" :aria-label="'Where ' + v.ticker + ' dividend went'">
              <button type="button" role="radio" :aria-checked="!v.reinvest" @click="toWallet(v)">Wallet</button>
              <button type="button" role="radio" :aria-checked="v.reinvest" @click="toReinvest(v)">Reinvest</button>
            </div>
            <p v-if="v.reinvest" class="ev-line ev-add">+{{ qty(v.unitsAdded) }} units added to {{ v.ticker }}</p>
          </li>
        </ul>
        <button v-if="e.events.length > SHOWN" type="button" class="more-news" @click="all = !all">{{ all ? 'Show fewer' : 'Show all ' + e.events.length }}</button>
      </template>
      <div v-else class="empty div-empty">
        <h2>No dividends earned yet</h2>
        <p>{{ summary.open.length ? (waiting ? 'Getting your dividend history…' : 'None of your stocks has gone ex-dividend since you bought it.') : 'Add a stock to start tracking.' }}</p>
      </div>
    </div>`,
  setup() {
    const all = ref(false), e = earned;
    const shown = computed(() => (all.value ? e.value.events : e.value.events.slice(0, SHOWN)));
    const waiting = computed(() => Object.keys(state.divs).length === 0);
    const line = v => v.source === 'manual' && v.units == null ? 'You recorded this'
      : `${qty(v.units)} × ${perShare(v.perShare, CURRENCY[v.market] ?? '')}${v.source === 'manual' ? ' · you recorded the amount' : v.tax ? ` − ${v.tax}% tax` : ''}`;
    const toReinvest = v => { if (!v.reinvest) state.reinvest = { ev: v }; };
    const toWallet = v => { if (v.reinvest) undoReinvest(v); };
    return { state, summary, e, all, shown, waiting, SHOWN, cash, qty, dm, line, toReinvest, toWallet };
  },
};
