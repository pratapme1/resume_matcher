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
  actions: PlannedAction[];
  reviewItems: ReviewItem[];
  nextControlId?: string;
  submitControlId?: string;
};

type FieldHandle =
  | { kind: 'single'; el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }
  | { kind: 'radio-group'; els: HTMLInputElement[] };

type ApplyDomState = {
  sessionId: string;
  fields: Map<string, FieldHandle>;
  controls: Map<string, HTMLElement>;
};

let activeApplyState: ApplyDomState | null = null;
let applyExecutionPromise: Promise<void> | null = null;

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

function getFieldLabel(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const parentLbl = el.closest('label');
  if (parentLbl?.textContent) return parentLbl.textContent.trim();
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
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

function portalTypeForLocation(): 'greenhouse' | 'lever' | 'ashby' | 'generic' | 'protected' | 'unknown' {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('greenhouse')) return 'greenhouse';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('ashbyhq.com')) return 'ashby';
  return 'generic';
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
  const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
  if (/submit|apply now|send application/.test(text)) return 'submit';
  if (/review/.test(text)) return 'review';
  if (/next|continue|save and continue/.test(text)) return 'next';
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
      required: el.required,
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
      required: els.some((el) => el.required),
      visible: true,
      hasValue: els.some((el) => el.checked),
      value: els.find((el) => el.checked)?.value,
      options: els.map((el) => ({
        label: getFieldLabel(el) || el.value,
        value: el.value,
      })),
    });
  });

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

  return {
    url: window.location.href,
    title: document.title,
    portalType: portalTypeForLocation(),
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
    } else {
      handle.els.forEach((el) => highlight(el, '#fbbf24'));
    }
  }
}

async function waitForSettle(ms = 1200) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeApplySession(sessionId: string) {
  if (applyExecutionPromise) {
    await applyExecutionPromise.catch(() => {});
  }

  const run = (async () => {
    await emitApplyEvent(sessionId, {
      status: 'starting',
      message: 'Inspecting the current page.',
      pageUrl: window.location.href,
    });

    await waitForSettle();

    if (detectBotProtection()) {
      await emitApplyEvent(sessionId, {
        status: 'protected',
        message: 'Bot protection detected on this portal.',
        pageUrl: window.location.href,
        includeScreenshot: true,
      });
      await completeApply(sessionId, 'protected', 'Bot protection detected.');
      return;
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const snapshot = collectApplySnapshot(sessionId);
      if (snapshot.fields.length === 0) {
        await emitApplyEvent(sessionId, {
          status: 'manual_required',
          message: 'No supported fields were detected on the current page.',
          pageUrl: window.location.href,
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
        });
        await waitForSettle(1500);
        continue;
      }

      if (plan.status === 'ready_to_submit') {
        showBadge(filled, 0);
        await emitApplyEvent(sessionId, {
          status: 'ready_to_submit',
          message: 'Application is ready for your submit confirmation.',
          filledCount: filled,
          pageUrl: window.location.href,
          includeScreenshot: true,
        });
        return;
      }
    }

    await emitApplyEvent(sessionId, {
      status: 'manual_required',
      message: 'The form needs manual completion after several fill attempts.',
      pageUrl: window.location.href,
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
