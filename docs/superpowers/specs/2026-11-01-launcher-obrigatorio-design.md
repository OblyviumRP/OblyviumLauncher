# Launcher obrigatório: desenho

Data: 2026-11-01 · Estado: proposta, aguardando as decisões do fim do documento

## O que dá e o que não dá

Ninguém consegue garantir 100%. O PC é do jogador: tudo o que o launcher faz, um programa feito por quem leu o
launcher também faz. O que este desenho entrega:

1. Nenhum cliente comum entra: vanilla, TLauncher, Lunar, Feather, Prism, launcher pirata, nem o próprio launcher
   antigo.
2. Burlar exige engenharia reversa do mod de atestação, e esse trabalho perde a validade a cada release, porque o
   protocolo muda e o proxy só aceita a versão atual.
3. Cheat injetado no jogo aberto pelo launcher (o Doomsday) é detectado pela evidência do mod. Quem passar por tudo
   isso ainda cai no anticheat de servidor, a única camada que o cliente não consegue falsificar.

## Situação hoje

- **Proxy** (`OblyviumProxy`, Velocity-CTD do Erick): o OblyviumAuth decide no `PreLoginEvent` entre PREMIUM
  (online-mode) e PIRATE (offline, com senha no limbo). Qualquer cliente 26.3 entra.
- **Login plugin message**: o Velocity tem `LoginPhaseConnection.sendLoginPluginMessage`, e o login só termina
  quando o cliente responde. Cliente sem o mod responde "não entendido".
- **Launcher**: contas Microsoft e offline; baixa o próprio OpenJDK; flags da JVM fixas no código; limpa
  `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS` e `JDK_JAVA_OPTIONS`; o jogador pode pôr mods da Modrinth, com a lista de
  proibidos da staff.
- **Demo de 2026-10-18**: agent, mod e desafio com HMAC detectaram o Doomsday em jogo (classes ocultas sem
  CodeSource: limpo 0, injetado ~1600) e depois foram apagados. O desenho volta aqui com o nome **OblyviumSentinel**,
  porque OblyviumGuard já é o firewall do Erick no proxy.

## Quem tenta entrar sem o launcher

| Nível | O que faz | O que barra |
|---|---|---|
| A | Entra com outro cliente | Camada 2: sem o mod, sem resposta ao desafio |
| B | Copia o ticket do launcher para outro PC ou cliente | Ticket preso ao IP e ao nick; a chave de sessão só existe dentro do processo do jogo |
| C | Script que imita o launcher e cliente próprio com cópia do mod | Camada 3 (evidência) e camada 4 (rotação) |
| D | Cheat injetado no jogo aberto pelo launcher | Camada 3 (classes ocultas, agents estranhos) e desafio periódico em jogo |
| E | Launcher ou mod modificados | Não dá para impedir: rotação, ofuscação e camada 5 |

## Desenho

### Camada 1: ticket de entrada

1. Ao clicar em Jogar, o launcher pede um ticket em uma rota nova do site (`POST /api/launcher/ticket`)
   com nick, UUID, tipo de conta, versão do launcher e id da instalação.
   - Conta Microsoft: vai junto o access token, e o site confere em `api.minecraftservices.com/minecraft/profile`
     que o nick e o UUID são dele.
   - Conta offline: o ticket fica preso só ao nick; a senha segue com o OblyviumAuth no limbo.
2. O site responde `ticket = payload + HMAC(S, payload)`, com `S` segredo compartilhado só entre o site e o proxy.
   Payload: `jti`, nick, IP visto pelo site, versão do launcher, versão do protocolo, validade de 12 h.
   A chave de sessão é `K = HMAC(S, "k" || jti)`: o site a manda ao launcher, o proxy a recalcula.
3. O launcher abre o Java com `ticket` e `K` escritos no **stdin** do processo e fecha o stdin. Nada vai nos
   argumentos (que aparecem na lista de processos) nem em arquivo.
4. Vale um uso por vez: o proxy recusa o `jti` se já houver uma conexão aberta com ele. Reconectar pelo menu do
   jogo funciona enquanto o jogo estiver aberto; jogo novo pede ticket novo.
5. Site recusa ticket para launcher abaixo da versão mínima, configurada no painel.

### Camada 2: mod de atestação (OblyviumSentinel, Fabric 26.3)

- Obrigatório em todo modpack (`fabricmods/required` no painel), junto de um agent Java que o launcher põe com
  `-javaagent` logo depois das flags fixas.
