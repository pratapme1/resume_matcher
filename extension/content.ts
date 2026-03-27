// Resume Tailor Pro — Content Script
// Responsibilities:
//   1. JD extraction and localhost bridge
//   2. basic popup-driven smart fill
//   3. Stage 5 apply-session execution on job portals

type PrefillData = {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
};

type RuntimeMessage =
  | {
    type: 'START_APPLY_SESSION';
    data: {
      sessionId: string;
      applyUrl: string;
      apiBaseUrl: string;
      executorToken: string;
      executorMode: 'extension' | 'local_agent';
    };
  }
  | {
      type: 'RESUME_APPLY_SESSION';
      data: {
        sessionId: string;
      };
    }
  | {
      type: 'SUBMIT_APPLY_SESSION';
      data: {
        sessionId: string;
      };
    }
  | {
      type: 'FOCUS_APPLY_SESSION';
      data: {
        sessionId: string;
      };
    }
  | {
      type: 'APPLY_GET_PLAN';
      data: {
        sessionId: string;
        snapshot: unknown;
      };
    }
  | {
      type: 'APPLY_EVENT';
      data: {
        sessionId: string;
        event: {
          status?: string;
          message?: string;
          filledCount?: number;
          reviewItems?: unknown[];
          pageUrl?: string;
          portalType?: SupportedPortalType;
          pauseReason?: string;
          stepKind?: string;
          stepSignature?: string;
          includeScreenshot?: boolean;
        };
      };
    }
  | {
      type: 'APPLY_COMPLETE';
      data: {
        sessionId: string;
        outcome: 'submitted' | 'protected' | 'unsupported' | 'manual_required' | 'failed';
        message?: string;
      };
    }
  | {
      type: 'GET_LOCAL_AGENT_STATUS';
    };

type PlannedAction =
  | { type: 'fill'; fieldId: string; value: string }
  | { type: 'toggle'; fieldId: string; checked: boolean }
  | { type: 'select'; fieldId: string; value: string }
  | { type: 'upload'; fieldId: string; filename: string; mimeType: string; base64: string };

type ReviewItem = {
  fieldId: string;
  label: string;
  reason: string;
  required: boolean;
};

type ApplyPlanResponse = {
  status: string;
  pauseReason?: string;
  actions: PlannedAction[];
  reviewItems: ReviewItem[];
  nextControlId?: string;
  submitControlId?: string;
};

type FieldHandle =
  | { kind: 'single'; el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }
  | { kind: 'radio-group'; els: HTMLInputElement[] }
  | { kind: 'custom'; el: HTMLElement };

type ApplyDomState = {
  sessionId: string;
  fields: Map<string, FieldHandle>;
  controls: Map<string, HTMLElement>;
};

let activeApplyState: ApplyDomState | null = null;
let applyExecutionPromise: Promise<void> | null = null;

type SupportedPortalType = 'linkedin' | 'naukri' | 'phenom' | 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'icims' | 'smartrecruiters' | 'taleo' | 'successfactors' | 'generic' | 'protected' | 'unknown';
type WidgetKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio_group'
  | 'checkbox'
  | 'file_upload'
  | 'number'
  | 'date'
  | 'custom_combobox'
  | 'custom_multiselect'
  | 'custom_date'
  | 'custom_number'
  | 'unknown';
type StepKind = 'profile' | 'work_history' | 'education' | 'questionnaire' | 'review' | 'submit' | 'unknown';

const PORTAL_MARKERS: Array<{ type: SupportedPortalType; selectors: string[] }> = [
  { type: 'linkedin', selectors: ['[data-easy-apply-modal]', '.jobs-easy-apply-content', '.jobs-apply-form'] },
  { type: 'naukri', selectors: ['[data-testid="naukri-apply-form"]', '#root [class*="apply"]', '.chatBot', '.apply-button'] },
  { type: 'phenom', selectors: ['[data-ph-id]', '#_PCM', '[data-portal="phenom"]'] },
  { type: 'greenhouse', selectors: ['#application_form', '[data-portal="greenhouse"]', '[data-board="greenhouse"]', 'meta[property="og:site_name"][content*="Greenhouse"]'] },
  { type: 'lever', selectors: ['[data-qa="application-page"]', '[data-qa="application-form"]', '[data-portal="lever"]'] },
  { type: 'ashby', selectors: ['[data-portal="ashby"]', '[data-ashby-job-board]'] },
  { type: 'workday', selectors: ['[data-automation-id="applyFlow"]', '[data-automation-id="jobApplication"]', '[data-portal="workday"]'] },
  { type: 'icims', selectors: ['[data-portal="icims"]', '.iCIMS_JobApplication', '#icims_content'] },
  { type: 'smartrecruiters', selectors: ['[data-portal="smartrecruiters"]', '[data-testid="job-application-form"]', '.st-job-application'] },
  { type: 'taleo', selectors: ['[data-portal="taleo"]', '#taleoApplication', '#applyFlow'] },
  { type: 'successfactors', selectors: ['[data-portal="successfactors"]', '[data-sf-application]', '#careerSiteApp'] },
];

