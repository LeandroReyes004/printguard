const { getPrintJobs } = require('./ps-query');
const { getUserInfo } = require('./ad-client');

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const seenJobIds = new Set();

function logJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function normalizePrintJob(raw) {
  return {
    jobId: raw.jobId || '',
    username: raw.username || '',
    printer: raw.printer || '',
    pages: Number(raw.pages) || 0,
    submittedAt: raw.submittedAt || null,
  };
}

async function processPrintJobs() {
  try {
    const rawJobs = getPrintJobs();
    if (!Array.isArray(rawJobs) || rawJobs.length === 0) {
      return;
    }

    for (const raw of rawJobs) {
      const job = normalizePrintJob(raw);
      if (!job.jobId || seenJobIds.has(job.jobId)) {
        continue;
      }

      seenJobIds.add(job.jobId);
      const userInfo = await getUserInfo(job.username);
      const payload = {
        timestamp: new Date().toISOString(),
        username: job.username,
        fullName: userInfo.fullName || job.username,
        department: userInfo.department || 'Unknown',
        printer: job.printer,
        pages: job.pages,
        jobId: job.jobId,
      };

      logJson(payload);
    }
  } catch (error) {
    logJson({ error: true, message: error.message || 'Unknown polling failure' });
  }
}

async function start() {
  logJson({ message: 'PrintGuard service started', timestamp: new Date().toISOString() });
  while (true) {
    await processPrintJobs();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

start().catch((error) => {
  logJson({ error: true, message: error.message || 'Fatal startup failure' });
  process.exit(1);
});