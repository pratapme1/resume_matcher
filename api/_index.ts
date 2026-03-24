import { GoogleGenAI } from '@google/genai';
import { createApp } from '../server/app.ts';
import type { Request, Response } from 'express';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY environment variable is required');
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

// createApp is called at module load (cold start). Wrap so any init crash
// returns JSON instead of FUNCTION_INVOCATION_FAILED with no details.
let handler: ReturnType<typeof createApp> | null = null;
let initFailed = false;

try {
  handler = createApp({ getAI, disablePlaywrightJdFallback: true });
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
