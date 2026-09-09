import { DEFAULT_SCORE_TO_WIN, LEFT, NO_PLAYER, RIGHT, SQUISH_TOLERANCE, other } from './constants.ts'
import type { Side, SideOrNone } from './constants.ts'

export type RuleSet = {
  id: string
  name: string
  desc: string
  scoreToWin: number
  isWinning(l: number, r: number, stw: number): boolean
  onBallHitsPlayer(g: GameLogic, p: Side): void
  onBallHitsWall?(g: GameLogic, p: Side): void
  onBallHitsNet?(g: GameLogic, p: SideOrNone): void
  onBallHitsGround(g: GameLogic, p: Side): void
  transformInput?(p: Side, l: boolean, r: boolean, u: boolean): [boolean, boolean, boolean]
}

const twoAhead = (l: number, r: number, stw: number) =>
  (l >= stw && l >= r + 2) || (r >= stw && r >= l + 2)

export const RULES: RuleSet[] = [
  {
    id: 'default', name: 'Clássico', desc: '3 toques por lado, 2 de vantagem.',
    scoreToWin: DEFAULT_SCORE_TO_WIN,
    isWinning: twoAhead,
    onBallHitsPlayer(g, p) { if (g.touches[p] > 3) g.mistake(p, other(p), 1) },
    onBallHitsGround(g, p) { g.mistake(p, other(p), 1) },
  },
  {
    id: 'tennis', name: 'Tennis', desc: 'Um toque só. Devolve ou perde.',
    scoreToWin: DEFAULT_SCORE_TO_WIN,
    isWinning: twoAhead,
    onBallHitsPlayer(g, p) { if (g.touches[p] > 1) g.mistake(p, other(p), 1) },
    onBallHitsGround(g, p) { g.mistake(p, other(p), 1) },
  },
  {
    id: 'blitz', name: 'Blitz', desc: 'Rally curto: 5 pontos.',
    scoreToWin: 5,
    isWinning: (l, r, stw) => l >= stw || r >= stw,
    onBallHitsPlayer(g, p) { if (g.touches[p] > 3) g.mistake(p, other(p), 1) },
    onBallHitsGround(g, p) { g.mistake(p, other(p), 1) },
  },
  {
    id: 'jumpingjack', name: 'Jumping Jack', desc: 'Só pontua quem acerta no ar.',
    scoreToWin: DEFAULT_SCORE_TO_WIN,
    isWinning: twoAhead,
    onBallHitsPlayer(g, p) { if (g.touches[p] > 3) g.mistake(p, other(p), 1) },
    onBallHitsGround(g, p) { g.mistake(p, other(p), 1) },
    transformInput(_p, l, r, u) { return [l, r, u] },
  },
]

export const getRules = (id: string) => RULES.find(r => r.id === id) ?? RULES[0]

export class GameLogic {
  scores = [0, 0]
  touches = [0, 0]
  squish = [0, 0]
  squishWall = 0
  squishGround = 0
  lastError: SideOrNone = NO_PLAYER
  servingPlayer: SideOrNone = NO_PLAYER
  isBallValid = true
  isGameRunning = false
  winner: SideOrNone = NO_PLAYER
  frames = 0
  rules: RuleSet
  scoreToWin: number

  constructor(rules: RuleSet, scoreToWin?: number) {
    this.rules = rules
    this.scoreToWin = scoreToWin ?? rules.scoreToWin
  }

  step() {
    this.frames++
    this.squish[0]--; this.squish[1]--
    this.squishWall--; this.squishGround--
  }

  onServe() { this.isBallValid = true; this.isGameRunning = false }

  onBallHitsGround(side: Side) {
    if (!(this.squishGround <= 0 && this.isBallValid)) return
    this.squishGround = SQUISH_TOLERANCE
    this.touches[other(side)] = 0
    this.rules.onBallHitsGround(this, side)
  }

  onBallHitsPlayer(side: Side) {
    if (this.squish[side] > 0) return
    this.squish[side] = SQUISH_TOLERANCE
    this.squish[other(side)] = 0
    this.isGameRunning = true
    this.touches[side]++
    this.rules.onBallHitsPlayer(this, side)
    this.touches[other(side)] = 0
  }

  onBallHitsWall(side: Side) {
    if (!(this.squishWall <= 0 && this.isBallValid)) return
    this.squishWall = SQUISH_TOLERANCE
    this.rules.onBallHitsWall?.(this, side)
  }

  onBallHitsNet(side: SideOrNone) {
    if (!(this.squishWall <= 0 && this.isBallValid)) return
    this.squishWall = SQUISH_TOLERANCE
    this.rules.onBallHitsNet?.(this, side)
  }

  score(side: Side, amount: number) {
    this.scores[side] += amount
    if (this.scores[side] < 0) this.scores[side] = 0
    if (this.rules.isWinning(this.scores[LEFT], this.scores[RIGHT], this.scoreToWin))
      this.winner = this.scores[LEFT] > this.scores[RIGHT] ? LEFT : RIGHT
  }

  mistake(mistakeSide: Side, serveSide: Side, amount: number) {
    this.score(other(mistakeSide), amount)
    this.lastError = mistakeSide
    this.isBallValid = false
    this.touches[0] = 0; this.touches[1] = 0
    this.squish[0] = 0; this.squish[1] = 0
    this.squishWall = 0; this.squishGround = 0
    this.servingPlayer = serveSide
  }

  takeLastError(): SideOrNone { const t = this.lastError; this.lastError = NO_PLAYER; return t }
}
