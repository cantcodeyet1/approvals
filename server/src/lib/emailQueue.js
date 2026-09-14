import { randomUUID } from 'crypto';

// Jobs live for seconds to a couple of minutes (created, then picked up by
// the Windows agent's next poll) — no need for a database table. Worst case
// on a server restart is a lost in-flight job, which just means the sender
// clicks "Send" again; acceptable for a low-stakes internal tool.
const jobs = new Map();
let lastAgentPollAt = null;

const JOB_TTL_MS = 30 * 60 * 1000; // purge anything older than 30 minutes

function purgeOld() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createJob({ invoiceIds, to, cc, subject, body }) {
  purgeOld();
  const id = randomUUID();
  const job = {
    id,
    invoiceIds,
    to,
    cc,
    subject,
    body,
    status: 'pending', // pending | claimed | sent | failed
    error: null,
    createdAt: Date.now(),
    completedAt: null,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

// Called by the agent's poll — claims (and returns) the oldest pending job.
export function claimNextJob() {
  lastAgentPollAt = Date.now();
  purgeOld();
  const next = [...jobs.values()].filter((j) => j.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!next) return null;
  next.status = 'claimed';
  return next;
}

export function recordAgentSeen() {
  lastAgentPollAt = Date.now();
}

export function completeJob(id, { success, error }) {
  const job = jobs.get(id);
  if (!job) return null;
  job.status = success ? 'sent' : 'failed';
  job.error = error || null;
  job.completedAt = Date.now();
  return job;
}

// Consider the agent "available" if it's polled within the last 20s — the
// agent is expected to poll every ~5s while running.
export function isAgentOnline() {
  return Boolean(lastAgentPollAt && Date.now() - lastAgentPollAt < 20_000);
}
