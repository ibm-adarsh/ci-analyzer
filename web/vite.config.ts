import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: https://ibm-adarsh.github.io/ci-analyzer/
export default defineConfig({
  plugins: [react()],
  base: '/ci-analyzer/',
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
