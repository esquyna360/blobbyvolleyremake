export type Human = 'bruno' | 'dessa'
export type Arms = 'rest' | 'up' | 'pet'

export interface HumanPose {
  lookRight: boolean
  arms: Arms
  breathe: number
  bounce: number
}

/** Bruno e Dessa em pixel art, sentados. Uma unidade = um pixel do canvas; `k` amplia sem filtro. */
export function drawHuman(g: CanvasRenderingContext2D, who: Human, x: number, y: number, k: number, pose: HumanPose) {
  const px = (c: string, dx: number, dy: number, w = 1, h = 1) => {
    g.fillStyle = c
    g.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
  }
  const b = pose.breathe, eye = pose.lookRight ? 1 : -1
  const bo = -pose.bounce
  if (who === 'dessa') {
    const skin = '#FBCFE8', hair = '#1E1005', hair2 = '#2A1808', shirt = '#9333EA', shirt2 = '#7E22CE', pants = '#1E293B'
    px(hair, 2, 0 + bo, 22, 28); px(hair2, 0, 4 + bo, 26, 24)
    px(skin, 6, 4 + bo, 14, 14); px('#F472B6', 16, 11 + bo, 2, 2)
    px(hair, 4, 0 + bo, 18, 6); px(hair, 3, 4 + bo, 5, 16); px(hair, 18, 4 + bo, 5, 16)
    px('#0F172A', 9 + eye, 9 + bo, 2, 2); px('#0F172A', 15 + eye, 9 + bo, 2, 2)
    if (pose.arms === 'up') px('#E11D48', 11, 14 + bo, 4, 2); else px('#E11D48', 11 + eye, 14 + bo, 4, 1)
    px(shirt, 3, 18 + bo, 20, 14); px(shirt2, 5, 18 + bo, 16, 14)
    if (pose.arms === 'up') { px(skin, 0, 8 + bo, 4, 12); px(skin, 22, 8 + bo, 4, 12) }
    else if (pose.arms === 'pet') { px(skin, 21, 24 + b + bo, 8, 4); px(skin, 27, 26 + b + bo, 4, 4); px(skin, 1, 24 + b + bo, 4, 8) }
    else { px(skin, 1, 24 + b + bo, 4, 8); px(skin, 21, 24 + b + bo, 4, 8) }
    px(pants, 4, 32, 18, 8)
  } else {
    const skin = '#C48D5E', skinS = '#A66E43', hair = '#1C1917', hair2 = '#292524', shirt = '#0284C7', shirt2 = '#0369A1', pants = '#334155'
    px(hair, 4, 0 + bo, 20, 6); px(hair2, 3, 2 + bo, 3, 5); px(hair2, 22, 2 + bo, 3, 5)
    px(skin, 6, 4 + bo, 16, 15); px(skinS, 6, 17 + bo, 16, 2)
    px('#FFFFFF', 8 + eye, 8 + bo, 4, 3); px('#FFFFFF', 15 + eye, 8 + bo, 4, 3)
    px(hair, 9 + eye, 8 + bo, 2, 3); px(hair, 16 + eye, 8 + bo, 2, 3)
    px('#FFFFFF', 9 + eye, 8 + bo, 1, 1)
    px(hair, 7, 13 + bo, 14, 6); px(hair2, 8, 17 + bo, 12, 2)
    if (pose.arms === 'up') px('#F87171', 11, 15 + bo, 6, 2)
    px(shirt, 2, 19 + bo, 24, 15); px(shirt2, 4, 21 + bo, 20, 13); px('#FFFFFF', 12, 23 + bo, 4, 2)
    if (pose.arms === 'up') { px(skin, -2, 9 + bo, 4, 12); px(skin, 24, 9 + bo, 4, 12) }
    else if (pose.arms === 'pet') { px(skin, -6, 24 + b + bo, 8, 4); px(skin, -10, 26 + b + bo, 4, 4); px(skin, 24, 23 + b + bo, 4, 9) }
    else { px(skin, -2, 23 + b + bo, 4, 9); px(skin, 24, 23 + b + bo, 4, 9) }
    px(pants, 3, 34, 22, 8)
  }
}

export const HUMAN_W = 28
export const HUMAN_H = 42
