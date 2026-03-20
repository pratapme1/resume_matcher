import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createApp } from './server/app.ts';

const PORT = 3000;

// Load `.env.local` first so local development matches the README and Vite behavior.
dotenv.config({ path: '.env.local' });
dotenv.config();

let ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function startServer() {
  const app = createApp({ getAI });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use((await import('express')).default.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
