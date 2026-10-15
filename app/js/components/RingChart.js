// Ring chart + legend: how your money is split. Slices draw themselves in;
// tap a slice or a legend row to spotlight that stock (the middle shows its name and share).
import { ref, computed } from '../vendor/vue.esm-browser.prod.js';

const R = 34, C = 2 * Math.PI * R, SHOWN = 4;

export default {
  name: 'RingChart',
  props: { stocks: { type: Array, required: true } },
  template: `
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 88 88" role="img" :aria-label="label">
        <circle class="ring-track" cx="44" cy="44" r="34"/>
        <circle v-for="(a, i) in arcs" :key="a.key" class="ring-arc"
          :class="{ dim: picked && picked !== a.key, on: picked === a.key }"
          cx="44" cy="44" r="34" :stroke="a.color"
          :stroke-dasharray="a.len + ' ' + (C - a.len)" :stroke-dashoffset="-a.offset"
          :style="{ animationDelay: i * 90 + 'ms' }" transform="rotate(-90 44 44)"
          @click="pick(a.key)"/>
        <Transition name="swap" mode="out-in">
          <g :key="picked || 'all'">
            <text x="44" y="44" text-anchor="middle" class="ring-big">{{ centre[0] }}</text>
            <text x="44" y="56" text-anchor="middle" class="ring-small">{{ centre[1] }}</text>
          </g>
        </Transition>
      </svg>
      <div class="legend-wrap">
        <ul class="legend">
          <li v-for="(a, i) in arcs.slice(0, SHOWN)" :key="a.key" role="button" tabindex="0"
            :class="{ dim: picked && picked !== a.key, on: picked === a.key }" :style="{ animationDelay: 200 + i * 70 + 'ms' }"
            @click="pick(a.key)" @keydown.enter.space.prevent="pick(a.key)" :aria-pressed="picked === a.key">
            <i :style="{ background: a.color }"></i><span>{{ a.ticker }}</span><b>{{ a.share.toFixed(1) }}%</b>
          </li>
        </ul>
        <!-- The rest unfold smoothly when you tap "N more" -->
        <div v-if="extra.length" class="unfold" :class="{ open: expanded }" :inert="expanded ? null : ''">
          <ul class="legend">
            <li v-for="(a, i) in extra" :key="a.key" role="button" tabindex="0"
              :class="{ dim: picked && picked !== a.key, on: picked === a.key }" :style="{ transitionDelay: expanded ? i * 50 + 'ms' : '0ms' }"
              @click="pick(a.key)" @keydown.enter.space.prevent="pick(a.key)" :aria-pressed="picked === a.key">
              <i :style="{ background: a.color }"></i><span>{{ a.ticker }}</span><b>{{ a.share.toFixed(1) }}%</b>
            </li>
          </ul>
        </div>
        <button v-if="extra.length" type="button" class="legend-more" :aria-expanded="expanded" @click="expanded = !expanded">
          <i></i>
          <span>{{ expanded ? 'Show less' : extra.length + ' more' }}
            <svg class="chev" :class="{ up: expanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
          <b>{{ expanded ? '' : rest.toFixed(1) + '%' }}</b>
        </button>
      </div>
    </div>`,
  setup(props) {
    const picked = ref(null);
    const expanded = ref(false); // "N more" opened
    const pick = key => (picked.value = picked.value === key ? null : key);

    const arcs = computed(() => {
      const gap = props.stocks.length > 1 ? 1.6 : 0;
      let offset = 0;
      return props.stocks.map(s => {
        const full = (Math.max(s.share, 0) / 100) * C;
        const arc = { key: s.key, ticker: s.ticker, color: s.color, share: s.share, len: Math.max(full - gap, 0.5), offset };
        offset += full;
        return arc;
      });
    });
    const extra = computed(() => arcs.value.slice(SHOWN));
    const rest = computed(() => extra.value.reduce((sum, a) => sum + a.share, 0));
    const centre = computed(() => {
      const a = arcs.value.find(x => x.key === picked.value);
      return a ? [a.ticker, `${a.share.toFixed(1)}%`] : [String(arcs.value.length), arcs.value.length === 1 ? 'stock' : 'stocks'];
    });
    const label = computed(() => 'How your money is split: ' + arcs.value.map(a => `${a.ticker} ${a.share.toFixed(0)}%`).join(', '));
    return { arcs, picked, pick, expanded, extra, centre, rest, label, C, SHOWN };
  },
};
