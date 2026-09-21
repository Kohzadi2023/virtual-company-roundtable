import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET?.trim() || 'http://127.0.0.1:8001';

  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: true,
      port: 5173,
      watch: {
        // Cargo continuously creates and locks binaries under target/ during `tauri dev`.
        // Vite does not need those files for HMR and watching them can raise EBUSY on Windows.
        ignored: ['**/src-tauri/target/**'],
      },
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
  };
});
