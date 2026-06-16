const { execSync } = require('child_process');

const PS_COMMAND = [
  'Get-WmiObject Win32_PrintJob',
  '| Select-Object Name,Owner,TotalPages,HostPrintQueue,TimeSubmitted',
  '| ConvertTo-Json',
].join(' ');

function stripDomain(owner) {
  if (!owner) return '';
  // Win32_PrintJob returns Owner as "DOMAIN\username" — AD lookup needs only the sAMAccountName
  return owner.includes('\\') ? owner.split('\\').pop() : owner;
}

function normalizePrintJob(raw) {
  return {
    jobId: raw.Name || '',
    username: stripDomain(raw.Owner),
    printer: raw.HostPrintQueue || '',
    pages: Number(raw.TotalPages) || 0,
    submittedAt: raw.TimeSubmitted || null,
  };
}

function getPrintJobs() {
  let stdout;
  try {
    stdout = execSync(PS_COMMAND, {
      shell: 'powershell.exe',
      windowsHide: true,
    })
      .toString()
      .trim();
  } catch {
    return [];
  }

  if (!stdout) return [];

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (!parsed) return [];

  const jobs = Array.isArray(parsed) ? parsed : [parsed];
  return jobs.map(normalizePrintJob);
}

module.exports = { getPrintJobs };
