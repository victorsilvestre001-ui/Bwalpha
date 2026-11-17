// Teste de ponta a ponta da Área do Cliente: node teste-portal.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-'));
process.env.DADOS_DIR = dir;
process.env.ARQ_PORTAL = path.join(dir, 'portal.json');
process.env.ARQ_CONTATOS = path.join(dir, 'contatos.jsonl');
process.env.ADMIN_SENHA = 'senha-de-teste';
process.env.CERT_CHAVE = 'chave-de-teste';
delete process.env.FOCUS_NFE_TOKEN;
delete process.env.ASAAS_API_KEY;

const app = require('./server');
const notas = require('./portal/notas');

(async () => {
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (metodo, url, body, extra = {}) => {
    const r = await fetch(base + url, { method: metodo, headers: { 'Content-Type': 'application/json', cookie, ...extra }, body: body ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const admin = { 'x-admin-senha': 'senha-de-teste' };

  // Cadastro com CNPJ de demonstração (não depende de rede)
  let r = await req('POST', '/api/portal/cadastro', { nome: 'Maria', email: 'maria@ex.com', senha: '12345678', cnpj: '12.345.678/0001-95', telefone: '15999990000' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.usuario.assinante, false);
  assert(!('senha' in r.json.usuario), 'senha nunca vai para o navegador');
  assert.strictEqual((await req('POST', '/api/portal/cadastro', { nome: 'X', email: 'maria@ex.com', senha: '12345678', cnpj: '12345678000195' })).status, 409);

  // Sem plano: ferramentas bloqueadas
  assert.strictEqual((await req('GET', '/api/portal/notas')).status, 402);
  r = await req('POST', '/api/portal/assinar', { planoId: 'completo' });
  assert.strictEqual(r.json.semPagamentoOnline, true);

  // Simulador e Recuperar impostos: fechados sem plano (vão para o login da Área do Cliente)
  const pagina = (url) => fetch(base + url, { headers: { cookie }, redirect: 'manual' });
  for (const url of ['/planejamento', '/economia', '/economia.html']) {
    const p = await pagina(url);
    assert.strictEqual(p.status, 302, `${url} bloqueada sem plano`);
    assert.strictEqual(p.headers.get('location'), '/area');
  }
  assert.strictEqual((await fetch(base + '/planejamento', { redirect: 'manual' })).status, 302, 'bloqueada sem login');

  // Equipe libera pelo admin
  assert.strictEqual((await req('GET', '/api/admin/portal/assinantes')).status, 401);
  const { assinantes } = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json;
  r = await req('POST', `/api/admin/portal/assinantes/${assinantes[0].id}/liberar`, { dias: 30 }, admin);
  assert.strictEqual(r.json.usuario.assinante, true);

  // Com plano, as páginas abrem
  assert.strictEqual((await pagina('/planejamento')).status, 200);
  assert.strictEqual((await pagina('/economia')).status, 200);

  // Painel da empresa
  r = await req('GET', '/api/portal/painel');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.analise.reforma, 'painel traz o plano da Reforma');

  // Nota: rascunho -> confirma -> fila da equipe -> anexada
  r = await req('POST', '/api/portal/notas', { documento: '123.456.789-09', nome: 'João', descricao: 'Consultoria contábil de novembro', valor: '1500.50' });
  assert.strictEqual(r.json.nota.status, 'rascunho');
  assert.strictEqual(r.json.nota.valor, 1500.5);
  const idNota = r.json.nota.id;
  r = await req('POST', `/api/portal/notas/${idNota}/emitir`);
  assert.strictEqual(r.json.nota.status, 'fila');
  r = await req('GET', '/api/admin/portal/notas', null, admin);
  assert.strictEqual(r.json.notas.length, 1);
  assert.strictEqual((await req('POST', `/api/admin/portal/notas/${idNota}/anexar`, { numero: '123', pdf: 'javascript:alert(1)' }, admin)).status, 400, 'só aceita link https');
  r = await req('POST', `/api/admin/portal/notas/${idNota}/anexar`, { numero: '123', pdf: 'https://exemplo.com/nota.pdf' }, admin);
  assert.strictEqual(r.json.nota.status, 'emitida');
  r = await req('GET', '/api/portal/notas');
  assert.strictEqual(r.json.usadas, 1);

  // Orçamento + página pública (sem dados internos)
  r = await req('POST', '/api/portal/orcamentos', { documento: '12345678909', nomeCliente: 'João', titulo: 'Contabilidade 2027', itens: [{ descricao: 'Abertura', quantidade: 1, valor: 690 }, { descricao: 'Mensalidade', quantidade: 12, valor: 270 }], desconto: 100, validadeDias: 10 });
  assert.strictEqual(r.json.orcamento.total, 690 + 12 * 270 - 100);
  const pub = await req('GET', `/api/orcamento-publico/${r.json.orcamento.token}`);
  assert.strictEqual(pub.status, 200);
  assert(!('usuarioId' in pub.json.orcamento) && !('token' in pub.json.orcamento));
  assert.strictEqual((await req('GET', '/api/orcamento-publico/nao-existe')).status, 404);

  // Resumo do dia antes da resposta: o orçamento aparece como pendente
  r = await req('GET', '/api/portal/resumo');
  assert.strictEqual(r.json.resumo.pendentes.length, 1);
  assert.ok(r.json.resumo.agenda.every((e) => e.emDias >= 0 && e.emDias <= 10));

  // O cliente aprova pela página pública; o assinante recebe um alerta e não dá para responder duas vezes
  const tokenOrc = pub.json.orcamento ? (await req('GET', '/api/portal/orcamentos')).json.orcamentos[0].token : null;
  r = await req('POST', `/api/orcamento-publico/${tokenOrc}/resposta`, { acao: 'aprovar', nome: 'João' });
  assert.strictEqual(r.json.status, 'aprovado');
  assert.strictEqual((await req('POST', `/api/orcamento-publico/${tokenOrc}/resposta`, { acao: 'recusar' })).status, 409);
  r = await req('GET', '/api/portal/painel');
  assert.ok(r.json.alertas.some((a) => /APROVOU/.test(a.texto)));
  assert.strictEqual((await req('GET', '/api/portal/resumo')).json.resumo.pendentes.length, 0);

  // Preferências do resumo
  r = await req('PUT', '/api/portal/preferencias', { resumo: true, resumoEmail: false, funcionarios: true, telefone: '(15) 98888-7777' });
  assert.strictEqual(r.json.usuario.preferencias.funcionarios, true);
  assert.strictEqual(r.json.usuario.telefone, '15988887777');

  // Admin: prévia em HTML e envio (sem canais configurados, nada sai e o motivo volta)
  const idMaria = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json.assinantes[0].id;
  const previa = await fetch(`${base}/api/admin/portal/assinantes/${idMaria}/resumo`, { headers: admin });
  assert.ok((await previa.text()).includes('Seu resumo do dia'));
  r = await req('POST', `/api/admin/portal/assinantes/${idMaria}/resumo`, {}, admin);
  assert.strictEqual(r.json.resultado.email, null, 'e-mail desligado nas preferências');
  assert.strictEqual(r.json.resultado.whatsapp.ok, false);

  // Mensagem do WhatsApp: partes em uma linha cada (regra dos modelos da Meta)
  const resumoMod = require('./portal/resumo');
  const db = require('./portal/db');
  const partes = resumoMod.partesWhatsapp(resumoMod.monta(db.acha('usuarios', (u) => u.id === idMaria)));
  for (const v of Object.values(partes)) assert(!/[\n\t]/.test(v), 'variável sem quebra de linha');

  // Dono do site: acesso total sem plano e /admin pelo próprio login, sem a senha
  const cookieAntesDono = cookie;
  cookie = '';
  await req('POST', '/api/portal/cadastro', { nome: 'Dono', email: 'dono@ex.com', senha: '12345678', cnpj: '43403653000124' });
  assert.strictEqual((await req('GET', '/api/portal/notas')).status, 402, 'antes de virar dono, sem plano');
  assert.strictEqual((await req('GET', '/api/admin/portal/assinantes')).status, 401, 'cliente comum não entra no admin');
  const idDono = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json.assinantes.find((u) => u.email === 'dono@ex.com').id;
  r = await req('POST', `/api/admin/portal/assinantes/${idDono}/papel`, { papel: 'dono' }, admin);
  assert.strictEqual(r.json.usuario.dono, true);
  assert.strictEqual(r.json.usuario.assinante, true);
  assert.strictEqual((await req('GET', '/api/portal/notas')).status, 200, 'dono usa tudo sem plano');
  assert.strictEqual((await req('GET', '/api/admin/portal/assinantes')).status, 200, 'dono entra no admin sem senha');
  assert.strictEqual((await req('GET', '/api/admin/contatos')).status, 200);
  cookie = cookieAntesDono;

  // Agenda: feriado de 20/11 antecipa FGTS/INSS e adia o DAS
  const { proximas } = require('./portal/agenda');
  const ag = proximas({ regime: 'simples', funcionarios: true }, { hoje: '2026-11-17' });
  assert.strictEqual(ag.find((e) => e.titulo.startsWith('DAS')).data, '2026-11-23');
  assert.strictEqual(ag.find((e) => e.titulo === 'FGTS Digital').data, '2026-11-19');

  // Outro usuário não vê nada do primeiro
  const cookieMaria = cookie; cookie = '';
  await req('POST', '/api/portal/cadastro', { nome: 'Ana', email: 'ana@ex.com', senha: '12345678', cnpj: '11222333000181' });
  assert.strictEqual((await req('POST', `/api/portal/notas/${idNota}/emitir`)).status, 402);
  cookie = cookieMaria;

  // Recuperar impostos: envio de XMLs (lote) e ZIP, leitura e envio ao contador
  const { nfe, cancelamento } = require('./teste-xml-util');
  const envia = async (id, corpo, nomeArq) => {
    const resp = await fetch(id === 'leitura' ? `${base}/api/portal/analises/leitura` : `${base}/api/portal/analises/${id}/arquivos`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(nomeArq) }, body: corpo });
    return { status: resp.status, json: await resp.json() };
  };
  r = await req('POST', '/api/portal/analises');
  const idAn = r.json.analise.id;
  assert.strictEqual((await req('POST', '/api/portal/analises')).json.analise.id, idAn, 'reaproveita a análise em montagem');
  const xmls = [];
  for (let m = 1; m <= 6; m++) xmls.push(nfe({ chave: `N${m}`, data: `2026-0${m}-10`, itens: [{ ncm: '30049099', valor: 10000, desc: 'Dipirona' }, { ncm: '19059090', valor: 20000, desc: 'Pão' }, { ncm: '22021000', valor: 5000, csosn: '500', desc: 'Refri' }] }));
  xmls.push(nfe({ chave: 'C1', data: '2026-01-11', tpNF: 0, itens: [{ ncm: '30049099', valor: 999 }] }));
  xmls.push(nfe({ chave: 'O1', cnpj: '99888777000166', data: '2026-01-11', itens: [{ ncm: '30049099', valor: 999 }] }));
  let env = await envia(idAn, xmls.join('\n<!--VJ-SEP-->\n'), 'lote 1');
  assert.strictEqual(env.status, 200, JSON.stringify(env.json));
  assert.strictEqual(env.json.notasNovas, 6);
  // ZIP com uma nota nova, uma repetida e o cancelamento de outra
  {
    const yazl = require('yazl');
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(nfe({ chave: 'N7', data: '2026-07-10', itens: [{ ncm: '33049910', valor: 8000, desc: 'Creme' }] })), 'a/n7.xml');
    z.addBuffer(Buffer.from(xmls[0]), 'a/n1.xml');
    z.addBuffer(Buffer.from(cancelamento('N6')), 'a/canc.xml');
    z.end();
    const partes = [];
    for await (const c of z.outputStream) partes.push(c);
    env = await envia(idAn, Buffer.concat(partes), 'notas.zip');
    assert.strictEqual(env.json.notasNovas, 1);
  }
  assert.strictEqual((await envia(idAn, 'não sou xml', 'x.pdf')).status, 400);
  const rel = env.json.analise.relatorio;
  assert.strictEqual(rel.notas, 6, '7 notas de venda, menos 1 cancelada');
  assert.ok(rel.categorias.Medicamentos > 0 && rel.pisCofins > 0 && rel.icms > 0);
  assert.ok(rel.avisos.some((a) => /entrada/.test(a)) && rel.avisos.some((a) => /outra empresa/.test(a)));
  // Simulador: leitura das notas sem guardar nada (venda para empresa, compra de fornecedor, NFS-e)
  r = await envia('leitura', [nfe({ chave: 'V1', data: '2026-05-02', dest: '11222333000181', itens: [{ ncm: '1', valor: 1000 }] }), nfe({ chave: 'F1', cnpj: '11222333000181', dest: '12345678000195', data: '2026-05-03', itens: [{ ncm: '1', valor: 400 }] }), '<CompNfse><Nfse><InfNfse><Numero>9</Numero><DataEmissao>2026-05-04</DataEmissao><PrestadorServico><Cnpj>12345678000195</Cnpj></PrestadorServico><Servico><Valores><ValorServicos>250.00</ValorServicos></Valores></Servico></InfNfse></Nfse></CompNfse>', '<lixo/>'].join('\n<!--VJ-SEP-->\n'), 'sim');
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.deepStrictEqual(r.json.notas.map((n) => [n.tipo, n.emit, n.dest, n.valor]), [['nfe', '12345678', '11222333', 1000], ['nfe', '11222333', '12345678', 400], ['nfse', '12345678', '', 250]]);
  assert.strictEqual(r.json.ignorados, 1);

  // Outro cliente não vê a análise
  const cookieDona = cookie; cookie = '';
  await req('POST', '/api/portal/login', { email: 'dono@ex.com', senha: '12345678' });
  assert.strictEqual((await req('GET', `/api/portal/analises/${idAn}`)).status, 404);
  cookie = cookieDona;
  r = await req('POST', `/api/portal/analises/${idAn}/concluir`);
  assert.strictEqual(r.json.analise.status, 'em_revisao');
  assert.strictEqual((await envia(idAn, xmls[0], 'depois.xml')).status, 409);
  r = await req('GET', '/api/admin/portal/analises', null, admin);
  assert.strictEqual(r.json.analises.length, 1);
  r = await req('POST', `/api/admin/portal/analises/${idAn}/revisar`, { status: 'em_recuperacao', observacao: 'Conferido com o PGDAS-D' }, admin);
  assert.strictEqual(r.json.analise.status, 'em_recuperacao');
  assert.ok((await req('GET', '/api/portal/painel')).json.alertas.some((a) => /revisou sua análise/.test(a.texto)));

  // Certificado A1: conferência, guarda cifrada e busca das notas (serviços oficiais simulados)
  {
    const { pfxTeste } = require('./teste-xml-util');
    const zlib = require('zlib');
    const captura = require('./portal/captura');
    const gz = (x) => zlib.gzipSync(Buffer.from(x)).toString('base64');
    const chamadas = [];
    captura.transporte = async ({ url, body }) => {
      chamadas.push(url);
      if (url.includes('NFeDistribuicaoDFe')) {
        assert.ok(/<CNPJ>\d{14}<\/CNPJ>/.test(body) && body.includes('<cUFAutor>'));
        const res = '<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>35260511222333000181550010000000011000000011</chNFe><CNPJ>11222333000181</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-05-03T10:00:00-03:00</dhEmi><tpNF>1</tpNF><vNF>400.00</vNF><cSitNFe>1</cSitNFe></resNFe>';
        return { status: 200, texto: `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>000000000000001</ultNSU><maxNSU>000000000000001</maxNSU><loteDistDFeInt><docZip NSU="000000000000001" schema="resNFe_1.01.xsd">${gz(res)}</docZip></loteDistDFeInt></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>` };
      }
      if (/DFe\/1\?/.test(url)) {
        const nfse = '<NFSe><infNFSe><nNFSe>5</nNFSe><emit><CNPJ>12345678000195</CNPJ></emit><DPS><infDPS><dhEmi>2026-05-10T10:00:00-03:00</dhEmi><prest><CNPJ>12345678000195</CNPJ></prest><toma><CNPJ>11222333000181</CNPJ></toma><valores><vServPrest><vServ>900.00</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>';
        return { status: 200, texto: JSON.stringify({ StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [{ NSU: 1, ChaveAcesso: 'X', TipoDocumento: 'NFSE', ArquivoXml: gz(nfse) }] }) };
      }
      return { status: 404, texto: '' };
    };
    const pfx = pfxTeste().toString('base64');
    assert.strictEqual((await req('POST', '/api/portal/certificado', { pfx, senha: 'errada', autorizo: true })).status, 400, 'senha errada');
    assert.strictEqual((await req('POST', '/api/portal/certificado', { pfx, senha: 'senha123' })).status, 400, 'sem autorização');
    r = await req('POST', '/api/portal/certificado', { pfx: pfxTeste({ cnpj: '99888777000166' }).toString('base64'), senha: 'senha123', autorizo: true });
    assert.match(r.json.erro, /não da empresa/);
    r = await req('POST', '/api/portal/certificado', { pfx, senha: 'senha123', autorizo: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.certificado.cnpj, '12345678000195');
    assert.ok(!JSON.stringify(r.json).includes('senha123'), 'a senha nunca volta');
    const guardado = fs.readFileSync(path.join(dir, 'certificados', fs.readdirSync(path.join(dir, 'certificados'))[0]));
    assert.ok(!guardado.includes(Buffer.from('senha123')), 'guardado cifrado');
    await new Promise((ok) => setTimeout(ok, 200));
    r = await req('GET', '/api/portal/notas-capturadas');
    assert.deepStrictEqual(r.json.notas.map((n) => [n.tipo, n.emit, n.dest, n.valor]).sort(), [['nfe', '11222333', '12345678', 400], ['nfse', '12345678', '11222333', 900]]);
    assert.strictEqual((await req('POST', '/api/portal/certificado/buscar')).status, 429, 'respeita 1 hora');
    assert.strictEqual((await req('GET', '/api/portal/certificado')).json.certificado.totalNotas, 2);
    r = await req('DELETE', '/api/portal/certificado');
    assert.strictEqual(r.json.certificado.ativo, false);
    assert.strictEqual((await req('GET', '/api/portal/notas-capturadas')).json.notas.length, 0);
    // Carteira do contador: cadastra a empresa de um cliente, conecta o certificado dela e consulta as notas
    r = await req('POST', '/api/admin/portal/empresas', { cnpj: '11.444.777/0001-61', telefone: '(15) 97777-0000' }, admin);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const idCli = r.json.usuario.id;
    assert.strictEqual((await req('POST', '/api/admin/portal/empresas', { cnpj: '11444777000161' }, admin)).status, 409);
    assert.strictEqual((await req('POST', '/api/portal/login', { email: undefined, senha: '' })).status, 401, 'empresa da carteira não tem login');
    assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idCli}/certificado`, { pfx, senha: 'senha123', autorizo: true }, admin)).status, 400, 'certificado de outra empresa');
    r = await req('POST', `/api/admin/portal/assinantes/${idCli}/certificado`, { pfx: pfxTeste({ cnpj: '11444777000161' }).toString('base64'), senha: 'senha123', autorizo: true }, admin);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.certificado.autorizacao.por, 'contador');
    await new Promise((ok) => setTimeout(ok, 200));
    assert.strictEqual((await req('GET', `/api/portal/notas-capturadas?empresa=${idCli}`)).json.notas.length, 0, 'cliente comum não vê notas de outra empresa');
    const cookieCli = cookie; cookie = '';
    await req('POST', '/api/portal/login', { email: 'dono@ex.com', senha: '12345678' });
    assert.ok((await req('GET', `/api/portal/notas-capturadas?empresa=${idCli}`)).json.notas.length > 0, 'o dono vê as notas da empresa do cliente');
    // O dono envia pela própria Área do Cliente o certificado de outra empresa: entra na carteira
    r = await req('POST', '/api/portal/certificado', { pfx: pfxTeste({ cnpj: '33665544000121' }).toString('base64'), senha: 'senha123', autorizo: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.carteira.cnpj, '33665544000121');
    const naCarteira = db.acha('usuarios', (x) => x.cnpj === '33665544000121');
    assert.ok(naCarteira.gerenciado && naCarteira.certificado.ativo && naCarteira.certificado.autorizacao.por === 'contador');
    assert.ok(!(db.acha('usuarios', (x) => x.email === 'dono@ex.com').certificado || {}).ativo, 'o certificado do cliente não vai para a conta do dono');
    cookie = cookieCli;
    assert.strictEqual((await req('DELETE', `/api/admin/portal/empresas/${idCli}`, null, admin)).status, 200);
    assert.ok(!fs.existsSync(path.join(dir, 'certificados', `${idCli}.bin`)), 'certificado apagado junto');
  }

  // Login e saída
  await req('POST', '/api/portal/sair');
  assert.strictEqual((await req('GET', '/api/portal/eu')).status, 401);
  assert.strictEqual((await req('POST', '/api/portal/login', { email: 'maria@ex.com', senha: 'errada' })).status, 401);
  assert.strictEqual((await req('POST', '/api/portal/login', { email: 'maria@ex.com', senha: '12345678' })).status, 200);

  // Corpo enviado à Focus (NFS-e Nacional) com os campos da documentação
  const corpo = notas.corpoDps({ id: 'x', numeroDps: 7, descricao: 'Serviço', valor: 100, tomador: { cnpj: '11222333000181' } }, { cnpj: '43403653000124', fiscal: { codigoMunicipio: '3552205', codigoServico: '010701' }, empresa: { simples: true } });
  assert.strictEqual(corpo.codigo_municipio_emissora, 3552205);
  assert.strictEqual(corpo.codigo_opcao_simples_nacional, 3);
  assert.strictEqual(corpo.numero_dps, 7);
  assert.strictEqual(corpo.cnpj_tomador, '11222333000181');

  srv.close();
  await new Promise((ok) => setTimeout(ok, 50));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('ok portal');
})().catch((e) => { console.error(e); process.exit(1); });
