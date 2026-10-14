import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIREBASE_VERSION, command, sleep } from './transport.mjs';

export const REQUIRED_APIS = ['serviceusage.googleapis.com', 'firebase.googleapis.com', 'identitytoolkit.googleapis.com', 'firestore.googleapis.com', 'storage.googleapis.com', 'firebasestorage.googleapis.com', 'firebaserules.googleapis.com', 'firebasehosting.googleapis.com', 'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'iam.googleapis.com', 'iamcredentials.googleapis.com'];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const memberIn = (policy, role, member) => policy?.bindings?.some(b => b.role === role && !b.condition && b.members?.includes(member));
export function mergeBinding(policy, role, member) {
  const result = structuredClone(policy ?? { version: 1, bindings: [] });
  result.bindings ??= [];
  const binding = result.bindings.find(b => b.role === role && !b.condition);
  if (binding) binding.members = [...new Set([...binding.members, member])];
  else result.bindings.push({ role, members: [member] });
  return result; // retain etag and unrelated bindings; the server detects concurrent writes
}
export function publicConfig(sdk, projectId, bucket) {
  if (sdk.projectId !== projectId || !sdk.appId || !sdk.apiKey || !sdk.authDomain || !sdk.messagingSenderId) throw new Error('WEB_CONFIG_INVALID');
  const map = { API_KEY: sdk.apiKey, AUTH_DOMAIN: sdk.authDomain, PROJECT_ID: projectId, STORAGE_BUCKET: bucket, MESSAGING_SENDER_ID: sdk.messagingSenderId, APP_ID: sdk.appId };
  if (Object.values(map).some(v => typeof v !== 'string' || /[\r\n\x00]/.test(v))) throw new Error('WEB_CONFIG_INVALID');
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [`NEXT_PUBLIC_FIREBASE_${k}`, v]));
}

