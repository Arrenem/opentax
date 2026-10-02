import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const editor = fileURLToPath(new URL('../', import.meta.url));
export const sourceRoot = path.resolve(editor, '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const keys = ['title', 'description', 'summary', 'updatedAt'];
export async function bridge(action, root = sourceRoot, staging = path.join(editor, 'drafts')) {
  const manifestPath = path.join(root, 'content/articles/manifest.json');
  const bodyPath = path.join(root, 'content/articles/freee-cost-review.md');
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const entry = manifest.find(item => item.slug === 'freee-cost-review');
  if (!entry || entry.status !== 'draft') throw new Error('Only the existing draft article can be edited.');
  const body = await readFile(bodyPath, 'utf8');
  const fingerprint = { body: hash(body), entry: hash(JSON.stringify(entry)) };
  await mkdir(staging, { recursive: true });
  const stagePath = path.join(staging, 'freee-cost-review.json');
  const basePath = path.join(staging, '.freee-cost-review-base.json');
  if (action === 'import') {
    await writeFile(stagePath, JSON.stringify({ ...Object.fromEntries(keys.map(key => [key, entry[key]])), markdown: body }, null, 2) + '\n');
    await writeFile(basePath, JSON.stringify(fingerprint));
    return 'Imported the draft; source files were not changed.';
  }
  if (action !== 'apply') throw new Error('Usage: bridge.mjs import|apply');
  const baseline = JSON.parse(await readFile(basePath, 'utf8'));
  if (baseline.body !== fingerprint.body || baseline.entry !== fingerprint.entry) throw new Error('Source changed after import. Preserve your editor draft, re-import, and reconcile before applying.');
  const draft = JSON.parse(await readFile(stagePath, 'utf8'));
  if (typeof draft.markdown !== 'string' || !draft.markdown.trim()) throw new Error('Markdown body is required.');
  for (const key of keys) if (typeof draft[key] !== 'string') throw new Error(`${key} must be text.`);
  if (!draft.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.updatedAt)) throw new Error('Title and ISO update date are required.');
  // Only these four descriptive fields are editable. Approval, status, sources,
  // and the other 54 manifest entries are preserved exactly as data.
  for (const key of keys) entry[key] = draft[key];
  await writeFile(bodyPath, draft.markdown);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(basePath, JSON.stringify({ body: hash(draft.markdown), entry: hash(JSON.stringify(entry)) }));
  return 'Applied Markdown and descriptive metadata; article remains draft. Review git diff and run site:preview.';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await bridge(process.argv[2])); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
