// Floating capsule with Stocks | History (the pill slides, and follows your thumb while you swipe)
// plus a round + button. Tapping + opens a small menu that pops up above it: Bought, Sold, Import CSV, Export CSV.
import { ref, watch, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { state, pagerApi, openSheet, importFile, exportCSV } from '../store.js';

// Nearest the + first (they pop up in this order)
const ITEMS = [
  { key: 'buy', label: 'Bought', icon: '<path d="M12 5v14M5 12h14"/>' },
  { key: 'sell', label: 'Sold', icon: '<path d="M5 12h14"/>' },
  { key: 'import', label: 'Import CSV', icon: '<path d="M12 15V4m-4 4 4-4 4 4M5 20h14"/>' },
  { key: 'export', label: 'Export CSV', icon: '<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>' },
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

    <TransitionGroup name="dial" tag="div" class="dial" role="menu" aria-label="Add or import trades">
      <button v-for="(it, i) in (menu ? items : [])" :key="it.key" type="button" class="dial-item" role="menuitem"
        :style="{ transitionDelay: i * 45 + 'ms' }" @click="choose(it.key)">
        <span class="dial-label">{{ it.label }}</span>
        <span class="dial-circle" :class="'dial-' + it.key">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="it.icon"></svg>
        </span>
      </button>
    </TransitionGroup>
    <input ref="file" type="file" class="sr-only" accept=".csv,.txt,.xlsx,.xls,text/csv" tabindex="-1" aria-hidden="true" @change="pickFile">`,
  setup() {
    const tabs = [
      { name: 'Stocks', icon: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>' },
      { name: 'History', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    ];
    const menu = ref(false), file = ref(null);

    function choose(key) {
      if (key === 'buy' || key === 'sell') openSheet({ action: key });
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

    return { state, tabs, items: ITEMS, menu, file, choose, pickFile, down, move, up };
  },
};
