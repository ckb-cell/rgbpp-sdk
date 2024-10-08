import { defineConfig } from 'tsup';

export default defineConfig({
  name: 'rgbpp',
  dts: true,
  clean: true,
  sourcemap: true,
  format: ['esm', 'cjs'],
  entry: ['src/index.ts', 'src/btc.ts', 'src/ckb.ts', 'src/service.ts'],
});
