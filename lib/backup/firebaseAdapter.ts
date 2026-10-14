import { randomUUID } from 'node:crypto';
import { DocumentReference, FieldPath, type Firestore } from 'firebase-admin/firestore';
import type { Bucket, GetFilesOptions, GetFilesResponse } from '@google-cloud/storage';
import { COLLECTIONS, bytesDigest, digest, type LedgerAdapter, type Identity, type LedgerRecord, type EvidenceObject } from './archive';
import { encode, decode } from './codec';
import { acquireLedgerMaintenance, assertLedgerMaintenance, releaseLedgerMaintenance } from './writeGate';

const EXCLUDED_COLLECTIONS = new Set(['_maintenance', 'agentConnections', 'oauthClients', 'oauthCodes', 'oauthTokens']);
/** Admin-only adapter. Callers must independently authorize both projects; never expose as an owner API. */
export class FirebaseLedgerAdapter implements LedgerAdapter {
  constructor(private db: Firestore, private bucket: Bucket, public identity: Identity) {
    if (bucket.name !== identity.bucket || (db as Firestore & { projectId: string }).projectId !== identity.projectId || db.databaseId !== identity.databaseId) throw new Error('Adapter identity does not match SDK target');
    if (!identity.uid || identity.uid.includes('/')) throw new Error('Invalid UID');
  }
  private get owner() { return this.db.collection('users').doc(this.identity.uid); }
  private get state() { return this.owner.collection('_maintenance').doc('restore'); }
  async exclusive(operation: 'snapshot' | 'restore', archiveHash?: string) {
    const runner = randomUUID();
    let resumeToken: string | undefined;
    if (operation === 'restore') {
      await this.db.runTransaction(async tx => {
        const data = (await tx.get(this.state)).data();
        if (data?.runner) throw new Error('Restore runner already active; reconcile a crashed process manually');
        if (data?.archiveHash && data.archiveHash !== archiveHash) throw new Error('Target belongs to another archive');
        resumeToken = data?.gateToken;
        tx.set(this.state, { ...data, runner, requestedHash: archiveHash });
      });
    }
    let token: string;
    try {
      token = await acquireLedgerMaintenance(this.db, this.identity.uid, operation, resumeToken);
      if (operation === 'restore') await this.state.update({ gateToken: token });
    } catch (error) {
      // A crash or drain timeout may already have installed a gate. Leave the runner
      // occupied too: only an operator who proves the process stopped may reconcile it.
      throw error;
    }
    return {
      assertHeld: async () => {
        await assertLedgerMaintenance(this.db,this.identity.uid,token);
        if (operation === 'restore' && (await this.state.get()).data()?.runner !== runner) throw new Error('Restore runner ownership lost');
      },
      finish: async (success: boolean) => {
        if (operation === 'snapshot') { await releaseLedgerMaintenance(this.db,this.identity.uid,token); return; }
        if (success) await releaseLedgerMaintenance(this.db,this.identity.uid,token);
        await this.db.runTransaction(async tx => {
          const data = (await tx.get(this.state)).data();
          if (data?.runner !== runner) throw new Error('Restore runner ownership lost');
          tx.set(this.state, { ...data, runner: null, gateToken: success ? null : token, status: success ? 'verified' : 'partial' });
        });
      },
    };
  }
  async isResume(hash: string) { return (await this.state.get()).data()?.archiveHash === hash; }
  async markRestore(hash: string) { await this.state.update({ archiveHash: hash, status: 'partial' }); }
  async assertRestoreIsolation(): Promise<void> {
    const roots = await this.db.listCollections();
    if (roots.some(root => root.id !== 'users')) throw new Error('Target database has unrelated root collections or access grants');
    const owners = await this.db.collection('users').listDocuments();
    if (owners.some(owner => owner.id !== this.identity.uid) || (await this.owner.get()).exists) throw new Error('Target database has unrelated owner/profile data');
    const children = await this.owner.listCollections();
    if (children.some(c => c.id !== '_maintenance' && !COLLECTIONS.includes(c.id as typeof COLLECTIONS[number]))) throw new Error('Target owner has unrelated collections or access grants');
    const maintenance = await this.owner.collection('_maintenance').listDocuments();
    if (maintenance.some(d => !['ledger','restore'].includes(d.id))) throw new Error('Unrelated target maintenance state');
    for (const doc of maintenance) if ((await doc.listCollections()).length) throw new Error('Nested target maintenance data');
    // Inspect the whole bucket, including objects outside the owner prefix.
    let query: GetFilesOptions | null = { autoPaginate: false, maxResults: 400 };
    while (query) {
      const result: GetFilesResponse = await this.bucket.getFiles(query);
      if (result[0].some(file => !file.name.startsWith(`users/${this.identity.uid}/documents/`))) throw new Error('Target bucket has unrelated objects');
      query = result[1] ?? null;
    }
  }
  private assertReferenceNamespace(value: unknown): void {
    if (value instanceof DocumentReference) {
      const firestore = value.firestore as Firestore & { projectId: string };
      if (firestore.projectId !== this.identity.projectId || firestore.databaseId !== this.identity.databaseId) throw new Error('Cross-project/database document reference cannot be archived');
    } else if (Array.isArray(value)) value.forEach(v => this.assertReferenceNamespace(v));
    else if (value && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value))) Object.values(value).forEach(v => this.assertReferenceNamespace(v));
  }
  async scanRecords(): Promise<LedgerRecord[]> {
    const collections = await this.owner.listCollections();
    if (collections.some(c => !COLLECTIONS.includes(c.id as typeof COLLECTIONS[number]) && !EXCLUDED_COLLECTIONS.has(c.id))) throw new Error('Unknown owner collection; upgrade archive schema first');
    const records: LedgerRecord[] = [];
    for (const collection of COLLECTIONS) {
      // listDocuments includes missing parent documents with surviving subcollections.
      for (const ref of await this.owner.collection(collection).listDocuments()) {
        if ((await ref.listCollections()).length) throw new Error('Nested ledger collections require a schema upgrade');
      }
      let cursor: string | undefined;
      for (;;) {
        let query = this.owner.collection(collection).orderBy(FieldPath.documentId()).limit(400);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        for (const doc of page.docs) {
          this.assertReferenceNamespace(doc.data());
          records.push({ collection, id: doc.id, data: encode(doc.data()) });
        }
        if (page.size < 400) break;
        cursor = page.docs[page.docs.length - 1].id;
      }
    }
    return records;
  }
  async scanObjects(): Promise<EvidenceObject[]> {
    const objects: EvidenceObject[] = [];
    let query: GetFilesOptions | null = { prefix: `users/${this.identity.uid}/`, autoPaginate: false, maxResults: 400 };
    while (query) {
      const result: GetFilesResponse = await this.bucket.getFiles(query);
      const [files,next] = result;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const generation = String(metadata.generation);
        if (!generation || generation === 'undefined') throw new Error('Missing evidence generation');
        const [bytes] = await this.bucket.file(file.name, { generation }).download({ validation: 'crc32c' });
        objects.push({ path: file.name, generation, contentType: metadata.contentType ?? 'application/octet-stream', bytes: bytes.toString('base64'), sha256: bytesDigest(bytes.toString('base64')) });
      }
      query = next ?? null;
    }
    return objects;
  }
  async putRecord(record: LedgerRecord) {
    const ref = this.owner.collection(record.collection).doc(record.id);
    await this.db.runTransaction(async tx => {
      const prior = await tx.get(ref);
      if (prior.exists) {
        if (digest(encode(prior.data())) !== digest(record.data)) throw new Error('Conflicting destination record');
      } else tx.create(ref, decode(record.data,this.db) as FirebaseFirestore.DocumentData);
    });
  }
  async putObject(object: EvidenceObject) {
    const file = this.bucket.file(object.path);
    try {
      await file.save(Buffer.from(object.bytes,'base64'), { resumable: false, validation: 'crc32c', contentType: object.contentType, preconditionOpts: { ifGenerationMatch: 0 } });
    } catch (error) {
      if ((error as { code?: number }).code !== 412) throw error;
      const [metadata] = await file.getMetadata();
      const [bytes] = await this.bucket.file(object.path,{ generation: String(metadata.generation) }).download({ validation: 'crc32c' });
      if (bytesDigest(bytes.toString('base64')) !== object.sha256 || metadata.contentType !== object.contentType) throw new Error('Conflicting destination evidence');
    }
  }
}
