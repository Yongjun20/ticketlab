// Starts the app: checks the maths, mounts the screens, loads your saved trades and today's prices.
import { createApp } from './vendor/vue.esm-browser.prod.js';
import App from './components/App.js';
import { load } from './store.js';
import { runSelfChecks } from './lib/selfcheck.js';

const fails = runSelfChecks();
if (fails.length) console.error('Divtracker self-check FAILED:', fails);

createApp(App).mount('#app');
load();
