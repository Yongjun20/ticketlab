// The + menu's round bubbles, in a line above the +. Its own component on purpose: the tab bar redraws on every frame of a page slide,
// and a parent redraw rewrites every child's style. This one only redraws when the menu opens or closes.
const GAP = 62; // px between bubbles: a 48px bubble + 14px of space

export default {
  name: 'DialMenu',
  props: { open: Boolean, items: { type: Array, required: true } },
  emits: ['pick'],
  template: `
    <div class="dial" :class="{ open }" role="menu" aria-label="Add or import trades">
      <button v-for="(it, i) in items" :key="it.key" type="button" class="dial-item left" role="menuitem"
        :tabindex="open ? 0 : -1" :aria-hidden="!open" :style="spots[i]" @click="$emit('pick', it.key)">
        <span class="dial-circle" :class="'dial-' + it.key">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="it.icon"></svg>
        </span>
        <span class="dial-label">{{ it.label }}</span>
      </button>
    </div>`,
  setup(props) {
    // Where bubble i sits: in a line straight above the +, nearest first. Opening pops them out one by one; closing pulls them back in, last one first.
    const spots = props.items.map((_, i) => {
      return {
        '--dx': '0px',
        '--dy': -(i + 1) * GAP + 'px',
        '--do': i * 55 + 'ms',                              // opening: one by one, nearest the top first
        '--dc': (props.items.length - 1 - i) * 40 + 'ms',    // closing: the last one goes back in first
      };
    });
    return { spots };
  },
};
