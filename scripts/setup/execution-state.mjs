import { mkdir, lstat, readFile, writeFile, rename, unlink, rmdir, open, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';
export async function privateDirectory(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('STATE_UNSAFE_DIRECTORY');
  await chmod(dir, 0o700);
  // Credential tools must not follow a pre-existing link to another credential store.
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('STATE_UNSAFE_LINK');
    if (entry.isDirectory()) await privateDirectory(path.join(dir, entry.name));
  }
}
export async function lockDirectory(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) throw new Error('STATE_UNSAFE_DIRECTORY');
  const lock = path.join(dir, 'session.lock');
  try { await mkdir(lock, { mode: 0o700 }); } catch { throw new Error('SESSION_LOCKED_REVIEW_BEFORE_REMOVING_LOCK'); }
  await writeFile(path.join(lock, 'pid'), String(process.pid), { mode: 0o600 });
  return async () => { await unlink(path.join(lock, 'pid')); await rmdir(lock); };
}
export async function readExecution(dir) {
  const file = path.join(dir, 'execution.json');
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('EXECUTION_STATE_INVALID');
    const state = JSON.parse(await readFile(file, 'utf8'));
    if (state.version !== 1 || !/^[0-9a-f-]{36}$/.test(state.installationId) || !/^[0-9a-f]{40}$/.test(state.revision) || !/^[0-9a-f]{64}$/.test(state.planHash) || !state.steps || !state.resources) throw new Error('EXECUTION_STATE_INVALID');
    return state;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function writeExecution(dir, state) {
  const temp = path.join(dir, 'execution.pending');
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(state, null, 2)); await file.sync(); }
  finally { await file.close(); }
  await rename(temp, path.join(dir, 'execution.json'));
}
