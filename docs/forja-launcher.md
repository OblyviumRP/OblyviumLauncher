# Oblyvium Launcher · Forja refinada

O launcher aplica a identidade de `DESIGN.md` com Electron, EJS e CSS, sem mudar de framework.

- Violeta e fundos: os valores oficiais ficam em `app/assets/css/forja.css`, com os mesmos nomes de tokens. Os estilos antigos ficam na camada `legacy`; o tema define a apresentação atual.
- Tipografia: Geist no corpo, Geist Mono nos dados, Cinzel nas telas do jogador e Press Start 2P na marca da lateral. Fontes locais, sem requisições externas.
- Composição: cenário nas telas do jogador; configurações com lateral de 240px e conteúdo rolável. Janela inicial de 1100 × 700, mínima de 800 × 560.
- Forma: controles de 4px e cartões de 6–8px; foco violeta claro, sem brilho no hover.
- Movimento: cenário estático; transições curtas e indicador de carregamento. `prefers-reduced-motion` remove animações decorativas. Energia 2, ritmo 2, movimento 1.
- A marca e o castelo identificam o produto; o botão Jogar é o foco da tela principal. A arte traz a indicação de que não é uma captura do servidor.

## Origem dos recursos

A marca foi transcrita de `staff-dashboard-next/src/components/brand/oblyvium-mark.tsx`, mantendo os cinco traços oficiais. Os ícones PNG/ICO são rasterizações da mesma marca.

O cenário é `staff-dashboard-next/public/castelo-vila-conceito.webp`. As quatro fontes foram copiadas dos arquivos latinos usados pelo build do mesmo site, em `.next/static/media`.

## Verificação

Execute `npm run verify:visual`. O verificador abre Electron com janela oculta, dados de teste e perfil próprio em `%TEMP%/oblyvium-launcher-qa`. Não usa as contas ou instalações do usuário. Renderiza os templates reais e usa os eventos e handlers reais da interface.

Verifica boas-vindas → opções de conta → validação do nome → login offline → tela principal, sete abas de configuração, um toggle, seleção de servidor, fechamento de diálogo com Escape, progresso e layouts em 1100, 800 e 390px. As capturas ficam na pasta temporária. A distribuição do teste é fictícia e explicitamente identificada como teste visual.

Também verifica o acionamento único de confirmar/cancelar com Enter, controle de memória e seleção de shaders pelo teclado e envio do pedido de login Microsoft por IPC. Os diálogos prendem o foco e devolvem-no ao controle de origem.

Contraste verificado: texto principal no botão 4,85:1, no hover 6,05:1; texto secundário no cartão 7,44:1.

O teste não autentica uma conta Microsoft real, não baixa um modpack e não inicia Minecraft. As URLs existentes de distribuição, comunidade e suporte permanecem configuradas como antes; elas precisam receber os destinos oficiais do Oblyvium para uma distribuição pública.

O nome de exibição, o ícone, o identificador do aplicativo e o diretório de arquivos do jogo (`.OblyviumLauncher`) são do Oblyvium.

O build padrão `npm run dist:win` foi verificado e gera o instalador NSIS em `dist/Oblyvium Launcher-setup-2.0.4.exe`, além do aplicativo em `dist/win-unpacked`. As ferramentas de build Windows estão preparadas no cache local; não foi necessário extrair bibliotecas do macOS nem criar seus links simbólicos. A execução em macOS/Linux não foi verificada.

## Tela principal revisada

O título e a descrição têm mais presença sobre o cenário. A seleção fica exclusivamente no rodapé, centralizada junto ao botão Jogar, com o ícone do servidor configurado na distribuição. Perfil e configurações dividem uma linha; Discord, Instagram, YouTube e TikTok ficam logo abaixo, no canto direito. Não há botão de comunidade no rodapé.

O centro fica livre quando não há RSS. Com um artigo válido, aparece somente a notícia mais recente, com título, resumo e link para a publicação original. O resumo também aceita `description` do RSS. Títulos e resumos longos têm limite visual de linhas. O texto do aviso usa `textContent`; a extração do resumo acontece em um template inerte.

Instagram, YouTube e TikTok ainda não têm destinos oficiais informados: aparecem indisponíveis, sem links fictícios. Os destinos são configurados em `app/assets/lang/_custom.toml`. O Discord mantém a URL que já estava no projeto.

### Verificação antislop

- PASS · Identidade e propósito: paleta e fontes do DESIGN.md; cenário identifica o jogo, rodapé concentra as ações, ícones sociais representam seus destinos.
- PASS · Conteúdo: a notícia vem do RSS configurado; nenhum comunicado ou número foi inventado para preencher a tela. Redes sem destino são explicitamente indisponíveis.
- PASS · Layout e interação: QA no Electron verifica centralização do grupo Jogar/seletor, alinhamento perfil/configurações, seleção com ícone, ausência de CTA de comunidade e notícia oculta sem feed.
- PASS · Leitura e estados: contraste dos tokens validado; RSS com título longo, seleção vazia, progresso e diálogos testados. Energia 2, ritmo 2, movimento 1, cenário estático.

