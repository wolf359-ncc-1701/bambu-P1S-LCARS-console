// 以生产模式启动 p1screen 后端（静态页面 + /tls 隧道 + /api/https 转发），端口 8888。
// 需要先执行 npm run build:web 和 npm run build:server。
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
process.env.PORT ??= '8888'
process.env.NODE_ENV ??= 'production'
await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href)
