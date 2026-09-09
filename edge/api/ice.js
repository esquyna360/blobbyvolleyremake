const ALLOWED = new Set([
  'https://esquyna360.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const TTL = 7200

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  if (!ALLOWED.has(origin)) {
    res.status(403).json({ error: 'origin' })
    return
  }

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const id = process.env.TURN_KEY_ID
  const token = process.env.TURN_KEY_API_TOKEN
  if (!id || !token) {
    res.status(500).json({ error: 'unconfigured' })
    return
  }

  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    })
    if (!r.ok) {
      res.status(502).json({ error: 'turn' })
      return
    }
    const data = await r.json()
    res.status(200).json({ iceServers: data.iceServers, ttl: TTL })
  } catch {
    res.status(502).json({ error: 'turn' })
  }
}
