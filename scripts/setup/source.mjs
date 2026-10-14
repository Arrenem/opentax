import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { command } from './transport.mjs';
export async function sourceRevision(root, run = command) {
  if ((await run('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root })).trim()) throw new Error('SOURCE_MUST_BE_CLEAN_COMMIT');
  const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('SOURCE_REVISION_INVALID');
  return revision;
}
export async function stageSource(root, directory, revision, run = command) {
  const tree = await run('git', ['ls-tree', '-r', '--name-only', revision], { cwd: root });
  const files = tree.trim().split('\n');
  if (files.some(file => /(^|\/)(\.env($|\.)|.*service-account.*\.json$|.*\.pem$|\.opentax\/)/.test(file) && !file.endsWith('.example'))) throw new Error('SOURCE_CONTAINS_PRIVATE_FILE');
  const modes = await run('git', ['ls-tree', '-r', revision], { cwd: root });
  if (/^(120000|160000) /m.test(modes)) throw new Error('SOURCE_LINKS_UNSUPPORTED');
  const stage = await mkdtemp(path.join(directory, `source-${revision}-`));
  const archive = path.join(await mkdtemp(path.join(directory, 'archive-')), 'source.tar');
  await run('git', ['archive', '--format=tar', `--output=${archive}`, revision], { cwd: root });
  await run('tar', ['-xf', archive, '-C', stage]);
  // Upload only the committed source snapshot; never the caller's cwd or credentials.
  await writeFile(path.join(stage, '.gcloudignore'), '.git\n.opentax\n.env*\n**/*service-account*.json\n**/*.pem\n**/*debug.log\nnode_modules\n.next\nsite/dist\n', { mode: 0o600 });
  const pkg = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
  pkg.scripts.build = 'next build --webpack';
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  return stage;
}

export async function prepareDeploymentSource(root, directory, revision) {
  const stage = await stageSource(root, directory, revision);
  // Read all infrastructure inputs from the same committed archive, before any login pause.
  // The provisioning adapter receives captured values, never a mutable worktree path.
  return Object.freeze({
    directory: stage,
    firestoreRules: await readFile(path.join(stage, 'firestore.rules'), 'utf8'),
    storageRules: await readFile(path.join(stage, 'storage.rules'), 'utf8'),
    indexes: JSON.parse(await readFile(path.join(stage, 'firestore.indexes.json'), 'utf8')).indexes,
  });
}
