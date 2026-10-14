import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedInstanceUser } from './instanceAccess';

afterEach(() => vi.unstubAllEnvs());
describe('personal instance access', () => {
  it('preserves unconfigured legacy deployments', () => {
    vi.stubEnv('OPENTAX_ACCESS_MODE', undefined); vi.stubEnv('OPENTAX_OWNER_UID', undefined);
    expect(isAllowedInstanceUser('existing-user')).toBe(true);
  });
  it.each([undefined, '', ' ', 'owner\n', 'x'.repeat(129)])('fails closed in owner mode for invalid UID %s', uid => {
    vi.stubEnv('OPENTAX_ACCESS_MODE', 'owner'); vi.stubEnv('OPENTAX_OWNER_UID', uid);
    expect(isAllowedInstanceUser('owner')).toBe(false);
  });
  it.each([undefined, '', 'legacy', 'owner'])('enforces a supplied UID in mode %s', mode => {
    vi.stubEnv('OPENTAX_ACCESS_MODE', mode); vi.stubEnv('OPENTAX_OWNER_UID', 'owner');
    expect(isAllowedInstanceUser('owner')).toBe(true); expect(isAllowedInstanceUser('other')).toBe(false);
  });
  it('rejects unknown policy names', () => {
    vi.stubEnv('OPENTAX_ACCESS_MODE', 'owenr'); vi.stubEnv('OPENTAX_OWNER_UID', 'owner');
    expect(isAllowedInstanceUser('owner')).toBe(false);
  });
});
