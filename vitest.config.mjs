// Vitest (npm test) lit les mêmes fichiers que node outils/test-run.mjs :
// les globales `test`, `assert` (node:assert/strict) et `group` y sont fournies.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.mjs'],
    setupFiles: ['test/vitest.setup.mjs'],
    testTimeout: 30000,
  },
});
