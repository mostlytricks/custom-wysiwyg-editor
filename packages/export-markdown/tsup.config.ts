import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    // Self-contained browser build for plain <script> embedding.
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'CustomWysiwygMarkdown',
    noExternal: [/@custom-wysiwyg\//],
    sourcemap: true,
  },
])
