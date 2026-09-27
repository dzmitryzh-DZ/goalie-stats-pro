import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Порт и host задаются через CLI: npm run dev -- --host 0.0.0.0 --port 7100
  server: { open: false },
});
