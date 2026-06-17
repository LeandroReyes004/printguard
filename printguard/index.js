const fs   = require('fs');
const path = require('path');

// Cargar config.json si existe (escrito por la interfaz web)
const CONFIG_FILE = path.join(__dirname, 'config.json');
if (fs.existsSync(CONFIG_FILE)) {
  try { Object.assign(process.env, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch {}
}

const { getPrintJobs } = require('./ps-query');
const { getUserInfo }  = require('./ad-client');

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const HEARTBEAT_EVERY  = Math.ceil(60000 / POLL_INTERVAL_MS); // cada ~60 s

const seenJobIds = new Set();
let pollCount = 0;

const testArg = (() => {
  const idx = process.argv.indexOf('--test');
  return idx !== -1 ? (process.argv[idx + 1] || null) : null;
})();

function logJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function processPrintJobs() {
  try {
    const rawJobs = getPrintJobs();
    if (!Array.isArray(rawJobs) || rawJobs.length === 0) return;

    for (const job of rawJobs) {
      if (!job.jobId || seenJobIds.has(job.jobId)) continue;

      seenJobIds.add(job.jobId);
      if (seenJobIds.size > 10000) seenJobIds.clear();

      const userInfo = await getUserInfo(job.username);
      logJson({
        timestamp:  new Date().toISOString(),
        username:   job.username,
        fullName:   userInfo.fullName,
        department: userInfo.department,
        printer:    job.printer,
        pages:      job.pages,
        jobId:      job.jobId,
      });
    }
  } catch (error) {
    logJson({ error: true, message: error.message || 'Error en ciclo de polling' });
  }
}

async function runTestMode(username) {
  logJson({ message: 'PrintGuard — modo prueba iniciado', username, timestamp: new Date().toISOString() });

  const userInfo = await getUserInfo(username);
  const adOk = userInfo.fullName !== username || userInfo.department !== 'Unknown';

  logJson({
    message:    'Resultado de búsqueda en Active Directory',
    ad_ok:      adOk,
    fullName:   userInfo.fullName,
    department: userInfo.department,
    hint:       adOk ? 'AD respondió correctamente.' : 'AD devolvió defaults — revisar LDAP_URL, LDAP_USER, LDAP_PASS en ecosystem.config.js',
  });

  logJson({
    timestamp:  new Date().toISOString(),
    username,
    fullName:   userInfo.fullName,
    department: userInfo.department,
    printer:    'IMPRESORA-PRUEBA',
    pages:      1,
    jobId:      `TEST-${Date.now()}`,
  });

  logJson({ message: 'Prueba completada. Revisa los campos fullName y department arriba.' });
}

async function start() {
  logJson({
    message:          'PrintGuard iniciado',
    timestamp:        new Date().toISOString(),
    poll_interval_ms: POLL_INTERVAL_MS,
  });

  while (true) {
    pollCount++;
    await processPrintJobs();

    if (pollCount % HEARTBEAT_EVERY === 0) {
      logJson({ heartbeat: true, timestamp: new Date().toISOString(), trabajos_vistos: seenJobIds.size });
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (testArg) {
  runTestMode(testArg)
    .then(() => process.exit(0))
    .catch((err) => {
      logJson({ error: true, message: err.message });
      process.exit(1);
    });
} else {
  start().catch((error) => {
    logJson({ error: true, message: error.message || 'Error fatal de inicio' });
    process.exit(1);
  });
}
