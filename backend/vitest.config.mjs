import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
    pool: 'threads',
    // We run tests singleThread in vitest to avoid port conflicts with the Express server if needed,
    // though `setup.js` isolates DBs. To be safe, we'll run single threaded like `--runInBand` in Jest.
    fileParallelism: false,
    testTimeout: 120000
  },
});
