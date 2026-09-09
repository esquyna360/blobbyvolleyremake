import { ensureIce, iceConfig, iceEndpoint, supabaseInfo } from './transport.ts'

export interface DiagLine { label: string; ok: boolean | null; info: string }

const ms = (t: number) => `${Math.round(performance.now() - t)}ms`

async function withTimeout<T>(p: Promise<T>, t: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), t))])
}

/** Junta as candidatas ICE de uma conexão de teste e diz que tipos apareceram. */
function gather(policy: RTCIceTransportPolicy): Promise<{ types: Set<string>; err: string }> {
  return new Promise(resolve => {
    const types = new Set<string>()
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ ...iceConfig(), iceTransportPolicy: policy })
    } catch (e) {
      resolve({ types, err: String(e).slice(0, 80) })
      return
    }
    const done = () => { try { pc.close() } catch { /* ignore */ } resolve({ types, err: '' }) }
    const timer = setTimeout(done, 6000)
    pc.onicecandidate = ev => {
      if (!ev.candidate) { clearTimeout(timer); done(); return }
      const m = /\btyp (\w+)/.exec(ev.candidate.candidate)
      if (m) types.add(m[1])
    }
    pc.createDataChannel('d')
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => {
      clearTimeout(timer)
      types.clear()
      resolve({ types, err: String(e).slice(0, 80) })
    })
  })
}

/** Dois peers no mesmo navegador: se isto falhar, o problema é o navegador, não a rede. */
function loopback(): Promise<string> {
  return new Promise(resolve => {
    let a: RTCPeerConnection, b: RTCPeerConnection
    try {
      a = new RTCPeerConnection({ iceServers: [] })
      b = new RTCPeerConnection({ iceServers: [] })
    } catch (e) { resolve(`falhou: ${String(e).slice(0, 60)}`); return }
    const end = (r: string) => {
      clearTimeout(timer)
      try { a.close(); b.close() } catch { /* ignore */ }
      resolve(r)
    }
    const timer = setTimeout(() => end('não abriu em 6s'), 6000)
    a.onicecandidate = e => { if (e.candidate) void b.addIceCandidate(e.candidate) }
    b.onicecandidate = e => { if (e.candidate) void a.addIceCandidate(e.candidate) }
    const dc = a.createDataChannel('t')
    dc.onopen = () => end('ok')
    dc.onerror = () => end('erro no canal')
    void (async () => {
      try {
        const offer = await a.createOffer()
        await a.setLocalDescription(offer)
        await b.setRemoteDescription(offer)
        const answer = await b.createAnswer()
        await b.setLocalDescription(answer)
        await a.setRemoteDescription(answer)
      } catch (e) { end(`falhou: ${String(e).slice(0, 60)}`) }
    })()
  })
}

function wsProbe(url: string): Promise<string> {
  return new Promise(resolve => {
    const t0 = performance.now()
    let ws: WebSocket
    try { ws = new WebSocket(url) } catch (e) { resolve(`bloqueado: ${String(e).slice(0, 50)}`); return }
    const end = (r: string) => { clearTimeout(timer); try { ws.close() } catch { /* ignore */ } resolve(r) }
    const timer = setTimeout(() => end('sem resposta em 8s'), 8000)
    ws.onopen = () => end(`ok (${ms(t0)})`)
    ws.onerror = () => end('recusado — firewall/proxy bloqueando WebSocket?')
  })
}

export async function runDiag(onLine: (l: DiagLine) => void) {
  const push = (label: string, ok: boolean | null, info: string) => onLine({ label, ok, info })

  push('página', null, location.origin)
  push('navegador', null, navigator.userAgent.slice(0, 90))
  const hasRtc = typeof RTCPeerConnection === 'function'
  push('WebRTC', hasRtc, hasRtc ? 'disponível' : 'RTCPeerConnection não existe neste navegador')
  if (!hasRtc) return

  const t0 = performance.now()
  push('WebRTC local', null, 'testando…')
  const lb = await loopback()
  push('WebRTC local', lb === 'ok', lb === 'ok' ? `ok (${ms(t0)})` : lb)

  const sb = supabaseInfo()
  const t1 = performance.now()
  let rest = 'sem resposta'
  let restOk = false
  try {
    const r = await withTimeout(
      fetch(`${sb.url}/rest/v1/`, { headers: { apikey: sb.key } }),
      8000, null as unknown as Response)
    if (r) { restOk = r.status < 500; rest = `HTTP ${r.status} (${ms(t1)})` }
  } catch (e) { rest = `falhou: ${String(e).slice(0, 60)}` }
  push('signaling HTTP', restOk, rest)

  push('signaling WebSocket', null, 'testando…')
  const ws = await wsProbe(`${sb.url.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${sb.key}&vsn=1.0.0`)
  push('signaling WebSocket', ws.startsWith('ok'), ws)

  const t2 = performance.now()
  let turn = 'sem resposta'
  let turnOk = false
  try {
    const r = await withTimeout(fetch(iceEndpoint()), 8000, null as unknown as Response)
    if (r) {
      const j = r.ok ? (await r.json()) as { iceServers?: RTCIceServer[] } : null
      const n = j?.iceServers?.filter(s => String(s.urls).includes('turn')).length ?? 0
      turnOk = n > 0
      turn = turnOk ? `${n} servidor(es) TURN (${ms(t2)})` : `HTTP ${r.status} sem TURN`
    }
  } catch (e) { turn = `falhou: ${String(e).slice(0, 60)} (bloqueio de origem ou adblock)` }
  push('credencial TURN', turnOk, turn)

  await ensureIce()

  push('candidatas ICE', null, 'testando…')
  const all = await gather('all')
  const t = [...all.types]
  push('candidatas ICE', t.includes('srflx') || t.includes('relay'),
    all.err || (t.length ? t.join(', ') : 'nenhuma — UDP bloqueado?'))

  push('TURN na prática', null, 'testando…')
  const rel = await gather('relay')
  push('TURN na prática', rel.types.has('relay'),
    rel.err || (rel.types.has('relay') ? 'relay ok' : 'nenhuma candidata relay — TURN inacessível daqui'))
}
