// Add or change a trade. Search a stock by name, pick Bought / Sold (the highlight slides across),
// see what you pay as you type, and save. The trade you saved glows in History.
import { reactive, ref, computed, watch } from '../vendor/vue.esm-browser.prod.js';
import { state, holdings, saveTrade, toast } from '../store.js';
import { buildHoldings } from '../lib/holdings.js';
import { fromYahoo, fixPence, toYahoo } from '../lib/markets.js';
import { searchStocks } from '../lib/prices.js';
import { money, qty, niceDate, today, tone, MARKET_NAME, CURRENCY, DEFAULT_TAX } from '../lib/format.js';

import BottomSheet from './BottomSheet.js';

const blank = () => ({ action: 'buy', ticker: '', market: 'MY', units: '', price: '', fee: '', date: today(), type: 'growth', tax: 0, amount: '', notes: '' });

export default {
  name: 'TradeSheet',
  components: { BottomSheet },
  template: `
    <BottomSheet :open="!!state.sheet" :title="isDiv ? (editing ? 'Change dividend' : 'Add a dividend') : editing ? 'Change trade' : 'Add a trade'" @close="close">
      <form class="form" novalidate @submit.prevent="save">
        <div class="toggle" :class="f.action" role="radiogroup" aria-label="Bought, sold or dividend?">
          <span class="toggle-pill" aria-hidden="true"></span>
          <button type="button" role="radio" :aria-checked="f.action === 'buy'" @click="f.action = 'buy'">Bought</button>
          <button type="button" role="radio" :aria-checked="f.action === 'sell'" @click="f.action = 'sell'">Sold</button>
          <button type="button" role="radio" :aria-checked="f.action === 'dividend'" @click="f.action = 'dividend'">Dividend</button>
        </div>

        <div class="field">
          <label for="f-ticker">Stock</label>
          <div class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="f-ticker" class="input" type="search" v-model.trim="f.ticker" autocomplete="off" spellcheck="false" enterkeyhint="search"
              placeholder="Type a name, like maybank or micron" role="combobox" aria-autocomplete="list" :aria-expanded="results !== null"
              @input="typed" @focus="!f.ticker && showOwned()" @keydown.esc.stop.prevent="results = null">
          </div>
          <div v-if="results !== null" class="suggest" role="listbox" aria-label="Matching stocks">
            <p v-if="searching" class="note">Looking for “{{ f.ticker }}”…</p>
            <p v-else-if="searchNote" class="note">{{ searchNote }}</p>
            <TransitionGroup name="cascade" tag="div">
              <button v-for="(x, i) in results" :key="x.mapped.market + x.mapped.ticker" type="button" class="opt" role="option"
                :style="{ transitionDelay: i * 40 + 'ms' }" @click="pick(x)">
                <span class="opt-main"><b>{{ x.mapped.ticker }}</b><small>{{ x.name }}, {{ MARKET_NAME[x.mapped.market] }}</small></span>
                <span class="opt-price">
                  <template v-if="x.price != null"><b>{{ money(x.price, x.mapped.market) }}</b>
                    <small v-if="x.changePct != null" :class="tone(x.changePct)">{{ x.changePct > 0 ? '+' : '' }}{{ x.changePct.toFixed(2) }}%</small></template>
                  <small v-else>No price</small>
                </span>
              </button>
            </TransitionGroup>
          </div>
        </div>

        <div class="field">
          <span class="label" id="lbl-market">Market</span>
          <div class="chips" role="radiogroup" aria-labelledby="lbl-market">
            <button v-for="m in markets" :key="m" type="button" role="radio" class="chip" :aria-checked="f.market === m" @click="setMarket(m)">{{ MARKET_NAME[m] }}</button>
          </div>
        </div>

        <template v-if="isDiv">
          <div class="two">
            <div class="field"><label for="f-amount">Amount received</label><input id="f-amount" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" v-model="f.amount"></div>
            <div class="field"><label for="f-date-d">Date</label><input id="f-date-d" class="input" type="date" v-model="f.date"></div>
          </div>
          <p class="hint">The cash that reached your account, after any tax, in the stock's own currency.</p>
          <div class="field"><label for="f-notes-d">Notes</label><input id="f-notes-d" class="input" placeholder="Optional" autocomplete="off" v-model="f.notes"></div>
        </template>
        <template v-else>
        <div class="field">
          <span class="label" id="lbl-kind">Kind of stock</span>
          <div class="seg" role="radiogroup" aria-labelledby="lbl-kind">
            <button type="button" role="radio" :aria-checked="f.type === 'growth'" @click="chooseKind('growth')">Growth stock</button>
            <button type="button" role="radio" :aria-checked="f.type === 'dividend'" @click="chooseKind('dividend')">Dividend stock</button>
          </div>
          <p class="hint">Applies to every trade of this stock.</p>
        </div>
        <div class="two">
          <div class="field"><label for="f-units">How many units</label><input id="f-units" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="100" v-model="f.units"></div>
          <div class="field"><label for="f-price">Price per unit</label><input id="f-price" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" v-model="f.price"></div>
        </div>
        <div class="two">
          <div class="field"><label for="f-fee">Commission fees</label><input id="f-fee" class="input" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" v-model="f.fee"></div>
          <div class="field"><label for="f-date">Date</label><input id="f-date" class="input" type="date" v-model="f.date"></div>
        </div>
        <p class="hint">Commission fees are the stamp duty and platform fees added together.</p>

        <Transition name="pop"><p v-if="total" class="total" aria-live="polite">{{ total }}</p></Transition>

        <button type="button" class="more-toggle" :aria-expanded="more" @click="more = !more">More options
          <svg class="chev" :class="{ turned: more }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        <div class="unfold" :class="{ open: more }" :inert="more ? null : ''">
          <div class="more">
            <div class="field"><label for="f-tax">Dividend tax (%)</label><input id="f-tax" class="input" type="number" min="0" max="100" step="any" inputmode="decimal" v-model="f.tax"></div>
            <div class="field"><label for="f-notes">Notes</label><input id="f-notes" class="input" placeholder="bought on a dip" autocomplete="off" v-model="f.notes"></div>
          </div>
        </div>
        </template>

        <Transition name="shake"><p v-if="error" :key="error" class="error" role="alert">{{ error }}</p></Transition>
        <button type="submit" class="save" :class="{ done: saved }" :disabled="!ready || busy">
          <span v-if="saved" class="tick" aria-hidden="true">✓</span>{{ saved ? 'Saved' : editing ? 'Save changes' : isDiv ? 'Save dividend' : f.action === 'sell' ? 'Save sale' : 'Save purchase' }}
        </button>
      </form>
    </BottomSheet>`,
  setup() {
    const f = reactive(blank());
    const more = ref(false), error = ref(''), busy = ref(false), saved = ref(false);
    const results = ref(null), searching = ref(false), searchNote = ref('');
    const markets = Object.keys(CURRENCY);
    let opened = '', timer, seq = 0;
    const snapshot = () => JSON.stringify(f);

    const editing = computed(() => state.sheet?.mode === 'edit');

    // Fill the form each time the sheet opens
    watch(() => state.sheet?.key, key => {
      if (!key) return;
      const s = state.sheet, t = s.trade;
      Object.assign(f, blank(), t
        ? { action: t.action, ticker: t.ticker, market: t.market, units: t.units, price: t.price, fee: t.fee || '', date: t.date, type: t.type || 'dividend', tax: t.divTax ?? 0, amount: t.amount ?? '', notes: t.notes || '' }
        : { action: s.action || 'buy', ticker: s.ticker || '', market: s.market || 'MY', tax: DEFAULT_TAX[s.market || 'MY'] ?? 0 });
      more.value = false; error.value = ''; busy.value = false; saved.value = false; results.value = null; kindTouched.value = false;
      if (!t && f.ticker) adoptKind(); // opened from a stock's Buy more / Sell button
      opened = snapshot();
    });

    const setMarket = m => { f.market = m; f.tax = DEFAULT_TAX[m] ?? 0; };

    // New stocks start as Growth. A stock you already own keeps its own kind, so adding to it doesn't flip it (unless you change the choice yourself).
    const kindTouched = ref(false);
    const chooseKind = k => { f.type = k; kindTouched.value = true; };
    function adoptKind() {
      if (kindTouched.value || editing.value) return;
      const own = holdings.value.find(h => h.ticker === f.ticker.toUpperCase() && h.market === f.market);
      f.type = own?.type || 'growth';
    }

    const nums = computed(() => ({ units: parseFloat(f.units), price: parseFloat(f.price), fee: String(f.fee).trim() === '' ? 0 : parseFloat(f.fee) }));
    const isDiv = computed(() => f.action === 'dividend');
    const ready = computed(() => isDiv.value ? !!f.ticker && parseFloat(f.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.date) : !!f.ticker && nums.value.units > 0 && nums.value.price >= 0 && nums.value.fee >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.date));
    const total = computed(() => {
      if (isDiv.value) return '';
      const { units, price, fee } = nums.value;
      let text = '';
      if (units > 0 && price >= 0) {
        const gross = units * price, fees = fee > 0 ? fee : 0, sell = f.action === 'sell';
        text = `${sell ? 'You get' : 'You pay'} ${money(sell ? gross - fees : gross + fees, f.market)}${fees ? ` including ${money(fees, f.market)} fees` : ''}.`;
      }
      if (f.action === 'sell' && f.ticker) {
        const h = holdings.value.find(x => x.ticker === f.ticker.toUpperCase() && x.market === f.market);
        text += ` You have ${qty(h?.units ?? 0)} units.`;
      }
      return text.trim();
    });

    // Stock search
    function showOwned() {
      const own = holdings.value.filter(h => h.units > 0);
      if (!own.length) return;
      seq++; searching.value = false; searchNote.value = 'Stocks you have';
      results.value = own.map(h => {
        const q = state.live.prices[toYahoo(h.ticker, h.market)];
        return { mapped: { ticker: h.ticker, market: h.market }, name: q?.name || 'In your stocks', price: q?.price ?? null, changePct: q?.changePct ?? null };
      });
    }
    function typed() {
      const owned = holdings.value.find(h => h.ticker === f.ticker.toUpperCase());
      if (owned) setMarket(owned.market);
      adoptKind();
      clearTimeout(timer);
      if (!f.ticker) return showOwned();
      if (f.ticker.length < 2) { results.value = null; return; }
      timer = setTimeout(runSearch, 300); // wait until you pause typing
    }
    async function runSearch() {
      const mine = ++seq, q = f.ticker;
      results.value = []; searching.value = true; searchNote.value = '';
      try {
        const list = await searchStocks(q);
        if (mine !== seq) return; // you typed more since
        results.value = (Array.isArray(list) ? list : []).map(x => ({ ...fixPence(x), mapped: fromYahoo(x.symbol, x.type) })).filter(x => x.mapped).slice(0, 6);
        searchNote.value = results.value.length ? '' : 'Nothing found in the markets this app follows. You can still type the stock code yourself.';
      } catch {
        if (mine === seq) { results.value = []; searchNote.value = 'Search isn’t working right now. Type the stock code yourself.'; }
      }
      if (mine === seq) searching.value = false;
    }
    function pick(x) {
      seq++;
      f.ticker = x.mapped.ticker;
      setMarket(x.mapped.market); // MU → US
      adoptKind();
      if (x.price != null && f.price === '') f.price = +x.price.toFixed(4);
      results.value = null;
      document.getElementById('f-units')?.focus();
    }

    function close() {
      if (!saved.value && snapshot() !== opened && !confirm('Close without saving this trade?')) return;
      state.sheet = null;
    }

    async function save() {
      if (!ready.value || busy.value) return;
      if (isDiv.value) {
        const d = { date: f.date, ticker: f.ticker.toUpperCase(), market: f.market, action: 'dividend', type: 'dividend', units: 0, price: 0, fee: 0, amount: parseFloat(f.amount), notes: String(f.notes).trim() };
        if (!holdings.value.some(h => h.ticker === d.ticker && h.market === d.market)) return (error.value = `You have no bought record for ${d.ticker}. Add the purchase first.`);
        error.value = ''; busy.value = true;
        const id = state.sheet.trade?.id ?? null;
        await saveTrade(d, id);
        saved.value = true;
        toast(id ? `Changes saved: ${d.ticker}` : `Saved: dividend from ${d.ticker}`);
        setTimeout(() => { state.sheet = null; }, 450);
        return;
      }
      const { units, price, fee } = nums.value;
      const t = { date: f.date, ticker: f.ticker.toUpperCase(), market: f.market, action: f.action, type: f.type, units, price, fee: fee || 0,
        divTax: parseFloat(f.tax) || 0, notes: String(f.notes).trim() };
      if (t.divTax < 0 || t.divTax > 100) return (error.value = 'Dividend tax must be between 0 and 100.');
      const editId = state.sheet.trade?.id ?? null;
      if (t.action === 'sell') { // can't sell more than you had on that date (not counting the trade being changed)
        const h = buildHoldings(state.txns.filter(x => x.date <= t.date && x.id !== editId)).find(x => x.ticker === t.ticker && x.market === t.market);
        const held = h ? h.units : 0;
        if (t.units > held + 1e-9) return (error.value = `On ${niceDate(t.date)} you had ${qty(held)} units of ${t.ticker}, so you can’t sell ${qty(t.units)}.`);
      }
      error.value = ''; busy.value = true;
      await saveTrade(t, editId);
      saved.value = true; // ✓ for a moment, then the sheet drops away
      toast(editId ? `Changes saved: ${t.ticker}` : `Saved: ${t.action === 'sell' ? 'sold' : 'bought'} ${qty(t.units)} ${t.ticker}`);
      setTimeout(() => { state.sheet = null; }, 450);
    }

    return { state, f, more, error, busy, saved, isDiv, kindTouched, chooseKind, results, searching, searchNote, markets, editing, ready, total,
      setMarket, showOwned, typed, pick, close, save, money, tone, MARKET_NAME };
  },
};
