import http from 'node:http'
import path from 'node:path'
import tls from 'node:tls'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import express from 'express'
import { WebSocketServer } from 'ws'

const WEB_PORT = Number(process.env.PORT ?? '8889')
const WEB_ROOT = path.resolve(process.cwd(), 'dist/web')
const LOG_DIR = path.resolve(process.cwd(), process.env.LOG_DIR ?? 'logs')
const LOG_MAX_BYTES = 2 * 1024 * 1024
const EOL = String.fromCharCode(10)
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-powered-by',
])
const DEFAULT_PROXY_HEADERS = {
  'User-Agent': 'bambu_network_agent/01.09.05.01',
  'Accept-Encoding': 'gzip, deflate',
}
const FORCED_PROXY_HEADERS = new Set(Object.keys(DEFAULT_PROXY_HEADERS).map(name => name.toLowerCase()))

const app = express()
app.disable('x-powered-by')

const buildProxyTargetUrl = (req: express.Request) => {
  const rawPath = req.originalUrl.split('?')[0] ?? ''
  const encodedTarget = rawPath.slice('/api/https'.length).replace(/^\/+/, '')
  if (!encodedTarget) {
    throw new Error('Missing target host')
  }

  const [targetHost, ...targetPathParts] = encodedTarget.split('/')
  if (!targetHost) {
    throw new Error('Missing target host')
  }

  const targetPath = targetPathParts.length > 0 ? `/${targetPathParts.join('/')}` : '/'
  const target = new URL(`https://${targetHost}${targetPath}`)

  const queryIndex = req.originalUrl.indexOf('?')
  if (queryIndex >= 0) {
    target.search = req.originalUrl.slice(queryIndex)
  }
  return target
}

const buildProxyHeaders = (req: express.Request) => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(DEFAULT_PROXY_HEADERS)) {
    headers.set(name, value)
  }
  for (const [name, value] of Object.entries(req.headers)) {
    const lowerName = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lowerName) || FORCED_PROXY_HEADERS.has(lowerName)) {
      continue
    }
    if (Array.isArray(value)) {
      value.forEach(item => headers.append(name, item))
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  return headers
}

const handleHttpProxy: express.RequestHandler = async (req, res) => {
  let target: URL
  try {
    target = buildProxyTargetUrl(req)
  } catch (err: any) {
    res.status(400).send(err.message)
    return
  }

  const method = req.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  try {
    const response = await fetch(target, {
      method,
      headers: buildProxyHeaders(req),
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
    } as RequestInit & { duplex?: 'half' })

    res.status(response.status)
    response.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        res.append(name, value)
      }
    })

    if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res)
    } else {
      res.end()
    }
  } catch (err) {
    console.error('[server] http proxy error:', err)
    res.status(502).send('Bad Gateway')
  }
}

app.all('/api/https/*', handleHttpProxy)

/* Front-end errors, posted in small batches by the console, appended to logs/frontend.log
   (one JSON object per line; the file rolls over to frontend.log.1 at 2 MB). */
const stamp = (at: unknown) => {
  const d = new Date(Number(at) || Date.now())
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString()
}
app.post('/api/log', express.json({ limit: '64kb' }), (req, res) => {
  const body = req.body ?? {}
  const entries: { at?: unknown, msg?: unknown }[] = Array.isArray(body.entries)
    ? body.entries.slice(0, 50).filter((e: unknown) => e !== null && typeof e === 'object')
    : []
  if (!entries.length) {
    res.status(204).end()
    return
  }
  const from = req.socket.remoteAddress ?? ''
  const lines = entries.map(e => JSON.stringify({
    at: stamp(e.at),
    from,
    build: String(body.build ?? '').slice(0, 64),
    url: String(body.url ?? '').slice(0, 200),
    msg: String(e.msg ?? '').slice(0, 2000),
  })).map(l => `${l}${EOL}`).join('')
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const file = path.join(LOG_DIR, 'frontend.log')
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, `${file}.1`)
    fs.appendFileSync(file, lines)
    res.status(204).end()
  } catch (err) {
    console.error('[log] write failed:', err)
    res.status(500).end()
  }
})
app.get('/api/log', (_req, res) => {
  const file = path.join(LOG_DIR, 'frontend.log')
  if (!fs.existsSync(file)) {
    res.type('text/plain').send('')
    return
  }
  res.type('text/plain').sendFile(file)
})

