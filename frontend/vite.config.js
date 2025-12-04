import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Usamos la raíz para que los assets se resuelvan bien en Netlify
export default defineConfig({
  base: '/contabilidad-personal/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  }
});
