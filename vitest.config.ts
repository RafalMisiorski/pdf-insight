import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Unit tests run in Node: the Workers-only module is replaced by a small stand-in.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      alias: {
        'cloudflare:workers': fileURLToPath(
          new URL('./worker/test/cloudflare-workers.ts', import.meta.url),
        ),
      },
    },
  }),
)