- No login, o proxy manda pelo canal `oblyvium:sentinel` um nonce de 32 bytes e a versão do protocolo.
- O mod responde `ticket`, `evidência` e `HMAC(K, nonce || jti || evidência)`.
- O proxy confere: HMAC do ticket com `S`, validade, nick igual ao do login, IP, versão do protocolo, `jti` livre e
  HMAC da resposta com `K`. Falhou ou não respondeu: recusa com "Entre pelo Oblyvium Launcher" e o link de download.
- Em jogo, o proxy repete o desafio a cada 5 min (o Doomsday injeta depois que o jogo abre). Sem resposta em 30 s:
  kick.
- O mod lê o stdin numa thread com prazo: aberto por outro launcher, fica sem ticket e o login é recusado.

### Camada 3: evidência

O que o mod mede dentro do processo e manda em cada resposta:

- Argumentos da JVM (`RuntimeMXBean.getInputArguments()`): só as flags do launcher; nenhum `-javaagent`,
  `-agentpath`, `-agentlib` ou `-Xbootclasspath` que o launcher não pôs.
- Java em uso: caminho e versão, que precisam ser os do OpenJDK que o launcher baixou.
- Mods carregados com SHA-1: os obrigatórios batem com o `distribution.json` do modpack; os extras não podem estar
  na lista de proibidos.
- Classes ocultas sem CodeSource contadas pelo agent (o sinal do Doomsday) e se o agent está mesmo carregado.

Evidência ruim no login vira recusa com o motivo. Em jogo vira alerta para a staff com nick, motivo e dados, mais
kick. HMAC inválido com ticket válido é adulteração e entra no registro de punições.

### Camada 4: rotação

- Cada release do mod muda a versão do protocolo, o formato da resposta e a ofuscação (ProGuard no mod e no
  agent). O proxy aceita só a versão atual e, por 24 h depois da troca, a anterior.
- O modpack sobe junto com o proxy; a versão mínima do launcher sobe quando a mudança tocar nele.
- `S` troca sem release, pelo config do proxy e pelo env do site.

### Camada 5: anticheat de servidor

Comportamento (reação de mira, jump reset), como na demo de 2026-10-18. Fica para uma spec própria; aqui só entra
como a camada que pega quem passou pelas outras.

## Modos e exceções

- `modo = desligado | aviso | obrigatório` no config do proxy. Em `aviso`, quem entra sem o launcher só aparece no
  log e no alerta da staff: serve para medir antes de obrigar.
- Lista de UUIDs premium liberados (staff e devs testando cliente próprio). Não dá para usar permissão, porque a
  checagem acontece antes do login terminar.
- macOS e Linux estão parados na 2.4.0 porque o CI da org não roda. No modo `obrigatório` esses jogadores ficam de
  fora até sair um build deles com o ticket.

## Onde mexe

| Peça | Repo |
|---|---|
| Rota do ticket, segredo `S`, versão mínima no painel | `oblyvium-website` (`src/app/api/launcher/ticket`) |
| Pedir o ticket, escrever no stdin, `-javaagent` do Sentinel | `OblyviumLauncher` (`processbuilder.js`, `launchservice.js`) |
| Mod e agent | repo novo `OblyviumRP/OblyviumSentinel` |
| Desafio no login e em jogo, modos, liberados | `OblyviumProxy`, módulo novo `sentinel/` ao lado do `auth/` (PR revisado pelo Erick) |
| Mod em todos os modpacks | painel do launcher (Nebula) |

A conferir na implementação: a API de login query do Fabric (`ClientLoginNetworking`) no 26.3 e, no canal de jogo,
o codec com bytes crus que a demo precisou.

## Critérios de aceite

- Vanilla 26.3 e outro launcher: recusados com a mensagem e o link.
- Ticket copiado para outro PC: recusado.
- Launcher com o Doomsday injetado: detectado no desafio seguinte (refazer o teste de 2026-10-18).
- Jogador normal: entra sem espera perceptível; reconectar pelo menu funciona.
- Proxy reiniciado com jogadores dentro: reconectam pelo menu sem abrir o launcher de novo.

## Decisões em aberto

1. **Punição**: kick e alerta para a staff (recomendado) ou ban automático em adulteração.
2. **IP no ticket**: preso ao IP (mais forte; risco de recusa quando o site e o proxy veem IPv4 e IPv6 diferentes
   ou em rede móvel, contornável pedindo o ticket por IPv4) ou só ao nick e à chave de sessão.
3. **Mods extras da Modrinth**: continuam liberados, com a lista de proibidos.
4. **macOS e Linux**: publicar à mão ou esperar o CI.
5. **Aviso antes de obrigar**: quantos dias em `aviso`.
