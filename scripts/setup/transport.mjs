import { spawn } from 'node:child_process';

export const FIREBASE_VERSION = '15.33.0';
const API_HOSTS = new Set(['cloudresourcemanager.googleapis.com', 'cloudbilling.googleapis.com', 'serviceusage.googleapis.com', 'firebase.googleapis.com', 'firestore.googleapis.com', 'storage.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com', 'iam.googleapis.com', 'firebasehosting.googleapis.com', 'firebaserules.googleapis.com', 'run.googleapis.com']);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function command(program, args, { cwd, interactive = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env, shell: false, stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    let output = '', size = 0;
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('COMMAND_TIMEOUT')); }, 30 * 60 * 1000);
    child.stdout?.on('data', data => { size += data.length; if (size > 4 * 1024 * 1024) child.kill('SIGTERM'); else output += data; });
    // Consume errors without leaking SDK responses, access tokens or configuration to logs.
    child.stderr?.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('COMMAND_UNAVAILABLE')); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0 || size > 4 * 1024 * 1024) reject(new Error('COMMAND_FAILED')); else resolve(output); });
  });
}

export function cloudTransport({ account, projectId, run = command, fetcher = fetch, pause = sleep }) {
  const gcloud = (args, options = {}) => run('gcloud', [...args, `--account=${account}`, `--project=${projectId}`, '--quiet'], options);
  async function request(method, url, body) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !API_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.port) throw new Error('API_ORIGIN_DENIED');
    const token = (await gcloud(['auth', 'print-access-token'])).trim();
    if (!token || /\s/.test(token)) throw new Error('AUTH_TOKEN_INVALID');
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(60000), headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      // Only reads are retried. Unknown write outcomes are reconciled on resume.
      if (method === 'GET' && [429, 502, 503, 504].includes(response.status) && attempt < 3) { await pause(500 * 2 ** attempt); continue; }
      if (method === 'GET' && response.status === 404) return null;
      if (!response.ok) { const error = new Error(`CLOUD_HTTP_${response.status}`); error.status = response.status; throw error; }
      if (response.status === 204) return {};
      return response.json();
    }
  }
  async function poll(url) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const op = await request('GET', url);
      if (!op) throw new Error('OPERATION_MISSING');
      if (op.error) throw new Error('CLOUD_OPERATION_FAILED');
      if (op.done) return op.response ?? {};
      await pause(1000);
    }
    throw new Error('CLOUD_OPERATION_TIMEOUT');
  }
  return { gcloud, request, poll };
}
