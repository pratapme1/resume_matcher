// Resume Tailor Pro — Content Script
// Runs on all pages. Three responsibilities:
//   1. JD extraction: return page text to popup on request
//   2. pendingJD bridge: deliver stored JD to the app when it loads at localhost
//   3. Form pre-fill: fill application form fields and highlight the rest

// ── Bridge: page ↔ extension ─────────────────────────────────────────────────
// window.postMessage crosses the isolated-world boundary between page JS and content script.
window.addEventListener('message', async (e: MessageEvent) => {
  if (e.source !== window) return;

  // App is pinging to detect if the extension is installed
  if (e.data?.type === 'RTP_PING') {
    window.postMessage({ type: 'RTP_PONG' }, '*');
    return;
  }

  // Guard: remaining handlers need storage access
  if (!chrome?.storage) return;

  try {
  // App (at localhost) is asking for the pending JD
  if (e.data?.type === 'RTP_REQUEST_JD') {
    const result = await chrome.storage.local.get('pendingJD');
    if (result.pendingJD) {
      window.postMessage({ type: 'RTP_DELIVER_JD', text: result.pendingJD }, '*');
      await chrome.storage.local.remove('pendingJD');
    }
    return;
  }

  // App signals it downloaded a resume — cache contact info for form filling
  if (e.data?.type === 'RTP_PREFILL') {
    await chrome.storage.local.set({ rtp_prefill: e.data.data });
    console.log('[RTP] prefill stored', e.data.data);
  }

  // App (Step 4) is arming auto-fill for the next page opened
  if (e.data?.type === 'RTP_ARM_AUTOFILL') {
    await chrome.storage.local.set({ autoFillArmed: true });
    console.log('[RTP] autofill armed');
  }
  } catch (err) { console.warn('[RTP] storage error:', err); }
});

// ── Messages from popup ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_JD') {
    sendResponse({ text: document.body.innerText, url: window.location.href });
    return true;
  }

  if (message.type === 'FILL_FORM') {
    fillApplicationForm(message.data).then(sendResponse);
    return true;
  }
});

// ── Form filler ───────────────────────────────────────────────────────────────
interface PrefillData {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
}

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

  try {
    const response = await fetch('http://localhost:3000/api/smart-fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: fields.map(({ name, label, placeholder, type }) => ({ name, label, placeholder, type })),
        prefill: data,
      }),
    });
    if (response.ok) {
      const { mapping } = await response.json() as { mapping: Record<string, string | null> };
      console.log('[RTP] AI mapping:', mapping);
      return applyMapping(fields, mapping);
    }
  } catch (err) {
    console.warn('[RTP] smart-fill API failed, falling back to regex:', err);
  }

  // Fallback: simple regex matching
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

function getFieldLabel(el: HTMLInputElement | HTMLTextAreaElement): string {
  if (el.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const parentLbl = el.closest('label');
  if (parentLbl?.textContent) return parentLbl.textContent.trim();
  return el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '';
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

function isHiddenOrReadonly(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  return (
    el.type === 'hidden' ||
    el.readOnly ||
    el.disabled ||
    el.offsetParent === null
  );
}

function highlight(el: Element, color: string) {
  (el as HTMLElement).style.outline = `2px solid ${color}`;
  (el as HTMLElement).style.outlineOffset = '2px';
}

// ── Auto-fill on page load (triggered by Step 4 "Open & Auto-Fill") ───────────
async function checkAutoFill() {
  const { autoFillArmed, rtp_prefill } = await chrome.storage.local.get(['autoFillArmed', 'rtp_prefill']);
  console.log('[RTP] checkAutoFill armed=', autoFillArmed, 'prefill=', rtp_prefill);
  if (autoFillArmed && rtp_prefill) {
    await chrome.storage.local.remove('autoFillArmed');
    // Wait for SPA to settle before filling
    setTimeout(() => fillApplicationForm(rtp_prefill as PrefillData).catch(console.error), 1500);
  }
}
checkAutoFill().catch(() => {});

// ── Extension-ready signal (lets the app know extension is installed) ─────────
if (window.location.hostname === 'localhost') {
  window.postMessage({ type: 'RTP_EXTENSION_READY' }, '*');
}

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
