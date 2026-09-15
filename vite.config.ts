import { defineConfig } from 'vite';

// base: './' keeps asset URLs relative so the built site works when served
// from any sub-path (e.g. GitHub Pages project page) or a plain static server.
export default defineConfig({
  base: './',
  server: {
    // getUserMedia + MediaPipe require a secure context. localhost counts as
    // secure, so `npm run dev` works without HTTPS. Deploy needs real HTTPS.
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
