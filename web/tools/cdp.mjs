/**
 * Fala com a WebView do Android pelo protocolo do DevTools. Sem isso não dá
 * pra medir nada dentro do app: só sobra screenshot e adivinhação.
 *
 *   node tools/cdp.mjs 'expressão js'
 */
const port = process.env.CDP_PORT || 9222
const list = await fetch(`http://localhost:${port}/json`).then(r => r.json())
const page = list.find(p => p.type === 'page')
if (!page) { console.error('nenhuma página no devtools'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
const expr = process.argv.slice(2).join(' ')
let id = 0
const pending = new Map()

const send = (method, params = {}) => new Promise(res => {
  const n = ++id
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})

ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})

ws.addEventListener('open', async () => {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
  })
  const v = r.result?.result
  if (r.result?.exceptionDetails) {
    console.error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
    ws.close(); process.exit(1)
  }
  console.log(typeof v?.value === 'string' ? v.value : JSON.stringify(v?.value ?? v?.description ?? null))
  ws.close(); process.exit(0)
})
ws.addEventListener('error', e => { console.error('ws erro', e.message ?? e); process.exit(1) })
