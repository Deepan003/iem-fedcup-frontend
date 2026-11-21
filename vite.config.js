import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy, added to the built index.html only (the dev server needs inline scripts).
// Scripts: only this site's own files + the one inline preload snippet in index.html (pinned by hash —
// update the hash if that snippet changes). Images / media / API / sockets may come from any https host
// (R2, the API domain), but never plain http, plugins, or a hijacked <base>.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'sha256-HBJ9QvaT+snu4uoTyQOoWuwX3fcgUNVZ06U4ALV5ZRg='",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const csp = {
  name: 'fedcup-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// Each page is lazy-loaded (see src/App.jsx), so viewers never download admin/captain code.
export default defineConfig({
  plugins: [react(), csp],
  server: { port: 5173 },
  build: { target: 'es2020' },
});
