import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@sutra/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@sutra/model-adapters': fileURLToPath(new URL('./packages/model-adapters/src/index.ts', import.meta.url)),
      '@sutra/tool-adapters': fileURLToPath(new URL('./packages/tool-adapters/src/index.ts', import.meta.url)),
      '@sutra/puter-adapter': fileURLToPath(new URL('./packages/puter-adapter/src/index.ts', import.meta.url)),
      '@sutra/workflow-sdk': fileURLToPath(new URL('./packages/workflow-sdk/src/index.ts', import.meta.url)),
      '@sutra/evaluation-sdk': fileURLToPath(new URL('./packages/evaluation-sdk/src/index.ts', import.meta.url)),
      '@sutra/plugin-sdk': fileURLToPath(new URL('./packages/plugin-sdk/src/index.ts', import.meta.url)),
      '@sutra/sdk': fileURLToPath(new URL('./packages/sdk/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
  },
});
