const { test } = require('node:test')
const assert = require('node:assert/strict')
const JavaDefaults = require('../app/assets/js/javadefaults')

function server(minecraftVersion, javaOptions, effective = { supported: '>=21.x', suggestedMajor: 21, distribution: 'TEMURIN' }) {
    return { rawServer: { minecraftVersion, javaOptions }, effectiveJavaOptions: { ...effective } }
}

test('requiredJava pede Java 25 a partir do Minecraft 26', () => {
    assert.deepEqual(JavaDefaults.requiredJava('26.1'), { supported: '>=25.x', suggestedMajor: 25 })
    assert.deepEqual(JavaDefaults.requiredJava('26.2'), { supported: '>=25.x', suggestedMajor: 25 })
    assert.deepEqual(JavaDefaults.requiredJava('27'), { supported: '>=25.x', suggestedMajor: 25 })
})

test('requiredJava deixa versões antigas com o padrão da helios-core', () => {
    for(const v of ['1.21.4', '1.20.1', '1.12.2', '1.7.10']) {
        assert.equal(JavaDefaults.requiredJava(v), null)
    }
    assert.equal(JavaDefaults.requiredJava(undefined), null)
    assert.equal(JavaDefaults.requiredJava('snapshot'), null)
})

test('apply eleva o Java dos servidores 26+ sem javaOptions explícito', () => {
    const distro = { servers: [server('26.2'), server('1.20.1', undefined, { supported: '>=17.x', suggestedMajor: 17, distribution: 'TEMURIN' })] }
    JavaDefaults.apply(distro)
    assert.deepEqual(distro.servers[0].effectiveJavaOptions, { supported: '>=25.x', suggestedMajor: 25, distribution: 'TEMURIN' })
    assert.deepEqual(distro.servers[1].effectiveJavaOptions, { supported: '>=17.x', suggestedMajor: 17, distribution: 'TEMURIN' })
})

test('apply respeita o javaOptions definido pela staff', () => {
    const explicit = server('26.2', { supported: '>=26.x', suggestedMajor: 26 }, { supported: '>=26.x', suggestedMajor: 26, distribution: 'CORRETTO' })
    const platform = server('26.2', { platformOptions: [{ platform: 'win32', suggestedMajor: 24 }] })
    JavaDefaults.apply({ servers: [explicit, platform] })
    assert.equal(explicit.effectiveJavaOptions.suggestedMajor, 26)
    assert.equal(platform.effectiveJavaOptions.suggestedMajor, 21)
})

test('apply aceita distribuição nula e é idempotente', () => {
    assert.equal(JavaDefaults.apply(null), null)
    const distro = { servers: [server('26.2')] }
    JavaDefaults.apply(distro)
    JavaDefaults.apply(distro)
    assert.equal(distro.servers[0].effectiveJavaOptions.suggestedMajor, 25)
})
