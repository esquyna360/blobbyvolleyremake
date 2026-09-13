export type Speaker = 'mary' | 'godi' | 'link' | 'bruno' | 'dessa' | 'narr' | string

export interface Line { who: Speaker; text: string; mood?: 'idle' | 'happy' | 'hurt' }

export interface Chapter {
  id: string
  title: string
  place: string
  cat: 'mary' | 'godi' | 'link'
  foe: string
  /** 0 nada; 1 vento; 2 turbulência */
  weather: number
  ball: 'volei' | 'novelo'
  scoreToWin: number
  intro: Line[]
  outro: Line[]
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'quintal', title: 'O quintal', place: 'Guarulhos, SP', cat: 'mary', foe: 'pipoca', weather: 0, ball: 'novelo', scoreToWin: 7,
    intro: [
      { who: 'narr', text: 'Guarulhos. Um quintal, um varal e um novelo rosa que ninguém sabe de onde veio.' },
      { who: 'dessa', text: 'Mary! Sai daí, a mudança chega amanhã. A gente vai pro Uruguai, lembra?' },
      { who: 'mary', text: 'Uru-o-quê? Eu só quero o novelo.' },
      { who: 'pipoca', text: 'Novelo é meu! Achei primeiro! Achei! Achei!' },
      { who: 'mary', text: 'Então joga. Quem deixar cair no chão perde o novelo.' },
      { who: 'bruno', text: 'Dessa, cadê a Mary? ...ah. Tá jogando vôlei com a vizinha. Claro.' },
    ],
    outro: [
      { who: 'pipoca', text: 'Você pulou DUAS vezes no ar! Isso é trapaça!', mood: 'hurt' },
      { who: 'mary', text: 'Isso é gato.', mood: 'happy' },
      { who: 'dessa', text: 'Pronto. Agora entra na caixinha de transporte. É só um voo curto.' },
      { who: 'mary', text: 'Curto pra quem?' },
    ],
  },
  {
    id: 'cumbica', title: 'Portão 12', place: 'Aeroporto de Cumbica', cat: 'godi', foe: 'bituca', weather: 0, ball: 'volei', scoreToWin: 7,
    intro: [
      { who: 'narr', text: 'Cumbica, 5h da manhã. Três caixinhas, duas malas grandes e um Godi que não cabe direito em nenhuma.' },
      { who: 'bruno', text: 'Godi, você pesa mais que a mala. Sério.' },
      { who: 'godi', text: 'Mrrrp.' },
      { who: 'bituca', text: 'Ei, gordão! Aqui é o portão da festa. Só passa quem ganha de mim.' },
      { who: 'godi', text: '...tá. Mas eu vou jogar deitado.' },
      { who: 'dessa', text: 'Ele vai mesmo. Segura a barriga pra cima que a bola sobe sozinha.' },
    ],
    outro: [
      { who: 'bituca', text: 'Ninguém nunca me venceu DEITADO. A plateia vai rir de mim.', mood: 'hurt' },
      { who: 'godi', text: 'Mrrp. Cochilo.', mood: 'happy' },
      { who: 'bruno', text: 'Portão 12, voo pra Montevidéu. Bora, família.' },
    ],
  },
  {
    id: 'voo', title: 'Turbulência', place: '10 mil metros sobre o Prata', cat: 'link', foe: 'marola', weather: 2, ball: 'volei', scoreToWin: 9,
    intro: [
      { who: 'narr', text: 'O avião balança. Link decidiu que a cabine é uma quadra.' },
      { who: 'link', text: 'Quem é a comissária? Ela tem cara de quem saca forte.' },
      { who: 'marola', text: 'Capitã, não comissária. E aqui em cima a gravidade muda a cada segundo. Fundamento resolve.' },
      { who: 'dessa', text: 'Link, senta! Bruno, ele soltou de novo!' },
      { who: 'bruno', text: 'Deixa. Se ele ganhar a gente ganha um sanduíche extra.' },
    ],
    outro: [
      { who: 'marola', text: 'Anota aí: revanche. Em terra firme.', mood: 'hurt' },
      { who: 'link', text: 'Tigre não enjoa.', mood: 'happy' },
      { who: 'narr', text: 'Sanduíche extra: garantido. Pouso em Carrasco: em vinte minutos.' },
    ],
  },
  {
    id: 'prata', title: 'Vento do Prata', place: 'Rambla de Montevidéu', cat: 'mary', foe: 'lua', weather: 1, ball: 'volei', scoreToWin: 9,
    intro: [
      { who: 'narr', text: 'Montevidéu. A Rambla, o rio que parece mar e um vento que não pede licença.' },
      { who: 'mary', text: 'Esse vento tá empurrando a bola. Aqui é sempre assim?' },
      { who: 'lua', text: 'Sempre. Ele muda de ideia, como eu.' },
      { who: 'dessa', text: 'Mary, olha o mate! Todo mundo aqui anda com uma garrafa térmica embaixo do braço.' },
      { who: 'mary', text: 'Foco, Dessa. Tem uma gata estranha me olhando sem piscar.' },
    ],
    outro: [
      { who: 'lua', text: 'Interessante. Você lê o vento.', mood: 'hurt' },
      { who: 'mary', text: 'Eu leio tudo. Menos a caixinha de transporte.', mood: 'happy' },
      { who: 'bruno', text: 'Achei o apê. Tem varanda. Os três vão brigar por ela.' },
    ],
  },
  {
    id: 'casa', title: 'A casa nova', place: 'Pocitos, Montevidéu', cat: 'godi', foe: 'fuligem', weather: 0, ball: 'volei', scoreToWin: 9,
    intro: [
      { who: 'narr', text: 'O apê novo. Uma varanda, um sofá e um vizinho de baixo que odeia barulho.' },
      { who: 'fuligem', text: 'Quem tá pulando aí em cima? Eu moro embaixo. EMBAIXO.' },
      { who: 'godi', text: 'Mrrp. Eu não pulo. Eu deito.' },
      { who: 'fuligem', text: 'Então deita e perde. Vou te ensinar a ficar quieto.' },
      { who: 'bruno', text: 'Dessa, o vizinho tá jogando vôlei com o Godi. Eu acho que a gente vai ficar bem aqui.' },
      { who: 'dessa', text: 'Só se o Godi ganhar. Senão a gente muda de novo.' },
    ],
    outro: [
      { who: 'fuligem', text: 'Foi sorte. Não volta. ...tá, pode voltar.', mood: 'hurt' },
      { who: 'godi', text: 'Mrrrp.', mood: 'happy' },
      { who: 'dessa', text: 'Ficamos. E a varanda é do Godi.' },
      { who: 'link', text: 'Espera. Quem disse?' },
    ],
  },
  {
    id: 'bairro', title: 'O campeonato do bairro', place: 'Praia de Pocitos', cat: 'link', foe: 'rex', weather: 1, ball: 'volei', scoreToWin: 11,
    intro: [
      { who: 'narr', text: 'Domingo na praia de Pocitos. Um cartaz: CAMPEONATO DO BAIRRO. Um campeão: invicto.' },
      { who: 'rex', text: 'Gatos? Do Brasil? Eu ganhei de três temporadas. Não vou perder pra um bichano.' },
      { who: 'link', text: 'Somos de Guarulhos. A gente não perde pra quem fala demais.' },
      { who: 'mary', text: 'Vai, Link! Pula! Pula duas vezes!' },
      { who: 'godi', text: 'Mrrp. Deita se precisar.' },
      { who: 'bruno', text: 'Dessa, filma. Se ele ganhar, isso vai pro grupo da família.' },
      { who: 'dessa', text: 'Já tô filmando desde Guarulhos.' },
    ],
    outro: [
      { who: 'rex', text: 'Isso... não aconteceu. Um gato. Um GATO.', mood: 'hurt' },
      { who: 'link', text: 'Três gatos. E dois humanos que carregam a caixinha.', mood: 'happy' },
      { who: 'dessa', text: 'Vem cá, vem. Todo mundo no sofá.' },
      { who: 'bruno', text: 'Guarulhos, Cumbica, Prata, Pocitos. Casa é onde os três dormem em cima da gente.' },
      { who: 'narr', text: 'FIM. Ou até o próximo novelo.' },
    ],
  },
]

const KEY = 'bv.story'

export function storyProgress(): number {
  try { return Math.max(0, Math.min(CHAPTERS.length, Number(localStorage.getItem(KEY) ?? 0))) } catch { return 0 }
}

export function storyDone(index: number) {
  try {
    const cur = storyProgress()
    if (index + 1 > cur) localStorage.setItem(KEY, String(index + 1))
  } catch { /* sem storage */ }
}
