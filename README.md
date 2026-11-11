<p align="center">
  <img src="./app/assets/images/OblyviumIcon.png" width="120" height="120" alt="Oblyvium">
</p>

<h1 align="center">Oblyvium Launcher</h1>

<p align="center">
  O launcher oficial do Oblyvium, servidor de Minecraft RP medieval.<br>
  Ele instala o Java, os mods e as atualizações. Você entra com a conta e joga.
</p>

<p align="center">
  <a href="https://oblyvium.com.br/launcher"><img src="https://img.shields.io/github/package-json/v/OblyviumRP/OblyviumLauncher?style=for-the-badge&label=vers%C3%A3o&color=7c3aed" alt="versão"></a>
  <img src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-18181e?style=for-the-badge" alt="Windows, macOS e Linux">
  <a href="https://discord.gg/oblyvium"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="https://oblyvium.com.br/launcher"><b>Baixar</b></a>
  &nbsp;·&nbsp;
  <a href="https://oblyvium.com.br">Site</a>
  &nbsp;·&nbsp;
  <a href="https://discord.gg/oblyvium">Discord</a>
</p>

<p align="center">
  <img src="./ui/src/assets/scene/jormungandr.webp" alt="Jörmungandr, a arte de fundo da tela de Início do launcher">
</p>

## Baixar

