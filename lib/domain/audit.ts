import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { AuthContext } from '@/lib/auth/authenticateRequest';

export function auditRecord(auth: AuthContext, entityType: string, entityId: string,
  operationType: 'CREATE' | 'UPDATE' | 'DELETE', previousValues?: unknown, newValues?: unknown, reason?: string) {
  return {
    entityType, entityId, operationType, operationDatetime: FieldValue.serverTimestamp(),
    operatorId: auth.actorId, actorType: auth.actorType, actorId: auth.actorId,
    agentConnectionId: auth.actorType === 'agent' ? auth.actorId : null,
    ...(previousValues !== undefined ? { previousValues } : {}),
    ...(newValues !== undefined ? { newValues } : {}),
    ...(reason ? { reason } : {}),
  };
}

export function auditRef(auth: AuthContext) {
  return getFirestore().collection('users').doc(auth.userId).collection('auditLog').doc();
}
