import './polyfills';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DemoApp } from './DemoApp';
import './styles.css';

/**
 * Live mode is the default. `?demo=1` (used only for the demo video)
 * switches to the clearly-labeled simulated chain — same UI, same circuits,
 * no wallet required. See web/src/hooks/useDemoMode.ts for the honesty
 * contract of that mode.
 */
const params = new URLSearchParams(window.location.search);
const DemoMode = params.get('demo') === '1';

createRoot(document.getElementById('root')!).render(DemoMode ? <DemoApp /> : <App />);
