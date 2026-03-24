import { createApp } from '../server/app.ts';
import type { Request, Response } from 'express';
import { createGeminiAIClient, createOpenRouterPerplexityClient, createOpenRouterQwenClient } from '../server/ai.ts';

// createApp is called at module load (cold start). Wrap so any init crash
// returns JSON instead of FUNCTION_INVOCATION_FAILED with no details.
let handler: ReturnType<typeof createApp> | null = null;
let initFailed = false;

try {
  handler = createApp({
    getAI: () => createGeminiAIClient(),
    getTailorFallbackAI: () => createOpenRouterQwenClient(),
    getSearchAI: () => {
      try {
        return createOpenRouterPerplexityClient();
      } catch {
        return createGeminiAIClient();
      }
    },
    getSearchFallbackAI: () => createGeminiAIClient(),
    disablePlaywrightJdFallback: true,
  });
} catch (err) {
  initFailed = true;
  console.error('[api/index] createApp failed:', err);
}

export default function (req: Request, res: Response) {
  if (initFailed || !handler) {
    res.status(500).json({ error: 'Server initialization failed' });
    return;
  }
  handler(req, res);
}
