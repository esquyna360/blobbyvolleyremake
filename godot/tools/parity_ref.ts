/** Mesma sequência de entradas da parity.gd, rodando a física original em TS. */
import { writeFileSync } from 'node:fs'
import { Match, allocState } from '../../web/src/core/match.ts'
import { unpackInput } from '../../web/src/core/input.ts'
import { LEFT } from '../../web/src/core/constants.ts'

const FRAMES = 12000
let seed = 12345
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)

const walls = !process.argv.includes('--open')
const rules = (process.argv.find(a => a.startsWith('--rules=')) ?? '--rules=default').slice(8)
const m = new Match(rules, 99, LEFT, walls)
const s = allocState()
const lines: string[] = []
let lbits = 0, rbits = 0

for (let n = 0; n < FRAMES; n++) {
  if ((next() & 7) === 0) lbits = (next() >>> 3) & 63
  if ((next() & 7) === 0) rbits = (next() >>> 3) & 63
  m.step(unpackInput(lbits), unpackInput(rbits))
  m.save(s)
  const b = Buffer.concat([
    Buffer.from(s.f.buffer, s.f.byteOffset, s.f.byteLength),
    Buffer.from(s.i.buffer, s.i.byteOffset, s.i.byteLength),
  ])
  lines.push(b.toString('hex'))
}
writeFileSync(process.argv[2] ?? 'parity_ts.txt', lines.join('\n'))
console.log('frames', FRAMES)
