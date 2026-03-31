import express from 'express';
import cors from 'cors';
import { chromium, type BrowserContext, type ElementHandle, type Page } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  ApplyPlanResponse,
  ApplySessionContextResponse,
  ApplySessionEvent,
  LocalAgentHealth,
  LocalAgentSessionRequest,
  LocalAgentSessionSummary,
  PageSnapshot,
  PortalType,
  WidgetKind,
} from '../src/shared/types.ts';
import { getPortalDriver } from './portal-drivers.ts';

type NativeFieldHandle = ElementHandle<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
type ControlHandle = ElementHandle<HTMLElement>;

type FieldBinding =
  | {
      kind: 'single';
      handle: NativeFieldHandle;
      inputType: string;
    }
  | {
      kind: 'custom';
      handle: ControlHandle;
      widgetKind: WidgetKind;
    }
  | {
      kind: 'radio-group';
      options: Array<{
        value: string;
        handle: ElementHandle<HTMLInputElement>;
      }>;
    };

type SessionBindings = {
  fields: Map<string, FieldBinding>;
  controls: Map<string, ControlHandle>;
};

type SessionRecord = {
  summary: LocalAgentSessionSummary;
  page: Page;
  request: LocalAgentSessionRequest;
  bindings: SessionBindings;
  context: ApplySessionContextResponse | null;
  loopPromise: Promise<void> | null;
};

type InspectedFieldMetadata = {
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
};

const LOCAL_AGENT_VERSION = '0.2.0';
const LOCAL_AGENT_SERVICE = 'resume-tailor-local-agent';
const DEFAULT_PORT = 43111;
const EMPTY_SCREENSHOT_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnHCqkAAAAASUVORK5CYII=';
const PORTAL_MARKERS: Array<{ type: PortalType; selectors: string[] }> = [
  { type: 'linkedin', selectors: ['[data-easy-apply-modal]', '.jobs-easy-apply-content', '.jobs-apply-form'] },
  { type: 'naukri', selectors: ['[data-testid="naukri-apply-form"]', '#root [class*="apply"]', '.apply-button'] },
  { type: 'phenom', selectors: ['[data-ph-id]', '#_PCM', '[data-portal="phenom"]'] },
  { type: 'greenhouse', selectors: ['#application_form', '[data-portal="greenhouse"]', '[data-board="greenhouse"]'] },
  { type: 'lever', selectors: ['[data-qa="application-page"]', '[data-qa="application-form"]', '[data-portal="lever"]'] },
  { type: 'ashby', selectors: ['[data-portal="ashby"]', '[data-ashby-job-board]'] },
  { type: 'workday', selectors: ['[data-automation-id="applyFlow"]', '[data-automation-id="jobApplication"]', '[data-portal="workday"]'] },
  { type: 'icims', selectors: ['[data-portal="icims"]', '.iCIMS_JobApplication', '#icims_content'] },
  { type: 'smartrecruiters', selectors: ['[data-portal="smartrecruiters"]', '[data-testid="job-application-form"]', '.st-job-application'] },
  { type: 'taleo', selectors: ['[data-portal="taleo"]', '#taleoApplication', '#applyFlow'] },
  { type: 'successfactors', selectors: ['[data-portal="successfactors"]', '[data-sf-application]', '#careerSiteApp'] },
];

const userDataDir = process.env.LOCAL_AGENT_USER_DATA_DIR?.trim()
  || path.join(os.homedir(), '.resume-tailor', 'local-agent-profile');
const headless = process.env.LOCAL_AGENT_HEADLESS === 'true';

let contextPromise: Promise<BrowserContext> | null = null;
const sessions = new Map<string, SessionRecord>();

function nowIso() {
  return new Date().toISOString();
}

function simpleHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildFieldId(index: number, candidate: string) {
  return `rtp-field-${index}-${candidate}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function buildControlId(index: number, candidate: string) {
  return `rtp-control-${index}-${candidate}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

async function ensureUserDataDir() {
  await fs.mkdir(userDataDir, { recursive: true });
}

async function ensureContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      await ensureUserDataDir();
      const ctx = await chromium.launchPersistentContext(userDataDir, {
        headless,
        viewport: { width: 1440, height: 960 },
        args: ['--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      // Patch automation fingerprints on every new page
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Restore window.chrome so Cloudflare fingerprinting doesn't flag an absent runtime
        if (!(window as any).chrome) {
          (window as any).chrome = { runtime: {} };
        }
      });
      return ctx;
    })();
  }
  return contextPromise;
}

function createEmptyBindings(): SessionBindings {
  return {
    fields: new Map<string, FieldBinding>(),
    controls: new Map<string, ControlHandle>(),
  };
}

async function createHealth(): Promise<LocalAgentHealth> {
  return {
    service: LOCAL_AGENT_SERVICE,
    version: LOCAL_AGENT_VERSION,
    executionMode: 'local_agent',
    playwrightAvailable: true,
    browserReady: Boolean(contextPromise),
    headless,
    sessions: sessions.size,
    userDataDir,
  };
}

function updateSummary(record: SessionRecord, patch: Partial<LocalAgentSessionSummary>) {
  record.summary = {
    ...record.summary,
    ...patch,
    updatedAt: nowIso(),
  };
}

