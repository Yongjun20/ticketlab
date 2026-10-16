// News, three views:
//   Summary - a short live snapshot: Brent oil, the US 10-year yield, US stocks, and a few other numbers that move stocks
//   Stocks  - headlines about the stocks you hold only
//   Others  - all other Malaysian and US market headlines
// Stocks and Others have a month calendar (a dot under every day that has headlines). Tap a headline to open the news site.
// Headlines are saved on this phone each time the app asks for news, so days before you started using the app stay empty.
import { ref, computed, watch } from '../vendor/vue.esm-browser.prod.js';
import { state, summary, refreshNews, refreshMarket, idle } from '../store.js';
import { today, stamp } from '../lib/format.js';
import { countByDay, dateKey, matchStocks, monthCells } from '../lib/news.js';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FILTERS = [['SUMMARY', 'Summary'], ['STOCKS', 'Stocks'], ['OTHERS', 'Others']];
const SHOWN = 10; // headlines shown before the Show more button
const niceDay = key => new Date(key + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const clock = sec => new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The numbers on the Summary. words: what to call going up / down. tone: colour it green / red (otherwise amber).
const MAIN = [
  { sym: 'BZ=F', name: 'Brent oil', note: 'per barrel', fmt: v => '$' + v.toFixed(2), words: ['Rising', 'Falling'] },
  { sym: '^TNX', name: 'US 10-year yield', note: 'what the US government pays to borrow', fmt: v => v.toFixed(2) + '%', words: ['Rising', 'Falling'], points: true },
  { sym: '^GSPC', name: 'S&P 500', note: 'the 500 biggest US companies', fmt: v => Math.round(v).toLocaleString('en'), words: ['Up', 'Down'], tone: true },
];
const MORE = [
  { sym: '^IXIC', name: 'Nasdaq', fmt: v => Math.round(v).toLocaleString('en'), tone: true },
  { sym: '^VIX', name: 'VIX fear index', fmt: v => v.toFixed(1) },
  { sym: '^KLSE', name: 'Bursa KLCI', fmt: v => v.toFixed(1), tone: true },
  { sym: 'GC=F', name: 'Gold', fmt: v => '$' + Math.round(v).toLocaleString('en') },
  { sym: 'MYR=X', name: 'USD to ringgit', fmt: v => 'RM' + v.toFixed(3) },
];
const STEADY = 0.15; // a move smaller than this many % counts as steady

export default {
  name: 'NewsPage',
  template: `
    <div class="news-page">
      <div class="title-row">
        <h1 class="page-title">News</h1>
        <button type="button" class="tc-refresh news-refresh" :class="{ spinning: busy }" aria-label="Refresh news" title="Refresh news" @click="reload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
        </button>
      </div>

      <div class="news-bar">
        <div class="chips" role="radiogroup" aria-label="Which news">
          <button v-for="[k, label] in FILTERS" :key="k" type="button" role="radio" class="chip" :aria-checked="filter === k" @click="filter = k">{{ label }}</button>
        </div>
      </div>

      <!-- Summary: the market in a few numbers -->
      <section v-if="filter === 'SUMMARY'" class="brief" aria-label="Market summary">
        <p v-if="line" class="brief-line">{{ line }}</p>
        <ul class="brief-main">
          <li v-for="m in main" :key="m.sym" class="bm">
            <span class="bm-name">{{ m.name }}</span>
            <b class="bm-value">{{ m.value }}</b>
            <span class="bm-move" :class="m.tone">{{ m.arrow }} {{ m.word }} · {{ m.change }}</span>
            <small>{{ m.note }}</small>
          </li>
        </ul>
        <ul class="brief-more">
          <li v-for="m in more" :key="m.sym" class="bt">
            <span>{{ m.name }}</span><b>{{ m.value }}</b><small :class="m.tone">{{ m.arrow }} {{ m.change }}</small>
          </li>
        </ul>
        <p v-if="state.market.error" class="news-warn">{{ state.market.error }}</p>
        <p v-else-if="!main.length" class="note">{{ state.market.loading ? 'Getting the market numbers…' : 'No market numbers yet.' }}</p>
        <p v-else class="brief-time">Prices can be a few minutes late{{ state.market.at ? ' · updated ' + stampOf(state.market.at) : '' }}</p>
      </section>

      <!-- Stocks / Others: pick a day, read its headlines -->
      <template v-else>
        <section class="cal" aria-label="Pick a day">
          <div class="cal-head">
            <button type="button" class="cal-nav" aria-label="Previous month" @click="step(-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>
            <h2>{{ monthTitle }}</h2>
            <button type="button" class="cal-nav" aria-label="Next month" :disabled="isThisMonth" @click="step(1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
          </div>
          <div class="cal-grid">
            <span v-for="(d, i) in WEEK" :key="'w' + i" class="cal-dow" aria-hidden="true">{{ d }}</span>
            <template v-for="(c, i) in cells" :key="i">
              <span v-if="!c" class="cal-blank"></span>
              <button v-else type="button" class="cal-day" :class="{ on: c === picked, now: c === todayKey, has: counts[c] }" :disabled="c > todayKey"
                :aria-label="niceDay(c) + (counts[c] ? ', ' + counts[c] + ' headlines' : ', no headlines')" :aria-pressed="c === picked" @click="picked = c">
                {{ +c.slice(8) }}<i v-if="counts[c]" aria-hidden="true"></i>
              </button>
            </template>
          </div>
        </section>

        <div class="month news-day">
          <h2>{{ niceDay(picked) }}</h2>
          <p class="month-total"><b>{{ list.length }}</b> headline{{ list.length === 1 ? '' : 's' }}</p>
        </div>
        <p v-if="state.newsError" class="news-warn">{{ state.newsError }}</p>

        <p v-if="state.newsLoading && !list.length" class="note">Getting the latest headlines…</p>
        <div v-else-if="!list.length" class="empty news-empty">
          <h2>{{ filter === 'STOCKS' && !held.length ? 'No stocks yet' : 'No headlines saved for this day' }}</h2>
          <p>{{ emptyHelp }}</p>
        </div>
        <ul v-else class="news-list">
          <li v-for="n in shown" :key="n.link">
            <a :href="n.link" target="_blank" rel="noopener noreferrer">
              <span class="news-headline">{{ n.title }}</span>
              <small><span v-for="t in (filter === 'STOCKS' ? n.mine.slice(0, 2) : [])" :key="t" class="mine">{{ t }}</span>{{ n.source }}{{ n.guess ? '' : ' · ' + clock(n.time) }}</small>
            </a>
          </li>
        </ul>
        <button v-if="list.length > SHOWN" type="button" class="more-news" @click="all = !all">{{ all ? 'Show fewer' : 'Show ' + (list.length - SHOWN) + ' more' }}</button>
      </template>
    </div>`,
  setup() {
    const todayKey = ref(today());
    const picked = ref(todayKey.value), filter = ref('SUMMARY'), all = ref(false);
    const view = ref({ y: +todayKey.value.slice(0, 4), m: +todayKey.value.slice(5, 7) - 1 });
    const cells = computed(() => monthCells(view.value.y, view.value.m));
    const monthTitle = computed(() => new Date(view.value.y, view.value.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
    const isThisMonth = computed(() => view.value.y === +todayKey.value.slice(0, 4) && view.value.m === +todayKey.value.slice(5, 7) - 1);
    const step = d => { const t = new Date(view.value.y, view.value.m + d, 1); view.value = { y: t.getFullYear(), m: t.getMonth() }; };

    // ---- Stocks / Others
    // the stocks you hold, with company names from the live prices
    const heldKey = computed(() => summary.value.open.map(r => r.ticker + '' + (r.q?.name || '')).join('')); // a plain string: only a real change wakes what depends on it
    const held = computed(() => (heldKey.value ? heldKey.value.split('').map(x => { const [ticker, name] = x.split(''); return { ticker, name }; }) : []));
    // every saved headline, with the tickers of your stocks it is about (the stock's own news, or its name in the title)
    const tagged = computed(() => {
      const mine = new Set(held.value.map(h => h.ticker));
      return state.news.map(n => ({ ...n, mine: [...new Set([...(n.tickers || []).filter(t => mine.has(t)), ...matchStocks(n.title, held.value)])] }));
    });
    const tabItems = computed(() => tagged.value.filter(n => (filter.value === 'STOCKS' ? n.mine.length > 0 : n.mine.length === 0)));
    const counts = computed(() => countByDay(tabItems.value));
    const list = computed(() => tabItems.value.filter(n => dateKey(n.time) === picked.value));
    const shown = computed(() => (all.value ? list.value : list.value.slice(0, SHOWN)));
    const emptyHelp = computed(() => filter.value === 'STOCKS'
      ? (held.value.length ? 'Nothing about your stocks was saved for this day. Headlines are saved on this phone as the app opens.' : 'Add a stock and its news will show here.')
      : (picked.value === todayKey.value ? 'Press the refresh button above to look again.' : 'Headlines are saved on this phone each time the app opens, so days before you started using it stay empty.'));
    watch([picked, filter], () => { all.value = false; });

    // ---- Summary
    const info = (spec, quote) => {
      const pct = quote.changePct ?? 0, move = spec.points ? quote.change ?? 0 : pct;
      const dir = Math.abs(pct) < STEADY ? 0 : pct > 0 ? 1 : -1;
      const tone = !spec.tone ? '' : dir > 0 ? 'up' : dir < 0 ? 'down' : '';
      const sign = move > 0 ? '+' : move < 0 ? '−' : '';
      return {
        sym: spec.sym, name: spec.name, note: spec.note, value: spec.fmt(quote.price), tone, dir,
        arrow: dir > 0 ? '▲' : dir < 0 ? '▼' : '•',
        word: dir === 0 ? 'Steady' : spec.words?.[dir > 0 ? 0 : 1] ?? '',
        change: `${sign}${Math.abs(move).toFixed(2)}${spec.points ? ' pts' : '%'}`,
      };
    };
    const build = specs => specs.filter(s => state.market.items[s.sym]).map(s => info(s, state.market.items[s.sym]));
    const main = computed(() => build(MAIN));
    const more = computed(() => build(MORE));
    // one plain sentence: how US stocks, oil and yields are doing
    const line = computed(() => {
      const by = Object.fromEntries(main.value.map(m => [m.sym, m]));
      const say = (m, what, verb, up, down) => (m ? `${what} ${verb} ${m.dir === 0 ? 'steady' : m.dir > 0 ? up : down}` : '');
      return [say(by['^GSPC'], 'US stocks', 'are', 'up', 'down'), say(by['BZ=F'], 'Oil', 'is', 'rising', 'falling'), say(by['^TNX'], 'The US 10-year yield', 'is', 'rising', 'falling')].filter(Boolean).join(' · ');
    });

    const busy = computed(() => state.newsLoading || state.market.loading);
    const reload = () => { refreshNews(true); refreshMarket(true); };
    // opening the tab: a new day may have started while the app stayed open, and fresh numbers may be waiting
    watch(() => state.tab, t => { if (t === 2) { todayKey.value = today(); idle(() => { refreshNews(); refreshMarket(); }, 600, 500); } }); // after the slide has finished, not during it

    return { state, todayKey, picked, filter, all, cells, counts, monthTitle, isThisMonth, step, held, list, shown, emptyHelp, main, more, line, busy, reload,
      WEEK, FILTERS, SHOWN, niceDay, clock, stampOf: at => stamp(new Date(at)) };
  },
};
