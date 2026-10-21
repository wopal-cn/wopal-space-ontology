import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    name: 'dsh-sandbox-roots/host',
    entry: { index: 'src/index.ts', fs: 'src/fs.ts', sandbox: 'src/sandbox.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: true,
  },
])