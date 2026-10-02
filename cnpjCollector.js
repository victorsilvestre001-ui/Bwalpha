// Coleta de CNPJs recém-abertos pela API da Casa dos Dados (paga, cobra por consulta).
// Docs: https://docs.casadosdados.com.br/ — chave em portal.casadosdados.com.br/plataforma/api/chave.
// Liga com CNPJ_COLLECT=1 + CASADOSDADOS_API_KEY. Roda ao subir o servidor e depois 1x por dia.
// Filtros (todos opcionais, separados por vírgula):
//   CNPJ_CNAES="4781400,5611201"   CNAE principal (só números)
//   CNPJ_UFS="sp,rj"               CNPJ_MUNICIPIOS="sao paulo,campinas" (minúsculo, sem acento)
//   CNPJ_DIAS=3                    janela de abertura (dias para trás)
//   CNPJ_MEI=incluir|excluir|somente   CNPJ_COM_CONTATO=1 (só com e-mail ou telefone)
//   CNPJ_LIMITE=100 por página, CNPJ_MAX_PAGINAS=5 por rodada (teto de gasto)
const pool = require('./db');

const API_URL = process.env.CASADOSDADOS_API_URL || 'https://api.casadosdados.com.br/v5/cnpj/pesquisa';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const state = { running: false, lastRunAt: null, lastSaved: 0, lastTotal: null, lastError: null };

const list = (v, norm = (x) => x) => (v || '').split(',').map((s) => norm(s.trim())).filter(Boolean);
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (s) => String(s || '').replace(/\D/g, '');

async function ensureTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS cnpj_novos (
        cnpj VARCHAR(14) PRIMARY KEY,
        razao_social TEXT,
        nome_fantasia TEXT,
        data_abertura DATE,
        uf VARCHAR(2),
        municipio TEXT,
        cnae VARCHAR(10),
        cnae_descricao TEXT,
        email TEXT,
        telefone TEXT,
        mei BOOLEAN,
        raw JSONB,
        collected_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cnpj_novos_abertura ON cnpj_novos(data_abertura)');
}

function isoDay(date) {
    return date.toISOString().slice(0, 10);
}

function buildPayload(pagina) {
    const dias = Math.max(1, Number(process.env.CNPJ_DIAS) || 3);
    const payload = {
        situacao_cadastral: ['ATIVA'],
        data_abertura: { inicio: isoDay(new Date(Date.now() - dias * 86_400_000)), fim: isoDay(new Date()) },
        limite: Math.min(1000, Math.max(1, Number(process.env.CNPJ_LIMITE) || 100)),
        pagina,
    };
    const cnaes = list(process.env.CNPJ_CNAES, digits);
    const ufs = list(process.env.CNPJ_UFS, plain);
    const municipios = list(process.env.CNPJ_MUNICIPIOS, plain);
    if (cnaes.length) payload.codigo_atividade_principal = cnaes;
    if (ufs.length) payload.uf = ufs;
    if (municipios.length) payload.municipio = municipios;
    if (process.env.CNPJ_MEI === 'excluir') payload.mei = { excluir_optante: true };
    if (process.env.CNPJ_MEI === 'somente') payload.mei = { optante: true };
    if (process.env.CNPJ_COM_CONTATO === '1') payload.mais_filtros = { com_email: true, com_telefone: true };
    return payload;
}

async function fetchPage(pagina) {
    const res = await fetch(`${API_URL}?tipo_resultado=completo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.CASADOSDADOS_API_KEY },
        body: JSON.stringify(buildPayload(pagina)),
        signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Casa dos Dados respondeu ${res.status}${data.message ? `: ${data.message}` : ''}`);
    // O nome da lista e do total pode variar entre versões da API.
    const items = Array.isArray(data) ? data
        : ['cnpjs', 'resultados', 'empresas', 'data', 'items'].map((k) => data[k]).find(Array.isArray) || [];
    const total = ['total', 'count', 'quantidade'].map((k) => data[k]).find((v) => typeof v === 'number');
    return { items, total: total ?? null };
}

