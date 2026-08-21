const crypto = require('crypto');

// Compara duas strings em tempo constante, pra evitar "timing attacks" ao
// validar senhas secretas de webhook (ex: WEBHOOK_SECRET).
function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        // Ainda faz uma comparação (contra si mesmo) pra não vazar, pelo
        // tempo de resposta, que os tamanhos são diferentes.
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { secureCompare };
