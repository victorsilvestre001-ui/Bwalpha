// Formato do índice pgfn.bin: um registro de 40 bytes por CNPJ, em ordem crescente de CNPJ.
//   0  f64  CNPJ (14 dígitos como número)
//   8  f64  valor total em dívida ativa (R$)
//  16  f64  parte regularizada: parcelada/transacionada, garantida ou suspensa (R$)
//  24  u32  quantidade de inscrições
//  28  u32  inscrições ajuizadas (cobrança na Justiça)
//  32  u8   tipos de dívida (bits em TIPOS)
const path = require('path');

module.exports = {
  DADOS_DIR: process.env.DADOS_DIR || path.join(__dirname, '..', 'dados'),
  TAM_REGISTRO: 40,
  TIPOS: { naoPrevidenciario: 1, previdenciario: 2, fgts: 4 },
};