export async function provisioningSteps({ plan, api, inputs, directory, state, signIn, run = command, pause = sleep }) {
  const c = plan.config, p = c.projectId, region = c.region;
  const bucket = `${p}-opentax-evidence`;
  const runtime = `opentax-runtime@${p}.iam.gserviceaccount.com`, builder = `opentax-builder@${p}.iam.gserviceaccount.com`;
  const label = state.installationId;
  const crm = `https://cloudresourcemanager.googleapis.com/v1/projects/${p}`;
  const firebase = `https://firebase.googleapis.com/v1beta1/projects/${p}`;
  const iam = `https://iam.googleapis.com/v1/projects/${p}`;
  const auth = `https://identitytoolkit.googleapis.com/admin/v2/projects/${p}`;
  const database = `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)`;
  const storage = `https://storage.googleapis.com/storage/v1/b/${bucket}`;
  const get = url => api.request('GET', url);
  const write = async (method, url, body, track) => track(url, await api.request(method, url, body));
  const step = (id, preview, inspect, apply) => ({ id, preview: { project: p, ...preview }, inspect, apply });
  const expectedLabel = r => r?.labels?.['opentax-setup'] === label;
  const configDir = path.join(directory, 'firebase');
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const steps = [
    step('project', { action: 'Create a new dedicated project', resource: p, permissions: ['resourcemanager.projects.create'] }, async () => {
      const list = await get(`https://cloudresourcemanager.googleapis.com/v1/projects?filter=${encodeURIComponent(`id:${p}`)}`);
      const project = list?.projects?.find(item => item.projectId === p);
      return { ready: !!project && expectedLabel(project) && project.lifecycleState === 'ACTIVE', conflict: !!project && (!expectedLabel(project) || project.lifecycleState !== 'ACTIVE'), resources: project ? { projectNumber: String(project.projectNumber), bucket } : undefined };
    }, async (_s, track) => write('POST', 'https://cloudresourcemanager.googleapis.com/v1/projects', { projectId: p, name: 'OpenTax', labels: { 'opentax-setup': label } }, track)),
    step('billing', { action: 'Link billing; charges may accrue. No free or spending-cap guarantee.', resource: c.billingAccount, permissions: ['billing.resourceAssociations.create', 'resourcemanager.projects.createBillingAssignment'] }, async () => {
      const b = await get(`https://cloudbilling.googleapis.com/v1/projects/${p}/billingInfo`);
      return { ready: b?.billingEnabled === true && b.billingAccountName === `billingAccounts/${c.billingAccount}`, conflict: !!b?.billingAccountName && b.billingAccountName !== `billingAccounts/${c.billingAccount}` };
    }, async (_s, track) => write('PUT', `https://cloudbilling.googleapis.com/v1/projects/${p}/billingInfo`, { billingAccountName: `billingAccounts/${c.billingAccount}` }, track)),
  ];
  for (const name of REQUIRED_APIS) {
    const url = `https://serviceusage.googleapis.com/v1/projects/${p}/services/${name}`;
    steps.push(step(`api-${name.split('.')[0]}`, { action: 'Enable API', resource: name, permissions: ['serviceusage.services.enable'] }, async () => ({ ready: (await get(url))?.state === 'ENABLED' }), async (_s, track) => write('POST', `${url}:enable`, {}, track)));
  }
  steps.push(step('firebase', { action: 'Add Firebase to the dedicated project', permissions: ['firebase.projects.update'] }, async () => ({ ready: (await get(firebase))?.projectId === p }), async (_s, track) => write('POST', `${firebase}:addFirebase`, {}, track)));
  steps.push(step('database', { action: 'Create Firestore Native database; location cannot be silently changed', resource: `${p}/(default)@${region}`, permissions: ['datastore.databases.create'] }, async () => {
    const db = await get(database); return { ready: db?.locationId === region && db.type === 'FIRESTORE_NATIVE', conflict: !!db && (db.locationId !== region || db.type !== 'FIRESTORE_NATIVE') };
  }, async (_s, track) => write('POST', `https://firestore.googleapis.com/v1/projects/${p}/databases?databaseId=(default)`, { locationId: region, type: 'FIRESTORE_NATIVE', deleteProtectionState: 'DELETE_PROTECTION_ENABLED' }, track)));
  steps.push(step('bucket', { action: 'Create private evidence bucket with uniform access and public-access prevention', resource: `${bucket}@${region}`, permissions: ['storage.buckets.create'] }, async s => {
    const b = await get(storage);
    const correct = !!b && String(b.projectNumber) === s.resources.projectNumber && b.location?.toLowerCase() === region && expectedLabel(b) && b.iamConfiguration?.uniformBucketLevelAccess?.enabled && b.iamConfiguration?.publicAccessPrevention === 'enforced';
    return { ready: !!correct, conflict: !!b && !correct };
  }, async (_s, track) => write('POST', `https://storage.googleapis.com/storage/v1/b?project=${p}`, { name: bucket, location: region, labels: { 'opentax-setup': label }, iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' } }, track)));
  const firebaseBucket = `https://firebasestorage.googleapis.com/v1beta/projects/${p}/buckets/${bucket}`;
  steps.push(step('firebase-storage', { action: 'Register the evidence bucket with Firebase', resource: bucket, permissions: ['firebasestorage.buckets.addFirebase'] }, async () => ({ ready: !!(await get(firebaseBucket)) }), async (_s, track) => write('POST', `${firebaseBucket}:addFirebase`, {}, track)));
  const appName = `OpenTax ${label}`;
  steps.push(step('web-app', { action: 'Create one Firebase web application', resource: appName, permissions: ['firebase.clients.create'] }, async () => {
    const apps = (await get(`${firebase}/webApps?pageSize=100`))?.apps ?? [];
    const matches = apps.filter(a => a.displayName === appName && a.state === 'ACTIVE');
    if (matches.length > 1) return { conflict: true };
    if (!matches.length) return { ready: false };
    const sdk = await get(`https://firebase.googleapis.com/v1beta1/${matches[0].name}/config`);
    publicConfig(sdk, p, bucket);
    return { ready: true, resources: { webApp: matches[0].name, sdk: { apiKey: sdk.apiKey, appId: sdk.appId, authDomain: sdk.authDomain, projectId: sdk.projectId, messagingSenderId: sdk.messagingSenderId, storageBucket: bucket } } };
  }, async (_s, track) => write('POST', `${firebase}/webApps`, { displayName: appName }, track)));
  const hosting = `https://firebasehosting.googleapis.com/v1beta1/projects/${p}/sites/${p}`;
  steps.push(step('auth-domain', { action: 'Create the Firebase default auth-handler site (not the accounting app hosting)', permissions: ['firebasehosting.sites.create'] }, async () => ({ ready: !!(await get(hosting)) }), async (_s, track) => write('POST', `https://firebasehosting.googleapis.com/v1beta1/projects/${p}/sites?siteId=${p}`, {}, track)));
  steps.push(step('google-auth', { action: `Download/run firebase-tools@${FIREBASE_VERSION} to enable Google sign-in/OAuth brand with support email ${c.googleAccount}. Anonymous/email-password disabled.`, permissions: ['firebaseauth.configs.update', 'clientauthconfig.clients.create', 'clientauthconfig.brands.create'] }, async () => {
    const config = await get(`${auth}/config?fields=signIn,authorizedDomains`);
    if (!config) return { ready: false };
    const google = await get(`${auth}/defaultSupportedIdpConfigs/google.com?fields=name,enabled`);
    return { ready: google?.enabled === true && config.signIn?.anonymous?.enabled !== true && config.signIn?.email?.enabled !== true && config.authorizedDomains?.includes('127.0.0.1') };
  }, async (_s, track) => {
    const configFile = path.join(configDir, 'firebase.json');
    await writeFile(configFile, JSON.stringify({ auth: { providers: { anonymous: false, emailPassword: false, googleSignIn: { oAuthBrandDisplayName: 'OpenTax', supportEmail: c.googleAccount } } } }), { mode: 0o600 });
    await run('npx', ['--yes', `firebase-tools@${FIREBASE_VERSION}`, 'deploy', '--only', 'auth', '--project', p, '--config', configFile, '--non-interactive'], { cwd: configDir, env: { ...process.env, XDG_CONFIG_HOME: path.join(directory, 'firebase-cli'), FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' } });
    const current = await get(`${auth}/config?fields=authorizedDomains`);
    await write('PATCH', `${auth}/config?updateMask=signIn.anonymous.enabled,signIn.email.enabled,authorizedDomains`, { signIn: { anonymous: { enabled: false }, email: { enabled: false } }, authorizedDomains: [...new Set([...(current.authorizedDomains ?? []), '127.0.0.1'])] }, track);
  }));
  // The browser returns an ID token in memory only. A fresh user login is required on every run.
  steps.push(step('owner', { action: 'Sign in as the owner in a local browser window; this may create the Firebase user. No token is saved.', permissions: ['User Google sign-in consent'] }, async s => ({ ready: !!s.resources.ownerUid && !!signIn.currentToken(), resources: s.resources.ownerUid ? { ownerUid: s.resources.ownerUid } : undefined }), async s => {
    const result = await signIn.owner(s.resources.sdk, c.googleAccount);
    if ((c.ownerUid !== 'pending' && c.ownerUid !== result.uid) || (s.resources.ownerUid && s.resources.ownerUid !== result.uid)) throw new Error('OWNER_UID_MISMATCH');
    s.resources.ownerUid = result.uid;
  }));
  steps.at(-1).repeat = true;
  for (const [id, email] of [['runtime', runtime], ['builder', builder]]) {
    const url = `${iam}/serviceAccounts/${email}`;
    steps.push(step(`sa-${id}`, { action: 'Create dedicated keyless service account', resource: email, permissions: ['iam.serviceAccounts.create'] }, async () => {
      const sa = await get(url); return { ready: !!sa && sa.description === `OpenTax ${label}` && !sa.disabled, conflict: !!sa && sa.description !== `OpenTax ${label}` };
    }, async (_s, track) => write('POST', `${iam}/serviceAccounts`, { accountId: `opentax-${id}`, serviceAccount: { displayName: `OpenTax ${id}`, description: `OpenTax ${label}` } }, track)));
  }
  const signRole = `projects/${p}/roles/opentaxSignBlob`;
  steps.push(step('sign-role', { action: 'Create a custom role containing only iam.serviceAccounts.signBlob', resource: signRole, permissions: ['iam.roles.create'] }, async () => {
    const role = await get(`https://iam.googleapis.com/v1/${signRole}`); return { ready: !!role && eq(role.includedPermissions, ['iam.serviceAccounts.signBlob']) && !role.deleted, conflict: !!role && !eq(role.includedPermissions, ['iam.serviceAccounts.signBlob']) };
  }, async (_s, track) => write('POST', `${iam}/roles`, { roleId: 'opentaxSignBlob', role: { title: 'OpenTax signBlob', includedPermissions: ['iam.serviceAccounts.signBlob'], stage: 'GA' } }, track)));
  const bindings = [
    { id: 'runtime-db', url: crm, role: 'roles/datastore.user', member: `serviceAccount:${runtime}` },
    { id: 'builder-build', url: crm, role: 'roles/run.builder', member: `serviceAccount:${builder}` },
    { id: 'runtime-sign', url: `${iam}/serviceAccounts/${runtime}`, role: signRole, member: `serviceAccount:${runtime}` },
  ];
  for (const binding of bindings) {
    const readPolicy = () => binding.id === 'runtime-sign' ? get(`${binding.url}:getIamPolicy?options.requestedPolicyVersion=3`) : api.request('POST', `${binding.url}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } });
    steps.push(step(binding.id, { action: 'Add scoped IAM binding, retaining unrelated bindings and etag', resource: binding.url, role: binding.role, member: binding.member, permissions: ['setIamPolicy on this resource'] }, async () => ({ ready: !!memberIn(await readPolicy(), binding.role, binding.member) }), async (_s, track) => write('POST', `${binding.url}:setIamPolicy`, { policy: mergeBinding(await readPolicy(), binding.role, binding.member) }, track)));
  }
  steps.push(step('runtime-storage', { action: 'Grant object operations on the evidence bucket only', resource: bucket, role: 'roles/storage.objectUser', member: `serviceAccount:${runtime}`, permissions: ['storage.buckets.setIamPolicy'] }, async () => ({ ready: !!memberIn(await get(`${storage}/iam?optionsRequestedPolicyVersion=3`), 'roles/storage.objectUser', `serviceAccount:${runtime}`) }), async (_s, track) => write('PUT', `${storage}/iam`, mergeBinding(await get(`${storage}/iam?optionsRequestedPolicyVersion=3`), 'roles/storage.objectUser', `serviceAccount:${runtime}`), track)));
  // Rules deploy is isolated from Auth config; verify remote source, not a local success flag.
  for (const [id, filename, release, content] of [['firestore-rules', 'firestore.rules', 'cloud.firestore', inputs.firestoreRules], ['storage-rules', 'storage.rules', `firebase.storage/${bucket}`, inputs.storageRules]]) {
    const base = `https://firebaserules.googleapis.com/v1/projects/${p}`;
    const currentRules = async () => {
      const r = await get(`${base}/releases/${release}`);
      if (!r) return null;
      return get(`https://firebaserules.googleapis.com/v1/${r.rulesetName}`);
    };
    const matches = rules => rules?.source?.files?.length === 1 && rules.source.files[0].content === content;
    steps.push(step(id, { action: 'Deploy committed deny-all client access rules', resource: release, permissions: ['firebaserules.rulesets.create', 'firebaserules.releases.update'], source: content }, async () => ({ ready: matches(await currentRules()) }), async (_s, track) => {
      let ruleset, pageToken;
      do {
        const page = await get(`${base}/rulesets?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        for (const item of page?.rulesets ?? []) { const candidate = await get(`https://firebaserules.googleapis.com/v1/${item.name}`); if (matches(candidate)) { ruleset = candidate; break; } }
        pageToken = page?.nextPageToken;
      } while (!ruleset && pageToken);
      ruleset ??= await api.request('POST', `${base}/rulesets`, { source: { files: [{ name: filename, content }] } });
      const target = { name: `projects/${p}/releases/${release}`, rulesetName: ruleset.name };
      if (await get(`${base}/releases/${release}`)) await write('PATCH', `${base}/releases/${release}`, { release: target, updateMask: 'rulesetName' }, track);
      else await write('POST', `${base}/releases`, target, track);
    }));
  }
  for (const [i, index] of inputs.indexes.entries()) {
    const url = `${database}/collectionGroups/${index.collectionGroup}/indexes`;
    const matching = async () => ((await get(url))?.indexes ?? []).find(item => item.queryScope === index.queryScope && eq(item.fields.filter(f => f.fieldPath !== '__name__'), index.fields));
    steps.push(step(`index-${i}`, { action: 'Create missing composite index without removing existing indexes', resource: index, permissions: ['datastore.indexes.create'] }, async () => ({ ready: (await matching())?.state === 'READY' }), async (_s, track) => {
      if (!(await matching())) await write('POST', url, { queryScope: index.queryScope, fields: index.fields }, track);
      for (let n = 0; n < 120; n++) { const current = await matching(); if (current?.state === 'READY') return; if (current?.state === 'NEEDS_REPAIR') throw new Error('INDEX_NEEDS_REPAIR'); await pause(1000); }
      throw new Error('INDEX_BUILD_PENDING_RESUME');
    }));
  }
  return steps;
}
