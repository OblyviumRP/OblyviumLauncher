/**
 * Java requirements helios-core does not know yet.
 *
 * helios-core picks Java 21 for every Minecraft version from 1.20.5 on, but
 * Minecraft 26.1 and later need Java 25. Servers that set javaOptions in the
 * distribution index keep what the staff chose.
 */

const JAVA_25 = { supported: '>=25.x', suggestedMajor: 25 }

/**
 * @param {string} minecraftVersion e.g. "26.2" or "1.20.1".
 * @returns {{supported: string, suggestedMajor: number} | null} null when helios-core's default is right.
 */
exports.requiredJava = function(minecraftVersion) {
    const major = Number.parseInt(String(minecraftVersion ?? '').split('.')[0])
    if(Number.isInteger(major) && major >= 26) {
        return { ...JAVA_25 }
    }
    return null
}

function hasExplicitJava(javaOptions) {
    return javaOptions != null && (
        javaOptions.supported != null
        || javaOptions.suggestedMajor != null
        || (Array.isArray(javaOptions.platformOptions) && javaOptions.platformOptions.length > 0)
    )
}

/**
 * Raise effectiveJavaOptions in place where helios-core's default is too old.
 *
 * @param {HeliosDistribution | null} distribution
 * @returns {HeliosDistribution | null} The same distribution.
 */
exports.apply = function(distribution) {
    for(const serv of distribution?.servers ?? []) {
        if(hasExplicitJava(serv.rawServer.javaOptions)) {
            continue
        }
        const required = exports.requiredJava(serv.rawServer.minecraftVersion)
        if(required != null) {
            Object.assign(serv.effectiveJavaOptions, required)
        }
    }
    return distribution
}
