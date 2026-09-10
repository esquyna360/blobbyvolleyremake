import test from 'node:test'
import assert from 'node:assert/strict'
import { Match, allocState } from '../src/core/match.ts'
import { Ev } from '../src/core/events.ts'
import { Rollback } from '../src/net/rollback.ts'
import {
  BALL_COLLISION_VELOCITY, BALL_RADIUS, BLOBBY_SPEED, LEFT, NO_PLAYER, RIGHT, RIGHT_PLANE,
  SPECIAL_CAP, SPECIAL_FULL, SPECIAL_VELOCITY, BLOBBY_UPPER_SPHERE,
} from '../src/core/constants.ts'
import { NO_INPUT, packInput, unpackInput } from '../src/core/input.ts'
import { GB_SPEEDS, cloudTop, cloudX } from '../src/core/scene-rules.ts'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function randomBits(r: () => number) {
  return packInput({ left: r() < 0.35, right: r() < 0.35, up: r() < 0.25, special: r() < 0.08, down: r() < 0.12 })
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
  const NONE = { left: false, right: false, up: false, special: false, down: false }
  const UP = { left: false, right: false, up: true, special: false, down: false }
  for (let f = 0; f < 40; f++) m.step(NONE, NONE)

  m.world.charge[LEFT] = SPECIAL_CAP
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
  const NONE = { left: false, right: false, up: false, special: false, down: false }
  const UP = { left: false, right: false, up: true, special: false, down: false }
  for (let f = 0; f < 40; f++) m.step(NONE, NONE)

  m.world.charge[LEFT] = SPECIAL_CAP
  m.world.ballX = m.world.blobX[LEFT] + 30
  m.world.ballY = m.world.blobY[LEFT] - 110
  m.logic.isBallValid = true
  m.logic.isGameRunning = true

  m.step(UP, NONE)
  assert.equal(m.events.some(e => e.event === Ev.SPECIAL_FIRED), false)
  assert.ok(m.world.charge[LEFT] >= SPECIAL_FULL, 'barra queimada sem disparar')
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
  assert.equal(seen.includes(Ev.DIVE), false, 'mergulho previsto sem input real do remoto')

  const bits = new Uint8Array(10)
  bits[4] = packInput({ ...NO_INPUT, down: true, right: true })
  rb.onRemotePacket(0, bits, 10)
  drain()

  assert.ok(seen.includes(Ev.DIVE), 'evento nascido na re-simulação não chegou em pending')
})

/**
 * Agachar entrou no estado da simulação. Se ficar de fora do save/restore, o
 * rollback devolve um blob em pé no meio da manchete.
 */
test('estado de agachar sobrevive ao save/restore', () => {
  const m = new Match('default', 15, LEFT)
  const DOWN = { ...NO_INPUT, down: true }
  for (let f = 0; f < 24; f++) m.step(DOWN, NO_INPUT)

  assert.ok(m.world.crouch[LEFT] > 0.9, `não agachou: ${m.world.crouch[LEFT]}`)

  const snap = allocState()
  m.save(snap)
  const before = m.checksum()
  for (let f = 0; f < 30; f++) m.step(NO_INPUT, NO_INPUT)
  assert.notEqual(m.checksum(), before)
  m.restore(snap)
  assert.equal(m.checksum(), before, 'checksum não voltou depois do restore')
  assert.ok(m.world.crouch[LEFT] > 0.9)
  assert.equal(m.world.crouch[LEFT], snap.f[22])
})

/**
 * Mergulho: baixo + lado no chão joga o blob de lado muito além do que a
 * caminhada alcança, e o estado dele tem que sobreviver ao rollback.
 */
test('mergulho estica o alcance e sobrevive ao save/restore', () => {
  const m = new Match('default', 15, LEFT)
  const w = m.world
  const x0 = w.blobX[LEFT]
  m.step({ ...NO_INPUT, down: true, right: true }, NO_INPUT)

  assert.ok(m.events.some(e => e.event === Ev.DIVE), 'mergulho não saiu')
  assert.ok(w.diveFrames[LEFT] > 0, 'não entrou no estado de mergulho')
  assert.ok(w.wideX(LEFT) > 1.4, `caixa não alargou: ${w.wideX(LEFT)}`)

  const snap = allocState()
  m.save(snap)
  const before = m.checksum()
  for (let f = 0; f < 20; f++) m.step(NO_INPUT, NO_INPUT)
  assert.notEqual(m.checksum(), before)
  const walked = BLOBBY_SPEED * 21
  assert.ok(w.blobX[LEFT] - x0 > walked, `mergulho não passou da caminhada: ${w.blobX[LEFT] - x0}`)
  assert.ok(w.diveRecover[LEFT] > 0, 'não ficou caído depois de mergulhar')

  m.restore(snap)
  assert.equal(m.checksum(), before, 'checksum não voltou depois do restore')
  assert.ok(w.diveFrames[LEFT] > 0)
})

