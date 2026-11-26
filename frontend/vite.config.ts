import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import path from 'node:path'
import { execSync } from 'node:child_process'
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import postCssPresetEnv from 'postcss-preset-env'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { zipSync } from 'fflate'
import type { Plugin } from 'vite'

const getGitText = (command: string) => {
  try {
    return execSync(command, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// the release tag from CI, else the nearest git tag (v0.13.1-lcars.1), so a local build shows it too
const tag = process.env.TAG_NAME?.trim() || getGitText('git describe --tags --abbrev=0') || 'dev'
// LEGACY=0 drops the nomodule bundle for old WebViews (Chrome 57 on Android 7). A modern
// phone (LG G7 on Android 13+) never loads it anyway; leaving it out only speeds up builds.
const withLegacy = process.env.LEGACY !== '0'
const commitHash = getGitText('git rev-parse --short=7 HEAD')
// one id per build: the page compares it with /version.json to find out it is stale
const buildId = `${commitHash || 'local'}-${Date.now().toString(36)}`

/* After a build: version.json (the build id) and web.zip (the whole build, for the Android
   shell's updater, which installs a build only as a complete, checksummed unit). The zip
   carries its own version.json without the checksum, so the installed copy serves the
   build id from the same place. */
const webBundle = (): Plugin => {
  // only a build that wrote its files is packed: a failed build must not stamp the old files
  let wrote = false
  return {
    name: 'web-bundle',
    apply: 'build',
    writeBundle() { wrote = true },
    closeBundle(err?: Error) {
      if (err || !wrote) return
      const out = path.resolve(__dirname, '../dist/web')
      if (!fs.existsSync(out)) return
      const files: Record<string, Uint8Array> = {}
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name)
          const rel = path.relative(out, full).split(path.sep).join('/')
          if (e.isDirectory()) walk(full)
          else if (rel !== 'web.zip' && rel !== 'version.json') files[rel] = fs.readFileSync(full)
        }
      }
      walk(out)
      const built = new Date().toISOString()
      files['version.json'] = Buffer.from(JSON.stringify({ version: buildId, built }))
      const zip = zipSync(files, { level: 6 })
      fs.writeFileSync(path.join(out, 'web.zip'), zip)
      const sha256 = crypto.createHash('sha256').update(zip).digest('hex')
      fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version: buildId, built, bundle: 'web.zip', size: zip.length, sha256 }))
    },
  }
}

export default defineConfig({
  root: path.resolve(__dirname),
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(`${tag}-${commitHash}`),
    __BUILD_ID__: JSON.stringify(buildId),
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
    webBundle(),
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
