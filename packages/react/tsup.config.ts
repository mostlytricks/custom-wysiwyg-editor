import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  banner: {
    // Marks the whole package as a client component boundary for Next.js
    // App Router / React Server Components.
    js: "'use client';",
  },
})
