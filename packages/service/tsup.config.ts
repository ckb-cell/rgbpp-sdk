import { defineConfig } from 'tsup';

export default defineConfig({
  name: '@rgbpp-sdk/service',
  dts: true,
  clean: true,
  sourcemap: true,
  format: ['esm', 'cjs'],
  entry: ['src/index.ts'],
});
