import { randomUUID } from 'node:crypto';
import { planHash } from './plan.mjs';

// All external mutation paths go through this runner. Consent is never stored or reused.
export function createExecution(plan, revision) {
  return { version: 1, installationId: randomUUID(), planHash: planHash(plan), revision, steps: {}, resources: {} };
}
export function validateExecutionBinding(plan, state, revision) {
  if (state.version !== 1 || state.planHash !== planHash(plan) || state.revision !== revision) throw new Error('EXECUTION_PLAN_OR_SOURCE_CHANGED');
}
export async function executeSteps({ plan, state, revision, steps, consent, save, poll }) {
  validateExecutionBinding(plan, state, revision);
  for (const step of steps) {
    const checkpoint = state.steps[step.id];
    if (checkpoint?.operation) { await poll(checkpoint.operation); delete checkpoint.operation; await save(state); }
    let observed = await step.inspect(state);
    if (observed.conflict) throw new Error(`REMOTE_CONFLICT_${step.id.toUpperCase().replaceAll('-', '_')}`);
    if (!observed.ready) {
      if (checkpoint?.status === 'verified' && !step.repeat) throw new Error(`REMOTE_DRIFT_${step.id.toUpperCase().replaceAll('-', '_')}`);
      if (!(await consent({ id: step.id, ...step.preview, difference: observed.difference }))) throw new Error('CONSENT_DECLINED');
      state.steps[step.id] = { status: 'running' }; await save(state);
      // An API operation is checkpointed before polling so an interrupted call can resume.
      const track = async (url, result) => {
        if (result?.name && (result.name.startsWith('operations/') || result.name.includes('/operations/'))) {
          const prefix = new URL(url).pathname.split('/')[1];
          const operation = `${new URL(url).origin}/${prefix}/${result.name}`;
          state.steps[step.id].operation = operation; await save(state);
          await poll(operation); delete state.steps[step.id].operation; await save(state);
        }
        return result;
      };
      await step.apply(state, track);
      observed = await step.inspect(state);
      if (!observed.ready || observed.conflict) throw new Error(`POSTCONDITION_FAILED_${step.id.toUpperCase().replaceAll('-', '_')}`);
    }
    if (observed.resources) Object.assign(state.resources, observed.resources);
    state.steps[step.id] = { status: 'verified' }; await save(state);
  }
  return state;
}
