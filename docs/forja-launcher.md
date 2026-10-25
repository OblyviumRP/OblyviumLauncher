# Oblyvium Launcher

A interface é a de `ui/` (React), descrita em `ui/README.md`: telas, idiomas, como ela chama o launcher e como verificar (`npm run ui:verify`). A identidade visual está em `DESIGN.md` e no design system exportado em `docs/design-system/oblyvium-forja.html`.

A interface antiga (EJS e jQuery, em `app/*.ejs` e `app/assets/js/scripts/`) foi removida na versão 3. De `app/` ficam só os módulos do launcher: contas, distribuição, perfis, Java, download e abertura do jogo, feeds e textos.

## Notificações do site

A staff dispara notificações pelo painel do site (Launcher → Notificações). O launcher lê `https://launcher.oblyvium.com.br/notifications.json` ao abrir e a cada 5 minutos e mostra o que é para "Todos" ou para o servidor selecionado, dentro da janela de validade e ainda não visto neste computador (`notificationsSeen` na configuração). A janela de validade usa o relógio do servidor (o cabeçalho `Date` da última resposta do feed, 200 ou 304, medido em um relógio monotônico), nunca o relógio do PC; `generatedAt` só entra como alternativa quando a resposta não traz `Date`.

- Cada aviso novo aparece num toast no canto e fica guardado no sino da barra de título, com o contador de não lidos. Fechar o sino marca os avisos como vistos.
- Manutenção aparece em amarelo e evento em verde. A imagem de destaque e o link (com o rótulo escolhido pela staff) aparecem no sino.
- Texto sempre como texto, links só `https://` (abrem no navegador), imagens só do CDN do launcher.

`test/notifications.test.js` testa a leitura do feed contra um servidor local (`test/helpers/fakeNotifications.js`); `OBLYVIUM_NOTIFICATIONS_URL` troca o endereço do feed só para testes. `npm run ui:verify` aponta essa variável para um endereço local inalcançável, para nunca ler o feed de produção durante o QA.

## Novidades de cada versão

A staff escreve as notas de cada versão no painel do site (Launcher → Novidades). O site publica `https://launcher.oblyvium.com.br/changelog.json` (`{ version: 1, generatedAt, releases: [{ version, title, notes, publishedAt }] }`), e o launcher mostra as notas da versão instalada em Configurações → Sobre e atualizações. As notas são texto simples: linhas que começam com `- ` viram itens de lista, e nunca entra HTML. O launcher guarda a leitura por 5 minutos. Sem notas para a versão, ou se a leitura falhar, a área de novidades não aparece.

`OBLYVIUM_CHANGELOG_URL` troca o endereço só para testes (`test/changelog.test.js`); `npm run ui:verify` aponta para um endereço inalcançável.

## Publicar uma versão

A action `Build` (`.github/workflows/build.yml`) gera Windows, macOS e Linux nos runners do GitHub e publica cada plataforma no site, que serve o auto-update em `https://launcher.oblyvium.com.br/updates/`.

1. Suba a versão no `package.json` e faça o merge na `main`.
2. Crie a tag `v<versão>` (por exemplo `git tag v2.0.5 && git push origin v2.0.5`). A action confere se a tag bate com o `package.json`, gera os instaladores e publica.

Também dá para rodar à mão na aba Actions → Build → Run workflow; ela só publica com "publish" marcado. Em pull requests a action só faz o build.

A publicação usa `scripts/publish-update.cjs`, que manda os arquivos que o `latest*.yml` cita (e os `.blockmap`) e o yml por último, em pedaços de 8 MB, para `PUT /api/ci/launcher/updates/<arquivo>` no site. Ela precisa do secret `LAUNCHER_PUBLISH_KEY` no repositório, igual ao `LAUNCHER_PUBLISH_KEY` do site; a variável `LAUNCHER_PUBLISH_URL` troca o endereço (padrão `https://staff.oblyvium.com.br`). Um instalador que o site já tem é pulado; se o conteúdo mudou, o site recusa o yml e é preciso subir a versão. Nada fica guardado como artefato do GitHub.
