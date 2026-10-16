/* global document */
/**
 * Line icons for profiles, drawn on a 24x24 grid. Renderer only.
 * Names match profiles.js ICONS.
 */
const PATHS = {
    espada: 'M20 4 9 15M6.5 12.5l5 5M4 20l4-4M16 4h4v4',
    escudo: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z',
    machado: 'M5 20 15 10M13 6c2-3 6-3 7-2s1 5-2 7l-5-5z',
    arco: 'M6 3c8 3 12 7 15 15M6 3l15 15M3 21l9-9M3 21h4M3 21v-4',
    picareta: 'M3 9c5-5 13-5 18 0M12 6 6 21',
    livro: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    pocao: 'M10 3h4M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3M7.5 14h9',
    coroa: 'M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11'
}

const LABELS = {
    espada: 'Espada',
    escudo: 'Escudo',
    machado: 'Machado',
    arco: 'Arco',
    picareta: 'Picareta',
    livro: 'Livro',
    pocao: 'Poção',
    coroa: 'Coroa'
}

exports.LABELS = LABELS

/**
 * @param {string} name One of profiles.js ICONS.
 * @returns {SVGSVGElement}
 */
exports.svg = function(name) {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.6')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', PATHS[name] ?? PATHS.espada)
    svg.appendChild(path)
    return svg
}
