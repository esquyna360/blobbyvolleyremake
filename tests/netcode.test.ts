import test from 'node:test'
import assert from 'node:assert/strict'
import { Match, allocState } from '../src/core/match.ts'
import { Ev } from '../src/core/events.ts'
import { Rollback } from '../src/net/rollback.ts'
import {
  BALL_COLLISION_VELOCITY, LEFT, NO_PLAYER, RIGHT, SPECIAL_FULL, SPECIAL_VELOCITY, SPIKE_MAX_HOLD,
} from '../src/core/constants.ts'
import { NO_INPUT, packInput, unpackInput } from '../src/core/input.ts'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randomBits(r: () => number) {
  return packInput({ left: r() < 0.35, right: r() < 0.35, up: r() < 0.25, special: r() < 0.08, hand: r() < 0.05, down: r() < 0.12, fine: (r() * 4) | 0 })
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

    runPair(delay, seed, 9000, 3, (A, B, mA, mB) => {
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
  const NONE = { left: false, right: false, up: false, special: false, hand: false, down: false, fine: 0 }
  const UP = { left: false, right: false, up: true, special: false, hand: false, down: false, fine: 0 }
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
  const NONE = { left: false, right: false, up: false, special: false, hand: false, down: false, fine: 0 }
  const UP = { left: false, right: false, up: true, special: false, hand: false, down: false, fine: 0 }
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

/**
 * A previsão repete o último input do outro, então botão que ele acabou de
 * apertar nunca é previsto: o evento só nasce na re-simulação depois que o
 * pacote chega. Antes, esse frame era descartado junto com a timeline errada
 * e o parry do adversário nunca aparecia na tela.
 */
test('ação de borda do remoto chega na apresentação mesmo nascendo no rollback', () => {
  const m = new Match('default', 15, LEFT)
  const rb = new Rollback(m, LEFT)
  const seen: number[] = []
  const drain = () => {
    for (const e of rb.pending) seen.push(e.event)
    rb.pending.length = 0
  }

  for (let f = 0; f < 10; f++) {
    assert.ok(rb.advance(0), `travou no frame ${f}`)
    for (const e of m.events) seen.push(e.event)
    drain()
  }
  assert.equal(seen.includes(Ev.HAND_MISS), false, 'mão prevista sem input real do remoto')

  const bits = new Uint8Array(10)
  bits[4] = packInput({ ...NO_INPUT, hand: true })
  rb.onRemotePacket(0, bits, 10)
  drain()

  assert.ok(seen.includes(Ev.HAND_MISS), 'evento nascido na re-simulação não chegou em pending')
})

/**
 * Agachar entrou no estado da simulação. Se ficar de fora do save/restore, o
 * rollback devolve um blob em pé com carga zerada no meio da cortada.
 */
test('estado de agachar sobrevive ao save/restore', () => {
  const m = new Match('default', 15, LEFT)
  const DOWN = { ...NO_INPUT, down: true }
  for (let f = 0; f < 24; f++) m.step(DOWN, NO_INPUT)

  assert.ok(m.world.crouch[LEFT] > 0.9, `não agachou: ${m.world.crouch[LEFT]}`)
  assert.ok(m.world.spikeHold[LEFT] >= 18, `não carregou: ${m.world.spikeHold[LEFT]}`)

  const snap = allocState()
  m.save(snap)
  const before = m.checksum()
  for (let f = 0; f < 30; f++) m.step(NO_INPUT, NO_INPUT)
  assert.notEqual(m.checksum(), before)
  m.restore(snap)
  assert.equal(m.checksum(), before, 'checksum não voltou depois do restore')
  assert.ok(m.world.crouch[LEFT] > 0.9)
  assert.equal(m.world.spikeHold[LEFT], snap.i[33])
})

/** Manchete devolve a bola pro outro lado e conta como toque; cortada não passa do especial. */
test('manchete cruza a rede e cortada continua mais fraca que o especial', () => {
  const m = new Match('default', 15, LEFT)
  const w = m.world
  m.logic.isBallValid = true
  m.logic.isGameRunning = true
  w.blobX[LEFT] = 200
  w.ballX = 210; w.ballY = 430; w.ballVX = -3; w.ballVY = 4
  const rally = m.logic.rally
  m.step({ ...NO_INPUT, down: true }, NO_INPUT)

  assert.ok(m.events.some(e => e.event === Ev.DIG), 'manchete não saiu')
  assert.ok(w.ballVX > 0, `manchete não foi pro outro lado: vx ${w.ballVX}`)
  assert.equal(m.logic.rally, rally + 1, 'manchete não contou no rally')

  w.spikeFrames[LEFT] = 20
  w.spikePow[LEFT] = SPIKE_MAX_HOLD
  w.blobX[LEFT] = 300; w.blobY[LEFT] = 200
  w.ballX = 306; w.ballY = 140; w.ballVX = 0; w.ballVY = 0
  m.step(NO_INPUT, NO_INPUT)

  assert.ok(m.events.some(e => e.event === Ev.SPIKE_HIT), 'cortada não saiu')
  const speed = Math.hypot(w.ballVX, w.ballVY)
  assert.ok(speed > BALL_COLLISION_VELOCITY, `cortada mais lenta que um toque: ${speed}`)
  assert.ok(speed < SPECIAL_VELOCITY * 0.8, `cortada perto demais do especial: ${speed}`)
  assert.equal(w.superFrames, 0, 'cortada não pode virar bola de especial')
})
