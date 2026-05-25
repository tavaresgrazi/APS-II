const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Variáveis de ambiente ─────────────────────────────────────────────────────
const SENHA_ADMIN = process.env.SENHA_ADMIN || 'gclap2026#';

// Railway Volume: monte o volume em /data no painel do Railway.
// Localmente usa a pasta ./respostas como fallback.
const PASTA_DADOS = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(__dirname, 'respostas');

const RESPOSTAS_JSON = path.join(PASTA_DADOS, 'respostas.json');
const RESPOSTAS_CSV  = path.join(PASTA_DADOS, 'respostas.csv');
const CSV_CRIMES     = path.join(__dirname, 'data', 'CrimesBrasil2026.csv');

// Garante que a pasta existe
if (!fs.existsSync(PASTA_DADOS)) fs.mkdirSync(PASTA_DADOS, { recursive: true });

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Proteção por senha ────────────────────────────────────────────────────────
function protegerRota(req, res, next) {
  const senha = req.query.senha || req.headers['x-admin-senha'];
  if (senha !== SENHA_ADMIN) {
    return res.status(401).json({ erro: 'Acesso negado.' });
  }
  next();
}

// ── Lê e processa o CSV de crimes ────────────────────────────────────────────
function lerDadosCSV() {
  const raw      = fs.readFileSync(CSV_CRIMES, 'utf-8');
  const conteudo = raw.replace(/^\uFEFF/, '');
  const linhas   = conteudo.split(/\r?\n/).filter(l => l.trim());
  const cabecalho = linhas[0].split(';');

  const registros = linhas.slice(1).map(linha => {
    const cols = linha.split(';');
    const obj  = {};
    cabecalho.forEach((col, i) => { obj[col.trim()] = (cols[i] || '').trim(); });
    return obj;
  });

  const fortaleza = registros.filter(r => r['Município'] === 'Fortaleza');
  const total     = fortaleza.length;

  const CRIME_LABEL = {
    'Furto':                         'Furtos e Roubos',
    'Lei_Maria_da_Penha':            'Lei Maria da Penha',
    'CVLI':                          'Crimes Letais (CVLI)',
    'Crimes_Sexuais':                'Crimes Sexuais',
    'Crime_ou_Preconceito_Raca_Cor': 'Intolerância Racial',
    'Homofobia_Transfobia':          'Homofobia/Transfobia',
  };

  const porAIS = {};
  for (const r of fortaleza) {
    const ais = r['AIS'];
    if (!ais || ais.includes('Não Identificada')) continue;
    if (!porAIS[ais]) porAIS[ais] = [];
    porAIS[ais].push(r);
  }

  const ais = {};
  for (const [aisKey, regs] of Object.entries(porAIS)) {
    const num = parseInt(aisKey.replace('AIS', '').trim());
    if (isNaN(num)) continue;
    const tot = regs.length;
    const pct = parseFloat(((tot / total) * 100).toFixed(1));

    const contCrimes = {};
    for (const r of regs) { const t = r['Tipo_Crime']; contCrimes[t] = (contCrimes[t]||0)+1; }
    const crimes = Object.entries(contCrimes)
      .map(([tipo, cnt]) => ({ n: CRIME_LABEL[tipo]||tipo, p: Math.round((cnt/tot)*100), a: cnt }))
      .sort((a, b) => b.a - a.a);

    const contDias = {};
    for (const r of regs) { const d = r['Dia da Semana']; if(d) contDias[d]=(contDias[d]||0)+1; }
    const dia = Object.entries(contDias).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Domingo';

    const horas = regs.map(r=>parseInt((r['Hora']||'').split(':')[0])).filter(h=>!isNaN(h));
    const contH = {};
    for (const h of horas) contH[h]=(contH[h]||0)+1;
    const hp = parseInt(Object.entries(contH).sort((a,b)=>b[1]-a[1])[0]?.[0]||19);
    const hr = `${hp}h–${String((hp+4)%24).padStart(2,'0')}h`;

    const CRIMES_V = ['Lei_Maria_da_Penha','Crimes_Sexuais','CVLI','Homofobia_Transfobia'];
    const base = regs.filter(r=>CRIMES_V.includes(r['Tipo_Crime']));
    const contG = {};
    for (const r of (base.length?base:regs)) { const g=r['Gênero']; if(g&&g!=='Não identificado') contG[g]=(contG[g]||0)+1; }
    const gen = Object.entries(contG).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Não informado';

    const idades = regs.map(r=>parseInt(r['Idade da Vítima'])).filter(n=>!isNaN(n));
    const media  = idades.length ? Math.round(idades.reduce((s,v)=>s+v,0)/idades.length) : 32;
    let fx = '25–40 anos';
    if(media<25) fx='18–25 anos'; else if(media<32) fx='25–32 anos';
    else if(media<38) fx='30–38 anos'; else if(media<45) fx='35–45 anos'; else fx='40–50 anos';

    ais[num] = { n: aisKey.trim(), tot, pct, crimes, dia, gen, fx, hr };
  }
  return { total_fortaleza: total, periodo: 'jan–mar 2026', ais };
}

