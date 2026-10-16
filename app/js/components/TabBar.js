// Floating capsule with Stocks | History (the pill slides, and follows your thumb while you swipe)
// plus a round + button. Tapping + opens a small menu that pops up above it: Bought, Sold, Dividend, Import CSV, Export CSV.
import { ref, watch, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { state, pagerApi, openSheet, importFile, exportCSV } from '../store.js';

// Bubbles fan out around the +, starting straight above it and sweeping round to the left (they pop out in this order)
const ITEMS = [
  { key: 'buy', label: 'Bought', icon: '<path d="M12 5v14M5 12h14"/>' },
  { key: 'sell', label: 'Sold', icon: '<path d="M5 12h14"/>' },
  { key: 'dividend', label: 'Dividend', icon: '<path d="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.6 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3"/>' },
  { key: 'import', label: 'Import', icon: '<path d="M12 15V4m-4 4 4-4 4 4M5 20h14"/>' },
  { key: 'export', label: 'Export', icon: '<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>' },
];

export default {
  name: 'TabBar',
  template: `
    <Transition name="fade"><div v-if="menu" class="menu-backdrop" @click="menu = false"></div></Transition>
    <div class="dock">
      <nav class="tabbar" role="tablist" aria-label="Pages" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
        <span class="tab-pill" :class="{ settling: state.tabAnimate }" :style="{ transform: 'translateX(' + state.tabPos * 100 + '%)' }" aria-hidden="true"></span>
        <button v-for="(t, i) in tabs" :key="t.name" type="button" class="tab" role="tab" :aria-selected="state.tab === i" @click="state.tab = i">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="t.icon"></svg>
          <span>{{ t.name }}</span>
        </button>
      </nav>
      <button type="button" class="add" :class="{ open: menu }" :aria-expanded="menu" aria-haspopup="menu"
        :aria-label="menu ? 'Close menu' : 'Add or import trades'" @click="menu = !menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>

    <div class="dial" :class="{ open: menu }" role="menu" aria-label="Add or import trades">
      <button v-for="(it, i) in items" :key="it.key" type="button" class="dial-item" :class="{ left: START + i * STEP >= 120 }" role="menuitem" :tabindex="menu ? 0 : -1" :aria-hidden="!menu"
        :style="spot(i)" @click="choose(it.key)">
        <span class="dial-circle" :class="'dial-' + it.key">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="it.icon"></svg>
        </span>
        <span class="dial-label">{{ it.label }}</span>
      </button>
    </div>
    <input ref="file" type="file" class="sr-only" accept=".csv,.txt,.xlsx,.xls,text/csv" tabindex="-1" aria-hidden="true" @change="pickFile">`,
  setup() {
    const tabs = [
      { name: 'Stocks', icon: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>' },
      { name: 'History', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    ];
    const menu = ref(false), file = ref(null);

    // Where bubble i sits: on an arc around the +. Opening pops them out one by one; closing pulls them back in, last one first.
    const RADIUS = 185, START = 90, STEP = 18; // px, degrees: 90 = straight up, bigger = further round to the left
    function spot(i) {
      const a = ((START + i * STEP) * Math.PI) / 180;
      return {
        '--dx': Math.round(Math.cos(a) * RADIUS) + 'px',
        '--dy': Math.round(-Math.sin(a) * RADIUS) + 'px',
        '--do': i * 55 + 'ms',                        // opening: one by one, nearest the top first
        '--dc': (ITEMS.length - 1 - i) * 40 + 'ms',    // closing: the last one goes back in first
      };
    }

    function choose(key) {
      if (key === 'buy' || key === 'sell' || key === 'dividend') openSheet({ action: key });
      if (key === 'import') file.value.click(); // opens the phone's file picker (allowed because you tapped)
      if (key === 'export') exportCSV();
      menu.value = false;
    }
    function pickFile(e) {
      const picked = e.target.files[0];
      e.target.value = ''; // lets you pick the same file again later
      if (picked) importFile(picked);
    }

    // Drag the pill sideways: the pill follows your finger and the pages slide along with it
    let sx = 0, from = 0, pos = 0, dragging = false, pid = null, lastX = 0, speed = 0, lastT = 0;
    function down(e) { pid = e.pointerId; sx = lastX = e.clientX; lastT = e.timeStamp; from = state.tab; pos = from; speed = 0; dragging = false; }
    function move(e) {
      if (e.pointerId !== pid) return;
      const half = e.currentTarget.clientWidth / 2;
      if (!dragging) {
        if (Math.abs(e.clientX - sx) < 8) return;
        dragging = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      }
      speed = 0.8 * ((e.clientX - lastX) / ((e.timeStamp - lastT) || 16)) + 0.2 * speed;
      lastX = e.clientX; lastT = e.timeStamp;
      pos = Math.min(Math.max(from + (e.clientX - sx) / half, 0), tabs.length - 1);
      pagerApi.drag(pos);
    }
    function up(e) {
      if (e.pointerId !== pid) return;
      pid = null;
      if (!dragging) return;
      dragging = false;
      const eat = ev => { ev.stopPropagation(); ev.preventDefault(); }; // the click that ends a drag isn't a tap
      e.currentTarget.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => e.currentTarget.removeEventListener('click', eat, { capture: true }), 80);
      pagerApi.drop(Math.abs(speed) > 0.4 ? (speed > 0 ? Math.ceil(pos) : Math.floor(pos)) : Math.round(pos));
    }

    // Esc closes the menu
    const onKey = e => { if (e.key === 'Escape') menu.value = false; };
    watch(menu, open => (open ? document.addEventListener('keydown', onKey) : document.removeEventListener('keydown', onKey)));
    onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

    return { state, tabs, items: ITEMS, menu, file, spot, START, STEP, choose, pickFile, down, move, up };
  },
};
