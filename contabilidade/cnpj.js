// Validação de CNPJ, incluindo o CNPJ alfanumérico (vigente desde jul/2026):
// cada caractere vale (código ASCII - 48), os dígitos verificadores continuam numéricos.

function limpa(cnpj) {
  return String(cnpj || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function digito(base) {
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function valido(cnpj) {
  const c = limpa(cnpj);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.slice(12) === `${d1}${d2}`;
}

function formata(cnpj) {
  const c = limpa(cnpj);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

module.exports = { limpa, valido, formata };
