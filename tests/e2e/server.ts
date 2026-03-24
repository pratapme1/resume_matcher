import { createServer as createViteServer } from 'vite';
import { createTestApp } from '../helpers/test-app.ts';
import {
  basicPortalHtml,
  customWidgetPortalHtml,
  greenhousePortalHtml,
  leverPortalHtml,
  manualRequiredPortalHtml,
  multiStepPortalHtml,
  phenomMultiStepPortalHtml,
  protectedPortalHtml,
  reviewRequiredPortalHtml,
  successPortalHtml,
  workdayLoginPortalHtml,
  workdayPortalHtml,
} from './portal-fixtures.ts';

async function main() {
  const app = createTestApp();

  app.get('/__fixtures__/apply/basic', (_req, res) => {
    res.type('html').send(basicPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/multi-step', (_req, res) => {
    res.type('html').send(multiStepPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/phenom-multi-step', (_req, res) => {
    res.type('html').send(phenomMultiStepPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/greenhouse', (_req, res) => {
    res.type('html').send(greenhousePortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/lever', (_req, res) => {
    res.type('html').send(leverPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/workday', (_req, res) => {
    res.type('html').send(workdayPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/workday-login', (_req, res) => {
    res.type('html').send(workdayLoginPortalHtml());
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

  app.get('/__fixtures__/apply/custom-widget', (_req, res) => {
    res.type('html').send(customWidgetPortalHtml());
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
