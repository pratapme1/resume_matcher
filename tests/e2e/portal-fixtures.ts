function pageShell(title: string, body: string, script = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f5f7fb; color: #111827; margin: 0; padding: 32px; }
      main { max-width: 780px; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { color: #4b5563; line-height: 1.5; }
      .field { margin: 16px 0; display: flex; flex-direction: column; gap: 6px; }
      label { font-weight: 600; }
      input, textarea, select, button { font: inherit; }
      input, textarea, select { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; }
      button { margin-top: 20px; padding: 12px 16px; background: #111827; color: white; border: 0; border-radius: 10px; cursor: pointer; }
      .muted { font-size: 14px; color: #6b7280; }
      .step { display: none; }
      .step.active { display: block; }
      .banner { padding: 12px 14px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; margin: 12px 0 20px; }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
    ${script ? `<script>${script}</script>` : ''}
  </body>
</html>`;
}

function jobIntro(title: string) {
  return `
    <div class="banner">
      ${title}
      <div class="muted">Required skills: React, TypeScript, testing, collaboration.</div>
    </div>
  `;
}

export function basicPortalHtml(successUrl: string) {
  return pageShell(
    'Senior Frontend Engineer Application',
    `
      <h1>Senior Frontend Engineer</h1>
      <p>Apply for this role. This fixture mimics a standard single-step application page.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="full_name" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><p>Resume</p><label for="resume">Click to upload your resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function multiStepPortalHtml(successUrl: string) {
  return pageShell(
    'Senior Frontend Engineer Multi-step Application',
    `
      <h1>Senior Frontend Engineer</h1>
      <p>Apply for this role. This fixture mimics a two-step application experience.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer.')}
      <form id="multi-step-form" action="${successUrl}" method="get">
        <section id="step-1" class="step active">
          <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="full_name" type="text" required /></div>
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
          <button type="button" id="continue-btn">Continue</button>
        </section>
        <section id="step-2" class="step">
          <div class="field"><label for="location">Location</label><input id="location" name="location" type="text" required /></div>
          <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
          <div class="field"><p>Resume</p><label for="resume">Click to upload your resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
          <button type="submit">Submit Application</button>
        </section>
      </form>
    `,
    `
      document.getElementById('continue-btn')?.addEventListener('click', () => {
        document.getElementById('step-1')?.classList.remove('active');
        document.getElementById('step-2')?.classList.add('active');
      });
    `,
  );
}

export function phenomMultiStepPortalHtml(successUrl: string) {
  return pageShell(
    'Phenom Work and Education Application',
    `
      <div id="_PCM" data-ph-id="fixture-phenom-root"></div>
      <h1>Apply to Acme via Phenom</h1>
      <p>This fixture mimics a longer hosted apply flow with multiple continue steps.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer through a multi-step hosted portal.')}
      <form id="phenom-form" action="${successUrl}" method="get">
        <section id="step-1" class="step active" data-step-name="profile">
          <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="full_name" type="text" required /></div>
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
          <button type="button" id="continue-1">Save and Continue</button>
        </section>
        <section id="step-2" class="step" data-step-name="work-history">
          <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
          <div class="field"><label for="location">Current Location</label><input id="location" name="location" type="text" required /></div>
          <button type="button" id="continue-2">Save and Continue</button>
        </section>
        <section id="step-3" class="step" data-step-name="work-experience">
          <div class="field"><label for="experience">Total Experience (Years)</label><input id="experience" name="experienceYears" type="number" required /></div>
          <div class="field"><label for="current_company">Current Company</label><input id="current_company" name="currentCompany" type="text" required /></div>
          <button type="button" id="continue-3">Continue Application</button>
        </section>
        <section id="step-4" class="step" data-step-name="questionnaire">
          <div class="field"><label for="current_title">Current Title</label><input id="current_title" name="currentTitle" type="text" required /></div>
          <div class="field"><label for="linkedin">LinkedIn Profile</label><input id="linkedin" name="linkedin" type="url" /></div>
          <button type="button" id="continue-4">Save and Continue</button>
        </section>
        <section id="step-5" class="step" data-step-name="review-submit">
          <div class="field"><p>Resume</p><label for="resume">Upload your resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
          <button type="submit">Submit Application</button>
        </section>
      </form>
    `,
    `
      for (const index of [1, 2, 3, 4]) {
        document.getElementById('continue-' + index)?.addEventListener('click', () => {
          document.getElementById('step-' + index)?.classList.remove('active');
          document.getElementById('step-' + (index + 1))?.classList.add('active');
          history.replaceState({}, '', '?step=' + (index + 1) + '&stepname=fixture-step-' + (index + 1));
        });
      }
    `,
  );
}

export function reviewRequiredPortalHtml(successUrl: string) {
  return pageShell(
    'Senior Frontend Engineer Review Required Application',
    `
      <h1>Senior Frontend Engineer</h1>
      <p>This fixture contains one required field the planner should not auto-fill.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="full_name" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="work_auth">Work Authorization Status</label><input id="work_auth" name="work_auth" type="text" required /></div>
        <div class="field"><p>Resume</p><label for="resume">Click to upload your resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function customWidgetPortalHtml() {
  return pageShell(
    'Custom Widget Application Portal',
    `
      <h1>Custom Widget Application Portal</h1>
      <p>This fixture contains a required custom widget that the executor should surface for review.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer.')}
      <div class="field">
        <label for="full_name">Full Name</label>
        <input id="full_name" name="full_name" type="text" required />
      </div>
      <div class="field">
        <label aria-label="Preferred Work Authorization*">Preferred Work Authorization*</label>
        <div id="custom-work-auth" role="combobox" aria-label="Preferred Work Authorization*" aria-required="true" tabindex="0">Select an option</div>
      </div>
      <button type="button">Continue</button>
    `,
  );
}

export function protectedPortalHtml() {
  return pageShell(
    'Just a moment...',
    `
      <h1>Checking your browser before accessing Acme Careers</h1>
      <p>This fixture simulates bot protection.</p>
      <div class="cf-browser-verification">Verification in progress…</div>
    `,
  );
}

export function manualRequiredPortalHtml() {
  return pageShell(
    'Unsupported Custom Portal',
    `
      <h1>Custom Application Portal</h1>
      <p>This fixture contains no standard form fields, so the executor should stop cleanly.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer.')}
      <div id="custom-widget" contenteditable="true" aria-label="Custom widget">
        This editable region is not a supported application field.
      </div>
      <button type="button">Continue</button>
    `,
  );
}

export function successPortalHtml() {
  return pageShell(
    'Application Received',
    `
      <h1>Application Received</h1>
      <p>Your application was submitted successfully.</p>
    `,
  );
}