// the page polls these to notice a new build; they must never come from a cache
app.use(['/index.html', '/version.json'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/', express.static(WEB_ROOT, {
  setHeaders: (res, file) => {
    if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store')
  },
}))

const server = http.createServer(app)
const tlsProxy = new WebSocketServer({ server, path: '/tls' })

/* ---- camera fan-out ----
   The printer's camera (TLS port 6000) is weak: it serves one or two clients at most. All
   viewers of one camera (same host, same login) share a single upstream connection; the
   backend cuts the stream into frames and sends each complete frame to every viewer, the
   newest frame at once to a viewer that joins. The upstream closes a few seconds after the
   last viewer leaves, and when no frame arrives for a while (the clients reconnect). */
type WsClient = import('ws').WebSocket
type CamGroup = { key: string, up: tls.TLSSocket, subs: Set<WsClient>, last: Buffer | null, idle?: NodeJS.Timeout, stall?: NodeJS.Timeout }
const CAM_FRAME_MAX = 4 * 1024 * 1024
const camGroups = new Map<string, CamGroup>()

const dropGroup = (g: CamGroup, reason: string) => {
  if (camGroups.get(g.key) !== g) return
  camGroups.delete(g.key)
  clearTimeout(g.idle)
  clearTimeout(g.stall)
  console.info(`[camera] closing ${g.key.split('|')[0]}: ${reason}`)
  g.up.destroy()
  for (const s of g.subs) s.close()
}

const openGroup = (key: string, host: string, port: number, auth: Buffer): CamGroup => {
  const up = tls.connect({ host, port, rejectUnauthorized: false })
  const g: CamGroup = { key, up, subs: new Set(), last: null }
  camGroups.set(key, g)
  const armStall = () => {
    clearTimeout(g.stall)
    g.stall = setTimeout(() => dropGroup(g, 'no frames'), 20000)
  }
  // the watchdog also covers a connect or handshake that never finishes
  armStall()
  let buf: Buffer = Buffer.alloc(0)
  up.on('secureConnect', () => {
    console.info(`[camera] upstream ${host}:${port} connected`)
    up.write(auth)
    armStall()
  })
  up.on('data', (chunk: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    while (buf.length >= 16) {
      const size = buf.readUInt32LE(0)
      if (size <= 0 || size > CAM_FRAME_MAX) {
        dropGroup(g, 'stream out of step')
        return
      }
      if (buf.length < 16 + size) break
      const frame = buf.subarray(0, 16 + size)
      buf = buf.subarray(16 + size)
      g.last = Buffer.from(frame)
      armStall()
      for (const s of g.subs) {
        if (s.readyState === s.OPEN && s.bufferedAmount < 8 * 1024 * 1024) s.send(g.last, { binary: true })
      }
    }
  })
  up.on('error', err => dropGroup(g, `tls error: ${err.message}`))
  up.on('close', () => dropGroup(g, 'tls closed'))
  return g
}

const joinCamera = (socket: WsClient, host: string, port: number, remote: string) => {
  // an error before the login would otherwise be unhandled; 'close' follows and cleans up
  socket.on('error', () => socket.terminate())
  // the first message is the 80-byte login; viewers with the same login share a stream
  socket.once('message', (raw: Buffer) => {
    const auth = Buffer.from(raw)
    if (auth.length !== 80) {
      socket.close()
      return
    }
    const key = `${host}:${port}|${crypto.createHash('sha256').update(auth).digest('hex')}`
    const g = camGroups.get(key) ?? openGroup(key, host, port, auth)
    clearTimeout(g.idle)
    g.subs.add(socket)
    console.info(`[camera][${remote}] joined ${host} (${g.subs.size} viewer(s))`)
    if (g.last) socket.send(g.last, { binary: true })
    const leave = () => {
      if (!g.subs.delete(socket)) return
      if (!g.subs.size) g.idle = setTimeout(() => dropGroup(g, 'no viewers'), 5000)
    }
    socket.on('close', leave)
    socket.on('error', leave)
  })
}