async function getStoredAppOrigin(): Promise<string | null> {
  const result = await chrome.storage.local.get('rtp_app_origin');
  const value = result.rtp_app_origin;
  return typeof value === 'string' && /^https?:\/\//.test(value) ? value : null;
}

window.addEventListener('message', async (e: MessageEvent) => {
  if (e.source !== window) return;

  if (e.data?.type === 'RTP_PING') {
    window.postMessage({ type: 'RTP_PONG' }, '*');
    return;
  }

  if (!chrome?.storage) return;

  try {
    if (e.data?.type === 'RTP_REQUEST_JD') {
      const result = await chrome.storage.local.get('pendingJD');
      if (result.pendingJD) {
        window.postMessage({ type: 'RTP_DELIVER_JD', text: result.pendingJD }, '*');
        await chrome.storage.local.remove('pendingJD');
      }
      return;
    }

    if (e.data?.type === 'RTP_PREFILL') {
      await chrome.storage.local.set({ rtp_prefill: e.data.data });
      return;
    }

    if (e.data?.type === 'RTP_SET_APP_ORIGIN' && typeof e.data.origin === 'string') {
      await chrome.storage.local.set({ rtp_app_origin: e.data.origin });
      return;
    }

    if (e.data?.type === 'RTP_ARM_AUTOFILL') {
      await chrome.storage.local.set({ autoFillArmed: true });
      return;
    }

    if (e.data?.type === 'RTP_START_APPLY_SESSION') {
      const result = await chrome.runtime.sendMessage({
        type: 'START_APPLY_SESSION',
        data: e.data.data,
      } as RuntimeMessage);
      if (result?.error) {
        throw new Error(result.error);
      }
      return;
    }

    if (e.data?.type === 'RTP_REQUEST_LOCAL_AGENT_STATUS') {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_LOCAL_AGENT_STATUS',
      } as RuntimeMessage);
      window.postMessage({ type: 'RTP_LOCAL_AGENT_STATUS', data: result }, '*');
      return;
    }

    if (e.data?.type === 'RTP_RESUME_APPLY_SESSION') {
      const result = await chrome.runtime.sendMessage({
        type: 'RESUME_APPLY_SESSION',
        data: e.data.data,
      } as RuntimeMessage);
      if (result?.error) {
        throw new Error(result.error);
      }
      return;
    }

    if (e.data?.type === 'RTP_FOCUS_APPLY_SESSION') {
      const result = await chrome.runtime.sendMessage({
        type: 'FOCUS_APPLY_SESSION',
        data: e.data.data,
      } as RuntimeMessage);
      if (result?.error) {
        throw new Error(result.error);
      }
      return;
    }

    if (e.data?.type === 'RTP_SUBMIT_APPLY_SESSION') {
      const result = await chrome.runtime.sendMessage({
        type: 'SUBMIT_APPLY_SESSION',
        data: e.data.data,
      } as RuntimeMessage);
      if (result?.error) {
        throw new Error(result.error);
      }
    }
  } catch (err) {
    console.warn('[RTP] bridge error:', err);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_JD') {
    sendResponse({ text: document.body.innerText, url: window.location.href });
    return true;
  }

  if (message.type === 'FILL_FORM') {
    fillApplicationForm(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'RTP_EXECUTE_APPLY_SESSION') {
    applyExecutionPromise = executeApplySession(message.data.sessionId)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Failed to execute apply session.' }));
    return true;
  }

  if (message.type === 'RTP_SUBMIT_APPLY') {
    submitApplySession(message.data.sessionId)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Failed to submit application.' }));
    return true;
  }

  return undefined;
});

function collectFormFields() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea',
    ),
  )
    .filter((el) => !isHiddenOrReadonly(el))
    .map((el) => ({
      el,
      name: el.name || el.id || '',
      label: getFieldLabel(el),
      placeholder: el.placeholder,
      type: el.type || 'text',
    }));
}

