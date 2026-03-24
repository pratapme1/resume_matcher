import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Expose Supabase public config to frontend without the VITE_ prefix.
      // These are intentionally public (anon key = public JWT, not a secret).
      '__SUPABASE_URL__': JSON.stringify(env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? ''),
      '__SUPABASE_ANON_KEY__': JSON.stringify(env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
