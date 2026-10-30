import { defineConfig } from 'vitest/config';
import { seasonsConfigPlugin } from './build/seasons-config.ts';

export default defineConfig({
  base: '/move-or-not/',
  plugins: [seasonsConfigPlugin()],
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
    environment: 'node',
  },
});
