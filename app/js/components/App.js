// The whole app: two swipeable pages, the tab bar, the trade and import sheets, and toasts.
import { state, dismissToast } from '../store.js';
import Pager from './Pager.js';
import StocksPage from './StocksPage.js';
import HistoryPage from './HistoryPage.js';
import NewsPage from './NewsPage.js';
import DividendsPage from './DividendsPage.js';
import TabBar from './TabBar.js';
import TradeSheet from './TradeSheet.js';
import ImportSheet from './ImportSheet.js';

export default {
  name: 'App',
  components: { Pager, StocksPage, HistoryPage, NewsPage, DividendsPage, TabBar, TradeSheet, ImportSheet },
  template: `
    <div v-if="state.storageError" class="empty">
      <h2>This browser is blocking storage</h2>
      <p>{{ state.storageError }}. Open the app in a normal, non-private window.</p>
    </div>
    <template v-else-if="state.ready">
      <main class="app">
        <Pager>
          <section class="page" aria-label="Your stocks"><i class="page-dim" aria-hidden="true"></i><StocksPage/></section>
          <section class="page" aria-label="History"><i class="page-dim" aria-hidden="true"></i><HistoryPage/></section>
          <section class="page" aria-label="News"><i class="page-dim" aria-hidden="true"></i><NewsPage/></section>
          <section class="page" aria-label="Dividends"><i class="page-dim" aria-hidden="true"></i><DividendsPage/></section>
        </Pager>
      </main>
      <TabBar/>
      <TradeSheet/>
      <ImportSheet/>
      <TransitionGroup name="toast" tag="div" class="toasts" role="status" aria-live="polite">
        <div v-for="t in state.toasts" :key="t.id" class="toast"><span>{{ t.msg }}</span>
          <button v-if="t.action" type="button" class="toast-act" @click="act(t)">{{ t.action.label }}</button></div>
      </TransitionGroup>
    </template>`,
  setup() {
    function act(t) { dismissToast(t.id); t.action.run(); }
    return { state, act };
  },
};
