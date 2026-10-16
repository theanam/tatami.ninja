import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Toasts, TooltipLayer } from './components/ui';
import { Home } from './screens/Home';
import { Wizard } from './screens/Wizard';
import { HelpPage, AboutPage } from './screens/InfoPages';
import { NotFound } from './screens/NotFound';

const Editor = lazy(() => import('./screens/editor/Editor').then((m) => ({ default: m.Editor })));

/** Hash routing keeps deep links working on GitHub Pages (no server rewrites). */
export function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<div className="page-loading">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<Wizard />} />
          <Route path="/design/:id" element={<Editor />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <TooltipLayer />
      <Toasts />
    </HashRouter>
  );
}
