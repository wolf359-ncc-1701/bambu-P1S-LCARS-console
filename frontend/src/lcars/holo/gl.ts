/* A tiny WebGL1 line renderer for the holographic wireframes (no three.js).
   - GL_LINES with additive blending: crossings glow brighter, no sorting needed. The canvas
     is transparent (premultiplied), so the page's black shows through.
   - The same orthographic camera as plant3d.project(), computed in the vertex shader, so
     SVG leaders and data cards line up with the lines to the pixel.
   - Depth fog dims the far side; a reveal uniform draws the lines on in order; a scan
     plane brightens lines near its height; heavy groups get a second pass offset by one
     device pixel, which reads as a thicker stroke (lineWidth > 1 is not portable).
   - Groups are drawn one call each with their own colour, alpha, offset and spin. */
import type { Mesh, V3 } from './mesh'
import type { Cam } from '../plant3d'
import { BOX } from '../plant3d'

const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aMeta;
uniform vec3 uCam;      // yaw, pitch, scale
uniform vec4 uView;     // ox, oy, width, height (stage px)
uniform vec3 uCtr;      // rotation centre (mm)
uniform vec3 uOff;      // group offset (mm)
uniform vec4 uSpin;     // pivot xyz, angle
uniform vec3 uAxis;     // spin axis
uniform vec2 uNudge;    // clip-space offset for the heavy pass
uniform vec2 uFog;      // depth near, far
uniform float uReveal;
uniform vec3 uScan;     // z, width, strength
uniform vec2 uLayer;    // progress (0..1), layered on/off
varying float vA;
varying float vScan;
varying float vHot;
void main() {
  vec3 p = aPos;
  if (uSpin.w != 0.0) {
    vec3 q = p - uSpin.xyz;
    float c = cos(uSpin.w), s = sin(uSpin.w);
    q = q * c + cross(uAxis, q) * s + uAxis * dot(uAxis, q) * (1.0 - c);
    p = q + uSpin.xyz;
  }
  p += uOff;
  vec3 r = p - uCtr;
  float cy = cos(uCam.x), sy = sin(uCam.x), cp = cos(uCam.y), sp = sin(uCam.y);
  float X = r.x * cy - r.y * sy;
  float Y = r.x * sy + r.y * cy;
  float px = uView.x + X * uCam.z;
  float py = uView.y - (r.z * cp + Y * sp) * uCam.z;
  gl_Position = vec4(px / uView.z * 2.0 - 1.0 + uNudge.x, 1.0 - py / uView.w * 2.0 + uNudge.y, 0.0, 1.0);
  float depth = Y * cp - r.z * sp;
  float fog = clamp(1.0 - (depth - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  float vis = clamp((uReveal - aMeta.x) * 30.0, 0.0, 1.0);
  float w = aMeta.y;
  vHot = 0.0;
  if (uLayer.y > 0.5) {
    float h = aMeta.z;
    float d = h - uLayer.x;
    vHot = exp(-abs(d) * 60.0) * vis;
    w = d <= 0.0 ? w : w * 0.16;
  }
  vScan = exp(-abs(p.z - uScan.x) / uScan.y) * uScan.z * vis;
  vA = vis * w * mix(0.22, 1.0, fog);
}`

const FS = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uScanColor;
uniform vec3 uHotColor;
uniform float uAlpha;
varying float vA;
varying float vScan;
varying float vHot;
void main() {
  vec3 c = uColor * vA * uAlpha + uScanColor * vScan * uAlpha + uHotColor * vHot * uAlpha;
  // premultiplied: alpha follows the brightest channel, so the page behind shows through
  // and a CSS drop-shadow on the canvas becomes a glow around the lines
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
}`

export type GroupStyle = {
  color: [number, number, number]
  alpha?: number
  off?: V3
  spin?: { pivot: V3, axis: V3, angle: number }
  layered?: number // print progress 0..1 for the model group
  reveal?: number // per-group draw-on progress, overrides the frame's
  hidden?: boolean
}

export type FrameState = {
  cam: Cam
  w: number
  h: number
  reveal: number
  scan?: { z: number, width: number, strength: number }
  groups: Record<string, GroupStyle>
  base: GroupStyle // style for groups not listed
  center?: V3 // rotation centre in scene units (default: the printer box centre)
  fog?: number // half depth range for fog (default 330)
}

const C: V3 = [BOX[0] / 2, BOX[1] / 2, BOX[2] / 2]

let supported: boolean | null = null
export const holoSupported = () => {
  if (supported !== null) return supported
  try {
    const c = document.createElement('canvas')
    supported = !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
  } catch {
    supported = false
  }
  return supported
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.trim().replace('#', '')
  const n = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.slice(0, 6)
  const v = Number.parseInt(n, 16)
  if (!Number.isFinite(v)) return [.4, .8, .95]
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]
}

export class HoloRenderer {
  private gl: WebGLRenderingContext
  private prog: WebGLProgram
  private buf: WebGLBuffer | null = null
  private metaBuf: WebGLBuffer | null = null
  private mesh: Mesh | null = null
  private u: Record<string, WebGLUniformLocation | null> = {}
  private aPos = 0
  private aMeta = 0
  private dpr = 1
  lost = false
  private onLostEvt: (e: Event) => void

  constructor(private canvas: HTMLCanvasElement, onLost?: () => void) {
    const gl = (canvas.getContext('webgl', { alpha: true, antialias: true, depth: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
      || canvas.getContext('experimental-webgl', { alpha: true })) as WebGLRenderingContext | null
    if (!gl) throw new Error('webgl unavailable')
    this.gl = gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const p = gl.createProgram()!
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS)
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
    // the program keeps its own copy
    gl.detachShader(p, vs)
    gl.detachShader(p, fs)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.prog = p
    gl.useProgram(p)
    for (const n of ['uCam', 'uView', 'uCtr', 'uOff', 'uSpin', 'uAxis', 'uNudge', 'uFog', 'uReveal', 'uScan', 'uLayer', 'uColor', 'uScanColor', 'uHotColor', 'uAlpha']) {
      this.u[n] = gl.getUniformLocation(p, n)
    }
    this.aPos = gl.getAttribLocation(p, 'aPos')
    this.aMeta = gl.getAttribLocation(p, 'aMeta')
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    // a lost context (GPU reset, memory pressure) hands the page back to its SVG drawing
    this.onLostEvt = (e: Event) => {
      e.preventDefault()
      this.lost = true
      onLost?.()
    }
    canvas.addEventListener('webglcontextlost', this.onLostEvt)
  }

  setMesh(mesh: Mesh) {
    const gl = this.gl
    if (!this.buf) this.buf = gl.createBuffer()
    if (!this.metaBuf) this.metaBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.meta, gl.STATIC_DRAW)
    this.mesh = mesh
  }

  /* backing store = CSS size x min(device pixels per stage px, cap) */
  resize(w: number, h: number, pixelScale: number) {
    this.dpr = pixelScale
    const bw = Math.max(1, Math.round(w * pixelScale)), bh = Math.max(1, Math.round(h * pixelScale))
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
  }

  draw(f: FrameState) {
    const gl = this.gl
    const mesh = this.mesh
    if (this.lost || !mesh || !this.buf || !this.metaBuf) return
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuf)
    gl.enableVertexAttribArray(this.aMeta)
    gl.vertexAttribPointer(this.aMeta, 3, gl.FLOAT, false, 0, 0)

    const u = this.u
    gl.uniform3f(u.uCam, f.cam.yaw % (Math.PI * 2), f.cam.pitch, f.cam.s)
    gl.uniform4f(u.uView, f.cam.ox, f.cam.oy, f.w, f.h)
    const ctr = f.center ?? C
    gl.uniform3f(u.uCtr, ctr[0], ctr[1], ctr[2])
    // fog over the depth range of the scene seen from this camera
    const span = f.fog ?? 330
    gl.uniform2f(u.uFog, -span, span)
    gl.uniform1f(u.uReveal, f.reveal)
    const sc = f.scan ?? { z: -9999, width: 1, strength: 0 }
    gl.uniform3f(u.uScan, sc.z, sc.width, sc.strength)
    gl.uniform3f(u.uScanColor, .55, .85, 1)
    gl.uniform3f(u.uHotColor, 1, .6, .42)

    const px = 2 / (this.canvas.width || 1), py = 2 / (this.canvas.height || 1)
    for (const g of mesh.groups) {
      const st = f.groups[g.name] ?? f.base
      if (st.hidden || (st.alpha ?? 1) <= 0) continue
      gl.uniform3f(u.uColor, st.color[0], st.color[1], st.color[2])
      gl.uniform1f(u.uAlpha, st.alpha ?? 1)
      const off = st.off ?? [0, 0, 0]
      gl.uniform3f(u.uOff, off[0], off[1], off[2])
      if (st.spin) {
        gl.uniform4f(u.uSpin, st.spin.pivot[0], st.spin.pivot[1], st.spin.pivot[2], st.spin.angle || 1e-6)
        gl.uniform3f(u.uAxis, st.spin.axis[0], st.spin.axis[1], st.spin.axis[2])
      } else {
        gl.uniform4f(u.uSpin, 0, 0, 0, 0)
      }
      gl.uniform2f(u.uLayer, st.layered ?? 0, st.layered === undefined ? 0 : 1)
      gl.uniform1f(u.uReveal, st.reveal ?? f.reveal)
      gl.uniform2f(u.uNudge, 0, 0)
      gl.drawArrays(gl.LINES, g.start, g.count)
      if (g.heavy && this.dpr > 1.2) {
        // the heavy pass: the same lines one device pixel over, at reduced strength
        gl.uniform1f(u.uAlpha, (st.alpha ?? 1) * .55)
        gl.uniform2f(u.uNudge, px, -py)
        gl.drawArrays(gl.LINES, g.start, g.count)
      }
    }
  }

  /* release the context now rather than at GC: WebViews cap live contexts (8-16), and the
     engineering tabs mount and unmount a renderer on every switch */
  dispose() {
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.onLostEvt)
    if (!this.lost) {
      if (this.buf) gl.deleteBuffer(this.buf)
      if (this.metaBuf) gl.deleteBuffer(this.metaBuf)
      gl.deleteProgram(this.prog)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.buf = this.metaBuf = null
    this.mesh = null
  }
}