/** Manchete devolve a bola pro outro lado e conta como toque. */
test('manchete cruza a rede e conta no rally', () => {
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

  const speed = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
  assert.ok(speed > BALL_COLLISION_VELOCITY * 0.8, `manchete fraca demais: ${speed}`)
  assert.ok(speed < SPECIAL_VELOCITY * 0.8, `manchete perto demais do especial: ${speed}`)
  assert.equal(w.superFrames, 0, 'manchete não pode virar bola de especial')
})

/**
 * Quadra aberta é regra, não pintura: sem parede a bola sai e o ponto é de
 * quem não mandou pra fora. Com parede, o mesmo lance é só um quique.
 */
test('quadra aberta pontua a bola fora; com parede ela quica', () => {
  const open = new Match('default', 15, LEFT, false)
  open.logic.isBallValid = true
  open.logic.isGameRunning = true
  open.logic.touches[LEFT] = 1
  open.world.ballX = RIGHT_PLANE - BALL_RADIUS - 2
  open.world.ballY = 300
  open.world.ballVX = 18
  open.world.ballVY = 0
  let out = false
  for (let f = 0; f < 6; f++) {
    open.step(NO_INPUT, NO_INPUT)
    if (open.events.some(e => e.event === Ev.BALL_OUT)) out = true
  }
  assert.ok(out, 'bola não saiu com a quadra aberta')
  assert.equal(open.logic.scores[RIGHT], 1, 'quem mandou pra fora não perdeu o ponto')

  const walled = new Match('default', 15, LEFT, true)
  walled.logic.isBallValid = true
  walled.logic.isGameRunning = true
  walled.logic.touches[LEFT] = 1
  walled.world.ballX = RIGHT_PLANE - BALL_RADIUS - 2
  walled.world.ballY = 300
  walled.world.ballVX = 18
  walled.world.ballVY = 0
  for (let f = 0; f < 6; f++) walled.step(NO_INPUT, NO_INPUT)
  assert.ok(walled.world.ballVX < 0, 'não quicou na parede')
  assert.equal(walled.logic.scores[RIGHT], 0, 'quique não pode virar ponto')
})

/** Cenário que é regra: a nuvem segura a bola e o estado dela volta no rollback. */
test('nuvem segura a bola e sobrevive ao save/restore', () => {
  const m = new Match('default', 15, LEFT, true, 'nuvens')
  const w = m.world
  m.logic.isBallValid = true
  m.logic.isGameRunning = true
  w.ballX = cloudX(2)
  w.ballY = cloudTop(2) - BALL_RADIUS - 4
  w.ballVX = 0
  w.ballVY = 3

  for (let f = 0; f < 4 && w.ballVY > 0; f++) m.step(NO_INPUT, NO_INPUT)
  assert.ok(w.ballVY < 0, `bola atravessou a nuvem: vy=${w.ballVY}`)

  // o blob que encosta estoura a nuvem, e ela volta depois do castigo
  w.blobX[LEFT] = cloudX(0)
  w.blobY[LEFT] = cloudTop(0) + BLOBBY_UPPER_SPHERE
  m.step(NO_INPUT, NO_INPUT)
  assert.ok(!w.cloudAlive(0), 'nuvem não estourou')
  assert.ok(m.events.some(e => e.event === Ev.CLOUD_POP), 'evento de estouro não saiu')

  const snap = allocState()
  m.save(snap)
  const before = m.checksum()
  for (let f = 0; f < 30; f++) m.step(NO_INPUT, NO_INPUT)
  assert.notEqual(m.checksum(), before)
  m.restore(snap)
  assert.equal(m.checksum(), before, 'checksum não voltou depois do restore')
  assert.equal(w.cloudAlive(0), false, 'nuvem voltou sozinha no restore')
})

/** Game Boy: dezesseis direções, três velocidades, nada no meio. */
test('game boy quantiza a bola na grade de 22,5 graus', () => {
  const m = new Match('default', 15, LEFT, true, 'gameboy')
  const w = m.world
  m.logic.isBallValid = true
  m.logic.isGameRunning = true
  w.blobX[LEFT] = 200
  w.blobY[LEFT] = 455.5
  w.ballX = 200
  w.ballY = 455.5 - BLOBBY_UPPER_SPHERE - BALL_RADIUS + 2
  w.ballVX = 3.3
  w.ballVY = 1.7

  for (let f = 0; f < 3; f++) m.step(NO_INPUT, NO_INPUT)
  const speed = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
  const ok = GB_SPEEDS.some(v => Math.abs(speed - v) < 1.2)
  assert.ok(ok, `velocidade fora da grade: ${speed}`)
})
