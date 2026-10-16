# Perfis e tela de mods — desenho

Data: 2026-10-14 · Estado: aprovado em conversa, aguardando revisão do documento

## Objetivo

Dar ao jogador uma tela própria para gerenciar o que roda no jogo, no estilo do app da Modrinth: ver o que está
instalado, buscar e instalar mods, resource packs e shaders, e manter vários perfis por servidor, cada um com seu
conteúdo e seus ajustes de jogo. A lista de proibidos da staff continua valendo.

Fora do escopo: data packs, modpacks completos da Modrinth, CurseForge, sincronizar perfis entre computadores.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Estrutura da tela | Perfil no topo, abas **Instalados** e **Explorar** (estilo app da Modrinth) |
| Editar perfil | Ajustes de jogo (memória, Java, JVM, resolução) **e** vários perfis por servidor |
| Tipos de conteúdo | Mods, resource packs e shaders |
| Entrada na tela principal | Seletor **Perfil** ao lado do seletor de servidor; botão **Mods** no topo, ao lado das configurações |
| Armazenamento | Uma pasta de jogo por perfil |
| Aba Explorar | Lista com categorias na lateral; clicar abre a página do mod |

## 1. Perfis

### Modelo

Cada servidor tem uma lista de perfis. Todo servidor tem o perfil **Padrão** (`id: "padrao"`), que não pode ser
excluído e usa a pasta de hoje. Perfis novos ganham um id curto aleatório.

```jsonc
// config.json
"profiles": {
    "<serverId>": {
        "selected": "padrao",
        "list": [
            { "id": "padrao", "name": "Padrão", "icon": "espada", "created": "2026-10-14T19:00:00Z" }
        ]
    }
}
```

Os ajustes de cada perfil ficam onde os ajustes por servidor já ficam hoje, indexados por uma **chave de
configuração**: `<serverId>` para o Padrão e `<serverId>@<profileId>` para os outros.

| Ajuste | Onde fica |
|---|---|
| Memória, Java, argumentos da JVM | `javaConfig[<chave>]` (já existente) |
| Mods opcionais do pack | `modConfigurations[]` com `id: <chave>` (já existente) |
| Resolução e tela cheia | `gameConfig[<chave>]` (novo; começa com os valores globais de hoje) |

Assim o Padrão reaproveita sem cópia tudo o que o jogador já configurou, e o código atual continua funcionando
trocando só o argumento `serverId` pela chave.

### Pastas

| Perfil | Raiz de instância | Pasta do jogo |
|---|---|---|
| Padrão | `instances/` | `instances/<serverId>/` (a de hoje) |
| Outros | `instances/.perfis/<profileId>/` | `instances/.perfis/<profileId>/<serverId>/` |

Os mods do pack (`ForgeMod`/`FabricMod`) e bibliotecas ficam em `common/`, compartilhados. Só os módulos `File` do
pack (configs, `servers.dat` etc.) vão para a pasta do jogo; por isso o download do pack recebe a **raiz de instância
do perfil**, e cada perfil recebe os próprios arquivos do pack sem duplicar mods.

### Migração

Na primeira abertura com a versão nova, cada servidor da distribuição sem `profiles[serverId]` ganha o Padrão. Como a
chave do Padrão é o próprio `serverId`, memória, Java e mods opcionais já salvos continuam valendo sem cópia; a
resolução global vira a resolução inicial de cada perfil.

### Ciclo de vida

- **Criar:** nome obrigatório (1–32 caracteres), ícone, e "copiar configurações de…" (copia `options.txt`,
  `optionsof.txt`, `optionsshaders.txt` e `config/` de outro perfil; opcional).
- **Duplicar:** copia a pasta do jogo inteira (exceto `logs/` e `crash-reports/`) e os ajustes; nome "<nome> (cópia)".
- **Excluir:** diálogo de confirmação; a pasta vai para a lixeira (`shell.trashItem`, já usado pelo launcher). Se era o
  selecionado, o Padrão passa a ser o selecionado. O Padrão não tem essa ação.
- **Selecionar:** o launcher lembra o último perfil por servidor (`selected`).

### Ao clicar em Jogar

1. Lê o perfil selecionado do servidor.
2. Baixa/confere o pack usando a raiz de instância do perfil.
3. Desativa conteúdo proibido presente no perfil e avisa (checagem já existente, agora por perfil).
4. Abre o Minecraft com `gameDir` = pasta do jogo do perfil e os ajustes de Java/resolução do perfil.

## 2. Tela de mods

Nova view `#modsContainer`, aberta pelo botão **Mods** do topo da tela principal, no perfil escolhido no seletor.
Fecha com **Esc** ou "Voltar ao launcher", como as configurações.

### Cabeçalho

Ícone e nome do perfil, seletor para trocar de perfil, linha de resumo ("Forge 1.20.1 · 42 mods do pack · 3 seus"),
botões **Editar perfil** e **+ Adicionar conteúdo** (vai para Explorar).

### Aba Instalados

- Subdivisão por tipo: Mods, Resource packs, Shaders; campo para filtrar por nome.
- Item: ícone, nome, versão, interruptor ligar/desligar, **Remover**; **Atualizar** quando há versão compatível mais
  nova; **Atualizar tudo** no topo da lista.
