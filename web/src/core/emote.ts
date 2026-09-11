export interface EmoteDef { key: string; glyph: string; label: string; color: string }

export const EMOTES: EmoteDef[] = [
  { key: 'laugh', glyph: '🤣', label: 'HAHAHA', color: '#ffd257' },
  { key: 'cry', glyph: '😭', label: 'CHORAR', color: '#6fc9ff' },
  { key: 'rage', glyph: '🤬', label: 'XINGAR', color: '#ff6b3d' },
  { key: 'finger', glyph: '🖕', label: 'DEDO', color: '#ff5fd0' },
  { key: 'taunt', glyph: '😜', label: 'ZUAR', color: '#9dff8f' },
]

export const emoteAt = (id: number) => EMOTES[id] ?? EMOTES[0]
