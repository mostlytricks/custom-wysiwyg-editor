import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    // Point workspace package names at their sources so tests run without a build step.
    alias: {
      '@custom-wysiwyg/core': resolve(root, 'packages/core/src/index.ts'),
      '@custom-wysiwyg/export-html': resolve(root, 'packages/export-html/src/index.ts'),
      '@custom-wysiwyg/export-markdown': resolve(root, 'packages/export-markdown/src/index.ts'),
      '@custom-wysiwyg/react': resolve(root, 'packages/react/src/index.tsx'),
      '@custom-wysiwyg/ui': resolve(root, 'packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
})
