/**
 * Turn Modrinth project descriptions (Markdown that may contain HTML) into
 * safe HTML. The launcher renderer has Node access, so nothing executable
 * may survive: no scripts, frames, styles, event handlers or non-https URLs.
 * Renderer only (DOMPurify needs window).
 */
const { marked }    = require('marked')
const DOMPurify     = require('dompurify')

const ALLOWED_TAGS = [
    'a', 'b', 'blockquote', 'br', 'center', 'code', 'del', 'details', 'div', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
    's', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th',
    'thead', 'tr', 'u', 'ul'
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'width', 'height', 'align']

DOMPurify.addHook('afterSanitizeAttributes', node => {
    if(node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy')
    }
    if(node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer')
    }
})

/**
 * @param {string} markdown Project body from Modrinth.
 * @returns {string} Sanitised HTML, safe for innerHTML.
 */
exports.render = function(markdown) {
    const html = marked.parse(String(markdown ?? ''), { gfm: true, async: false })
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOWED_URI_REGEXP: /^https:\/\//i
    })
}