tlsProxy.on('connection', (socket, req) => {
  const remote = req.socket.remoteAddress + ':' + req.socket.remotePort
  const reqUrl = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
  const encodedTargetUrl = reqUrl.searchParams.get('url')

  if (!encodedTargetUrl) {
    console.error(`[tls-proxy][${remote}] missing url query`)
    socket.close()
    return
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(encodedTargetUrl)
  } catch {
    console.error(`[tls-proxy][${remote}] invalid url: ${encodedTargetUrl}`)
    socket.close()
    return
  }

  if (!['mqtts:', 'tls:'].includes(targetUrl.protocol)) {
    console.error(`[tls-proxy][${remote}] unsupported protocol: ${targetUrl.protocol}`)
    socket.close()
    return
  }

  const targetHost = targetUrl.hostname
  const targetPort = Number(targetUrl.port)
  if (!targetHost || Number.isNaN(targetPort) || targetPort <= 0 || targetPort > 65535) {
    console.error(`[tls-proxy][${remote}] invalid target: ${targetUrl.toString()}`)
    socket.close()
    return
  }

  if (targetPort === 6000) {
    joinCamera(socket, targetHost, targetPort, remote)
    return
  }

  console.info(`[tls-proxy][${remote}] connecting to ${targetHost}:${targetPort}`)
  const tlsSocket = tls.connect({
    host: targetHost,
    port: targetPort,
    rejectUnauthorized: false,
  })

  let closed = false
  const closeBoth = (reason: string) => {
    if (closed) {
      return
    }
    closed = true
    console.info(`[tls-proxy][${remote}] closing bridge: ${reason}`)
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CLOSING) {
      socket.close()
    }
    if (!tlsSocket.destroyed) {
      tlsSocket.destroy()
    }
  }

  tlsSocket.on('secureConnect', () => {
    console.info(`[tls-proxy][${remote}] tls connected to ${targetHost}:${targetPort}`)
  })

  tlsSocket.on('data', (chunk) => {
    if (socket.readyState !== socket.OPEN) {
      closeBoth('ws not open on tls->ws data')
      return
    }
    socket.send(chunk, { binary: true }, (err) => {
      if (err) {
        console.error(`[tls-proxy][${remote}] ws send failed: ${err.message}`)
        closeBoth('ws send failure')
      }
    })
  })

  tlsSocket.on('end', () => {
    closeBoth('tls end')
  })

  tlsSocket.on('close', () => {
    closeBoth('tls close')
  })

  tlsSocket.on('error', (err) => {
    console.error(`[tls-proxy][${remote}] tls error: ${err.message}`)
    closeBoth('tls error')
  })

  socket.on('message', (raw: Buffer) => {
    if (tlsSocket.destroyed) {
      closeBoth('tls already destroyed on ws->tls data')
      return
    }
    const chunk = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    tlsSocket.write(chunk, (err) => {
      if (err) {
        console.error(`[tls-proxy][${remote}] tls write failed: ${err.message}`)
        closeBoth('tls write failure')
      }
    })
  })

  socket.on('close', () => {
    closeBoth('ws close')
  })

  socket.on('error', (err) => {
    console.error(`[tls-proxy][${remote}] ws error: ${err.message}`)
    closeBoth('ws error')
  })
})

const start = async () => {
  server.listen(WEB_PORT, () => {
    console.log(`[server] listening on ${WEB_PORT}`)
    if (process.env.NODE_ENV === 'production') {
      console.log(`[server] WEB_ROOT=${WEB_ROOT}`)
    }
  })
}

start().catch((err) => {
  console.error('[server] failed to start', err)
  process.exit(1)
})
