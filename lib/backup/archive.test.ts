import { describe, expect, it } from 'vitest';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createArchive, restoreArchive, validateArchive, bytesDigest, digest, type LedgerAdapter, type LedgerRecord, type EvidenceObject, type Archive } from './archive';
import { encode, decode } from './codec';

class MemoryAdapter implements LedgerAdapter {
  identity = { projectId: 'source', databaseId: '(default)', bucket: 'source-bucket', uid: 'owner' };
  records: LedgerRecord[] = [];
  objects: EvidenceObject[] = [];
  lock = false; running = false; marker = ''; failAfter = Infinity; writes = 0;
  onScan?: () => void;
  async exclusive(_operation: 'snapshot' | 'restore', hash?: string) {
    if (this.running || (this.lock && this.marker !== hash)) throw new Error('Locked');
    this.lock = this.running = true;
    return { assertHeld: async () => { if (!this.lock) throw new Error('Lost lock'); }, finish: async (success: boolean) => { this.running = false; if (success || _operation === 'snapshot') this.lock = false; } };
  }
  async assertRestoreIsolation() {}
  async scanRecords() { this.onScan?.(); return structuredClone(this.records); }
  async scanObjects() { return structuredClone(this.objects); }
  async isResume(hash: string) { return this.marker === hash; }
  async markRestore(hash: string) { this.marker = hash; }
  async putRecord(r: LedgerRecord) { if (this.writes++ >= this.failAfter) throw new Error('Interrupted'); if (!this.records.some(x => x.collection === r.collection && x.id === r.id)) this.records.push(structuredClone(r)); }
  async putObject(o: EvidenceObject) { if (!this.objects.some(x => x.path === o.path)) this.objects.push({ ...o, generation: 'new-generation' }); }
}
function target() { const t = new MemoryAdapter(); t.identity = { ...t.identity, projectId: 'target', bucket: 'target-bucket' }; return t; }
function row(collection: LedgerRecord['collection'], id: string, data: unknown): LedgerRecord { return { collection,id,data:encode(data) }; }
function reseal(a: Archive) { const { sha256, ...p } = a; void sha256; a.sha256 = digest(p); return a; }
function source() {
  const a = new MemoryAdapter();
  a.records = [row('customers','c',{ name: 'customer' }), row('projects','p',{ customerId:'c' }), row('issuedDocuments','i',{ projectId:'p',customerId:'c',linkedJournalIds:['j'] }), row('journals','j',{ evidenceIds:['e'],sourceDocumentId:'i',isCurrent:false,isDeleted:true }), row('documents','e',{ fileName:'users/owner/documents/e', fileSizeBytes:3,linkedJournalIds:['j'],projectId:'p',isDeleted:true }), row('fixedAssets','f',{}), row('userSettings','settings',{}), row('taxFilings','2024',{}),row('billingCounters','invoice_2024-01',{}),row('auditLog','a',{journalId:'j',previousValues:{isDeleted:false}}),row('idempotency','k',{journalId:'j'})];
  a.objects = [{path:'users/owner/documents/e',generation:'1',contentType:'application/pdf',bytes:Buffer.from('pdf').toString('base64'),sha256:bytesDigest(Buffer.from('pdf').toString('base64'))}];
  return a;
}
describe('full ledger archive', () => {
  it('roundtrips all eleven collections, historical/deleted rows and binary data', async () => {
    const archive = await createArchive(source()); const dest = target();
    await restoreArchive(dest,JSON.parse(JSON.stringify(archive)),{isolatedTarget:true});
    expect(dest.records).toEqual(archive.records); expect(dest.objects[0].bytes).toBe(archive.objects[0].bytes); expect(dest.lock).toBe(false);
    await restoreArchive(dest,archive,{isolatedTarget:true}); expect(dest.records).toHaveLength(11);
  });
  it('has no search/API or write-batch count truncation', async () => {
    const s = source();
    for (let n=0;n<1201;n++) s.records.push(row('journals',`history-${n}`,{isCurrent:false,isDeleted:true,version:n}));
    for (let n=0;n<251;n++) { const path=`users/owner/documents/e-${n}`; s.objects.push({...s.objects[0],path}); s.records.push(row('documents',`e-${n}`,{fileName:path})); }
    const archive=await createArchive(s); const dest=target(); await restoreArchive(dest,archive,{isolatedTarget:true});
    expect(dest.records).toHaveLength(1463); expect(dest.objects).toHaveLength(252);
  });
  it('resumes interrupted staging idempotently with gate held', async () => {
    const a=await createArchive(source()); const t=target();t.failAfter=4;
    await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow('Interrupted'); expect(t.lock).toBe(true);
    t.failAfter=Infinity;await restoreArchive(t,a,{isolatedTarget:true});expect(t.records).toHaveLength(11);expect(t.lock).toBe(false);
  });
  it('rejects changed or unrelated data on resume', async () => {
    const a=await createArchive(source()); const t=target();t.failAfter=1;
    await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow();
    t.records.push(row('journals','intruder',{}));t.failAfter=Infinity;
    await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow('Unrelated');expect(t.lock).toBe(true);
  });
  it('refuses nonempty target, wrong UID, and same project or bucket', async () => {
    const a=await createArchive(source());
    for (const patch of [{uid:'other'},{projectId:'source'},{bucket:'source-bucket'}]) { const t=target();Object.assign(t.identity,patch);await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow('isolated');expect(t.writes).toBe(0); }
    const t=target();t.records.push(row('journals','old',{}));await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow('not empty');expect(t.writes).toBe(0);
  });
  it('rejects manifest, object corruption, missing files, collections and dangling graph', async () => {
    const a=await createArchive(source());
    const bad=structuredClone(a);bad.records[0].id='modified';expect(()=>validateArchive(bad)).toThrow('checksum');
    const badBytes=structuredClone(a);badBytes.objects[0].bytes='AAAA';expect(()=>validateArchive(reseal(badBytes))).toThrow('checksum');
    const missing=structuredClone(a);missing.objects=[];expect(()=>validateArchive(reseal(missing))).toThrow('Missing');
    const missingRow=structuredClone(a);missingRow.records=missingRow.records.filter(r=>r.collection!=='journals');expect(()=>validateArchive(reseal(missingRow))).toThrow();
    const inventory=structuredClone(a);inventory.collections=[];expect(()=>validateArchive(reseal(inventory))).toThrow('inventory');
    const auth=structuredClone(a);auth.records.push({collection:'oauthTokens' as never,id:'secret',data:encode({})});expect(()=>validateArchive(reseal(auth))).toThrow('Invalid');
  });
  it('preserves legacy hard-deletion audit/idempotency targets explicitly', async () => {
    const s=source();s.records.push(row('auditLog','asset-history',{entityType:'fixedAssets',entityId:'deleted-asset',previousValues:{name:'Old asset'}}),row('idempotency','asset-create',{id:'deleted-asset'}));
    const a=await createArchive(s);expect(a.historicalMissingReferences).toEqual(['auditLog/asset-history -> fixedAssets/deleted-asset','idempotency/asset-create -> result/deleted-asset']);
    const t=target();await restoreArchive(t,a,{isolatedTarget:true});expect(t.records).toHaveLength(13);
  });
  it('retains orphan evidence bytes with an explicit integrity-protected inventory', async () => {
    const s=source();s.objects.push({...s.objects[0],path:'users/owner/documents/orphan'});
    const a=await createArchive(s);expect(a.orphanEvidencePaths).toEqual(['users/owner/documents/orphan']);
    a.orphanEvidencePaths=[];expect(()=>validateArchive(reseal(a))).toThrow('Orphan');
  });
  it('checks record IDs, owner binding and reciprocal active links', async () => {
    for (const replacement of [row('documents','e',{id:'wrong',fileName:'users/owner/documents/e'}),row('documents','e',{uploadedBy:'other',fileName:'users/owner/documents/e'})]) {
      const s=source();s.records=s.records.map(r=>r.collection==='documents'?replacement:r);await expect(createArchive(s)).rejects.toThrow();
    }
    const s=source();s.records=s.records.map(r=>r.collection==='journals'?row('journals','j',{isCurrent:true,isDeleted:false,evidenceIds:[]}):r);await expect(createArchive(s)).rejects.toThrow('Nonreciprocal');
  });
  it('detects an unmanaged concurrent snapshot mutation', async () => {
    const s=source();let scans=0;s.onScan=()=>{if (++scans===2)s.records.push(row('journals','new',{}));};await expect(createArchive(s)).rejects.toThrow('changed');expect(s.lock).toBe(false);
  });
  it('rejects concurrent restore runners', async () => {
    const a=await createArchive(source());const t=target();const first=restoreArchive(t,a,{isolatedTarget:true});await expect(restoreArchive(t,a,{isolatedTarget:true})).rejects.toThrow('Locked');await first;
  });
});
describe('lossless tagged Firestore codec',()=>{
  it('preserves nanoseconds, geopoints, bytes, int64, exceptional numbers and literal tags',()=>{
    const data={time:new Timestamp(1700000000,123456789),geo:new GeoPoint(35,139),bytes:Buffer.from([0,255]),integer:BigInt('9223372036854775807'),number:NaN,negativeZero:-0,infinity:Infinity,literal:{t:'timestamp',seconds:1},nested:[null,true,'文字']};
    const result=decode(JSON.parse(JSON.stringify(encode(data)))) as typeof data;
    expect(result).toEqual(data);expect(result.time.nanoseconds).toBe(123456789);expect(Object.is(result.negativeZero,-0)).toBe(true);
  });
  it('rejects malformed or lossy input before a restore can write',()=>{
    for (const value of [{t:'integer',v:12},{t:'integer',v:'9223372036854775808'},{t:'number',v:'9007199254740993'},{t:'number',v:'1e999'},{t:'map',v:[['z',{t:'null'}],['a',{t:'null'}]]},{t:'map',v:[['a',{t:'null'},'extra']]},{t:'boolean',v:true,extra:1}]) expect(()=>decode(value as never)).toThrow();
  });
  it('fails rather than dropping undefined and unknown SDK types',()=>{expect(()=>encode({a:undefined})).toThrow('Unsupported');expect(()=>encode(new Set([1]))).toThrow('Unsupported');});
});
