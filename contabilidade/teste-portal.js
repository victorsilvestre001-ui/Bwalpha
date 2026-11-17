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

  // Equipe libera pelo admin
  assert.strictEqual((await req('GET', '/api/admin/portal/assinantes')).status, 401);
  const { assinantes } = (await req('GET', '/api/admin/portal/assinantes', null, admin)).json;
  r = await req('POST', `/api/admin/portal/assinantes/${assinantes[0].id}/liberar`, { dias: 30 }, admin);
  assert.strictEqual(r.json.usuario.assinante, true);

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
