import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Testy liczą czystą logikę domenową (bez natywnego środowiska Expo),
  // dlatego mają własny tsconfig w tests/ zamiast expo/tsconfig.base.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
