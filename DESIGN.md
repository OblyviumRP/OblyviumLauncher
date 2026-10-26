# DESIGN.md: Oblyvium · Forja refinada

Fonte das decisões visuais do site público, do portal do jogador e do painel da staff.
Os valores vivem em `src/app/globals.css`; este arquivo explica **o que usar e por quê**.
Referência pública: https://oblyvium.com.br/marca (marca 2.0.0, lida dos tokens no ar).
Histórico: Forja (2026-09-23, specs em `docs/superpowers/specs/2026-09-23-forja-*`) e Forja refinada
(2026-10-12, `docs/superpowers/specs/2026-10-12-forja-refinada-rebranding.md`).

## Identidade

- **Cor:** violeta. A alternativa vermelha (`feat/identidade-vermelha`) foi descartada em 2026-10-12.
- **Marca:** `src/components/brand/oblyvium-mark.tsx` é a fonte única dos traços. Na interface ela usa uma cor
  só (`currentColor`); o degradê `OBLYVIUM_GRADIENT` fica para favicon, ícone de app, imagem de compartilhamento e selo.
- **Tema:** só escuro. `<html class="dark">` é fixo; não existe tema claro.
- **Clima:** Minecraft RP medieval e místico. No site, céu noturno, lua, castelo, runas e o lacre. No painel,
  ferramenta de trabalho sóbria, sem decoração.

## Tokens

Regra de ouro: **mude o VALOR do token, nunca o nome.** Tokens novos ganham prefixo próprio
(`--ember*`, `--surface*`, `--fj-*`). Nada de cor crua (`text-violet-400`, `#hex` no JSX, `bg-white/5`) em tela nova.

### Painel e portal (tokens shadcn + Forja)

| Papel | Token | Valor | Uso |
|---|---|---|---|
| Fundo | `--background` | `#030305` | página |
| Cartão | `--card` / `--surface` | `#0e0e13` | cartões, painéis |
| Elevado | `--popover` / `--surface-2` | `#18181e` | popover, menu, cabeçalho de tabela |
| Lateral | `--sidebar` | `#09090d` | sidebar, topbar, fundo de input |
| Destaque | `--accent` | `#24242c` | hover sobre cartão |
| Texto | `--foreground` | `#ececf5` | texto principal |
| Texto secundário | `--muted-foreground` | `#babac2` | descrições |
| Metadado | `--muted-2` | `#aaaab2` | datas, contagens |
| Borda | `--border` | `#282830` | divisórias discretas |
| Borda 2 | `--border-2` | `#36363f` | separações nítidas, hover de menu/popover |
| Borda de controle | `--input-border` | `#71717b` | inputs, selects, checkbox |
| Foco | `--ring` | `#c4b5fd` | anel de foco (10,5:1) |
| Violeta | `--primary` / `--primary-light` | `#8b5cf6` / `#a78bfa` | marcas, links, ícone ativo |
| Botão primário | `--primary-fill` | `#7c3aed` | fundo com texto branco (5,70:1) |
| Brasa | `--ember` | `#f59e0b` | urgência, prioridade máxima, CTA raro |

Estados semânticos têm três tokens cada, **fundo / borda / texto**: `--{tom}-soft`, `--{tom}-line`, `--{tom}-fg`,
para `primary`, `success`, `warning`, `info`, `danger` e `ember`. Na marca 2.0.0 o fundo e a borda são a cor do tom
em 12% e 30% de opacidade (`#8b5cf61f`, `#8b5cf64d`).

### Site público (`--color-site-*`)

Os nomes vêm da fase medieval, os valores são violeta: `pergaminho` = texto claro, `ouro` = acento violeta claro
(`#a78bfa`), `lacre` = preenchimento dos botões (`#7c3aed`). Fundos: `site-bg` `#060608`, `site-band`,
`site-surface`. Textos: `site-title`, `site-text` (`#cbd5e1`), `site-muted` (`#abb8c9`).

## Tipografia

| Família | Onde | Como |
|---|---|---|
| Geist (`font-sans`) | tudo | corpo da interface |
| Geist Mono (`font-mono`) | IDs, datas, códigos, badges, cabeçalho de tabela | nunca em texto corrido |
| Cinzel (`font-display`) | **só no site público e no portal do jogador** | títulos e rótulos (`Kicker`); carregada em `src/components/site/fonts.ts` |
| Press Start 2P (`font-minecraft`) | **só em marcos** | nome na sidebar, rótulos de grupo, marca do login |

Escala compacta (painel): `text-2xs` 11 · `text-xs` 12 · `text-sm` **13 (corpo)** · `text-base` 14 · `text-lg` 16 ·
`text-xl` 20 · `text-2xl` 24 · `text-3xl` 32. Título do site: Cinzel 900, `tracking-normal`, entrelinha 1,15.
Nada de texto abaixo de 11px.

## Densidade, forma e espaço

- **Densidade compacta no desktop:** controles de 32px (`h-8`), corpo de 13px.
- **Toque:** todo controle ganha 44px em `@media (pointer: coarse)` (já embutido em `Button`, `Input`, `Select`,
  itens de menu e da paleta). Componente novo segue o mesmo padrão: `[@media(pointer:coarse)]:min-h-11`.
- **Raio:** teto de 8px (`rounded-2xl`/`3xl` colapsam em 8px). Controles com 4px, cartões com 6–8px.
- **Sombra:** só as do tema (`--shadow-*`), pensadas para o preto. Nada de brilho difuso.

