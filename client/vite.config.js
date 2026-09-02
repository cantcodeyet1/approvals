import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this repo at https://cantcodeyet1.github.io/approvals/,
// so production builds need every asset path prefixed with /approvals/.
// Local dev keeps the normal root path.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/approvals/' : '/',
  server: {
    port: 5173,
  },
}));
