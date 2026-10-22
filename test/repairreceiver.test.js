const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor } = require('helios-core/dl')
const Profiles = require('../app/assets/js/profiles')
require('../app/assets/js/repairreceiver')

function file(id, filePath) {
    return { id, name: id, type: 'File', artifact: { size: 1, url: `https://x/${id}`, MD5: '0'.repeat(32), path: filePath } }
}

test('isSettingsPath reconhece options e config, não mods', () => {
    assert.equal(Profiles.isSettingsPath('options.txt'), true)
    assert.equal(Profiles.isSettingsPath('config/sodium-options.json'), true)
    assert.equal(Profiles.isSettingsPath('config\\iris.properties'), true)
    assert.equal(Profiles.isSettingsPath('configx/a.json'), false)
    assert.equal(Profiles.isSettingsPath('mods/a.jar'), false)
    assert.equal(Profiles.isSettingsPath('resourcepacks/options.txt'), false)
})

test('reparo não sobrescreve configs que o jogador já tem, mas baixa as que faltam', async () => {
    const instanceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-'))
    const gameDir = path.join(instanceDir, 'srv')
    await fs.outputFile(path.join(gameDir, 'options.txt'), 'lang:pt_br\n')
    await fs.outputFile(path.join(gameDir, 'config', 'sodium-options.json'), '{}')
    await fs.outputFile(path.join(gameDir, 'resourcepacks', 'pack.zip'), 'velho')

    const distro = new HeliosDistribution({
        version: '1.0.0',
        servers: [{
            id: 'srv', address: 'localhost', minecraftVersion: '1.21', mainServer: true,
            modules: [
                file('options', 'options.txt'),
                file('sodium', 'config/sodium-options.json'),
                file('iris', 'config/iris.properties'),
                file('pack', 'resourcepacks/pack.zip')
            ]
        }]
    }, path.join(instanceDir, 'common'), instanceDir)

    const { distribution } = await new DistributionIndexProcessor(path.join(instanceDir, 'common'), distro, 'srv').validate(async () => {})
    assert.deepEqual(distribution.map(a => a.id).sort(), ['iris', 'pack'])
    await fs.remove(instanceDir)
})
