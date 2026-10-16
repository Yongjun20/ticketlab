// History: export / import, trades grouped by month with totals. Tap a trade to change it;
// deleted trades slide away and the gap closes; a trade you just saved glows.
import { ref, computed, watch, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import SwipeRow from './SwipeRow.js';
import { state, openSheet, deleteWithUndo, cash, exportCSV, importFile, lastExport, toast } from '../store.js';
import { money, qty, monthName, niceDate, today } from '../lib/format.js';
import { toMYR } from '../lib/markets.js';

const cashOf = t => t.action === 'dividend' ? t.amount : t.units * t.price + (t.action === 'sell' ? -1 : 1) * (t.fee || 0); // money out (buy) or in (sell), fees included

export default {
  name: 'HistoryPage',
  components: { SwipeRow },
  template: `
    <div class="history-page">
      <div class="title-row">
        <h1 class="page-title">History</h1>
        <button v-if="state.txns.length" type="button" class="text-btn select-btn" :class="{ done: selecting }" :aria-pressed="selecting" :aria-label="selecting ? 'Done' : 'Select trades'" @click="toggleSelecting">
          <template v-if="selecting">Done</template>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m8 12.5 3 3 5-6"/></svg>
        </button>
      </div>
      <p class="hint">
        <template v-if="selecting">Tap trades to choose them, then delete them all at once.</template>
        <template v-else>Swipe a trade left to edit or delete it. Tap the tick box to delete several.</template>
      </p>
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
          <button v-if="selecting" type="button" class="text-btn month-pick" @click="toggleMonth(g)">{{ monthAll(g) ? 'Clear month' : 'Select month' }}</button>
          <p class="month-total"><template v-for="(part, i) in g.parts" :key="i"><template v-if="i"> · </template>{{ part.label }} <b>{{ part.value }}</b></template></p>
        </div>
        <TransitionGroup name="trade" tag="div" class="log-list">
          <SwipeRow v-for="t in g.list" :key="t.id" :open="!selecting && openId === t.id" :locked="selecting" :label="(t.action === 'dividend' ? 'Dividend from ' : t.action === 'sell' ? 'Sold ' : 'Bought ') + t.ticker + ' on ' + niceDate(t.date)"
            @update:open="v => (openId = v ? t.id : openId === t.id ? null : openId)" @tap="selecting ? toggle(t.id) : edit(t)" @edit="edit(t)" @delete="remove(t)">
          <div class="log-item" :class="{ glow: state.glowId === t.id, selecting, picked: picked.has(t.id) }">
            <span v-if="selecting" class="pick" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
            </span>
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

      <Teleport to="body"><!-- outside the sliding page, so "fixed to the screen" works -->
      <Transition name="pop">
        <div v-if="selecting" class="select-bar" role="toolbar" aria-label="Delete several trades">
          <span class="select-count" aria-live="polite">{{ picked.size ? picked.size + ' selected' : 'None selected' }}</span>
          <button type="button" class="text-btn" @click="toggleAll">{{ allPicked ? 'Clear' : 'Select all' }}</button>
          <button type="button" class="select-del" :disabled="!picked.size" @click="removePicked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>Delete</button>
        </div>
      </Transition>
      </Teleport>
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
          bought > 0 && { label: 'Bought', value: cash(bought, 'MY') },
          sold > 0 && { label: 'Sold', value: cash(sold, 'MY') },
          divs > 0 && { label: 'Dividends', value: cash(divs, 'MY') },
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
      openId.value = null;
      await deleteWithUndo([t]);
    }

    // Select mode: tap trades to pick them, then delete every picked trade at once
    const selecting = ref(false), picked = ref(new Set());
    const allIds = computed(() => state.txns.map(t => t.id));
    const allPicked = computed(() => allIds.value.length > 0 && allIds.value.every(id => picked.value.has(id)));
    const flip = fn => { const s = new Set(picked.value); fn(s); picked.value = s; };
    const toggle = id => flip(s => (s.has(id) ? s.delete(id) : s.add(id)));
    const toggleAll = () => (picked.value = allPicked.value ? new Set() : new Set(allIds.value));
    const monthAll = g => g.list.every(t => picked.value.has(t.id));
    const toggleMonth = g => flip(s => { const all = monthAll(g); g.list.forEach(t => (all ? s.delete(t.id) : s.add(t.id))); });
    function toggleSelecting() { selecting.value = !selecting.value; picked.value = new Set(); openId.value = null; }
    async function removePicked() {
      const trades = state.txns.filter(t => picked.value.has(t.id));
      if (!trades.length) return;
      await deleteWithUndo(trades);
      selecting.value = false; picked.value = new Set();
    }
    watch(() => state.txns.length, n => { if (!n) selecting.value = false; }); // nothing left to select
    watch(() => state.tab, t => { if (t !== 1 && selecting.value) toggleSelecting(); }); // leaving History ends Select mode
    const onKey = e => { if (e.key === 'Escape' && selecting.value) toggleSelecting(); };
    document.addEventListener('keydown', onKey);
    onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

    function pickFile(e) {
      const file = e.target.files[0];
      e.target.value = ''; // lets you pick the same file again later
      if (file) importFile(file);
    }

    return { cash, state, groups, exportAge, exportNote, openId, edit, remove, pickFile, selecting, picked, allPicked, toggle, toggleAll, toggleMonth, monthAll, toggleSelecting, removePicked, exportCSV, money, qty, niceDate, cashOf };
  },
};
