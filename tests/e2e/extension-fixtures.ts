import path from 'node:path';
import { chromium, expect, test as base } from '@playwright/test';

type ExtensionFixtures = {
  extensionId: string;
};

const extensionPath = path.join(process.cwd(), 'extension', 'dist');

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      acceptDownloads: true,
      baseURL: 'http://127.0.0.1:3100',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
});

export { expect };
