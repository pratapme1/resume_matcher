import type { Request, Response } from 'express';

let handler: ((req: Request, res: Response) => void) | null = null;
let initError: string | null = null;

// Wrap initialization so startup errors surface as 500 JSON instead of crashing the function.
try {
  const { GoogleGenAI } = await import('@google/genai');
  const { createApp } = await import('../server/app.ts');

  let aiInstance: InstanceType<typeof GoogleGenAI> | null = null;
  function getAI() {
    if (!aiInstance) {
      const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY environment variable is required');
      aiInstance = new GoogleGenAI({ apiKey: key });
    }
    return aiInstance;
  }

  handler = createApp({ getAI, disablePlaywrightJdFallback: true });
} catch (err) {
  initError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  console.error('[api/index] Initialization failed:', initError);
}

export default function (req: Request, res: Response) {
  if (initError || !handler) {
    res.status(500).json({ error: 'Server initialization failed', details: initError });
    return;
  }
  handler(req, res);
}
