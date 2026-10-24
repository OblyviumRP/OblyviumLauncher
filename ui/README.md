# Nova interface do Oblyvium Launcher

Protótipo funcional da próxima interface, em React. Fica separado do launcher atual (`app/`, EJS + jQuery): nada aqui é carregado pelo `index.js` ainda, e o build do instalador ignora esta pasta.

Todos os dados são simulados (`src/data/mock.ts`). Login, downloads, instalação e execução do jogo são simulações em `src/store/launcher.ts`, prontas para serem trocadas por IPC.

## Como rodar

```bash
npm run ui:install     # uma vez: dependências de ui/
npm run ui:dev         # navegador, com recarga instantânea (http://localhost:5173)
npm run ui:build       # gera ui/dist
npm run ui:electron    # abre ui/dist numa janela do Electron, 1100 × 700, sem moldura
```

Dentro de `ui/`: `npm run typecheck` e `npm run build`.

## Bibliotecas

| Biblioteca | Para quê |
|---|---|
| React 19 + Vite + TypeScript | base |
| Tailwind CSS 4 | estilos, com os tokens Forja em `src/index.css` (mesmos nomes de `app/assets/css/forja.css` e `DESIGN.md`) |
| Radix UI (`radix-ui`) | primitivos acessíveis: diálogo, menu, popover, select, abas, switch, slider, tooltip, checkbox |
| Motion | transição entre telas, indicador deslizante do menu e das abas, cartões, progresso, botão Jogar |
| Sonner | toasts |
| Zustand | estado global e persistência das preferências (`localStorage`) |
| React Router (HashRouter) | rotas que funcionam com `file://` no Electron |
| Lucide | ícones |

Os componentes em `src/components/ui/` seguem a API do shadcn com o visual Forja: raio máximo de 8px, controles de 32px (44px em tela de toque), foco violeta claro.

## Telas

| Rota | Tela |
|---|---|
| `/boas-vindas` | primeiro acesso em 3 etapas (conta, ajustes, por onde começar) |
| `/` | Início em grade bento: o cenário do topo troca com a instância escolhida |
| `/biblioteca` | instâncias com filtro, busca, ordenação e "Nova instância" |
| `/instancia/:id` | conteúdo (mods, resource packs, shaders, mundos), capturas, logs e configurações da instância |
| `/descobrir`, `/descobrir/:id` | busca de modpacks com filtros e página de instalação |
| `/skins` | skins do personagem atual com prévia 3D (arrastar gira), skins salvas, padrão e capa |
| `/downloads` | fila com pausar, retomar, cancelar, tentar de novo e limite de banda |
| `/console` | saída do jogo ao vivo, filtro por nível e aviso de falha com causa provável |
| `/configuracoes` | Geral, Java e memória, Jogo, Aparência, Downloads e rede, Avançado, Atualizações, Sobre |

Comportamentos globais:

- **Menu lateral recolhível:** 240px ↔ 56px pelo botão do topo ou pela tecla `[`. Recolhido, cada ícone mostra uma tooltip. O estado fica salvo.
- **Troca de conta:** pelo perfil no rodapé do menu, com a lista de contas, "Adicionar conta", "Trocar skin" e "Sair".
- **Notificações:** os toasts aparecem no canto. O sino da barra de título guarda o histórico, com o contador de não lidas.
- **Jogo aberto:** enquanto um jogo está aberto, a barra de título mostra o estado e leva ao console.
- **Animações:** "Reduzir animações" em Configurações e `prefers-reduced-motion` desligam as animações.

## Arte

Não há capturas nem arte oficial nesta pasta. Os cenários são pixel art gerada por código (`src/components/shared/pixel-scene.tsx`), uma paleta por instância. As telas que mostram o cenário grande trazem o aviso "Arte gerada, não é uma captura do servidor". Os quadrados coloridos de mods e skins também são marcadores.

`app/assets/images/backgrounds/0.jpg` não foi usada: é um fundo herdado do Helios com a marca de outro projeto.

## Próximos passos para ligar ao launcher

1. Expor no preload, via `contextBridge`, as funções que hoje ficam em `app/assets/js` (`authmanager`, `distromanager`, `processbuilder`, `configmanager`) e trocar as ações do store por essas chamadas.
2. Trocar os dados simulados pela distribuição, pelo RSS e pelas APIs do Modrinth e do CurseForge.
3. Carregar `ui/dist/index.html` no `index.js` atrás de uma opção e remover `ui/**` da lista de exclusão do `electron-builder.yml`. O build deve copiar só `ui/dist`, sem `ui/node_modules`.
