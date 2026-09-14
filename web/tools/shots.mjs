/**
 * Várias screenshots seguidas da mesma página.
 *   CDP_PORT=9223 node tools/shots.mjs <prefixo> <n> <intervaloMs> '<js de setup>'
 */
import { writeFileSync } from 'node:fs'
const port = process.env.CDP_PORT || 9223
const DEV = process.env.DEV_PORT || '5182'
const [prefix, nRaw, msRaw, ...rest] = process.argv.slice(2)
const n = +(nRaw || 3), ms = +(msRaw || 1000)
const setup = rest.join(' ') || '1'
const list = await fetch(`http://localhost:${port}/json`).then(r => r.json())
const page = list.find(p => p.type === 'page' && p.url.includes(DEV)) ?? list.find(p => p.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise(res => { const m = ++id; pending.set(m, res); ws.send(JSON.stringify({ id: m, method, params })) })
const sleep = t => new Promise(r => setTimeout(r, t))
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
ws.addEventListener('open', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  if (process.env.RELOAD || !page.url.includes(DEV)) { await send('Page.navigate', { url: `http://localhost:${DEV}/?pixel` }); await sleep(3500) }
  const r = await send('Runtime.evaluate', { expression: setup, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.result?.exceptionDetails) console.error('ERRO', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
  await sleep(+(process.env.WARM || 1500))
  for (let i = 0; i < n; i++) {
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${prefix}-${i}.jpg`, Buffer.from(s.result.data, 'base64'))
    await sleep(ms)
  }
  ws.close(); process.exit(0)
})
