import type { PlayerLook } from './looks.ts'
import type { SceneId } from '../render/scenes.ts'
import type { Difficulty } from '../ai/bot.ts'
import type { Temper as MoodTemper } from '../ai/mood.ts'

export interface BotStyle {
  reaction?: number
  horizon?: number
  aimErr?: number
  shotErr?: number
  speed?: number
  attack?: number
  parry?: number
  offsets?: number
  clear?: number
  foeLead?: number
}

export type Temper = MoodTemper

export interface Fighter {
  id: string
  name: string
  title: string
  bio: string
  look: PlayerLook
  home: SceneId
  /** base da escada arcade; o estilo ajusta em cima */
  diff: Difficulty
  style: BotStyle
  temper: Temper
  win: string[]
  lose: string
}

const L = (body: number, hair: number, hairColor: number): PlayerLook => ({ body, hair, hairColor })
// corpo: 0 vermelho 1 azul 2 verde 3 roxo 4 laranja 5 rosa 6 ciano 7 amarelo 8 menta 9 areia 10 grafite 11 neve
// cabelo: 0 careca 1 espeto 2 moicano 3 cachos 4 black 5 cuia 6 rabo 7 franja 8 coque 9 longo 10 antenas 11 chama
// cor cabelo: 0 preto 1 castanho 2 loiro 3 ruivo 4 branco 5 prata 6 rosa 7 azul 8 verde 9 roxo

