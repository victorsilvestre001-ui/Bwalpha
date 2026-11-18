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
process.env.LIMITE_API = '5000'; // o teste faz muitas chamadas seguidas
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
  assert.strictEqual(r.json.tomadores.length, 1, 'cliente frequente aparece para repetir a nota');
  assert.strictEqual(r.json.tomadores[0].documento, '12345678909');
  assert.strictEqual(r.json.tomadores[0].ultimoValor, 1500.5);

  // Nome do tomador na hora (CNPJ de demonstração, sem rede)
  r = await req('GET', '/api/portal/tomador/11222333000181');
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.nome, 'devolve a razão social');
  assert.strictEqual((await req('GET', '/api/portal/tomador/11222333000100')).status, 400, 'CNPJ inválido');

  // Configuração fiscal feita pelo contador no /admin
  assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${assinantes[0].id}/fiscal`, { codigoMunicipio: '123', codigoServico: '010701' }, admin)).status, 400);
  r = await req('POST', `/api/admin/portal/assinantes/${assinantes[0].id}/fiscal`, { codigoMunicipio: '3552205', codigoServico: '010701', proximoDps: 5 }, admin);
  assert.strictEqual(r.json.usuario.fiscal.codigoMunicipio, '3552205');
  assert.strictEqual(r.json.usuario.proximoDps, 5);
  assert.strictEqual((await req('GET', '/api/portal/notas')).json.fiscalOk, true);

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

  // Equipe do escritório: o dono cria o acesso do funcionário com senha provisória
  r = await req('GET', '/api/admin/portal/equipe/eu');
  assert.strictEqual(r.json.gestor, true);
  assert.strictEqual(r.json.usuario.email, 'dono@ex.com');
  assert.strictEqual((await req('POST', '/api/admin/portal/equipe', { nome: 'Ana', email: 'maria@ex.com' })).status, 409, 'e-mail já usado');
  r = await req('POST', '/api/admin/portal/equipe', { nome: 'Ana Souza', email: 'Func@Ex.com' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.membro.papel, 'equipe');
  assert(!('senha' in r.json.membro));
  const idAna = r.json.membro.id;
  let provisoria = r.json.senhaProvisoria;
  assert(provisoria.length >= 10);
  assert.strictEqual((await req('GET', '/api/admin/portal/equipe')).json.equipe.length, 2);
  const cookieDono = cookie;

  cookie = '';
  assert.strictEqual((await req('POST', '/api/portal/login', { email: 'func@ex.com', senha: provisoria })).status, 200);
  r = await req('GET', '/api/admin/portal/equipe/eu');
  assert.strictEqual(r.json.gestor, false);
  assert.strictEqual(r.json.usuario.trocarSenha, true);
  assert.strictEqual((await req('GET', '/api/admin/portal/escritorio/empresas')).status, 200, 'funcionário usa o painel');
  assert.strictEqual((await req('GET', '/api/admin/portal/equipe')).status, 403, 'funcionário não gerencia a equipe');
  assert.strictEqual((await req('POST', '/api/admin/portal/equipe', { nome: 'X', email: 'x@ex.com' })).status, 403);
  assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idAna}/papel`, { papel: 'dono' })).status, 403, 'não se promove');
  assert.strictEqual((await req('POST', '/api/admin/portal/equipe-minha-senha', { atual: 'errada', nova: 'nova-senha-ana' })).status, 401);
  assert.strictEqual((await req('POST', '/api/admin/portal/equipe-minha-senha', { atual: provisoria, nova: 'curta' })).status, 400);
  assert.strictEqual((await req('POST', '/api/admin/portal/equipe-minha-senha', { atual: provisoria, nova: 'nova-senha-ana' })).status, 200);
  assert.strictEqual((await req('GET', '/api/admin/portal/equipe/eu')).json.usuario.trocarSenha, false);
  const cookieAna = cookie;

  // Dono redefine a senha (derruba a sessão) e desativa o acesso
  cookie = cookieDono;
  r = await req('POST', `/api/admin/portal/equipe/${idAna}/senha`);
  assert.notStrictEqual(r.json.senhaProvisoria, provisoria);
  provisoria = r.json.senhaProvisoria;
  cookie = cookieAna;
  assert.strictEqual((await req('GET', '/api/admin/portal/escritorio/empresas')).status, 401, 'sessão antiga cai na troca de senha');
  cookie = cookieDono;
  assert.strictEqual((await req('POST', `/api/admin/portal/equipe/${idDono}`, { ativo: false })).status, 409, 'sempre fica um responsável');
  assert.strictEqual((await req('POST', `/api/admin/portal/equipe/${idAna}`, { ativo: false })).json.membro.ativo, false);
  cookie = '';
  assert.strictEqual((await req('POST', '/api/portal/login', { email: 'func@ex.com', senha: provisoria })).status, 403, 'desativado não entra');
  cookie = cookieDono;
  assert.strictEqual((await req('POST', `/api/admin/portal/equipe/${idAna}`, { ativo: true, nome: 'Ana S.' })).json.membro.nome, 'Ana S.');
  assert(!(await req('GET', '/api/admin/portal/escritorio/empresas')).json.empresas.some((e) => e.id === idAna), 'funcionário não vira empresa');

  // Carteira: o funcionário só vê as empresas dele e o que ele cadastra fica com ele
  r = await req('POST', '/api/admin/portal/empresas', { cnpj: '60.701.190/0001-04' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const idEmpExtra = r.json.usuario.id;
  const empresasDono = (await req('GET', '/api/admin/portal/escritorio/empresas')).json.empresas;
  assert(empresasDono.length >= 2);
  const [empA, empB] = empresasDono;
  r = await req('POST', `/api/admin/portal/equipe/${idAna}`, { empresas: [empA.id] });
  assert.deepStrictEqual(r.json.membro.empresas, [empA.id]);
  r = await req('POST', `/api/admin/portal/equipe/${idAna}/senha`);
  provisoria = r.json.senhaProvisoria;
  cookie = '';
  await req('POST', '/api/portal/login', { email: 'func@ex.com', senha: provisoria });
  const minhas = (await req('GET', '/api/admin/portal/escritorio/empresas')).json.empresas;
  assert.deepStrictEqual(minhas.map((e) => e.id), [empA.id], 'vê só a empresa dele');
  assert.strictEqual((await req('GET', `/api/admin/portal/escritorio/empresas/${empA.id}`)).status, 200);
  assert.strictEqual((await req('GET', `/api/admin/portal/escritorio/empresas/${empB.id}`)).status, 404, 'empresa de outro some');
  assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${empB.id}/fiscal`, { codigoMunicipio: '3552205' })).status, 404);
  assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${empB.id}/2026-09/pago`)).status, 404);
  assert(!(await req('GET', '/api/admin/portal/apuracoes')).json.empresas.some((e) => e.id === empB.id));
  assert(!(await req('GET', '/api/admin/portal/assinantes')).json.assinantes.some((e) => e.id === empB.id));
  assert(!(await req('GET', '/api/admin/portal/notas')).json.notas.some((n) => n.usuarioId !== empA.id));
  assert.strictEqual((await req('GET', '/api/admin/contatos')).status, 403, 'contatos só do responsável');
  assert.strictEqual((await req('GET', '/api/admin/portal/analises')).status, 403);
  r = await req('POST', '/api/admin/portal/empresas', { cnpj: '19.131.243/0001-97' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const idNovaEmp = r.json.usuario.id;
  assert.strictEqual((await req('GET', '/api/admin/portal/escritorio/empresas')).json.empresas.length, 2, 'cadastrou e já é dele');
  cookie = cookieDono;
  const vistaDono = (await req('GET', '/api/admin/portal/escritorio/empresas')).json.empresas;
  assert.strictEqual(vistaDono.length, empresasDono.length + 1, 'responsável vê todas');
  assert.deepStrictEqual(vistaDono.find((e) => e.id === idNovaEmp).equipe.map((m) => m.nome), ['Ana S.']);
  assert.deepStrictEqual((await req('GET', '/api/admin/portal/equipe')).json.equipe.find((m) => m.id === idAna).empresas.sort(), [empA.id, idNovaEmp].sort());
  await req('DELETE', `/api/admin/portal/empresas/${idNovaEmp}`);
  await req('DELETE', `/api/admin/portal/empresas/${idEmpExtra}`);
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

    // NFS-e Nacional: emissão direta na Receita com o certificado conectado (Sefin simulada)
    {
      const nacional = require('./portal/nfse-nacional');
      const crypto = require('crypto');
      process.env.NFSE_NACIONAL = '1';
      const chave = '35522052123456780001950000000000000526110000000017'.slice(0, 50);
      const enviados = [];
      nacional._setTransporte(async ({ url, method, body, binario }) => {
        enviados.push({ url, method, body });
        if (method === 'POST' && url.endsWith('/nfse')) {
          const xml = nacional.desgz64(body.dpsXmlGZipB64);
          if (xml.includes('<nDPS>6</nDPS>')) return { status: 400, json: { erros: [{ Codigo: 'E0014', Descricao: 'Conjunto de Série e Número da DPS já existe' }] } };
          const nfse = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>42</nNFSe></infNFSe></NFSe>`;
          return { status: 201, json: { chaveAcesso: chave, idDps: 'x', nfseXmlGZipB64: nacional.gz64(nfse), alertas: [] } };
        }
        if (binario && url.includes('/danfse/')) return { status: 200, buf: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600, 32)]) };
        if (method === 'POST' && url.endsWith(`/nfse/${chave}/eventos`)) return { status: 201, json: { eventoXmlGZipB64: 'x' } };
        return { status: 404, json: {} };
      });
      r = await req('POST', '/api/portal/notas', { documento: '11222333000181', descricao: 'Consultoria em gestão & processos', valor: '1250' });
      const idN = r.json.nota.id;
      r = await req('POST', `/api/portal/notas/${idN}/emitir`);
      assert.strictEqual(r.json.nota.status, 'emitida', JSON.stringify(r.json));
      assert.strictEqual(r.json.nota.via, 'nacional');
      assert.strictEqual(r.json.nota.chaveAcesso, chave);
      assert.strictEqual(r.json.nota.numero, '42', 'número lido do XML da NFS-e');
      assert.ok(!('nfseXml' in r.json.nota), 'XML fica em arquivo, não no banco');
      assert.match(r.json.nota.entrega.erro, /não configurado/, 'sem e-mail configurado, registra que não enviou');
      // DPS enviada: série/número configurados, assinada, digest confere com o infDPS
      const dps = nacional.desgz64(enviados[0].body.dpsXmlGZipB64);
      assert.ok(dps.includes('<nDPS>5</nDPS>') && dps.includes('<cTribNac>010701</cTribNac>') && dps.includes('<cLocEmi>3552205</cLocEmi>'));
      assert.ok(dps.includes('gestão &amp; processos'), 'texto escapado');
      const opSn = dps.match(/<opSimpNac>(\d)<\/opSimpNac>/)[1];
      if (opSn === '3') assert.ok(dps.includes('<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>') && !dps.includes('indTotTrib'), 'ME/EPP do Simples informa pTotTribSN (rejeição E0712)');
      else assert.ok(dps.includes('<totTrib><indTotTrib>0</indTotTrib></totTrib>'), `opSimpNac ${opSn} usa indTotTrib`);
      // ME/EPP sempre com pTotTribSN, na alíquota configurada
      const dpsEpp = nacional.montaDps({ numeroDps: 1, descricao: 'x', valor: 10, tomador: {} }, { cnpj: '12345678000195', fiscal: { codigoMunicipio: '3534401', codigoServico: '140101', aliquotaSN: 11.2 }, empresa: { simples: true } }).xml;
      assert.ok(dpsEpp.includes('<pTotTribSN>11.20</pTotTribSN>'));
      const inf = dps.match(/<infDPS[\s\S]*<\/infDPS>/)[0].replace('<infDPS Id=', '<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id=');
      assert.strictEqual(crypto.createHash('sha256').update(inf).digest('base64'), dps.match(/<DigestValue>([^<]+)</)[1]);
      const certPem = `-----BEGIN CERTIFICATE-----\n${dps.match(/<X509Certificate>([^<]+)</)[1]}\n-----END CERTIFICATE-----`;
      const signedInfo = dps.match(/<SignedInfo[\s\S]*<\/SignedInfo>/)[0];
      assert.ok(crypto.createVerify('RSA-SHA256').update(signedInfo).verify(certPem, dps.match(/<SignatureValue>([^<]+)</)[1], 'base64'), 'assinatura válida');
      // PDF por link público
      const pdfUrl = new URL(r.json.nota.pdf);
      const p = await fetch(base + pdfUrl.pathname);
      assert.strictEqual(p.status, 200);
      assert.match(p.headers.get('content-type'), /pdf/);
      assert.strictEqual((await fetch(base + '/nf/token-que-nao-existe')).status, 404);
      // Rejeição da Receita aparece como erro com a mensagem
      r = await req('POST', '/api/portal/notas', { documento: '11222333000181', descricao: 'Outro serviço prestado', valor: '10' });
      r = await req('POST', `/api/portal/notas/${r.json.nota.id}/emitir`);
      assert.strictEqual(r.json.nota.status, 'erro');
      assert.match(r.json.nota.erro, /E0014/);
      assert(!(await req('GET', '/api/portal/notas')).json.notas.some((x) => x.id === r.json.nota.id), 'recusada sai do sistema');
      assert(!(await req('GET', '/api/admin/portal/notas', null, admin)).json.notas.some((x) => x.status === 'erro'), 'fila sem recusadas');
      // Cancelamento pelo evento 101101
      assert.strictEqual((await req('POST', `/api/portal/notas/${idN}/cancelar`, { justificativa: 'curto' })).status, 400);
      r = await req('POST', `/api/portal/notas/${idN}/cancelar`, { justificativa: 'Valor informado errado na nota' });
      assert.strictEqual(r.json.nota.status, 'cancelada', JSON.stringify(r.json));
      const ev = nacional.desgz64(enviados.find((e) => e.url.endsWith('/eventos')).body.pedidoRegistroEventoXmlGZipB64);
      assert.ok(ev.includes(`Id="PRE${chave}101101"`) && ev.includes('<xDesc>Cancelamento de NFS-e</xDesc>') && ev.includes('<Signature'));
      // Sem resposta da Receita: fica processando e é retomada pela consulta da DPS
      nacional._setTransporte(async ({ url, method }) => { if (method === 'POST') throw new Error('ECONNRESET'); if (url.includes('/dps/')) return { status: 200, json: { chaveAcesso: chave } }; if (url.includes('/danfse/')) return { status: 500, buf: Buffer.alloc(0) }; return { status: 404, json: {} }; });
      r = await req('POST', '/api/portal/notas', { documento: '11222333000181', descricao: 'Serviço com queda de conexão', valor: '20' });
      r = await req('POST', `/api/portal/notas/${r.json.nota.id}/emitir`);
      assert.strictEqual(r.json.nota.status, 'processando');
      const retomada = (await req('GET', '/api/portal/notas')).json.notas.find((x) => x.id === r.json.nota.id);
      assert.strictEqual(retomada.status, 'emitida', 'retomada pela DPS');
      assert.match(retomada.pdf, /ConsultaPublica/, 'sem DANFSe, cai no link da consulta pública');
      // Já cancelada direto na Receita (E0840): o site só acerta a situação
      nacional._setTransporte(async ({ url }) => (url.endsWith('/eventos') ? { status: 400, json: { erros: [{ Codigo: 'E0840', Descricao: 'o evento de Cancelamento de NFS-e já está vinculado à NFS-e' }] } } : { status: 404, json: {} }));
      r = await req('POST', `/api/portal/notas/${retomada.id}/cancelar`, { justificativa: 'Dados incorretos da nota fiscal' });
      assert.strictEqual(r.json.nota && r.json.nota.status, 'cancelada', JSON.stringify(r.json));
      require('./portal/db').atualiza('notas', retomada.id, { status: 'emitida' }); // o resto do teste usa esta nota
      // Emissão escolhida por empresa no /admin (sem a variável geral): homologação + nota de teste
      delete process.env.NFSE_NACIONAL;
      const idMaria = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json.assinantes.find((x) => x.cnpj === '12345678000195').id;
      assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idMaria}/nota-teste`, {}, admin)).status, 409, 'só testa em homologação');
      await req('PUT', '/api/portal/fiscal', { codigoMunicipio: '3552205', codigoServico: '010701', emissao: 'producao' });
      assert.strictEqual((await req('GET', '/api/admin/portal/assinantes', null, admin)).json.assinantes.find((x) => x.id === idMaria).fiscal.emissao, undefined, 'cliente não liga a emissão sozinho');
      assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, { codigoMunicipio: '3552205', codigoServico: '010701', serieDps: 900, proximoDps: 1, emissao: 'qualquer' }, admin)).status, 400);
      r = await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, { codigoMunicipio: '3552205', codigoServico: '010701', serieDps: 900, proximoDps: 1, emissao: 'homologacao' }, admin);
      assert.strictEqual(r.json.usuario.fiscal.emissao, 'homologacao');
      const urls = [];
      nacional._setTransporte(async ({ url, method, body, binario }) => {
        urls.push(url);
        if (method === 'POST') { const x = nacional.desgz64(body.dpsXmlGZipB64); assert.ok(x.includes('<tpAmb>2</tpAmb>') && x.includes('<finNFSe>0</finNFSe>') && x.includes('<serie>900</serie>')); return { status: 201, json: { chaveAcesso: chave } }; }
        if (binario) return { status: 200, buf: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600, 32)]) };
        return { status: 404, json: {} };
      });
      r = await req('POST', `/api/admin/portal/assinantes/${idMaria}/nota-teste`, {}, admin);
      assert.strictEqual(r.json.nota.status, 'emitida', JSON.stringify(r.json));
      assert.strictEqual(r.json.nota.ambiente, 'homologacao');
      assert.ok(urls.every((u) => u.includes('producaorestrita')), 'homologação usa a produção restrita');
      assert.ok(!(await req('GET', '/api/admin/portal/notas', null, admin)).json.notas.some((x) => x.teste), 'nota de teste não vai para a fila da equipe');
      const ut = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json.assinantes.find((x) => x.id === idMaria).ultimoTeste;
      assert.strictEqual(ut.status, 'emitida');
      assert.strictEqual(ut.chaveAcesso, chave);
      assert.ok(/\/nf\//.test(ut.pdf), 'link do PDF da nota de teste no /admin');

      // Códigos de emissão a partir do CNPJ (empresa de demonstração: Campinas, padaria)
      const sv = require('./portal/servicos');
      assert.strictEqual(sv.sugereServico('3313901').codigo, '140101', 'manutenção de motores -> 14.01');
      assert.strictEqual(sv.sugereServico('8630504').codigo, '041201', 'odontologia -> 04.12');
      assert.strictEqual(sv.sugereServico('6920601').codigo, '171901', 'contabilidade -> 17.19');
      assert.strictEqual(sv.sugereServico('8211300').codigo, '170202', 'apoio administrativo -> 17.02');
      assert.strictEqual(sv.sugereServico('4520001').codigo, '140101', 'oficina de veículos -> 14.01');
      assert.ok(sv.LISTA.length > 300, 'lista oficial carregada');
      assert.ok(sv.buscaServicos('odontologia').some((s) => s.codigo === '041201'));
      r = await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/preencher`, null, admin);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.match(r.json.fiscal.codigoMunicipio, /^\d{7}$/, 'IBGE do município');
      assert.ok(r.json.fiscal.aliquotaSN > 0);

      // Cadastro de clientes (tomadores) da empresa no painel do escritório
      const baseCli = `/api/admin/portal/escritorio/empresas/${idMaria}/clientes`;
      r = await req('GET', baseCli, null, admin);
      assert.ok(r.json.clientes.some((c) => c.documento === '11222333000181' && !c.salvo && c.notas.quantidade >= 1), 'quem já recebeu nota aparece como "das notas"');
      assert.strictEqual((await req('POST', baseCli, { documento: '123' }, admin)).status, 400);
      r = await req('POST', baseCli, { documento: '11.222.333/0001-81', email: 'fin@padaria.com', valorPadrao: '1.250,00', descricaoPadrao: 'Consultoria mensal' }, admin);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.ok(r.json.cliente.nome, 'nome vem da Receita');
      assert.strictEqual(r.json.cliente.valorPadrao, 1250);
      assert.strictEqual((await req('POST', baseCli, { documento: '11222333000181' }, admin)).status, 409, 'sem duplicar');
      const idCliT = r.json.cliente.id;
      r = await req('PUT', `${baseCli}/${idCliT}`, { nome: 'Padaria (financeiro)', email: 'contas@padaria.com' }, admin);
      assert.strictEqual(r.json.cliente.email, 'contas@padaria.com');
      r = await req('GET', baseCli, null, admin);
      assert.strictEqual(r.json.clientes.filter((c) => c.documento === '11222333000181').length, 1, 'cadastrado substitui o "das notas"');
      // Emitir pelo escritório salvando um cliente novo
      r = await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '12345678909', nome: 'João Cliente', descricao: 'Serviço avulso', valor: '50', salvarCliente: true }, admin);
      assert.strictEqual(r.json.nota.status, 'rascunho');
      assert.ok((await req('GET', baseCli, null, admin)).json.clientes.some((c) => c.documento === '12345678909' && c.salvo));
      await req('DELETE', `/api/admin/portal/escritorio/empresas/${idMaria}/notas/${r.json.nota.id}`, null, admin);
      await req('DELETE', `${baseCli}/${idCliT}`, null, admin);
      assert.ok(!(await req('GET', baseCli, null, admin)).json.clientes.some((c) => c.id === idCliT));

      // Obra: código de construção exige o endereço da obra (rejeição E0370 da Receita)
      const obraUtil = require('./portal/obra');
      obraUtil._setBusca(async (cep) => (cep === '18035000' ? { logradouro: 'Avenida Teste', bairro: 'Centro', localidade: 'Sorocaba', uf: 'SP', ibge: '3552205' } : { erro: true }));
      const fiscalAntes = (await req('GET', `/api/admin/portal/escritorio/empresas/${idMaria}`, null, admin)).json.empresa.fiscal;
      await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, { ...fiscalAntes, codigoServico: '070202' }, admin);
      assert.strictEqual((await req('GET', `/api/admin/portal/escritorio/empresas/${idMaria}`, null, admin)).json.empresa.exigeObra, true);
      const notaObra = (obra) => req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '12345678909', nome: 'João', descricao: 'Reforma elétrica', valor: '900', obra }, admin);
      assert.strictEqual((await notaObra()).status, 400, 'sem obra não cria');
      assert.strictEqual((await notaObra({ cep: '18035-000' })).status, 400, 'falta o número');
      assert.match((await notaObra({ cep: '99999-999', numero: '10' })).json.erro, /CEP/);
      r = await notaObra({ cep: '18035-000', numero: '120', complemento: 'Galpão 2' });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.deepStrictEqual([r.json.nota.obra.logradouro, r.json.nota.obra.codigoMunicipio, r.json.nota.obra.numero], ['Avenida Teste', '3552205', '120']);
      assert.strictEqual((await req('GET', '/api/admin/portal/escritorio/cep/18035000', null, admin)).json.municipio, 'Sorocaba');
      const nacionalT = require('./portal/nfse-nacional');
      const prest = { cnpj: '12345678000195', fiscal: { ...fiscalAntes, codigoServico: '070202', codigoMunicipio: '3550308' }, empresa: { simples: true } };
      assert.throws(() => nacionalT.montaDps({ descricao: 'x', valor: 10, numeroDps: 1, tomador: { cpf: '12345678909', nome: 'J' } }, prest), /obra/);
      const xmlObra = nacionalT.montaDps({ ...r.json.nota, numeroDps: 7 }, prest).xml;
      assert.match(xmlObra, /<cLocPrestacao>3552205<\/cLocPrestacao>/, 'ISS no município da obra');
      assert.match(xmlObra, /<\/cServ><obra><end><CEP>18035000<\/CEP><xLgr>Avenida Teste<\/xLgr><nro>120<\/nro><xCpl>Galpão 2<\/xCpl><xBairro>Centro<\/xBairro><\/end><\/obra><\/serv>/);
      r = await notaObra({ cep: '18035-000', numero: 'S/N', cno: '123456789012' });
      assert.match(nacionalT.montaDps({ ...r.json.nota, numeroDps: 8 }, prest).xml, /<obra><cObra>123456789012<\/cObra><\/obra>/);
      for (const n of (await req('GET', `/api/admin/portal/escritorio/empresas/${idMaria}`, null, admin)).json.notas) if (n.obra && n.status === 'rascunho') await req('DELETE', `/api/admin/portal/escritorio/empresas/${idMaria}/notas/${n.id}`, null, admin);
      await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, fiscalAntes, admin);
      console.log('ok obra');

      // Endereço do tomador: CNPJ vem do cadastro da Receita; CPF pelo CEP digitado
      r = await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '11222333000181', descricao: 'Consultoria', valor: '100' }, admin);
      assert.deepStrictEqual(r.json.nota.tomador.endereco, { cep: '13010000', logradouro: 'RUA DAS PADARIAS', numero: '100', bairro: 'CENTRO', codigoMunicipio: '3509502' });
      const xmlToma = nacionalT.montaDps({ ...r.json.nota, numeroDps: 9 }, { ...prest, fiscal: fiscalAntes }).xml;
      assert.match(xmlToma, /<xNome>PADARIA PAO QUENTE LTDA<\/xNome><end><endNac><cMun>3509502<\/cMun><CEP>13010000<\/CEP><\/endNac><xLgr>RUA DAS PADARIAS<\/xLgr><nro>100<\/nro><xBairro>CENTRO<\/xBairro><\/end><fone>1932320000<\/fone><\/toma>/);
      await req('DELETE', `/api/admin/portal/escritorio/empresas/${idMaria}/notas/${r.json.nota.id}`, null, admin);
      r = await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '12345678909', nome: 'Ana', descricao: 'Aula', valor: '80', endereco: { cep: '18035-000', numero: '45' } }, admin);
      assert.strictEqual(r.json.nota.tomador.endereco.logradouro, 'Avenida Teste');
      assert.strictEqual(r.json.nota.tomador.municipio, 'Sorocaba');
      await req('DELETE', `/api/admin/portal/escritorio/empresas/${idMaria}/notas/${r.json.nota.id}`, null, admin);
      assert.strictEqual((await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '12345678909', nome: 'Ana', descricao: 'Aula', valor: '80', endereco: { cep: '99999-999' } }, admin)).status, 400, 'CEP que não existe');
      r = await req('POST', `/api/admin/portal/escritorio/empresas/${idMaria}/notas`, { documento: '12345678909', nome: 'Ana', descricao: 'Aula', valor: '80' }, admin);
      assert.strictEqual(r.json.nota.tomador.endereco, undefined, 'CPF sem endereço continua valendo');
      assert.doesNotMatch(nacionalT.montaDps({ ...r.json.nota, numeroDps: 10 }, { ...prest, fiscal: fiscalAntes }).xml, /<toma>.*<end>/);
      await req('DELETE', `/api/admin/portal/escritorio/empresas/${idMaria}/notas/${r.json.nota.id}`, null, admin);
      console.log('ok endereço do tomador');

      // Não optante do Simples: % aproximado dos tributos (rejeição E0713 com indTotTrib/pTotTribSN)
      const notaNO = { descricao: 'x', valor: 10, numeroDps: 11, tomador: { cpf: '12345678909', nome: 'J' } };
      const xmlNO = nacionalT.montaDps(notaNO, { ...prest, fiscal: fiscalAntes, empresa: { simples: false } }).xml;
      assert.match(xmlNO, /<totTrib><pTotTrib><pTotTribFed>11\.33<\/pTotTribFed><pTotTribEst>0\.00<\/pTotTribEst><pTotTribMun>5\.00<\/pTotTribMun><\/pTotTrib><\/totTrib>/);
      assert.doesNotMatch(xmlNO, /indTotTrib|pTotTribSN/);
      assert.match(nacionalT.montaDps(notaNO, { ...prest, fiscal: { ...fiscalAntes, pTribFed: 13.65, pTribMun: 2 }, empresa: { simples: false } }).xml, /<pTotTribFed>13\.65<\/pTotTribFed><pTotTribEst>0\.00<\/pTotTribEst><pTotTribMun>2\.00<\/pTotTribMun>/);
      assert.match(nacionalT.montaDps(notaNO, { ...prest, fiscal: fiscalAntes, empresa: { simples: true } }).xml, /<pTotTribSN>/);
      assert.match(nacionalT.montaDps(notaNO, { ...prest, fiscal: fiscalAntes, empresa: { mei: true } }).xml, /<indTotTrib>0<\/indTotTrib>/);
      assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, { ...fiscalAntes, pTribFed: '11,33', pTribMun: '3' }, admin)).json.usuario.fiscal.pTribMun, 3);
      assert.strictEqual((await req('POST', `/api/admin/portal/assinantes/${idMaria}/fiscal`, { ...fiscalAntes, pTribFed: '150' }, admin)).status, 400);
      console.log('ok não optante');
      nacional._setTransporte(null);
    }
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

  // Apuração do DAS: empresa de serviços aberta em jul/2026, NFS-e em ago e set (regra de início de atividade)
  {
    r = await req('POST', '/api/admin/portal/empresas', { cnpj: '33665544000121' }, admin);
    const idAp = r.status === 200 ? r.json.usuario.id : r.json.id;
    db.atualiza('usuarios', idAp, { empresa: { razaoSocial: 'SERVICOS TECNICOS TESTE', cnae: '3313901', abertura: '2026-07-21', simples: true } });
    fs.mkdirSync(path.join(dir, 'notas-capturadas'), { recursive: true });
    const nf = (n, data, valor) => ({ tipo: 'nfse', chave: `S33665544-${n}-${data}`, mes: data.slice(0, 7), emit: '33665544', dest: '11222333', saida: true, valor });
    fs.writeFileSync(path.join(dir, 'notas-capturadas', `${idAp}.json`), JSON.stringify({ nfe: { ultNSU: '0' }, nfse: { ultNSU: 3 }, canceladas: [], notas: Object.fromEntries([nf(1, '2026-08-24', 11500), nf(2, '2026-09-09', 27000), nf(3, '2026-09-22', 9500)].map((n) => [n.chave, n])) }));
    const apu = require('./portal/apuracao');
    const linhas = apu.painel(db.acha('usuarios', (x) => x.id === idAp), { quantas: 60 });
    const ago = linhas.find((l) => l.competencia === '2026-08');
    const set = linhas.find((l) => l.competencia === '2026-09');
    assert.strictEqual(ago.valor, 690);
    assert.strictEqual(ago.vencimento, '2026-09-21', 'dia 20 caiu no domingo');
    assert.strictEqual(set.rbt12, 69000);
    assert.strictEqual(set.valor, 2190);
    assert.strictEqual(set.partes[0].anexo, 'III', 'manutenção (divisão 33) é serviço');
    assert.ok(linhas.find((l) => l.competencia === '2026-07').semMovimento);
    // Fluxo: ajuste -> aprovar -> anexar DAS -> cliente vê -> pago
    // Mês sem faturamento: declarado sem movimento, sem guia
    assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-08/zerada`, null, admin)).status, 409, 'agosto tem DAS a pagar');
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-07/zerada`, null, admin);
    assert.strictEqual(r.json.linha.status, 'entregue');
    // Gerar guia num passo só (aprova e anexa), com o PDF enviado do computador
    assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-08/das`, { pdfArquivo: Buffer.from('nao e pdf').toString('base64') }, admin)).status, 400);
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-08/das`, { pdfArquivo: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200 * 1024, 32)]).toString('base64'), valor: '690,00' }, admin);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.linha.status, 'das_disponivel');
    const guia = await fetch(base + new URL(r.json.linha.das.pdf).pathname);
    assert.strictEqual(guia.status, 200, 'guia anexada abre pelo link');
    // Puxar guia pelo Integra Contador (SERPRO simulado): vencida sai consolidada com multa e juros
    {
      const integra = require('./portal/integra');
      assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-08/puxar`, null, admin)).status, 409, 'desligado sem chaves e certificado');
      process.env.INTEGRA_TRIAL = '1';
      const pedidos = [];
      integra._setTransporte(async ({ url, body }) => {
        pedidos.push({ url, body });
        const dados = JSON.parse(body.pedidoDados.dados);
        const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(300, 32)]).toString('base64');
        return { status: 200, json: { status: 200, mensagens: [], dados: JSON.stringify([{ pdf, cnpjCompleto: '00000000000100', detalhamentoDas: { periodoApuracao: dados.periodoApuracao, numeroDocumento: '07202600000000001', dataVencimento: '20260921', dataLimiteAcolhimento: dados.dataConsolidacao || '20260921', valores: { principal: 690, multa: 138, juros: 12.5, total: 840.5 } } }]) } };
      });
      assert.strictEqual((await req('GET', '/api/admin/portal/escritorio/integra', null, admin)).json.ativo, true);
      r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-08/puxar`, null, admin);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.das.valor, 840.5, 'total com multa e juros');
      assert.strictEqual(r.json.das.origem, 'integra');
      assert.ok(pedidos[0].url.endsWith('/Emitir') && pedidos[0].body.pedidoDados.idServico === 'GERARDAS12');
      assert.ok(JSON.parse(pedidos[0].body.pedidoDados.dados).dataConsolidacao, 'vencida pede consolidação');
      assert.strictEqual((await fetch(base + new URL(r.json.das.pdf).pathname)).status, 200, 'PDF da guia puxada abre pelo link');
      assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-07/puxar`, null, admin)).status, 409, 'competência concluída não puxa de novo');
      // Movimento de todas as empresas: declarado com DAS / sem DAS / não declarado
      integra._setTransporte(async ({ body }) => {
        const ano = JSON.parse(body.pedidoDados.dados).anoCalendario;
        const op = (n, das) => [{ tipoOperacao: 'Declaração Original', indiceDeclaracao: { numeroDeclaracao: `0${n}`, dataHoraTransmissao: '20260101' } }, ...(das ? [{ indiceDas: { numeroDas: `9${n}`, datahoraEmissaoDas: '20260101', dasPago: true } }] : [])];
        const periodos = ano === '2026' ? [{ periodoApuracao: 202609, operacoes: op(9, true) }, { periodoApuracao: 202608, operacoes: op(8, false) }] : [];
        return { status: 200, json: { status: 200, mensagens: [], dados: JSON.stringify({ periodos }) } };
      });
      r = await req('POST', '/api/admin/portal/escritorio/movimento?meses=3', null, admin);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      const mv = r.json.empresas.find((x) => x.id === idAp);
      assert.ok(mv && !mv.erro, JSON.stringify(mv));
      const sit = Object.fromEntries(mv.meses.map((m) => [m.competencia, m.situacao]));
      assert.strictEqual(sit['2026-09'], 'com_movimento');
      assert.strictEqual(sit['2026-08'], 'sem_movimento');
      assert.strictEqual(sit['2026-10'], 'nao_declarada');
      console.log('ok movimento');
      integra._setTransporte(null);
      delete process.env.INTEGRA_TRIAL;
    }
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/ajuste`, { extra: { servicos: '1.000,00' } }, admin);
    assert.strictEqual(r.json.linha.receita, 37500);
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/ajuste`, {}, admin);
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/aprovar`, null, admin);
    assert.strictEqual(r.json.linha.status, 'aprovada');
    assert.strictEqual(r.json.linha.valor, 2190);
    r = await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/das`, { pdf: 'https://exemplo.com/das.pdf', linhaDigitavel: '8566 0000 0219 0000' }, admin);
    assert.strictEqual(r.json.linha.status, 'das_disponivel');
    assert.ok(db.acha('usuarios', (x) => x.id === idAp).alertas[0].texto.includes('2.190,00'));
    assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/ajuste`, { rbt12: 1 }, admin)).status, 409, 'depois do DAS não muda');
    assert.strictEqual((await req('POST', `/api/admin/portal/apuracoes/${idAp}/2026-09/pago`, null, admin)).json.linha.status, 'paga');
    r = await req('GET', '/api/admin/portal/apuracoes', null, admin);
    assert.ok(r.json.empresas.some((e) => e.id === idAp));
    assert.ok(!r.json.empresas.some((e) => e.cnpj === '43403653000124'), 'o próprio escritório (dono) fica de fora');
    // O cliente com login vê o próprio DAS
    assert.ok(Array.isArray((await req('GET', '/api/portal/das')).json.meses));
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