// ── GET /api/dados ────────────────────────────────────────────────────────────
app.get('/api/dados', (req, res) => {
  try { res.json(lerDadosCSV()); }
  catch(err) { console.error(err); res.status(500).json({ erro: 'Falha ao processar dados.' }); }
});

// ── POST /api/resposta ────────────────────────────────────────────────────────
app.post('/api/resposta', (req, res) => {
  try {
    const resposta = {
      id:                   Date.now().toString(),
      timestamp:            new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }),
      nome:                 req.body.nome || '',
      email:                req.body.email || '',
      bairro:               req.body.bairro || '',
      ais:                  req.body.ais || '',
      q1_seguranca:         req.body.q1 || '',
      q2_evita_circular:    req.body.q2 || '',
      q3_crime_preocupante: req.body.q3 || '',
      q4_atuacao_policial:  req.body.q4 || '',
      q5_foi_vitima:        req.body.q5 || '',
      q6_fator_inseguranca: req.body.q6 || '',
    };

    // Salva JSON
    let lista = [];
    try { lista = JSON.parse(fs.readFileSync(RESPOSTAS_JSON, 'utf-8')); } catch {}
    lista.push(resposta);
    fs.writeFileSync(RESPOSTAS_JSON, JSON.stringify(lista, null, 2), 'utf-8');

    // Salva CSV
    const cols = Object.values(resposta).map(v => `"${String(v).replace(/"/g,'""')}"`).join(';');
    if (!fs.existsSync(RESPOSTAS_CSV)) {
      fs.writeFileSync(RESPOSTAS_CSV, Object.keys(resposta).join(';') + '\n', 'utf-8');
    }
    fs.appendFileSync(RESPOSTAS_CSV, cols + '\n', 'utf-8');

    console.log(`[RESPOSTA] ${resposta.timestamp} | ${resposta.nome} | ${resposta.bairro}`);
    res.json({ ok: true });
  } catch(err) {
    console.error('Erro ao salvar:', err);
    res.status(500).json({ erro: 'Falha ao salvar resposta.' });
  }
});

// ── GET /api/respostas (JSON) ─────────────────────────────────────────────────
app.get('/api/respostas', protegerRota, (req, res) => {
  try {
    if (!fs.existsSync(RESPOSTAS_JSON)) return res.json([]);
    res.json(JSON.parse(fs.readFileSync(RESPOSTAS_JSON, 'utf-8')));
  } catch { res.status(500).json({ erro: 'Falha ao ler respostas.' }); }
});

// ── GET /api/respostas/csv (download) ────────────────────────────────────────
app.get('/api/respostas/csv', protegerRota, (req, res) => {
  if (!fs.existsSync(RESPOSTAS_CSV)) return res.status(404).send('Nenhuma resposta ainda.');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="respostas.csv"');
  res.send('\uFEFF' + fs.readFileSync(RESPOSTAS_CSV, 'utf-8')); // BOM para Excel
});

// ── GET /admin ────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`✅ Servidor na porta ${PORT} | dados em: ${PASTA_DADOS}`));
