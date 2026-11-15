import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api is proxied to Django (python manage.py runserver)
// so session and CSRF cookies stay same-origin.
export default defineConfig({
  // GitHub Pages serves the site from /website/; everywhere else it is the root.
  base: process.env.PAGES_BASE || '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1', // the dev server is never reachable from other machines
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
});