function getRequestHeaders(request: LocalAgentSessionRequest) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${request.executorToken}`,
  };
}

async function emitApplyEvent(record: SessionRecord, event: ApplySessionEvent) {
  if (!record.request.apiBaseUrl || !record.request.executorToken) return;
  await fetch(`${record.request.apiBaseUrl}/api/apply/sessions/${record.summary.sessionId}/events`, {
    method: 'POST',
    headers: getRequestHeaders(record.request),
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(15_000),
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn('[local-agent] emitApplyEvent failed (non-fatal):', err.message);
  });
}

async function completeApply(record: SessionRecord, outcome: 'submitted' | 'protected' | 'unsupported' | 'manual_required' | 'failed', message?: string) {
  if (!record.request.apiBaseUrl || !record.request.executorToken) return;
  await fetch(`${record.request.apiBaseUrl}/api/apply/sessions/${record.summary.sessionId}/complete`, {
    method: 'POST',
    headers: getRequestHeaders(record.request),
    body: JSON.stringify({ outcome, message }),
    signal: AbortSignal.timeout(15_000),
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn('[local-agent] completeApply failed (non-fatal):', err.message);
  });
}

async function requestPlan(record: SessionRecord, snapshot: PageSnapshot) {
  if (!record.request.apiBaseUrl || !record.request.executorToken) {
    throw new Error('Local agent cannot plan actions without apiBaseUrl and executorToken.');
  }
  const response = await fetch(`${record.request.apiBaseUrl}/api/apply/sessions/${record.summary.sessionId}/snapshot`, {
    method: 'POST',
    headers: getRequestHeaders(record.request),
    body: JSON.stringify(snapshot),
  });
  const payload = await response.json().catch(() => null) as ApplyPlanResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error || 'Failed to fetch apply plan.');
  }
  return payload as ApplyPlanResponse;
}

async function getSessionContext(record: SessionRecord) {
  if (record.context) return record.context;
  if (!record.request.apiBaseUrl || !record.request.executorToken) {
    return {
      experienceEntries: [],
      educationEntries: [],
      projectEntries: [],
      certificationEntries: [],
    } satisfies ApplySessionContextResponse;
  }

  const response = await fetch(`${record.request.apiBaseUrl}/api/apply/sessions/${record.summary.sessionId}/context`, {
    method: 'GET',
    headers: getRequestHeaders(record.request),
  });
  const payload = await response.json().catch(() => null) as ApplySessionContextResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error || 'Failed to fetch apply-session context.');
  }
  record.context = payload as ApplySessionContextResponse;
  return record.context;
}

async function detectPortalType(page: Page): Promise<PortalType> {
  const href = page.url().toLowerCase();
  if (href.includes('linkedin.com')) return 'linkedin';
  if (href.includes('naukri.com')) return 'naukri';
  if (href.includes('greenhouse.io')) return 'greenhouse';
  if (href.includes('lever.co')) return 'lever';
  if (href.includes('ashbyhq.com')) return 'ashby';
  if (href.includes('myworkdayjobs.com') || href.includes('workday.com')) return 'workday';
  if (href.includes('icims.com')) return 'icims';
  if (href.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (href.includes('taleo.net')) return 'taleo';
  if (href.includes('successfactors.com') || href.includes('jobs2web.com')) return 'successfactors';
  if (href.includes('phenompeople.com') || href.includes('phenom.com')) return 'phenom';
  for (const marker of PORTAL_MARKERS) {
    for (const selector of marker.selectors) {
      if (await page.locator(selector).first().count().catch(() => 0)) {
        return marker.type;
      }
    }
  }
  return 'generic';
}

async function getPageContext(page: Page) {
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    bodyText: await page.locator('body').innerText().catch(() => ''),
  };
}

async function detectBotProtection(page: Page) {
  const title = await page.title().catch(() => '');
  if (/just a moment|cloudflare|checking your browser/i.test(title)) return true;
  const recaptchaCount = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], #cf-challenge-running, .cf-browser-verification').count().catch(() => 0);
  return recaptchaCount > 0;
}

async function detectLoginRequired(page: Page, portalType: PortalType) {
  const passwordCount = await page.locator('input[type="password"]').count().catch(() => 0);
  if (!passwordCount) return false;
  const pageText = await page.locator('body').innerText().catch(() => '');
  const text = `${await page.title().catch(() => '')} ${pageText}`.toLowerCase();
  if (portalType === 'workday') {
    return /sign in|create account|use my existing resume|existing account|login/.test(text);
  }
  if (portalType === 'icims' || portalType === 'successfactors' || portalType === 'taleo') {
    return /sign in|create account|login|register/.test(text);
  }
  return /sign in|login/.test(text);
}

async function detectLegalReviewRequired(page: Page, snapshot: PageSnapshot) {
  const context = await getPageContext(page);
  const text = [
    context.title,
    context.bodyText,
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

async function detectAssessmentGate(page: Page, snapshot: PageSnapshot) {
  const providerLinks = await page.locator([
    'a[href*="hackerrank"]',
    'a[href*="codility"]',
    'a[href*="codesignal"]',
    'a[href*="coderbyte"]',
    'a[href*="qualified.io"]',
    'a[href*="testgorilla"]',
    'a[href*="karat"]',
  ].join(',')).count().catch(() => 0);
  if (providerLinks > 0) return true;

  const context = await getPageContext(page);
  const text = [
    context.title,
    context.bodyText,
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

async function isHiddenOrReadonly(handle: NativeFieldHandle) {
  return handle.evaluate((el) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if ((input as HTMLInputElement).type === 'hidden') return true;
    if (input.hasAttribute('readonly') || input.hasAttribute('disabled')) return true;
    if ((input as HTMLInputElement).type === 'file') return false;
    const style = window.getComputedStyle(input);
    const rect = input.getBoundingClientRect();
    return style.display === 'none'
      || style.visibility === 'hidden'
      || Number(style.opacity) === 0
      || rect.width === 0
      || rect.height === 0;
  });
}

async function inferFieldMetadata(handle: NativeFieldHandle): Promise<InspectedFieldMetadata> {
  return handle.evaluate((el) => {
    const node = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const fieldLabel = (() => {
      const id = node.getAttribute('id');
      if (id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (explicit?.textContent?.trim()) return explicit.textContent.trim();
      }
      const wrapper = node.closest('label');
      if (wrapper?.textContent?.trim()) return wrapper.textContent.trim();
      const ariaLabel = node.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const labelledBy = node.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((token) => document.getElementById(token)?.textContent?.trim() || '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      const groupLabel = node.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
      return groupLabel || '';
    })();

    const hasVisibleUploadAffordance = (() => {
      if (!(node instanceof HTMLInputElement) || node.type !== 'file') return false;
      const explicitLabels = node.id ? Array.from(document.querySelectorAll(`label[for="${CSS.escape(node.id)}"]`)) : [];
      const candidates = [
        node.closest('label'),
        ...explicitLabels,
        node.parentElement,
      ].filter(Boolean) as HTMLElement[];
      return candidates.some((candidate) => {
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0
          && (candidate.textContent || '').trim().length > 0;
      });
    })();

    const widgetKind = (() => {
      if (node instanceof HTMLTextAreaElement) return 'textarea';
      if (node instanceof HTMLSelectElement) return 'select';
      if (!(node instanceof HTMLInputElement)) return 'text';
      if (node.type === 'checkbox') return 'checkbox';
      if (node.type === 'file') return 'file_upload';
      if (node.type === 'number' || node.inputMode === 'numeric' || node.inputMode === 'decimal') return 'number';
      if (node.type === 'date' || node.type === 'month') return 'date';
      return 'text';
    })();

    return {
      name: node.getAttribute('name') || node.id || '',
      label: fieldLabel,
      placeholder: node.getAttribute('placeholder') || '',
      inputType: node instanceof HTMLInputElement ? (node.type || 'text') : node instanceof HTMLSelectElement ? 'select-one' : 'textarea',
      tagName: node.tagName.toLowerCase(),
      widgetKind: widgetKind as WidgetKind,
      required: node.required || node.getAttribute('aria-required') === 'true',
      visible: node instanceof HTMLInputElement && node.type === 'file'
        ? hasVisibleUploadAffordance
        : (() => {
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          })(),
      value: node instanceof HTMLInputElement && node.type === 'file' ? undefined : ('value' in node ? node.value : undefined),
      checked: node instanceof HTMLInputElement ? node.checked : undefined,
      hasValue: node instanceof HTMLInputElement && node.type === 'file'
        ? (node.files?.length ?? 0) > 0
        : Boolean(('value' in node ? node.value : '').trim()),
      options: node instanceof HTMLSelectElement
        ? Array.from(node.options).map((option) => ({ label: option.label, value: option.value }))
        : undefined,
    };
  });
}

async function inferControlMetadata(handle: ControlHandle, portalType: PortalType) {
  return handle.evaluate((el) => {
    return {
      label: (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').trim(),
      id: el.getAttribute('id') || '',
      name: el.getAttribute('name') || '',
      dataQa: el.getAttribute('data-qa') || '',
      type: (el as HTMLInputElement).type || '',
    };
  }).then((control) => {
    const driver = getPortalDriver(portalType);
    return {
      label: control.label,
      kind: driver.classifyControl(control),
    };
  });
}

async function inferCustomFieldMetadata(handle: ControlHandle): Promise<InspectedFieldMetadata> {
  return handle.evaluate((el) => {
    const node = el as HTMLElement;
    const fieldLabel = (() => {
      const ariaLabel = node.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const labelledBy = node.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((token) => document.getElementById(token)?.textContent?.trim() || '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      return node.closest('label')?.textContent?.trim()
        || node.closest('fieldset')?.querySelector('legend')?.textContent?.trim()
        || node.textContent?.trim()
        || '';
    })();

    const widgetKind = (() => {
      if (node.matches('[role="radiogroup"], [data-card-group], .rtp-card-group')) return 'custom_card_group';
      if (node.matches('.p-multiselect,[aria-multiselectable="true"]')) return 'custom_multiselect';
      if (node.matches('[role="spinbutton"],[aria-valuenow]')) return 'custom_number';
      if (node.matches('[data-date-picker],.react-datepicker-wrapper,[role="dialog"][aria-label*="calendar" i]')) return 'custom_date';
      return 'custom_combobox';
    })();

    const options = (() => {
      if (widgetKind !== 'custom_combobox' && widgetKind !== 'custom_multiselect' && widgetKind !== 'custom_card_group') return undefined;
      const containers = [
        node,
        node.parentElement,
        node.closest('[role="group"], fieldset, form, .field'),
      ].filter(Boolean) as HTMLElement[];
      for (const container of containers) {
        const items = Array.from(container.querySelectorAll<HTMLElement>('[role="option"], [role="radio"], .p-dropdown-item, .p-multiselect-item, [data-value], [data-card-value], [aria-checked]'))
          .map((option) => ({
            label: option.textContent?.trim() || option.getAttribute('data-card-value') || option.getAttribute('data-value') || '',
            value: option.getAttribute('data-card-value') || option.getAttribute('data-value') || option.textContent?.trim() || '',
          }))
          .filter((option) => option.label && option.value);
        if (items.length > 0) {
          return items;
        }
      }
      return undefined;
    })();

    const customValue = (() => {
      if (widgetKind === 'custom_card_group') {
        const selected = node.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], [data-selected="true"]');
        if (selected) {
          return selected.getAttribute('data-card-value')
            || selected.getAttribute('data-value')
            || selected.textContent?.trim()
            || '';
        }
      }
      return node.getAttribute('aria-valuetext')
        || node.getAttribute('data-value')
        || node.textContent?.trim()
        || '';
    })();

    return {
      name: node.getAttribute('name') || node.id || '',
      label: fieldLabel,
      placeholder: node.getAttribute('placeholder') || '',
      inputType: 'custom',
      tagName: node.tagName.toLowerCase(),
      widgetKind: widgetKind as WidgetKind,
      required: node.getAttribute('aria-required') === 'true' || node.hasAttribute('required'),
      visible: (() => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })(),
      value: customValue,
      hasValue: Boolean(customValue.trim()),
      options,
    };
  });
}

async function detectStepKind(page: Page, portalType: PortalType) {
  const driver = getPortalDriver(portalType);
  return driver.detectStepKind(await getPageContext(page));
}

async function inspectPage(record: SessionRecord): Promise<PageSnapshot> {
  const page = record.page;
  const portalType = await detectPortalType(page);
  const driver = getPortalDriver(portalType);
  const stepKind = await detectStepKind(page, portalType);
  const fieldBindings = new Map<string, FieldBinding>();
  const controlBindings = new Map<string, ControlHandle>();
  const fields: PageSnapshot['fields'] = [];

  const nativeHandles = await page.locator('input, textarea, select').elementHandles();
  const radioGroups = new Map<string, ElementHandle<HTMLInputElement>[]>();

  for (const handle of nativeHandles) {
    if (await isHiddenOrReadonly(handle as NativeFieldHandle)) continue;
    const inputType = await handle.evaluate((el) => (el as HTMLInputElement).type || '');
    if (inputType === 'radio') {
      const key = await handle.evaluate((el) => (el as HTMLInputElement).name || (el as HTMLInputElement).id || 'radio');
      const list = radioGroups.get(key) ?? [];
      list.push(handle as ElementHandle<HTMLInputElement>);
      radioGroups.set(key, list);
      continue;
    }

    const metadata = await inferFieldMetadata(handle as NativeFieldHandle);
    const semanticHint = driver.inferSemanticHint(metadata);
    const reviewOnlyReason = driver.getReviewOnlyReason(metadata);
    const candidate = metadata.name || metadata.label || metadata.placeholder || metadata.tagName;
    const id = buildFieldId(fields.length, candidate);
    fieldBindings.set(id, {
      kind: 'single',
      handle: handle as NativeFieldHandle,
      inputType: metadata.inputType,
    });
    fields.push({
      id,
      name: metadata.name,
      label: metadata.label,
      placeholder: metadata.placeholder,
      inputType: metadata.inputType,
      tagName: metadata.tagName,
      widgetKind: metadata.widgetKind as PageSnapshot['fields'][number]['widgetKind'],
      required: metadata.required,
      visible: metadata.visible,
      semanticHint,
      reviewOnlyReason,
      value: metadata.value,
      checked: metadata.checked,
      hasValue: metadata.hasValue,
      options: metadata.options,
    });
  }

  for (const [key, options] of radioGroups.entries()) {
    const primary = options[0];
    if (!primary) continue;
    const primaryMeta = await inferFieldMetadata(primary as NativeFieldHandle);
    const semanticHint = driver.inferSemanticHint(primaryMeta);
    const reviewOnlyReason = driver.getReviewOnlyReason(primaryMeta);
    const id = buildFieldId(fields.length, key || primaryMeta.label || 'radio');
    fieldBindings.set(id, {
      kind: 'radio-group',
      options: await Promise.all(options.map(async (option) => ({
        value: await option.evaluate((el) => el.value),
        handle: option,
      }))),
    });
    fields.push({
      id,
      name: primaryMeta.name,
      label: primaryMeta.label,
      placeholder: '',
      inputType: 'radio',
      tagName: primaryMeta.tagName,
      widgetKind: 'radio_group',
      required: primaryMeta.required,
      visible: true,
      semanticHint,
      reviewOnlyReason,
      hasValue: await primary.evaluate((el) => {
        const name = el.name;
        if (!name) return (el as HTMLInputElement).checked;
        return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)).some((radio) => radio.checked);
      }),
      value: await primary.evaluate((el) => {
        const name = el.name;
        if (!name) return el.checked ? el.value : '';
        return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)).find((radio) => radio.checked)?.value || '';
      }),
      options: await Promise.all(options.map(async (option) => ({
        value: await option.evaluate((el) => el.value),
        label: await option.evaluate((el) => {
          const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          return explicit?.textContent?.trim() || el.closest('label')?.textContent?.trim() || el.value;
        }),
      }))),
    });
  }

  const customHandles = await page
    .locator('[role="combobox"], .p-dropdown, .p-multiselect, [role="spinbutton"], [role="listbox"], [role="radiogroup"], [data-card-group], .rtp-card-group')
    .elementHandles();
  for (const handle of customHandles) {
    const include = await handle.evaluate((el) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
        return false;
      }
      if (node.matches('input, textarea, select')) return false;
      return !node.querySelector('input, textarea, select');
    });
    if (!include) continue;

    const metadata = await inferCustomFieldMetadata(handle as ControlHandle);
    const semanticHint = driver.inferSemanticHint(metadata);
    const reviewOnlyReason = driver.getReviewOnlyReason(metadata);
    const candidate = metadata.name || metadata.label || metadata.tagName;
    const id = buildFieldId(fields.length, candidate);
    fieldBindings.set(id, {
      kind: 'custom',
      handle: handle as ControlHandle,
      widgetKind: metadata.widgetKind,
    });
    fields.push({
      id,
      name: metadata.name,
      label: metadata.label,
      placeholder: metadata.placeholder,
      inputType: metadata.inputType,
      tagName: metadata.tagName,
      widgetKind: metadata.widgetKind as PageSnapshot['fields'][number]['widgetKind'],
      required: metadata.required,
      visible: metadata.visible,
      semanticHint,
      reviewOnlyReason,
      value: metadata.value,
      hasValue: metadata.hasValue,
      options: metadata.options,
    });
  }

  const controlHandles = await page.locator('button, input[type="submit"], input[type="button"]').elementHandles();
  const controls: PageSnapshot['controls'] = [];
  for (const handle of controlHandles) {
    const visible = await handle.evaluate((el) => {
      const node = el as HTMLElement;
      if (node.hasAttribute('disabled')) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    if (!visible) continue;
    const metadata = await inferControlMetadata(handle as ControlHandle, portalType);
    const id = buildControlId(controls.length, metadata.label || 'button');
    controlBindings.set(id, handle as ControlHandle);
    controls.push({
      id,
      label: metadata.label,
      kind: metadata.kind as PageSnapshot['controls'][number]['kind'],
    });
  }

  record.bindings = {
    fields: fieldBindings,
    controls: controlBindings,
  };

  const signatureInput = [
    new URL(page.url()).pathname,
    new URL(page.url()).search,
    portalType,
    stepKind,
    ...fields.map((field) => `${field.name}:${field.widgetKind}:${field.required}`).sort(),
    ...controls.map((control) => `${control.kind}:${control.label}`).sort(),
  ].join('|');
  const stepSignature = `${stepKind}:${simpleHash(signatureInput)}`;

  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    portalType,
    stepKind,
    stepSignature,
    fields,
    controls,
  };
}

type RepeaterSection = 'experience' | 'education' | 'project' | 'certification';

function inferRepeaterSectionFromSnapshot(snapshot: PageSnapshot, context: ApplySessionContextResponse): RepeaterSection | null {
  if (snapshot.stepKind === 'work_history') return 'experience';
  if (snapshot.stepKind === 'education') return 'education';

  const fieldText = snapshot.fields.map((field) => `${field.name} ${field.label} ${field.placeholder}`).join(' ').toLowerCase();
  if (
    context.experienceEntries.length > 1
    && (/experience\[|work[_-]?experience|employment/.test(fieldText) || countRepeaterRows(snapshot, 'experience') > 0)
  ) {
    return 'experience';
  }
  if (
    context.educationEntries.length > 1
    && (/education\[|school\[|institution|degree|university|college/.test(fieldText) || countRepeaterRows(snapshot, 'education') > 0)
  ) {
    return 'education';
  }
  if (
    context.projectEntries.length > 1
    && (/projects?\[|portfolio[_-]?projects?|project[_-]?name|project description/.test(fieldText) || countRepeaterRows(snapshot, 'project') > 0)
  ) {
    return 'project';
  }
  if (
    context.certificationEntries.length > 1
    && (/certifications?\[|licenses?\[|certificate|certification|license|licence/.test(fieldText) || countRepeaterRows(snapshot, 'certification') > 0)
  ) {
    return 'certification';
  }
  return null;
}

function parseRepeaterFieldIndex(fieldName: string, section: RepeaterSection) {
  const normalized = fieldName.toLowerCase();
  const patterns = section === 'experience'
    ? [
        /experience\[(\d+)\]/,
        /work[_-]?experience\[(\d+)\]/,
        /employment(?:history)?\[(\d+)\]/,
        /experience[_-](\d+)[_-]/,
        /work[_-]?experience[_-](\d+)[_-]/,
        /employment(?:history)?[_-](\d+)[_-]/,
      ]
    : section === 'education'
    ? [
        /education\[(\d+)\]/,
        /school\[(\d+)\]/,
        /education[_-](\d+)[_-]/,
        /school[_-](\d+)[_-]/,
      ]
    : section === 'project'
    ? [
        /projects?\[(\d+)\]/,
        /portfolio[_-]?projects?\[(\d+)\]/,
        /projects?[_-](\d+)[_-]/,
        /portfolio[_-]?projects?[_-](\d+)[_-]/,
      ]
    : [
        /certifications?\[(\d+)\]/,
        /licenses?\[(\d+)\]/,
        /certifications?[_-](\d+)[_-]/,
        /licenses?[_-](\d+)[_-]/,
      ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const rawIndex = Number(match[1]);
    return fieldName.includes('[') ? rawIndex : Math.max(0, rawIndex - 1);
  }

  return undefined;
}

function countRepeaterRows(snapshot: PageSnapshot, section: RepeaterSection) {
  const indexes = new Set<number>();
  for (const field of snapshot.fields) {
    const index = parseRepeaterFieldIndex(field.name, section);
    if (typeof index === 'number') {
      indexes.add(index);
    }
  }

  if (indexes.size > 0) return indexes.size;

  const summaryText = `${snapshot.title} ${snapshot.url} ${snapshot.fields.map((field) => `${field.name} ${field.label}`).join(' ')}`.toLowerCase();
  if (section === 'experience' && /company|employer|job title|employment/.test(summaryText)) {
    return 1;
  }
  if (section === 'education' && /institution|school|college|university|degree/.test(summaryText)) {
    return 1;
  }
  if (section === 'project' && /project|portfolio/.test(summaryText)) {
    return 1;
  }
  if (section === 'certification' && /certificate|certification|license|licence/.test(summaryText)) {
    return 1;
  }
  return 0;
}

async function clickRepeaterAddButton(page: Page, section: RepeaterSection) {
  const labels = section === 'experience'
    ? [/add experience/i, /add work history/i, /add employment/i, /add another experience/i, /add position/i]
    : section === 'education'
    ? [/add education/i, /add school/i, /add degree/i, /add another education/i]
    : section === 'project'
    ? [/add project/i, /add portfolio project/i, /add another project/i]
    : [/add certification/i, /add certificate/i, /add license/i, /add another certification/i];

  const controls = await page.locator('button, [role="button"], input[type="button"]').elementHandles();
  for (const control of controls) {
    const descriptor = await control.evaluate((element) => {
      const node = element as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent || (node as HTMLInputElement).value || node.getAttribute('aria-label') || '').trim(),
        visible: !node.hasAttribute('disabled')
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0,
      };
    }).catch(() => ({ text: '', visible: false }));
    if (!descriptor.visible) continue;
    if (!labels.some((pattern) => pattern.test(descriptor.text))) continue;
    try {
      await control.click();
      return true;
    } catch {
      try {
        await control.click({ force: true });
        return true;
      } catch {
        // keep scanning controls
      }
    }
  }
  return false;
}

async function ensureRepeaterCapacity(record: SessionRecord, snapshot: PageSnapshot) {
  const context = await getSessionContext(record);
  const section = inferRepeaterSectionFromSnapshot(snapshot, context);
  if (!section) {
    return snapshot;
  }
  const targetCount = section === 'experience'
    ? context.experienceEntries.length
    : section === 'education'
    ? context.educationEntries.length
    : section === 'project'
    ? context.projectEntries.length
    : context.certificationEntries.length;
  if (targetCount <= 1) return snapshot;

  let workingSnapshot = snapshot;
  let currentCount = countRepeaterRows(workingSnapshot, section);
  if (currentCount === 0) return snapshot;

  for (let attempt = 0; attempt < targetCount - currentCount; attempt++) {
    if (currentCount >= targetCount) break;
    const clicked = await clickRepeaterAddButton(record.page, section);
    if (!clicked) break;
    await record.page.waitForTimeout(250);
    const nextSnapshot = await inspectPage(record);
    const nextCount = countRepeaterRows(nextSnapshot, section);
    workingSnapshot = nextSnapshot;
    if (nextCount <= currentCount) break;
    currentCount = nextCount;
  }

  return workingSnapshot;
}

async function applyActions(record: SessionRecord, actions: ApplyPlanResponse['actions']) {
  let filled = 0;
  for (const action of actions) {
    const binding = record.bindings.fields.get(action.fieldId);
    if (!binding) continue;
    try {
      if (action.type === 'fill' && binding.kind === 'single') {
        await binding.handle.fill(action.value);
        if (await verifyBindingApplied(binding, action)) {
          filled++;
        }
        continue;
      }
      if (action.type === 'toggle' && binding.kind === 'single' && binding.inputType === 'checkbox') {
        if (action.checked) {
          await binding.handle.check();
        } else {
          await binding.handle.uncheck();
        }
        if (await verifyBindingApplied(binding, action)) {
          filled++;
        }
        continue;
      }
      if (action.type === 'select') {
        if (binding.kind === 'single' && binding.inputType === 'select-one') {
          await binding.handle.selectOption({ value: action.value }).catch(async () => {
            await binding.handle.selectOption({ label: action.value });
          });
          if (await verifyBindingApplied(binding, action)) {
            filled++;
          }
          continue;
        }
        if (binding.kind === 'custom') {
          const changed = await applyCustomWidgetValue(record.page, binding.handle, binding.widgetKind, action.value, true);
          if (changed) {
            filled++;
          }
          continue;
        }
        if (binding.kind === 'radio-group') {
          const match = binding.options.find((option) => option.value === action.value);
          if (match) {
            await match.handle.check();
            if (await verifyBindingApplied(binding, action)) {
              filled++;
            }
          }
        }
        continue;
      }
      if (action.type === 'upload' && binding.kind === 'single' && binding.inputType === 'file') {
        await binding.handle.setInputFiles({
          name: action.filename,
          mimeType: action.mimeType,
          buffer: Buffer.from(action.base64, 'base64'),
        });
        if (await verifyBindingApplied(binding, action)) {
          filled++;
        }
        continue;
      }
      if (action.type === 'fill' && binding.kind === 'custom') {
        const changed = await applyCustomWidgetValue(record.page, binding.handle, binding.widgetKind, action.value, false);
        if (changed) {
          filled++;
        }
      }
    } catch (error) {
      // Keep the run moving; review or progression logic will surface blockers.
      console.warn('[local-agent] apply action failed', action, error);
    }
  }
  return filled;
}

async function findCustomEditableTarget(handle: ControlHandle) {
  const directEditable = await handle.evaluate((el) =>
    el.matches('input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"]'),
  ).catch(() => false);
  if (directEditable) {
    return handle;
  }

  const nested = await handle.$('input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"]');
  return nested as ControlHandle | null;
}

async function typeIntoCustomTarget(page: Page, target: ControlHandle, value: string) {
  await target.click({ force: true }).catch(async () => {
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    await target.click({ force: true });
  });
  await page.keyboard.press('Control+A').catch(() => undefined);
  await page.keyboard.press('Meta+A').catch(() => undefined);
  await page.keyboard.press('Backspace').catch(() => undefined);
  await page.keyboard.type(value, { delay: 10 });
}

function splitSelectionValues(value: string) {
  return value
    .split(/[;,|\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function clickCustomOption(page: Page, value: string) {
  const options = await page.$$(' [role="option"], .p-dropdown-item, .p-multiselect-item, li, [data-value]'.trim());
  const normalizedTarget = normalizedValue(value);

  for (const option of options) {
    const descriptor = await option.evaluate((el) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        value: node.getAttribute('data-value') || node.textContent || '',
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      };
    }).catch(() => ({ value: '', visible: false }));
    if (!descriptor.visible) continue;
    if (normalizedValue(descriptor.value) === normalizedTarget) {
      try {
        await option.click();
        return true;
      } catch {
        // try the next matching option
      }
    }
  }

  for (const option of options) {
    const descriptor = await option.evaluate((el) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        value: node.getAttribute('data-value') || node.textContent || '',
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      };
    }).catch(() => ({ value: '', visible: false }));
    if (!descriptor.visible) continue;
    const normalizedValueText = normalizedValue(descriptor.value);
    if (normalizedValueText.includes(normalizedTarget) || normalizedTarget.includes(normalizedValueText)) {
      try {
        await option.click();
        return true;
      } catch {
        // try the next fuzzy option
      }
    }
  }
  return false;
}

async function clickCardOption(handle: ControlHandle, value: string) {
  const options = await handle.$$('[role="radio"], [data-card-value], [data-value], button, [aria-checked]');
  const normalizedTarget = normalizedValue(value);

  for (const option of options) {
    const text = normalizedValue(await option.evaluate((el) =>
      el.getAttribute('data-card-value')
      || el.getAttribute('data-value')
      || el.textContent
      || '',
    ).catch(() => ''));
    if (text === normalizedTarget) {
      await option.click({ force: true }).catch(() => undefined);
      return true;
    }
  }

  for (const option of options) {
    const text = normalizedValue(await option.evaluate((el) =>
      el.getAttribute('data-card-value')
      || el.getAttribute('data-value')
      || el.textContent
      || '',
    ).catch(() => ''));
    if (text.includes(normalizedTarget) || normalizedTarget.includes(text)) {
      await option.click({ force: true }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function dismissTransientOverlays(page: Page) {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.locator('body').click({ position: { x: 8, y: 8 }, force: true }).catch(() => undefined);
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
    for (const panel of document.querySelectorAll<HTMLElement>('[role="listbox"], .p-dropdown-panel, .p-multiselect-panel, .react-datepicker-popper')) {
      panel.hidden = true;
      panel.style.display = 'none';
      panel.style.pointerEvents = 'none';
    }
    for (const combo of document.querySelectorAll<HTMLElement>('[role="combobox"][aria-expanded="true"]')) {
      combo.setAttribute('aria-expanded', 'false');
    }
  }).catch(() => undefined);
}

async function stabilizeCustomWidgetValue(handle: ControlHandle, value: string) {
  await handle.evaluate((element, nextValue) => {
    const node = element as HTMLElement;
    if ('value' in node && typeof (node as HTMLInputElement).value === 'string') {
      (node as HTMLInputElement).value = nextValue;
    } else {
      node.textContent = nextValue;
    }
    node.setAttribute('data-value', nextValue);
    node.setAttribute('aria-valuetext', nextValue);
    if (node.getAttribute('role') === 'combobox') {
      node.setAttribute('aria-expanded', 'false');
    }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value).catch(() => undefined);
}

async function readSingleBindingValue(binding: Extract<FieldBinding, { kind: 'single' }>) {
  if (binding.inputType === 'file') {
    return binding.handle.evaluate((el) => ((el as HTMLInputElement).files?.length ?? 0) > 0 ? '__file_attached__' : '');
  }
  if (binding.inputType === 'checkbox') {
    const checked = await binding.handle.isChecked().catch(() => false);
    return checked ? 'true' : '';
  }
  return binding.handle.inputValue().catch(() => '');
}

async function readRadioBindingValue(binding: Extract<FieldBinding, { kind: 'radio-group' }>) {
  for (const option of binding.options) {
    const checked = await option.handle.isChecked().catch(() => false);
    if (checked) return option.value;
  }
  return '';
}

async function readCustomBindingValue(binding: Extract<FieldBinding, { kind: 'custom' }>) {
  const metadata = await inferCustomFieldMetadata(binding.handle);
  return metadata.value || '';
}

function normalizedValue(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function verifyBindingApplied(binding: FieldBinding, action: ApplyPlanResponse['actions'][number]) {
  if (binding.kind === 'single') {
    const actual = await readSingleBindingValue(binding);
    if (action.type === 'upload') return actual === '__file_attached__';
    if (action.type === 'toggle') {
      return action.checked ? actual === 'true' : actual === '';
    }
    if (action.type === 'select' || action.type === 'fill') {
      return normalizedValue(actual).includes(normalizedValue(action.value));
    }
    return false;
  }
  if (binding.kind === 'radio-group' && action.type === 'select') {
    const actual = await readRadioBindingValue(binding);
    return normalizedValue(actual) === normalizedValue(action.value);
  }
  if (binding.kind === 'custom' && (action.type === 'fill' || action.type === 'select')) {
    const actual = await readCustomBindingValue(binding);
    const expectedValues = binding.widgetKind === 'custom_multiselect'
      ? splitSelectionValues(action.value)
      : [action.value];
    return expectedValues.every((expected) => normalizedValue(actual).includes(normalizedValue(expected)));
  }
  return false;
}

async function capturePageScreenshotDataUrl(page: Page) {
  try {
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return EMPTY_SCREENSHOT_DATA_URL;
  }
}

async function applyCustomWidgetValue(page: Page, handle: ControlHandle, widgetKind: WidgetKind, value: string, preferSelection: boolean) {
  const target = await findCustomEditableTarget(handle);
  const actionable = target ?? handle;

  if (widgetKind === 'custom_card_group') {
    const selected = await clickCardOption(handle, value);
    if (selected) {
      await stabilizeCustomWidgetValue(handle, value);
      await dismissTransientOverlays(page);
      const metadata = await inferCustomFieldMetadata(handle);
      return normalizedValue(metadata.value || '').includes(normalizedValue(value));
    }
    return false;
  }

  if (widgetKind === 'custom_number' || widgetKind === 'custom_date') {
    await typeIntoCustomTarget(page, actionable, value);
    await page.keyboard.press('Tab').catch(() => undefined);
    await stabilizeCustomWidgetValue(handle, value);
    await dismissTransientOverlays(page);
    const metadata = await inferCustomFieldMetadata(handle);
    return normalizedValue(metadata.value || '').includes(normalizedValue(value));
  }

  if (widgetKind === 'custom_multiselect') {
    const values = splitSelectionValues(value);
    await actionable.click({ force: true }).catch(() => undefined);
    for (const entry of values) {
      if (target) {
        await typeIntoCustomTarget(page, actionable, entry);
      }
      await page.waitForTimeout(150);
      await clickCustomOption(page, entry);
    }
    const joined = values.join(', ');
    await stabilizeCustomWidgetValue(handle, joined);
    await dismissTransientOverlays(page);
    const metadata = await inferCustomFieldMetadata(handle);
    return values.every((entry) => normalizedValue(metadata.value || '').includes(normalizedValue(entry)));
  }

  await actionable.click({ force: true }).catch(() => undefined);
  if (preferSelection) {
    if (target) {
      await typeIntoCustomTarget(page, actionable, value);
    }
    await page.waitForTimeout(200);
    const selected = await clickCustomOption(page, value);
    if (selected) {
      await page.keyboard.press('Tab').catch(() => undefined);
      await stabilizeCustomWidgetValue(handle, value);
      await dismissTransientOverlays(page);
      const metadata = await inferCustomFieldMetadata(handle);
      return normalizedValue(metadata.value || '').includes(normalizedValue(value));
    }
  }

  await typeIntoCustomTarget(page, actionable, value);
  await page.waitForTimeout(200);
  await clickCustomOption(page, value).catch(() => false);
  await page.keyboard.press('Enter').catch(() => undefined);
  await page.keyboard.press('Tab').catch(() => undefined);
  await stabilizeCustomWidgetValue(handle, value);
  await dismissTransientOverlays(page);
  const metadata = await inferCustomFieldMetadata(handle);
  return normalizedValue(metadata.value || '').includes(normalizedValue(value));
}

async function clickControl(record: SessionRecord, controlId: string) {
  const control = record.bindings.controls.get(controlId);
  if (!control) return false;
  try {
    await dismissTransientOverlays(record.page);
    await control.click({ timeout: 5_000 });
    return true;
  } catch {
    try {
      await dismissTransientOverlays(record.page);
      await control.click({ force: true, timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function waitForSubmissionOutcome(record: SessionRecord, portalType: PortalType, previousUrl: string, timeoutMs = 10000) {
  const driver = getPortalDriver(portalType);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await record.page.waitForTimeout(500);
    const context = await getPageContext(record.page);
    if (driver.isSubmissionSuccess(context)) {
      return { success: true as const, context };
    }
    if (context.url !== previousUrl && /thanks|thank-you|confirmation|submitted|complete/i.test(context.url)) {
      return { success: true as const, context };
    }
  }
  return { success: false as const, context: await getPageContext(record.page) };
}

async function waitForProgression(record: SessionRecord, previousSignature: string, previousUrl: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await record.page.waitForTimeout(400);
    const snapshot = await inspectPage(record);
    if (snapshot.url !== previousUrl || snapshot.stepSignature !== previousSignature) {
      return snapshot;
    }
  }
  return null;
}

async function runApplyLoop(record: SessionRecord) {
  updateSummary(record, { status: 'running' });
  // Wait for JS frameworks (React, Vue, Angular) to hydrate after initial load.
  // domcontentloaded fires too early for SPAs; this short pause lets the first render settle.
  await record.page.waitForTimeout(1500);
  const initialSnapshot = await inspectPage(record);

  await emitApplyEvent(record, {
    status: 'starting',
    message: 'Local agent is inspecting the current page.',
    pageUrl: initialSnapshot.url,
    portalType: initialSnapshot.portalType,
    stepKind: initialSnapshot.stepKind,
    stepSignature: initialSnapshot.stepSignature,
  });

  if (await detectBotProtection(record.page)) {
    updateSummary(record, { status: 'paused' });
    const screenshot = await capturePageScreenshotDataUrl(record.page);
    // Automatically switch executor to extension so the user's real Chrome can
    // bypass the bot gate without Playwright's automation fingerprints.
    if (record.request.apiBaseUrl && record.request.executorToken) {
      await fetch(
        `${record.request.apiBaseUrl}/api/apply/sessions/${record.summary.sessionId}/executor-mode`,
        {
          method: 'POST',
          headers: getRequestHeaders(record.request),
          body: JSON.stringify({ executorMode: 'extension', message: 'Bot protection detected — handing off to your browser extension.' }),
        },
      ).catch(() => undefined);
    }
    await emitApplyEvent(record, {
      status: 'protected',
      message: 'Bot protection detected — handing off to your browser extension.',
      screenshot,
      pageUrl: initialSnapshot.url,
      portalType: initialSnapshot.portalType,
      pauseReason: 'protected_portal',
      stepKind: initialSnapshot.stepKind,
      stepSignature: initialSnapshot.stepSignature,
    });
    await completeApply(record, 'protected', 'Bot protection detected — switched to extension.');
    return;
  }

  if (await detectLoginRequired(record.page, initialSnapshot.portalType)) {
    updateSummary(record, { status: 'paused' });
    const screenshot = await capturePageScreenshotDataUrl(record.page);
    await emitApplyEvent(record, {
      status: 'manual_required',
      message: 'Login or account setup is required in the managed browser profile.',
      screenshot,
      pageUrl: initialSnapshot.url,
      portalType: initialSnapshot.portalType,
      pauseReason: 'login_required',
      stepKind: initialSnapshot.stepKind,
      stepSignature: initialSnapshot.stepSignature,
    });
    await completeApply(record, 'manual_required', 'Login or account setup is required before automation can continue.');
    return;
  }

  if (await detectLegalReviewRequired(record.page, initialSnapshot)) {
    updateSummary(record, { status: 'paused' });
    const screenshot = await capturePageScreenshotDataUrl(record.page);
    await emitApplyEvent(record, {
      status: 'manual_required',
      message: 'A legal or self-identification section requires human review in the managed browser.',
      screenshot,
      pageUrl: initialSnapshot.url,
      portalType: initialSnapshot.portalType,
      pauseReason: 'legal_review_required',
      stepKind: initialSnapshot.stepKind,
      stepSignature: initialSnapshot.stepSignature,
    });
    await completeApply(record, 'manual_required', 'A legal or self-identification section requires human review before automation can continue.');
    return;
  }

  if (await detectAssessmentGate(record.page, initialSnapshot)) {
    updateSummary(record, { status: 'paused' });
    const screenshot = await capturePageScreenshotDataUrl(record.page);
    await emitApplyEvent(record, {
      status: 'manual_required',
      message: 'An external assessment or challenge handoff requires human action in the managed browser.',
      screenshot,
      pageUrl: initialSnapshot.url,
      portalType: initialSnapshot.portalType,
      pauseReason: 'assessment_required',
      stepKind: initialSnapshot.stepKind,
      stepSignature: initialSnapshot.stepSignature,
    });
    await completeApply(record, 'manual_required', 'An external assessment or challenge handoff requires human action before automation can continue.');
    return;
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    let snapshot = await inspectPage(record);
    snapshot = await ensureRepeaterCapacity(record, snapshot);

    if (await detectLegalReviewRequired(record.page, snapshot)) {
      updateSummary(record, { status: 'paused' });
      const screenshot = await capturePageScreenshotDataUrl(record.page);
      await emitApplyEvent(record, {
        status: 'manual_required',
        message: 'A legal or self-identification section requires human review in the managed browser.',
        screenshot,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        pauseReason: 'legal_review_required',
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });
      await completeApply(record, 'manual_required', 'A legal or self-identification section requires human review before automation can continue.');
      return;
    }

    if (await detectAssessmentGate(record.page, snapshot)) {
      updateSummary(record, { status: 'paused' });
      const screenshot = await capturePageScreenshotDataUrl(record.page);
      await emitApplyEvent(record, {
        status: 'manual_required',
        message: 'An external assessment or challenge handoff requires human action in the managed browser.',
        screenshot,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        pauseReason: 'assessment_required',
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });
      await completeApply(record, 'manual_required', 'An external assessment or challenge handoff requires human action before automation can continue.');
      return;
    }

    if (snapshot.fields.length === 0) {
      updateSummary(record, { status: 'paused' });
      const screenshot = await capturePageScreenshotDataUrl(record.page);
      await emitApplyEvent(record, {
        status: 'manual_required',
        message: 'No supported fields were detected on the current page.',
        screenshot,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        pauseReason: 'manual_required',
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });
      await completeApply(record, 'manual_required', 'No supported fields were detected.');
      return;
    }

    const plan = await requestPlan(record, snapshot);
    const filled = await applyActions(record, plan.actions);

    if (plan.reviewItems.length > 0) {
      updateSummary(record, { status: 'paused' });
      const screenshot = await capturePageScreenshotDataUrl(record.page);
      await emitApplyEvent(record, {
        status: 'review_required',
        message: 'Some required fields need review in the managed browser profile.',
        screenshot,
        filledCount: filled,
        reviewItems: plan.reviewItems,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        pauseReason: plan.pauseReason,
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });
      return;
    }

    if (plan.nextControlId) {
      const clicked = await clickControl(record, plan.nextControlId);
      if (!clicked) {
        updateSummary(record, { status: 'paused' });
        const screenshot = await capturePageScreenshotDataUrl(record.page);
        await emitApplyEvent(record, {
          status: 'manual_required',
          message: 'The continue control could not be activated.',
          screenshot,
          filledCount: filled,
          pageUrl: snapshot.url,
          portalType: snapshot.portalType,
          pauseReason: 'manual_required',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
        });
        await completeApply(record, 'manual_required', 'Continue control could not be activated.');
        return;
      }

      await emitApplyEvent(record, {
        status: 'filling',
        message: 'Local agent is continuing to the next step.',
        filledCount: filled,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });

      const progressed = await waitForProgression(record, snapshot.stepSignature, snapshot.url);
      if (!progressed) {
        updateSummary(record, { status: 'paused' });
        const screenshot = await capturePageScreenshotDataUrl(record.page);
        await emitApplyEvent(record, {
          status: 'manual_required',
          message: 'The form did not advance after the continue action.',
          screenshot,
          filledCount: filled,
          pageUrl: snapshot.url,
          portalType: snapshot.portalType,
          pauseReason: 'no_progress_after_advance',
          stepKind: snapshot.stepKind,
          stepSignature: snapshot.stepSignature,
        });
        await completeApply(record, 'manual_required', 'Manual completion required because the form did not advance.');
        return;
      }
      continue;
    }

    if (plan.status === 'ready_to_submit') {
      updateSummary(record, { status: 'paused' });
      const screenshot = await capturePageScreenshotDataUrl(record.page);
      await emitApplyEvent(record, {
        status: 'ready_to_submit',
        message: 'Application is ready for submit confirmation in the managed browser profile.',
        screenshot,
        filledCount: filled,
        pageUrl: snapshot.url,
        portalType: snapshot.portalType,
        pauseReason: 'none',
        stepKind: snapshot.stepKind,
        stepSignature: snapshot.stepSignature,
      });
      return;
    }
  }

  updateSummary(record, { status: 'paused' });
  const screenshot = await capturePageScreenshotDataUrl(record.page);
  await emitApplyEvent(record, {
    status: 'manual_required',
    message: 'The local agent needs manual completion after several attempts.',
    screenshot,
    pageUrl: record.page.url(),
    portalType: await detectPortalType(record.page),
    pauseReason: 'manual_required',
  });
  await completeApply(record, 'manual_required', 'Manual completion required after repeated fill attempts.');
}

async function submitApplication(record: SessionRecord) {
  const snapshot = await inspectPage(record);
  const portalType = snapshot.portalType;
  const submitControl = snapshot.controls.find((control) => control.kind === 'submit');
  if (!submitControl) {
    throw new Error('Could not find a submit control in the managed browser profile.');
  }

  const clicked = await clickControl(record, submitControl.id);
  if (!clicked) {
    throw new Error('Submit control could not be activated in the managed browser profile.');
  }

  updateSummary(record, { status: 'running' });
  await emitApplyEvent(record, {
    status: 'submitting',
    message: portalType === 'greenhouse'
      ? 'Submitting the Greenhouse application from the managed browser profile.'
      : 'Submitting the application from the managed browser profile.',
    pageUrl: snapshot.url,
    portalType,
    stepKind: snapshot.stepKind,
    stepSignature: snapshot.stepSignature,
  });

  const outcome = await waitForSubmissionOutcome(record, portalType, snapshot.url);
  if (outcome.success) {
    updateSummary(record, {
      status: 'completed',
      pageTitle: outcome.context.title,
      currentUrl: outcome.context.url,
    });
    await emitApplyEvent(record, {
      status: 'submitted',
      message: portalType === 'greenhouse'
        ? 'Greenhouse application submitted successfully.'
        : 'Application submitted successfully from the managed browser profile.',
      pageUrl: outcome.context.url,
      portalType,
      stepKind: 'review',
    });
    await completeApply(record, 'submitted', 'Application submitted successfully from the local agent.');
    return record.summary;
  }

  updateSummary(record, { status: 'paused' });
  const screenshot = await capturePageScreenshotDataUrl(record.page);
  await emitApplyEvent(record, {
    status: 'manual_required',
    message: portalType === 'greenhouse'
      ? 'Greenhouse submit did not reach a confirmed success state. Review the managed browser profile.'
      : 'Submit did not reach a confirmed success state. Review the managed browser profile.',
    screenshot,
    pageUrl: outcome.context.url,
    portalType,
    pauseReason: 'manual_required',
  });
  await completeApply(record, 'manual_required', 'Manual review required after submit attempt.');
  return record.summary;
}

async function startSession(input: LocalAgentSessionRequest): Promise<LocalAgentSessionSummary> {
  const existing = sessions.get(input.sessionId);
  if (existing) {
    await existing.page.bringToFront().catch(() => undefined);
    updateSummary(existing, {
      pageTitle: await existing.page.title().catch(() => existing.summary.pageTitle),
      currentUrl: existing.page.url(),
    });
    return existing.summary;
  }

  const context = await ensureContext();
  const page = await context.newPage();
  await page.goto(input.applyUrl, { waitUntil: 'load' });

  const startedAt = nowIso();
  const record: SessionRecord = {
    summary: {
      sessionId: input.sessionId,
      status: 'running',
      applyUrl: input.applyUrl,
      pageTitle: await page.title().catch(() => undefined),
      currentUrl: page.url(),
      startedAt,
      updatedAt: startedAt,
    },
    page,
    request: input,
    bindings: createEmptyBindings(),
    context: null,
    loopPromise: null,
  };
  sessions.set(input.sessionId, record);
  record.loopPromise = runApplyLoop(record)
    .catch(async (error) => {
      updateSummary(record, { status: 'failed' });
      await emitApplyEvent(record, {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Local agent execution failed.',
        pageUrl: record.page.url(),
      });
      await completeApply(record, 'failed', error instanceof Error ? error.message : 'Local agent execution failed.');
    })
    .finally(() => {
      record.loopPromise = null;
    });
  return record.summary;
}

async function refreshSessionSummary(sessionId: string) {
  const record = sessions.get(sessionId);
  if (!record) return null;
  updateSummary(record, {
    pageTitle: await record.page.title().catch(() => record.summary.pageTitle),
    currentUrl: record.page.url(),
  });
  return record.summary;
}

async function closeSession(sessionId: string, status: LocalAgentSessionSummary['status']) {
  const record = sessions.get(sessionId);
  if (!record) return null;
  updateSummary(record, { status });
  await record.page.close({ runBeforeUnload: false }).catch(() => undefined);
  sessions.delete(sessionId);
  return record.summary;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  res.json(await createHealth());
});

app.post('/sessions/start', async (req, res) => {
  try {
    const body = req.body as LocalAgentSessionRequest;
    if (!body?.sessionId || !body?.applyUrl) {
      res.status(400).json({ error: 'sessionId and applyUrl are required.' });
      return;
    }
    const summary = await startSession(body);
    res.json({ session: summary });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start local-agent session.',
    });
  }
});

app.get('/sessions/:id', async (req, res) => {
  const summary = await refreshSessionSummary(req.params.id);
  if (!summary) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ session: summary });
});

app.get('/sessions/:id/debug', async (req, res) => {
  const record = sessions.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  try {
    const summary = await refreshSessionSummary(req.params.id);
    const snapshot = await inspectPage(record);
    res.json({ session: summary, snapshot });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to inspect the local-agent session.',
    });
  }
});

app.post('/sessions/:id/pause', async (req, res) => {
  const record = sessions.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  updateSummary(record, { status: 'paused' });
  res.json({ session: record.summary });
});

app.post('/sessions/:id/close', async (req, res) => {
  const summary = await closeSession(req.params.id, 'failed');
  if (!summary) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ session: summary });
});

app.post('/sessions/:id/focus', async (req, res) => {
  const record = sessions.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  try {
    await record.page.bringToFront().catch(() => undefined);
    updateSummary(record, {
      pageTitle: await record.page.title().catch(() => record.summary.pageTitle),
      currentUrl: record.page.url(),
    });
    res.json({ session: record.summary });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to focus the managed-browser session.',
    });
  }
});

app.post('/sessions/:id/resume', async (req, res) => {
  const record = sessions.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  await record.page.bringToFront().catch(() => undefined);
  updateSummary(record, {
    status: 'running',
    pageTitle: await record.page.title().catch(() => record.summary.pageTitle),
    currentUrl: record.page.url(),
  });
  if (!record.loopPromise) {
    record.loopPromise = runApplyLoop(record)
      .catch(async (error) => {
        updateSummary(record, { status: 'failed' });
        await emitApplyEvent(record, {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Local agent execution failed.',
          pageUrl: record.page.url(),
        });
        await completeApply(record, 'failed', error instanceof Error ? error.message : 'Local agent execution failed.');
      })
      .finally(() => {
        record.loopPromise = null;
      });
  }
  res.json({ session: record.summary });
});

app.post('/sessions/:id/submit', async (req, res) => {
  const record = sessions.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  try {
    const summary = await submitApplication(record);
    res.json({ session: summary });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to submit the managed-browser application.',
    });
  }
});

app.post('/sessions/:id/cancel', async (req, res) => {
  const summary = await closeSession(req.params.id, 'failed');
  if (!summary) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ session: summary });
});

// Prevent a single failed fetch (e.g. Vercel temporarily unreachable) from
// crashing the entire agent process.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[local-agent] unhandled rejection (session continues):', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[local-agent] uncaught exception (process continues):', err.message);
});

const port = Number(process.env.LOCAL_AGENT_PORT || DEFAULT_PORT);
app.listen(port, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[local-agent] listening on http://127.0.0.1:${port}`);
});