Os instaladores ficam em [oblyvium.com.br/launcher](https://oblyvium.com.br/launcher). Escolha o do seu sistema:

| Sistema | Arquivo |
| --- | --- |
| Windows x64 | `Oblyvium-Launcher-setup-VERSÃO.exe` |
| macOS Intel | `Oblyvium-Launcher-setup-VERSÃO-x64.dmg` |
| macOS Apple Silicon | `Oblyvium-Launcher-setup-VERSÃO-arm64.dmg` |
| Linux x64 | `Oblyvium-Launcher-setup-VERSÃO.AppImage` |

Os instaladores ainda não são assinados, então o Windows e o macOS podem pedir confirmação na primeira vez que você abrir.

Depois de instalado, o launcher avisa quando sai uma versão nova e o botão Jogar pede para atualizar. Nada é instalado sem esse clique.

## O que ele faz

- Entra com a conta Microsoft ou no modo offline, guarda várias contas e troca entre elas pelo menu.
- Procura um Java compatível no computador e baixa o certo quando não acha (Java 25 para o Minecraft 26 em diante). Você não precisa ter Java instalado.
- Confere os arquivos do jogo antes de abrir e baixa de novo o que estiver faltando ou corrompido.
- Mantém o modpack oficial em dia sem apagar o que você configurou.
- Mostra as notificações da staff, as novidades de cada versão e o estado do servidor (jogadores, tempo de resposta, versão).
- Funciona em português, inglês e espanhol.

### Telas

| Tela | O que tem |
| --- | --- |
| Início | Arte do servidor, botão Jogar, ficha do servidor e notícias |
| Descobrir | Busca no Modrinth de mods, resource packs e shaders compatíveis com o modpack oficial |
| Perfil | Conteúdo instalado, mods opcionais do servidor, capturas, `latest.log` e verificação de arquivos |
| Skins | Skin e capa da conta Microsoft com prévia 3D e uma biblioteca local de skins |
| Downloads | Tarefas da sessão: arquivos do jogo, Java e atualização do launcher |
| Console | Saída do jogo ao vivo com filtro por nível e aviso de falha com o crash report |
| Configurações | Idioma, memória e janela do jogo, contas, novidades e atualizações |

O launcher é exclusivo do Oblyvium: o jogador não cria perfis nem instala outros modpacks. O que a staff bloqueia não aparece na busca e é desligado antes de o jogo abrir.

## Desenvolvimento

Você precisa do [Node.js 22](https://nodejs.org/) (a versão está no `.nvmrc`).

```console
git clone https://github.com/OblyviumRP/OblyviumLauncher.git
cd OblyviumLauncher
npm install
npm run ui:install
npm run ui:build
npm start
```

O `npm start` abre o que está em `ui/dist`. Sem o `ui:build`, o launcher avisa que a interface não foi compilada. Em desenvolvimento a janela já abre com o DevTools.

| Comando | O que faz |
| --- | --- |
| `npm start` | Abre o launcher com a interface compilada |
| `npm run ui:dev` | Abre a interface no navegador com dados simulados (`http://localhost:5173`) |
| `npm run ui:build` | Confere os tipos e as traduções e gera `ui/dist` |
| `npm run ui:verify` | Abre `ui/dist` no Electron com uma distribuição falsa e percorre as telas |
| `npm test` | Roda os testes de `test/` com `node --test` |
| `npm run lint` | Roda o ESLint |

### Estrutura

```
index.js             processo principal do Electron: janela e atualização
app/assets/js/       módulos do launcher: contas, distribuição, perfis, Java, download e abertura do jogo
app/assets/js/core/  lógica sem tela, coberta pelos testes
ui/                  interface em React (Vite, Tailwind e zustand)
scripts/             chave de release, publicação e verificação da interface
test/                testes dos módulos do launcher
docs/                distribuição, autenticação Microsoft e design system
```

A interface chama os módulos de `app/assets/js` direto, sem IPC novo. O contrato entre os dois lados está em `ui/src/backend/types.ts`, e o [README da interface](ui/README.md) explica o resto.

### Gerar os instaladores

```console
npm run dist
```

| Sistema | Comando |
| --- | --- |
| Windows x64 | `npm run dist:win` |
| macOS | `npm run dist:mac` |
| Linux x64 | `npm run dist:linux` |

O build de um sistema pode não funcionar em outro.

Todo `npm run dist` gera uma chave de release nova (`scripts/release-key.cjs`) e compila o módulo nativo do repositório privado VacOblyvium com node-gyp. Para isso:

1. Clone o VacOblyvium ao lado do launcher, ou aponte `OBLYVIUM_VAC_DIR` para ele.
2. Rode `./gradlew build` em `agent/` e em `mod/` do VacOblyvium. Os jars vão selados em `app/assets/native/vac.bin`, que o módulo nativo só abre quando o jogo começa.
3. No Windows, instale o Visual Studio Build Tools com C++.

A chave fica em `.release-key.json`, fora do git.

### Publicar uma versão

O site serve os instaladores e o auto-update em `https://launcher.oblyvium.com.br/updates/`.

1. Suba a versão no `package.json` e faça o merge na `main`.
2. Crie a tag `v<versão>` e envie (`git tag v4.1.7 && git push origin v4.1.7`). A action [Build](.github/workflows/build.yml) confere se a tag bate com o `package.json`, gera os três sistemas e publica macOS e Linux.
3. Publique o Windows da máquina de build, porque o site recusa o `latest.yml` do Windows sem a chave de release e o CI não tem essa chave:

```console
npm run dist:win
node scripts/publish-update.cjs dist latest.yml
```

O `publish-update.cjs` precisa da variável `LAUNCHER_PUBLISH_KEY`, igual à do site. Ele registra a chave de release antes de enviar o instalador. Os detalhes do envio estão em [docs/forja-launcher.md](docs/forja-launcher.md).

## Documentação

| Arquivo | Assunto |
| --- | --- |
| [ui/README.md](ui/README.md) | Interface: telas, idiomas, janela, arte e segurança |
| [DESIGN.md](DESIGN.md) | Identidade visual: cores, tipografia, movimento e acessibilidade |
| [docs/forja-launcher.md](docs/forja-launcher.md) | Notificações, novidades de cada versão e publicação |
| [docs/distro.md](docs/distro.md) | Formato do índice de distribuição |
| [docs/MicrosoftAuth.md](docs/MicrosoftAuth.md) | Como registrar o aplicativo para o login Microsoft |

## Créditos

O Oblyvium Launcher é um fork do [Helios Launcher](https://github.com/dscalzi/HeliosLauncher), de Daniel Scalzi. O [LICENSE.txt](LICENSE.txt) traz a licença MIT do projeto original.
