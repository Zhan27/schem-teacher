import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.mjs',
  timeout: 60000,
  workers: 1,
  use: {
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1600, height: 1050 },
  },
  reporter: 'list',
});
