// CPF: só números, com os dígitos verificadores conferidos. Uma conta por CPF.
function cleanCpf(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 20).replace(/\D/g, '') : '';
}

function isValidCpf(value) {
    const cpf = cleanCpf(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = (len) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
        const rest = (sum * 10) % 11;
        return rest === 10 ? 0 : rest;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const CPF_TAKEN = 'Já existe uma conta com este CPF. Entre com o e-mail dessa conta ou fale com o suporte.';

module.exports = { cleanCpf, isValidCpf, CPF_TAKEN };
