import { defineConfig } from 'tsup';

import { dependencies, name } from './package.json';

import config from '../../tsup-base.config';

export default defineConfig({
  ...config,
  name,
  entry: ['src/index.ts', 'src/btc.ts', 'src/ckb.ts', 'src/service.ts'],
  external: Object.keys(dependencies),
  platform: 'browser',
});
