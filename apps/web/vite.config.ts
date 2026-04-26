import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.CW_WEB_PORT ?? 5173),
    proxy: {
      '/trpc': {
        target: `http://localhost:${process.env.CW_SERVER_PORT ?? 4000}`,
        changeOrigin: true,
      },
    },
  },
});
