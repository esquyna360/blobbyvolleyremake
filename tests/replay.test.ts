import test from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../src/core/match.ts'
import { LEFT, RIGHT } from '../src/core/constants.ts'
import { packInput, unpackInput } from '../src/core/input.ts'
import { Recorder, ReplayPlayer, decodeReplay, encodeReplay } from '../src/core/replay.ts'
import type { ReplayMeta } from '../src/core/replay.ts'

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const bits = (r: () => number) =>
  packInput({ left: r() < 0.35, right: r() < 0.35, up: r() < 0.25, special: r() < 0.08, push: r() < 0.05, down: r() < 0.12 })

/**
 * O arquivo guarda só os inputs. Se a simulação não for determinística de ponta
 * a ponta, o replay diverge e mostra outra partida.
 */
test('replay reproduz a partida byte a byte', async () => {
  const m = new Match('default', 15, LEFT)
  const rec = new Recorder()
  const r = rng(4242)
  for (let f = 0; f < 6000 && m.logic.winner < 0; f++) {
    const lb = bits(r), rb = bits(r)
    rec.put(m.frame, lb, rb)
    m.step(unpackInput(lb), unpackInput(rb))
  }
  assert.ok(rec.frames > 500)

  const taken = rec.take()
  const blob = await encodeReplay(taken.l, taken.r)
  const back = await decodeReplay(blob)
  assert.ok(back, 'não decodificou')
  assert.equal(back.l.length, rec.frames)

  const meta: ReplayMeta = {
    rule: 'default', stw: 15, arena: 'default', serve: LEFT,
    nl: 'a', nr: 'b', sl: m.logic.scores[LEFT], sr: m.logic.scores[RIGHT],
    rally: m.logic.rallyBest, frames: rec.frames, mode: 'local', at: 0,
  }
  const rp = new ReplayPlayer(meta, back.l, back.r)
  while (rp.advance()) { /* até o fim */ }

  assert.equal(rp.match.frame, m.frame)
  assert.equal(rp.match.checksum(), m.checksum())
  assert.deepEqual(rp.match.logic.scores, m.logic.scores)

  // volta pro meio e reproduz de novo: tem que bater com quem só andou pra frente
  const half = Math.floor(rec.frames / 2)
  const straight = new ReplayPlayer(meta, back.l, back.r)
  straight.seek(half)
  rp.seek(half)
  assert.equal(rp.match.checksum(), straight.match.checksum())
  assert.ok(m.logic.scores[LEFT] + m.logic.scores[RIGHT] > 0)
})

test('gzip do replay cabe em poucos KB', async () => {
  const n = 9000
  const l = new Uint8Array(n), r = new Uint8Array(n)
  const rnd = rng(9)
  let a = 0, b = 0
  for (let f = 0; f < n; f++) {
    if (rnd() < 0.06) a = bits(rnd)
    if (rnd() < 0.06) b = bits(rnd)
    l[f] = a; r[f] = b
  }
  const blob = await encodeReplay(l, r)
  assert.ok(blob.startsWith('g'), 'não comprimiu')
  assert.ok(blob.length < 20_000, `replay grande demais: ${blob.length} B`)
})
