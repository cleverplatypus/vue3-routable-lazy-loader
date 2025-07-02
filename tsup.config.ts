import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'vite',
    '@babel/parser',
    '@babel/traverse', 
    '@babel/types'
  ],
  minify: false,
  target: 'node16',
  tsconfig: './tsconfig.json',
  platform: 'node'
})
