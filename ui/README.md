# Nova interface do Oblyvium Launcher

Interface do launcher em React. O `index.js` abre `ui/dist/index.html`; sem o build, avisa para rodar `npm run ui:build`. A interface antiga (EJS e jQuery) foi removida na versão 3.

A janela é a mesma de antes: `nodeIntegration`, sem `contextIsolation` e com o mesmo preload (`app/assets/js/preloader.js`). Por isso a interface chama os módulos do launcher direto, sem IPC novo.

## Como rodar

```bash
npm run ui:install     # uma vez: dependências de ui/
npm run ui:build       # gera ui/dist
npm start              # launcher com a nova interface
npm run ui:dev         # navegador com dados simulados (http://localhost:5173)
npm run ui:verify      # abre ui/dist no Electron com uma distribuição falsa e percorre as telas
npm --prefix ui run i18n:check   # lista textos sem tradução (também roda no build)
```

No Linux sem tela: `xvfb-run -a npm run ui:verify` (como root, `npx electron --no-sandbox scripts/verify-ui.cjs`). As capturas ficam em `$TMPDIR/oblyvium-ui-qa`.

`npm run dist` roda `ui:build` antes do `electron-builder`. O instalador leva só `ui/dist`; o código-fonte e o `node_modules` de `ui/` ficam de fora (`electron-builder.yml`). O CI instala e compila a interface nos dois jobs.

## Como a interface fala com o launcher

```
src/backend/types.ts     contrato (Backend) entre a interface e o launcher
src/backend/electron.ts  implementação real: require dos módulos de app/assets/js
src/backend/mock.ts      implementação simulada, usada no navegador
src/store/launcher.ts    estado da tela (zustand) em cima do Backend
```

A lógica do launcher que não depende de tela fica em módulos sem DOM, com testes em `test/`:

| Módulo | O que faz |
|---|---|
| `app/assets/js/core/launchservice.js` | Java (validar, procurar, baixar), verificar e baixar arquivos, desligar conteúdo bloqueado pela staff, abrir o jogo, logs, Discord |
| `app/assets/js/core/distrosync.js` | mods opcionais do pacote por perfil e configuração de Java por perfil |
| `app/assets/js/core/news.js` | RSS da distribuição em texto puro (sem HTML) |
| `app/assets/js/core/skins.js` | skin e capa pela API de serviços do Minecraft e a biblioteca local de skins |

## Idiomas

Português (Brasil), inglês e espanhol. O texto em português é a própria chave: `t('Jogar')` vira `Play` em inglês. As traduções ficam em `src/i18n/en.ts` e `src/i18n/es.ts`. O build falha se algum texto passado para `t()` não tiver tradução (`npm run i18n:check`). O idioma escolhido fica no `config.json` do launcher (`settings.launcher.language`); sem escolha, segue o sistema.

Mensagens que vêm do launcher (status do `en_US.toml` e erros das skins) passam pelo mesmo `t()`. `UserError` traduz título e mensagem sozinho.

## Configuração do jogo

Memória máxima, tamanho da janela e tela cheia do jogo valem para todos os modpacks e perfis (Configurações → Jogo). `app/assets/js/core/gamesettings.js` copia esses valores para a configuração de cada modpack e perfil, que é o que o `ProcessBuilder` lê. A memória respeita o mínimo de cada modpack. O Java continua por modpack, porque cada versão do Minecraft pede o seu.

## Tela cheia do launcher

A janela tem tamanho fixo (1100 × 700). F11, o botão da barra de título ou Configurações → Geral → "Launcher em tela cheia" (que também vale para as próximas aberturas) liberam o limite enquanto durar a tela cheia (`WINDOW_OPCODE` em `index.js`).

## Telas

O launcher é exclusivo do Oblyvium: o jogador não instala mods, resource packs nem shaders, não cria perfis e não procura modpacks. Do servidor, só liga ou desliga os mods que a staff marcou como opcionais.

| Rota | Tela |
|---|---|
| `/boas-vindas` | login Microsoft ou offline e escolha do servidor no primeiro acesso; `?adicionar=1` só adiciona conta |
| `/` | arte do servidor com transição em pixels, nome, Jogar, ficha do servidor (jogadores, tempo de resposta, endereço, versão, renderizador Vulkan/OpenGL, pacote), notícias e outros servidores para trocar |
| `/perfil` | mods do servidor (só os opcionais da staff podem ser desligados), capturas, `latest.log`, Java do servidor, renomear, verificar arquivos e excluir perfis antigos |
| `/skins` | skin e capa da conta Microsoft com prévia 3D a partir da textura, biblioteca local de skins |
| `/downloads` | tarefas da sessão: arquivos do jogo, Java, atualização do launcher |
| `/console` | saída do jogo ao vivo, filtro por nível, rolagem automática que pausa ao rolar para cima, aviso de falha com o crash report |
| `/configuracoes` | Geral (idioma, tela cheia, o que fazer ao abrir o jogo), Jogo (memória e janela globais), Contas, Sobre e atualizações |

Endereços antigos (`/descobrir`, `/modpacks`, `/servidores`) voltam ao Início.

Comportamentos globais:

- **Menu lateral:** encostado na borda, recolhível (240px ↔ 56px) pelo botão do topo ou pela tecla `[`. O item ativo tem um filete violeta na lateral. Perfis só aparecem no menu quando há mais de um (criados em versões antigas).
- **Troca de conta:** pelo botão da conta no rodapé do menu.
- **Notificações:** o feed `notifications.json` da staff (a cada 5 minutos), atualização do launcher, conteúdo bloqueado e falhas do jogo vão para o sino da barra de título.
- **Jogo aberto:** a barra de título mostra o estado e leva ao console. Trocar servidor, perfil ou conta fica bloqueado até o jogo fechar.

## Arte

Quando o servidor tem `background` na distribuição, o Início e o perfil usam essa imagem. Sem ela, entra a pixel art gerada por código (`src/components/shared/pixel-scene.tsx`), com o aviso "Arte gerada, não é uma captura do servidor".

## Segurança

O build coloca uma Content-Security-Policy no `index.html` (`vite.config.ts`): só scripts locais; imagens remotas por HTTPS e das texturas da Mojang; `fetch` só para a API de skins. Links externos (notícias, changelog) abrem no navegador.
