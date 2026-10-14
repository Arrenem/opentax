import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Persistent, fail-closed exclusion. No clock or TTL can prove a crashed writer is gone. */
export class LedgerMaintenanceError extends Error {
  readonly code = 'LEDGER_MAINTENANCE';
  readonly status = 503;
  constructor(message = 'Ledger maintenance is in progress', public readonly token?: string) { super(message); }
}
interface Gate {
  maintenance?: { token: string; operation: string; startedAt: string };
  writers?: Record<string, string>;
}
const contexts = new AsyncLocalStorage<{ userId: string; active: boolean }>();
function gateRef(db: Firestore, userId: string) {
  if (!userId || userId.includes('/')) throw new Error('Invalid ledger user ID');
  return db.collection('users').doc(userId).collection('_maintenance').doc('ledger');
}

/** Hold through ALL writes, including Storage uploads and awaited rollback cleanup. */
export async function withLedgerWrite<T>(userId: string, work: () => Promise<T>, db = getFirestore()): Promise<T> {
  const parent = contexts.getStore();
  if (parent?.active && parent.userId === userId) return work();
  const ref = gateRef(db, userId); const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as Gate | undefined;
    if (data?.maintenance) throw new LedgerMaintenanceError();
    tx.set(ref, { writers: { ...data?.writers, [token]: new Date().toISOString() } });
  });
  const context = { userId, active: true };
  try { return await contexts.run(context, work); }
  finally {
    context.active = false;
    // A failed release intentionally leaves the lease behind. Never claim a safe snapshot then.
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as Gate | undefined;
      if (!data?.writers?.[token]) throw new LedgerMaintenanceError('Writer lease disappeared');
      const writers = { ...data.writers }; delete writers[token];
      tx.set(ref, { ...data, writers });
    });
  }
}

/** Acquire first, then drain. A timeout leaves the persistent gate closed for recovery. */
export async function acquireLedgerMaintenance(db: Firestore, userId: string, operation: string,
  resumeToken?: string, drainTimeoutMs = 30_000): Promise<string> {
  const ref = gateRef(db, userId); const token = resumeToken ?? randomUUID();
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as Gate | undefined;
    if (resumeToken) {
      if (data?.maintenance?.token !== token || data.maintenance.operation !== operation)
        throw new LedgerMaintenanceError('Maintenance ownership mismatch');
    } else {
      if (data?.maintenance) throw new LedgerMaintenanceError();
      tx.set(ref, { ...data, maintenance: { token, operation, startedAt: new Date().toISOString() } });
    }
  });
  const deadline = Date.now() + drainTimeoutMs;
  while (true) {
    const data = (await ref.get()).data() as Gate | undefined;
    if (data?.maintenance?.token !== token) throw new LedgerMaintenanceError('Maintenance ownership lost', token);
    if (!Object.keys(data.writers ?? {}).length) return token;
    if (Date.now() >= deadline) throw new LedgerMaintenanceError('Writers did not drain; gate remains closed. Reconcile stopped writers before recovery.', token);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
export async function assertLedgerMaintenance(db: Firestore, userId: string, token: string): Promise<void> {
  const data = (await gateRef(db, userId).get()).data() as Gate | undefined;
  if (data?.maintenance?.token !== token || Object.keys(data.writers ?? {}).length)
    throw new LedgerMaintenanceError('Maintenance ownership lost or writers remain', token);
}
export async function releaseLedgerMaintenance(db: Firestore, userId: string, token: string): Promise<void> {
  const ref = gateRef(db, userId);
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as Gate | undefined;
    if (data?.maintenance?.token !== token || Object.keys(data.writers ?? {}).length)
      throw new LedgerMaintenanceError('Cannot release maintenance: ownership mismatch or writers remain', token);
    tx.set(ref, { writers: {} });
  });
}
