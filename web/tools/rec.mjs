/**
 * Grava um trecho do jogo pelo screencast do CDP.
 *   node tools/rec.mjs <outdir> <segundos> '<js de setup>'
 * Salva frames jpeg + frames.txt (concat demuxer do ffmpeg, com duração real).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const port = process.env.CDP_PORT || 9223
const [outdir, secsRaw, ...rest] = process.argv.slice(2)
const secs = Number(secsRaw || 5)
const setup = rest.join(' ') || '1'
const W = +(process.env.RW || 1280), H = +(process.env.RH || 720)

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const list = await fetch(`http://localhost:${port}/json`).then(r => r.json())
const page = list.find(p => p.type === 'page' && p.url.includes(process.env.DEV_PORT || '5182')) ?? list.find(p => p.type === 'page')
if (!page) { console.error('nenhuma página'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
const frames = []
let recording = false

ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Page.screencastFrame') {
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId })
    if (!recording) return
    const n = frames.length
    const name = `f${String(n).padStart(5, '0')}.jpg`
    writeFileSync(join(outdir, name), Buffer.from(m.params.data, 'base64'))
    frames.push({ name, t: m.params.metadata.timestamp })
  }
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

ws.addEventListener('open', async () => {
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  const url = process.env.URL || 'http://localhost:5180/'
  if (process.env.RELOAD || process.env.URL) { await send('Page.navigate', { url }); await sleep(+(process.env.LOAD || 2800)) }
  const r = await send('Runtime.evaluate', { expression: setup, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.result?.exceptionDetails) { console.error('ERRO setup', r.result.exceptionDetails.exception?.description); process.exit(1) }
  const who = await send('Runtime.evaluate', { expression: 'document.title+" @ "+location.pathname', returnByValue: true })
  console.error('pagina:', who.result?.result?.value)
  await sleep(+(process.env.WARM || 600))
  await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  recording = true
  await sleep(secs * 1000)
  recording = false
  await send('Page.stopScreencast')

  if (frames.length < 2) { console.error('poucos frames'); process.exit(1) }
  const lines = []
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1 ? frames[i + 1].t - frames[i].t : 1 / 60
    lines.push(`file '${frames[i].name}'`, `duration ${Math.max(0.004, dur).toFixed(5)}`)
  }
  lines.push(`file '${frames[frames.length - 1].name}'`)
  writeFileSync(join(outdir, 'frames.txt'), lines.join('\n'))
  const span = frames[frames.length - 1].t - frames[0].t
  console.log(JSON.stringify({ frames: frames.length, span: +span.toFixed(2), fps: +(frames.length / span).toFixed(1) }))
  ws.close(); process.exit(0)
})
