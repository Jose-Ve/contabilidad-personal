import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ajustar "base" al nombre real del repositorio para GitHub Pages
export default defineConfig({
  base: '/contabilidad-personal/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  }
});
