# Nova interface do Oblyvium Launcher

Interface do launcher em React. O `index.js` abre `ui/dist/index.html` quando ele existe; sem o build, ou com `OBLYVIUM_LEGACY_UI=1`, abre a interface antiga (`app/app.ejs`).

A janela é a mesma de antes: `nodeIntegration`, sem `contextIsolation` e com o mesmo preload (`app/assets/js/preloader.js`). Por isso a interface chama os módulos do launcher direto, sem IPC novo.

## Como rodar

```bash
npm run ui:install     # uma vez: dependências de ui/
npm run ui:build       # gera ui/dist
npm start              # launcher com a nova interface
npm run ui:dev         # navegador com dados simulados (http://localhost:5173)
npm run ui:verify      # abre ui/dist no Electron com uma distribuição falsa e percorre as telas
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

Lógica que antes vivia presa ao DOM do `landing.js`, `uibinder.js` e `mods.js` foi separada em módulos sem DOM, com testes em `test/`:

| Módulo | O que faz |
|---|---|
| `app/assets/js/core/launchservice.js` | Java (validar, procurar, baixar), verificar e baixar arquivos, bloquear conteúdo, abrir o jogo, logs, Discord |
| `app/assets/js/core/distrosync.js` | mods opcionais do pacote por perfil e configuração de Java por perfil |
| `app/assets/js/core/news.js` | RSS da distribuição em texto puro (sem HTML) |
| `app/assets/js/core/skins.js` | skin e capa pela API de serviços do Minecraft e a biblioteca local de skins |

A interface antiga continua usando o código dela; os módulos novos não mudam o comportamento dela.

## Telas

| Rota | Tela |
|---|---|
| `/boas-vindas` | login Microsoft ou offline e escolha do servidor no primeiro acesso; `?adicionar=1` só adiciona conta |
| `/` | servidor selecionado (arte da distribuição ou cenário gerado), perfil, Jogar, jogadores online, downloads, notícias do RSS |
| `/servidores` | servidores da distribuição e perfis do servidor selecionado (criar, selecionar) |
| `/perfil` | conteúdo do perfil (mods, resource packs, shaders, com atualizações do Modrinth), mods opcionais do servidor, capturas, `latest.log`, Java, memória, janela, renomear, duplicar, verificar arquivos, excluir |
| `/descobrir`, `/descobrir/:id` | busca no Modrinth filtrada pela versão e loader do servidor, sem bloqueados nem mods do pacote; instala no perfil selecionado |
| `/skins` | skin e capa da conta Microsoft com prévia 3D a partir da textura, biblioteca local de skins |
| `/downloads` | tarefas da sessão: arquivos do jogo, Java, instalações do Modrinth, atualização do launcher |
| `/console` | saída do jogo ao vivo, filtro por nível, aviso de falha com o crash report |
| `/configuracoes` | Geral, Contas, Java e jogo (leva às configurações do perfil), Sobre e atualizações com as notas do changelog |

Comportamentos globais:

- **Menu lateral recolhível:** 240px ↔ 56px pelo botão do topo ou pela tecla `[`. Recolhido, cada ícone mostra uma tooltip. O estado fica salvo.
- **Perfis no menu:** os perfis do servidor selecionado ficam no menu lateral para trocar rápido.
- **Troca de conta:** pelo botão da conta no rodapé do menu.
- **Notificações:** o feed `notifications.json` da staff (a cada 5 minutos), atualização do launcher, conteúdo bloqueado e falhas do jogo vão para o sino da barra de título.
- **Jogo aberto:** a barra de título mostra o estado e leva ao console. Trocar servidor, perfil ou conta fica bloqueado até o jogo fechar.

## Arte

Quando o servidor tem `background` na distribuição, o Início e o perfil usam essa imagem. Sem ela, entra a pixel art gerada por código (`src/components/shared/pixel-scene.tsx`), com o aviso "Arte gerada, não é uma captura do servidor".

## Segurança

O build coloca uma Content-Security-Policy no `index.html` (`vite.config.ts`): só scripts locais; imagens remotas por HTTPS e das texturas da Mojang; `fetch` só para a API de skins. A descrição de projetos do Modrinth passa pelo `richtext.js` antes de entrar na página, e os links abrem no navegador.
