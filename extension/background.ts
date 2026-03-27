type ActiveApplyRun = {
  sessionId: string;
  executorMode: 'extension' | 'local_agent';
  targetTabId?: number;
  windowId?: number;
  applyUrl: string;
  apiBaseUrl: string;
  executorToken: string;
  pendingSubmit?: boolean;
};

type LocalAgentHealth = {
  service: 'resume-tailor-local-agent';
  version: string;
  executionMode: 'local_agent';
  playwrightAvailable: boolean;
  browserReady: boolean;
  headless: boolean;
  sessions: number;
  userDataDir: string;
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
          portalType?: string;
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

const APPLY_RUNS_KEY = 'rtp_apply_runs';
const LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:43111';

async function getApplyRuns(): Promise<Record<string, ActiveApplyRun>> {
  const result = await chrome.storage.session.get(APPLY_RUNS_KEY);
  return (result[APPLY_RUNS_KEY] as Record<string, ActiveApplyRun> | undefined) ?? {};
}

async function setApplyRuns(runs: Record<string, ActiveApplyRun>) {
  await chrome.storage.session.set({ [APPLY_RUNS_KEY]: runs });
}

async function saveApplyRun(run: ActiveApplyRun) {
  const runs = await getApplyRuns();
  runs[run.sessionId] = run;
  await setApplyRuns(runs);
}

async function removeApplyRun(sessionId: string) {
  const runs = await getApplyRuns();
  delete runs[sessionId];
  await setApplyRuns(runs);
}

async function getApplyRun(sessionId: string): Promise<ActiveApplyRun | null> {
  const runs = await getApplyRuns();
  return runs[sessionId] ?? null;
}

async function fetchJson(url: string, init: RequestInit, executorToken: string) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${executorToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return response.json();
}

async function getLocalAgentStatus(): Promise<{ status: 'connected' | 'offline'; health?: LocalAgentHealth }> {
  try {
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/health`);
    if (!response.ok) {
      return { status: 'offline' };
    }
    const health = await response.json() as LocalAgentHealth;
    return { status: 'connected', health };
  } catch {
    return { status: 'offline' };
  }
}

async function sendMessageWithRetry(tabId: number, message: unknown, attempts = 20): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError ?? new Error('Target tab is not ready.');
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function buildFallbackScreenshot(run: ActiveApplyRun, status?: string, message?: string): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }

  const width = 1280;
  const height = 720;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#312e81');
  gradient.addColorStop(1, '#0f766e');
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(48, 48, width - 96, height - 96);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 36px sans-serif';
  ctx.fillText('Resume Tailor Apply Checkpoint', 72, 116);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 22px sans-serif';
  ctx.fillText(`Status: ${status ?? 'unknown'}`, 72, 176);
  ctx.fillText(`Session: ${run.sessionId}`, 72, 216);

  const lines = [
    `URL: ${run.applyUrl}`,
    `Message: ${message ?? 'Checkpoint captured without visible-tab access.'}`,
    'Note: This fallback image is generated when the browser runtime does not permit a live tab screenshot.',
  ];
  ctx.font = '400 20px sans-serif';
  let y = 300;
  for (const line of lines) {
    const words = line.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > width - 144) {
        ctx.fillText(current, 72, y);
        y += 34;
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      ctx.fillText(current, 72, y);
      y += 46;
    }
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToBase64(blob);
}

async function captureScreenshot(run: ActiveApplyRun, status?: string, message?: string): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(run.windowId, { format: 'png' });
    const [, base64] = dataUrl.split(',', 2);
    return base64 ?? null;
  } catch {
    return buildFallbackScreenshot(run, status, message);
  }
}

async function postEvent(run: ActiveApplyRun, event: RuntimeMessage['data']['event']) {
  const screenshot = event.includeScreenshot ? await captureScreenshot(run, event.status, event.message) : null;
  return fetchJson(
    `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/events`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...event,
        screenshot,
      }),
    },
    run.executorToken,
  );
}

async function switchExecutorMode(run: ActiveApplyRun, executorMode: 'extension' | 'local_agent', message?: string) {
  run.executorMode = executorMode;
  await saveApplyRun(run);
  await fetchJson(
    `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/executor-mode`,
    {
      method: 'POST',
      body: JSON.stringify({
        executorMode,
        message,
      }),
    },
    run.executorToken,
  );
}

async function startExtensionSession(run: ActiveApplyRun) {
  const tab = await chrome.tabs.create({ url: run.applyUrl, active: true });
  if (!tab.id) {
    throw new Error('Could not open the application tab.');
  }

  run.targetTabId = tab.id;
  run.windowId = tab.windowId;
  await saveApplyRun(run);
  await postEvent(run, {
    status: 'starting',
    message: 'Extension opened the application page.',
    pageUrl: run.applyUrl,
  });
  await sendMessageWithRetry(tab.id, {
    type: 'RTP_EXECUTE_APPLY_SESSION',
    data: {
      sessionId: run.sessionId,
    },
  });
  return { ok: true };
}

async function startApplySession(payload: RuntimeMessage & { type: 'START_APPLY_SESSION' }) {
  if (payload.data.executorMode === 'local_agent') {
    const run: ActiveApplyRun = {
      sessionId: payload.data.sessionId,
      executorMode: 'local_agent',
      applyUrl: payload.data.applyUrl,
      apiBaseUrl: payload.data.apiBaseUrl,
      executorToken: payload.data.executorToken,
    };
    await saveApplyRun(run);
    try {
      const localAgent = await getLocalAgentStatus();
      if (localAgent.status !== 'connected') {
        throw new Error('Local agent is offline.');
      }
      const response = await fetch(`${LOCAL_AGENT_BASE_URL}/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: payload.data.sessionId,
          applyUrl: payload.data.applyUrl,
          apiBaseUrl: payload.data.apiBaseUrl,
          executorToken: payload.data.executorToken,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to start the local agent session.');
      }
      return { ok: true, session: body?.session };
    } catch (error) {
      await switchExecutorMode(
        run,
        'extension',
        'Managed browser was unavailable, so the extension executor took over.',
      );
      return startExtensionSession(run);
    }
  }

  const run: ActiveApplyRun = {
    sessionId: payload.data.sessionId,
    executorMode: 'extension',
    applyUrl: payload.data.applyUrl,
    apiBaseUrl: payload.data.apiBaseUrl,
    executorToken: payload.data.executorToken,
  };
  await saveApplyRun(run);
  return startExtensionSession(run);
}

