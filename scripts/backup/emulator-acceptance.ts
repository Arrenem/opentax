/** Synthetic-only acceptance: run against explicitly configured loopback emulators. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { FirebaseLedgerAdapter } from '../../lib/backup/firebaseAdapter';
import { createArchive, restoreArchive, COLLECTIONS, digest } from '../../lib/backup/archive';
import { withLedgerWrite } from '../../lib/backup/writeGate';
import { buildPL, buildBS, buildMonthlySummaries } from '../../lib/accounting/reports';
import { DEFAULT_USER_SETTINGS, type JournalEntry } from '../../types';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
const uid = 'synthetic-ledger-owner';
const suffix = Date.now().toString(36);
function target(name: string) {
  const projectId = `demo-backup-${name}-${suffix}`;
  assert.ok(projectId.startsWith('demo-'));
  const bucketName = `${projectId}.appspot.com`;
  const app = initializeApp({ projectId, storageBucket: bucketName }, name);
  const db = getFirestore(app); db.settings({ useBigInt: true });
  const bucket = getStorage(app).bucket();
  const adapter = new FirebaseLedgerAdapter(db, bucket, { projectId, databaseId: '(default)', bucket: bucketName, uid });
  return { app, db, bucket, adapter, projectId, owner: db.doc(`users/${uid}`) };
}
const source = target('source'), destination = target('destination'), corruptTarget = target('corrupt'), nonempty = target('nonempty');
const all = [source, destination, corruptTarget, nonempty];
try {
  const timestamp = new Timestamp(1791936000, 123456000);
  const rows: Array<[string, Record<string, unknown>]> = [];
  for (let i = 0; i < 507; i++) rows.push([`journals/j${String(i).padStart(4,'0')}`, {
    fiscalYear: 2026, fiscalMonth: 10, date: '2026-10-14', debitAccount: 'BANK', creditAccount: 'SALES',
    debitAmount: i + 1, creditAmount: i + 1, isCurrent: i !== 506, isDeleted: i === 505, status: 'confirmed',
    createdAt: timestamp, evidenceIds: i < 205 ? [`d${i}`] : [],
    ...(i === 506 ? { previousVersionId: 'j0000', originalJournalId: 'j0000' } : {}),
  }]);
  for (let i = 0; i < 205; i++) {
    const bytes = Buffer.from(`synthetic-evidence-${i}\u0000\ufffd`);
    const path = `users/${uid}/documents/d${i}`;
    await source.bucket.file(path).save(bytes, { resumable: false, contentType: 'application/octet-stream' });
    rows.push([`documents/d${i}`, { fileName: path, fileSizeBytes: bytes.length, linkedJournalIds: [`j${String(i).padStart(4,'0')}`], projectId: 'p1' }]);
  }
  rows.push(['customers/c1', { name: 'Synthetic customer' }], ['projects/p1', { customerId: 'c1' }],
    ['issuedDocuments/i1', { customerId: 'c1', projectId: 'p1', linkedJournalIds: ['j0000'] }],
    ['billingCounters/2026', { next: 9 }], ['fixedAssets/a1', { name: 'Synthetic asset', acquisitionCost: 200000 }],
    ['userSettings/settings', { ...DEFAULT_USER_SETTINGS, precision: timestamp, exactInteger: BigInt("9223372036854775807"), binary: Buffer.from([0,255,128,1]),
      location: new GeoPoint(35,139), journalRef: source.owner.collection('journals').doc('j0000'), nested: [{ t: 'timestamp', v: 'plain map' }] }],
    ['taxFilings/2026', { deductions: { socialInsurance: 15000 } }],
    ['auditLog/log1', { journalId: 'j0000', entityType: 'journals', entityId: 'j0000' }],
    ['idempotency/key1', { journalId: 'j0000', id: 'j0000' }]);
  for (let offset=0; offset<rows.length; offset+=400) {
    const batch=source.db.batch();
    rows.slice(offset,offset+400).forEach(([path,data])=>batch.create(source.owner.collection(path.split('/')[0]).doc(path.split('/')[1]),data));
    await batch.commit();
  }
  const archive = await createArchive(source.adapter);
  assert.equal(archive.records.length,721); assert.equal(archive.objects.length,205);
  assert.equal(archive.records.filter(r=>r.collection==='journals').length,507);
  for (const collection of COLLECTIONS) assert.ok(archive.records.some(r=>r.collection===collection));
  console.log('PASS: snapshot covers 721 documents, 507 journals, 205 evidence objects, all 11 collections');
  const corrupt = structuredClone(archive); corrupt.records[0].id += '-corrupt';
  await assert.rejects(restoreArchive(corruptTarget.adapter,corrupt,{isolatedTarget:true}),/checksum/);
  assert.equal((await corruptTarget.owner.listCollections()).length,0);
  assert.equal((await corruptTarget.adapter.scanObjects()).length,0);
  await nonempty.owner.collection('customers').doc('unrelated').set({keep:true});
  await assert.rejects(restoreArchive(nonempty.adapter,archive,{isolatedTarget:true}),/not empty/);
  assert.deepEqual((await nonempty.owner.collection('customers').doc('unrelated').get()).data(),{keep:true});
  console.log('PASS: corrupt archive refused without mutation; unrelated target refused');
  const accessTarget = target('access'), otherOwner = target('otherowner'), foreignBucket = target('bucket'), nested = target('nested');
  all.push(accessTarget, otherOwner, foreignBucket, nested);
  await accessTarget.db.collection('agentConnections').doc('synthetic-access').set({ active: true, userId: uid });
  await assert.rejects(restoreArchive(accessTarget.adapter,archive,{isolatedTarget:true}),/unrelated root collections or access grants/);
  assert.equal((await accessTarget.adapter.scanRecords()).length,0);
  assert.equal((await accessTarget.db.collection('agentConnections').doc('synthetic-access').get()).data()?.active,true);
  await otherOwner.db.doc('users/unrelated-owner/customers/c1').set({synthetic:true});
  await assert.rejects(restoreArchive(otherOwner.adapter,archive,{isolatedTarget:true}),/unrelated owner/);
  await foreignBucket.bucket.file('unrelated-evidence').save(Buffer.from('synthetic'),{resumable:false});
  await assert.rejects(restoreArchive(foreignBucket.adapter,archive,{isolatedTarget:true}),/unrelated objects/);
  const orphanRef=nested.owner.collection('journals').doc('missing-parent');
  await orphanRef.collection('children').doc('synthetic-child').set({synthetic:true});
  assert.equal((await orphanRef.get()).exists,false);
  await assert.rejects(createArchive(nested.adapter),/Nested ledger collections/);
  console.log('PASS: active access root, unrelated other owner/bucket, and missing-parent nested collection refused');

  const original = destination.adapter.putRecord.bind(destination.adapter); let count=0;
  destination.adapter.putRecord = async record => { if(++count===31) throw new Error('Synthetic interruption'); await original(record); };
  await assert.rejects(restoreArchive(destination.adapter,archive,{isolatedTarget:true}),/Synthetic interruption/);
  assert.equal((await destination.adapter.scanRecords()).length,30);
  await assert.rejects(withLedgerWrite(uid,async()=>{},destination.db),/maintenance/i);
  destination.adapter.putRecord = original;
  await restoreArchive(destination.adapter,archive,{isolatedTarget:true});
  await withLedgerWrite(uid,async()=>{},destination.db);
  console.log('PASS: interruption retains write gate; same archive resumes and releases gate');
  const restored = await createArchive(destination.adapter);
  assert.deepEqual(restored.records,archive.records);
  const objects = (value: typeof archive) => value.objects.map(object=>({path:object.path,contentType:object.contentType,bytes:object.bytes,sha256:object.sha256}));
  assert.deepEqual(objects(restored),objects(archive));
  const decoded=(await destination.owner.collection('userSettings').doc('settings').get()).data()!;
  assert.equal(decoded.precision.seconds,timestamp.seconds); assert.equal(decoded.precision.nanoseconds,timestamp.nanoseconds);
  assert.equal(decoded.exactInteger,BigInt("9223372036854775807"));
  assert.deepEqual(decoded.binary,Buffer.from([0,255,128,1])); assert.equal(decoded.journalRef.firestore.projectId,destination.projectId);
  assert.equal(decoded.journalRef.path,`users/${uid}/journals/j0000`);
  async function reports(t: typeof source) {
    const reader = initializeApp({projectId:t.projectId}, `report-${t.projectId}`);
    const snap=await getFirestore(reader).doc(`users/${uid}`).collection('journals').where('isCurrent','==',true).where('isDeleted','==',false).get();
    const journals=snap.docs.map(d=>({id:d.id,...d.data()})) as JournalEntry[];
    await deleteApp(reader);
    return { pl:buildPL(journals,2026,DEFAULT_USER_SETTINGS),bs:buildBS(journals,2026),monthly:buildMonthlySummaries(journals,2026,DEFAULT_USER_SETTINGS) };
  }
  assert.deepEqual(await reports(destination),await reports(source));
  console.log('PASS: full inventory, binary evidence, Firestore types and reference rebinding, P&L/balance sheet/monthly reports match');
  console.log(JSON.stringify({result:'PASS',records:archive.records.length,journals:507,evidence:205,source:source.projectId,destination:destination.projectId,inventoryHash:digest(restored.records)}));
} finally { await Promise.all(all.map(t=>deleteApp(t.app))); }
