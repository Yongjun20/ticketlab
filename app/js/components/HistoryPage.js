// History: export / import, trades grouped by month with totals. Tap a trade to change it;
// deleted trades slide away and the gap closes; a trade you just saved glows.
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';
import SwipeRow from './SwipeRow.js';
import { state, openSheet, deleteTrade, exportCSV, importFile, lastExport, toast } from '../store.js';
import { money, qty, monthName, niceDate, today } from '../lib/format.js';
import { toMYR } from '../lib/markets.js';

const cashOf = t => t.action === 'dividend' ? t.amount : t.units * t.price + (t.action === 'sell' ? -1 : 1) * (t.fee || 0); // money out (buy) or in (sell), fees included

export default {
  name: 'HistoryPage',
  components: { SwipeRow },
  template: `
    <div class="history-page">
      <h1 class="page-title">History</h1>
      <p class="hint">Swipe a trade left to edit or delete it.</p>
      <div class="io-row">
        <button type="button" class="io-btn" @click="exportCSV">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></svg>Export CSV</button>
        <input type="file" id="import-file" class="sr-only" accept=".csv,.txt,.xlsx,.xls,text/csv" @change="pickFile">
        <label class="io-btn" for="import-file">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m-4 4 4-4 4 4M5 20h14"/></svg>Import CSV</label>
        <span class="io-note" :class="{ late: exportAge === null || exportAge > 7 }">{{ exportNote }}</span>
      </div>

      <div v-if="!state.txns.length" class="empty">
        <h2>No trades yet</h2>
        <p>Every buy and sell you save shows up here, newest first.</p>
      </div>

      <section v-for="g in groups" :key="g.month" class="month-group">
        <div class="month">
          <h2>{{ g.month }}</h2>
          <p class="month-total"><template v-for="(part, i) in g.parts" :key="i"><template v-if="i"> · </template>{{ part.label }} <b>{{ part.value }}</b></template></p>
        </div>
        <TransitionGroup name="trade" tag="div" class="log-list">
          <SwipeRow v-for="t in g.list" :key="t.id" :open="openId === t.id" :label="(t.action === 'dividend' ? 'Dividend from ' : t.action === 'sell' ? 'Sold ' : 'Bought ') + t.ticker + ' on ' + niceDate(t.date)"
            @update:open="v => (openId = v ? t.id : openId === t.id ? null : openId)" @tap="edit(t)" @edit="edit(t)" @delete="remove(t)">
          <div class="log-item" :class="{ glow: state.glowId === t.id }">
            <div class="log-left">
              <div class="log-ticker">{{ t.ticker }}
                <span class="tag" :class="t.action === 'dividend' ? 'tag-div' : t.action === 'sell' ? 'tag-sell' : 'tag-buy'">{{ t.action === 'dividend' ? 'Dividend' : t.action === 'sell' ? 'Sell' : 'Buy' }}</span>
                <span class="tag tag-info">{{ t.market }}</span></div>
              <div v-if="t.action === 'dividend'" class="log-detail">{{ t.date }} · received</div>
              <div v-else class="log-detail">{{ t.date }} · {{ qty(t.units) }} units @ {{ money(t.price, t.market) }}{{ t.fee ? ' · fees ' + money(t.fee, t.market) : '' }}</div>
              <div v-if="t.notes" class="log-detail">{{ t.notes }}</div>
            </div>
            <div class="log-right">
              <span class="log-amount" :class="t.action === 'buy' ? 'down' : 'up'">{{ t.action === 'buy' ? '−' : '+' }}{{ money(cashOf(t), t.market) }}</span>
            </div>
          </div>
          </SwipeRow>
        </TransitionGroup>
      </section>
    </div>`,
  setup() {
    // Newest first, grouped by month; month totals in ringgit (today's exchange rate for foreign trades)
    const groups = computed(() => {
      const rows = [...state.txns].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const out = [];
      for (const t of rows) {
        const m = monthName(t.date);
        if (out.at(-1)?.month !== m) out.push({ month: m, list: [] });
        out.at(-1).list.push(t);
      }
      for (const g of out) {
        let bought = 0, sold = 0, divs = 0, missing = false;
        for (const t of g.list) {
          const rm = toMYR(cashOf(t), t.market, state.live.rates);
          if (rm == null) { missing = true; continue; }
          if (t.action === 'dividend') divs += rm; else if (t.action === 'sell') sold += rm; else bought += rm;
        }
        g.parts = [
          bought > 0 && { label: 'Bought', value: money(bought, 'MY') },
          sold > 0 && { label: 'Sold', value: money(sold, 'MY') },
          divs > 0 && { label: 'Dividends', value: money(divs, 'MY') },
          missing && { label: 'some not counted yet', value: '' },
        ].filter(Boolean);
      }
      return out;
    });

    const exportAge = computed(() => (lastExport.date ? Math.round((new Date(today()) - new Date(lastExport.date)) / 864e5) : null));
    const exportNote = computed(() => {
      const d = exportAge.value;
      return d === null ? 'Not exported yet' : `Last export: ${d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'}`;
    });

    const openId = ref(null); // the one card swiped open (only one at a time)
    function edit(t) { openId.value = null; openSheet({ trade: t }); }
    async function remove(t) {
      if (!confirm('Delete this trade? You can’t undo this.')) return;
      openId.value = null;
      await deleteTrade(t.id);
      toast('Trade deleted');
    }

    function pickFile(e) {
      const file = e.target.files[0];
      e.target.value = ''; // lets you pick the same file again later
      if (file) importFile(file);
    }

    return { state, groups, exportAge, exportNote, openId, edit, remove, pickFile, exportCSV, money, qty, niceDate, cashOf };
  },
};
