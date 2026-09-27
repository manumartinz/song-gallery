import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devApi from './dev-api.js';
import seo from './seo.js';

export default defineConfig({
  plugins: [react(), devApi(), seo()],
  build: {
    target: 'es2020',
    /* Dos páginas: la galería y el panel. Por separado para que nadie que venga
       a escuchar descargue el panel. */
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