function applyMapping(
  fields: ReturnType<typeof collectFormFields>,
  mapping: Record<string, string | null>,
): { filled: number; highlighted: number } {
  let filled = 0;
  let highlighted = 0;
  for (const f of fields) {
    const value = mapping[f.name];
    if (value) {
      setNativeValue(f.el, value);
      highlight(f.el, '#34d399');
      filled++;
    } else if (f.label) {
      highlight(f.el, '#fbbf24');
      highlighted++;
    }
  }
  if (filled > 0 || highlighted > 0) showBadge(filled, highlighted);
  return { filled, highlighted };
}

async function fillApplicationForm(data: PrefillData): Promise<{ filled: number; highlighted: number }> {
  const fields = collectFormFields();
  if (fields.length === 0) return { filled: 0, highlighted: 0 };
  const backendOrigin = await getStoredAppOrigin();

  try {
    if (!backendOrigin) throw new Error('No saved app origin.');
    const response = await fetch(`${backendOrigin}/api/smart-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: fields.map(({ name, label, placeholder, type }) => ({ name, label, placeholder, type })),
        prefill: data,
      }),
    });
    if (response.ok) {
      const { mapping } = await response.json() as { mapping: Record<string, string | null> };
      return applyMapping(fields, mapping);
    }
  } catch (err) {
    console.warn('[RTP] smart-fill API failed, falling back to regex:', err);
  }

  const nameParts = (data.name ?? '').trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');
  const regexMap: Array<{ patterns: RegExp[]; value: string }> = [
    { patterns: [/first.?name|given.?name|fname/i], value: firstName },
    { patterns: [/last.?name|surname|family.?name|lname/i], value: lastName },
    { patterns: [/^name$|full.?name|your.?name/i], value: data.name ?? '' },
    { patterns: [/email/i], value: data.email ?? '' },
    { patterns: [/phone|mobile|tel|contact.?num/i], value: data.phone ?? '' },
    { patterns: [/linkedin/i], value: data.linkedin ?? '' },
    { patterns: [/location|city|address|town/i], value: data.location ?? '' },
  ];
  const fallbackMapping: Record<string, string | null> = {};
  for (const f of fields) {
    const match = regexMap.find(({ patterns }) => patterns.some((p) => p.test(f.label)));
    fallbackMapping[f.name] = match?.value || null;
  }
  return applyMapping(fields, fallbackMapping);
}

function getFieldLabel(el: Element): string {
  if (el instanceof HTMLElement && el.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const parentLbl = el.closest?.('label');
  if (parentLbl?.textContent) return parentLbl.textContent.trim();
  if (el instanceof HTMLElement && el.dataset.label) return el.dataset.label.trim();
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || (el instanceof HTMLElement ? el.id : '') || '';
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function hasVisibleUploadAffordance(el: HTMLInputElement): boolean {
  if (el.type !== 'file') return false;

  const directLabel = el.closest('label');
  if (directLabel && ((directLabel as HTMLElement).offsetParent !== null || directLabel.textContent?.trim())) {
    return true;
  }

  if (el.id) {
    const forLabel = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel && ((forLabel as HTMLElement).offsetParent !== null || forLabel.textContent?.trim())) {
      return true;
    }
  }

  const parent = el.parentElement;
  return Boolean(parent && (parent.offsetParent !== null || parent.textContent?.trim()));
}

function isHiddenOrReadonly(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (el instanceof HTMLInputElement && el.type === 'file') {
    return el.disabled || !hasVisibleUploadAffordance(el);
  }

  return (
    el instanceof HTMLInputElement &&
    el.type === 'hidden'
  ) ||
  el.readOnly ||
  el.disabled ||
  el.offsetParent === null;
}

function highlight(el: Element, color: string) {
  (el as HTMLElement).style.outline = `2px solid ${color}`;
  (el as HTMLElement).style.outlineOffset = '2px';
}

function classifyWidgetKind(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): WidgetKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'radio') return 'radio_group';
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'file') return 'file_upload';
    if (el.type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal') return 'number';
    if (el.type === 'date' || el.type === 'month') return 'date';
    return 'text';
  }
  return 'unknown';
}

function classifyCustomWidgetKind(el: HTMLElement): WidgetKind {
  if (el.matches('.p-multiselect, [aria-multiselectable="true"]')) return 'custom_multiselect';
  if (el.matches('.p-calendar, [data-widget-kind="date"]')) return 'custom_date';
  if (el.matches('.p-inputnumber, [data-widget-kind="number"]')) return 'custom_number';
  if (el.matches('.p-dropdown, [role="combobox"], [aria-haspopup="listbox"]')) return 'custom_combobox';
  return 'unknown';
}

function inferRequired(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.required;
  }
  const ariaRequired = el.getAttribute('aria-required');
  if (ariaRequired === 'true') return true;
  const label = getFieldLabel(el);
  return /\*/.test(label);
}

function getVisibleStepText() {
  return [
    document.title,
    window.location.pathname,
    window.location.search,
    ...Array.from(document.querySelectorAll<HTMLElement>('h1, h2, [aria-current="step"], [data-step-name], .step.active, [data-automation-id], [data-qa]')).map((el) => el.textContent || ''),
  ].join(' ').toLowerCase();
}

function detectStepKind(portalType: SupportedPortalType): StepKind {
  const text = getVisibleStepText();
  if (portalType === 'workday') {
    if (/my information|contact information|personal information|candidate home/.test(text)) return 'profile';
    if (/work experience|employment history|experience/.test(text)) return 'work_history';
    if (/education/.test(text)) return 'education';
    if (/screening|questionnaire|my questions/.test(text)) return 'questionnaire';
    if (/review|application review/.test(text)) return 'review';
    if (/submit|application submitted/.test(text)) return 'submit';
  }
  if (/review|final review/.test(text)) return 'review';
  if (/submit|application received|complete your application/.test(text)) return 'submit';
  if (/work|employment|experience/.test(text)) return 'work_history';
  if (/education|school|university/.test(text)) return 'education';
  if (/questionnaire|screening|question|eligibility/.test(text)) return 'questionnaire';
  if (/profile|contact|personal|basic info|about you/.test(text)) return 'profile';
  return 'unknown';
}

function simpleHash(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function portalTypeForLocation(): SupportedPortalType {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('naukri.com')) return 'naukri';
  if (
    host.includes('phenompeople.com') ||
    typeof (window as typeof window & { phApp?: unknown }).phApp !== 'undefined'
  ) return 'phenom';
  if (host.includes('greenhouse')) return 'greenhouse';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('ashbyhq.com')) return 'ashby';
  if (host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) return 'workday';
  if (host.includes('icims.com')) return 'icims';
  if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (host.includes('taleo.net')) return 'taleo';
  if (host.includes('successfactors')) return 'successfactors';
  for (const marker of PORTAL_MARKERS) {
    if (marker.selectors.some((selector) => document.querySelector(selector))) {
      return marker.type;
    }
  }
  return 'generic';
}

function detectLoginRequired(portalType: SupportedPortalType) {
  const pageText = [
    document.title,
    ...Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, button, label, p')).map((el) => el.textContent || ''),
  ].join(' ').toLowerCase();
  const passwordInput = document.querySelector('input[type="password"]');
  if (!passwordInput) return false;

  if (portalType === 'workday') {
    return /sign in|create account|use my existing resume|existing account|login/.test(pageText);
  }
  if (portalType === 'icims' || portalType === 'successfactors' || portalType === 'taleo') {
    return /sign in|create account|login|register/.test(pageText);
  }
  return /sign in|login/.test(pageText);
}

function detectLegalReviewRequired(snapshot: ReturnType<typeof collectApplySnapshot>) {
  const text = [
    document.title,
    document.body?.innerText || '',
    snapshot.fields.map((field) => `${field.label} ${field.name} ${field.placeholder}`).join(' '),
  ].join(' ').toLowerCase();
  if (!/voluntary self[\s-]*identification|self[\s-]*identify|equal employment opportunity|\beeo\b|veteran status|disability status|race(?:\/| and )ethnicity|gender identity|sexual orientation|demographic information/.test(text)) {
    return false;
  }
  return snapshot.fields.some((field) =>
    /(veteran|disability|race|ethnicity|gender identity|sexual orientation|self[\s-]*identify|demographic)/.test(
      `${field.label} ${field.name} ${field.placeholder}`.toLowerCase(),
    ),
  ) || snapshot.stepKind === 'questionnaire';
}

function detectAssessmentGate(snapshot: ReturnType<typeof collectApplySnapshot>) {
  if (document.querySelector('a[href*="hackerrank"], a[href*="codility"], a[href*="codesignal"], a[href*="coderbyte"], a[href*="qualified.io"], a[href*="testgorilla"], a[href*="karat"]')) {
    return true;
  }
  const text = [
    document.title,
    document.body?.innerText || '',
    snapshot.controls.map((control) => control.label).join(' '),
  ].join(' ').toLowerCase();
  if (!/assessment|coding challenge|online test|technical test|take[\s-]*home|screening test|skills test|code challenge/.test(text)) {
    return false;
  }
  if (snapshot.fields.length > 1) {
    return false;
  }
  return /start|continue|begin|launch|complete|take/.test(text);
}

function detectBotProtection(): boolean {
  const title = document.title;
  if (/just a moment|cloudflare|checking your browser/i.test(title)) return true;
  const captchaFrame = document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
  const cfChallenge = document.querySelector('#cf-challenge-running, .cf-browser-verification');
  return Boolean(captchaFrame || cfChallenge);
}

function buildFieldId(index: number, el: Element) {
  const candidate = (el as HTMLInputElement).name || (el as HTMLInputElement).id || el.getAttribute('aria-label') || el.tagName.toLowerCase();
  return `rtp-field-${index}-${candidate}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function buildControlId(index: number, el: HTMLElement) {
  const candidate = el.textContent?.trim() || el.getAttribute('aria-label') || el.id || el.tagName.toLowerCase();
  return `rtp-control-${index}-${candidate}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function classifyControl(el: HTMLElement): 'next' | 'review' | 'submit' | 'unknown' {
  const text = ((el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '')).toLowerCase();
  if (/submit|apply now|send application/.test(text)) return 'submit';
  if (/review/.test(text)) return 'review';
  if (/next|continue|save and continue|continue application/.test(text)) return 'next';
  return 'unknown';
}

function collectApplySnapshot(sessionId: string) {
  const fieldMap = new Map<string, FieldHandle>();
  const controlMap = new Map<string, HTMLElement>();
  const fields: Array<{
    id: string;
    name: string;
    label: string;
    placeholder: string;
    inputType: string;
    tagName: string;
    widgetKind: WidgetKind;
    required: boolean;
    visible: boolean;
    value?: string;
    checked?: boolean;
    hasValue?: boolean;
    options?: Array<{ label: string; value: string }>;
  }> = [];

  const radiosByName = new Map<string, HTMLInputElement[]>();
  const candidates = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
  for (const el of candidates) {
    if (isHiddenOrReadonly(el)) continue;
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const key = el.name || el.id || `radio-${radiosByName.size}`;
      const list = radiosByName.get(key) ?? [];
      list.push(el);
      radiosByName.set(key, list);
      continue;
    }

    const id = buildFieldId(fields.length, el);
    fieldMap.set(id, { kind: 'single', el });
    fields.push({
      id,
      name: el.getAttribute('name') || el.id || '',
      label: getFieldLabel(el),
      placeholder: el.getAttribute('placeholder') || '',
      inputType: el instanceof HTMLInputElement ? (el.type || 'text') : el instanceof HTMLSelectElement ? 'select-one' : 'textarea',
      tagName: el.tagName.toLowerCase(),
      widgetKind: classifyWidgetKind(el),
      required: inferRequired(el),
      visible: el instanceof HTMLInputElement && el.type === 'file' ? hasVisibleUploadAffordance(el) : el.offsetParent !== null,
      value: el instanceof HTMLInputElement && el.type === 'file' ? undefined : ('value' in el ? el.value : undefined),
      checked: el instanceof HTMLInputElement ? el.checked : undefined,
      hasValue: el instanceof HTMLInputElement && el.type === 'file' ? (el.files?.length ?? 0) > 0 : Boolean(('value' in el ? el.value : '').trim()),
      options: el instanceof HTMLSelectElement
        ? Array.from(el.options).map((option) => ({ label: option.label, value: option.value }))
        : undefined,
    });
  }

  radiosByName.forEach((els) => {
    const primary = els[0];
    if (!primary || primary.offsetParent === null) return;
    const id = buildFieldId(fields.length, primary);
    fieldMap.set(id, { kind: 'radio-group', els });
    fields.push({
      id,
      name: primary.name || primary.id || '',
      label: getFieldLabel(primary),
      placeholder: '',
      inputType: 'radio',
      tagName: primary.tagName.toLowerCase(),
      widgetKind: 'radio_group',
      required: els.some((el) => inferRequired(el)),
      visible: true,
      hasValue: els.some((el) => el.checked),
      value: els.find((el) => el.checked)?.value,
      options: els.map((el) => ({
        label: getFieldLabel(el) || el.value,
        value: el.value,
      })),
    });
  });

  const customCandidates = Array.from(document.querySelectorAll<HTMLElement>('[role="combobox"], .p-dropdown, .p-multiselect'))
    .filter((el) => el.offsetParent !== null)
    .filter((el) => !el.matches('input, textarea, select'))
    .filter((el) => !el.querySelector('input, textarea, select'));

  for (const el of customCandidates) {
    if (Array.from(fieldMap.values()).some((handle) => handle.kind === 'custom' && handle.el === el)) continue;
    const widgetKind = classifyCustomWidgetKind(el);
    const id = buildFieldId(fields.length, el);
    fieldMap.set(id, { kind: 'custom', el });
    fields.push({
      id,
      name: el.getAttribute('name') || el.id || '',
      label: getFieldLabel(el),
      placeholder: '',
      inputType: 'custom',
      tagName: el.tagName.toLowerCase(),
      widgetKind,
      required: inferRequired(el),
      visible: true,
      value: el.getAttribute('aria-valuetext') || '',
      hasValue: Boolean((el.getAttribute('aria-valuetext') || '').trim()),
    });
  }

  const controlCandidates = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"]'))
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  const controls = controlCandidates.map((el, index) => {
    const id = buildControlId(index, el);
    controlMap.set(id, el);
    return {
      id,
      label: (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').trim(),
      kind: classifyControl(el),
    };
  });

  activeApplyState = {
    sessionId,
    fields: fieldMap,
    controls: controlMap,
  };

  const portalType = portalTypeForLocation();
  const stepKind = detectStepKind(portalType);
  const signatureInput = [
    window.location.pathname,
    window.location.search,
    portalType,
    stepKind,
    ...fields.map((field) => `${field.name}:${field.widgetKind}:${field.required}`).sort(),
    ...controls.map((control) => `${control.kind}:${control.label}`).sort(),
  ].join('|');
  const stepSignature = `${stepKind}:${simpleHash(signatureInput)}`;

  return {
    url: window.location.href,
    title: document.title,
    portalType,
    stepKind,
    stepSignature,
    fields,
    controls,
  };
}

async function sendRuntimeMessage(message: RuntimeMessage) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
}

async function emitApplyEvent(sessionId: string, event: RuntimeMessage['data']['event']) {
  return sendRuntimeMessage({
    type: 'APPLY_EVENT',
    data: { sessionId, event },
  });
}

async function completeApply(sessionId: string, outcome: RuntimeMessage['data']['outcome'], message?: string) {
  return sendRuntimeMessage({
    type: 'APPLY_COMPLETE',
    data: { sessionId, outcome, message },
  });
}

function decodeBase64File(base64: string, filename: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

async function applyActions(actions: PlannedAction[]) {
  if (!activeApplyState) return 0;
  let filled = 0;

  for (const action of actions) {
    const handle = activeApplyState.fields.get(action.fieldId);
    if (!handle) continue;

    try {
      if (action.type === 'fill' && handle.kind === 'single') {
        if (handle.el instanceof HTMLInputElement || handle.el instanceof HTMLTextAreaElement) {
          setNativeValue(handle.el, action.value);
          highlight(handle.el, '#34d399');
          filled++;
        }
      } else if (action.type === 'toggle' && handle.kind === 'single' && handle.el instanceof HTMLInputElement) {
        handle.el.checked = action.checked;
        handle.el.dispatchEvent(new Event('input', { bubbles: true }));
        handle.el.dispatchEvent(new Event('change', { bubbles: true }));
        highlight(handle.el, '#34d399');
        filled++;
      } else if (action.type === 'select') {
        if (handle.kind === 'single' && handle.el instanceof HTMLSelectElement) {
          handle.el.value = action.value;
          handle.el.dispatchEvent(new Event('input', { bubbles: true }));
          handle.el.dispatchEvent(new Event('change', { bubbles: true }));
          highlight(handle.el, '#34d399');
          filled++;
        } else if (handle.kind === 'radio-group') {
          const match = handle.els.find((el) => el.value === action.value);
          if (match) {
            match.click();
            highlight(match, '#34d399');
            filled++;
          }
        }
      } else if (action.type === 'upload' && handle.kind === 'single' && handle.el instanceof HTMLInputElement && handle.el.type === 'file') {
        const transfer = new DataTransfer();
        transfer.items.add(decodeBase64File(action.base64, action.filename, action.mimeType));
        handle.el.files = transfer.files;
        handle.el.dispatchEvent(new Event('input', { bubbles: true }));
        handle.el.dispatchEvent(new Event('change', { bubbles: true }));
        highlight(handle.el, '#34d399');
        filled++;
      }
    } catch (error) {
      console.warn('[RTP] apply action failed', action, error);
    }
  }

  return filled;
}

function highlightReviewItems(reviewItems: ReviewItem[]) {
  if (!activeApplyState) return;
  for (const item of reviewItems) {
    const handle = activeApplyState.fields.get(item.fieldId);
    if (!handle) continue;
    if (handle.kind === 'single') {
      highlight(handle.el, '#fbbf24');
    } else if (handle.kind === 'custom') {
      highlight(handle.el, '#fbbf24');
    } else {
      handle.els.forEach((el) => highlight(el, '#fbbf24'));
    }
  }
}

async function waitForSettle(ms = 1200) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProgression(sessionId: string, previousSignature: string, previousUrl: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitForSettle(350);
    const nextSnapshot = collectApplySnapshot(sessionId);
    if (nextSnapshot.url !== previousUrl || nextSnapshot.stepSignature !== previousSignature) {
      return nextSnapshot;
    }
  }
  return null;
}

async function executeApplySession(sessionId: string) {
  if (applyExecutionPromise) {
    await applyExecutionPromise.catch(() => {});
  }

  const run = (async () => {
    const initialSnapshot = collectApplySnapshot(sessionId);
    await emitApplyEvent(sessionId, {
      status: 'starting',
      message: 'Inspecting the current page.',
      pageUrl: window.location.href,
      portalType: initialSnapshot.portalType,
      stepKind: initialSnapshot.stepKind,
      stepSignature: initialSnapshot.stepSignature,
    });

    await waitForSettle();

    if (detectBotProtection()) {
      await emitApplyEvent(sessionId, {
        status: 'protected',
        message: 'Bot protection detected on this portal.',
        pageUrl: window.location.href,
        portalType: initialSnapshot.portalType,
        pauseReason: 'protected_portal',
        stepKind: initialSnapshot.stepKind,
        stepSignature: initialSnapshot.stepSignature,
        includeScreenshot: true,
      });
      await completeApply(sessionId, 'protected', 'Bot protection detected.');
      return;
    }

    if (detectLoginRequired(initialSnapshot.portalType)) {
      await emitApplyEvent(sessionId, {
        status: 'manual_required',
        message: 'Login or account setup is required before the application can continue.',
        pageUrl: window.location.href,
        portalType: initialSnapshot.portalType,
        pauseReason: 'login_required',
        stepKind: initialSnapshot.stepKind,
        stepSignature: initialSnapshot.stepSignature,
        includeScreenshot: true,
      });
      await completeApply(sessionId, 'manual_required', 'Login or account setup is required before the application can continue.');
      return;
    }

    if (detectLegalReviewRequired(initialSnapshot)) {
      await emitApplyEvent(sessionId, {
        status: 'manual_required',
        message: 'A legal or self-identification section requires human review in the portal.',
        pageUrl: window.location.href,
        portalType: initialSnapshot.portalType,
        pauseReason: 'legal_review_required',
        stepKind: initialSnapshot.stepKind,
        stepSignature: initialSnapshot.stepSignature,
        includeScreenshot: true,
      });
      await completeApply(sessionId, 'manual_required', 'A legal or self-identification section requires human review before automation can continue.');
      return;
    }

    if (detectAssessmentGate(initialSnapshot)) {
      await emitApplyEvent(sessionId, {
        status: 'manual_required',
        message: 'An external assessment or challenge handoff requires human action in the portal.',
        pageUrl: window.location.href,
        portalType: initialSnapshot.portalType,
        pauseReason: 'assessment_required',
        stepKind: initialSnapshot.stepKind,
        stepSignature: initialSnapshot.stepSignature,
        includeScreenshot: true,
      });
      await completeApply(sessionId, 'manual_required', 'An external assessment or challenge handoff requires human action before automation can continue.');
      return;
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const snapshot = collectApplySnapshot(sessionId);

      if (detectLegalReviewRequired(snapshot)) {
        await emitApplyEvent(sessionId, {
          status: 'manual_required',
          message: 'A legal or self-identification section requires human review in the portal.',
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          pauseReason: 'legal_review_required',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
          includeScreenshot: true,
        });
        await completeApply(sessionId, 'manual_required', 'A legal or self-identification section requires human review before automation can continue.');
        return;
      }

      if (detectAssessmentGate(snapshot)) {
        await emitApplyEvent(sessionId, {
          status: 'manual_required',
          message: 'An external assessment or challenge handoff requires human action in the portal.',
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          pauseReason: 'assessment_required',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
          includeScreenshot: true,
        });
        await completeApply(sessionId, 'manual_required', 'An external assessment or challenge handoff requires human action before automation can continue.');
        return;
      }

      if (snapshot.fields.length === 0) {
        await emitApplyEvent(sessionId, {
          status: 'manual_required',
          message: 'No supported fields were detected on the current page.',
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          pauseReason: 'manual_required',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
          includeScreenshot: true,
        });
        await completeApply(sessionId, 'manual_required', 'No supported fields were detected.');
        return;
      }

      const plan = await sendRuntimeMessage({
        type: 'APPLY_GET_PLAN',
        data: {
          sessionId,
          snapshot,
        },
      }) as ApplyPlanResponse;

      const filled = await applyActions(plan.actions);

      if (plan.reviewItems.length > 0) {
        highlightReviewItems(plan.reviewItems);
        showBadge(filled, plan.reviewItems.length);
        await emitApplyEvent(sessionId, {
          status: 'review_required',
          message: 'Some required fields need manual review in the portal.',
          filledCount: filled,
          reviewItems: plan.reviewItems,
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          pauseReason: plan.pauseReason,
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
          includeScreenshot: true,
        });
        return;
      }

      if (plan.nextControlId && activeApplyState?.controls.has(plan.nextControlId)) {
        const control = activeApplyState.controls.get(plan.nextControlId)!;
        control.click();
        await emitApplyEvent(sessionId, {
          status: 'filling',
          message: 'Continuing to the next step.',
          filledCount: filled,
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
        });
        const progressedSnapshot = await waitForProgression(sessionId, snapshot.stepSignature, snapshot.url);
        if (!progressedSnapshot) {
          await emitApplyEvent(sessionId, {
            status: 'manual_required',
            message: 'The form did not advance after the continue action.',
            filledCount: filled,
            pageUrl: window.location.href,
            portalType: snapshot.portalType,
            pauseReason: 'no_progress_after_advance',
            stepKind: snapshot.stepKind,
            stepSignature: snapshot.stepSignature,
            includeScreenshot: true,
          });
          await completeApply(sessionId, 'manual_required', 'Manual completion required because the form did not advance.');
          return;
        }
        continue;
      }

      if (plan.status === 'ready_to_submit') {
        showBadge(filled, 0);
        await emitApplyEvent(sessionId, {
          status: 'ready_to_submit',
          message: 'Application is ready for your submit confirmation.',
          filledCount: filled,
          pageUrl: window.location.href,
          portalType: snapshot.portalType,
          pauseReason: 'none',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
          includeScreenshot: true,
        });
        return;
      }
    }

    await emitApplyEvent(sessionId, {
      status: 'manual_required',
      message: 'The form needs manual completion after several fill attempts.',
      pageUrl: window.location.href,
      portalType: portalTypeForLocation(),
      pauseReason: 'manual_required',
      includeScreenshot: true,
    });
    await completeApply(sessionId, 'manual_required', 'Manual completion required after repeated fill attempts.');
  })();

  applyExecutionPromise = run;
  try {
    await run;
  } finally {
    applyExecutionPromise = null;
  }
}

async function submitApplySession(sessionId: string) {
  const snapshot = collectApplySnapshot(sessionId);
  const submitControl = snapshot.controls.find((control) => control.kind === 'submit');
  if (!submitControl || !activeApplyState?.controls.has(submitControl.id)) {
    throw new Error('Could not find a submit button on the current page.');
  }

  await emitApplyEvent(sessionId, {
    status: 'submitting',
    message: 'Submitting the application.',
    pageUrl: window.location.href,
    portalType: snapshot.portalType,
  });

  activeApplyState.controls.get(submitControl.id)!.click();
}

async function checkAutoFill() {
  const { autoFillArmed, rtp_prefill } = await chrome.storage.local.get(['autoFillArmed', 'rtp_prefill']);
  if (autoFillArmed && rtp_prefill) {
    await chrome.storage.local.remove('autoFillArmed');
    setTimeout(() => fillApplicationForm(rtp_prefill as PrefillData).catch(console.error), 1500);
  }
}
checkAutoFill().catch(() => {});

window.postMessage({ type: 'RTP_EXTENSION_READY' }, '*');

function showBadge(filled: number, highlighted: number) {
  document.getElementById('rtp-badge')?.remove();
  const badge = document.createElement('div');
  badge.id = 'rtp-badge';
  badge.innerHTML = `
    <span style="color:#a78bfa;font-weight:700">Resume Tailor Pro</span>
    <span>${filled} filled</span>
    ${highlighted > 0 ? `<span style="color:#fbbf24">${highlighted} need attention</span>` : ''}
    <button id="rtp-badge-x" style="background:none;border:none;color:#71717a;cursor:pointer;font-size:16px;line-height:1;padding:0">×</button>
  `;
  Object.assign(badge.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
    background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px',
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px',
    fontSize: '13px', fontFamily: 'system-ui,sans-serif', color: '#f4f4f5',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  });
  document.body.appendChild(badge);
  document.getElementById('rtp-badge-x')?.addEventListener('click', () => badge.remove());
  setTimeout(() => badge.remove(), 8000);
}
