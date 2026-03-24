import { createServer as createViteServer } from 'vite';
import { createTestApp } from '../helpers/test-app.ts';
import {
  basicPortalHtml,
  manualRequiredPortalHtml,
  multiStepPortalHtml,
  protectedPortalHtml,
  reviewRequiredPortalHtml,
  successPortalHtml,
} from './portal-fixtures.ts';

async function main() {
  const app = createTestApp();

  app.get('/__fixtures__/apply/basic', (_req, res) => {
    res.type('html').send(basicPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/multi-step', (_req, res) => {
    res.type('html').send(multiStepPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/review-required', (_req, res) => {
    res.type('html').send(reviewRequiredPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/protected', (_req, res) => {
    res.type('html').send(protectedPortalHtml());
  });

  app.get('/__fixtures__/apply/manual-required', (_req, res) => {
    res.type('html').send(manualRequiredPortalHtml());
  });

  app.get('/__fixtures__/apply/success', (_req, res) => {
    res.type('html').send(successPortalHtml());
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.listen(3100, '127.0.0.1', () => {
    console.log('Test server running on http://127.0.0.1:3100');
  });
}

main();
