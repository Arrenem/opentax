import { getFirestore } from 'firebase-admin/firestore';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { idempotentCreate } from '@/lib/domain/idempotency';
import { auditRecord, auditRef } from '@/lib/domain/audit';
import type { FixedAsset } from '@/types';

function col(userId: string) { return getFirestore().collection('users').doc(userId).collection('fixedAssets'); }
function clean(body: Record<string, unknown>, partial = false) {
  const result: Record<string, unknown> = {};
  for (const key of ['name', 'acquiredOn', 'note']) if (body[key] !== undefined || !partial) result[key] = String(body[key] ?? '').trim();
  for (const key of ['acquisitionCost', 'usefulLifeYears', 'businessUseRatio', 'accumulatedDepreciation']) {
    if (body[key] !== undefined || !partial) {
      const n = Number(body[key] ?? (key === 'businessUseRatio' ? 100 : 0));
      if (!Number.isFinite(n) || n < 0 || key === 'businessUseRatio' && n > 100 ||
          key === 'usefulLifeYears' && (!Number.isInteger(n) || n < 1) ||
          key === 'acquisitionCost' && n <= 0) throw new ApiError('INVALID_ASSET', 400);
      result[key] = n;
    }
  }
  if (body.method !== undefined || !partial) {
    if (!['straight_line', 'immediate', 'lump_sum', 'none'].includes(String(body.method ?? 'straight_line'))) throw new ApiError('INVALID_ASSET_METHOD', 400);
    result.method = body.method ?? 'straight_line';
  }
  if (body.isDisposed !== undefined || !partial) result.isDisposed = Boolean(body.isDisposed ?? false);
  if ((!partial || body.name !== undefined) && !result.name) throw new ApiError('INVALID_ASSET', 400);
  if (!partial || body.acquiredOn !== undefined) {
    const date = String(result.acquiredOn);
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
      throw new ApiError('INVALID_ASSET', 400);
  }
  return result;
}
export async function listAssets(auth: AuthContext) {
  const snap = await col(auth.userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FixedAsset));
}
export async function createAsset(auth: AuthContext, body: Record<string, unknown>) {
  return idempotentCreate(auth, 'assets:create', body.idempotencyKey as string | undefined, clean(body), 'fixedAssets');
}
export async function updateAsset(auth: AuthContext, id: string, body: Record<string, unknown>) {
  const ref = col(auth.userId).doc(id); const snap = await ref.get();
  if (!snap.exists) throw new ApiError('ASSET_NOT_FOUND', 404);
  const patch = clean(body, true);
  const batch = getFirestore().batch(); const log = auditRef(auth);
  batch.update(ref, patch); batch.set(log, { id: log.id, ...auditRecord(auth, 'fixedAssets', id, 'UPDATE', snap.data(), patch) });
  await batch.commit();
}
export async function replaceAssets(auth: AuthContext, assets: FixedAsset[]) {
  if (!Array.isArray(assets) || assets.length > 200) throw new ApiError('INVALID_ASSETS', 400);
  const db = getFirestore(); const batch = db.batch(); const previous = await col(auth.userId).get();
  previous.docs.forEach((d) => batch.delete(d.ref));
  for (const asset of assets) {
    const ref = asset.id ? col(auth.userId).doc(asset.id) : col(auth.userId).doc();
    batch.set(ref, { ...clean(asset as unknown as Record<string, unknown>), id: ref.id });
  }
  await batch.commit();
  return assets;
}
