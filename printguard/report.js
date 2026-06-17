const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] || null : null;
}

const logPath    = getArg('--log') || path.join(os.homedir(), '.pm2', 'logs', 'printguard-out.log');
const filterUser = getArg('--user');
const todayOnly  = args.includes('--today');
const todayStr   = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Leer y parsear el archivo de log
// ---------------------------------------------------------------------------
function readJobs(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`\n  ERROR: No se encontró el archivo de log:\n  ${filePath}\n`);
    console.error('  Usa --log <ruta> para especificar otra ubicación.\n');
    process.exit(1);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const jobs  = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // PM2 puede prefijar líneas con metadatos tipo "0|printguard | {...}"
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart === -1) continue;

    try {
      const obj = JSON.parse(trimmed.slice(jsonStart));
      if (obj.username && obj.jobId && obj.timestamp && !obj.error && !obj.heartbeat && !obj.message) {
        jobs.push(obj);
      }
    } catch {
      // línea no válida — ignorar
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Filtrar
// ---------------------------------------------------------------------------
function filterJobs(jobs) {
  let result = jobs;
  if (todayOnly) {
    result = result.filter((j) => j.timestamp.startsWith(todayStr));
  }
  if (filterUser) {
    result = result.filter((j) => j.username.toLowerCase() === filterUser.toLowerCase());
  }
  return result;
}

// ---------------------------------------------------------------------------
// Agrupar por usuario
// ---------------------------------------------------------------------------
function groupByUser(jobs) {
  const map = {};

  for (const job of jobs) {
    if (!map[job.username]) {
      map[job.username] = {
        username:   job.username,
        fullName:   job.fullName  || job.username,
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

  return Object.values(map).sort((a, b) => b.pages - a.pages);
}

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------
function pad(str, len) {
  return String(str == null ? '—' : str).padEnd(len).slice(0, len);
}

function formatDate(iso) {
  if (!iso) return '—';
  return iso.replace('T', ' ').slice(0, 16);
}

const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';

// ---------------------------------------------------------------------------
// Imprimir reporte
// ---------------------------------------------------------------------------
function printReport(users, totalJobs, totalPages) {
  const W    = 95;
  const LINE = '═'.repeat(W);
  const SEP  = '─'.repeat(W);

  const periodo = todayOnly
    ? `Hoy ${todayStr}`
    : filterUser
      ? `Todo el historial — usuario: ${filterUser}`
      : 'Todo el historial';

  console.log('');
  console.log(`${BOLD}${CYAN}  PrintGuard — Reporte de Impresión por Usuario${RESET}`);
  console.log(`  ${DIM}Período: ${periodo}  |  Trabajos: ${totalJobs}  |  Páginas totales: ${totalPages}${RESET}`);
  console.log(`  ${LINE}`);
  console.log(
    `${BOLD}  ` +
    pad('Usuario', 20) +
    pad('Nombre completo', 24) +
    pad('Departamento', 18) +
    pad('Trabajos', 10) +
    pad('Páginas', 9) +
    'Último trabajo' +
    RESET
  );
  console.log(`  ${SEP}`);

  if (users.length === 0) {
    console.log(`\n  ${DIM}  No se encontraron trabajos de impresión para los filtros indicados.${RESET}\n`);
  }

  for (const u of users) {
    const printerList = [...u.printers].filter(Boolean).join(', ') || '—';
    console.log(
      `  ${GREEN}` +
      pad(u.username, 20) +
      `${RESET}` +
      pad(u.fullName, 24) +
      pad(u.department, 18) +
      pad(u.jobs, 10) +
      pad(u.pages, 9) +
      formatDate(u.lastJob)
    );
    console.log(`  ${DIM}${''.padEnd(20)}↳ Impresoras: ${printerList}${RESET}`);
  }

  console.log(`  ${LINE}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Uso: node report.js [opciones]

  Opciones:
    --log  <ruta>      Ruta al archivo de log de PM2
                       (defecto: ~/.pm2/logs/printguard-out.log)
    --user <usuario>   Filtrar por nombre de usuario (sAMAccountName)
    --today            Mostrar solo los trabajos de hoy
    --help             Mostrar esta ayuda

  Ejemplos:
    node report.js
    node report.js --today
    node report.js --user leandro
    node report.js --log C:\\Logs\\printguard.log --today
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const allJobs    = readJobs(logPath);
const filtered   = filterJobs(allJobs);
const grouped    = groupByUser(filtered);
const totalPages = grouped.reduce((s, u) => s + u.pages, 0);

printReport(grouped, filtered.length, totalPages);
