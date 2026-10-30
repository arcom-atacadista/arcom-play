'use strict';
/* Servidor do Arcom Play
 * - entrega o site (pasta public)
 * - /arcom-config.js: diz ao app que o servidor é este mesmo
 * - /api/rpc/<função>: guarda e lê testes, respostas e cópias no PostgreSQL
 * - /api/live: ponte em tempo real do Power Quiz ao vivo (telão <-> celulares)
 * - /healthz: verificação de saúde (para monitoramento)
 * Configuração por variáveis de ambiente (veja .env.example).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USER = String(process.env.ADMIN_USER || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const SCHEMA = process.env.SCHEMA_FILE || path.join(__dirname, '..', 'db', 'schema.sql');

if (!DATABASE_URL) { console.error('Falta a variável DATABASE_URL (endereço do PostgreSQL).'); process.exit(1); }
if (!ADMIN_USER || ADMIN_PASSWORD.length < 8) { console.error('Defina ADMIN_USER e ADMIN_PASSWORD (mínimo 8 caracteres): é o login do marketing.'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL, max: 10, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function prepararBanco() {
  await pool.query(fs.readFileSync(SCHEMA, 'utf8'));
  // o banco guarda só a "impressão digital" da chave derivada da senha (nunca a senha)
  const chave = sha('arcomplay-admin|' + ADMIN_USER + '|' + ADMIN_PASSWORD);
  await pool.query('insert into ap_secret(id,hash) values(1,$1) on conflict(id) do update set hash=excluded.hash', [sha(chave)]);
}

/* limite simples por endereço (protege contra abuso) */
const janelas = new Map();
function limite(ip, tipo, max, ms) {
  const k = tipo + '|' + ip, agora = Date.now();
  let j = janelas.get(k);
  if (!j || agora - j.t > ms) { j = { t: agora, n: 0 }; janelas.set(k, j); }
  j.n++;
  return j.n <= max;
}
setInterval(() => { const agora = Date.now(); for (const [k, j] of janelas) if (agora - j.t > 120000) janelas.delete(k); }, 60000).unref();

const FUNCOES = {
  ap_check: ['p_key'],
  ap_publish: ['p_key', 'p_code', 'p_kind', 'p_data'],
  ap_get: ['p_code'],
  ap_submit: ['p_code', 'p_id', 'p_data'],
  ap_pull: ['p_key', 'p_since'],
  ap_backup_put: ['p_key', 'p_data'],
  ap_backup_get: ['p_key']
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });
app.use('/api', express.json({ limit: '25mb' }));

app.get('/healthz', async (req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false }); }
});
app.get('/arcom-config.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send('window.ARCOM_CFG={api:"/api"};');
});
app.post('/api/rpc/:fn', async (req, res) => {
  const fn = req.params.fn, nomes = FUNCOES[fn];
  if (!nomes) return res.status(404).json({ error: 'função desconhecida' });
  const ip = req.ip || 'x';
  if (fn === 'ap_check' && !limite(ip, 'login', 20, 60000)) return res.status(429).json({ error: 'muitas tentativas, espere um minuto' });
  if (!limite(ip, 'rpc', 300, 60000)) return res.status(429).json({ error: 'muitas requisições, espere um minuto' });
  const corpo = req.body || {};
  const valores = nomes.map(n => { const v = corpo[n]; if (n === 'p_data') return JSON.stringify(v === undefined ? null : v); return v === undefined ? null : v; });
  const marcas = nomes.map((n, i) => '$' + (i + 1) + (n === 'p_data' ? '::jsonb' : n === 'p_since' ? '::timestamptz' : '::text')).join(',');
  try {
    const r = await pool.query('select ' + fn + '(' + marcas + ') as data', valores);
    res.json({ data: r.rows[0].data });
  } catch (e) {
    res.status(400).json({ error: String(e && e.message || e) });
  }
});
app.get('/arcom-play.html', (req, res) => res.redirect(301, '/'));
app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '10m' }));

const server = http.createServer(app);

/* ponte do ao vivo: cada sala é um canal; o que um manda, os outros da mesma sala recebem */
const wss = new WebSocketServer({ server, path: '/api/live', maxPayload: 256 * 1024 });
const salas = new Map();
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const ch = String(url.searchParams.get('ch') || '');
  if (!/^arcomplay-live-\d{6}$/.test(ch)) { ws.close(1008, 'sala invalida'); return; }
  if (!salas.has(ch)) salas.set(ch, new Set());
  const sala = salas.get(ch);
  if (sala.size >= 400) { ws.close(1013, 'sala cheia'); return; }
  sala.add(ws);
  ws.vivo = true;
  ws.on('pong', () => { ws.vivo = true; });
  ws.on('message', (dados) => {
    let m; try { m = JSON.parse(dados.toString('utf8')); } catch (e) { return; }
    if (!m || typeof m.event !== 'string') return;
    const txt = JSON.stringify({ event: m.event, payload: m.payload });
    for (const outro of sala) if (outro !== ws && outro.readyState === 1) outro.send(txt);
  });
  ws.on('close', () => { sala.delete(ws); if (!sala.size) salas.delete(ch); });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.vivo) { ws.terminate(); continue; } ws.vivo = false; try { ws.ping(); } catch (e) {} } }, 25000).unref();

prepararBanco().then(() => {
  server.listen(PORT, () => console.log('Arcom Play no ar na porta ' + PORT));
}).catch(e => { console.error('Não consegui preparar o banco:', e.message); process.exit(1); });
