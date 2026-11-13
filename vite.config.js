import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Each page is lazy-loaded (see src/App.jsx), so viewers never download admin/captain code.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { target: 'es2020' },
});
