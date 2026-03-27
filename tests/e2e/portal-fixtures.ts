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

export function linkedInPortalHtml(successUrl: string) {
  return pageShell(
    'LinkedIn Easy Apply',
    `
      <div data-easy-apply-modal class="jobs-easy-apply-content">
        <div class="jobs-apply-form">
          <h1>Easy Apply to Acme on LinkedIn</h1>
          <p>This fixture mimics a LinkedIn Easy Apply flow with hosted profile fields.</p>
          ${jobIntro('Acme is hiring through LinkedIn Easy Apply.')}
          <form action="${successUrl}" method="get">
            <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
            <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
            <div class="field"><label for="email">Email Address</label><input id="email" name="emailAddress" type="email" required /></div>
            <div class="field"><label for="phone">Mobile phone number</label><input id="phone" name="phoneNumber" type="tel" required /></div>
            <div class="field"><label for="city">City</label><input id="city" name="city" type="text" required /></div>
            <div class="field"><label for="linkedin">LinkedIn Profile</label><input id="linkedin" name="linkedinProfile" type="url" /></div>
            <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
            <button type="submit">Submit Application</button>
          </form>
        </div>
      </div>
    `,
  );
}

export function naukriPortalHtml(successUrl: string) {
  return pageShell(
    'Naukri Apply Form',
    `
      <div id="root">
        <div class="apply-card" data-testid="naukri-apply-form">
          <h1>Apply to Acme on Naukri</h1>
          <p>This fixture mimics a Naukri hosted apply form.</p>
          ${jobIntro('Acme is hiring through Naukri.')}
          <form action="${successUrl}" method="get">
            <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="fullName" type="text" required /></div>
            <div class="field"><label for="email">Email Address</label><input id="email" name="emailAddress" type="email" required /></div>
            <div class="field"><label for="phone">Mobile Number</label><input id="phone" name="mobileNumber" type="tel" required /></div>
            <div class="field"><label for="location">Current Location</label><input id="location" name="currentLocation" type="text" required /></div>
            <div class="field"><label for="experience">Total Experience (Years)</label><input id="experience" name="totalExperience" type="number" required /></div>
            <div class="field"><label for="linkedin">LinkedIn Profile</label><input id="linkedin" name="linkedinProfile" type="url" /></div>
            <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
            <button class="apply-button" type="submit">Apply Now</button>
          </form>
        </div>
      </div>
    `,
  );
}

