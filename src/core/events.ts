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
  SPECIAL_GROUND = 12,
  DIVE = 13,
  DIVE_HIT = 14,
  FATALITY = 15,
  PARRY = 16,
  PARRY_TRY = 17,
  DIG = 18,
  SPECIAL_WASTED = 19,
  APEX_HIT = 20,
  BALL_OUT = 21,
  /** momento roteirizado do cenário: raio, drop, glitch, lua */
  SCENE_MOMENT = 22,
  /** rave: bateu no tempo da batida */
  BEAT_HIT = 23,
  /** nuvens: blob encostou e a plataforma foi embora */
  CLOUD_POP = 24,
}

/** O rollback marca eventos vistos com `1 << ev` num Int32Array: nada acima de 30. */

export interface MatchEvent { event: Ev; side: SideOrNone; intensity: number }
