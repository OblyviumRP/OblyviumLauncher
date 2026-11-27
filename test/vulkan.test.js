const { test } = require('node:test')
const assert = require('node:assert')
const { problemFrom } = require('../app/assets/js/vulkan')

test('só bloqueia quando a sonda diz que falta o loader ou o suporte', () => {
    assert.strictEqual(problemFrom('sem-loader\r\n'), 'sem-loader')
    assert.strictEqual(problemFrom('aviso qualquer\r\nsem-suporte\r\n'), 'sem-suporte')
    assert.strictEqual(problemFrom('ok\r\n'), null)
    assert.strictEqual(problemFrom('erro\r\n'), null)
    assert.strictEqual(problemFrom(''), null)
    assert.strictEqual(problemFrom(undefined), null)
})
