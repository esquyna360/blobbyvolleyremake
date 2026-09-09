export interface EmoteDef { key: string; glyph: string; label: string; color: string }

export const EMOTES: EmoteDef[] = [
  { key: 'cry', glyph: '😭', label: 'CHORAR', color: '#6fc9ff' },
  { key: 'cheer', glyph: '🎉', label: 'COMEMORAR', color: '#ffd257' },
  { key: 'taunt', glyph: '😜', label: 'ZUAR', color: '#ff5fd0' },
]

export const emoteAt = (id: number) => EMOTES[id] ?? EMOTES[0]
