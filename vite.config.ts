/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径，方便部署到 GitHub Pages 子路径或 Vercel
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
