import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // 项目型 GitHub Pages 仓库 → 资源前缀必须是仓库名
  base: '/zhongdun-tech-web/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: r('./index.html'),
        products: r('./products/index.html'),
        dx: r('./products/dx.html'),
        rx: r('./products/rx.html'),
        ex: r('./products/ex.html'),
        about: r('./about.html'),
        contact: r('./contact.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
