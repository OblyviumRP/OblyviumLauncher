/**
 * Memória e janela do jogo como configuração única do launcher (nova
 * interface): o valor global é copiado para a configuração de cada
 * modpack e perfil, que é o que o ProcessBuilder lê ao abrir o jogo.
 * O Java continua por modpack, porque cada versão do Minecraft pede o seu.
 */
const os = require('os')

const GB = 1024 ** 3

/** '4G' para inteiros, '4608M' para meio GB. */
function ramString(gb){
    return Number.isInteger(gb) ? `${gb}G` : `${Math.round(gb * 1024)}M`
}

/** '4G' ou '4096M' em GB, ou o fallback quando o texto não é válido. */
function parseRam(value, fallback){
    const m = /^(\d+(?:\.\d+)?)([MG])$/i.exec(String(value ?? ''))
    if(!m){
        return fallback
    }
    const n = Number(m[1])
    return m[2].toUpperCase() === 'G' ? n : Math.round(n / 512) / 2
}

/**
 * Limites da memória considerando todos os modpacks: o mínimo é o maior
 * mínimo entre eles (um valor abaixo disso não abriria algum), o máximo vem
 * da memória do PC.
 *
 * @param {Array<{rawServer: object}>} servers
 * @param {{getAbsoluteMinRAM: Function, getAbsoluteMaxRAM: Function}} C
 */
function ramBounds(servers, C, totalMem = os.totalmem()){
    const rams = servers.map(s => s.rawServer.javaOptions?.ram)
    const max = Math.max(1, C.getAbsoluteMaxRAM())
    const min = Math.min(max, Math.max(1, ...rams.map(r => C.getAbsoluteMinRAM(r))))
    const recommended = Math.max(min, ...rams.map(r => r?.recommended != null ? Math.round(r.recommended / 512) / 2 : 0))
    return { min, max, recommended: Math.min(max, recommended), system: Math.floor(totalMem / GB) }
}

/**
 * Copia a memória global (limitada ao mínimo de cada modpack) e a janela
 * global para todas as chaves de configuração.
 *
 * @param {{servers: Array}} distro
 * @param {object} C ConfigManager
 * @param {object} P ProfileManager
 */
function apply(distro, C, P){
    const gb = C.getGlobalMaxRAM()
    for(const serv of distro.servers){
        const ram = serv.rawServer.javaOptions?.ram
        for(const key of P.configKeys(serv.rawServer.id)){
            C.ensureJavaConfig(key, serv.effectiveJavaOptions, ram)
            if(gb != null){
                const value = ramString(Math.max(gb, C.getAbsoluteMinRAM(ram)))
                C.setMaxRAM(key, value)
                C.setMinRAM(key, value)
            }
            C.setProfileGameWidth(key, C.getGameWidth())
            C.setProfileGameHeight(key, C.getGameHeight())
            C.setProfileFullscreen(key, C.getFullscreen())
        }
    }
}

module.exports = { ramString, parseRam, ramBounds, apply }
