import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import path from 'node:path'
import { execSync } from 'node:child_process'
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import postCssPresetEnv from 'postcss-preset-env'

const getGitText = (command: string) => {
  try {
    return execSync(command, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const tag = process.env.TAG_NAME?.trim() ?? 'dev'
// LEGACY=0 drops the nomodule bundle for old WebViews (Chrome 57 on Android 7). A modern
// phone (LG G7 on Android 13+) never loads it anyway; leaving it out only speeds up builds.
const withLegacy = process.env.LEGACY !== '0'
const commitHash = getGitText('git rev-parse --short=7 HEAD')

export default defineConfig({
  root: path.resolve(__dirname),
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(`${tag}-${commitHash}`),
  },
  plugins: [
    vue(),
    withLegacy && legacy({
      modernPolyfills: [
        'es.array.at',
        'es.typed-array.at',
        'es.global-this',
      ],
      additionalLegacyPolyfills: [
        'abortcontroller-polyfill/dist/abortcontroller-polyfill-only',
      ],
    }),
    Components({
      resolvers: [
        IconsResolver({
          prefix: 'i',
        }),
      ],
      dts: path.resolve(__dirname, 'src/components.d.ts'),
    }),
    Icons({
      compiler: 'vue3',
      autoInstall: false,
    }),
  ],
  css: {
    postcss: {
      plugins: [
        postCssPresetEnv(),
      ]
    }
  },
  server: {
    host: true,
    port: 8888,
    proxy: {
      '/api': 'http://localhost:8889',
      '/tls': {
        target: 'ws://localhost:8889',
        ws: true
      }
    }
  },
  build: {
    assetsInlineLimit: 1024 * 20,
    outDir: path.resolve(__dirname, '../dist/web'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
