// The whole app: two swipeable pages, the tab bar, the trade and import sheets, and toasts.
import { state } from '../store.js';
import Pager from './Pager.js';
import StocksPage from './StocksPage.js';
import HistoryPage from './HistoryPage.js';
import TabBar from './TabBar.js';
import TradeSheet from './TradeSheet.js';
import ImportSheet from './ImportSheet.js';

export default {
  name: 'App',
  components: { Pager, StocksPage, HistoryPage, TabBar, TradeSheet, ImportSheet },
  template: `
    <div v-if="state.storageError" class="empty">
      <h2>This browser is blocking storage</h2>
      <p>{{ state.storageError }}. Open the app in a normal, non-private window.</p>
    </div>
    <template v-else-if="state.ready">
      <main class="app">
        <Pager>
          <section class="page" aria-label="Your stocks"><StocksPage/></section>
          <section class="page" aria-label="History"><HistoryPage/></section>
        </Pager>
      </main>
      <TabBar/>
      <TradeSheet/>
      <ImportSheet/>
      <TransitionGroup name="toast" tag="div" class="toasts" role="status" aria-live="polite">
        <div v-for="t in state.toasts" :key="t.id" class="toast">{{ t.msg }}</div>
      </TransitionGroup>
    </template>`,
  setup() {
    return { state };
  },
};
