import { GoogleGenAI } from '@google/genai';
import { createApp } from '../server/app.ts';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY environment variable is required');
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

// Export Express app as the Vercel serverless handler.
// disablePlaywrightJdFallback prevents the Playwright/Chromium fallback
// (a devDependency that can't run in serverless environments).
export default createApp({
  getAI,
  disablePlaywrightJdFallback: true,
});