- Arquivo que a Modrinth não reconhece: mostrado pelo nome do arquivo, sem ícone nem atualização.
- Grupo recolhido "Mods do pack (N) 🔒": só leitura, com os opcionais ligáveis (mesma regra de hoje).
- Shaders: só um ativo por vez (`optionsshaders.txt`), marcado na própria lista.
- Resource packs: ligar/desligar edita a linha `resourcePacks` do `options.txt` do perfil.

### Aba Explorar

- Seletor de tipo (Mods, Resource packs, Shaders), busca, ordenação (Relevância, Mais baixados, Recentes, Atualizados).
- Categorias da Modrinth do tipo escolhido em caixas de seleção à esquerda; lista paginada à direita.
- Filtros fixos: versão do Minecraft do servidor; loader (`forge`/`fabric`) para mods; `client_side` exigido ou
  opcional para mods.
- Ocultos: proibidos e mods que já vêm no pack. Já instalados aparecem como "✓ Instalado".

### Página do projeto

Abre ao clicar num resultado, com "Voltar à busca". Mostra descrição completa, galeria, versão que será instalada,
dependências que vêm junto, **Instalar** e "Ver na Modrinth ↗".

**Segurança:** a descrição é Markdown vindo da Modrinth. O renderer do launcher roda com acesso ao Node, então HTML
malicioso poderia executar código. A descrição passa por `marked` e depois por `DOMPurify` com lista restrita
(sem `script`, `iframe`, `style`, atributos `on*`, `javascript:`); imagens só por `https:`; todo link abre no
navegador via `shell.openExternal`, nunca dentro do launcher.

### Editar perfil

Painel com duas seções:

- **Geral:** nome, ícone, Duplicar, Excluir.
- **Jogo:** memória mínima e máxima, Java, argumentos da JVM, resolução. Reaproveita os controles e validadores que
  hoje estão nas abas Minecraft e Java das configurações.

### Tela principal

- Barra inferior: status · seletor de servidor · seletor de perfil · Jogar.
- Topo direito: perfil do usuário · **Mods** · configurações.

### Configurações

- As abas **Mods** e **Java** saem (tudo da aba Java vira ajuste do perfil).
- A aba **Minecraft** perde resolução e tela cheia (viram ajuste do perfil) e mantém "conectar automaticamente" e
  "abrir separado do launcher", que continuam globais.

## 3. Código

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `app/assets/js/profilemanager.js` (novo) | CRUD de perfis, selecionado por servidor, raiz e pasta do jogo, migração | `configmanager` |
| `app/assets/js/contentmanager.js` (novo) | Listar/ligar/desligar/remover conteúdo por tipo, shader ativo, resource packs no `options.txt`, identificar pela Modrinth | `modrinth`, `fs-extra` |
| `app/assets/js/modrinth.js` (ampliado) | Busca por tipo e categoria, categorias, projeto, versões, atualizações (`version_files/update`), instalação verificada | `got` |
| `app/mods.ejs` + `app/assets/js/scripts/mods.js` (novos) | Tela de mods | os três acima |
| `app/assets/css/forja.css` | Estilos da tela, tokens da Forja | — |
| `landing.js`, `processbuilder.js` | Seletor de perfil, botão Mods, Jogar com a pasta do perfil | `profilemanager` |
| `settings.ejs`/`settings.js` | Remover abas Mods e Java e os campos de resolução, que viraram do perfil | — |

`dropinmodutil.js` é substituído por `contentmanager.js`. Dependências novas: `marked`, `dompurify`.
`modrinth.js` aceita a base da API por variável de ambiente (`OBLYVIUM_MODRINTH_API`) só para os testes.

## 4. Erros

| Situação | O que o jogador vê |
|---|---|
| Modrinth fora do ar | "Não foi possível falar com a Modrinth." + **Tentar novamente**; Instalados segue funcionando |
| HTTP 429 | "Muitas buscas seguidas, aguarde alguns segundos." |
| Hash diferente / erro de disco | Nada fica na pasta; a linha do item mostra o motivo |
| Proibido / dependência proibida | Mensagens atuais, na linha do item |
| Excluir perfil | Diálogo de confirmação; pasta vai para a lixeira |
| Pasta do perfil apagada por fora | Recriada vazia no próximo Jogar; o pack é baixado de novo |

## 5. Testes

- **Unitários** (`node --test`, pasta `test/`): `profilemanager` (migração, criar/duplicar/excluir, pastas),
  `contentmanager` (ligar/desligar por tipo, shader ativo, `options.txt`), `modrinth` (busca, instalação,
  dependências, proibidos, atualização) contra um servidor HTTP local com respostas gravadas.
- **Electron** (`scripts/verify-mods.cjs`, no padrão de `verify-visual.cjs`): criar perfil, buscar, abrir página do
  projeto, instalar, ligar/desligar, atualizar, trocar de perfil, proibidos, descrição com HTML malicioso neutralizada;
  capturas em 1100×700 e 800×600.
- **Real:** uma busca e uma instalação contra a Modrinth de verdade, antes do merge.
