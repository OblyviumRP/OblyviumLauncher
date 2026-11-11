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

## Código aberto

O código do launcher é público para qualquer jogador conferir o que ele faz no computador antes de instalar. Os instaladores são gerados a partir deste repositório.

A exceção é o módulo VacOblyvium, de código fechado, que entra só no instalador.

## Créditos

O Oblyvium Launcher é um fork do [Helios Launcher](https://github.com/dscalzi/HeliosLauncher), de Daniel Scalzi. O [LICENSE.txt](LICENSE.txt) traz a licença MIT do projeto original.
