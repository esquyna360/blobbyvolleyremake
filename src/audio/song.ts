/**
 * Uma música do jogo é dado, não arquivo de áudio. O sequenciador toca as
 * notas com o sintetizador do jogo, então o andamento é só um número — a
 * trilha acelera com o rally sem esticar sample nem trocar de faixa.
 */

export interface SongTrack {
  /** nome da voz no sintetizador */
  v: string
  /** camada: 0 toca sempre, 1..3 entram conforme o rally aperta */
  tier: number
  gain: number
  /** plano, quatro por nota: passo, pitch MIDI, velocity, duração em passos */
  n: number[]
}

export interface Song {
  id: string
  title: string
  bpm: number
  bars: number
  /** passos por compasso; um passo é uma semicolcheia */
  spb: number
  tracks: SongTrack[]
}

export const MUSIC_URL = (id: string) => `${import.meta.env.BASE_URL}music/${id}.json`

/** Um passo dura 15/bpm segundos: semicolcheia é um quarto de semínima. */
export const stepSeconds = (bpm: number) => 15 / bpm

export const midiHz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12)

const cache = new Map<string, Promise<Song>>()

export function loadSong(id: string): Promise<Song> {
  const hit = cache.get(id)
  if (hit) return hit
  const job = fetch(MUSIC_URL(id)).then(r => {
    if (!r.ok) throw new Error(`song ${id}: ${r.status}`)
    return r.json() as Promise<Song>
  })
  cache.set(id, job)
  void job.catch(() => cache.delete(id))
  return job
}
