import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 로컬 개발 시 `vercel dev`(기본 3000번 포트)로 띄운 서버리스 함수로 프록시.
    // 배포 환경(Vercel)에서는 /api 가 자동으로 서버리스 함수로 라우팅되므로 별도 설정 불필요.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