function firstOf(arr, ...keys) {
    for (const item of Array.isArray(arr) ? arr : []) {
        for (const k of keys) {
            if (typeof item === 'string' && item) return item;
            if (item?.[k]) return String(item[k]);
        }
    }
    return null;
}

function normalize(c) {
    const end = c.endereco || {};
    const ativ = c.atividade_principal || {};
    const tel = Array.isArray(c.contato_telefonico) ? c.contato_telefonico[0] : null;
    const fone = firstOf(c.contato_telefonico, 'completo')
        || (tel?.numero ? `${tel.ddd || ''}${tel.numero}` : null);
    return {
        cnpj: digits(c.cnpj).padStart(14, '0'),
        razao_social: c.razao_social || null,
        nome_fantasia: c.nome_fantasia || null,
        data_abertura: c.data_abertura ? String(c.data_abertura).slice(0, 10) : null,
        uf: (end.uf || c.uf || '').toUpperCase().slice(0, 2) || null,
        municipio: end.municipio || c.municipio || null,
        cnae: digits(ativ.codigo || c.codigo_atividade_principal).slice(0, 10) || null,
        cnae_descricao: ativ.descricao || null,
        email: firstOf(c.contato_email, 'email'),
        telefone: fone,
        mei: typeof c.mei?.optante === 'boolean' ? c.mei.optante : (typeof c.mei === 'boolean' ? c.mei : null),
    };
}

async function save(items) {
    let saved = 0;
    for (const c of items) {
        const n = normalize(c);
        if (!/^\d{14}$/.test(n.cnpj) || n.cnpj === '00000000000000') continue;
        const { rowCount } = await pool.query(
            `INSERT INTO cnpj_novos (cnpj, razao_social, nome_fantasia, data_abertura, uf, municipio, cnae, cnae_descricao, email, telefone, mei, raw)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (cnpj) DO NOTHING`,
            [n.cnpj, n.razao_social, n.nome_fantasia, n.data_abertura, n.uf, n.municipio, n.cnae, n.cnae_descricao,
                n.email, n.telefone, n.mei, JSON.stringify(c)]
        );
        saved += rowCount;
    }
    return saved;
}

// Uma rodada: pagina até acabar os resultados ou bater CNPJ_MAX_PAGINAS. Retorna quantos são novos.
async function sync() {
    if (!process.env.CASADOSDADOS_API_KEY) throw new Error('CASADOSDADOS_API_KEY não configurada');
    if (state.running) throw new Error('Já existe uma coleta em andamento');
    state.running = true;
    let saved = 0;
    try {
        await ensureTable();
        const maxPages = Math.max(1, Number(process.env.CNPJ_MAX_PAGINAS) || 5);
        for (let pagina = 1; pagina <= maxPages; pagina += 1) {
            const { items, total } = await fetchPage(pagina);
            if (pagina === 1) state.lastTotal = total;
            saved += await save(items);
            if (items.length < buildPayload(pagina).limite) break;
        }
        state.lastError = null;
        console.log(`CNPJ: ${saved} empresas novas salvas (total na busca: ${state.lastTotal ?? '?'})`);
        return saved;
    } catch (err) {
        state.lastError = err.message;
        throw err;
    } finally {
        state.running = false;
        state.lastRunAt = new Date().toISOString();
        state.lastSaved = saved;
    }
}

function start() {
    if (process.env.CNPJ_COLLECT !== '1') return;
    if (!process.env.CASADOSDADOS_API_KEY) {
        console.warn('CNPJ: CNPJ_COLLECT=1 mas falta CASADOSDADOS_API_KEY; coleta desligada.');
        return;
    }
    const run = () => sync().catch((err) => console.error('CNPJ: erro na coleta', err.message));
    run();
    setInterval(run, SYNC_INTERVAL_MS);
}

module.exports = { start, sync, ensureTable, state };
