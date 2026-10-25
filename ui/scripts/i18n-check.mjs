// Lista os textos passados para t()/tn() (e outros pontos que viram t() depois)
// e falha se algum não tiver tradução em en.ts ou es.ts.
// Uso: npm run i18n:check   (--list imprime todas as chaves)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src', import.meta.url))

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'i18n' ? [] : files(p)
    return /\.tsx?$/.test(name) ? [p] : []
  })
}

const STR = String.raw`'((?:[^'\\]|\\.)*)'`
const patterns = [
  new RegExp(String.raw`\bt\(\s*${STR}`, 'g'),
  new RegExp(String.raw`\btn\([^,]+,\s*${STR}\s*,\s*${STR}`, 'g'),
  new RegExp(String.raw`new UserError\(\s*${STR}\s*,\s*${STR}`, 'g'),
  new RegExp(String.raw`(?:asUserError|showError)\([^,]+,\s*${STR}`, 'g'),
  new RegExp(String.raw`\blabel:\s*${STR}`, 'g'),
  new RegExp(String.raw`^\s+[A-Z_]+:\s*${STR},?$`, 'gm'),
  new RegExp(String.raw`message:\s*${STR}`, 'g'),
]

// Textos que chegam de fora do código da interface e passam por t():
// status do en_US.toml usados pelo launchservice, ícones de perfil e o perfil padrão.
const external = [
  'Aguarde..', 'Verificando informações do sistema..', 'Preparando Download do Java..', 'Extraindo Java', 'Java Instalado!',
  'Carregando informações do servidor..', 'Validando integridade dos arquivos..', 'Baixando arquivos..', 'Preparando para iniciar..',
  'Iniciando o jogo..', 'Erro Durante o Lançamento', 'Veja o console (CTRL + Shift + i) para mais detalhes.', 'Erro Fatal',
  'Não foi possível carregar o índice de distribuição. Veja o console (CTRL + Shift + i) para mais detalhes.',
  'Erro Durante o Download do Java', 'Falha ao encontrar uma distribuição OpenJDK.',
  'O JDK baixado possui hash inválido, o arquivo pode estar corrompido.', 'Erro Durante a Verificação de Arquivos',
  'Erro Durante o Download de Arquivos', 'Entre em uma conta antes de jogar.', 'Não foi possível verificar atualizações.',
  'Espada', 'Escudo', 'Machado', 'Arco', 'Picareta', 'Livro', 'Poção', 'Coroa', 'Padrão',
  'Aviso', 'Concluído', 'Atenção', 'Erro', 'Mod', 'Resource pack', 'Shader',
]

const keys = new Set(external)
for (const f of files(src)) {
  const text = readFileSync(f, 'utf8')
  for (const re of patterns) for (const m of text.matchAll(re)) for (const k of m.slice(1)) if (k) keys.add(k.replace(/\\'/g, "'"))
}

const { en } = await import(new URL('../src/i18n/en.ts', import.meta.url))
const { es } = await import(new URL('../src/i18n/es.ts', import.meta.url))

// Siglas e nomes que são iguais em todos os idiomas.
const same = /^(Info|Logs|Modpacks?|Microsoft|Mojang|Java|Skins?|Shaders|Resource packs|Mods|Slim|Discord Rich Presence|Oblyvium Launcher|Mod|Shader|Resource pack|offline|Offline)$/
const sorted = [...keys].filter((k) => /[A-Za-zÀ-ú]/.test(k) && !same.test(k)).sort()
if (process.argv.includes('--list')) {
  console.log(JSON.stringify(sorted, null, 1))
  process.exit(0)
}
let missing = 0
for (const [name, dict] of [['en', en], ['es', es]]) {
  const miss = sorted.filter((k) => !(k in dict))
  missing += miss.length
  for (const k of miss) console.log(`${name}: falta ${JSON.stringify(k)}`)
  const unused = Object.keys(dict).filter((k) => !keys.has(k))
  for (const k of unused) console.log(`${name}: não usada ${JSON.stringify(k)}`)
}
console.log(`${sorted.length} textos, ${missing} traduções faltando`)
process.exit(missing ? 1 : 0)