export function ashbyPortalHtml(successUrl: string) {
  return pageShell(
    'Ashby Application',
    `
      <div data-portal="ashby" data-ashby-job-board="acme"></div>
      <h1>Apply to Acme on Ashby</h1>
      <p>This fixture mimics a hosted Ashby application page.</p>
      ${jobIntro('Acme is hiring via Ashby.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><label for="location">Location</label><input id="location" name="location" type="text" required /></div>
        <div class="field"><label for="linkedin">LinkedIn</label><input id="linkedin" name="linkedinUrl" type="url" /></div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function icimsPortalHtml(successUrl: string) {
  return pageShell(
    'iCIMS Job Application',
    `
      <div class="iCIMS_JobApplication" data-portal="icims"></div>
      <h1>Apply to Acme on iCIMS</h1>
      <p>This fixture mimics a hosted iCIMS application page.</p>
      ${jobIntro('Acme is hiring via iCIMS.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
        <div class="field"><label for="email">Email Address</label><input id="email" name="emailAddress" type="email" required /></div>
        <div class="field"><label for="phone">Phone Number</label><input id="phone" name="phoneNumber" type="tel" required /></div>
        <div class="field"><label for="current_company">Current Employer</label><input id="current_company" name="currentEmployer" type="text" required /></div>
        <div class="field"><label for="resume">Upload Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function smartRecruitersPortalHtml(successUrl: string) {
  return pageShell(
    'SmartRecruiters Application',
    `
      <div class="st-job-application" data-portal="smartrecruiters"></div>
      <h1>Apply to Acme on SmartRecruiters</h1>
      <p>This fixture mimics a hosted SmartRecruiters application page.</p>
      ${jobIntro('Acme is hiring via SmartRecruiters.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><label for="portfolio">Portfolio</label><input id="portfolio" name="portfolioLink" type="url" /></div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function taleoPortalHtml(successUrl: string) {
  return pageShell(
    'Taleo Application',
    `
      <div id="applyFlow" data-portal="taleo"></div>
      <h1>Apply to Acme on Taleo</h1>
      <p>This fixture mimics a hosted Taleo application page.</p>
      ${jobIntro('Acme is hiring via Taleo.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><label for="current_title">Current Job Title</label><input id="current_title" name="currentTitle" type="text" required /></div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function successFactorsPortalHtml(successUrl: string) {
  return pageShell(
    'SuccessFactors Application',
    `
      <div id="careerSiteApp" data-portal="successfactors"></div>
      <h1>Apply to Acme on SuccessFactors</h1>
      <p>This fixture mimics a hosted SuccessFactors application page.</p>
      ${jobIntro('Acme is hiring via SuccessFactors.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="firstName" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="lastName" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Mobile</label><input id="phone" name="mobileNumber" type="tel" required /></div>
        <div class="field"><label for="current_company">Current Company</label><input id="current_company" name="currentEmployer" type="text" required /></div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function greenhousePortalHtml(successUrl: string) {
  return pageShell(
    'Greenhouse Application',
    `
      <meta property="og:site_name" content="Greenhouse" />
      <div id="application_form" data-board="greenhouse"></div>
      <h1>Apply to Acme on Greenhouse</h1>
      <p>This fixture mimics a hosted Greenhouse application page.</p>
      ${jobIntro('Acme is hiring via Greenhouse.')}
      <form action="${successUrl}" method="get">
        <div class="field"><label for="first_name">First Name</label><input id="first_name" name="first_name" type="text" required /></div>
        <div class="field"><label for="last_name">Last Name</label><input id="last_name" name="last_name" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><label for="location">Location</label><input id="location" name="location" type="text" required /></div>
        <div class="field"><label for="current_company">Current Company</label><input id="current_company" name="current_company" type="text" required /></div>
        <div class="field"><label for="resume">Resume/CV<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function leverPortalHtml(successUrl: string) {
  return pageShell(
    'Lever Application',
    `
      <main data-qa="application-page"></main>
      <h1>Apply to Acme on Lever</h1>
      <p>This fixture mimics a hosted Lever application page.</p>
      ${jobIntro('Acme is hiring via Lever.')}
      <form data-qa="application-form" action="${successUrl}" method="get">
        <div class="field"><label for="name">Full Name</label><input id="name" name="name" type="text" required /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" required /></div>
        <div class="field"><label for="company">Current Company</label><input id="company" name="org" type="text" required /></div>
        <div class="field"><label for="linkedin">LinkedIn</label><input id="linkedin" name="urls[LinkedIn]" type="url" /></div>
        <div class="field"><label for="experience">Years of Experience</label><input id="experience" name="experienceYears" type="number" required /></div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
  );
}

export function workdayPortalHtml(successUrl: string) {
  return pageShell(
    'Workday Application',
    `
      <div data-automation-id="applyFlow"></div>
      <h1>Apply to Acme on Workday</h1>
      <p>This fixture mimics an already-open Workday application flow.</p>
      ${jobIntro('Acme is hiring via Workday.')}
      <form id="workday-form" action="${successUrl}" method="get">
        <section id="workday-step-1" class="step active" data-automation-id="step-profile" data-step-name="profile">
          <div class="field"><label for="legal_first_name">First Name</label><input id="legal_first_name" name="legalFirstName" type="text" required /></div>
          <div class="field"><label for="legal_last_name">Last Name</label><input id="legal_last_name" name="legalLastName" type="text" required /></div>
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
          <button type="button" id="workday-next-1">Next</button>
        </section>
        <section id="workday-step-2" class="step" data-automation-id="step-work-history" data-step-name="work-history">
          <div class="field"><label for="phone">Phone Number</label><input id="phone" name="phoneNumber" type="tel" required /></div>
          <div class="field"><label for="location">Current Location</label><input id="location" name="location" type="text" required /></div>
          <div class="field"><label for="current_title">Current Job Title</label><input id="current_title" name="currentTitle" type="text" required /></div>
          <button type="button" id="workday-next-2">Save and Continue</button>
        </section>
        <section id="workday-step-3" class="step" data-automation-id="step-questionnaire" data-step-name="questionnaire">
          <div class="field"><label for="current_company">Current Company</label><input id="current_company" name="currentCompany" type="text" required /></div>
          <div class="field"><label for="experience">Total Experience (Years)</label><input id="experience" name="yearsExperience" type="number" required /></div>
          <div class="field"><label for="resume">Upload Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
          <button type="submit">Submit Application</button>
        </section>
      </form>
    `,
    `
      document.getElementById('workday-next-1')?.addEventListener('click', () => {
        document.getElementById('workday-step-1')?.classList.remove('active');
        document.getElementById('workday-step-2')?.classList.add('active');
        history.replaceState({}, '', '?step=2');
      });
      document.getElementById('workday-next-2')?.addEventListener('click', () => {
        document.getElementById('workday-step-2')?.classList.remove('active');
        document.getElementById('workday-step-3')?.classList.add('active');
        history.replaceState({}, '', '?step=3');
      });
    `,
  );
}

export function workdayLoginPortalHtml() {
  return pageShell(
    'Workday Sign In',
    `
      <div data-automation-id="applyFlow"></div>
      <h1>Sign In</h1>
      <p>Use my existing account to continue this Workday application.</p>
      <div class="field"><label for="username">Email</label><input id="username" type="email" /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" /></div>
      <button type="button">Sign In</button>
      <button type="button">Create Account</button>
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

export function supportedCustomWidgetPortalHtml(successUrl: string) {
  return pageShell(
    'Supported Custom Widget Application Portal',
    `
      <h1>Custom Widget Application Portal</h1>
      <p>This fixture mimics supported custom widgets for the local agent runtime.</p>
      ${jobIntro('Acme is hiring a Senior Frontend Engineer through a custom-widget application form.')}
      <form action="${successUrl}" method="get">
        <div class="field">
          <label id="experience-label">Total Experience (Years)</label>
          <div
            id="experience"
            role="spinbutton"
            aria-labelledby="experience-label"
            aria-required="true"
            aria-valuetext=""
            data-value=""
            contenteditable="true"
            style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; min-height: 24px;"
          ></div>
        </div>
        <div class="field">
          <label id="workauth-label">Work Authorization</label>
          <div style="position: relative;">
            <div
              id="work_auth"
              role="combobox"
              aria-labelledby="workauth-label"
              aria-expanded="false"
              aria-required="true"
              aria-valuetext=""
              data-value=""
              contenteditable="true"
              style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; min-height: 24px;"
            ></div>
            <ul
              id="work_auth_options"
              role="listbox"
              hidden
              style="position: absolute; left: 0; right: 0; margin: 8px 0 0; padding: 8px; background: white; border: 1px solid #d1d5db; border-radius: 10px; list-style: none;"
            >
              <li role="option" data-value="Authorized to work in India" style="padding: 8px 10px; cursor: pointer;">Authorized to work in India</li>
              <li role="option" data-value="Require sponsorship" style="padding: 8px 10px; cursor: pointer;">Require sponsorship</li>
            </ul>
          </div>
        </div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const syncEditableValue = (element) => {
        const value = (element.textContent || '').trim();
        element.setAttribute('data-value', value);
        element.setAttribute('aria-valuetext', value);
      };

      const experience = document.getElementById('experience');
      experience?.addEventListener('input', () => syncEditableValue(experience));
      experience?.addEventListener('blur', () => syncEditableValue(experience));

      const combo = document.getElementById('work_auth');
      const list = document.getElementById('work_auth_options');
      const open = () => {
        combo?.setAttribute('aria-expanded', 'true');
        if (list) list.hidden = false;
      };
      const close = () => {
        combo?.setAttribute('aria-expanded', 'false');
        if (list) list.hidden = true;
      };
      const choose = (value) => {
        if (!combo) return;
        combo.textContent = value;
        combo.setAttribute('data-value', value);
        combo.setAttribute('aria-valuetext', value);
        close();
      };

      const matchOption = (typedValue) => {
        const normalized = (typedValue || '').trim().toLowerCase();
        if (!normalized || !list) return null;
        const options = Array.from(list.querySelectorAll('[role="option"]'));
        const match = options.find((option) => {
          const candidate = (option.getAttribute('data-value') || option.textContent || '').trim().toLowerCase();
          return candidate.startsWith(normalized);
        });
        return match ? (match.getAttribute('data-value') || match.textContent || '').trim() : null;
      };

      combo?.addEventListener('focus', open);
      combo?.addEventListener('click', open);
      combo?.addEventListener('input', () => {
        open();
        const matched = matchOption(combo.textContent || '');
        if (matched) {
          combo.setAttribute('data-value', matched);
          combo.setAttribute('aria-valuetext', matched);
        }
      });
      combo?.addEventListener('blur', () => {
        setTimeout(() => {
          if (!list?.matches(':hover')) close();
        }, 100);
      });

      list?.querySelectorAll('[role="option"]').forEach((option) => {
        option.addEventListener('click', () => choose(option.getAttribute('data-value') || option.textContent || ''));
      });
    `,
  );
}

export function advancedLocalAgentPortalHtml(successUrl: string) {
  return pageShell(
    'Advanced Local Agent Widgets',
    `
      <h1>Advanced Widget Application Portal</h1>
      <p>This fixture mimics harder async, multi-select, and card-group widgets for the local agent runtime.</p>
      ${jobIntro('Acme is hiring through a widget-heavy application form.')}
      <form action="${successUrl}" method="get">
        <div class="field">
          <label id="location-label">Preferred Location</label>
          <div style="position: relative;">
            <div
              id="preferred_location"
              role="combobox"
              aria-labelledby="location-label"
              aria-expanded="false"
              aria-required="true"
              aria-valuetext=""
              data-value=""
              contenteditable="true"
              style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; min-height: 24px;"
            ></div>
            <ul
              id="preferred_location_options"
              role="listbox"
              hidden
              style="position: absolute; left: 0; right: 0; margin: 8px 0 0; padding: 8px; background: white; border: 1px solid #d1d5db; border-radius: 10px; list-style: none;"
            ></ul>
          </div>
        </div>
        <div class="field">
          <label id="skills-label">Primary Skills</label>
          <div
            id="primary_skills"
            class="p-multiselect"
            aria-labelledby="skills-label"
            aria-required="true"
            aria-valuetext=""
            data-value=""
            tabindex="0"
            style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; min-height: 24px;"
          >
            Select skills
          </div>
          <ul
            id="primary_skills_options"
            role="listbox"
            aria-multiselectable="true"
            hidden
            style="margin: 8px 0 0; padding: 8px; background: white; border: 1px solid #d1d5db; border-radius: 10px; list-style: none;"
          >
            <li role="option" class="p-multiselect-item" data-value="React" style="padding: 8px 10px; cursor: pointer;">React</li>
            <li role="option" class="p-multiselect-item" data-value="TypeScript" style="padding: 8px 10px; cursor: pointer;">TypeScript</li>
            <li role="option" class="p-multiselect-item" data-value="Playwright" style="padding: 8px 10px; cursor: pointer;">Playwright</li>
          </ul>
        </div>
        <div class="field">
          <label id="relocation-label">Are you open to relocation?</label>
          <div
            id="relocation_preference"
            role="radiogroup"
            data-card-group="true"
            aria-labelledby="relocation-label"
            aria-required="true"
            data-value=""
            style="display: flex; gap: 12px;"
          >
            <button type="button" role="radio" data-card-value="Yes" aria-checked="false" style="padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 10px; background: white; color: #111827;">Yes</button>
            <button type="button" role="radio" data-card-value="No" aria-checked="false" style="padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 10px; background: white; color: #111827;">No</button>
          </div>
        </div>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const locationInput = document.getElementById('preferred_location');
      const locationList = document.getElementById('preferred_location_options');
      const locationOptions = ['Bengaluru, India', 'Pune, India', 'Remote - India'];

      const renderLocationOptions = (query) => {
        if (!locationList) return;
        const normalized = (query || '').trim().toLowerCase();
        const matches = locationOptions.filter((option) => option.toLowerCase().includes(normalized));
        locationList.innerHTML = matches.map((option) => \`<li role="option" data-value="\${option}" style="padding: 8px 10px; cursor: pointer;">\${option}</li>\`).join('');
        locationList.hidden = matches.length === 0;
        locationList.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener('click', () => {
            if (!locationInput) return;
            const value = option.getAttribute('data-value') || option.textContent || '';
            locationInput.textContent = value;
            locationInput.setAttribute('data-value', value);
            locationInput.setAttribute('aria-valuetext', value);
            locationInput.setAttribute('aria-expanded', 'false');
            locationList.hidden = true;
          });
        });
      };

      locationInput?.addEventListener('click', () => {
        locationInput.setAttribute('aria-expanded', 'true');
        renderLocationOptions(locationInput.textContent || '');
      });
      locationInput?.addEventListener('input', () => {
        locationInput.setAttribute('aria-expanded', 'true');
        setTimeout(() => renderLocationOptions(locationInput.textContent || ''), 120);
      });
      locationInput?.addEventListener('blur', () => {
        setTimeout(() => {
          locationInput.setAttribute('aria-expanded', 'false');
          if (locationList) locationList.hidden = true;
        }, 120);
      });

      const skillsInput = document.getElementById('primary_skills');
      const skillsList = document.getElementById('primary_skills_options');
      const selectedSkills = new Set();
      const syncSkills = () => {
        const value = Array.from(selectedSkills).join(', ');
        if (!skillsInput) return;
        skillsInput.textContent = value || 'Select skills';
        skillsInput.setAttribute('data-value', value);
        skillsInput.setAttribute('aria-valuetext', value);
      };
      skillsInput?.addEventListener('click', () => {
        if (skillsList) skillsList.hidden = !skillsList.hidden;
      });
      skillsList?.querySelectorAll('[role="option"]').forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.getAttribute('data-value') || option.textContent || '';
          if (selectedSkills.has(value)) {
            selectedSkills.delete(value);
          } else {
            selectedSkills.add(value);
          }
          option.setAttribute('aria-selected', selectedSkills.has(value) ? 'true' : 'false');
          syncSkills();
        });
      });

      const relocation = document.getElementById('relocation_preference');
      const syncRelocation = (value) => {
        if (!relocation) return;
        relocation.setAttribute('data-value', value);
        relocation.querySelectorAll('[role="radio"]').forEach((button) => {
          const selected = (button.getAttribute('data-card-value') || button.textContent || '').trim() === value;
          button.setAttribute('aria-checked', selected ? 'true' : 'false');
          button.setAttribute('data-selected', selected ? 'true' : 'false');
        });
      };
      relocation?.querySelectorAll('[role="radio"]').forEach((button) => {
        button.addEventListener('click', () => {
          syncRelocation(button.getAttribute('data-card-value') || button.textContent || '');
        });
      });
    `,
  );
}

export function repeatedExperiencePortalHtml(successUrl: string) {
  return pageShell(
    'Repeated Work Experience Application',
    `
      <h1>Work Experience</h1>
      <p>This fixture mimics a repeated work-history form that requires adding more than one experience row.</p>
      ${jobIntro('Acme is hiring through a work-history-heavy application form.')}
      <form action="${successUrl}" method="get">
        <div id="experience-rows">
          <section class="experience-row" data-index="0">
            <h2 class="muted">Experience 1</h2>
            <div class="field"><label for="experience_0_company">Company</label><input id="experience_0_company" name="experience[0].company" type="text" required /></div>
            <div class="field"><label for="experience_0_title">Job Title</label><input id="experience_0_title" name="experience[0].title" type="text" required /></div>
            <div class="field"><label for="experience_0_dates">Employment Dates</label><input id="experience_0_dates" name="experience[0].dates" type="text" required /></div>
            <div class="field"><label for="experience_0_location">Location</label><input id="experience_0_location" name="experience[0].location" type="text" required /></div>
          </section>
        </div>
        <button type="button" id="add-experience">Add Experience</button>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const rows = document.getElementById('experience-rows');
      const addButton = document.getElementById('add-experience');

      const buildRow = (index) => {
        const section = document.createElement('section');
        section.className = 'experience-row';
        section.dataset.index = String(index);
        section.innerHTML = \`
          <h2 class="muted">Experience \${index + 1}</h2>
          <div class="field"><label for="experience_\${index}_company">Company</label><input id="experience_\${index}_company" name="experience[\${index}].company" type="text" required /></div>
          <div class="field"><label for="experience_\${index}_title">Job Title</label><input id="experience_\${index}_title" name="experience[\${index}].title" type="text" required /></div>
          <div class="field"><label for="experience_\${index}_dates">Employment Dates</label><input id="experience_\${index}_dates" name="experience[\${index}].dates" type="text" required /></div>
          <div class="field"><label for="experience_\${index}_location">Location</label><input id="experience_\${index}_location" name="experience[\${index}].location" type="text" required /></div>
        \`;
        return section;
      };

      addButton?.addEventListener('click', () => {
        if (!rows) return;
        const currentRows = rows.querySelectorAll('.experience-row').length;
        if (currentRows >= 4) return;
        rows.appendChild(buildRow(currentRows));
      });
    `,
  );
}

export function repeatedEducationPortalHtml(successUrl: string) {
  return pageShell(
    'Repeated Education Application',
    `
      <h1>Education History</h1>
      <p>This fixture mimics a repeated education form that requires adding more than one education row.</p>
      ${jobIntro('Acme requires complete education history before submission.')}
      <form action="${successUrl}" method="get">
        <div id="education-rows">
          <section class="education-row" data-index="0">
            <h2 class="muted">Education 1</h2>
            <div class="field"><label for="education_0_institution">Institution</label><input id="education_0_institution" name="education[0].institution" type="text" required /></div>
            <div class="field"><label for="education_0_degree">Degree</label><input id="education_0_degree" name="education[0].degree" type="text" required /></div>
            <div class="field"><label for="education_0_dates">Dates</label><input id="education_0_dates" name="education[0].dates" type="text" required /></div>
            <div class="field"><label for="education_0_location">Location</label><input id="education_0_location" name="education[0].location" type="text" required /></div>
          </section>
        </div>
        <button type="button" id="add-education">Add Education</button>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const rows = document.getElementById('education-rows');
      const addButton = document.getElementById('add-education');

      const buildRow = (index) => {
        const section = document.createElement('section');
        section.className = 'education-row';
        section.dataset.index = String(index);
        section.innerHTML = \`
          <h2 class="muted">Education \${index + 1}</h2>
          <div class="field"><label for="education_\${index}_institution">Institution</label><input id="education_\${index}_institution" name="education[\${index}].institution" type="text" required /></div>
          <div class="field"><label for="education_\${index}_degree">Degree</label><input id="education_\${index}_degree" name="education[\${index}].degree" type="text" required /></div>
          <div class="field"><label for="education_\${index}_dates">Dates</label><input id="education_\${index}_dates" name="education[\${index}].dates" type="text" required /></div>
          <div class="field"><label for="education_\${index}_location">Location</label><input id="education_\${index}_location" name="education[\${index}].location" type="text" required /></div>
        \`;
        return section;
      };

      addButton?.addEventListener('click', () => {
        if (!rows) return;
        const currentRows = rows.querySelectorAll('.education-row').length;
        if (currentRows >= 4) return;
        rows.appendChild(buildRow(currentRows));
      });
    `,
  );
}

export function repeatedProjectsPortalHtml(successUrl: string) {
  return pageShell(
    'Repeated Projects Application',
    `
      <h1>Projects Portfolio</h1>
      <p>This fixture mimics a repeated project portfolio form that requires adding more than one project row.</p>
      ${jobIntro('Acme requires multiple shipped projects before submission.')}
      <form action="${successUrl}" method="get">
        <div id="project-rows">
          <section class="project-row" data-index="0">
            <h2 class="muted">Project 1</h2>
            <div class="field"><label for="project_0_name">Project Name</label><input id="project_0_name" name="projects[0].name" type="text" required /></div>
            <div class="field"><label for="project_0_description">Project Description</label><textarea id="project_0_description" name="projects[0].description" required></textarea></div>
          </section>
        </div>
        <button type="button" id="add-project">Add Project</button>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const rows = document.getElementById('project-rows');
      const addButton = document.getElementById('add-project');

      const buildRow = (index) => {
        const section = document.createElement('section');
        section.className = 'project-row';
        section.dataset.index = String(index);
        section.innerHTML = \`
          <h2 class="muted">Project \${index + 1}</h2>
          <div class="field"><label for="project_\${index}_name">Project Name</label><input id="project_\${index}_name" name="projects[\${index}].name" type="text" required /></div>
          <div class="field"><label for="project_\${index}_description">Project Description</label><textarea id="project_\${index}_description" name="projects[\${index}].description" required></textarea></div>
        \`;
        return section;
      };

      addButton?.addEventListener('click', () => {
        if (!rows) return;
        const currentRows = rows.querySelectorAll('.project-row').length;
        if (currentRows >= 4) return;
        rows.appendChild(buildRow(currentRows));
      });
    `,
  );
}

export function repeatedCertificationsPortalHtml(successUrl: string) {
  return pageShell(
    'Repeated Certifications Application',
    `
      <h1>Certifications</h1>
      <p>This fixture mimics a repeated certification form that requires adding more than one certification row.</p>
      ${jobIntro('Acme requires multiple certifications or licenses before submission.')}
      <form action="${successUrl}" method="get">
        <div id="certification-rows">
          <section class="certification-row" data-index="0">
            <h2 class="muted">Certification 1</h2>
            <div class="field"><label for="certification_0_name">Certification Name</label><input id="certification_0_name" name="certifications[0].name" type="text" required /></div>
          </section>
        </div>
        <button type="button" id="add-certification">Add Certification</button>
        <div class="field"><label for="resume">Resume<input id="resume" name="resume" type="file" style="display:none" required /></label></div>
        <button type="submit">Submit Application</button>
      </form>
    `,
    `
      const rows = document.getElementById('certification-rows');
      const addButton = document.getElementById('add-certification');

      const buildRow = (index) => {
        const section = document.createElement('section');
        section.className = 'certification-row';
        section.dataset.index = String(index);
        section.innerHTML = \`
          <h2 class="muted">Certification \${index + 1}</h2>
          <div class="field"><label for="certification_\${index}_name">Certification Name</label><input id="certification_\${index}_name" name="certifications[\${index}].name" type="text" required /></div>
        \`;
        return section;
      };

      addButton?.addEventListener('click', () => {
        if (!rows) return;
        const currentRows = rows.querySelectorAll('.certification-row').length;
        if (currentRows >= 4) return;
        rows.appendChild(buildRow(currentRows));
      });
    `,
  );
}

export function localAgentRecoveryPortalHtml() {
  return pageShell(
    'Local Agent Recovery Portal',
    `
      <h1>Recoverable Multi-step Application</h1>
      <p>This fixture advances to step 2, then pauses on a required manual question so agent restart can resume from the latest page URL.</p>
      ${jobIntro('Acme is hiring through a recoverable multi-step application flow.')}
      <form id="recovery-form" action="/__fixtures__/apply/success" method="get">
        <section id="recovery-step-1" class="step active">
          <div class="field"><label for="full_name">Full Name</label><input id="full_name" name="full_name" type="text" required /></div>
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
          <button type="button" id="recovery-continue">Continue</button>
        </section>
        <section id="recovery-step-2" class="step">
          <div class="field"><label for="erp_question">Which ERP workflow tool have you supported most recently?</label><input id="erp_question" name="erpWorkflowQuestion" type="text" required /></div>
          <button type="submit">Submit Application</button>
        </section>
      </form>
    `,
    `
      const applyStepFromUrl = () => {
        const params = new URLSearchParams(window.location.search);
        const step = params.get('step');
        const step1 = document.getElementById('recovery-step-1');
        const step2 = document.getElementById('recovery-step-2');
        if (step === '2') {
          step1?.classList.remove('active');
          step2?.classList.add('active');
        } else {
          step2?.classList.remove('active');
          step1?.classList.add('active');
        }
      };

      applyStepFromUrl();
      document.getElementById('recovery-continue')?.addEventListener('click', () => {
        document.getElementById('recovery-step-1')?.classList.remove('active');
        document.getElementById('recovery-step-2')?.classList.add('active');
        history.replaceState({}, '', '?step=2&stepname=recovery-review');
      });
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

export function legalSelfIdPortalHtml() {
  return pageShell(
    'Voluntary Self-Identification',
    `
      <h1>Voluntary Self-Identification</h1>
      <p>Please complete this equal employment opportunity questionnaire before continuing your application.</p>
      <form>
        <div class="field"><label for="self_id_gender">Gender Identity</label><input id="self_id_gender" name="selfIdentification.genderIdentity" type="text" required /></div>
        <div class="field"><label for="self_id_ethnicity">Race / Ethnicity</label><input id="self_id_ethnicity" name="selfIdentification.ethnicity" type="text" required /></div>
        <div class="field"><label for="self_id_veteran">Veteran Status</label><input id="self_id_veteran" name="selfIdentification.veteranStatus" type="text" required /></div>
        <button type="submit">Continue</button>
      </form>
    `,
  );
}

export function assessmentPortalHtml() {
  return pageShell(
    'Online Assessment Required',
    `
      <h1>Technical Assessment</h1>
      <p>You must complete the online coding challenge before we can continue your application.</p>
      <p>The assessment is hosted externally through HackerRank.</p>
      <a href="https://www.hackerrank.com/test/example-challenge">Start Assessment</a>
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