## Layout

### Painel da staff
- Sidebar retrátil **240px ↔ 56px** (tecla `[`, estado no cookie `oblyvium-sidebar`), topbar de **56px**.
  Só o `main#conteudo` rola.
- Navegação vem de **`src/config/navigation.ts`** (sidebar, ⌘K e breadcrumbs derivam daqui). Não duplique rotas.
- Contadores da sidebar = **pendências pessoais** (`/api/pendencias`).

### Site público
- Hero centralizado sobre o `NightScene`: céu, estrelas, lua, montanhas, silhueta do castelo, névoa e brasas.
- `NightScene art="hero" | "seal"` adiciona a **arte conceitual de castelo e vila** (`public/castelo-vila-conceito.webp`)
  sob película escura. Toda tela com `art` mostra o `SceneFooter` ("Arte conceitual, não é uma captura do servidor").
  Nunca apresente arte gerada como captura real do servidor.
- Seções: `SectionHeading` / `Kicker` / `Ornament` / `PageHero` em `src/components/site/section.tsx`;
  botões `siteButton.primary` (lacre) e `siteButton.secondary`.
- Tela de construção: o lacre (5 toques ou digitar "oblyvium"), anéis de runas e a porta/portal. É decisão de
  produto; não simplificar.

### Portal do jogador (`/apply`, `/apply/status/[token]`, `/apply/lookup`, `/login` público)
- Cabeçalho "Portal do jogador" alinhado à esquerda, largura `max-w-5xl`.
- Ficha: duas colunas no desktop (`ApplyAside` "Antes de começar" + formulário); no celular empilha.
- Acompanhamento: à esquerda o estado (`StatusBadge` + `PlayerStatusTrack`: ficha enviada → análise → entrevista →
  decisão) e a ação do momento; à direita, fixa, "Conversa com a equipe". A lógica da trilha é
  `src/lib/whitelist/player-track.ts` (testada).
- Login: a marca dentro do cartão, título "Bem-vindo de volta.", botão do Discord em largura total.

## Componentes e padrões

- **Primitivos:** `src/components/ui/*` (mesma API do shadcn, visual Forja). Use as variantes, não classes soltas.
  - Botão: `default` (violeta), `secondary`, `outline`, `ghost`, `destructive`, `ember`, `link`.
  - Badge: tons `neutral`, `primary`, `success`, `warning`, `info`, `danger`, `ember` (mono, 11px).
- **Status:** sempre `StatusBadge` + o cadastro único `src/config/status.ts` (rótulo PT-BR + tom). Não crie mapas de cor locais.
- **Padrões compartilhados** (`src/components/shared/`): `DataTable`, `FilterBar`, `DetailHeader`, `FormDialog`,
  `ConfirmDialog`, `StatCard`, `EmptyState`, `ErrorState`, `AccessDenied`, `AreaNav`, `Field`.
- **Toda lista e detalhe tem os três estados:** carregando, vazio (com ação) e erro (com "Tentar novamente").
- **Gráficos:** cores de `src/components/financeiro/chart-theme.ts` (Recharts não lê variáveis CSS). Espelhe os tokens ao mudá-los.

## Regras que já custaram bug

- **Hover:** nunca `--surface-2` sobre cartão ou popover (1,09:1). Use `bg-accent` sobre cartão e
  `bg-border-2` em menu, popover e botão ghost.
- `--color-input` é a cor de **borda** (o shadcn usa `border-input`); o fundo do campo é `bg-input-fill`.
- Texto violeta em popover: `text-primary-light` (o `primary` dá 4,17:1).
- `--ease-out` colide com o do Tailwind 4: use `--ease-forja`.
- Em `globals.css`, fora de `@layer` só ficam `:root` e `@keyframes`. Seletor solto vence todo utilitário do Tailwind.
- Imagem estática que o site público precisa servir vai na **raiz** de `public/`; em subpasta, o proxy bloqueia
  (exige liberar em `src/config/route-access.ts` e `src/lib/host-routing.ts`).

## Movimento

- Durações `--dur-fast` 120ms, `--dur-base` 180ms, `--dur-slow` 280ms; curva `--ease-forja` (`cubic-bezier(.2, .8, .2, 1)`).
- `prefers-reduced-motion` desliga as animações (o spinner segue, mais lento).
- O site tem **"Pausar animações"** (`SceneFooter`, WCAG 2.2.2): marca o `<html>` com `data-site-motion="paused"` e
  congela o que tem `data-motion-pausable`. Animação nova do cenário deve morar dentro de um contêiner pausável;
  animação feita em JS lê `useSiteMotionPaused()` (`src/components/site/site-motion.ts`).

## Acessibilidade (mínimos)

- Texto ≥ 4,5:1; borda de controle e foco ≥ 3:1. Confira os pares com o verificador de contraste antes de trocar token.
- Foco sempre visível (`--ring`). Nunca `outline-none` sem substituto.
- Estado nunca só por cor: rótulo ou texto para leitor de tela (ver `PlayerStatusTrack`).
- Texto sobre imagem só com película por trás.
- Alvo de toque de 44px em `pointer: coarse`; no desktop, mínimo de 24px.
- Interface em português do Brasil, com acentos (cuidado com o PowerShell 5.1, que corrompe UTF-8 em `Set-Content`).