## Navegação e modais

Logo, títulos, explicações, campos e ações de login, boas-vindas e diálogos ficam centralizados. A transição entre telas leva 180ms por padrão e transfere o foco ao primeiro controle principal identificado com `data-view-focus`, preservando o foco quando há um diálogo aberto.

Configurações têm uma barra fixa com **Voltar ao launcher**, indicação de que voltar salva as preferências e atalho **Esc**. A lateral usa **Salvar e voltar**. Os três caminhos reutilizam o mesmo handler existente de salvar. Campos inválidos desabilitam ambos os botões e mostram a instrução de revisão; corrigir o campo os libera. Esc fecha primeiro um dropdown ou diálogo aberto.

As ações de selecionar e desconectar conta são visíveis sem hover. Conteúdo de configuração tem largura máxima de 1160px e espaçamento constante entre os grupos de conta, para leitura em janelas grandes.

O QA no Electron também verifica centralização do modal offline, foco dos campos, saída pelos três caminhos, erro/correção de resolução, fechamento do dropdown sem sair da aba e configurações em 800 e 1920px. O teste usa perfil isolado; não autentica uma conta Microsoft real nem inicia o Minecraft.

## Perfis e tela de mods

Cada servidor tem perfis. O **Padrão** usa a pasta de jogo de sempre (`instances/<servidor>`); perfis novos ficam em `instances/.perfis/<id>/<servidor>`. Cada perfil tem os próprios mods, resource packs, shaders, `options.txt`, teclas, mundos, memória, Java, argumentos da JVM, resolução e mods opcionais do pack. Os mods obrigatórios do pack ficam em `common/` e não são baixados de novo por perfil.

O jogador escolhe o perfil ao lado do servidor, na tela principal, e abre a tela **Mods** pelo botão no topo. Nela há:

- **Instalados:** mods, resource packs e shaders do perfil, com ligar/desligar, remover e atualizar; o grupo "Mods do pack" mostra o que a staff mantém.
- **Explorar:** busca na Modrinth filtrada pela versão e pelo loader do servidor, com categorias e página de cada projeto. A descrição do projeto passa por limpeza de HTML antes de aparecer.
- **Editar perfil:** nome, ícone, ajustes de jogo, duplicar e excluir (a pasta vai para a lixeira).

A staff proíbe projetos no `distribution.json`, na entrada de cada servidor, por slug ou ID da Modrinth:

```json
{
    "id": "oblyvium-1.20.1",
    "modrinth": {
        "blocked": ["xaeros-minimap", "freecam", "AANobbMI"]
    }
}
```

Proibidos e suas dependências não aparecem nem instalam. Antes de abrir o jogo, o launcher identifica pelo hash o conteúdo ativo do perfil e desativa o que estiver proibido, avisando o jogador. Se a Modrinth estiver fora do ar, o jogo abre sem a checagem.

Limites: só arquivos publicados na Modrinth são reconhecidos; um jar modificado ou de outro site passa pela checagem. A lista é uma barreira de conveniência; anticheat de verdade fica no servidor. Proibir resource packs e shaders desativa o item no `options.txt`/configuração de shaders antes de abrir o jogo, mas o arquivo continua na pasta e pode ser reativado dentro do jogo até a próxima abertura pelo launcher.

Testes: `npm test` (módulos de perfis, conteúdo e Modrinth, contra uma Modrinth falsa local) e `npm run verify:mods` (tela no Electron, com capturas em `%TEMP%\oblyvium-mods-qa`).

### Detalhes além do plano original

- Links nas descrições de projetos e na notícia da tela principal sempre abrem no navegador do sistema: a janela principal não navega para fora da própria página (`navigationguard.js` intercepta `will-navigate` e janelas novas).
- A descrição do mod/resource pack/shader e o conteúdo da notícia (RSS) passam pelo mesmo sanitizador de HTML (`richtext.js`, DOMPurify com lista branca de tags/atributos e só URLs `https:`).
- Instalações são enfileiradas uma de cada vez (nunca em paralelo) e todo nome de arquivo anunciado pela Modrinth é validado antes de tocar o disco.
- **Remover** manda o mod/resource pack/shader para a lixeira do sistema, com fallback para exclusão definitiva se a lixeira falhar; excluir um perfil manda a pasta inteira para a lixeira do mesmo jeito.
- O botão **Mods** e o seletor de perfil ficam bloqueados enquanto o jogo está abrindo ou rodando, para o perfil não mudar por baixo do jogo.
- Memória, executável do Java, argumentos da JVM e resolução saíram de Configurações e agora ficam em **Editar perfil**, por perfil.

