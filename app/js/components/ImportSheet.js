// Check an imported file before saving: fees to add up, date style (only when unclear),
// market for rows that don't say, counts, and a preview of the first trades.
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';
import { state, importTrades, toast } from '../store.js';
import { rowToTrade, tradeKey, norm, isFeeHeader, TOTAL_FEE_NAMES, IMPORT_FIELDS } from '../lib/csv.js';
import { money, qty, MARKET_NAME, CURRENCY } from '../lib/format.js';
import BottomSheet from './BottomSheet.js';

export default {
  name: 'ImportSheet',
  components: { BottomSheet },
  template: `
    <BottomSheet :open="!!job" title="Import trades" @close="state.importJob = null">
      <div v-if="job" class="form">
        <p class="imp-file">File: <b>{{ job.fileName }}</b>, {{ job.rows.length }} rows</p>

        <template v-if="feeCols.length">
          <p class="label">Fees to add up</p>
          <div class="fee-list">
            <label v-for="c in feeCols" :key="c.i"><input type="checkbox" :value="c.i" v-model="job.map.fees">{{ c.h }}</label>
          </div>
        </template>
        <p v-else class="hint">No fee columns found. Fees will be 0.</p>

        <div class="two">
          <div v-if="job.askDate" class="field"><label for="imp-date">Dates are written as</label>
            <select id="imp-date" class="input" v-model="job.dateOrder"><option value="dmy">Day/Month/Year</option><option value="mdy">Month/Day/Year</option></select></div>
          <div class="field"><label for="imp-market">Market if the file doesn't say</label>
            <select id="imp-market" class="input" v-model="job.defaultMarket"><option v-for="m in markets" :key="m" :value="m">{{ MARKET_NAME[m] }}</option></select></div>
        </div>

        <div class="imp-stats">
          <span class="imp-stat ok">{{ result.ready.length }} ready</span>
          <span v-if="result.dupes" class="imp-stat">{{ result.dupes }} already in your app</span>
          <span v-if="skippedCount" class="imp-stat">{{ skippedCount }} skipped</span>
        </div>
        <ul v-if="skippedCount" class="imp-skips"><li v-for="[why, n] in [...result.skipped]" :key="why">{{ n }} × {{ why }}</li></ul>

        <template v-if="result.ready.length">
          <div class="imp-table-wrap"><table class="imp-table">
            <thead><tr><th>Date</th><th></th><th>Stock</th><th>Market</th><th>Units</th><th>Price</th><th>Fees</th></tr></thead>
            <tbody><tr v-for="(t, i) in result.ready.slice(0, 8)" :key="i">
              <td>{{ t.date }}</td><td :class="t.action === 'buy' ? 'up' : t.action === 'sell' ? 'down' : 'div'">{{ t.action === 'dividend' ? 'Dividend' : t.action === 'sell' ? 'Sell' : 'Buy' }}</td>
              <td>{{ t.ticker }}</td><td>{{ t.market }}</td><td>{{ qty(t.units) }}</td><td>{{ money(t.price, t.market) }}</td><td>{{ t.fee ? money(t.fee, t.market) : '—' }}</td>
            </tr></tbody>
          </table></div>
          <p v-if="result.ready.length > 8" class="hint">…and {{ result.ready.length - 8 }} more</p>
        </template>
        <p v-else class="error">{{ missing.length ? 'Couldn’t find these columns in the file: ' + missing.join(', ') + '. Check it’s a trade history file.' : 'Every row was skipped, so there is nothing to import.' }}</p>

        <button type="button" class="save" :disabled="!result.ready.length || busy" @click="go">Import {{ result.ready.length }} trade{{ result.ready.length === 1 ? '' : 's' }}</button>
      </div>
    </BottomSheet>`,
  setup() {
    const busy = ref(false);
    const job = computed(() => state.importJob);
    const markets = Object.keys(CURRENCY);

    const feeCols = computed(() => job.value
      ? job.value.header.map((h, i) => ({ h, i })).filter(({ h, i }) => isFeeHeader(norm(h)) || TOTAL_FEE_NAMES.includes(norm(h)) || job.value.map.fees.includes(i))
      : []);
    const missing = computed(() => (job.value ? IMPORT_FIELDS.filter(f => f.need && !(job.value.map[f.key] >= 0)).map(f => f.label) : []));

    const result = computed(() => {
      const ready = [], skipped = new Map();
      let dupes = 0;
      for (const row of job.value?.rows || []) {
        const r = rowToTrade(row, job.value.map, job.value);
        if (r.skip) { skipped.set(r.skip, (skipped.get(r.skip) || 0) + 1); continue; }
        if (job.value.existing.has(tradeKey(r.trade))) { dupes++; continue; }
        ready.push(r.trade);
      }
      return { ready, skipped, dupes };
    });
    const skippedCount = computed(() => [...result.value.skipped.values()].reduce((a, b) => a + b, 0));

    async function go() {
      const list = result.value.ready;
      busy.value = true;
      await importTrades(list);
      busy.value = false;
      state.importJob = null;
      toast(`Imported ${list.length} trade${list.length === 1 ? '' : 's'}`);
    }

    return { state, job, busy, markets, feeCols, missing, result, skippedCount, go, money, qty, MARKET_NAME };
  },
};
