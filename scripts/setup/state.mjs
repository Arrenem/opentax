import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PLAN_VERSION, validateConfig, buildPlan, planHash } from './plan.mjs';

export function validateState(state) {
  if (!state || state.version !== PLAN_VERSION || !['draft', 'planned'].includes(state.phase) ||
      Object.keys(state).some(k => !['version', 'revision', 'phase', 'config', 'planHash'].includes(k))) throw new Error('STATE_INVALID');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('STATE_REVISION_REQUIRED');
  validateConfig(state.config, state.phase === 'draft');
  if (state.phase === 'planned' && state.planHash !== planHash(buildPlan(state.config))) throw new Error('STATE_PLAN_CHANGED');
  return state;
}

export async function loadState(directory) {
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('STATE_UNSAFE_DIRECTORY');
  const file = path.join(directory, 'plan.json');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw new Error('STATE_UNSAFE_FILE');
  return validateState(JSON.parse(await readFile(file, 'utf8')));
}

export async function saveState(directory, state, { expectedRevision = 0 } = {}) {
  validateState(state);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('STATE_UNSAFE_DIRECTORY');
  // Exclusive temp file is also a write lock; interrupted writes require manual review.
  const temp = path.join(directory, 'plan.pending');
  const handle = await open(temp, 'wx', 0o600);
  try {
    let previous;
    try { previous = await loadState(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if ((previous?.revision ?? 0) !== expectedRevision || state.revision !== expectedRevision) throw new Error('STATE_CONCURRENT_CHANGE');
    if (previous?.phase === 'planned' && (state.phase !== 'planned' || state.planHash !== previous.planHash || JSON.stringify(state.config) !== JSON.stringify(previous.config))) throw new Error('STATE_APPROVED_PLAN_IMMUTABLE');
    const next = { ...state, revision: expectedRevision + 1 };
    await handle.writeFile(JSON.stringify(next, null, 2) + '\n');
    await handle.sync();
    await handle.close();
    await rename(temp, path.join(directory, 'plan.json'));
    return next;
  } catch (error) {
    await handle.close();
    await unlink(temp).catch(() => {});
    throw error;
  }
}
