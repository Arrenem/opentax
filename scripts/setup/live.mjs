import path from 'node:path';
import { command, cloudTransport } from './transport.mjs';
import { sourceRevision, prepareDeploymentSource } from './source.mjs';
import { createExecution, executeSteps, validateExecutionBinding } from './executor.mjs';
import { readExecution, writeExecution, privateDirectory } from './execution-state.mjs';
import { provisioningSteps } from './cloud.mjs';
import { deploymentSteps } from './deployment.mjs';
import { browserCredential, validateGoogleIdentity } from './browser.mjs';
import { verifySetup } from './verify.mjs';

export async function runLiveSetup({ plan, directory, consent, announce, verifyOnly = false }) {
  const root = process.cwd(); directory = path.resolve(directory);
  const revision = await sourceRevision(root);
  let state = await readExecution(directory);
  if (!state) {
    if (verifyOnly) throw new Error('NO_EXECUTION_TO_VERIFY');
    state = createExecution(plan, revision); await writeExecution(directory, state);
  }
  validateExecutionBinding(plan, state, revision);
  const inputs = await prepareDeploymentSource(root, directory, revision);
  const save = s => writeExecution(directory, s);
  const cloudDir = path.join(directory, 'gcloud');
  await privateDirectory(cloudDir);
  await privateDirectory(path.join(directory, 'firebase-cli'));
  const environment = { ...process.env, CLOUDSDK_CONFIG: cloudDir, GOOGLE_APPLICATION_CREDENTIALS: path.join(cloudDir, 'application_default_credentials.json'), CLOUDSDK_CORE_DISABLE_PROMPTS: '1', XDG_CONFIG_HOME: path.join(directory, 'firebase-cli') };
  for (const key of ['FIREBASE_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT']) delete environment[key];
  const run = (program, args, options = {}) => command(program, args, { ...options, env: { ...options.env, ...environment } });
  const api = cloudTransport({ account: plan.config.googleAccount, projectId: plan.config.projectId, run });
  if (!(await consent({ id: 'google-login', action: `Google sign-in as ${plan.config.googleAccount}. gcloud stores login and ADC credentials inside ignored .opentax/gcloud; future runs can use these credentials only after a fresh confirmation. Existing global credentials are not replaced.` }))) throw new Error('CONSENT_DECLINED');
  await run('gcloud', ['auth', 'login', plan.config.googleAccount, '--update-adc', '--brief'], { interactive: true });
  const accounts = JSON.parse(await api.gcloud(['auth', 'list', '--format=json']));
  if (!accounts.some(a => a.account === plan.config.googleAccount)) throw new Error('GOOGLE_ACCOUNT_MISMATCH');
  const { build } = await import('esbuild');
  const bundle = async contents => (await build({ stdin: { contents, resolveDir: root }, bundle: true, platform: 'browser', write: false, format: 'iife', logLevel: 'silent' })).outputFiles[0].text;
  let ownerToken;
  const login = async (sdk, email) => {
    const token = await browserCredential({ sdk, announce, bundle });
    const identity = await validateGoogleIdentity(token, sdk, email);
    return { ...identity, token };
  };
  const signIn = { currentToken: () => ownerToken, owner: async (sdk, email) => { const identity = await login(sdk, email); ownerToken = identity.token; return { uid: identity.uid }; } };
  const source = async () => inputs.directory;
  const steps = [...await provisioningSteps({ plan, api, inputs, directory, state, signIn, run }), ...deploymentSteps({ plan, api, state, directory, source })];
  if (verifyOnly) {
    if (!state.resources.instanceUrl) throw new Error('DEPLOYMENT_NOT_READY');
    for (const step of steps.filter(s => s.id !== 'owner')) {
      const result = await step.inspect(state);
      if (!result.ready || result.conflict) throw new Error('REMOTE_STATE_NOT_READY');
    }
    if (!(await consent({ id: 'owner-login', action: 'Sign in again as the configured owner to check application access.' }))) throw new Error('CONSENT_DECLINED');
    const identity = await signIn.owner(state.resources.sdk, plan.config.googleAccount);
    if (identity.uid !== state.resources.ownerUid) throw new Error('OWNER_UID_MISMATCH');
  } else await executeSteps({ plan, state, revision, steps, consent, save, poll: api.poll });
  const verification = await verifySetup({ url: state.resources.instanceUrl, sdk: state.resources.sdk, ownerUid: state.resources.ownerUid, ownerToken, runId: state.installationId, consent, signIn: sdk => login(sdk),
    mcpToken: () => browserCredential({ mode: 'token', announce }),
    mcpRead: async (url, token) => {
      const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
      const client = new Client({ name: 'opentax-setup-check', version: '1' });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
        const result = await client.callTool({ name: 'get_business_context', arguments: {} });
        return result.isError !== true;
      } finally { await client.close(); }
    },
  });
  state.verification = { ...verification, checkedAt: new Date().toISOString() }; await save(state);
  return { provisioned: true, instanceUrl: state.resources.instanceUrl, mcpUrl: `${state.resources.instanceUrl}/api/mcp`, ...state.verification };
}
