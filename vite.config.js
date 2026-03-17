import { defineConfig } from 'vite';

export default defineConfig({
  // Serve from the project root
  root: '.',

  base: '/Raid-Night/',

  // Where Vite looks for the entry index.html
  publicDir: 'public',

  server: {
    port: 8080,
    open: true,   // auto-open browser on npm run dev
  },

  build: {
    // Output folder for npm run build
    outDir: 'dist',
    // Produce a single bundled JS file (good for Capacitor later)
    rollupOptions: {
      input: 'index.html',
    },
  },
});
