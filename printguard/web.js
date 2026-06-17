const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execSync } = require('child_process');

const app        = express();
const PORT       = Number(process.env.WEB_PORT) || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOG_FILE   = path.join(os.homedir(), '.pm2', 'logs', 'printguard-out.log');

// Cargar config.json al inicio para que /api/test use las credenciales guardadas
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      Object.assign(process.env, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
    } catch {}
  }
}
loadConfig();

app.use(express.json());

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'ui.html')));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  try {
    const cfg = fs.existsSync(CONFIG_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      : {};
    res.json(cfg);
  } catch {
    res.json({});
  }
});

app.post('/api/config', (req, res) => {
  const allowed = ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_USER', 'LDAP_PASS', 'POLL_INTERVAL_MS'];
  const cfg = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) cfg[key] = String(req.body[key]);
  }
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    loadConfig();
    res.json({ ok: true, message: 'Configuración guardada. Presiona "Reiniciar servicio" para aplicar.' });
  } catch (e) {
    res.json({ ok: false, message: 'Error al guardar: ' + e.message });
  }
});

// ---------------------------------------------------------------------------
// Reiniciar servicio PM2
// ---------------------------------------------------------------------------
app.post('/api/restart', (req, res) => {
  try {
    execSync('pm2 restart printguard', { stdio: 'ignore', timeout: 10000 });
    res.json({ ok: true, message: 'Servicio reiniciado correctamente.' });
  } catch (e) {
    res.json({ ok: false, message: 'Error al reiniciar: ' + e.message });
  }
});

// ---------------------------------------------------------------------------
// Probar AD para un usuario
// ---------------------------------------------------------------------------
app.get('/api/test/:username', async (req, res) => {
  loadConfig();
  const { getUserInfo } = require('./ad-client');
  const username = String(req.params.username || '').trim();
  if (!username) return res.json({ ok: false, message: 'Usuario vacío' });
  try {
    const info = await getUserInfo(username);
    const ad_ok = info.fullName !== username || info.department !== 'Unknown';
    res.json({ username, fullName: info.fullName, department: info.department, ad_ok });
  } catch (e) {
    res.json({ username, fullName: username, department: 'Unknown', ad_ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Parsear log de PM2
// ---------------------------------------------------------------------------
function parseJobs({ todayOnly = false, filterUser = '' } = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-3000);
  const jobs = [];

  for (const line of lines) {
    const start = line.indexOf('{');
    if (start === -1) continue;
    try {
      const obj = JSON.parse(line.slice(start));
      if (!obj.username || !obj.jobId || !obj.timestamp) continue;
      if (obj.error || obj.heartbeat || obj.message) continue;
      if (todayOnly && !obj.timestamp.startsWith(todayStr)) continue;
      if (filterUser && obj.username.toLowerCase() !== filterUser.toLowerCase()) continue;
      jobs.push(obj);
    } catch {}
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// Trabajos recientes
// ---------------------------------------------------------------------------
app.get('/api/jobs', (req, res) => {
  const todayOnly = req.query.today === 'true';
  const jobs = parseJobs({ todayOnly }).reverse().slice(0, 200);
  res.json(jobs);
});

// ---------------------------------------------------------------------------
// Reporte por usuario
// ---------------------------------------------------------------------------
app.get('/api/report', (req, res) => {
  const todayOnly  = req.query.today === 'true';
  const filterUser = req.query.user  || '';
  const jobs = parseJobs({ todayOnly, filterUser });

  const map = {};
  for (const job of jobs) {
    if (!map[job.username]) {
      map[job.username] = {
        username:   job.username,
        fullName:   job.fullName   || job.username,
        department: job.department || 'Desconocido',
        jobs:       0,
        pages:      0,
        printers:   new Set(),
        lastJob:    null,
      };
    }
    const u = map[job.username];
    u.jobs++;
    u.pages += Number(job.pages) || 0;
    u.printers.add(job.printer);
    if (!u.lastJob || job.timestamp > u.lastJob) u.lastJob = job.timestamp;
  }

  const users = Object.values(map)
    .map(u => ({ ...u, printers: [...u.printers].filter(Boolean) }))
    .sort((a, b) => b.pages - a.pages);

  res.json({ users, totalJobs: jobs.length, totalPages: users.reduce((s, u) => s + u.pages, 0) });
});

// ---------------------------------------------------------------------------
// Estado del servicio (ping)
// ---------------------------------------------------------------------------
app.get('/api/status', (req, res) => {
  let serviceOk = false;
  try {
    const out = execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
    const list = JSON.parse(out);
    serviceOk = list.some(a => a.name === 'printguard' && a.pm2_env.status === 'online');
  } catch {}
  const allJobs = parseJobs();
  res.json({ serviceOk, totalJobs: allJobs.length });
});

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  process.stdout.write(JSON.stringify({
    message: 'PrintGuard Web UI iniciado',
    url:     `http://localhost:${PORT}`,
  }) + '\n');
});
