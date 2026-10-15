// A panel that springs up from the bottom over a dimmed page. Close it with the Close button, Esc,
// a tap on the dimmed area, or by dragging the top bar down. Focus moves into it and back out again.
import { ref, watch, nextTick } from '../vendor/vue.esm-browser.prod.js';

export default {
  name: 'BottomSheet',
  props: { open: Boolean, title: String },
  emits: ['close'],
  template: `
    <Transition name="fade"><div v-if="open" class="backdrop" @click="$emit('close')"></div></Transition>
    <Transition name="sheet" @after-enter="focusFirst">
      <section v-if="open" ref="panel" class="sheet" role="dialog" aria-modal="true" :aria-label="title"
        :style="drag ? { transform: 'translateY(' + drag + 'px)', transition: 'none' } : null"
        @keydown.esc.prevent="$emit('close')" @keydown.tab="trapTab">
        <header class="sheet-head" @pointerdown="dragStart" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd">
          <h2>{{ title }}</h2>
          <button type="button" class="close" @click="$emit('close')">Close</button>
        </header>
        <div class="sheet-body"><slot/></div>
      </section>
    </Transition>`,
  setup(props, { emit }) {
    const panel = ref(null);
    const drag = ref(0);
    let startY = null, opener = null;

    // Lock the page behind, remember what was focused, and give focus back on close
    watch(() => props.open, open => {
      document.documentElement.classList.toggle('sheet-open', open);
      if (open) opener = document.activeElement;
      else nextTick(() => opener?.focus?.());
    }, { immediate: true });

    const focusables = () => [...(panel.value?.querySelectorAll('button, input, select, textarea, [tabindex="0"]') || [])].filter(el => !el.disabled && el.offsetParent);
    function focusFirst() {
      const first = panel.value?.querySelector('[autofocus], input, select, textarea') || focusables()[0];
      first?.focus({ preventScroll: true });
    }
    function trapTab(e) { // keep Tab inside the sheet
      const els = focusables();
      if (!els.length) return;
      const [first, last] = [els[0], els.at(-1)];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function dragStart(e) {
      if (e.target.closest('button')) return;
      startY = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    function dragMove(e) { if (startY != null) drag.value = Math.max(0, e.clientY - startY); }
    function dragEnd() {
      if (startY == null) return;
      const far = drag.value > 110;
      startY = null; drag.value = 0;
      if (far) emit('close');
    }

    return { panel, drag, focusFirst, trapTab, dragStart, dragMove, dragEnd };
  },
};
