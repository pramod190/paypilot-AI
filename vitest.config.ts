import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  esbuild: { jsx: 'automatic' }, // lets component tests (tests/web) compile the React app
  test: {
    globals: true,
    environment: 'node', // component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // all files share one test database
    setupFiles: ['./tests/setup.ts'],
    env: {
      // Never run the (destructive) seed against the development database.
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      JWT_SECRET: 'test-only-secret',
    },
  },
});
