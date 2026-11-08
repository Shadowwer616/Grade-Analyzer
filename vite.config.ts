/// <reference types="vitest/config" />
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 阶段 6：pdf.js 抽中文 PDF 的文字需要 CMap 文件。构建时复制到 dist/pdfjs/cmaps/，开发时直接从 node_modules 提供。
// 只有打开这类 PDF 时才按需下载对应的一两个文件。
const CMAPS = fileURLToPath(new URL('./node_modules/pdfjs-dist/cmaps', import.meta.url));

function pdfjsCmaps(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdfjs-cmaps',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs/cmaps', (req, res, next) => {
        const file = join(CMAPS, decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, ''));
        if (!file.startsWith(CMAPS) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(outDir)) cpSync(CMAPS, join(outDir, 'pdfjs/cmaps'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsCmaps()],
  // 相对路径，方便部署到 GitHub Pages 子路径或 Vercel
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
