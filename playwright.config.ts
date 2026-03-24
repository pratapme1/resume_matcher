import { defineConfig } from '@playwright/test';

const chromeExecutablePath = process.env.PLAYWRIGHT_CHROME_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
  },
  webServer: {
    command: 'npm run build:ext && VITE_SKIP_AUTH=true tsx tests/e2e/server.ts',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SKIP_AUTH: 'true' },
  },
  projects: [
    {
      name: chromeExecutablePath ? 'chrome-path' : 'chrome',
      testIgnore: /hybrid-extension\.spec\.ts/,
      use: chromeExecutablePath
        ? {
            browserName: 'chromium',
            launchOptions: {
              executablePath: chromeExecutablePath,
            },
          }
        : {
            browserName: 'chromium',
            channel: 'chrome',
          },
    },
    {
      name: 'extension-hybrid',
      testMatch: /hybrid-extension\.spec\.ts/,
    },
  ],
});
