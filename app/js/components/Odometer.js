// Rolling-digit number, like a market ticker board. Each digit rolls to its new value;
// the number flashes green or red for a moment when it goes up or down. First show rolls up from zeros.
import { ref, computed, watch, onMounted } from '../vendor/vue.esm-browser.prod.js';

export default {
  name: 'Odometer',
  props: { value: { type: Number, default: 0 }, format: { type: Function, required: true } },
  template: `
    <span class="odo" :class="flash && 'odo-' + flash" role="text" :aria-label="text">
      <span v-for="(cell, i) in cells" :key="cells.length - i" class="odo-cell" aria-hidden="true">
        <span v-if="cell.digit" class="odo-roll"
          :style="{ transform: 'translateY(' + (-cell.n * 10) + '%)', transitionDelay: (cells.length - i) * 22 + 'ms' }">
          <span v-for="d in 10" :key="d">{{ d - 1 }}</span>
        </span>
        <span v-else>{{ cell.c }}</span>
      </span>
    </span>`,
  setup(props) {
    const text = computed(() => props.format(props.value || 0));
    const shown = ref(text.value.replace(/\d/g, '0')); // start at zeros, then roll up
    const flash = ref('');
    let ready = false, timer;

    onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => { shown.value = text.value; ready = true; })));
    watch(text, now => { if (ready) shown.value = now; });
    watch(() => props.value, (now, before) => {
      if (!ready || before == null || now === before) return;
      flash.value = now > before ? 'up' : 'down';
      clearTimeout(timer);
      timer = setTimeout(() => (flash.value = ''), 1000);
    });

    const cells = computed(() => [...shown.value].map(c => ({ c, digit: /\d/.test(c), n: +c })));
    return { text, cells, flash };
  },
};
