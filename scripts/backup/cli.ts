#!/usr/bin/env node
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createArchive, restoreArchive, validateArchive, type Archive } from '../../lib/backup/archive';
import { FirebaseLedgerAdapter } from '../../lib/backup/firebaseAdapter';
import { parseOptions, assertArchiveSize } from './options';

async function loadArchive(filename: string): Promise<Archive> {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('ARCHIVE_TYPE_INVALID');
    assertArchiveSize(stat.size);
    const archive = JSON.parse(await file.readFile('utf8')) as Archive;
    validateArchive(archive);
    return archive;
  } finally { await file.close(); }
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) {
    console.log('OpenTax ledger backup (experimental; live cloud acceptance pending)\nUsage: npm run backup -- export|restore|validate --archive <file> [--project <id> --bucket <name> --uid <uid>] [--apply]\nDefault: offline plan only. validate checks a local archive without cloud access. --apply requires a terminal and fresh confirmation; ADC must already be explicitly configured. Restore requires a separate empty project/bucket with the same UID. Credentials and access grants are never restored.');
    return;
  }
  const archive = options.mode === 'export' ? null : await loadArchive(options.archive);
  if (options.mode === 'validate') {
    console.log(JSON.stringify({ valid: true, format: archive!.format, version: archive!.version, records: archive!.records.length, objects: archive!.objects.length, sha256: archive!.sha256 }));
    return;
  }
  const identity = { projectId: options.project!, databaseId: '(default)', bucket: options.bucket!, uid: options.uid! };
  if (archive && (archive.source.uid !== identity.uid || archive.source.projectId === identity.projectId || archive.source.bucket === identity.bucket)) throw new Error('RESTORE_TARGET_NOT_ISOLATED');
  console.log(JSON.stringify({ mode: options.mode, target: identity, archive: options.archive, apply: options.apply, source: archive?.source,
    note: 'Temporary exclusive ledger maintenance; blocks new writes and refuses active writers. No credential, IAM, billing or resource creation. Archive files contain private accounting data. Keep source/target free of external admin writers. Failed restores remain closed for explicit reconciliation; completed snapshot reads release maintenance.' }, null, 2));
  if (!options.apply) { console.log('OFFLINE_PLAN_ONLY: no credentials read, no cloud calls.'); return; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_CONFIRMATION_REQUIRED');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const phrase = `${options.mode.toUpperCase()} ${identity.projectId} ${identity.uid}`;
  try { if (await prompt.question(`Confirm this exact operation by typing ${phrase}: `) !== phrase) throw new Error('CONSENT_DECLINED'); }
  finally { prompt.close(); }
  // Explicit target only; no discovery of alternate projects or accounts.
  const app = initializeApp({ projectId: identity.projectId, storageBucket: identity.bucket, credential: applicationDefault() }, `opentax-backup-${Date.now()}`);
  try {
    const db = getFirestore(app);
    db.settings({ useBigInt: true });
    const adapter = new FirebaseLedgerAdapter(db, getStorage(app).bucket(identity.bucket), identity);
    if (options.mode === 'export') {
      // Exclusive creation, restrictive permissions and no symlink following. Never overwrite an existing backup.
      const file = await open(options.archive, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        const result = await createArchive(adapter);
        const serialized = JSON.stringify(result);
        assertArchiveSize(Buffer.byteLength(serialized, 'utf8'));
        await file.writeFile(serialized); await file.sync();
        console.log(JSON.stringify({ exported: true, records: result.records.length, objects: result.objects.length, sha256: result.sha256 }));
      } finally { await file.close(); }
    } else {
      await restoreArchive(adapter, archive!, { isolatedTarget: true });
      console.log(JSON.stringify({ restored: true, records: archive!.records.length, objects: archive!.objects.length, sha256: archive!.sha256, liveAcceptance: 'not-tested' }));
    }
  } finally { await deleteApp(app); }
}
main().catch(() => { console.error('BACKUP_OPERATION_FAILED: stopped safely. Check input, permissions, archive and maintenance state. No automatic cleanup or override was performed.'); process.exitCode = 1; });
