import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import { Spinner } from './components/ui.jsx';

// Every page is its own chunk: studio viewers never download admin or captain code.
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Studio = lazy(() => import('./pages/Studio.jsx'));
const Captain = lazy(() => import('./pages/Captain.jsx'));
const Portal = lazy(() => import('./pages/Portal.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));

function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="center stack">
        <div className="display" style={{ fontSize: 96 }}>404</div>
        <p className="muted">This page is offside.</p>
        <Link className="btn primary" to="/">Back home</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="auth-wrap"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<><Nav /><Landing /></>} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/captain" element={<><Nav compact /><Captain /></>} />
        <Route path="/players" element={<><Nav /><Portal /></>} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="*" element={<><Nav /><NotFound /></>} />
      </Routes>
    </Suspense>
  );
}
