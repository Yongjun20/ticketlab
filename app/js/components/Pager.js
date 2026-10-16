// The two pages, iPhone style: the page you're going to slides in over the top with a soft shadow,
// while the page underneath slides back only a third as far and dims (like opening a screen in an iPhone app).
// It follows your finger while you swipe, stretches at the ends, and springs into place when you let go.
// Each page remembers how far down you had scrolled.
import { ref, watch, onMounted } from '../vendor/vue.esm-browser.prod.js';
import { state, pagerApi } from '../store.js';
import { calm } from '../lib/motion.js';

const PARALLAX = 0.3; // the page underneath moves this much of the distance

export default {
  name: 'Pager',
  template: `<div class="pager"><div ref="track" class="track"><slot/></div></div>`,
  setup() {
    const track = ref(null);
    const saved = Array(8).fill(0), lift = Array(8).fill(0); // per page (room for 8): remembered scroll, and how far to lift a page so it lines up during a slide
    let current = 0, settleTimer, run = 0; // run: which slide is playing (a newer one cancels an older one)
    const pages = () => [...track.value.children];
    const last = () => pages().length - 1;

    // pos: 0 = Stocks, 1 = History, in between while swiping
    function place(pos, animate) {
      const moving = animate && !calm();
      pages().forEach((p, i) => {
        const d = i - pos; // 0 = on screen, + = off to the right, − = slid back underneath
        const x = (d >= 0 ? d : d * PARALLAX) * 100 - i * 100; // pages sit side by side, so undo each page's own offset
        p.classList.toggle('settling', moving);
        p.style.transform = `translate3d(${x}%, ${lift[i]}px, 0)`;
        p.style.zIndex = String(i + 1);                              // later pages slide over earlier ones
        p.firstElementChild.style.opacity = d < 0 ? Math.min(-d, 1) * 0.16 : 0;  // the page underneath darkens (a plain layer: no style recalculation of the page's contents)
        const shadow = d > 0 && d < 1 ? '-14px 0 30px rgba(20, 33, 61, 0.16)' : ''; // soft shadow on the edge of the page sliding over
        if (p.style.boxShadow !== shadow) p.style.boxShadow = shadow;
      });
      document.documentElement.classList.toggle('sliding', moving || pos % 1 !== 0); // CSS freezes other animations while pages move
      state.tabAnimate = moving;
      state.tabPos = Math.min(Math.max(pos, 0), last());
    }
    // Before a neighbour page slides into view, line it up with where you left it
    function wake(i) {
      const p = pages()[i];
      if (!p.classList.contains('off')) return;
      p.classList.remove('off');
      lift[i] = window.scrollY - saved[i];
    }
    function go(i) {
      const prev = current;
      saved[current] = window.scrollY;
      if (i !== current) { for (let j = Math.min(prev, i); j <= Math.max(prev, i); j++) if (j !== prev) wake(j); // the target and every page the slide passes over, so you see them go by
         if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8); } // tiny buzz on Android after you've touched the app
      current = i;
      clearTimeout(settleTimer);
      // First lay out the waking page (the slow part), THEN start the slide, so the slide itself never stalls
      pages()[i].offsetHeight;
      // Tapping a tab slides exactly like a finger drag does (frame by frame), which stays smooth on phones
      // one step takes 0.42s; each extra page adds only 0.07s, so a far jump goes past the pages in between quickly
      const from = state.tabPos, t0 = performance.now(), ms = Math.round(420 + 70 * Math.max(Math.abs(i - from) - 1, 0)), me = ++run;
      if (calm() || from === i) place(i, false);
      else {
        const step = now => {
          if (me !== run) return;
          const k = Math.min((now - t0) / ms, 1);
          place(from + (i - from) * (1 - Math.pow(1 - k, 3)), false);
          if (k < 1) requestAnimationFrame(step); else settle(); // settle only once the slide has really finished, even on a slow phone
        };
        requestAnimationFrame(step);
      }
      settleTimer = setTimeout(settle, calm() || from === i ? 0 : ms + 400); // fallback if frames are throttled
    }
    function settle() {
      run++; clearTimeout(settleTimer);
      const i = current;
      { // after the slide: hide the other page, restore this page's scroll
        pages().forEach((p, j) => p.classList.toggle('off', j !== i));
        lift.fill(0);
        place(i, false);
        window.scrollTo(0, saved[i]);
      }
    }
    watch(() => state.tab, i => go(i));

    // Dragging the tab pill moves the pages with it
    let tabDragging = false;
    pagerApi.drag = pos => {
      if (!tabDragging) {
        tabDragging = true;
        clearTimeout(settleTimer); run++;
        saved[current] = window.scrollY;
        pages().forEach((_, i) => i !== current && wake(i));
      }
      place(Math.min(Math.max(pos, 0), last()), false);
    };
    pagerApi.drop = next => {
      tabDragging = false;
      if (next === state.tab) go(next); else state.tab = next;
    };

    onMounted(() => {
      pages().forEach((p, j) => p.classList.toggle('off', j !== 0));
      place(0, false);

      // Swipe: only sideways drags with a finger; up/down scrolling stays with the browser
      let startX = 0, startY = 0, dx = 0, lastX = 0, lastT = 0, speed = 0, dragging = false, decided = false, pointer = null;
      const width = () => track.value.parentElement.clientWidth;
      const skip = t => t.closest('input, select, textarea, .fx-row, .theme-switch'); // typing, the sideways-scrolling rate chips, or sliding the day/night switch
      const el = track.value;

      el.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' || skip(e.target) || state.sheet || state.importJob) return;
        pointer = e.pointerId; startX = lastX = e.clientX; startY = e.clientY; lastT = e.timeStamp;
        dx = 0; speed = 0; dragging = false; decided = false;
      });
      el.addEventListener('pointermove', e => {
        if (e.pointerId !== pointer) return;
        const mx = e.clientX - startX, my = e.clientY - startY;
        if (!decided) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          decided = true;
          dragging = Math.abs(mx) > Math.abs(my) * 1.2; // mostly sideways = page swipe
          if (!dragging) { pointer = null; return; }
          clearTimeout(settleTimer); run++;
          saved[current] = window.scrollY;
          [current - 1, current + 1].forEach(i => pages()[i] && wake(i)); // a finger swipe can only reach the next page either way
          try { el.setPointerCapture(e.pointerId); } catch {}
        }
        dx = mx;
        const dt = e.timeStamp - lastT || 16;
        speed = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * speed;
        lastX = e.clientX; lastT = e.timeStamp;
        let pos = current - dx / width();
        if (pos < 0) pos = -Math.pow(-pos, 0.7) * 0.35;                               // stretch at the ends
        if (pos > last()) pos = last() + Math.pow(pos - last(), 0.7) * 0.35;
        place(pos, false);
      });
      const end = e => {
        if (e.pointerId !== pointer) return;
        pointer = null;
        if (!dragging) return;
        let next = current;
        if (Math.abs(dx) > width() * 0.22 || Math.abs(speed) > 0.45) next = current + (dx < 0 ? 1 : -1); // far enough, or a flick
        next = Math.min(Math.max(next, 0), last());
        if (next === state.tab) go(next); else state.tab = next;
        // the click that ends a swipe shouldn't also open a card
        const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
        el.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 80);
        dragging = false;
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });

    return { track };
  },
};
