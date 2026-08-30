import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devApi from './dev-api.js';

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    target: 'es2020',
  },
});
