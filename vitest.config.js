import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    include: ['src/**/*.test.js'],
    setupFiles: ['src/lib/__tests__/setup.js']
  }
});
