# Blobby Volley — Remake

Remake em Three.js do [Blobby Volley 2](https://github.com/danielknobe/blobbyvolley2), com física idêntica à original e multiplayer P2P por rollback netcode.

**Jogar: https://esquyna360.github.io/blobbyvolleyremake/**

## O que tem aqui

- Física portada 1:1 do C++ original (integração de passo fixo, mesmas constantes, mesmas colisões). Quem jogava o Blobby de 2006 vai reconhecer o toque.
- Blobs renderizados por raymarching de SDF (metaballs) direto no fragment shader, com subsurface scattering, sombra suave e oclusão de ambiente.
- Praia procedural: areia com crateras dinâmicas onde a bola cai, mar com ondas de Gerstner, céu atmosférico, palmeiras balançando ao vento, 60 mil partículas na GPU.
- Rollback netcode estilo GGPO sobre WebRTC: predição de input, resimulação, detecção de desync por checksum. Sem servidor de jogo.
- Quatro conjuntos de regras: Clássico, Tennis, Blitz e Jumping Jack.

## Controles

| | Esquerda | Direita | Pular / bater |
|---|---|---|---|
| Jogador 1 | `A` | `D` | `W` ou `Espaço` |
| Jogador 2 | `←` | `→` | `↑` |

Gamepad e toque na tela também funcionam. `ESC` pausa.

A bola fica parada no ar antes do saque: pule nela para começar o ponto.

## Multiplayer

**Com sala (o jeito normal).** `Online P2P` → escolha um código de sala → `ENTRAR NA SALA`. Quem digitar o mesmo código cai na sua partida. Cada código é uma sala diferente, então dá para ter vários jogos rolando ao mesmo tempo.

**Sem relay (conexão direta).** `Criar convite` gera um bloco de texto; mande para a outra pessoa, ela cola em `Colar convite`, devolve o código de resposta e você cola de volta. Útil quando o signaling está bloqueado.

O signaling usa relays Nostr públicos só para os dois navegadores se acharem. Depois disso a partida é WebRTC direto entre os dois, sem servidor no meio.

## Rodando local

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # determinismo da simulação + sincronia do rollback
pnpm build
```

## Créditos

Jogo original: [Daniel Knobe e contribuidores](https://github.com/danielknobe/blobbyvolley2) (GPL-2.0). Este remake reimplementa as regras e a física a partir daquele código; nenhum asset original foi usado.
