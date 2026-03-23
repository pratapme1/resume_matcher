import React, { useEffect, useState } from 'react';

const BACKEND = 'http://localhost:3000';

type BackendStatus = 'checking' | 'connected' | 'offline';
type ActionStatus = 'idle' | 'busy' | 'done' | 'error';

export default function Popup() {
  const [backend, setBackend] = useState<BackendStatus>('checking');
  const [prefillReady, setPrefillReady] = useState(false);
  const [tailorStatus, setTailorStatus] = useState<ActionStatus>('idle');
  const [fillStatus, setFillStatus] = useState<ActionStatus>('idle');
  const [fillSummary, setFillSummary] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${BACKEND}/api/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => setBackend(r.ok ? 'connected' : 'offline'))
      .catch(() => setBackend('offline'));

    chrome.storage.local.get('rtp_prefill').then(({ rtp_prefill }) => {
      setPrefillReady(!!rtp_prefill);
    });
  }, []);

  async function handleTailorJob() {
    setTailorStatus('busy');
    setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found.');

      const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JD' });
      if (!result?.text) throw new Error('Could not read page text. Try refreshing the page.');

      const res = await fetch(`${BACKEND}/api/extract-jd-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.text }),
      });
      if (!res.ok) throw new Error('Backend could not parse the job description.');
      const normalized = await res.json();

      await chrome.storage.session.set({ pendingJD: normalized.cleanText });

      const appUrl = `${BACKEND}/?from=ext`;
      const existing = await chrome.tabs.query({ url: `${BACKEND}/*` });
      if (existing.length > 0 && existing[0].id) {
        await chrome.tabs.update(existing[0].id, { active: true, url: appUrl });
        if (existing[0].windowId) await chrome.windows.update(existing[0].windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url: appUrl });
      }

      setTailorStatus('done');
      setTimeout(() => window.close(), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setTailorStatus('error');
    }
  }

  async function handleFillForm() {
    setFillStatus('busy');
    setError('');
    try {
      const { rtp_prefill } = await chrome.storage.local.get('rtp_prefill');
      if (!rtp_prefill) throw new Error('No resume data. Download your tailored resume first.');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found.');

      const stats = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM', data: rtp_prefill });
      setFillSummary(
        stats?.filled !== undefined
          ? `${stats.filled} filled · ${stats.highlighted > 0 ? `${stats.highlighted} need attention` : 'all done'}`
          : 'Done',
      );
      setFillStatus('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fill the form.');
      setFillStatus('error');
    }
  }

  const dot = (color: string) => (
    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
  );

  return (
    <div style={{ width: 320, padding: 16, background: '#18181b', color: '#f4f4f5', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {dot(backend === 'connected' ? '#34d399' : backend === 'offline' ? '#f87171' : '#fbbf24')}
        <span style={{ fontWeight: 700, fontSize: 14, color: '#a78bfa' }}>Resume Tailor Pro</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#71717a' }}>
          {backend === 'checking' ? 'Connecting…' : backend === 'connected' ? 'Connected' : 'Backend offline'}
        </span>
      </div>

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* Tailor section */}
      <div style={{ background: '#27272a', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10, lineHeight: 1.5 }}>
          Extract this job description and open Resume Tailor Pro.
        </p>
        <button
          onClick={handleTailorJob}
          disabled={backend !== 'connected' || tailorStatus === 'busy' || tailorStatus === 'done'}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
            background: tailorStatus === 'done' ? '#059669' : '#7c3aed',
            color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: (backend !== 'connected' || tailorStatus !== 'idle') ? 'not-allowed' : 'pointer',
            opacity: backend !== 'connected' ? 0.45 : 1, transition: 'background 0.2s',
          }}
        >
          {tailorStatus === 'busy' ? 'Extracting…' : tailorStatus === 'done' ? '✓ Opening app…' : 'Tailor this job →'}
        </button>
      </div>

      {/* Fill form section */}
      <div style={{ background: '#27272a', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {dot(prefillReady ? '#34d399' : '#52525b')}
          <span style={{ fontSize: 12, color: prefillReady ? '#a1a1aa' : '#52525b', lineHeight: 1.5 }}>
            {prefillReady ? 'Resume data ready — fill this form' : 'Download tailored resume first'}
          </span>
        </div>
        {fillStatus === 'done' && fillSummary && (
          <p style={{ fontSize: 11, color: '#34d399', marginBottom: 8 }}>{fillSummary}</p>
        )}
        <button
          onClick={handleFillForm}
          disabled={!prefillReady || fillStatus === 'busy'}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8,
            background: 'transparent',
            border: `1px solid ${prefillReady ? '#7c3aed' : '#3f3f46'}`,
            color: prefillReady ? '#c4b5fd' : '#52525b',
            fontWeight: 700, fontSize: 13,
            cursor: !prefillReady ? 'not-allowed' : 'pointer',
          }}
        >
          {fillStatus === 'busy' ? 'Filling…' : fillStatus === 'done' ? '✓ Form filled' : 'Fill application form →'}
        </button>
      </div>
    </div>
  );
}
