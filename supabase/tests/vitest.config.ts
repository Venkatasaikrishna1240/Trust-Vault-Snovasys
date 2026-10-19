import { defineConfig } from 'vitest/config';

// Backend integration tests (database + HTTP). These talk to real services,
// so run them serially and give them room.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
