import type { SideOrNone } from './constants.ts'

export const enum Ev {
  BALL_HIT_BLOB = 0,
  BALL_HIT_GROUND = 1,
  BALL_HIT_WALL = 2,
  BALL_HIT_NET = 3,
  BALL_HIT_NET_TOP = 4,
  PLAYER_ERROR = 5,
  RESET_BALL = 6,
  SCORE = 7,
  GAME_OVER = 8,
  SPECIAL_READY = 9,
  SPECIAL_FIRED = 10,
  SPECIAL_HIT = 11,
}

export interface MatchEvent { event: Ev; side: SideOrNone; intensity: number }
