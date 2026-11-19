import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/ui.jsx';
import { DialogProvider } from './components/Dialog.jsx';
import './styles.css';

// After a new deploy, an open tab may ask for page files that no longer exist (old build).
// Reload once to pick up the new build; the 30s guard prevents a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'fedcup.reloadAt';
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 30_000) return; // already tried: let the error show
  event.preventDefault();
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
