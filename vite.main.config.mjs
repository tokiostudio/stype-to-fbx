import { defineConfig } from 'vite';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default defineConfig({
  build: {
    rollupOptions: {
      plugins: [
        resolve({ preferBuiltins: true }),
        commonjs(),
      ],
    },
  },
});
