import test from 'node:test'
import assert from 'node:assert/strict'
import { Match, allocState } from '../src/core/match.ts'
import { Ev } from '../src/core/events.ts'
import { Rollback } from '../src/net/rollback.ts'
import { LEFT, NO_PLAYER, RIGHT, SPECIAL_FULL } from '../src/core/constants.ts'
import { packInput, unpackInput } from '../src/core/input.ts'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randomBits(r: () => number) {
  return packInput({ left: r() < 0.35, right: r() < 0.35, up: r() < 0.25, special: r() < 0.08, push: r() < 0.05 })
}

test('simulation is deterministic for the same input stream', () => {
  const a = new Match('default', 15, LEFT)
  const b = new Match('default', 15, LEFT)
  const r1 = rng(7), r2 = rng(7)
  for (let f = 0; f < 4000; f++) {
    a.step(unpackInput(randomBits(r1)), unpackInput(randomBits(r1)))
    b.step(unpackInput(randomBits(r2)), unpackInput(randomBits(r2)))
  }
  assert.equal(a.checksum(), b.checksum())
  assert.equal(a.logic.scores[LEFT] + a.logic.scores[RIGHT] > 0, true)
})

function runPair(delay: number, lossSeed: number, frames: number,
  scoreToWin = 15, onTick?: (a: Rollback, b: Rollback, ma: Match, mb: Match) => void) {
  const mA = new Match('default', scoreToWin, LEFT)
  const mB = new Match('default', scoreToWin, LEFT)
  const A = new Rollback(mA, LEFT)
  const B = new Rollback(mB, RIGHT)
  const rA = rng(11), rB = rng(29), rNet = rng(lossSeed)

  type Pkt = { at: number; start: number; bits: Uint8Array; frame: number }
  const toA: Pkt[] = [], toB: Pkt[] = []

  const send = (from: Rollback, q: Pkt[], tick: number) => {
    const w = from.localWindow(from.frame - 20)
    if (rNet() < 0.25) return
    q.push({ at: tick + delay, start: w.start, bits: w.bits, frame: from.frame })
  }
  const drain = (to: Rollback, q: Pkt[], tick: number) => {
    while (q.length && q[0].at <= tick) {
      const p = q.shift()!
      to.onRemotePacket(p.start, p.bits, p.frame)
    }
  }

  for (let tick = 0; tick < frames; tick++) {
    drain(A, toA, tick)
    drain(B, toB, tick)
    A.advance(randomBits(rA))
    B.advance(randomBits(rB))
    send(A, toB, tick)
    send(B, toA, tick)
    onTick?.(A, B, mA, mB)
  }
  return { A, B, mA, mB }
}

test('rollback peers stay in sync across delay and packet loss', () => {
  for (const delay of [1, 4, 9, 14]) {
    const { A, B, mA, mB } = runPair(delay, 3 + delay, 2500)
    const common = Math.min(A.confirmed, B.confirmed)
    assert.ok(common > 1000, `confirmed frame too low for delay ${delay}: ${common}`)
    assert.ok(Math.abs(A.frame - B.frame) <= 12, `frame drift at delay ${delay}: ${A.frame - B.frame}`)
    const ca = A.checksumAt(common), cb = B.checksumAt(common)
    assert.ok(ca !== null && cb !== null, `confirmed state dropped at delay ${delay}`)
    assert.equal(ca, cb, `desync at confirmed frame ${common}, delay ${delay}`)
    assert.deepEqual(mA.logic.scores, mB.logic.scores)
  }
})

/**
 * O winner aparece em frame previsto e some no rollback seguinte. Quem
 * encerrasse ali ficava na tela de revanche com o outro ainda jogando.
 */
test('winner só é definitivo quando o frame que decidiu está confirmado', () => {
  for (const [delay, seed] of [[9, 25], [9, 38], [14, 18], [14, 30], [4, 7]] as [number, number][]) {
    const winFrame = [-1, -1]
    const decided = [NO_PLAYER, NO_PLAYER]
    const retractedAfterDecision = [0, 0]

    runPair(delay, seed, 4000, 3, (A, B, mA, mB) => {
      const peers: [Rollback, Match][] = [[A, mA], [B, mB]]
      for (let i = 0; i < 2; i++) {
        const [rb, m] = peers[i]
        const w = m.logic.winner
        if (w === NO_PLAYER) {
          if (decided[i] !== NO_PLAYER) retractedAfterDecision[i]++
          winFrame[i] = -1
          continue
        }
        if (winFrame[i] < 0) winFrame[i] = m.frame
        if (decided[i] === NO_PLAYER && rb.confirmed + 1 >= winFrame[i]) decided[i] = w
      }
    })

    assert.equal(retractedAfterDecision[0], 0, `winner confirmado sumiu em A (delay ${delay}, seed ${seed})`)
    assert.equal(retractedAfterDecision[1], 0, `winner confirmado sumiu em B (delay ${delay}, seed ${seed})`)
    assert.notEqual(decided[0], NO_PLAYER, `A não encerrou (delay ${delay}, seed ${seed})`)
    assert.equal(decided[0], decided[1], `lados discordam do vencedor (delay ${delay}, seed ${seed})`)
  }
})

test('rollback never exceeds the configured window', () => {
  const { A, B } = runPair(6, 99, 1800)
  assert.ok(A.stats.maxRollback <= 12 * 3, `rollback too deep: ${A.stats.maxRollback}`)
  assert.ok(B.stats.maxRollback <= 12 * 3, `rollback too deep: ${B.stats.maxRollback}`)
})

test('special state survives save/restore', () => {
  const m = new Match('default', 15, LEFT)
  const NONE = { left: false, right: false, up: false, special: false, push: false }
  const UP = { left: false, right: false, up: true, special: false, push: false }
  for (let f = 0; f < 40; f++) m.step(NONE, NONE)

  m.world.charge[LEFT] = SPECIAL_FULL
  m.world.ballX = m.world.blobX[LEFT]
  m.world.ballY = m.world.blobY[LEFT] - 120
  m.world.ballVX = 0
  m.world.ballVY = 0
  m.logic.isBallValid = true
  m.logic.isGameRunning = true

  m.step(UP, NONE)
  m.step(NONE, NONE)
  m.world.ballX = m.world.blobX[LEFT] + 30
  m.world.ballY = m.world.blobY[LEFT] - 110
  m.step(UP, NONE)
  assert.equal(m.events.some(e => e.event === Ev.SPECIAL_FIRED), true)
  assert.equal(m.world.superFrames > 0, true)

  const s = allocState()
  m.save(s)
  const before = m.checksum()
  for (let f = 0; f < 10; f++) m.step(NONE, UP)
  m.restore(s)
  assert.equal(m.checksum(), before)
  assert.equal(m.world.superOwner, LEFT)
})

test('special only fires on a second jump press in the air', () => {
  const m = new Match('default', 15, LEFT)
  const NONE = { left: false, right: false, up: false, special: false, push: false }
  const UP = { left: false, right: false, up: true, special: false, push: false }
  for (let f = 0; f < 40; f++) m.step(NONE, NONE)

  m.world.charge[LEFT] = SPECIAL_FULL
  m.world.ballX = m.world.blobX[LEFT] + 30
  m.world.ballY = m.world.blobY[LEFT] - 110
  m.logic.isBallValid = true
  m.logic.isGameRunning = true

  m.step(UP, NONE)
  assert.equal(m.events.some(e => e.event === Ev.SPECIAL_FIRED), false)
  assert.equal(m.world.charge[LEFT], SPECIAL_FULL)
})
