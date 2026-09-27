import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devApi from './dev-api.js';
import seo from './seo.js';

export default defineConfig({
  plugins: [react(), devApi(), seo()],
  build: {
    target: 'es2020',
  },
});
