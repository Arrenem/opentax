import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publicConfig } from './cloud.mjs';
export function deploymentSteps({ plan, api, state, directory, source }) {
  const p = plan.config.projectId, region = plan.config.region;
  const runtime = `opentax-runtime@${p}.iam.gserviceaccount.com`;
  const service = `https://run.googleapis.com/v2/projects/${p}/locations/${region}/services/opentax`;
  const get = () => api.request('GET', service);
  const vars = s => ({ ...publicConfig(s.resources.sdk, p, s.resources.bucket), FIREBASE_ADMIN_PROJECT_ID: p, OPENTAX_ACCESS_MODE: 'owner', OPENTAX_OWNER_UID: s.resources.ownerUid });
  const matches = (remote, s) => {
    const actual = Object.fromEntries((remote?.template?.containers?.[0]?.env ?? []).map(e => [e.name, e.value]));
    return Object.entries(vars(s)).every(([k, v]) => actual[k] === v) && remote?.template?.serviceAccount === runtime && remote.labels?.['opentax-source'] === state.revision;
  };
  return [{
    id: 'deploy', preview: { project: p, region, action: 'Upload the clean committed app snapshot, build with public Firebase configuration and dedicated builder SA, deploy an owner-restricted Cloud Run service. Grant public invocation so Firebase/MCP authentication can run.', permissions: ['roles/run.sourceDeveloper', 'roles/serviceusage.serviceUsageConsumer', 'iam.serviceAccounts.actAs on builder and runtime', 'run.services.setIamPolicy'], costs: 'Cloud Build, Artifact Registry, source staging, Cloud Run. min=0/max=1 is not a spending cap.' },
    inspect: async s => {
      const remote = await get();
      if (remote && remote.labels?.['opentax-setup'] !== state.installationId) return { conflict: true };
      const ready = !!remote && matches(remote, s) && !remote.reconciling && remote.terminalCondition?.state === 'CONDITION_SUCCEEDED';
      if (ready && (!remote.uri?.startsWith('https://') || !new URL(remote.uri).hostname.endsWith('.run.app'))) throw new Error('DEPLOYMENT_URL_INVALID');
      return { ready, resources: ready ? { instanceUrl: remote.uri } : undefined };
    },
    apply: async s => {
      if (!s.resources.ownerUid) throw new Error('OWNER_REQUIRED_BEFORE_DEPLOY');
      const envFile = path.join(directory, 'runtime-env.json'), buildFile = path.join(directory, 'build-env.json');
      await writeFile(envFile, JSON.stringify(vars(s)), { mode: 0o600 });
      await writeFile(buildFile, JSON.stringify({ ...publicConfig(s.resources.sdk, p, s.resources.bucket), GOOGLE_NODEJS_VERSION: '22.x', GOOGLE_NODE_RUN_SCRIPTS: 'build', NEXT_TELEMETRY_DISABLED: '1' }), { mode: 0o600 });
      await api.gcloud(['run', 'deploy', 'opentax', `--region=${region}`, `--source=${await source()}`, `--build-service-account=projects/${p}/serviceAccounts/opentax-builder@${p}.iam.gserviceaccount.com`, `--service-account=${runtime}`, `--env-vars-file=${envFile}`, `--build-env-vars-file=${buildFile}`, '--allow-unauthenticated', '--min=0', '--max=1', '--memory=512Mi', '--cpu=1', '--port=8080', `--labels=opentax-setup=${state.installationId},opentax-source=${state.revision}`, '--format=json']);
    },
  }, {
    id: 'public-url', preview: { project: p, action: 'Bind the observed Cloud Run URL to the OAuth issuer and Firebase authorized domains', permissions: ['run.services.update', 'firebaseauth.configs.update'] },
    inspect: async s => {
      const remote = await get();
      const value = remote?.template?.containers?.[0]?.env?.find(e => e.name === 'OPENTAX_PUBLIC_URL')?.value;
      const config = await api.request('GET', `https://identitytoolkit.googleapis.com/admin/v2/projects/${p}/config?fields=authorizedDomains`);
      return { ready: value === s.resources.instanceUrl && config?.authorizedDomains?.includes(new URL(s.resources.instanceUrl).hostname) };
    },
    apply: async s => {
      const auth = `https://identitytoolkit.googleapis.com/admin/v2/projects/${p}/config`;
      const config = await api.request('GET', `${auth}?fields=authorizedDomains`);
      await api.request('PATCH', `${auth}?updateMask=authorizedDomains`, { authorizedDomains: [...new Set([...(config.authorizedDomains ?? []), new URL(s.resources.instanceUrl).hostname])] });
      await api.gcloud(['run', 'services', 'update', 'opentax', `--region=${region}`, `--update-env-vars=OPENTAX_PUBLIC_URL=${s.resources.instanceUrl}`, '--format=json']);
    },
  }];
}
