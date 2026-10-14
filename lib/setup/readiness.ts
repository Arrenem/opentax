import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Reserved synthetic fixtures only. No business records are changed or deleted.
export async function checkRuntime(ownerUid: string, runId: string) {
  const owner = createHash('sha256').update(ownerUid).digest('hex').slice(0, 24);
  const id = `${owner}-${runId}`;
  const value = { kind: 'opentax-setup-check', version: 1, id };
  const matches = (data: FirebaseFirestore.DocumentData | undefined) => data?.kind === value.kind && data?.version === value.version && data?.id === value.id && Object.keys(data).length === 3;
  const bytes = Buffer.from(JSON.stringify(value));
  const db = getFirestore(), bucket = getStorage().bucket();
  const checks: Record<string, string> = {};
  const ensureDoc = async (name: string) => {
    const ref = db.collection('_opentaxSetupChecks').doc(name);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) tx.create(ref, value);
      else if (!matches(snap.data())) throw new Error('CHECK_FIXTURE_CONFLICT');
    });
    if (!matches((await ref.get()).data())) throw new Error('CHECK_DATABASE_FAILED');
  };
  const ensureFile = async (name: string, body: Buffer) => {
    const file = bucket.file(`opentax-setup/${id}/${name}.json`);
    try { await file.save(body, { contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 } }); }
    catch (error) { if ((error as { code?: number }).code !== 412) throw error; }
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== body.length) throw new Error('CHECK_FIXTURE_CONFLICT');
    const [stored] = await file.download();
    if (!stored.equals(body)) throw new Error('CHECK_FIXTURE_CONFLICT');
    return file;
  };
  await ensureDoc(id); checks.database = 'passed';
  const file = await ensureFile('original', bytes);
  const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 60000 });
  if (new URL(url).protocol !== 'https:' || new URL(url).hostname !== 'storage.googleapis.com') throw new Error('CHECK_SIGNED_URL_INVALID');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok || (await response.text()) !== bytes.toString()) throw new Error('CHECK_SIGNED_READ_FAILED');
  checks.evidence = 'passed';
  const [backup] = await file.download();
  await ensureFile('restored', backup); await ensureDoc(`${id}-restored`);
  checks.syntheticRestore = 'passed';
  return { checks, fixtureId: id, fullAccountingRestore: 'not-tested' };
}
