import { createServer as createViteServer } from 'vite';
import { createTestApp } from '../helpers/test-app.ts';
import {
  ashbyPortalHtml,
  advancedLocalAgentPortalHtml,
  basicPortalHtml,
  customWidgetPortalHtml,
  greenhousePortalHtml,
  icimsPortalHtml,
  legalSelfIdPortalHtml,
  linkedInPortalHtml,
  leverPortalHtml,
  manualRequiredPortalHtml,
  multiStepPortalHtml,
  naukriPortalHtml,
  phenomMultiStepPortalHtml,
  protectedPortalHtml,
  assessmentPortalHtml,
  localAgentRecoveryPortalHtml,
  repeatedCertificationsPortalHtml,
  repeatedEducationPortalHtml,
  repeatedExperiencePortalHtml,
  repeatedProjectsPortalHtml,
  reviewRequiredPortalHtml,
  supportedCustomWidgetPortalHtml,
  smartRecruitersPortalHtml,
  successPortalHtml,
  successFactorsPortalHtml,
  taleoPortalHtml,
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

  app.get('/__fixtures__/apply/linkedin', (_req, res) => {
    res.type('html').send(linkedInPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/naukri', (_req, res) => {
    res.type('html').send(naukriPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/ashby', (_req, res) => {
    res.type('html').send(ashbyPortalHtml('/__fixtures__/apply/success'));
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

  app.get('/__fixtures__/apply/icims', (_req, res) => {
    res.type('html').send(icimsPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/smartrecruiters', (_req, res) => {
    res.type('html').send(smartRecruitersPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/taleo', (_req, res) => {
    res.type('html').send(taleoPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/successfactors', (_req, res) => {
    res.type('html').send(successFactorsPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/review-required', (_req, res) => {
    res.type('html').send(reviewRequiredPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/protected', (_req, res) => {
    res.type('html').send(protectedPortalHtml());
  });

  app.get('/__fixtures__/apply/legal-self-id', (_req, res) => {
    res.type('html').send(legalSelfIdPortalHtml());
  });

  app.get('/__fixtures__/apply/assessment', (_req, res) => {
    res.type('html').send(assessmentPortalHtml());
  });

  app.get('/__fixtures__/apply/manual-required', (_req, res) => {
    res.type('html').send(manualRequiredPortalHtml());
  });

  app.get('/__fixtures__/apply/custom-widget', (_req, res) => {
    res.type('html').send(customWidgetPortalHtml());
  });

  app.get('/__fixtures__/apply/custom-widget-supported', (_req, res) => {
    res.type('html').send(supportedCustomWidgetPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-advanced-widgets', (_req, res) => {
    res.type('html').send(advancedLocalAgentPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-repeated-experience', (_req, res) => {
    res.type('html').send(repeatedExperiencePortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-repeated-education', (_req, res) => {
    res.type('html').send(repeatedEducationPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-repeated-projects', (_req, res) => {
    res.type('html').send(repeatedProjectsPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-repeated-certifications', (_req, res) => {
    res.type('html').send(repeatedCertificationsPortalHtml('/__fixtures__/apply/success'));
  });

  app.get('/__fixtures__/apply/local-agent-recovery', (_req, res) => {
    res.type('html').send(localAgentRecoveryPortalHtml());
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
