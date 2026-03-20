import { createServer as createViteServer } from 'vite';
import { createTestApp } from '../helpers/test-app.ts';

async function main() {
  const app = createTestApp();
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.listen(3100, '127.0.0.1', () => {
    console.log('Test server running on http://127.0.0.1:3100');
  });
}

main();
