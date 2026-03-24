import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { createGeminiAIClient, createOpenRouterQwenClient } from './server/ai.ts';
import { createApp } from './server/app.ts';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Load `.env.local` first so local development matches the README and Vite behavior.
dotenv.config({ path: '.env.local' });
dotenv.config();

export async function startServer() {
  const app = createApp({
    getAI: () => createGeminiAIClient(),
    getTailorFallbackAI: () => createOpenRouterQwenClient(),
  });

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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      console.log('Server shut down gracefully.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

startServer();
