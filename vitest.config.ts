import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core logic (state machine, tracking, selection, gaze, high-five) is
    // deliberately DOM-free and deterministic, so the fast node env is enough.
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