export const ROSTER: Fighter[] = [
  {
    id: 'ze', name: 'Zé Areia', title: 'o veterano da praia',
    bio: 'Joga desde antes de existir rede. Não corre, mas está sempre onde a bola cai.',
    look: L(9, 9, 1), home: 'praia', diff: 'easy',
    style: { speed: 0.62, aimErr: 18, shotErr: 0.5, attack: 0.08, parry: 0.3, horizon: 70 },
    temper: { talk: 0.25, salt: 0.1, smug: 0.15, rude: 0, cool: 6 },
    win: ['Calma, moleque. A maré ensina.', 'Bola no chão, chinelo no pé. Bora?', 'Tá bom, tá bom. Falta ritmo.'],
    lose: 'Ih. Amanhã eu volto, viu.',
  },
  {
    id: 'pipoca', name: 'Pipoca', title: 'a pequena notável',
    bio: 'Não para quieta um segundo. Chega em toda bola e erra metade delas rindo.',
    look: L(5, 10, 6), home: 'selva', diff: 'easy',
    style: { speed: 1, reaction: 4, aimErr: 48, shotErr: 0.7, attack: 0.5, parry: 0.15, horizon: 50 },
    temper: { talk: 0.7, salt: 0.1, smug: 0.3, rude: 0, cool: 2 },
    win: ['De novo! De novo! De novo!', 'Eu nem vi a bola, ganhei mesmo assim!', 'Pipoca não perde, Pipoca estoura!'],
    lose: 'Tá, mas eu corri mais que você.',
  },
  {
    id: 'bituca', name: 'Bituca', title: 'o dono da festa',
    bio: 'Joga pra plateia. Todo ponto vira comemoração, todo erro vira piada.',
    look: L(4, 4, 0), home: 'luau', diff: 'normal',
    style: { attack: 0.5, shotErr: 0.5, aimErr: 26, speed: 0.9, parry: 0.3 },
    temper: { talk: 0.6, salt: 0.3, smug: 0.7, rude: 0.05, cool: 3 },
    win: ['A festa é minha e eu convido quem eu quiser.', 'Aplausos! Não? Tá bom, eu aplaudo.', 'Toca aquela! Ganhei de novo.'],
    lose: 'Boa. Agora vem comemorar comigo.',
  },
  {
    id: 'cida', name: 'Dona Cida', title: 'a paciência em pessoa',
    bio: 'Lenta, tranquila e cirúrgica. Cada devolução cai exatamente onde você não está.',
    look: L(3, 8, 4), home: 'luau', diff: 'normal',
    style: { speed: 0.7, aimErr: 4, shotErr: 0.08, attack: 0.15, offsets: 16, clear: 24, horizon: 110 },
    temper: { talk: 0.3, salt: 0.05, smug: 0.2, rude: 0, cool: 5 },
    win: ['Meu bem, pressa só serve pra cair.', 'Toma um café. Depois tenta de novo.', 'Eu já vi esse saque em 1984.'],
    lose: 'Que bonito. Vai ficar pro almoço?',
  },
  {
    id: 'toco', name: 'Toco', title: 'o muro da selva',
    bio: 'Enorme, lento e impossível de passar. Não ataca: espera você errar.',
    look: L(2, 3, 1), home: 'selva', diff: 'normal',
    style: { speed: 0.68, parry: 0.8, attack: 0.05, aimErr: 14, shotErr: 0.3, clear: 34, horizon: 120 },
    temper: { talk: 0.2, salt: 0.2, smug: 0.1, rude: 0, cool: 6 },
    win: ['...', 'Cansei de esperar. Você caiu.', 'A selva não tem pressa.'],
    lose: 'Hm. Forte.',
  },
  {
    id: 'lua', name: 'Lua', title: 'a que ninguém lê',
    bio: 'Fala pouco, muda de ideia no ar. Dá pra prever a bola, não dá pra prever ela.',
    look: L(6, 9, 7), home: 'gruta', diff: 'hard',
    style: { shotErr: 0.35, aimErr: 10, attack: 0.55, parry: 0.5, reaction: 4, offsets: 14, foeLead: 4 },
    temper: { talk: 0.25, salt: 0.2, smug: 0.4, rude: 0.05, cool: 4 },
    win: ['Você olhou pra bola. Eu olhei pra você.', 'Silêncio também é um saque.', 'A gruta guarda o que cai nela.'],
    lose: 'Interessante. Não vou esquecer.',
  },
  {
    id: 'fuligem', name: 'Fuligem', title: 'o rabugento da gruta',
    bio: 'Mora no escuro e odeia visita. Defende tudo rente ao chão e xinga a cada ponto.',
    look: L(10, 11, 3), home: 'gruta', diff: 'hard',
    style: { parry: 0.85, speed: 1, attack: 0.4, aimErr: 12, shotErr: 0.2, clear: 20, foeLead: 3 },
    temper: { talk: 0.75, salt: 0.9, smug: 0.5, rude: 0.35, cool: 2 },
    win: ['Some daqui. E leva a bola.', 'Eu avisei. Ninguém escuta.', 'Fecha a porta quando sair.'],
    lose: 'Foi sorte. Não volta.',
  },
  {
    id: 'marola', name: 'Capitã Marola', title: 'a profissional',
    bio: 'Ex-circuito. Joga o jogo certo, sem enfeite, e pune qualquer bola curta.',
    look: L(1, 6, 2), home: 'praia', diff: 'hard',
    style: { aimErr: 6, shotErr: 0.08, attack: 0.7, parry: 0.65, speed: 1, foeLead: 6, offsets: 18 },
    temper: { talk: 0.4, salt: 0.5, smug: 0.5, rude: 0.1, cool: 3 },
    win: ['Fundamento. É só isso.', 'Boa partida. Agora treina.', 'Bola alta é convite. Eu aceito.'],
    lose: 'Anota aí: revanche.',
  },
  {
    id: 'nina', name: 'Nina Faísca', title: 'a promessa do ginásio',
    bio: 'Reflexo absurdo e zero paciência. Ataca tudo, inclusive o que não devia.',
    look: L(7, 1, 6), home: 'ginasio', diff: 'insane',
    style: { reaction: 1, speed: 1, attack: 1, aimErr: 16, shotErr: 0.25, parry: 0.6, foeLead: 8 },
    temper: { talk: 0.65, salt: 0.6, smug: 0.8, rude: 0.15, cool: 2.4 },
    win: ['Rápido demais? Eu ainda nem acordei.', 'Isso foi só o aquecimento!', 'Faísca vira fogo. Cuidado.'],
    lose: 'Ah, não. De novo. Agora.',
  },
  {
    id: 'rex', name: 'Rex Trovão', title: 'o campeão',
    bio: 'Invicto há três temporadas e faz questão de lembrar. Não tem ponto fraco, só ego.',
    look: L(0, 2, 0), home: 'ginasio', diff: 'insane',
    style: {},
    temper: { talk: 0.8, salt: 0.85, smug: 0.95, rude: 0.5, cool: 1.8 },
    win: ['Próximo.', 'Três temporadas. Quatro, agora.', 'Você jogou bem. Pra um amador.'],
    lose: 'Isso... não aconteceu.',
  },
]

export const fighterById = (id: string) => ROSTER.find(f => f.id === id) ?? null

/** Frases de quem não é do elenco: você, o P2, o adversário online. */
export const GENERIC_WIN = [
  'Boa. Próxima?', 'Foi fácil? Não foi.', 'Ponto final.', 'Treino pago.', 'Aquela última foi bonita.',
]
export const GENERIC_LOSE = 'Da próxima eu levo.'

export const pickQuote = (list: string[], seed: number) => list[Math.abs(seed) % list.length]
