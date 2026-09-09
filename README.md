# Blobby Volley — Remake

Remake em Three.js do [Blobby Volley 2](https://github.com/danielknobe/blobbyvolley2), com física idêntica à original e multiplayer P2P por rollback netcode.

**Jogar: https://esquyna360.github.io/blobbyvolleyremake/**

## O que tem aqui

- Física portada 1:1 do C++ original (integração de passo fixo, mesmas constantes, mesmas colisões). Quem jogava o Blobby de 2006 vai reconhecer o toque.
- Blobs renderizados por raymarching de SDF (metaballs) direto no fragment shader, com subsurface scattering, sombra suave e oclusão de ambiente.
- Praia procedural: areia com crateras dinâmicas onde a bola cai, mar com ondas de Gerstner, céu atmosférico, palmeiras balançando ao vento, 60 mil partículas na GPU.
- Rollback netcode estilo GGPO sobre WebRTC: predição de input, resimulação, detecção de desync por checksum. Sem servidor de jogo.
- Quatro conjuntos de regras: Clássico, Tennis, Blitz e Jumping Jack.
- Lista de salas abertas em tempo real, também sem servidor: os hosts anunciam a sala pelo próprio relay de signaling.
- Áudio procedural (mar, vento, pad, sons de toque) gerado em WebAudio — nenhum arquivo de som no repositório.
- Cinco presets gráficos: um modo **2D em Canvas puro** (roda só na CPU, para máquinas sem GPU decente) e quatro presets 3D de Baixa a Ultra. Detecção automática na primeira vez e queda automática se o FPS não segurar.

## Controles

| | Esquerda | Direita | Pular / bater |
|---|---|---|---|
| Jogador 1 | `A` | `D` | `W` ou `Espaço` |
| Jogador 2 | `←` | `→` | `↑` |

Gamepad e toque na tela também funcionam. `ESC` pausa.

A bola fica parada no ar antes do saque: pule nela para começar o ponto.

## Multiplayer

**Entrar numa sala aberta.** `Online P2P` → a lista `SALAS ABERTAS` mostra quem está esperando oponente agora. Clique no nome e a partida começa.

**Abrir a sua.** `Online P2P` → escreva seu nome → `ABRIR SALA`. Sua sala entra na lista de todo mundo enquanto você espera. O código também serve sozinho: quem digitar o mesmo código cai na sua partida, então dá para combinar uma sala privada com os amigos e ter vários jogos rolando ao mesmo tempo.

**Sem relay (conexão direta).** `Criar convite` gera um bloco de texto; mande para a outra pessoa, ela cola em `Colar convite`, devolve o código de resposta e você cola de volta. Útil quando o signaling está bloqueado.

O signaling usa relays Nostr públicos só para os dois navegadores se acharem. Depois disso a partida é WebRTC direto entre os dois, sem servidor no meio.

**Atravessando NAT:** o jogo usa STUN e, quando isso não basta, TURN da Cloudflare Realtime. STUN sozinho não vaza CGNAT — rede móvel 4G/5G quase sempre está atrás de um — então sem TURN só funcionava Wi-Fi contra Wi-Fi. A credencial TURN é de curta duração e vem de `edge/api/ice.js`, uma function na Vercel que guarda a chave; o bundle nunca a vê. Continua sem servidor de jogo: o endpoint só assina credencial, o tráfego da partida é P2P.

## Rodando local

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # determinismo da simulação + sincronia do rollback
pnpm build
```

## Ajustes

`Gráficos` e `Som` ficam no menu principal e também na pausa (`ESC`), então dá para mexer no meio da partida. `M` liga e desliga o som direto.

## Créditos

Jogo original: [Daniel Knobe e contribuidores](https://github.com/danielknobe/blobbyvolley2) (GPL-2.0). Este remake reimplementa as regras e a física a partir daquele código; nenhum asset original foi usado.
