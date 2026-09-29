import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeAdminApp } from '@/lib/firebase/admin';
import { resolveAgentToken } from './agentTokens';
import { resolveOAuthAccessToken } from './oauth';
import { AGENT_SCOPES, type AgentScope } from './scopes';

export interface AuthContext {
  userId: string;
  actorType: 'user' | 'agent';
  actorId: string;
  scopes: AgentScope[];
}

export class ApiError extends Error {
  constructor(public code: string, public status: number, message = code) { super(message); }
}

export async function authenticateRequest(req: NextRequest): Promise<AuthContext> {
  const match = /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!match) throw new ApiError('UNAUTHORIZED', 401);
  initializeAdminApp();
  const token = match[1];
  if (token.startsWith('otk_')) {
    const connection = await resolveAgentToken(token);
    if (!connection) throw new ApiError('UNAUTHORIZED', 401);
    return { userId: connection.userId, actorType: 'agent', actorId: connection.id, scopes: connection.scopes };
  }
  if (token.startsWith('ota_')) {
    const grant = await resolveOAuthAccessToken(token);
    if (!grant) throw new ApiError('UNAUTHORIZED', 401);
    return { userId: grant.connection.userId, actorType: 'agent', actorId: grant.connection.id, scopes: grant.scopes };
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { userId: decoded.uid, actorType: 'user', actorId: decoded.uid, scopes: [...AGENT_SCOPES] };
  } catch { throw new ApiError('UNAUTHORIZED', 401); }
}

export function requireScope(auth: AuthContext, scope: AgentScope) {
  if (auth.actorType === 'agent' && !auth.scopes.includes(scope)) throw new ApiError('SCOPE_DENIED', 403);
}

export function requireUser(auth: AuthContext) {
  if (auth.actorType !== 'user') throw new ApiError('USER_REQUIRED', 403);
}

export function apiErrorResponse(error: unknown): Response {
  const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const status = error instanceof ApiError ? error.status :
    code === 'Unauthorized' ? 401 : /not found/i.test(code) ? 404 : /invalid|required|unbalanced|scope/i.test(code) ? 400 : 500;
  if (status >= 500) {
    console.error('OpenTax API error:', error);
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, { status });
  }
  return Response.json({ error: { code, message: error instanceof Error ? error.message : code } }, { status });
}
