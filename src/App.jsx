import { lazy, Suspense } from 'react';
import {
  Routes, Route, Link, useLocation,
} from 'react-router-dom';
import Nav from './components/Nav.jsx';
import { Spinner } from './components/ui.jsx';
import { Curtain, Grain } from './components/fx.jsx';

// Every page is its own chunk: studio viewers never download admin, captain or landing-page effects.
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Studio = lazy(() => import('./pages/Studio.jsx'));
const Captain = lazy(() => import('./pages/Captain.jsx'));
const Portal = lazy(() => import('./pages/Portal.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));

function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="stack" style={{ alignItems: 'flex-start' }}>
        <span className="label">Error 404</span>
        <div className="display bone-text" style={{ fontSize: 'clamp(120px, 26vw, 320px)' }}>Offside</div>
        <Link className="btn primary lg" to="/">Back to kick-off <span className="arrow">→</span></Link>
      </div>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const admin = pathname.startsWith('/admin');
  return (
    <>
      {!admin && <Grain />}
      <Curtain />
      <Suspense fallback={<div className="auth-wrap"><Spinner /></div>}>
        <div key={admin ? 'admin' : pathname} className={admin ? '' : 'page'}>
          <Routes>
            <Route path="/" element={<><Nav /><Landing /></>} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/captain" element={<><Nav compact solid /><Captain /></>} />
            <Route path="/players" element={<><Nav /><Portal /></>} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="*" element={<><Nav /><NotFound /></>} />
          </Routes>
        </div>
      </Suspense>
    </>
  );
}
