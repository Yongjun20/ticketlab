// A history card you can swipe left to reveal Edit and Delete buttons behind it (like iPhone Mail).
// Swipe right or tap to close. Swiping right on a closed card is left to the page (back to Stocks).
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';

const ACTIONS = 148; // width of the two buttons behind the card, px

export default {
  name: 'SwipeRow',
  props: { open: Boolean, label: String, locked: Boolean }, // locked: no swiping (History's Select mode)
  emits: ['update:open', 'tap', 'edit', 'delete'],
  template: `
    <div class="swipe-row" :class="{ open, dragging }">
      <div class="swipe-actions" @focusin="$emit('update:open', true)">
        <button type="button" class="sa sa-edit" :tabindex="open ? 0 : -1" @click="$emit('edit')" :aria-label="'Edit: ' + label">
          <span class="sa-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>
          <span class="sa-label">Edit</span>
        </button>
        <button type="button" class="sa sa-delete" :tabindex="open ? 0 : -1" @click="$emit('delete')" :aria-label="'Delete: ' + label">
          <span class="sa-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></span>
          <span class="sa-label">Delete</span>
        </button>
      </div>
      <div class="swipe-front" role="button" tabindex="0" :aria-label="label" :aria-expanded="open"
        :style="{ transform: 'translateX(' + x + 'px)' }"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click="click"
        @keydown.enter.space.self.prevent="$emit('tap')">
        <slot/>
      </div>
    </div>`,
  setup(props, { emit }) {
    const offset = ref(0), dragging = ref(false);
    const x = computed(() => (dragging.value ? offset.value : props.open ? -ACTIONS : 0));
    let pointer = null, startX = 0, startY = 0, base = 0, decided = false, owning = false, lastX = 0, lastT = 0, speed = 0, justDragged = false;

    function down(e) {
      if (props.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointer = e.pointerId; startX = lastX = e.clientX; startY = e.clientY; lastT = e.timeStamp;
      base = props.open ? -ACTIONS : 0; decided = false; owning = false; speed = 0;
    }
    function move(e) {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        // Sideways and either opening (left) or closing an open card: this card handles it, not the page
        owning = Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || props.open);
        if (!owning) { pointer = null; return; }
        dragging.value = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      }
      e.stopPropagation(); // keep the page from swiping at the same time
      const dt = e.timeStamp - lastT || 16;
      speed = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * speed;
      lastX = e.clientX; lastT = e.timeStamp;
      let pos = base + dx;
      if (pos > 0) pos *= 0.3;                                      // stretch past closed
      if (pos < -ACTIONS) pos = -ACTIONS + (pos + ACTIONS) * 0.35;  // stretch past fully open
      offset.value = pos;
    }
    function up(e) {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (!owning) return;
      e.stopPropagation();
      const open = speed < -0.4 ? true : speed > 0.4 ? false : offset.value < -ACTIONS / 2; // flick, or past halfway
      dragging.value = false;
      justDragged = true;
      setTimeout(() => (justDragged = false), 80);
      emit('update:open', open);
    }
    function click() {
      if (justDragged) return;           // the click that ends a swipe
      if (props.open) emit('update:open', false); // tap an open card to close it
      else emit('tap');
    }

    return { x, dragging, down, move, up, click };
  },
};
