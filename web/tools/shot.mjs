/**
 * Avalia JS numa página do Chrome headless e tira screenshot.
 *   CDP_PORT=9223 node tools/shot.mjs out.png 'expressão js'
 */
import { writeFileSync } from 'node:fs'
const port = process.env.CDP_PORT || 9223
const [out, ...rest] = process.argv.slice(2)
const expr = rest.join(' ') || '1'
const list = await fetch(`http://localhost:${port}/json`).then(r => r.json())
const page = list.find(p => p.type === 'page' && p.url.includes('5180')) ?? list.find(p => p.type === 'page')
if (!page) { console.error('nenhuma página'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
ws.addEventListener('open', async () => {
  if (process.env.VW) await send('Emulation.setDeviceMetricsOverride', { width: +process.env.VW, height: +process.env.VH, deviceScaleFactor: 2, mobile: true })
  if (process.env.TOUCH) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }) }
  if (!page.url.includes('5180') || process.env.RELOAD) { await send('Page.navigate', { url: 'http://localhost:5180/' }); await new Promise(r => setTimeout(r, 2500)) }
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.result?.exceptionDetails) console.error('ERRO', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
  else console.log(JSON.stringify(r.result?.result?.value ?? null))
  if (out !== '-') {
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })
    writeFileSync(out, Buffer.from(s.result.data, 'base64'))
  }
  ws.close(); process.exit(0)
})