async function resumeApplySession(payload: RuntimeMessage & { type: 'RESUME_APPLY_SESSION' }) {
  const run = await getApplyRun(payload.data.sessionId);
  if (!run) {
    throw new Error('Apply session is no longer active in the extension.');
  }

  if (run.executorMode === 'local_agent') {
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/sessions/${run.sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      return { ok: true, session: body?.session };
    }

    const sessionResponse = await fetchJson(
      `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/executor-state`,
      { method: 'GET' },
      run.executorToken,
    ) as {
      latestPageUrl?: string;
    };

    const restartUrl = sessionResponse.latestPageUrl || run.applyUrl;
    const restartResponse = await fetch(`${LOCAL_AGENT_BASE_URL}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: run.sessionId,
        applyUrl: restartUrl,
        apiBaseUrl: run.apiBaseUrl,
        executorToken: run.executorToken,
      }),
    });
    const restartBody = await restartResponse.json().catch(() => null);
    if (!restartResponse.ok) {
      throw new Error(restartBody?.error || body?.error || 'Failed to resume the local agent session.');
    }
    return { ok: true, session: restartBody?.session, restarted: true };
  }

  await postEvent(run, {
    status: 'starting',
    message: 'Re-checking the application form.',
  });
  await sendMessageWithRetry(run.targetTabId, {
    type: 'RTP_EXECUTE_APPLY_SESSION',
    data: {
      sessionId: run.sessionId,
    },
  });
  return { ok: true };
}

async function focusApplySession(payload: RuntimeMessage & { type: 'FOCUS_APPLY_SESSION' }) {
  const run = await getApplyRun(payload.data.sessionId);
  if (!run) {
    throw new Error('Apply session is no longer active in the extension.');
  }

  if (run.executorMode === 'local_agent') {
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/sessions/${run.sessionId}/focus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || 'Failed to focus the managed-browser session.');
    }
    return { ok: true, session: body?.session };
  }

  if (typeof run.windowId === 'number') {
    await chrome.windows.update(run.windowId, { focused: true });
  }
  if (typeof run.targetTabId === 'number') {
    await chrome.tabs.update(run.targetTabId, { active: true });
  }
  return { ok: true };
}

async function submitApplySession(payload: RuntimeMessage & { type: 'SUBMIT_APPLY_SESSION' }) {
  const run = await getApplyRun(payload.data.sessionId);
  if (!run) {
    throw new Error('Apply session is no longer active in the extension.');
  }
  if (run.executorMode === 'local_agent') {
    const response = await fetch(`${LOCAL_AGENT_BASE_URL}/sessions/${run.sessionId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || 'Failed to submit through the local agent.');
    }
    return { ok: true, session: body?.session };
  }
  run.pendingSubmit = true;
  await saveApplyRun(run);
  try {
    await sendMessageWithRetry(run.targetTabId, {
      type: 'RTP_SUBMIT_APPLY',
      data: {
        sessionId: run.sessionId,
      },
    });
  } catch (error) {
    run.pendingSubmit = false;
    await saveApplyRun(run);
    throw error;
  }
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RTP] Extension installed.');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') {
    return;
  }

  void (async () => {
    const runs = await getApplyRuns();
    const run = Object.values(runs).find((candidate) => candidate.executorMode === 'extension' && candidate.targetTabId === tabId && candidate.pendingSubmit);
    if (!run) {
      return;
    }

    if (!tab.url || tab.url === run.applyUrl) {
      return;
    }

    run.pendingSubmit = false;
    runs[run.sessionId] = run;
    await setApplyRuns(runs);

    await postEvent(run, {
      status: 'submitted',
      message: 'Application submitted from the live portal.',
      pageUrl: tab.url,
      includeScreenshot: true,
    });

    await fetchJson(
      `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          outcome: 'submitted',
          message: 'Application submitted from the live portal.',
        }),
      },
      run.executorToken,
    );

    await removeApplyRun(run.sessionId);
  })().catch((error) => {
    console.warn('[RTP] submit completion sync failed', error);
  });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'START_APPLY_SESSION':
        return await startApplySession(message);
      case 'RESUME_APPLY_SESSION':
        return await resumeApplySession(message);
      case 'FOCUS_APPLY_SESSION':
        return await focusApplySession(message);
      case 'SUBMIT_APPLY_SESSION':
        return await submitApplySession(message);
      case 'APPLY_GET_PLAN': {
        const run = await getApplyRun(message.data.sessionId);
        if (!run) {
          throw new Error('Apply session is no longer active in the extension.');
        }
        return await fetchJson(
          `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/snapshot`,
          {
            method: 'POST',
            body: JSON.stringify(message.data.snapshot),
          },
          run.executorToken,
        );
      }
      case 'APPLY_EVENT': {
        const run = await getApplyRun(message.data.sessionId);
        if (!run) {
          throw new Error('Apply session is no longer active in the extension.');
        }
        return await postEvent(run, message.data.event);
      }
      case 'APPLY_COMPLETE': {
        const run = await getApplyRun(message.data.sessionId);
        if (!run) {
          throw new Error('Apply session is no longer active in the extension.');
        }
        return await fetchJson(
          `${run.apiBaseUrl}/api/apply/sessions/${run.sessionId}/complete`,
          {
            method: 'POST',
            body: JSON.stringify({
              outcome: message.data.outcome,
              message: message.data.message,
            }),
          },
          run.executorToken,
        );
      }
      case 'GET_LOCAL_AGENT_STATUS':
        return await getLocalAgentStatus();
      default:
        throw new Error('Unsupported message.');
    }
  })()
    .then((response) => sendResponse(response))
    .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Unknown extension error.' }));
  return true;
});
