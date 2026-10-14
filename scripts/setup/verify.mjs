export async function verifySetup({ url, sdk, ownerUid, ownerToken, runId, consent, signIn, mcpToken, mcpRead, fetcher = fetch }) {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.run.app') || origin.pathname !== '/' || origin.search || origin.username || origin.password) throw new Error('VERIFY_ORIGIN_INVALID');
  const checks = { owner: 'not-run', anonymousDenied: 'not-run', database: 'not-run', evidence: 'not-run', syntheticRestore: 'not-run', otherOwnerDenied: 'not-run', mcpReadOnlyScopes: 'not-run', mcpRead: 'not-run', mcpScopeDenied: 'not-run' };
  const request = (path, token, options = {}) => fetcher(`${origin.origin}${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(60000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const owner = await request('/api/settings', ownerToken);
  checks.owner = owner.status === 200 ? 'passed' : 'failed';
  const anon = await request('/api/settings'); checks.anonymousDenied = anon.status === 401 ? 'passed' : 'failed';
  if (checks.owner !== 'passed') return { ready: false, checks, fullAccountingRestore: 'not-tested' };
  if (await consent({ id: 'runtime-check', action: 'Write/read reserved synthetic Firestore and evidence fixtures, sign/read a URL, and restore fixture copies. Keep fixtures; no business data deletion.' })) {
    const response = await request('/api/setup/readiness', ownerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, consent: 'WRITE_SYNTHETIC_SETUP_DATA' }) });
    if (response.ok) {
      const result = await response.json();
      for (const key of ['database', 'evidence', 'syntheticRestore']) checks[key] = result.checks?.[key] === 'passed' ? 'passed' : 'failed';
    } else for (const key of ['database', 'evidence', 'syntheticRestore']) checks[key] = 'failed';
  }
  if (await consent({ id: 'non-owner-check', action: 'Sign in with a DIFFERENT Google test account to verify owner denial. This can register that test identity in the Firebase project.' })) {
    const other = await signIn(sdk);
    if (other.uid === ownerUid) throw new Error('DIFFERENT_TEST_ACCOUNT_REQUIRED');
    const response = await request('/api/settings', other.token);
    checks.otherOwnerDenied = response.status === 403 ? 'passed' : 'failed';
  }
  if (await consent({ id: 'mcp-check', action: `Separately authorize/create a read-only agent token at ${origin.origin}/agent-connections, then provide it in the local browser. No token is created automatically or saved.` })) {
    const token = await mcpToken();
    if (!/^otk_[A-Za-z0-9_-]{40,}$/.test(token)) throw new Error('READ_ONLY_AGENT_TOKEN_REQUIRED');
    const access = await request('/api/setup/agent-access', token);
    const identity = await access.json();
    const readOnly = access.ok && identity.actorType === 'agent' && identity.userId === ownerUid && Array.isArray(identity.scopes) && identity.scopes.length === 1 && identity.scopes[0] === 'read';
    checks.mcpReadOnlyScopes = readOnly ? 'passed' : 'failed';
    if (readOnly) {
      checks.mcpRead = await mcpRead(`${origin.origin}/api/mcp`, token) ? 'passed' : 'failed';
      const denied = await request('/api/setup/agent-access?requiredScope=settings%3Awrite', token);
      const result = await denied.json();
      checks.mcpScopeDenied = denied.status === 403 && result.error?.code === 'SCOPE_DENIED' ? 'passed' : 'failed';
    }
  }
  return { ready: Object.values(checks).every(s => s === 'passed'), checks, fullAccountingRestore: 'not-tested', journalAcceptance: 'not-tested' };
}
