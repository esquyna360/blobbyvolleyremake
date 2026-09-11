# Blobby Beach Theme

Tema de praia para o remake de Blobby Volley. Feito para acelerar e ganhar
camadas conforme o rally aperta, sem trocar de faixa e sem corte audivel.

## Referencia sonora

Melodia diatonica e cantavel no estilo Koji Kondo (Mario, Zelda): frase de
pergunta e resposta, contorno claro, nada cromatico. Acompanhamento com a
pulsacao de colcheias e o arpejo de semicolcheias que marcam as trilhas de
Barry Leitch em Top Gear. Timbre de praia vem do steel drum na melodia, da
marimba sincopada no acompanhamento e da percussao de conga, maracas, agogo
e shaker.

- Tom: La maior
- Forma: 16 compassos, 4/4, loop perfeito (nenhuma nota cruza a barra final)
- Andamento base: 112 BPM, loop de 34,3 s
- Harmonia: A / F#m / D / E / A / F#m / Bm7 / E7 / D / E / C#m / F#m / D / E / A / E7
- Compasso 8 e 16 tem virada de tom que devolve a frase para o compasso 1

## Arquivos

| Arquivo | Uso |
| --- | --- |
| `blobby_beach_theme.mid` | Faixa principal, 9 tracks, todas as camadas |
| `blobby_beach_theme_calm.mid` | So as camadas TIER0, para menu e tela de praia parada |
| `blobby_beach_theme_rampdemo.mid` | 32 compassos, 104 a 172 BPM, camadas entrando. Demonstracao |
| `blobby_beach_theme.json` | Mesma musica em dados (steps, pitch, velocity) para reconstruir em qualquer engine |
| `preview_calm.mp3` | Como soa a camada base |
| `preview_full.mp3` | Como soa tudo junto a 112 BPM |
| `preview_ramp.mp3` | Como soa a aceleracao com as camadas entrando |
| `beach_theme.py` | Composicao e escritor de MIDI |
| `render.py` | Gera os MIDI e os previews |
| `export_json.py` | Gera o JSON |

Os MP3 sao previews sintetizados por um synth simples so para conferencia.
O material real e o MIDI: no jogo ele toca com o soundfont que voce escolher.

## Camadas por intensidade

Cada track tem prefixo de tier no nome. O motor liga e desliga por tier.

| Track | Tier | Canal | Programa GM | Entra quando |
| --- | --- | --- | --- | --- |
| TIER0 BASS | 0 | 2 | 39 Synth Bass 1 | sempre |
| TIER0 PAD | 0 | 5 | 90 Pad 2 warm | sempre |
| TIER0 MARIMBA | 0 | 3 | 13 Marimba | sempre |
| TIER0 SHAKER | 0 | 10 | percussao | sempre |
| TIER0 LEAD STEELDRUM | 0 | 1 | 115 Steel Drums | sempre |
| TIER1 DRUMS KIT | 1 | 10 | percussao | rally >= 5 |
| TIER1 CONGAS | 1 | 10 | percussao | rally >= 5 |
| TIER2 ARP DRIVE | 2 | 6 | 82 Lead 2 sawtooth | rally >= 10 |
| TIER3 HARMONY SQUARE | 3 | 4 | 81 Lead 1 square | rally >= 20 ou match point |

Canais na tabela sao 1-indexados como aparecem num DAW. No byte MIDI eles
sao 0, 1, 2, 3, 4, 5 e 9.

Entrada e saida de camada com fade de 250 ms evita clique. Sempre entrar
na proxima barra, nunca no meio dela, senao a camada soa fora de lugar.

## Aceleracao

O andamento e uma unica variavel. Nao trocar de arquivo, nao esticar audio.

```js
const BASE_TEMPO_BPM = 112;
const MAX_TEMPO_MULTIPLIER = 1.5;

function tempoMultiplierForRally(rallyCount) {
  const ramp = Math.min(rallyCount, 24) / 24;
  return 1 + (MAX_TEMPO_MULTIPLIER - 1) * Math.pow(ramp, 0.75);
}

function activeTiersForRally(rallyCount, isMatchPoint) {
  if (rallyCount >= 20 || isMatchPoint) return [0, 1, 2, 3];
  if (rallyCount >= 10) return [0, 1, 2];
  if (rallyCount >= 5) return [0, 1];
  return [0];
}
```

Isso vai de 112 a 168 BPM. A curva com expoente 0,75 sobe rapido nos
primeiros toques e desacelera perto do teto, entao o jogador sente a
mudanca cedo sem estourar o limite no rally 12.

Regras que valem a pena seguir:

- Interpolar o andamento em 400 ms em vez de saltar. Salto de BPM soa como
  glitch, rampa soa como tensao.
- No ponto, voltar ao andamento base em 1,2 s. Queda lenta e o alivio.
- Travar o teto em 1,5x. Acima disso a marimba e o arpejo viram zumbido.
- Se voce usa o multiplicador de velocidade da bola do item 4 da lista
  anterior, alimentar os dois com o mesmo contador de rally. Musica e bola
  acelerando juntas e o que cria a sensacao de aperto.

## Ganchos extras que a musica ja suporta

- **Barra de especial cheia:** subir o tier 2 uma barra antes do normal, ou
  abrir o filtro do pad. Avisa o jogador sem HUD.
- **Especial usado:** silenciar tudo menos bateria por 1 compasso e voltar.
  O corte chama mais atencao que qualquer efeito somado.
- **Match point:** forcar tier 3 e somar 4 BPM fixos ao resultado da curva.
- **Ponto perdido:** manter o andamento alto por 2 s antes de cair. Prolonga
  a tensao em vez de premiar o erro com alivio imediato.

## Tocando no navegador

MIDI ganha de loop de audio aqui exatamente porque o andamento muda. Esticar
um MP3 muda o pitch ou exige time-stretch com artefato. No MIDI o andamento
e um numero.

Opcoes que funcionam:

- `Tone.js` com `@tonejs/midi`. Le o arquivo, agenda as notas e o andamento
  vira `Tone.getTransport().bpm.rampTo(valor, 0.4)`. Mute por track resolve
  as camadas. Melhor caminho se voce quer sintetizar e nao carregar soundfont.
- `spessasynth_lib` com um soundfont GM. Som mais proximo do MIDI classico,
  custa o download do `.sf2`.
- Reconstruir a partir do `blobby_beach_theme.json`. Cada nota tem `step`
  em semicolcheias, `pitch`, `velocity` e `lengthSteps`. Um step dura
  `15 / bpm` segundos. E o caminho com menos dependencia.

Para som de cartucho em vez de GM, trocar steel drum e marimba por onda
triangular e pulse, e a bateria por ruido. A composicao aguenta: nada depende
de timbre acustico.
