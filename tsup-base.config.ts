import { defineConfig } from 'tsup'

export default defineConfig({
  splitting: true,
  clean: true,
  bundle: true,
  dts: true,
  sourcemap: true,
  target: 'es2021',
  format: ['esm', 'cjs'],
  entry: ['src/index.ts'],
  platform: 'browser',
})
