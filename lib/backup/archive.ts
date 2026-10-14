import { createHash } from 'node:crypto';
import { decode, type Encoded } from './codec';
export const COLLECTIONS = ['journals', 'documents', 'fixedAssets', 'userSettings', 'taxFilings', 'customers', 'projects', 'issuedDocuments', 'billingCounters', 'auditLog', 'idempotency'] as const;
export type Collection = typeof COLLECTIONS[number];
export interface Identity { projectId: string; databaseId: string; bucket: string; uid: string }
export interface LedgerRecord { collection: Collection; id: string; data: Encoded }
export interface EvidenceObject { path: string; generation: string; contentType: string; bytes: string; sha256: string }
export interface Archive { format: 'opentax-ledger'; version: 1; source: Identity; createdAt: string; collections: readonly string[]; records: LedgerRecord[]; objects: EvidenceObject[]; orphanEvidencePaths: string[]; historicalMissingReferences: string[]; sha256: string }
export interface ExclusiveSession { assertHeld(): Promise<void>; finish(success: boolean): Promise<void> }
export interface LedgerAdapter {
  identity: Identity;
  /** Implementation must gate every writer, and reject concurrent runners, including resume. */
  exclusive(operation: 'snapshot' | 'restore', archiveHash?: string): Promise<ExclusiveSession>;
  /** Refuse unrelated root collections, users, auth/access data, and bucket objects. */
  assertRestoreIsolation(): Promise<void>;
  scanRecords(): Promise<LedgerRecord[]>;
  scanObjects(): Promise<EvidenceObject[]>;
  /** Durable archive ownership marker. False means target must be completely empty. */
  isResume(archiveHash: string): Promise<boolean>;
  markRestore(archiveHash: string): Promise<void>;
  putRecord(record: LedgerRecord): Promise<void>;
  putObject(object: EvidenceObject): Promise<void>;
}
export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function bytesDigest(bytes: string): string { return createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('hex'); }
function sortedRecords(records: LedgerRecord[]) { return [...records].sort((a,b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`)); }
function sortedObjects(objects: EvidenceObject[]) { return [...objects].sort((a,b) => a.path.localeCompare(b.path)); }
function content(records: LedgerRecord[], objects: EvidenceObject[]) {
  return { records: sortedRecords(records), objects: sortedObjects(objects).map(object => ({path:object.path,contentType:object.contentType,bytes:object.bytes,sha256:object.sha256})) };
}
function safeId(value: string): boolean { return typeof value === 'string' && value.length > 0 && !value.includes('/') && value !== '.' && value !== '..'; }
function checkReferences(value: Encoded, uid: string, keys: Set<string>): void {
  if (value.t === 'reference') {
    const prefix = `users/${uid}/`;
    if (!value.path.startsWith(prefix) || !keys.has(value.path.slice(prefix.length))) throw new Error('Reference leaves ledger or is dangling');
  } else if (value.t === 'map') value.v.forEach(([,v]) => checkReferences(v,uid,keys));
  else if (value.t === 'array') value.v.forEach(v => checkReferences(v,uid,keys));
}
/** Old versions could hard-delete assets while retaining audit/idempotency history. */
function historicalMissingReferences(records: LedgerRecord[]): string[] {
  const keys = new Set(records.map(r => `${r.collection}/${r.id}`));
  const missing: string[] = [];
  for (const r of records) {
    if (r.collection !== 'auditLog' && r.collection !== 'idempotency') continue;
    const row = decode(r.data) as Record<string,unknown>;
    const from = `${r.collection}/${r.id}`;
    if (typeof row.journalId === 'string' && !keys.has(`journals/${row.journalId}`)) missing.push(`${from} -> journals/${row.journalId}`);
    if (r.collection === 'auditLog' && typeof row.entityType === 'string' && COLLECTIONS.includes(row.entityType as Collection) && typeof row.entityId === 'string' && !keys.has(`${row.entityType}/${row.entityId}`)) missing.push(`${from} -> ${row.entityType}/${row.entityId}`);
    if (r.collection === 'idempotency' && typeof row.id === 'string' && !COLLECTIONS.some(c => keys.has(`${c}/${row.id}`))) missing.push(`${from} -> result/${row.id}`);
  }
  return missing.sort();
}
/** Validate before any destination mutation. Historical/deleted rows remain in the graph. */
export function validateArchive(archive: Archive): void {
  if (!archive || archive.format !== 'opentax-ledger' || archive.version !== 1 || !safeId(archive.source?.uid) || !archive.source.projectId || !archive.source.databaseId || !archive.source.bucket) throw new Error('Unsupported archive or identity');
  if (JSON.stringify(archive.collections) !== JSON.stringify(COLLECTIONS)) throw new Error('Incomplete collection inventory');
  const { sha256, ...payload } = archive;
  if (digest(payload) !== sha256) throw new Error('Archive checksum mismatch');
  const keys = new Set<string>();
  const rows = new Map<string, Record<string, unknown>>();
  for (const r of archive.records) {
    const key = `${r.collection}/${r.id}`;
    if (!COLLECTIONS.includes(r.collection) || !safeId(r.id) || keys.has(key) || r.data.t !== 'map') throw new Error('Invalid or duplicate ledger record');
    keys.add(key); rows.set(key, decode(r.data) as Record<string, unknown>);
  }
  if (JSON.stringify(archive.historicalMissingReferences) !== JSON.stringify(historicalMissingReferences(archive.records))) throw new Error('Historical missing-reference inventory mismatch');
  const objectPaths = new Set<string>();
  const objectMap = new Map<string,EvidenceObject>();
  for (const o of archive.objects) {
    if (typeof o.generation !== 'string' || !/^\d+$/.test(o.generation) || typeof o.contentType !== 'string' || !o.contentType || typeof o.bytes !== 'string' || typeof o.sha256 !== 'string') throw new Error('Invalid evidence metadata');
    if (!o.path.startsWith(`users/${archive.source.uid}/documents/`) || !safeId(o.path.slice(`users/${archive.source.uid}/documents/`.length)) || objectPaths.has(o.path)) throw new Error('Invalid evidence path');
    if (Buffer.from(o.bytes, 'base64').toString('base64') !== o.bytes || bytesDigest(o.bytes) !== o.sha256) throw new Error('Evidence checksum mismatch');
    objectPaths.add(o.path); objectMap.set(o.path,o);
  }
  const ref = (collection: string, id: unknown) => {
    if (id === undefined || id === null || id === '') return;
    if (typeof id !== 'string' || !keys.has(`${collection}/${id}`)) throw new Error(`Dangling ${collection} reference`);
  };
  const refs = (collection: string, ids: unknown) => {
    if (ids === undefined) return;
    if (!Array.isArray(ids)) throw new Error('Invalid reference list');
    ids.forEach(id => ref(collection,id));
  };
  for (const r of archive.records) {
    checkReferences(r.data, archive.source.uid, keys);
    const row = rows.get(`${r.collection}/${r.id}`)!;
    if (r.collection !== 'idempotency' && row.id !== undefined && row.id !== r.id) throw new Error('Record ID mismatch');
    if (r.collection === 'documents') {
      if (typeof row.fileName !== 'string' || !objectPaths.has(row.fileName)) throw new Error('Missing evidence bytes');
      if (row.uploadedBy !== undefined && row.uploadedBy !== archive.source.uid) throw new Error('Evidence owner mismatch');
      const object = objectMap.get(row.fileName)!;
      if (row.fileSizeBytes !== undefined && Number(row.fileSizeBytes) !== Buffer.from(object.bytes,'base64').length) throw new Error('Evidence size mismatch');
      refs('journals', row.linkedJournalIds); ref('projects', row.projectId);
    }
    if (r.collection === 'journals') { refs('documents', row.evidenceIds); ref('issuedDocuments', row.sourceDocumentId); ref('journals', row.previousVersionId); ref('journals',row.originalJournalId); }
    if (r.collection === 'projects' || r.collection === 'issuedDocuments') ref('customers', row.customerId);
    if (r.collection === 'issuedDocuments') { ref('projects',row.projectId); ref('issuedDocuments',row.sourceDocumentId); refs('journals',row.linkedJournalIds); }
    // Historical target absence is recorded in the hashed inventory above, never omitted.
  }
  const referencedFiles = new Set([...rows.entries()].filter(([key]) => key.startsWith('documents/')).map(([,row]) => row.fileName));
  const orphans = [...objectPaths].filter(path => !referencedFiles.has(path)).sort();
  if (JSON.stringify(archive.orphanEvidencePaths) !== JSON.stringify(orphans)) throw new Error('Orphan evidence inventory mismatch');
  for (const [key,row] of rows) {
    if (key.startsWith('journals/') && row.isDeleted === false && row.isCurrent === true) {
      const id = key.slice('journals/'.length);
      for (const evidenceId of (row.evidenceIds ?? []) as string[]) {
        if (!(rows.get(`documents/${evidenceId}`)?.linkedJournalIds as string[] | undefined)?.includes(id)) throw new Error('Nonreciprocal evidence link');
      }
    }
    if (key.startsWith('documents/')) {
      for (const journalId of (row.linkedJournalIds ?? []) as string[]) {
        const journal = rows.get(`journals/${journalId}`)!;
        if (journal.isDeleted === false && journal.isCurrent === true && !(journal.evidenceIds as string[] | undefined)?.includes(key.slice('documents/'.length))) throw new Error('Nonreciprocal journal link');
      }
    }
  }
}
export async function createArchive(adapter: LedgerAdapter): Promise<Archive> {
  const session = await adapter.exclusive('snapshot');
  let success = false;
  try {
    const records = sortedRecords(await adapter.scanRecords());
    const objects = sortedObjects(await adapter.scanObjects());
    await session.assertHeld();
    // A second complete read catches unmanaged concurrent writes and generation changes.
    if (digest({ records, objects }) !== digest({ records: sortedRecords(await adapter.scanRecords()), objects: sortedObjects(await adapter.scanObjects()) })) throw new Error('Snapshot changed while reading');
    await session.assertHeld();
    const referencedFiles = new Set(records.filter(r => r.collection === 'documents').map(r => (decode(r.data) as Record<string,unknown>).fileName));
    const orphanEvidencePaths = objects.map(o => o.path).filter(path => !referencedFiles.has(path)).sort();
    const payload = { historicalMissingReferences: historicalMissingReferences(records), orphanEvidencePaths, format: 'opentax-ledger' as const, version: 1 as const, source: adapter.identity, createdAt: new Date().toISOString(), collections: COLLECTIONS, records, objects };
    const archive = { ...payload, sha256: digest(payload) };
    validateArchive(archive); success = true; return archive;
  } finally { await session.finish(success); }
}
export async function restoreArchive(adapter: LedgerAdapter, archive: Archive, options: { isolatedTarget: true }): Promise<void> {
  validateArchive(archive);
  if (options.isolatedTarget !== true || adapter.identity.uid !== archive.source.uid || adapter.identity.projectId === archive.source.projectId || adapter.identity.bucket === archive.source.bucket) throw new Error('Restore requires same UID in a different isolated project and bucket');
  // Read-only preflight avoids installing maintenance state into an unrelated live
  // target. Repeat all checks under the gate to close the check/acquire race.
  await adapter.assertRestoreIsolation();
  if (!await adapter.isResume(archive.sha256)) {
    if ((await adapter.scanRecords()).length || (await adapter.scanObjects()).length) throw new Error('Restore target is not empty');
  }
  const session = await adapter.exclusive('restore', archive.sha256);
  let success = false;
  try {
    await adapter.assertRestoreIsolation();
    const existingRecords = await adapter.scanRecords();
    const existingObjects = await adapter.scanObjects();
    if (!await adapter.isResume(archive.sha256)) {
      if (existingRecords.length || existingObjects.length) throw new Error('Restore target is not empty');
      await adapter.markRestore(archive.sha256);
    } else {
      const expectedRecords = new Map(archive.records.map(r => [`${r.collection}/${r.id}`,digest(r)]));
      const expectedObjects = new Map(archive.objects.map(o => [o.path,digest(content([], [o]).objects[0])]));
      if (existingRecords.some(r => expectedRecords.get(`${r.collection}/${r.id}`) !== digest(r)) || existingObjects.some(o => expectedObjects.get(o.path) !== digest(content([], [o]).objects[0]))) throw new Error('Unrelated or modified data in restore target');
    }
    for (const object of archive.objects) { await session.assertHeld(); await adapter.putObject(object); }
    for (const record of archive.records) { await session.assertHeld(); await adapter.putRecord(record); }
    await session.assertHeld();
    if (digest(content(await adapter.scanRecords(), await adapter.scanObjects())) !== digest(content(archive.records,archive.objects))) throw new Error('Post-restore verification failed');
    await adapter.assertRestoreIsolation();
    await session.assertHeld();
    success = true;
  } finally { await session.finish(success); }
}
